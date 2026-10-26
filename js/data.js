// Static content. Only Arin's records are stored; everything here lives in code.

export const APP_ID = "kofu-to-shinjuku";
export const SCHEMA_VERSION = 16;

export const DATES = { start: "2026-10-01", jlpt: "2027-07-04", classesEnd: "2027-07-20", graduation: "2027-08-31" };

// Habit IDs match the old planner so its backup imports cleanly in v2.
export const HABIT_DEFS = [
  { id: "anki", name: "Japanese: reviews + 10 new cards", note: "Ticks itself when the due pile and the first batch of new cards are done. The N2 item is on the Japanese screen", target: 7, c: "var(--jp)" },
  { id: "news", name: "News and markets", note: "15 min + one line in Obsidian", target: 5, c: "var(--fin)" },
  { id: "gym", name: "Workout", note: "Ticks itself when you log a workout or run", target: 6, c: "var(--train)" },
  // v13.1, retired as duplicates (redundancy cleanup): the N2 item is in the Japanese session, the Finance block is its
  // own quest, Mental Math is the Path item plus Drill, cases are the Path Case stream. Past ticks, streaks and XP stay.
  { id: "jp", retired: true, name: "Japanese: today's N2 item", note: "Ticks itself when you finish an item on the N2 plan", target: 6, c: "var(--jp)" },
  { id: "fin", retired: true, name: "Finance block", note: "90 min", target: 5, c: "var(--fin)" },
  { id: "math", retired: true, name: "Mental math", note: "15 min", target: 6, c: "var(--fin)" },
  { id: "case", retired: true, name: "Case or interview practice", note: "Aloud", target: 2, c: "var(--fin)" },
  // Life skills (v1.14), retired in v3: no longer shown or targeted, their past ticks stay in the data.
  { id: "stranger", retired: true, name: "Talk to a stranger", note: "Cashier, classmate, someone at the gym. Ask one question, then one follow-up", target: 3, c: "var(--warn)" },
  { id: "friend", retired: true, name: "Talk to a friend", note: "Call, meet or a real chat, not just a reaction. Ticks itself when you log a hangout", target: 4, c: "var(--warn)" },
  { id: "speak", retired: true, name: "Speak up", note: "Ask a question in class, give an opinion, or start the conversation", target: 2, c: "var(--warn)" },
];
export const HABITS = HABIT_DEFS.filter(h => !h.retired);

export const XP = {
  habit: 10, topic: 25, genki: 25, grammar: 15, test: 50, outreach: 15, reply: 20,
  followup: 5, appAdded: 20, appStage: 30, workout: 20, pr: 40, money: 15, task: 10, social: 15, cv: 50,
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
export const MONEY = { goal: 70000, debtStart: 142000 }; // v13.4: debt-free plus a ¥70k buffer by graduation
export const MONEY_SEED = [{ id: "seed-2026-10-10", u: 1, date: "2026-10-10", bank: 22000, debt: 142000 }];
export const BILL_SEED = [{ id: "seed-health", u: 1, name: "National health insurance", amount: null, freq: "month", kind: "insurance", paid: {} }];

/* ---------- skills ---------- */
// Skill levels are computed from what you log; nothing extra is stored.
// src: habit ids counted (retired ones too, so old ticks stay), "block:fin", "drill", "path:<stream>" (engine.js skillValue),
// or "run" (longest continuous km). at: totals that unlock each tier.
export const SKILLS = [
  { id: "jp", name: "Japanese", short: "JP", c: "mag", src: ["anki", "jp"], at: [5, 20, 50, 100, 180],
    tiers: ["Daily reps", "Grammar grind", "Reading stamina", "Keigo basics", "Interview Japanese"] },
  { id: "fin", name: "Finance", short: "FIN", c: "ind", src: ["fin", "news", "case", "block:fin", "path:case", "path:aptitude", "path:accounting", "path:sapmurex"], at: [5, 20, 45, 80, 130],
    tiers: ["Accounting basics", "Market reader", "Modelling", "Valuation", "Case-ready"] },
  { id: "math", name: "Mind", short: "MIND", c: "cyan", src: ["math", "drill", "path:mental"], at: [5, 15, 35, 60, 100],
    tiers: ["Mental math I", "Mental math II", "Speed estimates", "Market sizing", "Under pressure"] },
  { id: "str", name: "Strength", short: "STR", c: "org", src: ["gym"], at: [3, 12, 30, 55, 90],
    tiers: ["First session", "Consistent", "Novice gains", "Intermediate", "Iron habit"] },
  { id: "end", name: "Endurance", short: "END", c: "lime", src: "run", at: [3, 5, 8, 10, 12],
    tiers: ["3 km", "5 km", "8 km", "10 km", "12 km"] },
  { id: "cha", name: "Charisma", short: "CHA", c: "warn", src: ["stranger", "friend", "speak"], at: [5, 20, 45, 80, 130],
    tiers: ["Says hello", "Small talk", "Keeps it going", "Reads the room", "Magnetic"] },
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
  { need: { cha: 2, jp: 2 }, title: "Small talk with a stranger in Japanese" },
  { need: { cha: 3, fin: 2 }, title: "Hold a relaxed 30-minute OB visit" },
  { need: { cha: 4, jp: 4 }, title: "Work the room at a career event in Japanese" },
];

// Creative ways to use skills together. Lit when both skills reach tier 2.
export const COMBOS = [
  { a: "jp", b: "fin", title: "60-second bilingual market brief", text: "Say today's Nikkei move in Japanese, then English. Record it; keep the best for interviews." },
  { a: "fin", b: "math", title: "Run your own savings as a model", text: "Use your money reports as real data: weekly pace, slippage, what-if on bills." },
  { a: "str", b: "jp", title: "Count sets in Japanese", text: "Reps, rest and weights out loud in Japanese. Free daily speaking practice." },
  { a: "math", b: "fin", title: "Headline to case question", text: "Turn one news story a day into a market-sizing question and solve it in 5 minutes." },
  { a: "end", b: "jp", title: "Shadowing runs", text: "Easy runs with Japanese podcasts, repeating lines on the way." },
  { a: "cha", b: "jp", title: "Konbini and café conversations", text: "One extra sentence in Japanese with staff each visit. Low stakes, daily reps." },
  { a: "cha", b: "str", title: "Gym talk", text: "Ask someone for a spot or a form tip. Strangers at the gym are the easiest openers." },
  { a: "cha", b: "fin", title: "Explain a market move to a friend", text: "Tell a friend one money story this week in plain words. If they get it, an interviewer will." },
  { a: "str", b: "math", title: "Plate math sprints", text: "Work out e1RM and next targets in your head before checking the app." },
];

/* ---------- timetable (schema 3) ---------- */
// Arin's fixed week, seeded once with fixed ids so syncing devices never duplicate it. Days: 0 = Sunday … 6 = Saturday.
// Locked blocks are things Arin can't move (school, work, sleep). Quest blocks are protected study and training time.
const blk = (id, title, kind, days, start, end, locked = false) => ({ id: "seed-" + id, u: 1, title, kind, days, date: null, start, end, locked });
// 7.5 h sleep every night; workouts are 1 h; gym is reliably open 9:00–16:00 (till 20:00 on paper, hit or miss).
export const BLOCK_SEED = [
  blk("class-mon-am", "Classes", "class", [1], "09:00", "11:40", true),
  blk("class-mon-pm", "Classes", "class", [1], "15:30", "18:10", true),
  blk("class-wed", "Classes", "class", [3], "09:00", "18:10", true),
  blk("shift", "FamilyMart night shift", "work", [1, 4], "22:00", "06:00", true),
  blk("sleep", "Sleep", "sleep", [0, 1, 3, 4, 6], "00:30", "08:00", true),
  blk("sleep-post-shift", "Sleep after shift", "sleep", [2, 5], "06:30", "14:00", true),
  blk("nap-mon", "Nap before shift", "nap", [1], "19:00", "21:00", true),
  blk("lift-mon", "Lift", "quest", [1], "11:50", "12:50"),
  blk("lift", "Lift", "quest", [2, 5], "14:30", "15:30"),
  blk("lift-thu", "Lift", "quest", [4], "10:00", "11:00"),
  blk("cali-wed", "Calisthenics", "quest", [3], "18:30", "19:30"),
  blk("cali", "Calisthenics", "quest", [0, 6], "10:00", "11:00"),
  blk("fin-mon", "Finance block", "quest", [1], "13:15", "15:15"),
  blk("fin-tue", "Finance block", "quest", [2, 5], "15:45", "17:45"),
  blk("fin-wed", "Finance block", "quest", [3], "20:00", "21:30"),
  blk("fin-thu", "Finance block", "quest", [4], "13:00", "16:00"),
  blk("fin-wknd", "Finance block", "quest", [0, 6], "11:30", "15:00"),
  blk("music", "Music club", "club", [2], "18:00", "20:00"),
  blk("friends", "Friends", "social", [5], "19:00", "23:00"),
];
// buffer: free minutes kept around every block. openPad: a workout opens this early and stays open this late.
// lockMins: today's block can't be edited from this long before it starts until it ends.
export const PLAN_SETTINGS = { dayStart: "07:00", dayEnd: "23:30", buffer: 10, openPad: 10, lockMins: 15 };
export const WIND_DOWN = { on: true, mins: 60, notify: false };

/* ---------- care (schema 4) ---------- */
// Meds, skincare and teeth. days: [] = every day. Ordered thinnest to thickest within a slot.
export const CARE_SLOTS = [["am", "Morning"], ["amShower", "After morning shower"], ["pmShower", "After night shower"], ["pm", "Before bed"]];
const care = (id, name, slot, order, days = [], note = "") => ({ id: "seed-" + id, u: 1, name, slot, order, days, note });
export const CARE_SEED = [
  care("finasteride", "Finasteride", "am", 1),
  care("vitd", "Vitamin D", "am", 2, [5], "With breakfast"),
  care("brush-am", "Brush teeth", "am", 3),
  care("ha", "Hyaluronic acid", "amShower", 1, [], "On damp skin"),
  care("nia", "Niacinamide", "amShower", 2),
  care("aza", "Azelaic acid", "amShower", 3),
  care("spf", "Sunscreen", "amShower", 4, [], "Last step"),
  care("tret", "Tretinoin", "pmShower", 1, [], "On dry skin, pea-sized, keep off under-eyes"),
  care("cetaphil", "Cetaphil cream", "pmShower", 2),
  care("eye", "Under-eye hyaluronic", "pmShower", 3),
  care("brush-pm", "Brush teeth", "pm", 1),
  care("powder", "Whitening tooth powder", "pm", 2, [3, 5]),
];

/* ---------- social (schema 4) ---------- */
// Ranks like the Hunter Association: average of your criteria scores (1–5).
export const RANKS = [["S", 4.5, "mag"], ["A", 3.8, "org"], ["B", 3.0, "ind"], ["C", 2.2, "cyan"], ["D", 1.5, "lime"], ["E", 0, "dim"]];
export const PERSON_TYPES = [
  ["partner", "Partner", null], ["close", "Close friend", 7], ["friend", "Friend", 14],
  ["acq", "Acquaintance", 30], ["regular", "Recurring stranger", null],
];
// v2.5 traits (observable only). Communication became Engagement (scores carried over); Charisma and Ambition are
// retired: their old scores stay in the data, hidden. Gentleness starts fresh.
export const SOCIAL = { criteria: ["Engagement", "Gentleness", "Maturity", "Awareness", "Taste", "Reliability"] };
// Scoring key: how to read each criterion, and what 1–5 look like. -1 = "don't know" (left out of the average).
export const SOCIAL_KEY = {
  Communication: { read: "Listen to how they explain things and how they listen. Do they answer the actual question, ask follow-ups, and adjust to who they're talking to?",
    lv: ["Hard to follow, or talks over people", "Gets the point across with effort", "Clear, normal back-and-forth", "Clear and engaging, asks good questions", "Makes hard things simple; people feel heard"] },
  Engagement: { read: "Watch the conversation itself: do they ask questions back, build on what you said, and remember it next time? Do people stay in the conversation with them?",
    lv: ["Conversations die or turn into monologues", "Answers, but rarely asks back", "Normal back-and-forth, a few follow-ups", "Asks good questions, remembers details; people open up", "People seek them out to talk and leave feeling interesting"] },
  Gentleness: { read: "Brings out the best in others. Watch how people act around them: do they relax, speak up, try things? How do they treat staff, juniors, someone who's struggling?",
    lv: ["Makes people smaller: mocks, interrupts, corrects", "Neutral; neither lifts nor lowers anyone", "Kind and patient; puts people at ease", "Draws quiet people in, credits others, encourages", "People become their best around them"] },
  Maturity: { read: "Watch them under pressure and after mistakes: do they own it, stay calm, keep perspective, and disagree without sulking or keeping score?",
    lv: ["Blames, sulks or blows up", "Owns things sometimes; defensive under pressure", "Owns mistakes; steady most of the time", "Calm under pressure; disagrees without drama", "Grounded; others steady themselves on them"] },
  Awareness: { read: "Reads the room. Do they notice when someone is bored, uncomfortable or wants to leave, adjust topic and volume, and know when they're not wanted?",
    lv: ["Misses obvious signals; overstays", "Notices the big signals, late", "Reads most rooms and adjusts", "Catches subtle cues, exits gracefully, includes the person on the edge", "Sees the room before anyone; always the right move"] },
  Taste: { read: "Judge choices they made freely: how clothes fit and go together, music, places they pick, how their room or feed looks, what they recommend. Also: is it readable? Can people tell who they are and what they're into from it?",
    lv: ["No visible care, or choices clash", "Plain, safe defaults", "Put together, a few deliberate choices", "Distinct and consistent; you'd ask their opinion", "Sets the standard; people copy them"] },
  Charisma: { read: "Watch the room when they arrive or talk. Do people lean in, laugh, follow their lead? How do you feel after time with them?",
    lv: ["Fades into the background or drains energy", "Pleasant one-on-one, quiet in groups", "Easy to be around; holds a group", "People gravitate to them", "Changes the mood of any room"] },
  Reliability: { read: "Track record only, not intentions: on time, does what they said, replies, keeps what you tell them private.",
    lv: ["Often cancels, late, or leaks", "Hit and miss", "Usually shows up and follows through", "You can count on them", "Never drops anything; first call in a crisis"] },
  Ambition: { read: "What are they working toward, and what do they do about it every week? Talk alone caps at 2; action counts.",
    lv: ["No direction", "Talks about goals, little action", "A clear goal and steady effort", "Driven; visible progress", "Relentless; already ahead of their peers"] },
};

/* ---------- wishlist rewards (schema 5) ---------- */
// Buy wishlist items by spending XP (a wallet separate from level) out of a monthly fun budget that rolls over.
export const FUN = { monthly: 5000, yenPerXp: 20, start: null };

/* ---------- study blocks and penalties (schema 6) ---------- */
// focus/brk/long: pomodoro minutes, a long break after every `every` focus rounds.
// grace: minutes after a quest block ends to report it before the penalty lands. penaltyXp comes off the XP wallet.
export const STUDY = { focus: 25, brk: 5, long: 15, every: 4, grace: 60, penaltyXp: 30 };

// Each study block works through its subject's list in order: the first topic under 100% is the one you do.
// Edit the lists in Plan → Study. `do` is the method for the block, `out` what you end with, `src` where to study it.
// v13.1: Japanese has no study subject any more (Genki retired); it runs on cards and the N2 plan, with no block.
export const SUBJECTS = {
  // v13.1: the Finance syllabus (approved 2026-10-19). 30 topics in 5 modules, each with hours (h), a target date (by),
  // its own method (do) and output (out). The 12 topics the Path or Drill already teach were dropped; their old
  // progress stays in blockLog, hidden. When every topic is done, Finance blocks rotate reviews (study.js).
  fin: { name: "Finance", habit: null, match: "financ|valuation|modell?ing|accounting", topics: [
    { "id": "c4", "t": "Why finance, why Japan, why this firm, in English and Japanese", "module": "M1 Story and accounting depth", "h": 4, "by": "2026-10-22", "do": "Write each answer in 5 bullet points, EN then JP. Say each aloud 3 times and record the last take.", "out": "Three 60-second answers in both languages, recorded, matching the 自己紹介 / ガクチカ / 志望動機 milestone.", src: [["Mergers & Inquisitions", "https://mergersandinquisitions.com"]] },
    { "id": "c3", "t": "8 STAR stories from your own experience", "module": "M1 Story and accounting depth", "h": 6, "by": "2026-10-26", "do": "List 8 moments (FamilyMart, ICLA, music club, moving to Japan, this app). Write each as Situation, Task, Action, Result with a number in the result.", "out": "8 stories of under 2 minutes each, tagged by what they prove: leadership, failure, teamwork, pressure, initiative.", src: [["McKinsey interview prep and cases", "https://www.mckinsey.com/careers/interviewing"]] },
    { "id": "a2", "t": "Accruals, revenue recognition, matching", "module": "M1 Story and accounting depth", "h": 4, "by": "2026-10-29", "do": "Read the primer, then explain with 3 examples of your own: a gym membership, a konbini gift card, a 3-year software contract.", "out": "A one-page mind map and 5 questions answered aloud.", src: [["AccountingCoach", "https://www.accountingcoach.com"], ["Khan Academy finance", "https://www.khanacademy.org/economics-finance-domain"]] },
    { "id": "a4", "t": "Depreciation flow-through across all 3 statements", "module": "M1 Story and accounting depth", "h": 3, "by": "2026-10-31", "do": "Walk ¥10 of depreciation through IS, CF and BS, with and without tax. Then do inventory write-down and a debt-funded capex the same way.", "out": "The 'depreciation goes up ¥10' answer said cleanly in under 60 seconds, recorded.", src: [["Mergers & Inquisitions", "https://mergersandinquisitions.com"], ["Wall Street Prep knowledge base", "https://www.wallstreetprep.com/knowledge/"]] },
    { "id": "a3", "t": "Working capital and the cash conversion cycle", "module": "M1 Story and accounting depth", "h": 4, "by": "2026-11-03", "do": "Compute DSO, DIO, DPO and CCC for Seven & i or FamilyMart's parent from its annual report.", "out": "A CCC table for one real Japanese company and a 2-minute explanation of why it matters.", src: [["CFI free courses and guides", "https://corporatefinanceinstitute.com"], ["AccountingCoach", "https://www.accountingcoach.com"]] },
    { "id": "c5", "t": "Follow one Japanese company and 3 deals every week", "module": "M1 Story and accounting depth", "h": 3, "by": "2026-11-05", "do": "Pick your anchor company (one you'd apply to). Set up an Obsidian page: business, segments, last results, share price, 3 recent deals in its sector.", "out": "The tracker page and the first weekly write-up. From here the News daily quest keeps it going.", src: [["TDnet (決算短信)", "https://www.release.tdnet.info"], ["EDINET (有価証券報告書)", "https://disclosure2.edinet-fsa.go.jp"]] },
    { "id": "a6", "t": "Read a 決算短信 and a 有価証券報告書", "module": "M1 Story and accounting depth", "h": 5, "by": "2026-11-08", "do": "Take your anchor company's latest 決算短信 and 有報 from TDnet/EDINET. Find revenue, OP, net income, guidance, segment data and the cash flow statement.", "out": "A one-page summary in English with every number cited to a page.", src: [["EDINET (有価証券報告書)", "https://disclosure2.edinet-fsa.go.jp"], ["TDnet (決算短信)", "https://www.release.tdnet.info"]] },
    { "id": "a7", "t": "J-GAAP vs IFRS: the differences that come up", "module": "M1 Story and accounting depth", "h": 3, "by": "2026-11-10", "do": "Goodwill amortisation, leases, R&D, extraordinary items. Check which standard your anchor company uses.", "out": "A 6-row comparison table and 3 interview-ready lines.", src: [["RSM: IFRS vs J-GAAP", "https://www.rsm.global/japan/shiodome/en/node/541"], ["PwC: IFRS vs JP GAAP (PDF)", "https://www.pwc.com/jp/ja/knowledge/ifrs/publication/assets/pdf/similarities-and-differences-2020-en.pdf"]] },
    { "id": "b1", "t": "Time value of money, NPV, IRR", "module": "M2 Valuation core", "h": 5, "by": "2026-11-14", "do": "Damodaran PV primer. Do 10 problems by hand, then the same in Excel (NPV, XNPV, IRR, XIRR).", "out": "A worked sheet and the 'why IRR can mislead' answer aloud.", src: [["Damodaran PV primer", "http://people.stern.nyu.edu/adamodar/New_Home_Page/PVPrimer/pvprimer.htm"], ["MIT OCW 15.401 Finance Theory", "https://ocw.mit.edu/courses/15-401-finance-theory-i-fall-2008/"]] },
    { "id": "b2", "t": "Cost of capital and WACC", "module": "M2 Valuation core", "h": 5, "by": "2026-11-17", "do": "Build WACC for your anchor company: JGB 10y as risk-free, a beta from a data site, Damodaran's Japan ERP, its real cost of debt.", "out": "A WACC tab with every input sourced.", src: [["Damodaran Online (free classes)", "https://pages.stern.nyu.edu/~adamodar/New%5FHome%5FPage/home.htm"], ["Wall Street Prep knowledge base", "https://www.wallstreetprep.com/knowledge/"]] },
    { "id": "b3", "t": "DCF end to end", "module": "M2 Valuation core", "h": 16, "by": "2026-11-29", "do": "Unlevered FCF forecast 5 years, terminal value both ways (Gordon and exit multiple), discount with your WACC, bridge to a per-share value.", "out": "A full DCF of your anchor company in Excel, and a 3-minute walk-through recorded.", src: [["Damodaran Online (free classes)", "https://pages.stern.nyu.edu/~adamodar/New%5FHome%5FPage/home.htm"], ["Wall Street Prep knowledge base", "https://www.wallstreetprep.com/knowledge/"]] },
    { "id": "t3", "t": "Excel: sensitivity tables and scenario switches", "module": "M2 Valuation core", "h": 3, "by": "2026-12-01", "do": "Add a WACC × terminal growth data table and a base/bull/bear switch to your DCF.", "out": "The DCF with a sensitivity table and working scenarios.", src: [["Wall Street Prep knowledge base", "https://www.wallstreetprep.com/knowledge/"]] },
    { "id": "b4", "t": "Comparable companies and precedent transactions", "module": "M2 Valuation core", "h": 10, "by": "2026-12-08", "do": "Pick 5 peers of your anchor company. Pull EV/EBITDA, EV/Sales and P/E. Find 3 sector deals and their multiples.", "out": "A comps sheet, a football field chart and a valuation range.", src: [["Wall Street Prep knowledge base", "https://www.wallstreetprep.com/knowledge/"], ["Mergers & Inquisitions", "https://mergersandinquisitions.com"]] },
    { "id": "b5", "t": "Enterprise value to equity value bridge", "module": "M2 Valuation core", "h": 3, "by": "2026-12-10", "do": "Cash, debt, minorities, preferreds, equity investments, and the Japanese cross-shareholding twist.", "out": "The bridge for your anchor company and the answer to 'why add cash back?' aloud.", src: [["Wall Street Prep knowledge base", "https://www.wallstreetprep.com/knowledge/"], ["Mergers & Inquisitions", "https://mergersandinquisitions.com"]] },
    { "id": "c1", "t": "50 accounting technical questions, answered aloud", "module": "M2 Valuation core", "h": 12, "by": "2026-12-18", "do": "Mergers & Inquisitions / WSP guides. 10 questions a block: answer aloud first, then check, and mine every miss into a flashcard.", "out": "50 answered, misses carded, and a timed run of 10 random ones at 80%+.", src: [["Mergers & Inquisitions", "https://mergersandinquisitions.com"], ["Wall Street Prep knowledge base", "https://www.wallstreetprep.com/knowledge/"]] },
    { "id": "c2", "t": "50 valuation technical questions, answered aloud", "module": "M2 Valuation core", "h": 12, "by": "2026-12-27", "do": "Same method as the accounting set.", "out": "50 answered, misses carded, and a timed run of 10 random ones at 80%+.", src: [["Mergers & Inquisitions", "https://mergersandinquisitions.com"], ["Wall Street Prep knowledge base", "https://www.wallstreetprep.com/knowledge/"]] },
    { "id": "b6", "t": "M&A: synergies, accretion and dilution", "module": "M3 Deals and corporate finance", "h": 6, "by": "2026-12-31", "do": "Build a one-tab accretion/dilution model for a real Japanese deal (cash vs stock).", "out": "The model and a 2-minute 'is this deal accretive?' answer.", src: [["Wall Street Prep knowledge base", "https://www.wallstreetprep.com/knowledge/"], ["Mergers & Inquisitions", "https://mergersandinquisitions.com"]] },
    { "id": "b7", "t": "Paper LBO", "module": "M3 Deals and corporate finance", "h": 5, "by": "2027-01-03", "do": "Do the WSP paper LBO exercises by hand with a timer, then one in Excel.", "out": "3 paper LBOs in under 10 minutes each.", src: [["WSP paper LBO tutorial", "https://www.wallstreetprep.com/knowledge/the-paper-lbo-practice-exercises-to-ace-the-private-equity-interview/"]] },
    { "id": "b8", "t": "Budgeting, forecasting, variance analysis", "module": "M3 Deals and corporate finance", "h": 5, "by": "2027-01-07", "do": "Use your own Money tracker data: build a monthly budget, a forecast to graduation and a variance table.", "out": "A budget vs actual sheet for your own money, which is also an FP&A interview story.", src: [["CFI free courses and guides", "https://corporatefinanceinstitute.com"]] },
    { "id": "b9", "t": "Macro refresh: BoJ, rates, yen, inflation", "module": "M3 Deals and corporate finance", "h": 4, "by": "2027-01-10", "do": "BoJ's latest outlook report and policy statement. Link rates, yen and exporters' earnings.", "out": "A one-page macro view you can say in 90 seconds, updated monthly from here.", src: [["Bank of Japan (English)", "https://www.boj.or.jp/en/"], ["Yale: Shiller Financial Markets", "https://oyc.yale.edu/economics/econ-252"]] },
    { "id": "b10", "t": "Micro for cases: pricing, elasticity, market structure", "module": "M3 Deals and corporate finance", "h": 4, "by": "2027-01-12", "do": "Khan Academy micro. Apply each idea to one Japanese market (convenience stores, rail, telecom).", "out": "5 one-line examples you can drop into a case.", src: [["Khan Academy micro and macro", "https://www.khanacademy.org/economics-finance-domain"]] },
    { "id": "t4", "t": "PowerPoint: action titles, Pyramid Principle, ghost decks", "module": "M4 Communicate and perform", "h": 4, "by": "2027-01-15", "do": "Learn the Pyramid Principle. Ghost-deck your anchor company DCF as 5 slides: titles only first.", "out": "A 5-slide ghost deck where the titles alone tell the story.", src: [["Pyramid Principle for slides", "https://pptproductivity.com/blog/how-to-create-effective-consulting-slides-using-minto-principles"]] },
    { "id": "t5", "t": "PowerPoint: rebuild 3 slides from a real company IR deck", "module": "M4 Communicate and perform", "h": 4, "by": "2027-01-18", "do": "Pick 3 busy slides from a TDnet IR deck and rebuild them clean, consulting style.", "out": "3 before/after slides for your portfolio.", src: [["TDnet (IR decks, 決算短信)", "https://www.release.tdnet.info"]] },
    { "id": "c7", "t": "Timed Excel modeling test", "module": "M4 Communicate and perform", "h": 6, "by": "2027-01-22", "do": "Do a 90-minute timed 3-statement build from a case prompt (WSP or ASimpleModel).", "out": "One timed model finished, balanced, with a list of what slowed you down.", src: [["Wall Street Prep knowledge base", "https://www.wallstreetprep.com/knowledge/"], ["Exceljet", "https://exceljet.net"]] },
    { "id": "c8", "t": "10 mock interviews", "module": "M4 Communicate and perform", "h": 12, "by": "2027-01-31", "do": "Mix: 4 technical, 3 behavioural, 3 case. Use classmates, career center, OB訪問 contacts or record yourself. Log each in Outreach.", "out": "10 mocks logged with one fix per mock.", src: [["McKinsey interview prep and cases", "https://www.mckinsey.com/careers/interviewing"], ["Mergers & Inquisitions", "https://mergersandinquisitions.com"]] },
    { "id": "t6", "t": "SQL basics: SELECT, JOIN, GROUP BY", "module": "M5 Tools and AI", "h": 10, "by": "2027-02-07", "do": "CS50 SQL weeks 0 to 2. Query a public stock-price dataset.", "out": "10 queries on real financial data in a GitHub repo.", src: [["Harvard CS50 SQL", "https://cs50.harvard.edu/sql/"]] },
    { "id": "t7", "t": "Python with pandas on real financial data", "module": "M5 Tools and AI", "h": 16, "by": "2027-02-18", "do": "Kaggle Python and Pandas. Pull your anchor company's prices, compute returns, volatility and a chart.", "out": "A notebook on GitHub that you can explain line by line.", src: [["Kaggle Learn: Python, Pandas", "https://www.kaggle.com/learn"]] },
    { "id": "t8", "t": "AI: prompting fundamentals and checking AI output", "module": "M5 Tools and AI", "h": 3, "by": "2027-02-20", "do": "Anthropic Academy prompting course.", "out": "A one-page checklist for checking AI numbers.", src: [["Anthropic Academy (free)", "https://anthropic.skilljar.com"], ["Prompting guide", "https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview"]] },
    { "id": "t9", "t": "AI: summarise a 決算短信 with AI, verify every number against the source", "module": "M5 Tools and AI", "h": 3, "by": "2027-02-22", "do": "Run your checklist on your anchor company's latest 決算短信.", "out": "An AI summary with every number ticked against the PDF, and the errors it made listed.", src: [["TDnet (IR decks, 決算短信)", "https://www.release.tdnet.info"], ["Anthropic Academy (free)", "https://anthropic.skilljar.com"]] },
    { "id": "t10", "t": "AI portfolio: write up the Kofu to Shinjuku app as a CV project", "module": "M5 Tools and AI", "h": 4, "by": "2027-02-25", "do": "Write this app (Kofu to Shinjuku) up as a CV project: problem, what it does, stack, results.", "out": "2 CV bullet points and a one-page project write-up.", src: [] },
  ] },
};

/* ---------- social trials (schema 9) ---------- */
// Trials are quests with a due date, placed by the planner like tasks, with a Battle Log when done.
// xp: base XP; Fear Tower pays 20 × floor, Ego Break 10 × discomfort.
export const TRIALS = {
  rival: { name: "Rival Trial", xp: 40, mins: 30, note: "Aimed at the trait where your rival leads by the most." },
  copy: { name: "Skill Copy", xp: 30, mins: 30, note: "Practise one habit you saw someone do." },
  invasion: { name: "Invasion", xp: 60, mins: 60, note: "Get into the plans of someone ranked above you." },
  tower: { name: "Fear Tower", xp: 20, mins: 30, note: "Comfort-zone floors 1 to 5. Clear one to open the next." },
  ego: { name: "Ego Break", xp: 10, mins: 15, note: "A small embarrassment, on purpose." },
  boss: { name: "Boss Raid", xp: 150, mins: 120, note: "One big event a month, with prep before and a debrief after." },
  prep: { name: "Boss Raid prep", xp: 20, mins: 30, note: "Get ready for the Boss Raid." },
  party: { name: "Party", xp: 50, mins: 90, note: "Real time with someone ranked above you, or a new person." },
  taste: { name: "Show your taste", xp: 30, mins: 15, note: "Show one thing you're into, and say why." },
  appraisal: { name: "Appraisal", xp: 40, mins: 20, note: "A trusted friend rates you blind on the same traits." },
};
export const TOWER = [
  "Say hello plus one comment to a cashier, classmate or gym regular",
  "Ask a stranger a real question, then one follow-up",
  "Hold a 5-minute conversation with someone new",
  "Ask someone you just met to get coffee or lunch",
  "Join a group you don't know and speak first",
];
// [quest, discomfort 1-5]
export const EGO = [
  ["Ask for a discount somewhere that doesn't do discounts", 3], ["Solo karaoke, one full hour", 3],
  ["Use your shaky Japanese on a stranger and keep going after you stumble", 2], ["Ask a \"dumb\" question in class", 2],
  ["Compliment a stranger's outfit, specifically", 3], ["Ask staff for their favourite item and buy it", 1],
  ["Eat alone at a busy restaurant, phone away", 2], ["Ask someone to take your photo, then ask for a retake", 2],
  ["Introduce yourself to the person next to you in class", 2], ["Tell a short story to a group and own the ending, even if it falls flat", 4],
];
// What a Rival Trial asks for, per trait. Custom traits get a generic line.
export const RIVAL_ACT = {
  Engagement: "In 2 conversations, ask 3 follow-up questions before talking about yourself, and use their name back.",
  Gentleness: "Make someone quieter look good: draw them in and credit their idea out loud.",
  Maturity: "Handle one disagreement calmly: say your view once, ask theirs, no sulking after.",
  Awareness: "In every conversation, watch for exit signals (short answers, body turned away) and end it first, warmly.",
  Taste: "Show one thing you're into: wear it, play it or recommend it, and say why.",
  Reliability: "Make 3 small promises and keep every one, on time.",
};

// v5.2 phone-usage quest (Android app). apps: watched package names. days: minutes per date. judged: date -> "ok" | "over".
export const USAGE_APPS = [["com.instagram.android", "Instagram"], ["com.zhiliaoapp.musically", "TikTok"], ["com.ss.android.ugc.trill", "TikTok (Asia)"], ["com.google.android.youtube", "YouTube"], ["com.twitter.android", "X"]];
export const USAGE = { apps: USAGE_APPS.map(a => a[0]), limitMin: 60, days: {}, judged: {} };
