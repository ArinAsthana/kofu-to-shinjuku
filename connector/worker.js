// Kofu to Shinjuku connector: a tiny MCP server (Cloudflare Worker) so a normal Claude chat can read and change
// the app's data. It writes straight to the Firestore docs the app syncs (users/{uid}/stores/{store} = {json, u, v}).
// Every record it writes gets a fresh `u`, so the app's per-record merge picks it up on next open. Single file,
// no dependencies, so it can be pasted into the Cloudflare dashboard editor.
//
// Secrets (Cloudflare → Worker → Settings → Variables and secrets):
//   SA_JSON     Firebase service account key (the whole downloaded JSON)
//   UID         your Firebase user id (shown in the app: System → settings → Sync)
//   PATH_TOKEN  a long random string; the connector URL is https://<worker>/mcp/<PATH_TOKEN>

const TZ = "Asia/Tokyo";
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Mirrors js/data.js. Keep in step if habits change.
const HABITS = { anki: "Japanese: reviews + today's new cards", jp: "Japanese: today's N2 item", fin: "Finance block", math: "Mental math", news: "News and markets", case: "Case or interview practice", gym: "Workout" };
const XP = { habit: 10, task: 10 };
const MEALS = ["breakfast", "lunch", "dinner", "snack"];
// Mirrors js/deadlines.js PREP and sessions(). Keep in step.
const DL_KINDS = ["paper", "exam", "presentation", "other"];
const PREP = {
  paper: { lead: 10, s: [["Research", 60], ["Outline", 45], ["Draft 1", 90], ["Draft 2", 90], ["Edit", 45]] },
  exam: { lead: 7, s: [["Review 1", 45], ["Review 2", 45], ["Review 3", 45], ["Final review", 45]] },
  presentation: { lead: 7, s: [["Slides", 90], ["Rehearse 1", 30], ["Rehearse 2", 30]] },
  other: { lead: 3, s: [["Prep", 60]] },
};
const KINDS = ["class", "work", "sleep", "nap", "quest", "club", "social", "other"];

/* ---------- time ---------- */
const pad = n => String(n).padStart(2, "0");
function nowTokyo() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
}
const parseD = s => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const ymd = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = parseD(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const dow = s => parseD(s).getUTCDay();
const toMin = hm => { const [h, m] = String(hm || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const toHM = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ":" + pad(m % 60); };
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const isHM = s => /^\d{1,2}:\d{2}$/.test(s || "");
// Accepts "2026-10-14", "today", "tomorrow", or a weekday name (next occurrence, today included).
function resolveDate(v) {
  const t = nowTokyo().date; if (!v) return t;
  v = String(v).trim().toLowerCase();
  if (isDate(v)) return v; if (v === "today") return t; if (v === "tomorrow") return addDays(t, 1); if (v === "yesterday") return addDays(t, -1);
  const i = DAY.findIndex(d => v.startsWith(d.toLowerCase())); if (i >= 0) { for (let k = 0; k < 7; k++) if (dow(addDays(t, k)) === i) return addDays(t, k); }
  throw new Error(`Couldn't read the date "${v}". Use YYYY-MM-DD, today, tomorrow or a weekday.`);
}
const diffDays = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5);
// Spreads the prep sessions over start..(due − 1): `after` = earliest day, `due` = latest day. An exam's last review is the day before.
function prepSessions(kind, due, start, t) {
  const p = PREP[kind] || PREP.other, last = addDays(due, -1) < t ? t : addDays(due, -1);
  let from = start || addDays(due, -p.lead); if (from < t) from = t; if (from > last) from = last;
  const span = diffDays(from, last) + 1, n = p.s.length;
  return p.s.map(([name, mins], i) => {
    const a = Math.floor(i * span / n), b = Math.max(a, Math.floor((i + 1) * span / n) - 1), lastExam = kind === "exam" && i === n - 1;
    return { name, mins, after: lastExam ? last : addDays(from, a), due: lastExam ? last : addDays(from, b) };
  });
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- Google auth (service account → access token) ---------- */
let tokenCache = null;
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = s => b64url(new TextEncoder().encode(s));
async function accessToken(env) {
  if (tokenCache && tokenCache.exp > Date.now() + 60000) return tokenCache.token;
  const sa = JSON.parse(env.SA_JSON), iat = Math.floor(Date.now() / 1000);
  const head = b64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64urlStr(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + claim));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: head + "." + claim + "." + b64url(sig) }) });
  const j = await r.json(); if (!j.access_token) throw new Error("Google sign-in for the service account failed: " + (j.error_description || j.error || r.status));
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

/* ---------- Firestore store docs ---------- */
const docUrl = (env, store) => `https://firestore.googleapis.com/v1/projects/${JSON.parse(env.SA_JSON).project_id}/databases/(default)/documents/users/${String(env.UID).trim()}/stores/${store}`;
async function readStore(env, store) {
  const r = await fetch(docUrl(env, store), { headers: { authorization: "Bearer " + await accessToken(env) } });
  if (r.status === 404) return { data: store === "settings" ? {} : [], updateTime: null, v: null };
  if (!r.ok) throw new Error(`Reading ${store} failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const d = await r.json(), f = d.fields || {};
  return { data: JSON.parse(f.json?.stringValue || (store === "settings" ? "{}" : "[]")), updateTime: d.updateTime, v: f.v?.integerValue || null };
}
// Read-modify-write with an updateTime precondition, so a sync from the phone at the same moment is never overwritten.
async function changeStore(env, store, fn) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await readStore(env, store), out = await fn(cur.data);
    const pre = cur.updateTime ? "currentDocument.updateTime=" + encodeURIComponent(cur.updateTime) : "currentDocument.exists=false";
    const body = { fields: { json: { stringValue: JSON.stringify(cur.data) }, u: { integerValue: String(Date.now()) }, v: { integerValue: String(cur.v || 5) } } };
    const r = await fetch(docUrl(env, store) + "?" + pre, { method: "PATCH", headers: { authorization: "Bearer " + await accessToken(env), "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) return out;
    if (r.status !== 400 && r.status !== 409 && r.status !== 412) throw new Error(`Saving ${store} failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  }
  throw new Error(`Saving ${store} kept clashing with a sync. Try again.`);
}
const live = arr => arr.filter(r => !r.del);
const putRec = (arr, rec) => { rec.u = Date.now(); if (!rec.id) rec.id = uid(); const i = arr.findIndex(r => r.id === rec.id); if (i >= 0) arr[i] = rec; else arr.push(rec); return rec; };

/* ---------- timetable ---------- */
const blockOn = (b, date) => b.date ? b.date === date : (b.days || []).includes(dow(date)) && !(b.skip || []).includes(date);
function segments(blocks, date) {
  const out = [], prev = addDays(date, -1);
  for (const b of live(blocks)) {
    const s = toMin(b.start), e = toMin(b.end), over = e <= s;
    if (blockOn(b, date)) out.push({ b, s, e: over ? 1440 : e });
    if (over && e > 0 && blockOn(b, prev)) out.push({ b, s: 0, e, tail: true });
  }
  return out.sort((x, y) => x.s - y.s);
}
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ALIAS = [[/\b(gym|workout|lift|lifting|weights|training)\b/, /lift|calisth|gym|workout/i], [/\bcali/, /calisth/i], [/\b(shift|work|konbini)\b/, /shift|mart/i], [/\b(finance|study)\b/, /finance/i], [/\b(school|class|lecture)\b/, /class/i]];
function matchBlock(segs, name) {
  const n = norm(name), al = ALIAS.filter(([re]) => re.test(n)).map(a => a[1]);
  const sc = g => { const t = norm(g.b.title); return (t === n ? 10 : 0) + (t.includes(n) || n.includes(t) ? 5 : 0) + al.filter(re => re.test(g.b.title)).length * 3; };
  return segs.filter(g => !g.tail).map(g => ({ g, s: sc(g) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s)[0]?.g || null;
}

/* ---------- tools ---------- */
const TOOLS = [
  { name: "get_day", description: "Read Arin's day in the Kofu to Shinjuku app: timetable blocks, open to-dos, care items due, habits done, food totals and weight. Use before changing anything.",
    inputSchema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD, today, tomorrow or a weekday. Default today (Japan time)." } } } },
  { name: "log_food", description: "Add food to a meal. Estimate kcal and protein (g) per item if Arin doesn't give them, and say they're estimates.",
    inputSchema: { type: "object", required: ["meal", "items"], properties: { meal: { type: "string", enum: MEALS }, date: { type: "string" },
      items: { type: "array", items: { type: "object", required: ["name"], properties: { name: { type: "string" }, kcal: { type: "number" }, protein: { type: "number" } } } } } } },
  { name: "log_weight", description: "Save a bodyweight reading in kg (one per day; replaces that day's).",
    inputSchema: { type: "object", required: ["kg"], properties: { kg: { type: "number" }, date: { type: "string" } } } },
  { name: "tick_habit", description: "Mark a daily quest done (+10 XP). Habits: " + Object.entries(HABITS).map(([k, v]) => `${k} = ${v}`).join("; ") + ".",
    inputSchema: { type: "object", required: ["habit"], properties: { habit: { type: "string" }, date: { type: "string" } } } },
  { name: "tick_care", description: "Mark care items (meds, skincare, teeth) done for a day. Names can be partial, e.g. 'finasteride', 'sunscreen'.",
    inputSchema: { type: "object", required: ["items"], properties: { items: { type: "array", items: { type: "string" } }, date: { type: "string" } } } },
  { name: "add_task", description: "Add a to-do. The app auto-places it into free time.",
    inputSchema: { type: "object", required: ["title"], properties: { title: { type: "string" }, minutes: { type: "integer", description: "15, 30, 45, 60, 90, 120 or 180" }, due: { type: "string" }, energy: { type: "string", enum: ["high", "low"], description: "high = needs focus" }, priority: { type: "integer", enum: [1, 2, 3] } } } },
  { name: "complete_task", description: "Mark an open to-do done (+10 XP). Matches by title.",
    inputSchema: { type: "object", required: ["title"], properties: { title: { type: "string" } } } },
  { name: "add_deadline", description: "Add a deadline (paper, exam, presentation or other). It shows on the app's calendar on the due date, and prep sessions are created and auto-placed before it: paper = Research 60, Outline 45, Draft 2×90, Edit 45 from 10 days before; exam = 4×45 review from 7 days before, the last on the day before; presentation = Slides 90, Rehearse 2×30 from 7 days before; other = 1×60 from 3 days before. A start date replaces the default. Reply with the due date, the start date and the sessions.",
    inputSchema: { type: "object", required: ["title", "due"], properties: { title: { type: "string", description: "e.g. 'Social psych paper'" }, course: { type: "string" }, due: { type: "string", description: "YYYY-MM-DD, tomorrow or a weekday" },
      time: { type: "string", description: "HH:MM, optional" }, kind: { type: "string", enum: DL_KINDS }, size: { type: "string", description: "e.g. '2,000 words'" }, start: { type: "string", description: "Optional start/reminder date" } } } },
  { name: "add_exam_result", description: "Add a real exam or test result to the app's Report Card (class exams, papers, Boki, JLPT, certifications). Example: 'I got 82 on the algebra midterm out of 100'. Reply with the % and whether it passed.",
    inputSchema: { type: "object", required: ["name", "score"], properties: { name: { type: "string", description: "e.g. 'Algebra midterm'" }, subject: { type: "string", description: "e.g. 'Math'; the course name if there is one" },
      score: { type: "number" }, out_of: { type: "number", description: "default 100" }, pass_mark: { type: "number", description: "Pass mark in %, optional" }, date: { type: "string", description: "YYYY-MM-DD, today, yesterday or a weekday (the past one); default today" }, notes: { type: "string" } } } },
  { name: "list_deadlines", description: "List upcoming deadlines with their prep sessions (done or not). Use for 'what's due?'.",
    inputSchema: { type: "object", properties: {} } },
  { name: "move_deadline", description: "Move a deadline to a new due date. Its open prep sessions shift by the same number of days. Matches by title.",
    inputSchema: { type: "object", required: ["title", "due"], properties: { title: { type: "string" }, due: { type: "string" }, time: { type: "string", description: "HH:MM, optional" } } } },
  { name: "add_block", description: "Add a timetable block, either on one date or weekly on given weekdays.",
    inputSchema: { type: "object", required: ["title", "start", "end"], properties: { title: { type: "string" }, start: { type: "string", description: "HH:MM" }, end: { type: "string", description: "HH:MM; before start = runs past midnight" },
      date: { type: "string" }, weekdays: { type: "array", items: { type: "string" }, description: "e.g. ['Tue','Thu'] for weekly" }, kind: { type: "string", enum: KINDS } } } },
  { name: "move_block", description: "Move a timetable block. By default only that date moves; set every_week to change the weekly block. Today's block is locked from 15 min before it starts until it ends.",
    inputSchema: { type: "object", required: ["block", "start"], properties: { block: { type: "string", description: "Block name, e.g. 'gym', 'Lift', 'finance block'" }, date: { type: "string" },
      start: { type: "string", description: "New start HH:MM" }, end: { type: "string", description: "New end HH:MM (default keeps the length)" }, every_week: { type: "boolean" } } } },
  { name: "add_wishlist_item", description: "Add a reward to the wishlist with its price in yen. The XP cost is set from the price.",
    inputSchema: { type: "object", required: ["name", "price"], properties: { name: { type: "string" }, price: { type: "number" }, kind: { type: "string", enum: ["item", "trip", "exp"] }, link: { type: "string" } } } },
];

async function getDay(env, a) {
  const date = resolveDate(a.date), now = nowTokyo();
  const [blocks, tasks, care, careLog, habitLog, meals, bw] = await Promise.all(["blocks", "tasks", "care", "careLog", "habitLog", "meals", "bodyweight"].map(s => readStore(env, s).then(x => x.data)));
  const lines = [`${DAY[dow(date)]} ${date}${date === now.date ? ` (now ${toHM(now.min)} Japan time)` : ""}`, "", "Timetable:"];
  for (const g of segments(blocks, date)) lines.push(`- ${toHM(g.s)}–${toHM(g.e)} ${g.b.title}${g.tail ? " (from last night)" : ""}${g.b.locked ? " [locked]" : ""}`);
  const open = live(tasks).filter(k => !k.done && k.kind !== "deadline"), dls = live(tasks).filter(k => k.kind === "deadline" && k.due >= date).sort((a, b) => a.due.localeCompare(b.due));
  if (dls.length) lines.push("", "Deadlines:", ...dls.map(k => `- ${k.title}${k.course ? " (" + k.course + ")" : ""}: due ${k.due}${k.time ? " " + k.time : ""}`));
  lines.push("", "Open to-dos:", ...(open.length ? open.map(k => `- ${k.title} (${k.mins} min${k.due ? ", due " + k.due : ""})`) : ["- none"]));
  const due = live(care).filter(c => !(c.days || []).length || c.days.includes(dow(date)));
  const done = new Set(live(careLog).filter(l => l.date === date).map(l => l.item));
  lines.push("", `Care: ${due.filter(c => done.has(c.id)).length}/${due.length} done. Left: ${due.filter(c => !done.has(c.id)).map(c => c.name).join(", ") || "none"}`);
  const hd = live(habitLog).filter(h => h.date === date).map(h => HABITS[h.habit] || h.habit);
  lines.push(`Quests done: ${hd.join(", ") || "none"}`);
  let kcal = 0, p = 0; for (const m of live(meals).filter(m => m.date === date)) for (const it of m.items || []) { kcal += +it.kcal || 0; p += +it.protein || 0; }
  lines.push(`Food: ${Math.round(kcal)} kcal, ${Math.round(p)} g protein`);
  const w = live(bw).filter(x => x.date === date)[0]; lines.push(`Weight: ${w ? w.kg + " kg" : "not logged"}`);
  return lines.join("\n");
}

const handlers = {
  get_day: getDay,
  async log_food(env, a) {
    const date = resolveDate(a.date), meal = String(a.meal || "").toLowerCase();
    if (!MEALS.includes(meal)) throw new Error("meal must be breakfast, lunch, dinner or snack");
    const items = (a.items || []).filter(i => i && i.name).map(i => ({ name: String(i.name), kcal: Math.round(+i.kcal || 0), protein: Math.round((+i.protein || 0) * 10) / 10 }));
    if (!items.length) throw new Error("No items given");
    await changeStore(env, "meals", arr => { const m = live(arr).find(x => x.date === date && x.meal === meal) || { date, meal, items: [] }; putRec(arr, { ...m, items: (m.items || []).concat(items) }); });
    return `Logged to ${meal} on ${date}: ${items.map(i => `${i.name} (${i.kcal} kcal, ${i.protein} g)`).join(", ")}.`;
  },
  async log_weight(env, a) {
    const date = resolveDate(a.date), kg = Math.round(+a.kg * 10) / 10; if (!(kg > 30 && kg < 250)) throw new Error("kg looks wrong");
    await changeStore(env, "bodyweight", arr => { const ex = live(arr).find(x => x.date === date); putRec(arr, { ...(ex || {}), date, kg }); });
    return `Saved ${kg} kg for ${date}.`;
  },
  async tick_habit(env, a) {
    const date = resolveDate(a.date), q = norm(a.habit);
    const id = Object.keys(HABITS).find(k => k === q) || Object.keys(HABITS).find(k => norm(HABITS[k]).includes(q) || q.includes(norm(HABITS[k])));
    if (!id) throw new Error(`Unknown habit "${a.habit}". Habits: ${Object.values(HABITS).join(", ")}`);
    const rec = await changeStore(env, "habitLog", arr => live(arr).find(h => h.habit === id && h.date === date) ? null : putRec(arr, { date, habit: id }));
    if (!rec) return `${HABITS[id]} was already done on ${date}.`;
    await changeStore(env, "xpEvents", arr => { putRec(arr, { ts: Date.now(), type: "habit", xp: XP.habit, ref: rec.id, label: HABITS[id] }); });
    return `${HABITS[id]} done for ${date}. +${XP.habit} XP.`;
  },
  async tick_care(env, a) {
    const date = resolveDate(a.date), care = live((await readStore(env, "care")).data);
    const ids = [], missing = [];
    for (const n of a.items || []) { const c = care.find(c => norm(c.name).includes(norm(n))); if (c) ids.push(c); else missing.push(n); }
    const added = await changeStore(env, "careLog", arr => ids.filter(c => !live(arr).some(l => l.item === c.id && l.date === date)).map(c => (putRec(arr, { item: c.id, date }), c.name)));
    return `Ticked for ${date}: ${added.join(", ") || "nothing new"}.${missing.length ? ` Not found: ${missing.join(", ")}. Care items are: ${care.map(c => c.name).join(", ")}.` : ""}`;
  },
  async add_task(env, a) {
    if (!a.title) throw new Error("title is required");
    const lens = [15, 30, 45, 60, 90, 120, 180], m = +a.minutes || 60, mins = lens.reduce((x, y) => Math.abs(y - m) < Math.abs(x - m) ? y : x, 60);
    const due = a.due ? resolveDate(a.due) : null;
    await changeStore(env, "tasks", arr => { putRec(arr, { title: String(a.title), mins, prio: +a.priority || (due ? 3 : 2), energy: a.energy === "low" ? "low" : "high", due, done: false, created: Date.now(), pin: null }); });
    return `Added "${a.title}" (${mins} min${due ? ", due " + due : ""}). The app places it in free time when opened.`;
  },
  async complete_task(env, a) {
    const q = norm(a.title);
    const k = await changeStore(env, "tasks", arr => { const k = live(arr).filter(k => !k.done && k.kind !== "deadline").find(k => norm(k.title).includes(q) || q.includes(norm(k.title))); if (k) putRec(arr, { ...k, done: true, doneAt: Date.now() }); return k; });
    if (!k) throw new Error(`No open to-do matching "${a.title}"`);
    await changeStore(env, "xpEvents", arr => { if (!live(arr).some(e => e.ref === "task:" + k.id)) putRec(arr, { ts: Date.now(), type: "task", xp: XP.task, ref: "task:" + k.id, label: k.title }); });
    return `Done: ${k.title}. +${XP.task} XP.`;
  },
  async add_deadline(env, a) {
    if (!a.title || !a.due) throw new Error("title and due are required");
    const t = nowTokyo().date, due = resolveDate(a.due), kind = DL_KINDS.includes(a.kind) ? a.kind : "other";
    if (due < t) throw new Error(`${due} has passed`);
    if (a.time && !isHM(a.time)) throw new Error("time must be HH:MM");
    const start = a.start ? resolveDate(a.start) : null, ss = prepSessions(kind, due, start, t), now = Date.now(), title = String(a.title);
    await changeStore(env, "tasks", arr => {
      const d = putRec(arr, { kind: "deadline", title, course: String(a.course || ""), dlKind: kind, due, time: a.time ? toHM(toMin(a.time)) : "", size: String(a.size || ""), start: start && start <= due ? start : ss[0].after, mins: 0, prio: 3, done: false, created: now, pin: null });
      for (const s of ss) putRec(arr, { title: `${title}: ${s.name}`, mins: s.mins, prio: 3, energy: "high", due: s.due, after: s.after, dl: d.id, done: false, created: now, pin: null });
    });
    return `Added ${title}, due ${due}${a.time ? " " + a.time : ""}. Start ${start || ss[0].after}. Prep sessions (placed in free time, focus): ${ss.map(s => `${s.name} ${s.mins} min between ${s.after} and ${s.due}`).join("; ")}. Reminders on the start day and the day before.`;
  },
  async add_exam_result(env, a) {
    if (!a.name || a.score == null || isNaN(+a.score)) throw new Error("name and score are required");
    const t = nowTokyo().date, of = a.out_of ? +a.out_of : 100; if (!(of > 0)) throw new Error("out_of must be above 0");
    let date = resolveDate(a.date); if (date > t) date = addDays(date, -7); // a weekday means the last one
    const pass = a.pass_mark == null || a.pass_mark === "" ? null : +a.pass_mark, pct = +a.score / of * 100;
    await changeStore(env, "path", arr => { putRec(arr, { id: "exam-" + Date.now().toString(36), kind: "exam", name: String(a.name), subject: String(a.subject || "Other"), date, score: +a.score, of, passPct: pass, notes: String(a.notes || ""), at: Date.now() }); });
    // The app asks for the score of a past exam deadline once; this answers it.
    const q = norm(a.name);
    await changeStore(env, "tasks", arr => { const d = live(arr).find(k => k.kind === "deadline" && k.dlKind === "exam" && !k.scored && k.due <= t && q && (norm(k.title).includes(q) || q.includes(norm(k.title)))); if (d) putRec(arr, { ...d, scored: true }); });
    return `Saved ${a.name}: ${a.score}/${of} · ${Math.round(pct)}%${pass != null ? ` · ${pct >= pass ? "passed" : "not passed"} (pass ${pass}%)` : ""}, ${date}. It's on the Report Card in Profile.`;
  },
  async list_deadlines(env) {
    const t = nowTokyo().date, tasks = live((await readStore(env, "tasks")).data);
    const dls = tasks.filter(k => k.kind === "deadline" && k.due >= t).sort((a, b) => a.due.localeCompare(b.due));
    if (!dls.length) return "No upcoming deadlines.";
    return dls.map(d => { const ps = tasks.filter(k => k.dl === d.id).sort((a, b) => (a.after || "").localeCompare(b.after || ""));
      return `${d.title}${d.course ? " (" + d.course + ")" : ""}: due ${d.due}${d.time ? " " + d.time : ""}, ${diffDays(t, d.due)} days left, start ${d.start}.\n` + (ps.map(k => `  - ${k.title.replace(d.title + ": ", "")} ${k.mins} min: ${k.done ? "done" : "open, " + k.after + " to " + k.due}`).join("\n") || "  - no prep sessions");
    }).join("\n");
  },
  async move_deadline(env, a) {
    const t = nowTokyo().date, due = resolveDate(a.due), q = norm(a.title); if (due < t) throw new Error(`${due} has passed`);
    if (a.time && !isHM(a.time)) throw new Error("time must be HH:MM");
    return changeStore(env, "tasks", arr => {
      const d = live(arr).filter(k => k.kind === "deadline").find(k => norm(k.title).includes(q) || q.includes(norm(k.title)));
      if (!d) throw new Error(`No deadline matching "${a.title}"`);
      const delta = diffDays(d.due, due), clamp = x => x < t ? t : x;
      let n = 0;
      for (const k of live(arr).filter(k => k.dl === d.id && !k.done)) {
        const after = clamp(addDays(k.after || k.due, delta)), kd = clamp(addDays(k.due, delta));
        putRec(arr, { ...k, after, due: kd < after ? after : kd, pin: null }); n++;
      }
      putRec(arr, { ...d, due, time: a.time ? toHM(toMin(a.time)) : d.time, start: addDays(d.start || d.due, delta) });
      return `${d.title} moved to ${due}${delta ? ` (${delta > 0 ? "+" : ""}${delta} days)` : ""}. ${n} open prep session${n === 1 ? "" : "s"} moved with it.`;
    });
  },
  async add_block(env, a) {
    if (!a.title || !isHM(a.start) || !isHM(a.end)) throw new Error("title, start and end (HH:MM) are required");
    const days = (a.weekdays || []).map(w => DAY.findIndex(d => String(w).toLowerCase().startsWith(d.toLowerCase()))).filter(i => i >= 0);
    const date = days.length ? null : resolveDate(a.date);
    const kind = KINDS.includes(a.kind) ? a.kind : "other";
    await changeStore(env, "blocks", arr => { putRec(arr, { title: String(a.title), kind, days, date, start: toHM(toMin(a.start)), end: toHM(toMin(a.end)), locked: false }); });
    return `Added ${a.title}, ${days.length ? "every " + days.map(d => DAY[d]).join("/") : date} ${a.start}–${a.end}.`;
  },
  async move_block(env, a) {
    const date = resolveDate(a.date), now = nowTokyo();
    if (!isHM(a.start) || (a.end && !isHM(a.end))) throw new Error("start (and end) must be HH:MM");
    const settings = (await readStore(env, "settings")).data, lockM = settings.plan?.lockMins ?? 15;
    const msg = await changeStore(env, "blocks", arr => {
      const g = matchBlock(segments(arr, date), a.block); if (!g) throw new Error(`No block like "${a.block}" on ${date}`);
      const b = g.b, len = ((toMin(b.end) - toMin(b.start)) % 1440 + 1440) % 1440 || 1440;
      const s = toMin(a.start), e = a.end ? toMin(a.end) : s + len;
      // Same lock as the app: today's block is fixed from lockMins before it starts until it ends.
      const todays = segments(arr, now.date).find(x => !x.tail && (x.b.id === b.id || x.b.from === b.id || (b.from && x.b.id === b.from)));
      if (todays && (date === now.date || a.every_week) && now.min >= todays.s - lockM && now.min < todays.e) throw new Error(`${b.title} is locked: it starts within ${lockM} min or is running. It can be changed after ${toHM(todays.e)}.`);
      if ((b.days || []).length && !a.every_week) {
        putRec(arr, { ...b, skip: [...new Set([...(b.skip || []), date])] });
        putRec(arr, { title: b.title, kind: b.kind, days: [], date, start: toHM(s), end: toHM(e), locked: !!b.locked, from: b.id });
        return `${b.title} on ${date} moved to ${toHM(s)}–${toHM(e)} (that day only).`;
      }
      putRec(arr, { ...b, start: toHM(s), end: toHM(e) });
      return `${b.title} now ${toHM(s)}–${toHM(e)}${(b.days || []).length ? " every " + b.days.map(d => DAY[d]).join("/") : " on " + b.date}.`;
    });
    return msg;
  },
  async add_wishlist_item(env, a) {
    const price = Math.round(+a.price); if (!a.name || !(price >= 0)) throw new Error("name and price are required");
    const rate = (await readStore(env, "settings")).data.fun?.yenPerXp || 20, xp = Math.max(10, Math.round(price / rate / 10) * 10);
    const kind = ["item", "trip", "exp"].includes(a.kind) ? a.kind : "item";
    await changeStore(env, "wishlist", arr => { putRec(arr, { name: String(a.name), price, xp, kind, link: a.link || "", bought: null }); });
    return `Added ${a.name} to the wishlist: ¥${price.toLocaleString("en-US")}, ${xp} XP.`;
  },
};

/* ---------- MCP over HTTP (JSON-RPC, stateless) ---------- */
async function rpc(env, m) {
  const ok = result => ({ jsonrpc: "2.0", id: m.id, result }), err = (code, message) => ({ jsonrpc: "2.0", id: m.id, error: { code, message } });
  switch (m.method) {
    case "initialize": return ok({ protocolVersion: m.params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "kofu-to-shinjuku", version: "1.0.0" },
      instructions: "Arin's Kofu to Shinjuku life app (timetable, to-dos, deadlines, food, weight, habits, care, wishlist). Times are Japan time. Call get_day before changes. Confirm what changed in one line. The app shows changes next time it's opened while signed in." });
    case "ping": return ok({});
    case "tools/list": return ok({ tools: TOOLS });
    case "tools/call": {
      const h = handlers[m.params?.name]; if (!h) return err(-32602, "Unknown tool " + m.params?.name);
      try { return ok({ content: [{ type: "text", text: await h(env, m.params.arguments || {}) }] }); }
      catch (e) { return ok({ content: [{ type: "text", text: "Error: " + e.message }], isError: true }); }
    }
    default: return m.id === undefined ? null : err(-32601, "Method not found");
  }
}

// Opening the connector URL in a browser runs this: it checks each secret and one Firestore read.
async function selfCheck(env) {
  const out = ["Kofu to Shinjuku connector is running.", ""];
  let sa = null;
  try { sa = JSON.parse(env.SA_JSON || ""); out.push(sa.private_key && sa.client_email ? `OK  SA_JSON (${sa.client_email})` : "BAD SA_JSON: not a service account key file"); }
  catch { out.push("BAD SA_JSON: missing or not valid JSON. Paste the whole downloaded key file."); }
  out.push(env.UID ? "OK  UID set" : "BAD UID: missing. Copy it from the app: System → settings → Sync → Claude connector ID.");
  if (sa && env.UID) {
    try { const r = await readStore(env, "blocks"); out.push(r.updateTime ? `OK  Firestore: ${r.data.length} timetable blocks found` : "BAD Firestore: no data for this UID. Sign in on the phone and tap Sync now, then check the UID."); }
    catch (e) { out.push("BAD Firestore: " + e.message); }
  }
  out.push("", "In Claude, add this same URL (without anything after the token) as a custom connector.");
  return new Response(out.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname.replace(/\/+$/, "");
    // The token works with or without the /mcp/ prefix.
    const tok = String(env.PATH_TOKEN || "").trim(); // pasted secrets often carry a trailing space or newline
    if (!tok) {
      // Names only, never values: tells a misplaced or misspelled secret apart from a missing one.
      const seen = Object.keys(env || {}).map(k => JSON.stringify(k)).join(", ") || "none";
      return new Response("Not set up: PATH_TOKEN is missing. Add it in Cloudflare → Settings → Variables and secrets as type Secret.\n" +
        "Names this running Worker can see: " + seen + ".\n" +
        "If this says none, the secrets are saved somewhere the Worker doesn't read (e.g. Build variables) or the save didn't deploy.", { status: 404 });
    }
    if (path !== "/mcp/" + tok && path !== "/" + tok) return new Response("Not found. Check the URL ends with /mcp/<PATH_TOKEN>.", { status: 404 });
    if (req.method === "GET" && !(req.headers.get("accept") || "").includes("text/event-stream")) return selfCheck(env);
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
    let body; try { body = await req.json(); } catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 }); }
    const out = Array.isArray(body) ? (await Promise.all(body.map(m => rpc(env, m)))).filter(Boolean) : await rpc(env, body);
    if (!out || (Array.isArray(out) && !out.length)) return new Response(null, { status: 202 });
    return Response.json(out);
  },
};
