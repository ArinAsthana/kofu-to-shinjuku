// Flashcards: Arin's own Anki variant. New cards are multiple choice (4 options, distractors from the same deck,
// the app grades). After 3 correct answers on 2+ different days a card graduates to a flip card scheduled with
// FSRS-4.5 (Again/Hard/Good/Easy). Two lapses in a row send it back to multiple choice. A deck with fewer than
// 4 different answers is flip only. Media (images, own voice) lives in the phone's photos store, never synced.
//
// card: {deck, front, back, ja, img, aud, stage "mcq"|"flip", mcqOk:[dates], intro: date first shown,
//        due ms, s stability (days), d difficulty 1-10, last ms, reps, lapses, lapseRun, created}
// reviewDays: one record a day {id "rv-YYYY-MM-DD", date, n, ok}, so the log stays small enough to sync.

import { S, live, put, remove, photos } from "./store.js";
import { HABITS } from "./data.js";
import * as E from "./engine.js";
import * as Lx from "./lexicon.js";
import * as N2 from "./n2.js";
import * as Mi from "./mined.js";

/* ---------- FSRS-4.5 ---------- */
const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5, FACTOR = 19 / 81; // at 90% retention the interval equals the stability
const clampD = d => Math.min(10, Math.max(1, d));
const d0 = g => clampD(W[4] - (g - 3) * W[5]);
export const retrievability = (days, s) => Math.pow(1 + FACTOR * days / s, DECAY);
// Next {s, d} for grade g (1 Again … 4 Easy), given the card's memory state and days since the last review.
export function nextState(c, g, now = Date.now()) {
  if (!c.s) return { s: W[g - 1], d: d0(g) };
  const t = Math.max(0, (now - (c.last || now)) / 864e5), R = retrievability(t, c.s), D = c.d;
  const d = clampD(W[7] * d0(4) + (1 - W[7]) * (D - W[6] * (g - 3)));
  let s;
  if (g === 1) s = Math.min(c.s, W[11] * Math.pow(D, -W[12]) * (Math.pow(c.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R)));
  else s = c.s * (Math.exp(W[8]) * (11 - D) * Math.pow(c.s, -W[9]) * (Math.exp(W[10] * (1 - R)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1) + 1);
  return { s, d };
}
export const intervalDays = s => Math.min(365, Math.max(1, Math.round(s)));
const dayStart = date => E.parse(date).getTime();
// Shown on the grade buttons: "10m", "3d", "2mo".
export function preview(c, g) {
  if (g === 1) return "10m";
  const n = intervalDays(nextState(c, g).s);
  return n < 30 ? n + "d" : n < 365 ? Math.round(n / 30) + "mo" : "1y";
}

/* ---------- decks and stages ---------- */
export const JA_RE = /[぀-ヿ㐀-鿿]/;
// The deck cards; Lexicon cards are listed in the Lexicon. v9: archived decks (settings.cards.archived) are left out.
export const cards = () => { const ar = (S.settings.cards && S.settings.cards.archived) || []; return live("cards").filter(c => !c.lex && !ar.includes(c.deck)); };

/* ---------- v8: Lexicon cards ----------
   A Lexicon card's record holds progress only. Its content comes from the imported decks on this phone. */
const CONTENT = ["L", "deck", "front", "back", "ja"];
const LEX_DECK = { v: "Vocabulary", k: "Kanji" };
// v12: a Lexicon or mined entry by card id ("m-…" cards are mined words with no Lexicon match, and sentences).
const lexEntry = id => String(id).startsWith("m-") ? Mi.entry(id) : Lx.entry(id);
export function hyd(rec) {
  const L = lexEntry(rec.id); if (!L) return null;
  const mined = !!L.mined || live("mined").some(m => m.link === rec.id);
  return { ...rec, L, mined, deck: L.mined ? (L.sent ? "Mined sentence" : "Mined") : L.level + " " + LEX_DECK[rec.lex] + (mined ? " · Mined" : ""), front: Lx.face(L), back: L.meaning || "", ja: true };
}
const lexKind = L => L.mined ? "m" : L.type === "kanji" ? "k" : "v";
const fresh = L => hyd({ id: L.id, lex: lexKind(L), stage: L.sent ? "flip" : "mcq", mcqOk: [], intro: null, due: 0, s: null, d: null, last: null, reps: 0, lapses: 0, lapseRun: 0, created: 0 });
// Saves a card; a Lexicon card loses its content first so only progress is stored and synced.
function store(c) {
  if (!c.lex) return put("cards", c);
  const r = { ...c }; CONTENT.forEach(k => delete r[k]); return put("cards", r);
}
// Any card by id: a deck card, a Lexicon card with progress, or a Lexicon card not yet seen.
export function get(id) {
  const c = live("cards").find(x => x.id === id);
  if (c) return c.lex ? hyd(c) : c;
  const L = lexEntry(id); return L ? fresh(L) : null;
}
// Turns a Lexicon card off ("I know it": never asked) or back on. Learning cards keep their history.
export function setOff(id, off) {
  const c = live("cards").find(x => x.id === id), L = lexEntry(id); if (!L) return;
  if (c) { if (!!c.off !== off) put("cards", { ...c, off }); }
  else if (off) put("cards", { id, lex: lexKind(L), off: true });
}
const lexSeen = () => live("cards").filter(c => c.lex && c.intro && !c.off).map(hyd).filter(Boolean);
// Today's new Lexicon cards: vocabulary N5 → N2 and kanji N3 → N2, skipping off and started cards.
// v8.1: the pace is the N2 plan row's (a ceiling, not a duty); settings.jp overrides it.
export const jp = () => ({ ...N2.pace(), ...(S.settings.jp || {}) });
// A heavy day: the due pile alone would take over 90 minutes, so no new cards today.
export const REVIEW_SEC = 10, HEAVY_MIN = 90;
export const heavy = dueN => dueN * REVIEW_SEC > HEAVY_MIN * 60;
// v12: new cards come in batches of 10. Continue · +10 cards opens the next batch, with no daily cap.
// Order in every batch: mined cards first (they come from Arin's own life), then the Lexicon (vocabulary and kanji
// in the N2 plan's word:kanji ratio), then any other deck's cards.
export const BATCH = 10;
const batch = () => S.settings.cards?.batch || BATCH;
function freshPool(t) {
  const m = Lx.recs(), out = [], seen = new Set();
  const add = c => { if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); } };
  for (const id of Mi.freshIds(m)) { const r = m.get(id); add(r ? hyd(r) : get(id)); }
  if (Lx.ready()) {
    const cfg = jp(), kr = (cfg.newKanji || 0) / Math.max(1, (cfg.newWords || 0) + (cfg.newKanji || 0));
    const it = type => Lx.order(type).filter(L => { const r = m.get(L.id); return !(r && (r.off || r.intro)) && !seen.has(L.id); });
    const V = it("vocab"), Kj = it("kanji"); let vi = 0, ki = 0;
    while (vi < V.length || ki < Kj.length) {
      const takeK = ki < Kj.length && (vi >= V.length || (ki + 1) / (vi + ki + 1) <= kr);
      const L = takeK ? Kj[ki++] : V[vi++], r = m.get(L.id); add(r ? hyd(r) : fresh(L));
      if (out.length > 400) break; // plenty for any number of batches today
    }
  }
  cards().filter(c => !c.intro).sort((a, b) => (a.created || 0) - (b.created || 0)).forEach(add);
  return out;
}
const introToday = t => live("cards").filter(c => c.intro === t && !c.off).length;
export const deckNames = () => [...new Set(cards().map(c => c.deck))].sort((a, b) => a.localeCompare(b, "ja"));
export const inDeck = deck => cards().filter(c => c.deck === deck);
const backs = deck => [...new Set(inDeck(deck).map(c => c.back.trim()))];
export const flipOnly = deck => backs(deck).length < 4;
// How the card is asked right now.
const canChoose = c => c.lex ? !!(c.L && !c.L.ref && !c.L.sent && ((c.L.dM || []).length || (c.L.dR || []).length)) : !flipOnly(c.deck);
export const mode = c => c.stage === "flip" || !canChoose(c) ? "flip" : "mcq";
// 4 options: the answer plus 3 other answers from the deck, shuffled once per card per day so a re-render keeps the order.
export function options(c) {
  const others = backs(c.deck).filter(b => b !== c.back.trim());
  let seed = [...(c.id + E.today())].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const pick = others.map(b => [rnd(), b]).sort((a, b) => a[0] - b[0]).slice(0, 3).map(x => x[1]);
  return [c.back.trim(), ...pick].map(b => [rnd(), b]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
}
// v8: the question for a choice card. Lexicon vocabulary alternates reading and meaning (kana-only words: meaning only);
// kanji alternates on-reading and meaning. Wrong options are the deck's close ones (dR / dM), topped up from the same level.
// Returns {q: "reading"|"meaning", ans, opts}. Stable until the card is answered (it turns on reps).
export function ask(c) {
  if (!c.lex) return { q: "meaning", ans: c.back.trim(), opts: options(c) };
  const L = c.L, kanji = L.type === "kanji";
  const rd = kanji ? (L.on || [])[0] : (L.readings || [])[0];
  const canR = !!rd && !(L.readings || []).includes(L.word) && /[一-龯々]/.test(Lx.face(L));
  const q = canR && (c.reps || 0) % 2 === 0 ? "reading" : "meaning";
  const ans = q === "reading" ? rd : L.meaning;
  let seed = [...(c.id + E.today() + (c.reps || 0))].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const wrong = [...new Set((q === "reading" ? L.dR : L.dM) || [])].filter(x => x && x !== ans).slice(0, 3);
  if (wrong.length < 3) { // top up from the same level (and part of speech when known)
    const pool = Lx.all(L.type).filter(x => x.level === L.level && x.id !== L.id && (!L.pos || !x.pos || x.pos === L.pos));
    for (let i = 0; i < 40 && wrong.length < 3 && pool.length; i++) {
      const x = pool[Math.floor(rnd() * pool.length)], v = q === "reading" ? (kanji ? (x.on || [])[0] : (x.readings || [])[0]) : x.meaning;
      if (v && v !== ans && !wrong.includes(v)) wrong.push(v);
    }
  }
  return { q, ans, opts: [ans, ...wrong].map(b => [rnd(), b]).sort((a, b) => a[0] - b[0]).map(x => x[1]) };
}
export const stageLabel = c => mode(c) === "mcq" ? `Choice · ${(c.mcqOk || []).length}/3` : c.s ? "Flip · due " + (c.due <= Date.now() ? "now" : E.fmtDate(E.ymd(new Date(c.due)))) : "Flip · new";

/* ---------- queue ---------- */
const settings = () => S.settings.cards || { newPerDay: 15 };
const AHEAD = 20 * 60000; // when nothing is due, cards coming back within 20 min are shown early
// v6: "Learn 10 new" raises today's new-card limit, for studying ahead. Returns how many new cards that opened.
const extraToday = () => { const x = settings().extra; return x && x.date === E.today() ? x.n : 0; };
export function learnMore(n = batch()) {
  const t = E.today(), open = Math.max(0, batch() + extraToday() - introToday(t)), left = freshPool(t).length - open;
  const add = Math.min(n, Math.max(0, left)); if (!add) return 0;
  S.settings.cards = { ...settings(), extra: { date: E.today(), n: extraToday() + add } }; S.settings.u = Date.now();
  return add;
}
export function queue(now = Date.now()) {
  const all = cards(), t = E.today();
  const seen = [...all.filter(c => c.intro), ...lexSeen()];
  let due = seen.filter(c => (c.due || 0) <= now);
  // A heavy due pile holds back the day's first batch; a batch opened with Continue still comes.
  const lim = (heavy(due.length) ? 0 : batch()) + extraToday() - introToday(t);
  const fresh = lim > 0 ? freshPool(t).slice(0, lim) : [];
  if (!due.length && !fresh.length) due = seen.filter(c => (c.due || 0) <= now + AHEAD);
  return [...due.sort((a, b) => (a.due || 0) - (b.due || 0)), ...fresh];
}
export const dueCount = deck => queue().filter(c => !deck || c.deck === deck).length;

/* ---------- answering ---------- */
// ok: a multiple-choice answer was right. Returns the XP/quest gains to announce.
export function answerMcq(c, ok, now = Date.now()) {
  const t = E.today();
  c.intro = c.intro || t; c.reps = (c.reps || 0) + 1; c.last = now;
  if (ok) {
    c.mcqOk = [...(c.mcqOk || []), t];
    if (c.mcqOk.length >= 3 && new Set(c.mcqOk).size >= 2) {
      // Graduates as if graded Good on its first flip review.
      const st = nextState({}, 3);
      Object.assign(c, { stage: "flip", s: st.s, d: st.d, lapseRun: 0, due: dayStart(E.addDays(t, intervalDays(st.s))), grad: t });
    } else c.due = c.mcqOk.filter(d => d === t).length >= 2 ? dayStart(E.addDays(t, 1)) : now + 10 * 60000;
  } else c.due = now + 60000;
  store(c);
  return logReview(ok, c.stage === "flip" && c.grad === t ? "Card graduated" : null);
}
export function answerFlip(c, g, now = Date.now()) {
  const t = E.today(), st = nextState(c, g, now);
  Object.assign(c, { s: st.s, d: st.d, last: now, intro: c.intro || t, reps: (c.reps || 0) + 1, stage: "flip" });
  if (g === 1) {
    c.lapses = (c.lapses || 0) + 1; c.lapseRun = (c.lapseRun || 0) + 1; c.due = now + 10 * 60000;
    // Two lapses in a row: back to multiple choice to rebuild it (unless the deck is too small for choices).
    if (c.lapseRun >= 2 && canChoose(c)) Object.assign(c, { stage: "mcq", mcqOk: [], lapseRun: 0, s: null, d: null });
  } else { c.lapseRun = 0; c.due = dayStart(E.addDays(t, intervalDays(st.s))); }
  store(c);
  return logReview(g > 1, null);
}

const XP_CAP = 50; // 1 XP per review, up to 50 a day
function logReview(ok, note) {
  const t = E.today(), id = "rv-" + t, gains = [];
  const r = live("reviewDays").find(x => x.id === id) || { id, date: t, n: 0, ok: 0 };
  r.n++; if (ok) r.ok++; put("reviewDays", r);
  const ref = "rev:" + t, ev = live("xpEvents").find(e => e.ref === ref), xp = Math.min(r.n, XP_CAP);
  if (ev) { if (ev.xp !== xp) put("xpEvents", { ...ev, xp }); }
  else put("xpEvents", { ts: Date.now(), type: "review", xp, ref, label: "Flashcard reviews" });
  if (note) gains.push({ xp: 0, label: note });
  // The due pile is empty: tick the daily quest once.
  if (!queue().length && !E.habitDone("anki", t)) {
    const h = put("habitLog", { date: t, habit: "anki", auto: true });
    gains.push(E.gainXP("habit", h.id, HABITS.find(x => x.id === "anki").name));
  }
  return gains;
}
export const reviewedToday = () => (live("reviewDays").find(x => x.id === "rv-" + E.today()) || { n: 0, ok: 0 });

/* ---------- adding ---------- */
// Adds cards, skipping any whose front is already in that deck. ids lets starter decks use fixed ids so two phones don't double them.
export function addCards(list, deck, ids) {
  const have = new Set(inDeck(deck).map(c => c.front.trim()));
  let n = 0;
  list.forEach(([front, back], i) => {
    front = String(front || "").trim(); back = String(back || "").trim();
    if (!front || !back || have.has(front)) return;
    have.add(front); n++;
    put("cards", newCard({ id: ids ? ids[i] : undefined, deck, front, back }));
  });
  return n;
}
export const newCard = ({ id, deck, front, back, img = null, aud = null }) =>
  ({ id, deck, front, back, ja: JA_RE.test(front) || JA_RE.test(back), img, aud, stage: "mcq", mcqOk: [], intro: null, due: 0, s: null, d: null, last: null, reps: 0, lapses: 0, lapseRun: 0, created: Date.now() });
// "front | back" per line (a tab works too).
export function parseBulk(text) {
  return String(text || "").split("\n").map(l => l.split(/\s*[|\t]\s*/)).filter(p => p.length >= 2 && p[0].trim() && p.slice(1).join(" | ").trim()).map(p => [p[0].trim(), p.slice(1).join(" | ").trim()]);
}
export async function deleteCard(c) {
  for (const m of [c.img, c.aud]) if (m) await photos.del(m).catch(() => {});
  remove("cards", c.id);
}

/* ---------- speech ---------- */
export function speak(text, rate = 0.9) {
  try {
    const ss = window.speechSynthesis; if (!ss) return false;
    ss.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = "ja-JP"; u.rate = rate;
    const v = ss.getVoices().find(v => /^ja/i.test(v.lang)); if (v) u.voice = v;
    ss.speak(u); return true;
  } catch (e) { return false; }
}
// The Japanese side of a card, for read-aloud.
export const jaText = c => JA_RE.test(c.front) ? c.front : JA_RE.test(c.back) ? c.back : "";

/* ---------- media in export ---------- */
const toDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
export async function mediaExport() {
  const out = {};
  for (const c of cards()) for (const m of [c.img, c.aud]) if (m) { const b = await photos.get(m).catch(() => null); if (b) out[m] = await toDataUrl(b); }
  return out;
}
export async function mediaImport(media) {
  let n = 0;
  for (const [id, url] of Object.entries(media || {})) {
    if (!/^c[am]-/.test(id) || typeof url !== "string" || !url.startsWith("data:")) continue;
    const blob = await (await fetch(url)).blob(); await photos.put(id, blob); n++;
  }
  return n;
}
