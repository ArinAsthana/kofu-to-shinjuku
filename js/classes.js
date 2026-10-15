// Class system (v3.2): disciplines are curricula of chapters, each closed by a quiz, and a boss exam at the end.
// Classes are earned from sets of cleared disciplines plus a capstone quest; specialisations add one more discipline.
// Titles (disciplines, JLPT levels, classes, specialisations) cost wallet XP the first time they're equipped.
// Chapter outlines are in data/disciplines/index.json (loaded at start); quizzes load per discipline when needed.
// Records: discLog {disc, ch, kind quiz|boss|read|self|capstone, score, n, pass, date}; titles {id "disc:acct", xp, date}.

import { S, live, put } from "./store.js";
import { SUBJECTS } from "./data.js";
import * as E from "./engine.js";
import * as P from "./planner.js";
import * as K from "./cards.js";
import * as J from "./jlpt.js";

export const CAP = 3; // active disciplines at once
export const PASS = { chapter: 5 / 6, boss: 0.7 };
export const COST = { disc: 200, jlpt: 200, class: 500, spec: 1000 };
export const XP_CH = 40, XP_BOSS = 150;

export const CLASSES = [
  { id: "strategist", name: "Strategist", needs: ["acct", "cfv", "strat", "bjp"], capstone: "20 timed cases solved and logged, plus one full mock interview with a consultant contact." },
  { id: "sapfico", name: "SAP FI/CO Consultant", needs: ["acct", "mgmt", "sap", "sql"], capstone: "Pass the SAP FI/CO associate certification, plus a written walk-through of record-to-report in S/4HANA." },
  { id: "markets", name: "Markets Systems Consultant", needs: ["acct", "cmp", "deriv", "sql"], capstone: "A Python project: a JPY interest rate swap priced off a TONA curve, plus a trade capture → confirm → settle → P&L flow." },
  { id: "ambassador", name: "Ambassador", needs: ["econ", "politics"], capstone: "A 1,500-word brief on one Japanese policy issue, written for a foreign reader." },
  { id: "audio", name: "Audio Engineer", needs: ["music", "sound"], capstone: "One original track taken from stems to a finished, mastered file." },
];
// plus: a discipline id, or "jlpt:N2" for a JLPT level passed.
export const SPECS = [
  { id: "diplomat", name: "Diplomat", base: "ambassador", plus: "jlpt:N2" },
  { id: "digistrat", name: "Digital Strategist", base: "strategist", plus: "sql" },
  { id: "fintrans", name: "Finance Transformation Lead", base: "sapfico", plus: "cfv" },
  { id: "quantdev", name: "Quant Developer", base: "markets", plus: "maths" },
];
// The classes the career plan aims at come first; the rest sit under "Other paths".
export const CORE = ["strategist", "sapfico", "markets"];

/* ---------- outlines ---------- */
let INDEX = [];
const full = {};
export async function loadIndex() {
  try { INDEX = await (await fetch("data/disciplines/index.json")).json(); } catch (e) { INDEX = []; }
}
export const all = () => INDEX;
export const disc = id => INDEX.find(d => d.id === id) || null;
export async function loadFull(id) {
  if (!full[id]) full[id] = await (await fetch(`data/disciplines/${id}.json`)).json();
  return full[id];
}

const cfg = () => {
  const s = S.settings;
  if (!s.classes) s.classes = {};
  const c = s.classes;
  c.active = c.active || []; c.equipped = c.equipped ?? null; c.custom = c.custom || {};
  return c;
};
const touch = () => { S.settings.u = Date.now(); };
export const active = () => cfg().active.filter(disc);
// Arin's own chapter list for a discipline (from a real book), or the starter one.
export const chapters = id => cfg().custom[id] || disc(id)?.chapters || [];
export const isCustom = id => !!cfg().custom[id];

/* ---------- progress ---------- */
const logs = (id, kind) => live("discLog").filter(r => r.disc === id && (!kind || r.kind === kind));
export const chapterCleared = (id, ch) => logs(id).some(r => r.ch === ch && (r.kind === "quiz" || r.kind === "self") && r.pass);
export const readDone = (id, ch) => logs(id, "read").some(r => r.ch === ch) || readPct(ch) >= 100;
// Reading progress comes from Finance study block reports (the chapter is the block's topic).
export const readPct = ch => Math.min(100, live("blockLog").filter(r => r.subj === "fin" && r.topic === ch).reduce((a, r) => a + (r.gain || 0), 0));
export const currentChapter = id => chapters(id).find(c => !chapterCleared(id, c.id)) || null;
export const clearedCount = id => chapters(id).filter(c => chapterCleared(id, c.id)).length;
export const bossPassed = id => logs(id, "boss").some(r => r.pass);
export const bossOpen = id => !currentChapter(id) && !bossPassed(id);
export function hoursLeft(id) {
  return chapters(id).filter(c => !chapterCleared(id, c.id)).reduce((a, c) => a + (c.hours || 0) * (1 - readPct(c.id) / 100 * 0.8), 0);
}
// Finance quest-block hours per week, from the timetable.
export function weeklyHours() {
  const re = new RegExp(SUBJECTS.fin.match, "i");
  return live("blocks").filter(b => b.kind === "quest" && !b.date && !P.isWorkout(b) && (b.subj === "fin" || (!b.subj && re.test(b.title || ""))))
    .reduce((a, b) => { let m = P.toMin(b.end) - P.toMin(b.start); if (m <= 0) m += 1440; return a + m * (b.days || []).length; }, 0) / 60;
}
// Pace: hours needed in the active disciplines vs Finance block hours left before graduation.
export function pace() {
  const need = active().reduce((a, id) => a + hoursLeft(id), 0), wk = weeklyHours(), weeks = E.weeksLeft();
  const have = wk * weeks;
  return { need: Math.round(need), have: Math.round(have), wk: Math.round(wk * 10) / 10, perWeek: Math.round(need / weeks * 10) / 10, ok: have >= need };
}

/* ---------- the System picks the next chapter ---------- */
// For Finance study blocks: the current chapter of each active discipline, the one with the most hours left first,
// so they finish together. A chapter whose reading is done waits for its quiz and drops off the block.
export function studyTopics() {
  return active().map(id => ({ id, c: currentChapter(id), h: hoursLeft(id) })).filter(x => x.c && !readDone(x.id, x.c.id))
    .sort((a, b) => b.h - a.h)
    .map(x => ({ id: x.c.id, t: disc(x.id).name + " · " + x.c.title, do: x.c.read, out: x.c.produce, disc: x.id }));
}

/* ---------- actions ---------- */
export function setActive(id, on) {
  const c = cfg();
  if (on && !c.active.includes(id)) { if (active().length >= CAP) return false; c.active.push(id); }
  if (!on) c.active = c.active.filter(x => x !== id);
  touch(); return true;
}
export function markRead(id, ch) { put("discLog", { disc: id, ch, kind: "read", date: E.today(), ts: Date.now() }); }
// A self-reported chapter (Arin's own book chapters have no quiz).
export function selfClear(id, ch) {
  put("discLog", { disc: id, ch, kind: "self", pass: true, date: E.today(), ts: Date.now() });
  return chapterXp(id, ch);
}
function chapterXp(id, ch) {
  const ref = "chapter:" + id + ":" + ch; if (live("xpEvents").some(e => e.ref === ref)) return null;
  const c = chapters(id).find(x => x.id === ch);
  put("xpEvents", { ts: Date.now(), type: "chapter", xp: XP_CH, ref, label: "Chapter cleared: " + (c ? c.title : ch) });
  return { xp: XP_CH, label: "Chapter cleared" };
}

/* ---------- quizzes ---------- */
export const isNum = q => q.n !== undefined;
export const correct = (q, a) => a == null || a === "" ? false : isNum(q) ? Math.abs(Number(String(a).replace(/[,¥%\s]/g, "")) - q.n) <= (q.tol ?? 0) + 1e-9 : Number(a) === q.a;
export const answerText = q => isNum(q) ? (q.unit === "¥" ? "¥" + q.n.toLocaleString("en-US") : q.n + (q.unit ? " " + q.unit : "")) : q.opts[q.a];
// Grades a chapter quiz or the boss exam; wrong answers become flashcards. Returns { ok, n, pass, gains }.
export function finish(id, ch, qs, ans) {
  const d = disc(id), ok = qs.filter((q, i) => correct(q, ans[i])).length, n = qs.length, boss = ch === "boss";
  const pass = ok / n >= (boss ? PASS.boss : PASS.chapter) - 1e-9, gains = [];
  put("discLog", { disc: id, ch, kind: boss ? "boss" : "quiz", score: ok, n, pass, date: E.today(), ts: Date.now() });
  qs.forEach((q, i) => {
    if (correct(q, ans[i])) return;
    const cid = "dm-" + id + "-" + ch + "-" + (q._i ?? i);
    if (live("cards").some(c => c.id === cid)) return;
    put("cards", K.newCard({ id: cid, deck: d.name + " mistakes", front: q.q, back: answerText(q) + (q.ex ? " · " + q.ex : "") }));
  });
  if (pass && !boss) { const g = chapterXp(id, ch); if (g) gains.push(g); }
  if (pass && boss && !live("xpEvents").some(e => e.ref === "dboss:" + id)) {
    put("xpEvents", { ts: Date.now(), type: "boss", xp: XP_BOSS, ref: "dboss:" + id, label: "Boss exam cleared: " + d.name });
    gains.push({ xp: XP_BOSS, label: "Title unlocked: " + d.title });
  }
  return { ok, n, pass, gains };
}

/* ---------- classes and capstones ---------- */
export const capstoneDone = cl => logs("class:" + cl, "capstone").some(r => r.pass);
export function setCapstone(cl, on) { put("discLog", { id: "cap-" + cl, disc: "class:" + cl, ch: "capstone", kind: "capstone", pass: !!on, date: E.today(), ts: Date.now() }); }
export const classInfo = cl => { const c = CLASSES.find(x => x.id === cl); const got = c.needs.filter(bossPassed); return { ...c, got, ready: got.length === c.needs.length, earned: got.length === c.needs.length && capstoneDone(cl) }; };
const plusDone = p => p.startsWith("jlpt:") ? J.passedLevels().includes(p.slice(5)) : bossPassed(p);
export const plusName = p => p.startsWith("jlpt:") ? "JLPT " + p.slice(5) : disc(p)?.name || p;
export const specInfo = sp => { const s = SPECS.find(x => x.id === sp); return { ...s, earned: classInfo(s.base).earned && plusDone(s.plus) }; };

/* ---------- titles ---------- */
// Every title Arin has earned, with its equip cost.
export function titles() {
  const out = [];
  for (const d of INDEX) if (bossPassed(d.id)) out.push({ id: "disc:" + d.id, name: d.title, kind: "disc", cost: COST.disc, from: d.name });
  for (const l of [...new Set(J.passedLevels())]) out.push({ id: "jlpt:" + l, name: J.TITLES[l], kind: "jlpt", cost: COST.jlpt, from: "JLPT " + l });
  for (const c of CLASSES) if (classInfo(c.id).earned) out.push({ id: "class:" + c.id, name: c.name, kind: "class", cost: COST.class, from: "Class" });
  if (S.settings.path && S.settings.path.vanguard) out.push({ id: "path:vanguard", name: "Vanguard", kind: "path", cost: COST.disc, from: "7 days ahead on the Path" });
  for (const s of SPECS) if (specInfo(s.id).earned) out.push({ id: "spec:" + s.id, name: s.name, kind: "spec", cost: COST.spec, from: "Specialisation" });
  return out.map(t => ({ ...t, owned: live("titles").some(r => r.id === t.id) }));
}
export const titlesSpent = () => live("titles").reduce((a, r) => a + (r.xp || 0), 0);
// Buys (first time) and equips a title. Returns "" or why it can't.
export function equip(id) {
  const t = titles().find(x => x.id === id); if (!t) return "Not earned yet.";
  if (!t.owned) { if (E.xpWallet() < t.cost) return `Needs ${t.cost} XP to spend.`; put("titles", { id, xp: t.cost, date: E.today() }); }
  cfg().equipped = id; touch(); return "";
}
export function unequip() { cfg().equipped = null; touch(); }
// Shown under the name on Home: the equipped title, else the class Arin is working towards, as identity.
export function identity() {
  const eq = cfg().equipped, t = eq && titles().find(x => x.id === eq);
  if (t) return t.name;
  const act = active(); if (!act.length) return "";
  const best = CLASSES.map(c => ({ c, n: c.needs.filter(x => act.includes(x) || bossPassed(x)).length })).sort((a, b) => b.n - a.n || ((CORE.indexOf(a.c.id) + 1) || 99) - ((CORE.indexOf(b.c.id) + 1) || 99))[0];
  return best && best.n ? best.c.name + " in training" : "";
}
