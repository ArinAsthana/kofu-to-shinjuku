// v10.1: the Report Card. Reads every test the app already keeps (Gate Tests, class quizzes and boss exams, JLPT exams,
// Drill runs, the old hand-typed Zetamac scores) plus real exams entered by hand. Hand-entered exams are path records
// {kind:"exam", name, subject, date, score, of, passPct, notes, at}: no `stream`, so the Path engine ignores them. No schema change.

import { live, put, remove } from "./store.js";
import * as E from "./engine.js";
import * as Pa from "./path.js";
import * as Cl from "./classes.js";
import * as Dr from "./drill.js";

/* ---------- grades ---------- */
const GRADES = [[90, "A", 4], [80, "B", 3], [70, "C", 2], [60, "D", 1], [0, "F", 0]];
export const letter = pct => GRADES.find(g => pct * 100 >= g[0] - 1e-9);
// A 4.0 GPA as a letter with + / −.
export function gpaLetter(g) {
  const L = [[3.85, "A"], [3.5, "A−"], [3.15, "B+"], [2.85, "B"], [2.5, "B−"], [2.15, "C+"], [1.85, "C"], [1.5, "C−"], [1.15, "D+"], [0.85, "D"], [0.5, "D−"]];
  return (L.find(x => g >= x[0]) || [0, "F"])[1];
}

/* ---------- periods ---------- */
// Fall runs Sep to Feb, Spring Mar to Aug.
export function semester(t = E.today()) {
  const y = +t.slice(0, 4), m = +t.slice(5, 7);
  return m >= 9 ? { from: `${y}-09-01`, name: `Fall ${y}` } : m <= 2 ? { from: `${y - 1}-09-01`, name: `Fall ${y - 1}` } : { from: `${y}-03-01`, name: `Spring ${y}` };
}
export const PERIODS = [["all", "All"], ["month", "This month"], ["sem", "This semester"]];
const inPeriod = (p, d, t = E.today()) => p === "month" ? d.slice(0, 7) === t.slice(0, 7) : p === "sem" ? d >= semester(t).from && d <= t : true;

/* ---------- attempts: one per sitting ---------- */
// {key, name, subject, date, at, score, of, pct, pass (0..1 or null), passed (bool or null), graded, src, id}
const discName = id => Cl.disc(id)?.name || id;
const chName = (id, ch) => (Cl.chapters(id).find(c => c.id === ch) || {}).title || ch;
export function attempts() {
  const out = [];
  for (const r of live("path")) {
    if (r.kind === "gate") {
      const st = Pa.stream(r.stream), label = st ? st.label : r.stream;
      out.push({ key: `gate:${r.stream}:${r.gate}`, name: `${label} Gate ${r.gate}`, subject: r.stream === "n2" ? "Japanese" : label, date: r.date, at: r.at, score: r.score, of: r.n, pct: r.score / r.n, pass: Pa.GATE_PASS, passed: !!r.passed, graded: true, src: "gate" });
    } else if (r.kind === "exam") {
      const pass = r.passPct != null && r.passPct !== "" ? r.passPct / 100 : null, pct = r.of ? r.score / r.of : 0;
      out.push({ key: `exam:${(r.subject || "").toLowerCase()}:${(r.name || "").toLowerCase()}`, name: r.name, subject: r.subject || "Other", date: r.date, at: r.at || 0, score: r.score, of: r.of, pct, pass, passed: pass == null ? null : pct >= pass - 1e-9, graded: true, src: "exam", id: r.id, notes: r.notes || "" });
    }
  }
  for (const r of live("discLog")) {
    if (r.kind !== "quiz" && r.kind !== "boss") continue;
    const boss = r.kind === "boss", nm = discName(r.disc);
    out.push({ key: `disc:${r.disc}:${r.ch}`, name: boss ? `${nm} boss exam` : `${nm} · ${chName(r.disc, r.ch)}`, subject: nm, date: r.date, at: r.ts || 0, score: r.score, of: r.n, pct: r.n ? r.score / r.n : 0, pass: boss ? Cl.PASS.boss : Cl.PASS.chapter, passed: !!r.pass, graded: true, src: boss ? "boss" : "quiz" });
  }
  for (const r of live("jlptExams")) {
    const n = Object.values(r.sec || {}).reduce((a, s) => a + s[1], 0), ok = Object.values(r.sec || {}).reduce((a, s) => a + s[0], 0);
    if (r.kind === "place") out.push({ key: "jlpt:place", name: "JLPT placement", subject: "Japanese", date: r.date, at: r.u || 0, score: ok, of: n, pct: r.pct, pass: null, passed: null, graded: false, src: "place", per: r.per || {} });
    else out.push({ key: `jlpt:mock:${r.lvl}`, name: `JLPT ${r.lvl} Boss Raid`, subject: "Japanese", date: r.date, at: r.u || 0, score: ok, of: n, pct: r.pct, pass: 0.7, passed: !!r.pass, graded: true, src: "mock" });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at);
}

/* ---------- tests: attempts grouped ---------- */
export function tests(period = "all", t = E.today()) {
  const by = new Map();
  for (const a of attempts()) if (inPeriod(period, a.date, t)) { if (!by.has(a.key)) by.set(a.key, []); by.get(a.key).push(a); }
  return [...by.values()].map(tries => {
    const last = tries[tries.length - 1], prev = tries.length > 1 ? tries[tries.length - 2] : null;
    const best = tries.reduce((m, a) => a.pct > m.pct ? a : m, tries[0]);
    return { key: last.key, name: last.name, subject: last.subject, src: last.src, graded: last.graded, pass: last.pass, tries, last, best,
      change: prev ? last.pct - prev.pct : null, passed: last.passed == null ? null : tries.some(a => a.passed), firstPass: tries[0].passed,
      margin: last.pass == null ? null : last.pct - last.pass, date: last.date };
  }).sort((a, b) => b.date.localeCompare(a.date) || b.last.at - a.last.at);
}

// The summary window. Best attempt counts for the grade.
export function summary(ts, sub = null, t = E.today()) {
  const g = ts.filter(x => x.graded), pf = g.filter(x => x.passed != null);
  const gpa = g.length ? g.reduce((a, x) => a + letter(x.best.pct)[2], 0) / g.length : null;
  const subs = subjects(ts).filter(s => s.n);
  const ym = t.slice(0, 7), lm = E.addDays(ym + "-01", -1).slice(0, 7), all = attempts().filter(a => a.graded && (!sub || a.subject === sub));
  const avg = L => L.length ? L.reduce((s, a) => s + a.pct, 0) / L.length : null;
  const tm = avg(all.filter(a => a.date.slice(0, 7) === ym)), pm = avg(all.filter(a => a.date.slice(0, 7) === lm));
  return { n: g.length, gpa, letter: gpa == null ? null : gpaLetter(gpa),
    passN: pf.filter(x => x.passed).length, passOf: pf.length, firstN: pf.filter(x => x.firstPass).length,
    strong: subs.length > 1 ? subs[0] : null, weak: subs.length > 1 ? subs[subs.length - 1] : null,
    month: tm, trend: tm != null && pm != null ? tm - pm : null };
}
// Per subject: average of each test's best %, and the average pass mark. Strongest first.
export function subjects(ts) {
  const by = {};
  for (const x of ts.filter(x => x.graded)) (by[x.subject] = by[x.subject] || []).push(x);
  return Object.entries(by).map(([name, L]) => {
    const pm = L.filter(x => x.pass != null);
    return { name, n: L.length, avg: L.reduce((a, x) => a + x.best.pct, 0) / L.length, pass: pm.length ? pm.reduce((a, x) => a + x.pass, 0) / pm.length : null };
  }).sort((a, b) => b.avg - a.avg);
}
export const subjectNames = () => [...new Set(attempts().map(a => a.subject))].sort();

/* ---------- Drill ---------- */
const mean = L => L.reduce((a, b) => a + b, 0) / L.length;
const dailyBest = (L, from, to) => { const by = {}; for (const r of L) if (r.date >= from && r.date <= to) by[r.date] = Math.max(by[r.date] ?? -1, r.score); return by; };
export function drill(m, period = "all", t = E.today()) {
  const L = Dr.runs(m).filter(r => !r.custom && inPeriod(period, r.date, t)); if (!L.length) return null;
  const sc = L.map(r => r.score), av = mean(sc), sd = Math.sqrt(mean(sc.map(x => (x - av) ** 2)));
  const att = L.reduce((a, r) => a + (r.attempted || 0), 0), cor = L.reduce((a, r) => a + (r.correct || 0), 0);
  const win = d => { const v = Object.values(dailyBest(L, E.addDays(t, -(d - 1)), t)); return v.length ? mean(v) : null; };
  return { n: L.length, best: Math.max(...sc), avg: av, sd, ppm: mean(L.map(r => r.score / ((r.secs || Dr.SECS) / 60))), acc: att ? cor / att : null, avg7: win(7), avg30: win(30), last: L[L.length - 1] };
}
// The last `days` days: daily best and its trailing 7-day average (null on days with no run).
export function drillSeries(m, days = 30, t = E.today()) {
  const L = Dr.runs(m).filter(r => !r.custom), by = dailyBest(L, E.addDays(t, -(days + 6)), t);
  const dates = [...Array(days)].map((_, i) => E.addDays(t, i - days + 1));
  const best = dates.map(d => by[d] ?? null);
  const avg = dates.map(d => { const v = [...Array(7)].map((_, i) => by[E.addDays(d, -i)]).filter(x => x != null); return v.length ? mean(v) : null; });
  return { dates, best, avg };
}
// The old hand-typed Zetamac scores, from finished Mental Math Path items.
export const manualZetamac = () => live("path").filter(r => r.zetamac != null && r.stream === "mental").map(r => ({ date: r.date, score: r.zetamac })).sort((a, b) => a.date.localeCompare(b.date));

/* ---------- real exams by hand ---------- */
export function addExam({ name, subject, date, score, of, passPct, notes }) {
  return put("path", { id: "exam-" + Date.now().toString(36), kind: "exam", name, subject, date, score, of, passPct: passPct ?? null, notes: notes || "", at: Date.now() });
}
export const dropExam = id => { const r = live("path").find(x => x.id === id && x.kind === "exam"); if (r) remove("path", id); };
