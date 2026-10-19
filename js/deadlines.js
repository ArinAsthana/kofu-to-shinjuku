// v9.2 §6: deadlines. A deadline is a task with kind "deadline": never planned, shown as a marker on its due date.
// Its prep sessions are normal focus tasks linked by `dl`, each with an `after` date the planner won't place before.
// Tasks already sync, so no schema change. connector/worker.js mirrors PREP and sessions(): keep them in step.

import { live, put, remove } from "./store.js";
import * as E from "./engine.js";

export const KINDS = { paper: "Paper", exam: "Exam", presentation: "Presentation", other: "Other" };
// Start = due minus `lead` days, unless Arin gives a start date. Sessions are [name, minutes].
export const PREP = {
  paper: { lead: 10, s: [["Research", 60], ["Outline", 45], ["Draft 1", 90], ["Draft 2", 90], ["Edit", 45]] },
  exam: { lead: 7, s: [["Review 1", 45], ["Review 2", 45], ["Review 3", 45], ["Final review", 45]] },
  presentation: { lead: 7, s: [["Slides", 90], ["Rehearse 1", 30], ["Rehearse 2", 30]] },
  other: { lead: 3, s: [["Prep", 60]] },
};
export const isDeadline = k => k.kind === "deadline";
const diff = (a, b) => Math.round((E.parse(b) - E.parse(a)) / 864e5);

// Spreads the sessions over start..(due − 1): each gets an `after` (earliest day) and a `due` (latest day).
// An exam's last review always sits on the day before. A late add starts today.
export function sessions(kind, due, start, t = E.today()) {
  const p = PREP[kind] || PREP.other, last = E.addDays(due, -1) < t ? t : E.addDays(due, -1);
  let from = start || E.addDays(due, -p.lead); if (from < t) from = t; if (from > last) from = last;
  const span = diff(from, last) + 1, n = p.s.length;
  return p.s.map(([name, mins], i) => {
    const a = Math.floor(i * span / n), b = Math.max(a, Math.floor((i + 1) * span / n) - 1);
    const lastExam = kind === "exam" && i === n - 1;
    return { name, mins, after: lastExam ? last : E.addDays(from, a), due: lastExam ? last : E.addDays(from, b) };
  });
}

export function add({ title, course = "", kind = "other", due, time = "", start = "", size = "" }) {
  kind = PREP[kind] ? kind : "other";
  const ss = sessions(kind, due, start || null), now = Date.now();
  const d = put("tasks", { kind: "deadline", title, course, dlKind: kind, due, time, size, start: start && start <= due ? start : ss[0].after, mins: 0, prio: 3, done: false, created: now, pin: null });
  for (const s of ss) put("tasks", { title: `${title}: ${s.name}`, mins: s.mins, prio: 3, energy: "high", due: s.due, after: s.after, dl: d.id, done: false, created: now, pin: null });
  return { d, sessions: ss };
}

export const get = id => live("tasks").find(k => k.id === id && isDeadline(k)) || null;
export const prep = id => live("tasks").filter(k => k.dl === id).sort((a, b) => (a.after || "").localeCompare(b.after || "") || a.created - b.created);
// Upcoming deadlines (due today or later), soonest first.
export const list = (t = E.today()) => live("tasks").filter(k => isDeadline(k) && k.due >= t).sort((a, b) => a.due.localeCompare(b.due));
export const on = d => live("tasks").filter(k => isDeadline(k) && k.due === d);
// Home shows a deadline only from its start date.
export const active = (t = E.today()) => list(t).filter(k => (k.start || k.due) <= t);
export const daysLeft = (k, t = E.today()) => diff(t, k.due);
export const nextSession = id => prep(id).find(k => !k.done) || null;
export const sessionName = (k, d) => d && k.title.startsWith(d.title + ": ") ? k.title.slice(d.title.length + 2) : k.title;

// Moves the deadline and shifts its open sessions by the same number of days (never before today).
export function move(id, due, start) {
  const d = get(id); if (!d) return null;
  const t = E.today(), delta = diff(d.due, due), clamp = x => x < t ? t : x;
  for (const k of prep(id).filter(k => !k.done)) {
    const after = clamp(E.addDays(k.after || k.due, delta)), kd = clamp(E.addDays(k.due, delta));
    put("tasks", { ...k, after, due: kd < after ? after : kd, pin: null });
  }
  return put("tasks", { ...d, due, start: start || E.addDays(d.start || d.due, delta) });
}
// Drops the deadline and its open sessions. Finished sessions (and their XP) stay.
export function drop(id) {
  for (const k of prep(id).filter(k => !k.done)) remove("tasks", k.id);
  remove("tasks", id);
}
// A prep session done before its own due date is ahead: +50% XP.
export const AHEAD = 0.5;
export const aheadOf = (k, t = E.today()) => !!k.dl && !!k.due && t < k.due;
// v10.2: exams that have passed (last 14 days) with no score yet. The app asks once for each.
export const unscored = (t = E.today()) => live("tasks").filter(k => isDeadline(k) && k.dlKind === "exam" && !k.scored && k.due < t && k.due >= E.addDays(t, -14));
export const markScored = id => { const d = get(id); if (d) put("tasks", { ...d, scored: true }); };
