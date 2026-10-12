// Command bar parser. Turns a typed or spoken line into one proposal the user confirms before anything is saved.
// Rule-based and offline: it knows a fixed set of phrasings (see EXAMPLES). No network, no AI.

import { live } from "./store.js";
import * as E from "./engine.js";
import * as P from "./planner.js";

export const EXAMPLES = [
  "move the gym up an hour",
  "move lift to 4pm tomorrow",
  "push finance block back 30 min every week",
  "add music practice tue 6-8pm",
  "add task read Toyota report 1h due fri",
  "add Paco Rabanne 1 Million ¥9800 on Amazon to my wishlist",
];

const DAYS = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
const DAY_RE = "sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?";
// Words that name the same block. Keys are what people say, values match block titles.
const ALIAS = [[/\b(gym|workout|work out|lift(?:ing|s)?|weights|training)\b/, /lift|calisth|gym|workout/i], [/\b(cali|calisthenics)\b/, /calisth/i],
  [/\b(nap)\b/, /nap/i], [/\b(sleep|bed)\b/, /sleep/i], [/\b(shift|work|familymart|konbini)\b/, /shift|mart|work/i], [/\b(finance|study)\b/, /finance/i],
  [/\b(music|guitar|piano)\b/, /music/i], [/\b(class|classes|school|lecture)\b/, /class/i]];

let CASE = {}; // lowercase word -> word as typed, so titles keep "Toyota" and "Ken"
const cased = s => s.split(" ").map(w => CASE[w] || w).join(" ");
const cap = s => cased(s.replace(/\s+/g, " ").trim()).replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());

// "tonight", "tomorrow", "fri", "next monday" → date. Returns [date|null, text without it, explicitWeekday].
function takeDay(t) {
  const today = E.today();
  let m = t.match(/\b(today|tonight|this evening|this morning)\b/); if (m) return [today, t.replace(m[0], " "), null];
  m = t.match(/\b(tomorrow|tmrw?|tmr)\b/); if (m) return [E.addDays(today, 1), t.replace(m[0], " "), null];
  m = t.match(new RegExp(`\\b(?:on\\s+|this\\s+|next\\s+)?(${DAY_RE})\\b`)); if (m) {
    const want = DAYS[m[1]]; let d = today; for (let i = 0; i < 7; i++) { d = E.addDays(today, i); if (E.parse(d).getDay() === want) break; }
    if (/^next\s/.test(m[0]) && d === today) d = E.addDays(d, 7);
    return [d, t.replace(m[0], " "), want];
  }
  return [null, t, null];
}

// One clock time: "13:30", "1:30pm", "1pm", "noon". Returns minutes or null. `pmHint` nudges bare 1–7 to the afternoon.
function clock(s, pmHint) {
  s = s.trim(); if (s === "noon") return 720; if (s === "midnight") return 0;
  const m = s.match(/^(\d{1,2})(?::|\.)?(\d{2})?\s*(am|pm)?$/); if (!m) return null;
  let h = +m[1]; const mi = +(m[2] || 0), ap = m[3]; if (h > 24 || mi > 59) return null;
  if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0;
  if (!ap && !m[2] && pmHint && h >= 1 && h <= 7) h += 12;
  return (h % 24) * 60 + mi;
}
const TIME = "(?:noon|midnight|\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm)?)";
// "6-8pm", "18:00 to 20:00", "from 6 until 8". Returns [s, e, rest] or null. am/pm on the end applies to both.
function takeRange(t) {
  const m = t.match(new RegExp(`\\b(?:from\\s+)?(${TIME})\\s*(?:-|–|to|until|till)\\s*(${TIME})`)); if (!m) return null;
  const ap = (m[2].match(/am|pm/) || [""])[0];
  const s = clock(/am|pm/.test(m[1]) ? m[1] : m[1] + (ap && +m[1].split(/[:.]/)[0] <= +m[2].split(/[:.]/)[0] ? ap : ""), true), e = clock(m[2], true);
  return s === null || e === null ? null : [s, e, t.replace(m[0], " ")];
}
// "at 4pm" → [min, rest]
function takeAt(t) { const m = t.match(new RegExp(`\\b(?:at|@|to)\\s+(${TIME})(?!\\s*(?:min|h\\b|hour))`)); if (!m) return null; const v = clock(m[1], true); return v === null ? null : [v, t.replace(m[0], " ")]; }
// A lone "8pm" or "20:00" with no "at".
function takeBare(t) { const m = t.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2})\b/); if (!m) return null; const v = clock(m[1], true); return v === null ? null : [v, t.replace(m[0], " ")]; }
// "an hour", "1.5h", "90 min", "half an hour", "2 hours 30 min" → minutes
function takeDur(t) {
  let m = t.match(/\b(half an? hour|an? hour and a half|an? hour|quarter of an hour)\b/);
  if (m) return [{ "half an hour": 30, "half a hour": 30, "an hour and a half": 90, "a hour and a half": 90, "an hour": 60, "a hour": 60, "quarter of an hour": 15 }[m[1]] ?? 60, t.replace(m[0], " ")];
  m = t.match(/\b(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b(?:\s*(?:and\s*)?(\d+)\s*(m|min|mins|minutes)\b)?/);
  if (m) return [Math.round(+m[1] * 60 + +(m[3] || 0)), t.replace(m[0], " ")];
  m = t.match(/\b(\d+)\s*(m|min|mins|minute|minutes)\b/); if (m) return [+m[1], t.replace(m[0], " ")];
  return null;
}

// Blocks that match a spoken name, best first. Title words count most; aliases catch "gym" → "Lift".
function findBlocks(name) {
  const words = name.split(/\s+/).filter(w => w.length > 2 && !/^(the|my|session|block|time)$/.test(w));
  const ali = ALIAS.filter(([re]) => re.test(name)).map(a => a[1]);
  return live("blocks").map(b => {
    const ti = b.title.toLowerCase(); let sc = 0;
    if (ti === name) sc += 10; if (name && ti.includes(name)) sc += 5;
    for (const w of words) if (ti.includes(w)) sc += 2;
    for (const re of ali) if (re.test(b.title)) sc += 3;
    return { b, sc };
  }).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).map(x => x.b);
}
// The next date (from `from`, up to a week) this block runs on.
function nextOn(b, from) {
  for (let i = 0; i < 8; i++) { const d = E.addDays(from, i); if (P.segments(d).some(g => g.b.id === b.id && !g.tail)) return d; }
  return null;
}

/* ---------- intents ---------- */
function parseMove(t) {
  const m = t.match(/^(?:can you |please |pls )?(move|shift|push|bring|reschedule|change)\s+(.*)$/); if (!m) return null;
  // Drop the reason ("... I have music practice") so its words don't pick the wrong block.
  let rest = " " + m[2].replace(/(?:,|\s)\s*(?:i have|i've got|i got|because|cuz|cause|bc|since|as i|so i|so that)\b.*$/, "") + " ";
  const every = /\b(every week|every time|always|permanently|from now on|each week|weekly|every (?:sun|mon|tue|wed|thu|fri|sat)\w*)\b/.test(rest);
  rest = rest.replace(/\b(every week|every time|always|permanently|from now on|each week|weekly)\b/, " ").replace(/\bevery\s+/, " ");
  let date, wd; [date, rest, wd] = takeDay(rest);
  let delta = null, abs = null, range = takeRange(rest);
  if (range) rest = range[2];
  const dir = rest.match(/\b(up|earlier|forward|ahead|sooner|back|later|down|out)\b/);
  if (!range) {
    const at = takeAt(rest);
    if (at && !dir) { abs = at[0]; rest = at[1]; }
    else {
      const d = takeDur(rest); if (d) rest = d[1];
      const earlier = dir ? /up|earlier|forward|ahead|sooner/.test(dir[1]) : m[1] !== "push" && m[1] !== "bring" ? null : m[1] === "bring";
      if (earlier === null) return { error: "Say which way: up/earlier, back/later, or to a time.", hint: "move gym up an hour" };
      delta = (d ? d[0] : 60) * (earlier ? -1 : 1);
    }
  }
  if (dir) rest = rest.replace(dir[0], " ");
  const name = rest.replace(/\b(by|the|my|session|block|to|on|for|at)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return { error: "Which block? Say its name, like gym, lift or finance block." };
  const cands = findBlocks(name); if (!cands.length) return { error: `No block called "${name}" in the timetable.` };
  // Prefer the matching block that actually happens on the asked day (or soonest).
  const from = date || E.today();
  let best = null; for (const b of cands) { const d = nextOn(b, from); if (d && (!best || d < best.d || (date && d === date && best.d !== date))) best = { b, d }; if (date && d === date) break; }
  if (!best) return { error: `"${cands[0].title}" isn't on the timetable in the next week.` };
  if (date && best.d !== date) return { error: `${best.b.title} isn't on ${P.DAY_NAMES[E.parse(date).getDay()]}. Next one is ${P.DAY_NAMES[E.parse(best.d).getDay()]}.` };
  const b = best.b, s0 = P.toMin(b.start), e0 = P.toMin(b.end), len = ((e0 - s0) % 1440 + 1440) % 1440 || 1440;
  let s, e;
  if (range) [s, e] = range; else if (abs !== null) { s = abs; e = abs + len; } else { s = s0 + delta; e = s0 + delta + len; }
  const weekly = !b.date && (b.days || []).length;
  return { type: "move", block: b, date: best.d, start: P.toHM(s), end: P.toHM(e), scope: weekly ? (every || (wd !== null && !date) ? "week" : "day") : "one", weekly: !!weekly };
}

function parseWish(t) {
  if (!/\bwish ?list\b|\bwant list\b/.test(t)) return null;
  let rest = t.replace(/^(?:can you |please |pls )?(add|put|save|stick)\s+/, "").replace(/\s*(?:to|on|in|onto)\s+(?:my\s+|the\s+)?(?:wish ?list|want list)\b.*$/, "").replace(/\b(?:wish ?list)\b/, "");
  let price = null, m = rest.match(/(?:¥|jpy\s*|yen\s*)\s*([\d,]+(?:\.\d+)?)\s*(k|man|万)?|\b([\d,]+(?:\.\d+)?)\s*(k|man|万|yen|円)\b/);
  if (m) {
    const n = parseFloat((m[1] || m[3]).replace(/,/g, "")), u = m[2] || m[4] || "";
    price = Math.round(n * (u === "k" ? 1000 : u === "man" || u === "万" ? 10000 : 1)); rest = rest.replace(m[0], " ");
  } else if ((m = rest.match(/\s(?:for|at|costs?|price)\s+([\d,]{3,})\s*$/))) { price = +m[1].replace(/,/g, ""); rest = rest.replace(m[0], " "); }
  let shop = null; m = rest.match(/\b(?:on|from|at|off)\s+(amazon|rakuten|mercari|uniqlo|zozo(?:town)?|gu|muji|yahoo)\b/);
  if (m) { shop = m[1]; rest = rest.replace(m[0], " "); }
  rest = rest.replace(/\s(for|at|costs?)\s*$/, " ");
  const name = cap(rest.replace(/^(a|an|the|some)\s+/, ""));
  if (!name) return { error: "What should go on the wishlist?" };
  const q = encodeURIComponent(name);
  const link = shop === "amazon" ? "https://www.amazon.co.jp/s?k=" + q : shop === "rakuten" ? "https://search.rakuten.co.jp/search/mall/" + q : shop === "mercari" ? "https://jp.mercari.com/search?keyword=" + q : "";
  const kind = /\b(trip|flight|travel|holiday|vacation|ryokan|onsen|hotel)\b/i.test(name) ? "trip" : /\b(concert|dinner|ticket|class|lesson|show|festival|course)\b/i.test(name) ? "exp" : "item";
  return { type: "wish", name, price, kind, link, shop };
}

function parseTask(t) {
  let m = t.match(/^(?:can you |please |pls )?(?:add (?:a )?(?:task|todo|to-do|to do)|new task|task|todo|to-do|remind me to|i need to|i have to)\s*:?\s+(.+)$/)
    || t.match(/^(?:add|put)\s+(.+?)\s+(?:to|on|in)\s+(?:my\s+|the\s+)?(?:to-?do(?: list)?|to do(?: list)?|tasks?(?: list)?)\s*$/);
  if (!m) return null;
  let rest = " " + m[1] + " ", due = null, mins = 60;
  const dm = rest.match(new RegExp(`\\b(?:due|by|before|deadline)\\s+(today|tonight|tomorrow|tmrw?|(?:next\\s+)?(?:${DAY_RE}))\\b`));
  if (dm) { due = takeDay(dm[1])[0]; rest = rest.replace(dm[0], " "); }
  const d = takeDur(rest); if (d) { mins = P.TASK_LEN.reduce((a, x) => Math.abs(x - d[0]) < Math.abs(a - d[0]) ? x : a, 60); rest = d[1]; }
  rest = rest.replace(/\s(for|which takes|takes|taking)\s*$/, " ");
  const title = rest.replace(/\s+/g, " ").trim(); if (!title) return { error: "What's the task?" };
  const energy = /\b(email|call|buy|pay|book|text|message|send|laundry|clean|shop|groceries)\b/.test(title) ? "low" : "high";
  if (!d && energy === "low") mins = 15;
  const T = cased(title);
  return { type: "task", title: T[0].toUpperCase() + T.slice(1), mins, due, energy, prio: due ? 3 : 2 };
}

function parseAddBlock(t) {
  const m = t.match(/^(?:can you |please |pls )?(?:add|schedule|block|put|book)\s+(?:in\s+)?(.+)$/); if (!m) return null;
  let rest = " " + m[1] + " ";
  const every = /\b(every|each|weekly)\b/.test(rest);
  let date, wd; [date, rest, wd] = takeDay(rest.replace(/\b(every|each)\s+/, " ").replace(/\bweekly\b/, " "));
  let s, e; const r = takeRange(rest);
  if (r) { [s, e, rest] = r; } else { const at = takeAt(rest) || takeBare(rest); if (!at) return null; [s, rest] = at; const d = takeDur(rest); e = s + (d ? d[0] : 60); if (d) rest = d[1]; }
  const title = cap(rest.replace(/\b(at|on|for|from|in|the|my|to|timetable|calendar|schedule)\b/g, " "));
  if (!title) return { error: "Name the block." };
  const kind = /class|lecture|seminar/i.test(title) ? "class" : /shift|work/i.test(title) ? "work" : /nap/i.test(title) ? "nap" : /sleep/i.test(title) ? "sleep" : /date|hang|drinks|party|dinner|friends/i.test(title) ? "social" : /club|practice|music|band/i.test(title) ? "club" : "other";
  const weekly = every && wd !== null;
  return { type: "block", title, kind, date: weekly ? null : date || E.today(), days: weekly ? [wd] : [], start: P.toHM(s), end: P.toHM(e) };
}

export function parse(input) {
  CASE = {}; for (const w of String(input || "").replace(/[.!?,]+/g, " ").split(/\s+/)) if (w && w !== w.toLowerCase()) CASE[w.toLowerCase()] = w;
  const t = String(input || "").toLowerCase().replace(/[‘’]/g, "'").replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return parseWish(t) || parseTask(t) || parseMove(t) || parseAddBlock(t)
    || { error: "I didn't catch that. Try one of the examples below." };
}
