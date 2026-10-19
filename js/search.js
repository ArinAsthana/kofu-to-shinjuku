// v11: the search bar. Features (every screen, with aliases) and actions, matched forgivingly: prefix, word prefix,
// alias and one-typo matches ("repot" finds Report Card). The app supplies context (lock checks, live suggestions)
// and runs what's picked. Recent searches stay on this device (localStorage). No schema change.

// [name, hint, route, aliases, pixel icon]. Route "a:<act>:<id>" runs an app action instead of opening a screen.
const F = [
  ["Quests", "today's list", "home", "home today system list", "sword"],
  ["Notifications", "alerts", "alerts", "alerts bell inbox", "bell"],
  ["Profile", "level, titles, sleep", "profile", "level titles stats me sleep act escape kofu xp", "star"],
  ["Report Card", "grades and exam history", "report", "grades exam exams gpa results scores tests history", "star"],
  ["Drill", "mental math", "drill", "zetamac math mental arithmetic numbers", "sword"],
  ["The Path", "job readiness streams", "path", "path finance accounting sap murex case aptitude readiness streams gate floor arc", "flag"],
  ["Applications", "jobs and companies", "path/apps", "apps jobs apply companies es entry sheet", "flag"],
  ["Resources", "books and links", "path/res", "books links materials", "scroll"],
  ["Japanese", "JLPT ladder and N2 plan", "jlpt", "nihongo 日本語 にほんご jlpt n2 n3 grammar ladder raid", "flag"],
  ["Lexicon", "words and kanji", "lex", "vocab vocabulary kanji words dictionary sort", "scroll"],
  ["Review cards", "flashcards due", "cards/review", "review due anki cards srs flashcards", "scroll"],
  ["Flashcards", "decks", "cards", "decks cards flashcards", "scroll"],
  ["Study", "disciplines and chapters", "classes", "disciplines classes chapters boss quiz courses", "scroll"],
  ["Plan", "today's timeline", "plan", "calendar day schedule blocks timetable planner", "cal"],
  ["Week", "the week ahead", "plan/week", "week calendar", "cal"],
  ["People", "friends and rivals", "people", "friends social rivals ladder network", "people"],
  ["Moment log", "time with people", "people/log", "moments hangouts log", "people"],
  ["Battle log", "trials fought", "people/battle", "battle trials", "people"],
  ["Habit library", "habits to copy", "people/habits", "habits library", "people"],
  ["Appraisal", "rate how you're seen", "people/appraise", "appraise appraisal", "people"],
  ["Rate yourself", "your own scores", "people/me", "self rate me", "people"],
  ["Store", "money, bills, wishlist", "money", "money bank debt bills budget wishlist shop insurance loan savings", "coin"],
  ["Rewards", "spend XP", "money/rewards", "rewards xp shop treats", "chest"],
  ["Workout", "gym and runs", "train", "gym lift training exercise lifting", "sword"],
  ["Runs", "running log", "train/runs", "running run cardio", "sword"],
  ["Settings", "everything else", "settings", "settings options preferences gear", "gear"],
  ["Sync and backup", "Google sign-in", "settings/sync", "sync google sign in backup export import firebase account", "gear"],
  ["Alarms", "reminders", "settings/alarms", "alarms reminders notifications", "bell"],
  ["Phone limit", "screen time", "settings/usage", "usage phone limit screen time apps", "gear"],
  ["App updates", "version", "settings/update", "update version apk", "gear"],
  ["System Archives", "export, skip to stage", "settings/archives", "archives export stage skip", "gear"],
  // actions
  ["Japanese · 5 min", "start a session", "a:jpgo:5", "start japanese nihongo session 5", "bolt"],
  ["Japanese · 15 min", "start a session", "a:jpgo:15", "start japanese nihongo session 15", "bolt"],
  ["Japanese · 30 min", "start a session", "a:jpgo:30", "start japanese nihongo session 30", "bolt"],
  ["Drill · Classic", "2-minute run", "a:drillgo:classic", "drill classic zetamac start", "bolt"],
  ["Drill · Percent", "2-minute run", "a:drillgo:percent", "drill percent percentage start", "bolt"],
  ["Drill · Multiply+", "2-minute run", "a:drillgo:multiply", "drill multiply multiplication squares start", "bolt"],
  ["Drill · Growth", "2-minute run", "a:drillgo:growth", "drill growth cagr compound start", "bolt"],
  ["Drill · Fractions", "2-minute run", "a:drillgo:fractions", "drill fractions decimals start", "bolt"],
  ["Drill · Estimate", "2-minute run", "a:drillgo:estimate", "drill estimate estimation market sizing start", "bolt"],
  ["Drill · Mixed", "2-minute run", "a:drillgo:mixed", "drill mixed all start", "bolt"],
  ["Add to-do", "the System finds it a slot", "a:newtask:", "add task todo to-do new task", "bolt"],
  ["Add deadline", "with prep sessions", "a:dlform:", "add deadline due paper exam presentation", "bolt"],
  ["Add block", "class, shift, study, workout", "a:blockform:new", "add block class shift study timetable", "bolt"],
  ["Add exam result", "to the Report Card", "a:rcadd:", "add exam result score grade mark", "bolt"],
  ["Log a moment", "time with someone", "a:moment:", "log moment hangout met friend", "bolt"],
  ["Log workout", "today's session", "train", "log workout gym lift session", "bolt"],
  ["Today's brief", "the day at a glance", "a:brief:", "brief today morning overview", "eye"],
];
export const ITEMS = F.map(([name, hint, route, al, icon]) => ({ name, hint, route, icon, keys: [name, ...al.split(" ")].map(norm) }));
export function norm(s) { return String(s || "").toLowerCase().replace(/[·+\-_/]/g, " ").replace(/\s+/g, " ").trim(); }

// Edit distance (with swapped neighbours counting as one edit), for typo matches.
function lev(a, b, cap) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
function score(it, q) {
  const n = it.keys[0], words = it.keys.flatMap(k => k.split(" ")), qs = q.split(" ").filter(Boolean);
  if (n === q) return 1000;
  if (n.startsWith(q)) return 900 - n.length;
  // Every typed word has to match something: a word prefix, or a word with one typo (two for long words).
  let total = 0;
  for (const w of qs) {
    let best = 0;
    for (const x of words) {
      if (x === w) best = Math.max(best, 120);
      else if (x.startsWith(w)) best = Math.max(best, 100 - (x.length - w.length));
      else if (w.length >= 4) { const cap = w.length >= 7 ? 2 : 1, d = Math.min(lev(w, x.slice(0, w.length), cap), lev(w, x, cap)); if (d <= cap) best = Math.max(best, 60 - d * 15); }
    }
    if (!best) return 0;
    total += best;
  }
  return total + (n.split(" ").some(x => x.startsWith(qs[0])) ? 50 : 0) - it.route.startsWith("a:") * 5;
}
// Up to `n` matches, best first.
export function find(q, n = 6, extra = []) {
  q = norm(q); if (!q) return [];
  return [...ITEMS, ...extra].map(it => ({ it, s: score(it, q) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, n).map(x => x.it);
}
// The rest of the top match's name when the query is its prefix: "Rep" → "ort Card".
export function complete(q, top) {
  if (!q || !top || !top.name.toLowerCase().startsWith(q.toLowerCase())) return "";
  return top.name.slice(q.length);
}

/* ---------- recent searches ---------- */
const RK = "kts-recent";
export const recent = () => { try { return JSON.parse(localStorage.getItem(RK)) || []; } catch (e) { return []; } };
export function remember(it) {
  try { localStorage.setItem(RK, JSON.stringify([it.route, ...recent().filter(r => r !== it.route)].slice(0, 6))); } catch (e) {}
}
export const byRoute = r => ITEMS.find(it => it.route === r) || null;

/* ---------- v11.1: romaji → kana, so "taberu" finds 食べる ---------- */
const KANA = { a: "あ", i: "い", u: "う", e: "え", o: "お", ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ", sa: "さ", shi: "し", si: "し", su: "す", se: "せ", so: "そ",
  ta: "た", chi: "ち", ti: "ち", tsu: "つ", tu: "つ", te: "て", to: "と", na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の", ha: "は", hi: "ひ", fu: "ふ", hu: "ふ", he: "へ", ho: "ほ",
  ma: "ま", mi: "み", mu: "む", me: "め", mo: "も", ya: "や", yu: "ゆ", yo: "よ", ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ", wa: "わ", wo: "を", n: "ん", nn: "ん",
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご", za: "ざ", ji: "じ", zi: "じ", zu: "ず", ze: "ぜ", zo: "ぞ", da: "だ", di: "ぢ", du: "づ", de: "で", do: "ど",
  ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ", pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
  kya: "きゃ", kyu: "きゅ", kyo: "きょ", sha: "しゃ", shu: "しゅ", sho: "しょ", cha: "ちゃ", chu: "ちゅ", cho: "ちょ", nya: "にゃ", nyu: "にゅ", nyo: "にょ",
  hya: "ひゃ", hyu: "ひゅ", hyo: "ひょ", mya: "みゃ", myu: "みゅ", myo: "みょ", rya: "りゃ", ryu: "りゅ", ryo: "りょ", gya: "ぎゃ", gyu: "ぎゅ", gyo: "ぎょ",
  ja: "じゃ", ju: "じゅ", jo: "じょ", bya: "びゃ", byu: "びゅ", byo: "びょ", pya: "ぴゃ", pyu: "ぴゅ", pyo: "ぴょ", "-": "ー" };
// Hiragana for a romaji string, or "" when it isn't romaji.
export function kana(s) {
  s = String(s || "").toLowerCase().replace(/[āâ]/g, "aa").replace(/[ūû]/g, "uu").replace(/[ōô]/g, "ou").replace(/\s+/g, "");
  if (!/^[a-z-]+$/.test(s)) return "";
  let out = "", i = 0;
  while (i < s.length) {
    if (s[i] === s[i + 1] && !"aeioun".includes(s[i])) { out += "っ"; i++; continue; } // doubled consonant
    if (s[i] === "n" && s[i + 1] && !"aeiouy".includes(s[i + 1])) { out += "ん"; i++; continue; }
    const k = [3, 2, 1].map(n => s.slice(i, i + n)).find(x => KANA[x]); if (!k) return "";
    out += KANA[k]; i += k.length;
  }
  return out;
}
export const kata = h => h.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));

/* ---------- v11.1: typed commands, by simple rules ---------- */
const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], WD = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const ymdOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dateAt = (y, m, d) => { const x = new Date(y, m, d); return x.getMonth() === m ? ymdOf(x) : null; };
// A date at the end of `s`. Returns {date, rest} or null. Month-day without a year is the next one to come.
export function tailDate(s, t) {
  const T = new Date(t + "T12:00:00"), Y = T.getFullYear(), next = (m, d) => { const a = dateAt(Y, m, d); return a && a >= t ? a : dateAt(Y + 1, m, d); };
  const rules = [
    [/\s+(\d{4})-(\d{1,2})-(\d{1,2})$/, m => dateAt(+m[1], m[2] - 1, +m[3])],
    [/\s+(\d{1,2})\/(\d{1,2})$/, m => next(m[1] - 1, +m[2])],
    [/\s+([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?$/, m => MON.includes(m[1]) ? next(MON.indexOf(m[1]), +m[2]) : null],
    [/\s+(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*$/, m => MON.includes(m[2]) ? next(MON.indexOf(m[2]), +m[1]) : null],
    [/\s+today$/, () => t], [/\s+tomorrow$/, () => ymdOf(new Date(T.getTime() + 864e5))],
    [/\s+in\s+(\d{1,3})\s+days?$/, m => ymdOf(new Date(T.getTime() + m[1] * 864e5))],
    [/\s+(?:next\s+|on\s+)?([a-z]{3})[a-z]*$/, m => { const i = WD.indexOf(m[1]); if (i < 0) return null; const d = ((i - T.getDay() + 7) % 7) || 7; return ymdOf(new Date(T.getTime() + d * 864e5)); }],
  ];
  for (const [re, f] of rules) { const m = re.exec(s); if (m) { const date = f(m); if (date) return { date, rest: s.slice(0, m.index).replace(/\s+(due|on|by)$/, "").trim() }; } }
  return null;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
// Typed text → a command the app confirms before doing, or null (then it's just a search).
export function command(raw, t) {
  const s = String(raw || "").trim().replace(/\s+/g, " "), l = s.toLowerCase();
  let m;
  if ((m = /^(?:add )?(?:a )?(deadline|paper|exam|presentation) (.+)$/i.exec(s)) && (m[1].toLowerCase() !== "exam" || !/\d+\s*(\/|out of)\s*\d+\s*$/i.test(s))) {
    const d = tailDate(" " + m[2].toLowerCase(), t); if (!d || !d.rest) return null;
    const title = m[2].slice(0, d.rest.length).trim(), w = (m[1] + " " + title).toLowerCase();
    const kind = /paper|essay|report/.test(w) ? "paper" : /exam|test|midterm|final|quiz/.test(w) ? "exam" : /presentation|pitch|slides/.test(w) ? "presentation" : "other";
    return { kind: "deadline", title: cap(title), dlKind: kind, due: d.date };
  }
  if ((m = /^(?:add )?(?:to-?do|task) (.+?)(?: (\d{1,3}) ?(min|mins|m|h|hr|hours?))?$/i.exec(s))) {
    const mins = m[2] ? (/^h/i.test(m[3]) ? m[2] * 60 : +m[2]) : 30;
    return { kind: "task", title: cap(m[1]), mins: Math.min(600, Math.max(5, mins)) };
  }
  if ((m = /^move (.+?) to (\d{1,2})(?::(\d{2}))?$/i.exec(s)) && +m[2] < 24 && (m[3] == null || +m[3] < 60))
    return { kind: "move", block: m[1].trim(), start: `${String(m[2]).padStart(2, "0")}:${m[3] || "00"}` };
  if ((m = /^(?:exam|score|result|got) (.+?) (\d+(?:\.\d+)?) ?(?:\/|out of) ?(\d+(?:\.\d+)?)$/i.exec(s)) && +m[3] > 0)
    return { kind: "exam", name: cap(m[1].replace(/^(on|in|for) /i, "")), score: +m[2], of: +m[3] };
  return null;
}
