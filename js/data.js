// Static content. Only Arin's records are stored; everything here lives in code.

export const APP_ID = "kofu-to-shinjuku";
export const SCHEMA_VERSION = 3;

export const DATES = { start: "2026-10-01", jlpt: "2027-07-04", classesEnd: "2027-07-20", graduation: "2027-08-31" };

// Habit IDs match the old planner so its backup imports cleanly in v2.
export const HABITS = [
  { id: "anki", name: "Anki reviews", note: "Never skipped", target: 7, c: "var(--jp)" },
  { id: "jp", name: "Japanese grammar or reading", note: "25–40 min", target: 6, c: "var(--jp)" },
  { id: "fin", name: "Finance block", note: "90 min", target: 5, c: "var(--fin)" },
  { id: "math", name: "Mental math", note: "15 min", target: 6, c: "var(--fin)" },
  { id: "news", name: "News and markets", note: "15 min + one line in Obsidian", target: 5, c: "var(--fin)" },
  { id: "case", name: "Case or interview practice", note: "Aloud", target: 2, c: "var(--fin)" },
  { id: "gym", name: "Workout", note: "Ticks itself when you log a workout or run", target: 6, c: "var(--train)" },
];

export const XP = {
  habit: 10, topic: 25, genki: 25, grammar: 15, test: 50, outreach: 15, reply: 20,
  followup: 5, appAdded: 20, appStage: 30, workout: 20, pr: 40, money: 15, task: 10,
};
export const LEVEL_XP = 250;

export const DEFAULT_REWARDS = [
  "A favourite konbini snack",
  "An episode of something you're watching",
  "30 extra minutes of sleep tomorrow",
  "Study at a café instead of home",
  "An hour of guilt-free gaming or music",
];

export const AREAS = [
  ["push", "Push"], ["pull", "Pull"], ["legs", "Legs"], ["core", "Core and carry"],
  ["skills", "Skills"], ["mobility", "Mobility"],
];

// kind: load = kg × reps · level = progression level × reps · time = progression level × seconds
// rank: lower = easier / more basic within its area. Used to pick the "weaker" exercise on a circle switch.
export const LIBRARY = [
  // push
  { id: "bench", name: "Bench press", area: "push", kind: "load", rank: 3 },
  { id: "ohp", name: "Overhead press", area: "push", kind: "load", rank: 3 },
  { id: "incline-db", name: "Incline dumbbell press", area: "push", kind: "load", rank: 2, inc: 2 },
  { id: "db-press", name: "Dumbbell shoulder press", area: "push", kind: "load", rank: 2, inc: 2 },
  { id: "weighted-dip", name: "Weighted dip", area: "push", kind: "load", rank: 4 },
  { id: "pushup", name: "Push-up", area: "push", kind: "level", rank: 1,
    levels: ["Incline", "Full", "Diamond", "Archer", "Pseudo-planche", "One-arm (assisted)"] },
  { id: "dip", name: "Dip", area: "push", kind: "level", rank: 2, levels: ["Bench dip", "Negative", "Parallel bar", "Ring dip"] },
  { id: "pike-pushup", name: "Pike push-up", area: "push", kind: "level", rank: 2,
    levels: ["Pike", "Elevated pike", "Wall handstand push-up (partial)", "Wall handstand push-up"] },
  // pull
  { id: "row", name: "Barbell row", area: "pull", kind: "load", rank: 3 },
  { id: "pulldown", name: "Lat pulldown", area: "pull", kind: "load", rank: 1 },
  { id: "cable-row", name: "Seated cable row", area: "pull", kind: "load", rank: 1 },
  { id: "db-row", name: "One-arm dumbbell row", area: "pull", kind: "load", rank: 2, inc: 2 },
  { id: "weighted-pullup", name: "Weighted pull-up", area: "pull", kind: "load", rank: 4 },
  { id: "pullup", name: "Pull-up", area: "pull", kind: "level", rank: 2, levels: ["Negative", "Band-assisted", "Full", "Chest to bar", "Archer"] },
  { id: "chinup", name: "Chin-up", area: "pull", kind: "level", rank: 1, levels: ["Negative", "Band-assisted", "Full"] },
  { id: "aus-row", name: "Australian row", area: "pull", kind: "level", rank: 1, levels: ["Bent knees", "Straight legs", "Feet elevated"] },
  // legs
  { id: "squat", name: "Back squat", area: "legs", kind: "load", rank: 3 },
  { id: "front-squat", name: "Front squat", area: "legs", kind: "load", rank: 3 },
  { id: "deadlift", name: "Deadlift", area: "legs", kind: "load", rank: 4, inc: 5 },
  { id: "rdl", name: "Romanian deadlift", area: "legs", kind: "load", rank: 2 },
  { id: "bss", name: "Bulgarian split squat", area: "legs", kind: "load", rank: 2, inc: 2 },
  { id: "leg-press", name: "Leg press", area: "legs", kind: "load", rank: 1, inc: 5 },
  { id: "hip-thrust", name: "Hip thrust", area: "legs", kind: "load", rank: 1, inc: 5 },
  { id: "pistol", name: "Pistol squat", area: "legs", kind: "level", rank: 3, levels: ["To box", "Assisted", "Full"] },
  { id: "shrimp", name: "Shrimp squat", area: "legs", kind: "level", rank: 2, levels: ["Assisted", "Beginner", "Full"] },
  { id: "nordic", name: "Nordic curl", area: "legs", kind: "level", rank: 3, levels: ["Negative, banded", "Negative", "Full"] },
  // core and carry
  { id: "farmer", name: "Farmer carry", area: "core", kind: "load", rank: 2, inc: 4, repMin: 1, repMax: 3, repLabel: "lengths" },
  { id: "hlr", name: "Hanging leg raise", area: "core", kind: "level", rank: 2, levels: ["Knee raise", "Leg raise", "Toes to bar"] },
  { id: "ab-wheel", name: "Ab wheel", area: "core", kind: "level", rank: 2, levels: ["Knees, to wall", "Knees", "Standing, to wall", "Standing"] },
  { id: "hollow", name: "Hollow hold", area: "core", kind: "time", rank: 1, levels: ["Tuck", "One leg", "Full"] },
  { id: "plank", name: "Plank", area: "core", kind: "time", rank: 1, levels: ["Plank", "Long-lever plank", "RKC plank"] },
  // skills
  { id: "handstand", name: "Handstand", area: "skills", kind: "time", rank: 2,
    levels: ["Wall plank", "Chest to wall", "Kick-up, freestanding", "Freestanding hold"] },
  { id: "lsit", name: "L-sit", area: "skills", kind: "time", rank: 2, levels: ["Foot-supported", "Tuck", "One leg", "Full"] },
  { id: "crow", name: "Crow pose", area: "skills", kind: "time", rank: 1, levels: ["Crow", "Crane (straight arms)"] },
  { id: "muscle-up", name: "Muscle-up", area: "skills", kind: "level", rank: 4, levels: ["Transition drill", "Band-assisted", "Full"] },
  // mobility
  { id: "deep-squat", name: "Deep squat hold", area: "mobility", kind: "time", rank: 1, levels: ["Supported", "Free"] },
  { id: "bridge", name: "Bridge", area: "mobility", kind: "time", rank: 2, levels: ["Glute bridge", "Table top", "Bridge on head", "Full bridge"] },
  { id: "pancake", name: "Pancake stretch", area: "mobility", kind: "time", rank: 1, levels: ["Wide sit", "Pancake"] },
  { id: "hip-flexor", name: "Couch stretch", area: "mobility", kind: "time", rank: 1, levels: ["Couch stretch"] },
];

// Default rep ranges by kind. Time kind uses seconds.
export const RANGES = { load: [6, 10], level: [5, 12], time: [10, 60] };
export const DEFAULT_INC = 2.5;

// Slots share a rotation key, so heavy and moderate days use the same exercise.
export const SLOTS = {
  "upper-push1": { area: "push", kind: "load", def: "bench", label: "Push" },
  "upper-pull1": { area: "pull", kind: "load", def: "row", label: "Pull" },
  "upper-push2": { area: "push", kind: "load", def: "ohp", label: "Push 2" },
  "upper-pull2": { area: "pull", kind: "load", def: "pulldown", label: "Pull 2" },
  "upper-core": { area: "core", kind: "bw", def: "hlr", label: "Core" },
  "lower-squat": { area: "legs", kind: "load", def: "squat", label: "Squat" },
  "lower-hinge": { area: "legs", kind: "load", def: "rdl", label: "Hinge" },
  "lower-single": { area: "legs", kind: "load", def: "bss", label: "Single leg" },
  "lower-carry": { area: "core", kind: "load", def: "farmer", label: "Carry" },
  "cali-skill1": { area: "skills", kind: "bw", def: "handstand", label: "Skill" },
  "cali-skill2": { area: "skills", kind: "bw", def: "lsit", label: "Skill 2" },
  "cali-push": { area: "push", kind: "bw", def: "pushup", label: "Push" },
  "cali-pull": { area: "pull", kind: "bw", def: "pullup", label: "Pull" },
  "cali-core": { area: "core", kind: "bw", def: "ab-wheel", label: "Core" },
  "cali-legs": { area: "legs", kind: "bw", def: "pistol", label: "Legs" },
  "mob1": { area: "mobility", kind: "bw", def: "deep-squat", label: "Mobility" },
  "mob2": { area: "mobility", kind: "bw", def: "bridge", label: "Mobility 2" },
};

const UPPER = ["upper-push1", "upper-pull1", "upper-push2", "upper-pull2", "upper-core"];
const LOWER = ["lower-squat", "lower-hinge", "lower-single", "lower-carry"];

// Day of week: 0 = Sunday … 6 = Saturday. Heaviest work sits on Mon/Thu; Tue/Fri follow a night shift.
export const SPLIT = {
  1: { name: "Upper, heavy", where: "Gym, 11:40–15:30 gap", slots: UPPER },
  2: { name: "Lower, moderate", where: "Gym", slots: LOWER, postShift: true },
  3: { name: "Calisthenics: skills and upper", where: "Home or park, after class", slots: ["cali-skill1", "cali-skill2", "cali-push", "cali-pull", "cali-core"] },
  4: { name: "Lower, heavy", where: "Gym", slots: LOWER },
  5: { name: "Upper, moderate", where: "Gym", slots: UPPER, postShift: true },
  6: { name: "Calisthenics: skills and legs", where: "Home or park", slots: ["cali-skill1", "cali-skill2", "cali-legs", "cali-core", "mob1"], run: true },
  0: { name: "Calisthenics: mobility and run", where: "Home or park", slots: ["mob1", "mob2", "cali-skill1"], run: true },
};

export const RUN_GOAL_KM = 12;
export const MEALS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snack", "Snacks"]];
export const RPE = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];

/* ---------- money (schema 2) ---------- */
// Arin's first report (2026-10-10). Seeded once with fixed ids so syncing devices never duplicate it.
export const MONEY = { goal: 500000, debtStart: 142000 };
export const MONEY_SEED = [{ id: "seed-2026-10-10", u: 1, date: "2026-10-10", bank: 22000, debt: 142000 }];
export const BILL_SEED = [{ id: "seed-health", u: 1, name: "National health insurance", amount: null, freq: "month", kind: "insurance", paid: {} }];

/* ---------- skills ---------- */
// Skill levels are computed from what you log; nothing extra is stored.
// src: habit ids counted, or "run" (longest continuous km). at: totals that unlock each tier.
export const SKILLS = [
  { id: "jp", name: "Japanese", short: "JP", c: "mag", src: ["anki", "jp"], at: [5, 20, 50, 100, 180],
    tiers: ["Daily reps", "Grammar grind", "Reading stamina", "Keigo basics", "Interview Japanese"] },
  { id: "fin", name: "Finance", short: "FIN", c: "ind", src: ["fin", "news", "case"], at: [5, 20, 45, 80, 130],
    tiers: ["Accounting basics", "Market reader", "Modelling", "Valuation", "Case-ready"] },
  { id: "math", name: "Mind", short: "MIND", c: "cyan", src: ["math"], at: [5, 15, 35, 60, 100],
    tiers: ["Mental math I", "Mental math II", "Speed estimates", "Market sizing", "Under pressure"] },
  { id: "str", name: "Strength", short: "STR", c: "org", src: ["gym"], at: [3, 12, 30, 55, 90],
    tiers: ["First session", "Consistent", "Novice gains", "Intermediate", "Iron habit"] },
  { id: "end", name: "Endurance", short: "END", c: "lime", src: "run", at: [3, 5, 8, 10, 12],
    tiers: ["3 km", "5 km", "8 km", "10 km", "12 km"] },
];

// What tiers unlock. need: { skillId: tier }.
export const UNLOCKS = [
  { need: { jp: 2, fin: 1 }, title: "Read a 決算短信 (earnings brief) summary page" },
  { need: { fin: 2, math: 2 }, title: "Build a simple 3-statement model" },
  { need: { jp: 3, fin: 2 }, title: "Follow a Japanese earnings call with the slides" },
  { need: { str: 2, end: 2 }, title: "Train after a night shift without skipping" },
  { need: { jp: 4 }, title: "Write ES and emails in polite Japanese" },
  { need: { fin: 4, math: 3 }, title: "Value a listed Japanese company end to end" },
  { need: { jp: 5, fin: 5 }, title: "Pass a finance case interview in Japanese" },
  { need: { end: 5 }, title: "Run 12 km without stopping" },
];

// Creative ways to use skills together. Lit when both skills reach tier 2.
export const COMBOS = [
  { a: "jp", b: "fin", title: "60-second bilingual market brief", text: "Say today's Nikkei move in Japanese, then English. Record it; keep the best for interviews." },
  { a: "fin", b: "math", title: "Run your own savings as a model", text: "Use your money reports as real data: weekly pace, slippage, what-if on bills." },
  { a: "str", b: "jp", title: "Count sets in Japanese", text: "Reps, rest and weights out loud in Japanese. Free daily speaking practice." },
  { a: "math", b: "fin", title: "Headline to case question", text: "Turn one news story a day into a market-sizing question and solve it in 5 minutes." },
  { a: "end", b: "jp", title: "Shadowing runs", text: "Easy runs with Japanese podcasts, repeating lines on the way." },
  { a: "str", b: "math", title: "Plate math sprints", text: "Work out e1RM and next targets in your head before checking the app." },
];

/* ---------- timetable (schema 3) ---------- */
// Arin's fixed week, seeded once with fixed ids so syncing devices never duplicate it. Days: 0 = Sunday … 6 = Saturday.
// Locked blocks are things Arin can't move (school, work, sleep). Quest blocks are protected study and training time.
const blk = (id, title, kind, days, start, end, locked = false) => ({ id: "seed-" + id, u: 1, title, kind, days, date: null, start, end, locked });
export const BLOCK_SEED = [
  blk("class-mon-am", "Classes", "class", [1], "09:00", "11:40", true),
  blk("class-mon-pm", "Classes", "class", [1], "15:30", "18:10", true),
  blk("class-wed", "Classes", "class", [3], "09:00", "18:00", true),
  blk("shift", "FamilyMart night shift", "work", [1, 4], "22:00", "06:00", true),
  blk("sleep", "Sleep", "sleep", [0, 1, 3, 4, 6], "00:30", "08:00", true),
  blk("sleep-post-shift", "Sleep after shift", "sleep", [2, 5], "06:30", "12:30", true),
  blk("lift-mon", "Lift", "quest", [1], "11:50", "13:20"),
  blk("lift", "Lift", "quest", [2, 5], "13:30", "15:00"),
  blk("lift-thu", "Lift", "quest", [4], "10:00", "11:30"),
  blk("cali-wed", "Calisthenics", "quest", [3], "18:30", "19:30"),
  blk("cali", "Calisthenics", "quest", [0, 6], "10:00", "11:00"),
  blk("fin-mon", "Finance block", "quest", [1], "19:00", "20:30"),
  blk("fin-tue", "Finance block", "quest", [2, 5], "15:30", "17:30"),
  blk("fin-wed", "Finance block", "quest", [3], "20:00", "21:30"),
  blk("fin-thu", "Finance block", "quest", [4], "13:00", "16:00"),
  blk("fin-wknd", "Finance block", "quest", [0, 6], "11:30", "15:00"),
  blk("music", "Music club", "club", [2], "18:00", "20:00"),
  blk("friends", "Friends", "social", [5], "19:00", "23:00"),
];
export const PLAN_SETTINGS = { dayStart: "07:00", dayEnd: "23:30" };
export const WIND_DOWN = { on: true, mins: 60, notify: false };
