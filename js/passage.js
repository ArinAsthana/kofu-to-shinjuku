// v13.2: the daily reading passage. Claude writes one each evening from the day's cards (new ones, lapses, then other
// reviews, up to about 25 target words) and saves it through the connector's add_passage tool. Store "passages":
// {id, date, title, text, reading, en, targets[{id, word, reading, meaning}], questions[{q, options, answer, why}],
//  picks[], tapped[], done, xp, credited, created}. v13.2 §5: with 2/3 or more right, each untapped target word that's due
// today or tomorrow counts as a Good review (cards.creditPassage); tapped words keep their normal review.

import { live, put } from "./store.js";
import * as E from "./engine.js";
import * as K from "./cards.js";

export const XP_Q = 5; // per right answer

export const all = () => live("passages").filter(p => p.text).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || 0) - (a.created || 0));
export const byId = id => live("passages").find(p => p.id === id) || null;
export const today = (t = E.today()) => all().find(p => p.date === t) || null;

// Text with the target words marked, as [{t, k}] runs: k is the target's index, or -1 for plain text. Longest word first.
export function runs(p) {
  const T = (p.targets || []).map((x, k) => ({ ...x, k })).filter(x => x.word).sort((a, b) => b.word.length - a.word.length);
  const out = []; let s = String(p.text || ""), buf = "";
  while (s) {
    const hit = T.find(x => s.startsWith(x.word));
    if (hit) { if (buf) out.push({ t: buf, k: -1 }); buf = ""; out.push({ t: hit.word, k: hit.k }); s = s.slice(hit.word.length); }
    else { buf += s[0]; s = s.slice(1); }
  }
  if (buf) out.push({ t: buf, k: -1 });
  return out;
}

// Answer question i. Once every question is answered the passage is done and pays XP_Q per right answer.
export function answer(p, i, pick) {
  if (p.done || (p.picks || [])[i] != null) return null;
  const picks = (p.picks || []).slice(); picks[i] = pick;
  const qs = p.questions || [], all = qs.length && qs.every((_, j) => picks[j] != null);
  const ok = qs.filter((q, j) => picks[j] === q.answer).length, xp = all ? ok * XP_Q : 0;
  const tapped = p.tapped || [], credited = all && ok >= qs.length * 2 / 3
    ? (p.targets || []).filter((x, k) => x.id && !tapped.includes(k)).map(x => x.id).filter(id => K.creditPassage(id)) : [];
  put("passages", { ...p, picks, done: !!all, xp, credited });
  if (!all) return null;
  const ref = "passage:" + p.id;
  if (xp && !live("xpEvents").some(e => e.ref === ref)) put("xpEvents", { ts: Date.now(), type: "jlpt", xp, ref, label: "Daily passage" });
  return { xp, ok, n: qs.length, credited: credited.length };
}
// Tapping a target word for its meaning: remembered, so that word gets no review credit.
export function tap(p, k) { if (p.done || (p.tapped || []).includes(k)) return; put("passages", { ...p, tapped: [...(p.tapped || []), k] }); }
