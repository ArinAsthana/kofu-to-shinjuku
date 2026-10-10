import { S, load, save, flush, live, put, remove, touchSettings, photos, exportObject, validateImport, importMerge, uid } from "./store.js";
import { HABITS, AREAS, SLOTS, MEALS, RPE, RUN_GOAL_KM, LEVEL_XP, XP, SKILLS, UNLOCKS, COMBOS } from "./data.js";
import * as Ch from "./charts.js";
import * as E from "./engine.js";
import * as Sync from "./sync.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = v => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; };
const r1 = n => Math.round(n * 10) / 10;
const bar = (p, c) => `<div class="bar" style="--c:${c || "var(--chuo)"}"><i style="width:${Math.max(0, Math.min(1, p)) * 100}%"></i></div>`;

/* ---------- toast ---------- */
function toast(msg, reward = false) {
  const t = $("#toast"); t.textContent = msg; t.className = "toast show" + (reward ? " reward" : "");
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = "toast"), reward ? 3800 : 2000);
}
function announce(gains) {
  gains = gains.filter(Boolean);
  if (!gains.length) return;
  const reward = gains.find(g => g.reward);
  const xp = gains.reduce((a, g) => a + g.xp, 0);
  if (reward) toast(`+${xp} XP · Reward unlocked: ${reward.reward}`, true);
  else toast(`+${xp} XP · ${gains.map(g => g.label).join(", ")}`);
}

/* ---------- routing ---------- */
const route = () => (location.hash.slice(1) || "home").split("/").map(decodeURIComponent);
const go = h => { location.hash = h; };
window.addEventListener("hashchange", () => { draft = null; render(); window.scrollTo(0, 0); });

const TABS = [["home", "System"], ["train", "Train"], ["body", "Body"], ["money", "Money"], ["skills", "Skills"]];
function render() {
  const [tab, ...rest] = route();
  const views = { home: vHome, train: vTrain, body: vBody, money: vMoney, skills: vSkills, more: vMore };
  $("#app").innerHTML = (views[tab] || vHome)(rest);
  $("#nav").innerHTML = TABS.map(([k, l]) => `<button data-act="nav" data-id="${k}" ${tab === k ? 'aria-current="page"' : ""}>${l}</button>`).join("");
  document.body.dataset.tab = tab;
  hydrate();
}
// Async bits after render (photo thumbnails).
function hydrate() {
  document.querySelectorAll("img[data-photo]").forEach(async img => {
    const b = await photos.get(img.dataset.photo).catch(() => null);
    if (b) img.src = URL.createObjectURL(b);
  });
}

/* ================= SYSTEM (home) ================= */
const yen = n => "¥" + Math.round(n || 0).toLocaleString("en-US");
const sysBox = (body, sub, act) => `<div class="sys"><b>[SYSTEM]</b> ${body}${sub ? `<div class="x">${sub}</div>` : ""}${act || ""}</div>`;

function vHome() {
  const t = E.today(), xp = E.xpTotal(), plan = E.planFor(t), w = E.workoutOn(t);
  const done = w ? (w.entries || []).filter(e => e.sets && e.sets.length).length : 0;
  const lastReward = live("rewardHistory").sort((a, b) => b.ts - a.ts)[0];
  const quests = HABITS.map(h => {
    const on = !!E.habitDone(h.id, t), wc = E.habitWeekCount(h.id), tg = E.habitTarget(h.id);
    return `<div class="q ${on ? "done" : ""}">
      <button class="bx" data-act="habit" data-id="${h.id}" aria-pressed="${on}" aria-label="${esc(h.name)} done today">${on ? "✓" : ""}</button>
      <div class="grow"><div class="t">${esc(h.name)}</div><div class="small muted">${esc(h.note)} · ${wc}/${tg} this week</div></div>
      <div class="xp">+${XP.habit}</div></div>`;
  }).join("");
  const a7 = E.avg7(), food = E.dayFood(t), ft = S.settings.food;
  const flags = E.painFlags();
  const hasData = live("workouts").length + live("bodyweight").length + live("meals").length + live("habitLog").length > 0;
  const lastExp = S.settings.lastExportAt;
  const expDays = lastExp ? E.daysBetween(lastExp.slice(0, 10), t) : null;
  const days = E.daysBetween(t, S.settings.dates.graduation), mp = E.moneyPlan();
  const doneToday = HABITS.filter(h => E.habitDone(h.id, t)).length;
  const alerts = [
    E.moneyDue() ? sysBox("Weekly money report is due.", "Bank balance and debt left. Takes 20 seconds.", `<div class="btns"><button class="btn sm" data-act="nav" data-id="money">Report now</button></div>`) : "",
    flags.length ? sysBox(`<span class="warn">Pain check.</span> ${flags.map(esc).join(" ")}`, "Deload or swap the exercise. Never train through sharp pain; if it keeps coming back, see a physio.") : "",
    hasData && (expDays === null || expDays >= 7) ? sysBox(expDays === null ? "You haven't exported yet." : `Last export ${expDays} days ago.`, "", `<div class="btns"><button class="btn sm" data-act="nav" data-id="more">Export now</button></div>`) : "",
  ].filter(Boolean);
  if (!alerts.length) alerts.push(sysBox(doneToday === HABITS.length ? "All daily quests cleared." : "Daily quests have arrived.", doneToday === HABITS.length ? "Rest is part of training." : `${HABITS.length - doneToday} left today.`));
  const stats = statList();
  return `
  <header class="top"><div><div class="hdr">Kofu → Shinjuku · ${E.fmtDate(t)}</div><h1>Status window</h1></div>
    <button class="rbtn" data-act="nav" data-id="more" aria-label="Settings and backup">⚙</button></header>
  <div class="stack">${alerts.join("")}</div>
  <div class="carousel">
    <div class="card g-mag"><div class="row between"><span class="k">Level</span><span class="k">${xp} XP</span></div>
      <div><div class="dm huge">${E.level()}</div>${bar(E.levelProgress(), "#fff")}
      <div class="small soft">${LEVEL_XP - (xp % LEVEL_XP)} XP to level ${E.level() + 1}${lastReward ? ` · Last reward: ${esc(lastReward.reward)}` : ""}</div></div></div>
    <div class="card g-ind"><span class="k">Days to graduation</span>
      <div><div class="dm huge">${days}</div><div class="small soft">${E.fmtDate(S.settings.dates.graduation)} · classes end ${E.fmtDate(S.settings.dates.classesEnd)}</div></div></div>
    <button class="card g-org" data-act="nav" data-id="money"><span class="k">Treasury</span>
      <div><div class="dm big2">${Math.round(mp.savePct * 100)}%</div><div class="small soft">${yen(mp.bank)} of ${yen(mp.goal)} · debt ${yen(mp.debt)}</div></div></button>
    <div class="card g-cyan"><span class="k">Streak</span>
      <div><div class="dm huge">${String(E.streak()).padStart(2, "0")}</div><div class="small soft">days in a row with a quest done</div></div></div>
  </div>

  <h2>Daily quests <span class="n">${doneToday}/${HABITS.length}</span></h2>
  <div class="list">${quests}</div>

  <h2>Today's dungeon</h2>
  <button class="panel row between" style="width:100%;text-align:left" data-act="nav" data-id="train">
    <div><div class="small muted">${esc(plan.where)}</div><b>${esc(plan.name)}</b>
      <div class="small muted">${plan.postShift ? "After night shift · " : ""}${done}/${plan.slots.length} exercises${w && E.habitDone("gym", t) ? " · logged" : ""}</div></div>
    <span class="chev">›</span></button>

  <h2>Stats</h2>
  <div class="panel">${Ch.radar(stats)}<p class="tiny muted">Each stat fills toward its last skill tier. DISC is the share of weekly targets hit over 4 weeks.</p></div>

  <button class="panel row between" style="width:100%;text-align:left" data-act="nav" data-id="body/food">
    <div class="grow"><div class="small muted">Body and food today</div>
      <div><b>${a7 ? r1(a7) + " kg" : "No weight yet"}</b> <span class="small muted">${a7 ? "7-day average" : ""}</span></div>
      <div class="small">${food.kcal} kcal${ft.kcalTarget ? " / " + ft.kcalTarget : ""} · ${r1(food.protein)} g protein${ft.proteinTarget ? " / " + ft.proteinTarget : ""}</div></div>
    <span class="chev">›</span></button>

  <div class="panel">
    <h3>Weekly report</h3>
    <p class="small muted">Markdown summary of this week for Claude. Readiness sections arrive in v2.</p>
    <div class="btns"><button class="btn primary" data-act="report">Copy weekly report</button></div>
    <div id="reportBox"></div>
  </div>
  <p class="tiny muted" style="text-align:right;margin-top:8px">${esc(Sync.statusText())}</p>`;
}

function statList() {
  const sk = Object.fromEntries(SKILLS.map(x => [x.id, E.skillInfo(x)]));
  return [["STR", sk.str.pct * 100, "org"], ["END", sk.end.pct * 100, "lime"], ["JP", sk.jp.pct * 100, "mag"],
    ["FIN", sk.fin.pct * 100, "ind"], ["MATH", sk.math.pct * 100, "cyan"], ["DISC", E.discipline() * 100, "fg"]];
}

/* ================= SKILLS ================= */
const SKILL_POINTS = [
  { a: "jp", b: "fin", x: 170, y: 76, label: "Japanese filings" },
  { a: "jp", b: "str", x: 90, y: 150, label: "Gym Japanese", dy: -10 },
  { a: "fin", b: "math", x: 250, y: 150, label: "Model drills", dy: -10 },
  { a: "str", b: "math", x: 170, y: 228, label: "Shift discipline", dy: 18 },
  { a: "jp", b: "fin", c: "math", x: 170, y: 150, label: "JP case interview", big: 1, dy: 20 },
];
function vSkills([sub]) {
  sub = sub || "tree";
  const sk = SKILLS.map(E.skillInfo), by = Object.fromEntries(sk.map(x => [x.id, x]));
  const seg = `<div class="pills">${[["tree", "Tree"], ["overlap", "Overlap"], ["unlocks", "Unlocks"], ["combos", "Combos"]].map(([k, l]) => `<button class="pill" data-act="go" data-id="skills/${k}" aria-pressed="${sub === k}">${l}</button>`).join("")}</div>`;
  let body = "";
  if (sub === "tree") {
    body = `<div class="panel">${Ch.tree(sk)}</div>
    <div class="list">${sk.map(x => `<div class="unl"><div class="lv" style="color:var(--${x.c})">T${x.tier}</div><div><b>${esc(x.name)}: ${esc(x.tiers[Math.max(0, x.tier - 1)])}</b></div>
      <div class="need">${x.src === "run" ? `longest run ${x.value} km` : `${x.value} session${x.value === 1 ? "" : "s"} logged`}${x.next != null ? ` · next tier at ${x.next}${x.src === "run" ? " km" : ""}` : " · maxed"}</div></div>`).join("")}</div>
    <p class="tiny muted">Tiers unlock from what you log: quest ticks for study skills, workout days for Strength, longest run for Endurance.</p>`;
  } else if (sub === "overlap") {
    const lvl = ids => ids.reduce((a, id) => a + by[id].pct, 0) / ids.length;
    const domains = [{ name: "Japanese", c: "mag", level: lvl(["jp"]) }, { name: "Finance", c: "ind", level: lvl(["fin"]) }, { name: "Body", c: "org", level: lvl(["str", "end"]) }, { name: "Mind", c: "cyan", level: lvl(["math"]) }];
    const pts = SKILL_POINTS.map(p => ({ ...p, lit: [p.a, p.b, p.c].filter(Boolean).every(id => by[id].tier >= 2) }));
    body = `<div class="panel">${Ch.venn(domains, pts)}<p class="tiny muted">Circles fill as each area grows. A point lights up when every skill it touches reaches tier 2. The overlaps are where you stand out.</p></div>`;
  } else if (sub === "unlocks") {
    body = `<div class="list">${UNLOCKS.map(u => {
      const parts = Object.entries(u.need), ok = parts.every(([id, n]) => by[id].tier >= n);
      return `<div class="unl ${ok ? "" : "lock"}"><div class="lv">${ok ? "✓" : "🔒"}</div><div><b>${esc(u.title)}</b></div>
        <div class="need">${parts.map(([id, n]) => `<span style="color:var(--${by[id].c})">${esc(by[id].name)}</span> T${Math.min(by[id].tier, n)}/${n}`).join(" · ")}</div></div>`;
    }).join("")}</div>`;
  } else {
    const g = { jp: "g-mag", fin: "g-ind", math: "g-cyan", str: "g-org", end: "g-cyan" };
    body = `<div class="list">${COMBOS.map(c => {
      const ok = by[c.a].tier >= 2 && by[c.b].tier >= 2;
      return `<div class="combo ${g[c.a]} ${ok ? "" : "dimmed"}"><div class="chips">${[c.a, c.b].map(id => `<span class="chip">${esc(by[id].name.toUpperCase())}</span>`).join("")}${ok ? "" : `<span class="chip">LOCKED · T2 BOTH</span>`}</div>
        <b>${esc(c.title)}</b><div class="small soft">${esc(c.text)}</div></div>`;
    }).join("")}</div><p class="tiny muted">Locked ideas still work today. They just count once both skills reach tier 2.</p>`;
  }
  return `<header class="top"><div><div class="hdr">Skill tree</div><h1>Skills</h1></div></header>${seg}${body}`;
}

/* ================= MONEY ================= */
let billForm = false;
function moneyChart() {
  const rs = E.moneyReports(), m = S.settings.money, g = S.settings.dates.graduation;
  if (!rs.length) return "";
  const d0 = rs[0].date, span = Math.max(7, E.daysBetween(d0, g)), N = 40;
  const idx = d => Math.round(E.daysBetween(d0, d) / span * N);
  const bank = Array(N + 1).fill(null), debt = Array(N + 1).fill(null);
  rs.forEach(r => { bank[idx(r.date)] = r.bank; debt[idx(r.date)] = r.debt; });
  const pace = [...Array(N + 1)].map((_, i) => rs[0].bank + (m.goal - rs[0].bank) * i / N);
  const dpace = [...Array(N + 1)].map((_, i) => rs[0].debt * (1 - i / N));
  const max = Math.ceil(Math.max(m.goal, ...rs.map(r => Math.max(r.bank, r.debt))) / 100000) * 100000;
  const mid = Math.round(N / 2);
  return Ch.lines([{ d: pace, c: "dim", dash: "4 4", w: 1.5, dots: false }, { d: dpace, c: "dim", dash: "2 5", w: 1.2, dots: false },
    { d: bank, c: "mag", w: 2.5, r: 3.2 }, { d: debt, c: "org", w: 2.5, r: 3.2 }],
    { min: 0, max, ticks: [0, max / 2, max], fmt: v => v ? Math.round(v / 1000) + "k" : "0", label: "Bank balance and debt vs pace to graduation",
      labels: [[0, E.fmtDate(d0).slice(4)], [mid, E.fmtDate(E.addDays(d0, Math.round(span / 2))).slice(4)], [N, "Grad"]] });
}
function vMoney() {
  const mp = E.moneyPlan(), rs = E.moneyReports().slice().reverse(), last = rs[0], due = E.moneyDue(), mk = E.monthKey();
  const bl = E.bills(), unpaid = bl.filter(b => !(b.paid || {})[mk]);
  const segs = 20, filled = Math.round(mp.paidPct * segs);
  return `<header class="top"><div><div class="hdr">Treasury</div><h1>Money</h1></div><div class="rbtn" aria-hidden="true">¥</div></header>
  ${due ? sysBox("Weekly money report is due.", "Asked every week. Enter today's numbers.") : ""}
  <div class="card g-ind" style="margin-top:12px">
    <div class="k">${due ? "Report for this week" : "Update this week's report"}</div>
    <div class="grid" id="moneyForm" style="margin-top:10px">
      <label class="f">Bank balance (¥)<input type="number" inputmode="numeric" data-f="bank" value="${due ? "" : last ? last.bank : ""}" placeholder="${last ? last.bank : ""}"></label>
      <label class="f">Debt left (¥)<input type="number" inputmode="numeric" data-f="debt" value="${due ? "" : last ? last.debt : ""}" placeholder="${last ? last.debt : ""}"></label>
    </div>
    <div class="btns"><button class="btn primary block" data-act="savemoney">Submit report</button></div>
  </div>

  <h2>Quest: ${yen(mp.goal)} by graduation</h2>
  <div class="panel">
    <div class="row between"><span class="dm big2">${yen(mp.bank)}</span><span class="mono small muted">${Math.round(mp.savePct * 100)}%</span></div>
    <div class="bar thick"><i style="width:${mp.savePct * 100}%;background:linear-gradient(90deg,var(--ind),var(--mag))"></i></div>
    <div class="row between small muted"><span>${yen(mp.goal - mp.bank)} to go</span><span>save ${yen(mp.saveWeek)} / week</span></div>
  </div>

  <h2>Quest: debt free by graduation</h2>
  <div class="panel">
    <div class="row between"><span class="dm big2">${yen(mp.debt)}</span><span class="mono small muted">left</span></div>
    <div class="segbar">${[...Array(segs)].map((_, i) => `<i class="${i < filled ? "f" : ""}"></i>`).join("")}</div>
    <div class="row between small muted"><span>${yen(mp.debtStart - mp.debt)} paid of ${yen(mp.debtStart)}</span><span>pay ${yen(mp.debtWeek)} / week</span></div>
  </div>
  <p class="tiny muted">${Math.round(mp.weeks)} weeks left. Both quests together need about ${yen(mp.saveWeek + mp.debtWeek)} a week.</p>

  <h2>Trend</h2>
  <div class="panel">${rs.length > 1 ? moneyChart() : `${moneyChart()}<p class="small muted">The trend fills in as you send weekly reports.</p>`}
    <div class="legend"><span><i style="background:var(--mag)"></i>Bank</span><span><i style="background:var(--org)"></i>Debt</span><span><i style="background:var(--dim)"></i>Pace to goal</span></div></div>

  <h2>Bills and insurance <span class="n">${yen(E.billsMonthly())} / month</span></h2>
  <div class="panel">
    ${bl.length ? bl.map(b => { const paid = !!(b.paid || {})[mk]; return `<div class="item row between">
      <button class="bx sm ${paid ? "on" : ""}" data-act="billpaid" data-id="${b.id}" aria-pressed="${paid}" aria-label="Paid ${esc(b.name)} this month">${paid ? "✓" : ""}</button>
      <div class="grow"><b>${esc(b.name)}</b><div class="small muted">${b.kind === "insurance" ? "Insurance · " : ""}${b.freq === "year" ? "yearly" : "monthly"}${paid ? " · paid this month" : ""}</div></div>
      <input class="amt" type="number" inputmode="numeric" data-ch="billamt" data-id="${b.id}" value="${b.amount ?? ""}" placeholder="¥ amount" aria-label="${esc(b.name)} amount">
      <button class="btn sm danger" data-act="delbill" data-id="${b.id}" aria-label="Delete ${esc(b.name)}">✕</button></div>`; }).join("") : `<p class="empty">No bills yet.</p>`}
    ${unpaid.length && bl.length ? `<p class="small muted" style="margin-top:6px">${unpaid.length} not marked paid for ${mk}. Tick a bill when you pay it.</p>` : ""}
    ${billForm ? `<div class="grid" id="billForm" style="margin-top:10px">
        <label class="f" style="flex-basis:100%">Name<input data-f="name" placeholder="e.g. Rent"></label>
        <label class="f">Amount (¥)<input type="number" inputmode="numeric" data-f="amount"></label>
        <label class="f">How often<select data-f="freq"><option value="month">Monthly</option><option value="year">Yearly</option></select></label>
        <label class="f">Type<select data-f="kind"><option value="bill">Bill</option><option value="insurance">Insurance</option></select></label></div>
      <div class="btns"><button class="btn go" data-act="addbill">Add</button><button class="btn" data-act="billform">Cancel</button></div>`
      : `<div class="btns"><button class="btn sm" data-act="billform">+ Bill</button></div>`}
  </div>

  <h2>History</h2>
  <div class="panel">${rs.map(r => `<div class="item row between"><span>${E.fmtDate(r.date)}</span><span class="mono small">bank ${yen(r.bank)} · debt ${yen(r.debt)}</span><button class="btn sm danger" data-act="delmoney" data-id="${r.id}" aria-label="Delete report">✕</button></div>`).join("") || `<p class="empty">No reports yet.</p>`}</div>

  <details class="panel"><summary>Goal settings</summary>
    <div class="grid" style="margin-top:8px"><label class="f">Savings goal (¥)<input type="number" inputmode="numeric" data-ch="moneygoal" value="${S.settings.money.goal}"></label>
    <label class="f">Starting debt (¥)<input type="number" inputmode="numeric" data-ch="debtstart" value="${S.settings.money.debtStart}"></label></div>
    <p class="tiny muted">Starting debt is the 100% mark for the debt bar. Deadline is graduation, ${E.fmtDate(S.settings.dates.graduation)}.</p>
  </details>`;
}

function weeklyReport() {
  const t = E.today(), wk = E.weekDays(t), prev = E.weekDays(E.addDays(t, -7));
  const xpWeek = live("xpEvents").filter(e => wk.includes(E.ymd(new Date(e.ts)))).reduce((a, e) => a + e.xp, 0);
  const ws = live("workouts").filter(w => wk.includes(w.date) && (w.entries || []).some(e => e.sets && e.sets.length));
  const runs = live("runs").filter(r => wk.includes(r.date));
  const sessions = new Set([...ws.map(w => w.date), ...runs.map(r => r.date)]).size;
  const prs = live("xpEvents").filter(e => e.type === "pr" && wk.includes(E.ymd(new Date(e.ts)))).map(e => e.label.replace(/^PR: /, ""));
  const exIds = [...new Set(ws.flatMap(w => w.entries.filter(e => e.sets.length).map(e => e.exercise)))];
  const exLines = exIds.map(id => {
    const ex = E.exById(id), h = E.history(id);
    const thisW = h.filter(x => wk.includes(x.date)), lastW = h.filter(x => prev.includes(x.date));
    const best = arr => arr.length ? arr.map(x => x.entry.sets).reduce((a, s) => E.bestScore(ex, s) > E.bestScore(ex, a) ? s : a) : null;
    const b = best(thisW), lb = best(lastW), st = E.stallInfo(id);
    const pain = thisW.map(x => x.entry.pain).filter(p => p && p.score).map(p => `pain ${p.score}${p.location ? " " + p.location : ""}`);
    const rpe = thisW.map(x => x.entry.rpe).filter(Boolean);
    return `- ${ex.name}: ${E.fmtSets(ex, b)}${lb ? ` (last week ${E.fmtSets(ex, lb)})` : ""}${rpe.length ? `, RPE ${rpe.join("/")}` : ""}${st.stalled ? ", **stalled**" : ""}${pain.length ? ", " + pain.join(", ") : ""}`;
  });
  const area = {};
  ws.forEach(w => w.entries.forEach(e => { const a = E.exById(e.exercise).area; area[a] = (area[a] || 0) + e.sets.length; }));
  const postShift = ws.filter(w => w.postShift).map(w => w.date);
  const a7 = E.avg7(t), a7p = E.avg7(E.addDays(t, -7));
  const checks = live("physique").sort((a, b) => b.date.localeCompare(a.date));
  const foodDays = wk.map(d => E.dayFood(d)).filter(f => f.meals.length);
  const ft = S.settings.food;
  const avgK = foodDays.length ? Math.round(foodDays.reduce((a, f) => a + f.kcal, 0) / foodDays.length) : null;
  const avgP = foodDays.length ? Math.round(foodDays.reduce((a, f) => a + f.protein, 0) / foodDays.length) : null;
  const longest = Math.max(0, ...live("runs").map(r => r.km));
  return `## Weekly report, ${E.isoWeek(t)} (week of ${E.fmtDate(wk[0])})
Level ${E.level()}, ${E.xpTotal()} XP (+${xpWeek} this week).

### Habits
${HABITS.map(h => `- ${h.name}: ${E.habitWeekCount(h.id, t)}/${E.habitTarget(h.id)}`).join("\n")}

### Training
- Sessions: ${sessions}/${E.habitTarget("gym")} planned${postShift.length ? ` (post-shift: ${postShift.map(E.fmtDate).join(", ")})` : ""}
${exLines.length ? exLines.join("\n") : "- No lifting or calisthenics logged"}
- Sets per area: ${Object.entries(area).map(([a, n]) => `${a} ${n}`).join(", ") || "none"}
- PRs: ${prs.length ? prs.join("; ") : "none"}
- Runs: ${runs.length ? runs.map(r => `${r.km} km in ${E.fmtTime(r.sec)} (${E.fmtTime(E.pace(r))}/km, feel ${r.feel}/5)`).join("; ") : "none"}. Longest ever ${longest} / ${RUN_GOAL_KM} km.

### Body
- Weight, 7-day average: ${a7 ? r1(a7) + " kg" : "no data"}${a7 && a7p ? ` (${a7 - a7p >= 0 ? "+" : ""}${r1(a7 - a7p)} kg vs last week)` : ""}
- Latest check: ${checks[0] ? `${E.fmtDate(checks[0].date)}, waist ${checks[0].waist ?? "–"} cm${checks[0].note ? `, "${checks[0].note}"` : ""}` : "none"}
- Food: ${foodDays.length}/7 days logged${avgK !== null ? `, average ${avgK} kcal${ft.kcalTarget ? " (target " + ft.kcalTarget + ")" : ""} and ${avgP} g protein${ft.proteinTarget ? " (target " + ft.proteinTarget + ")" : ""}` : ""}

### Money
${moneyLines()}

Please review: sessions vs plan, progression, stalls, pain, body trend, money pace. End with "Next week: 3 actions."`;
}

function moneyLines() {
  const mp = E.moneyPlan(), last = E.latestMoney(), prev = E.moneyReports().slice(-2, -1)[0], bl = E.bills(), mk = E.monthKey();
  return [
    `- Latest report: ${last ? `${E.fmtDate(last.date)}, bank ${yen(last.bank)}, debt ${yen(last.debt)}` : "none"}${E.moneyDue() ? " (this week's report missing)" : ""}`,
    prev ? `- Change since ${E.fmtDate(prev.date)}: bank ${last.bank - prev.bank >= 0 ? "+" : ""}${yen(last.bank - prev.bank)}, debt ${last.debt - prev.debt >= 0 ? "+" : ""}${yen(last.debt - prev.debt)}` : "",
    `- Goal ${yen(mp.goal)}: ${Math.round(mp.savePct * 100)}%, needs ${yen(mp.saveWeek)}/week. Debt: ${Math.round(mp.paidPct * 100)}% paid, needs ${yen(mp.debtWeek)}/week. ${Math.round(mp.weeks)} weeks left.`,
    `- Bills: ${yen(E.billsMonthly())}/month${bl.some(b => b.amount == null) ? " (some amounts missing)" : ""}; unpaid for ${mk}: ${bl.filter(b => !(b.paid || {})[mk]).map(b => b.name).join(", ") || "none"}`,
  ].filter(Boolean).join("\n");
}

/* ================= TRAIN ================= */
let draft = null; // stepper values on the log screen

function vTrain([view, a, b]) {
  if (view === "log") return vLog(a, b || E.today());
  if (view === "ex") return vExercise(a);
  if (view === "pick") return vPick(a);
  if (view === "runs") return vRuns();
  if (view === "new") return vNewExercise();
  return vTrainHome();
}

function vTrainHome() {
  const t = E.today(), plan = E.planFor(t), w = E.workoutOn(t);
  const postShift = w ? !!w.postShift : !!plan.postShift;
  const slots = plan.slots.map(key => {
    const ex = E.slotExercise(key), sl = SLOTS[key];
    const entry = w && (w.entries || []).find(e => e.exercise === ex.id);
    const tg = E.nextTarget(ex, t), st = E.stallInfo(ex.id);
    return `<button class="slot" data-act="go" data-id="train/log/${ex.id}">
      <span class="done-dot ${entry && entry.sets.length ? "on" : ""}"></span>
      <span class="grow"><span class="lab">${esc(sl.label)}</span><br><b>${esc(ex.name)}</b> ${st.stalled ? `<span class="pill warn">Stalled</span>` : ""}
      <br><span class="small muted">${entry && entry.sets.length ? "Today: " + esc(E.fmtSets(ex, entry.sets)) : tg ? "Target: " + esc(tg.text) : `First session: find a working ${ex.kind === "load" ? "weight" : "level"}`}</span></span>
      <span class="chev">›</span></button>`;
  }).join("");
  const extra = w ? (w.entries || []).filter(e => e.sets.length && !plan.slots.some(k => E.slotState(k).current === e.exercise)) : [];
  const recent = live("workouts").filter(x => x.date < t && (x.entries || []).some(e => e.sets.length)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const flags = E.painFlags();
  return `<h1>Train</h1>
  <div class="panel">
    <div class="row between"><div><div class="small muted">${E.fmtDate(t)} · ${esc(plan.where)}</div><h3 style="margin:2px 0 0">${esc(plan.name)}</h3></div></div>
    ${plan.postShift || postShift ? `<label class="row small" style="margin-top:8px"><input type="checkbox" data-ch="postshift" ${postShift ? "checked" : ""} style="width:22px;height:22px"> After a night shift: keep 1–2 reps in reserve</label>` : ""}
    ${flags.length ? `<div class="flag bad">${flags.map(esc).join(" ")} Deload or swap. Stop on sharp pain.</div>` : ""}
    <div style="margin-top:6px">${slots}</div>
    ${extra.map(e => { const ex = E.exById(e.exercise); return `<button class="slot" data-act="go" data-id="train/log/${ex.id}"><span class="done-dot on"></span><span class="grow"><span class="lab">Extra</span><br><b>${esc(ex.name)}</b><br><span class="small muted">Today: ${esc(E.fmtSets(ex, e.sets))}</span></span><span class="chev">›</span></button>`; }).join("")}
    <div class="btns"><button class="btn" data-act="go" data-id="train/pick/extra">+ Other exercise</button>${plan.run ? `<button class="btn" data-act="go" data-id="train/runs">Log a run</button>` : ""}</div>
  </div>
  <div class="panel row between"><div><b>Runs</b><div class="small muted">Longest ${Math.max(0, ...live("runs").map(r => r.km))} of ${RUN_GOAL_KM} km continuous</div></div><button class="btn sm" data-act="go" data-id="train/runs">Open</button></div>
  <div class="panel row between"><div><b>Exercise library</b><div class="small muted">By area. Add your own.</div></div><button class="btn sm" data-act="go" data-id="train/pick/browse">Open</button></div>
  <h2>Progress</h2>
  ${trainCharts()}
  <h2>Recent sessions</h2>
  <div class="panel">${recent.length ? recent.map(x => `<div class="item"><div class="row between"><b>${E.fmtDate(x.date)}</b>${x.postShift ? `<span class="pill">post-shift</span>` : ""}</div>
    ${x.entries.filter(e => e.sets.length).map(e => { const ex = E.exById(e.exercise); return `<button class="link small" style="display:block;text-align:left" data-act="go" data-id="train/log/${ex.id}/${x.date}">${esc(ex.name)}: ${esc(E.fmtSets(ex, e.sets))}${e.pr ? " · PR" : ""}</button>`; }).join("")}</div>`).join("") : `<p class="empty">No sessions yet.</p>`}</div>`;
}

function trainCharts() {
  const n = 12, lifts = [["bench", "org", "Bench"], ["squat", "ind", "Squat"], ["deadlift", "mag", "Deadlift"]];
  const ser = lifts.map(([id, c]) => ({ d: E.e1rmWeekly(id, n), c }));
  const vals = ser.flatMap(x => x.d).filter(v => v != null);
  const wk = i => E.isoWeek(E.addDays(E.today(), -7 * (n - 1 - i))).replace(/^\d+-?/, "");
  const labels = [[0, wk(0)], [6, wk(6)], [11, wk(11)]];
  let g = `<div class="panel"><div class="row between"><b>Estimated 1RM, main lifts</b><span class="small muted">12 weeks</span></div>`;
  if (vals.length) {
    const lo = Math.floor(Math.min(...vals) / 10) * 10, hi = Math.ceil(Math.max(...vals) / 10) * 10 || 10, mx = hi === lo ? lo + 10 : hi;
    g += Ch.lines(ser, { min: lo, max: mx, ticks: [lo, Math.round((lo + mx) / 2), mx], labels, label: "Estimated 1RM per week" })
      + `<div class="legend">${lifts.map(([, c, l]) => `<span><i style="background:var(--${c})"></i>${l}</span>`).join("")}</div>`;
  } else g += `<p class="small muted">Shows once you log bench, squat or deadlift.</p>`;
  g += `</div>`;
  const runs = E.longestRunWeekly(n);
  g += `<div class="panel"><div class="row between"><b>Longest run vs ${RUN_GOAL_KM} km</b><span class="small muted">by week</span></div>`
    + (runs.some(v => v != null) ? Ch.lines([{ d: runs, c: "cyan", w: 2.5 }], { min: 0, max: 14, ticks: [0, 4, 8, 12], labels, goal: RUN_GOAL_KM, label: "Longest run per week" })
      : `<p class="small muted">Shows once you log a run.</p>`) + `</div>`;
  return g;
}

function slotFor(exId, date) {
  const plan = E.planFor(date);
  return plan.slots.find(k => E.slotState(k).current === exId) || Object.keys(SLOTS).find(k => E.slotState(k).current === exId) || null;
}

function getEntry(date, exId, create) {
  let w = E.workoutOn(date);
  if (!w) { if (!create) return {}; w = put("workouts", { date, postShift: !!E.planFor(date).postShift, entries: [] }); }
  let e = (w.entries || []).find(x => x.exercise === exId);
  if (!e && create) { e = { exercise: exId, sets: [], rpe: null, pain: { score: 0, location: "" }, comment: "", video: "" }; w.entries.push(e); }
  return { w, e };
}

function initDraft(ex, date) {
  const { e } = getEntry(date, ex.id, false);
  const tg = E.nextTarget(ex, date), last = E.lastSession(ex.id, date);
  const n = e ? e.sets.length : 0;
  const base = (e && e.sets[n - 1]) || (tg && (tg.sets[n] || tg.sets[tg.sets.length - 1])) || (last && last.entry.sets[last.entry.sets.length - 1]) || {};
  const [lo] = E.range(ex);
  draft = { ex: ex.id, load: base.load ?? 20, reps: base.reps ?? lo, level: base.level ?? 0, secs: base.secs ?? lo };
  if (tg && tg.sets[n] && !(e && e.sets.length)) Object.assign(draft, tg.sets[n]);
}

function vLog(exId, date) {
  const ex = E.exById(exId);
  if (!draft || draft.ex !== exId) initDraft(ex, date);
  const { e } = getEntry(date, exId, false);
  const last = E.lastSession(exId, date), tg = E.nextTarget(ex, date), st = E.stallInfo(exId);
  const slot = slotFor(exId, date), sug = slot && st.stalled ? E.switchSuggestion(slot) : null;
  const isToday = date === E.today();
  const stepper = (label, key, step, u) => `<div><div class="small muted" style="margin:10px 0 4px">${label}</div><div class="stepper">
    <button data-act="step" data-id="${key}" data-step="${-step}" aria-label="Less ${label}">−</button>
    <output>${draft[key]}<span class="u">${u}</span></output>
    <button data-act="step" data-id="${key}" data-step="${step}" aria-label="More ${label}">+</button></div></div>`;
  const levels = ex.levels && ex.kind !== "load" ? `<div class="small muted" style="margin:10px 0 4px">Level</div><div class="seg">${ex.levels.map((l, i) => `<button data-act="level" data-id="${i}" aria-pressed="${draft.level === i}">${esc(l)}</button>`).join("")}</div>` : "";
  const inputs = ex.kind === "load" ? stepper("Load", "load", E.inc(ex), "kg") + stepper(ex.repLabel ? "Lengths" : "Reps", "reps", 1, E.unit(ex))
    : levels + (ex.kind === "time" ? stepper("Seconds", "secs", 5, "s") : stepper("Reps", "reps", 1, "reps"));
  const sets = e && e.sets.length ? `<div class="setlist">${e.sets.map((s, i) => `<div class="setrow"><span>Set ${i + 1}: ${esc(E.fmtSet(ex, s))}</span><button data-act="delset" data-id="${i}" aria-label="Delete set ${i + 1}">✕</button></div>`).join("")}</div>` : "";
  return `<button class="back" data-act="back">‹ Back</button>
  <div class="row between"><h1>${esc(ex.name)}</h1><button class="link" data-act="go" data-id="train/ex/${ex.id}">History</button></div>
  <div class="small muted">${isToday ? "Today" : E.fmtDate(date)}${slot ? " · " + esc(SLOTS[slot].label) + ` · <button class="link small" data-act="go" data-id="train/pick/${slot}">Swap</button>` : ""}</div>
  <div class="panel">
    <div class="small muted">Last time${last ? " · " + E.fmtDate(last.date) : ""}</div>
    <div><b>${last ? esc(E.fmtSets(ex, last.entry.sets)) : "No history yet"}</b>${last && last.entry.rpe ? ` <span class="small muted">RPE ${last.entry.rpe}</span>` : ""}</div>
    ${tg ? `<div class="small muted" style="margin-top:6px">Target</div><div><b>${esc(tg.text)}</b></div>` : `<div class="small muted" style="margin-top:6px">Range ${E.range(ex).join("–")} ${E.unit(ex)}. Pick a ${ex.kind === "load" ? "load" : "level"} you can do with 1–2 reps left.</div>`}
    ${st.stalled ? `<div class="flag"><b>Stalled for 2 weeks.</b> Circle method: switch to a weaker exercise in this area and come back to this one later.${sug ? `<div class="btns"><button class="btn sm go" data-act="circle" data-id="${slot}" data-ex="${sug.id}">Switch to ${esc(sug.name)}</button><button class="btn sm" data-act="go" data-id="train/pick/${slot}">Choose another</button></div>` : ""}</div>` : ""}
  </div>
  <div class="panel">
    <div class="row between"><h3>Sets</h3><span class="small muted">${e ? e.sets.length : 0} logged</span></div>
    ${sets}
    ${inputs}
    <div class="sticky-go"><button class="btn go block" style="min-height:60px;font-size:19px" data-act="logset">Log set ${(e ? e.sets.length : 0) + 1}</button></div>
  </div>
  ${e && e.sets.length ? `<div class="panel">
    <h3>How it went</h3>
    <div class="small muted">RPE</div>
    <div class="seg">${RPE.map(r => `<button data-act="rpe" data-id="${r}" aria-pressed="${e.rpe === r}">${r}</button>`).join("")}</div>
    <div class="small muted" style="margin-top:8px">Pain 0–10</div>
    <div class="seg">${[...Array(11)].map((_, i) => `<button data-act="pain" data-id="${i}" aria-pressed="${(e.pain?.score || 0) === i}" style="min-width:40px">${i}</button>`).join("")}</div>
    ${e.pain?.score ? `<label class="f" style="margin-top:6px">Where<input data-ch="painloc" value="${esc(e.pain.location)}" placeholder="e.g. left knee"></label>` : ""}
    ${(e.pain?.score || 0) >= 4 ? `<div class="flag bad">Pain ${e.pain.score}/10: stop this exercise today. Deload or swap next time. Sharp pain is a hard stop.</div>` : ""}
    <label class="f" style="margin-top:8px">Comments<textarea data-ch="comment" placeholder="Form cues, how it felt">${esc(e.comment)}</textarea></label>
    <label class="f" style="margin-top:8px">Video link (optional)<input type="url" data-ch="video" value="${esc(e.video)}" placeholder="https://"></label>
  </div>` : ""}`;
}

function vExercise(exId) {
  const ex = E.exById(exId), h = E.history(exId).slice().reverse(), st = E.stallInfo(exId);
  const [lo, hi] = E.range(ex);
  return `<button class="back" data-act="back">‹ Back</button>
  <h1>${esc(ex.name)}</h1>
  <div class="small muted">${esc(AREAS.find(a => a[0] === ex.area)?.[1] || ex.area)} · ${ex.kind === "load" ? "weighted" : ex.kind === "time" ? "timed hold" : "bodyweight"}${st.stalled ? ` · <span class="pill warn">Stalled</span>` : ""}</div>
  <div class="panel">
    <h3>Rep range</h3>
    <div class="grid"><label class="f">Low<input type="number" inputmode="numeric" data-ch="rangeLo" value="${lo}"></label><label class="f">High<input type="number" inputmode="numeric" data-ch="rangeHi" value="${hi}"></label>
    ${ex.kind === "load" ? `<label class="f">Load step (kg)<input type="number" inputmode="decimal" step="0.5" data-ch="inc" value="${E.inc(ex)}"></label>` : ""}</div>
    <p class="small muted" style="margin-top:6px">Hit the top of the range on every set, then ${ex.kind === "load" ? "add load" : "move up a level"}.</p>
    <div class="btns"><button class="btn go" data-act="go" data-id="train/log/${ex.id}">Log today</button></div>
  </div>
  <h2>History</h2>
  <div class="panel">${h.length ? h.map(x => `<div class="item"><div class="row between"><b>${E.fmtDate(x.date)}</b><span class="small muted">${x.entry.rpe ? "RPE " + x.entry.rpe : ""}${x.entry.pr ? " · PR" : ""}</span></div>
    <div>${esc(E.fmtSets(ex, x.entry.sets))}</div>${x.entry.pain?.score ? `<div class="small" style="color:var(--bad)">Pain ${x.entry.pain.score}${x.entry.pain.location ? " · " + esc(x.entry.pain.location) : ""}</div>` : ""}
    ${x.entry.comment ? `<div class="small muted">${esc(x.entry.comment)}</div>` : ""}${x.entry.video ? `<a class="small" href="${esc(x.entry.video)}" target="_blank" rel="noopener">Video</a>` : ""}</div>`).join("") : `<p class="empty">Nothing logged yet.</p>`}</div>`;
}

// mode: a slot key (swap), "extra" (log something off-plan) or "browse".
function vPick(mode) {
  const slot = SLOTS[mode];
  let list = E.allExercises();
  if (slot) list = E.slotCandidates(mode);
  const cur = slot ? E.slotState(mode).current : null;
  const groups = AREAS.map(([a, label]) => {
    const xs = list.filter(e => e.area === a).sort((x, y) => (x.rank || 0) - (y.rank || 0) || x.name.localeCompare(y.name));
    if (!xs.length) return "";
    return `<div class="lib-area"><h3>${label}</h3>${xs.map(e => { const lt = E.lastTrained(e.id), st = E.stallInfo(e.id);
      return `<button class="pick" data-act="${slot ? "swap" : "open"}" data-id="${e.id}" data-slot="${esc(mode)}"><b>${esc(e.name)}</b>${e.id === cur ? ` <span class="pill ok">Current</span>` : ""}${st.stalled ? ` <span class="pill warn">Stalled</span>` : ""}
      <br><span class="small muted">${e.kind === "load" ? "Weighted" : e.kind === "time" ? "Timed" : "Bodyweight"}${lt ? " · last " + E.fmtDate(lt) : " · not trained yet"}</span></button>`; }).join("")}</div>`;
  }).join("");
  return `<button class="back" data-act="back">‹ Back</button>
  <h1>${slot ? "Swap " + esc(slot.label.toLowerCase()) : mode === "extra" ? "Add an exercise" : "Exercise library"}</h1>
  ${slot ? `<p class="small muted">The new pick stays in this slot until you swap again. The old one is parked for the next circle.</p>` : ""}
  <div class="panel">${groups}</div>
  <div class="btns"><button class="btn" data-act="go" data-id="train/new">+ New exercise</button></div>`;
}

function vNewExercise() {
  return `<button class="back" data-act="back">‹ Back</button><h1>New exercise</h1>
  <div class="panel grid" id="newEx">
    <label class="f" style="flex-basis:100%">Name<input data-f="name" placeholder="e.g. Ring row"></label>
    <label class="f">Area<select data-f="area">${AREAS.map(([a, l]) => `<option value="${a}">${l}</option>`).join("")}</select></label>
    <label class="f">Type<select data-f="kind"><option value="load">Weighted (kg × reps)</option><option value="level">Bodyweight (level × reps)</option><option value="time">Timed hold (level × seconds)</option></select></label>
    <label class="f" style="flex-basis:100%">Levels, easiest first (bodyweight and timed only, comma separated)<input data-f="levels" placeholder="e.g. Tuck, Advanced tuck, Straddle"></label>
    <label class="f">Difficulty in its area (1 easy – 5 hard)<input type="number" data-f="rank" value="2" min="1" max="5"></label>
  </div>
  <div class="btns"><button class="btn go" data-act="saveex">Save exercise</button></div>`;
}

function vRuns() {
  const runs = live("runs").sort((a, b) => b.date.localeCompare(a.date));
  const longest = Math.max(0, ...runs.map(r => r.km));
  return `<button class="back" data-act="back">‹ Back</button><h1>Runs</h1>
  <div class="panel"><div class="row between"><b>Toward ${RUN_GOAL_KM} km continuous</b><span class="count">${longest} km</span></div>${bar(longest / RUN_GOAL_KM, "var(--train)")}</div>
  <div class="panel grid" id="runForm">
    <label class="f">Date<input type="date" data-f="date" value="${E.today()}"></label>
    <label class="f">Distance (km)<input type="number" inputmode="decimal" step="0.1" data-f="km" placeholder="5.0"></label>
    <label class="f">Time (mm:ss or h:mm:ss)<input data-f="time" inputmode="numeric" placeholder="30:00"></label>
    <div style="flex-basis:100%"><div class="small muted">Feel (1 awful – 5 great)</div><div class="seg" id="feel">${[1, 2, 3, 4, 5].map(i => `<button data-act="feel" data-id="${i}" aria-pressed="${i === 3}">${i}</button>`).join("")}</div></div>
    <label class="f" style="flex-basis:100%">Note<input data-f="note"></label>
  </div>
  <div class="btns"><button class="btn go block" data-act="saverun">Save run</button></div>
  <h2>History</h2>
  <div class="panel">${runs.length ? runs.map(r => `<div class="item row between"><div><b>${r.km} km</b> in ${E.fmtTime(r.sec)} <span class="small muted">· ${E.fmtTime(E.pace(r))}/km · feel ${r.feel}/5${r.pr ? " · PR" : ""}</span><div class="small muted">${E.fmtDate(r.date)}${r.note ? " · " + esc(r.note) : ""}</div></div><button class="btn sm danger" data-act="delrun" data-id="${r.id}" aria-label="Delete run">✕</button></div>`).join("") : `<p class="empty">No runs yet.</p>`}</div>`;
}

/* ================= BODY ================= */
let foodDate = null, foodForm = null;
function vBody([sub]) {
  sub = sub || "weight";
  const seg = `<div class="seg">${[["weight", "Weight"], ["food", "Food"], ["check", "Weekly check"]].map(([k, l]) => `<button data-act="go" data-id="body/${k}" aria-pressed="${sub === k}">${l}</button>`).join("")}</div>`;
  return `<h1>Body</h1>${seg}` + ({ weight: vWeight, food: vFood, check: vCheck }[sub] || vWeight)();
}

function weightChart() {
  const s = E.weightSeries().filter(x => x.date > E.addDays(E.today(), -56));
  if (s.length < 2) return `<p class="small muted">The trend line appears after two entries.</p>`;
  const W = 600, H = 200, P = 28;
  const ks = s.flatMap(x => [x.kg, x.avg]); let lo = Math.min(...ks), hi = Math.max(...ks);
  if (hi - lo < 2) { const m = (hi + lo) / 2; lo = m - 1; hi = m + 1; }
  const d0 = s[0].date, span = Math.max(1, E.daysBetween(d0, s[s.length - 1].date));
  const x = d => P + (E.daysBetween(d0, d) / span) * (W - P - 8), y = k => 8 + (1 - (k - lo) / (hi - lo)) * (H - 30);
  const ticks = [lo, (lo + hi) / 2, hi];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight and 7-day average, last 8 weeks">
    ${ticks.map(k => `<line class="grid" x1="${P}" x2="${W}" y1="${y(k)}" y2="${y(k)}"/><text x="0" y="${y(k) + 4}">${r1(k)}</text>`).join("")}
    ${s.map(p => `<circle class="dot" cx="${x(p.date)}" cy="${y(p.kg)}" r="4"/>`).join("")}
    <polyline class="avg" points="${s.map(p => x(p.date) + "," + y(p.avg)).join(" ")}"/>
    <text x="${P}" y="${H - 4}">${E.fmtDate(d0)}</text><text x="${W - 90}" y="${H - 4}">${E.fmtDate(s[s.length - 1].date)}</text>
  </svg><p class="tiny muted">Dots are daily weigh-ins. The line is the 7-day average: judge that, not single days.</p>`;
}

function vWeight() {
  const t = E.today(), all = live("bodyweight").sort((a, b) => b.date.localeCompare(a.date));
  const todays = all.find(x => x.date === t);
  if (!draft || draft.ex !== "weight") draft = { ex: "weight", kg: todays ? todays.kg : all[0] ? all[0].kg : 78 };
  const a7 = E.avg7(t), a7p = E.avg7(E.addDays(t, -7));
  return `<div class="panel">
    <div class="row between"><div><div class="small muted">7-day average</div><div class="big">${a7 ? r1(a7) : "–"} <span class="small muted">kg</span></div></div>
    <div style="text-align:right"><div class="small muted">vs last week</div><b>${a7 && a7p ? (a7 - a7p >= 0 ? "+" : "") + r1(a7 - a7p) + " kg" : "–"}</b></div></div>
    ${weightChart()}
  </div>
  <div class="panel">
    <div class="small muted">Today's weigh-in${todays ? " (saved, tap to change)" : ""}</div>
    <div class="stepper" style="margin-top:6px"><button data-act="kg" data-step="-0.1" aria-label="Less">−</button><output>${draft.kg.toFixed(1)}<span class="u">kg</span></output><button data-act="kg" data-step="0.1" aria-label="More">+</button></div>
    <div class="btns"><button class="btn go block" data-act="savekg">${todays ? "Update" : "Save"} today's weight</button></div>
  </div>
  <div class="panel">${all.slice(0, 14).map(e => `<div class="item row between"><span>${E.fmtDate(e.date)}</span><span><b>${e.kg.toFixed(1)}</b> kg <button class="btn sm danger" data-act="delkg" data-id="${e.id}" aria-label="Delete">✕</button></span></div>`).join("") || `<p class="empty">No entries yet. Weigh in each morning, same conditions.</p>`}</div>`;
}

function vFood() {
  const d = foodDate || E.today(), f = E.dayFood(d), ft = S.settings.food, saved = live("savedMeals");
  const low = d < E.today() && f.meals.length && f.kcal > 0 && f.kcal < 1500;
  return `<div class="panel">
    <div class="row between"><button class="btn sm" data-act="fday" data-step="-1" aria-label="Previous day">‹</button><b>${d === E.today() ? "Today" : E.fmtDate(d)}</b><button class="btn sm" data-act="fday" data-step="1" aria-label="Next day" ${d >= E.today() ? "disabled" : ""}>›</button></div>
    <div class="row between" style="margin-top:10px"><span>Calories</span><b>${Math.round(f.kcal)}${ft.kcalTarget ? " / " + ft.kcalTarget : ""}</b></div>${ft.kcalTarget ? bar(f.kcal / ft.kcalTarget, "var(--chuo)") : ""}
    <div class="row between" style="margin-top:6px"><span>Protein</span><b>${r1(f.protein)} g${ft.proteinTarget ? " / " + ft.proteinTarget : ""}</b></div>${ft.proteinTarget ? bar(f.protein / ft.proteinTarget, "var(--train)") : ""}
    ${!ft.kcalTarget || !ft.proteinTarget ? `<p class="small muted" style="margin-top:6px">Set daily targets in More.</p>` : ""}
    ${low ? `<div class="flag">Only ${Math.round(f.kcal)} kcal logged. If that's real, it's too low for training and recomposition. If you skipped logging, fill it in.</div>` : ""}
  </div>
  ${MEALS.map(([k, label]) => {
    const meal = f.meals.find(m => m.meal === k), items = meal ? meal.items : [];
    const kc = items.reduce((a, i) => a + (+i.kcal || 0), 0), pr = items.reduce((a, i) => a + (+i.protein || 0), 0);
    const open = foodForm === k;
    return `<div class="panel meal"><h3><span>${label}</span><span class="small muted">${Math.round(kc)} kcal · ${r1(pr)} g</span></h3>
      ${items.map((it, i) => `<div class="food-item"><span class="grow">${esc(it.name)}</span><span class="small muted">${it.kcal} kcal · ${it.protein} g</span><button class="btn sm danger" data-act="delitem" data-id="${k}" data-i="${i}" aria-label="Remove">✕</button></div>`).join("")}
      ${open ? `<div class="grid" id="itemForm" style="margin-top:8px"><label class="f" style="flex-basis:100%">Item<input data-f="name" placeholder="e.g. Salad chicken" autofocus></label>
        <label class="f">kcal<input type="number" inputmode="decimal" data-f="kcal"></label><label class="f">Protein (g)<input type="number" inputmode="decimal" data-f="protein"></label></div>
        <div class="btns"><button class="btn go" data-act="additem" data-id="${k}">Add</button><button class="btn" data-act="foodform" data-id="">Cancel</button></div>`
        : `<div class="btns"><button class="btn sm" data-act="foodform" data-id="${k}">+ Item</button>${items.length ? `<button class="btn sm" data-act="savemeal" data-id="${k}">Save as quick meal</button>` : ""}</div>`}
      ${saved.length ? `<div class="chips">${saved.map(s => `<button class="chip" data-act="usemeal" data-id="${s.id}" data-meal="${k}">+ ${esc(s.name)}</button>`).join("")}</div>` : ""}
    </div>`;
  }).join("")}
  ${saved.length ? `<details class="panel"><summary>Manage quick meals</summary>${saved.map(s => `<div class="item row between"><span>${esc(s.name)} <span class="small muted">${s.items.reduce((a, i) => a + (+i.kcal || 0), 0)} kcal · ${s.items.reduce((a, i) => a + (+i.protein || 0), 0)} g</span></span><button class="btn sm danger" data-act="delsaved" data-id="${s.id}">Delete</button></div>`).join("")}</details>` : ""}`;
}

let pendingPhotos = [];
function vCheck() {
  const checks = live("physique").sort((a, b) => b.date.localeCompare(a.date));
  const a7 = E.avg7();
  return `<div class="panel">
    <p class="small muted">Once a week, same day and time. Photos stay on this phone only and are never exported or synced.</p>
    <div class="grid" id="checkForm">
      <label class="f">Date<input type="date" data-f="date" value="${E.today()}"></label>
      <label class="f">Weight (kg)<input type="number" inputmode="decimal" step="0.1" data-f="kg" value="${a7 ? r1(a7) : ""}"></label>
      <label class="f">Waist (cm)<input type="number" inputmode="decimal" step="0.1" data-f="waist"></label>
      <label class="f">Chest (cm)<input type="number" inputmode="decimal" step="0.1" data-f="chest"></label>
      <label class="f">Arms (cm)<input type="number" inputmode="decimal" step="0.1" data-f="arms"></label>
      <label class="f" style="flex-basis:100%">Note<input data-f="note" placeholder="Short"></label>
      <label class="f" style="flex-basis:100%">Photos (optional)<input type="file" accept="image/*" multiple data-ch="photos"></label>
    </div>
    <div class="small muted" id="photoCount">${pendingPhotos.length ? pendingPhotos.length + " photo(s) ready" : ""}</div>
    <div class="btns"><button class="btn go block" data-act="savecheck">Save weekly check</button></div>
  </div>
  <h2>Past checks</h2>
  <div class="panel">${checks.length ? checks.map(c => `<div class="item"><div class="row between"><b>${E.fmtDate(c.date)}</b><button class="btn sm danger" data-act="delcheck" data-id="${c.id}" aria-label="Delete">✕</button></div>
    <div class="small">${[c.kg && c.kg + " kg", c.waist && "waist " + c.waist, c.chest && "chest " + c.chest, c.arms && "arms " + c.arms].filter(Boolean).join(" · ")}</div>
    ${c.note ? `<div class="small muted">${esc(c.note)}</div>` : ""}
    ${(c.photoIds || []).length ? `<div class="thumbs">${c.photoIds.map(p => `<img data-photo="${p}" alt="Check photo ${E.fmtDate(c.date)}">`).join("")}</div>` : ""}</div>`).join("") : `<p class="empty">No checks yet.</p>`}</div>`;
}

async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, "image/jpeg", 0.8));
  } catch (e) { return file; }
}

/* ================= MORE ================= */
function vMore() {
  const st = S.settings, rh = live("rewardHistory").sort((a, b) => b.ts - a.ts);
  return `<button class="back" data-act="nav" data-id="home">‹ System</button><h1>More</h1>
  <div class="panel"><h3>Sync and backup</h3>${Sync.panelHtml(esc)}</div>
  <div class="panel"><h3>Export</h3>
    <p class="small muted">One JSON file, <code>export-YYYY-MM-DD.json</code>, for your /exports folder. Photos are not included.${st.lastExportAt ? " Last export: " + E.fmtDate(st.lastExportAt.slice(0, 10)) + "." : ""}</p>
    <div class="btns"><button class="btn primary" data-act="export">Export file</button><button class="btn" data-act="exportcopy">Copy JSON</button></div>
    <div id="exportBox"></div>
  </div>
  <div class="panel"><h3>Import</h3>
    <p class="small muted">Merges an export into this device. Nothing is deleted; the newer copy of each record wins. A backup is kept first.</p>
    <input type="file" accept="application/json,.json" data-ch="import">
  </div>
  <div class="panel"><h3>Food targets</h3>
    <div class="grid"><label class="f">Calories per day<input type="number" inputmode="numeric" data-ch="kcalTarget" value="${st.food.kcalTarget ?? ""}"></label>
    <label class="f">Protein per day (g)<input type="number" inputmode="numeric" data-ch="proteinTarget" value="${st.food.proteinTarget ?? ""}"></label></div>
  </div>
  <div class="panel"><h3>Habit targets per week</h3>
    ${HABITS.map(h => `<div class="row between item"><span>${esc(h.name)}</span><input style="width:80px" type="number" min="0" max="7" data-ch="htarget" data-id="${h.id}" value="${E.habitTarget(h.id)}"></div>`).join("")}
  </div>
  <div class="panel"><h3>Rewards</h3>
    <p class="small muted">Every XP gain has this chance to unlock a random reward. One reward per line.</p>
    <label class="f">Chance (%)<input type="number" min="0" max="100" data-ch="chance" value="${Math.round((st.rewardChance ?? 0.18) * 100)}"></label>
    <label class="f" style="margin-top:8px">Pool<textarea data-ch="pool" rows="6">${esc((st.rewardPool || []).join("\n"))}</textarea></label>
    <details style="margin-top:8px"><summary>Reward history (${rh.length})</summary>${rh.slice(0, 50).map(r => `<div class="small item">${esc(r.reward)} <span class="muted">· ${E.fmtDate(E.ymd(new Date(r.ts)))}</span></div>`).join("") || `<p class="empty">None yet.</p>`}</details>
  </div>
  <p class="tiny muted" style="text-align:center;margin-top:16px">Kofu to Shinjuku · v1.1 · data schema ${S.schemaVersion}</p>`;
}

function download(name, text) {
  const blob = new Blob([text], { type: "application/json" });
  const file = new File([blob], name, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    return navigator.share({ files: [file], title: name }).catch(() => saveLink(blob, name));
  }
  saveLink(blob, name);
}
function saveLink(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ================= EVENTS ================= */
const readForm = sel => Object.fromEntries([...document.querySelectorAll(sel + " [data-f]")].map(el => [el.dataset.f, el.value.trim()]));

function curLog() { const [, view, exId, date] = route(); return view === "log" ? { exId, date: date || E.today() } : null; }

document.addEventListener("click", async ev => {
  const el = ev.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  switch (a) {
    case "nav": return go(id);
    case "go": return go(id);
    case "back": return history.length > 1 ? history.back() : go("train");

    case "habit": {
      const t = E.today(), h = E.habitDone(id, t);
      if (h) { remove("habitLog", h.id); E.revokeXP(h.id); save(); return render(); }
      const rec = put("habitLog", { date: t, habit: id });
      announce([E.gainXP("habit", rec.id, HABITS.find(x => x.id === id).name)]);
      save(); return render();
    }
    case "report": {
      const txt = weeklyReport(); let ok = false;
      try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {}
      $("#reportBox").innerHTML = `<textarea readonly style="min-height:200px;margin-top:8px;font-size:13px">${esc(txt)}</textarea>`;
      return toast(ok ? "Copied" : "Select the text and copy it");
    }

    // training
    case "step": { const k = id, s = +el.dataset.step, min = k === "load" ? 0 : 1; draft[k] = Math.max(min, +(draft[k] + s).toFixed(2)); return render(); }
    case "level": draft.level = +id; return render();
    case "logset": {
      const { exId, date } = curLog(), ex = E.exById(exId);
      const set = ex.kind === "load" ? { load: draft.load, reps: draft.reps } : ex.kind === "time" ? { level: draft.level, secs: draft.secs } : { level: draft.level, reps: draft.reps };
      const { w, e } = getEntry(date, exId, true);
      e.sets.push(set);
      const gains = [E.markWorkoutDay(date)];
      if (!e.pr && E.isPR(exId, date, e.sets)) { e.pr = true; gains.push(E.gainXP("pr", w.id + ":" + exId, "PR: " + ex.name + " " + E.fmtSet(ex, set))); }
      put("workouts", w); save(); announce(gains);
      if (!gains.filter(Boolean).length) toast("Set " + e.sets.length + " logged");
      return render();
    }
    case "delset": {
      const { exId, date } = curLog(), { w, e } = getEntry(date, exId, false);
      if (!e || !confirm("Delete this set?")) return;
      e.sets.splice(+id, 1);
      if (e.pr && !E.isPR(exId, date, e.sets)) { e.pr = false; E.revokeXP(w.id + ":" + exId); }
      put("workouts", w); save(); return render();
    }
    case "rpe": case "pain": {
      const { exId, date } = curLog(), { w, e } = getEntry(date, exId, false); if (!e) return;
      if (a === "rpe") e.rpe = e.rpe === +id ? null : +id; else e.pain = { ...(e.pain || {}), score: +id };
      put("workouts", w); save(); return render();
    }
    case "circle": E.setSlot(id, el.dataset.ex, true); save(); toast("Switched. The old exercise is parked for the next circle."); return go("train/log/" + el.dataset.ex);
    case "swap": E.setSlot(el.dataset.slot, id, true); save(); return go("train");
    case "open": return go("train/log/" + id);
    case "saveex": {
      const f = readForm("#newEx"); if (!f.name) return toast("Add a name");
      const levels = f.levels ? f.levels.split(",").map(s => s.trim()).filter(Boolean) : null;
      const rec = { id: "c-" + uid(), name: f.name, area: f.area, kind: f.kind, rank: +f.rank || 2, custom: true };
      if (f.kind !== "load") rec.levels = levels && levels.length ? levels : [f.kind === "time" ? "Hold" : "Standard"];
      put("exercises", rec); save(); toast("Exercise added"); return history.back();
    }
    case "feel": document.querySelectorAll("#feel button").forEach(b => b.setAttribute("aria-pressed", b === el)); return;
    case "saverun": {
      const f = readForm("#runForm"), km = num(f.km);
      const parts = (f.time || "").split(":").map(Number); let sec = 0;
      if (parts.some(isNaN) || !parts.length) sec = 0; else sec = parts.reduce((a, p) => a * 60 + p, 0) * (parts.length === 1 ? 60 : 1);
      if (!km || !sec) return toast("Add distance and time");
      const feel = +(document.querySelector('#feel [aria-pressed="true"]')?.dataset.id || 3);
      const run = { date: f.date || E.today(), km, sec, feel, note: f.note };
      run.pr = E.runIsPR(run);
      const rec = put("runs", run);
      const gains = [E.markWorkoutDay(rec.date)];
      if (rec.pr) gains.push(E.gainXP("pr", rec.id, `PR: run ${km} km`));
      save(); announce(gains); if (!gains.filter(Boolean).length) toast("Run saved"); return render();
    }
    case "delrun": if (confirm("Delete this run?")) { E.revokeXP(id); remove("runs", id); save(); render(); } return;

    // body
    case "kg": draft.kg = Math.max(30, +(draft.kg + +el.dataset.step).toFixed(1)); return render();
    case "savekg": {
      const t = E.today(), ex = live("bodyweight").find(x => x.date === t);
      put("bodyweight", { ...(ex || {}), date: t, kg: draft.kg }); save(); toast("Saved " + draft.kg.toFixed(1) + " kg"); return render();
    }
    case "delkg": if (confirm("Delete this weigh-in?")) { remove("bodyweight", id); save(); render(); } return;
    case "fday": foodDate = E.addDays(foodDate || E.today(), +el.dataset.step); if (foodDate >= E.today()) foodDate = null; foodForm = null; return render();
    case "foodform": foodForm = id || null; render(); if (foodForm) $("#itemForm input")?.focus(); return;
    case "additem": {
      const f = readForm("#itemForm"); if (!f.name) return toast("Add an item name");
      addItems(id, [{ name: f.name, kcal: num(f.kcal) || 0, protein: num(f.protein) || 0 }]); foodForm = null; save(); return render();
    }
    case "delitem": {
      const d = foodDate || E.today(), m = live("meals").find(x => x.date === d && x.meal === id); if (!m) return;
      m.items.splice(+el.dataset.i, 1);
      if (m.items.length) put("meals", m); else remove("meals", m.id);
      save(); return render();
    }
    case "savemeal": {
      const d = foodDate || E.today(), m = live("meals").find(x => x.date === d && x.meal === id); if (!m) return;
      const name = prompt("Name this quick meal", m.items.map(i => i.name).join(" + ").slice(0, 40)); if (!name) return;
      put("savedMeals", { name, items: m.items.map(i => ({ ...i })) }); save(); toast("Saved as quick meal"); return render();
    }
    case "usemeal": { const s = live("savedMeals").find(x => x.id === id); addItems(el.dataset.meal, s.items.map(i => ({ ...i }))); save(); toast("Added " + s.name); return render(); }
    case "delsaved": if (confirm("Delete this quick meal? Logged meals stay.")) { remove("savedMeals", id); save(); render(); } return;
    case "savecheck": {
      const f = readForm("#checkForm");
      const rec = { date: f.date || E.today(), kg: num(f.kg), waist: num(f.waist), chest: num(f.chest), arms: num(f.arms), note: f.note, photoIds: [] };
      if (rec.waist === null && rec.kg === null && !pendingPhotos.length) return toast("Add at least weight or waist");
      for (const p of pendingPhotos) { const pid = "ph-" + uid(); await photos.put(pid, await shrink(p)); rec.photoIds.push(pid); }
      pendingPhotos = []; put("physique", rec); save(); toast("Weekly check saved"); return render();
    }
    case "delcheck": {
      const c = live("physique").find(x => x.id === id);
      if (!c || !confirm("Delete this check and its photos?")) return;
      for (const p of c.photoIds || []) await photos.del(p).catch(() => {});
      remove("physique", id); save(); return render();
    }

    // money
    case "savemoney": {
      const f = readForm("#moneyForm"), bank = num(f.bank), debt = num(f.debt);
      if (bank === null || debt === null || bank < 0 || debt < 0) return toast("Enter both numbers");
      const t = E.today(), wk = E.weekDays(t), cur = live("money").find(r => wk.includes(r.date));
      put("money", { ...(cur || {}), date: t, bank, debt });
      const ref = "money:" + E.weekStart(t);
      const gains = live("xpEvents").some(e => e.ref === ref) ? [] : [E.gainXP("money", ref, "Money report")];
      save(); announce(gains); if (!gains.length) toast("Report updated"); return render();
    }
    case "delmoney": if (confirm("Delete this money report?")) { remove("money", id); save(); render(); } return;
    case "billform": billForm = !billForm; return render();
    case "addbill": {
      const f = readForm("#billForm"); if (!f.name) return toast("Add a name");
      put("bills", { name: f.name, amount: num(f.amount), freq: f.freq, kind: f.kind, paid: {} }); billForm = false; save(); return render();
    }
    case "delbill": if (confirm("Delete this bill?")) { remove("bills", id); save(); render(); } return;
    case "billpaid": {
      const b = live("bills").find(x => x.id === id), mk = E.monthKey(); if (!b) return;
      b.paid = { ...(b.paid || {}) }; if (b.paid[mk]) delete b.paid[mk]; else b.paid[mk] = true;
      put("bills", b); save(); return render();
    }

    // more
    case "export": case "exportcopy": {
      const o = exportObject(), txt = JSON.stringify(o, null, 1), name = `export-${E.today()}.json`;
      S.settings.lastExportAt = o.exportedAt; touchSettings(); save();
      if (a === "export") { await download(name, txt); toast("Exported " + name); }
      else { let ok = false; try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {} $("#exportBox").innerHTML = `<textarea readonly style="min-height:120px;margin-top:8px;font-size:12px">${esc(txt)}</textarea>`; toast(ok ? "Copied" : "Select the text and copy it"); }
      return;
    }
    default: if (Sync.handle(a, el, { render, toast })) return;
  }
});

function addItems(meal, items) {
  const d = foodDate || E.today();
  const m = live("meals").find(x => x.date === d && x.meal === meal) || { date: d, meal, items: [] };
  m.items = (m.items || []).concat(items); put("meals", m);
}

document.addEventListener("change", async ev => {
  const el = ev.target.closest("[data-ch]"); if (!el) return;
  const k = el.dataset.ch;
  const lg = curLog();
  if (lg && ["comment", "video", "painloc"].includes(k)) {
    const { w, e } = getEntry(lg.date, lg.exId, false); if (!e) return;
    if (k === "painloc") e.pain = { ...(e.pain || {}), location: el.value.trim() }; else e[k] = el.value.trim();
    put("workouts", w); save(); return;
  }
  if (k === "postshift") {
    const t = E.today(); let w = E.workoutOn(t);
    if (!w) w = put("workouts", { date: t, postShift: el.checked, entries: [] }); else { w.postShift = el.checked; put("workouts", w); }
    save(); return;
  }
  if (k === "rangeLo" || k === "rangeHi" || k === "inc") {
    const exId = route()[2], ex = E.exById(exId), v = num(el.value); if (v === null || v <= 0) return render();
    const base = live("exercises").find(x => x.id === exId) || { id: exId };
    put("exercises", { ...base, [k === "rangeLo" ? "repMin" : k === "rangeHi" ? "repMax" : "inc"]: v });
    const [lo, hi] = E.range(E.exById(exId)); if (lo > hi) toast("Low is above high");
    save(); return render();
  }
  if (k === "photos") { pendingPhotos = [...el.files]; $("#photoCount").textContent = pendingPhotos.length + " photo(s) ready"; return; }
  if (k === "billamt") { const b = live("bills").find(x => x.id === el.dataset.id); if (!b) return; b.amount = num(el.value); put("bills", b); save(); return render(); }
  if (k === "moneygoal" || k === "debtstart") { const v = num(el.value); if (v === null || v < 0) return render(); S.settings.money[k === "moneygoal" ? "goal" : "debtStart"] = v; touchSettings(); save(); return render(); }
  if (k === "kcalTarget" || k === "proteinTarget") { S.settings.food[k] = num(el.value); touchSettings(); save(); return; }
  if (k === "htarget") { S.settings.habitTargets[el.dataset.id] = Math.max(0, Math.min(7, Math.round(num(el.value) || 0))); touchSettings(); save(); return; }
  if (k === "chance") { S.settings.rewardChance = Math.max(0, Math.min(100, num(el.value) || 0)) / 100; touchSettings(); save(); return; }
  if (k === "pool") { S.settings.rewardPool = el.value.split("\n").map(s => s.trim()).filter(Boolean); touchSettings(); save(); return; }
  if (k === "import") {
    const file = el.files[0]; if (!file) return;
    let o; try { o = JSON.parse(await file.text()); } catch (e) { return toast("That file isn't valid JSON"); }
    const err = validateImport(o); if (err) return toast(err);
    await importMerge(o); save(); toast("Imported and merged"); return render();
  }
});

/* ---------- boot ---------- */
(async function boot() {
  await load();
  render();
  Sync.init({ render, toast });
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush().catch(() => {}); });
})();
