// v10.0: Drill, a Zetamac-style mental math test. 120 s, one problem at a time, the answer is taken the moment it's right.
// Score = problems right. Runs are kept in the path store as {kind:"drill", mode, score, attempted, correct, secs, slow, date, at}
// (no `stream`, so the Path engine never counts them). No schema change.

import { live, put } from "./store.js";
import * as E from "./engine.js";

const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const dec1 = x => Math.abs(x * 10 - Math.round(x * 10)) < 1e-9; // at most one decimal place
const fmt = n => (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

/* ---------- modes ---------- */
// Each problem: {q, a, tol}. tol is absolute (answers match to 1 decimal place).
function classic() {
  const op = pick(["+", "−", "×", "÷"]);
  if (op === "+" || op === "−") { const a = ri(2, 100), b = ri(2, 100); return op === "+" ? { q: `${a} + ${b}`, a: a + b } : { q: `${a + b} − ${a}`, a: b }; }
  const a = ri(2, 12), b = ri(2, 100);
  return op === "×" ? { q: `${a} × ${b}`, a: a * b } : { q: `${a * b} ÷ ${a}`, a: b };
}
const PCTS = [1, 2, 2.5, 4, 5, 7.5, 8, 10, 12.5, 15, 20, 25, 30, 35, 40, 45, 50, 60, 65, 75, 80, 90, 120, 150];
function percent() {
  const t = pick(["of", "of", "what", "chg", "vatin", "vatout", "disc"]);
  if (t === "of") { for (;;) { const p = pick(PCTS), y = ri(2, 60) * pick([1, 2, 4, 5, 10]); const a = p * y / 100; if (dec1(a)) return { q: `${p}% of ${y}`, a }; } }
  if (t === "what") { for (;;) { const b = pick([20, 25, 40, 50, 80, 120, 125, 150, 200, 250, 400, 500, 800]), p = pick(PCTS), a = p * b / 100; if (Number.isInteger(a)) return { q: `${a} is what % of ${b}?`, a: p }; } }
  if (t === "chg") { for (;;) { const a = pick([20, 40, 50, 60, 80, 120, 150, 200, 250, 400, 500, 800]), c = ri(-9, 30) * 5; const b = a * (1 + c / 100); if (c && Number.isInteger(b)) return { q: `${a} → ${b}: % change?`, a: c }; } }
  if (t === "vatin") { const p = ri(1, 250) * 10; return { q: `¥${fmt(p)} + 10% tax`, a: Math.round(p * 1.1) }; }
  if (t === "vatout") { const p = ri(1, 250) * 10; return { q: `¥${fmt(p * 1.1)} incl. 10% tax: before tax?`, a: p }; }
  const p = ri(2, 99) * 100, d = pick([10, 15, 20, 25, 30, 40, 50]);
  return { q: `¥${fmt(p)} − ${d}% off`, a: p * (100 - d) / 100 };
}
function multiply() {
  const t = pick(["2x2", "2x2", "2x2", "sq", "x25", "x125"]);
  if (t === "sq") { const n = ri(11, 30); return { q: `${n}²`, a: n * n }; }
  if (t === "x25") { const n = ri(4, 99); return { q: `${n} × 25`, a: n * 25 }; }
  if (t === "x125") { const n = ri(2, 40) * 2; return { q: `${n} × 125`, a: n * 125 }; }
  const a = ri(11, 99), b = ri(11, 99); return { q: `${a} × ${b}`, a: a * b };
}
export const MODES = [
  { id: "classic", name: "Classic", note: "+ − × ÷, Zetamac defaults", gen: classic },
  { id: "percent", name: "Percent", note: "% of, % change, tax, discounts", gen: percent },
  { id: "multiply", name: "Multiply+", note: "2-digit × 2-digit, squares, ×25, ×125", gen: multiply },
];
export const mode = id => MODES.find(m => m.id === id) || MODES[0];
export const SECS = 120, SLOW_MS = 10000, XP_PB = 20, XP_CAP = 100;

/* ---------- a run ---------- */
let run = null; // {mode, end, p, input, score, skipped, slow:[], qAt}
export const current = () => run;
export const running = () => !!run && Date.now() < run.end;
export const left = () => run ? Math.max(0, Math.ceil((run.end - Date.now()) / 1000)) : 0;
function next() { run.p = mode(run.mode).gen(); run.input = ""; run.qAt = Date.now(); }
export function start(id, secs = SECS) { run = { mode: mode(id).id, secs, end: Date.now() + secs * 1000, score: 0, skipped: 0, slow: [] }; next(); return run; }
const noteSlow = (skipped) => { const ms = Date.now() - run.qAt; if (skipped || ms > SLOW_MS) run.slow.push({ q: run.p.q, a: run.p.a, s: Math.round(ms / 1000), skipped: !!skipped }); };
// One key. Returns true when the answer was right (the next problem is up).
export function key(k) {
  if (!running()) return false;
  if (k === "del") { run.input = run.input.slice(0, -1); return false; }
  if (k === "-") { run.input = run.input.startsWith("-") ? run.input.slice(1) : "-" + run.input; }
  else if (k === "." ) { if (!run.input.includes(".")) run.input += "."; }
  else if (/^\d$/.test(k)) { if (run.input.replace(/\D/g, "").length < 9) run.input += k; }
  const v = parseFloat(run.input);
  if (!isNaN(v) && Math.abs(v - run.p.a) < 0.05 + (run.p.tol || 0) && !run.input.endsWith(".")) { noteSlow(false); run.score++; next(); return true; }
  return false;
}
export function skip() { if (!running()) return; noteSlow(true); run.skipped++; next(); }
export const answerText = a => fmt(a);

// Saves the finished run and pays XP. Returns {rec, xp, pb, prevBest, avg7}.
export function finish() {
  if (!run) return null;
  const r = run, t = E.today(), prev = best(r.mode), avg = avg7(r.mode);
  const rec = put("path", { id: "drill-" + Date.now().toString(36), kind: "drill", mode: r.mode, score: r.score, correct: r.score, attempted: r.score + r.skipped, secs: r.secs, slow: r.slow.slice(0, 30), date: t, at: Date.now(), custom: r.secs !== SECS });
  run = null;
  const pb = rec.score > 0 && (prev == null || rec.score > prev) && !rec.custom;
  const room = Math.max(0, XP_CAP - xpToday(t));
  const xp = Math.min(room, rec.score + (pb ? XP_PB : 0));
  if (xp > 0) put("xpEvents", { ts: Date.now(), type: "drill", xp, ref: "drill:" + rec.id, label: `Drill · ${mode(rec.mode).name}${pb ? " · new best" : ""}` });
  return { rec, xp, pb, prevBest: prev, avg7: avg };
}
export function quit() { run = null; }

/* ---------- history ---------- */
export const runs = (m = null) => live("path").filter(r => r.kind === "drill" && (!m || r.mode === m)).sort((a, b) => a.at - b.at);
const main = m => runs(m).filter(r => !r.custom);
export const best = m => { const L = main(m); return L.length ? Math.max(...L.map(r => r.score)) : null; };
export const todayRuns = (m, t = E.today()) => main(m).filter(r => r.date === t);
export const todayBest = (m, t = E.today()) => { const L = todayRuns(m, t); return L.length ? Math.max(...L.map(r => r.score)) : null; };
// Average of the daily bests over the 7 days before today.
export function avg7(m, t = E.today()) {
  const from = E.addDays(t, -7), by = {};
  for (const r of main(m)) if (r.date >= from && r.date < t) by[r.date] = Math.max(by[r.date] || 0, r.score);
  const v = Object.values(by); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
const xpToday = t => live("xpEvents").filter(e => e.type === "drill" && E.ymd(new Date(e.ts)) === t).reduce((a, e) => a + (e.xp || 0), 0);
