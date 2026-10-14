// Social v2.5: Trials, Battle Log, field notes (habit library), appraisals, and the trait set change.
// Trials are tasks with a `trial` type: the planner places them before their due date like any task.
// Done → a Battle Log on the task {actual, what, react, next, asked, turned, ended}. Overdue → a penalty that stays
// open (shop locked) until the trial is done late. Stores: fieldNotes {person, trait, habit, status, date},
// appraisals {date, by, scores}.

import { S, live, put, remove } from "./store.js";
import { TRIALS, TOWER, EGO, SOCIAL } from "./data.js";
import * as E from "./engine.js";

export const so = () => S.settings.social;
export const trials = () => live("tasks").filter(k => k.trial);
export const openTrials = () => trials().filter(k => !k.done).sort((a, b) => (a.due || "9").localeCompare(b.due || "9"));
export const towerFloor = () => so().tower || 0; // floors cleared
const sunday = () => { const t = E.today(), d = E.parse(t).getDay(); return E.addDays(t, d === 0 ? 0 : 7 - d); };
export const DUE = { rival: sunday, taste: sunday, ego: () => E.today(), tower: () => E.addDays(E.today(), 3), copy: () => E.addDays(E.today(), 3),
  invasion: () => E.addDays(E.today(), 7), appraisal: () => E.addDays(E.today(), 7), party: () => E.addDays(E.today(), 14), boss: () => E.addDays(E.today(), 14), prep: () => E.addDays(E.today(), 7) };
export const xpFor = k => k.trial === "tower" ? 20 * (k.floor || 1) : k.trial === "ego" ? 10 * (k.pain || 2) : (TRIALS[k.trial] || { xp: 30 }).xp;

export function addTrial(type, { title, due, fear = null, ...extra }) {
  return put("tasks", { title, mins: TRIALS[type]?.mins || 30, prio: 3, energy: "high", due: due || DUE[type](), done: false, created: Date.now(), pin: null, trial: type, fear, ...extra });
}
// Boss Raid: the event, two prep trials in the days before it, and its own Battle Log as the debrief.
export function addBoss(name, date, fear) {
  const boss = addTrial("boss", { title: "Boss Raid: " + name, due: date, fear });
  const d1 = E.addDays(date, -1) >= E.today() ? E.addDays(date, -1) : E.today(), d2 = E.addDays(date, -3) >= E.today() ? E.addDays(date, -3) : E.today();
  addTrial("prep", { title: `Prep for ${name}: 3 questions to ask and 1 short story to tell`, due: d2, boss: boss.id });
  addTrial("prep", { title: `Prep for ${name}: outfit, who'll be there, how you'll get in and out`, due: d1, boss: boss.id });
  return boss;
}
export const egoPick = () => { const used = new Set(trials().filter(k => k.trial === "ego").map(k => k.ego)); const free = EGO.map((e, i) => i).filter(i => !used.has(i)); const pool = free.length ? free : EGO.map((e, i) => i); return pool[Math.floor(Math.random() * pool.length)]; };
export const towerNext = () => Math.min(TOWER.length, towerFloor() + 1);

// Saves the Battle Log, closes the trial and pays its XP once.
export function logBattle(k, log) {
  put("tasks", { ...k, done: true, doneAt: Date.now(), log: { ...log, at: Date.now() } });
  if (k.trial === "tower" && (k.floor || 1) > towerFloor()) { so().tower = k.floor || 1; S.settings.u = Date.now(); }
  if (k.trial === "copy" && k.note && log.result) { const n = live("fieldNotes").find(x => x.id === k.note); if (n) put("fieldNotes", { ...n, status: log.result }); }
  const ref = "trial:" + k.id;
  if (live("xpEvents").some(e => e.ref === ref)) return [];
  const xp = xpFor(k);
  put("xpEvents", { ts: Date.now(), type: "trial", xp, ref, label: (TRIALS[k.trial]?.name || "Trial") + " cleared" });
  return [{ xp, label: (TRIALS[k.trial]?.name || "Trial") + " cleared" }];
}
export function undoTrial(k) {
  live("xpEvents").filter(e => e.ref === "trial:" + k.id).forEach(e => remove("xpEvents", e.id));
  put("tasks", { ...k, done: false, doneAt: null, log: null });
}

// A trial past its due date and not done: −15 XP and a penalty that stays open until it's done.
export function assess() {
  const t = E.today(), fresh = [];
  for (const k of openTrials()) {
    if (!k.due || k.due >= t) continue;
    const id = "pen-tr-" + k.id; if (S.penalties.some(p => p.id === id)) continue;
    // One open penalty at a time (v3.1): a further overdue trial is recorded but waived.
    if (live("penalties").some(p => !p.waived && live("tasks").some(x => x.id === p.task && !x.done))) { put("penalties", { id, date: k.due, block: null, trial: true, title: k.title, s: 0, xp: 0, task: null, waived: true }); continue; }
    fresh.push(put("penalties", { id, date: k.due, block: null, trial: true, title: k.title, s: 0, xp: 15, task: k.id }));
  }
  return fresh;
}

// Battle Log stats: predicted vs actual fear per trial, and the wanted rate (2+ of 3 wanted signals).
export function battles() {
  return trials().filter(k => k.done && k.log && k.log.actual).sort((a, b) => (a.doneAt || 0) - (b.doneAt || 0));
}
export const wantedScore = l => [l.asked === "yes", l.turned === "yes", l.ended && l.ended !== "them"].filter(Boolean).length;
export const signalsLogged = l => !!(l.asked || l.turned || l.ended);

// v2.5 trait set. Communication's scores carry over to Engagement; Charisma and Ambition drop out of the list but
// their scores stay in the records. Custom traits Arin added are kept after the defaults. Runs once.
export function migrateTraits() {
  const s = so(); if (s.v25) return false;
  const custom = (s.criteria || []).filter(c => !["Communication", "Taste", "Charisma", "Reliability", "Ambition", "Style", ...SOCIAL.criteria].includes(c));
  s.criteria = [...SOCIAL.criteria, ...custom];
  if (s.self && s.self.Communication !== undefined && s.self.Engagement === undefined) s.self = { ...s.self, Engagement: s.self.Communication };
  for (const p of live("people")) if (p.scores && p.scores.Communication !== undefined && p.scores.Engagement === undefined) put("people", { ...p, scores: { ...p.scores, Engagement: p.scores.Communication } });
  s.v25 = true; S.settings.u = Date.now();
  return true;
}
