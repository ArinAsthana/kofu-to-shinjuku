// Timetable, auto-planner and wind-down. Derived only: blocks and tasks are stored, placements are computed.
// Times are minutes since midnight. A block whose end is at or before its start runs past midnight.

import { S, live } from "./store.js";
import * as E from "./engine.js";

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const KINDS = {
  class: { label: "Class", c: "ind" }, work: { label: "Work", c: "org" }, sleep: { label: "Sleep", c: "dim" },
  nap: { label: "Nap", c: "dim" }, quest: { label: "Quest", c: "lime" }, club: { label: "Club", c: "mag" }, social: { label: "Social", c: "mag" },
  other: { label: "Other", c: "cyan" },
};
export const TASK_LEN = [15, 30, 45, 60, 90, 120, 180];

export const toMin = hm => { const [h, m] = String(hm || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export const toHM = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return E.pad(Math.floor(m / 60)) + ":" + E.pad(m % 60); };
export const dur = m => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? " " + (m % 60) + "m" : ""}` : m + "m";
const dow = date => E.parse(date).getDay();
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

// `skip` lists dates a weekly block is off (a one-day move puts a dated copy elsewhere).
const blockOn = (b, date) => b.date ? b.date === date : (b.days || []).includes(dow(date)) && !(b.skip || []).includes(date);

// Every stretch a block covers on this date, including the tail of yesterday's overnight block.
export function segments(date) {
  const out = [], prev = E.addDays(date, -1);
  for (const b of live("blocks")) {
    const s = toMin(b.start), e = toMin(b.end), over = e <= s;
    if (blockOn(b, date)) out.push({ b, s, e: over ? 1440 : e, cont: over });
    if (over && e > 0 && blockOn(b, prev)) out.push({ b, s: 0, e, tail: true });
  }
  return out.sort((x, y) => x.s - y.s || x.e - y.e);
}

/* ---------- block gates ---------- */
// Workout blocks open the workout log. Matched by title so renamed or added gym blocks still count.
export const isWorkout = b => /lift|calisth|gym|workout|train|run\b/i.test(b.title || "");
// Today's occurrences of a block (a one-day moved copy counts for its original).
const occToday = b => segments(E.today()).filter(g => !g.tail && (g.b.id === b.id || g.b.from === b.id || (b.from && g.b.id === b.from)));
// A block can't be changed from lockMins before today's start until it ends, so the schedule can't dodge a session.
export function editLock(b) {
  if (!b || !b.id) return null;
  const st = S.settings.plan || {}, n = nowMin(), lock = st.lockMins ?? 15;
  // Quest blocks stay locked through the report window too, so a skipped block can't be deleted to dodge its penalty.
  const after = b.kind === "quest" ? (S.settings.study?.grace ?? 60) : 0;
  const g = occToday(b).find(g => n >= g.s - lock && n < g.e + after);
  return g ? { s: g.s, e: g.e, until: g.e + after } : null;
}
// Is the workout log open right now? Open from openPad before a workout block to openPad after it,
// and stays open all day once a set is logged.
export function trainGate(started) {
  const t = E.today(), n = nowMin(), pad = (S.settings.plan || {}).openPad ?? 10;
  const segs = segments(t).filter(g => isWorkout(g.b) && !g.tail);
  const cur = segs.find(g => n >= g.s - pad && n < g.e + pad);
  if (cur) return { open: true, block: cur.b, s: cur.s, e: cur.e };
  if (started) return { open: true, started: true };
  for (let i = 0; i < 8; i++) {
    const d = E.addDays(t, i), nx = segments(d).filter(g => isWorkout(g.b) && !g.tail && (i > 0 || g.s - pad > n)).sort((a, b) => a.s - b.s)[0];
    if (nx) return { open: false, next: { date: d, s: nx.s - pad, b: nx.b } };
  }
  return { open: false };
}

/* ---------- wind-down ---------- */
// One hour (setting) before each sleep block that starts on or after this date's evening.
// Skipped when that time falls inside work, e.g. the 06:30 sleep after a night shift.
export function windDownOn(date) {
  const wd = S.settings.windDown || {}; if (wd.on === false) return null;
  const mins = wd.mins ?? 60;
  // Bedtime for "tonight" is a sleep block on this date starting late evening, or tomorrow's early-morning one.
  const cands = [];
  for (const b of live("blocks").filter(b => b.kind === "sleep")) {
    const s = toMin(b.start);
    if (blockOn(b, date) && s >= 18 * 60) cands.push({ date, s });
    if (blockOn(b, E.addDays(date, 1)) && s < 6 * 60) cands.push({ date: E.addDays(date, 1), s });
  }
  if (!cands.length) return null;
  const c = cands.sort((a, b) => (a.date + String(a.s).padStart(4, "0")).localeCompare(b.date + String(b.s).padStart(4, "0")))[0];
  let at = c.s - mins, atDate = c.date;
  if (at < 0) { at += 1440; atDate = E.addDays(c.date, -1); }
  if (segments(atDate).some(g => g.b.kind === "work" && at >= g.s && at < g.e)) return null;
  return { date: atDate, at, bed: c.s, bedDate: c.date };
}
// The wind-down that is active right now, if any.
export function windDownNow() {
  const t = E.today(), n = nowMin();
  for (const d of [E.addDays(t, -1), t]) {
    const w = windDownOn(d); if (!w) continue;
    const start = (w.date === t ? 0 : -1440) + w.at, end = (w.bedDate === t ? 0 : w.bedDate > t ? 1440 : -1440) + w.bed;
    if (n >= start && n < end) return w;
  }
  return null;
}

/* ---------- auto-planner ---------- */
// Free time on a date: the waking window minus every block, wind-down and pinned task.
function freeOn(date, taken, from) {
  const st = S.settings.plan || {}, lo = Math.max(toMin(st.dayStart || "07:00"), from || 0), hi = toMin(st.dayEnd || "23:30");
  const pad = st.buffer ?? 10, busy = segments(date).map(g => [g.s - pad, g.e + pad]).concat(taken[date] || []);
  const w = windDownOn(date); if (w && w.date === date) busy.push([w.at, 1440]);
  busy.sort((a, b) => a[0] - b[0]);
  const free = []; let cur = lo;
  for (const [s, e] of busy) { if (s > cur) free.push([cur, Math.min(s, hi)]); cur = Math.max(cur, e); if (cur >= hi) break; }
  if (cur < hi) free.push([cur, hi]);
  return free.filter(([s, e]) => e - s >= 15);
}
// v9.1: Night watch. On a shift night the shift work is done by 00:00, so 00:00 to the shift's end is study time.
export const isNightShift = b => b.kind === "work" && /shift/i.test(b.title || "");
export function nightWatch(date) { const g = segments(date).find(x => x.tail && isNightShift(x.b)); return g ? { s: 0, e: g.e, b: g.b } : null; }
// Night watch takes focus work only: Path items and high-energy tasks.
const watchTask = k => !!k.path || k.energy === "high";
function watchFree(date, taken, from) {
  const nw = nightWatch(date); if (!nw) return [];
  const busy = (taken[date] || []).slice().sort((a, b) => a[0] - b[0]), free = []; let cur = Math.max(nw.s, from || 0);
  for (const [s, e] of busy) { if (s > cur) free.push([cur, Math.min(s, nw.e)]); cur = Math.max(cur, e); if (cur >= nw.e) break; }
  if (cur < nw.e) free.push([cur, nw.e]);
  return free.filter(([s, e]) => e - s >= 15);
}
// Focus tasks stay out of the 8 hours after a night shift ends (post-shift fog) and must finish by 22:00.
// Night watch itself (v9.1) is the exception: that is when the focus work happens.
function tooTired(date, s, e) {
  const nw = nightWatch(date); if (nw && s >= nw.s && e <= nw.e) return false;
  if (e > 22 * 60) return true;
  return segments(date).some(g => g.b.kind === "work" && g.tail && s < g.e + 8 * 60);
}
const snap = m => Math.ceil(m / 15) * 15;
// v11.5: a workout task (a skipped Lift's penalty quest, say) only fits while the gym is open, never in Night watch.
export const GYM = [9 * 60, 20 * 60];
const gymTask = k => isWorkout(k);
const gymFree = L => L.map(([s, e]) => [Math.max(s, GYM[0]), Math.min(e, GYM[1])]).filter(([s, e]) => e - s >= 15);

const order = (a, b) => (a.due || "9999").localeCompare(b.due || "9999") || (b.prio || 2) - (a.prio || 2) || (a.created || 0) - (b.created || 0);

// Places every open task into the next 14 days, earliest slot first, by deadline then priority.
// Returns Map(taskId -> {date, s, e, late}) and the list of tasks that found no slot.
export function plan() {
  const t = E.today(), n = snap(nowMin() + 5), taken = {}, out = new Map(), unplaced = [];
  const open = live("tasks").filter(x => !x.done && x.kind !== "deadline"); // v9.2: a deadline is a marker, not work
  for (const k of open.filter(x => x.pin && x.pin.date >= t)) {
    const s = toMin(k.pin.start); (taken[k.pin.date] = taken[k.pin.date] || []).push([s, s + k.mins]);
    out.set(k.id, { date: k.pin.date, s, e: s + k.mins, pinned: true, late: k.due && k.pin.date > k.due });
  }
  for (const k of open.filter(x => !(x.pin && x.pin.date >= t)).sort(order)) {
    let spot = null;
    for (let i = 0; i < 14 && !spot; i++) {
      const date = E.addDays(t, i);
      if (k.after && date < k.after) continue; // v9.2: a prep session waits for its start day
      const gym = gymTask(k), slots = [...(watchTask(k) && !gym ? watchFree(date, taken, i === 0 ? n : 0) : []), ...freeOn(date, taken, i === 0 ? n : 0)];
      for (const [fs, fe] of gym ? gymFree(slots) : slots) {
        let s = snap(fs);
        while (s + k.mins <= fe) { if (k.energy !== "high" || !tooTired(date, s, s + k.mins)) { spot = { date, s, e: s + k.mins }; break; } s += 15; }
        if (spot) break;
      }
    }
    if (!spot) { unplaced.push(k); continue; }
    (taken[spot.date] = taken[spot.date] || []).push([spot.s, spot.e]);
    out.set(k.id, { ...spot, late: !!(k.due && spot.date > k.due) });
  }
  return { at: out, unplaced };
}

// Everything on a date, in order: blocks, planned tasks, wind-down.
export function agenda(date, p = plan()) {
  const rows = segments(date).map(g => ({ type: "block", s: g.s, e: g.e, b: g.b, tail: g.tail, cont: g.cont }));
  for (const k of live("tasks").filter(x => !x.done)) { const at = p.at.get(k.id); if (at && at.date === date) rows.push({ type: "task", s: at.s, e: at.e, k, at }); }
  const w = windDownOn(date); if (w && w.date === date) rows.push({ type: "wind", s: w.at, e: w.at, w });
  return rows.sort((a, b) => a.s - b.s || (a.type === "block" ? -1 : 1));
}
export function nowNext() {
  const t = E.today(), n = nowMin(), rows = agenda(t);
  return { now: rows.find(r => r.type !== "wind" && r.s <= n && n < r.e), next: rows.find(r => r.s > n) };
}

/* ---------- calendar export ---------- */
const ICS_DAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const icsEsc = s => String(s).replace(/[\\;,]/g, m => "\\" + m).replace(/\n/g, "\\n");
const icsDT = (date, m) => date.replace(/-/g, "") + "T" + toHM(m).replace(":", "") + "00";
// First date on or after `from` that falls on one of `days`.
const firstOn = (from, days) => { for (let i = 0; i < 7; i++) { const d = E.addDays(from, i); if (days.includes(dow(d))) return d; } return from; };

export function ics() {
  const t = E.today(), stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z", L = [];
  const ev = (uid, title, date, s, e, extra = []) => {
    const endDate = e <= s || e >= 1440 ? E.addDays(date, 1) : date;
    L.push("BEGIN:VEVENT", "UID:" + uid + "@kofu-to-shinjuku", "DTSTAMP:" + stamp, "SUMMARY:" + icsEsc(title),
      "DTSTART;TZID=Asia/Tokyo:" + icsDT(date, s), "DTEND;TZID=Asia/Tokyo:" + icsDT(endDate, e), ...extra, "END:VEVENT");
  };
  const alarm = ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Wind down", "TRIGGER:PT0M", "END:VALARM"];
  for (const b of live("blocks")) {
    if (b.date) { ev("block-" + b.id, b.title, b.date, toMin(b.start), toMin(b.end)); continue; }
    if (!(b.days || []).length) continue;
    ev("block-" + b.id, b.title, firstOn(t, b.days), toMin(b.start), toMin(b.end), ["RRULE:FREQ=WEEKLY;BYDAY=" + b.days.map(d => ICS_DAY[d]).join(","), ...(b.skip || []).map(d => "EXDATE;TZID=Asia/Tokyo:" + icsDT(d, toMin(b.start)))]);
  }
  // Wind-down: one recurring event per distinct time, so it keeps working after this week.
  const byTime = {};
  for (let i = 0; i < 7; i++) { const w = windDownOn(E.addDays(t, i)); if (w) (byTime[w.at] = byTime[w.at] || new Set()).add(dow(w.date)); }
  for (const [at, set] of Object.entries(byTime)) {
    const days = [...set], m = +at;
    ev("wind-" + m, "Wind down: screens off, prep for bed", firstOn(t, days), m, m + (S.settings.windDown?.mins ?? 60), ["RRULE:FREQ=WEEKLY;BYDAY=" + days.map(d => ICS_DAY[d]).join(","), ...alarm]);
  }
  const p = plan();
  for (const k of live("tasks").filter(x => !x.done)) { const at = p.at.get(k.id); if (at) ev("task-" + k.id + "-" + at.date + "-" + at.s, k.title, at.date, at.s, at.e); }
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kofu to Shinjuku//Planner//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Timetable", "X-WR-TIMEZONE:Asia/Tokyo",
    "BEGIN:VTIMEZONE", "TZID:Asia/Tokyo", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0900", "TZOFFSETTO:+0900", "TZNAME:JST", "END:STANDARD", "END:VTIMEZONE",
    ...L, "END:VCALENDAR"].join("\r\n");
}

// Google Calendar links for the wind-down, one per distinct time. Opens the add-event screen with weekly repeat.
export function windDownLinks() {
  const t = E.today(), byTime = {};
  for (let i = 0; i < 7; i++) { const w = windDownOn(E.addDays(t, i)); if (w) (byTime[w.at] = byTime[w.at] || new Set()).add(dow(w.date)); }
  return Object.entries(byTime).map(([at, set]) => {
    const days = [...set].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)), m = +at, d = firstOn(t, days);
    const end = m + (S.settings.windDown?.mins ?? 60), endDate = end >= 1440 ? E.addDays(d, 1) : d;
    const q = new URLSearchParams({ action: "TEMPLATE", text: "Wind down: screens off, prep for bed", dates: icsDT(d, m) + "/" + icsDT(endDate, end), ctz: "Asia/Tokyo", recur: "RRULE:FREQ=WEEKLY;BYDAY=" + days.map(x => ICS_DAY[x]).join(",") });
    return { at: m, days, url: "https://calendar.google.com/calendar/render?" + q };
  });
}
