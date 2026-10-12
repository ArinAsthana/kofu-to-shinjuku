// JLPT ladder N5 → N2. Original questions in the official formats live in data/jlpt/<level>.json (static, not user data).
// User data: jlptItems, one record per question answered {id "jq:<item>", item, lvl, n, ok, last ms, right}, and
// jlptExams {date, lvl, kind "mock"|"place", sec:{vocab:[ok,n],…}, pct, pass}. Both stay bounded by the bank size.
// Questions tagged with a Genki II lesson unlock once that lesson's study topic is at 100%.

import { S, live, put } from "./store.js";
import * as E from "./engine.js";
import * as St from "./study.js";
import * as K from "./cards.js";

export const LEVELS = ["N5", "N4", "N3", "N2"];
export const SECS = [["vocab", "Vocabulary"], ["grammar", "Grammar"], ["reading", "Reading"]];
export const TYPES = {
  kanji: "Kanji reading", ortho: "Orthography", wordform: "Word formation", context: "Context", para: "Paraphrase", usage: "Usage",
  form: "Grammar form", order: "Sentence order ★", text: "Text grammar",
  short: "Short passage", mid: "Mid passage", long: "Long passage", integ: "Integrated", theme: "Thematic", info: "Information retrieval",
};
export const PROMPT = {
  kanji: "Choose the reading of the underlined word.", ortho: "Choose how the underlined word is written.", wordform: "Choose what fits in the blank.",
  context: "Choose what fits in the blank.", para: "Choose the closest meaning to the underlined part.", usage: "Choose the sentence that uses the word correctly.",
  form: "Choose what fits in the blank.", order: "Choose what goes in ★.", text: "Choose what fits in the blank in the passage.",
};
// Titles for clearing each level's Boss Raid.
export const TITLES = { N5: "Novice Interpreter", N4: "Street Linguist", N3: "Office Ready", N2: "Shinjuku Ready" };
const RANK_STEPS = [[0.95, "S"], [0.8, "A"], [0.6, "B"], [0.4, "C"], [0.2, "D"], [0, "E"]];
export const MOCK_AT = "C"; // the Boss Raid opens at this rank
const PASS = { overall: 0.7, floor: 0.35 }; // like the real exam: an overall pass mark plus a minimum per section

/* ---------- banks ---------- */
const banks = {}, loading = {};
export const bank = lvl => banks[lvl] || null;
export function load(lvl, then) {
  if (banks[lvl] || loading[lvl]) return;
  loading[lvl] = fetch(`data/jlpt/${lvl.toLowerCase()}.json`).then(r => r.json()).then(b => {
    b.byId = Object.fromEntries(b.items.map(i => [i.id, i])); b.pById = Object.fromEntries((b.passages || []).map(p => [p.id, p]));
    banks[lvl] = b; then && then();
  }).catch(() => { loading[lvl] = null; });
}
export const passage = (lvl, id) => bank(lvl)?.pById[id] || null;

/* ---------- state ---------- */
const cfg = () => S.settings.jlpt;
export const unlocked = () => cfg().unlocked || ["N5"];
export const level = () => cfg().level || unlocked()[unlocked().length - 1];
const recs = () => Object.fromEntries(live("jlptItems").map(r => [r.item, r]));
// A Genki-tagged question is open once that lesson's topic in the study list is at 100%.
export const genkiOpen = n => !n || St.progress("jp", "genki" + n) >= 100;
export const isOpen = it => genkiOpen(it.genki);

export function stats(lvl) {
  const b = bank(lvl); if (!b) return null;
  const r = recs(), open = b.items.filter(isOpen), locked = b.items.length - open.length;
  const by = Object.fromEntries(SECS.map(([k]) => [k, { n: 0, seen: 0, right: 0 }]));
  for (const it of open) { const s = by[it.sec]; s.n++; const x = r[it.id]; if (x) { s.seen++; if (x.right) s.right++; } }
  const right = open.filter(it => r[it.id]?.right).length, frac = open.length ? right / open.length : 0;
  return { total: b.items.length, open: open.length, locked, right, frac, rank: RANK_STEPS.find(([f]) => frac >= f)[1], by };
}
export const nextLock = lvl => {
  const b = bank(lvl); if (!b) return null;
  const ls = [...new Set(b.items.filter(i => !isOpen(i)).map(i => i.genki))].sort((a, b) => a - b);
  return ls.length ? { lesson: ls[0], n: b.items.filter(i => i.genki === ls[0]).length } : null;
};
export const passedLevels = () => live("jlptExams").filter(x => x.pass && x.kind === "mock").map(x => x.lvl);
export const titles = () => [...new Set(passedLevels())].map(l => TITLES[l]);

/* ---------- practice ---------- */
// Next question: finish the passage you're on, then unseen, then ones you got wrong, then the longest-ago.
export function pick(lvl, sec, cur) {
  const b = bank(lvl); if (!b) return null;
  const r = recs(), now = Date.now();
  const pool = b.items.filter(it => isOpen(it) && (!sec || it.sec === sec));
  if (cur && cur.p) { const rest = pool.find(it => it.p === cur.p && !(cur.done || []).includes(it.id)); if (rest) return rest; }
  const score = it => { const x = r[it.id]; if (!x) return 0; if (!x.right && now - x.last > 10 * 60000) return 1; return 2 + (x.last || 0) / 1e13; };
  const fresh = pool.filter(it => !r[it.id]);
  if (fresh.length) return fresh[Math.floor(Math.random() * fresh.length)];
  return pool.slice().sort((a, b) => score(a) - score(b))[0] || null;
}

// Records an answer. Returns gains to announce. Wrong answers become flashcards in "JLPT mistakes".
export function answer(lvl, it, pick, { exam = false } = {}) {
  const ok = pick === it.a, t = E.today(), id = "jq:" + it.id;
  const r = live("jlptItems").find(x => x.id === id) || { id, item: it.id, lvl, n: 0, ok: 0 };
  r.n++; if (ok) r.ok++; r.last = Date.now(); r.right = ok; put("jlptItems", r);
  if (!ok) mistakeCard(lvl, it);
  const gains = [];
  if (ok && !exam) {
    // 2 XP a correct answer, up to 60 a day, kept as one record a day.
    const ref = "jlpt:" + t, ev = live("xpEvents").find(e => e.ref === ref), xp = Math.min(60, (ev ? ev.xp : 0) + 2);
    if (!ev) put("xpEvents", { ts: Date.now(), type: "jlpt", xp, ref, label: "JLPT practice" });
    else if (ev.xp !== xp) put("xpEvents", { ...ev, xp });
  }
  return { ok, gains };
}
export const plain = s => String(s || "").replace(/__(.+?)__/g, "【$1】");
function mistakeCard(lvl, it) {
  const cid = "jm-" + it.id;
  if (live("cards").some(c => c.id === cid)) return;
  const p = it.p ? passage(lvl, it.p) : null;
  const front = (p && p.title ? "[" + p.title + "] " : "") + plain(it.q);
  const back = it.opts[it.a] + (it.ex ? " · " + it.ex : "");
  put("cards", K.newCard({ id: cid, deck: "JLPT mistakes", front, back }));
}

/* ---------- exams ---------- */
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// Mock exam (Boss Raid): 15 vocabulary, 15 grammar (standalone questions) and 3 reading passages with all their questions.
export function buildMock(lvl) {
  const b = bank(lvl), open = b.items.filter(isOpen);
  const solo = sec => shuffle(open.filter(i => i.sec === sec && !i.p)).slice(0, 15);
  const ps = shuffle([...new Set(open.filter(i => i.sec === "reading" && i.p).map(i => i.p))]).slice(0, 3);
  return [...solo("vocab"), ...solo("grammar"), ...ps.flatMap(p => open.filter(i => i.p === p))].map(i => ({ lvl, id: i.id }));
}
// Placement: 10 standalone vocabulary and grammar questions from each of N5, N4 and N3.
export function buildPlacement() {
  return ["N5", "N4", "N3"].flatMap(lvl => shuffle(bank(lvl).items.filter(i => !i.p && i.sec !== "reading")).slice(0, 10).map(i => ({ lvl, id: i.id })));
}
export function grade(kind, qs, answers) {
  const sec = {}, per = {};
  qs.forEach((q, i) => {
    const it = bank(q.lvl).byId[q.id], ok = answers[i] === it.a;
    (sec[it.sec] = sec[it.sec] || [0, 0])[1]++; if (ok) sec[it.sec][0]++;
    (per[q.lvl] = per[q.lvl] || [0, 0])[1]++; if (ok) per[q.lvl][0]++;
  });
  const okN = Object.values(sec).reduce((a, s) => a + s[0], 0), n = qs.length, pct = n ? okN / n : 0;
  if (kind === "place") {
    // Each level cleared at 80% unlocks the next one up, in order.
    let up = []; for (const l of ["N5", "N4", "N3"]) { const [o, m] = per[l] || [0, 1]; if (o / m >= 0.8) up.push(l); else break; }
    return { pct, sec, per, clears: up };
  }
  const floorOk = Object.values(sec).every(([o, m]) => o / m >= PASS.floor);
  return { pct, sec, pass: pct >= PASS.overall && floorOk, floorOk };
}
// Saves a finished exam and applies unlocks. Returns gains (XP, title) to announce.
export function finish(kind, lvl, qs, answers) {
  const g = grade(kind, qs, answers), gains = [];
  qs.forEach((q, i) => { if (answers[i] != null) answer(q.lvl, bank(q.lvl).byId[q.id], answers[i], { exam: true }); });
  const c = cfg(), un = new Set(unlocked());
  if (kind === "place") {
    for (const l of g.clears) un.add(LEVELS[LEVELS.indexOf(l) + 1]);
    put("jlptExams", { date: E.today(), lvl: "place", kind, sec: g.sec, per: g.per, pct: g.pct, pass: g.clears.length > 0 });
    c.placed = true;
  } else {
    put("jlptExams", { date: E.today(), lvl, kind, sec: g.sec, pct: g.pct, pass: g.pass });
    if (g.pass) {
      if (LEVELS.indexOf(lvl) < LEVELS.length - 1) un.add(LEVELS[LEVELS.indexOf(lvl) + 1]);
      if (!live("xpEvents").some(e => e.ref === "boss:" + lvl)) { put("xpEvents", { ts: Date.now(), type: "boss", xp: 150, ref: "boss:" + lvl, label: "Boss Raid cleared: " + lvl }); gains.push({ xp: 150, label: "Title: " + TITLES[lvl] }); }
    }
  }
  c.unlocked = LEVELS.filter(l => un.has(l));
  if (!c.unlocked.includes(c.level)) c.level = c.unlocked[c.unlocked.length - 1];
  if (kind === "place") c.level = c.unlocked[c.unlocked.length - 1];
  S.settings.u = Date.now();
  return { g, gains };
}
