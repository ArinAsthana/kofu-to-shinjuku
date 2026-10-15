// v6: the Path. Arin's Job-Readiness Plan as seven streams, each an ordered queue (data/path/plan.json).
// Every non-Sunday from START the System issues each stream's next item as a Today task; the planner places it.
// Done or Partly advances the stream; an item left open simply rolls on (one item per stream at a time, never a pile).
// Go ahead issues the next item now. Each item has a scheduled day (the n-th non-Sunday from START): finishing
// before it is "ahead" (+50% XP). Sundays issue the plan's light Sunday items instead, which never move a stream.
//
// path store, one record per finished item: {id = its task id, stream, idx, sun, date, result "done"|"partly", ahead, xp, zetamac}

import { S, live, put, remove } from "./store.js";
import * as E from "./engine.js";

export const START = "2026-10-19";
export const START_MS = new Date(2026, 9, 19, 4, 0).getTime(); // the System awakens at 04:00
export const STREAMS = [
  { id: "mental", label: "Mental Math", mins: 15 },
  { id: "case", label: "Case", mins: 30 },
  { id: "aptitude", label: "Aptitude", mins: 30 },
  { id: "japanese", label: "Japanese", mins: 45 },
  { id: "accounting", label: "Accounting", mins: 30 },
  { id: "sapmurex", label: "SAP/Murex", mins: 45 },
  { id: "apps", label: "Applications", mins: 45 },
];
export const stream = id => STREAMS.find(s => s.id === id);
const SUN_MINS = 20;

let WEEK = {}, SUN = {}, RES = [];
// "45m Genki II…" repeats the stream's own length; a split item ("30m … | 15m …") keeps its parts.
const clean = t => t.includes(" | ") ? t : t.replace(/^\d+m /, "");
export async function load() {
  try {
    const rows = await (await fetch("data/path/plan.json")).json();
    for (const s of STREAMS) {
      WEEK[s.id] = rows.filter(r => r.day !== "Sun" && r[s.id]).map(r => ({ t: clean(r[s.id]), phase: r.phase }));
      SUN[s.id] = rows.filter(r => r.day === "Sun" && r.date > START).map(r => r[s.id] ? { t: clean(r[s.id]), phase: r.phase } : null);
    }
  } catch (e) { WEEK = {}; SUN = {}; }
  try { RES = await (await fetch("data/path/resources.json")).json(); } catch (e) { RES = []; }
}
export const ready = () => !!(WEEK.case && WEEK.case.length);
export const resources = () => RES;
export const started = (t = E.today()) => t >= START;
export const daysToStart = (t = E.today()) => Math.max(0, E.daysBetween(t, START));

/* ---------- the schedule ---------- */
const isSun = d => E.parse(d).getDay() === 0;
// Non-Sundays in [START, d): the index of the item scheduled on d.
export function schedIdx(d) {
  if (d <= START) return 0;
  const n = E.daysBetween(START, d), w = Math.floor(n / 7), r = n % 7;
  return w * 6 + Math.min(r, 6); // START is a Monday, so day 6 of each week is the Sunday
}
export function schedDate(idx) { const w = Math.floor(idx / 6), r = idx % 6; return E.addDays(START, w * 7 + r); }

/* ---------- progress ---------- */
const logOf = s => live("path").filter(r => r.stream === s && !r.sun);
export const pos = s => logOf(s).reduce((a, r) => Math.max(a, r.idx + 1), 0);
export const item = (s, idx) => (WEEK[s] || [])[idx] || null;
export const length = s => (WEEK[s] || []).length;
export const pathTasks = () => live("tasks").filter(k => k.path);
// An item started with Go ahead, while its time runs (plus 30 min to report).
export function running(now = new Date()) {
  const t = E.ymd(now), m = now.getHours() * 60 + now.getMinutes();
  return pathTasks().find(k => !k.done && k.pin && k.pin.date === t && (() => { const [h, mm] = k.pin.start.split(":").map(Number), s = h * 60 + mm; return m >= s && m < s + k.mins + 30; })()) || null;
}
export const openTask = s => pathTasks().find(k => !k.done && k.path.stream === s && !k.path.sun);
// Scheduled through today (today's own item counts once the day is over).
export function standing(s, t = E.today()) {
  const p = pos(s), si = schedIdx(t), due = si + (started(t) && !isSun(t) ? 1 : 0);
  return { pos: p, ahead: Math.max(0, p - due), behind: started(t) ? Math.max(0, si - p) : 0 };
}
// Home's single line: the worst stream if any is behind, else how far the whole Path is ahead.
export function summary(t = E.today()) {
  const st = STREAMS.map(s => ({ s, ...standing(s.id, t) })).filter(x => length(x.s.id));
  const worst = st.slice().sort((a, b) => b.behind - a.behind)[0];
  if (worst && worst.behind) return { behind: worst.behind, stream: worst.s };
  return { ahead: Math.min(...st.map(x => x.ahead)) };
}

/* ---------- issuing ---------- */
const xpFor = mins => 5 + Math.round(mins / 3); // 15m: 10, 30m: 15, 45m: 20
function taskFor(s, idx, t, extra = {}) {
  const st = stream(s), it = item(s, idx);
  return { id: `path-${s}-${idx}`, title: `${st.label} · ${it.t}`, mins: st.mins, prio: 2, due: t, done: false, created: Date.now(), pin: null, path: { stream: s, idx, issued: t }, ...extra };
}
// Run on open and every minute. Returns true when anything changed.
export function issue(t = E.today()) {
  if (!ready() || !started(t)) return false;
  let changed = false;
  // A Sunday item is for its Sunday only.
  for (const k of pathTasks()) if (k.path.sun && !k.done && k.due < t) { remove("tasks", k.id); changed = true; }
  if (isSun(t)) {
    const k = Math.floor(E.daysBetween(START, t) / 7) - 1; // the first Sunday after START is the plan's second
    for (const s of STREAMS) {
      const it = (SUN[s.id] || [])[k], id = `path-sun-${s.id}-${k}`;
      if (!it || S.tasks.some(x => x.id === id)) continue;
      put("tasks", { id, title: `${s.label} · ${it.t}`, mins: SUN_MINS, prio: 1, due: t, done: false, created: Date.now(), pin: null, path: { stream: s.id, idx: k, issued: t, sun: true } });
      changed = true;
    }
    return changed;
  }
  for (const s of STREAMS) {
    const p = pos(s.id);
    if (p >= length(s.id) || openTask(s.id)) continue;
    if (S.tasks.some(x => x.path && !x.path.sun && x.path.stream === s.id && x.path.issued === t)) continue; // one a day
    const k = taskFor(s.id, p, t), old = S.tasks.find(x => x.id === k.id);
    if (old && !old.del) continue;
    put("tasks", k); changed = true;
  }
  return changed;
}
// Go ahead: the stream's next item, pinned to start now.
export function goAhead(s, now = new Date()) {
  if (!ready() || openTask(s)) return null;
  const p = pos(s); if (p >= length(s)) return null;
  const t = E.ymd(now), m = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5;
  const start = E.pad(Math.floor(m / 60) % 24) + ":" + E.pad(m % 60);
  return put("tasks", taskFor(s, p, t, { pin: { date: t, start }, ahead: true }));
}

/* ---------- finishing ---------- */
// result "done" | "partly". Returns {xp, label} for the toast.
export function finish(k, result, zetamac = null, t = E.today()) {
  const { stream: s, idx, sun } = k.path, base = xpFor(k.mins);
  const ahead = !sun && result === "done" && t < schedDate(idx);
  const xp = result === "partly" ? Math.round(base / 2) : ahead ? Math.round(base * 1.5) : base;
  put("tasks", { ...k, done: true, doneAt: Date.now(), result });
  put("path", { id: k.id, stream: s, idx, sun: !!sun, date: t, result, ahead, xp, zetamac: zetamac ?? null });
  const ref = "path:" + k.id;
  if (live("xpEvents").some(e => e.ref === ref)) return null;
  const label = `${stream(s).label}${ahead ? " · Ahead" : result === "partly" ? " · Partly" : ""}`;
  put("xpEvents", { ts: Date.now(), type: "path", xp, ref, label });
  return { xp, label };
}
// Undo: only the stream's latest item, and only while the next one hasn't been finished.
export function undo(k) {
  const { stream: s, idx, sun } = k.path;
  if (!sun && pos(s) > idx + 1) return false;
  E.revokeXP("path:" + k.id);
  const r = live("path").find(x => x.id === k.id); if (r) remove("path", r.id);
  if (!sun) for (const n of pathTasks()) if (!n.done && n.path.stream === s && n.path.idx > idx) remove("tasks", n.id);
  put("tasks", { ...k, done: false, doneAt: null, result: null });
  return true;
}

/* ---------- today ---------- */
export function today(t = E.today()) {
  const ks = pathTasks().filter(k => (!k.done && k.due <= t) || (k.done && k.doneAt && E.ymd(new Date(k.doneAt)) === t));
  return { list: ks, done: ks.filter(k => k.done).length, total: ks.length };
}
export function zetamac() {
  const sc = live("path").map(r => r.zetamac).filter(n => n != null);
  return sc.length ? { best: Math.max(...sc), avg: Math.round(sc.reduce((a, b) => a + b, 0) / sc.length), n: sc.length, last: sc[sc.length - 1] } : null;
}
