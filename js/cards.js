// Flashcards: Arin's own Anki variant. New cards are multiple choice (4 options, distractors from the same deck,
// the app grades). After 3 correct answers on 2+ different days a card graduates to a flip card scheduled with
// FSRS-4.5 (Again/Hard/Good/Easy). Two lapses in a row send it back to multiple choice. A deck with fewer than
// 4 different answers is flip only. Media (images, own voice) lives in the phone's photos store, never synced.
//
// card: {deck, front, back, ja, img, aud, stage "mcq"|"flip", mcqOk:[dates], intro: date first shown,
//        due ms, s stability (days), d difficulty 1-10, last ms, reps, lapses, lapseRun, created}
// reviewDays: one record a day {id "rv-YYYY-MM-DD", date, n, ok, nw new cards}, so the log stays small enough to sync.
// v13.3: pri (Arin's priority star: first in the queue, 92% retention), mcqConf (last rating after a right choice:
// guess|unsure|knew), gN (Guessed count), sugg (suggest the star: 2 Guessed or 2 lapses in a row), suggNo (dismissed).

import { S, live, put, remove, photos } from "./store.js";
import { HABITS } from "./data.js";
import * as E from "./engine.js";
import * as Lx from "./lexicon.js";
import * as N2 from "./n2.js";
import * as Mi from "./mined.js";

/* ---------- FSRS-4.5 ---------- */
const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5, FACTOR = 19 / 81; // at 90% retention the interval equals the stability
// v13.2: desired retention is a setting (settings.cards.retention, default 85%). Lower retention, longer intervals.
export const retention = () => { const r = S.settings.cards && S.settings.cards.retention; return r >= 0.7 && r <= 0.97 ? r : 0.85; };
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
export const PRI_RET = 0.92; // v13.3: starred cards come back more often
export const intervalDays = (s, pri) => Math.min(365, Math.max(1, Math.round(s / FACTOR * (Math.pow(pri ? Math.max(PRI_RET, retention()) : retention(), 1 / DECAY) - 1))));
const dayStart = date => E.parse(date).getTime();
// Shown on the grade buttons: "10m", "3d", "2mo".
export function preview(c, g) {
  if (g === 1) return "10m";
  const n = intervalDays(nextState(c, g).s, c.pri);
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
// v13.3: the priority star. Starring a card not yet seen keeps a progress record for it.
export function setPri(id, pri) {
  const c = live("cards").find(x => x.id === id), L = c && !c.lex ? null : lexEntry(id);
  if (c) { const r = { ...c, pri }; if (pri) delete r.sugg; return put("cards", r); }
  if (pri && L) put("cards", { id, lex: lexKind(L), pri: true });
}
export const unsugg = id => { const c = live("cards").find(x => x.id === id); if (c) put("cards", { ...c, suggNo: true }); };
// A look-alike to star with it: the first real-word option (dW) that shares a kanji and is a Lexicon card not starred.
export function pairOf(c) {
  if (!c || !c.L || !c.L.dW) return null;
  const ks = [...Lx.face(c.L)].filter(ch => /[一-龯々]/.test(ch)); if (!ks.length) return null;
  for (const x of c.L.dW) {
    if (!x.w || ![...x.w].some(ch => ks.includes(ch))) continue;
    const e = Lx.byWord(x.w, c.L.type); if (!e || e.id === c.id) continue;
    const r = live("cards").find(y => y.id === e.id); if (!(r && (r.pri || r.off))) return e;
  }
  return null;
}
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
  for (const r of m.values()) if (r.pri && !r.off && !r.intro) add(get(r.id)); // v13.3: starred, not yet seen
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
  return [...out.filter(c => c.pri), ...out.filter(c => !c.pri)];
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
// v13.2: kana spelling twins, for the trap options: dakuten, vowel length, small っ, small ゃゅょ.
const DK = "かがきぎくぐけげこごさざしじすずせぜそぞただちぢつづてでとどはばひびふぶへべほぼ", SM = "ゃやゅゆょよ";
const toH = s => s.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
const toK = s => s.replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
const VOW = { a: "かさたなはまやらわがざだばぱあ", i: "きしちにひみりぎじぢびぴい", u: "くすつぬふむゆるぐずづぶぷう", e: "けせてねへめれげぜでべぺえ", o: "こそとのほもよろごぞどぼぽお" };
const vowel = ch => Object.keys(VOW).find(v => VOW[v].includes(ch));
export function twin(word, rnd, not = []) {
  const kata = /^[ァ-ヶー・]+$/.test(word), h = toH(word), ops = [];
  [...h].forEach((ch, i) => {
    const d = DK.indexOf(ch); if (d >= 0) ops.push(() => h.slice(0, i) + DK[d % 2 ? d - 1 : d + 1] + h.slice(i + 1));
    const m = SM.indexOf(ch); if (m >= 0) ops.push(() => h.slice(0, i) + SM[m % 2 ? m - 1 : m + 1] + h.slice(i + 1));
    if (ch === "っ") ops.push(() => h.slice(0, i) + h.slice(i + 1));
    else if (i > 0 && /[かきくけこさしすせそたちつてとぱぴぷぺぽ]/.test(ch) && !"っんうーい".includes(h[i - 1])) ops.push(() => h.slice(0, i) + "っ" + h.slice(i));
    const v = vowel(ch), nx = h[i + 1];
    if ((ch === "う" && i > 0 && "uo".includes(vowel(h[i - 1]) || "")) || (ch === "い" && i > 0 && "ei".includes(vowel(h[i - 1]) || ""))) ops.push(() => h.slice(0, i) + h.slice(i + 1));
    else if ((v === "o" || v === "u") && nx !== "う" && i < h.length) ops.push(() => h.slice(0, i + 1) + "う" + h.slice(i + 1));
  });
  for (let k = 0; k < 12 && ops.length; k++) {
    const t = ops[Math.floor(rnd() * ops.length)]();
    const out = kata ? toK(t) : t;
    if (out !== word && !not.includes(out)) return out;
  }
  return null;
}
// What a wrong meaning really is, for the note after answering (dM options are other deck words' meanings).
let MEAN = null;
const byMeaning = (m, type) => { if (!MEAN) { MEAN = new Map(); for (const t of ["vocab", "kanji"]) for (const x of Lx.all(t)) if (!MEAN.has(t + x.meaning)) MEAN.set(t + x.meaning, x); } return MEAN.get(type + m) || null; };
// The note under each option once answered: "しゅみ = 趣味, hobby", "しゅめ: not a word (twin of しゅみ)".
export function optNote(a, i) {
  const x = a.info && a.info[i]; if (!x || x.kind === "ans") return "";
  if (x.kind === "twin") return (a.kanji ? "not a reading" : "not a word") + (x.of ? ` (twin of ${x.of})` : "");
  if (!x.w) return "";
  return a.q === "reading" ? `${x.w}, ${String(x.m || "").split(/;\s*/).slice(0, 2).join("; ")}` : `${x.w}${x.r && x.r !== x.w ? " (" + x.r + ")" : ""}`;
}
// v8: the question for a choice card. Lexicon vocabulary alternates reading and meaning (kana-only words: meaning only);
// kanji alternates on-reading and meaning. Returns {q: "reading"|"meaning", ans, opts, info}, stable until answered.
// v13.2: wrong options are real deck words first (dW: shared kanji, sound, level). A spelling twin never points to the
// answer: a reading question is (a) the answer and a real word, each with its twin, (b) 3 real words and a twin of a
// wrong one, or (c) 4 real words. Old decks without dW fall back to the close answers (dR / dM).
export function ask(c) {
  if (!c.lex) return { q: "meaning", ans: c.back.trim(), opts: options(c) };
  const L = c.L, kanji = L.type === "kanji";
  const rd = kanji ? (L.on || [])[0] : (L.readings || [])[0];
  const canR = !!rd && !(L.readings || []).includes(L.word) && /[一-龯々]/.test(Lx.face(L));
  const q = canR && (c.reps || 0) % 2 === 0 ? "reading" : "meaning";
  const ans = q === "reading" ? rd : L.meaning;
  let seed = [...(c.id + E.today() + (c.reps || 0))].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const mix = L => L.map(b => [rnd(), b]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const own = [...(L.readings || []), ...(L.on || []), ...(L.kun || [])];
  const used = new Set([ans]);
  const real = mix((L.dW || []).slice(0, 5)).map(x => ({ kind: "real", w: x.w, r: x.r, m: x.m, o: q === "reading" ? x.r : x.m }))
    .filter(x => x.o && !used.has(x.o) && !(q === "reading" && own.includes(x.o)) && (used.add(x.o), true));
  let out = null;
  if (real.length && q === "reading") {
    const n = Math.min(real.length, 3), lay = ["a", "b", "c"].slice(0, n)[Math.floor(rnd() * n)]; // b needs 2 real words, c needs 3
    const tw = (of, pre) => { const t = (pre || []).find(x => x && !used.has(x) && x.length > 0) || twin(of, rnd, [...used]); if (!t) return null; used.add(t); return { kind: "twin", o: t, of }; };
    if (lay === "a") { const t1 = tw(ans, L.dR), t2 = t1 && tw(real[0].o); if (t1 && t2) out = [{ kind: "ans", o: ans }, t1, real[0], t2]; }
    else if (lay === "b") { const t = tw(real[0].o); if (t) out = [{ kind: "ans", o: ans }, real[0], real[1], t]; }
    if (!out && real.length >= 3) out = [{ kind: "ans", o: ans }, ...real.slice(0, 3)];
  } else if (real.length && q === "meaning") {
    // Two look-alike words' meanings plus a near-synonym from the deck's close meanings.
    const syn = [...new Set(L.dM || [])].filter(x => x && !used.has(x)).slice(0, 1).map(m => { used.add(m); const e = byMeaning(m, L.type); return { kind: "real", o: m, w: e ? Lx.face(e) : "", r: e ? Lx.reading(e) : "", m }; });
    const ws = [...real.slice(0, 3 - syn.length), ...syn, ...real.slice(3 - syn.length)].slice(0, 3);
    if (ws.length === 3) out = [{ kind: "ans", o: ans }, ...ws];
  }
  if (!out) { // fallback: the close answers, topped up from the same level (and part of speech when known)
    const wrong = [...new Set((q === "reading" ? L.dR : L.dM) || [])].filter(x => x && x !== ans).slice(0, 3);
    if (wrong.length < 3) {
      const pool = Lx.all(L.type).filter(x => x.level === L.level && x.id !== L.id && (!L.pos || !x.pos || x.pos === L.pos));
      for (let i = 0; i < 40 && wrong.length < 3 && pool.length; i++) {
        const x = pool[Math.floor(rnd() * pool.length)], v = q === "reading" ? (kanji ? (x.on || [])[0] : (x.readings || [])[0]) : x.meaning;
        if (v && v !== ans && !wrong.includes(v)) wrong.push(v);
      }
    }
    out = [{ kind: "ans", o: ans }, ...wrong.map(o => { const e = q === "meaning" ? byMeaning(o, L.type) : null; return e ? { kind: "real", o, w: Lx.face(e), r: Lx.reading(e), m: o } : { kind: q === "reading" ? "twin" : "other", o, of: q === "reading" ? ans : "" }; })];
    if (q === "reading") out.forEach(x => { if (x.kind === "twin") x.of = ""; }); // old decks: don't say whose twin
  }
  const sh = mix(out);
  return { q, ans, opts: sh.map(x => x.o), info: sh, kanji };
}
// v13.2: the part-of-speech tag after answering, from JMdict codes ("n,vs", "v5,vt", "adj-na,n").
export function posLabel(pos) {
  const p = String(pos || "").split(",").filter(Boolean); if (!p.length) return "";
  const has = k => p.includes(k), out = [];
  if (has("v5") || has("v1") || has("vk") || has("vt") || has("vi")) out.push([has("v5") ? "godan verb" : has("v1") ? "ichidan verb" : has("vk") ? "くる verb" : "verb", has("vt") && has("vi") ? "transitive and intransitive" : has("vt") ? "transitive" : has("vi") ? "intransitive" : ""].filter(Boolean).join(", "));
  if (has("adj-i")) out.push("い-adjective");
  if (has("adj-na")) out.push("な-adjective");
  if (has("n") || has("n-t") || has("n-adv")) out.push(has("vs") ? "noun, する-verb" : "noun");
  else if (has("vs")) out.push("する-verb");
  if (has("adv") || has("adv-to")) out.push(has("adv-to") ? "adverb (と)" : "adverb");
  const rest = { exp: "expression", int: "interjection", conj: "conjunction", pn: "pronoun", ctr: "counter", prt: "particle", suf: "suffix", "n-suf": "suffix", pref: "prefix", "n-pref": "prefix", "adj-pn": "pre-noun adjective", "adj-no": "の-adjective", "adj-t": "たる-adjective", num: "number", "aux-v": "auxiliary verb" };
  for (const k of p) if (rest[k] && !out.includes(rest[k]) && (k !== "adj-no" || !out.length)) out.push(rest[k]);
  return out.slice(0, 3).join(" · ");
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
  return [...due.sort((a, b) => (b.pri ? 1 : 0) - (a.pri ? 1 : 0) || (a.due || 0) - (b.due || 0)), ...fresh];
}
export const dueCount = deck => queue().filter(c => !deck || c.deck === deck).length;

/* ---------- answering ---------- */
// ok: a multiple-choice answer was right. Returns the XP/quest gains to announce.
// v13.3: conf is the rating after a right answer. Guessed counts as wrong (it comes back in this session); Unsure
// counts as right but comes back once more in this session; Knew it is a plain right answer.
export function answerMcq(c, ok, now = Date.now(), conf = null) {
  const t = E.today(), isNew = !c.intro;
  c.intro = c.intro || t; c.reps = (c.reps || 0) + 1; c.last = now;
  if (conf) c.mcqConf = conf;
  if (conf === "guess") { ok = false; c.gN = (c.gN || 0) + 1; if (c.gN >= 2 && !c.pri) c.sugg = true; }
  if (ok) {
    c.mcqOk = [...(c.mcqOk || []), t];
    if (c.mcqOk.length >= 3 && new Set(c.mcqOk).size >= 2) {
      // Graduates as if graded Good on its first flip review.
      const st = nextState({}, 3);
      Object.assign(c, { stage: "flip", s: st.s, d: st.d, lapseRun: 0, due: dayStart(E.addDays(t, intervalDays(st.s, c.pri))), grad: t });
    } else c.due = c.mcqOk.filter(d => d === t).length >= 2 ? dayStart(E.addDays(t, 1)) : now + 10 * 60000;
    if (conf === "unsure") c.due = Math.min(c.due, now + 3 * 60000);
  } else c.due = now + 60000;
  store(c);
  return logReview(ok, c.stage === "flip" && c.grad === t ? "Card graduated" : null, isNew);
}
export function answerFlip(c, g, now = Date.now()) {
  const t = E.today(), st = nextState(c, g, now), isNew = !c.intro;
  Object.assign(c, { s: st.s, d: st.d, last: now, intro: c.intro || t, reps: (c.reps || 0) + 1, stage: "flip" });
  if (g === 1) {
    c.lapses = (c.lapses || 0) + 1; c.lapseRun = (c.lapseRun || 0) + 1; c.due = now + 10 * 60000;
    if (c.lapseRun >= 2 && !c.pri) c.sugg = true;
    // Two lapses in a row: back to multiple choice to rebuild it (unless the deck is too small for choices).
    if (c.lapseRun >= 2 && canChoose(c)) Object.assign(c, { stage: "mcq", mcqOk: [], lapseRun: 0, s: null, d: null });
  } else { c.lapseRun = 0; c.due = dayStart(E.addDays(t, intervalDays(st.s, c.pri))); }
  store(c);
  return logReview(g > 1, null, isNew);
}

// v13.2: a target word read in the daily passage counts as a Good review when the card is in flip stage, due today or
// tomorrow, wasn't learned today and wasn't credited today. No review XP: it's a bonus exposure. Returns true if credited.
export function creditPassage(id, now = Date.now()) {
  const r = live("cards").find(x => x.id === id); if (!r || r.off || r.stage !== "flip" || !r.s) return false;
  const t = E.today(); const c = get(id);
  if (c.intro === t || c.cred === t || (c.due || 0) >= dayStart(E.addDays(t, 2))) return false;
  const st = nextState(c, 3, now);
  Object.assign(c, { s: st.s, d: st.d, last: now, reps: (c.reps || 0) + 1, lapseRun: 0, cred: t, src: "passage", due: dayStart(E.addDays(t, intervalDays(st.s, c.pri))) });
  store(c); return true;
}

const XP_CAP = 50; // 1 XP per review, up to 50 a day
function logReview(ok, note, isNew) {
  const t = E.today(), id = "rv-" + t, gains = [];
  const r = live("reviewDays").find(x => x.id === id) || { id, date: t, n: 0, ok: 0 };
  r.n++; if (ok) r.ok++; if (isNew) r.nw = (r.nw || 0) + 1; put("reviewDays", r);
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
// v13.3: today against every other day studied. rank 1 = best day; best is the top other day (null on the first day).
export function dayStats() {
  const t = E.today(), days = live("reviewDays").filter(x => x.n > 0), T = reviewedToday();
  const others = days.filter(x => x.date !== t), best = others.reduce((b, x) => !b || x.n > b.n ? x : b, null);
  const rank = T.n ? others.filter(x => x.n > T.n).length + 1 : null;
  const last14 = Array.from({ length: 14 }, (_, i) => { const d = E.addDays(t, i - 13), r = days.find(x => x.date === d); return { date: d, n: r ? r.n : 0 }; });
  return { n: T.n, nw: T.nw || 0, ok: T.ok, rank, days: others.length + (T.n ? 1 : 0), best, record: !!(best && T.n > best.n), last14 };
}

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
