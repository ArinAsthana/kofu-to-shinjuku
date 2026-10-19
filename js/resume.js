// v13: Resumes. One CV per company and role, built from the transcript and the app's own progress.
// Store "resumes" (synced, schema 15). CV records: {id, company, role, track, appId, motives:[{text, src[]}],
//  sections:{summary, education[], courses[], skills[], certs[], projects[], experience[], languages[], extras[]},
//  seen:[earned srcs], exported:{at, earned[]}, versions:[{at, sections, motives}], by "app"|"claude", created, updated}.
// A line is {text, src?, head?}. `src` ties it to app data ("disc:sql", "course:Derivatives", "cert:boki3", "cap:markets",
// "stat:zetamac", "jp", "gpa"), so its state (earned / in progress / locked) is computed live and a grey line turns
// black on its own. Lines with no src are always earned.
// Three helper records share the store (they carry `kind`): "transcript" {data}, "profile" {name, email, phone, location},
// and "cache" (line states and the Japanese estimate, written by the phone for the connector's get_resume_data).
// The transcript is Arin's personal data: it only ever lives in Arin's synced account, never in this repo.

import { S, live, put, remove } from "./store.js";
import * as E from "./engine.js";
import * as Cl from "./classes.js";
import * as Ap from "./apps.js";
import * as Rc from "./report.js";
import * as Dr from "./drill.js";
import * as Lx from "./lexicon.js";
import * as Pa from "./path.js";

export const TRACKS = Ap.TRACKS;
export const MAX_VERSIONS = 5, XP_FIRST = 50, ZM_SHOW = 40, ZM_GREY = 30;
export const SECTIONS = [["summary", "Summary"], ["education", "Education"], ["courses", "Relevant coursework"], ["skills", "Skills"], ["certs", "Certifications"],
  ["projects", "Projects"], ["experience", "Experience"], ["languages", "Languages"], ["extras", "Activities"]];
const GRAD = "Aug 2027", JLPT_SIT = "N2 July 2027";

/* ---------- helper records ---------- */
const rec = id => live("resumes").find(r => r.id === id) || null;
export const transcript = () => rec("transcript")?.data || null;
export const all = () => live("resumes").filter(r => !r.kind).sort((a, b) => (b.updated || 0) - (a.updated || 0));
export const byId = id => all().find(r => r.id === id) || null;
export const forApp = appId => all().find(r => r.appId === appId) || null;
export function profile() {
  const p = rec("profile") || {};
  return { name: p.name || S.settings.name || "Arin", email: p.email || "", phone: p.phone || "", location: p.location || "Kofu, Yamanashi, Japan" };
}
export function saveProfile(f) { put("resumes", { ...(rec("profile") || {}), id: "profile", kind: "profile", ...f }); }

// The transcript file: {school, major, gpaCumulative, courses:[[sem, dept, title, credits, grade|null], ...]}.
export function importTranscript(text) {
  let o; try { o = JSON.parse(text); } catch (e) { throw new Error("That file isn't JSON."); }
  if (!o || !Array.isArray(o.courses) || !o.courses.length || typeof o.gpaCumulative !== "number") throw new Error("Not a transcript file (needs courses and gpaCumulative).");
  put("resumes", { id: "transcript", kind: "transcript", data: o, at: Date.now() });
  return { courses: o.courses.length, gpa: o.gpaCumulative };
}
const courses = () => (transcript()?.courses || []).map(([sem, dept, title, credits, grade]) => ({ sem, dept, title, credits, grade }));
const course = key => { const k = key.toLowerCase(); return courses().find(c => c.title.toLowerCase().startsWith(k)) || null; };
export const gpa = () => transcript()?.gpaCumulative ?? null;

/* ---------- what each track picks ---------- */
const CERTS = {
  boki3: { name: "Boki Grade 3 (Japanese bookkeeping)", re: /boki.*3|簿記.*3/i, fixed: "boki3" },
  boki2: { name: "Boki Grade 2 (Japanese bookkeeping)", re: /boki.*2|簿記.*2/i, fixed: "boki2" },
  sapfi: { name: "SAP Certified Associate, Financial Accounting (S/4HANA)", re: /sap/i },
};
const CAPS = {
  markets: "JPY interest rate swap priced off a TONA curve in Python, with a trade capture, confirm, settle and P&L flow",
  sapfico: "Record-to-report walk-through in SAP S/4HANA (FI/CO)",
  strategist: "20 timed consulting cases solved and logged, plus a full mock interview with a consultant",
};
export const TEMPLATES = {
  "Murex/Calypso": {
    courses: ["Derivatives", "Risk Management", "Investment", "Portfolio Management", "Money, Banking", "Introduction to Python", "Introduction to Computer Science", "Statistics"],
    skills: ["disc:cmp", "disc:deriv", "disc:sql", "disc:maths", "Python (coursework)", "Excel", "stat:zetamac"], certs: [], cap: "markets",
    summary: "Coursework in derivatives, risk and portfolio management; building capital markets systems skills (trade lifecycle, SQL, Python).",
    motives: [["Capital markets products (rates, FX, derivatives)", ["disc:cmp", "disc:deriv", "course:Derivatives"]], ["SQL, scripting and data", ["disc:sql", "course:Introduction to Python"]],
      ["Quantitative speed and accuracy", ["stat:zetamac", "disc:maths", "course:Statistics"]], ["Client-facing communication, Japanese for the Tokyo office", ["jp", "exp:fm"]],
      ["Systems delivery (trade lifecycle, implementation)", ["cap:markets"]]],
  },
  "SAP FI/CO": {
    courses: ["Accounting", "Financial Management", "Introduction to Python", "Introduction to Computer Science", "Statistics", "Introduction to Global Business", "Leadership"],
    skills: ["disc:acct", "disc:mgmt", "disc:sap", "disc:sql", "Python (coursework)", "Excel"], certs: ["cert:boki3", "cert:boki2", "cert:sapfi"], cap: "sapfico",
    summary: "Strong accounting coursework; building SAP FI/CO and SQL skills toward the FI associate certification.",
    motives: [["Accounting fundamentals (record-to-report)", ["disc:acct", "course:Accounting", "cert:boki3"]], ["SAP FI/CO configuration", ["disc:sap", "cert:sapfi", "cap:sapfico"]],
      ["Management accounting and controlling", ["disc:mgmt", "course:Financial Management"]], ["Data and SQL", ["disc:sql", "course:Introduction to Python"]], ["Japanese for client work", ["jp"]]],
  },
  "Strategy consulting": {
    courses: ["Game Theory", "Intermediate Microeconomics", "Intermediate Macroeconomics", "Foundation of Marketing", "Introduction to Global Business", "Methods of Social Research", "Statistics", "Leadership"],
    skills: ["disc:strat", "disc:cfv", "disc:bjp", "Excel", "stat:zetamac"], certs: [], cap: "strategist",
    summary: "Economics and game theory coursework; practising structured case solving and quick numbers.",
    motives: [["Structured problem solving (cases)", ["disc:strat", "cap:strategist"]], ["Business and economics foundation", ["course:Game Theory", "course:Intermediate Micro"]],
      ["Quick, accurate numbers", ["stat:zetamac"]], ["Corporate finance and valuation", ["disc:cfv"]], ["Business Japanese", ["disc:bjp", "jp"]]],
  },
  Other: {
    courses: null, skills: null, certs: [], cap: null,
    summary: "Works part-time in Japanese while studying full time.",
    motives: [["Strong academic record", ["gpa"]], ["Languages", ["jp"]], ["Reliability alongside study", ["exp:fm"]]],
  },
};
const tpl = track => TEMPLATES[track] || TEMPLATES.Other;
const gradeRank = g => ({ A: 4, B: 3, C: 2, D: 1 })[g] ?? (g == null ? 3.5 : 0);
function pickCourses(track) {
  const t = tpl(track), C = courses().filter(c => c.grade == null || gradeRank(c.grade) >= 3);
  const L = t.courses ? t.courses.map(k => C.find(c => c.title.toLowerCase().startsWith(k.toLowerCase()))).filter(Boolean)
    : C.filter(c => /GB&E|DATA/.test(c.dept) && c.grade).sort((a, b) => gradeRank(b.grade) - gradeRank(a.grade));
  return L.slice(0, 6).map(c => ({ src: "course:" + c.title }));
}
const otherSkills = () => {
  const won = Cl.all().filter(d => Cl.bossPassed(d.id)).map(d => "disc:" + d.id);
  return (won.length ? won : Cl.active().map(id => "disc:" + id)).slice(0, 3);
};

// A rough CV from the track template (the app's own; Claude's version replaces it through save_resume).
export function build(company, role, track) {
  const t = tpl(track), g = gpa(), T = transcript() || {};
  const ln = x => x.includes(":") || x === "jp" ? { src: x } : { text: x };
  return {
    summary: `${T.major || "Global Business & Economics"} student at iCLA${g >= 3.5 ? ` (GPA ${g.toFixed(2)})` : ""}, graduating ${GRAD}, applying for ${role || "this role"} at ${company}. ${t.summary}`,
    education: [{ text: T.school || "iCLA (Yamanashi Gakuin University International College of Liberal Arts)", head: true },
      { src: "gpa" }],
    courses: pickCourses(track),
    skills: (t.skills || otherSkills()).map(ln),
    certs: t.certs.map(ln),
    projects: t.cap ? [{ src: "cap:" + t.cap }] : [],
    experience: [{ text: "FamilyMart, night shift staff (Kofu, Japan)", head: true }, { text: "Customer service in Japanese at a 24-hour convenience store" },
      { text: "Night shifts held alongside full-time university study" }],
    languages: [{ text: "English (native)" }, { text: "Hindi (native)" }, { src: "jp" }],
    extras: [{ text: "Music Club, iCLA" }],
  };
}
export const motivesFor = track => tpl(track).motives.map(([text, src]) => ({ text, src }));

/* ---------- Japanese level estimate (v13.1) ---------- */
const JL = ["N5", "N4", "N3", "N2"];
// A level counts as reached with ≥70% of its vocab known or switched off, ≥60% of its kanji (N3, N2), and its tests
// averaging 70%+ over the last 30 days (at least 2). A passed real JLPT exam on the Report Card overrides it.
export function jpEstimate(t = E.today()) {
  const from = E.addDays(t, -30), A = Rc.attempts();
  const real = A.filter(a => a.src === "exam" && a.passed && /jlpt\s*n([1-5])/i.test(a.name)).map(a => ({ lvl: "N" + a.name.match(/jlpt\s*n([1-5])/i)[1], date: a.date }))
    .sort((a, b) => a.lvl.localeCompare(b.lvl))[0] || null; // N1 < N2 alphabetically: the best pass
  const ready = Lx.ready(), m = ready ? Lx.recs() : null;
  const pct = (type, lvl) => { if (!ready) return null; const c = Lx.counts(type, lvl, m); return c.all ? (c.known + c.off) / c.all : null; };
  const per = JL.map(lvl => {
    const tests = A.filter(a => a.graded && a.date >= from && ((a.src === "mock" && a.name === `JLPT ${lvl} Boss Raid`) || (a.src === "gate" && a.subject === "Japanese" && lvl === "N2")
      || (a.src === "exam" && a.subject === "Japanese" && new RegExp(lvl, "i").test(a.name))));
    const avg = tests.length ? tests.reduce((s, a) => s + a.pct, 0) / tests.length : null;
    const vocab = pct("vocab", lvl), kanji = Lx.LEVELS.kanji.includes(lvl) ? pct("kanji", lvl) : undefined;
    const reached = vocab != null && vocab >= 0.7 && (kanji === undefined || (kanji != null && kanji >= 0.6)) && tests.length >= 2 && avg >= 0.7;
    const parts = [Math.min(1, (vocab || 0) / 0.7), kanji === undefined ? null : Math.min(1, (kanji || 0) / 0.6), Math.min(1, (avg || 0) / 0.7) * Math.min(1, tests.length / 2)].filter(x => x != null);
    return { lvl, vocab, kanji: kanji ?? null, tests: tests.length, avg, reached, progress: parts.reduce((a, b) => a + b, 0) / parts.length };
  });
  let est = null; for (const p of per) if (p.reached) est = p.lvl;
  const next = per[est ? JL.indexOf(est) + 1 : 0] || null;
  return { est, next, per, real, lexicon: ready, at: Date.now() };
}
// On a phone without the decks, the estimate from the phone that has them (saved in the cache record).
export function jp() {
  const e = jpEstimate();
  if (e.lexicon || e.real) return e;
  const c = rec("cache")?.jp; return c && c.lexicon ? { ...c, real: e.real, cached: true } : e;
}
const pc = x => x == null ? "—" : Math.round(x * 100) + "%";
export const jpBreakdown = p => p ? `${p.lvl} · ${Math.round(p.progress * 100)}% (vocab ${pc(p.vocab)}${p.kanji != null || ["N3", "N2"].includes(p.lvl) ? `, kanji ${pc(p.kanji)}` : ""}, tests ${p.tests ? pc(p.avg) + " ×" + p.tests : "—"})` : "";

/* ---------- line states ---------- */
const monthOf = d => { const x = E.parse(d); return x.toLocaleString("en-US", { month: "short" }) + " " + x.getFullYear(); };
function discExpect(id) {
  const wk = Cl.weeklyHours(), act = Cl.active().length || 1;
  if (!wk) return null;
  const weeks = Cl.hoursLeft(id) / (wk / act); return weeks > 0 && weeks < 200 ? monthOf(E.addDays(E.today(), Math.ceil(weeks * 7))) : null;
}
export const zetamac = () => { const L = [Dr.best("classic"), ...Rc.manualZetamac().map(r => r.score)].filter(x => x != null); return L.length ? Math.max(...L) : null; };
// {state "earned"|"prog"|"locked"|"off", text, cond, pct, go, expect}
export function line(src) {
  const [k, id] = String(src).split(/:(.*)/s);
  if (k === "disc") {
    const d = Cl.disc(id); if (!d) return { state: "off", text: id };
    const n = Cl.clearedCount(id), N = Cl.chapters(id).length, go = "classes/d/" + id;
    if (Cl.bossPassed(id)) return { state: "earned", text: d.name, go };
    if (n || Cl.active().includes(id)) return { state: "prog", text: d.name, pct: N ? n / N : 0, cond: `${n}/${N} chapters · earned when the boss is passed`, go, expect: discExpect(id) };
    return { state: "locked", text: d.name, cond: `locked: pass the ${d.name} boss`, go };
  }
  if (k === "course") {
    const c = course(id); if (!c) return { state: "off", text: id };
    return { state: "earned", text: `${c.title}${c.grade ? ` (${c.grade})` : " (in progress)"}` };
  }
  if (k === "cert") {
    const c = CERTS[id]; if (!c) return { state: "off", text: id };
    const pass = Rc.attempts().find(a => a.src === "exam" && a.passed && c.re.test(a.name));
    if (pass) return { state: "earned", text: `${c.name}, ${monthOf(pass.date)}` };
    const fx = Pa.FIXED.find(f => f.id === c.fixed);
    return { state: "locked", text: c.name, cond: `locked: pass the exam${fx ? ` (${E.fmtDate(fx.date)})` : ""} and add it to the Report Card`, go: "report", expect: fx ? monthOf(fx.date) : null };
  }
  if (k === "cap") {
    const ci = Cl.CLASSES.find(c => c.id === id); if (!ci) return { state: "off", text: id };
    const info = Cl.classInfo(id), text = CAPS[id] || ci.capstone;
    if (Cl.capstoneDone(id)) return { state: "earned", text };
    if (info.got.length) return { state: "prog", text, pct: info.got.length / ci.needs.length, cond: `${info.got.length}/${ci.needs.length} disciplines · the ${ci.name} capstone`, go: "classes" };
    return { state: "locked", text, cond: `locked: the ${ci.name} capstone`, go: "classes" };
  }
  if (k === "stat" && id === "zetamac") {
    const b = zetamac(), text = `Mental arithmetic: Zetamac best ${b ?? "—"} (120 s)`;
    if (b != null && b >= ZM_SHOW) return { state: "earned", text, go: "drill" };
    if (b != null && b >= ZM_GREY) return { state: "prog", text, pct: b / ZM_SHOW, cond: `shows at ${ZM_SHOW}+`, go: "drill" };
    return { state: "off", text, cond: `Zetamac ${ZM_SHOW}+`, go: "drill" };
  }
  if (k === "gpa") {
    const g = gpa(), T = transcript() || {}, base = `BA, ${T.major || "Global Business & Economics"}`;
    return { state: "earned", text: g != null && g >= 3.5 ? `${base} · GPA ${g.toFixed(2)}/4.0 · graduating ${GRAD}` : `${base} · graduating ${GRAD}` };
  }
  if (k === "exp") return { state: "earned", text: "FamilyMart night shift" };
  if (k === "jp") {
    const e = jp();
    if (e.real) return { state: "earned", text: `Japanese: JLPT ${e.real.lvl} (certified ${e.real.date.slice(0, 4)})`, go: "jlpt" };
    if (e.est) return { state: "earned", text: `Japanese: JLPT ${e.est} level (estimated; sitting ${JLPT_SIT})`, go: "jlpt" };
    // No level estimated yet: still true, and a Japan CV never leaves Japanese out.
    return { state: "earned", text: `Japanese: studying for JLPT ${JLPT_SIT}`, go: "jlpt" };
  }
  return { state: "off", text: src };
}
// A line as shown: its own text if edited, else the live text for its src.
export function view(l) {
  const st = l.src ? line(l.src) : { state: "earned", text: "" };
  return { ...st, text: l.text || st.text, src: l.src || null, head: !!l.head };
}
export const lines = cv => SECTIONS.filter(([k]) => k !== "summary").flatMap(([k]) => (cv.sections[k] || []).map(l => ({ ...view(l), sec: k })));
export const earned = cv => [...new Set(lines(cv).filter(l => l.src && l.state === "earned").map(l => l.src))];

// "What they want" against the CV: a want is met when one of its srcs is earned.
export function match(cv) {
  const M = (cv.motives || []).map(m => typeof m === "string" ? { text: m, src: [] } : m);
  const rows = M.map(m => ({ text: m.text, met: (m.src || []).length ? m.src.some(s => line(s).state === "earned") : null }));
  const scored = rows.filter(r => r.met != null);
  return { rows, n: scored.filter(r => r.met).length, of: scored.length };
}
// The gaps: grey lines on the CV, plus wants with nothing earned yet, each with where to go.
export function gaps(cv) {
  const out = [], seen = new Set();
  const add = (src, l) => { if (seen.has(src) || l.state === "earned") return; seen.add(src); out.push({ src, label: l.cond ? `${l.text} · ${l.cond.replace(/^locked: /, "")}` : l.text, go: l.go, state: l.state }); };
  for (const l of lines(cv)) if (l.src && (l.state === "prog" || l.state === "locked")) add(l.src, l);
  for (const m of cv.motives || []) for (const s of m.src || []) { const l = line(s); if (l.state === "off" && l.cond) add(s, l); }
  return out.sort((a, b) => (a.state === "prog" ? 0 : 1) - (b.state === "prog" ? 0 : 1));
}
export const newSinceExport = cv => cv.exported ? earned(cv).filter(s => !cv.exported.earned.includes(s)) : [];
// Lines that turned black since Arin last looked, on CVs for applications still open.
export function stronger() {
  const out = [];
  for (const cv of all()) {
    const a = cv.appId && live("applications").find(x => x.id === cv.appId); if (!a || Ap.closed(a) || !cv.seen) continue;
    const now = earned(cv).filter(s => !(cv.seen || []).includes(s)); if (now.length) out.push({ cv, srcs: now, names: now.map(s => line(s).text) });
  }
  return out;
}
export function markSeen(cv) {
  const e = earned(cv); if (JSON.stringify([...e].sort()) === JSON.stringify([...(cv.seen || [])].sort())) return false;
  put("resumes", { ...cv, seen: e }); return true;
}

/* ---------- saving ---------- */
export function create({ company, role, track, appId }) {
  let app = appId ? live("applications").find(a => a.id === appId) : live("applications").find(a => a.firm.toLowerCase() === company.toLowerCase() && !Ap.closed(a));
  if (!app) app = Ap.save({ firm: company, role, track, status: "To apply" }).rec;
  const cv = { company, role, track, appId: app.id, motives: motivesFor(track), sections: build(company, role, track), versions: [], by: "app", created: Date.now(), updated: Date.now() };
  cv.seen = earned(cv); return put("resumes", cv);
}
// Saves an edit; the old one goes to versions (the last 5 kept).
export function update(cv, f) {
  const versions = [{ at: cv.updated || Date.now(), sections: cv.sections, motives: cv.motives }, ...(cv.versions || [])].slice(0, MAX_VERSIONS);
  return put("resumes", { ...cv, ...f, versions, updated: Date.now() });
}
export function restore(cv, i) { const v = (cv.versions || [])[i]; if (!v) return null; return update(cv, { sections: v.sections, motives: v.motives || cv.motives }); }
export const del = id => remove("resumes", id);
export function markExported(cv) { return put("resumes", { ...cv, exported: { at: Date.now(), earned: earned(cv) } }); }
// +50 XP the first time any CV exists (the app's or one Claude saved).
export function firstReward() {
  if (!all().length || live("xpEvents").some(e => e.ref === "cv:first")) return null;
  put("xpEvents", { ts: Date.now(), type: "cv", xp: XP_FIRST, ref: "cv:first", label: "First CV" });
  return { xp: XP_FIRST, label: "First CV" };
}

/* ---------- the connector's cache ---------- */
// Every src the templates use, with its state, so Claude can write a CV through get_resume_data without the phone.
// CVs Claude saved start with what's earned now as seen, so the first open doesn't announce old lines.
export function initSeen() { let n = 0; for (const cv of all()) if (!cv.seen) { put("resumes", { ...cv, seen: earned(cv) }); n++; } return n > 0; }
export function refreshCache() {
  const srcs = new Set(["jp", "gpa", "stat:zetamac", ...Cl.all().map(d => "disc:" + d.id), ...Object.keys(CERTS).map(k => "cert:" + k), ...Object.keys(CAPS).map(k => "cap:" + k)]);
  const out = {}; for (const s of srcs) { const l = line(s); out[s] = { state: l.state, text: l.text, ...(l.cond ? { cond: l.cond } : {}), ...(l.pct != null ? { pct: Math.round(l.pct * 100) / 100 } : {}), ...(l.expect ? { expect: l.expect } : {}) }; }
  const j = jp(), body = { lines: out, jp: j.cached ? rec("cache")?.jp : { ...j, at: undefined }, zetamac: zetamac() };
  const old = rec("cache");
  if (old && JSON.stringify({ lines: old.lines, jp: old.jp, zetamac: old.zetamac }) === JSON.stringify(JSON.parse(JSON.stringify(body)))) return false;
  put("resumes", { id: "cache", kind: "cache", ...JSON.parse(JSON.stringify(body)), at: Date.now() });
  return true;
}

/* ---------- print model (for the PDF) ---------- */
// Grey lines are left out unless `grey`; then in-progress lines say so, and locked ones say "planned".
export function printModel(cv, grey = false) {
  const p = profile(), secs = [];
  const tag = l => l.state === "prog" ? ` (in progress${l.expect ? ", expected " + l.expect : ""})` : l.state === "locked" ? " (planned)" : "";
  for (const [k, title] of SECTIONS) {
    if (k === "summary") { if (cv.sections.summary) secs.push({ title, items: [{ text: cv.sections.summary, para: true }] }); continue; }
    const L = (cv.sections[k] || []).map(view).filter(l => l.state !== "off" && (l.state === "earned" || grey));
    if (!L.length) continue;
    if (k === "courses") { secs.push({ title, items: [{ text: L.map(l => l.text + tag(l)).join(", "), para: true }] }); continue; }
    secs.push({ title, items: L.map(l => ({ text: l.text + tag(l), head: l.head })) });
  }
  return { name: p.name, contact: [p.location, p.email, p.phone].filter(Boolean).join(" · "), sections: secs };
}
