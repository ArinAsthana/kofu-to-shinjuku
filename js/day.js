// v9: the day loop. The Fall Semester timetable, the day's list for the Today window, finance items for class gaps,
// and the Outreach slot. Derived from blocks and the Path; the only writes are the one-time timetable upgrade.

import { S, live, put, remove, snapshot } from "./store.js";
import * as E from "./engine.js";
import * as P from "./planner.js";
import * as Pa from "./path.js";
import * as Soc from "./social.js";

/* ---------- the timetable (v9 §0) ---------- */
// Class days are Mon and Wed. Fixed ids, so two phones running the upgrade never duplicate a block.
const cls = (id, title, room, days, start, end) => ({ id: "tt9-" + id, title, room, kind: "class", days, date: null, start, end, locked: true });
export const TIMETABLE = [
  cls("p1", "Intro to Language Concepts", "87 Lecture Theater", [1, 3], "09:00", "10:15"),
  cls("p2", "College Algebra", "Crystal Tower 4", [1, 3], "10:25", "11:40"),
  cls("koto", "Workshop: Japanese Koto", "87 Music Studio", [3], "12:40", "15:20"),
  cls("p5", "Social Psychology", "Crystal Tower 4", [1, 3], "15:30", "16:45"),
  cls("p6", "Science, Society & Self", "Crystal Tower 4", [1, 3], "16:55", "18:10"),
];
export const OUTREACH = { id: "tt9-outreach", title: "Outreach", kind: "other", days: [1, 2, 3], date: null, start: "18:20", end: "18:50", locked: false };
// Seed blocks the semester replaces or moves. Edited times are overwritten on purpose: this is the new week.
const MOVES = {
  "seed-lift-mon": { start: "12:40", end: "14:10" },
  "seed-fin-mon": { start: "14:20", end: "15:20" },
  "seed-music": { title: "Music Club", days: [2], start: "19:00", end: "21:00" },
};
const OLD_CLASSES = ["seed-class-mon-am", "seed-class-mon-pm", "seed-class-wed"];
export async function upgradeTimetable() {
  const st = S.settings; if (st.tt9) return false;
  await snapshot("v9-timetable");
  const all = S.blocks;
  for (const id of OLD_CLASSES) if (all.some(b => b.id === id && !b.del)) remove("blocks", id);
  for (const b of [...TIMETABLE, OUTREACH]) if (!all.some(x => x.id === b.id)) put("blocks", { ...b, days: b.days.slice() });
  for (const [id, ch] of Object.entries(MOVES)) {
    const b = all.find(x => x.id === id && !x.del);
    if (b) put("blocks", { ...b, ...ch });
    else if (id === "seed-music") put("blocks", { id, title: "Music Club", kind: "club", days: [2], date: null, start: "19:00", end: "21:00", locked: true });
  }
  // Night shifts: Mon and Thu 22:00–06:00, unless a work block already covers them.
  const shift = d => live("blocks").some(b => b.kind === "work" && (b.days || []).includes(d) && P.toMin(b.start) >= 21 * 60);
  if (!shift(1) || !shift(4)) put("blocks", { id: "tt9-shift", title: "FamilyMart night shift", kind: "work", days: [1, 4].filter(d => !shift(d)), date: null, start: "22:00", end: "06:00", locked: true });
  st.tt9 = E.today(); st.u = Date.now();
  return true;
}

/* ---------- the day ---------- */
const segs = t => P.segments(t).filter(g => !g.tail || g.b.kind === "work");
export const isClassDay = (t = E.today()) => P.segments(t).some(g => !g.tail && g.b.kind === "class");
const FIN = ["accounting", "sapmurex", "case"];
// The one Path item that fits a class gap: Accounting first, then SAP/Murex, then Case. {s, label, k?, t}
export function gapItem() {
  if (!Pa.ready() || !Pa.started()) return null;
  for (const s of FIN) {
    if (!Pa.length(s) || Pa.gate(s)) continue;
    const st = Pa.stream(s), k = Pa.openTask(s);
    if (k) return { s, label: st.label, k, t: k.title.slice(st.label.length + 3), mins: k.mins };
    const it = Pa.item(s, Pa.pos(s)); if (it) return { s, label: st.label, t: it.t, mins: st.mins };
  }
  return null;
}
// Free stretches between the first and last class of a class day (nothing else planned there), 15 min or more.
// 30 min or more gets a finance item; shorter ones get Japanese.
export function classGaps(t = E.today()) {
  const g = P.segments(t).filter(x => !x.tail), cl = g.filter(x => x.b.kind === "class");
  if (!cl.length) return [];
  const from = Math.min(...cl.map(x => x.s)), to = Math.max(...cl.map(x => x.e)), busy = g.filter(x => x.e > from && x.s < to).sort((a, b) => a.s - b.s), out = [];
  let cur = from;
  for (const x of busy) { if (x.s - cur >= 15) out.push({ s: cur, e: x.s }); cur = Math.max(cur, x.e); }
  return out.map(x => ({ ...x, fin: x.e - x.s >= 30 }));
}
// The gap Arin is in right now, if any.
export function gapNow(now = new Date()) {
  const m = now.getHours() * 60 + now.getMinutes();
  return classGaps(E.ymd(now)).find(x => m >= x.s && m < x.e) || null;
}
// Outreach goals: today's Applications item, plus the open People Trial.
export function outreachGoals() {
  const out = [];
  if (Pa.ready() && Pa.started() && Pa.length("apps")) {
    const k = Pa.openTask("apps"), it = !k && !Pa.gate("apps") ? Pa.item("apps", Pa.pos("apps")) : null;
    if (k || it) out.push({ kind: "apps", k, t: k ? k.title.slice(Pa.stream("apps").label.length + 3) : it.t, done: k ? !!k.done : false });
  }
  const tr = Soc.openTrials()[0]; if (tr) out.push({ kind: "trial", k: tr, t: tr.title, done: false });
  return out;
}
export const outreachNow = (now = new Date()) => { const m = now.getHours() * 60 + now.getMinutes(); return segs(E.ymd(now)).find(g => g.b.id === OUTREACH.id && m >= g.s && m < g.e) || null; };
export const inClass = (now = new Date()) => { const m = now.getHours() * 60 + now.getMinutes(); return P.segments(E.ymd(now)).some(g => g.b.kind === "class" && m >= g.s && m < g.e); };
// Today's list for the wake window: blocks in order (no sleep), with class gaps between.
export function dayList(t = E.today()) {
  const rows = segs(t).filter(g => !["sleep", "nap"].includes(g.b.kind)).map(g => ({ type: "block", s: g.s, e: g.e, b: g.b }));
  for (const x of classGaps(t)) rows.push({ type: "gap", ...x });
  return rows.sort((a, b) => a.s - b.s);
}

/* ---------- v9.1 §8: Night watch ---------- */
// 00:00 to the end of a night shift. Finance items one after another with Go ahead; 3 or more done earns a bonus once.
export const NW_BONUS = 30, NW_AT = 3;
export function watchNow(now = new Date()) {
  const t = E.ymd(now), nw = P.nightWatch(t), m = now.getHours() * 60 + now.getMinutes();
  return nw && m < nw.e ? { ...nw, date: t } : null;
}
// Path items finished during tonight's watch, and how many of them were ahead.
export function watchDone(t = E.today()) {
  const nw = P.nightWatch(t); if (!nw) return { n: 0, ahead: 0 };
  const from = E.parse(t).getTime(), to = from + nw.e * 60000;
  const ks = live("tasks").filter(k => k.path && k.done && k.doneAt >= from && k.doneAt < to + 30 * 60000);
  return { n: ks.length, ahead: ks.filter(k => live("path").some(r => r.id === k.id && r.ahead)).length };
}
// The items on offer: the next Accounting and SAP/Murex items.
export function watchItems() {
  if (!Pa.ready() || !Pa.started()) return [];
  return ["accounting", "sapmurex"].filter(s => Pa.length(s) && !Pa.gate(s)).map(s => {
    const st = Pa.stream(s), k = Pa.openTask(s), it = k ? null : Pa.item(s, Pa.pos(s));
    return k || it ? { s, label: st.label, k, t: k ? k.title.slice(st.label.length + 3) : it.t, mins: st.mins } : null;
  }).filter(Boolean);
}
export function watchBonus(t = E.today()) {
  const ref = "nw:" + t; if (watchDone(t).n < NW_AT || live("xpEvents").some(e => e.ref === ref)) return 0;
  put("xpEvents", { ts: Date.now(), type: "path", xp: NW_BONUS, ref, label: "Night watch" });
  return NW_BONUS;
}

/* ---------- v9 §9: the older decks ---------- */
// The Genki starter decks leave Study, reviews and the due count. Their cards and history stay; one tap restores them.
export const OLD_DECK = /^Genki L\d+$/;
export const archived = () => (S.settings.cards && S.settings.cards.archived) || [];
export function archiveOld() {
  const c = S.settings.cards = S.settings.cards || {}; if (c.arch9) return false;
  const decks = [...new Set(live("cards").filter(x => !x.lex && OLD_DECK.test(x.deck || "")).map(x => x.deck))];
  c.archived = [...new Set([...(c.archived || []), ...decks])]; c.arch9 = E.today(); S.settings.u = Date.now();
  return decks.length > 0;
}
export function restoreDeck(name) { const c = S.settings.cards; c.archived = (c.archived || []).filter(d => d !== name); S.settings.u = Date.now(); }

/* ---------- v9.3 §1: Going to bed ---------- */
// The widget logs each tap natively {bed, alarm, cls}; the app takes them on open. The latest tap is the night's bedtime
// (a second tap replaces the first). The first open after the alarm (from 30 min before) saves the wake time.
// Hours slept show on Profile only. Kept in settings.sleep {open, log}: no new store.
export const BED_XP = 10, SLEEP_LOG = 90;
const sl = () => (S.settings.sleep = S.settings.sleep || { open: null, log: [] });
// The planned bedtime for the evening of a tap (a tap after midnight belongs to the evening before).
function plannedBed(ms) {
  const d = E.ymd(new Date(ms - 12 * 3600000)), w = P.windDownOn(d);
  return w ? { d, at: E.parse(w.bedDate).getTime() + w.bed * 60000 } : null;
}
export function bedIn(list) {
  if (!list || !list.length) return 0;
  const s = sl(); let xp = 0;
  for (const x of list.slice().sort((a, b) => a.bed - b.bed)) {
    if (s.open && x.bed - s.open.bed > 3 * 3600000) closeNight(s.open, s.open.alarm); // an older night nobody woke from in the app
    s.open = { bed: x.bed, alarm: x.alarm };
    const pb = plannedBed(x.bed), ref = pb && "bed:" + pb.d;
    if (pb && Math.abs(x.bed - pb.at) <= 30 * 60000 && !live("xpEvents").some(e => e.ref === ref)) { put("xpEvents", { ts: Date.now(), type: "habit", xp: BED_XP, ref, label: "On time for bed" }); xp += BED_XP; }
  }
  S.settings.u = Date.now();
  return xp;
}
function closeNight(o, wake) {
  const s = sl(); s.log = [...s.log.filter(n => n.bed !== o.bed), { bed: o.bed, wake, alarm: o.alarm }].slice(-SLEEP_LOG); s.open = null;
}
// Call on every open. Returns the night just closed, or null.
export function wakeCheck(now = Date.now()) {
  const s = S.settings.sleep, o = s && s.open; if (!o || now < o.alarm - 30 * 60000) return null;
  closeNight(o, now > o.alarm + 6 * 3600000 ? o.alarm : now); S.settings.u = Date.now();
  return s.log[s.log.length - 1];
}
export const hours = n => (n.wake - n.bed) / 3600000;
export function sleepStats() {
  const L = ((S.settings.sleep || {}).log || []).filter(n => n.wake > n.bed).slice(-7);
  if (!L.length) return null;
  return { last: L[L.length - 1], avg: L.reduce((a, n) => a + hours(n), 0) / L.length, n: L.length };
}
