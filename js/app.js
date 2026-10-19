import { S, load, save, flush, onSave, live, put, remove, touchSettings, photos, exportObject, validateImport, importMerge, uid } from "./store.js";
import { USAGE_APPS, HABITS, AREAS, SLOTS, RPE, RUN_GOAL_KM, LEVEL_XP, XP, RANKS, PERSON_TYPES, LIBRARY, SUBJECTS, SOCIAL_KEY, TRIALS, TOWER, EGO, RIVAL_ACT } from "./data.js";
import * as Ch from "./charts.js";
import * as E from "./engine.js";
import * as Sync from "./sync.js";
import * as P from "./planner.js";
import { ic } from "./icons.js";
import * as St from "./study.js";
import { px } from "./px.js";
import * as K from "./cards.js";
import { STARTER } from "./decks.js";
import * as J from "./jlpt.js";
import * as Soc from "./social.js";
import * as Sy from "./system.js";
import * as Cl from "./classes.js";
import * as Al from "./alarms.js";
import * as Us from "./usage.js";
import * as Pa from "./path.js";
import * as Ap from "./apps.js";
import * as Up from "./update.js";
import * as Lx from "./lexicon.js";
import * as N2 from "./n2.js";
import * as Dy from "./day.js";
import * as Dl from "./deadlines.js";
import * as Dr from "./drill.js";
import * as Rc from "./report.js";
import * as Sr from "./search.js";

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
  if (gains.length) { const cb = Sy.claimComeback(); if (cb) gains.push(cb); }
  if (!gains.length) return;
  const reward = gains.find(g => g.reward);
  const xp = gains.reduce((a, g) => a + g.xp, 0);
  if (reward) toast(`+${xp} XP · Reward unlocked: ${reward.reward}`, true);
  else toast(`+${xp} XP · ${gains.map(g => g.label).join(", ")}`);
}

/* ---------- routing ---------- */
const route = () => (location.hash.slice(1) || "home").split("/").map(decodeURIComponent);
const go = h => { location.hash = h; };
// Navigate, and still redraw when already on that screen (no hashchange fires then).
const goR = h => { if (location.hash.slice(1) === h) { entering = true; render(); } else go(h); };
let afterNav = null; // runs once after the next route change (e.g. open a form on the new screen)
// Swipes: the day header on Plan changes the day; anywhere else changes tab. Alerts close with their red dot.
// Sliders, fields and anything that scrolls sideways keep their own swipe.
let swipe0 = null;
function scrollsX(el) {
  for (; el && el !== document.body; el = el.parentElement) {
    if (el.matches("input,textarea,select,.pills,.chips,.carousel,[data-noswipe]")) return true;
    if (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
}
document.addEventListener("touchstart", e => {
  swipe0 = null; if (e.touches.length !== 1 || document.body.classList.contains("modal-open")) return;
  const x = e.touches[0].clientX, y = e.touches[0].clientY;
  if (e.target.closest("#dayline")) swipe0 = { kind: "day", x, y };
  else if (e.target.closest("#app") && !scrollsX(e.target)) swipe0 = { kind: "tab", x, y };
}, { passive: true });
document.addEventListener("touchend", e => {
  if (!swipe0) return; const s0 = swipe0, t = e.changedTouches[0], dx = t.clientX - s0.x, dy = t.clientY - s0.y; swipe0 = null;
  const horiz = Math.abs(dx) >= 60 && Math.abs(dx) >= Math.abs(dy) * 1.5;
  if (!horiz) return;
  if (s0.kind === "day") {
    const el = $("#dayline"), d = E.addDays(planDate || E.today(), dx < 0 ? 1 : -1);
    if (d < el.dataset.min || d > el.dataset.max) return;
    planDate = d === E.today() ? null : d; entering = true; render(); return;
  }
  const T = openTabs(), cur = T.findIndex(([k]) => k === (route()[0] || "home")), next = cur < 0 ? null : T[cur + (dx < 0 ? 1 : -1)];
  if (next) go(next[0]);
}, { passive: true });
window.addEventListener("hashchange", () => { if (location.hash === "#plan/people") { location.replace("#social"); return; } if (location.hash === "#plan/study") { location.replace("#study"); return; } if (location.hash.startsWith("#body")) { location.replace("#home"); return; } entering = true; sheet = null; draft = null; taskForm = null; blockForm = null; wishForm = null; personForm = false; hangSel = null; topicEdit = null; cardForm = null; rv = null; bulkOpen = false; if (!location.hash.startsWith("#jlpt/q")) jq = null; if (!location.hash.startsWith("#classes/q")) dq = null; chEdit = false; trialForm = null; battle = null; apForm = null; momentForm = null; if (recorder) recorder.stop(); if (afterNav) { afterNav(); afterNav = null; } render(); window.scrollTo(0, 0); });

// Four tabs (v2). System = what to do now (the Dungeon launches from here); Plan = when things happen (Day, Week, People);
// Store = money; Status = stats and skills. Body and Study are reached from System, not tabs.
// v4: five fixed slots. A slot stays empty until its stage unlocks; tabs never shift.
// v11: two tabs. Quests (opens with the app) and Notifications. Every other screen is reached by search or a quest.
const TABS = [["home", "Quests", "sword", 0], ["alerts", "Notifications", "bell", 0]];
const openTabs = () => TABS.filter(t => Sy.has(t[3]));
// Old links still land somewhere: the Dungeon is a Home state, Status is Profile, topics live in Study, People is a tab.
const REDIRECT = { dungeon: "home", status: "profile", skills: "profile", study: "classes", social: "people", more: "settings" };
// The stage each area needs. Locked areas are invisible, so a link to one lands on Home.
// v6: flashcards open at any stage and outside blocks.
const NEEDS = { focus: 1, train: 1, money: 2, classes: 3, jlpt: 0, people: 4 }; // v9.4: Japanese is open from day one
// The pixel icon in front of each screen's title.
const HEAD_PX = { lex: "scroll", drill: "sword", report: "star", path: "flag", home: "eye", alerts: "bell", settings: "gear", profile: "star", focus: "sword", cards: "scroll", jlpt: "flag", classes: "scroll", train: "sword", body: "flame", plan: "cal", people: "people", money: "coin" };
const TAB_OF = { drill: "home", report: "home", lex: "classes", path: "home", home: "home", alerts: "home", settings: "home", profile: "home", focus: "home", train: "home", body: "home", cards: "classes", jlpt: "classes", classes: "classes", plan: "plan", people: "people", money: "money" };
let entering = false, popId = null; // animation flags: page entrance, and the box just ticked
function render() {
  if (Sy.checkStage()) save();
  let [tab, ...rest] = route();
  if (REDIRECT[tab]) { tab = REDIRECT[tab]; history.replaceState(null, "", "#" + [tab, ...rest].join("/")); }
  if (NEEDS[tab] && !Sy.has(NEEDS[tab])) { tab = "home"; rest = []; history.replaceState(null, "", "#home"); }
  const views = { lex: r => r[0] === "sort" ? vSort(r[1], r[2]) : vLex(), path: r => r[0] === "gate" ? vGate(r[1]) : r[0] === "apps" ? vApps(r[1]) : r[0] === "res" ? vRes() : vPath(),  home: vHome, drill: vDrill, report: vReport, focus: vFocus, cards: vCards, jlpt: vJlpt, classes: vClasses, alerts: vAlerts, profile: vProfile, plan: vPlan, people: vSocial, train: vTrain, money: vMoney, settings: vSettings };
  const si = $("#srch"), keepS = si && document.activeElement === si ? { v: si.value, p: si.selectionStart } : null; // v11: typing survives a re-render
  $("#app").innerHTML = (views[tab] || vHome)(rest);
  if (keepS && $("#srch")) { const n = $("#srch"); n.value = keepS.v; n.focus(); try { n.setSelectionRange(keepS.p, keepS.p); } catch (e) {} srUpdate(); }
  const fresh = Sy.pendingUnlock();
  const nA = alertList().length;
  $("#nav").innerHTML = TABS.map(([k, l, icon]) => `<button data-act="nav" data-id="${k}" ${tab === k ? 'aria-current="page"' : ""}>${px(icon)}<span>${l}${k === "alerts" && nA ? `<b class="nbadge">${nA}</b>` : ""}</span></button>`).join("");
  if (tab === "home") dayCleared();
  document.body.dataset.tab = tab;
  document.body.classList.toggle("silent", jpsOn() && !!jps.silent);
  // v9.1: workout mode. The page turns deep navy while a workout runs, and back to red when it ends.
  const navy = homeState(E.today()).k === "body"; document.documentElement.classList.toggle("navy", navy);
  const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = navy ? "#0B1633" : "#E0211F";
  if (navy !== lastNavy) { lastNavy = navy; const C = window.Capacitor; if (C && C.isPluginAvailable && C.isPluginAvailable("Widget")) { const W = C.Plugins.Widget || C.registerPlugin("Widget"); if (W.bar) W.bar({ color: navy ? "#0B1633" : "#E0211F" }).catch(() => {}); } }
  const h1 = $("#app header.top h1") || $("#app > h1"); if (h1) h1.insertAdjacentHTML("afterbegin", px(HEAD_PX[tab] || "eye", "hpx"));
  const app = $("#app"), entering0 = entering;
  if (entering) { app.classList.remove("enter"); void app.offsetWidth; app.classList.add("enter"); entering = false; }
  else app.classList.remove("enter");
  if (popId) { document.querySelectorAll(`.bx[data-id="${CSS.escape(popId)}"]`).forEach(b => b.classList.add("pop")); popId = null; }
  // Window queue: at most one ceremony (unlock or milestone) per open, then the brief. Never over a sheet.
  const inDrill = tab === "drill" && Dr.running(); // v10: nothing pops over a running Drill
  const cer = !sheet && !inDrill ? ceremony() : null, brief = briefOpen && !cer && !sheet && !inDrill;
  $("#overlay").innerHTML = (brief ? briefHtml() : "") + (sheet ? sheetHtml(sheet) : "") + (cer ? (cer.unlock ? unlockHtml(cer.unlock) : cer.money ? moneyWinHtml() : cer.alarms ? alarmWinHtml() : cer.usage ? usageWinHtml() : cer.update ? updateWinHtml() : cer.awake ? awakeHtml() : cer.floor ? floorHtml(cer.floor) : cer.risk ? riskHtml(cer.risk) : milestoneHtml(cer.ms)) : "");
  $("#fab").innerHTML = ["plan", "people"].includes(tab) || (tab === "classes" && !rest.length) || (tab === "money" && !rest.length) ? `<button class="fab" data-act="sheet" data-id="add" aria-label="Add">${ic("plus")}</button>` : "";
  document.body.classList.toggle("modal-open", !!(brief || sheet || cer));
  document.body.classList.toggle("has-dbar", !!$("#app .dbar"));
  pushWidget();
  hydrate();
  if (tab === "settings" && rest[0] && entering0) { const d = document.querySelector(`[data-fold="set-${SET_SECTIONS[rest[0]] || rest[0]}"]`); if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ block: "start" }), 0); } }
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
// A System window: a titlebar with three dots (the red one closes alerts) and the message under it.
const win = (title, inner, cls = "", icon = "eye") => `<div class="sys win ${cls}"><div class="tb"><span class="tl"><i></i><i></i><i></i></span><span class="tt">${title}</span>${px(icon, "tpx")}</div><div class="wb">${inner}</div></div>`;
const sysBox = (body, sub, act) => win("System", `${body}${sub ? `<div class="x">${sub}</div>` : ""}${act || ""}`);

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
  const open = live("tasks").filter(k => !k.done && !k.trial && !k.path && p.at.get(k.id)?.date === t).map(k => ({ k, at: p.at.get(k.id) }));
  const doneT = live("tasks").filter(k => k.done && !k.trial && !k.path && k.doneAt && E.ymd(new Date(k.doneAt)) === t).map(k => ({ k, done: true }));
  const path = Pa.today(t); // v6: the Path's items, shown as their own line
  // Trials: placed today or due by today, plus any cleared today. They get their own section at the top.
  const trials = [...Soc.openTrials().filter(k => p.at.get(k.id)?.date === t || (k.due && k.due <= t)).map(k => ({ k })),
    ...Soc.trials().filter(k => k.done && k.doneAt && E.ymd(new Date(k.doneAt)) === t).map(k => ({ k, done: true }))];
  const events = [...open.sort((a, b) => (!!b.k.penalty - !!a.k.penalty) || a.at.s - b.at.s), ...doneT];
  const habits = HABITS.map(h => ({ h, on: !!E.habitDone(h.id, t) }));
  const call = live("xpEvents").some(e => e.ref === "call" && E.ymd(new Date(e.ts)) === t);
  // v8.1: the N2 plan's open grammar item, any time of day (no block). Done once any item is finished today.
  // It is the "jp" daily quest (finishing an item ticks it); Home names the item itself.
  const jc = N2.ready() ? N2.current() : null, jp = jc && !jc.gate ? jc.g : null;
  return { trials, events, habits, call, path, jp, done: doneT.length + path.done + trials.filter(x => x.done).length + habits.filter(x => x.on).length + (call ? 1 : 0), total: trials.length + events.length + path.total + habits.length + (call ? 1 : 0) };
}
const habitRow = ({ h, on }) => `<div class="q ${on ? "done" : ""}">
  <button class="bx" data-act="habit" data-id="${h.id}" aria-pressed="${on}" aria-label="${esc(h.name)} done today">${on ? ic("check") : ""}</button>
  <div class="grow"><div class="t">${esc(h.name)}</div><div class="small muted">${esc(h.note)} · ${E.habitWeekCount(h.id)}/${E.habitTarget(h.id)} this week</div></div>
  <div class="xp">+${XP.habit}</div></div>`;
const CALL_XP = 10;
const eventRow = ({ k, at, done }) => `<div class="q ${done ? "done" : ""} ${k.penalty ? "pen-q" : ""}">
  <button class="bx" data-act="${done ? "taskundo" : "taskdone"}" data-id="${k.id}" aria-pressed="${!!done}" aria-label="${esc(k.title)} done">${done ? ic("check") : ""}</button>
  <div class="grow"><div class="t">${k.penalty ? tag("pen", "Penalty") + " " : ""}${esc(k.title)}</div><div class="small muted">${done ? "done" : `${span(at.s, at.e)} · ${P.dur(k.mins)}`}</div></div>
  <div class="xp">${k.penalty ? "" : "+" + XP.task}</div></div>`;

// Home (v4): one hero, chosen by priority: a running Dungeon, an open block, a penalty, a comeback, then the next block.
// Below it, today's three most important quests. Everything else sits behind the bell, the gear or Profile.
const ENTER_KEY = "kts-entered";
const entered = () => { try { return JSON.parse(localStorage.getItem(ENTER_KEY)) || {}; } catch (e) { return {}; } };
function enter(key, on = true) { const m = entered(); if (on) m[key] = Date.now(); else delete m[key]; const ks = Object.keys(m).sort((x, y) => m[y] - m[x]).slice(0, 30); try { localStorage.setItem(ENTER_KEY, JSON.stringify(Object.fromEntries(ks.map(k => [k, m[k]])))); } catch (e) {} }
let moneyQuick = false, showAllQuests = false;
// What the hero is right now. Dungeons run from stage 1; before that a block is just time on the Plan.
function homeState(t = E.today()) {
  const d1 = Sy.has(1), fg = St.focusGate(), bg = P.trainGate(started(t)), en = entered();
  if (d1 && fg.open && (en[St.occKey(fg.o)] || fg.ended || St.pomo(St.occKey(fg.o)).run)) return { k: "study", g: fg };
  if (d1 && bg.open && (en["body:" + t] || bg.started)) return { k: "body", g: bg };
  if (d1 && fg.open) return { k: "open", kind: "study", g: fg };
  if (d1 && bg.open) return { k: "open", kind: "body", g: bg };
  if (d1 && St.openPenalties().length) return { k: "pen" };
  const cb = Sy.comeback(t); if (cb && !cb.claimed) return { k: "comeback", cb };
  return { k: "next" };
}
/* ---------- v8.2: Japanese quick start ---------- */
// 5, 15 or 30 minutes, filled in order: due reviews, today's new cards, the grammar item, fluency. Time up: XP and loot.
const JPS_KEY = "kts-jps";
let jps = (() => { try { const x = JSON.parse(localStorage.getItem(JPS_KEY)); return x && x.ends > Date.now() - 6 * 3600e3 ? x : null; } catch (e) { return null; } })();
function jpsSave() { try { jps ? localStorage.setItem(JPS_KEY, JSON.stringify(jps)) : localStorage.removeItem(JPS_KEY); } catch (e) {} }
const jpsOn = () => !!(jps && !jps.res);
const jpsLeft = () => jps ? Math.max(0, jps.ends - Date.now()) : 0;
function jpStart(m) {
  // v9: started during a class, it runs silent (no audio, dark page) with a "Back to class" exit.
  jps = { mins: m, at: Date.now(), ends: Date.now() + m * 60000, xp0: E.xpTotal(), n0: K.reviewedToday().n, d0: E.today(), silent: Dy.inClass() }; jpsSave();
  return goR(K.queue().length ? "cards/review" : "jlpt");
}
function jpEnd() {
  if (!jpsOn()) return;
  const loot = jps.mins >= 15 && Date.now() >= jps.ends ? Sy.rollLoot(E.today(), "jps-" + jps.at) : null; save();
  jps = { ...jps, res: { xp: Math.max(0, E.xpTotal() - jps.xp0), n: K.reviewedToday().n - (jps.d0 === E.today() ? jps.n0 : 0), loot: loot && loot.xp } }; jpsSave();
  toast(`Session over · +${jps.res.xp} XP`, true); goR("jlpt");
}
const jpsTimer = () => jpsOn() ? `<span class="hdr mono jps-t" id="jpsT">${mmss(jpsLeft())}</span>` : "";
// The quick start row (Home and the Japanese screen), or the running session's bar.
function jpQuick() {
  if (jpsOn()) return `<div class="row between jps-bar"><span class="small">${px("sword")} ${jps.silent ? "Silent · in class" : `Quick start · ${jps.mins} min`}</span><span class="row" style="gap:8px">${jpsTimer()}<button class="btn sm" data-act="jpend">${jps.silent ? "Back to class" : "End"}</button></span></div>`;
  return `<div class="jps-row">${[5, 15, 30].map(m => `<button class="btn sm ${m === 15 ? "go" : ""}" data-act="jpgo" data-id="${m}">${m} min</button>`).join("")}</div>`;
}
// v9 §4 and §7: a class gap shows its one finance item; the Outreach slot shows its goals.
function dayCard() {
  const nw = Dy.watchNow();
  if (nw) {
    const its = Dy.watchItems(), d = Dy.watchDone();
    return `<div class="panel daycard nwatch"><div class="row between"><span class="hdr">${px("eye")} Night watch · until ${P.toHM(nw.e)}</span><span class="small mono">${d.n} done${d.ahead ? ` · +50% · ${d.ahead} ahead` : ""}</span></div>
      <p class="tiny muted" style="margin:4px 0 6px">Shift work is done. The rest of the night is yours. Nothing here times out, so a customer can interrupt any time.${d.n < Dy.NW_AT ? ` ${Dy.NW_AT} items: +${Dy.NW_BONUS} XP.` : ""}</p>
      ${its.map(x => `<div class="item row between"><div class="grow"><b class="small">${esc(x.label)}</b><div class="small muted">${esc(x.t)}</div></div>${x.k ? `<button class="btn sm go" data-act="taskdone" data-id="${x.k.id}">Report</button>` : `<button class="btn sm go" data-act="pathahead" data-id="${x.s}">Go ahead</button>`}</div>`).join("") || `<div class="small muted">Both streams are waiting on a Gate Test.</div>`}
      ${Sy.has(NEEDS.jlpt) ? `<div class="btns"><button class="btn sm" data-act="jpgo" data-id="5">Break: 5 min Japanese</button></div>` : ""}</div>`;
  }
  const gp = Dy.gapNow();
  if (gp) {
    const gi = gp.fin ? Dy.gapItem() : null;
    if (gi) return `<div class="panel daycard"><div class="hdr">${px("coin")} Gap · until ${P.toHM(gp.e)}</div><div class="small" style="margin:4px 0 8px"><b>${esc(gi.label)}</b> · ${esc(gi.t)}</div>
      <div class="btns">${gi.k ? `<button class="btn sm go" data-act="taskdone" data-id="${gi.k.id}">Report</button>` : `<button class="btn sm go" data-act="pathahead" data-id="${gi.s}">Start · ${P.dur(gi.mins)}</button>`}</div></div>`;
    if (Sy.has(NEEDS.jlpt)) return `<div class="panel daycard"><div class="hdr">${px("coin")} Gap · until ${P.toHM(gp.e)}</div><div class="small" style="margin:4px 0 8px">Short gap: a few Japanese cards.</div><div class="btns"><button class="btn sm go" data-act="jpgo" data-id="5">5 min</button></div></div>`;
  }
  if (Dy.outreachNow()) {
    const og = Dy.outreachGoals();
    return `<div class="panel daycard"><div class="hdr">${px("flag")} Outreach</div>${og.length ? og.map(g => `<div class="item row between"><span class="grow small">${esc(g.t)}</span>${g.kind === "apps" ? (g.k ? `<button class="btn sm" data-act="taskdone" data-id="${g.k.id}">Report</button>` : `<button class="btn sm" data-act="pathahead" data-id="apps">Start</button>`) : `<button class="btn sm" data-act="nav" data-id="people">Open</button>`}</div>`).join("") : `<div class="small muted">No outreach goals today.</div>`}</div>`;
  }
  return "";
}
function vHome() {
  const t = E.today(), hs = homeState(t), q = todayQuests(t);
  const dungeon = hs.k === "study" || hs.k === "body";
  const head = `<header class="top"><div class="hihead" data-act="nav" data-id="profile" role="link" aria-label="Profile, level ${E.level()}"><div class="hdr">${E.fmtDate(t)}</div><h1>Hi, ${esc(S.settings.name || "Arin")}.</h1>${Cl.identity() ? `<div class="ident">${esc(Cl.identity())}</div>` : ""}
    ${dungeon ? "" : `<div class="hilv"><b>LV ${E.level()}</b><span class="hilv-bar"><i style="width:${E.levelProgress() * 100}%"></i></span><span>${Math.round((1 - E.levelProgress()) * LEVEL_XP)} XP to ${E.level() + 1}</span></div>`}</div></header>`;
  // Takeovers: a running Dungeon or workout replaces the list.
  if (dungeon) return `${head}${homeHero(hs, t)}<button class="quiet-row" data-act="questsall"><span class="grow">Quests ${q.done}/${q.total}</span><span class="chev">${ic("right")}</span></button>${showAllQuests ? questList(q) : ""}${dungeonBar(hs)}`;
  const hero = hs.k === "next" ? (Pa.running() ? homeHero(hs, t) : "") : homeHero(hs, t);
  return `${head}${searchBar()}${hero}${dayCard()}${questList(q)}`;
}
/* ---------- v11: search ---------- */
const searchBar = () => `<div class="srch" id="srchWrap"><label class="srch-box">${ic("search")}<span class="srch-in"><span class="srch-ghost" id="srchGhost" aria-hidden="true"></span><input id="srch" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="Search or jump to…" aria-label="Search features" role="combobox" aria-controls="srchList"></span></label><div class="srch-list" id="srchList" role="listbox"></div></div>`;
let srHits = [], srSel = 0;
const ACT_NEEDS = { moment: 4 };
function srNeed(it) { if (!it.route.startsWith("a:")) return NEEDS[it.route.split("/")[0]] || 0; return ACT_NEEDS[it.route.split(":")[1]] || 0; }
// Before typing: what fits now (a class gap, the Mental Math item, the next deadline step), then recent searches.
function srSuggest() {
  const out = [], add = it => { if (it && !out.some(x => x.route === it.route) && !(srNeed(it) && !Sy.has(srNeed(it)))) out.push(it); };
  if (Dy.gapNow()) add(Sr.byRoute("a:jpgo:5"));
  if (Pa.started() && (Pa.today().list || []).some(k => k.path.stream === "mental" && !k.done)) add(Sr.byRoute("a:drillgo:classic"));
  const d = Dl.active()[0], nx = d && Dl.nextSession(d.id); if (nx) add({ name: `${d.title}: ${Dl.sessionName(nx, d)}`, hint: "next step", route: "a:sheet:deadline:" + d.id, icon: "flag" });
  Sr.recent().slice(0, 2).forEach(r => add(Sr.byRoute(r)));
  ["a:jpgo:5", "drill", "plan", "report"].forEach(r => out.length < 4 && add(Sr.byRoute(r)));
  return out.slice(0, 4);
}
function srUpdate() {
  const inp = $("#srch"), list = $("#srchList"), gh = $("#srchGhost"); if (!inp || !list) return;
  const v = inp.value; srHits = v.trim() ? Sr.find(v, 6) : srSuggest(); srSel = Math.min(srSel, Math.max(0, srHits.length - 1));
  const rest = v ? Sr.complete(v, srHits[0]) : "";
  gh.innerHTML = rest ? `<span class="gh-t">${esc(v)}</span>${esc(rest)}` : "";
  list.innerHTML = (v.trim() ? "" : `<div class="srch-h">${srHits.length ? "Suggested" : ""}</div>`) + (srHits.map((it, i) => { const nd = srNeed(it), lk = nd && !Sy.has(nd);
    return `<button class="srch-it ${i === srSel ? "sel" : ""} ${lk ? "lk" : ""}" data-act="srgo" data-id="${i}" role="option" aria-selected="${i === srSel}">${px(it.icon || "eye")}<span class="grow"><b>${esc(it.name)}</b><span class="muted"> · ${lk ? `Locked · unlocks at stage ${nd}` : esc(it.hint)}</span></span></button>`; }).join("") || (v.trim() ? `<div class="srch-h">No match. Try a feature name.</div>` : ""));
}
function srRun(it) {
  if (!it) return;
  const nd = srNeed(it); if (nd && !Sy.has(nd)) return toast(`Locked · unlocks at stage ${nd}`);
  if (Sr.byRoute(it.route)) Sr.remember(it);
  const inp = $("#srch"); if (inp) { inp.value = ""; inp.blur(); }
  if (!it.route.startsWith("a:")) return goR(it.route);
  const [, a, ...idp] = it.route.split(":"), b = document.createElement("button");
  b.dataset.act = a; if (idp.join(":")) b.dataset.id = idp.join(":"); b.hidden = true; document.body.append(b); b.click(); b.remove();
}
function srFocus() { if (route()[0] !== "home") { afterNav = () => setTimeout(() => $("#srch")?.focus(), 0); go("home"); } else $("#srch")?.focus(); }
document.addEventListener("input", e => { if (e.target.id === "srch") { srSel = 0; srUpdate(); } });
document.addEventListener("focusin", e => { if (e.target.id === "srch") srUpdate(); });
document.addEventListener("keydown", e => {
  const inp = e.target.id === "srch" ? e.target : null;
  if (!inp) {
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || "") || document.activeElement?.isContentEditable;
    if (!typing && !document.body.classList.contains("modal-open") && !(Dr.running() && route()[0] === "drill") && (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k"))) { e.preventDefault(); srFocus(); }
    return;
  }
  const rest = inp.value ? Sr.complete(inp.value, srHits[0]) : "";
  if ((e.key === "Tab" || (e.key === "ArrowRight" && inp.selectionStart === inp.value.length)) && rest) { e.preventDefault(); inp.value = srHits[0].name; srUpdate(); }
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); srSel = (srSel + (e.key === "ArrowDown" ? 1 : -1) + srHits.length) % Math.max(1, srHits.length); srUpdate(); }
  else if (e.key === "Enter") { e.preventDefault(); srRun(srHits[srSel] || srHits[0]); }
  else if (e.key === "Escape") { inp.value = ""; inp.blur(); }
});
/* ---------- v11: today's quests, each one a way into its page ---------- */
// Days in a row this habit was done, ending today (or yesterday while today is still open).
function habitStreak(id) {
  let d = E.today(); if (!E.habitDone(id, d)) d = E.addDays(d, -1);
  let n = 0; while (E.habitDone(id, d) && n < 999) { n++; d = E.addDays(d, -1); }
  return n;
}
const HABIT_GO = { anki: "cards/review", jp: "jlpt", fin: () => Sy.has(NEEDS.classes) ? "classes" : "path", math: "drill", case: "path", gym: () => Sy.has(NEEDS.train) ? "train" : null };
const qRow = ({ done, box, title, sub, right, act, id, cls = "" }) => `<div class="q qr ${done ? "done" : ""} ${cls}">${box}
  ${act ? `<button class="grow tbtn" data-act="${act}" data-id="${esc(id)}"><div class="t">${title}</div>${sub ? `<div class="small muted">${sub}</div>` : ""}</button>` : `<div class="grow"><div class="t">${title}</div>${sub ? `<div class="small muted">${sub}</div>` : ""}</div>`}
  <div class="xp">${right}</div></div>`;
const tickBox = (act, id, on, label) => `<button class="bx" data-act="${act}" data-id="${id}" aria-pressed="${!!on}" aria-label="${esc(label)} done">${on ? ic("check") : ""}</button>`;
function questRows(q) {
  const t = E.today(), p = P.plan(), rows = [];
  if (jpsOn()) rows.push({ done: false, html: qRow({ box: `<span class="lockbox">${px("sword")}</span>`, title: "Japanese · in session", sub: `<span id="jpsT">${mmss(jpsLeft())}</span> left`, right: "", act: "go", id: "cards/review" }) });
  if (Pa.started()) {
    for (const g of Pa.gates().filter(g => g.retakeAt <= Date.now())) rows.push({ done: false, html: qRow({ box: `<span class="lockbox">${px("gate")}</span>`, title: `${tag("trial", "Gate")} Gate Test · ${esc(Pa.stream(g.stream).label)}`, sub: `${Math.round(Pa.GATE_PASS * 100)}% to pass`, right: `+${Pa.XP_GATE}`, act: "go", id: "path/gate/" + g.stream }) });
    for (const r of allRaids().filter(r => r.days <= 7).slice(0, 2)) rows.push({ done: false, html: qRow({ box: `<span class="lockbox">${px("skull")}</span>`, title: `${tag("raid", `Raid · ${r.days <= 0 ? "today" : r.days + "d"}`)} ${esc(r.name)}`, sub: "", right: "", act: "go", id: "path" }) });
  }
  for (const x of q.trials) rows.push({ done: !!x.done, html: trialRow(x.k, x.done) });
  for (const k of q.path.list) rows.push({ done: !!k.done, html: qRow({ done: k.done, box: tickBox(k.done ? "taskundo" : "taskdone", k.id, k.done, k.title), title: esc(Pa.stream(k.path.stream).label) + (k.path.sun ? " · Sunday" : ""), sub: esc(pathText(k)), right: P.dur(k.mins), act: "go", id: k.path.stream === "mental" ? "drill" : k.path.stream === "n2" ? "jlpt" : "path" }) });
  for (const e of q.events) { const k = e.k;
    rows.push({ done: !!e.done, html: qRow({ done: e.done, cls: k.penalty ? "pen-q" : "", box: tickBox(e.done ? "taskundo" : "taskdone", k.id, e.done, k.title), title: (k.penalty ? tag("pen", "Penalty") + " " : "") + esc(k.title), sub: e.done ? "done" : `${span(e.at.s, e.at.e)} · ${P.dur(k.mins)}`, right: k.penalty ? "" : "+" + XP.task, act: "sheet", id: k.dl ? "deadline:" + k.dl : "task:" + k.id }) }); }
  for (const { h, on } of q.habits) { const g = HABIT_GO[h.id], to = typeof g === "function" ? g() : g, st = habitStreak(h.id);
    rows.push({ done: on, html: qRow({ done: on, box: tickBox("habit", h.id, on, h.name), title: esc(habitName(h, q)), sub: `${E.habitWeekCount(h.id)}/${E.habitTarget(h.id)} this week${st ? ` · <span class="qstreak">${px("flame")} ${st}</span>` : ""}`, right: `+${XP.habit}`, act: to ? "go" : "", id: to || "" }) }); }
  return rows;
}
function questList(q) {
  const rows = questRows(q), open = rows.filter(r => !r.done), done = rows.filter(r => r.done), all = q.total && q.done >= q.total;
  return `<div class="panel quests qlist"><div class="row between"><b class="row" style="gap:8px">${px("sword")}Today's quests</b><span class="mono small">${q.done}/${q.total}</span></div>${bar(q.done / (q.total || 1), "var(--sys)")}
    ${all ? `<div class="dclear">${px("trophy")} Day cleared</div>` : ""}
    ${q.call ? `<div class="q done"><span class="lockbox">${ic("check")}</span><div class="grow"><div class="t">Answer the call</div></div><div class="xp">+${CALL_XP}</div></div>` : ""}
    <div class="list">${open.map(r => r.html).join("")}</div>
    ${done.length ? fold("q-done", `<span class="grow small muted">Done · ${done.length}</span>`, `<div class="list">${done.map(r => r.html).join("")}</div>`) : ""}
    ${usageLine()}</div>`;
}
// The "Day cleared" moment: once a day, when the last quest is ticked.
function dayCleared() {
  const q = todayQuests(), t = E.today(); if (!q.total || q.done < q.total) return;
  try { if (localStorage.getItem("kts-cleared") === t) return; localStorage.setItem("kts-cleared", t); } catch (e) { return; }
  toast(`Day cleared · all ${q.total} quests`, true);
}
// v7: the due pile as one big button within thumb reach (Home and Study).
function reviewBtn() { const n = K.queue().length; return n ? `<button class="btn go block big rvbig" data-act="go" data-id="cards/review">${px("scroll")} Review ${n} due</button>` : ""; }
// Act I as one line, with its own money check-in so it works before the Store opens.
function actLine(a1) {
  const due = E.moneyDue(), last = E.moneyReports().slice(-1)[0];
  return `<div class="panel actline"><div class="row between"><span class="hdr">${px("crown")} Act I · ${a1.week > 0 ? `${yen(a1.week)} this week` : "Escape Kofu"}</span>
    <button class="btn sm" data-act="moneyquick">${due ? "Check in" : moneyQuick ? "Close" : "Update"}</button></div>${bar(a1.shown, "var(--acc)")}
    ${moneyQuick ? `<div class="grid" id="moneyForm" style="margin-top:6px">
      <label class="f">Bank (¥)<input type="number" inputmode="numeric" data-f="bank" placeholder="${last ? last.bank : ""}"></label>
      <label class="f">Debt left (¥)<input type="number" inputmode="numeric" data-f="debt" placeholder="${last ? last.debt : ""}"></label></div>
      <div class="btns"><button class="btn primary block" data-act="savemoney">Save</button></div>` : due ? `<div class="small muted">Weekly check-in is due: bank balance and debt left.</div>` : ""}</div>`;
}
function homeHero(hs, t) {
  const nm = new Date().getHours() * 60 + new Date().getMinutes(), wd = P.windDownNow();
  if (hs.k === "study") return `<div class="dungeon">${focusBody(hs.g)}</div>`;
  if (hs.k === "body") return `<div class="dungeon"><div class="hero">${trainSession(t)}</div></div>`;
  if (hs.k === "open") {
    const g = hs.g, b = hs.kind === "study" ? g.o.b : g.block, s = hs.kind === "study" ? g.o.s : g.s, e = hs.kind === "study" ? g.o.e : g.e;
    return `<div class="hero"><div class="row between"><span class="hdr">${px("gate")} Block open · ${span(s, e)}</span></div>
      <div class="now-t">${esc(b ? b.title : "Workout")}</div>${hs.kind === "study" && b ? topicLine(b) : ""}
      <div class="btns"><button class="btn go block" data-act="enter" data-id="${hs.kind}">${hs.kind === "study" && g.ended ? "Report" : "Enter the Dungeon"}</button></div></div>`;
  }
  if (hs.k === "pen") { const p = St.openPenalties()[0], k = live("tasks").find(x => x.id === p.task), at = k && P.plan().at.get(k.id);
    return `<div class="hero pen"><span class="hdr">${px("skull")} Penalty quest</span><div class="now-t">${penWhat(p)}</div>
      <div class="small muted">${k ? P.dur(k.mins) : ""}${at ? ` · set for ${esc(dayLabel(at.date))} ${P.toHM(at.s)}` : ""}. The Store stays locked until it's done.</div>
      ${k ? `<div class="btns"><button class="btn go" data-act="taskdone" data-id="${k.id}">Done</button><button class="btn" data-act="go" data-id="plan">Open plan</button></div>` : ""}</div>`; }
  if (hs.k === "comeback") return `<div class="hero"><span class="hdr">${px("flame")} Welcome back</span><div class="now-t">Comeback quest</div>
      <div class="small muted">Clear any one quest today for +${Sy.COMEBACK_XP} XP. Missed days don't pile up.</div>
      <div class="btns"><button class="btn go" data-act="questsall">Pick a quest</button></div></div>`;
  // v6: an item started with Go ahead is the Dungeon until it's reported.
  const ga = Pa.running();
  if (ga) { const [h, m] = ga.pin.start.split(":").map(Number), st = h * 60 + m;
    return `<div class="hero"><div class="row between"><span class="hdr">${px("sword")} Path · ${esc(Pa.stream(ga.path.stream).label)}</span><span class="hdr">${nm < st + ga.mins ? P.dur(st + ga.mins - nm) + " left" : "Report"}</span></div>
      <div class="now-t" style="font-size:19px">${esc(pathText(ga))}</div>
      <div class="bar"><i style="width:${Math.min(1, Math.max(0, (nm - st) / ga.mins)) * 100}%;background:var(--sys)"></i></div>
      <div class="btns"><button class="btn go" data-act="taskdone" data-id="${ga.id}">Report</button><button class="btn" data-act="go" data-id="path">Path</button></div></div>`; }
  // Next block: what's on now (if anything) and what's next.
  const nn = P.nowNext(), cur = nn.now, pct = cur ? Math.min(1, Math.max(0, (nm - cur.s) / Math.max(1, cur.e - cur.s))) : 0;
  const nowTitle = wd ? "Close the day" : cur ? (cur.type === "task" ? cur.k.title : cur.b.title) : "Free time";
  const noBlocks = !live("blocks").length;
  return `<div class="hero now ${wd ? "winding" : ""}">
    <div class="row between"><span class="hdr">${px("bolt")} Now · ${P.toHM(nm)}</span>${cur && !wd ? `<span class="hdr">${P.dur(Math.max(0, cur.e - nm))} left</span>` : ""}</div>
    <div class="now-t">${esc(nowTitle)}</div>
    ${wd ? `<div class="small muted">Bed at ${P.toHM(wd.bed)}. Tick what's left, then screens off.</div>` : cur && cur.type === "block" ? topicLine(cur.b) : ""}
    ${cur && !wd ? `<div class="bar"><i style="width:${pct * 100}%;background:var(--sys)"></i></div>` : ""}
    <div class="row between" style="margin-top:8px"><span class="small muted grow">${nn.next ? `Next: ${esc(nn.next.type === "wind" ? "Wind down" : nn.next.type === "task" ? nn.next.k.title : nn.next.b.title)} · ${P.toHM(nn.next.s)}` : "Nothing else today"}</span>
      ${wd ? `<button class="btn sm primary" data-act="questsall">Close the day</button>` : noBlocks ? `<button class="btn sm primary" data-act="firstblock">Add your first block</button>` : `<button class="btn sm" data-act="nav" data-id="plan">Plan today</button>`}</div></div>`;
}
// While a Dungeon runs, its main action sits just above the tab bar.
function dungeonBar(hs) {
  if (hs.k === "study") { const g = hs.g, fin = St.logsFor(g.o).find(r => r.final);
    return `<div class="dbar"><span class="grow small">${px("sword")} ${esc(g.o.b.title)} · ${span(g.o.s, g.o.e)}</span>${fin ? `<button class="btn sm" data-act="leave" data-id="study">Leave</button>` : `<button class="btn sm go" data-act="toreport">Report</button>`}</div>`; }
  return `<div class="dbar"><span class="grow small">${px("sword")} Workout</span><button class="btn sm" data-act="go" data-id="train/pick/browse">Library</button><button class="btn sm" data-act="leave" data-id="body">Leave</button></div>`;
}
// Today's quests: the three that matter most, tagged. "Show all" opens the rest.
const tag = (k, l) => `<span class="tag t-${k}">${k === "trial" ? px("flag") + " " : k === "pen" || k === "raid" ? px("skull") + " " : ""}${l}</span>`;
// v5.2: today's phone minutes against the limit, one line. Nothing else about usage is shown.
function usageLine() {
  if (!Us.available() || !Us.isGranted() || !Sy.has(1)) return "";
  const m = Us.today(), lim = Us.cfg().limitMin, j = Us.cfg().judged[E.today()];
  if (m == null) return "";
  return `<div class="usage-l row between small ${m > lim ? "bad-t" : m > lim * 0.8 ? "warn" : ""}"><span>${px("eye")} Phone ${j === "ok" ? "· cleared" : j === "over" ? "· over" : ""}</span><span class="mono">${m} / ${lim} min</span></div>`;
}
/* ---------- v6: the Path ---------- */
// Home shows one line: today's count and the ahead/behind figure. Before the start, the countdown.
function pathStand() {
  const m = Pa.summary();
  return m.behind ? `<span class="bad-t">${esc(m.stream.label)} ${m.behind} behind</span>` : m.ahead ? `<span class="good-t">+${m.ahead} day${m.ahead === 1 ? "" : "s"} ahead</span>` : `<span class="muted">On schedule</span>`;
}
function pathLine(q) {
  if (!Pa.ready()) return "";
  if (!Pa.started()) { const n = Pa.daysToStart();
    return `<button class="path-l row between small" data-act="go" data-id="path"><span>${px("flag")} The System awakens in ${n} day${n === 1 ? "" : "s"}</span><span class="row" style="gap:6px">${pathStand()}<span class="chev">${ic("right")}</span></span></button>`; }
  return `<button class="path-l row between small" data-act="go" data-id="path"><span>${px("flag")} Path today <b class="mono">${q.path.done}/${q.path.total}</b></span><span class="row" style="gap:6px">${pathStand()}<span class="chev">${ic("right")}</span></span></button>`;
}
const pathText = k => k.title.slice(Pa.stream(k.path.stream).label.length + 3);
const pathRow = k => `<div class="q ${k.done ? "done" : ""}">
  <button class="bx" data-act="${k.done ? "taskundo" : "taskdone"}" data-id="${k.id}" aria-pressed="${!!k.done}" aria-label="${esc(k.title)} done">${k.done ? ic("check") : ""}</button>
  <div class="grow"><div class="t">${esc(Pa.stream(k.path.stream).label)}${k.path.sun ? " · Sunday" : ""}</div><div class="small muted">${esc(pathText(k))}</div></div>
  <div class="xp">${P.dur(k.mins)}</div></div>`;
function pathDoneHtml(id) {
  const k = live("tasks").find(x => x.id === id); if (!k || !k.path) return `<p class="empty">Not found.</p>`;
  const ahead = !k.path.sun && E.today() < Pa.schedDate(k.path.idx);
  return `<div class="hdr">${px("flag")} Path · ${esc(Pa.stream(k.path.stream).label)}</div><h3 style="margin:6px 0">${esc(pathText(k))}</h3>
    ${ahead ? `<p class="small good-t">Ahead of schedule: +50% XP if it's Done.</p>` : ""}
    ${k.path.stream === "mental" && !k.path.sun ? (() => { const tb = Dr.todayBest("classic"), n = Dr.todayRuns("classic").length;
      return `<div class="panel" style="margin:8px 0"><div class="small">${n ? `Drill today: ${n} run${n === 1 ? "" : "s"} · best <b class="mono">${tb}</b>` : "Two Classic Drill runs, 2 min each. The best one is logged."}</div>
        <div class="btns"><button class="btn go" data-act="drillgo" data-id="classic">${n ? "Run again" : "Start Drill"}</button></div></div>
        <label class="f">Score${tb != null ? "" : " (if you ran Zetamac outside the app)"}<input id="zetIn" type="number" inputmode="numeric" value="${tb ?? ""}" placeholder="${Pa.zetamac()?.last ?? ""}"></label>`; })() : ""}
    <div class="btns"><button class="btn go" data-act="pathfin" data-id="${k.id}|done">Done</button><button class="btn" data-act="pathfin" data-id="${k.id}|partly">Partly</button></div>
    <p class="tiny muted">Partly: half XP, and the stream still moves on. Not done: leave it. It waits for tomorrow and nothing else piles up.</p>`;
}
/* ---------- v10.0: Drill ---------- */
let drillT = null, drillResult = null; // timer, and the last run's result for the end screen
const mentalTask = () => Pa.ready() && Pa.started() ? live("tasks").find(k => k.path && k.path.stream === "mental" && !k.path.sun && !k.done && k.due <= E.today()) : null;
function drillTick() {
  clearInterval(drillT);
  drillT = setInterval(() => {
    if (Dr.running()) { const el = $("#drT"); if (el) el.textContent = Dr.left(); return; }
    clearInterval(drillT); if (!Dr.current()) return;
    drillResult = Dr.finish();
    // Path: the 2nd Classic run of the day logs the best score to the open Mental Math item by itself.
    const k = drillResult && drillResult.rec.mode === "classic" && Dr.todayRuns("classic").length >= 2 ? mentalTask() : null;
    if (k) { const g = Pa.finish(k, "done", Dr.todayBest("classic")); drillResult.logged = g; }
    save();
    if (drillResult && drillResult.pb) setTimeout(() => toast(`New best · ${Dr.mode(drillResult.rec.mode).name} ${drillResult.rec.score}`, true), 400);
    if (route()[0] === "drill") render();
  }, 250);
}
const PAD = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "-", "0", "."];
function drillRunHtml() {
  const r = Dr.current();
  return `<div class="drill-run" id="drillRun"><div class="row between"><span class="hdr">${esc(Dr.mode(r.mode).name)}</span><span class="mono dr-t"><b id="drT">${Dr.left()}</b> s</span></div>
    <div class="dr-score mono">Score <b id="drS">${r.score}</b></div>
    <div class="dr-q" id="drQ">${esc(r.p.q)}</div><div class="dr-in mono" id="drIn">${esc(r.input) || "&nbsp;"}</div>
    <div class="dr-pad">${PAD.map(k => `<button class="dr-k" data-act="drk" data-id="${k}">${k === "-" ? "±" : k}</button>`).join("")}
      <button class="dr-k sm" data-act="drskip">Skip</button><button class="dr-k sm" data-act="drquit">Stop</button><button class="dr-k" data-act="drk" data-id="del" aria-label="Delete">${ic("left")}</button></div></div>`;
}
// Updates the run in place (no full render while typing). ok = the problem changed.
function drillPaint(ok) {
  const r = Dr.current(); if (!r || !$("#drillRun")) return;
  $("#drIn").innerHTML = esc(r.input) || "&nbsp;"; $("#drS").textContent = r.score;
  if (ok) { const q = $("#drQ"); q.textContent = r.p.q; q.classList.remove("hit"); void q.offsetWidth; q.classList.add("hit"); }
}
const sgn = n => (n > 0 ? "+" : "") + n;
let drLen = 120;
function vDrill() {
  const back = `<button class="back" data-act="nav" data-id="home">${ic("left")} Quests</button>`;
  if (Dr.running()) return drillRunHtml();
  const head = `${back}<header class="top"><div><div class="hdr">Mental math</div><h1>Drill</h1></div></header>`;
  let end = "";
  if (drillResult) {
    const { rec, xp, pb, avg7 } = drillResult, b = Dr.best(rec.mode), k = mentalTask();
    const slow = rec.slow || [];
    end = `<div class="panel dr-end"><div class="hdr">${esc(Dr.mode(rec.mode).name)} · ${rec.secs} s</div>
      <div class="dr-big mono">${rec.score}</div>
      <div class="small mono">best ${b ?? rec.score}${avg7 != null ? ` · ${sgn(Math.round(rec.score - avg7))} vs 7-day avg` : ""}${xp ? ` · +${xp} XP` : ""}${pb ? " · new best" : ""}</div>
      ${drillResult.logged ? `<div class="small good-t" style="margin-top:6px">Logged to the Path: best ${Dr.todayBest("classic")}.</div>` : k && rec.mode === "classic" ? `<div class="btns"><button class="btn go" data-act="drillgo" data-id="classic">Run 2</button><button class="btn" data-act="drlog">Log ${Dr.todayBest("classic")} to the Path</button></div>` : ""}
      <div class="btns"><button class="btn sm" data-act="go" data-id="report">Full history</button></div>
      ${slow.length ? `<details class="key" style="margin-top:8px"><summary>Slow or skipped · ${slow.length}</summary>${slow.map(x => `<div class="row between small mono"><span>${esc(x.q)} = ${esc(Dr.answerText(x.a))}</span><span class="muted">${x.skipped ? "skipped" : x.s + " s"}</span></div>`).join("")}
        <div class="btns"><button class="btn sm" data-act="drcards" ${drillResult.carded ? "disabled" : ""}>${drillResult.carded ? "In Drill slow" : "Make flashcards"}</button></div></details>` : ""}</div>`;
  }
  const rows = Dr.MODES.map(m => { const b = Dr.best(m.id), tb = Dr.todayBest(m.id), a = Dr.avg7(m.id);
    return `<div class="panel row between"><div class="grow"><b>${esc(m.name)}</b><div class="tiny muted">${esc(m.note)}</div>
      <div class="tiny mono" style="margin-top:4px">${b != null ? `best ${b}${a != null ? ` · 7-day ${Math.round(a)}` : ""}${tb != null ? ` · today ${tb}` : ""}` : "no runs yet"}</div></div>
      <button class="btn sm go" data-act="drillgo" data-id="${m.id}${drLen === Dr.SECS ? "" : ":" + drLen}">${ic("play", "inl")} ${drLen < 120 ? drLen + " s" : drLen / 60 + " min"}</button></div>`; }).join("");
  const lens = `<div class="seg" style="margin-bottom:8px">${Dr.LENGTHS.map(n => `<button data-act="drlen" data-id="${n}" aria-pressed="${n === drLen}">${n < 120 ? n + " s" : n / 60 + " min"}</button>`).join("")}</div>${drLen === Dr.SECS ? "" : `<p class="tiny muted">Custom length: saved, but kept off the best and the graph.</p>`}`;
  return `${head}${end}${lens}${rows}<p class="tiny muted">Type the answer; it's taken the moment it's right. 1 XP per answer, +${Dr.XP_PB} for a new best, up to ${Dr.XP_CAP} XP a day.</p>`;
}
/* ================= REPORT CARD (v10.1) ================= */
let rcPeriod = "all", rcSub = null, rcForm = false, rcMode = "classic", rcPre = null; // rcPre: an exam deadline being scored
const pc = p => Math.round(p * 100) + "%", pts = d => sgn(Math.round(d * 100)) + " pts";
const rcBtn = () => `<button class="btn sm" data-act="go" data-id="report">See report card</button>`;
function rcLine() { const s = Rc.summary(Rc.tests()); return s.gpa != null ? ` · ${s.gpa.toFixed(1)} ${s.letter}` : ""; }
const RC_SECS = [["Gate Tests", x => x.src === "gate" && x.subject !== "Japanese"], ["Classes", x => x.src === "quiz" || x.src === "boss"], ["Japanese", x => x.subject === "Japanese"], ["Real exams", x => x.src === "exam" && x.subject !== "Japanese"]];
function rcRow(x) {
  const a = x.last, L = Rc.letter(x.best.pct);
  const per = x.src === "place" ? Object.entries(a.per || {}).map(([l, [o, n]]) => `${l} ${o}/${n}`).join(" · ") : "";
  const bits = [x.pass != null ? `pass ${pc(x.pass)} · ${pts(x.margin)}` : "", `${x.tries.length} attempt${x.tries.length === 1 ? "" : "s"}`, x.change != null ? `${pts(x.change)} vs last` : "", x.tries.length > 1 && x.best !== a ? `best ${pc(x.best.pct)}` : ""].filter(Boolean);
  return `<div class="item rc-row"><div class="row between"><b class="grow">${esc(x.name)}</b><span class="mono">${a.score}/${a.of} · ${pc(a.pct)}</span>${x.graded ? `<span class="rc-l ${L[1] === "F" ? "bad" : ""}">${L[1]}</span>` : ""}</div>
    <div class="tiny muted mono">${esc(dayLabel(a.date))}${x.passed != null ? ` · ${x.passed ? "passed" : "not passed"}` : ""} · ${bits.join(" · ")}</div>
    ${per ? `<div class="tiny mono">${esc(per)}</div>` : ""}${a.notes ? `<div class="tiny muted">${esc(a.notes)}</div>` : ""}
    ${x.src === "exam" ? `<div class="btns" style="margin-top:4px"><button class="btn sm danger" data-act="rcdrop" data-id="${a.id}">Delete</button></div>` : ""}</div>`;
}
function rcDrill() {
  const st = Rc.drill(rcMode, rcPeriod), man = rcMode === "classic" ? Rc.manualZetamac() : [];
  const chips = `<div class="chips">${Dr.MODES.map(m => `<button class="chip" data-act="rcmode" data-id="${m.id}" aria-pressed="${m.id === rcMode}">${esc(m.name)}</button>`).join("")}</div>`;
  if (!st && !man.length) return `<h2>Mental math</h2>${chips}<div class="panel"><p class="small muted">No ${esc(Dr.mode(rcMode).name)} runs yet.</p><div class="btns"><button class="btn sm go" data-act="drillgo" data-id="${rcMode}">Start a Drill</button></div></div>`;
  const s = Rc.drillSeries(rcMode, 30), hi = Math.max(10, ...s.best.filter(v => v != null)), max = Math.ceil(hi / 10) * 10;
  const line = s.best.some(v => v != null) ? Ch.lines([{ d: s.avg, c: "dim", w: 1.5, dots: false }, { d: s.best, c: "acc", w: 2.5, r: 3 }],
    { min: 0, max, ticks: [0, max / 2, max], label: "Drill daily best and 7-day average", labels: [[0, E.fmtDate(s.dates[0]).slice(4)], [29, "Today"]] }) : "";
  const r = (l, v) => `<div class="row between small"><span class="muted">${l}</span><span class="mono">${v}</span></div>`;
  return `<h2>Mental math</h2>${chips}<div class="panel">
    ${st ? `${r("Runs", st.n)}${r("Best", st.best)}${r("Average", st.avg.toFixed(1) + " ± " + st.sd.toFixed(1))}${st.avg7 != null ? r("7-day average", st.avg7.toFixed(1)) : ""}${st.avg30 != null ? r("30-day average", st.avg30.toFixed(1)) : ""}${r("Problems a minute", st.ppm.toFixed(1))}${st.acc != null ? r("Accuracy", pc(st.acc)) : ""}` : ""}
    ${line ? `<div style="margin-top:8px">${line}</div><div class="tiny muted mono">red: daily best · grey: 7-day average · 30 days</div>` : ""}
    ${man.length ? `<div class="small" style="margin-top:8px">Zetamac (manual) · ${man.length} score${man.length === 1 ? "" : "s"} · best ${Math.max(...man.map(z => z.score))} · last ${man[man.length - 1].score}</div>` : ""}</div>`;
}
function rcExamForm() {
  if (!rcForm) return `<div class="btns"><button class="btn sm" data-act="rcform">+ Exam result</button></div>`;
  return `<div class="panel"><h3>Exam result</h3><div class="grid" id="rcForm">
    <label class="f" style="flex-basis:100%">Name<input data-f="name" placeholder="e.g. Algebra midterm" value="${esc(rcPre?.name || "")}"></label>
    <label class="f">Subject<input data-f="subject" list="rcSubs" placeholder="e.g. Math" value="${esc(rcPre?.subject || "")}"></label><datalist id="rcSubs">${Rc.subjectNames().map(n => `<option value="${esc(n)}">`).join("")}</datalist>
    <label class="f">Date<input type="date" data-f="date" value="${rcPre?.date || E.today()}"></label>
    <label class="f">Score<input type="number" inputmode="decimal" data-f="score"></label>
    <label class="f">Out of<input type="number" inputmode="decimal" data-f="of" value="100"></label>
    <label class="f">Pass mark % (optional)<input type="number" inputmode="decimal" data-f="pass"></label>
    <label class="f" style="flex-basis:100%">Notes<input data-f="notes"></label></div>
    <div class="btns"><button class="btn go" data-act="rcsave">Save</button><button class="btn" data-act="rcform">Cancel</button></div></div>`;
}
function vReport() {
  const back = `<button class="back" data-act="nav" data-id="profile">${ic("left")} Profile</button>`;
  const all = Rc.tests(rcPeriod), subs = [...new Set(all.map(x => x.subject))].sort();
  if (rcSub && !subs.includes(rcSub)) rcSub = null;
  const ts = rcSub ? all.filter(x => x.subject === rcSub) : all, sm = Rc.summary(ts, rcSub), sj = Rc.subjects(all);
  const head = `${back}<header class="top"><div><div class="hdr">Profile · ${rcPeriod === "sem" ? esc(Rc.semester().name) : "exam history"}</div><h1>Report Card</h1></div></header>`;
  const filt = `<div class="seg">${Rc.PERIODS.map(([k, l]) => `<button data-act="rcper" data-id="${k}" aria-pressed="${k === rcPeriod}">${l}</button>`).join("")}</div>
    ${subs.length > 1 ? `<div class="chips">${subs.map(n => `<button class="chip" data-act="rcsub" data-id="${esc(n)}" aria-pressed="${n === rcSub}">${esc(n)}</button>`).join("")}</div>` : ""}`;
  const sumHtml = sm.n ? win("Summary", `<div class="row between"><div><div class="k">GPA</div><div class="dr-big mono rc-gpa">${sm.gpa.toFixed(1)} <span>${sm.letter}</span></div></div>
      <div style="text-align:right">${sm.passOf ? `<div class="k">Pass rate</div><div class="mono">${sm.passN}/${sm.passOf} · ${pc(sm.passN / sm.passOf)}</div><div class="tiny muted mono">first try ${sm.firstN}/${sm.passOf} · ${pc(sm.firstN / sm.passOf)}</div>` : ""}</div></div>
      ${sm.strong ? `<div class="small" style="margin-top:8px">Strongest <b>${esc(sm.strong.name)}</b> ${pc(sm.strong.avg)} · weakest <b>${esc(sm.weak.name)}</b> ${pc(sm.weak.avg)}</div>` : ""}
      ${sm.month != null ? `<div class="small muted">This month ${pc(sm.month)}${sm.trend != null ? ` · ${pts(sm.trend)} vs last month` : ""}</div>` : ""}
      <div class="tiny muted" style="margin-top:6px">A 90+, B 80, C 70, D 60, F under 60. Each test's best attempt counts.</div>`, "", "star") : "";
  const bars = sj.length ? `<h2>By subject</h2><div class="panel rc-bars">${sj.map(s => `<div class="rc-b"><div class="row between small"><span>${esc(s.name)}</span><span class="mono">${pc(s.avg)}</span></div>
      <div class="rc-track"><i style="width:${Math.min(100, s.avg * 100)}%"></i>${s.pass != null ? `<b style="left:${s.pass * 100}%" title="pass mark"></b>` : ""}</div></div>`).join("")}<div class="tiny muted mono">bar: average % · tick: pass mark</div></div>` : "";
  const secs = RC_SECS.map(([name, f]) => { const L = ts.filter(f); return L.length ? fold("rc-" + name, `<b class="grow">${name}</b><span class="small muted">${L.length}</span>`, L.map(rcRow).join(""), true) : ""; }).join("");
  const other = ts.filter(x => !RC_SECS.some(([, f]) => f(x)));
  const empty = !all.length ? `<div class="panel"><p class="small muted">No tests in ${rcPeriod === "all" ? "the app yet" : "this period"}. Gate Tests, class quizzes, JLPT exams and real exams you add land here.</p></div>` : "";
  return `${head}${filt}${sumHtml}${empty}${bars}${secs}${other.length ? fold("rc-other", `<b class="grow">Other</b>`, other.map(rcRow).join(""), true) : ""}${rcExamForm()}${rcSub ? "" : rcDrill()}`;
}
function vPath() {
  const back = `<button class="back" data-act="nav" data-id="home">${ic("left")} Quests</button>`;
  const fl = Pa.started() && Pa.floor();
  const head = `${back}<header class="top"><div><div class="hdr">${fl ? `Floor ${fl.n} · ${esc(fl.name)}` : "Job readiness"}</div><h1>The Path</h1></div></header>`;
  if (!Pa.ready()) return `${head}<p class="empty">The Path couldn't load. Check the connection and reopen.</p>`;
  const n = Pa.daysToStart(), z = Pa.zetamac();
  const intro = Pa.started() ? `<div class="row between small" style="margin:4px 2px 10px"><span class="muted">One item per stream a day. Finish early and the timeline moves up.</span></div>`
    : sysBox(`The System awakens Mon 19 Oct, 04:00.`, `${n} day${n === 1 ? "" : "s"} left. Until then nothing counts against you. Anything you finish now puts you ahead: +50% XP.`);
  const rows = Pa.STREAMS.filter(s => Pa.length(s.id)).map(s => {
    const k = Pa.openTask(s.id), st = Pa.standing(s.id), p = Pa.pos(s.id), gt = Pa.gate(s.id), it = gt ? null : k ? { t: pathText(k) } : Pa.item(s.id, p);
    const badge = st.behind ? `<span class="tag t-pen">${st.behind} behind</span>` : st.ahead ? `<span class="tag t-ahead">+${st.ahead} ahead</span>` : "";
    const A = Pa.arc(s.id);
    const list = A.items.map(x => `<div class="arc-i ${x.done ? "done" : x.cur ? "cur" : ""}">${x.done ? ic("check", "inl") : x.cur ? px("sword") : `<i class="arc-dot"></i>`}<span>${esc(x.t)}</span></div>`).join("");
    return `<div class="panel pstream"><div class="row between"><b>${esc(s.label)}</b><span class="row" style="gap:6px">${badge}<span class="small muted">${P.dur(s.mins)}</span></span></div>
      <div class="small ${it ? "" : "muted"}" style="margin:4px 0 8px">${it ? esc(it.t) : gt ? "Gate Test before Arc " + Pa.arc(s.id).n + "." : "Stream complete."}</div>
      ${gt ? "" : fold("arc-" + s.id, `<span class="grow tiny mono">Arc ${A.n} · ${A.done}/${A.size}</span>`, list, false, "arcf")}
      ${s.id === "mental" ? `<div class="row between tiny muted" style="margin-bottom:6px"><span>${Dr.best("classic") != null ? `Drill best ${Dr.best("classic")}` : z ? `Zetamac best ${z.best} · average ${z.avg}` : "Classic Drill: 2 min"}</span><button class="btn sm" data-act="go" data-id="drill">Drill</button></div>` : ""}
      ${gt ? gateBox(gt) : k ? `<div class="btns"><button class="btn sm go" data-act="taskdone" data-id="${k.id}">Report</button></div>` : it ? `<div class="btns"><button class="btn sm" data-act="pathahead" data-id="${s.id}">Go ahead</button></div>` : ""}</div>`;
  }).join("");
  const due = K.dueCount(), c = Pa.cfg(), tdy = E.today();
  const tokens = Pa.started() && (c.tokens || Pa.isRest(tdy)) ? `<div class="panel row between"><span class="small">${px("star")} Rest tokens <b class="mono">${c.tokens}/${Pa.MAX_TOKENS}</b>${Pa.isRest(tdy) ? " · today is a rest day" : ""}</span>
    ${c.tokens && !Pa.isRest(tdy) && E.parse(tdy).getDay() ? `<button class="btn sm" data-act="pathrest">Rest today</button>` : ""}</div>` : "";
  const nApp = live("applications").filter(a => !Ap.closed(a)).length;
  return `${head}${intro}${raidsPanel()}${tokens}${rows}
    <button class="quiet-row" data-act="go" data-id="path/apps"><span class="grow">Applications${nApp ? ` · ${nApp} active` : ""}</span><span class="chev">${ic("right")}</span></button>
    <button class="quiet-row" data-act="go" data-id="cards"><span class="grow">Flashcard decks${due ? ` · ${due} due` : ""}</span><span class="chev">${ic("right")}</span></button>`;
}
/* ---------- v6.2: Raids, Applications, Resources ---------- */
// An Offer logs the offer for Act I, as "I got an offer" does.
function appOffer(a) {
  if (a.status !== "Offer" || (S.settings.system || {}).offerAt) return;
  Sy.logOffer(true); save();
  const d = prompt(`Offer from ${a.firm} logged. Job start date (YYYY-MM-DD)? Leave empty if you don't know yet.`, "");
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) { Sy.setLoan({ takeover: d.trim() }); save(); }
}
// Plan milestones (14 days ahead) and application dates (7 days ahead), soonest first.
function allRaids() {
  if (!Pa.ready() || !Pa.started()) return [];
  return [...Pa.openRaids().map(r => ({ ...r, kind: "path" })), ...Ap.raids().map(r => ({ id: r.a.id, name: `${r.a.firm}: ${r.what}`, date: r.date, days: r.days, kind: "app" }))].sort((a, b) => a.days - b.days);
}
const inDays = d => d === 0 ? "today" : d === 1 ? "tomorrow" : d > 0 ? `in ${d} days` : `${-d} day${d === -1 ? "" : "s"} ago`;
function raidsPanel() {
  const rs = allRaids(); if (!rs.length) return "";
  return `<div class="panel raids"><div class="hdr">${px("skull")} Raids</div>${rs.map(r => `<div class="item row between"><div class="grow"><b class="small">${esc(r.name)}</b><div class="tiny ${r.days <= 2 ? "bad-t" : "muted"}">${esc(E.fmtDate(r.date))} · ${inDays(r.days)}</div></div>
    ${r.kind === "path" ? `<button class="btn sm ${r.days <= 0 ? "go" : ""}" data-act="raidclear" data-id="${r.id}">Cleared</button>` : `<button class="btn sm" data-act="go" data-id="path/apps/${r.id}">Open</button>`}</div>`).join("")}</div>`;
}
function vApps(id) {
  const back = `<button class="back" data-act="nav" data-id="${id ? "path/apps" : "path"}">${ic("left")} ${id ? "Applications" : "Path"}</button>`;
  if (id) {
    const a = id === "new" ? { status: "To apply" } : live("applications").find(x => x.id === id);
    if (!a) return `${back}<p class="empty">That application is gone.</p>`;
    const opt = (L, v) => L.map(x => `<option ${x === v ? "selected" : ""}>${esc(x)}</option>`).join("");
    const inp = (f, l, type = "text", ph = "") => `<label class="f">${l}<input data-f="${f}" type="${type}" value="${esc(a[f] || "")}" placeholder="${ph}"${f === "channel" ? ` list="dl-chan"` : ""}></label>`;
    return `${back}<header class="top"><div><div class="hdr">Job hunt</div><h1>${id === "new" ? "New application" : esc(a.firm)}</h1></div></header>
    <div class="panel" id="appForm">${inp("firm", "Firm", "text", "Accenture")}${inp("role", "Role", "text", "Business consultant")}
      <label class="f">Track<select data-f="track">${opt(Ap.TRACKS, a.track || Ap.TRACKS[0])}</select></label>
      ${inp("channel", "Channel", "text", "careerforum.net")}<datalist id="dl-chan">${Ap.CHANNELS.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
      <label class="f">Status<select data-f="status">${opt(Ap.STATUSES, a.status)}</select></label>
      ${inp("deadline", "Deadline", "date")}${inp("contact", "Contact", "text", "Name, email")}
      ${inp("next", "Next step", "text", "Submit ES")}${inp("nextDate", "Next step date", "date")}
      <div class="btns"><button class="btn go" data-act="appsave" data-id="${id}">Save</button><button class="btn" data-act="go" data-id="path/apps">Cancel</button>${id !== "new" ? `<button class="btn danger" data-act="appdel" data-id="${id}">Delete</button>` : ""}</div></div>`;
  }
  const L = Ap.all(), open = L.filter(a => !Ap.closed(a)), done = L.filter(Ap.closed);
  const row = a => { const w = Ap.when(a), d = w && E.daysBetween(E.today(), w), nx = Ap.STATUSES[Ap.STATUSES.indexOf(a.status) + 1];
    return `<div class="panel app-r"><div class="row between"><b>${esc(a.firm)}</b><span class="tag ${a.status === "Offer" ? "t-ahead" : a.status === "Rejected" ? "t-pen" : ""}">${esc(a.status)}</span></div>
      <div class="small muted">${[a.role, a.track].filter(Boolean).map(esc).join(" · ")}</div>
      ${w ? `<div class="small ${d <= 2 ? "bad-t" : ""}" style="margin-top:4px">${esc(a.nextDate ? a.next || "Next step" : "Deadline")} · ${esc(E.fmtDate(w))} · ${inDays(d)}</div>` : ""}
      <div class="btns">${Ap.closed(a) ? "" : `<button class="btn sm go" data-act="appnext" data-id="${a.id}">${esc(nx === "Rejected" ? "Offer" : nx)}</button><button class="btn sm" data-act="apprej" data-id="${a.id}">Rejected</button>`}<button class="btn sm" data-act="go" data-id="path/apps/${a.id}">Edit</button></div></div>`; };
  return `${back}<header class="top"><div><div class="hdr">Job hunt</div><h1>Applications</h1></div></header>
  <div class="btns" style="margin-top:0"><button class="btn primary" data-act="go" data-id="path/apps/new">${ic("plus")} New application</button></div>
  ${open.length ? open.map(row).join("") : `<p class="empty">None yet. Add each firm as you find it; dates within 7 days become Raids on Home.</p>`}
  ${done.length ? fold("apps-closed", `<b class="grow">Closed</b><span class="small muted">${done.length}</span>`, done.map(row).join("")) : ""}`;
}
function vRes() {
  const R = Pa.resources(), by = {};
  R.forEach(r => (by[r.stream] = by[r.stream] || []).push(r));
  return `<button class="back" data-act="nav" data-id="settings">${ic("left")} Settings</button><header class="top"><div><div class="hdr">Library</div><h1>Resources</h1></div></header>
  ${Object.keys(by).map(k => `<h2>${esc(k)}</h2><div class="panel">${by[k].map(r => `<div class="item"><b class="small">${esc(r.resource)}</b><div class="tiny muted">${esc(r.usedFor)} · ${esc(r.where)}</div></div>`).join("")}</div>`).join("") || `<p class="empty">Couldn't load. Check the connection and reopen.</p>`}`;
}
// Profile → Path: where Arin stands. Opens after the first 7 active days.
function profilePath() {
  if (!Pa.ready() || !Pa.started() || Sy.activeDays() < 7) return "";
  const f = Pa.floor(), z = Pa.zetamac(), done = Pa.raids().filter(r => r.cleared);
  const st = Pa.STREAMS.filter(s => Pa.length(s.id)).map(s => { const x = Pa.standing(s.id);
    return `<div class="row between small item"><span>${esc(s.label)}</span><span class="mono ${x.behind ? "bad-t" : x.ahead ? "good-t" : "muted"}">${x.behind ? x.behind + " behind" : x.ahead ? "+" + x.ahead + " ahead" : "on schedule"}</span></div>`; }).join("");
  return `<h2>Path <span class="n">Floor ${f.n}</span></h2><div class="panel"><div class="hdr">${px("gate")} ${esc(f.name)}</div>${st}
    ${z ? `<div class="small muted" style="margin-top:8px">Zetamac best ${z.best} · average ${z.avg} over ${z.n}</div>` : ""}
    ${done.length ? `<div class="small" style="margin-top:8px"><b>Raids cleared</b></div>${done.map(r => `<div class="row between small item"><span class="grow">${esc(r.name)}</span><button class="link" data-act="raidundo" data-id="${r.id}">Undo</button></div>`).join("")}` : ""}
    <div class="btns"><button class="btn sm" data-act="go" data-id="path">Open the Path</button></div></div>`;
}
function gateBox(g) {
  const wait = g.retakeAt > Date.now();
  return `<div class="gatebox"><div class="row between"><b class="small">${px("skull")} Gate Test</b><span class="tiny muted">${Pa.GATE_Q} questions · ${Math.round(Pa.GATE_PASS * 100)}% · ${Pa.GATE_Q} min</span></div>
    ${g.last ? `<div class="tiny muted">Last try ${g.last.score}/${g.last.n}. Misses are in your flashcards.</div>` : `<div class="tiny muted">The next Arc stays sealed until it's passed.</div>`}
    <div class="btns">${wait ? `<span class="small muted">${ic("lock", "inl")} Retake opens ${new Date(g.retakeAt).toDateString() === new Date().toDateString() ? "" : "tomorrow "}${P.toHM(new Date(g.retakeAt).getHours() * 60 + new Date(g.retakeAt).getMinutes())}</span>` : `<button class="btn sm go" data-act="go" data-id="path/gate/${g.stream}">Enter the Gate</button>`}</div></div>`;
}
let gq = null; // the Gate Test in progress: {s, g, qs, ans, ends, res}
function vGate(s) {
  const st = Pa.stream(s), home = s === "n2" ? ["jlpt", "Japanese"] : ["path", "Path"], back = `<button class="back" data-act="nav" data-id="${home[0]}">${ic("left")} ${home[1]}</button>`;
  const g = Pa.gate(s);
  if (!st || (!g && !(gq && gq.s === s && gq.res))) return `${back}<h1>Gate</h1><p class="empty">No Gate open here.</p>`;
  if (g && g.retakeAt > Date.now() && !(gq && gq.s === s)) return `${back}<h1>Gate</h1><p class="empty">The retake opens in ${Math.ceil((g.retakeAt - Date.now()) / 3600e3)} h.</p>`;
  if (!gq || gq.s !== s) {
    gq = { s, g: g.gate, qs: null, ans: [], res: null, ends: 0 };
    Pa.loadBank(s, g.gate).then(b => { if (!gq || gq.s !== s) return; gq.qs = Pa.draw(b); gq.title = b.title; gq.ends = Date.now() + gq.qs.length * 60000; render(); })
      .catch(() => { if (gq) { gq.err = true; render(); } });
  }
  const head = `${back}<header class="top"><div><div class="hdr">${esc(st.label)} · Gate ${gq.g}</div><h1>Gate Test</h1></div>${gq.qs && !gq.res ? `<span class="hdr mono" id="gateT">${mmss(Math.max(0, gq.ends - Date.now()))}</span>` : ""}</header>`;
  if (gq.err) return head + `<p class="empty">Couldn't load the questions. Check the connection and try again.</p>`;
  if (!gq.qs) return head + `<p class="muted">Loading…</p>`;
  const r = gq.res;
  const qHtml = (q, i) => { const a = gq.ans[i], ok = r && a === q.a;
    return `<div class="panel dq ${r ? (ok ? "right" : "wrong") : ""}"><div class="k">Q${i + 1}</div><p style="white-space:pre-wrap">${esc(q.q)}</p>
      <div class="list">${q.opts.map((o, j) => `<button class="opt ${a === j ? "sel" : ""} ${r && j === q.a ? "ans" : ""}" data-act="gqpick" data-id="${i}:${j}" ${r ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div>
      ${r ? `<div class="small" style="margin-top:8px">${ok ? ic("check", "inl") + " Right." : `Answer: <b>${esc(q.opts[q.a])}</b>.`} <span class="muted">${esc(q.ex || "")}</span></div>` : ""}</div>`; };
  return head + (r ? sysBox(r.passed ? `Gate cleared: ${r.ok}/${r.n}. Arc ${Pa.arc(s).n} is open.` : `${r.ok}/${r.n}. The Gate holds.`, r.passed ? (r.xp ? `+${r.xp} XP` : "") : `Your misses are now flashcards in ${esc(st.label)} mistakes. The retake opens in 24 hours.`,
      `<div class="btns"><button class="btn sm primary" data-act="gatedone">Back to ${s === "n2" ? "Japanese" : "the Path"}</button>${rcBtn()}</div>`) : `<p class="small muted" style="margin:0 4px 10px">${esc(gq.title || "")}. ${Math.round(Pa.GATE_PASS * 100)}% to pass. One minute a question; it submits itself when time runs out.</p>`)
    + gq.qs.map(qHtml).join("")
    + (r ? "" : `<div class="btns"><button class="btn go block" data-act="gqsubmit">Submit</button></div>`);
}
function gateSubmit() {
  if (!gq || !gq.qs || gq.res) return;
  gq.res = Pa.gradeGate(gq.s, gq.g, gq.qs, gq.ans, K.newCard); save();
  if (gq.res.passed) toast(`Gate cleared · +${gq.res.xp} XP`, true);
  window.scrollTo(0, 0); render();
}
const riskHtml = r => `<div class="milestone" role="dialog" aria-label="${esc(r.m.name)} at risk"><div class="ms-in">
  <div class="hdr">System · Warning</div>${px("skull", "ms-px")}<h2 class="ms-t">${esc(r.m.name)} at risk</h2><p class="muted">At this pace ${esc(Pa.stream(r.m.stream).label)} reaches the exam material ${r.late} day${r.late === 1 ? "" : "s"} after ${esc(E.fmtDate(r.m.date))}. Go ahead to close the gap.</p>
  <button class="btn primary block" data-act="riskgo" data-id="${r.m.id}">Go ahead now</button><button class="btn block" style="margin-top:8px" data-act="riskok" data-id="${r.m.id}">Later</button></div></div>`;
const updateWinHtml = () => `<div class="milestone" role="dialog" aria-label="Update available"><div class="ms-in">
  <div class="hdr">System · Update</div>${px("bolt", "ms-px")}<h2 class="ms-t">Update available</h2><p class="muted">Build ${Up.pending().build} of the app is out. Update downloads it and opens Android's installer: tap <b>Install</b> there. Android always asks for that one tap. Your data stays.</p>
  <button class="btn primary block" data-act="updgo">Update</button><button class="btn block" style="margin-top:8px" data-act="updlater">Later</button></div></div>`;
const floorHtml = f => `<div class="milestone" role="dialog" aria-label="Floor ${f.n}"><div class="ms-in">
  <div class="hdr">System · Floor ${f.n}</div>${px("gate", "ms-px")}<h2 class="ms-t">${esc(f.name)}</h2><p class="muted">${f.last ? "The last Floor. Everything so far was for this." : "A new Floor opens. The streams carry on where you are; what they ask of you steps up."}</p>
  <button class="btn primary block" data-act="floorok" data-id="${f.n}">Enter Floor ${f.n}</button></div></div>`;
const awakeHtml = () => `<div class="milestone" role="dialog" aria-label="The Path begins"><div class="ms-in">
  <div class="hdr">System · Awakening</div>${px("flag", "ms-px")}<h2 class="ms-t">The Path begins</h2><p class="muted">Seven streams, one item each a day. Finish early and the timeline moves up with you, for +50% XP. Leave one and it waits for tomorrow. From today, skipping has a cost again.</p>
  <button class="btn primary block" data-act="awake">Open the Path</button></div></div>`;

// v5.3: a small snapshot for the Android home-screen widget (WidgetPlugin.java). Sent only when it changes.
let widgetSig = "", widgetT = null;
// Sleep and class stretches today and tomorrow, as [start ms, end ms]: no nudge lands inside one.
function quietSpans() {
  const out = [], t = E.today();
  for (const d of [t, E.addDays(t, 1)]) for (const g of P.segments(d)) if (["sleep", "nap", "class"].includes(g.b.kind)) { const s = E.parse(d).getTime(); out.push([s + g.s * 60000, s + g.e * 60000]); }
  return out;
}
// v8.3: a widget button or nudge asked for a screen ("jpgo/15" starts a quick start). Native only.
let lastNavy = null; // v9.3: the native status bar follows navy mode
async function pendingRoute() {
  const C = window.Capacitor; if (!(C && C.isPluginAvailable && C.isPluginAvailable("Widget"))) return;
  try {
    const W = C.Plugins.Widget || C.registerPlugin("Widget"), r = ((await W.pending()) || {}).route;
    // v9.3: bedtimes from the Going to bed widget, then the wake time on the first open after the alarm.
    if (W.bed) { const L = ((await W.bed()) || {}).log || [], xp = Dy.bedIn(L); if (L.length) { save(); if (xp) toast(`+${xp} XP · On time for bed`); } }
    if (Dy.wakeCheck()) save();
    if (!r || !W.pending) return;
    const m = /^jpgo\/(\d+)$/.exec(r);
    if (m && Sy.has(NEEDS.jlpt)) return jpStart(+m[1]);
    if (!m) goR(r);
  } catch (e) {}
}
function pushWidget() {
  if (!(window.Capacitor && window.Capacitor.isPluginAvailable && window.Capacitor.isPluginAvailable("Widget"))) return;
  clearTimeout(widgetT);
  widgetT = setTimeout(() => {
    const nn = P.nowNext(), pens = St.openPenalties(), q = todayQuests();
    const it = r => r && (r.type === "task" ? r.k.title : r.b ? r.b.title : "");
    const now = pens.length ? { label: "PENALTY QUEST", title: penWhat(pens[0]).replace(/&[^;]+;/g, ""), time: "" }
      : nn.now ? { label: "NOW", title: it(nn.now), time: `${P.toHM(nn.now.s)}–${P.toHM(nn.now.e)}` }
      : nn.next ? { label: "NEXT", title: it(nn.next), time: P.toHM(nn.next.s) } : { label: "SYSTEM", title: "Nothing left today", time: "" };
    const quests = [...q.trials.map(e => ({ t: e.k.title, done: !!e.done })), ...q.path.list.map(k => ({ t: k.title, done: !!k.done })), ...q.events.map(e => ({ t: e.k.title, done: !!e.done })), ...q.habits.map(x => ({ t: habitName(x.h, q), done: x.on }))]
      .sort((a, b) => a.done - b.done).slice(0, 3);
    const m = Us.available() && Us.isGranted() ? Us.today() : null;
    // v8.3: the widget's Japanese row and the native watched-app nudge (due count, the toggle, watched apps, quiet stretches).
    const jp = Sy.has(NEEDS.jlpt) ? { due: K.queue().filter(c => c.intro).length, nudge: !!Al.prefs().jp, apps: Us.cfg().apps, quiet: quietSpans() } : null;
    // v9.3: the Going to bed widget's class days (weekdays with a class block) and sleep length.
    const classDays = [0, 1, 2, 3, 4, 5, 6].filter(d => live("blocks").some(b => b.kind === "class" && (b.days || []).includes(d)));
    const snapshot = { bed: { classDays, classAt: 480, sleepMin: 450 }, now, quests, level: `LV ${E.level()} · ${q.done}/${q.total} quests`, usage: m != null ? `Phone ${m}/${Us.cfg().limitMin} min` : "", jp };
    const sig = JSON.stringify(snapshot); if (sig === widgetSig) return;
    widgetSig = sig;
    const W = window.Capacitor.Plugins.Widget || window.Capacitor.registerPlugin("Widget");
    W.update({ snapshot }).catch(() => { widgetSig = ""; });
  }, 800);
}
function questsPanel(q) {
  const items = [...q.trials.filter(e => !e.done).map(e => [e.k.title, tag("trial", "Trial")]),
    ...q.events.filter(e => !e.done).map(e => [e.k.title, e.k.penalty ? tag("pen", "Penalty") : tag("today", "Today")]),
    ...q.habits.filter(x => !x.on).map(x => [habitName(x.h, q), tag("daily", "Daily")])];
  if (Pa.started()) items.unshift(...Pa.gates().filter(g => g.retakeAt <= Date.now()).map(g => [`Gate Test · ${Pa.stream(g.stream).label}`, tag("trial", "Gate")]),
    ...allRaids().filter(r => r.days <= 7).slice(0, 2).map(r => [r.name, tag("raid", `Raid · ${r.days <= 0 ? "today" : r.days + "d"}`)]));
  const top = items.slice(0, 3);
  return `<div class="panel quests"><div class="row between"><b class="row" style="gap:8px">${px("sword")}Quests</b><span class="mono small">${q.done}/${q.total}</span></div>${bar(q.done / (q.total || 1), "var(--sys)")}
    ${top.length ? `<ul class="top3">${top.map(([x, tg]) => `<li><span class="grow">${esc(x)}</span>${tg}</li>`).join("")}</ul>` : `<div class="small muted">All cleared today.</div>`}
    ${pathLine(q)}${usageLine()}
    ${reviewBtn()}
    <div class="btns"><button class="btn sm" data-act="questsall">${showAllQuests ? "Hide" : `Show all (${q.total})`}</button></div>
    ${showAllQuests ? questsAll(q) : ""}</div>`;
}
// v8.1: the Japanese daily quest names today's N2 item.
const habitName = (h, q) => h.id === "jp" && q.jp ? "Japanese · " + q.jp : h.name;
function questsAll(q) {
  return `<div class="qall">${q.call ? `<div class="q done"><span class="lockbox">${ic("check")}</span><div class="grow"><div class="t">Answer the call</div></div><div class="xp">+${CALL_XP}</div></div>` : ""}
    ${q.trials.length ? `<div class="qsec trial">${px("flag")} Trial <span>${q.trials.filter(x => x.done).length}/${q.trials.length}</span></div><div class="list">${q.trials.map(x => trialRow(x.k, x.done)).join("")}</div>` : ""}
    ${q.path.total ? `<div class="qsec">Path <span>${q.path.done}/${q.path.total}</span></div><div class="list">${q.path.list.map(pathRow).join("")}</div>` : ""}
    <div class="qsec">Today <span>${q.events.length ? `${q.events.filter(e => e.done).length}/${q.events.length}` : "nothing planned"}</span></div>${q.events.length ? `<div class="list">${q.events.map(eventRow).join("")}</div>` : ""}
    <div class="qsec">Daily <span>${q.habits.filter(x => x.on).length}/${q.habits.length}</span></div><div class="list">${q.habits.map(habitRow).join("")}</div>
    <div class="btns"><button class="btn sm" data-act="brief">Today's brief</button></div></div>`;
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
    <label class="f">Blocks open early / close late (min)<input type="number" inputmode="numeric" data-ch="planmin" data-id="openPad" value="${pl.openPad ?? 10}"></label>
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
// Dungeon gear: pomodoro and penalty rules (they apply to every study and workout block).
function usageSettings() {
  const u = Us.cfg(), extra = u.apps.filter(p => !USAGE_APPS.some(a => a[0] === p));
  return `${Us.isGranted() ? "" : `<p class="small muted">Usage access is off for The Arin.</p><div class="btns"><button class="btn primary" data-act="usageon">Open Usage access</button></div>`}
    <div class="grid"><label class="f">Daily limit (min)<input type="number" inputmode="numeric" data-ch="usagelimit" value="${u.limitMin}"></label></div>
    <h3>Watched apps</h3>${USAGE_APPS.map(([p, l]) => `<div class="item row between"><span>${esc(l)}</span><div class="seg"><button data-act="usageapp" data-id="${p}" aria-pressed="${u.apps.includes(p)}">${u.apps.includes(p) ? "On" : "Off"}</button></div></div>`).join("")}
    <label class="f" style="margin-top:8px">Other apps (package names, comma-separated)<input data-ch="usageextra" value="${esc(extra.join(", "))}" placeholder="e.g. com.reddit.frontpage"></label>
    <p class="tiny muted">Counted from midnight. Over the limit: a penalty quest. Under it at wind-down: +${XP.habit} XP.</p>`;
}
function alarmSettings() {
  if (!Al.granted()) return `<p class="small muted">Notifications are off for The Arin.</p><div class="btns"><button class="btn primary" data-act="alarmson">Turn on alarms</button></div>`;
  const p = Al.prefs(), n = Al.upcoming().length;
  return `${Al.TYPES.map(([k, l, d]) => `<div class="item row between"><div class="grow"><b>${l}</b><div class="tiny muted">${d}</div></div><div class="seg"><button data-act="alarmtoggle" data-id="${k}" aria-pressed="${p[k]}">${p[k] ? "On" : "Off"}</button></div></div>`).join("")}
    ${Al.exactOk() ? "" : `<p class="small warn" style="margin-top:8px">Exact alarms are off, so alarms can ring a few minutes late.</p><div class="btns"><button class="btn sm" data-act="alarmson">Allow exact alarms</button></div>`}
    <p class="tiny muted" style="margin-top:8px">${n} alarm${n === 1 ? "" : "s"} set for the next 3 days. Nothing rings during sleep blocks.</p>`;
}
function dungeonSettings() {
  const sst = S.settings.study;
  return `<h3>Pomodoro and penalties</h3><div class="grid">
    ${[["focus", "Focus (min)"], ["brk", "Break (min)"], ["long", "Long break (min)"], ["every", "Long break every (rounds)"], ["grace", "Time to report after a block (min)"], ["penaltyXp", "Penalty (XP)"]].map(([k, l]) => `<label class="f">${l}<input type="number" inputmode="numeric" data-ch="studynum" data-id="${k}" value="${sst[k]}"></label>`).join("")}</div>
    <p class="tiny muted">Every study and workout block is judged when it ends. Workout blocks count once a set or run is logged that day; study blocks once you report progress or finish a focus round.</p>
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
    <h3 style="margin-top:14px">Store fund</h3><div class="grid"><label class="f">Per on-pace month (¥)<input type="number" inputmode="numeric" data-ch="funmonthly" value="${E.funBudget().monthly}"></label>
    <label class="f">Yen per 1 XP (new items)<input type="number" inputmode="numeric" data-ch="funrate" value="${S.settings.fun.yenPerXp}"></label></div>
    <p class="tiny muted">Started ${esc(S.settings.fun.start)}. A month adds this only if your savings and debt are on pace for the goals above. Unspent yen carries over.</p>`;
}
/* ---------- settings sheet ---------- */
// One gear per tab opens its settings from the bottom, so daily screens stay clean.
let sheet = null;
function sheetHtml(k) {
  const [kind, arg] = k.split(":");
  const closeBtn = `<button class="rbtn" data-act="sheet" aria-label="Close">${ic("x")}</button>`;
  // Edit sheets: forms and actions for the tapped item.
  const edit = { task: () => arg ? taskActHtml(arg) : taskFormHtml(), block: () => blockFormHtml(blockForm && blockForm !== "new" ? live("blocks").find(b => b.id === blockForm) : blockNew),
    add: addHtml, person: personFormHtml, trial: () => trialSheetHtml(arg), battle: () => battleHtml(arg), moment: momentHtml, rate: () => rateHtml(arg), offer: offerHtml, pathdone: () => pathDoneHtml(arg), deadline: () => arg ? dlSheetHtml(arg) : dlFormHtml() }[kind];
  return edit ? `<div class="modal-scrim" data-act="sheet"></div><div class="sheet" role="dialog"><div class="row between sheet-h"><span></span>${closeBtn}</div>${edit()}</div>` : "";
}
// Every gear opens the one Settings page, at the section for the screen it sits on.
const gear = k => `<button class="rbtn" data-act="nav" data-id="settings/${k}" aria-label="Settings">${ic("settings")}</button>`;
/* ---------- ceremonies: unlock and milestone windows ---------- */
let ceremonyDone = false; // one per open
function ceremony() {
  if (ceremonyDone) return null;
  if (Sy.has(1) && ["study", "body"].includes(homeState().k)) return null; // never during a Dungeon
  const u = Sy.pendingUnlock(); if (u) return { unlock: u };
  const m = Sy.nextMilestone(); if (m) return { ms: m };
  if (Pa.ready() && Pa.started() && !S.settings.pathAwoke) return { awake: true };
  const fl = Pa.newFloor(); if (fl) return { floor: fl };
  if (route()[0] !== "path") { const r = Pa.risk(); if (r) return { risk: r }; }
  if (Up.needsAsk()) return { update: true };
  if (Al.needsAsk()) return { alarms: true };
  if (Us.needsAsk()) return { usage: true };
  if (Sy.has(2) && E.parse(E.today()).getDay() === 0 && E.moneyDue() && lsGet(MONEYWIN_KEY) !== E.today()) return { money: true };
  return null;
}
const MONEYWIN_KEY = "kts-moneywin";
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const alarmWinHtml = () => `<div class="milestone" role="dialog" aria-label="Alarms"><div class="ms-in">
  <div class="hdr">System · Alarms</div>${px("bell", "ms-px")}<h2 class="ms-t">Let the System wake you</h2><p class="muted">Dungeons and penalties start now. Alarms ring when a block opens, an hour before bed, before a penalty lapses, and with the morning brief. Android will ask to allow notifications, then exact alarms.</p>
  <button class="btn primary block" data-act="alarmson">Turn on alarms</button><button class="btn block" style="margin-top:8px" data-act="alarmslater">Not now</button></div></div>`;
const usageWinHtml = () => `<div class="milestone" role="dialog" aria-label="Phone limit"><div class="ms-in">
  <div class="hdr">System · New daily quest</div>${px("eye", "ms-px")}<h2 class="ms-t">Stay under ${Us.cfg().limitMin} min</h2><p class="muted">The System watches Instagram, TikTok, YouTube and X. Under the limit: +${XP.habit} XP. Over it: a penalty quest. Android needs you to switch on Usage access for The Arin.</p>
  <button class="btn primary block" data-act="usageon">Open Usage access</button><button class="btn block" style="margin-top:8px" data-act="usagelater">Not now</button></div></div>`;
const moneyWinHtml = () => `<div class="milestone" role="dialog" aria-label="Money check-in"><div class="ms-in">
  <div class="hdr">System · Sunday</div>${px("coin", "ms-px")}<h2 class="ms-t">Money check-in</h2><p class="muted">Bank balance and debt left. Twenty seconds, then the week is counted.</p>
  <button class="btn primary block" data-act="moneywin" data-id="money">Open Store</button><button class="btn block" style="margin-top:8px" data-act="moneywin">Later</button></div></div>`;
const unlockHtml = u => `<div class="milestone" role="dialog" aria-label="New area unlocked: ${esc(u.area)}"><div class="ms-in">
  <div class="hdr">System · New area unlocked</div>${px({ Dungeon: "sword", Store: "coin", Study: "scroll", People: "people", Tower: "trophy" }[u.area] || "star", "ms-px")}<h2 class="ms-t">${esc(u.area)}</h2><p class="muted">${esc(u.text)}</p>
  <button class="btn primary block" data-act="unlock" data-id="${u.tab || ""}">${u.tab ? "Open " + esc(u.area) : "Continue"}</button></div></div>`;
/* ---------- milestone window ---------- */
// Full screen, for big moments only (Act steps, gates). Routine ticks stay quiet.
const milestoneHtml = m => `<div class="milestone" role="dialog" aria-label="${esc(m.title)}"><div class="ms-in">
  <div class="hdr">System · Milestone</div>${px("trophy", "ms-px")}<h2 class="ms-t">${esc(m.title)}</h2><p class="muted">${esc(m.text)}</p>
  <button class="btn primary block" data-act="milestone" data-id="${esc(m.id)}">Continue</button></div></div>`;

/* ---------- morning brief ---------- */
// First open of each day (from 04:00): a System window listing today's quests. Shown once per day per phone.
const BRIEF_KEY = "kts-brief";
let briefOpen = false;
function briefDue() { const d = new Date(); if (d.getHours() < 4) return false; try { return localStorage.getItem(BRIEF_KEY) !== E.today(); } catch (e) { return false; } }
// v9 §2: the Today window, once a morning. Today's blocks in order (classes with rooms, gaps with their item, outreach,
// shift), the Japanese line and nothing else.
function briefHtml() {
  const t = E.today(), pens = St.openPenalties(), gi = Dy.gapItem();
  const empty = d => !live("habitLog").some(h => h.date === d) && !live("tasks").some(k => k.done && k.doneAt && E.ymd(new Date(k.doneAt)) === d);
  const back = live("habitLog").length > 0 && empty(E.addDays(t, -1)) && empty(E.addDays(t, -2));
  const row = r => {
    if (r.type === "gap") return `<div class="bl gap-l"><span class="mono">${span(r.s, r.e)}</span> <span class="muted">Gap</span>${r.fin && gi ? `<div class="small topic-l">${ic("target", "inl")} ${esc(gi.label)}: ${esc(gi.t)}</div>` : `<div class="small topic-l">${ic("target", "inl")} Japanese · a few cards</div>`}</div>`;
    const b = r.b, subj = b.kind === "quest" && St.subjectOf(b), top = subj && St.current(subj), og = b.id === Dy.OUTREACH.id ? Dy.outreachGoals() : [];
    return `<div class="bl"><span class="mono">${span(r.s, r.e)}</span> <b>${esc(b.title)}</b>${b.room ? ` <span class="small muted">· ${esc(b.room)}</span>` : ""}${top ? `<div class="small topic-l">${ic("target", "inl")} ${esc(top.t)}</div>` : ""}${og.map(g => `<div class="small topic-l">${ic("target", "inl")} ${esc(g.t)}</div>`).join("")}</div>`;
  };
  const list = Dy.dayList(t), q = K.queue(), due = q.filter(c => c.intro).length;
  return `<div class="modal-scrim" data-act="briefclose"></div><div class="modal brief" role="dialog" aria-label="Today">
    <div class="hdr">System · ${esc(E.fmtDate(t))}</div><h2 class="bh">${back ? "Welcome back" : "Today"}</h2>
    ${back ? `<p class="small">No penalties for the days away. Clear any one quest today for +${Sy.COMEBACK_XP} XP.</p>` : ""}
    ${pens.length ? `<div class="bsec bad-t">Penalty</div>${pens.map(p => `<div class="bl">${ic("lock", "inl")} ${penWhat(p)} · shop locked until done</div>`).join("")}` : ""}
    <div class="bsec">Schedule</div>${list.map(row).join("") || `<div class="bl muted">Nothing planned. A free day.</div>`}
    ${Sy.has(NEEDS.jlpt) ? `<div class="bsec">Japanese</div><div class="bl">${due} due · ${q.length - due} new${N2.ready() && N2.current() ? ` · grammar: ${esc(N2.current().g)}` : ""}</div>` : ""}
    <div class="btns"><button class="btn primary block" data-act="briefclose">Start the day</button></div></div>`;
}

/* ---------- study blocks and penalties ---------- */
const mmss = ms => { const x = Math.ceil(ms / 1000); return E.pad(Math.floor(x / 60)) + ":" + E.pad(x % 60); };
// "Topic: …" under a study block wherever it shows, so the block says what to do, not just "Finance".
function topicLine(b, cls = "small") {
  const subj = b && St.subjectOf(b); if (!subj) return "";
  const top = St.current(subj);
  return `<div class="${cls} topic-l">${ic("target", "inl")} ${top ? esc(top.t) : "All topics done. Add more in Plan → Study"}</div>`;
}
// A phone-limit penalty (v5.2) reads as what to do, not "make up".
const isUsePen = p => String(p.id).startsWith("pen-use-");
const penWhat = p => isUsePen(p) ? "30 min phone-free" : "Make up " + esc(p.title);
function penaltyBox() {
  const pens = St.openPenalties(); if (!pens.length) return "";
  const xp = pens.reduce((a, p) => a + (p.xp || 0), 0), at = P.plan().at;
  const lines = pens.map(p => { const k = live("tasks").find(x => x.id === p.task), w = k && at.get(k.id);
    if (isUsePen(p)) return `<div class="x">${esc(p.title)} on ${esc(dayLabel(p.date))}. Penalty quest: 30 min phone-free${w ? `, set for ${esc(dayLabel(w.date))} ${P.toHM(w.s)}` : ""}.</div>`;
    if (p.trial) return `<div class="x">Missed trial: ${esc(p.title)}, due ${esc(dayLabel(p.date))}. Clear it late to lift the penalty.</div>`;
    return `<div class="x">Missed ${esc(p.title)} · ${esc(dayLabel(p.date))} ${P.toHM(p.s || 0)}. Penalty quest: ${k ? P.dur(k.mins) + " make-up" : "make-up"}${w ? `, set for ${esc(dayLabel(w.date))} ${P.toHM(w.s)}` : ""}.</div>`; }).join("");
  return win("Penalty", `${pens.length === 1 ? "A block was skipped." : pens.length + " blocks were skipped."} −${xp} XP. The shop is locked until the make-up ${pens.length === 1 ? "is" : "quests are"} done.
    ${lines}<div class="btns"><button class="btn sm" data-act="go" data-id="plan">Open penalty quests</button></div>`, "pen", "skull");
}
function reportDueBox(fg) {
  if (!fg || !fg.open || !fg.ended) return "";
  const subj = St.subjectOf(fg.o.b), top = subj && St.current(subj);
  return sysBox(`<span class="warn">${esc(fg.o.b.title)} is over. Report it.</span>`, `${top ? "How much of " + esc(top.t) + " did you get through? " : ""}Report by ${P.toHM(fg.closes)} or it counts as skipped.`,
    `<div class="btns"><button class="btn sm primary" data-act="nav" data-id="focus">Report now</button></div>`);
}
function vFocus() {
  const g = St.focusGate(), back = `<button class="back" data-act="nav" data-id="home">${ic("left")} Quests</button>`;
  if (g.open) { const o = g.o, subj = St.subjectOf(o.b), top = subj && St.current(subj);
    return `${back}<header class="top"><div><div class="hdr">Dungeon · ${esc(o.b.title)} · ${span(o.s, o.e)}</div><h1>${esc(top ? top.t : o.b.title)}</h1></div></header>${focusBody(g)}`; }
  {
    const nx = g.next;
    return `${back}<h1>Dungeon</h1><div class="panel locked-gate"><div class="row" style="gap:10px">${px("lock", "big-lock")}<div><div class="hdr">System · Not open yet</div>
      <b>${nx ? `Opens ${nx.date === E.today() ? "today" : esc(dayLabel(nx.date))} at ${P.toHM(nx.s)}` : "No study block this week"}</b>
      ${nx ? `<div class="small muted">${esc(nx.b.title)}</div>${topicLine(nx.b)}` : ""}
      <div class="small muted">A block opens ${S.settings.plan.openPad ?? 10} min before it starts. The report stays open ${S.settings.study.grace ?? 60} min after it ends.</div></div></div></div>`;
  }
}
// The study Dungeon itself: timer, the topic, and the report. Shown as Home's hero while it runs.
function focusBody(g) {
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
    rep = `<div class="panel ${g.ended ? "report-due" : ""}" id="report"><h3>${g.ended ? "Block over. Report it" : "End-of-block report"}</h3>
      <p class="small">${top ? `How much of <b>${esc(top.t)}</b> did you get through in this block? Count it as a share of the whole topic.` : "Did you do this block?"}</p>
      <div class="chips">${opts.map(([v, l]) => `<button class="chip" data-act="blockreport" data-id="${v}">${l}</button>`).join("")}</div>
      <p class="tiny muted">${g.ended ? `Report by ${P.toHM(g.closes)}.` : "Report when the block ends."} No work done by then counts as skipped: −${pen} XP and a make-up penalty quest. The shop locks until it's cleared.</p></div>`;
  }
  const due = K.queue().length;
  const stages = !Sy.has(3) ? "" : `<div class="stages"><span class="st on">1 · Topic</span><button class="st" data-act="nav" data-id="cards/review">2 · Flashcards${due ? ` <b>${due}</b>` : ` ${ic("check", "inl")}`}</button><button class="st" data-act="nav" data-id="jlpt/q">3 · JLPT</button></div>`;
  return `${stages}${timer}${topicHtml}${rep}`;
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
  try { if (document.visibilityState !== "visible" && typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("System", { body: msg }); } catch (e) {}
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
  if (Sy.ensureLoanBill()) save();
  if (Pa.issue()) save();
  const fresh = [...(Sy.has(1) ? St.assess() : []), ...(Sy.has(4) ? Soc.assess() : [])];
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
  // Each alert has a key that changes when its condition does, so a dismissed alert comes back only when something new happens.
  const gone = dismissed(), rv = Sy.revealToday(t);
  if (rv && !gone["reveal:" + rv.id]) Sy.markReveal(rv.id, t);
  return [
    rv && ["reveal:" + rv.id, sysBox(esc(rv.text), esc(rv.sub))],
    pens.length && ["pen:" + pens.map(p => p.id).join(","), penaltyBox()],
    fg.open && fg.ended && ["report:" + St.occKey(fg.o), reportDueBox(fg)],
    wd && ["wind:" + t, sysBox(`Wind-down time. Bed at ${P.toHM(wd.bed)}.`, "Screens off, shower, set out tomorrow's clothes. The day is done.")],
    ...Dl.active(t).map(k => { const nx = Dl.nextSession(k.id); return ["dl:" + k.id + ":" + Dl.daysLeft(k, t), sysBox(`<b>${esc(k.title)}</b> · ${dlLeft(k)}`, nx ? `Next: ${esc(Dl.sessionName(nx, k))}` : "", `<div class="btns"><button class="btn sm" data-act="sheet" data-id="deadline:${k.id}">Open</button></div>`)]; }),
    ...Dl.unscored(t).map(d => ["examscore:" + d.id, sysBox(`${esc(d.title)}: how did it go?`, "Add the score and it goes on the Report Card.", `<div class="btns"><button class="btn sm" data-act="rcask" data-id="${d.id}">Add score</button></div>`)]),
    E.moneyDue() && ["money:" + E.weekStart(t), sysBox("Weekly money report is due.", "Bank balance and debt left. Takes 20 seconds.", btn("money", "Report now"))],
    flags.length && ["pain:" + flags.join("|"), sysBox(`<span class="warn">Pain check.</span> ${flags.map(esc).join(" ")}`, "Deload or swap the exercise. Never train through sharp pain; if it keeps coming back, see a physio.")],
    unplaced && ["unplaced:" + unplaced, sysBox(`${unplaced} task${unplaced === 1 ? "" : "s"} didn't fit in the next 2 weeks.`, "Shorten them, split them, or move a block.", btn("plan", "Open plan"))],
    hasData && (expDays === null || expDays >= 7) && ["export:" + (lastExp || "never"), sysBox(expDays === null ? "You haven't exported yet." : `Last export ${expDays} days ago.`, "", btn("settings/sync", "Export now"))],
  ].filter(a => a && !gone[a[0]]).map(([k, h]) => `<div class="al" data-akey="${esc(k)}">${h.replace('<span class="tl"><i></i>', `<span class="tl"><button class="xdot" data-act="dismiss" data-id="${esc(k)}" aria-label="Dismiss"></button>`)}</div>`);
}
// Dismissed alerts (per phone). Old keys are pruned when the list grows.
const DISMISS_KEY = "kts-dismiss";
function dismissed() { try { return JSON.parse(localStorage.getItem(DISMISS_KEY)) || {}; } catch (e) { return {}; } }
function dismiss(key) {
  const d = dismissed(); d[key] = Date.now();
  const keys = Object.keys(d).sort((a, b) => d[b] - d[a]).slice(0, 60);
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(Object.fromEntries(keys.map(k => [k, d[k]])))); } catch (e) {}
}
function vAlerts() {
  const list = alertList(), t = E.today(), left = HABITS.filter(h => !E.habitDone(h.id, t)).length;
  return `<header class="top"><div><div class="hdr">${E.fmtDate(t)}</div><h1>Notifications</h1></div></header>
  ${list.length ? `<p class="tiny muted" style="margin:10px 4px 0">Tap the red dot to dismiss an alert. It comes back if something changes.</p>` : ""}
  <div class="stack" style="margin-top:12px">${list.join("") || sysBox(left ? "Nothing needs you." : "All daily quests cleared.", left ? `${left} daily quest${left === 1 ? "" : "s"} left today.` : "Rest is part of training.")}</div>`;
}

// Profile (was Status): Act I in full, the locked gates, titles, discipline badges, level history,
// and one "?" for whatever the System unlocks next. Level and streak live on Home.
function vProfile() {
  const xp = E.xpTotal(), nx = Sy.nextStage(), tl = Sy.has(5) ? Cl.titles() : [], eq = (S.settings.classes || {}).equipped;
  const ups = levelUps(), discs = Sy.has(3) ? Cl.all().filter(d => Cl.bossPassed(d.id) || Cl.active().includes(d.id)) : [];
  return `<button class="back" data-act="nav" data-id="home">${ic("left")} Quests</button>
  <header class="top"><div><div class="hdr">${Cl.identity() ? esc(Cl.identity()) : "Player"} · stage ${Sy.stage()} · ${esc(Sy.STAGES[Sy.stage()].name)}</div><h1>${esc(S.settings.name || "Arin")}</h1></div>${gear("status")}</header>
  ${actPanel()}
  ${profilePath()}
  <button class="quiet-row" data-act="go" data-id="report"><span class="grow">Report Card${rcLine()}</span><span class="chev">${ic("right")}</span></button>
  <button class="quiet-row" data-act="go" data-id="drill"><span class="grow">Mental math Drill${Dr.best("classic") != null ? ` · best ${Dr.best("classic")}` : ""}</span><span class="chev">${ic("right")}</span></button>
  ${sleepPanel()}
  <h2>Level <span class="n">${E.level()} · ${xp} XP</span></h2>
  <div class="panel">${bar(E.levelProgress(), "var(--acc)")}<div class="small muted">${LEVEL_XP - (xp % LEVEL_XP)} XP to level ${E.level() + 1} · ${E.xpWallet()} XP to spend</div>
    ${ups.length ? `<div class="list" style="margin-top:8px">${ups.slice(-5).reverse().map(u => `<div class="row between small"><span>Level ${u.lv}</span><span class="muted mono">${esc(E.fmtDate(u.date))}</span></div>`).join("")}</div>` : ""}</div>
  ${discs.length ? `<h2>Disciplines</h2><div class="chips">${discs.map(d => `<span class="chip ${Cl.bossPassed(d.id) ? "on" : "half"}">${Cl.bossPassed(d.id) ? px("star") + " " : ""}${esc(d.name)}</span>`).join("")}</div>` : ""}
  ${Sy.has(5) ? `<h2>Titles <span class="n">${tl.length}</span></h2>${tl.length ? `<div class="panel">${tl.map(t => `<div class="row between item"><div class="grow"><b>${esc(t.name)}</b><div class="tiny muted">${esc(t.from)}</div></div>
      ${eq === t.id ? `<button class="btn sm" data-act="unequip">Equipped</button>` : `<button class="btn sm ${t.owned ? "" : "go"}" data-act="equip" data-id="${t.id}">${t.owned ? "Equip" : `Equip · ${t.cost} XP`}</button>`}</div>`).join("")}</div>`
      : `<div class="panel"><p class="small muted">None yet. Boss exams and Raids give titles.</p></div>`}` : ""}
  ${nx ? `<h2>Next</h2><div class="panel silhouette"><span class="q-mark">?</span><div class="grow"><b>Something is sealed.</b><div class="small muted">${esc(Sy.STAGES[Sy.stage()].hint)}</div></div></div>` : ""}`;
}
// v9.3: hours slept, from the Going to bed widget. Profile only.
function sleepPanel() {
  const st = Dy.sleepStats(); if (!st) return "";
  const h = x => { const m = Math.round(x * 60); return `${Math.floor(m / 60)} h ${E.pad(m % 60)}`; }, last = Dy.hours(st.last);
  return `<h2>Sleep</h2><div class="panel"><div class="row between"><span class="small">Last night</span><b class="mono ${last < 6 ? "warn" : ""}">${h(last)}</b></div>
    <div class="row between"><span class="small muted">${st.n}-night average</span><span class="mono small">${h(st.avg)}</span></div></div>`;
}
// Dates each level was reached, from the running XP total.
function levelUps() {
  let tot = 0, lv = 1; const out = [];
  for (const e of live("xpEvents").sort((a, b) => a.ts - b.ts)) { tot += e.xp || 0; const L = Math.floor(tot / LEVEL_XP) + 1; if (L > lv) { for (let x = lv + 1; x <= L; x++) out.push({ lv: x, date: E.ymd(new Date(e.ts)) }); lv = L; } }
  return out;
}
// The current Act in full, later Acts as locked, unnamed gates, and the Final Gate as a bar with no number.
function actPanel() {
  const a = Sy.act1(), off = !!(S.settings.system || {}).offerAt;
  return `<div class="panel act-full"><div class="hdr">${px("crown")} Act I · now to first job</div><h3 class="dot-h">Escape Kofu</h3>
    ${bar(a.shown, "var(--acc)")}
    <div class="list" style="margin-top:6px">${a.parts.map(x => `<div class="row between small"><span class="row" style="gap:8px">${x.done ? ic("check", "inl") : `<span class="pdot"></span>`}${esc(x.label)}</span><span class="muted mono">${x.id === "offer" ? (x.done ? "done" : "") : Math.round(x.p * 100) + "%"}</span></div>`).join("")}</div>
    ${a.week > 0 ? `<p class="small muted" style="margin-top:8px">This week: put away ${yen(a.week)} (savings plus debt).</p>` : ""}
    <div class="btns"><button class="btn sm" data-act="offer">${off ? "Undo offer" : "I got an offer"}</button></div></div>
  <div class="gates">${Sy.ACTS.slice(1).map(() => `<div class="gate">${px("lock")}<span>Locked gate</span></div>`).join("")}
    <div class="gate final"><span class="hdr">${px("gate")} Final Gate</span>${bar(Math.max(0.02, Sy.gateProgress()), "var(--soft)")}</div></div>`;
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
  ${live("wishlist").length ? "" : win("First quest", `<b>Add one wishlist item you can afford.</b><div class="x">Something small you'd actually buy this month. XP and the store fund unlock it.</div><div class="btns"><button class="btn sm primary" data-act="firstwish">Add an item</button></div>`, "", "flag")}
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
    <div class="grow"><div class="small muted">Store items</div><b>${E.xpWallet().toLocaleString("en-US")} XP · ${yen(E.funBudget().left)} store fund${E.funBudget().now && !E.funBudget().now.ok ? " · paused" : ""}</b>
      <div class="small muted">${(() => { const w = E.xpWallet(), f = E.funBudget().left, r = E.storeQueue().filter(x => w >= E.xpPrice(x.w) && x.alloc >= x.w.price).length; return r ? `${r} wishlist item${r === 1 ? "" : "s"} unlocked` : `${live("wishlist").filter(x => !x.bought).length} on the wishlist`; })()} · purchasing power ×${E.xpPower().toFixed(2)}</div></div>
    <span class="chev">${ic("right")}</span></button>

  ${due ? "" : fold("money-update", `<b class="grow">Update this week's numbers</b>`, form)}
  ${rs.length > 1 ? fold("money-trend", `<b class="grow">Trend</b><span class="small muted">${rs.length} reports</span>`, `${moneyChart()}
    <div class="legend"><span><i style="background:var(--mag)"></i>Bank</span><span><i style="background:var(--org)"></i>Debt</span><span><i style="background:var(--dim)"></i>Pace to goal</span></div>`, true) : ""}

  ${fold("money-bills", `<b class="grow">Bills and insurance</b><span class="small ${unpaid.length && bl.length ? "warn" : "muted"}">${yen(E.billsMonthly())}/mo${unpaid.length && bl.length ? ` · ${unpaid.length} unpaid` : ""}</span>`, `
    ${bl.length ? bl.map(b => { const paid = !!(b.paid || {})[mk]; return `<div class="item row between">
      <button class="bx sm ${paid ? "on" : ""}" data-act="billpaid" data-id="${b.id}" aria-pressed="${paid}" aria-label="Paid ${esc(b.name)} this month">${paid ? ic("check") : ""}</button>
      <div class="grow"><b>${esc(b.name)}</b><div class="small muted">${b.kind === "insurance" ? "Insurance · " : b.kind === "loan" ? "Fixed · " : ""}${b.freq === "year" ? "yearly" : "monthly"}${paid ? " · paid this month" : ""}</div></div>
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
  // v2.6: the fund fills items one at a time in your priority order; an item is ready when it's fully funded and you have the XP.
  const q = E.storeQueue(), alloc = Object.fromEntries(q.map(x => [x.w.id, x.alloc]));
  open.sort((a, b) => q.findIndex(x => x.w.id === a.id) - q.findIndex(x => x.w.id === b.id));
  const locked = St.openPenalties().length > 0, ready = w => !locked && wallet >= E.xpPrice(w) && alloc[w.id] >= w.price;
  const nowM = fb.now;
  const icon = k => ic(k === "trip" ? "plane" : k === "exp" ? "star" : "gem", "inl");
  const editing = wishForm && wishForm !== "new" ? all.find(w => w.id === wishForm) : null;
  return `<button class="back" data-act="nav" data-id="money">${ic("left")} Store</button>
  <header class="top"><div><div class="hdr">Store</div><h1>Items</h1></div></header>
  ${tip("store", `The fund gets ${yen(fb.monthly)} a month, but only while you're on pace for ${yen(S.settings.money.goal)} saved and debt-free by graduation. It fills your items one at a time, top first. Each item also costs XP from quests.`)}
  <div class="carousel">
    <div class="card g-mag"><span class="k">XP to spend</span><div><div class="dm big2">${wallet.toLocaleString("en-US")}</div><div class="small soft">${E.xpTotal().toLocaleString("en-US")} earned · ${E.xpSpent().toLocaleString("en-US")} spent · level unaffected</div></div></div>
    <div class="card g-cyan"><span class="k">Purchasing power</span><div><div class="dm big2">×${E.xpPower().toFixed(2)}</div><div class="small soft">LV ${E.level()}: every item costs ${Math.round((1 - 1 / E.xpPower()) * 100)}% less XP. +1% per level, up to ×2.</div></div></div>
    <div class="card g-org"><span class="k">Store fund</span><div><div class="dm big2">${yen(fb.left)}</div><div class="small soft">${nowM && nowM.ok ? `+${yen(fb.monthly)} this month` : `Paused this month: ${yen(nowM ? nowM.behind : 0)} behind your savings and debt pace`} · ${yen(fb.spent)} spent</div></div></div>
  </div>
  ${penaltyBox()}
  ${wishForm === "new" ? wishFormHtml() : `<div class="btns"><button class="btn primary" data-act="wishform" data-id="new">+ Wishlist item</button></div>`}
  <h2>Wishlist <span class="n">${open.filter(ready).length} ready</span></h2>
  <div class="list">${open.map(w => {
    if (editing && editing.id === w.id) return wishFormHtml(w);
    const ok = ready(w), xpGap = Math.max(0, E.xpPrice(w) - wallet), have = alloc[w.id] || 0, yenGap = Math.max(0, w.price - have);
    const wks = yenGap && fb.monthly ? Math.ceil(yenGap / fb.monthly) : 0, i = open.indexOf(w);
    return `<div class="panel wish ${ok ? "ready" : ""}" style="margin-top:0">
      <div class="row between"><button class="tbtn grow" data-act="wishform" data-id="${w.id}"><b>${icon(w.kind)} ${esc(w.name)}</b>
        <div class="small muted">${yen(w.price)} · ${E.xpPrice(w).toLocaleString("en-US")} XP${E.xpPrice(w) < w.xp ? ` <s>${w.xp.toLocaleString("en-US")}</s>` : ""}${w.link ? ` · <a href="${esc(w.link)}" target="_blank" rel="noopener">link</a>` : ""}</div></button>
        <div class="row" style="gap:4px;flex:none">${i > 0 ? `<button class="rbtn" data-act="wishmove" data-id="${w.id}" data-step="-1" aria-label="Move up">${ic("arrow")}</button>` : ""}
        ${ok ? `<button class="btn go sm" data-act="buywish" data-id="${w.id}">Buy</button>` : `<span class="lockbox">${ic("lock")}</span>`}</div></div>
      <div class="small muted" style="margin-top:8px">XP ${Math.min(wallet, E.xpPrice(w)).toLocaleString("en-US")}/${E.xpPrice(w).toLocaleString("en-US")}</div>${bar(wallet / E.xpPrice(w), "var(--mag)")}
      <div class="small muted">Funded ${yen(have)}/${yen(w.price)}</div>${bar(have / w.price, "var(--org)")}
      ${ok ? `<div class="small" style="color:var(--lime)">Unlocked. You earned this.</div>` : `<div class="small muted">${[xpGap ? `${xpGap.toLocaleString("en-US")} XP to go` : "", yenGap ? `${yen(yenGap)} to fund (about ${wks} on-pace month${wks === 1 ? "" : "s"})` : ""].filter(Boolean).join(" · ")}</div>`}
    </div>`;
  }).join("") || `<p class="empty">Nothing on the wishlist. Add the things and trips you want, with real prices.</p>`}</div>
  ${got.length ? `<h2>Claimed <span class="n">${got.length}</span></h2><div class="panel">${got.map(w => `<div class="item row between"><div class="grow small"><b>${icon(w.kind)} ${esc(w.name)}</b><div class="muted">${E.fmtDate(w.bought.date)} · ${yen(w.bought.yen)} · ${w.bought.xp.toLocaleString("en-US")} XP</div></div>
    <button class="btn sm" data-act="unbuy" data-id="${w.id}">Undo</button></div>`).join("")}</div>` : ""}
  <p class="tiny muted">Fund settings: the gear on the Store screen.</p>`;
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
  if (L.me.avg == null) return sysBox(`Rate yourself to start the rival ladder.`, "Score yourself on the same key you use for others. Your next opponent is the person ranked just above you; match their stats to clear them, then face the next.", `<div class="btns"><button class="btn sm primary" data-act="go" data-id="people/me">Rate yourself</button></div>`);
  if (!L.opp) return sysBox(`Ladder cleared. You're at or above everyone you've rated.`, `You: ${L.me.r} ${s1(L.me.avg)}. Add someone you look up to as your next opponent.`, `<div class="btns"><button class="btn sm" data-act="go" data-id="people/me">Re-rate yourself</button></div>`);
  const g = gaps(L.opp), o = L.opp;
  return `<div class="panel rival"><div class="row between"><span class="k">Next opponent</span><span class="mono small muted">${L.cleared.length} cleared · ${L.ahead.length} to go</span></div>
    <button class="q tbtn person" data-act="go" data-id="people/p/${o.p.id}" style="margin-top:8px">${badge(o.rk)}<div class="grow"><div class="t">${esc(o.p.name)}</div><div class="small muted">${s1(o.rk.avg)} vs your ${s1(L.me.avg)} · gap ${s1(o.rk.avg - L.me.avg)}</div></div><span class="chev">${ic("right")}</span></button>
    <div class="small" style="margin-top:8px">${g.length ? `Close the gap: ${g.slice(0, 3).map(x => `<b>${esc(x.c)}</b> ${x.me ?? "?"}→${x.them}`).join(" · ")}` : "No single stat behind; lift your average anywhere."}</div>
    <div class="btns"><button class="btn sm" data-act="go" data-id="people/me">Re-rate yourself</button></div>
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
  return `<button class="back" data-act="nav" data-id="people">${ic("left")} People</button>
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
  if (sub === "log") return `<button class="back" data-act="nav" data-id="people">${ic("left")} People</button><h1>Moment log</h1>${vHangouts()}`;
  if (sub === "habits") return vHabits();
  if (sub === "battle") return vBattle();
  if (sub === "appraise") return vAppraise(id);
  const n = live("people").length;
  return `<header class="top"><div><div class="hdr">${esc(E.fmtDate(E.today()))}</div><h1>People</h1></div></header>
  ${n ? "" : win("First quest", `<b>Add your Rival.</b><div class="x">Someone a step ahead of you socially: a classmate, a senpai, a friend you look up to. You'll rate them and yourself on the same traits.</div><div class="btns"><button class="btn sm primary" data-act="personform">Add your Rival</button></div>`, "", "flag")}
  ${trialHero()}
  <button class="btn primary block bigbtn" data-act="moment">${px("people")} Log a moment</button>
  ${fold("ppl-rival", `<b class="grow">Rival</b><span class="small muted">${(() => { const L = ladder(); return L.opp ? esc(L.opp.p.name) : L.me.avg == null ? "rate yourself" : "cleared"; })()}</span>`, rivalBox())}
  ${fold("ppl-list", `<b class="grow">People and ranks</b><span class="small muted">${n}</span>`, `${vPeople()}<div class="btns"><button class="btn sm" data-act="personform">+ Person</button></div>`)}
  ${fold("ppl-more", `<b class="grow">Trials, habits and log</b>`, `<div class="btns" style="margin-top:0">${Sy.has(5) ? `<button class="btn sm" data-act="sheet" data-id="trial">New trial</button>` : ""}<button class="btn sm" data-act="go" data-id="people/habits">Habit library</button><button class="btn sm" data-act="go" data-id="people/battle">Battle log</button>${Sy.has(5) ? `<button class="btn sm" data-act="go" data-id="people/appraise">Appraisal</button>` : ""}<button class="btn sm" data-act="go" data-id="people/log">Moment log</button></div>
    ${Soc.openTrials().length > 1 ? `<div class="list" style="margin-top:10px">${Soc.openTrials().slice(1, 6).map(k => trialRow(k, false)).join("")}</div>` : ""}`)}`;
}
// This week's Trial: the oldest open one, or one tap to take the week's Trial (Rival at stage 4, the next Tower floor from stage 5).
function weeklyPick() {
  if (Sy.has(5)) { const fl = Soc.towerNext(); return { type: "tower", title: `Floor ${fl}: ${TOWER[fl - 1]}`, floor: fl, label: `Fear Tower · floor ${fl}` }; }
  const L = ladder();
  if (L.opp) { const g = gaps(L.opp)[0], c = g ? g.c : S.settings.social.criteria[0]; return { type: "rival", title: `${c} vs ${L.opp.p.name}: ${RIVAL_ACT[c] || "Practise " + c + " on purpose twice this week."}`, trait: c, person: L.opp.p.id, label: "Rival Trial" }; }
  return { type: "taste", title: TRIAL_TASTE, label: "Show your taste" };
}
const TRIAL_TASTE = "Show one thing you're into: wear it, play it or recommend it, and say why";
function trialHero() {
  const k = Soc.openTrials()[0], sun = E.parse(E.today()).getDay() === 0;
  if (k) {
    const floor = k.trial === "tower" ? `Fear Tower · floor ${k.floor || 1}` : TRIALS[k.trial]?.name || "Trial";
    return `<div class="hero trial-hero"><div class="row between"><span class="hdr">${px("flame")} This week's Trial</span><span class="hdr">+${Soc.xpFor(k)} XP</span></div>
      <div class="small muted" style="margin-top:4px">${esc(floor)} · ${esc(trialDue(k))}</div><div class="now-t">${esc(k.title)}</div>
      <div class="btns"><button class="btn go" data-act="taskdone" data-id="${k.id}">Done</button>${k.snoozed ? "" : `<button class="btn" data-act="trialnotyet" data-id="${k.id}">Not yet</button>`}</div></div>`;
  }
  const w = weeklyPick();
  return `<div class="hero trial-hero"><div class="row between"><span class="hdr">${px("flame")} This week's Trial</span>${sun ? `<span class="hdr">Sunday</span>` : ""}</div>
    <div class="small muted" style="margin-top:4px">${esc(w.label)}</div><div class="now-t">${esc(w.title)}</div>
    <div class="btns"><button class="btn go" data-act="weeklytrial">Accept</button></div></div>`;
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
  <div class="list" style="margin-top:12px">${ppl.map(({ p, st, rk }) => `<button class="q tbtn person" data-act="go" data-id="people/p/${p.id}">
      ${badge(rk)}<div class="grow"><div class="t">${esc(p.name)}</div>
      <div class="small muted">${esc(ptype(p.type)[1])} · ${st.since === null ? "never logged" : st.since === 0 ? "seen today" : `seen ${st.since}d ago`}</div></div><span class="chev">${ic("right")}</span></button>`).join("") || `<p class="empty">Nobody registered yet. Add the people you want to keep close, or keep an eye on.</p>`}</div>
  ${tip("people-rank", "Rank is the average of your scores (? left out): S 4.5+, A 3.8+, B 3.0+, C 2.2+, D 1.5+, E below. Each score has a Key on the person's page. It's your private read, not a verdict on them.")}`;
}
function vPerson(id) {
  const p = live("people").find(x => x.id === id);
  if (!p) return `<button class="back" data-act="nav" data-id="people">${ic("left")} People</button><p class="empty">Not found.</p>`;
  const rk = rankOf(p), st = personState(p), crit = S.settings.social.criteria;
  const hs = live("hangouts").filter(h => (h.people || []).includes(id)).sort((a, b) => b.date.localeCompare(a.date));
  const sc = p.scores || {}, notes = live("fieldNotes").filter(n => n.person === p.id), mom = h => `<div class="item small"><b>${E.fmtDate(h.date)}</b> ${esc(h.what || "")}${h.note ? `<div class="muted">${esc(h.note)}</div>` : ""}</div>`;
  return `<button class="back" data-act="nav" data-id="people">${ic("left")} People</button>
  <div class="row" style="gap:14px;margin:6px 0 4px">${badge(rk, true)}<div><h1>${esc(p.name)}</h1><div class="small muted">${esc(ptype(p.type)[1])}${rk.avg ? ` · ${rk.avg.toFixed(1)} avg` : " · unrated"}${st.since === null ? "" : ` · seen ${st.since ? st.since + "d ago" : "today"}`}</div></div></div>
  <div class="panel"><span class="k">Last moments</span>${hs.slice(0, 3).map(mom).join("") || `<p class="empty">No moments yet.</p>`}
    <div class="btns"><button class="btn go" data-act="moment" data-id="${p.id}">Log a moment with ${esc(p.name)}</button></div></div>
  <div class="panel"><span class="k">Known traits</span><div class="traits">${crit.map(c => `<span class="trait"><span>${esc(c)}</span><b class="mono">${sc[c] > 0 ? sc[c] : "?"}</b></span>`).join("")}</div>
    ${notes.length ? `<div style="margin-top:8px">${notes.map(n => `<div class="item small"><b>${esc(n.trait)}</b> · ${esc(n.habit)}${n.status ? ` <span class="muted">· ${n.status === "notme" ? "not me" : n.status}</span>` : ""}</div>`).join("")}</div>` : ""}</div>
  ${fold("per-rate", `<b class="grow">Rate traits</b>`, crit.map(c => critRow(c, sc[c] || 0, p.id)).join(""), !crit.some(c => sc[c] > 0))}
  ${fold("per-notes", `<b class="grow">Notes</b>`, `<div class="grid"><label class="f">Type<select data-ch="ptype" data-id="${p.id}">${PERSON_TYPES.map(([k, l]) => `<option value="${k}" ${p.type === k ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
    <label class="f" style="margin-top:8px">Where you met<input data-ch="pwhere" data-id="${p.id}" value="${esc(p.where || "")}"></label>
    <label class="f" style="margin-top:8px">Notes (birthday, interests, what you talked about)<textarea data-ch="pnote" data-id="${p.id}" rows="4">${esc(p.note || "")}</textarea></label>`)}
  ${hs.length > 3 ? fold("per-hist", `<b class="grow">All moments</b><span class="small muted">${hs.length}</span>`, hs.map(mom).join("")) : ""}
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
    <div class="btns"><button class="btn go" data-act="addhang">Log it</button></div></div>
  <h2>History <span class="n">${hs.length}</span></h2>
  <div class="panel">${hs.map(h => `<div class="item row between"><div class="grow small"><b>${E.fmtDate(h.date)}</b> ${esc(h.what || "")}<div class="muted">${(h.people || []).map(id => byId[id] ? esc(byId[id].name) : "?").join(", ")}${h.note ? " · " + esc(h.note) : ""}</div></div>
    <button class="btn sm danger" data-act="delhang" data-id="${h.id}" aria-label="Delete hangout">${ic("x")}</button></div>`).join("") || `<p class="empty">No moments logged.</p>`}</div>
  <details class="panel"><summary>Rating criteria</summary>
    <p class="small muted">One per line. Renaming one drops its old scores.</p>
    <textarea data-ch="criteria" rows="6">${esc(S.settings.social.criteria.join("\n"))}</textarea></details>`;
}

/* ================= PLAN ================= */
let planDate = null, taskForm = null, blockForm = null, blockNew = null;
const kindChip = k => { const K = P.KINDS[k] || P.KINDS.other; return `<span class="kchip" style="--c:var(--${K.c})">${esc(K.label)}</span>`; };
const span = (s, e) => `${P.toHM(s)}–${P.toHM(e)}`;
const dayLabel = d => d === E.today() ? "Today" : d === E.addDays(E.today(), 1) ? "Tomorrow" : E.fmtDate(d);

const planHead = cur => `<header class="top"><div><div class="hdr">${esc(E.fmtDate(E.today()))}</div><h1>Plan</h1></div>
    <div class="row" style="gap:8px"><button class="btn sm" data-act="dlform">+ Deadline</button>${gear("plan")}</div></header>
  <div class="pills">${[["plan", "Day"], ["plan/week", "Week"]].map(([k, l]) => `<button class="pill" data-act="go" data-id="${k}" aria-pressed="${cur === l.toLowerCase()}">${l}</button>`).join("")}</div>`;
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
  const horizon = E.addDays(t, 13), backlog = live("tasks").filter(k => !k.done && !p.at.get(k.id) && !Dl.isDeadline(k) && !(k.after && k.after > horizon)).sort((a, b) => !!b.penalty - !!a.penalty || b.prio - a.prio);
  const done = live("tasks").filter(k => k.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 20);
  const taskRow = k => `<div class="q ${k.penalty ? "pen-q" : ""}"><button class="bx" data-act="taskdone" data-id="${k.id}" aria-label="Done: ${esc(k.title)}"></button>
    <button class="grow tbtn" data-act="sheet" data-id="task:${k.id}"><div class="t">${esc(k.title)}</div><div class="small muted">${P.dur(k.mins)}${k.due ? ` · due ${E.fmtDate(k.due)}` : ""} · no free slot in 2 weeks</div></button><span></span></div>`;
  return `${wd && d === t ? sysBox(`Wind-down time. Bed at ${P.toHM(wd.bed)}.`, "Screens off, shower, set out tomorrow's clothes. The day is done.") : ""}
  <div class="dayhead"><button class="rbtn" data-act="pday" data-id="${E.addDays(d, -1)}" ${d <= min ? "disabled" : ""} aria-label="Previous day">${ic("left")}</button>
    <button class="tbtn grow" data-act="pday" data-id="${t}"><b>${esc(dayLabel(d))}</b><div class="small muted">${d === t ? E.fmtDate(d) + " · " : ""}${tasksMin ? P.dur(tasksMin) + " of tasks" : "no tasks planned"}</div></button>
    <button class="rbtn" data-act="pday" data-id="${E.addDays(d, 1)}" ${d >= max ? "disabled" : ""} aria-label="Next day">${ic("right")}</button></div>
  ${dlMarks(d)}<div class="panel agenda" id="dayline" data-min="${min}" data-max="${max}">${agendaRows(d, p)}</div>
  ${tip("plan-day", "Tasks fill free gaps by deadline, then priority, and re-plan whenever something changes. Tap a task to pin, move or edit it; tap a block to edit it. Swipe to change day.")}
  ${dlFold()}
  ${fold("backlog", `<b class="grow">Backlog</b><span class="small ${backlog.length ? "warn" : "muted"}">${backlog.length}</span>`, `<div class="list">${backlog.map(taskRow).join("") || `<p class="empty">Every task has a slot.</p>`}</div>`, backlog.length > 0)}
  ${done.length ? fold("done-tasks", `<b class="grow">Done</b><span class="small muted">${done.length}</span>`, done.map(k => `<div class="item row between"><span class="small grow">${esc(k.title)} <span class="muted">· ${E.fmtDate(E.ymd(new Date(k.doneAt || Date.now())))}</span></span><button class="btn sm" data-act="taskundo" data-id="${k.id}">Undo</button></div>`).join("")) : ""}`;
}

/* ================= DUNGEON ================= */
// Stat building, gated by quest blocks: the Body dungeon (lifting, runs, calisthenics) and the Study dungeon
// (topic + pomodoro, then flashcards, then JLPT practice). Each opens only around its block; skipping costs XP.
/* ================= CLASS HALL (v3.2) ================= */
// Disciplines (chapters → quizzes → boss exam), classes and titles. Only the current chapter of each discipline shows.
let dq = null, chEdit = false; // quiz in progress {id, ch, qs, ans, res}; own-chapter editor open
function vClasses([sub, id, ch]) {
  if (sub === "d") return vDisc(id);
  if (sub === "q") return vDiscQuiz(id, ch);
  const act = Cl.active(), pc = Cl.pace(), tl = Cl.titles(), eq = (S.settings.classes || {}).equipped;
  const head = `<header class="top"><div><div class="hdr">${esc(E.fmtDate(E.today()))}</div><h1>Study</h1></div>${gear("dungeon")}</header>`;
  const discRow = id => { const d = Cl.disc(id), c = Cl.currentChapter(id), L = Cl.chapters(id);
    return `<button class="panel discp" data-act="go" data-id="classes/d/${id}"><div class="row between"><b>${esc(d.name)}</b><span class="small muted">${Cl.clearedCount(id)}/${L.length}${Cl.bossPassed(id) ? " · cleared" : ""}</span></div>
      ${bar(Cl.clearedCount(id) / (L.length || 1), "var(--acc)")}
      <div class="small muted">${c ? (Cl.readDone(id, c.id) ? `Quiz ready: ${esc(c.title)}` : `Now: ${esc(c.title)}${Cl.readPct(c.id) ? ` · ${Cl.readPct(c.id)}% read` : ""}`) : Cl.bossPassed(id) ? `Title earned: ${esc(d.title)}` : "Boss exam open"}</div></button>`; };
  const classRow = c => { const ci = Cl.classInfo(c.id);
    return `<div class="item"><div class="row between"><b>${esc(c.name)}</b><span class="small ${ci.earned ? "" : "muted"}">${ci.earned ? ic("check", "inl") + " earned" : `${ci.got.length}/${c.needs.length}`}</span></div>
      <div class="chips" style="margin-top:6px">${c.needs.map(n => `<span class="chip ${Cl.bossPassed(n) ? "on" : act.includes(n) ? "half" : ""}">${esc(Cl.disc(n)?.name || n)}</span>`).join("")}</div>
      ${ci.ready ? `<div class="small" style="margin-top:6px">Capstone: ${esc(c.capstone)}</div><div class="btns"><button class="btn sm ${ci.earned ? "" : "go"}" data-act="capstone" data-id="${c.id}">${ci.earned ? "Undo capstone" : "Capstone done"}</button></div>` : ""}</div>`; };
  const others = Cl.all().filter(d => !act.includes(d.id)), due = K.queue().length;
  // The hero: the chapter the System wants next (the discipline with the most hours left), with Start.
  const pick = Cl.studyTopics()[0], hid = pick ? pick.disc : act[0], hd = hid && Cl.disc(hid), hc = hid && Cl.currentChapter(hid);
  const hero = !act.length ? `<div class="hero"><span class="hdr">${px("scroll")} First discipline</span><div class="now-t">Accounting</div>
      <div class="small muted">The shared core of all three target roles. One chapter at a time: read it, pass its quiz, the next one opens.</div>
      <div class="btns"><button class="btn go" data-act="discon" data-id="acct">Start Accounting</button></div></div>`
    : `<div class="hero"><div class="row between"><span class="hdr">${px("scroll")} ${esc(hd.name)}${hc ? ` · chapter ${Cl.chapters(hid).indexOf(hc) + 1} of ${Cl.chapters(hid).length}` : ""}</span>${hc ? `<span class="hdr">${Cl.readPct(hc.id)}%</span>` : ""}</div>
      <div class="now-t">${hc ? esc(hc.title) : Cl.bossPassed(hid) ? "Cleared" : "Boss exam open"}</div>
      <div class="btns"><button class="btn go" data-act="go" data-id="classes/d/${hid}">${hc && Cl.readDone(hid, hc.id) ? "Take the quiz" : "Start"}</button>
</div></div>${reviewBtn()}`;
  // Japanese is a discipline here: Genki lessons are its chapters, the JLPT ladder its progress, N-level mocks its boss.
  const jpL = St.topics("jp"), jpCur = St.current("jp"), jpOpen = (jpL[0] && St.progress("jp", jpL[0].id) >= 100) || live("jlptItems").length > 0 || live("jlptExams").length > 0;
  const jpRow = !jpOpen ? "" : `<button class="panel discp" data-act="go" data-id="jlpt"><div class="row between"><b>Japanese</b><span class="small muted">${jpL.filter(x => St.progress("jp", x.id) >= 100).length}/${jpL.length}</span></div>
      ${bar(jpL.filter(x => St.progress("jp", x.id) >= 100).length / (jpL.length || 1), "var(--acc)")}
      <div class="small muted">${jpCur ? `Now: ${esc(jpCur.t)} · ${St.progress("jp", jpCur.id)}%` : "Every lesson done"} · JLPT ladder and mock exams</div></button>`;
  const canAdd = act.some(id => Cl.clearedCount(id) > 0);
  return `${head}
  ${hero}
  ${act.length > 1 ? `<h2>Active <span class="n">${act.length}/${Cl.CAP}</span></h2>${act.filter(id => id !== hid).map(discRow).join("")}` : ""}
  ${jpRow}
  ${act.length ? `<div class="panel ${pc.ok ? "" : "warnp"}"><div class="row between"><b>Pace</b><span class="small ${pc.ok ? "" : "warn"}">${pc.ok ? "on pace" : "behind"}</span></div>
    <div class="small muted">${pc.need} h left in these disciplines · ${pc.have} h of Finance blocks before graduation (${pc.wk} h a week). ${pc.ok ? "" : `Needs ${pc.perWeek} h a week: add a block or drop a discipline.`}</div></div>` : ""}
  ${canAdd || act.length > 1 ? fold("cl-add", `<b class="grow">Add a discipline</b>`, others.map(d => `<div class="row between item"><div class="grow"><b>${esc(d.name)}</b><div class="tiny muted">${esc(d.blurb)}</div></div>
    <button class="btn sm" data-act="discon" data-id="${d.id}" ${act.length >= Cl.CAP ? "disabled" : ""}>Start</button></div>`).join("") + (act.length >= Cl.CAP ? `<p class="tiny muted">${Cl.CAP} active is the cap. Drop one to start another.</p>` : "")) : ""}
  ${fold("cl-classes", `<b class="grow">Classes</b>`, `${Cl.CLASSES.filter(c => Cl.CORE.includes(c.id)).map(classRow).join("")}
    <details style="margin-top:8px"><summary class="small">Other paths</summary>${Cl.CLASSES.filter(c => !Cl.CORE.includes(c.id)).map(classRow).join("")}</details>
    <h3 style="margin-top:12px">Specialisations</h3>${Cl.SPECS.map(sp => { const si = Cl.specInfo(sp.id); return `<div class="small item">${si.earned ? ic("check", "inl") + " " : ""}<b>${esc(sp.name)}</b> <span class="muted">· ${esc(Cl.CLASSES.find(c => c.id === sp.base).name)} + ${esc(Cl.plusName(sp.plus))}</span></div>`; }).join("")}`)}
  ${fold("cl-topics", `<b class="grow">Block topics, reports and penalties</b>`, vStudy())}
  <div class="quiet-links"><button data-act="go" data-id="cards">Flashcard decks</button></div>`;
}
// v6 Arcs: chapters open 5 at a time as a checklist; the rest stay sealed until the Arc is cleared.
function discArc(id, L, c) {
  const i = c ? L.indexOf(c) : L.length - 1, a = Math.floor(i / Pa.ARC), arcL = L.slice(a * Pa.ARC, a * Pa.ARC + Pa.ARC), sealed = L.length - (a * Pa.ARC + arcL.length);
  return `<div class="panel"><div class="row between"><b>Arc ${a + 1}</b><span class="small muted mono">${arcL.filter(x => Cl.chapterCleared(id, x.id)).length}/${arcL.length}</span></div>
    ${arcL.map(x => { const ok = Cl.chapterCleared(id, x.id), cur = c && x.id === c.id; return `<div class="arc-i ${ok ? "done" : cur ? "cur" : ""}">${ok ? ic("check", "inl") : cur ? px("sword") : `<i class="arc-dot"></i>`}<span>${esc(x.title)}</span></div>`; }).join("")}
    ${sealed > 0 ? `<div class="sealed" style="margin-top:8px">${ic("lock", "inl")} Next Arc sealed until these ${arcL.length} are cleared</div>` : ""}</div>`;
}
function vDisc(id) {
  const d = Cl.disc(id); if (!d) return `<button class="back" data-act="nav" data-id="classes">${ic("left")} Study</button><h1>Not found</h1>`;
  const L = Cl.chapters(id), c = Cl.currentChapter(id), on = Cl.active().includes(id), done = L.filter(x => Cl.chapterCleared(id, x.id));
  const hidden = c ? L.length - done.length - 1 : 0, custom = Cl.isCustom(id);
  const cur = c ? `<div class="panel hero"><div class="row between"><span class="hdr">Chapter ${L.indexOf(c) + 1} of ${L.length} · ~${c.hours} h</span><span class="hdr">${Cl.readPct(c.id)}% read</span></div>
      <h3 style="margin-top:6px">${esc(c.title)}</h3>
      <p class="small"><b>Read</b> · ${esc(c.read || "")}</p><p class="small"><b>Produce</b> · ${esc(c.produce || "")}</p>
      ${bar(Cl.readPct(c.id) / 100, "var(--acc)")}
      <div class="btns">${custom ? `<button class="btn go" data-act="chself" data-id="${c.id}">Chapter done</button>`
        : Cl.readDone(id, c.id) ? `<button class="btn go" data-act="go" data-id="classes/q/${id}/${c.id}">Take the chapter quiz</button>`
        : `<button class="btn" data-act="chread" data-id="${c.id}">Reading done</button>`}</div>
      <p class="tiny muted">${custom ? "Your own chapter list: mark it done when the output exists." : Cl.readDone(id, c.id) ? "6 questions; 5 right clears the chapter. Misses become flashcards." : "Finance study blocks fill the reading bar. Tap Reading done if you studied it elsewhere; the quiz opens."}</p></div>`
    : Cl.bossPassed(id) ? sysBox(`Discipline cleared. Title earned: <b>${esc(d.title)}</b>.`, "Equip it in Profile.")
    : `<div class="panel dgate open"><span class="k">Boss exam</span><h3 style="margin:2px 0 6px">${esc(d.title)}</h3><p class="small muted">10 questions across every chapter. 70% clears it and earns the title.</p>
      <div class="btns"><button class="btn go" data-act="go" data-id="classes/q/${id}/boss">Enter the boss exam</button></div></div>`;
  return `<button class="back" data-act="nav" data-id="classes">${ic("left")} Study</button>
  <header class="top"><div><div class="hdr">Discipline · ${esc(d.title)}</div><h1>${esc(d.name)}</h1></div></header>
  <p class="small muted" style="margin:0 4px 8px">${esc(d.blurb)}</p>
  ${on ? cur : `<div class="panel"><p class="small">Not active.</p><div class="btns"><button class="btn go" data-act="discon" data-id="${id}" ${Cl.active().length >= Cl.CAP ? "disabled" : ""}>Start</button></div></div>`}
  ${on && L.length ? discArc(id, L, c) : ""}
  ${chEdit ? `<div class="panel"><h3>Your own chapters</h3><p class="tiny muted">One per line: Title | what to read | what to produce | hours. Use your book's contents page. Quizzes only cover the starter chapters, so your own chapters are marked done by hand; the boss exam stays.</p>
      <textarea data-f="chapters" rows="12" style="font-size:13px">${esc(L.map(x => [x.title, x.read, x.produce, x.hours].join(" | ")).join("\n"))}</textarea>
      <div class="btns"><button class="btn go" data-act="chsave" data-id="${id}">Save</button><button class="btn" data-act="chedit">Cancel</button>${custom ? `<button class="btn danger" data-act="chreset" data-id="${id}">Back to the starter list</button>` : ""}</div></div>`
    : `<div class="quiet-links">${on ? `<button data-act="discoff" data-id="${id}">Drop this discipline</button>` : ""}<button data-act="chedit" data-id="${id}">Use my own book's chapters</button></div>`}`;
}
function vDiscQuiz(id, ch) {
  const d = Cl.disc(id), back = `<button class="back" data-act="nav" data-id="classes/d/${id}">${ic("left")} ${esc(d ? d.name : "Back")}</button>`;
  if (!d) return back;
  const boss = ch === "boss";
  if (!dq || dq.id !== id || dq.ch !== ch) {
    dq = { id, ch, qs: null, ans: [], res: null };
    Cl.loadFull(id).then(f => {
      if (!dq || dq.id !== id || dq.ch !== ch) return;
      const src = boss ? f.boss : (f.chapters.find(x => x.id === ch) || {}).quiz || [];
      dq.qs = src.map((q, i) => ({ ...q, _i: i })); render();
    }).catch(() => { if (dq) { dq.err = true; render(); } });
  }
  const title = boss ? "Boss exam" : (Cl.chapters(id).find(x => x.id === ch) || {}).title || "Chapter quiz";
  const head = `${back}<header class="top"><div><div class="hdr">${esc(d.name)} · ${boss ? "10 questions · 70% to clear" : "6 questions · 5 to clear"}</div><h1>${esc(title)}</h1></div></header>`;
  if (dq.err) return head + `<p class="empty">Couldn't load the questions. Check the connection and try again.</p>`;
  if (!dq.qs) return head + `<p class="muted">Loading…</p>`;
  const r = dq.res;
  const qHtml = (q, i) => { const a = dq.ans[i], ok = r && Cl.correct(q, a);
    return `<div class="panel dq ${r ? (ok ? "right" : "wrong") : ""}"><div class="k">Q${i + 1}</div><p style="white-space:pre-wrap">${esc(q.q)}</p>
      ${Cl.isNum(q) ? `<div class="row" style="gap:8px">${q.unit === "¥" ? "<span>¥</span>" : ""}<input inputmode="decimal" data-ch="dqnum" data-id="${i}" value="${esc(a ?? "")}" ${r ? "disabled" : ""} style="max-width:180px">${q.unit && q.unit !== "¥" ? `<span>${esc(q.unit)}</span>` : ""}</div>`
        : `<div class="list">${q.opts.map((o, j) => `<button class="opt ${a === j ? "sel" : ""} ${r && j === q.a ? "ans" : ""}" data-act="dqpick" data-id="${i}:${j}" ${r ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div>`}
      ${r ? `<div class="small" style="margin-top:8px">${ok ? ic("check", "inl") + " Right." : `Answer: <b>${esc(Cl.answerText(q))}</b>.`} <span class="muted">${esc(q.ex || "")}</span></div>` : ""}</div>`; };
  return head + (r ? sysBox(r.pass ? (boss ? `Boss cleared. Title earned: <b>${esc(d.title)}</b>.` : "Chapter cleared. The next one is open.") : `${r.ok}/${r.n}. Not yet.`, r.pass ? "" : "Your misses are now flashcards. Review them and retake when ready.",
      `<div class="btns"><button class="btn sm primary" data-act="go" data-id="classes/d/${id}">Back to ${esc(d.name)}</button>${r.pass ? "" : `<button class="btn sm" data-act="dqretry">Retake</button>`}${rcBtn()}</div>`) : "")
    + dq.qs.map(qHtml).join("")
    + (r ? "" : `<div class="btns"><button class="btn go block" data-act="dqsubmit">Submit</button></div>`);
}

let topicEdit = null; // subject whose topic list is open for editing
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
      ${k === "fin" && Cl.active().length ? `<p class="tiny muted">Finance blocks follow your active disciplines. The System picks the chapter.</p><div class="btns"><button class="btn sm" data-act="go" data-id="classes">Study</button></div>` : `<div class="btns"><button class="btn sm" data-act="topicedit" data-id="${k}">Edit list</button></div>
      <p class="tiny muted">Blocks named like "${esc(SUBJECTS[k].match.split("|")[0])}…" use this list.</p>`}</div>`;
  }).join("");
  const logs = live("blockLog").filter(r => r.final).sort((a, b) => b.at - a.at).slice(0, 15);
  const pens = live("penalties").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15), open = new Set(St.openPenalties().map(p => p.id));
  return `${fg.open ? `<div class="btns" style="margin-top:0"><button class="btn primary" data-act="nav" data-id="focus">${fg.ended ? "Report " : "Enter "}${esc(fg.o.b.title)}</button></div>` : ""}
  <h2>Topics <span class="n">one per study block</span></h2>${subj}
  ${fold("study-reports", `<b class="grow">Reports</b><span class="small muted">${logs.length}</span>`, `${logs.map(r => `<div class="item row between"><div class="grow small"><b>${esc(r.title)}</b> · ${esc(dayLabel(r.date))}<div class="muted">${r.done ? "Done" : r.gain || r.poms ? `+${r.gain}% · ${r.poms} round${r.poms === 1 ? "" : "s"}` : "Not done"}${r.topic && r.subj ? " · " + esc((St.topics(r.subj).find(t => t.id === r.topic) || {}).t || "") : ""}</div></div>
    <button class="btn sm" data-act="delreport" data-id="${r.id}">Delete</button></div>`).join("") || `<p class="empty">No reports yet. They show up after each study block.</p>`}`)}
  ${fold("study-pens", `<b class="grow">Penalties</b><span class="small ${open.size ? "bad-t" : "muted"}">${open.size} open</span>`, `${pens.map(p => `<div class="item row between small"><span class="grow">${esc(p.title)} · ${esc(dayLabel(p.date))} ${P.toHM(p.s || 0)}</span><span class="${open.has(p.id) ? "bad-t" : "muted"}">${p.waived ? "waived (one open at a time)" : `−${p.xp} XP · ${open.has(p.id) ? "open" : "cleared"}`}</span></div>`).join("") || `<p class="empty">None. Keep it that way.</p>`}`, open.size > 0)}`;
}

/* ================= FLASHCARDS ================= */
let cardForm = null, rv = null, bulkOpen = false, recorder = null, newDeck = null; // editor, current review card, bulk paste open, live MediaRecorder, deck for the next new card
const lastDeck = () => { try { return localStorage.getItem("kts-deck") || "My cards"; } catch (e) { return "My cards"; } };
const setLastDeck = d => { try { localStorage.setItem("kts-deck", d); } catch (e) {} };
const deckList = id => `<datalist id="${id}">${K.deckNames().map(d => `<option value="${esc(d)}">`).join("")}</datalist>`;
const starterIds = lesson => STARTER[lesson].map((_, i) => "st-" + lesson.replace(/\W/g, "") + "-" + i);
function gateClosedHtml(g, what) {
  const nx = g.next;
  return `<div class="panel locked-gate"><div class="row" style="gap:10px">${ic("lock", "big-lock")}<div><div class="hdr">System · Not open yet</div>
    <b>${nx ? `Opens ${nx.date === E.today() ? "today" : esc(dayLabel(nx.date))} at ${P.toHM(nx.s)}` : "No study block this week"}</b>
    <div class="small muted">${what} run inside study blocks.${nx ? " Next: " + esc(nx.b.title) + "." : ""}</div></div></div></div>`;
}
function vCards([sub, a]) {
  if (sub === "review") return vReview();
  if (sub === "edit") return vCardEdit(a);
  if (sub === "deck") return vDeck(a);
  const back = `<button class="back" data-act="nav" data-id="dungeon">${ic("left")} Dungeon</button>`;
  const q = K.queue(), g = St.focusGate(), decks = K.deckNames(), done = K.reviewedToday();
  const head = `${back}<header class="top"><div><div class="hdr">Study</div><h1>Flashcards</h1></div>${gear("dungeon")}</header>`;
  const rev = `<div class="panel dgate ${g.open && q.length ? "open" : ""}"><div class="row between"><div class="grow"><span class="k">Due now</span><h3 style="margin:2px 0 4px">${q.length} card${q.length === 1 ? "" : "s"}</h3>
    <div class="small muted">${done.n ? `${done.n} reviewed today, ${Math.round(done.ok / done.n * 100)}% right` : "None reviewed today"}</div></div>
    ${q.length ? `<button class="btn go" data-act="nav" data-id="cards/review">Review</button>` : `<button class="btn" data-act="learnmore">Learn 10 new</button>`}</div></div>`;
  const deckRows = decks.map(d => { const all = K.inDeck(d), due = K.dueCount(d);
    return `<button class="panel tbtn row between" style="width:100%;margin:0 0 8px" data-act="go" data-id="cards/deck/${encodeURIComponent(d)}"><span class="grow" style="text-align:left"><b>${esc(d)}</b><div class="small muted">${all.length} card${all.length === 1 ? "" : "s"}${K.flipOnly(d) ? " · flip only until it has 4" : ""}</div></span><span class="small ${due ? "" : "muted"}">${due} due</span></button>`; }).join("");
  const bulk = bulkOpen ? `<div class="panel" id="bulkForm"><h3>Bulk paste</h3><p class="tiny muted">One card per line: front | back. A tab works too, so you can paste two spreadsheet columns.</p>
    <textarea data-f="bulk" rows="8" placeholder="泳ぐ | to swim&#10;先輩 | senior"></textarea>
    <label class="f" style="margin-top:8px">Deck<input data-f="deck" list="dl-bulk" value="${esc(lastDeck())}"></label>${deckList("dl-bulk")}
    <div class="btns"><button class="btn go" data-act="bulkadd">Add cards</button><button class="btn" data-act="bulk">Cancel</button></div></div>` : "";
  return `${head}${rev}
  ${tip("cards", "New cards are multiple choice. Get one right 3 times over 2 different days and it becomes a flip card you grade yourself. Miss a flip card twice in a row and it goes back to choices.")}
  <div class="btns" style="margin-top:0"><button class="btn primary" data-act="go" data-id="cards/edit/new">${ic("plus")} New card</button><button class="btn" data-act="bulk">Bulk paste</button></div>
  ${bulk}
  <h2>Decks <span class="n">${cardsCount()}</span></h2>${deckRows || `<p class="empty">No cards yet. Add one or paste a list. Japanese vocabulary lives in the Lexicon.</p>`}
`;
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
function fcFace(c, showBack, noSay) {
  if (c.lex) return lexFace(c, showBack, noSay);
  const ja = K.jaText(c);
  return `${c.img ? `<img class="fc-img" data-photo="${c.img}" alt="">` : ""}<div class="fc-front ${K.JA_RE.test(c.front) ? "ja" : ""}">${esc(c.front)}</div>
    ${showBack ? `<div class="fc-back ${K.JA_RE.test(c.back) ? "ja" : ""}">${esc(c.back)}</div>` : ""}
    <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">${ja ? `<button class="btn sm" data-act="say" data-id="${c.id}">${ic("sound")} Listen</button>` : ""}${c.aud && (showBack || !ja) ? `<audio controls data-photo="${c.aud}"></audio>` : ""}</div>`;
}
/* ================= LEXICON (v8) ================= */
// Every imported word and kanji, by level, each with an on/off switch. Off = "I know it": never asked.
let lx = { type: "vocab", level: null, st: "all", q: "", n: 60, sel: null, open: null };
const LX_ST = [["all", "All"], ["new", "New"], ["learning", "Learning"], ["known", "Known"], ["off", "Off"]];
function lexImportHtml() {
  return `<div class="panel"><h3>Import your decks</h3><p class="small muted">Open <b>the-arin-japanese-decks.json</b> from the project files. It stays on this phone; only your progress syncs. Import it once on each phone you use.</p>
    <div class="btns"><label class="btn go">${ic("plus")} Choose the file<input type="file" accept="application/json,.json" data-ch="leximport" hidden></label></div></div>`;
}
function vLex() {
  const back = `<button class="back" data-act="nav" data-id="jlpt">${ic("left")} Japanese</button>`;
  const head = `${back}<header class="top"><div><div class="hdr">Japanese</div><h1>Lexicon</h1></div>${Lx.ready() ? `<button class="btn sm" data-act="lexsel">${lx.sel ? "Done" : "Select"}</button>` : ""}</header>`;
  if (!Lx.ready()) return head + lexImportHtml();
  const m = Lx.recs(), lv = Lx.LEVELS[lx.type];
  if (lx.level && !lv.includes(lx.level)) lx.level = null;
  const chip = l => { const c = Lx.counts(lx.type, l, m), on = lx.level === l;
    return `<button class="lvchip ${on ? "on" : ""}" data-act="lexlvl" data-id="${l || ""}" aria-pressed="${on}"><b>${l || "All"}</b><span class="mono">${c.all.toLocaleString("en-US")}</span>
      <i class="lvbar"><i style="width:${(c.known + c.off) / (c.all || 1) * 100}%" class="k"></i><i style="width:${c.learning / (c.all || 1) * 100}%" class="l"></i></i></button>`; };
  const L = Lx.rows(lx.type, lx.level, lx.st, lx.q, m), shown = L.slice(0, lx.n);
  const row = e => { const r = m.get(e.id), st = Lx.status(r), off = st === "off", sel = lx.sel && lx.sel.has(e.id), open = lx.open === e.id;
    return `<div class="lexrow ${off ? "is-off" : ""} ${sel ? "sel" : ""}">
      <button class="lexmain" data-act="${lx.sel ? "lexpick" : "lexopen"}" data-id="${e.id}"><span class="lw ja">${esc(Lx.face(e))}</span><span class="lr ja">${esc(Lx.reading(e))}</span><span class="lm">${esc(e.meaning || "")}</span></button>
      ${lx.sel ? `<span class="lexck">${sel ? ic("check") : ""}</span>` : `<button class="sw ${off ? "" : "on"}" role="switch" aria-checked="${!off}" aria-label="Study ${esc(Lx.face(e))}" data-act="lexoff" data-id="${e.id}"><i></i></button>`}
      ${open ? `<div class="lexdet">${st !== "new" ? `<span class="tag">${st}</span> ` : ""}${e.type === "kanji" ? `${e.examples ? `<div class="ja small">${esc(e.examples).replace(/\n/g, "<br>")}</div>` : ""}` : `${e.ex ? `<div class="ja small">${esc(e.ex)}</div><div class="small muted">${esc(e.exEn || "")}</div>` : ""}`}
        <div class="btns"><button class="btn sm" data-act="lexsay" data-id="${e.id}">${ic("sound")} Listen</button></div></div>` : ""}</div>`; };
  const cnt = Lx.counts(lx.type, lx.level, m);
  return `${head}
  <div class="pills seg"><button class="pill" data-act="lextype" data-id="vocab" aria-pressed="${lx.type === "vocab"}">Vocabulary</button><button class="pill" data-act="lextype" data-id="kanji" aria-pressed="${lx.type === "kanji"}">Kanji</button></div>
  <div class="lvchips">${[null, ...lv].map(chip).join("")}</div>
  <div class="panel lexbar">
    <div class="pills st">${LX_ST.map(([k, l]) => `<button class="pill" data-act="lexst" data-id="${k}" aria-pressed="${lx.st === k}">${l}${k !== "all" ? ` <span class="mono">${cnt[k]}</span>` : ""}</button>`).join("")}</div>
    <input type="search" data-ch="lexq" placeholder="Search kanji, kana or English" value="${esc(lx.q)}">
    ${lx.level && !lx.sel ? `<div class="btns"><button class="btn sm go" data-act="go" data-id="lex/sort/${lx.type}/${lx.level}">Sort ${lx.level} · ${cnt.new}</button><button class="btn sm" data-act="lexlevel" data-id="off">Turn off all ${lx.level}</button></div>` : ""}
    ${lx.sel ? `<div class="btns"><span class="small grow">${lx.sel.size} selected</span><button class="btn sm" data-act="lexbulk" data-id="off">Turn off</button><button class="btn sm" data-act="lexbulk" data-id="on">Turn on</button><button class="btn sm" data-act="lexshown">Turn off all ${L.length} shown</button></div>` : ""}
  </div>
  <div class="lexlist">${shown.map(row).join("") || `<p class="empty">Nothing here.</p>`}</div>
  ${L.length > shown.length ? `<div class="btns"><button class="btn block" data-act="lexmore">Show more · ${L.length - shown.length} left</button></div>` : ""}`;
}
// Sort mode: one card at a time, word only. "I know it" turns it off; "Learn it" keeps it. Undo up to 10.
let srt = null; // {type, level, ids, i, show, hist:[{id, off}]}
function vSort(type, level) {
  const back = `<button class="back" data-act="sortexit">${ic("left")} Lexicon</button>`;
  if (!Lx.ready()) return back + lexImportHtml();
  if (!srt || srt.type !== type || srt.level !== level) { const m = Lx.recs(); srt = { type, level, ids: Lx.all(type).filter(e => e.level === level && Lx.status(m.get(e.id)) === "new").map(e => e.id), i: 0, show: false, hist: [] }; }
  const e = Lx.entry(srt.ids[srt.i]);
  const head = `${back}<header class="top"><div><div class="hdr">Sort ${esc(level)} · ${srt.i}/${srt.ids.length}</div><h1>Sort</h1></div>${srt.hist.length ? `<button class="btn sm" data-act="sortundo">Undo</button>` : ""}</header>`;
  if (!e) return head + sysBox(`${level} sorted.`, `${srt.hist.filter(h => h.off).length} turned off as known. The rest come in as new cards, a few a day.`, `<div class="btns"><button class="btn sm primary" data-act="sortexit">Back to the Lexicon</button></div>`);
  return `<div class="rv-page">${head}<div class="panel fc srt-card" data-act="sortshow">
    <div class="k">${srt.show ? "" : "Tap to check the answer"}</div><div class="fc-front ja ${type === "kanji" ? "kanji" : ""}">${esc(Lx.face(e))}</div>
    ${srt.show ? `<div class="fc-read ja">${esc(Lx.reading(e))}</div><div class="fc-back">${esc(e.meaning || "")}</div>` : ""}</div>
    <p class="small muted" style="text-align:center">Swipe right if you know it, left to learn it.</p>
    <div class="rv-dock srt-dock"><button class="btn block" data-act="sortpick" data-id="learn">${ic("left")} Learn it</button><button class="btn go block" data-act="sortpick" data-id="know">I know it ${ic("right")}</button></div></div>`;
}
function sortPick(know) {
  if (!srt) return; const id = srt.ids[srt.i]; if (!id) return;
  const r = live("cards").find(x => x.id === id);
  srt.hist.push({ id, off: know, was: !!(r && r.off) }); if (srt.hist.length > 10) srt.hist.shift();
  if (know) K.setOff(id, true);
  srt.i++; srt.show = false; save(); render();
}
// v8: a Lexicon card. Front: the word or kanji. Back: reading, meaning, example (or on/kun and example words).
function lexFace(c, showBack, noSay) {
  const L = c.L, k = L.type === "kanji";
  const back = !showBack ? "" : k
    ? `<div class="fc-read ja">${L.on && L.on.length ? `音 ${esc(L.on.join("、"))}` : ""}${L.kun && L.kun.length ? `${L.on && L.on.length ? "<br>" : ""}訓 ${esc(L.kun.join("、"))}` : ""}</div><div class="fc-back">${esc(L.meaning)}</div>${L.examples ? `<div class="fc-ex ja">${esc(L.examples).replace(/\n/g, "<br>")}</div>` : ""}`
    : `<div class="fc-read ja">${esc((L.readings || []).join("、"))}</div><div class="fc-back">${esc(L.meaning)}</div>${L.ex ? `<div class="fc-ex ja">${esc(L.ex)}</div>${L.exEn ? `<div class="small muted">${esc(L.exEn)}</div>` : ""}` : ""}`;
  return `<div class="fc-front ja ${k ? "kanji" : ""}">${esc(Lx.face(L))}</div>${back}
    ${noSay ? "" : `<div class="row" style="gap:8px;margin-top:10px"><button class="btn sm" data-act="say" data-id="${c.id}">${ic("sound")} Listen</button></div>`}`;
}
function vReview() {
  const back = `<button class="back" data-act="nav" data-id="${St.focusGate().open ? "focus" : "cards"}">${ic("left")} ${St.focusGate().open ? "Dungeon" : "Flashcards"}</button>`;
  const g = St.focusGate();
  const q = K.queue(), done = K.reviewedToday(); // v6: open anytime, not only inside a block
  let c = rv && K.get(rv.id);
  if (!c || (rv.pick == null && !q.some(x => x.id === c.id))) { c = q[0]; rv = c ? { id: c.id, mode: K.mode(c), ask: K.mode(c) === "mcq" ? K.ask(c) : null, flip: false, pick: null } : null; }
  const head = `${back}<header class="top"><div><div class="hdr">Flashcards · ${q.length} left</div><h1>Flashcards</h1></div>${jpsOn() ? `<span class="row" style="gap:8px">${jpsTimer()}${jps.silent ? `<button class="btn sm" data-act="jpend">Back to class</button>` : ""}</span>` : `<span class="small muted">${done.n} today</span>`}</header>`;
  if (!c && jpsOn()) return `${head}${sysBox("Cards cleared.", "Next in this session: today's grammar item, then fluency.", `<div class="btns"><button class="btn sm go" data-act="nav" data-id="jlpt">Next</button><button class="btn sm" data-act="jpend">End session</button></div>`)}`;
  if (!c) return `${head}${sysBox("Due pile cleared.", `${done.n} reviews today${done.n ? ", " + Math.round(done.ok / done.n * 100) + "% right" : ""}. Next: stage 3.`,
    `<div class="btns"><button class="btn sm primary" data-act="nav" data-id="jlpt/q">JLPT practice</button><button class="btn sm" data-act="learnmore">Learn 10 new</button>${g.open ? `<button class="btn sm" data-act="nav" data-id="focus">Back to the block</button>` : ""}<button class="btn sm" data-act="nav" data-id="cards">Decks</button></div>`)}`;
  const know = c.lex ? `<button class="link rvknow" data-act="rvknow" data-id="${c.id}">I know this · turn off</button>` : "";
  const tag = `${know}<div class="k">${esc(c.deck)} · ${rv.mode === "mcq" ? `Choice ${(c.mcqOk || []).length}/3${c.lex ? ` · ${rv.ask.q === "reading" ? "Reading?" : "Meaning?"}` : ""}` : c.s ? "Flip" : "Flip · new"}</div>`;
  if (rv.mode === "mcq") {
    const answered = rv.pick != null, right = rv.ask.ans;
    return `<div class="rv-page">${head}<div class="panel fc">${tag}${fcFace(c, answered && c.lex, !answered && rv.ask.q === "reading")}</div>
      <div class="rv-dock"><div class="opts">${rv.ask.opts.map((o, i) => `<button class="opt ${answered ? (o === right ? "right" : i === rv.pick ? "wrong" : "dim") : ""}" data-act="rvpick" data-id="${i}" ${answered ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div>
      ${answered ? `<div class="btns"><button class="btn primary block" data-act="rvnext">Next</button></div>` : ""}</div></div>`;
  }
  if (!rv.flip) return `<div class="rv-page">${head}<div class="panel fc">${tag}${fcFace(c, false)}</div><div class="rv-dock"><button class="btn primary block" data-act="rvflip">Show answer</button></div></div>`;
  return `<div class="rv-page">${head}<div class="panel fc">${tag}${fcFace(c, true)}</div>
    <div class="rv-dock grades">${[[1, "Again"], [2, "Hard"], [3, "Good"], [4, "Easy"]].map(([gr, l]) => `<button class="grade g${gr}" data-act="rvgrade" data-id="${gr}"><b>${l}</b><span>${K.preview(c, gr)}</span></button>`).join("")}</div></div>`;
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
// v8.1: the N2 plan, one item at a time: the Floor, the open grammar item and its Arc, then fluency once it's done.
function n2Panel() {
  if (!N2.ready()) return "";
  const c = N2.current(), f = N2.floor(), dt = N2.doneToday(), fl = N2.fluency();
  const exam = N2.examAsked() ? "" : `<div class="panel"><b class="small">Exam Raid: JLPT ${Pa.jpExam()} · Sun 4 Jul 2027</b><p class="small muted" style="margin:4px 0 0">Your N2 plan builds to the July sitting. Keep N2, or set the Raid to N3.</p>
    <div class="btns"><button class="btn sm go" data-act="n2exam" data-id="N2">Keep N2</button><button class="btn sm" data-act="n2exam" data-id="N3">Switch to N3</button></div></div>`;
  if (!c) return exam + sysBox("N2 plan complete.", "Every item is done. The exam Raid is what's left.");
  const A = Pa.arc("n2"), ahead = !c.gate && E.today() < c.due;
  const list = A.items.map(x => `<div class="arc-i ${x.done ? "done" : x.cur ? "cur" : ""}">${x.done ? ic("check", "inl") : x.cur ? px("sword") : `<i class="arc-dot"></i>`}<span>${esc(x.t)}</span></div>`).join("");
  const flRow = x => `<div class="q ${x.done ? "done" : ""}"><button class="bx" data-act="n2fl" data-id="${x.ref}" aria-pressed="${x.done}" aria-label="${esc(x.t)} done">${x.done ? ic("check") : ""}</button>
    <div class="grow"><div class="small">${esc(x.t)}</div></div><div class="xp">+${N2.XP_FLUENCY}</div></div>`;
  return `${exam}<div class="panel pstream n2p"><div class="row between"><span class="hdr">${px("gate")} Floor ${f.n} · ${esc(f.name)}</span><span class="small muted">${P.dur(c.m)}</span></div>
    <div class="t n2g">${c.gate ? `Gate Test before Arc ${A.n}.` : esc(c.g)}</div>
    ${ahead ? `<div class="tiny good-t">Ahead of schedule: +50% XP if it's Done.</div>` : ""}
    ${c.gate ? gateBox(c.gate) : fold("arc-n2", `<span class="grow tiny mono">Arc ${A.n} · ${A.done}/${A.size}</span>`, list, false, "arcf")
      + `<div class="btns"><button class="btn go" data-act="n2fin" data-id="done">Done</button><button class="btn" data-act="n2fin" data-id="partly">Partly</button></div>`}
    ${dt.length ? `<div class="row between tiny muted" style="margin-top:6px"><span>${dt.length} item${dt.length === 1 ? "" : "s"} done today</span><button class="link" data-act="n2undo">Undo last</button></div>` : ""}
    ${fl.length ? `<div class="qsec">Fluency <span>side quests</span></div><div class="list">${fl.map(flRow).join("")}</div>` : ""}</div>`;
}
// v9 §3: search the whole Lexicon from the top of the Japanese screen; each result has its on/off switch.
let jpq = "";
function jpSearch() {
  if (!Lx.ready()) return "";
  const q = jpq.trim(), m = q ? Lx.recs() : null;
  const hits = q ? [...Lx.rows("vocab", null, "all", q, m), ...Lx.rows("kanji", null, "all", q, m)].slice(0, 12) : [];
  const row = e => { const off = Lx.status(m.get(e.id)) === "off";
    return `<div class="lexrow ${off ? "is-off" : ""}"><div class="lexmain"><span class="lw ja">${esc(Lx.face(e))}</span><span class="lr ja">${esc(Lx.reading(e))}</span><span class="lm">${esc(e.meaning || "")}</span></div>
      <button class="sw ${off ? "" : "on"}" role="switch" aria-checked="${!off}" aria-label="Study ${esc(Lx.face(e))}" data-act="lexoff" data-id="${e.id}"><i></i></button></div>`; };
  return `<div class="panel lexbar jpsearch"><input type="search" data-ch="jpq" placeholder="I know this word: search kanji, kana or English" value="${esc(jpq)}">
    ${q ? (hits.length ? `<div class="lexlist">${hits.map(row).join("")}</div>` : `<p class="small muted" style="margin:8px 0 0">Nothing found.</p>`) : ""}</div>`;
}
function vJlpt([sub, a]) {
  if (sub === "q") return vJlptQ(a);
  if (sub === "exam") return vExam(a);
  const lvl = J.level(), wait = jlptNeed([lvl]);
  const res = jps && jps.res ? sysBox(`Session over: ${jps.res.n} card${jps.res.n === 1 ? "" : "s"} · +${jps.res.xp} XP`, jps.res.loot ? `Loot drop: +${jps.res.loot} XP.` : "Short sessions add up. Come back at the next gap.", `<div class="btns"><button class="btn sm" data-act="jpclose">Close</button></div>`) : "";
  const head = `<header class="top"><div><button class="back" data-act="nav" data-id="classes">${ic("left")} Study</button><div class="hdr">Any free gap</div><h1>Japanese</h1></div>${gear("dungeon")}</header>` + jpSearch() + res + `<div class="panel jpq">${jpQuick()}</div>` + n2Panel();
  const ladder = `<div class="ladder">${J.LEVELS.map(l => { const on = J.unlocked().includes(l), cleared = J.passedLevels().includes(l);
    return `<button class="rung ${l === lvl ? "cur" : ""} ${on ? "" : "off"}" data-act="jlptlvl" data-id="${l}" ${on ? "" : "disabled"}>${on ? "" : ic("lock", "inl")}${l}${cleared ? ` ${ic("check", "inl")}` : ""}</button>`; }).join("")}</div>`;
  const lexRow = `<button class="quiet-row" data-act="go" data-id="lex"><span class="grow">${Lx.ready() ? `Lexicon · ${Lx.all("vocab").length.toLocaleString("en-US")} words, ${Lx.all("kanji").length} kanji` : "Lexicon · import your decks"}</span><span class="chev">${ic("right")}</span></button>`;
  if (wait) return head + lexRow + ladder + wait;
  const st = J.stats(lvl), g = { open: true }, nl = J.nextLock(lvl), tl = J.titles(); // v8: Japanese runs any time
  const exams = live("jlptExams").sort((x, y) => y.date.localeCompare(x.date) || (y.u || 0) - (x.u || 0));
  const lastMock = exams.find(x => x.kind === "mock" && x.lvl === lvl), mockOpen = RANK_ORDER.indexOf(st.rank) >= RANK_ORDER.indexOf(J.MOCK_AT);
  const secBars = J.SECS.map(([k, l]) => { const s = st.by[k]; return s.n ? `<div class="row between small" style="margin-top:8px"><span>${l}</span><span class="muted">${s.right}/${s.n}</span></div>${bar(s.right / s.n, "var(--sys)")}` : ""; }).join("");
  const gateNote = g.open ? "" : `<p class="small muted">${ic("lock", "inl")} Practice opens in your next study block${g.next ? ": " + esc(dayLabel(g.next.date)) + " " + P.toHM(g.next.s) : ""}.</p>`;
  return `${head}${reviewBtn()}${lexRow}${ladder}
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
      <div class="btns"><button class="btn primary" data-act="examquit">Done</button>${rcBtn()}</div>`;
  }
  const q = exam.qs[exam.i], it = J.bank(q.lvl).byId[q.id], answered = exam.ans.filter(x => x != null).length;
  return `${back}<header class="top"><div><div class="hdr">${title} · ${exam.i + 1} of ${exam.qs.length}</div><h1>${J.SECS.find(x => x[0] === it.sec)[1]}</h1></div><span class="small muted">${answered} answered</span></header>
    ${bar((exam.i + 1) / exam.qs.length, "var(--sys)")}
    ${qHtml(q.lvl, it, exam.ans[exam.i], false, "exampick")}
    <div class="btns"><button class="btn" data-act="exammove" data-id="-1" ${exam.i ? "" : "disabled"}>Back</button>${exam.i < exam.qs.length - 1 ? `<button class="btn primary" data-act="exammove" data-id="1">Next</button>` : `<button class="btn go" data-act="examsubmit">Submit</button>`}</div>`;
}

/* ================= TRIALS (v2.5) ================= */
let trialForm = null, battle = null, apForm = null; // new-trial form, Battle Log being filled, appraisal in progress
const TR_C = "var(--ind)";
const fearChips = (key, v, act = "bset") => `<div class="seg">${[1, 2, 3, 4, 5].map(n => `<button data-act="${act}" data-id="${key}:${n}" aria-pressed="${v === n}">${n}</button>`).join("")}</div>`;
const yesNo = (key, v, opts = [["yes", "Yes"], ["no", "No"]]) => `<div class="seg">${opts.map(([k, l]) => `<button data-act="bset" data-id="${key}:${k}" aria-pressed="${v === k}">${l}</button>`).join("")}</div>`;
const trialDue = k => { const at = P.plan().at.get(k.id); return at ? `${dayLabel(at.date)} ${P.toHM(at.s)}` : k.due ? "due " + dayLabel(k.due) : ""; };
const trialRow = (k, done) => `<div class="q trial-q ${done ? "done" : ""}">
  <button class="bx" data-act="${done ? "trialundo" : "taskdone"}" data-id="${k.id}" aria-pressed="${!!done}" aria-label="${esc(k.title)} done">${done ? ic("check") : ""}</button>
  <button class="grow tbtn" style="text-align:left" data-act="sheet" data-id="battle:${k.id}"><div class="t">${esc(k.title)}</div><div class="small muted">${esc(TRIALS[k.trial]?.name || "Trial")} · ${done ? "cleared" : esc(trialDue(k))}${k.fear ? ` · fear ${k.fear}/5` : ""}</div></button>
  <div class="xp">+${Soc.xpFor(k)}</div></div>`;
function trialsPanel() {
  const open = Soc.openTrials(), fl = Soc.towerFloor();
  return `<div class="panel trials"><div class="row between"><span class="k" style="color:${TR_C}">Trials</span><span class="small muted">Fear Tower ${fl}/5</span></div>
    ${open.length ? `<div class="list" style="margin-top:8px">${open.slice(0, 6).map(k => trialRow(k, false)).join("")}</div>` : `<p class="small muted" style="margin:6px 0 0">No trial running. Ratings don't change you; trials do.</p>`}
    <div class="btns"><button class="btn sm go" data-act="sheet" data-id="trial">New trial</button><button class="btn sm" data-act="go" data-id="people/habits">Habit library</button><button class="btn sm" data-act="go" data-id="people/battle">Battle log</button><button class="btn sm" data-act="go" data-id="people/appraise">Appraisal</button></div></div>`;
}
// The new-trial sheet: pick a type, then a pre-filled form.
function trialSheetHtml(type) {
  if (!type) return `<h3>New trial</h3><div class="actlist">${Object.entries(TRIALS).filter(([k]) => k !== "prep" && (Sy.has(5) || !["tower", "boss", "appraisal", "invasion"].includes(k))).map(([k, t]) =>
    `<button class="act" data-act="trialtype" data-id="${k}">${ic(k === "tower" ? "flame" : k === "boss" ? "star" : k === "invasion" ? "users" : "target")}<span>${esc(t.name)}${k === "tower" ? ` · floor ${Soc.towerNext()}` : ""}<small>${esc(t.note)}</small></span></button>`).join("")}</div>`;
  const f = trialForm || (trialForm = { type, fear: null });
  if (f.type !== type) Object.assign(f, { type, fear: null, title: null });
  let title = "", extra = "", block = "";
  if (type === "rival") {
    const L = ladder();
    if (!L.opp) block = "Rate yourself and at least one person above you first. The Rival Trial aims at the trait where they lead you most.";
    else { const g = gaps(L.opp)[0], c = g ? g.c : S.settings.social.criteria[0]; f.trait = c; f.person = L.opp.p.id; title = `${c} vs ${L.opp.p.name}: ${RIVAL_ACT[c] || "Practise " + c + " on purpose twice this week."}`; }
  } else if (type === "copy") {
    const notes = live("fieldNotes").filter(n => !n.status || n.status === "tried"), ppl = Object.fromEntries(live("people").map(p => [p.id, p.name]));
    if (!notes.length) block = "Your habit library is empty. Add a field note when you see someone do something well (on their page, or in Habit library).";
    else { if (!notes.some(n => n.id === f.note)) f.note = notes[0].id; const n = notes.find(x => x.id === f.note); title = `Copy: ${n.habit}${ppl[n.person] ? " (from " + ppl[n.person] + ")" : ""}`;
      extra = `<label class="f">Habit<select data-act-ch="trialnote">${notes.map(x => `<option value="${x.id}" ${x.id === f.note ? "selected" : ""}>${esc(x.trait)} · ${esc(x.habit)}</option>`).join("")}</select></label>`; }
  } else if (type === "invasion") {
    const L = ladder(), up = (L.ahead.length ? L.ahead : L.ppl.slice().sort((a, b) => b.rk.avg - a.rk.avg)).map(x => x.p);
    if (!up.length) block = "Rate a few people first. An Invasion targets someone ranked above you.";
    else { if (!up.some(p => p.id === f.person)) f.person = up[0].id; const p = up.find(x => x.id === f.person); title = `Get into ${p.name}'s next plan: ask to join, or invite yourself along`;
      extra = `<label class="f">Who<select data-act-ch="trialperson">${up.map(p => `<option value="${p.id}" ${p.id === f.person ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>`; }
  } else if (type === "tower") { const fl = Soc.towerNext(); f.floor = fl; title = `Floor ${fl}: ${TOWER[fl - 1]}`; }
  else if (type === "ego") { if (f.ego == null) f.ego = Soc.egoPick(); f.pain = EGO[f.ego][1]; title = EGO[f.ego][0]; extra = `<div class="small muted">Discomfort ${f.pain}/5 · +${10 * f.pain} XP <button class="btn sm" data-act="egoroll">Another</button></div>`; }
  else if (type === "boss") { title = f.title || ""; extra = `<p class="tiny muted">Name the event (a party, a club night, a networking event or OB/OG visit in Tokyo). Two prep trials land in the days before it; its Battle Log is the debrief.</p>`; }
  else if (type === "party") title = "Real time with someone ranked above you, or someone new";
  else if (type === "taste") title = "Show one thing you're into: wear it, play it or recommend it, and say why";
  else if (type === "appraisal") title = "Ask a trusted friend to rate you blind";
  if (f.title == null || type !== "boss") f.title = f.title && f.keepTitle ? f.title : title;
  return `<h3>${esc(TRIALS[type].name)}</h3><p class="small muted">${esc(TRIALS[type].note)}</p>
    ${block ? sysBox(esc(block)) : `<div id="trialForm"><label class="f">${type === "boss" ? "Event" : "Trial"}<textarea data-f="title" rows="2" placeholder="${type === "boss" ? "e.g. Shinjuku finance meetup" : ""}">${esc(f.title)}</textarea></label>
    ${extra}<label class="f" style="margin-top:8px">${type === "boss" ? "Date" : "Do it by"}<input type="date" data-f="due" value="${esc(f.due || Soc.DUE[type]())}"></label>
    <div class="small" style="margin-top:10px">How scary does it feel? (Battle Log compares this with how it went)</div>${fearChips("fear", f.fear, "tset")}
    <div class="btns"><button class="btn go" data-act="trialsave">Accept trial</button><button class="btn" data-act="sheet" data-id="trial">Back</button></div></div>`}`;
}
function battleHtml(id) {
  const k = live("tasks").find(x => x.id === id); if (!k) return `<p class="empty">That trial is gone.</p>`;
  if (k.done) { const l = k.log || {};
    return `<h3>${esc(k.title)}</h3><div class="small muted">${esc(TRIALS[k.trial]?.name || "Trial")} · cleared ${k.doneAt ? esc(dayLabel(E.ymd(new Date(k.doneAt)))) : ""}</div>
      ${l.actual ? `<p class="small">Fear ${k.fear ?? "?"} → ${l.actual}/5 · wanted signals ${Soc.wantedScore(l)}/3</p>` : ""}
      ${[["what", "What happened"], ["react", "How they reacted"], ["next", "Next time"]].map(([f, n]) => l[f] ? `<div class="small"><b>${n}:</b> ${esc(l[f])}</div>` : "").join("")}
      <div class="btns"><button class="btn sm" data-act="trialundo" data-id="${k.id}">Mark not done</button></div>`; }
  if (k.trial === "appraisal") return `<h3>${esc(k.title)}</h3><p class="small muted">Hand your phone to them. Your own ratings stay hidden until they're done.</p>
    <div class="btns"><button class="btn go" data-act="go" data-id="people/appraise/${k.id}">Start the appraisal</button><button class="btn danger" data-act="trialdel" data-id="${k.id}">Drop it</button></div>`;
  const b = battle && battle.id === id ? battle : (battle = { id, actual: null, asked: null, turned: null, ended: null, result: null, what: "", react: "", next: "" });
  return `<h3>Battle Log</h3><div class="small"><b>${esc(k.title)}</b></div><div class="small muted">${esc(TRIALS[k.trial]?.name || "Trial")} · ${esc(trialDue(k))}${k.fear ? ` · you predicted fear ${k.fear}/5` : ""}</div>
    <div id="battleForm"><div class="small" style="margin-top:12px">How scary was it, really?</div>${fearChips("actual", b.actual)}
    <label class="f" style="margin-top:10px">What happened<textarea data-f="what" rows="2">${esc(b.what)}</textarea></label>
    <label class="f" style="margin-top:6px">How they reacted<textarea data-f="react" rows="2">${esc(b.react)}</textarea></label>
    <label class="f" style="margin-top:6px">Next time<textarea data-f="next" rows="2">${esc(b.next)}</textarea></label>
    <h3>Wanted signals</h3>
    <div class="row between small"><span>They asked questions back</span>${yesNo("asked", b.asked)}</div>
    <div class="row between small" style="margin-top:6px"><span>They turned toward you</span>${yesNo("turned", b.turned)}</div>
    <div class="row between small" style="margin-top:6px"><span>Who ended it</span>${yesNo("ended", b.ended, [["me", "Me"], ["them", "Them"], ["natural", "Natural"]])}</div>
    ${k.trial === "copy" ? `<h3>The habit</h3>${yesNo("result", b.result, [["tried", "Tried"], ["worked", "Worked"], ["notme", "Not me"]])}` : ""}
    <div class="btns"><button class="btn go" data-act="battlesave">Clear trial</button><button class="btn danger" data-act="trialdel" data-id="${k.id}">Drop it</button></div></div>`;
}
function vHabits() {
  const ppl = live("people"), byId = Object.fromEntries(ppl.map(p => [p.id, p.name])), notes = live("fieldNotes"), crit = S.settings.social.criteria;
  const lab = { tried: "tried", worked: "worked", notme: "not me" };
  return `<button class="back" data-act="nav" data-id="people">${ic("left")} People</button><h1>Habit library</h1>
  <p class="small muted">Habits you've seen people do, by trait. Copy one as a trial and mark whether it worked for you.</p>
  <div class="panel" id="noteForm"><h3>Add a field note</h3><div class="grid">
    <label class="f">Who<select data-f="person"><option value="">Someone</option>${ppl.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
    <label class="f">Trait<select data-f="trait">${crit.map(c => `<option>${esc(c)}</option>`).join("")}</select></label>
    <label class="f" style="flex-basis:100%">What they did<input data-f="habit" placeholder="Uses your name back; asks a second question"></label></div>
    <div class="btns"><button class="btn go" data-act="noteadd">Add</button></div></div>
  ${crit.map(c => { const ns = notes.filter(n => n.trait === c); return ns.length ? `<h2>${esc(c)} <span class="n">${ns.length}</span></h2><div class="panel">${ns.map(n => `<div class="item row between"><div class="grow small"><b>${esc(n.habit)}</b><div class="muted">${esc(byId[n.person] || "someone")}${n.status ? " · " + lab[n.status] : ""}</div></div>
    <button class="btn sm" data-act="copynote" data-id="${n.id}">Copy</button><button class="rbtn" data-act="notedel" data-id="${n.id}" aria-label="Delete">${ic("x")}</button></div>`).join("")}</div>` : ""; }).join("") || `<p class="empty">No field notes yet.</p>`}`;
}
function vBattle() {
  const bs = Soc.battles(), last = bs.slice(-20);
  const sig = bs.filter(k => Soc.signalsLogged(k.log)), wanted = sig.filter(k => Soc.wantedScore(k.log) >= 2).length;
  const fp = bs.filter(k => k.fear), over = fp.length ? fp.reduce((a, k) => a + (k.fear - k.log.actual), 0) / fp.length : null;
  const chart = last.length >= 2 ? Ch.lines([{ d: last.map(k => k.fear ?? null), c: "var(--warn)", dash: "4 3" }, { d: last.map(k => k.log.actual), c: TR_C }], { min: 1, max: 5, ticks: [1, 3, 5], label: "Predicted vs actual fear" }) : "";
  const wchart = sig.length >= 2 ? Ch.lines([{ d: sig.slice(-20).map(k => Soc.wantedScore(k.log)), c: "var(--lime)" }], { min: 0, max: 3, ticks: [0, 1, 2, 3], label: "Wanted signals" }) : "";
  return `<button class="back" data-act="nav" data-id="people">${ic("left")} People</button><h1>Battle log</h1>
  <div class="panel"><div class="row between"><div><div class="dm big2">${bs.length}</div><div class="small muted">trials logged</div></div>
    <div style="text-align:right"><div class="dm big2">${sig.length ? Math.round(wanted / sig.length * 100) + "%" : "–"}</div><div class="small muted">wanted rate</div></div></div>
    ${over != null ? `<p class="small" style="margin-top:8px">${over > 0.2 ? `You predict ${over.toFixed(1)} points more fear than you feel. The fear is lying.` : over < -0.2 ? `It's been ${(-over).toFixed(1)} points scarier than you expect. Take smaller floors.` : "Your fear predictions are accurate."}</p>` : ""}</div>
  ${chart ? `<h2>Fear <span class="n">dashed: predicted · solid: actual</span></h2><div class="panel">${chart}</div>` : ""}
  ${wchart ? `<h2>Wanted signals <span class="n">0–3 per trial</span></h2><div class="panel">${wchart}</div>` : ""}
  ${bs.length ? `<h2>Logs</h2><div class="panel">${bs.slice().reverse().slice(0, 30).map(k => `<button class="item tbtn" style="width:100%;text-align:left" data-act="sheet" data-id="battle:${k.id}"><div class="row between small"><b class="grow">${esc(k.title)}</b><span class="muted">${k.fear ?? "?"}→${k.log.actual}</span></div><div class="small muted">${esc(dayLabel(E.ymd(new Date(k.doneAt))))}${k.log.what ? " · " + esc(k.log.what) : ""}</div></button>`).join("")}</div>` : `<p class="empty">Clear a trial and fill in its Battle Log to see your numbers.</p>`}`;
}
function vAppraise(trialId) {
  const crit = S.settings.social.criteria, aps = live("appraisals").sort((a, b) => b.date.localeCompare(a.date)), back = `<button class="back" data-act="nav" data-id="people">${ic("left")} People</button>`;
  if (apForm) return `${back}<h1>Appraisal</h1><p class="small muted">Rate them honestly on what you've actually seen. Use the Key under each trait. Tap ? if you can't judge.</p>
    <div class="panel" id="apForm"><label class="f">Your name<input data-f="by" value="${esc(apForm.by || "")}"></label></div>
    <div class="panel">${crit.map(c => critRow(c, apForm.scores[c] || 0, "ap")).join("")}</div>
    <div class="btns"><button class="btn go" data-act="apsave">Save appraisal</button><button class="btn" data-act="apcancel">Cancel</button></div>`;
  const me = selfScores(), a = aps[0];
  const cmp = a ? `<h2>Latest: ${esc(a.by || "a friend")} · ${esc(E.fmtDate(a.date))}</h2><div class="panel">${crit.map(c => { const s = me[c] > 0 ? me[c] : null, f = a.scores[c] > 0 ? a.scores[c] : null;
    return `<div class="item row between small"><span class="grow">${esc(c)}</span><span class="mono">you ${s ?? "–"} · them ${f ?? "–"}</span>${s && f && Math.abs(s - f) >= 1 ? `<span class="${f > s ? "" : "warn"}" style="margin-left:8px">${f > s ? "+" : ""}${f - s}</span>` : ""}</div>`; }).join("")}
    <p class="tiny muted">A gap of 1 or more is where your self-image and how you come across disagree.</p></div>` : "";
  return `${back}<h1>Appraisal</h1><p class="small muted">Once a month, a trusted friend rates you blind on the same traits. Then compare with how you rate yourself.</p>
    <div class="btns"><button class="btn go" data-act="apstart" data-id="${esc(trialId || "")}">Hand over the phone</button></div>${cmp}
    ${aps.length > 1 ? fold("ap-hist", `<b class="grow">Earlier</b><span class="small muted">${aps.length - 1}</span>`, aps.slice(1).map(x => `<div class="item small">${esc(E.fmtDate(x.date))} · ${esc(x.by || "friend")} · avg ${(rankScores(x.scores).avg || 0).toFixed(1)}</div>`).join("")) : ""}`;
}

/* ---------- v9.2: deadlines ---------- */
let dlMove = null; // deadline id whose move form is open
const dlWhen = k => `${E.fmtDate(k.due)}${k.time ? " " + esc(k.time) : ""}`;
const dlLeft = k => { const n = Dl.daysLeft(k); return n <= 0 ? "due today" : n === 1 ? "1 day" : n + " days"; };
// Plan day: a marker for each deadline due that day. The calendar always shows deadlines.
const dlMarks = d => Dl.on(d).map(k => `<button class="panel dlmark" data-act="sheet" data-id="deadline:${k.id}"><span class="hdr">${px("flag")} Due${k.time ? " " + esc(k.time) : ""}</span><b>${esc(k.title)}</b>${k.course ? `<span class="small muted">${esc(k.course)}</span>` : ""}</button>`).join("");
function dlFold() {
  const L = Dl.list(); if (!L.length) return "";
  return fold("deadlines", `<b class="grow">Deadlines</b><span class="small muted">${L.length}</span>`, `<div class="list">${L.map(k => { const ps = Dl.prep(k.id), n = ps.filter(x => x.done).length;
    return `<button class="item row between tbtn" data-act="sheet" data-id="deadline:${k.id}"><span class="grow"><b class="small">${esc(k.title)}</b><div class="small muted">${dlWhen(k)} · ${dlLeft(k)}${ps.length ? ` · prep ${n}/${ps.length}` : ""}</div></span>${ic("right")}</button>`; }).join("")}</div>`);
}
// Home: one line per deadline, only from its start date.
function dlFormHtml() {
  return `<h3>Deadline</h3><div class="panel" id="dlForm">
    <label class="f">What<input data-f="title" placeholder="e.g. Social psych paper" enterkeyhint="next"></label>
    <div class="grid" style="margin-top:10px">
      <label class="f">Course (optional)<input data-f="course" placeholder="Social Psychology"></label>
      <label class="f">Kind<select data-f="kind">${Object.entries(Dl.KINDS).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
      <label class="f">Due<input type="date" data-f="due" min="${E.today()}"></label>
      <label class="f">Time (optional)<input type="time" data-f="time"></label>
      <label class="f" style="flex-basis:100%">Start on (optional)<input type="date" data-f="start" min="${E.today()}"></label>
    </div>
    <p class="tiny muted">Prep sessions: paper 5 from 10 days before, exam 4 reviews from 7 days before, presentation 3 from 7 days before, other 1 from 3 days before. Done before their date: +50% XP.</p>
    <div class="btns"><button class="btn go" data-act="dlsave">Add and plan</button><button class="btn" data-act="sheet">Cancel</button></div></div>`;
}
function dlSheetHtml(id) {
  const k = Dl.get(id); if (!k) return `<p class="empty">That deadline is gone.</p>`;
  const p = P.plan(), ps = Dl.prep(id);
  return `<h3>${esc(k.title)}</h3><p class="small muted">${esc(Dl.KINDS[k.dlKind] || "Deadline")}${k.course ? " · " + esc(k.course) : ""} · due ${dlWhen(k)} · ${dlLeft(k)}${k.start && k.start > E.today() ? ` · starts ${E.fmtDate(k.start)}` : ""}</p>
    <div class="list">${ps.map(x => { const at = p.at.get(x.id);
      return `<div class="q"><button class="bx" data-act="${x.done ? "taskundo" : "taskdone"}" data-id="${x.id}" aria-pressed="${!!x.done}" aria-label="Done: ${esc(x.title)}"></button><button class="grow tbtn" data-act="sheet" data-id="task:${x.id}"><div class="t">${esc(Dl.sessionName(x, k))}</div><div class="small muted">${P.dur(x.mins)} · ${x.done ? "done" : at ? `${esc(dayLabel(at.date))} ${P.toHM(at.s)}` : x.after > E.addDays(E.today(), 13) ? "from " + E.fmtDate(x.after) : `<span class="warn">no slot yet</span>`}</div></button><span></span></div>`; }).join("") || `<p class="empty">No prep sessions.</p>`}</div>
    ${dlMove === id ? `<div class="panel" id="dlMove" style="margin-top:10px"><label class="f">New due date<input type="date" data-f="due" value="${k.due}" min="${E.today()}"></label>
      <div class="btns"><button class="btn go" data-act="dlmovesave" data-id="${id}">Move</button><button class="btn" data-act="dlmove" data-id="${id}">Cancel</button></div></div>` : ""}
    <div class="actlist">
      <button class="act" data-act="dlmove" data-id="${id}">${ic("clock")}<span>Move<small>Prep sessions move with it</small></span></button>
      <button class="act danger" data-act="dldrop" data-id="${id}">${ic("x")}<span>Delete</span></button></div>`;
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
      ${k.penalty || k.path ? "" : `<button class="act danger" data-act="deltask" data-id="${k.id}">${ic("x")}<span>Delete</span></button>`}
    </div>`;
}
// The one + button: To-do, Block, Moment, with the current tab's most likely pick first.
function addHtml() {
  const o = {
    todo: `<button class="act" data-act="newtask">${ic("check")}<span>To-do<small>The System finds it a slot</small></span></button>`,
    block: `<button class="act" data-act="blockform" data-id="new">${ic("clock")}<span>Block<small>Class, shift, study or workout time</small></span></button>`,
    deadline: `<button class="act" data-act="dlform">${px("flag")}<span>Deadline<small>Due date, with prep sessions placed before it</small></span></button>`,
    moment: Sy.has(4) ? `<button class="act" data-act="moment">${ic("users")}<span>Moment<small>Time with someone, and what you saw</small></span></button>` : "",
  };
  const order = TAB_OF[route()[0]] === "people" ? ["moment", "todo", "block", "deadline"] : ["todo", "deadline", "block", "moment"];
  return `<h3>Add</h3><div class="actlist">${order.map(k => o[k]).join("")}</div>`;
}
/* ---------- Log a moment: one sheet makes the hangout, the field note and the Battle Log at once ---------- */
let momentForm = null; // { who: [ids], trial: null|true|false, line, habit, trait, name }
function momentTrial(f) { const open = Soc.openTrials(); return open.find(k => k.person && f.who.includes(k.person)) || open[0] || null; }
function momentHtml() {
  const f = momentForm || (momentForm = { who: [], trial: null, line: "", habit: "", trait: "", name: "" });
  const ppl = live("people").sort((a, b) => a.name.localeCompare(b.name)), crit = S.settings.social.criteria;
  const k = momentTrial(f), match = k && k.person && f.who.includes(k.person), tr = f.trial ?? !!match;
  return `<h3>Log a moment</h3><div id="momentForm">
    <div class="small muted">Who</div>
    <div class="chips">${ppl.map(p => `<button class="chip" data-act="mwho" data-id="${p.id}" aria-pressed="${f.who.includes(p.id)}">${esc(p.name)}</button>`).join("")}</div>
    <label class="f" style="margin-top:8px">${ppl.length ? "Or someone new" : "Name"}<input data-f="name" value="${esc(f.name)}" placeholder="Name or nickname"></label>
    <label class="f" style="margin-top:8px">What happened<input data-f="line" value="${esc(f.line)}" placeholder="One line" maxlength="140"></label>
    <details class="key" ${f.habit ? "open" : ""}><summary>A habit worth copying? (optional)</summary>
      <div class="grid"><label class="f">Trait<select data-f="trait">${crit.map(c => `<option ${f.trait === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      <label class="f" style="flex-basis:100%">What they did<input data-f="habit" value="${esc(f.habit)}" placeholder="Asked a second question; used my name"></label></div></details>
    ${k ? `<div style="margin-top:12px"><div class="small">Was it a Trial?</div><div class="tiny muted">${esc(k.title)}</div><div class="seg" style="margin-top:6px"><button data-act="mtrial" data-id="yes" aria-pressed="${tr}">Yes</button><button data-act="mtrial" data-id="no" aria-pressed="${!tr}">No</button></div></div>` : ""}
    <div class="btns"><button class="btn go block" data-act="momentsave">Save</button></div></div>`;
}
// After the 3rd moment with someone, the System asks for one trait you haven't rated.
function rateHtml(pid) {
  const p = live("people").find(x => x.id === pid); if (!p) return `<p class="empty">Not found.</p>`;
  const c = S.settings.social.criteria.find(c => !((p.scores || {})[c] > 0)); if (!c) return `<p class="small">All rated.</p>`;
  return win("System", `Third moment with <b>${esc(p.name)}</b>. Rate one trait.${critRow(c, 0, p.id)}<div class="btns"><button class="btn" data-act="sheet">Later</button></div>`, "", "people");
}
// After an application Boss Raid is cleared.
const offerHtml = () => win("System", `Raid cleared. <b>Did you get an offer?</b><div class="x">Log it and Act I counts it. You can also log it later in Profile.</div>
  <div class="btns"><button class="btn primary" data-act="offer">I got an offer</button><button class="btn" data-act="sheet">Not yet</button></div>`, "", "crown");

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
    <div class="wg-head"><span></span>${days.map(d => `<span class="${d === t ? "today" : ""}">${P.DAY_NAMES[E.parse(d).getDay()]}<b>${E.parse(d).getDate()}</b>${Dl.on(d).map(k => `<button class="wg-dl" data-act="sheet" data-id="deadline:${k.id}" aria-label="Due: ${esc(k.title)}">${esc(k.title)}</button>`).join("")}</span>`).join("")}</div>
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
  if (Al.available()) return; // the Android app schedules a real alarm instead (alarms.js)
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
System insight to reveal this week (one only): ${Sy.insightFor(t)}

### Habits
${HABITS.map(h => `- ${h.name}: ${E.habitWeekCount(h.id, t)}/${E.habitTarget(h.id)}`).join("\n")}

### Training
- Sessions: ${sessions}/${E.habitTarget("gym")} planned${postShift.length ? ` (post-shift: ${postShift.map(E.fmtDate).join(", ")})` : ""}
${exLines.length ? exLines.join("\n") : "- No lifting or calisthenics logged"}
- Sets per area: ${Object.entries(area).map(([a, n]) => `${a} ${n}`).join(", ") || "none"}
- PRs: ${prs.length ? prs.join("; ") : "none"}
- Runs: ${runs.length ? runs.map(r => `${r.km} km in ${E.fmtTime(r.sec)} (${E.fmtTime(E.pace(r))}/km, feel ${r.feel}/5)`).join("; ") : "none"}. Longest ever ${longest} / ${RUN_GOAL_KM} km.

### Social
${socialLines(wk)}${Us.weekLine(t) ? "\n\n### Phone\n" + Us.weekLine(t) : ""}

### Money
${moneyLines()}

Please review: sessions vs plan, progression, stalls, pain, money pace. End with "Next week: 3 actions."`;
}

function socialLines(wk) {
  const done = Soc.trials().filter(k => k.done && k.doneAt && wk.includes(E.ymd(new Date(k.doneAt))));
  const logs = done.filter(k => k.log && k.log.actual), sig = logs.filter(k => Soc.signalsLogged(k.log));
  const missed = live("penalties").filter(p => p.trial && wk.includes(p.date)).length;
  return [`- Trials cleared: ${done.length}${done.length ? " (" + done.map(k => TRIALS[k.trial]?.name || "Trial").join(", ") + ")" : ""}. Missed: ${missed}. Fear Tower floor ${Soc.towerFloor()}/5.`,
    logs.length ? `- Fear predicted vs actual: ${logs.map(k => (k.fear ?? "?") + "→" + k.log.actual).join(", ")}. Wanted signals 2+/3 in ${sig.filter(k => Soc.wantedScore(k.log) >= 2).length}/${sig.length}.` : "- No Battle Logs this week.",
    ...logs.filter(k => k.log.next).map(k => `- Next time (${k.title}): ${k.log.next}`)].join("\n");
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
  return `<div class="panel locked-gate"><div class="row" style="gap:10px">${ic("lock", "big-lock")}<div><div class="hdr">System · Not open yet</div>
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

function trainSession(t = E.today()) {
  const plan = E.planFor(t), w = E.workoutOn(t), gate = P.trainGate(started(t));
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
  const flags = E.painFlags();
  const session = `
    <div class="row between"><div><div class="small muted">${E.fmtDate(t)} · ${esc(plan.where)}</div><h3 style="margin:2px 0 0">${esc(plan.name)}</h3></div>
      <button class="rbtn" data-act="drawer" aria-label="Session settings and circle method">${ic("menu")}</button></div>
    ${plan.postShift || postShift ? `<label class="row small" style="margin-top:8px"><input type="checkbox" data-ch="postshift" ${postShift ? "checked" : ""} style="width:22px;height:22px"> After a night shift: keep 1–2 reps in reserve</label>` : ""}
    ${flags.length ? `<div class="flag bad">${flags.map(esc).join(" ")} Deload or swap. Stop on sharp pain.</div>` : ""}
    <div style="margin-top:6px">${slots}</div>
    ${extra.map(e => { const ex = E.exById(e.exercise); return `<button class="slot" data-act="go" data-id="train/log/${ex.id}"><span class="done-dot on"></span><span class="grow"><span class="lab">Extra</span><br><b>${esc(ex.name)}</b><br><span class="small muted">Today: ${esc(E.fmtSets(ex, e.sets))}</span></span><span class="chev">${ic("right")}</span></button>`; }).join("")}
    ${gate.open ? `<div class="btns"><button class="btn" data-act="go" data-id="train/pick/extra">+ Other exercise</button>${plan.run ? `<button class="btn" data-act="go" data-id="train/runs">Log a run</button>` : ""}</div>` : ""}`;
  return session;
}
function vTrainHome() {
  const t = E.today(), plan = E.planFor(t), gate = P.trainGate(started(t)), session = trainSession(t);
  const recent = live("workouts").filter(x => x.date < t && (x.entries || []).some(e => e.sets.length)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const hasData = live("workouts").some(x => (x.entries || []).some(e => e.sets.length)) || live("runs").length > 0;
  // Gate closed: one card saying when, and today's session folded away instead of greyed-out rows.
  return `<header class="top"><div><button class="back" data-act="nav" data-id="home">${ic("left")} Quests</button><h1>Workout</h1></div>${gear("body")}</header>
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
// System Archives: the full plan, for when Arin deliberately wants it. Never linked from Home.
const GLOSSARY = [["Quest", "anything that earns XP today"], ["Block", "planned time in your week"], ["Dungeon", "a block while it's running"], ["Trial", "a social quest with a floor"], ["Raid", "a big exam or application, fought in rounds"], ["Title", "earned by clearing a discipline or a Raid"], ["Moment", "one thing that happened with someone"], ["Active day", "a day with at least one quest done"]];
function archivesHtml() {
  const a = Sy.archive();
  return `<p class="small muted">Everything the System keeps off the main screens. You don't need any of this day to day.</p>
    <h3 style="margin-top:12px">Final goal</h3>
    <p class="small">Retire by 45 (14 Jan 2049, ${a.yearsLeft} years from now) with plenty of money, one child, living in Japan, Southeast Asia or Bulgaria.</p>
    <p class="small">Target: ${yen(a.target)} invested (yearly family spending × 25). That takes about ${yen(a.perYear)} invested a year on average at ~${a.realReturn * 100}% real return, so income needs to reach ¥10M+ a year by the early 30s, with heavy NISA use.</p>
    <h3 style="margin-top:12px">Acts</h3>
    <div class="list">${Sy.ACTS.map(x => `<div class="small item"><b>Act ${x.id}: ${esc(x.name)}</b> <span class="muted">· ${esc(x.when)}</span><div class="muted">${esc(x.objective)}</div></div>`).join("")}
    <div class="small item"><b>Final Gate: Retirement</b> <span class="muted">· 14 Jan 2049</span></div></div>
    <p class="tiny muted" style="margin-top:8px">Estimates, not advice. The target is rechecked once a country is chosen.</p>
    <details style="margin-top:10px"><summary class="small">Education loan</summary>${(() => { const l = Sy.loanCfg(), st = Sy.loanState();
      return `<p class="small" style="margin-top:8px">₹${st.bal.toLocaleString("en-IN")} left (about ${yen(st.yen)}), ${(l.rate * 100).toFixed(1)}% a year. EMI ₹${l.emi.toLocaleString("en-IN")} (about ${yen(st.emiYen)}) a month; about ₹${st.interest.toLocaleString("en-IN")} of it is interest now. ${isFinite(st.left) ? `Paid off in about ${Math.floor(st.left / 12)} years ${st.left % 12} months at this EMI.` : "The EMI doesn't cover the interest."}</p>
      <p class="small">${l.takeover ? (Sy.loanLive() ? `Yours since ${E.fmtDate(l.takeover)}: it's a fixed bill in the Store.` : `Dad pays until ${E.fmtDate(l.takeover)}; then it becomes a fixed bill.`) : "Dad pays until your job starts. Set the start date when the offer lands."}</p>
      <div class="grid"><label class="f">Job start date<input type="date" data-ch="loan" data-id="takeover" value="${esc(l.takeover || "")}"></label>
        <label class="f">Yen per rupee<input type="number" step="0.01" inputmode="decimal" data-ch="loan" data-id="yenPerInr" value="${l.yenPerInr}"></label>
        <label class="f">EMI (₹)<input type="number" inputmode="numeric" data-ch="loan" data-id="emi" value="${l.emi}"></label>
        <label class="f">Rate (% a year)<input type="number" step="0.1" inputmode="decimal" data-ch="loan" data-id="rate" value="${r1(l.rate * 100)}"></label></div>
      <p class="tiny muted">The rupee rate isn't live; update it now and then. Balance is estimated from ₹${l.inr.toLocaleString("en-IN")} on ${E.fmtDate(l.asOf)}.</p>`; })()}</details>
    ${Dy.archived().length ? `<details style="margin-top:10px"><summary class="small">Old decks</summary><p class="tiny muted" style="margin-top:8px">Archived in v9: out of reviews and the due count. Cards and history are kept.</p>
      <div class="list">${Dy.archived().map(d => `<div class="item row between"><span class="small">${esc(d)} <span class="muted">· ${live("cards").filter(c => c.deck === d).length} cards</span></span><button class="btn sm" data-act="deckrestore" data-id="${esc(d)}">Restore</button></div>`).join("")}</div></details>` : ""}
    <details style="margin-top:10px"><summary class="small">Glossary</summary><div class="list" style="margin-top:6px">${GLOSSARY.map(([w, d]) => `<div class="small item"><b>${w}</b> <span class="muted">· ${d}</span></div>`).join("")}</div></details>
    <details style="margin-top:10px"><summary class="small">Stage</summary><p class="small" style="margin-top:8px">Stage ${Sy.stage()} · ${esc(Sy.STAGES[Sy.stage()].name)} · ${Sy.activeDays()} active days.</p>
      <div class="row" style="gap:8px"><select id="skipStage" style="max-width:220px">${Sy.STAGES.map(x => `<option value="${x.n}" ${x.n === Sy.stage() ? "selected" : ""}>${x.n} · ${esc(x.name)}</option>`).join("")}</select><button class="btn sm" data-act="skipstage">Skip to stage</button></div>
      <p class="tiny muted">For testing. Stages normally open on their own.</p></details>`;
}

// The one Settings page: every setting in the app, in folding sections. Gears elsewhere land on their section.
const SET_SECTIONS = { home: "profile", plan: "schedule", dungeon: "dungeon", body: "habits", money: "money", status: "report" };
function vSettings([sec] = []) {
  const st = S.settings, rh = live("rewardHistory").sort((a, b) => b.ts - a.ts);
  const sx = (k, title, body, sub = "") => fold("set-" + k, `<b class="grow">${title}</b>${sub ? `<span class="small muted">${sub}</span>` : ""}`, body, false, "set");
  return `<header class="top"><div><button class="back" data-act="back">${ic("left")} Back</button><h1>Settings</h1></div></header>
  ${sx("profile", "Profile", `<div class="grid"><label class="f">Your name<input data-ch="profname" value="${esc(st.name || "Arin")}" maxlength="24"></label></div>
    <p class="tiny muted">Used for the greeting on the System screen.</p>`, esc(st.name || "Arin"))}
  ${planSettings()}
  ${sx("dungeon", "Dungeon", dungeonSettings())}
  ${Us.available() && Sy.has(1) ? sx("usage", "Phone limit", usageSettings(), Us.isGranted() ? Us.cfg().limitMin + " min" : "off") : ""}
  ${Al.available() && Sy.has(1) ? sx("alarms", "Alarms", alarmSettings(), Al.granted() ? "on" : "off") : ""}
  ${Sy.has(1) ? sx("library", "Library", `<div class="list">${[[1, "train/pick/browse", "Exercises"], [1, "train/runs", "Runs"], [3, "cards", "Flashcard decks"], [4, "people/habits", "Habit library"], [1, "path/res", "Resources"], [1, "lex", "Japanese decks (Lexicon)"]].filter(([n]) => Sy.has(n)).map(([, r, l]) => `<button class="quiet-row" style="margin-top:0" data-act="go" data-id="${r}"><span class="grow">${l}</span><span class="chev">${ic("right")}</span></button>`).join("")}</div>`) : ""}
  ${sx("habits", "Daily quests", bodySettings())}
  ${sx("money", "Money and Store", moneySettings())}
  ${sx("rewards", "Rewards", `<p class="small muted">Every XP gain has this chance to unlock a random reward. One reward per line.</p>
    <label class="f">Chance (%)<input type="number" min="0" max="100" data-ch="chance" value="${Math.round((st.rewardChance ?? 0.18) * 100)}"></label>
    <label class="f" style="margin-top:8px">Pool<textarea data-ch="pool" rows="6">${esc((st.rewardPool || []).join("\n"))}</textarea></label>
    <details style="margin-top:8px"><summary>Reward history (${rh.length})</summary>${rh.slice(0, 50).map(r => `<div class="small item">${esc(r.reward)} <span class="muted">· ${E.fmtDate(E.ymd(new Date(r.ts)))}</span></div>`).join("") || `<p class="empty">None yet.</p>`}</details>`)}
  ${sx("report", "Weekly report", statusSettings())}
  ${sx("archives", "System Archives", archivesHtml(), "", "")}
  ${Up.available() ? sx("update", "App updates", `<p class="small muted">${Up.pending() ? `Build ${Up.pending().build} is ready to install.` : "The app checks once a day."} Web changes arrive on their own.</p>
    <div class="btns">${Up.pending() ? `<button class="btn sm go" data-act="updgo">Update</button>` : `<button class="btn sm" data-act="updcheck">Check now</button>`}</div>`, Up.pending() ? "update ready" : "") : ""}
  ${sx("sync", "Sync and backup", `${Sync.panelHtml(esc)}
    <h3 style="margin-top:14px">Export</h3>
    <p class="small muted">One JSON file, <code>export-YYYY-MM-DD.json</code>, for your /exports folder. Flashcard images and recordings are in the file; check-in photos and the copied text leave media out.${st.lastExportAt ? " Last export: " + E.fmtDate(st.lastExportAt.slice(0, 10)) + "." : ""}</p>
    <div class="btns"><button class="btn primary" data-act="export">Export file</button><button class="btn" data-act="exportcopy">Copy JSON</button></div>
    <div id="exportBox"></div>
    <h3 style="margin-top:14px">Import</h3>
    <p class="small muted">Merges an export into this device. Nothing is deleted; the newer copy of each record wins. A backup is kept first.</p>
    <input type="file" accept="application/json,.json" data-ch="import">`)}
  <p class="tiny muted" style="text-align:center;margin-top:16px">v${Up.APP_V} · data schema ${S.schemaVersion}</p>`;
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

// Full screen on phones: the installed app opens full screen (manifest); in a browser tab the first tap asks for it,
// again after each return to the app. Browsers only allow it from a tap.
function fullOnTap() {
  if (!matchMedia("(pointer: coarse)").matches || !document.documentElement.requestFullscreen) return;
  let asked = false;
  document.addEventListener("pointerdown", () => {
    if (asked || document.fullscreenElement || matchMedia("(display-mode: fullscreen)").matches) return;
    asked = true; document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  }, true);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") asked = false; });
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
      moneyQuick = false; save(); announce(gains); if (!gains.length) toast("Report updated"); return render();
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
      const al = (E.storeQueue().find(x => x.w.id === id) || {}).alloc || 0;
      if (wallet < cost || al < w.price) return toast("Not unlocked yet");
      const mp = E.moneyPlan(), after = Math.max(0, mp.goal - (mp.bank - w.price)) / mp.weeks;
      if (!confirm(`Buy ${w.name} for ${yen(w.price)}?

Spends ${cost} XP (${(wallet - cost).toLocaleString("en-US")} left) and ${yen(w.price)} of the store fund.
Weekly saving needed for ${yen(mp.goal)}: ${yen(mp.saveWeek)} → ${yen(after)}.`)) return;
      put("wishlist", { ...w, bought: { date: E.today(), xp: cost, yen: w.price } }); save();
      toast(`Claimed: ${w.name}. Enjoy it, you earned it.`, true); return render();
    }
    case "firstwish": afterNav = () => { wishForm = "new"; }; return go("money/rewards");
    case "unbuy": { const w = live("wishlist").find(x => x.id === id); if (!w || !confirm("Undo this purchase? XP and budget come back.")) return; put("wishlist", { ...w, bought: null }); save(); return render(); }

    // social
    case "personform": personForm = true; sheet = "person"; render(); $("#personForm input")?.focus(); return;
    case "addperson": {
      const f = readForm("#personForm"); if (!f.name) return toast("Add a name");
      const p = put("people", { name: f.name, type: f.type, where: f.where, scores: {}, every: null, note: "" });
      personForm = false; save(); return go("people/p/" + p.id);
    }
    case "score": {
      if (id === "ap") { if (!apForm) return; Object.assign(apForm, readForm("#apForm")); const c = el.dataset.c, n = +el.dataset.n; if (apForm.scores[c] === n) delete apForm.scores[c]; else apForm.scores[c] = n; return render(); }
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
      if (sheet && sheet.startsWith("rate:")) { sheet = null; if (after === before || after === "?") toast("Rated. One more read on " + p.name); }
      return render();
    }
    case "delperson": {
      const p = live("people").find(x => x.id === id); if (!p || !confirm(`Delete ${p.name}? Hangouts stay, without their name.`)) return;
      remove("people", id); save(); return go("people");
    }
    case "hangwith": hangSel = [id]; return go("people/log");
    case "moment": momentForm = { who: id ? [id] : [], trial: null, line: "", habit: "", trait: "", name: "" }; sheet = "moment"; return render();
    case "mwho": { Object.assign(momentForm, readForm("#momentForm")); const w = momentForm.who; momentForm.who = w.includes(id) ? w.filter(x => x !== id) : [...w, id]; momentForm.trial = null; return render(); }
    case "mtrial": Object.assign(momentForm, readForm("#momentForm")); momentForm.trial = id === "yes"; return render();
    case "momentsave": {
      const f = momentForm; if (!f) return; Object.assign(f, readForm("#momentForm"));
      const name = (f.name || "").trim(), line = (f.line || "").trim();
      if (!f.who.length && !name) return toast("Who was it?");
      if (!line) return toast("What happened? One line");
      const k = momentTrial(f), tr = k && (f.trial ?? !!(k.person && f.who.includes(k.person)));
      const who = [...f.who]; if (name) who.push(put("people", { name, type: "friend", where: "", scores: {}, every: null, note: "" }).id);
      const mid = uid(), h = put("hangouts", { date: E.today(), people: who, what: line, note: "", moment: mid });
      if ((f.habit || "").trim()) put("fieldNotes", { person: who[0], trait: f.trait || S.settings.social.criteria[0], habit: f.habit.trim(), status: null, date: E.today(), moment: mid });
      const ppl = live("people"), social = who.some(i => { const p = ppl.find(x => x.id === i); return p && p.type !== "partner"; });
      const gains = social ? [E.gainXP("social", "hang:" + h.id, "Moment")] : [];
      momentForm = null; sheet = null;
      // Third moment with someone who still has an unrated trait: ask for one.
      const third = who.find(i => { const p = ppl.find(x => x.id === i); return p && live("hangouts").filter(x => (x.people || []).includes(i)).length === 3 && S.settings.social.criteria.some(c => !((p.scores || {})[c] > 0)); });
      if (tr) { battle = { id: k.id, actual: null, asked: null, turned: null, ended: null, result: null, what: line, react: "", next: "", moment: mid }; sheet = "battle:" + k.id; }
      else if (third) sheet = "rate:" + third;
      save(); announce(gains); if (!gains.length) toast("Logged"); return render();
    }
    case "weeklytrial": { const w = weeklyPick(), { label, ...x } = w, t = E.today(), dw = E.parse(t).getDay(), due = E.addDays(t, dw === 0 ? 7 : 7 - dw); Soc.addTrial(w.type, { ...x, due }); save(); toast("Trial accepted. Due " + dayLabel(due) + "."); return render(); }
    case "trialnotyet": { const k = live("tasks").find(x => x.id === id); if (!k) return; const d = E.addDays(k.due && k.due > E.today() ? k.due : E.today(), 1); put("tasks", { ...k, due: d, snoozed: true }); save(); toast("Moved to " + dayLabel(d) + ". One push per Trial."); return render(); }
    case "addhang": {
      const f = readForm("#hangForm"), ids = [...document.querySelectorAll("#hpeople [aria-pressed=true]")].map(b => b.dataset.id);
      if (!ids.length) return toast("Pick who you were with");
      if (!f.date) return toast("Pick a date");
      const h = put("hangouts", { date: f.date, people: ids, what: f.what, note: f.note });
      const ppl = live("people"), social = ids.some(i => { const p = ppl.find(x => x.id === i); return p && p.type !== "partner"; });
      const gains = social ? [E.gainXP("social", "hang:" + h.id, "Hangout")] : [];
      hangSel = null; save(); announce(gains); if (!gains.length) toast("Logged"); return render();
    }
    case "delhang": if (confirm("Delete this hangout?")) { E.revokeXP("hang:" + id); remove("hangouts", id); save(); render(); } return;

    // shell: settings sheet, morning brief, backgrounds
    case "sheet": sheet = id && sheet !== id ? id : null; if (!sheet) { taskForm = null; blockForm = null; blockNew = null; personForm = false; } return render();
    case "brief": briefOpen = true; return render();
    case "discon": if (!Cl.setActive(id, true)) return toast(`${Cl.CAP} disciplines active is the cap`); save(); return go("classes/d/" + id);
    case "discoff": if (!confirm("Drop this discipline? Cleared chapters stay cleared.")) return; Cl.setActive(route()[2], false); save(); return go("classes");
    case "chread": if (!confirm("Mark this chapter's reading as done? The quiz opens.")) return; Cl.markRead(route()[2], id); save(); return render();
    case "chself": { if (!confirm("Mark this chapter done?")) return; const g = Cl.selfClear(route()[2], id); save(); announce([g]); return render(); }
    case "chedit": chEdit = !chEdit; return render();
    case "chsave": {
      const L = $("[data-f=chapters]").value.split("\n").map(l => l.split("|").map(x => x.trim())).filter(p => p[0])
        .map((p, i) => ({ id: id + "-c" + String(i + 1).padStart(2, "0"), title: p[0], read: p[1] || "", produce: p[2] || "", hours: num(p[3]) || 4 }));
      if (!L.length) return toast("Add at least one chapter");
      S.settings.classes.custom = { ...(S.settings.classes.custom || {}), [id]: L }; chEdit = false; touchSettings(); save(); toast("Chapters saved"); return render();
    }
    case "chreset": { if (!confirm("Go back to the starter chapters? Chapters you cleared there stay cleared.")) return; const c = { ...(S.settings.classes.custom || {}) }; delete c[id]; S.settings.classes.custom = c; chEdit = false; touchSettings(); save(); return render(); }
    case "dqpick": { if (!dq || dq.res) return; const [i, j] = id.split(":").map(Number); dq.ans[i] = j; return render(); }
    case "dqsubmit": {
      if (!dq || !dq.qs) return; document.querySelectorAll("[data-ch=dqnum]").forEach(el => { dq.ans[+el.dataset.id] = el.value; });
      const miss = dq.qs.filter((q, i) => dq.ans[i] == null || dq.ans[i] === "").length;
      if (miss && !confirm(`${miss} unanswered. Submit anyway?`)) return;
      dq.res = Cl.finish(dq.id, dq.ch, dq.qs, dq.ans); save(); announce(dq.res.gains); window.scrollTo(0, 0); return render();
    }
    case "dqretry": if (dq) { dq.ans = []; dq.res = null; } window.scrollTo(0, 0); return render();
    case "equip": { const err = Cl.equip(id); if (err) return toast(err); save(); toast("Title equipped"); return render(); }
    case "unequip": Cl.unequip(); save(); return render();
    case "capstone": { const on = !Cl.capstoneDone(id); if (!confirm(on ? "Capstone done? Only mark it when the 'done when' line is true." : "Undo the capstone?")) return; Cl.setCapstone(id, on); save(); return render(); }
    case "offer": {
      const on = !(S.settings.system || {}).offerAt;
      if (!confirm(on ? "Log a job offer in one of your target roles?" : "Remove the logged offer?")) return;
      Sy.logOffer(on); if (sheet === "offer") sheet = null;
      if (on) { const d = prompt("Job start date (YYYY-MM-DD)? Leave empty if you don't know yet; you can set it in Settings → System Archives.", ""); if (d && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) Sy.setLoan({ takeover: d.trim() }); }
      save(); return render();
    }
    case "alarmson": ceremonyDone = true; Al.request().then(render); return render();
    case "alarmslater": Al.later(); ceremonyDone = true; return render();
    case "usageon": ceremonyDone = true; Us.openSettings(); return render();
    case "usagelater": Us.later(); ceremonyDone = true; return render();
    case "usageapp": { const u = Us.cfg(); u.apps = u.apps.includes(id) ? u.apps.filter(x => x !== id) : [...u.apps, id]; touchSettings(); save(); render(); if (await Us.refresh()) { save(); render(); } return; }
    case "alarmtoggle": Al.toggle(id); return render();
    case "moneywin": try { localStorage.setItem(MONEYWIN_KEY, E.today()); } catch (e) {} ceremonyDone = true; if (id) { entering = true; return go(id); } return render();
    case "milestone": Sy.seeMilestone(id); ceremonyDone = true; save(); return render();
    case "pathfin": {
      const [tid, res] = id.split("|"), k = live("tasks").find(x => x.id === tid); if (!k) return;
      const z = num(($("#zetIn") || {}).value); sheet = null;
      const g = Pa.finish(k, res, z), loot = k.ahead && res === "done" ? Sy.rollLoot(E.today(), k.id) : null, up = Pa.checkAhead(), nwb = Dy.watchBonus(); save();
      if (nwb) setTimeout(() => toast(`Night watch · +${nwb} XP`, true), 2600);
      if (up) setTimeout(() => toast(up.vanguard ? "Title unlocked: Vanguard. 7 days ahead." : `Rest token earned · ${Pa.cfg().tokens}/${Pa.MAX_TOKENS}`, true), 2200);
      if (loot && g) g.label += " · " + loot.label, g.xp += loot.xp;
      if (!k.path.sun && Pa.closesArc(k.path.idx)) { const A = Pa.arc(k.path.stream); toast(`${g ? "+" + g.xp + " XP · " : ""}${Pa.stream(k.path.stream).label}: Arc ${A.n - 1} cleared. Arc ${A.n} open.`, true); }
      else if (g) announce([g]); else toast("Done");
      return render();
    }
    case "pathahead": {
      const k = Pa.goAhead(id); if (!k) return toast("Finish the open item first");
      save(); toast(`Dungeon open: ${Pa.stream(id).label}, ${P.dur(k.mins)}`); return goR("home");
    }
    case "gqpick": { if (!gq || gq.res) return; const [i, j] = id.split(":").map(Number); gq.ans[i] = j; return render(); }
    case "gqsubmit": { if (!gq) return; const miss = gq.qs.filter((q, i) => gq.ans[i] == null).length; if (miss && !confirm(`${miss} unanswered. Submit anyway?`)) return; return gateSubmit(); }
    case "gatedone": { const was = gq && gq.s; gq = null; return goR(was === "n2" ? "jlpt" : "path"); }
    case "n2fin": {
      const g = N2.finish(id); if (!g) return; save();
      const p = N2.pos(), A = Pa.arc("n2");
      if (g.floor) toast(`+${g.xp} XP · Floor ${g.floor.n} open: ${g.floor.name}`, true);
      else if (p % Pa.ARC === 0) toast(`+${g.xp} XP · Japanese: Arc ${A.n - 1} cleared.${N2.current()?.gate ? " A Gate Test stands before the next." : ""}`, true);
      else announce([{ xp: g.xp, label: "Japanese · " + g.label }, g.habit]);
      return render();
    }
    case "jpgo": return jpStart(+id);
    case "jpend": return jpEnd();
    case "jpclose": jps = null; jpsSave(); return render();
    case "n2undo": { if (!confirm("Undo the last N2 item? Its XP goes too.")) return; N2.undo(); save(); return render(); }
    case "n2fl": { const xp = N2.fluencyDone(id, !live("xpEvents").some(e => e.ref === id)); save(); if (xp) toast(`+${xp} XP · Fluency`); return render(); }
    case "n2exam": N2.setExam(id); save(); toast(`Exam Raid: JLPT ${id}, Sun 4 Jul 2027`); return render();
    case "raidclear": { const xp = Pa.clearRaid(id); if (!xp) return; save(); toast(`Raid cleared · +${xp} XP`, true); return render(); }
    case "raidundo": { if (!confirm("Undo this Raid? Its XP goes too.")) return; Pa.unclearRaid(id); save(); return render(); }
    case "appsave": {
      const f = readForm("#appForm"); if (!f.firm) return toast("Add the firm");
      const r = Ap.save(f, id === "new" ? null : id); save(); appOffer(r.rec);
      if (r.xp) toast(`+${r.xp} XP · ${r.rec.firm}: ${r.rec.status}`, true); else toast("Saved");
      return go("path/apps");
    }
    case "appnext": { const r = Ap.advance(id); if (!r) return; save(); appOffer(r.rec); toast(`+${r.xp} XP · ${r.rec.firm}: ${r.rec.status}`, true); return r.rec.status === "Offer" ? render() : go("path/apps/" + id); }
    case "apprej": { const a = live("applications").find(x => x.id === id); if (!a || !confirm(`Mark ${a.firm} as rejected?`)) return; Ap.save({ status: "Rejected", next: "", nextDate: "" }, id); save(); toast("Logged. Next one."); return render(); }
    case "appdel": { if (!confirm("Delete this application?")) return; Ap.del(id); save(); return go("path/apps"); }
    case "pathrest": { if (!confirm("Use a rest token on today? Nothing new is issued and nothing slips.")) return; if (!Pa.rest()) return toast("No token to use"); save(); toast("Rest day. The Path waits."); return render(); }
    case "riskok": Pa.seeRisk(id); ceremonyDone = true; save(); return render();
    case "riskgo": { const m = Pa.FIXED.find(x => x.id === id); Pa.seeRisk(id); ceremonyDone = true; save(); const k = Pa.goAhead(m.stream); if (k) { save(); toast(`Dungeon open: ${Pa.stream(m.stream).label}`); return goR("home"); } return goR("path"); }
    case "updcheck": { const f = await Up.check(true); toast(f ? `Build ${f.build} is available` : "Up to date"); return render(); }
    case "updlater": Up.later(); ceremonyDone = true; return render();
    case "updgo": {
      ceremonyDone = true; toast("Downloading the update…"); render();
      const r = await Up.install();
      if (r === "permission") return toast("Allow The Arin to install apps, then come back and tap Update in Settings.");
      if (r !== "ok") toast("Update failed: " + r);
      return render();
    }
    case "floorok": Pa.seeFloor(+id); ceremonyDone = true; save(); return goR("path");
    case "awake": S.settings.pathAwoke = E.today(); Pa.seeFloor((Pa.floor() || { n: 1 }).n); touchSettings(); ceremonyDone = true; save(); return goR("path");
    case "unlock": Sy.seeUnlock(); ceremonyDone = true; save(); if (id) { entering = true; return go(id); } return render();
    case "skipstage": { const n = +($("#skipStage") || {}).value; if (!confirm(`Set the System to stage ${n}? Use this for testing.`)) return; Sy.skipTo(n); save(); toast("Stage " + n); return render(); }
    case "briefclose": briefOpen = false; try { localStorage.setItem(BRIEF_KEY, E.today()); } catch (e) {} return render();
    case "dismiss": dismiss(id); return render();
    case "moneyquick": moneyQuick = !moneyQuick; return render();
    case "questsall": showAllQuests = !showAllQuests; return render();
    case "enter": { const g = id === "study" ? St.focusGate() : null; enter(id === "study" ? St.occKey(g.o) : "body:" + E.today()); entering = true; return render(); }
    case "leave": { if (id === "study") { const g = St.focusGate(); if (g.open) enter(St.occKey(g.o), false); } else enter("body:" + E.today(), false); entering = true; return render(); }
    case "toreport": { const r = $("#report"); if (r) r.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    case "firstblock": blockNew = { title: "Study", kind: "study", start: "20:00", end: "21:00", days: [1, 2, 3, 4, 5] }; blockForm = "new"; sheet = "block"; return render();

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
      if (gain > 0 || p.n > 0 || done) r.gains.push(Sy.rollLoot(o.date, o.b.id));
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
      if (k.trial) { sheet = "battle:" + id; return render(); } // a trial closes through its Battle Log
      if (k.path && !k.done) { sheet = "pathdone:" + id; return render(); } // Done or Partly (and the Zetamac score)
      if (sheet && sheet.startsWith("task")) sheet = null;
      put("tasks", { ...k, done: true, doneAt: Date.now() });
      if (k.penalty) { save(); toast(St.openPenalties().length ? "Penalty quest cleared" : "Penalty cleared. Shop unlocked."); return render(); }
      const ref = "task:" + id, gains = live("xpEvents").some(e => e.ref === ref) ? [] : [E.gainXP("task", ref, k.title)];
      // v9.2: a deadline's prep session done before its own due date pays the ahead bonus.
      if (gains.length && Dl.aheadOf(k)) { put("xpEvents", { ts: Date.now(), type: "task", xp: Math.round(XP.task * Dl.AHEAD), ref: ref + ":ahead", label: "Ahead · " + k.title }); gains.push({ xp: Math.round(XP.task * Dl.AHEAD), label: "Ahead" }); }
      save(); announce(gains); if (!gains.length) toast("Done"); return render();
    }
    case "taskundo": { const k = live("tasks").find(x => x.id === id); if (!k) return;
      if (k.path) { if (!Pa.undo(k)) toast("Undo the later item in this stream first"); save(); return render(); } E.revokeXP("task:" + id); E.revokeXP("task:" + id + ":ahead"); put("tasks", { ...k, done: false, doneAt: null }); save(); return render(); }
    case "drillgo": { const [m, sec] = id.split(":"); sheet = null; drillResult = null; Dr.start(m, +sec || Dr.SECS); } if (route()[0] !== "drill") location.hash = "drill"; drillTick(); return render();
    case "drk": { const ok = Dr.key(id); drillPaint(ok); return; }
    case "drskip": Dr.skip(); drillPaint(true); return;
    case "drquit": if (confirm("Stop this run? It won't be saved.")) { Dr.quit(); clearInterval(drillT); render(); } return;
    case "srgo": return srRun(srHits[+id]);
    case "rcadd": rcForm = true; rcPre = null; return goR("report");
    case "rcper": rcPeriod = id; return render();
    case "rcsub": rcSub = rcSub === id ? null : id; return render();
    case "rcmode": rcMode = id; return render();
    case "rcform": rcForm = !rcForm; rcPre = null; render(); if (rcForm) $("#rcForm input")?.focus(); return;
    case "rcask": { const d = Dl.get(id); if (!d) return; rcPre = { name: d.title, subject: d.course, date: d.due, dl: d.id }; rcForm = true; rcSub = null; location.hash = "report"; return render(); }
    case "rcsave": {
      const f = readForm("#rcForm"), sc = Number(f.score), of = Number(f.of);
      if (!f.name) return toast("Add a name");
      if (f.score === "" || !isFinite(sc) || !(of > 0)) return toast("Add the score and what it's out of");
      Rc.addExam({ name: f.name, subject: f.subject || "Other", date: f.date || E.today(), score: sc, of, passPct: f.pass === "" ? null : Number(f.pass), notes: f.notes });
      if (rcPre?.dl) Dl.markScored(rcPre.dl);
      rcForm = false; rcPre = null; save(); toast(`Saved · ${Math.round(sc / of * 100)}%`); return render();
    }
    case "rcdrop": if (!confirm("Delete this exam result?")) return; Rc.dropExam(id); save(); return render();
    case "drlen": drLen = +id; return render();
    case "drcards": { if (!drillResult) return; const n = Dr.toCards(drillResult.rec, K.newCard); drillResult.carded = true; save(); toast(n ? `${n} card${n === 1 ? "" : "s"} in Drill slow` : "Already in Drill slow"); return render(); }
    case "drlog": { const k = mentalTask(); if (!k) return; const g = Pa.finish(k, "done", Dr.todayBest("classic")); save(); drillResult = null; announce([g]); return render(); }
    case "newtask": taskForm = "new"; sheet = "task"; render(); $("#taskForm input")?.focus(); return;
    case "dlform": dlMove = null; sheet = "deadline"; render(); $("#dlForm input")?.focus(); return;
    case "dlsave": {
      const f = readForm("#dlForm"); if (!f.title) { toast("Name the deadline"); return $("#dlForm input")?.focus(); }
      if (!f.due) return toast("Pick the due date");
      if (f.due < E.today()) return toast("That date has passed");
      const r = Dl.add({ title: f.title, course: f.course, kind: f.kind, due: f.due, time: f.time, start: f.start });
      sheet = "deadline:" + r.d.id; save(); toast(`Due ${E.fmtDate(f.due)} · ${r.sessions.length} prep session${r.sessions.length === 1 ? "" : "s"} from ${E.fmtDate(r.sessions[0].after)}`); return render();
    }
    case "dlmove": dlMove = dlMove === id ? null : id; return render();
    case "dlmovesave": {
      const f = readForm("#dlMove"); if (!f.due || f.due < E.today()) return toast("Pick a date from today on");
      Dl.move(id, f.due); dlMove = null; save(); toast("Moved to " + E.fmtDate(f.due) + ". Prep sessions moved with it."); return render();
    }
    case "dldrop": if (!confirm("Delete this deadline and its open prep sessions? Finished sessions keep their XP.")) return;
      Dl.drop(id); sheet = null; save(); return render();
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
    case "lextype": lx = { ...lx, type: id, level: null, n: 60, sel: lx.sel ? new Set() : null, open: null }; return render();
    case "lexlvl": lx = { ...lx, level: id || null, n: 60, open: null }; return render();
    case "lexst": lx = { ...lx, st: id, n: 60, open: null }; return render();
    case "lexmore": lx.n += 100; return render();
    case "lexopen": lx.open = lx.open === id ? null : id; return render();
    case "lexsay": if (jpsOn() && jps.silent) return toast("Silent in class");
    { const e = Lx.entry(id); if (e && !K.speak(Lx.face(e))) toast("No Japanese voice on this phone"); return; }
    case "deckrestore": Dy.restoreDeck(id); save(); toast(id + " restored"); return render();
    case "rvknow": { K.setOff(id, true); rv = null; save(); toast("Turned off. It won't come back."); return render(); }
    case "lexoff": { const r = live("cards").find(x => x.id === id); K.setOff(id, !(r && r.off)); save(); return render(); }
    case "lexsel": lx.sel = lx.sel ? null : new Set(); return render();
    case "lexpick": { if (!lx.sel) return; lx.sel.has(id) ? lx.sel.delete(id) : lx.sel.add(id); return render(); }
    case "lexbulk": { if (!lx.sel || !lx.sel.size) return toast("Select some cards first"); for (const x of lx.sel) K.setOff(x, id === "off"); toast(`${lx.sel.size} turned ${id}`); lx.sel = new Set(); save(); return render(); }
    case "lexshown": case "lexlevel": {
      const L = Lx.rows(lx.type, lx.level, a === "lexlevel" ? "all" : lx.st, a === "lexlevel" ? "" : lx.q);
      if (!confirm(`Turn off ${L.length} card${L.length === 1 ? "" : "s"}? They won't be asked. You can turn any back on.`)) return;
      L.forEach(e => K.setOff(e.id, true)); save(); toast(`${L.length} turned off`); return render();
    }
    case "sortshow": if (srt) { srt.show = !srt.show; render(); } return;
    case "sortpick": return sortPick(id === "know");
    case "sortundo": { if (!srt || !srt.hist.length) return; const h = srt.hist.pop(); K.setOff(h.id, h.was); srt.i = Math.max(0, srt.i - 1); srt.show = false; save(); return render(); }
    case "sortexit": srt = null; return go("lex");
    case "say": if (jpsOn() && jps.silent) return toast("Silent in class");
    { const c = K.get(id); if (c && !K.speak(K.jaText(c))) toast("No Japanese voice on this phone"); return; }
    case "rvpick": {
      const c = rv && K.get(rv.id); if (!c || rv.pick != null) return;
      rv.pick = +id; announce(K.answerMcq(c, rv.ask.opts[+id] === rv.ask.ans)); save(); return render();
    }
    case "rvnext": rv = null; return render();
    case "learnmore": { const n = K.learnMore(10); if (!n) return toast("No new cards left. Add some first"); save(); toast(`${n} new card${n === 1 ? "" : "s"} ready`); rv = null; return go("cards/review"); }
    case "rvflip": if (rv) rv.flip = true; return render();
    case "rvgrade": {
      const c = rv && K.get(rv.id); if (!c) return;
      announce(K.answerFlip(c, +id)); rv = null; save(); return render();
    }

    // trials
    case "trialtype": trialForm = { type: id, fear: null }; sheet = "trial:" + id; return render();
    case "tset": { if (!trialForm) return; Object.assign(trialForm, readForm("#trialForm")); trialForm.keepTitle = true; const [k2, v] = id.split(":"); trialForm[k2] = trialForm[k2] === +v ? null : +v; return render(); }
    case "egoroll": { if (!trialForm) return; let n = trialForm.ego; while (n === trialForm.ego && EGO.length > 1) n = Math.floor(Math.random() * EGO.length); trialForm.ego = n; trialForm.title = null; trialForm.keepTitle = false; return render(); }
    case "trialsave": {
      const f = readForm("#trialForm"), t = trialForm; if (!t || !f.title) return toast(t && t.type === "boss" ? "Name the event" : "Describe the trial");
      if (f.due && f.due < E.today()) return toast("Pick today or later");
      if (t.type === "boss") Soc.addBoss(f.title, f.due || Soc.DUE.boss(), t.fear);
      else Soc.addTrial(t.type, { title: f.title, due: f.due, fear: t.fear, ...(t.type === "rival" ? { trait: t.trait, person: t.person } : t.type === "copy" ? { note: t.note } : t.type === "invasion" ? { person: t.person } : t.type === "tower" ? { floor: t.floor } : t.type === "ego" ? { ego: t.ego, pain: t.pain } : {}) });
      trialForm = null; sheet = null; save(); toast("Trial accepted. The planner placed it."); return render();
    }
    case "bset": { if (!battle) return; Object.assign(battle, readForm("#battleForm")); const [k2, v] = id.split(":"); const val = /^\d$/.test(v) ? +v : v; battle[k2] = battle[k2] === val ? null : val; return render(); }
    case "battlesave": {
      if (!battle) return; Object.assign(battle, readForm("#battleForm"));
      const k = live("tasks").find(x => x.id === battle.id); if (!k) return;
      if (!battle.actual) return toast("Rate how scary it was");
      const { id: _i, ...log } = battle; const gains = Soc.logBattle(k, log);
      battle = null; sheet = k.trial === "boss" && !(S.settings.system || {}).offerAt && /interview|applic|apply|offer|recruit|job|career|OB|OG|internship|ES\b/i.test(k.title) ? "offer" : null;
      save(); announce(gains); if (!gains.length) toast("Logged"); return render();
    }
    case "trialundo": { const k = live("tasks").find(x => x.id === id); if (!k) return; Soc.undoTrial(k); sheet = null; save(); return render(); }
    case "trialdel": { const k = live("tasks").find(x => x.id === id); if (!k || !confirm("Drop this trial? If it's overdue, its penalty stays.")) return; remove("tasks", id); battle = null; sheet = null; save(); return render(); }
    case "noteadd": {
      const f = readForm("#noteForm"); if (!f.habit) return toast("What did they do?");
      put("fieldNotes", { person: f.person || null, trait: f.trait, habit: f.habit, status: null, date: E.today() }); save(); toast("Added to the habit library"); return render();
    }
    case "notedel": if (confirm("Delete this field note?")) { remove("fieldNotes", id); save(); render(); } return;
    case "copynote": { trialForm = { type: "copy", fear: null, note: id }; sheet = "trial:copy"; return render(); }
    case "apstart": apForm = { scores: {}, by: "", trial: id || null }; render(); return window.scrollTo(0, 0);
    case "apcancel": apForm = null; return render();
    case "apsave": {
      if (!apForm) return; const f = readForm("#apForm"), sc = apForm.scores;
      if (!Object.keys(sc).length) return toast("Rate at least one trait");
      put("appraisals", { date: E.today(), by: f.by || null, scores: sc });
      const k = apForm.trial && live("tasks").find(x => x.id === apForm.trial); const gains = k && !k.done ? Soc.logBattle(k, { appraisal: true }) : [];
      apForm = null; save(); announce(gains); toast("Appraisal saved"); if (location.hash !== "#people/appraise") return go("people/appraise"); render(); return window.scrollTo(0, 0);
    }

    case "wishmove": {
      const ids = E.storeQueue().map(x => x.w.id), i = ids.indexOf(id), j = i + +el.dataset.step; if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]]; ids.forEach((wid, n) => { const w = live("wishlist").find(x => x.id === wid); if (w && w.order !== n) put("wishlist", { ...w, order: n }); });
      save(); return render();
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


// v8 Sort mode: swipe the card right (I know it) or left (learn it).
let swipeX = null;
document.addEventListener("pointerdown", ev => { swipeX = ev.target.closest(".srt-card") ? ev.clientX : null; });
document.addEventListener("pointerup", ev => {
  if (swipeX == null) return; const dx = ev.clientX - swipeX; swipeX = null;
  if (Math.abs(dx) > 70) { ev.preventDefault(); suppressClick = true; setTimeout(() => { suppressClick = false; }, 400); sortPick(dx > 0); }
});
let suppressClick = false;
document.addEventListener("click", ev => { if (suppressClick && ev.target.closest(".srt-card")) { suppressClick = false; ev.stopImmediatePropagation(); ev.preventDefault(); } }, true);

document.addEventListener("change", async ev => {
  const sel = ev.target.closest("[data-act-ch]");
  if (sel && trialForm) { Object.assign(trialForm, readForm("#trialForm")); trialForm[sel.dataset.actCh === "trialnote" ? "note" : "person"] = sel.value; trialForm.title = null; trialForm.keepTitle = false; return render(); }
  const el = ev.target.closest("[data-ch]"); if (!el) return;
  const k = el.dataset.ch;
  if (k === "jpq") { jpq = el.value; render(); const i = $('input[data-ch="jpq"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } return; }
  if (k === "lexq") { lx = { ...lx, q: el.value, n: 60, open: null }; return render(); }
  if (k === "leximport") {
    const f = el.files && el.files[0]; if (!f) return;
    try { const r = await Lx.importText(await f.text()); toast(`Imported ${r.vocab.toLocaleString("en-US")} words and ${r.kanji} kanji`, true); }
    catch (e) { toast(e.message || "Import failed"); }
    return render();
  }
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
  if (k === "loan") {
    const f = el.dataset.id, v = f === "takeover" ? (el.value || null) : num(el.value);
    if (f !== "takeover" && (v === null || v <= 0)) return render();
    Sy.setLoan({ [f]: f === "rate" ? v / 100 : v }); save(); return render();
  }
  if (k === "dqnum") { if (dq) dq.ans[+el.dataset.id] = el.value; return; }
  if (k === "profname") { S.settings.name = el.value.trim().slice(0, 24) || "Arin"; touchSettings(); save(); return; }
  if (k === "cardsnew") { const v = num(el.value); if (v === null || v < 0 || v > 200) return render(); S.settings.cards.newPerDay = Math.round(v); touchSettings(); save(); return render(); }
  if (k === "cardimg") {
    const file = el.files[0]; if (!file || !cardForm) return; keepCardForm();
    const mid = "cm-" + cardForm.id; await photos.put(mid, await shrink(file)); cardForm.img = mid;
    const c = live("cards").find(x => x.id === cardForm.id); if (c) { c.img = mid; put("cards", c); save(); }
    return render();
  }
  if (k === "usagelimit") { const v = num(el.value); if (v === null || v < 5 || v > 600) return render(); Us.cfg().limitMin = Math.round(v); touchSettings(); save(); return render(); }
  if (k === "usageextra") { const u = Us.cfg(), keep = u.apps.filter(p => USAGE_APPS.some(a => a[0] === p)); u.apps = [...keep, ...el.value.split(",").map(x => x.trim()).filter(x => /^[\w.]+$/.test(x))]; touchSettings(); save(); return render(); }
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
  await Cl.loadIndex();
  await Pa.load(); if (Pa.issue()) save();
  await N2.load();
  if (await Dy.upgradeTimetable()) save();
  if (Dy.archiveOld()) save();
  await Lx.load();
  renameStyle();
  if (Soc.migrateTraits()) save();
  // First 60 seconds: one quest is already done, so the bar has moved before anything else happens.
  if (!live("xpEvents").some(e => e.ref === "call")) { put("xpEvents", { ts: Date.now(), type: "call", xp: CALL_XP, ref: "call", label: "Answer the call" }); save(); }
  briefOpen = briefDue();
  entering = true; render();
  const upd = Up.webUpdated(); if (upd) setTimeout(() => toast(`System updated: v${upd}`, true), 1500);
  Up.check().then(f => { if (f) render(); });
  fullOnTap();
  Sync.init({ render, toast });
  // Penalties are judged a few seconds after start (so a sync can bring in work done on another phone) and every minute.
  setTimeout(() => { runAssess(); render(); }, 6000);
  setInterval(tickPomo, 1000);
  setInterval(() => { if (!jpsOn()) return; if (jps.ends < Date.now() - 10 * 60000) { jps = null; return jpsSave(); } if (jpsLeft() <= 0) return jpEnd(); const el = $("#jpsT"); if (el) el.textContent = mmss(jpsLeft()); }, 1000);
  setInterval(() => { if (!gq || !gq.qs || gq.res || route()[0] !== "path") return; const el = $("#gateT"), left = gq.ends - Date.now(); if (left <= 0) return gateSubmit(); if (el) el.textContent = mmss(left); }, 1000);
  scheduleWindDown(); onSave(scheduleWindDown);
  const usageTick = async () => { if (await Us.refresh()) { save(); render(); } };
  usageTick(); setInterval(usageTick, 5 * 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { usageTick(); pendingRoute(); } });
  // v10: a hardware or Bluetooth keyboard works in the Drill too.
  document.addEventListener("keydown", e => {
    if (!Dr.running() || route()[0] !== "drill" || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key === "Backspace" ? "del" : e.key === "Enter" || e.key === " " ? null : /^[\d.-]$/.test(e.key) ? e.key : null;
    if (!k) return; e.preventDefault(); drillPaint(Dr.key(k));
  });
  pendingRoute();
  let alT = null; Al.init({ go, render }); onSave(() => { clearTimeout(alT); alT = setTimeout(Al.reschedule, 2000); });
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
