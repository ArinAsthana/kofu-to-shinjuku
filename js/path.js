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
  // v8: Japanese left the Path. It runs from the N2 plan in any free gap (Study → Japanese); its old records stay.
  { id: "accounting", label: "Accounting", mins: 30 },
  { id: "sapmurex", label: "SAP/Murex", mins: 45 },
  { id: "apps", label: "Applications", mins: 45 },
];
export const stream = id => STREAMS.find(s => s.id === id);
const SUN_MINS = 20;

let WEEK = {}, SUN = {}, RES = [], FLOORS = [], RAIDS = [];
// "45m Genki II…" repeats the stream's own length; a split item ("30m … | 15m …") keeps its parts.
const clean = t => t.includes(" | ") ? t : t.replace(/^\d+m /, "");
export async function load() {
  try {
    const rows = await (await fetch("data/path/plan.json")).json();
    for (const s of STREAMS) {
      WEEK[s.id] = rows.filter(r => r.day !== "Sun" && r[s.id]).map(r => ({ t: clean(r[s.id]), phase: r.phase, date: r.date }));
      SUN[s.id] = rows.filter(r => r.day === "Sun" && r.date > START).map(r => r[s.id] ? { t: clean(r[s.id]), phase: r.phase } : null);
    }
    FLOORS = []; for (const r of rows) if (!FLOORS.length || FLOORS[FLOORS.length - 1].phase !== r.phase) FLOORS.push({ n: FLOORS.length + 1, phase: r.phase, name: r.phase.replace(/^\d+\s*/, ""), from: r.date });
    RAIDS = rows.filter(r => r.milestone && r.date >= START).map(r => ({ id: "raid-" + r.date, date: r.date, name: r.milestone.replace(/\s*\(target date\)/, ""), big: /CBT \(target|^JLPT|GRADUATION/.test(r.milestone) }));
  } catch (e) { WEEK = {}; SUN = {}; }
  try { RES = await (await fetch("data/path/resources.json")).json(); } catch (e) { RES = []; }
}
export const ready = () => !!(WEEK.case && WEEK.case.length);
export const resources = () => RES;
export const started = (t = E.today()) => t >= START;
export const daysToStart = (t = E.today()) => Math.max(0, E.daysBetween(t, START));

/* ---------- the schedule ---------- */
const isSun = d => E.parse(d).getDay() === 0;
// v6.1: settings.path {tokens, best, rest:[dates], vanguard, warned:{milestone: date}}
export const cfg = () => { const s = S.settings; s.path = s.path || {}; const c = s.path; c.tokens = c.tokens || 0; c.best = c.best || 0; c.rest = c.rest || []; c.warned = c.warned || {}; return c; };
const touch = () => { S.settings.u = Date.now(); };
// A rest day (from a rest token) is off like a Sunday: nothing issued, nothing scheduled, no slip.
export const isRest = d => cfg().rest.includes(d);
const off = d => isSun(d) || isRest(d);
const restBefore = d => cfg().rest.filter(r => r >= START && r < d && !isSun(r)).length;
// Working days in [START, d): the index of the item scheduled on d.
export function schedIdx(d) {
  if (d <= START) return 0;
  const n = E.daysBetween(START, d), w = Math.floor(n / 7), r = n % 7;
  return w * 6 + Math.min(r, 6) - restBefore(d); // START is a Monday, so day 6 of each week is the Sunday
}
export function schedDate(idx) {
  let d = START, i = 0;
  for (let k = 0; k < 800; k++, d = E.addDays(d, 1)) { if (off(d)) continue; if (i === idx) return d; i++; }
  return d;
}

/* ---------- progress ---------- */
const logOf = s => live("path").filter(r => r.stream === s && !r.sun && r.kind !== "gate");
export const pos = s => logOf(s).reduce((a, r) => Math.max(a, r.idx + 1), 0);
export const item = (s, idx) => (WEEK[s] || [])[idx] || null;
export const length = s => (WEEK[s] || []).length;
export const pathTasks = () => live("tasks").filter(k => k.path && stream(k.path.stream));
// An item started with Go ahead, while its time runs (plus 30 min to report).
export function running(now = new Date()) {
  const t = E.ymd(now), m = now.getHours() * 60 + now.getMinutes();
  return pathTasks().find(k => !k.done && k.pin && k.pin.date === t && (() => { const [h, mm] = k.pin.start.split(":").map(Number), s = h * 60 + mm; return m >= s && m < s + k.mins + 30; })()) || null;
}
export const openTask = s => pathTasks().find(k => !k.done && k.path.stream === s && !k.path.sun);
// Scheduled through today (today's own item counts once the day is over).
export function standing(s, t = E.today()) {
  const p = pos(s), si = schedIdx(t), due = si + (started(t) && !off(t) ? 1 : 0);
  return { pos: p, ahead: Math.max(0, p - due), behind: started(t) ? Math.max(0, si - p) : 0 };
}
// Home's single line: the worst stream if any is behind, else how far the whole Path is ahead.
export function summary(t = E.today()) {
  const st = STREAMS.map(s => ({ s, ...standing(s.id, t) })).filter(x => length(x.s.id));
  const worst = st.slice().sort((a, b) => b.behind - a.behind)[0];
  if (worst && worst.behind) return { behind: worst.behind, stream: worst.s };
  return { ahead: Math.min(...st.map(x => x.ahead)) };
}

/* ---------- Arcs (v6 §8): items open 5 at a time ---------- */
export const ARC = 5;
// The open Arc: its number (from 1), how many of its items are done, and the items themselves.
export function arc(s) {
  const p = pos(s), a = Math.floor(Math.min(p, Math.max(0, length(s) - 1)) / ARC), from = a * ARC;
  const items = [];
  for (let i = from; i < Math.min(from + ARC, length(s)); i++) items.push({ idx: i, t: item(s, i).t, done: i < p, cur: i === p });
  return { n: a + 1, done: items.filter(x => x.done).length, size: items.length, items };
}
// True when finishing this item closes its Arc.
export const closesArc = idx => (idx + 1) % ARC === 0;

/* ---------- issuing ---------- */
const xpFor = mins => 5 + Math.round(mins / 3); // 15m: 10, 30m: 15, 45m: 20
function taskFor(s, idx, t, extra = {}) {
  const st = stream(s), it = item(s, idx);
  return { id: `path-${s}-${idx}`, title: `${st.label} · ${it.t}`, mins: st.mins, prio: 2, due: t, done: false, created: Date.now(), pin: null, path: { stream: s, idx, issued: t }, ...extra };
}
// Run on open and every minute. Returns true when anything changed.
export function issue(t = E.today()) {
  if (!ready()) return false;
  let changed = false;
  // v8: an unfinished item from a stream that left the Path (Japanese) is withdrawn; finished ones stay.
  for (const k of live("tasks")) if (k.path && !stream(k.path.stream) && !k.done) { remove("tasks", k.id); changed = true; }
  if (!started(t)) return changed;
  if (isRest(t)) return false;
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
    if (p >= length(s.id) || openTask(s.id) || gate(s.id)) continue;
    if (S.tasks.some(x => x.path && !x.path.sun && x.path.stream === s.id && x.path.issued === t)) continue; // one a day
    const k = taskFor(s.id, p, t), old = S.tasks.find(x => x.id === k.id);
    if (old && !old.del) continue;
    put("tasks", k); changed = true;
  }
  return changed;
}
// Go ahead: the stream's next item, pinned to start now.
export function goAhead(s, now = new Date()) {
  if (!ready() || openTask(s) || gate(s)) return null;
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

/* ---------- Gate Tests (v6 §8): after every 3rd Arc ---------- */
export const TESTED = ["case", "aptitude", "accounting", "sapmurex"];
export const GATE_EVERY = 3 * ARC, GATE_Q = 15, GATE_PASS = 0.7, RETAKE_MS = 24 * 3600e3, XP_GATE = 60, XP_GATE_TOP = 30;
// Question banks written so far (data/path/gates/<stream>-<n>.json). A gate without a bank doesn't block.
export const BANKS = { case: [1], aptitude: [1], accounting: [1], sapmurex: [1] };
const attempts = (s, g) => live("path").filter(r => r.kind === "gate" && r.stream === s && r.gate === g);
export const gatePassed = (s, g) => attempts(s, g).some(r => r.passed);
// The Gate holding this stream, if any. retakeAt: when a failed Gate opens again.
export function gate(s) {
  const p = pos(s); if (!TESTED.includes(s) || !p || p % GATE_EVERY || p >= length(s)) return null;
  const g = p / GATE_EVERY; if (!(BANKS[s] || []).includes(g) || gatePassed(s, g)) return null;
  const tries = attempts(s, g).sort((a, b) => b.at - a.at);
  return { stream: s, gate: g, retakeAt: tries.length ? tries[0].at + RETAKE_MS : 0, tries: tries.length, last: tries[0] || null };
}
export const gates = () => STREAMS.map(s => gate(s.id)).filter(Boolean);
export async function loadBank(s, g) { return (await fetch(`data/path/gates/${s}-${g}.json`)).json(); }
// A fresh draw of 15 each attempt.
export function draw(bank) {
  const qs = bank.questions.map((q, i) => ({ ...q, _i: i }));
  for (let i = qs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [qs[i], qs[j]] = [qs[j], qs[i]]; }
  return qs.slice(0, GATE_Q);
}
// Records the attempt. Misses become flashcards in "<stream> mistakes". Returns {ok, n, passed, xp}.
export function gradeGate(s, g, qs, ans, newCard) {
  const ok = qs.filter((q, i) => ans[i] === q.a).length, n = qs.length, passed = ok / n >= GATE_PASS - 1e-9, at = Date.now();
  put("path", { id: `gate-${s}-${g}-${at}`, kind: "gate", stream: s, gate: g, score: ok, n, passed, date: E.today(), at });
  const deck = stream(s).label + " mistakes";
  qs.forEach((q, i) => {
    if (ans[i] === q.a) return;
    const id = `pg-${s}-${g}-${q._i}`; if (live("cards").some(c => c.id === id)) return;
    put("cards", newCard({ id, deck, front: q.q, back: q.opts[q.a] + (q.ex ? " · " + q.ex : "") }));
  });
  let xp = 0; const ref = `gate:${s}:${g}`;
  if (passed && !live("xpEvents").some(e => e.ref === ref)) {
    xp = XP_GATE + (ok / n >= 0.9 ? XP_GATE_TOP : 0);
    put("xpEvents", { ts: at, type: "gate", xp, ref, label: `Gate cleared: ${stream(s).label}` });
  }
  return { ok, n, passed, xp };
}

/* ---------- rewards for being ahead (v6 §3) ---------- */
export const MAX_TOKENS = 3, VANGUARD_AT = 7;
// Each new full day the whole Path gains (every stream one more ahead) banks a rest token. Returns what was earned.
export function checkAhead(t = E.today()) {
  if (!ready() || !started(t)) return null;
  const c = cfg(), a = summary(t).ahead || 0, out = {};
  if (a > c.best) { const add = Math.min(MAX_TOKENS - c.tokens, a - c.best); c.best = a; if (add > 0) { c.tokens += add; out.tokens = add; } touch(); }
  if (a >= VANGUARD_AT && !c.vanguard) { c.vanguard = t; touch(); out.vanguard = true; }
  return out.tokens || out.vanguard ? out : null;
}
// Spends a token on a day (today or later): nothing issued, no slip. Today's open items wait for tomorrow.
export function rest(d = E.today()) {
  const c = cfg(); if (c.tokens < 1 || c.rest.includes(d) || isSun(d)) return false;
  c.tokens--; c.rest.push(d); touch(); return true;
}

/* ---------- at-risk warnings: fixed dates that depend on a stream ---------- */
export const FIXED = [
  { id: "boki3", name: "Boki 3級 CBT", date: "2026-12-12", stream: "accounting" },
  { id: "boki2", name: "Boki 2級 CBT", date: "2027-05-29", stream: "accounting" },
];
// Items the plan has done before the date, against when this stream gets there at one item a working day.
export function projection(m, t = E.today()) {
  // The plan's own dates (the PDF started 3 days earlier than the Path), so a late start shows as risk.
  const need = (WEEK[m.stream] || []).filter(x => x.date < m.date).length, left = need - pos(m.stream);
  if (left <= 0) return { ok: true, late: 0 };
  let d = started(t) ? t : START, n = 0;
  const open = openTask(m.stream);
  if (started(t) && (off(d) || (!open && S.tasks.some(x => x.path && !x.path.sun && x.path.stream === m.stream && x.path.issued === t)))) d = E.addDays(d, 1);
  for (let k = 0; k < 800; k++, d = E.addDays(d, 1)) { if (off(d)) continue; n++; if (n >= left) break; }
  const late = Math.max(0, E.daysBetween(m.date, d) + 1);
  return { ok: !late, late, finish: d };
}
// The one warning to show now: a dated milestone within 45 days that this stream would miss, not shown in the last 7 days.
export function risk(t = E.today()) {
  if (!ready() || !started(t)) return null;
  const c = cfg();
  for (const m of FIXED) {
    const days = E.daysBetween(t, m.date); if (days < 0 || days > 45) continue;
    const w = c.warned[m.id]; if (w && E.daysBetween(w, t) < 7) continue;
    const pr = projection(m, t); if (!pr.ok) return { m, ...pr };
  }
  return null;
}
export function seeRisk(id) { cfg().warned[id] = E.today(); touch(); }

/* ---------- v6.2: Floors and Raids ---------- */
// A Floor is the plan's phase by calendar date. Only the current one is ever shown; the next stays unnamed.
export function floor(t = E.today()) {
  let f = FLOORS[0] || null;
  for (const x of FLOORS) if (x.from <= t) f = x;
  return f ? { ...f, total: FLOORS.length, last: f.n === FLOORS.length } : null;
}
// The Floor reveal window: a Floor not yet seen (Floor 1 is part of the awakening).
export function newFloor(t = E.today()) {
  if (!ready() || !started(t)) return null;
  const f = floor(t), c = cfg(); return f && f.n > (c.floor || 1) ? f : null;
}
export function seeFloor(n) { cfg().floor = n; touch(); }
// Raids: the plan's milestones on their real dates. One appears 14 days before and stays 3 days after, until cleared.
export const RAID_AHEAD = 14, RAID_AFTER = 3, XP_RAID = 40, XP_RAID_BIG = 100;
const raidLog = id => live("path").find(r => r.kind === "raid" && r.id === id);
export const raidCleared = id => !!raidLog(id);
export function raids(t = E.today()) {
  return RAIDS.filter(r => E.daysBetween(t, r.date) <= RAID_AHEAD).map(r => ({ ...r, days: E.daysBetween(t, r.date), cleared: raidCleared(r.id) }));
}
// Open Raids for Home and the Path page, soonest first.
export const openRaids = (t = E.today()) => started(t) ? raids(t).filter(r => !r.cleared && r.days >= -RAID_AFTER).sort((a, b) => a.days - b.days) : [];
export function clearRaid(id, t = E.today()) {
  const r = RAIDS.find(x => x.id === id); if (!r || raidCleared(id)) return 0;
  const xp = r.big ? XP_RAID_BIG : XP_RAID, at = Date.now();
  put("path", { id, kind: "raid", date: t, at, xp, name: r.name });
  put("xpEvents", { ts: at, type: "raid", xp, ref: "path:" + id, label: "Raid cleared: " + r.name });
  return xp;
}
export function unclearRaid(id) {
  const r = raidLog(id); if (!r) return;
  remove("path", id); E.revokeXP("path:" + id);
}
