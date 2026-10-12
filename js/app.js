import { S, load, save, flush, onSave, live, put, remove, touchSettings, photos, exportObject, validateImport, importMerge, uid } from "./store.js";
import { HABITS, AREAS, SLOTS, RPE, RUN_GOAL_KM, LEVEL_XP, XP, SKILLS, UNLOCKS, COMBOS, RANKS, PERSON_TYPES, LIBRARY, SUBJECTS, SOCIAL_KEY } from "./data.js";
import * as Ch from "./charts.js";
import * as E from "./engine.js";
import * as Sync from "./sync.js";
import * as P from "./planner.js";
import { ic } from "./icons.js";
import * as C from "./command.js";
import * as St from "./study.js";
import * as G from "./glass.js";
import * as K from "./cards.js";
import { STARTER } from "./decks.js";
import * as J from "./jlpt.js";

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
// Swipe the day timeline left/right to change day.
let swipe0 = null;
document.addEventListener("touchstart", e => { swipe0 = e.target.closest("#dayline") ? [e.touches[0].clientX, e.touches[0].clientY] : null; }, { passive: true });
document.addEventListener("touchend", e => {
  if (!swipe0) return; const t = e.changedTouches[0], dx = t.clientX - swipe0[0], dy = t.clientY - swipe0[1]; swipe0 = null;
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  const el = $("#dayline"), d = E.addDays(planDate || E.today(), dx < 0 ? 1 : -1);
  if (d < el.dataset.min || d > el.dataset.max) return;
  planDate = d === E.today() ? null : d; entering = true; render();
}, { passive: true });
window.addEventListener("hashchange", () => { if (location.hash === "#plan/people") { location.replace("#social"); return; } if (location.hash === "#plan/study") { location.replace("#study"); return; } if (location.hash.startsWith("#body")) { location.replace("#home"); return; } entering = true; sheet = null; draft = null; taskForm = null; blockForm = null; wishForm = null; personForm = false; hangSel = null; topicEdit = null; cardForm = null; rv = null; bulkOpen = false; if (!location.hash.startsWith("#jlpt/q")) jq = null; if (recorder) recorder.stop(); render(); window.scrollTo(0, 0); });

// Four tabs (v2). System = what to do now (the Dungeon launches from here); Plan = when things happen (Day, Week, People);
// Store = money; Status = stats and skills. Body and Study are reached from System, not tabs.
const TABS = [["home", "System"], ["plan", "Plan"], ["money", "Store"], ["status", "Status"]];
const TAB_OF = { home: "home", alerts: "home", more: "home", cmd: "home", dungeon: "home", focus: "home", cards: "home", jlpt: "home", study: "home", train: "home", body: "home", plan: "plan", social: "plan", money: "money", status: "status", skills: "status" };
let entering = false, popId = null; // animation flags: page entrance, and the box just ticked
function render() {
  const [tab, ...rest] = route();
  const views = { home: vHome, dungeon: vDungeon, focus: vFocus, cards: vCards, jlpt: vJlpt, study: vStudyPage, cmd: vCmd, alerts: vAlerts, status: vStatus, plan: vPlan, social: vSocial, train: vTrain, money: vMoney, skills: vSkills, more: vMore };
  $("#app").innerHTML = (views[tab] || vHome)(rest);
  $("#nav").innerHTML = TABS.map(([k, l]) => `<button data-act="nav" data-id="${k}" ${(TAB_OF[tab] || "home") === k ? 'aria-current="page"' : ""}>${l}</button>`).join("");
  document.body.dataset.tab = tab;
  const app = $("#app");
  if (entering) { app.classList.remove("enter"); void app.offsetWidth; app.classList.add("enter"); entering = false; }
  else app.classList.remove("enter");
  if (popId) { document.querySelectorAll(`.bx[data-id="${CSS.escape(popId)}"]`).forEach(b => b.classList.add("pop")); popId = null; }
  $("#overlay").innerHTML = (briefOpen ? briefHtml() : "") + (sheet ? sheetHtml(sheet) : "");
  $("#fab").innerHTML = TAB_OF[tab] === "plan" && !(tab === "social" && rest[0] === "p") ? `<button class="fab" data-act="sheet" data-id="add" aria-label="Add">${ic("plus")}</button>` : "";
  document.body.classList.toggle("modal-open", !!(briefOpen || sheet));
  hydrate();
  if (tab === "cmd" && !cmd.prop && !cmd.done) $("[data-cmd]")?.focus();
}
// Async bits after render (photo thumbnails).
function hydrate() {
  document.querySelectorAll("img[data-photo],audio[data-photo]").forEach(async img => {
    const b = await photos.get(img.dataset.photo).catch(() => null);
    if (b) img.src = URL.createObjectURL(b);
  });
}

/* ---------- first-run tips: shown until dismissed (per phone) ---------- */
const TIP_KEY = "kts-tips";
const tipsSeen = () => { try { return JSON.parse(localStorage.getItem(TIP_KEY)) || {}; } catch (e) { return {}; } };
const tip = (key, text) => tipsSeen()[key] ? "" : `<div class="tip"><span class="grow">${text}</span><button class="tipx" data-act="tipx" data-id="${esc(key)}" aria-label="Got it">${ic("x")}</button></div>`;

/* ================= SYSTEM (home) ================= */
const yen = n => "¥" + Math.round(n || 0).toLocaleString("en-US");
const sysBox = (body, sub, act) => `<div class="sys"><b>System</b> · ${body}${sub ? `<div class="x">${sub}</div>` : ""}${act || ""}</div>`;

// Drop-downs remember whether you left them open (per phone).
const FOLD_KEY = "kts-fold";
const foldState = () => { try { return JSON.parse(localStorage.getItem(FOLD_KEY)) || {}; } catch (e) { return {}; } };
function fold(key, summary, body, def = false, cls = "") {
  const st = foldState(), open = key in st ? st[key] : def;
  return `<details class="fold ${cls}" data-fold="${esc(key)}" ${open ? "open" : ""}><summary>${summary}<span class="fchev">${ic("right")}</span></summary><div class="fold-b">${body}</div></details>`;
}
document.addEventListener("toggle", ev => {
  const d = ev.target; if (!d.matches || !d.matches("details[data-fold]")) return;
  const st = foldState(); st[d.dataset.fold] = d.open;
  try { localStorage.setItem(FOLD_KEY, JSON.stringify(st)); } catch (e) {}
}, true);

// Today's quests. Event quests = the to-do list planned for today (penalty quests first). Normal quests = the daily habits.
function todayQuests(t = E.today()) {
  const p = P.plan();
  const open = live("tasks").filter(k => !k.done && p.at.get(k.id)?.date === t).map(k => ({ k, at: p.at.get(k.id) }));
  const doneT = live("tasks").filter(k => k.done && k.doneAt && E.ymd(new Date(k.doneAt)) === t).map(k => ({ k, done: true }));
  const events = [...open.sort((a, b) => (!!b.k.penalty - !!a.k.penalty) || a.at.s - b.at.s), ...doneT];
  const habits = HABITS.map(h => ({ h, on: !!E.habitDone(h.id, t) }));
  return { events, habits, done: doneT.length + habits.filter(x => x.on).length, total: events.length + habits.length };
}
const habitRow = ({ h, on }) => `<div class="q ${on ? "done" : ""}">
  <button class="bx" data-act="habit" data-id="${h.id}" aria-pressed="${on}" aria-label="${esc(h.name)} done today">${on ? ic("check") : ""}</button>
  <div class="grow"><div class="t">${esc(h.name)}</div><div class="small muted">${esc(h.note)} · ${E.habitWeekCount(h.id)}/${E.habitTarget(h.id)} this week</div></div>
  <div class="xp">+${XP.habit}</div></div>`;
const eventRow = ({ k, at, done }) => `<div class="q ${done ? "done" : ""} ${k.penalty ? "pen-q" : ""}">
  <button class="bx" data-act="${done ? "taskundo" : "taskdone"}" data-id="${k.id}" aria-pressed="${!!done}" aria-label="${esc(k.title)} done">${done ? ic("check") : ""}</button>
  <div class="grow"><div class="t">${esc(k.title)}</div><div class="small muted">${done ? "done" : `${span(at.s, at.e)} · ${P.dur(k.mins)}`}</div></div>
  <div class="xp">${k.penalty ? "" : "+" + XP.task}</div></div>`;

function vHome() {
  const t = E.today();
  const days = E.daysBetween(t, S.settings.dates.graduation);
  const nn = P.nowNext(), wd = P.windDownNow(), n = alertList().length, gate = P.trainGate(started(t)), fg = St.focusGate();
  const into = gate.open ? "train" : fg.open ? "focus" : "plan";
  const nm = new Date().getHours() * 60 + new Date().getMinutes();
  const cur = nn.now, pct = cur ? Math.min(1, Math.max(0, (nm - cur.s) / Math.max(1, cur.e - cur.s))) : 0;
  const act = fg.open && fg.ended ? "Report" : into === "focus" ? (St.pomo(St.occKey(fg.o)).run ? "Open timer" : "Enter dungeon") : into === "train" ? "Enter dungeon" : "Open plan";
  const q = todayQuests(t), next = q.events.find(e => !e.done)?.k.title || q.habits.find(x => !x.on)?.h.name;
  const nowTitle = wd ? "Wind down" : cur ? (cur.type === "task" ? cur.k.title : cur.b.title) : "Free time";
  return `
  <header class="top"><div><div class="hdr">Kofu → Shinjuku · ${E.fmtDate(t)}</div><h1>Status window</h1></div>
    <div class="row" style="gap:8px"><button class="rbtn bell" data-act="nav" data-id="alerts" aria-label="Notifications, ${n} new">${ic("bell")}${n ? `<span class="badge">${n}</span>` : ""}</button>
    <button class="rbtn ${G.live() ? "on" : ""}" data-act="glass" aria-label="Glass mode ${G.live() ? "on" : "off"}" aria-pressed="${G.live()}">${ic("eye")}</button>
    <button class="rbtn" data-act="sheet" data-id="home" aria-label="Settings">${ic("settings")}</button></div></header>
  <button class="strip" data-act="nav" data-id="status">
    <span><b class="dm">LV ${E.level()}</b></span><span>${E.xpWallet().toLocaleString("en-US")} XP to spend</span><span class="row" style="gap:4px">${ic("flame", "fire")}${E.streak()}</span><span>${days}d to grad</span><span class="chev">${ic("right")}</span></button>
  ${alertStrip()}

  <div class="hero now ${wd ? "winding" : ""}">
    <div class="row between"><span class="hdr">Now · ${P.toHM(nm)}</span>${cur && !wd ? `<span class="hdr">${P.dur(Math.max(0, cur.e - nm))} left</span>` : ""}</div>
    <div class="now-t">${esc(nowTitle)}</div>
    ${wd ? `<div class="small muted">Bed at ${P.toHM(wd.bed)}. Screens off, shower, set out tomorrow's clothes.</div>` : cur && cur.type === "block" ? topicLine(cur.b) : ""}
    ${cur && !wd ? `<div class="bar"><i style="width:${pct * 100}%;background:var(--sys)"></i></div>` : ""}
    <div class="row between" style="margin-top:8px"><span class="small muted grow">${nn.next ? `Next: ${esc(nn.next.type === "wind" ? "Wind down" : nn.next.type === "task" ? nn.next.k.title : nn.next.b.title)} · ${P.toHM(nn.next.s)}` : "Nothing else today"}</span>
      <button class="btn sm ${into !== "plan" || (fg.open && fg.ended) ? "primary" : ""}" data-act="nav" data-id="${into}">${act}</button></div>
  </div>

  ${fold("quests", `<div class="grow"><div class="row between"><b>Quests</b><span class="mono small">${q.done}/${q.total}</span></div>${bar(q.done / (q.total || 1), "var(--sys)")}<div class="small muted">${next ? "Next: " + esc(next) : "All cleared today."}</div></div>`,
    `${q.events.length ? `<div class="qsec">Event quests <span>to-do · ${q.events.filter(e => e.done).length}/${q.events.length}</span></div><div class="list">${q.events.map(eventRow).join("")}</div>` : `<div class="qsec">Event quests <span>none planned today</span></div>`}
     <div class="qsec">Normal quests <span>daily · ${q.habits.filter(x => x.on).length}/${q.habits.length}</span></div><div class="list">${q.habits.map(habitRow).join("")}</div>
     <div class="btns"><button class="btn sm" data-act="brief">Today's brief</button><button class="btn sm" data-act="go" data-id="plan">Open plan</button></div>`)}

  <div class="quiet-links"><button data-act="go" data-id="dungeon">Dungeon</button><button data-act="go" data-id="cards">Flashcards</button></div>
  <button class="cmdline dock" data-act="nav" data-id="cmd">${ic("cmd")}<span class="grow">Tell the System…</span>${ic("mic")}</button>
`;
}

// The most urgent System message, with a count of the rest. Full list behind the bell.
function alertStrip() {
  const list = alertList(); if (!list.length) return "";
  return `<div class="astrip">${list[0]}${list.length > 1 ? `<button class="more-a" data-act="nav" data-id="alerts">+${list.length - 1} more</button>` : ""}</div>`;
}

function planSettings() {
  const wd = S.settings.windDown, pl = S.settings.plan;
  const perm = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  return `${fold("set-schedule", `<b class="grow">Schedule</b>`, `<div class="grid">
    <label class="f">Plan tasks from<input type="time" data-ch="dayStart" value="${esc(pl.dayStart)}"></label>
    <label class="f">Until<input type="time" data-ch="dayEnd" value="${esc(pl.dayEnd)}"></label>
    <label class="f">Padding around blocks (min)<input type="number" inputmode="numeric" data-ch="planmin" data-id="buffer" value="${pl.buffer ?? 10}"></label>
    <label class="f">Quest blocks open early / close late (min)<input type="number" inputmode="numeric" data-ch="planmin" data-id="openPad" value="${pl.openPad ?? 10}"></label>
    <label class="f">Edit lock before a block (min)<input type="number" inputmode="numeric" data-ch="planmin" data-id="lockMins" value="${pl.lockMins ?? 15}"></label></div>
    <p class="tiny muted">Tasks only go inside this window, outside blocks plus padding, and before wind-down. Today's blocks can't be changed from the lock time until they end.</p>`, true)}
  ${fold("set-wind", `<b class="grow">Wind-down</b><span class="small muted">${wd.on !== false ? (wd.mins ?? 60) + " min before bed" : "off"}</span>`, `
    <label class="row"><input type="checkbox" data-ch="wdon" style="width:auto" ${wd.on !== false ? "checked" : ""}> Remind me before bed</label>
    <div class="grid" style="margin-top:10px"><label class="f">Minutes before sleep<input type="number" inputmode="numeric" min="15" max="180" step="15" data-ch="wdmins" value="${wd.mins ?? 60}"></label></div>
    <p class="tiny muted">Bedtime comes from your Sleep blocks. On shift nights there is no wind-down.</p>
    <p class="small muted" style="margin-top:8px">${perm === "unsupported" ? "This browser has no notifications." : perm === "denied" ? "Notifications are blocked for this site. Allow them in the browser's site settings." : wd.notify && perm === "granted" ? "Notification at wind-down is on while the app is open or in the background." : "Best effort: a notification at wind-down while the app is open or in the background."}</p>
    ${perm === "unsupported" || perm === "denied" ? "" : `<div class="btns"><button class="btn sm" data-act="wdnotify">${wd.notify && perm === "granted" ? "Turn off notification" : "Turn on notification"}</button></div>`}`)}
  ${fold("set-cal", `<b class="grow">Calendar export</b>`, `
    <p class="small muted">A web app can't ring while it's closed. Your calendar can: add the wind-down there once and set its alert to "At time of event".</p>
    <div class="btns">${P.windDownLinks().map(l => `<a class="btn sm" href="${esc(l.url)}" target="_blank" rel="noopener">+ Google Calendar · ${P.toHM(l.at)} ${l.days.map(x => P.DAY_NAMES[x]).join(" ")}</a>`).join("") || `<span class="small muted">Turn the reminder on and add a Sleep block first.</span>`}</div>
    <div class="btns"><button class="btn sm" data-act="ics">Download whole timetable (.ics)</button></div>
    <p class="tiny muted">The .ics file has every block, the wind-down with an alarm, and this fortnight's planned tasks. On Android, import it at calendar.google.com → Settings → Import.</p>`)}`;
}
// Dungeon gear: pomodoro and penalty rules (they apply to every quest block).
function dungeonSettings() {
  const sst = S.settings.study;
  return `<h3>Pomodoro and penalties</h3><div class="grid">
    ${[["focus", "Focus (min)"], ["brk", "Break (min)"], ["long", "Long break (min)"], ["every", "Long break every (rounds)"], ["grace", "Time to report after a block (min)"], ["penaltyXp", "Penalty (XP)"]].map(([k, l]) => `<label class="f">${l}<input type="number" inputmode="numeric" data-ch="studynum" data-id="${k}" value="${sst[k]}"></label>`).join("")}</div>
    <p class="tiny muted">Every quest block is judged when it ends. Workout blocks count once a set or run is logged that day; study blocks once you report progress or finish a focus round.</p>
    <h3>Flashcards</h3><div class="grid"><label class="f">New cards per day<input type="number" inputmode="numeric" data-ch="cardsnew" value="${S.settings.cards.newPerDay ?? 15}"></label></div>
    <p class="tiny muted">How many unseen cards join the review pile each day. Reviews of cards you've seen are never capped.</p>`;
}
function bodySettings() {
  const st = S.settings;
  return `<h3>Weekly quest targets</h3>${HABITS.map(h => `<div class="row between item"><span class="small">${esc(h.name)}</span><input style="width:80px" type="number" min="0" max="7" data-ch="htarget" data-id="${h.id}" value="${E.habitTarget(h.id)}"></div>`).join("")}`;
}
function statusSettings() {
  return `<h3>Weekly report</h3><p class="small muted">Markdown summary of this week, to paste to Claude for the Sunday coaching report.</p>
    <div class="btns"><button class="btn primary" data-act="report">Copy weekly report</button></div><div id="reportBox"></div>
    <p class="tiny muted" style="margin-top:10px">${esc(Sync.statusText())}</p>`;
}
function moneySettings() {
  return `<h3>Goals</h3><div class="grid"><label class="f">Savings goal (¥)<input type="number" inputmode="numeric" data-ch="moneygoal" value="${S.settings.money.goal}"></label>
    <label class="f">Starting debt (¥)<input type="number" inputmode="numeric" data-ch="debtstart" value="${S.settings.money.debtStart}"></label></div>
    <p class="tiny muted">Starting debt is the 100% mark for the debt bar. Deadline is graduation, ${E.fmtDate(S.settings.dates.graduation)}.</p>
    <h3 style="margin-top:14px">Fun budget</h3><div class="grid"><label class="f">Per month (¥)<input type="number" inputmode="numeric" data-ch="funmonthly" value="${E.funBudget().monthly}"></label>
    <label class="f">Yen per 1 XP (new items)<input type="number" inputmode="numeric" data-ch="funrate" value="${S.settings.fun.yenPerXp}"></label></div>
    <p class="tiny muted">Started ${esc(S.settings.fun.start)}. Every month adds the budget; anything unspent carries over.</p>`;
}
/* ---------- settings sheet ---------- */
// One gear per tab opens its settings from the bottom, so daily screens stay clean.
let sheet = null;
function sheetHtml(k) {
  const [kind, arg] = k.split(":");
  const closeBtn = `<button class="rbtn" data-act="sheet" aria-label="Close">${ic("x")}</button>`;
  // Edit sheets: forms and actions for the tapped item.
  const edit = { task: () => arg ? taskActHtml(arg) : taskFormHtml(), block: () => blockFormHtml(blockForm && blockForm !== "new" ? live("blocks").find(b => b.id === blockForm) : blockNew),
    add: addHtml, person: personFormHtml }[kind];
  if (edit) return `<div class="modal-scrim" data-act="sheet"></div><div class="sheet" role="dialog"><div class="row between sheet-h"><span></span>${closeBtn}</div>${edit()}</div>`;
  const body = { plan: planSettings, status: statusSettings, money: moneySettings, body: bodySettings, dungeon: dungeonSettings }[k] || homeSettings;
  return `<div class="modal-scrim" data-act="sheet"></div><div class="sheet" role="dialog" aria-label="Settings">
    <div class="row between sheet-h"><b>Settings</b>${closeBtn}</div>${body()}
    <div class="btns"><button class="btn sm" data-act="nav" data-id="more">Backup, sync and all settings</button></div></div>`;
}
const gear = k => `<button class="rbtn" data-act="sheet" data-id="${k}" aria-label="Settings">${ic("settings")}</button>`;
function homeSettings() {
  const c = G.cfg();
  return `<h3>Background</h3>
    <p class="small muted">A photo of your choice, blurred and darkened behind the cards. It stays on this phone.</p>
    <div class="btns"><label class="btn sm">${c.photo ? "Change photo" : "Pick a photo"}<input type="file" accept="image/*" data-ch="bgphoto" hidden></label>${c.photo ? `<button class="btn sm" data-act="bgclear">Remove</button>` : ""}</div>
    <h3 style="margin-top:14px">Glass mode</h3>
    <p class="small muted">Uses the back camera so the app looks see-through. It turns itself off after the time below, when the battery drops under 20%, or when you leave the app. The camera runs only on this phone; nothing is recorded.</p>
    <div class="grid"><label class="f">Turn off after (min)<input type="number" inputmode="numeric" min="1" max="60" data-ch="glassmins" value="${c.mins}"></label></div>
    <label class="row small" style="margin-top:10px"><input type="checkbox" data-ch="glassfull" style="width:auto" ${c.full ? "checked" : ""}> Full screen (hides the status and navigation bars)</label>
    <div class="btns"><button class="btn sm ${G.live() ? "" : "primary"}" data-act="glass">${G.live() ? `Turn off (${G.minsLeft()} min left)` : "Turn on"}</button>${G.live() && G.lens().n > 1 ? `<button class="btn sm" data-act="glasslens">Next lens (${G.lens().i + 1} of ${G.lens().n})</button>` : ""}</div>
    ${G.live() && G.lens().n > 1 ? `<p class="small muted">Tap Next lens until the picture is the widest one (your 0.6×). It's remembered.</p>` : ""}
    <h3 style="margin-top:14px">Line it up</h3>
    <p class="small muted">Turn Glass mode on, hold the phone where you normally do, and drag until the picture matches what's behind it. Also applies to the photo.</p>
    <div class="tune">${[["blur", "Blur", 0, 20, 1, "px"], ["dim", "Brightness", 0.15, 1, 0.05, ""], ["zoom", "Zoom", 1, 1.8, 0.02, "×"], ["y", "Crop height", 0, 100, 1, "%"]].map(([k, l, lo, hi, st, u]) =>
      `<label>${l}<input type="range" min="${lo}" max="${hi}" step="${st}" value="${c[k]}" data-tune="${k}"><output>${c[k]}${u}</output></label>`).join("")}</div>
    <div class="btns"><button class="btn sm" data-act="glassreset">Reset look</button></div>`;
}

/* ---------- morning brief ---------- */
// First open of each day (from 04:00): a System window listing today's quests. Shown once per day per phone.
const BRIEF_KEY = "kts-brief";
let briefOpen = false;
function briefDue() { const d = new Date(); if (d.getHours() < 4) return false; try { return localStorage.getItem(BRIEF_KEY) !== E.today(); } catch (e) { return false; } }
function briefHtml() {
  const t = E.today(), q = todayQuests(t), pens = St.openPenalties();
  const blocks = St.questOcc(t).sort((a, b) => a.s - b.s);
  return `<div class="modal-scrim" data-act="briefclose"></div><div class="modal brief" role="dialog" aria-label="Today's quests">
    <div class="hdr">System · ${esc(E.fmtDate(t))}</div><h2 class="bh">Daily quests have arrived</h2>
    ${pens.length ? `<div class="bsec bad-t">Penalty</div>${pens.map(p => `<div class="bl">${ic("lock", "inl")} Make up ${esc(p.title)} · shop locked until done</div>`).join("")}` : ""}
    ${blocks.length ? `<div class="bsec">Quest blocks</div>${blocks.map(o => { const subj = St.subjectOf(o.b), top = subj && St.current(subj);
      return `<div class="bl"><span class="mono">${span(o.s, o.e)}</span> <b>${esc(o.b.title)}</b>${top ? `<div class="small topic-l">${ic("target", "inl")} ${esc(top.t)}</div>` : ""}</div>`; }).join("")}` : ""}
    <div class="bsec">Event quests</div>${q.events.filter(e => !e.done).map(({ k, at }) => `<div class="bl"><span class="mono">${span(at.s, at.e)}</span> ${esc(k.title)}</div>`).join("") || `<div class="bl muted">No to-dos planned today.</div>`}
    <div class="bsec">Normal quests</div><div class="bl">${q.habits.map(({ h }) => esc(h.name)).join(" · ")}</div>
    <p class="tiny muted" style="margin-top:10px">Skipped quest blocks cost ${S.settings.study.penaltyXp ?? 30} XP and earn a penalty quest.</p>
    <div class="btns"><button class="btn primary block" data-act="briefclose">Accept</button></div></div>`;
}

/* ---------- study blocks and penalties ---------- */
const mmss = ms => { const x = Math.ceil(ms / 1000); return E.pad(Math.floor(x / 60)) + ":" + E.pad(x % 60); };
// "Topic: …" under a study block wherever it shows, so the block says what to do, not just "Finance".
function topicLine(b, cls = "small") {
  const subj = b && St.subjectOf(b); if (!subj) return "";
  const top = St.current(subj);
  return `<div class="${cls} topic-l">${ic("target", "inl")} ${top ? esc(top.t) : "All topics done. Add more in Plan → Study"}</div>`;
}
function penaltyBox() {
  const pens = St.openPenalties(); if (!pens.length) return "";
  const xp = pens.reduce((a, p) => a + (p.xp || 0), 0), at = P.plan().at;
  const lines = pens.map(p => { const k = live("tasks").find(x => x.id === p.task), w = k && at.get(k.id);
    return `<div class="x">Missed ${esc(p.title)} · ${esc(dayLabel(p.date))} ${P.toHM(p.s || 0)}. Penalty quest: ${k ? P.dur(k.mins) + " make-up" : "make-up"}${w ? `, set for ${esc(dayLabel(w.date))} ${P.toHM(w.s)}` : ""}.</div>`; }).join("");
  return `<div class="sys pen"><b>Penalty</b> ${pens.length === 1 ? "A quest block was skipped." : pens.length + " quest blocks were skipped."} −${xp} XP. The shop is locked until the make-up ${pens.length === 1 ? "is" : "quests are"} done.
    ${lines}<div class="btns"><button class="btn sm" data-act="go" data-id="plan">Open penalty quests</button></div></div>`;
}
function reportDueBox(fg) {
  if (!fg || !fg.open || !fg.ended) return "";
  const subj = St.subjectOf(fg.o.b), top = subj && St.current(subj);
  return sysBox(`<span class="warn">${esc(fg.o.b.title)} is over. Report it.</span>`, `${top ? "How much of " + esc(top.t) + " did you get through? " : ""}Report by ${P.toHM(fg.closes)} or it counts as skipped.`,
    `<div class="btns"><button class="btn sm primary" data-act="nav" data-id="focus">Report now</button></div>`);
}
function vFocus() {
  const g = St.focusGate(), back = `<button class="back" data-act="nav" data-id="dungeon">${ic("left")} Dungeon</button>`;
  if (!g.open) {
    const nx = g.next;
    return `${back}<h1>Study dungeon</h1><div class="panel locked-gate"><div class="row" style="gap:10px">${ic("lock", "big-lock")}<div><div class="hdr">System · Gate closed</div>
      <b>${nx ? `Opens ${nx.date === E.today() ? "today" : esc(dayLabel(nx.date))} at ${P.toHM(nx.s)}` : "No study block this week"}</b>
      ${nx ? `<div class="small muted">${esc(nx.b.title)}</div>${topicLine(nx.b)}` : ""}
      <div class="small muted">A quest block opens ${S.settings.plan.openPad ?? 10} min before it starts. The report stays open ${S.settings.study.grace ?? 60} min after it ends.</div></div></div></div>`;
  }
  const o = g.o, key = St.occKey(o), subj = St.subjectOf(o.b), top = subj && St.current(subj), pr = top ? St.progress(subj, top.id) : 0;
  const p = St.pomo(key), fin = St.logsFor(o).find(r => r.final), sst = S.settings.study, pen = sst.penaltyXp ?? 30;
  const left = St.pomoLeft(p), phase = p.phase === "focus" ? "Focus" : p.phase === "long" ? "Long break" : "Break";
  const topicHtml = !subj ? "" : !top ? sysBox("Every topic in this list is done.", "Add the next ones in Plan → Study.") :
    `<div class="panel"><div class="row between"><span class="hdr">${esc(SUBJECTS[subj].name)} · topic ${St.topics(subj).indexOf(top) + 1} of ${St.topics(subj).length}</span><span class="small">${pr}% done</span></div>${bar(pr / 100, "var(--sys)")}
      <h3>Do this</h3><p class="small">${esc(top.do)}</p>
      ${top.out ? `<h3>End with</h3><p class="small">${esc(top.out)}</p>` : ""}
      ${(top.src || []).length ? `<h3>Sources</h3><div class="small srcs">${top.src.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a>`).join("")}</div>` : ""}
      ${!g.ended && !fin ? `<div class="btns"><button class="btn sm" data-act="topicdone">Finished this topic early: start the next</button></div>` : ""}</div>`;
  const timer = g.ended || fin ? "" : `<div class="panel pomo ph-${p.phase}"><div class="row between"><span class="hdr">${phase}${p.phase === "focus" ? " · round " + (p.n + 1) : ""}</span><span class="small muted">${p.n} round${p.n === 1 ? "" : "s"} done</span></div>
      <div class="dm pomo-t" id="pomoT">${mmss(left)}</div><div class="bar" style="--c:var(--sys)"><i id="pomoBar" style="width:${(1 - left / St.pomoLen(p)) * 100}%"></i></div>
      <div class="btns"><button class="btn ${p.run ? "" : "primary"}" data-act="pomo" data-id="${p.run ? "pause" : "start"}">${p.run ? "Pause" : "Start"}</button><button class="btn" data-act="pomo" data-id="skip">Skip</button><button class="btn" data-act="pomo" data-id="reset">Reset</button></div>
      <p class="tiny muted">${sst.focus} min focus, ${sst.brk} min break, ${sst.long} min after every ${sst.every}. It buzzes while the app is open; with the screen off it keeps time but can't ring until the Android app.</p></div>`;
  let rep;
  if (fin) rep = sysBox(fin.done ? "Block done." : fin.gain || fin.poms ? `Reported: +${fin.gain}% of the topic, ${fin.poms} round${fin.poms === 1 ? "" : "s"}.` : `<span class="warn">Reported as not done.</span>`,
    top ? `Next study block: ${esc(top.t)} (${pr}% done).` : "");
  else {
    const opts = !subj || !top ? [["done", "Done"], ["0", "Didn't do it"]]
      : [["0", "None"], ...[10, 25, 50, 75].filter(x => pr + x < 100).map(x => [String(x), "+" + x + "%"]), ["rest", "Finished it"]];
    rep = `<div class="panel ${g.ended ? "report-due" : ""}"><h3>${g.ended ? "Block over. Report it" : "End-of-block report"}</h3>
      <p class="small">${top ? `How much of <b>${esc(top.t)}</b> did you get through in this block? Count it as a share of the whole topic.` : "Did you do this block?"}</p>
      <div class="chips">${opts.map(([v, l]) => `<button class="chip" data-act="blockreport" data-id="${v}">${l}</button>`).join("")}</div>
      <p class="tiny muted">${g.ended ? `Report by ${P.toHM(g.closes)}.` : "Report when the block ends."} No work done by then counts as skipped: −${pen} XP and a make-up penalty quest. The shop locks until it's cleared.</p></div>`;
  }
  const due = K.queue().length;
  const stages = `<div class="stages"><span class="st on">1 · Topic</span><button class="st" data-act="nav" data-id="cards/review">2 · Flashcards${due ? ` <b>${due}</b>` : ` ${ic("check", "inl")}`}</button><button class="st" data-act="nav" data-id="jlpt/q">3 · JLPT</button></div>`;
  return `${back}<header class="top"><div><div class="hdr">System · Quest · ${esc(o.b.title)} · ${span(o.s, o.e)}</div><h1>${esc(top ? top.t : o.b.title)}</h1></div></header>
  ${stages}${timer}${topicHtml}${rep}`;
}
// Phase change: buzz, beep, and a notification if the app is in the background.
function chime(p) {
  try { navigator.vibrate && navigator.vibrate([300, 120, 300]); } catch (e) {}
  try {
    const ac = chime.ac || (chime.ac = new (window.AudioContext || window.webkitAudioContext)()), o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = p.phase === "focus" ? 660 : 880; g.gain.setValueAtTime(0.2, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.8);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.8);
  } catch (e) {}
  const msg = p.phase === "focus" ? "Break's over. Back to focus." : "Focus round done. Take a break.";
  toast(msg);
  try { if (document.visibilityState !== "visible" && typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Kofu to Shinjuku", { body: msg }); } catch (e) {}
}
function tickPomo() {
  if (route()[0] !== "focus") return;
  const g = St.focusGate(); if (!g.open) return;
  const p = St.pomo(St.occKey(g.o));
  if (p.fired) { St.pomoSave(p); chime(p); return render(); }
  const el = $("#pomoT"), b = $("#pomoBar"), left = St.pomoLeft(p);
  if (el) el.textContent = mmss(left);
  if (b) b.style.width = (1 - left / St.pomoLen(p)) * 100 + "%";
}
function runAssess() {
  const fresh = St.assess();
  if (fresh.length) { save(); toast(`Penalty ${fresh.map(p => p.title).join(", ")} skipped. −${fresh.reduce((a, p) => a + p.xp, 0)} XP`, true); }
}

// Everything the System wants from you. Shown behind the bell on Home.
function alertList() {
  const t = E.today(), flags = E.painFlags(), wd = P.windDownNow();
  const hasData = live("workouts").length + live("bodyweight").length + live("meals").length + live("habitLog").length > 0;
  const lastExp = S.settings.lastExportAt, expDays = lastExp ? E.daysBetween(lastExp.slice(0, 10), t) : null;
  const unplaced = P.plan().unplaced.length;
  const btn = (id, l) => `<div class="btns"><button class="btn sm" data-act="go" data-id="${id}">${l}</button></div>`;
  const pens = St.openPenalties(), fg = St.focusGate();
  return [
    pens.length && penaltyBox(),
    fg.open && fg.ended && reportDueBox(fg),
    wd && sysBox(`Wind-down time. Bed at ${P.toHM(wd.bed)}.`, "Screens off, shower, set out tomorrow's clothes. The day is done."),
    E.moneyDue() && sysBox("Weekly money report is due.", "Bank balance and debt left. Takes 20 seconds.", btn("money", "Report now")),
    flags.length && sysBox(`<span class="warn">Pain check.</span> ${flags.map(esc).join(" ")}`, "Deload or swap the exercise. Never train through sharp pain; if it keeps coming back, see a physio."),
    unplaced && sysBox(`${unplaced} task${unplaced === 1 ? "" : "s"} didn't fit in the next 2 weeks.`, "Shorten them, split them, or move a block.", btn("plan", "Open plan")),
    hasData && (expDays === null || expDays >= 7) && sysBox(expDays === null ? "You haven't exported yet." : `Last export ${expDays} days ago.`, "", btn("more", "Export now")),
  ].filter(Boolean);
}
function vAlerts() {
  const list = alertList(), t = E.today(), left = HABITS.filter(h => !E.habitDone(h.id, t)).length;
  return `<button class="back" data-act="nav" data-id="home">${ic("left")} System</button><h1>Notifications</h1>
  <div class="stack" style="margin-top:12px">${list.join("") || sysBox(left ? "Nothing needs you." : "All daily quests cleared.", left ? `${left} daily quest${left === 1 ? "" : "s"} left today.` : "Rest is part of training.")}</div>`;
}

const statusSeg = cur => `<div class="pills">${[["status", "Overview"], ["skills", "Skills"]].map(([k, l]) => `<button class="pill" data-act="nav" data-id="${k}" aria-pressed="${cur === k}">${l}</button>`).join("")}</div>`;
function vStatus() {
  const t = E.today(), xp = E.xpTotal(), mp = E.moneyPlan(), days = E.daysBetween(t, S.settings.dates.graduation);
  const lastReward = live("rewardHistory").sort((a, b) => b.ts - a.ts)[0];
  return `<header class="top"><div><div class="hdr">Player status</div><h1>Status</h1></div>${gear("status")}</header>${statusSeg("status")}
  <div class="carousel">
    <div class="card g-mag"><div class="row between"><span class="k">Level</span><span class="k">${xp} XP</span></div>
      <div><div class="dm huge">${E.level()}</div>${bar(E.levelProgress(), "var(--mag)")}
      <div class="small soft">${LEVEL_XP - (xp % LEVEL_XP)} XP to level ${E.level() + 1} · ${E.xpWallet()} to spend${lastReward ? ` · Last reward: ${esc(lastReward.reward)}` : ""}</div></div></div>
    <div class="card g-ind"><span class="k">Days to graduation</span>
      <div><div class="dm huge">${days}</div><div class="small soft">${E.fmtDate(S.settings.dates.graduation)} · classes end ${E.fmtDate(S.settings.dates.classesEnd)}</div></div></div>
    <button class="card g-org" data-act="nav" data-id="money"><span class="k">Treasury</span>
      <div><div class="dm big2">${Math.round(mp.savePct * 100)}%</div><div class="small soft">${yen(mp.bank)} of ${yen(mp.goal)} · debt ${yen(mp.debt)}</div></div></button>
    <div class="card g-cyan"><span class="k">Streak</span>
      <div><div class="dm huge">${String(E.streak()).padStart(2, "0")}</div><div class="small soft">days in a row with a quest done</div></div></div>
  </div>
  <button class="quiet-row" data-act="nav" data-id="skills"><span class="grow">Stats radar and skill tree</span><span class="chev">${ic("right")}</span></button>`;
}

function statList() {
  const sk = Object.fromEntries(SKILLS.map(x => [x.id, E.skillInfo(x)]));
  return [["STR", sk.str.pct * 100, "org"], ["END", sk.end.pct * 100, "lime"], ["JP", sk.jp.pct * 100, "mag"],
    ["FIN", sk.fin.pct * 100, "ind"], ["MATH", sk.math.pct * 100, "cyan"], ["CHA", sk.cha.pct * 100, "warn"], ["DISC", E.discipline() * 100, "fg"]];
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
    ${fold("skill-tiers", `<b class="grow">Tier details</b><span class="small muted">${sk.length} skills</span>`, `<div class="list">${sk.map(x => `<div class="unl"><div class="lv" style="color:var(--${x.c})">T${x.tier}</div><div><b>${esc(x.name)}: ${esc(x.tiers[Math.max(0, x.tier - 1)])}</b></div>
      <div class="need">${x.src === "run" ? `longest run ${x.value} km` : `${x.value} session${x.value === 1 ? "" : "s"} logged`}${x.next != null ? ` · next tier at ${x.next}${x.src === "run" ? " km" : ""}` : " · maxed"}</div></div>`).join("")}</div>`)}
    <p class="tiny muted">Tiers unlock from what you log: quest ticks for study and life skills, workout days for Strength, longest run for Endurance.</p>`;
  } else if (sub === "overlap") {
    const lvl = ids => ids.reduce((a, id) => a + by[id].pct, 0) / ids.length;
    const domains = [{ name: "Japanese", c: "mag", level: lvl(["jp"]) }, { name: "Finance", c: "ind", level: lvl(["fin"]) }, { name: "Body", c: "org", level: lvl(["str", "end"]) }, { name: "Mind", c: "cyan", level: lvl(["math"]) }];
    const pts = SKILL_POINTS.map(p => ({ ...p, lit: [p.a, p.b, p.c].filter(Boolean).every(id => by[id].tier >= 2) }));
    body = `<div class="panel">${Ch.venn(domains, pts)}<p class="tiny muted">Circles fill as each area grows. A point lights up when every skill it touches reaches tier 2. The overlaps are where you stand out.</p></div>`;
  } else if (sub === "unlocks") {
    body = `<div class="list">${UNLOCKS.map(u => {
      const parts = Object.entries(u.need), ok = parts.every(([id, n]) => by[id].tier >= n);
      return `<div class="unl ${ok ? "" : "lock"}"><div class="lv">${ok ? ic("check") : ic("lock")}</div><div><b>${esc(u.title)}</b></div>
        <div class="need">${parts.map(([id, n]) => `<span style="color:var(--${by[id].c})">${esc(by[id].name)}</span> T${Math.min(by[id].tier, n)}/${n}`).join(" · ")}</div></div>`;
    }).join("")}</div>`;
  } else {
    const g = { jp: "g-mag", fin: "g-ind", math: "g-cyan", str: "g-org", end: "g-cyan", cha: "g-org" };
    body = `<div class="list">${COMBOS.map(c => {
      const ok = by[c.a].tier >= 2 && by[c.b].tier >= 2;
      return `<div class="combo ${g[c.a]} ${ok ? "" : "dimmed"}"><div class="chips">${[c.a, c.b].map(id => `<span class="chip">${esc(by[id].name.toUpperCase())}</span>`).join("")}${ok ? "" : `<span class="chip">LOCKED · T2 BOTH</span>`}</div>
        <b>${esc(c.title)}</b><div class="small soft">${esc(c.text)}</div></div>`;
    }).join("")}</div><p class="tiny muted">Locked ideas still work today. They just count once both skills reach tier 2.</p>`;
  }
  return `<header class="top"><div><div class="hdr">Skill tree</div><h1>Skills</h1></div></header>${statusSeg("skills")}
  <div class="panel">${Ch.radar(statList())}<p class="tiny muted">Your stats. Each fills toward its last skill tier. DISC is the share of weekly targets hit over 4 weeks.</p></div>
  <div style="margin-top:14px">${seg}</div>${body}`;
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
function vMoney([sub] = []) {
  if (sub === "rewards") return vRewards();
  const mp = E.moneyPlan(), rs = E.moneyReports().slice().reverse(), last = rs[0], due = E.moneyDue(), mk = E.monthKey();
  const bl = E.bills(), unpaid = bl.filter(b => !(b.paid || {})[mk]);
  const segs = 20, filled = Math.round(mp.paidPct * segs);
  const form = `<div class="grid" id="moneyForm">
      <label class="f">Bank balance (¥)<input type="number" inputmode="numeric" data-f="bank" value="${due ? "" : last ? last.bank : ""}" placeholder="${last ? last.bank : ""}"></label>
      <label class="f">Debt left (¥)<input type="number" inputmode="numeric" data-f="debt" value="${due ? "" : last ? last.debt : ""}" placeholder="${last ? last.debt : ""}"></label>
    </div>
    <div class="btns"><button class="btn primary block" data-act="savemoney">${due ? "Submit report" : "Update report"}</button></div>`;
  return `<header class="top"><div><div class="hdr">Treasury</div><h1>Store</h1></div>${gear("money")}</header>
  ${due ? `<div class="panel report-due"><h3>Weekly money report is due</h3><p class="small muted">Bank balance and debt left. Takes 20 seconds.</p>${form}</div>` : ""}

  <div class="hero">
    <div class="row between"><span class="hdr">Savings · goal ${yen(mp.goal)}</span><span class="mono small muted">${Math.round(mp.savePct * 100)}%</span></div>
    <div class="dm big2" style="margin-top:6px">${yen(mp.bank)}</div>
    <div class="bar thick"><i style="width:${mp.savePct * 100}%;background:var(--sys)"></i></div>
    <div class="row between small muted"><span>${yen(mp.goal - mp.bank)} to go</span><span>save ${yen(mp.saveWeek)} / week</span></div>
    <div class="row between" style="margin-top:14px"><span class="hdr">Debt left</span><b class="mono">${yen(mp.debt)}</b></div>
    <div class="segbar">${[...Array(segs)].map((_, i) => `<i class="${i < filled ? "f" : ""}"></i>`).join("")}</div>
    <div class="row between small muted"><span>${yen(mp.debtStart - mp.debt)} paid of ${yen(mp.debtStart)}</span><span>pay ${yen(mp.debtWeek)} / week</span></div>
    <p class="tiny muted" style="margin-top:8px">${Math.round(mp.weeks)} weeks to graduation. Both need about ${yen(mp.saveWeek + mp.debtWeek)} a week.</p>
  </div>

  <button class="panel row between" style="width:100%;text-align:left" data-act="go" data-id="money/rewards">
    <div class="grow"><div class="small muted">Rewards shop</div><b>${E.xpWallet().toLocaleString("en-US")} XP · ${yen(E.funBudget().left)} fun budget</b>
      <div class="small muted">${(() => { const w = E.xpWallet(), f = E.funBudget().left, r = live("wishlist").filter(x => !x.bought && w >= E.xpPrice(x) && f >= x.price).length; return r ? `${r} wishlist item${r === 1 ? "" : "s"} unlocked` : `${live("wishlist").filter(x => !x.bought).length} on the wishlist`; })()} · purchasing power ×${E.xpPower().toFixed(2)}</div></div>
    <span class="chev">${ic("right")}</span></button>

  ${due ? "" : fold("money-update", `<b class="grow">Update this week's numbers</b>`, form)}
  ${rs.length > 1 ? fold("money-trend", `<b class="grow">Trend</b><span class="small muted">${rs.length} reports</span>`, `${moneyChart()}
    <div class="legend"><span><i style="background:var(--mag)"></i>Bank</span><span><i style="background:var(--org)"></i>Debt</span><span><i style="background:var(--dim)"></i>Pace to goal</span></div>`, true) : ""}

  ${fold("money-bills", `<b class="grow">Bills and insurance</b><span class="small ${unpaid.length && bl.length ? "warn" : "muted"}">${yen(E.billsMonthly())}/mo${unpaid.length && bl.length ? ` · ${unpaid.length} unpaid` : ""}</span>`, `
    ${bl.length ? bl.map(b => { const paid = !!(b.paid || {})[mk]; return `<div class="item row between">
      <button class="bx sm ${paid ? "on" : ""}" data-act="billpaid" data-id="${b.id}" aria-pressed="${paid}" aria-label="Paid ${esc(b.name)} this month">${paid ? ic("check") : ""}</button>
      <div class="grow"><b>${esc(b.name)}</b><div class="small muted">${b.kind === "insurance" ? "Insurance · " : ""}${b.freq === "year" ? "yearly" : "monthly"}${paid ? " · paid this month" : ""}</div></div>
      <input class="amt" type="number" inputmode="numeric" data-ch="billamt" data-id="${b.id}" value="${b.amount ?? ""}" placeholder="¥ amount" aria-label="${esc(b.name)} amount">
      <button class="btn sm danger" data-act="delbill" data-id="${b.id}" aria-label="Delete ${esc(b.name)}">${ic("x")}</button></div>`; }).join("") : `<p class="empty">No bills yet.</p>`}
    ${unpaid.length && bl.length ? `<p class="small muted" style="margin-top:6px">${unpaid.length} not marked paid for ${mk}. Tick a bill when you pay it.</p>` : ""}
    ${billForm ? `<div class="grid" id="billForm" style="margin-top:10px">
        <label class="f" style="flex-basis:100%">Name<input data-f="name" placeholder="e.g. Rent"></label>
        <label class="f">Amount (¥)<input type="number" inputmode="numeric" data-f="amount"></label>
        <label class="f">How often<select data-f="freq"><option value="month">Monthly</option><option value="year">Yearly</option></select></label>
        <label class="f">Type<select data-f="kind"><option value="bill">Bill</option><option value="insurance">Insurance</option></select></label></div>
      <div class="btns"><button class="btn go" data-act="addbill">Add</button><button class="btn" data-act="billform">Cancel</button></div>`
      : `<div class="btns"><button class="btn sm" data-act="billform">+ Bill</button></div>`}`, unpaid.length > 0 && bl.length > 0)}

  ${rs.length ? fold("money-hist", `<b class="grow">History</b><span class="small muted">${rs.length}</span>`, rs.map(r => `<div class="item row between"><span>${E.fmtDate(r.date)}</span><span class="mono small">bank ${yen(r.bank)} · debt ${yen(r.debt)}</span><button class="btn sm danger" data-act="delmoney" data-id="${r.id}" aria-label="Delete report">${ic("x")}</button></div>`).join("")) : ""}`;
}

/* ================= REWARDS (wishlist) ================= */
let wishForm = null; // null | "new" | id
function wishFormHtml(w) {
  w = w || { kind: "item" };
  return `<div class="panel" id="wishForm"><h3>${w.id ? "Edit" : "Add to wishlist"}</h3><div class="grid">
    <label class="f" style="flex-basis:100%">What<input data-f="name" value="${esc(w.name || "")}" placeholder="e.g. Uniqlo U coat, Osaka trip"></label>
    <label class="f">Price (¥)<input type="number" inputmode="numeric" data-f="price" value="${w.price ?? ""}"></label>
    <label class="f">XP cost<input type="number" inputmode="numeric" data-f="xp" value="${w.xp ?? ""}" placeholder="auto: ¥${S.settings.fun.yenPerXp} = 1 XP"></label>
    <label class="f">Type<select data-f="kind"><option value="item" ${w.kind === "item" ? "selected" : ""}>Item</option><option value="trip" ${w.kind === "trip" ? "selected" : ""}>Trip</option><option value="exp" ${w.kind === "exp" ? "selected" : ""}>Experience</option></select></label>
    <label class="f" style="flex-basis:100%">Link (optional)<input type="url" data-f="link" value="${esc(w.link || "")}"></label></div>
    <div class="btns"><button class="btn go" data-act="savewish" ${w.id ? `data-id="${w.id}"` : ""}>Save</button><button class="btn" data-act="wishform">Cancel</button>
      ${w.id ? `<button class="btn danger" data-act="delwish" data-id="${w.id}">Delete</button>` : ""}</div></div>`;
}
function vRewards() {
  const wallet = E.xpWallet(), fb = E.funBudget(), all = live("wishlist");
  const open = all.filter(w => !w.bought), got = all.filter(w => w.bought).sort((a, b) => b.bought.date.localeCompare(a.bought.date));
  const locked = St.openPenalties().length > 0, ready = w => !locked && wallet >= E.xpPrice(w) && fb.left >= w.price;
  const pct = w => Math.min(wallet / (E.xpPrice(w) || 1), fb.left / (w.price || 1), 1);
  open.sort((a, b) => ready(b) - ready(a) || pct(b) - pct(a));
  const icon = k => ic(k === "trip" ? "plane" : k === "exp" ? "star" : "gem", "inl");
  const editing = wishForm && wishForm !== "new" ? all.find(w => w.id === wishForm) : null;
  return `<button class="back" data-act="nav" data-id="money">${ic("left")} Store</button>
  <header class="top"><div><div class="hdr">Shop</div><h1>Rewards</h1></div></header>
  <div class="carousel">
    <div class="card g-mag"><span class="k">XP to spend</span><div><div class="dm big2">${wallet.toLocaleString("en-US")}</div><div class="small soft">${E.xpTotal().toLocaleString("en-US")} earned · ${E.xpSpent().toLocaleString("en-US")} spent · level unaffected</div></div></div>
    <div class="card g-cyan"><span class="k">Purchasing power</span><div><div class="dm big2">×${E.xpPower().toFixed(2)}</div><div class="small soft">LV ${E.level()}: every item costs ${Math.round((1 - 1 / E.xpPower()) * 100)}% less XP. +1% per level, up to ×2.</div></div></div>
    <div class="card g-org"><span class="k">Fun budget</span><div><div class="dm big2">${yen(fb.left)}</div><div class="small soft">${yen(fb.monthly)} / month, rolls over · ${yen(fb.spent)} spent</div></div></div>
  </div>
  ${penaltyBox()}
  ${wishForm === "new" ? wishFormHtml() : `<div class="btns"><button class="btn primary" data-act="wishform" data-id="new">+ Wishlist item</button></div>`}
  <h2>Wishlist <span class="n">${open.filter(ready).length} ready</span></h2>
  <div class="list">${open.map(w => {
    if (editing && editing.id === w.id) return wishFormHtml(w);
    const ok = ready(w), xpGap = Math.max(0, E.xpPrice(w) - wallet), yenGap = Math.max(0, w.price - fb.left);
    const wks = yenGap && fb.monthly ? Math.ceil(yenGap / fb.monthly) : 0;
    return `<div class="panel wish ${ok ? "ready" : ""}" style="margin-top:0">
      <div class="row between"><button class="tbtn grow" data-act="wishform" data-id="${w.id}"><b>${icon(w.kind)} ${esc(w.name)}</b>
        <div class="small muted">${yen(w.price)} · ${E.xpPrice(w).toLocaleString("en-US")} XP${E.xpPrice(w) < w.xp ? ` <s>${w.xp.toLocaleString("en-US")}</s>` : ""}${w.link ? ` · <a href="${esc(w.link)}" target="_blank" rel="noopener">link</a>` : ""}</div></button>
        ${ok ? `<button class="btn go sm" data-act="buywish" data-id="${w.id}">Buy</button>` : `<span class="lockbox">${ic("lock")}</span>`}</div>
      <div class="small muted" style="margin-top:8px">XP ${Math.min(wallet, E.xpPrice(w)).toLocaleString("en-US")}/${E.xpPrice(w).toLocaleString("en-US")}</div>${bar(wallet / E.xpPrice(w), "var(--mag)")}
      <div class="small muted">Budget ${yen(Math.max(0, Math.min(fb.left, w.price)))}/${yen(w.price)}</div>${bar(fb.left / w.price, "var(--org)")}
      ${ok ? `<div class="small" style="color:var(--lime)">Unlocked. You earned this.</div>` : `<div class="small muted">${[xpGap ? `${xpGap.toLocaleString("en-US")} XP to go` : "", yenGap ? `${yen(yenGap)} more budget (${wks} month${wks === 1 ? "" : "s"})` : ""].filter(Boolean).join(" · ")}</div>`}
    </div>`;
  }).join("") || `<p class="empty">Nothing on the wishlist. Add the things and trips you want, with real prices.</p>`}</div>
  ${got.length ? `<h2>Claimed <span class="n">${got.length}</span></h2><div class="panel">${got.map(w => `<div class="item row between"><div class="grow small"><b>${icon(w.kind)} ${esc(w.name)}</b><div class="muted">${E.fmtDate(w.bought.date)} · ${yen(w.bought.yen)} · ${w.bought.xp.toLocaleString("en-US")} XP</div></div>
    <button class="btn sm" data-act="unbuy" data-id="${w.id}">Undo</button></div>`).join("")}</div>` : ""}
  <p class="tiny muted">Budget settings: the gear on the Money screen.</p>`;
}

/* ================= SOCIAL ================= */
const ptype = k => PERSON_TYPES.find(x => x[0] === k) || PERSON_TYPES[2];
// Scores: 1–5, or -1 for "don't know" (shown as ?, left out of the average).
function rankOf(p) { return rankScores(p.scores); }
function rankScores(sc) {
  const crit = S.settings.social.criteria, v = crit.map(c => (sc || {})[c]).filter(x => x > 0); if (!v.length) return { r: "?", c: "dim", avg: null };
  const avg = v.reduce((a, b) => a + b, 0) / v.length, R = RANKS.find(([, min]) => avg >= min);
  return { r: R[0], c: R[2], avg };
}
const selfScores = () => S.settings.social.self || {};
// Rival ladder: the next opponent is the person ranked just above you. Match their average to clear them.
function ladder() {
  const me = rankScores(selfScores()), ppl = live("people").map(p => ({ p, rk: rankOf(p) })).filter(x => x.rk.avg != null);
  if (me.avg == null) return { me, ppl, cleared: [], ahead: [], opp: null };
  const cleared = ppl.filter(x => x.rk.avg <= me.avg).sort((a, b) => b.rk.avg - a.rk.avg);
  const ahead = ppl.filter(x => x.rk.avg > me.avg).sort((a, b) => a.rk.avg - b.rk.avg);
  return { me, ppl, cleared, ahead, opp: ahead[0] || null };
}
function gaps(opp) {
  const me = selfScores();
  return S.settings.social.criteria.map(c => ({ c, me: me[c] > 0 ? me[c] : null, them: (opp.p.scores || {})[c] > 0 ? opp.p.scores[c] : null }))
    .filter(g => g.them != null && (g.me == null || g.them > g.me)).map(g => ({ ...g, d: g.them - (g.me || 0) })).sort((a, b) => b.d - a.d);
}
function rivalBox() {
  const L = ladder(), s1 = n => n.toFixed(1);
  if (L.me.avg == null) return sysBox(`Rate yourself to start the rival ladder.`, "Score yourself on the same key you use for others. Your next opponent is the person ranked just above you; match their stats to clear them, then face the next.", `<div class="btns"><button class="btn sm primary" data-act="go" data-id="social/me">Rate yourself</button></div>`);
  if (!L.opp) return sysBox(`Ladder cleared. You're at or above everyone you've rated.`, `You: ${L.me.r} ${s1(L.me.avg)}. Add someone you look up to as your next opponent.`, `<div class="btns"><button class="btn sm" data-act="go" data-id="social/me">Re-rate yourself</button></div>`);
  const g = gaps(L.opp), o = L.opp;
  return `<div class="panel rival"><div class="row between"><span class="k">Next opponent</span><span class="mono small muted">${L.cleared.length} cleared · ${L.ahead.length} to go</span></div>
    <button class="q tbtn person" data-act="go" data-id="social/p/${o.p.id}" style="margin-top:8px">${badge(o.rk)}<div class="grow"><div class="t">${esc(o.p.name)}</div><div class="small muted">${s1(o.rk.avg)} vs your ${s1(L.me.avg)} · gap ${s1(o.rk.avg - L.me.avg)}</div></div><span class="chev">${ic("right")}</span></button>
    <div class="small" style="margin-top:8px">${g.length ? `Close the gap: ${g.slice(0, 3).map(x => `<b>${esc(x.c)}</b> ${x.me ?? "?"}→${x.them}`).join(" · ")}` : "No single stat behind; lift your average anywhere."}</div>
    <div class="btns"><button class="btn sm" data-act="go" data-id="social/me">Re-rate yourself</button></div>
    <p class="tiny muted">Re-rate yourself monthly, honestly. ${S.settings.social.selfAt ? `Last: ${E.fmtDate(S.settings.social.selfAt)}.` : ""}</p></div>`;
}
// One criterion row: 1–5, ? (don't know), and a fold-out key on how to read it.
function critRow(c, v, id) {
  const k = SOCIAL_KEY[c];
  return `<div class="item"><div class="row between"><b>${esc(c)}</b><span class="mono small muted">${v > 0 ? v + "/5" : v === -1 ? "don't know" : "–"}</span></div>
    <div class="seg" style="margin-top:6px">${[1, 2, 3, 4, 5].map(n => `<button data-act="score" data-id="${id}" data-c="${esc(c)}" data-n="${n}" aria-pressed="${v === n}">${n}</button>`).join("")}<button data-act="score" data-id="${id}" data-c="${esc(c)}" data-n="-1" aria-pressed="${v === -1}" aria-label="Don't know">?</button></div>
    ${k ? `<details class="key"><summary>Key</summary><p class="small soft">${esc(k.read)}</p><ol class="small">${k.lv.map((t, i) => `<li><b>${i + 1}</b> ${esc(t)}</li>`).join("")}</ol><p class="tiny muted">Not seen enough to judge? Tap ?. It doesn't count toward the rank.</p></details>` : ""}</div>`;
}
function vSelf() {
  const sc = selfScores(), rk = rankScores(sc);
  return `<button class="back" data-act="nav" data-id="social">${ic("left")} People</button>
  <div class="row" style="gap:14px;margin:6px 0 4px">${badge(rk, true)}<div><h1>You</h1><div class="small muted">${rk.avg ? `${rk.avg.toFixed(1)} avg` : "unrated"} · same key as everyone else</div></div></div>
  <p class="small muted">Rate where you are today, not where you want to be. Ask a friend if unsure.</p>
  <h2>Assessment</h2><div class="panel">${S.settings.social.criteria.map(c => critRow(c, sc[c] || 0, "me")).join("")}</div>`;
}
const lastSeen = id => live("hangouts").filter(h => (h.people || []).includes(id)).reduce((a, h) => h.date > a ? h.date : a, "");
// v2.4: no more "overdue for a catch-up" reminders (Arin's call). p.every stays in the data, unused.
function personState(p) {
  const ls = lastSeen(p.id), since = ls ? E.daysBetween(ls, E.today()) : null;
  return { ls, since };
}
const badge = (rk, big) => `<span class="rank ${big ? "big" : ""}" style="--c:var(--${rk.c})">${rk.r}</span>`;
let personForm = false, hangSel = null;

function vSocial([sub, id]) {
  if (sub === "p" && id) return vPerson(id);
  if (sub === "me") return vSelf();
  sub = sub || "people";
  if (sub === "log") return `<button class="back" data-act="nav" data-id="social">${ic("left")} People</button><h1>Hangouts</h1>${vHangouts()}`;
  return `${planHead("people")}${vPeople()}<button class="quiet-row" data-act="go" data-id="social/log"><span class="grow">Hangout log</span><span class="chev">${ic("right")}</span></button>`;
}
function balance() {
  const t = E.today(), hs = live("hangouts").filter(h => E.daysBetween(h.date, t) < 30), ppl = Object.fromEntries(live("people").map(p => [p.id, p]));
  const partnerOnly = hs.filter(h => (h.people || []).length && h.people.every(id => ppl[id] && ppl[id].type === "partner")).length;
  return { total: hs.length, partnerOnly, others: hs.length - partnerOnly };
}
function personFormHtml() {
  return `<h3>New person</h3><div id="personForm"><div class="grid">
      <label class="f" style="flex-basis:100%">Name<input data-f="name" placeholder="Name or nickname"></label>
      <label class="f">Type<select data-f="type">${PERSON_TYPES.map(([k, l]) => `<option value="${k}" ${k === "friend" ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="f">Where you met<input data-f="where" placeholder="optional"></label></div>
    <div class="btns"><button class="btn go" data-act="addperson">Add and rate</button><button class="btn" data-act="sheet">Cancel</button></div></div>`;
}
function vPeople() {
  const ppl = live("people").map(p => ({ p, st: personState(p), rk: rankOf(p) }));
  ppl.sort((a, b) => ("SABCDE?".indexOf(a.rk.r) - "SABCDE?".indexOf(b.rk.r)) || a.p.name.localeCompare(b.p.name));
  const bl = balance();
  const counts = RANKS.map(([r, , c]) => [r, c, ppl.filter(x => x.rk.r === r).length]);
  return `
  ${rivalBox()}
  <div class="panel">
    <div class="row between"><span class="k">Last 30 days</span><span class="mono small muted">${bl.total} hangouts</span></div>
    <div class="row between" style="margin-top:6px"><div><div class="dm big2">${bl.others}</div><div class="small muted">with friends and others</div></div>
      <div style="text-align:right"><div class="dm big2">${bl.partnerOnly}</div><div class="small muted">only with your partner</div></div></div>
    ${bl.total >= 3 && bl.partnerOnly / bl.total > 0.7 ? `<p class="small warn" style="margin-top:8px">Over 70% of your time out is just the two of you. Book one friend this week.</p>` : ""}
    <div class="chips" style="margin-top:10px">${counts.map(([r, c, n]) => `<span class="chip" style="min-height:0;padding:3px 10px">${badge({ r, c })} ${n}</span>`).join("")}</div>
  </div>
  <div class="list" style="margin-top:12px">${ppl.map(({ p, st, rk }) => `<button class="q tbtn person" data-act="go" data-id="social/p/${p.id}">
      ${badge(rk)}<div class="grow"><div class="t">${esc(p.name)}</div>
      <div class="small muted">${esc(ptype(p.type)[1])} · ${st.since === null ? "never logged" : st.since === 0 ? "seen today" : `seen ${st.since}d ago`}</div></div><span class="chev">${ic("right")}</span></button>`).join("") || `<p class="empty">Nobody registered yet. Add the people you want to keep close, or keep an eye on.</p>`}</div>
  ${tip("people-rank", "Rank is the average of your scores (? left out): S 4.5+, A 3.8+, B 3.0+, C 2.2+, D 1.5+, E below. Each score has a Key on the person's page. It's your private read, not a verdict on them.")}`;
}
function vPerson(id) {
  const p = live("people").find(x => x.id === id);
  if (!p) return `<button class="back" data-act="nav" data-id="social">${ic("left")} People</button><p class="empty">Not found.</p>`;
  const rk = rankOf(p), st = personState(p), crit = S.settings.social.criteria;
  const hs = live("hangouts").filter(h => (h.people || []).includes(id)).sort((a, b) => b.date.localeCompare(a.date));
  return `<button class="back" data-act="nav" data-id="social">${ic("left")} People</button>
  <div class="row" style="gap:14px;margin:6px 0 4px">${badge(rk, true)}<div><h1>${esc(p.name)}</h1><div class="small muted">${esc(ptype(p.type)[1])}${rk.avg ? ` · ${rk.avg.toFixed(1)} avg` : " · unrated"}</div></div></div>
  <h2>Assessment</h2>
  <div class="panel">${crit.map(c => critRow(c, (p.scores || {})[c] || 0, p.id)).join("")}</div>
  <h2>Hangouts</h2>
  <div class="panel"><div class="grid">
    <label class="f">Type<select data-ch="ptype" data-id="${p.id}">${PERSON_TYPES.map(([k, l]) => `<option value="${k}" ${p.type === k ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
    <p class="small muted" style="margin-top:8px">${st.since === null ? "No hangouts logged yet." : `Last seen ${E.fmtDate(st.ls)} (${st.since}d ago).`}</p>
    <div class="btns"><button class="btn go" data-act="hangwith" data-id="${p.id}">Log a hangout with ${esc(p.name)}</button></div></div>
  <h2>Notes</h2>
  <div class="panel"><label class="f">Where you met<input data-ch="pwhere" data-id="${p.id}" value="${esc(p.where || "")}"></label>
    <label class="f" style="margin-top:8px">Notes (birthday, interests, what you talked about)<textarea data-ch="pnote" data-id="${p.id}" rows="4">${esc(p.note || "")}</textarea></label></div>
  <h2>History <span class="n">${hs.length}</span></h2>
  <div class="panel">${hs.map(h => `<div class="item small"><b>${E.fmtDate(h.date)}</b> ${esc(h.what || "")}${h.note ? `<div class="muted">${esc(h.note)}</div>` : ""}</div>`).join("") || `<p class="empty">Nothing yet.</p>`}</div>
  <div class="btns"><button class="btn danger" data-act="delperson" data-id="${p.id}">Delete ${esc(p.name)}</button></div>`;
}
function vHangouts() {
  const ppl = live("people").sort((a, b) => (a.type === "partner" ? -1 : 0) - (b.type === "partner" ? -1 : 0) || a.name.localeCompare(b.name));
  const sel = new Set(hangSel || []), byId = Object.fromEntries(ppl.map(p => [p.id, p]));
  const hs = live("hangouts").sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="panel" id="hangForm">
    <div class="small muted">Who</div>
    <div class="chips" id="hpeople">${ppl.map(p => `<button class="chip" data-act="bday" data-id="${p.id}" aria-pressed="${sel.has(p.id)}">${esc(p.name)}</button>`).join("") || `<span class="small muted">Add people first.</span>`}</div>
    <div class="grid" style="margin-top:10px">
      <label class="f">Date<input type="date" data-f="date" value="${E.today()}"></label>
      <label class="f">What<input data-f="what" placeholder="e.g. Izakaya, study, date night"></label>
      <label class="f" style="flex-basis:100%">Note<input data-f="note" placeholder="optional"></label></div>
    <div class="btns"><button class="btn go" data-act="addhang">Log hangout</button></div></div>
  <h2>History <span class="n">${hs.length}</span></h2>
  <div class="panel">${hs.map(h => `<div class="item row between"><div class="grow small"><b>${E.fmtDate(h.date)}</b> ${esc(h.what || "")}<div class="muted">${(h.people || []).map(id => byId[id] ? esc(byId[id].name) : "?").join(", ")}${h.note ? " · " + esc(h.note) : ""}</div></div>
    <button class="btn sm danger" data-act="delhang" data-id="${h.id}" aria-label="Delete hangout">${ic("x")}</button></div>`).join("") || `<p class="empty">No hangouts logged.</p>`}</div>
  <details class="panel"><summary>Rating criteria</summary>
    <p class="small muted">One per line. Renaming one drops its old scores.</p>
    <textarea data-ch="criteria" rows="6">${esc(S.settings.social.criteria.join("\n"))}</textarea></details>`;
}

/* ================= COMMAND BAR ================= */
// Type or say a change; the System shows what it understood and nothing is saved until Apply.
const cmd = { text: "", prop: null, done: null, undo: null, listening: false };
const dayName = d => d === E.today() ? "today" : d === E.addDays(E.today(), 1) ? "tomorrow" : P.DAY_NAMES[E.parse(d).getDay()] + " " + E.parse(d).getDate();
// Blocks that would overlap a proposed time on a date (the moved block itself excluded).
function clashNote(date, start, end, except) {
  const s = P.toMin(start); let e = P.toMin(end); if (e <= s) e += 1440;
  const hit = P.segments(date).filter(g => g.b.id !== except && g.b.from !== except && g.s < e && s < g.e);
  return hit.length ? `<div class="small warn" style="margin-top:8px">Overlaps ${hit.map(g => `${esc(g.b.title)} ${P.toHM(g.s)}–${P.toHM(g.e)}`).join(", ")}</div>` : "";
}
function cmdCard(p) {
  if (!p) return "";
  if (p.error) return sysBox(esc(p.error), p.hint ? `Try: “${esc(p.hint)}”` : "");
  const time = (f, v) => `<label class="f">${f === "start" ? "Start" : "End"}<input type="time" data-f="${f}" value="${esc(v)}"></label>`;
  let body = "", title = "";
  if (p.type === "move") {
    const b = p.block, DN = P.DAY_NAMES[E.parse(p.date).getDay()];
    title = `Move ${esc(b.title)}`;
    body = `<div class="small muted">Now ${esc(b.start)}–${esc(b.end)}${b.locked ? ` · <span class="warn">${ic("lock", "inl")} locked block</span>` : ""}</div>
      <div class="grid" style="margin-top:8px">${time("start", p.start)}${time("end", p.end)}</div>${clashNote(p.date, p.start, p.end, b.id)}
      ${p.weekly ? `<div class="chips" style="margin-top:10px"><button class="chip" data-act="cmdscope" data-id="day" aria-pressed="${p.scope === "day"}">Only ${esc(dayName(p.date))}</button><button class="chip" data-act="cmdscope" data-id="week" aria-pressed="${p.scope === "week"}">Every ${DN}</button></div>` : `<div class="small muted" style="margin-top:8px">${esc(E.fmtDate(p.date))}</div>`}`;
  } else if (p.type === "block") {
    title = "Add to timetable";
    body = `<div class="grid"><label class="f" style="flex-basis:100%">Name<input data-f="title" value="${esc(p.title)}"></label>
      <label class="f">Type<select data-f="kind">${Object.entries(P.KINDS).map(([k, v]) => `<option value="${k}" ${p.kind === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></label>
      ${p.days.length ? `<label class="f">Every<input readonly value="${P.DAY_NAMES[p.days[0]]}"></label>` : `<label class="f">Date<input type="date" data-f="date" value="${esc(p.date)}"></label>`}
      ${time("start", p.start)}${time("end", p.end)}</div>${p.date ? clashNote(p.date, p.start, p.end) : ""}`;
  } else if (p.type === "task") {
    title = "Add to-do";
    body = `<div class="grid"><label class="f" style="flex-basis:100%">Task<input data-f="title" value="${esc(p.title)}"></label>
      <label class="f">Length<select data-f="mins">${P.TASK_LEN.map(m => `<option value="${m}" ${p.mins === m ? "selected" : ""}>${P.dur(m)}</option>`).join("")}</select></label>
      <label class="f">Energy<select data-f="energy"><option value="high" ${p.energy === "high" ? "selected" : ""}>Focus</option><option value="low" ${p.energy === "low" ? "selected" : ""}>Light</option></select></label>
      <label class="f">Due (optional)<input type="date" data-f="due" value="${esc(p.due || "")}"></label></div>
      <div class="small muted" style="margin-top:8px">The planner picks the slot.</div>`;
  } else if (p.type === "card") {
    title = "Add flashcard";
    body = `<div class="grid"><label class="f" style="flex-basis:100%">Front<input data-f="front" value="${esc(p.front)}"></label>
      <label class="f" style="flex-basis:100%">Back<input data-f="back" value="${esc(p.back)}"></label>
      <label class="f" style="flex-basis:100%">Deck<input data-f="deck" list="dl-cmd" value="${esc(lastDeck())}"></label>${deckList("dl-cmd")}</div>`;
  } else if (p.type === "wish") {
    title = "Add to wishlist";
    body = `<div class="grid"><label class="f" style="flex-basis:100%">What<input data-f="name" value="${esc(p.name)}"></label>
      <label class="f">Price (¥)<input type="number" inputmode="numeric" data-f="price" value="${p.price ?? ""}" placeholder="needed"></label>
      <label class="f">Type<select data-f="kind">${[["item", "Item"], ["trip", "Trip"], ["exp", "Experience"]].map(([k, l]) => `<option value="${k}" ${p.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="f" style="flex-basis:100%">Link${p.shop ? ` (${esc(p.shop)} search)` : ""}<input type="url" data-f="link" value="${esc(p.link)}"></label></div>
      <div class="small muted" style="margin-top:8px">${p.price ? `Costs ${E.suggestXp(p.price).toLocaleString("en-US")} XP at ¥${S.settings.fun.yenPerXp} per XP.` : "Add the price and the XP cost is set from it."}</div>`;
  }
  return `<div class="panel" id="cmdCard"><div class="hdr">System · Confirm</div><h3>${title}</h3>${body}
    <div class="btns"><button class="btn go" data-act="cmdapply">Apply</button><button class="btn" data-act="cmdcancel">Cancel</button></div></div>`;
}
function vCmd() {
  const mic = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  return `<button class="back" data-act="nav" data-id="home">${ic("left")} System</button>
  <header class="top"><div><div class="hdr">Command</div><h1>Tell the System</h1></div></header>
  <div class="panel cmdbar"><div class="row" style="gap:8px">
    <input data-cmd value="${esc(cmd.text)}" placeholder="move the gym up an hour" enterkeyhint="go" autocomplete="off" autocapitalize="off">
    ${mic ? `<button class="rbtn ${cmd.listening ? "live" : ""}" data-act="cmdmic" aria-label="${cmd.listening ? "Stop listening" : "Speak a command"}">${ic("mic")}</button>` : ""}
    <button class="btn go" data-act="cmdrun">Run</button></div>
    ${mic ? "" : `<p class="tiny muted" style="margin:8px 0 0">To speak, tap the mic on your keyboard.</p>`}</div>
  ${cmd.done ? sysBox(esc(cmd.done), "", cmd.undo ? `<div class="btns"><button class="btn sm" data-act="cmdundo">Undo</button></div>` : "") : ""}
  ${cmdCard(cmd.prop)}
  <h2>Things it understands</h2>
  <div class="list">${C.EXAMPLES.map(x => `<button class="panel tbtn small cmdex" style="margin:0;text-align:left;width:100%" data-act="cmdex" data-id="${esc(x)}">${ic("cmd", "inl")}<span>${esc(x)}</span></button>`).join("")}</div>
  <p class="tiny muted">Works offline with set phrasings: move, push, add, add task, add … to my wishlist, card front | back. Add “every week” to change a weekly block for good; otherwise only that day moves.</p>`;
}
function cmdRun(text) {
  cmd.text = text; cmd.prop = C.parse(text); cmd.done = null; render();
  $("#cmdCard input")?.focus({ preventScroll: true });
}
function cmdApply() {
  const p = cmd.prop; if (!p || p.error) return;
  const f = readForm("#cmdCard"), undo = [];
  const keep = (k, id) => { const old = live(k).find(x => x.id === id); undo.push({ k, id, old: old ? JSON.parse(JSON.stringify(old)) : null }); };
  const add = (k, rec) => { const r = put(k, rec); undo.push({ k, id: r.id, old: null }); return r; };
  let msg;
  if (p.type === "move") {
    if (!f.start || !f.end || f.start === f.end) return toast("Set a start and an end");
    const b = live("blocks").find(x => x.id === p.block.id); if (!b) return toast("That block is gone");
    if ((p.date === E.today() || p.scope !== "day") && P.editLock(b)) return toast(`Locked: ${b.title} starts within ${S.settings.plan.lockMins ?? 15} min or is running`);
    keep("blocks", b.id);
    if (p.weekly && p.scope === "day") {
      put("blocks", { ...b, skip: [...new Set([...(b.skip || []), p.date])].filter(d => d >= E.addDays(E.today(), -60)) });
      add("blocks", { title: b.title, kind: b.kind, days: [], date: p.date, start: f.start, end: f.end, locked: b.locked, from: b.id });
      msg = `${b.title} moved to ${f.start}–${f.end} ${dayName(p.date)} only.`;
    } else { put("blocks", { ...b, start: f.start, end: f.end }); msg = `${b.title} now ${f.start}–${f.end}${p.weekly ? " every week" : ""}.`; }
  } else if (p.type === "block") {
    if (!f.title) return toast("Name the block"); if (!f.start || !f.end || f.start === f.end) return toast("Set a start and an end");
    add("blocks", { title: f.title, kind: f.kind, days: p.days, date: p.days.length ? null : f.date || E.today(), start: f.start, end: f.end, locked: false });
    msg = `${f.title} added, ${p.days.length ? "every " + P.DAY_NAMES[p.days[0]] : dayName(f.date || E.today())} ${f.start}–${f.end}.`;
  } else if (p.type === "task") {
    if (!f.title) return toast("Name the task");
    const k = add("tasks", { title: f.title, mins: +f.mins, prio: f.due ? 3 : 2, energy: f.energy, due: f.due || null, done: false, created: Date.now(), pin: null });
    const at = P.plan().at.get(k.id);
    msg = `${f.title}: ${at ? `planned ${dayName(at.date)} ${P.toHM(at.s)}${at.late ? " (after deadline)" : ""}` : "no free slot in the next 2 weeks"}.`;
  } else if (p.type === "card") {
    if (!f.front || !f.back) return toast("Fill in both sides"); const deck = f.deck || lastDeck();
    if (K.inDeck(deck).some(c => c.front.trim() === f.front)) return toast("Already in " + deck);
    add("cards", K.newCard({ deck, front: f.front, back: f.back })); setLastDeck(deck);
    msg = `Card added to ${deck}.`;
  } else if (p.type === "wish") {
    const price = num(f.price); if (!f.name) return toast("Name it"); if (price === null || price < 0) return toast("Add the price");
    const xp = E.suggestXp(price);
    add("wishlist", { name: f.name, price: Math.round(price), xp, kind: f.kind, link: f.link, bought: null });
    msg = `${f.name} on the wishlist: ${yen(price)}, ${xp.toLocaleString("en-US")} XP.`;
  }
  save(); cmd.prop = null; cmd.text = ""; cmd.done = msg; cmd.undo = undo; toast("Applied"); render();
}
let recog = null;
function cmdMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return toast("Use the mic on your keyboard");
  if (recog) { recog.stop(); return; }
  recog = new SR(); recog.lang = "en-US"; recog.interimResults = false; recog.maxAlternatives = 1;
  recog.onresult = e => { const t = e.results[0][0].transcript; recog = null; cmd.listening = false; cmdRun(t); };
  recog.onerror = e => { toast(e.error === "not-allowed" ? "Microphone not allowed" : "Didn't hear that"); };
  recog.onend = () => { recog = null; if (cmd.listening) { cmd.listening = false; render(); } };
  cmd.listening = true; render(); recog.start();
}

/* ================= PLAN ================= */
let planDate = null, taskForm = null, blockForm = null, blockNew = null;
const kindChip = k => { const K = P.KINDS[k] || P.KINDS.other; return `<span class="kchip" style="--c:var(--${K.c})">${esc(K.label)}</span>`; };
const span = (s, e) => `${P.toHM(s)}–${P.toHM(e)}`;
const dayLabel = d => d === E.today() ? "Today" : d === E.addDays(E.today(), 1) ? "Tomorrow" : E.fmtDate(d);

const planHead = cur => `<header class="top"><div><div class="hdr">${esc(E.fmtDate(E.today()))}</div><h1>Plan</h1></div>
    <div class="row" style="gap:8px"><button class="rbtn" data-act="nav" data-id="cmd" aria-label="Command bar">${ic("cmd")}</button>${gear("plan")}</div></header>
  <div class="pills">${[["plan", "Day"], ["plan/week", "Week"], ["social", "People"]].map(([k, l]) => `<button class="pill" data-act="go" data-id="${k}" aria-pressed="${cur === l.toLowerCase()}">${l}</button>`).join("")}</div>`;
function vPlan([sub]) {
  sub = sub === "week" ? "week" : "day";
  return planHead(sub) + (sub === "week" ? vWeek() : vDay());
}

function agendaRows(date, p) {
  const n = new Date(), nm = n.getHours() * 60 + n.getMinutes(), isToday = date === E.today();
  let marked = !isToday;
  const rows = P.agenda(date, p).map(r => {
    let pre = "";
    if (!marked && r.s > nm) { marked = true; pre = `<div class="nowline"><span>now ${P.toHM(nm)}</span></div>`; }
    if (r.type === "wind") return pre + `<div class="ag wind"><div class="tm">${P.toHM(r.s)}</div><div class="grow"><b>Wind down</b><div class="small muted">Screens off, shower, prep tomorrow. Bed at ${P.toHM(r.w.bed)}.</div></div></div>`;
    if (r.type === "task") return pre + `<div class="ag task ${r.at.late ? "late" : ""} ${r.k.penalty ? "pen" : ""}"><div class="tm">${span(r.s, r.e)}</div>
      <button class="grow tbtn" data-act="sheet" data-id="task:${r.k.id}"><b>${esc(r.k.title)}</b><div class="small muted">${P.dur(r.k.mins)}${r.k.energy === "high" ? " · focus" : ""}${r.k.due ? ` · due ${E.fmtDate(r.k.due)}` : ""}${r.at.late ? ` · <span class="warn">after deadline</span>` : ""}${r.at.pinned ? ` · ${ic("pin", "inl")}pinned` : ""}</div></button>
      <button class="bx sm" data-act="taskdone" data-id="${r.k.id}" aria-label="Done: ${esc(r.k.title)}"></button></div>`;
    const b = r.b, thin = ["sleep", "nap", "work"].includes(b.kind) || b.locked, cur = isToday && r.s <= nm && nm < r.e;
    if (thin) return pre + `<button class="ag blk thin tbtn k-${esc(b.kind)} ${cur ? "cur" : ""}" style="--c:var(--${(P.KINDS[b.kind] || P.KINDS.other).c})" data-act="blockform" data-id="${b.id}"><div class="tm">${r.tail ? ic("arrow", "inl") + P.toHM(r.e) : span(r.s, r.cont ? P.toMin(b.end) : r.e)}</div><div class="grow small">${esc(b.title)} ${b.locked ? `<span class="lk" aria-label="locked">${ic("lock")}</span>` : ""}</div></button>`;
    return pre + `<button class="ag blk tbtn k-${esc(b.kind)} ${cur ? "cur" : ""}" style="--c:var(--${(P.KINDS[b.kind] || P.KINDS.other).c})" data-act="blockform" data-id="${b.id}"><div class="tm">${r.tail ? ic("arrow", "inl") + P.toHM(r.e) : span(r.s, r.cont ? P.toMin(b.end) : r.e)}</div>
      <div class="grow"><b>${esc(b.title)}</b><div class="small muted">${kindChip(b.kind)}${r.tail ? " · from last night" : ""}</div>${r.tail ? "" : topicLine(b)}</div></button>`;
  });
  if (!marked) rows.push(`<div class="nowline"><span>now ${P.toHM(nm)}</span></div>`);
  return rows.join("") || `<p class="empty">Nothing on this day.</p>`;
}

// Day: one timeline (blocks, tasks, wind-down, now-line). Swipe or use the arrows to change day. Unplaced tasks sit in the Backlog.
function vDay() {
  const t = E.today(), d = planDate || t, p = P.plan();
  const rows = P.agenda(d, p), tasksMin = rows.filter(r => r.type === "task").reduce((a, r) => a + (r.e - r.s), 0);
  const wd = P.windDownNow(), min = E.addDays(t, -7), max = E.addDays(t, 13);
  const backlog = live("tasks").filter(k => !k.done && !p.at.get(k.id)).sort((a, b) => !!b.penalty - !!a.penalty || b.prio - a.prio);
  const done = live("tasks").filter(k => k.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 20);
  const taskRow = k => `<div class="q ${k.penalty ? "pen-q" : ""}"><button class="bx" data-act="taskdone" data-id="${k.id}" aria-label="Done: ${esc(k.title)}"></button>
    <button class="grow tbtn" data-act="sheet" data-id="task:${k.id}"><div class="t">${esc(k.title)}</div><div class="small muted">${P.dur(k.mins)}${k.due ? ` · due ${E.fmtDate(k.due)}` : ""} · no free slot in 2 weeks</div></button><span></span></div>`;
  return `${wd && d === t ? sysBox(`Wind-down time. Bed at ${P.toHM(wd.bed)}.`, "Screens off, shower, set out tomorrow's clothes. The day is done.") : ""}
  <div class="dayhead"><button class="rbtn" data-act="pday" data-id="${E.addDays(d, -1)}" ${d <= min ? "disabled" : ""} aria-label="Previous day">${ic("left")}</button>
    <button class="tbtn grow" data-act="pday" data-id="${t}"><b>${esc(dayLabel(d))}</b><div class="small muted">${d === t ? E.fmtDate(d) + " · " : ""}${tasksMin ? P.dur(tasksMin) + " of tasks" : "no tasks planned"}</div></button>
    <button class="rbtn" data-act="pday" data-id="${E.addDays(d, 1)}" ${d >= max ? "disabled" : ""} aria-label="Next day">${ic("right")}</button></div>
  <div class="panel agenda" id="dayline" data-min="${min}" data-max="${max}">${agendaRows(d, p)}</div>
  ${tip("plan-day", "Tasks fill free gaps by deadline, then priority, and re-plan whenever something changes. Tap a task to pin, move or edit it; tap a block to edit it. Swipe to change day.")}
  ${fold("backlog", `<b class="grow">Backlog</b><span class="small ${backlog.length ? "warn" : "muted"}">${backlog.length}</span>`, `<div class="list">${backlog.map(taskRow).join("") || `<p class="empty">Every task has a slot.</p>`}</div>`, backlog.length > 0)}
  ${done.length ? fold("done-tasks", `<b class="grow">Done</b><span class="small muted">${done.length}</span>`, done.map(k => `<div class="item row between"><span class="small grow">${esc(k.title)} <span class="muted">· ${E.fmtDate(E.ymd(new Date(k.doneAt || Date.now())))}</span></span><button class="btn sm" data-act="taskundo" data-id="${k.id}">Undo</button></div>`).join("")) : ""}`;
}

/* ================= DUNGEON ================= */
// Stat building, gated by quest blocks: the Body dungeon (lifting, runs, calisthenics) and the Study dungeon
// (topic + pomodoro, then flashcards, then JLPT practice). Each opens only around its block; skipping costs XP.
function gateCard(kind, g) {
  const isBody = kind === "body", nx = g.next, o = isBody ? (g.block ? { b: g.block, s: g.s, e: g.e } : null) : g.o;
  const title = isBody ? "Body dungeon" : "Study dungeon", sub = isBody ? "Lifting · runs · calisthenics" : "Topic · flashcards · JLPT";
  const state = g.open ? (o ? `Open now · ${esc(o.b.title)} ${span(o.s, o.e)}` : "Open for today") : nx ? `Opens ${nx.date === E.today() ? "today" : nx.date === E.addDays(E.today(), 1) ? "tomorrow" : esc(dayLabel(nx.date))} at ${P.toHM(nx.s)} · ${esc(nx.b.title)}` : "No block this week";
  const btn = g.open ? `<button class="btn ${isBody || !g.ended ? "go" : "primary"}" data-act="nav" data-id="${isBody ? "train" : "focus"}">${!isBody && g.ended ? "Report" : "Enter"}</button>`
    : `<button class="btn sm" data-act="nav" data-id="${isBody ? "train" : "focus"}">Peek</button>`;
  const b = o ? o.b : nx ? nx.b : null;
  return `<div class="panel dgate ${g.open ? "open" : ""}"><div class="row between"><div class="grow"><span class="k">${sub}</span><h3 style="margin:2px 0 4px">${title}</h3>
    <div class="small ${g.open ? "" : "muted"}">${g.open ? "" : ic("lock", "inl")}${state}</div>${!isBody && b ? topicLine(b) : ""}</div>${btn}</div></div>`;
}
function vDungeon() {
  const t = E.today(), bg = P.trainGate(started(t)), sg = St.focusGate(), pens = St.openPenalties();
  return `<header class="top"><div><button class="back" data-act="nav" data-id="home">${ic("left")} System</button><h1>Dungeon</h1></div>${gear("dungeon")}</header>
  ${pens.length ? penaltyBox() : ""}
  ${gateCard("body", bg)}${gateCard("study", sg)}
  ${tip("dungeon", `Each dungeon opens ${S.settings.plan.openPad ?? 10} min before its quest block. Do the work inside the block, or it counts as skipped: −${S.settings.study.penaltyXp ?? 30} XP and a make-up quest.`)}
  <div class="quiet-links"><button data-act="go" data-id="cards">Flashcards${K.queue().length ? " · " + K.queue().length + " due" : ""}</button><button data-act="go" data-id="jlpt">JLPT ladder</button><button data-act="go" data-id="study">Study topics</button><button data-act="go" data-id="train/runs">Runs</button><button data-act="go" data-id="train/pick/browse">Exercise library</button></div>`;
}

let topicEdit = null; // subject whose topic list is open for editing
function vStudyPage() {
  return `<header class="top"><div><button class="back" data-act="nav" data-id="dungeon">${ic("left")} Dungeon</button><h1>Study topics</h1></div>${gear("dungeon")}</header>${vStudy()}`;
}
function vStudy() {
  const sst = S.settings.study, fg = St.focusGate();
  const subj = Object.keys(SUBJECTS).map(k => {
    const L = St.topics(k), cur = St.current(k), done = L.filter(t => St.progress(k, t.id) >= 100).length;
    if (topicEdit === k) return `<div class="panel"><h3>${esc(SUBJECTS[k].name)} topics</h3>
      <p class="tiny muted">One per line, in the order you'll do them: Title | what to do | what you end with. Keep a title the same and its progress stays.</p>
      <textarea data-f="topics" rows="14" style="font-size:13px">${esc(St.topicsText(k))}</textarea>
      <div class="btns"><button class="btn go" data-act="savetopics" data-id="${k}">Save</button><button class="btn" data-act="topicedit">Cancel</button>${sst.topics && sst.topics[k] ? `<button class="btn danger" data-act="resettopics" data-id="${k}">Back to the built-in list</button>` : ""}</div></div>`;
    return `<div class="panel"><div class="row between"><h3>${esc(SUBJECTS[k].name)}</h3><span class="small muted">${done}/${L.length} done</span></div>${bar(done / (L.length || 1), "var(--sys)")}
      <div class="small" style="margin-top:8px">${cur ? `Now: <b>${esc(cur.t)}</b> · ${St.progress(k, cur.id)}%` : "All done."}</div>
      <details style="margin-top:8px"><summary class="small">All topics</summary>${L.map((t, i) => { const pr = St.progress(k, t.id);
        return `<div class="item row between small ${t === cur ? "cur" : ""}"><span class="grow">${i + 1}. ${esc(t.t)}</span><span class="${pr >= 100 ? "" : "muted"}">${pr >= 100 ? ic("check", "inl") : pr + "%"}</span></div>`; }).join("")}</details>
      <div class="btns"><button class="btn sm" data-act="topicedit" data-id="${k}">Edit list</button></div>
      <p class="tiny muted">Blocks named like "${esc(SUBJECTS[k].match.split("|")[0])}…" use this list.</p></div>`;
  }).join("");
  const logs = live("blockLog").filter(r => r.final).sort((a, b) => b.at - a.at).slice(0, 15);
  const pens = live("penalties").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15), open = new Set(St.openPenalties().map(p => p.id));
  return `${fg.open ? `<div class="btns" style="margin-top:0"><button class="btn primary" data-act="nav" data-id="focus">${fg.ended ? "Report " : "Enter "}${esc(fg.o.b.title)}</button></div>` : ""}
  <h2>Topics <span class="n">one per study block</span></h2>${subj}
  ${fold("study-reports", `<b class="grow">Reports</b><span class="small muted">${logs.length}</span>`, `${logs.map(r => `<div class="item row between"><div class="grow small"><b>${esc(r.title)}</b> · ${esc(dayLabel(r.date))}<div class="muted">${r.done ? "Done" : r.gain || r.poms ? `+${r.gain}% · ${r.poms} round${r.poms === 1 ? "" : "s"}` : "Not done"}${r.topic && r.subj ? " · " + esc((St.topics(r.subj).find(t => t.id === r.topic) || {}).t || "") : ""}</div></div>
    <button class="btn sm" data-act="delreport" data-id="${r.id}">Delete</button></div>`).join("") || `<p class="empty">No reports yet. They show up after each study block.</p>`}`)}
  ${fold("study-pens", `<b class="grow">Penalties</b><span class="small ${open.size ? "bad-t" : "muted"}">${open.size} open</span>`, `${pens.map(p => `<div class="item row between small"><span class="grow">${esc(p.title)} · ${esc(dayLabel(p.date))} ${P.toHM(p.s || 0)}</span><span class="${open.has(p.id) ? "bad-t" : "muted"}">−${p.xp} XP · ${open.has(p.id) ? "open" : "cleared"}</span></div>`).join("") || `<p class="empty">None. Keep it that way.</p>`}`, open.size > 0)}`;
}

/* ================= FLASHCARDS ================= */
let cardForm = null, rv = null, bulkOpen = false, recorder = null, newDeck = null; // editor, current review card, bulk paste open, live MediaRecorder, deck for the next new card
const lastDeck = () => { try { return localStorage.getItem("kts-deck") || "My cards"; } catch (e) { return "My cards"; } };
const setLastDeck = d => { try { localStorage.setItem("kts-deck", d); } catch (e) {} };
const deckList = id => `<datalist id="${id}">${K.deckNames().map(d => `<option value="${esc(d)}">`).join("")}</datalist>`;
const starterIds = lesson => STARTER[lesson].map((_, i) => "st-" + lesson.replace(/\W/g, "") + "-" + i);
function gateClosedHtml(g, what) {
  const nx = g.next;
  return `<div class="panel locked-gate"><div class="row" style="gap:10px">${ic("lock", "big-lock")}<div><div class="hdr">System · Gate closed</div>
    <b>${nx ? `Opens ${nx.date === E.today() ? "today" : esc(dayLabel(nx.date))} at ${P.toHM(nx.s)}` : "No study block this week"}</b>
    <div class="small muted">${what} run inside study blocks.${nx ? " Next: " + esc(nx.b.title) + "." : ""}</div></div></div></div>`;
}
function vCards([sub, a]) {
  if (sub === "review") return vReview();
  if (sub === "edit") return vCardEdit(a);
  if (sub === "deck") return vDeck(a);
  const back = `<button class="back" data-act="nav" data-id="dungeon">${ic("left")} Dungeon</button>`;
  const q = K.queue(), g = St.focusGate(), decks = K.deckNames(), done = K.reviewedToday();
  const head = `${back}<header class="top"><div><div class="hdr">Study dungeon</div><h1>Flashcards</h1></div>${gear("dungeon")}</header>`;
  const rev = `<div class="panel dgate ${g.open && q.length ? "open" : ""}"><div class="row between"><div class="grow"><span class="k">Due now</span><h3 style="margin:2px 0 4px">${q.length} card${q.length === 1 ? "" : "s"}</h3>
    <div class="small muted">${done.n ? `${done.n} reviewed today, ${Math.round(done.ok / done.n * 100)}% right` : "None reviewed today"}</div></div>
    ${g.open ? `<button class="btn ${q.length ? "go" : ""}" data-act="nav" data-id="cards/review" ${q.length ? "" : "disabled"}>Review</button>` : `<span class="small muted">${ic("lock", "inl")} ${g.next ? P.toHM(g.next.s) : "Closed"}</span>`}</div></div>`;
  const deckRows = decks.map(d => { const all = K.inDeck(d), due = K.dueCount(d);
    return `<button class="panel tbtn row between" style="width:100%;margin:0 0 8px" data-act="go" data-id="cards/deck/${encodeURIComponent(d)}"><span class="grow" style="text-align:left"><b>${esc(d)}</b><div class="small muted">${all.length} card${all.length === 1 ? "" : "s"}${K.flipOnly(d) ? " · flip only until it has 4" : ""}</div></span><span class="small ${due ? "" : "muted"}">${due} due</span></button>`; }).join("");
  const bulk = bulkOpen ? `<div class="panel" id="bulkForm"><h3>Bulk paste</h3><p class="tiny muted">One card per line: front | back. A tab works too, so you can paste two spreadsheet columns.</p>
    <textarea data-f="bulk" rows="8" placeholder="泳ぐ | to swim&#10;先輩 | senior"></textarea>
    <label class="f" style="margin-top:8px">Deck<input data-f="deck" list="dl-bulk" value="${esc(lastDeck())}"></label>${deckList("dl-bulk")}
    <div class="btns"><button class="btn go" data-act="bulkadd">Add cards</button><button class="btn" data-act="bulk">Cancel</button></div></div>` : "";
  const starters = Object.keys(STARTER).map(l => { const n = K.inDeck(l).length;
    return `<div class="item row between"><span class="grow">${esc(l)} <span class="small muted">· ${STARTER[l].length} cards</span></span>${n ? `<span class="small muted">${ic("check", "inl")} ${n} in decks</span>` : `<button class="btn sm" data-act="starter" data-id="${esc(l)}">Add</button>`}</div>`; }).join("");
  return `${head}${rev}
  ${tip("cards", "New cards are multiple choice. Get one right 3 times over 2 different days and it becomes a flip card you grade yourself. Miss a flip card twice in a row and it goes back to choices.")}
  <div class="btns" style="margin-top:0"><button class="btn primary" data-act="go" data-id="cards/edit/new">${ic("plus")} New card</button><button class="btn" data-act="bulk">Bulk paste</button></div>
  ${bulk}
  <h2>Decks <span class="n">${cardsCount()}</span></h2>${deckRows || `<p class="empty">No cards yet. Add one, paste a list, or start with a Genki deck below.</p>`}
  ${fold("cards-starter", `<b class="grow">Starter decks · Genki II</b><span class="small muted">L13–23</span>`, `<p class="tiny muted">Each lesson's grammar points with short example sentences, plus a few words. A starting point: edit them and add your own.</p>${starters}`, !decks.length)}`;
}
const cardsCount = () => K.cards().length;
// Keeps what's typed in the card editor when it re-renders (image added, recording done).
function keepCardForm() { if (cardForm && $("#cardForm")) Object.assign(cardForm, readForm("#cardForm")); }
function vDeck(name) {
  const list = K.inDeck(name).sort((a, b) => (a.created || 0) - (b.created || 0));
  return `<button class="back" data-act="nav" data-id="cards">${ic("left")} Flashcards</button>
  <header class="top"><div><div class="hdr">Deck · ${list.length} cards</div><h1>${esc(name)}</h1></div></header>
  <div class="btns" style="margin-top:0"><button class="btn primary" data-act="newcardin" data-id="${esc(name)}">${ic("plus")} New card</button></div>
  ${list.map(c => `<button class="panel tbtn row between" style="width:100%;margin:0 0 8px;text-align:left" data-act="go" data-id="cards/edit/${c.id}"><span class="grow"><b class="${K.JA_RE.test(c.front) ? "ja" : ""}">${esc(c.front)}</b><div class="small muted">${esc(c.back)}</div></span>
    <span class="tiny muted" style="flex:none;text-align:right">${c.img ? ic("image", "inl") : ""}${c.aud ? ic("mic", "inl") : ""}<br>${esc(K.stageLabel(c))}</span></button>`).join("") || `<p class="empty">Empty deck.</p>`}`;
}
function vCardEdit(id) {
  const c = id === "new" ? null : live("cards").find(x => x.id === id);
  if (id !== "new" && !c) return `<button class="back" data-act="nav" data-id="cards">${ic("left")} Flashcards</button><p class="empty">That card is gone.</p>`;
  if (c) { if (!cardForm || cardForm.id !== c.id) cardForm = { id: c.id, img: c.img, aud: c.aud, front: c.front, back: c.back, deck: c.deck }; }
  else if (!cardForm || !cardForm.isNew) { cardForm = { id: uid(), isNew: true, img: null, aud: null, front: "", back: "", deck: newDeck || lastDeck() }; newDeck = null; }
  const f = cardForm, canRec = !!(window.MediaRecorder && navigator.mediaDevices);
  return `<button class="back" data-act="cardcancel">${ic("left")} ${c ? esc(c.deck) : "Flashcards"}</button>
  <header class="top"><div><div class="hdr">${c ? esc(K.stageLabel(c)) : "New card"}</div><h1>${c ? "Edit card" : "New card"}</h1></div></header>
  <div class="panel" id="cardForm">
    <label class="f">Front<textarea data-f="front" rows="2" placeholder="泳ぐ">${esc(f.front)}</textarea></label>
    <label class="f" style="margin-top:8px">Back<textarea data-f="back" rows="2" placeholder="to swim">${esc(f.back)}</textarea></label>
    <label class="f" style="margin-top:8px">Deck<input data-f="deck" list="dl-card" value="${esc(f.deck)}"></label>${deckList("dl-card")}
    <p class="tiny muted">Japanese on either side gets a Listen button.</p>
    <h3>Image</h3>${f.img ? `<img class="fc-img" data-photo="${f.img}" alt="Card image"><div class="btns"><button class="btn sm danger" data-act="cardimgdel">Remove image</button></div>`
      : `<label class="btn sm" style="display:inline-flex;gap:6px;align-items:center">${ic("image")} Camera or gallery<input type="file" accept="image/*" data-ch="cardimg" hidden></label>`}
    <h3>Your voice</h3>${recorder ? `<button class="btn danger" data-act="recstop">${ic("stop")} Stop recording</button>`
      : `${f.aud ? `<audio controls data-photo="${f.aud}"></audio><div class="btns"><button class="btn sm" data-act="recstart">Record again</button><button class="btn sm danger" data-act="cardauddel">Remove</button></div>` : canRec ? `<button class="btn sm" data-act="recstart">${ic("mic")} Record</button>` : `<p class="small muted">Recording isn't supported in this browser.</p>`}`}
    <p class="tiny muted">Images and recordings stay on this phone. Export them with the backup file in More.</p>
    <div class="btns"><button class="btn go" data-act="cardsave">Save</button><button class="btn" data-act="cardcancel">Cancel</button>${c ? `<button class="btn danger" data-act="carddel">Delete</button>` : ""}</div></div>`;
}
function fcFace(c, showBack) {
  const ja = K.jaText(c);
  return `${c.img ? `<img class="fc-img" data-photo="${c.img}" alt="">` : ""}<div class="fc-front ${K.JA_RE.test(c.front) ? "ja" : ""}">${esc(c.front)}</div>
    ${showBack ? `<div class="fc-back ${K.JA_RE.test(c.back) ? "ja" : ""}">${esc(c.back)}</div>` : ""}
    <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">${ja ? `<button class="btn sm" data-act="say" data-id="${c.id}">${ic("sound")} Listen</button>` : ""}${c.aud && (showBack || !ja) ? `<audio controls data-photo="${c.aud}"></audio>` : ""}</div>`;
}
function vReview() {
  const back = `<button class="back" data-act="nav" data-id="${St.focusGate().open ? "focus" : "cards"}">${ic("left")} ${St.focusGate().open ? "Study dungeon" : "Flashcards"}</button>`;
  const g = St.focusGate();
  if (!g.open) return `${back}<h1>Flashcards</h1>${gateClosedHtml(g, "Reviews")}`;
  const q = K.queue(), done = K.reviewedToday();
  let c = rv && live("cards").find(x => x.id === rv.id);
  if (!c || (rv.pick == null && !q.some(x => x.id === c.id))) { c = q[0]; rv = c ? { id: c.id, mode: K.mode(c), opts: K.mode(c) === "mcq" ? K.options(c) : null, flip: false, pick: null } : null; }
  const head = `${back}<header class="top"><div><div class="hdr">Study dungeon · Stage 2 · ${q.length} left</div><h1>Flashcards</h1></div><span class="small muted">${done.n} today</span></header>`;
  if (!c) return `${head}${sysBox("Due pile cleared.", `${done.n} reviews today${done.n ? ", " + Math.round(done.ok / done.n * 100) + "% right" : ""}. Next: stage 3.`,
    `<div class="btns"><button class="btn sm primary" data-act="nav" data-id="jlpt/q">JLPT practice</button><button class="btn sm" data-act="nav" data-id="focus">Back to the block</button><button class="btn sm" data-act="nav" data-id="cards">Decks</button></div>`)}`;
  const tag = `<div class="k">${esc(c.deck)} · ${rv.mode === "mcq" ? `Choice ${(c.mcqOk || []).length}/3` : c.s ? "Flip" : "Flip · new"}</div>`;
  if (rv.mode === "mcq") {
    const answered = rv.pick != null, right = c.back.trim();
    return `${head}<div class="panel fc">${tag}${fcFace(c, false)}</div>
      <div class="opts">${rv.opts.map((o, i) => `<button class="opt ${answered ? (o === right ? "right" : i === rv.pick ? "wrong" : "dim") : ""}" data-act="rvpick" data-id="${i}" ${answered ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div>
      ${answered ? `<div class="btns"><button class="btn primary block" data-act="rvnext">Next</button></div>` : ""}`;
  }
  if (!rv.flip) return `${head}<div class="panel fc">${tag}${fcFace(c, false)}</div><div class="btns"><button class="btn primary block" data-act="rvflip">Show answer</button></div>`;
  return `${head}<div class="panel fc">${tag}${fcFace(c, true)}</div>
    <div class="grades">${[[1, "Again"], [2, "Hard"], [3, "Good"], [4, "Easy"]].map(([gr, l]) => `<button class="grade g${gr}" data-act="rvgrade" data-id="${gr}"><b>${l}</b><span>${K.preview(c, gr)}</span></button>`).join("")}</div>`;
}
async function recStart() {
  try {
    keepCardForm();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), chunks = [], id = cardForm.id;
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = e => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop()); recorder = null;
      const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" }), mid = "ca-" + id;
      await photos.put(mid, blob);
      keepCardForm();
      if (cardForm && cardForm.id === id) { cardForm.aud = mid; const c = live("cards").find(x => x.id === id); if (c) { c.aud = mid; put("cards", c); save(); } }
      render();
    };
    mr.start(); recorder = mr; render();
  } catch (e) { toast("Microphone not allowed"); }
}

/* ================= JLPT ================= */
let jq = null, exam = null; // practice question on screen; exam in progress {kind, lvl, qs, i, ans, res}
const RANK_ORDER = "EDCBAS";
const stem = s => esc(s).replace(/__(.+?)__/g, "<u>$1</u>").replace(/\n/g, "<br>");
function jlptNeed(lvls) { const miss = lvls.filter(l => !J.bank(l)); miss.forEach(l => J.load(l, render)); return miss.length ? `<p class="empty">Loading questions…</p>` : ""; }
// Passage text; runs of lines with ｜ (notices, timetables) become a table, the first row as its header.
const ptext = s => String(s || "").split("\n").reduce((acc, l) => {
  const last = acc[acc.length - 1];
  if (l.includes("｜")) { if (Array.isArray(last)) last.push(l); else acc.push([l]); } else acc.push(l);
  return acc;
}, []).map(x => Array.isArray(x) ? `<div class="ptab"><table>${x.map((r, i) => `<tr>${r.split("｜").map(c => i ? `<td>${stem(c.trim())}</td>` : `<th>${stem(c.trim())}</th>`).join("")}</tr>`).join("")}</table></div>` : stem(x) + "<br>").join("").replace(/(<br>)+$/, "");
function passageHtml(lvl, it) {
  const p = it.p && J.passage(lvl, it.p); if (!p) return "";
  return `<div class="panel passage ja">${p.title ? `<div class="k">${esc(p.title)}</div>` : ""}<div class="ptext">${ptext(p.text)}</div></div>`;
}
function qHtml(lvl, it, pick, reveal, act) {
  const right = it.a;
  return `${passageHtml(lvl, it)}<div class="panel fc"><div class="k">${lvl} · ${esc(J.TYPES[it.type] || it.type)}${it.genki ? " · Genki L" + it.genki : ""}</div>
    ${J.PROMPT[it.type] ? `<div class="small muted" style="margin-bottom:8px">${J.PROMPT[it.type]}</div>` : ""}<div class="jq ja">${stem(it.q)}</div></div>
    <div class="opts">${it.opts.map((o, i) => `<button class="opt ja ${reveal ? (i === right ? "right" : i === pick ? "wrong" : "dim") : pick === i ? "sel" : ""}" data-act="${act}" data-id="${i}" ${reveal ? "disabled" : ""}><span class="on">${i + 1}</span> ${stem(o)}</button>`).join("")}</div>
    ${reveal && it.ex ? `<div class="sys ex"><b>${pick === right ? "Correct" : "Not quite"}</b> · ${esc(it.ex)}</div>` : ""}`;
}
function vJlpt([sub, a]) {
  if (sub === "q") return vJlptQ(a);
  if (sub === "exam") return vExam(a);
  const lvl = J.level(), wait = jlptNeed([lvl]);
  const head = `<header class="top"><div><button class="back" data-act="nav" data-id="dungeon">${ic("left")} Dungeon</button><div class="hdr">Study dungeon · Stage 3</div><h1>JLPT ladder</h1></div>${gear("dungeon")}</header>`;
  const ladder = `<div class="ladder">${J.LEVELS.map(l => { const on = J.unlocked().includes(l), cleared = J.passedLevels().includes(l);
    return `<button class="rung ${l === lvl ? "cur" : ""} ${on ? "" : "off"}" data-act="jlptlvl" data-id="${l}" ${on ? "" : "disabled"}>${on ? "" : ic("lock", "inl")}${l}${cleared ? ` ${ic("check", "inl")}` : ""}</button>`; }).join("")}</div>`;
  if (wait) return head + ladder + wait;
  const st = J.stats(lvl), g = St.focusGate(), nl = J.nextLock(lvl), tl = J.titles();
  const exams = live("jlptExams").sort((x, y) => y.date.localeCompare(x.date) || (y.u || 0) - (x.u || 0));
  const lastMock = exams.find(x => x.kind === "mock" && x.lvl === lvl), mockOpen = RANK_ORDER.indexOf(st.rank) >= RANK_ORDER.indexOf(J.MOCK_AT);
  const secBars = J.SECS.map(([k, l]) => { const s = st.by[k]; return s.n ? `<div class="row between small" style="margin-top:8px"><span>${l}</span><span class="muted">${s.right}/${s.n}</span></div>${bar(s.right / s.n, "var(--sys)")}` : ""; }).join("");
  const gateNote = g.open ? "" : `<p class="small muted">${ic("lock", "inl")} Practice opens in your next study block${g.next ? ": " + esc(dayLabel(g.next.date)) + " " + P.toHM(g.next.s) : ""}.</p>`;
  return `${head}${ladder}
  ${tip("jlpt", "Original questions in the real JLPT formats. Right answers rank you up; wrong ones become flashcards in the JLPT mistakes deck. Reach Rank " + J.MOCK_AT + " to open the Boss Raid, a mock exam that unlocks the next level.")}
  <div class="panel"><div class="row between"><div><span class="k">${lvl} rank</span><div class="rankbig">${st.rank}</div></div><div style="text-align:right"><div class="dm big2">${st.right}/${st.open}</div><div class="small muted">mastered</div></div></div>
    ${bar(st.frac, "var(--sys)")}${secBars}
    ${nl ? `<p class="tiny muted" style="margin-top:10px">${ic("lock", "inl")} ${nl.n} question${nl.n === 1 ? " unlocks" : "s unlock"} when Genki II lesson ${nl.lesson} is at 100% in Study topics.</p>` : ""}</div>
  ${gateNote}
  <div class="btns" style="margin-top:0"><button class="btn primary" data-act="nav" data-id="jlpt/q" ${g.open ? "" : "disabled"}>Practice</button>${J.SECS.map(([k, l]) => `<button class="btn sm" data-act="nav" data-id="jlpt/q/${k}" ${g.open ? "" : "disabled"}>${l}</button>`).join("")}</div>
  <div class="panel dgate ${mockOpen && g.open ? "open" : ""}"><div class="row between"><div class="grow"><span class="k">Boss Raid · ${lvl} mock exam</span><h3 style="margin:2px 0 4px">${J.TITLES[lvl]}</h3>
    <div class="small muted">${mockOpen ? `Pass at 70% with no section under 35%.${lastMock ? ` Last: ${Math.round(lastMock.pct * 100)}% ${lastMock.pass ? "cleared" : "failed"}.` : ""}` : `Opens at Rank ${J.MOCK_AT}.`}</div></div>
    <button class="btn ${mockOpen && g.open ? "go" : ""}" data-act="exam" data-id="mock" ${mockOpen && g.open ? "" : "disabled"}>Enter</button></div></div>
  ${!S.settings.jlpt.placed ? `<div class="panel"><h3>Placement test</h3><p class="small muted">30 questions from N5, N4 and N3. Score 80% on a level and you skip it. You're on Genki II, so this likely saves you N5.</p>
    <div class="btns"><button class="btn sm" data-act="exam" data-id="place" ${g.open ? "" : "disabled"}>Take it</button></div></div>` : ""}
  ${tl.length ? `<h2>Titles</h2><div class="chips">${tl.map(t => `<span class="chip">${ic("star", "inl")} ${esc(t)}</span>`).join("")}</div>` : ""}
  ${exams.length ? fold("jlpt-exams", `<b class="grow">Exam history</b><span class="small muted">${exams.length}</span>`, exams.slice(0, 20).map(x => `<div class="item row between small"><span class="grow">${x.kind === "place" ? "Placement" : x.lvl + " Boss Raid"} · ${esc(dayLabel(x.date))}</span><span class="${x.pass ? "" : "muted"}">${Math.round(x.pct * 100)}% ${x.pass ? ic("check", "inl") : ""}</span></div>`).join("")) : ""}`;
}
function vJlptQ(sec) {
  const lvl = J.level(), back = `<button class="back" data-act="nav" data-id="jlpt">${ic("left")} JLPT ladder</button>`;
  const g = St.focusGate(); if (!g.open) return `${back}<h1>JLPT practice</h1>${gateClosedHtml(g, "JLPT practice")}`;
  const wait = jlptNeed([lvl]); if (wait) return back + wait;
  if (!jq || jq.lvl !== lvl || jq.sec !== (sec || null) || !J.bank(lvl).byId[jq.id]) {
    const it = J.pick(lvl, sec, jq && jq.lvl === lvl ? jq : null);
    if (!it) return `${back}<h1>JLPT practice</h1><p class="empty">No open questions in this section yet.</p>`;
    jq = { lvl, sec: sec || null, id: it.id, pick: null, p: it.p || null, done: jq && jq.p === it.p ? jq.done : [], n: jq ? jq.n : 0, ok: jq ? jq.ok : 0 };
  }
  const it = J.bank(lvl).byId[jq.id], st = J.stats(lvl);
  return `${back}<header class="top"><div><div class="hdr">Stage 3 · ${lvl} · Rank ${st.rank}${sec ? " · " + J.SECS.find(x => x[0] === sec)[1] : ""}</div><h1>JLPT practice</h1></div><span class="small muted">${jq.ok}/${jq.n} this round</span></header>
  ${qHtml(lvl, it, jq.pick, jq.pick != null, "jqpick")}
  ${jq.pick != null ? `<div class="btns"><button class="btn primary block" data-act="jqnext">Next</button></div>` : ""}`;
}
function vExam(kind) {
  const back = `<button class="back" data-act="examquit">${ic("left")} ${exam && !exam.res ? "Quit" : "JLPT ladder"}</button>`;
  if (!exam || exam.kind !== kind) return `${back}<p class="empty">No exam running.</p>`;
  const title = kind === "place" ? "Placement test" : `Boss Raid · ${exam.lvl}`;
  if (exam.res) {
    const { g, gains } = exam.res, rows = Object.entries(g.sec).map(([k, [o, n]]) => `<div class="row between small" style="margin-top:8px"><span>${J.SECS.find(x => x[0] === k)[1]}</span><span>${o}/${n} · ${Math.round(o / n * 100)}%</span></div>${bar(o / n, o / n >= 0.35 ? "var(--sys)" : "var(--bad)")}`).join("");
    const verdict = kind === "place" ? (g.clears.length ? `Skipped ${g.clears.join(", ")}. You start at ${J.level()}.` : "Start at N5. Every level unlocks from its Boss Raid.")
      : g.pass ? `Cleared. Title earned: ${J.TITLES[exam.lvl]}.${J.LEVELS[J.LEVELS.indexOf(exam.lvl) + 1] ? " " + J.LEVELS[J.LEVELS.indexOf(exam.lvl) + 1] + " is open." : ""}` : `Not yet. ${g.floorOk ? "Pass mark is 70%." : "A section fell under 35%."} Your misses are now flashcards.`;
    const miss = exam.qs.map((q, i) => ({ q, i, it: J.bank(q.lvl).byId[q.id] })).filter(x => exam.ans[x.i] !== x.it.a);
    return `${back}<header class="top"><div><div class="hdr">${title}</div><h1>${Math.round(g.pct * 100)}%</h1></div></header>
      ${sysBox(esc(verdict), gains.length ? esc(gains.map(x => "+" + x.xp + " XP · " + x.label).join(", ")) : "")}
      <div class="panel">${rows}${kind === "place" ? Object.entries(g.per).map(([l, [o, n]]) => `<div class="row between small" style="margin-top:8px"><span>${l}</span><span>${o}/${n}</span></div>`).join("") : ""}</div>
      ${miss.length ? fold("exam-miss", `<b class="grow">Review mistakes</b><span class="small muted">${miss.length}</span>`, miss.map(x => `<div class="item small"><div class="ja">${stem(x.it.q)}</div><div><b class="ja">${stem(x.it.opts[x.it.a])}</b>${exam.ans[x.i] != null ? ` <span class="muted">· you chose ${stem(x.it.opts[exam.ans[x.i]])}</span>` : ""}</div><div class="muted">${esc(x.it.ex || "")}</div></div>`).join(""), true) : ""}
      <div class="btns"><button class="btn primary" data-act="examquit">Done</button></div>`;
  }
  const q = exam.qs[exam.i], it = J.bank(q.lvl).byId[q.id], answered = exam.ans.filter(x => x != null).length;
  return `${back}<header class="top"><div><div class="hdr">${title} · ${exam.i + 1} of ${exam.qs.length}</div><h1>${J.SECS.find(x => x[0] === it.sec)[1]}</h1></div><span class="small muted">${answered} answered</span></header>
    ${bar((exam.i + 1) / exam.qs.length, "var(--sys)")}
    ${qHtml(q.lvl, it, exam.ans[exam.i], false, "exampick")}
    <div class="btns"><button class="btn" data-act="exammove" data-id="-1" ${exam.i ? "" : "disabled"}>Back</button>${exam.i < exam.qs.length - 1 ? `<button class="btn primary" data-act="exammove" data-id="1">Next</button>` : `<button class="btn go" data-act="examsubmit">Submit</button>`}</div>`;
}

function taskFormHtml(k) {
  k = k || { mins: 60, prio: 2, energy: "high" };
  return `<div class="panel" id="taskForm">
    <label class="f">Task<input data-f="title" value="${esc(k.title || "")}" placeholder="e.g. Read 決算短信 for Toyota" enterkeyhint="done"></label>
    <div class="grid" style="margin-top:10px">
      <label class="f">Length<select data-f="mins">${P.TASK_LEN.map(m => `<option value="${m}" ${+k.mins === m ? "selected" : ""}>${P.dur(m)}</option>`).join("")}</select></label>
      <label class="f">Priority<select data-f="prio">${[[3, "High"], [2, "Normal"], [1, "Low"]].map(([v, l]) => `<option value="${v}" ${+k.prio === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="f">Energy<select data-f="energy"><option value="high" ${k.energy === "high" ? "selected" : ""}>Focus</option><option value="low" ${k.energy === "low" ? "selected" : ""}>Light</option></select></label>
      <label class="f">Due (optional)<input type="date" data-f="due" value="${esc(k.due || "")}"></label>
    </div>
    <div class="btns"><button class="btn go" data-act="savetask" ${k.id ? `data-id="${k.id}"` : ""}>${k.id ? "Save" : "Add and plan"}</button>
      <button class="btn" data-act="taskform">Cancel</button>${k.id ? `<button class="btn danger" data-act="deltask" data-id="${k.id}">Delete</button>` : ""}</div>
  </div>`;
}

// Task actions, in a sheet from the tapped task: done, pin, edit, delete.
function taskActHtml(id) {
  const k = live("tasks").find(x => x.id === id); if (!k) return `<p class="empty">Task not found.</p>`;
  const at = P.plan().at.get(id);
  if (taskForm === id) return taskFormHtml(k);
  return `<h3>${esc(k.title)}</h3>
    <p class="small muted">${at ? `${esc(dayLabel(at.date))} ${span(at.s, at.e)}${at.pinned ? " · pinned" : ""}${at.late ? ` · <span class="warn">after deadline</span>` : ""}` : `<span class="warn">No free slot in the next 2 weeks</span>`} · ${P.dur(k.mins)}${k.prio === 3 ? " · high" : k.prio === 1 ? " · low" : ""}${k.energy === "high" ? " · focus" : ""}${k.due ? ` · due ${E.fmtDate(k.due)}` : ""}</p>
    <div class="actlist">
      <button class="act" data-act="taskdone" data-id="${k.id}">${ic("check")}<span>Done</span></button>
      ${at ? `<button class="act" data-act="${at.pinned ? "unpin" : "pin"}" data-id="${k.id}">${ic("pin")}<span>${at.pinned ? "Unpin (let it move)" : "Pin to this slot"}</span></button>` : ""}
      <button class="act" data-act="taskform" data-id="${k.id}">${ic("edit")}<span>Edit or move</span></button>
      ${k.penalty ? "" : `<button class="act danger" data-act="deltask" data-id="${k.id}">${ic("x")}<span>Delete</span></button>`}
    </div>`;
}
// The + button: one place to add anything on the Plan tab.
function addHtml() {
  return `<h3>Add</h3><div class="actlist">
    <button class="act" data-act="newtask">${ic("check")}<span>Task<small>The System finds it a slot</small></span></button>
    <button class="act" data-act="blockform" data-id="new">${ic("clock")}<span>Block<small>Class, shift, quest block, anything fixed</small></span></button>
    <button class="act" data-act="personform">${ic("user")}<span>Person<small>Add to your registry</small></span></button>
    <button class="act" data-act="go" data-id="social/log">${ic("users")}<span>Hangout<small>Log time with people</small></span></button>
  </div>`;
}

function blockFormHtml(b) {
  b = b || { title: "", kind: "other", days: [], start: "09:00", end: "10:00", locked: false, date: null };
  return `<div class="panel" id="blockForm">
    <h3>${b.id ? "Edit block" : "New block"}</h3>
    <div class="grid">
      <label class="f" style="flex-basis:100%">Name<input data-f="title" value="${esc(b.title)}" placeholder="e.g. Seminar"></label>
      <label class="f">Type<select data-f="kind">${Object.entries(P.KINDS).map(([k, v]) => `<option value="${k}" ${b.kind === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></label>
      <label class="f">Start<input type="time" data-f="start" value="${esc(b.start)}"></label>
      <label class="f">End<input type="time" data-f="end" value="${esc(b.end)}"></label>
    </div>
    <div class="small muted" style="margin-top:10px">Repeats every</div>
    <div class="chips" id="bdays">${P.WEEK_ORDER.map(d => `<button class="chip" data-act="bday" data-id="${d}" aria-pressed="${(b.days || []).includes(d)}">${P.DAY_NAMES[d]}</button>`).join("")}</div>
    <label class="f" style="margin-top:10px">Or only on this date<input type="date" data-f="date" value="${esc(b.date || "")}"></label>
    <label class="row small" style="margin-top:10px"><input type="checkbox" data-f="locked" style="width:auto" ${b.locked ? "checked" : ""}> Locked (school, work, sleep: asks before changing)</label>
    <p class="tiny muted">An end time before the start runs past midnight, like a 22:00–06:00 shift.</p>
    <div class="btns"><button class="btn go" data-act="saveblock" ${b.id ? `data-id="${b.id}"` : ""}>Save</button><button class="btn" data-act="blockform">Cancel</button>
      ${b.id ? `<button class="btn danger" data-act="delblock" data-id="${b.id}">Delete</button>` : ""}</div>
  </div>`;
}

// Week as a time grid: Mon–Sun columns, 24 hours tall. Blocks sit at their real times; planned tasks are dashed.
function weekGrid() {
  const H = 26, t = E.today(), days = E.weekDays(t), p = P.plan(), n = new Date(), nm = n.getHours() * 60 + n.getMinutes();
  const px = m => (m / 60 * H).toFixed(1);
  const col = d => {
    const blocks = P.segments(d).map(g => { const K = P.KINDS[g.b.kind] || P.KINDS.other, h = (g.e - g.s) / 60 * H;
      return `<button class="wg-b k-${esc(g.b.kind)}" style="top:${px(g.s)}px;height:${Math.max(12, h - 1).toFixed(1)}px;--c:var(--${K.c})" data-act="blockform" data-id="${g.b.id}" aria-label="${esc(g.b.title)} ${P.toHM(g.s)} to ${P.toHM(g.e)}">${h >= 18 ? `<span>${esc(g.b.title)}</span>` : ""}${h >= 34 ? `<i>${P.toHM(g.tail ? 0 : g.s)}</i>` : ""}</button>`; }).join("");
    const tasks = live("tasks").filter(k => !k.done).map(k => ({ k, at: p.at.get(k.id) })).filter(x => x.at && x.at.date === d)
      .map(({ k, at }) => `<button class="wg-b wg-task" style="top:${px(at.s)}px;height:${Math.max(12, (at.e - at.s) / 60 * H - 1).toFixed(1)}px" data-act="sheet" data-id="task:${k.id}" aria-label="Task ${esc(k.title)}"><span>${esc(k.title)}</span></button>`).join("");
    return `<div class="wg-col ${d === t ? "today" : ""}" data-act="newblockat" data-id="${d}">${blocks}${tasks}${d === t ? `<div class="wg-now" style="top:${px(nm)}px"></div>` : ""}</div>`;
  };
  return `<div class="wgrid panel">
    <div class="wg-head"><span></span>${days.map(d => `<span class="${d === t ? "today" : ""}">${P.DAY_NAMES[E.parse(d).getDay()]}<b>${E.parse(d).getDate()}</b></span>`).join("")}</div>
    <div class="wg-body" style="height:${24 * H}px;--h:${H}px">
      <div class="wg-times">${[...Array(24)].map((_, h) => `<span style="top:${h * H}px">${h % 3 === 0 ? E.pad(h) : ""}</span>`).join("")}</div>
      ${days.map(col).join("")}
    </div></div>`;
}

function vWeek() {
  return `${weekGrid()}${tip("plan-week", "Tap an empty slot to add a block at that time. Tap a block to edit it.")}`;
}

// Fires the wind-down as a notification while the app is open or backgrounded. The calendar covers the rest.
let wdTimer = null;
function scheduleWindDown() {
  clearTimeout(wdTimer);
  const wd = S.settings.windDown;
  if (!wd || wd.on === false || !wd.notify || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const now = Date.now();
  for (let i = 0; i < 2; i++) {
    const w = P.windDownOn(E.addDays(E.today(), i)); if (!w) continue;
    const at = E.parse(w.date).getTime() + w.at * 60000;
    if (at > now) {
      wdTimer = setTimeout(async () => {
        const body = `Bed at ${P.toHM(w.bed)}. Screens off, shower, set out tomorrow.`;
        try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) reg.showNotification("Wind down", { body, icon: "icons/icon-192.png", tag: "winddown" }); else new Notification("Wind down", { body }); } catch (e) {}
        render(); scheduleWindDown();
      }, Math.min(at - now, 2 ** 31 - 1));
      return;
    }
  }
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

### Money
${moneyLines()}

Please review: sessions vs plan, progression, stalls, pain, money pace. End with "Next week: 3 actions."`;
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
let drawer = false, drawerDay = null; // session side menu
const started = date => { const w = E.workoutOn(date); return !!(w && (w.entries || []).some(e => e.sets && e.sets.length)); };
// Shown instead of the log when no workout block is open.
function lockedHtml(g) {
  const nx = g.next;
  return `<div class="panel locked-gate"><div class="row" style="gap:10px">${ic("lock", "big-lock")}<div><div class="hdr">System · Gate closed</div>
    <b>${nx ? `Opens ${nx.date === E.today() ? "today" : nx.date === E.addDays(E.today(), 1) ? "tomorrow" : esc(dayLabel(nx.date))} at ${P.toHM(nx.s)}` : "No workout block this week"}</b>
    <div class="small muted">${nx ? esc(nx.b.title) + " block. " : ""}Logging opens ${S.settings.plan.openPad ?? 10} min before a workout block and closes ${S.settings.plan.openPad ?? 10} min after. Once you log a set it stays open for the day.</div></div></div></div>`;
}

function vTrain([view, a, b]) {
  if (view === "log") return vLog(a, b || E.today());
  if (view === "ex") return vExercise(a);
  if (view === "pick") return vPick(a);
  if (view === "runs") return vRuns();
  if (view === "new") return vNewExercise();
  if (view === "edit") return vNewExercise(a);
  return vTrainHome();
}

function vTrainHome() {
  const t = E.today(), plan = E.planFor(t), w = E.workoutOn(t), gate = P.trainGate(started(t));
  const postShift = w ? !!w.postShift : !!plan.postShift;
  const row = (ex, lab, entry, extraHtml) => {
    const tg = E.nextTarget(ex, t), st = E.stallInfo(ex.id);
    const inner = `<span class="done-dot ${entry && entry.sets.length ? "on" : ""}"></span>
      <span class="grow"><span class="lab">${esc(lab)}</span><br><b>${esc(ex.name)}</b> ${st.stalled ? `<span class="pill warn">Stalled</span>` : ""}
      <br><span class="small muted">${entry && entry.sets.length ? "Today: " + esc(E.fmtSets(ex, entry.sets)) : tg ? "Target: " + esc(tg.text) : `First session: find a working ${ex.kind === "load" ? "weight" : "level"}`}</span></span>`;
    return gate.open ? `<button class="slot" data-act="go" data-id="train/log/${ex.id}">${inner}<span class="chev">${ic("right")}</span></button>` : `<div class="slot dim">${inner}</div>`;
  };
  const slots = plan.slots.map(key => {
    const ex = E.slotExercise(key), sl = SLOTS[key];
    const entry = w && (w.entries || []).find(e => e.exercise === ex.id);
    return row(ex, sl.label, entry);
  }).join("") + plan.extra.map(id => { const ex = E.exById(id); return row(ex, "Added", w && (w.entries || []).find(e => e.exercise === id)); }).join("");
  const extra = w ? (w.entries || []).filter(e => e.sets.length && !plan.slots.some(k => E.slotState(k).current === e.exercise) && !plan.extra.includes(e.exercise)) : [];
  const recent = live("workouts").filter(x => x.date < t && (x.entries || []).some(e => e.sets.length)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const flags = E.painFlags();
  const session = `
    <div class="row between"><div><div class="small muted">${E.fmtDate(t)} · ${esc(plan.where)}</div><h3 style="margin:2px 0 0">${esc(plan.name)}</h3></div>
      <button class="rbtn" data-act="drawer" aria-label="Session settings and circle method">${ic("menu")}</button></div>
    ${plan.postShift || postShift ? `<label class="row small" style="margin-top:8px"><input type="checkbox" data-ch="postshift" ${postShift ? "checked" : ""} style="width:22px;height:22px"> After a night shift: keep 1–2 reps in reserve</label>` : ""}
    ${flags.length ? `<div class="flag bad">${flags.map(esc).join(" ")} Deload or swap. Stop on sharp pain.</div>` : ""}
    <div style="margin-top:6px">${slots}</div>
    ${extra.map(e => { const ex = E.exById(e.exercise); return `<button class="slot" data-act="go" data-id="train/log/${ex.id}"><span class="done-dot on"></span><span class="grow"><span class="lab">Extra</span><br><b>${esc(ex.name)}</b><br><span class="small muted">Today: ${esc(E.fmtSets(ex, e.sets))}</span></span><span class="chev">${ic("right")}</span></button>`; }).join("")}
    ${gate.open ? `<div class="btns"><button class="btn" data-act="go" data-id="train/pick/extra">+ Other exercise</button>${plan.run ? `<button class="btn" data-act="go" data-id="train/runs">Log a run</button>` : ""}</div>` : ""}`;
  const hasData = live("workouts").some(x => (x.entries || []).some(e => e.sets.length)) || live("runs").length > 0;
  // Gate closed: one card saying when, and today's session folded away instead of greyed-out rows.
  return `<header class="top"><div><button class="back" data-act="nav" data-id="dungeon">${ic("left")} Dungeon</button><h1>Body dungeon</h1></div>${gear("body")}</header>
  ${gate.open ? `<div class="hero">${session}</div>` : lockedHtml(gate) + fold("train-peek", `<b class="grow">Peek: ${esc(plan.name)}</b><span class="small muted">${plan.slots.length + plan.extra.length} exercises</span>`, session)}
  ${drawer ? sessionDrawer() : ""}
  <div class="quiet-links"><button data-act="go" data-id="train/runs">${ic("right", "inl")} Runs · longest ${Math.max(0, ...live("runs").map(r => r.km))}/${RUN_GOAL_KM} km</button><button data-act="go" data-id="train/pick/browse">${ic("right", "inl")} Exercise library</button></div>
  ${hasData ? `<h2>Progress</h2>${trainCharts()}` : ""}
  ${recent.length ? `<h2>Recent sessions</h2>
  <div class="panel">${recent.map(x => `<div class="item"><div class="row between"><b>${E.fmtDate(x.date)}</b>${x.postShift ? `<span class="pill">post-shift</span>` : ""}</div>
    ${x.entries.filter(e => e.sets.length).map(e => { const ex = E.exById(e.exercise); return `<button class="link small" style="display:block;text-align:left" data-act="go" data-id="train/log/${ex.id}/${x.date}">${esc(ex.name)}: ${esc(E.fmtSets(ex, e.sets))}${e.pr ? " · PR" : ""}</button>`; }).join("")}</div>`).join("")}</div>` : ""}`;
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
  if (date === E.today()) { const g = P.trainGate(started(date)); if (!g.open) return `<button class="back" data-act="back">${ic("left")} Back</button><h1>${esc(ex.name)}</h1>${lockedHtml(g)}<div class="btns"><button class="btn" data-act="go" data-id="train/ex/${ex.id}">History</button></div>`; }
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
  const sets = e && e.sets.length ? `<div class="setlist">${e.sets.map((s, i) => `<div class="setrow"><span>Set ${i + 1}: ${esc(E.fmtSet(ex, s))}</span><button data-act="delset" data-id="${i}" aria-label="Delete set ${i + 1}">${ic("x")}</button></div>`).join("")}</div>` : "";
  return `<button class="back" data-act="back">${ic("left")} Back</button>
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
  return `<button class="back" data-act="back">${ic("left")} Back</button>
  <h1>${esc(ex.name)}</h1>
  <div class="small muted">${esc(AREAS.find(a => a[0] === ex.area)?.[1] || ex.area)} · ${ex.kind === "load" ? "weighted" : ex.kind === "time" ? "timed hold" : "bodyweight"}${st.stalled ? ` · <span class="pill warn">Stalled</span>` : ""}</div>
  <div class="panel">
    <h3>Rep range</h3>
    <div class="grid"><label class="f">Low<input type="number" inputmode="numeric" data-ch="rangeLo" value="${lo}"></label><label class="f">High<input type="number" inputmode="numeric" data-ch="rangeHi" value="${hi}"></label>
    ${ex.kind === "load" ? `<label class="f">Load step (kg)<input type="number" inputmode="decimal" step="0.5" data-ch="inc" value="${E.inc(ex)}"></label>` : ""}</div>
    <p class="small muted" style="margin-top:6px">Hit the top of the range on every set, then ${ex.kind === "load" ? "add load" : "move up a level"}.</p>
    <div class="btns"><button class="btn go" data-act="go" data-id="train/log/${ex.id}">Log today</button><button class="btn" data-act="go" data-id="train/edit/${ex.id}">Edit</button><button class="btn danger" data-act="delex" data-id="${ex.id}">Delete</button></div>
  </div>
  <h2>History</h2>
  <div class="panel">${h.length ? h.map(x => `<div class="item"><div class="row between"><b>${E.fmtDate(x.date)}</b><span class="small muted">${x.entry.rpe ? "RPE " + x.entry.rpe : ""}${x.entry.pr ? " · PR" : ""}</span></div>
    <div>${esc(E.fmtSets(ex, x.entry.sets))}</div>${x.entry.pain?.score ? `<div class="small" style="color:var(--bad)">Pain ${x.entry.pain.score}${x.entry.pain.location ? " · " + esc(x.entry.pain.location) : ""}</div>` : ""}
    ${x.entry.comment ? `<div class="small muted">${esc(x.entry.comment)}</div>` : ""}${x.entry.video ? `<a class="small" href="${esc(x.entry.video)}" target="_blank" rel="noopener">Video</a>` : ""}</div>`).join("") : `<p class="empty">Nothing logged yet.</p>`}</div>`;
}

// mode: a slot key (swap), "extra" (log something off-plan) or "browse".
function vPick(mode) {
  const slot = SLOTS[mode], addDay = /^add-\d$/.test(mode) ? +mode.slice(4) : null;
  let list = E.allExercises();
  if (slot) list = E.slotCandidates(mode);
  const cur = slot ? E.slotState(mode).current : null;
  const groups = AREAS.map(([a, label]) => {
    const xs = list.filter(e => e.area === a).sort((x, y) => (x.rank || 0) - (y.rank || 0) || x.name.localeCompare(y.name));
    if (!xs.length) return "";
    return `<div class="lib-area"><h3>${label}</h3>${xs.map(e => { const lt = E.lastTrained(e.id), st = E.stallInfo(e.id);
      return `<button class="pick" data-act="${slot ? "swap" : addDay !== null ? "addextra" : mode === "browse" ? "exinfo" : "open"}" data-id="${e.id}" data-slot="${esc(mode)}"><b>${esc(e.name)}</b>${e.id === cur ? ` <span class="pill ok">Current</span>` : ""}${st.stalled ? ` <span class="pill warn">Stalled</span>` : ""}
      <br><span class="small muted">${e.kind === "load" ? "Weighted" : e.kind === "time" ? "Timed" : "Bodyweight"}${lt ? " · last " + E.fmtDate(lt) : " · not trained yet"}</span></button>`; }).join("")}</div>`;
  }).join("");
  return `<button class="back" data-act="back">${ic("left")} Back</button>
  <h1>${slot ? "Swap " + esc(slot.label.toLowerCase()) : mode === "extra" ? "Add an exercise" : addDay !== null ? "Add to " + P.DAY_NAMES[addDay] + " session" : "Exercise library"}</h1>
  ${slot ? `<p class="small muted">The new pick stays in this slot until you swap again. The old one is parked for the next circle.</p>` : ""}
  <div class="panel">${groups}</div>
  <div class="btns"><button class="btn" data-act="go" data-id="train/new">+ New exercise</button></div>
  ${mode === "browse" && hiddenEx().length ? `<details class="panel"><summary>Deleted exercises (${hiddenEx().length})</summary>${hiddenEx().map(e => `<div class="item row between"><span class="small">${esc(e.name || e.id)}</span><button class="btn sm" data-act="restoreex" data-id="${e.id}">Restore</button></div>`).join("")}</details>` : ""}`;
}
const hiddenEx = () => live("exercises").filter(e => e.hidden).map(e => ({ ...(LIBRARY.find(l => l.id === e.id) || {}), ...e }));

function vNewExercise(editId) {
  const ex = editId ? E.exById(editId) : { area: "push", kind: "load", rank: 2 };
  const logged = editId && E.history(editId).length > 0; // type can't change once sets exist: old sets would read wrong
  return `<button class="back" data-act="back">${ic("left")} Back</button><h1>${editId ? "Edit exercise" : "New exercise"}</h1>
  <div class="panel grid" id="newEx">
    <label class="f" style="flex-basis:100%">Name<input data-f="name" value="${esc(ex.name || "")}" placeholder="e.g. Ring row"></label>
    <label class="f">Area<select data-f="area">${AREAS.map(([a, l]) => `<option value="${a}" ${ex.area === a ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label class="f">Type<select data-f="kind" ${logged ? "disabled" : ""}>${[["load", "Weighted (kg × reps)"], ["level", "Bodyweight (level × reps)"], ["time", "Timed hold (level × seconds)"]].map(([k, l]) => `<option value="${k}" ${ex.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label class="f" style="flex-basis:100%">Levels, easiest first (bodyweight and timed only, comma separated)<input data-f="levels" value="${esc((ex.levels || []).join(", "))}" placeholder="e.g. Tuck, Advanced tuck, Straddle"></label>
    <label class="f">Difficulty in its area (1 easy – 5 hard)<input type="number" data-f="rank" value="${ex.rank || 2}" min="1" max="5"></label>
  </div>
  ${logged ? `<p class="tiny muted">Type is fixed because sets are already logged. Add levels at the end so old sets keep their meaning.</p>` : ""}
  <div class="btns"><button class="btn go" data-act="saveex" ${editId ? `data-id="${esc(editId)}"` : ""}>Save exercise</button></div>`;
}

// Side menu for a day's session: which slots run, added exercises, and each slot's circle-method rotation.
function sessionDrawer() {
  const d = drawerDay ?? E.parse(E.today()).getDay(), plan = E.planFor(E.addDays(E.today(), (d - E.parse(E.today()).getDay() + 7) % 7));
  const slotRow = key => {
    const sl = SLOTS[key], st = E.slotState(key), ex = E.exById(st.current), si = E.stallInfo(ex.id), on = !plan.off.includes(key);
    const parked = (st.parked || []).map(id => E.exById(id).name), sug = E.switchSuggestion(key);
    return `<div class="dw-slot ${on ? "" : "off"}"><div class="row between"><span class="lab">${esc(sl.label)}</span>
      <label class="row small"><input type="checkbox" data-ch="slotoff" data-id="${key}" ${on ? "checked" : ""} style="width:20px;height:20px"> In session</label></div>
      <b>${esc(ex.name)}</b> ${si.stalled ? `<span class="pill warn">Stalled</span>` : si.weeks ? `<span class="pill ok">Progressing</span>` : ""}
      <div class="small muted">${si.weeks ? `${si.weeks} week${si.weeks === 1 ? "" : "s"} logged` : "Not trained yet"}${parked.length ? ` · parked: ${esc(parked.join(", "))}` : ""}</div>
      <div class="btns" style="margin-top:6px">${sug ? `<button class="btn sm ${si.stalled ? "go" : ""}" data-act="circle" data-id="${key}" data-ex="${sug.id}" data-stay="1">Rotate to ${esc(sug.name)}</button>` : ""}<button class="btn sm" data-act="go" data-id="train/pick/${key}">Swap</button></div></div>`;
  };
  return `<div class="dw-scrim" data-act="drawer"></div><aside class="drawer" aria-label="Session settings">
    <div class="row between"><div><div class="hdr">Session settings</div><h3 style="margin:2px 0 0">${esc(plan.name)}</h3></div><button class="rbtn" data-act="drawer" aria-label="Close">${ic("x")}</button></div>
    <div class="chips" style="margin-top:8px">${P.WEEK_ORDER.map(x => `<button class="chip" data-act="dwday" data-id="${x}" aria-pressed="${x === d}">${P.DAY_NAMES[x]}</button>`).join("")}</div>
    <h2>Circle method</h2>
    <p class="tiny muted">Progress one exercise per slot until it stalls 2 weeks, then rotate to a weaker one in the same area. The old one is parked and comes back next circle.</p>
    ${plan.allSlots.map(slotRow).join("")}
    <h2>Added to this session</h2>
    ${plan.extra.length ? plan.extra.map(id => `<div class="item row between"><span>${esc(E.exById(id).name)}</span><button class="btn sm" data-act="rmextra" data-id="${id}" aria-label="Remove">${ic("x")}</button></div>`).join("") : `<p class="small muted">Nothing extra.</p>`}
    <div class="btns"><button class="btn" data-act="go" data-id="train/pick/add-${d}">+ Add exercise</button><button class="btn" data-act="go" data-id="train/pick/browse">Library</button></div>
  </aside>`;
}

function vRuns() {
  const runs = live("runs").sort((a, b) => b.date.localeCompare(a.date));
  const longest = Math.max(0, ...runs.map(r => r.km));
  return `<button class="back" data-act="back">${ic("left")} Back</button><h1>Runs</h1>
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
  <div class="panel">${runs.length ? runs.map(r => `<div class="item row between"><div><b>${r.km} km</b> in ${E.fmtTime(r.sec)} <span class="small muted">· ${E.fmtTime(E.pace(r))}/km · feel ${r.feel}/5${r.pr ? " · PR" : ""}</span><div class="small muted">${E.fmtDate(r.date)}${r.note ? " · " + esc(r.note) : ""}</div></div><button class="btn sm danger" data-act="delrun" data-id="${r.id}" aria-label="Delete run">${ic("x")}</button></div>`).join("") : `<p class="empty">No runs yet.</p>`}</div>`;
}

/* ================= IMAGES ================= */
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
  return `<button class="back" data-act="nav" data-id="home">${ic("left")} System</button><h1>More</h1>
  <div class="panel"><h3>Sync and backup</h3>${Sync.panelHtml(esc)}</div>
  <div class="panel"><h3>Export</h3>
    <p class="small muted">One JSON file, <code>export-YYYY-MM-DD.json</code>, for your /exports folder. Flashcard images and recordings are in the file; check-in photos and the copied text leave media out.${st.lastExportAt ? " Last export: " + E.fmtDate(st.lastExportAt.slice(0, 10)) + "." : ""}</p>
    <div class="btns"><button class="btn primary" data-act="export">Export file</button><button class="btn" data-act="exportcopy">Copy JSON</button></div>
    <div id="exportBox"></div>
  </div>
  <div class="panel"><h3>Import</h3>
    <p class="small muted">Merges an export into this device. Nothing is deleted; the newer copy of each record wins. A backup is kept first.</p>
    <input type="file" accept="application/json,.json" data-ch="import">
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
  <p class="tiny muted" style="text-align:center;margin-top:16px">Kofu to Shinjuku · v2.4 · data schema ${S.schemaVersion}</p>`;
}

function download(name, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
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
  if (a === "habit" || a === "care" || a === "taskdone") popId = id;
  switch (a) {
    case "nav": drawer = false; return go(id);
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
    case "circle": E.setSlot(id, el.dataset.ex, true); save(); toast("Rotated. The old exercise is parked for the next circle."); return el.dataset.stay ? render() : go("train/log/" + el.dataset.ex);
    case "drawer": drawer = !drawer; if (drawer) drawerDay = null; return render();
    case "dwday": drawerDay = +id; return render();
    case "addextra": case "rmextra": {
      const d = a === "addextra" ? +el.dataset.slot.slice(4) : (drawerDay ?? E.parse(E.today()).getDay());
      const cfg = S.settings.sessions[d] = { off: [], extra: [], ...(S.settings.sessions[d] || {}) };
      cfg.extra = a === "addextra" ? [...new Set([...cfg.extra, id])] : cfg.extra.filter(x => x !== id);
      touchSettings(); save();
      if (a === "addextra") { toast(E.exById(id).name + " added to " + P.DAY_NAMES[d]); drawer = true; drawerDay = d; return go("train"); }
      return render();
    }
    case "exinfo": return go("train/ex/" + id);
    case "delex": {
      const ex = E.exById(id), n = E.history(id).length;
      if (!confirm(`Delete ${ex.name}?${n ? ` Its ${n} logged session${n === 1 ? "" : "s"} stay in your history.` : ""}`)) return;
      const cur = live("exercises").find(x => x.id === id);
      put("exercises", { ...(cur || { id }), hidden: true });
      for (const k of Object.keys(SLOTS)) { const st = E.slotState(k); if (st.current === id) { const nx = E.switchSuggestion(k); put("areaState", { id: k, current: nx ? nx.id : SLOTS[k].def, parked: (st.parked || []).filter(x => x !== id) }); } else if ((st.parked || []).includes(id)) put("areaState", { ...st, parked: st.parked.filter(x => x !== id) }); }
      for (const cfg of Object.values(S.settings.sessions)) if (cfg.extra) cfg.extra = cfg.extra.filter(x => x !== id);
      touchSettings(); save(); toast("Deleted. Restore it from the library."); return go("train");
    }
    case "restoreex": { const cur = live("exercises").find(x => x.id === id); if (cur) { const { hidden, ...rest } = cur; put("exercises", rest); save(); } return render(); }
    case "swap": E.setSlot(el.dataset.slot, id, true); save(); return go("train");
    case "open": return go("train/log/" + id);
    case "saveex": {
      const f = readForm("#newEx"); if (!f.name) return toast("Add a name");
      const levels = f.levels ? f.levels.split(",").map(s => s.trim()).filter(Boolean) : null;
      if (id) {
        const cur = live("exercises").find(x => x.id === id) || { id }, kind = E.history(id).length ? E.exById(id).kind : f.kind;
        const rec = { ...cur, name: f.name, area: f.area, kind, rank: +f.rank || 2 };
        if (kind !== "load") rec.levels = levels && levels.length ? levels : E.exById(id).levels || [kind === "time" ? "Hold" : "Standard"];
        put("exercises", rec); save(); toast("Saved"); return history.back();
      }
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

    // command bar
    case "cmdrun": return cmdRun($("[data-cmd]")?.value || "");
    case "cmdex": return cmdRun(id);
    case "cmdscope": cmd.prop.scope = id; return render();
    case "cmdapply": return cmdApply();
    case "cmdcancel": cmd.prop = null; return render();
    case "cmdmic": return cmdMic();
    case "cmdundo": {
      for (const x of (cmd.undo || []).slice().reverse()) x.old ? put(x.k, { ...x.old }) : remove(x.k, x.id);
      save(); cmd.undo = null; cmd.done = "Undone."; return render();
    }

    // rewards
    case "wishform": wishForm = id && wishForm !== id ? id : null; render(); if (wishForm) $("#wishForm")?.scrollIntoView({ block: "center" }); return;
    case "savewish": {
      const f = readForm("#wishForm"), price = num(f.price);
      if (!f.name) return toast("Name it"); if (price === null || price < 0) return toast("Add the price");
      const old = id ? live("wishlist").find(x => x.id === id) : null;
      const xp = num(f.xp) > 0 ? Math.round(num(f.xp)) : E.suggestXp(price);
      put("wishlist", { ...(old || { bought: null }), name: f.name, price: Math.round(price), xp, kind: f.kind, link: f.link });
      wishForm = null; save(); toast(`${f.name}: ${xp.toLocaleString("en-US")} XP`); return render();
    }
    case "delwish": if (confirm("Delete this wishlist item?")) { remove("wishlist", id); wishForm = null; save(); render(); } return;
    case "buywish": {
      const w = live("wishlist").find(x => x.id === id); if (!w) return;
      if (St.openPenalties().length) return toast("Shop locked: clear your penalty quest first");
      const wallet = E.xpWallet(), fb = E.funBudget();
      const cost = E.xpPrice(w);
      if (wallet < cost || fb.left < w.price) return toast("Not unlocked yet");
      const mp = E.moneyPlan(), after = Math.max(0, mp.goal - (mp.bank - w.price)) / mp.weeks;
      if (!confirm(`Buy ${w.name} for ${yen(w.price)}?

Spends ${cost} XP (${(wallet - cost).toLocaleString("en-US")} left) and ${yen(w.price)} of fun budget.
Weekly saving needed for ${yen(mp.goal)}: ${yen(mp.saveWeek)} → ${yen(after)}.`)) return;
      put("wishlist", { ...w, bought: { date: E.today(), xp: cost, yen: w.price } }); save();
      toast(`Claimed: ${w.name}. Enjoy it, you earned it.`, true); return render();
    }
    case "unbuy": { const w = live("wishlist").find(x => x.id === id); if (!w || !confirm("Undo this purchase? XP and budget come back.")) return; put("wishlist", { ...w, bought: null }); save(); return render(); }

    // social
    case "personform": personForm = true; sheet = "person"; render(); $("#personForm input")?.focus(); return;
    case "addperson": {
      const f = readForm("#personForm"); if (!f.name) return toast("Add a name");
      const p = put("people", { name: f.name, type: f.type, where: f.where, scores: {}, every: null, note: "" });
      personForm = false; save(); return go("social/p/" + p.id);
    }
    case "score": {
      if (id === "me") {
        const c = el.dataset.c, n = +el.dataset.n, sc = { ...selfScores() }, L0 = ladder();
        if (sc[c] === n) delete sc[c]; else sc[c] = n;
        S.settings.social.self = sc; S.settings.social.selfAt = E.today(); touchSettings(); save();
        const L1 = ladder(); if (L0.opp && L1.cleared.some(x => x.p.id === L0.opp.p.id)) toast(`Cleared ${L0.opp.p.name}. ${L1.opp ? `Next opponent: ${L1.opp.p.name}` : "Ladder cleared."}`);
        return render();
      }
      const p = live("people").find(x => x.id === id); if (!p) return;
      const c = el.dataset.c, n = +el.dataset.n, sc = { ...(p.scores || {}) };
      if (sc[c] === n) delete sc[c]; else sc[c] = n;
      const before = rankOf(p).r; p.scores = sc; put("people", p); save();
      const after = rankOf(p).r; if (after !== before && after !== "?") toast(`${p.name}: rank ${after}`);
      return render();
    }
    case "delperson": {
      const p = live("people").find(x => x.id === id); if (!p || !confirm(`Delete ${p.name}? Hangouts stay, without their name.`)) return;
      remove("people", id); save(); return go("social");
    }
    case "hangwith": hangSel = [id]; return go("social/log");
    case "addhang": {
      const f = readForm("#hangForm"), ids = [...document.querySelectorAll("#hpeople [aria-pressed=true]")].map(b => b.dataset.id);
      if (!ids.length) return toast("Pick who you were with");
      if (!f.date) return toast("Pick a date");
      const h = put("hangouts", { date: f.date, people: ids, what: f.what, note: f.note });
      const ppl = live("people"), social = ids.some(i => { const p = ppl.find(x => x.id === i); return p && p.type !== "partner"; });
      const gains = social ? [E.gainXP("social", "hang:" + h.id, "Hangout")] : [];
      if (social && !E.habitDone("friend", f.date)) put("habitLog", { date: f.date, habit: "friend", auto: true });
      hangSel = null; save(); announce(gains); if (!gains.length) toast("Logged"); return render();
    }
    case "delhang": if (confirm("Delete this hangout?")) { E.revokeXP("hang:" + id); remove("hangouts", id); save(); render(); } return;

    // shell: settings sheet, morning brief, backgrounds
    case "sheet": sheet = id && sheet !== id ? id : null; if (!sheet) { taskForm = null; blockForm = null; blockNew = null; personForm = false; } return render();
    case "brief": briefOpen = true; return render();
    case "briefclose": briefOpen = false; try { localStorage.setItem(BRIEF_KEY, E.today()); } catch (e) {} return render();
    case "glass": {
      if (G.live()) { G.stopGlass(); return render(); }
      const err = await G.startGlass(why => { if (why) toast(why); render(); });
      toast(err || `Glass mode on for ${G.cfg().mins} min`); return render();
    }
    case "glasslens": await G.nextLens(); return render();
    case "bgclear": await G.clearPhoto(); return render();
    case "glassreset": { const d = G.DEFAULTS; G.setCfg({ blur: d.blur, dim: d.dim, zoom: d.zoom, y: d.y }); return render(); }

    // study blocks
    case "pomo": {
      const g = St.focusGate(); if (!g.open) return render();
      if (id === "start" && typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().catch(() => {});
      St.pomoAct(St.occKey(g.o), id); return render();
    }
    case "blockreport": case "topicdone": {
      const g = St.focusGate(); if (!g.open) return render();
      const o = g.o, subj = St.subjectOf(o.b), top = subj && St.current(subj), p = St.pomo(St.occKey(o));
      const rest = top ? 100 - St.progress(subj, top.id) : 0;
      if (a === "topicdone") {
        if (!top || !confirm(`Mark ${top.t} as finished and move to the next topic?`)) return;
        const r = St.report(o, { subj, topic: top.id, gain: rest, final: false }); save(); announce(r.gains); return render();
      }
      const done = id === "done", gain = id === "rest" ? rest : done ? 0 : +id;
      if (!done && !gain && !p.n && !confirm("Report this block as not done? It counts as skipped: penalty.")) return;
      const r = St.report(o, { subj, topic: top ? top.id : null, gain, poms: p.n, done });
      save(); announce(r.gains); if (!r.gains.filter(Boolean).length) toast("Reported"); return render();
    }
    case "delreport": if (confirm("Delete this report? If the block is still within the last week, it'll count as skipped.")) { remove("blockLog", id); save(); render(); } return;
    case "topicedit": topicEdit = id || null; return render();
    case "savetopics": {
      const L = St.parseTopics(id, $("[data-f=topics]").value);
      if (!L.length) return toast("Add at least one topic");
      S.settings.study.topics = { ...(S.settings.study.topics || {}), [id]: L }; topicEdit = null; touchSettings(); save(); toast("Topics saved"); return render();
    }
    case "resettopics": {
      if (!confirm("Go back to the built-in topic list? Progress on topics with the same name is kept.")) return;
      const t = { ...(S.settings.study.topics || {}) }; delete t[id]; S.settings.study.topics = Object.keys(t).length ? t : null;
      topicEdit = null; touchSettings(); save(); return render();
    }

    // plan
    case "pday": planDate = id === E.today() ? null : id; entering = true; return render();
    case "taskdone": {
      const k = live("tasks").find(x => x.id === id); if (!k) return;
      if (sheet && sheet.startsWith("task")) sheet = null;
      put("tasks", { ...k, done: true, doneAt: Date.now() });
      if (k.penalty) { save(); toast(St.openPenalties().length ? "Penalty quest cleared" : "Penalty cleared. Shop unlocked."); return render(); }
      const ref = "task:" + id, gains = live("xpEvents").some(e => e.ref === ref) ? [] : [E.gainXP("task", ref, k.title)];
      save(); announce(gains); if (!gains.length) toast("Done"); return render();
    }
    case "taskundo": { const k = live("tasks").find(x => x.id === id); if (!k) return; E.revokeXP("task:" + id); put("tasks", { ...k, done: false, doneAt: null }); save(); return render(); }
    case "newtask": taskForm = "new"; sheet = "task"; render(); $("#taskForm input")?.focus(); return;
    case "taskform": if (!id) { taskForm = null; sheet = null; return render(); } taskForm = id; sheet = "task:" + id; return render();
    case "tipx": { const t = tipsSeen(); t[id] = 1; try { localStorage.setItem(TIP_KEY, JSON.stringify(t)); } catch (e) {} return render(); }
    case "newblockat": {
      const r = el.getBoundingClientRect(), m = Math.max(0, Math.min(23 * 60, Math.floor((ev.clientY - r.top) / 26 * 2) * 30));
      const st = P.toHM(m), en = P.toHM(Math.min(23 * 60 + 59, m + 60));
      blockNew = { title: "", kind: "other", days: [], date: id, start: st, end: en, locked: false };
      blockForm = "new"; sheet = "block"; return render();
    }
    case "savetask": {
      const f = readForm("#taskForm"); if (!f.title) { toast("Name the task"); return $("#taskForm input")?.focus(); }
      const old = id ? live("tasks").find(x => x.id === id) : null;
      const k = put("tasks", { ...(old || { done: false, created: Date.now(), pin: null }), title: f.title, mins: +f.mins, prio: +f.prio, energy: f.energy, due: f.due || null });
      if (old && old.mins !== k.mins && k.pin) { k.pin = null; put("tasks", k); }
      taskForm = null; sheet = null; save();
      const at = P.plan().at.get(k.id);
      toast(at ? `Planned: ${dayLabel(at.date)} ${P.toHM(at.s)}${at.late ? " (after deadline)" : ""}` : "No free slot in the next 2 weeks");
      return render();
    }
    case "deltask": if (live("tasks").find(x => x.id === id)?.penalty) return toast("Penalty quests can't be deleted. Do it to clear it.");
      if (confirm("Delete this task?")) { remove("tasks", id); taskForm = null; sheet = null; save(); render(); } return;
    case "pin": case "unpin": {
      const k = live("tasks").find(x => x.id === id); if (!k) return;
      const at = a === "pin" ? P.plan().at.get(id) : null;
      put("tasks", { ...k, pin: at ? { date: at.date, start: P.toHM(at.s) } : null }); sheet = null; save(); toast(at ? "Pinned to " + dayLabel(at.date) + " " + P.toHM(at.s) : "Unpinned"); return render();
    }
    case "blockform": { const lk = id && id !== "new" && blockForm !== id && P.editLock(live("blocks").find(x => x.id === id)); if (lk) return toast(`Locked: starts or runs ${P.toHM(lk.s)}–${P.toHM(lk.e)}. Edit after ${P.toHM(lk.until)}.`); }
      blockForm = id || null; blockNew = null; sheet = blockForm ? "block" : null; return render();
    case "bday": el.setAttribute("aria-pressed", el.getAttribute("aria-pressed") !== "true"); return;
    case "saveblock": {
      const f = readForm("#blockForm"), locked = $("#blockForm [data-f=locked]").checked;
      const days = [...document.querySelectorAll("#bdays [aria-pressed=true]")].map(b => +b.dataset.id);
      if (!f.title) return toast("Name the block");
      if (!f.start || !f.end || f.start === f.end) return toast("Set a start and an end");
      if (!days.length && !f.date) return toast("Pick days or a date");
      const old = id ? live("blocks").find(x => x.id === id) : null;
      if (P.editLock(old)) return toast("Locked until this block ends");
      if (old && old.locked && !confirm(`"${old.title}" is locked. Change it anyway?`)) return;
      put("blocks", { ...(old || {}), title: f.title, kind: f.kind, days: f.date ? [] : days, date: f.date || null, start: f.start, end: f.end, locked });
      blockForm = null; sheet = null; save(); toast("Timetable updated. Tasks re-planned."); return render();
    }
    case "delblock": {
      const b = live("blocks").find(x => x.id === id); if (!b) return;
      if (P.editLock(b)) return toast("Locked until this block ends");
      if (!confirm(b.locked ? `"${b.title}" is locked. Delete it anyway?` : `Delete "${b.title}"?`)) return;
      remove("blocks", id); blockForm = null; sheet = null; save(); return render();
    }
    case "ics": { await download("kofu-to-shinjuku.ics", P.ics(), "text/calendar"); return toast("Calendar file ready"); }
    case "wdnotify": {
      const wd = S.settings.windDown;
      if (wd.notify && Notification.permission === "granted") wd.notify = false;
      else { const r = await Notification.requestPermission(); wd.notify = r === "granted"; if (r !== "granted") toast("Notifications not allowed"); }
      touchSettings(); save(); scheduleWindDown(); return render();
    }

    // flashcards
    case "bulk": bulkOpen = !bulkOpen; return render();
    case "bulkadd": {
      const f = readForm("#bulkForm"), list = K.parseBulk(f.bulk), deck = f.deck || lastDeck();
      if (!list.length) return toast("One card per line: front | back");
      const n = K.addCards(list, deck); setLastDeck(deck); bulkOpen = false; save();
      toast(`${n} card${n === 1 ? "" : "s"} added to ${deck}${n < list.length ? ` · ${list.length - n} already there` : ""}`); return render();
    }
    case "starter": { const n = K.addCards(STARTER[id], id, starterIds(id)); save(); toast(`${id}: ${n} cards added`); return render(); }
    case "newcardin": newDeck = id; return go("cards/edit/new");
    case "cardsave": {
      const f = readForm("#cardForm"), deck = f.deck || lastDeck(); if (!f.front || !f.back) return toast("Fill in both sides");
      const c = live("cards").find(x => x.id === cardForm.id);
      if (K.inDeck(deck).some(x => x.id !== cardForm.id && x.front.trim() === f.front)) return toast("That front is already in " + deck);
      if (c) put("cards", { ...c, front: f.front, back: f.back, deck, ja: K.JA_RE.test(f.front) || K.JA_RE.test(f.back), img: cardForm.img, aud: cardForm.aud });
      else put("cards", K.newCard({ id: cardForm.id, deck, front: f.front, back: f.back, img: cardForm.img, aud: cardForm.aud }));
      setLastDeck(deck); save(); toast(c ? "Saved" : "Card added");
      if (c) return go("cards/deck/" + encodeURIComponent(deck));
      cardForm = null; render(); return $("#cardForm [data-f=front]")?.focus(); // stay for the next card
    }
    case "cardcancel": {
      if (cardForm && cardForm.isNew) for (const m of [cardForm.img, cardForm.aud]) if (m) await photos.del(m).catch(() => {});
      const c = cardForm && live("cards").find(x => x.id === cardForm.id);
      return go(c ? "cards/deck/" + encodeURIComponent(c.deck) : "cards");
    }
    case "carddel": {
      const c = live("cards").find(x => x.id === cardForm?.id); if (!c || !confirm("Delete this card?")) return;
      await K.deleteCard(c); save(); toast("Card deleted"); return go("cards/deck/" + encodeURIComponent(c.deck));
    }
    case "cardimgdel": case "cardauddel": {
      keepCardForm(); const key = a === "cardimgdel" ? "img" : "aud", m = cardForm[key]; if (m) await photos.del(m).catch(() => {});
      cardForm[key] = null; const c = live("cards").find(x => x.id === cardForm.id); if (c) { c[key] = null; put("cards", c); save(); }
      return render();
    }
    case "recstart": return recStart();
    case "recstop": keepCardForm(); recorder && recorder.stop(); return;
    case "say": { const c = live("cards").find(x => x.id === id); if (c && !K.speak(K.jaText(c))) toast("No Japanese voice on this phone"); return; }
    case "rvpick": {
      const c = rv && live("cards").find(x => x.id === rv.id); if (!c || rv.pick != null) return;
      rv.pick = +id; announce(K.answerMcq(c, rv.opts[+id] === c.back.trim())); save(); return render();
    }
    case "rvnext": rv = null; return render();
    case "rvflip": if (rv) rv.flip = true; return render();
    case "rvgrade": {
      const c = rv && live("cards").find(x => x.id === rv.id); if (!c) return;
      announce(K.answerFlip(c, +id)); rv = null; save(); return render();
    }

    // jlpt
    case "jlptlvl": S.settings.jlpt.level = id; touchSettings(); save(); jq = null; return render();
    case "jqpick": {
      if (!jq || jq.pick != null) return; const it = J.bank(jq.lvl).byId[jq.id];
      jq.pick = +id; jq.n++; const r = J.answer(jq.lvl, it, +id); if (r.ok) jq.ok++; jq.done = [...(jq.done || []), it.id];
      if (!r.ok) toast("Added to JLPT mistakes"); save(); return render();
    }
    case "jqnext": { const sec = jq && jq.sec; if (jq) { const nx = J.pick(jq.lvl, sec, jq); if (nx) { jq = { ...jq, id: nx.id, pick: null, p: nx.p || null, done: nx.p && nx.p === jq.p ? jq.done : [] }; } } render(); return window.scrollTo(0, 0); }
    case "exam": {
      if (!St.focusGate().open) return toast("Exams run inside a study block");
      const lvls = id === "place" ? ["N5", "N4", "N3"] : [J.level()], miss = lvls.filter(l => !J.bank(l));
      if (miss.length) { miss.forEach(l => J.load(l, () => toast("Questions loaded. Tap again"))); return toast("Loading questions…"); }
      const qs = id === "place" ? J.buildPlacement() : J.buildMock(J.level());
      exam = { kind: id, lvl: id === "place" ? "place" : J.level(), qs, i: 0, ans: Array(qs.length).fill(null), res: null };
      return go("jlpt/exam/" + id);
    }
    case "exampick": if (exam && !exam.res) { exam.ans[exam.i] = +id; render(); } return;
    case "exammove": if (exam) { exam.i = Math.max(0, Math.min(exam.qs.length - 1, exam.i + +id)); render(); window.scrollTo(0, 0); } return;
    case "examsubmit": {
      if (!exam) return; const left = exam.ans.filter(x => x == null).length;
      if (left && !confirm(`${left} unanswered. They count as wrong. Submit?`)) return;
      exam.res = J.finish(exam.kind, exam.lvl, exam.qs, exam.ans); touchSettings(); save(); render(); return window.scrollTo(0, 0);
    }
    case "examquit": {
      if (exam && !exam.res && !confirm("Quit this exam? Nothing is saved.")) return;
      exam = null; return go("jlpt");
    }

    // more
    case "export": case "exportcopy": {
      const o = exportObject(), name = `export-${E.today()}.json`;
      S.settings.lastExportAt = o.exportedAt; touchSettings(); save();
      // The file carries flashcard images and recordings (they never sync); the copied text leaves them out.
      if (a === "export") { o.media = await K.mediaExport(); await download(name, JSON.stringify(o, null, 1)); toast("Exported " + name); return; }
      const txt = JSON.stringify(o, null, 1);
      { let ok = false; try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {} $("#exportBox").innerHTML = `<textarea readonly style="min-height:120px;margin-top:8px;font-size:12px">${esc(txt)}</textarea>`; toast(ok ? "Copied" : "Select the text and copy it"); }
      return;
    }
    default: if (Sync.handle(a, el, { render, toast })) return;
  }
});


document.addEventListener("input", ev => {
  if (ev.target.matches("[data-tune]")) { const k = ev.target.dataset.tune, v = +ev.target.value; G.setCfg({ [k]: v }); const o = ev.target.nextElementSibling; if (o) o.textContent = v + ({ blur: "px", zoom: "×", y: "%" }[k] || ""); return; } if (ev.target.matches("[data-cmd]")) cmd.text = ev.target.value; });
document.addEventListener("keydown", ev => { if (ev.key === "Enter" && ev.target.matches("[data-cmd]")) { ev.preventDefault(); cmdRun(ev.target.value); } });
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
  if (k === "billamt") { const b = live("bills").find(x => x.id === el.dataset.id); if (!b) return; b.amount = num(el.value); put("bills", b); save(); return render(); }
  if (k === "moneygoal" || k === "debtstart") { const v = num(el.value); if (v === null || v < 0) return render(); S.settings.money[k === "moneygoal" ? "goal" : "debtStart"] = v; touchSettings(); save(); return render(); }
  if (k === "funmonthly" || k === "funrate") { const v = num(el.value); if (v === null || v < (k === "funrate" ? 1 : 0)) return render(); S.settings.fun[k === "funmonthly" ? "monthly" : "yenPerXp"] = Math.round(v); touchSettings(); save(); return render(); }
  if (k === "ptype" || k === "pevery" || k === "pwhere" || k === "pnote") {
    const p = live("people").find(x => x.id === el.dataset.id); if (!p) return;
    if (k === "ptype") p.type = el.value;
    if (k === "pevery") p.every = el.value === "" ? null : Math.max(0, Math.round(num(el.value) || 0));
    if (k === "pwhere") p.where = el.value.trim();
    if (k === "pnote") p.note = el.value;
    put("people", p); save(); return k === "pnote" || k === "pwhere" ? undefined : render();
  }
  if (k === "criteria") { const list = el.value.split("\n").map(x => x.trim()).filter(Boolean); if (!list.length) return render(); S.settings.social.criteria = [...new Set(list)]; touchSettings(); save(); return render(); }
  if (k === "wdon") { S.settings.windDown.on = el.checked; touchSettings(); save(); scheduleWindDown(); return render(); }
  if (k === "wdmins") { const v = num(el.value); if (v === null || v < 0 || v > 240) return render(); S.settings.windDown.mins = Math.round(v); touchSettings(); save(); scheduleWindDown(); return render(); }
  if (k === "bgphoto") { const f = el.files[0]; if (!f) return; await G.setPhoto(await shrink(f)); toast("Background set"); return render(); }
  if (k === "glassfull") { G.setCfg({ full: el.checked }); return; }
  if (k === "glassmins") { const v = num(el.value); if (v === null || v < 1 || v > 60) return render(); G.setCfg({ mins: Math.round(v) }); return render(); }
  if (k === "cardsnew") { const v = num(el.value); if (v === null || v < 0 || v > 200) return render(); S.settings.cards.newPerDay = Math.round(v); touchSettings(); save(); return render(); }
  if (k === "cardimg") {
    const file = el.files[0]; if (!file || !cardForm) return; keepCardForm();
    const mid = "cm-" + cardForm.id; await photos.put(mid, await shrink(file)); cardForm.img = mid;
    const c = live("cards").find(x => x.id === cardForm.id); if (c) { c.img = mid; put("cards", c); save(); }
    return render();
  }
  if (k === "studynum") { const v = num(el.value), id = el.dataset.id; if (v === null || v < (id === "penaltyXp" || id === "grace" ? 0 : 1) || v > 500) return render(); S.settings.study[id] = Math.round(v); touchSettings(); save(); return render(); }
  if (k === "planmin") { const v = num(el.value); if (v === null || v < 0 || v > 120) return render(); S.settings.plan[el.dataset.id] = Math.round(v); touchSettings(); save(); return render(); }
  if (k === "slotoff") {
    const d = drawerDay ?? E.parse(E.today()).getDay(), cfg = S.settings.sessions[d] = { off: [], extra: [], ...(S.settings.sessions[d] || {}) };
    cfg.off = el.checked ? cfg.off.filter(x => x !== el.dataset.id) : [...new Set([...cfg.off, el.dataset.id])];
    touchSettings(); save(); return render();
  }
  if (k === "dayStart" || k === "dayEnd") { if (!el.value) return render(); S.settings.plan[k] = el.value; touchSettings(); save(); return render(); }
  if (k === "htarget") { S.settings.habitTargets[el.dataset.id] = Math.max(0, Math.min(7, Math.round(num(el.value) || 0))); touchSettings(); save(); return; }
  if (k === "chance") { S.settings.rewardChance = Math.max(0, Math.min(100, num(el.value) || 0)) / 100; touchSettings(); save(); return; }
  if (k === "pool") { S.settings.rewardPool = el.value.split("\n").map(s => s.trim()).filter(Boolean); touchSettings(); save(); return; }
  if (k === "import") {
    const file = el.files[0]; if (!file) return;
    let o; try { o = JSON.parse(await file.text()); } catch (e) { return toast("That file isn't valid JSON"); }
    const err = validateImport(o); if (err) return toast(err);
    await importMerge(o); const nm = o.media ? await K.mediaImport(o.media) : 0;
    save(); toast("Imported and merged" + (nm ? ` · ${nm} card media` : "")); return render();
  }
});

/* ---------- boot ---------- */
// v1.15: the "Style" criterion became "Taste". Scores move across; nothing is dropped.
function renameStyle() {
  const so = S.settings.social, i = so.criteria.indexOf("Style");
  if (i < 0 || so.criteria.includes("Taste")) return;
  so.criteria[i] = "Taste";
  if (so.self && so.self.Style !== undefined) { so.self.Taste = so.self.Style; delete so.self.Style; }
  touchSettings();
  for (const p of live("people")) if (p.scores && p.scores.Style !== undefined) { const sc = { ...p.scores, Taste: p.scores.Style }; delete sc.Style; p.scores = sc; put("people", p); }
  save();
}
(async function boot() {
  await load();
  renameStyle();
  briefOpen = briefDue();
  entering = true; render();
  G.applyPhoto();
  Sync.init({ render, toast });
  // Penalties are judged a few seconds after start (so a sync can bring in work done on another phone) and every minute.
  setTimeout(() => { runAssess(); render(); }, 6000);
  setInterval(tickPomo, 1000);
  scheduleWindDown(); onSave(scheduleWindDown);
  // Keep "now" and the wind-down banner current, without wiping a form being filled in.
  setInterval(() => {
    runAssess();
    if (!briefOpen && document.visibilityState === "visible" && briefDue()) { briefOpen = true; render(); }
    const busy = document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if (document.visibilityState === "visible" && !busy && !sheet && !taskForm && !blockForm && !personForm && ["home", "plan"].includes(route()[0]) && !topicEdit) render();
  }, 60000);
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    // A new release takes over and reloads the page once, so updates show without a second restart.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && !window.__reloaded) { window.__reloaded = true; location.reload(); } });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(reg => {
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
    }).catch(() => {});
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush().catch(() => {}); });
})();
