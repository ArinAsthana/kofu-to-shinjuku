// Derived numbers. Nothing here is stored: XP total, level, PRs, stalls, targets, trends.

import { S, live, put, remove } from "./store.js";
import { LIBRARY, RANGES, DEFAULT_INC, SLOTS, SPLIT, XP, LEVEL_XP, HABITS } from "./data.js";

/* ---------- dates ---------- */
export const pad = n => String(n).padStart(2, "0");
export const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const today = () => ymd(new Date());
export const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export function weekStart(s = today()) { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); }
export const weekDays = (s = today()) => [...Array(7)].map((_, i) => addDays(weekStart(s), i));
export function fmtDate(s) { return parse(s).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); }
export function isoWeek(s) {
  const d = parse(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  const n = 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  return d.getFullYear() + "-W" + pad(n);
}

/* ---------- XP ---------- */
export const xpTotal = () => live("xpEvents").reduce((a, e) => a + (e.xp || 0), 0);
export const level = () => Math.floor(xpTotal() / LEVEL_XP) + 1;
export const levelProgress = () => (xpTotal() % LEVEL_XP) / LEVEL_XP;

// Adds XP and rolls for a reward. Returns {xp, reward}.
export function gainXP(type, ref, label) {
  const amount = XP[type];
  const ev = put("xpEvents", { ts: Date.now(), type, xp: amount, ref, label });
  let reward = null;
  const pool = (S.settings.rewardPool || []).filter(Boolean);
  if (pool.length && Math.random() < (S.settings.rewardChance ?? 0.18)) {
    reward = pool[Math.floor(Math.random() * pool.length)];
    put("rewardHistory", { ts: Date.now(), reward, xpEventId: ev.id });
  }
  return { xp: amount, reward, label };
}
export function revokeXP(ref) { live("xpEvents").filter(e => e.ref === ref).forEach(e => remove("xpEvents", e.id)); }

/* ---------- habits ---------- */
export const habitDone = (habit, date) => live("habitLog").find(h => h.habit === habit && h.date === date);
export const habitWeekCount = (habit, s = today()) => { const w = weekDays(s); return live("habitLog").filter(h => h.habit === habit && w.includes(h.date)).length; };
export const habitTarget = id => S.settings.habitTargets[id] ?? HABITS.find(h => h.id === id)?.target;

// Logging any workout or run ticks the Workout habit and gives workout XP, once per day.
export function markWorkoutDay(date) {
  if (habitDone("gym", date)) return null;
  const h = put("habitLog", { date, habit: "gym", auto: true });
  return gainXP("workout", h.id, "Workout logged");
}

/* ---------- exercises ---------- */
export function allExercises() {
  const custom = live("exercises");
  const byId = new Map(LIBRARY.map(e => [e.id, { ...e }]));
  for (const c of custom) byId.set(c.id, { ...(byId.get(c.id) || {}), ...c });
  return [...byId.values()].filter(e => !e.hidden);
}
export const exById = id => allExercises().find(e => e.id === id) || { id, name: id, area: "core", kind: "load" };
export function range(ex) { const r = RANGES[ex.kind]; return [ex.repMin ?? r[0], ex.repMax ?? r[1]]; }
export const inc = ex => ex.inc ?? DEFAULT_INC;
export const unit = ex => ex.kind === "time" ? "s" : (ex.repLabel || "reps");

// All logged entries for an exercise, oldest first: [{date, workoutId, entry}]
export function history(exId) {
  const out = [];
  for (const w of live("workouts")) for (const e of w.entries || []) if (e.exercise === exId && e.sets && e.sets.length) out.push({ date: w.date, workoutId: w.id, entry: e });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// One comparable number per set. Load: estimated 1RM. Level/time: level first, then reps/seconds.
export function setScore(ex, s) {
  if (ex.kind === "load") return (s.load || 0) * (1 + (s.reps || 0) / 30);
  return (s.level || 0) * 1000 + (ex.kind === "time" ? s.secs || 0 : s.reps || 0);
}
export const bestScore = (ex, sets) => Math.max(0, ...sets.map(s => setScore(ex, s)));

export function fmtSet(ex, s) {
  if (ex.kind === "load") return `${s.load} kg × ${s.reps}`;
  const lv = ex.levels && ex.levels[s.level] ? ex.levels[s.level] + " " : "";
  return ex.kind === "time" ? `${lv}${s.secs}s` : `${lv}× ${s.reps}`;
}
export function fmtSets(ex, sets) {
  if (!sets.length) return "";
  if (ex.kind === "load") {
    const groups = [];
    for (const s of sets) { const g = groups[groups.length - 1]; if (g && g.load === s.load) g.reps.push(s.reps); else groups.push({ load: s.load, reps: [s.reps] }); }
    return groups.map(g => `${g.load} kg × ${g.reps.join(", ")}`).join(" · ");
  }
  return sets.map(s => fmtSet(ex, s)).join(", ");
}

// Last session before `beforeDate` (exclusive), or the latest overall.
export function lastSession(exId, beforeDate) {
  const h = history(exId).filter(x => !beforeDate || x.date < beforeDate);
  return h.length ? h[h.length - 1] : null;
}

// Double progression. Returns {sets:[...], text} or null when there's no history.
export function nextTarget(ex, beforeDate) {
  const last = lastSession(ex.id, beforeDate);
  if (!last) return null;
  const [lo, hi] = range(ex);
  const sets = last.entry.sets;
  if (ex.kind === "load") {
    const top = Math.max(...sets.map(s => s.load || 0));
    const work = sets.filter(s => (s.load || 0) === top);
    if (work.every(s => s.reps >= hi)) {
      const load = +(top + inc(ex)).toFixed(2);
      return { sets: work.map(() => ({ load, reps: lo })), text: `${load} kg × ${lo} for ${work.length} sets (all sets hit ${hi} last time)` };
    }
    const reps = work.map(s => s.reps);
    const i = reps.indexOf(Math.min(...reps)); reps[i] = Math.min(hi, reps[i] + 1);
    return { sets: reps.map(r => ({ load: top, reps: r })), text: `${top} kg × ${reps.join(", ")} (one more rep on the weakest set)` };
  }
  const key = ex.kind === "time" ? "secs" : "reps";
  const step = ex.kind === "time" ? 5 : 1;
  const topLv = Math.max(...sets.map(s => s.level || 0));
  const work = sets.filter(s => (s.level || 0) === topLv);
  const maxLv = (ex.levels || [""]).length - 1;
  if (work.every(s => s[key] >= hi) && topLv < maxLv) {
    const name = ex.levels[topLv + 1];
    return { sets: work.map(() => ({ level: topLv + 1, [key]: lo })), text: `Move up to ${name}: ${work.length} × ${lo}${ex.kind === "time" ? "s" : ""}` };
  }
  const vals = work.map(s => s[key]);
  // At the last level there's nowhere to move up, so keep adding past the top of the range.
  const lastLevelDone = work.every(s => s[key] >= hi);
  const i = vals.indexOf(Math.min(...vals)); vals[i] = lastLevelDone ? vals[i] + step : Math.min(hi, vals[i] + step);
  const lvName = ex.levels && ex.levels[topLv] ? ex.levels[topLv] + ": " : "";
  return { sets: vals.map(v => ({ level: topLv, [key]: v })), text: `${lvName}${vals.join(", ")}${ex.kind === "time" ? "s" : ""} (${ex.kind === "time" ? "5s more" : "one more rep"} on the weakest set)` };
}

// Stalled = the best of the last 2 training weeks is no better than the best before them.
export function stallInfo(exId) {
  const ex = exById(exId);
  const byWeek = new Map();
  for (const h of history(exId)) {
    const w = isoWeek(h.date);
    byWeek.set(w, Math.max(byWeek.get(w) || 0, bestScore(ex, h.entry.sets)));
  }
  const weeks = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (weeks.length < 3) return { stalled: false, weeks: weeks.length };
  const recent = weeks.slice(-2).map(w => w[1]);
  const before = Math.max(...weeks.slice(0, -2).map(w => w[1]));
  return { stalled: Math.max(...recent) <= before + 1e-9, weeks: weeks.length };
}

// PR = best set beats every earlier session. First session is never a PR.
export function isPR(exId, date, sets) {
  const ex = exById(exId);
  const prev = history(exId).filter(h => h.date < date);
  if (!prev.length || !sets.length) return false;
  const prevBest = Math.max(...prev.map(h => bestScore(ex, h.entry.sets)));
  const prevMaxLoad = ex.kind === "load" ? Math.max(...prev.flatMap(h => h.entry.sets.map(s => s.load || 0))) : 0;
  const nowMaxLoad = ex.kind === "load" ? Math.max(...sets.map(s => s.load || 0)) : 0;
  return bestScore(ex, sets) > prevBest + 1e-9 || nowMaxLoad > prevMaxLoad;
}

/* ---------- rotation (circle method) ---------- */
export function slotState(key) { return live("areaState").find(r => r.id === key) || { id: key, current: SLOTS[key].def, parked: [] }; }
export const slotExercise = key => exById(slotState(key).current);
export function slotCandidates(key) {
  const sl = SLOTS[key];
  return allExercises().filter(e => e.area === sl.area && (sl.kind === "load" ? e.kind === "load" : e.kind !== "load"));
}
export function lastTrained(exId) { const h = history(exId); return h.length ? h[h.length - 1].date : ""; }

// Weaker exercise in the same area: never or least recently trained first, then easier (lower rank).
export function switchSuggestion(key) {
  const st = slotState(key);
  const c = slotCandidates(key).filter(e => e.id !== st.current);
  c.sort((a, b) => lastTrained(a.id).localeCompare(lastTrained(b.id)) || (a.rank || 0) - (b.rank || 0));
  return c[0] || null;
}
export function setSlot(key, exId, parkCurrent) {
  const st = slotState(key);
  const parked = (st.parked || []).filter(x => x !== exId);
  if (parkCurrent && st.current !== exId) parked.push(st.current);
  put("areaState", { id: key, current: exId, parked });
}

// The day's session: the default split minus slots switched off, plus exercises added (Settings → session menu).
export function planFor(dateStr) {
  const d = parse(dateStr).getDay(), base = SPLIT[d], cfg = (S.settings.sessions || {})[d] || {};
  return { ...base, dow: d, slots: base.slots.filter(k => !(cfg.off || []).includes(k)), allSlots: base.slots, off: cfg.off || [], extra: (cfg.extra || []).filter(id => allExercises().some(e => e.id === id)) };
}
export const workoutOn = date => live("workouts").find(w => w.date === date);

/* ---------- pain ---------- */
export function painFlags(date = today()) {
  const from = addDays(date, -13), seen = new Map(), flags = [];
  for (const w of live("workouts")) {
    if (w.date < from || w.date > date) continue;
    for (const e of w.entries || []) {
      const p = e.pain; if (!p || !p.score) continue;
      const loc = (p.location || "").trim().toLowerCase();
      if (p.score >= 4) flags.push(`Pain ${p.score}/10${loc ? " in " + loc : ""} on ${fmtDate(w.date)} (${exById(e.exercise).name}).`);
      if (loc) { const n = (seen.get(loc) || 0) + 1; seen.set(loc, n); if (n === 2) flags.push(`Pain in ${loc} twice in two weeks.`); }
    }
  }
  return flags;
}

/* ---------- runs ---------- */
export const pace = r => r.km ? r.sec / r.km : 0;
export const fmtTime = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + pad(m) : m) + ":" + pad(x); };
export function runIsPR(run) {
  const prev = live("runs").filter(r => r.id !== run.id && r.date <= run.date);
  if (!prev.length) return false;
  if (run.km > Math.max(...prev.map(r => r.km))) return true;
  const comparable = prev.filter(r => r.km >= run.km * 0.9 && r.km >= 3);
  return run.km >= 3 && comparable.length > 0 && pace(run) < Math.min(...comparable.map(pace));
}

/* ---------- body ---------- */
// 7-day average for each date that has entries in its trailing 7-day window.
export function weightSeries() {
  const w = live("bodyweight").slice().sort((a, b) => a.date.localeCompare(b.date));
  return w.map(e => {
    const win = w.filter(x => x.date <= e.date && x.date > addDays(e.date, -7));
    return { date: e.date, kg: e.kg, avg: win.reduce((a, x) => a + x.kg, 0) / win.length };
  });
}
export function avg7(date = today()) {
  const win = live("bodyweight").filter(x => x.date <= date && x.date > addDays(date, -7));
  return win.length ? win.reduce((a, x) => a + x.kg, 0) / win.length : null;
}
export function dayFood(date) {
  const meals = live("meals").filter(m => m.date === date);
  const t = { kcal: 0, protein: 0 };
  for (const m of meals) for (const it of m.items || []) { t.kcal += +it.kcal || 0; t.protein += +it.protein || 0; }
  return { meals, ...t };
}

/* ---------- money ---------- */
export const moneyReports = () => live("money").sort((a, b) => a.date.localeCompare(b.date) || a.u - b.u);
export const latestMoney = () => moneyReports().slice(-1)[0] || null;
export const weeksLeft = (from = today()) => Math.max(1, daysBetween(from, S.settings.dates.graduation) / 7);
// Due when nothing was reported in the current Monday–Sunday week.
export const moneyDue = (s = today()) => { const w = weekDays(s); return !live("money").some(r => w.includes(r.date)); };
export function moneyPlan() {
  const m = S.settings.money, last = latestMoney(), wl = weeksLeft();
  const bank = last ? last.bank : 0, debt = last ? last.debt : m.debtStart;
  return {
    bank, debt, goal: m.goal, debtStart: m.debtStart, weeks: wl,
    savePct: Math.max(0, Math.min(1, bank / m.goal)),
    paidPct: m.debtStart ? Math.max(0, Math.min(1, 1 - debt / m.debtStart)) : 1,
    saveWeek: Math.max(0, m.goal - bank) / wl,
    debtWeek: Math.max(0, debt) / wl,
  };
}
// The loan EMI (v3.3, from job start) comes first: it's paid before anything else.
export const bills = () => live("bills").sort((a, b) => (b.kind === "loan") - (a.kind === "loan") || (a.kind === "insurance") - (b.kind === "insurance") || a.name.localeCompare(b.name));
export const billMonthly = b => b.amount == null ? 0 : b.freq === "year" ? b.amount / 12 : b.amount;
export const billsMonthly = () => bills().reduce((a, b) => a + billMonthly(b), 0);
export const monthKey = (s = today()) => s.slice(0, 7);

/* ---------- wishlist rewards ---------- */
// XP wallet: everything earned minus what purchases spent. Level and total XP never go down.
export const xpSpent = () => live("wishlist").filter(w => w.bought).reduce((a, w) => a + (w.bought.xp || 0), 0) + live("titles").reduce((a, r) => a + (r.xp || 0), 0);
// Penalties come off the wallet too, never off level.
export const xpPenalty = () => live("penalties").reduce((a, p) => a + (p.xp || 0), 0);
export const xpWallet = () => xpTotal() - xpSpent() - xpPenalty();
// Purchasing power grows 1% per level, up to ×2 (around level 100, roughly a year of steady quests).
// Wishlist items keep their base XP; what you pay is base ÷ power. Prices don't fall; your XP is worth more.
export const xpPower = (lv = level()) => Math.min(2, 1 + 0.01 * (lv - 1));
export const xpPrice = w => Math.max(5, Math.round((w.xp || 0) / xpPower() / 5) * 5);
// Store fund (was the fun budget). Fixed goals come first: a month adds the monthly amount only if, by its last
// money report, savings gained + debt paid are on the straight-line pace to ¥goal saved and debt-free by graduation.
// The current month counts while its latest report (or last month's) is on pace. Unspent yen rolls over.
export function paceAt(r) {
  const m = S.settings.money, first = moneyReports()[0]; if (!first || !r) return { ok: true, behind: 0 };
  const total = daysBetween(first.date, S.settings.dates.graduation) || 1, frac = Math.max(0, Math.min(1, daysBetween(first.date, r.date) / total));
  const need = (m.goal - first.bank) + first.debt, made = (r.bank - first.bank) + (first.debt - r.debt), want = need * frac;
  return { ok: made >= want * 0.95, behind: Math.max(0, Math.round(want - made)) };
}
export function storeMonths() {
  const f = S.settings.fun, start = f.start || monthKey(), now = monthKey(), reps = moneyReports(), out = [];
  let [y, mo] = start.split("-").map(Number), prevOk = true;
  for (let i = 0; i < 120; i++) {
    const k = y + "-" + pad(mo), inM = reps.filter(r => monthKey(r.date) === k), last = inM[inM.length - 1];
    const ok = last ? paceAt(last).ok : k === now ? prevOk : prevOk && !reps.length;
    out.push({ month: k, ok, behind: last ? paceAt(last).behind : 0 }); prevOk = ok;
    if (k === now) break; mo++; if (mo > 12) { mo = 1; y++; }
  }
  return out;
}
export function funBudget() {
  const f = S.settings.fun, ms = storeMonths(), paid = ms.filter(m => m.ok).length;
  const spent = live("wishlist").filter(w => w.bought).reduce((a, w) => a + (w.bought.yen || 0), 0);
  return { accrued: paid * (f.monthly || 0), spent, left: paid * (f.monthly || 0) - spent, monthly: f.monthly || 0, months: ms, now: ms[ms.length - 1] };
}
// Store items in priority order; the fund fills them one at a time, top first.
export function storeQueue() {
  let left = Math.max(0, funBudget().left);
  return live("wishlist").filter(w => !w.bought).sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || (a.u || 0) - (b.u || 0))
    .map(w => { const alloc = Math.min(w.price || 0, left); left -= alloc; return { w, alloc }; });
}
export const suggestXp = yen => Math.max(10, Math.round((yen || 0) / (S.settings.fun.yenPerXp || 20) / 10) * 10);

/* ---------- skills ---------- */
export function skillValue(sk) {
  if (sk.src === "run") return Math.max(0, ...live("runs").map(r => r.km));
  return live("habitLog").filter(h => sk.src.includes(h.habit)).length;
}
export function skillInfo(sk) {
  const v = skillValue(sk), tier = sk.at.filter(t => v >= t).length;
  const next = sk.at[tier] ?? null, prev = tier ? sk.at[tier - 1] : 0;
  return { ...sk, value: v, tier, next, pct: Math.min(1, v / sk.at[sk.at.length - 1]), toNext: next == null ? 1 : (v - prev) / (next - prev) };
}
// Share of weekly habit targets hit over the last 4 full-or-current weeks (0–1).
export function discipline(s = today()) {
  let hit = 0, want = 0;
  for (let i = 0; i < 4; i++) {
    const d = addDays(s, -7 * i);
    for (const h of HABITS) { const tg = habitTarget(h.id) || 0; want += tg; hit += Math.min(tg, habitWeekCount(h.id, d)); }
  }
  return want ? hit / want : 0;
}
// Days in a row (ending today, or yesterday if today is still empty) with at least one quest done.
export function streak() {
  const days = new Set(live("habitLog").map(h => h.date));
  let d = today(); if (!days.has(d)) d = addDays(d, -1);
  let n = 0; while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

/* ---------- chart series ---------- */
export const e1rm = s => s.load * (1 + s.reps / 30);
// Best estimated 1RM per ISO week for one lift, last n weeks. Missing weeks are null.
export function e1rmWeekly(exId, n = 12, s = today()) {
  const h = history(exId);
  return [...Array(n)].map((_, i) => {
    const w = weekDays(addDays(s, -7 * (n - 1 - i)));
    const sets = h.filter(x => w.includes(x.date)).flatMap(x => x.entry.sets).filter(x => x.load && x.reps);
    return sets.length ? Math.max(...sets.map(e1rm)) : null;
  });
}
export function longestRunWeekly(n = 12, s = today()) {
  return [...Array(n)].map((_, i) => {
    const w = weekDays(addDays(s, -7 * (n - 1 - i)));
    const rs = live("runs").filter(r => w.includes(r.date));
    return rs.length ? Math.max(...rs.map(r => r.km)) : null;
  });
}
