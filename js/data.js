// Static content. Only Arin's records are stored; everything here lives in code.

export const APP_ID = "kofu-to-shinjuku";
export const SCHEMA_VERSION = 1;

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
  followup: 5, appAdded: 20, appStage: 30, workout: 20, pr: 40,
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
