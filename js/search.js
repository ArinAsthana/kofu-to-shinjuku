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
