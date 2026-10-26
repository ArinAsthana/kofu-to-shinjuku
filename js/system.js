// The System (v3.1): the long plan it keeps to itself, the one Act it shows, and the reward rules it uses to shape the day.
// Arin sees the current Act's objective and little else; the full plan lives in Settings → System Archives.
// State is in S.settings.system (syncs with settings). Nothing here deletes or rewrites old records.

import { S, live, put } from "./store.js";
import * as E from "./engine.js";
import * as J from "./jlpt.js";
import * as Cl from "./classes.js";
import { START } from "./path.js";

// Hidden target: family spending × 25 (the 4% rule). ¥130M is the default until a country is chosen.
export const FI = { target: 130000000, born: "2004-01-14", finalGate: "2049-01-14", perYear: 3750000, realReturn: 0.05 };

export const ACTS = [
  { id: "I", name: "Escape Kofu", when: "now to first job", objective: "Debt-free, a ¥70k buffer, one offer in a target role" },
  { id: "II", name: "Foothold", when: "job years 1 to 3", objective: "Savings rate 30%+, a promotion, an MBA through 社費留学 or a scholarship" },
  { id: "III", name: "Ascent", when: "about 28 to 35", objective: "Income ¥10M+ a year, family, home base chosen" },
  { id: "IV", name: "Compounding", when: "about 35 to 45", objective: "Invested total on pace for the target" },
];

const sys = () => {
  const s = S.settings;
  if (!s.system) s.system = {};
  const x = s.system;
  x.revealed = x.revealed || {}; x.seen = x.seen || []; x.offerAt = x.offerAt ?? null;
  return x;
};
const touch = () => { S.settings.u = Date.now(); };

/* ---------- Act I ---------- */
// Three parts, each 0–1. Savings and debt come from the latest money report; the offer is logged by hand.
export function act1() {
  const mp = E.moneyPlan(), x = sys();
  const parts = [
    { id: "save", label: "¥" + Math.round(mp.goal / 1000) + "k saved", p: mp.savePct, done: mp.bank >= mp.goal },
    { id: "debt", label: "Debt-free", p: mp.paidPct, done: mp.debt <= 0 },
    { id: "offer", label: "One offer", p: x.offerAt ? 1 : 0, done: !!x.offerAt },
  ];
  const real = parts.reduce((a, q) => a + q.p, 0) / parts.length;
  // Endowed progress: the bar starts at 10% so the goal feels in reach; it still ends at 100% only when all three are done.
  const shown = parts.every(q => q.done) ? 1 : 0.1 + 0.9 * real;
  return { parts, real, shown, done: parts.every(q => q.done), week: Math.round((mp.saveWeek + mp.debtWeek) / 100) * 100 };
}
export const currentAct = () => act1().done ? 1 : 0;
// Final Gate: a bar with no number. Acts cleared plus the current Act's share, out of four.
export const gateProgress = () => (currentAct() === 0 ? act1().real : 1) / ACTS.length;
export function logOffer(on) { sys().offerAt = on ? Date.now() : null; touch(); }

/* ---------- streak with shield ---------- */
// Days in a row with a quest done. One missed day per Monday–Sunday week is shielded: it doesn't break the streak
// (and doesn't count towards it). Today can still be empty.
export function streak() {
  const days = new Set([...live("habitLog").map(h => h.date), ...live("tasks").filter(k => k.done && k.doneAt).map(k => E.ymd(new Date(k.doneAt)))]);
  let d = E.today(); if (!days.has(d)) d = E.addDays(d, -1);
  const used = new Set(); let n = 0;
  for (let i = 0; i < 4000; i++) {
    if (days.has(d)) n++;
    else {
      const w = E.weekStart(d);
      if (used.has(w) || !days.has(E.addDays(d, -1))) break; // a shield covers a single missed day, once a week
      used.add(w);
    }
    d = E.addDays(d, -1);
  }
  return { n, shielded: used.size, shieldUsed: used.has(E.weekStart(E.today())) };
}

/* ---------- comeback quest ---------- */
// After a day with no quest done, today opens with one small win: any one quest earns a bonus.
export const COMEBACK_XP = 25;
const doneOn = d => live("habitLog").some(h => h.date === d) || live("tasks").some(k => k.done && k.doneAt && E.ymd(new Date(k.doneAt)) === d);
export function comeback(t = E.today()) {
  const y = E.addDays(t, -1), any = live("habitLog").length > 0;
  if (!any || doneOn(y)) return null;
  const claimed = live("xpEvents").some(e => e.ref === "comeback:" + t);
  return { claimed, ready: !claimed && doneOn(t) };
}
export function claimComeback(t = E.today()) {
  const c = comeback(t); if (!c || !c.ready) return null;
  put("xpEvents", { ts: Date.now(), type: "comeback", xp: COMEBACK_XP, ref: "comeback:" + t, label: "Comeback quest" });
  return { xp: COMEBACK_XP, label: "Comeback quest" };
}

/* ---------- loot ---------- */
// Finishing a quest block rolls for loot once (fixed id per block and date, so two phones never double it).
const LOOT = [[0.55, 0], [0.27, 15], [0.13, 30], [0.05, 60]];
export function rollLoot(date, blockId) {
  const ref = "loot:" + date + "|" + blockId;
  if (live("xpEvents").some(e => e.ref === ref) || (sys().lootRolled || []).includes(ref)) return null;
  let r = Math.random(), xp = 0;
  for (const [p, v] of LOOT) { if (r < p) { xp = v; break; } r -= p; }
  const x = sys(); x.lootRolled = [...(x.lootRolled || []), ref].slice(-60); touch();
  if (!xp) return null;
  put("xpEvents", { ts: Date.now(), type: "loot", xp, ref, label: "Loot drop" });
  return { xp, label: xp >= 60 ? "Rare loot drop" : "Loot drop", loot: true };
}

/* ---------- milestones: full-screen System windows ---------- */
// Only big moments get a window. Things already true when v3.1 first runs are marked seen silently.
export function milestones() {
  const a = act1(), out = [];
  for (const q of a.parts) if (q.done) out.push({ id: "act1:" + q.id, title: q.id === "save" ? "Savings goal reached" : q.id === "debt" ? "Debt cleared" : "Offer secured", text: "Act I objective complete: " + q.label + "." });
  if (a.done) out.push({ id: "act1:clear", title: "Act I cleared: Escape Kofu", text: "A new gate opens. The Treasury unlocks." });
  for (const d of Cl.all()) if (Cl.bossPassed(d.id)) out.push({ id: "dboss:" + d.id, title: "Boss cleared: " + d.name, text: "Title earned: " + d.title + ". Equip it in Profile." });
  for (const c of Cl.CLASSES) if (Cl.classInfo(c.id).earned) out.push({ id: "class:" + c.id, title: "Class earned: " + c.name, text: "Every discipline cleared and the capstone done." });
  for (const l of J.unlocked().slice(1)) out.push({ id: "jlpt:" + l, title: "Gate open: " + l, text: "The JLPT ladder climbs to " + l + "." });
  return out;
}
export function nextMilestone() {
  const x = sys(), all = milestones();
  if (!x.init) { x.seen = all.map(m => m.id); x.init = true; touch(); return null; }
  return all.find(m => !x.seen.includes(m.id)) || null;
}
export function seeMilestone(id) { const x = sys(); if (!x.seen.includes(id)) x.seen.push(id); touch(); }

/* ---------- reveals: at most one System message a day ---------- */
const REVEALS = [
  { id: "act1", text: "Act I has begun: Escape Kofu.", sub: "Objective: debt-free, a ¥70k buffer, and one offer. Everything else is noise for now." },
  { id: "shield", text: "Streak shield active.", sub: "One missed day a week won't break your streak. Two will." },
  { id: "loot", text: "Blocks can drop loot.", sub: "Finish the block. Sometimes there's more than the base XP." },
  { id: "comeback", text: "Missed a day? The next one starts with a comeback quest.", sub: "Clear any one quest for a bonus. No pile-up." },
  { id: "gates", text: "Locked gates have appeared on Status.", sub: "They open in order. Only the current Act matters." },
  { id: "loan", when: () => loanLive(), text: "New area unlocked: Treasury.", sub: "Your education loan is yours now: one fixed monthly bill, paid before anything goes to the Store." },
];
export function revealToday(t = E.today()) {
  const x = sys();
  const shown = Object.entries(x.revealed).find(([, d]) => d === t);
  if (shown) return REVEALS.find(r => r.id === shown[0]) ? { ...REVEALS.find(r => r.id === shown[0]), today: true } : null;
  // Event reveals (like the loan at takeover) jump the queue; the rest come in order.
  return REVEALS.find(r => r.when && !x.revealed[r.id] && r.when()) || REVEALS.find(r => !r.when && !x.revealed[r.id]) || null;
}
// Called when the reveal is on screen: it's spent for today.
export function markReveal(id, t = E.today()) { const x = sys(); if (!x.revealed[id]) { x.revealed[id] = t; touch(); } }

/* ---------- Sunday report: one insight a week ---------- */
const INSIGHTS = [
  "Act I has three parts: savings, debt, an offer. Nothing else counts yet.",
  "The weekly money number is the whole savings plan. Hit it and the ¥70k buffer arrives by graduation.",
  "Accounting is shared by all three target roles. It's studied first for that reason.",
  "Japanese is the multiplier: every target firm in Tokyo weighs it.",
  "A missed day costs less than a missed week. The shield exists so one bad day stays one day.",
  "Interview-ready beats certificate-collecting. Cases and stories need reps, not reading.",
  "Income in the first job sets the pace of everything after it.",
  "Tax-free investing (NISA) becomes available with the first salary. The Treasury will open then.",
];
export const insightFor = (t = E.today()) => INSIGHTS[Math.max(0, Math.floor(E.daysBetween("2026-10-12", E.weekStart(t)) / 7)) % INSIGHTS.length];

/* ---------- the education loan (hidden until takeover) ---------- */
// Dad pays the EMI until Arin's job starts. From that date the EMI is one fixed monthly bill, shown with no balance
// or interest; the full numbers are only in the Archives. Balance is as of LOAN.asOf, amortised monthly from there.
export const LOAN = { inr: 1463000, rate: 0.105, emi: 23450, yenPerInr: 1.7, asOf: "2026-10-14", takeover: null };
export const loanCfg = () => { const s = S.settings; s.loan = { ...LOAN, ...(s.loan || {}) }; return s.loan; };
export function setLoan(patch) { Object.assign(loanCfg(), patch); touch(); }
export const loanLive = (t = E.today()) => { const l = loanCfg(); return !!(l.takeover && t >= l.takeover); };
export const emiYen = () => { const l = loanCfg(); return Math.round(l.emi * l.yenPerInr / 100) * 100; };
export function loanState(t = E.today()) {
  const l = loanCfg(), r = l.rate / 12, months = Math.max(0, Math.floor(E.daysBetween(l.asOf, t) / 30.44));
  let bal = l.inr; for (let i = 0; i < months && bal > 0; i++) bal = Math.max(0, bal * (1 + r) - l.emi);
  const left = bal > 0 && l.emi > bal * r ? Math.ceil(-Math.log(1 - r * bal / l.emi) / Math.log(1 + r)) : bal > 0 ? Infinity : 0;
  return { bal: Math.round(bal), left, yen: Math.round(bal * l.yenPerInr), interest: Math.round(bal * r), emiYen: emiYen() };
}
// At takeover the EMI becomes a normal bill record (fixed id, so phones never duplicate it). Returns true if added.
export function ensureLoanBill() {
  if (!loanLive() || S.bills.some(b => b.id === "loan-emi")) return false;
  put("bills", { id: "loan-emi", name: "Education loan", amount: emiYen(), freq: "month", kind: "loan", paid: {} });
  return true;
}

/* ---------- archives ---------- */
// The full plan, shown only in Settings → System Archives.
export function archive() {
  const age = E.daysBetween(FI.born, E.today()) / 365.25, yearsLeft = E.daysBetween(E.today(), FI.finalGate) / 365.25;
  return { age: Math.floor(age), yearsLeft: Math.round(yearsLeft), ...FI };
}

/* ---------- stages (v4): the System unlocks itself ---------- */
// Stages only go up. Active days = days with at least one quest done, counted from the day stage 0 began.
// Nothing is deleted when a stage is locked; the screens for it are just not shown yet.
export const STAGES = [
  { n: 0, name: "Awakening", area: "System", text: "You have been chosen. Complete today's quests.", hint: "Something opens after a few days of quests." },
  { n: 1, name: "Dungeon", area: "Dungeon", text: "Blocks now run as Dungeons. Work inside the block. Skipping now has a cost.", hint: "The next area opens when you level up." },
  { n: 2, name: "Store", area: "Store", tab: "money", text: "Points are worth something now. Spend them.", hint: "A place to study is coming." },
  { n: 3, name: "Study", area: "Study", tab: "classes", text: "One chapter at a time.", hint: "Other people are part of this too." },
  { n: 4, name: "People", area: "People", tab: "people", text: "Social growth is a quest too.", hint: "Bigger floors are waiting." },
  { n: 5, name: "Tower, Raids & Titles", area: "Tower", text: "Bigger floors are open: the Fear Tower, Boss Raids, Appraisal and Titles.", hint: "" },
];
const st5 = () => { const x = sys(); if (x.stage == null) x.stage = 0; x.unlockedAt = x.unlockedAt || {}; if (!x.unlockedAt[0]) x.unlockedAt[0] = E.today(); return x; };
export const stage = () => st5().stage;
export const has = n => stage() >= n;
// v6: counting restarts when the Path starts (Mon 19 Oct); the stage already reached stays.
export function activeDays() {
  const from = st5().unlockedAt[0] > START ? st5().unlockedAt[0] : START;
  return new Set([...live("habitLog").map(h => h.date), ...live("tasks").filter(k => k.done && k.doneAt).map(k => E.ymd(new Date(k.doneAt)))].filter(d => d >= from)).size;
}
const trialCleared = () => live("tasks").some(k => k.trial && k.done);
const NEED = [null, () => activeDays() >= 3, () => E.level() >= 2, () => activeDays() >= 7, () => activeDays() >= 14, () => trialCleared() || activeDays() >= 21];
// Moves up at most one stage per call. Returns the stage just unlocked, or null.
export function checkStage() {
  const x = st5(), next = x.stage + 1;
  if (next >= STAGES.length || !NEED[next]()) return null;
  x.stage = next; x.unlockedAt[next] = E.today(); x.unlockSeen = false; touch();
  return STAGES[next];
}
// The unlock window waits until it has been seen once.
export const pendingUnlock = () => { const x = st5(); return x.stage > 0 && x.unlockSeen === false ? STAGES[x.stage] : null; };
export function seeUnlock() { st5().unlockSeen = true; touch(); }
export function skipTo(n) {
  const x = st5(); n = Math.max(0, Math.min(STAGES.length - 1, n | 0));
  for (let i = 1; i <= n; i++) x.unlockedAt[i] = x.unlockedAt[i] || E.today();
  x.stage = n; x.unlockSeen = true; touch();
}
export const nextStage = () => STAGES[stage() + 1] || null;
