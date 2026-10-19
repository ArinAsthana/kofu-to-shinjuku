// v8.1: the N2 plan as a queue (data/jp/n2-plan.json: Arin's own 182-day plan, phase / grammar task / new-card pace / fluency).
// No block and no date: the next grammar item is always open, whenever there is a gap. Row i is scheduled START + i days;
// finishing before that is "ahead" (+50% XP). Arcs of 5 and a Gate Test every 3 Arcs come from the Path engine (stream "n2").
// Phases are Floors; each full mock is a Raid on its scheduled day. Only today's item and the current Floor are ever shown.
//
// path store, one record per finished item: {id "n2-<idx>", stream "n2", idx, date, result "done"|"partly", ahead, xp}

import { S, live, put, remove } from "./store.js";
import * as E from "./engine.js";
import * as Pa from "./path.js";
import { segments } from "./planner.js";
import { HABIT_DEFS } from "./data.js";

export const START = Pa.START, ID = "n2";
export const XP_ITEM = 20, XP_FLUENCY = 5;
let ROWS = [];
export async function load() {
  try { ROWS = await (await fetch("data/jp/n2-plan.json")).json(); } catch (e) { ROWS = []; }
  let k = 0;
  const raids = ROWS.map((r, i) => r.mock ? { id: "raid-n2-mock-" + i, date: schedDate(i), name: `N2 full mock ${++k}`, big: false } : null).filter(Boolean);
  Pa.setQueue(ID, ROWS.map(r => ({ t: r.g, phase: r.p })), raids);
}
export const ready = () => ROWS.length > 0;
export const length = () => ROWS.length;
export const row = i => ROWS[i] || null;
export const schedDate = i => E.addDays(START, i);
export const pos = () => Pa.pos(ID);
const log = () => live("path").filter(r => r.stream === ID && r.kind !== "gate");
export const doneToday = (t = E.today()) => log().filter(r => r.date === t);

// The item now open (null when the plan is finished), and whether a Gate Test holds it.
export function current() {
  const p = pos(); if (p >= ROWS.length) return null;
  return { idx: p, ...ROWS[p], due: schedDate(p), gate: Pa.gate(ID) };
}
// The Floor: the plan's phase of the open item ("P2 N3 grammar" -> Floor 2, "N3 grammar").
export function floor() {
  const r = ROWS[Math.min(pos(), ROWS.length - 1)]; if (!r) return null;
  const m = /^P(\d+)\s*(.*)$/.exec(r.p) || [0, 1, r.p];
  return { n: +m[1], name: m[2], total: 5 };
}
// New cards today: the plan row's pace (a ceiling). Settings can override it.
export function pace() {
  const r = ROWS[Math.min(pos(), ROWS.length - 1)] || { w: 25, k: 5 };
  return { newWords: r.w, newKanji: r.k };
}

// Finishes the open item. Returns {xp, label, floor?} for the toast.
export function finish(result = "done", t = E.today()) {
  const c = current(); if (!c || c.gate) return null;
  const ahead = result === "done" && t < c.due, xp = result === "partly" ? XP_ITEM / 2 : ahead ? XP_ITEM * 1.5 : XP_ITEM;
  const f0 = floor();
  put("path", { id: "n2-" + c.idx, stream: ID, idx: c.idx, date: t, result, ahead, xp });
  const ref = "n2:" + c.idx;
  if (!live("xpEvents").some(e => e.ref === ref)) put("xpEvents", { ts: Date.now(), type: "path", xp, ref, label: `Japanese · ${ahead ? "Ahead" : result === "partly" ? "Partly" : "Grammar"}` });
  const f1 = floor();
  // It ticks the daily Japanese quest, like logging a workout ticks the gym one.
  let habit = null;
  if (!E.habitDone("jp", t)) { const h = put("habitLog", { date: t, habit: "jp", auto: true }); habit = E.gainXP("habit", h.id, HABIT_DEFS.find(x => x.id === "jp").name); }
  return { xp, habit, label: ahead ? "Ahead" : result === "partly" ? "Partly" : "Grammar done", floor: f1 && f0 && f1.n !== f0.n ? f1 : null };
}
// Undo the latest item only.
export function undo() {
  const p = pos(); if (!p) return false;
  const r = log().find(x => x.idx === p - 1); if (!r) return false;
  remove("path", r.id); E.revokeXP("n2:" + r.idx);
  return true;
}

// Fluency side quests: the latest finished item's two tasks, open once its grammar is done (today).
// A night-shift task shows only on a day with a work block.
const shiftDay = t => segments(t).some(g => g.b.kind === "work" && !g.tail);
export function fluency(t = E.today()) {
  const last = doneToday(t).sort((a, b) => b.idx - a.idx)[0]; if (!last) return [];
  return (ROWS[last.idx] || { f: [] }).f.map((x, j) => ({ ref: `n2f:${last.idx}:${j}`, t: x }))
    .filter(x => x.t && (!/^Night shift/i.test(x.t) || shiftDay(t)))
    .map(x => ({ ...x, done: live("xpEvents").some(e => e.ref === x.ref) }));
}
export function fluencyDone(ref, on) {
  const ev = live("xpEvents").find(e => e.ref === ref);
  if (on && !ev) { put("xpEvents", { ts: Date.now(), type: "path", xp: XP_FLUENCY, ref, label: "Japanese · Fluency" }); return XP_FLUENCY; }
  if (!on && ev) E.revokeXP(ref);
  return 0;
}

// The exam Raid's level, asked once (default N2).
export const examAsked = () => !!(S.settings.jpExam && S.settings.jpExam.ok);
export function setExam(lvl) { S.settings.jpExam = { lvl, ok: true }; S.settings.u = Date.now(); }
