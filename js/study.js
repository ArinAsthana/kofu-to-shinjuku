// Study blocks, the pomodoro and penalties. A study block always names one topic: the first in its subject's list
// that isn't finished. Reports add % to that topic. A quest block that ends without being done earns a penalty.

import { S, live, put, remove } from "./store.js";
import { SUBJECTS, STUDY, HABITS } from "./data.js";
import * as E from "./engine.js";
import * as P from "./planner.js";
import * as Cl from "./classes.js";

const st = () => S.settings.study || STUDY;
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const absMs = (date, m) => E.parse(date).getTime() + m * 60000;

/* ---------- topics ---------- */
// Finance blocks follow the active disciplines' chapters once any are active (the System picks the order).
export const topics = subj => subj === "fin" && Cl.active().length ? Cl.studyTopics() : (st().topics || {})[subj] || SUBJECTS[subj]?.topics || [];
export function subjectOf(b) {
  if (!b || b.kind !== "quest" || P.isWorkout(b)) return null;
  if (b.subj && SUBJECTS[b.subj]) return b.subj;
  return Object.keys(SUBJECTS).find(k => new RegExp(SUBJECTS[k].match, "i").test(b.title || "")) || null;
}
export const progress = (subj, id) => Math.min(100, live("blockLog").filter(r => r.subj === subj && r.topic === id).reduce((a, r) => a + (r.gain || 0), 0));
export const current = subj => topics(subj).find(t => progress(subj, t.id) < 100) || null;
export function upNext(subj) { const L = topics(subj), c = current(subj); return c ? L[L.indexOf(c) + 1] || null : null; }

// Topic list as editable text: one topic per line, "Title | what to do | what you end with".
export const topicsText = subj => topics(subj).map(t => [t.t, t.do, t.out].filter(Boolean).join(" | ")).join("\n");
export function parseTopics(subj, text) {
  const old = topics(subj), used = new Set();
  return text.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const [t, d = "", out = ""] = l.split("|").map(x => x.trim());
    // Keep the id of a topic with the same title so its progress survives the edit.
    const was = old.find(o => o.t.toLowerCase() === t.toLowerCase() && !used.has(o.id));
    const id = was ? was.id : subj + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    used.add(id);
    return { id, t, do: d || (was && was.do) || "", out: out || (was && was.out) || "", src: (was && was.src) || [] };
  });
}

/* ---------- occurrences ---------- */
// Quest blocks on a date. e can run past 1440 for a block that crosses midnight.
export function questOcc(date) {
  return P.segments(date).filter(g => !g.tail && g.b.kind === "quest").map(g => ({ date, b: g.b, s: g.s, e: g.cont ? 1440 + P.toMin(g.b.end) : g.e }));
}
export const occKey = o => o.date + "|" + o.b.id;
export const logsFor = o => live("blockLog").filter(r => r.date === o.date && r.block === o.b.id);
export const reported = o => logsFor(o).some(r => r.final);
const trained = date => { const w = E.workoutOn(date); return !!(w && (w.entries || []).some(e => e.sets && e.sets.length)) || live("runs").some(r => r.date === date); };
export function completed(o) {
  if (P.isWorkout(o.b)) return trained(o.date);
  return logsFor(o).some(r => (r.gain || 0) > 0 || (r.poms || 0) > 0 || r.done);
}

// The study screen opens openPad before a quest block and stays open `grace` minutes after it for the report.
export function focusGate() {
  const t = E.today(), n = nowMin(), pad = S.settings.plan?.openPad ?? 10, grace = st().grace ?? 60;
  const occ = questOcc(t).filter(o => !P.isWorkout(o.b));
  const live_ = occ.find(o => n >= o.s - pad && n < o.e);
  if (live_) return { open: true, o: live_, ended: false };
  const rep = occ.find(o => n >= o.e && n < o.e + grace && !reported(o));
  if (rep) return { open: true, o: rep, ended: true, closes: rep.e + grace };
  for (let i = 0; i < 8; i++) {
    const d = E.addDays(t, i), nx = questOcc(d).filter(o => !P.isWorkout(o.b) && (i > 0 || o.s - pad > n)).sort((a, b) => a.s - b.s)[0];
    if (nx) return { open: false, next: { date: d, s: nx.s - pad, b: nx.b } };
  }
  return { open: false };
}

/* ---------- reports ---------- */
// gain: % of the topic covered. final: the end-of-block report (a mid-block "finished, next topic" isn't final).
export function report(o, { subj, topic, gain = 0, poms = 0, final = true, done = false }) {
  const gains = [];
  const rec = put("blockLog", { date: o.date, block: o.b.id, title: o.b.title, subj: subj || null, topic: topic || null, gain, poms, done, final, at: Date.now() });
  if (subj && topic && progress(subj, topic) >= 100) {
    const t = topics(subj).find(x => x.id === topic);
    gains.push(E.gainXP("topic", "topic:" + subj + ":" + topic, "Topic cleared: " + (t ? t.t : topic)));
  }
  // A real study block ticks its daily quest, like logging a workout ticks the gym one.
  const habit = subj && SUBJECTS[subj].habit;
  if (habit && (gain > 0 || poms > 0) && !E.habitDone(habit, o.date)) {
    const h = put("habitLog", { date: o.date, habit });
    gains.push(E.gainXP("habit", h.id, HABITS.find(x => x.id === habit)?.name || habit));
  }
  return { rec, gains };
}

/* ---------- penalties ---------- */
const LENS = [30, 45, 60, 90];
const penTask = p => live("tasks").find(k => k.id === p.task);
// Open until its make-up task is done.
export const openPenalties = () => live("penalties").filter(p => { const k = penTask(p); return k && !k.done; }).sort((a, b) => b.date.localeCompare(a.date));

// Checks the last week of quest blocks. A block that ended more than `grace` minutes ago without being done gets
// a penalty: XP off the wallet and a make-up task the planner places. If the work turns up later (a sync from
// another phone), the penalty is withdrawn. Ids are fixed per block and date, so two phones never double it.
// Re-entry (v4): a day inside a run of 2+ empty days (no quest done) earns no penalty, so coming back never starts with a pile.
const doneOn = d => live("habitLog").some(h => h.date === d) || live("tasks").some(k => k.done && k.doneAt && E.ymd(new Date(k.doneAt)) === d);
const away = (d, t) => !doneOn(d) && (!doneOn(E.addDays(d, -1)) || (E.addDays(d, 1) < t && !doneOn(E.addDays(d, 1))));
export function assess() {
  const s = st(), now = Date.now(), from = s.from || now, grace = (s.grace ?? 60) * 60000, t = E.today(), fresh = [];
  // A make-up quest left past its deadline lapses quietly: the task goes, the record stays, nothing stacks.
  for (const p of openPenalties()) { const k = penTask(p); if (k && k.due && k.due < t) { remove("tasks", k.id); put("penalties", { ...p, lapsed: true }); } }
  for (let i = 7; i >= 0; i--) {
    const d = E.addDays(t, -i);
    for (const o of questOcc(d)) {
      const end = absMs(d, o.e);
      if (end <= from || now < end + grace) continue;
      const id = "pen-" + d + "-" + o.b.id, ex = S.penalties.find(r => r.id === id), done = completed(o);
      if (!ex && !done && away(d, t)) continue;
      if (!ex && !done && openPenalties().length) {
        // Cap: one open penalty quest at a time. Further misses are recorded, waived (no XP, no make-up task).
        put("penalties", { id, date: d, block: o.b.id, title: o.b.title, s: o.s, xp: 0, task: null, waived: true });
      } else if (!ex && !done) {
        const subj = subjectOf(o.b), top = subj ? current(subj) : null, half = (o.e - o.s) / 2;
        const mins = LENS.reduce((a, m) => Math.abs(m - half) < Math.abs(a - half) ? m : a, 30), task = "pentask-" + d + "-" + o.b.id;
        put("tasks", { id: task, title: "Penalty quest: make up " + o.b.title + (top ? " · " + top.t : ""), mins, prio: 3, energy: "high", due: E.addDays(t, 1), done: false, created: now, pin: null, penalty: id });
        fresh.push(put("penalties", { id, date: d, block: o.b.id, title: o.b.title, s: o.s, xp: s.penaltyXp ?? 30, task, topic: top ? top.t : null }));
      } else if (ex && !ex.del && done) {
        const k = live("tasks").find(x => x.id === ex.task);
        if (k && !k.done) remove("tasks", k.id);
        remove("penalties", id);
      }
    }
  }
  return fresh;
}

/* ---------- pomodoro ---------- */
// Kept on this phone only (localStorage). Runs on timestamps, so it stays right while the screen is off.
const PK = "kts-pomo";
const len = phase => (phase === "focus" ? st().focus : phase === "long" ? st().long : st().brk) * 60000;
export function pomo(key) {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PK)); } catch (e) {}
  if (!p || p.key !== key) p = { key, phase: "focus", run: false, left: len("focus"), endsAt: null, n: 0 };
  p.fired = false;
  while (p.run && Date.now() >= p.endsAt) {
    p.fired = true;
    if (p.phase === "focus") { p.n++; p.phase = p.n % (st().every || 4) === 0 ? "long" : "brk"; }
    else p.phase = "focus";
    p.endsAt += len(p.phase);
  }
  return p;
}
export function pomoSave(p) { try { localStorage.setItem(PK, JSON.stringify(p)); } catch (e) {} }
export const pomoLeft = p => p.run ? Math.max(0, p.endsAt - Date.now()) : p.left;
export const pomoLen = p => len(p.phase);
export function pomoAct(key, act) {
  const p = pomo(key);
  if (act === "start" && !p.run) { p.run = true; p.endsAt = Date.now() + p.left; }
  else if (act === "pause" && p.run) { p.run = false; p.left = Math.max(0, p.endsAt - Date.now()); }
  else if (act === "skip") {
    p.phase = p.phase === "focus" ? "brk" : "focus"; // a skipped focus round doesn't count
    p.left = len(p.phase); if (p.run) p.endsAt = Date.now() + p.left;
  }
  else if (act === "reset") { p.phase = "focus"; p.run = false; p.left = len("focus"); p.endsAt = null; }
  pomoSave(p);
  return p;
}
