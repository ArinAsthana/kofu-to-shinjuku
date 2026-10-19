// v8: the Lexicon. Arin's Anki decks (N5–N2 vocabulary, N3–N2 kanji), converted offline with close wrong answers
// (dR readings, dM meanings) and imported once from a file. The content stays on this phone (IndexedDB, key "lexicon"):
// it is book material, so it's never in the public repo and never synced. Progress lives in the synced cards store,
// by card id only: {id, lex "v"|"k", off, stage, mcqOk, intro, due, s, d, …} (see cards.js).

import { lexKv, live } from "./store.js";

export const FORMAT = "the-arin-japanese-decks";
export const LEVELS = { vocab: ["N5", "N4", "N3", "N2"], kanji: ["N3", "N2"] };
let V = [], KJ = [], BY = new Map(), ORDER = { vocab: [], kanji: [] }, VER = 0;
export const LATEST = 2; // v13.2: real-word options, part of speech and example sentences

function set(d) {
  VER = d.version || 1;
  V = (d.vocab || []).filter(x => x && x.id); KJ = (d.kanji || []).filter(x => x && x.id);
  BY = new Map([...V, ...KJ].map(x => [x.id, x]));
  // New cards come level by level (N5 → N2), in deck order within a level.
  const by = (L, lv) => lv.flatMap(l => L.filter(x => x.level === l));
  ORDER = { vocab: by(V, LEVELS.vocab).filter(x => !x.ref), kanji: by(KJ, LEVELS.kanji) };
}
export async function load() { try { const d = await lexKv.get(); if (d) set(d); } catch (e) {} }
export async function importText(text) {
  let d; try { d = JSON.parse(text); } catch (e) { throw new Error("That file isn't JSON"); }
  if (!d || d.format !== FORMAT || !Array.isArray(d.vocab) || !Array.isArray(d.kanji)) throw new Error("That isn't the Japanese decks file");
  await lexKv.put(d); set(d);
  return { vocab: V.length, kanji: KJ.length };
}
export const ready = () => BY.size > 0;
export const version = () => VER;
export const entry = id => BY.get(id) || null;
export const all = type => type === "kanji" ? KJ : V;
export const order = type => ORDER[type];
export const face = L => L.type === "kanji" ? L.kanji : L.word;
export const reading = L => L.type === "kanji" ? [...(L.on || []), ...(L.kun || [])].join("、") : (L.readings || []).join("、");

/* ---------- status ---------- */
// One pass over the card records: id → record.
export const recs = () => new Map(live("cards").filter(c => c.lex).map(c => [c.id, c]));
// off · known (graduated, interval 3 weeks+) · learning · new
export function status(rec) {
  if (!rec) return "new";
  if (rec.off) return "off";
  if (rec.stage === "flip" && (rec.s || 0) >= 21) return "known";
  return rec.intro ? "learning" : "new";
}
export function counts(type, level, m = recs()) {
  const o = { all: 0, new: 0, learning: 0, known: 0, off: 0 };
  for (const L of all(type)) if (!level || L.level === level) { o.all++; o[status(m.get(L.id))]++; }
  return o;
}
// The rows the Lexicon shows for a type, level, status filter and search text.
export function rows(type, level, st = "all", q = "", m = recs()) {
  q = String(q || "").trim().toLowerCase();
  return all(type).filter(L => (!level || L.level === level) && (st === "all" || status(m.get(L.id)) === st)
    && (!q || face(L).includes(q) || reading(L).includes(q) || (L.meaning || "").toLowerCase().includes(q)));
}
