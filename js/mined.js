// v12: mining. Words and sentences Arin finds in real life, sent to Claude and added through the connector's
// add_mined tool. Arin's own content, so it syncs (store "mined"):
// {id, kind "word"|"sentence", word, reading, meaning, sentence, sentenceReading, sentenceEn, note, level, tags[], source,
//  dR[], dM[], link (Lexicon card id) | null, checked (matched against the Lexicon on this phone), created}
// A mined word that is also in the Lexicon stays one card (the Lexicon id), so each review counts in both lists.
// Anything else gets its own card "m-<id>" (lex "m"), progress only, content from here.

import { live, put } from "./store.js";
import * as E from "./engine.js";
import * as Lx from "./lexicon.js";

export const all = () => live("mined").sort((a, b) => (b.created || 0) - (a.created || 0));
export const byId = id => live("mined").find(m => m.id === id) || null;
// The card a mined entry studies with.
export const cardId = m => m.link || "m-" + m.id;
const kana = s => String(s || "").replace(/[・\s]/g, "");

// The Lexicon-shaped entry for an "m-" card. A sentence card asks the sentence; a word card carries its sentence.
export function entry(cid) {
  const m = String(cid).startsWith("m-") && byId(cid.slice(2)); if (!m) return null;
  const sent = m.kind === "sentence";
  return { id: cid, type: "vocab", mined: m.id, sent, level: m.level || null, word: sent ? m.sentence : m.word, readings: [sent ? m.sentenceReading : m.reading].filter(Boolean),
    meaning: sent ? m.sentenceEn : m.meaning, dR: m.dR || [], dM: m.dM || [], ex: sent ? "" : m.sentence || "", exR: sent ? "" : m.sentenceReading || "", exEn: sent ? "" : m.sentenceEn || "", note: m.note || "", tags: m.tags || [] };
}

// Matches new mined words against the Lexicon (only on a phone with the decks imported). A match switched off
// comes back on as new, because mining a word means it isn't known. Returns the words turned back on.
export function match() {
  if (!Lx.ready()) return [];
  const back = [], V = Lx.all("vocab"), cards = live("cards");
  for (const m of live("mined")) {
    if (m.checked) continue;
    let L = null;
    if (m.kind !== "sentence" && m.word) {
      const same = V.filter(e => !e.ref && (e.word === m.word || (e.readings || []).includes(m.word)));
      L = same.find(e => !m.reading || (e.readings || []).some(r => kana(r) === kana(m.reading))) || same[0] || null;
    }
    put("mined", { ...m, link: L ? L.id : null, checked: true });
    if (!L) continue;
    const c = cards.find(x => x.id === L.id);
    if (c && c.off) {
      put("cards", { id: c.id, lex: c.lex, off: false, stage: "mcq", mcqOk: [], intro: null, due: 0, s: null, d: null, last: null, reps: 0, lapses: 0, lapseRun: 0, created: 0 });
      back.push(m.word);
    }
  }
  return back;
}

// New mined cards waiting to be introduced, oldest mined first.
export function freshIds(recs) {
  return live("mined").sort((a, b) => (a.created || 0) - (b.created || 0)).map(cardId)
    .filter((id, i, L) => L.indexOf(id) === i).filter(id => { const r = recs.get(id); return !(r && (r.off || r.intro)); })
    .filter(id => !id.startsWith("m-") || entry(id));
}

// Japanese home: "Mined this week: 12 · 4 in your JLPT deck".
export function week(t = E.today()) {
  const from = E.parse(E.weekStart(t)).getTime(), L = live("mined").filter(m => (m.created || 0) >= from);
  return { n: L.length, deck: L.filter(m => m.link).length };
}
// Kanji bonus: mined words a kanji appears in.
export const seenIn = k => live("mined").filter(m => m.kind !== "sentence" && (m.word || "").includes(k)).map(m => m.word);
