// v5.1 alarms: local notifications scheduled on the phone (Android app only; Chrome keeps the wind-down notification
// in app.js). Rebuilt from the plan on every open and save, for the next 3 days. Per-phone settings live in localStorage.

import { live } from "./store.js";
import * as E from "./engine.js";
import * as P from "./planner.js";
import * as St from "./study.js";
import * as Sy from "./system.js";
import { isNative } from "./sync.js";
import * as K from "./cards.js";
import * as Dl from "./deadlines.js";

export const TYPES = [["block", "Block starting", "At the start, and 5 min before a Dungeon"], ["wind", "Wind-down", "1 h before bed"], ["pen", "Penalty deadline", "30 min before it lapses"], ["brief", "Morning brief", "First block or 08:00, whichever is earlier"], ["dl", "Deadlines", "On the start day and the day before it's due"], ["jp", "Japanese nudges", "Free gaps of 15 min or more, and opening a watched app with reviews due. Up to 3 a day"]];
const PREF_KEY = "kts-alarms", ASK_KEY = "kts-alarm-ask", SIG_KEY = "kts-alarm-sig", CHANNEL = "system";
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
const LN = () => window.Capacitor.Plugins.LocalNotifications || window.Capacitor.registerPlugin("LocalNotifications");

export const available = () => isNative();
export function prefs() { let p = {}; try { p = JSON.parse(ls.get(PREF_KEY)) || {}; } catch (e) {} return Object.fromEntries(TYPES.map(([k]) => [k, p[k] !== false])); }
export function toggle(k) { const p = prefs(); p[k] = !p[k]; ls.set(PREF_KEY, JSON.stringify(p)); ls.set(SIG_KEY, ""); return reschedule(); }

let perm = null, exact = null, go = null, redraw = null; // cached permission states; go(route) opens a screen
export const granted = () => perm === "granted";
export const exactOk = () => exact !== false;
// The System asks once, from stage 1 (when Dungeons and penalties begin), never on first launch.
export const needsAsk = () => available() && Sy.has(1) && perm && perm !== "granted" && perm !== "denied" && !ls.get(ASK_KEY);
export const later = () => ls.set(ASK_KEY, E.today());

export async function init(opts) {
  if (!available()) return;
  go = opts.go; redraw = opts.render;
  try {
    perm = (await LN().checkPermissions()).display;
    await LN().createChannel({ id: CHANNEL, name: "System", description: "Blocks, wind-down, penalties and the morning brief", importance: 5, vibration: true, visibility: 1 }).catch(() => {});
    await LN().addListener("localNotificationActionPerformed", e => { const r = e && e.notification && e.notification.extra && e.notification.extra.route; if (r && go) go(r); });
    exact = await LN().checkExactNotificationSetting().then(r => r.exact_alarm === "granted").catch(() => null);
  } catch (e) { perm = null; }
  if (redraw) redraw();
  reschedule();
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    try { perm = (await LN().checkPermissions()).display; exact = await LN().checkExactNotificationSetting().then(r => r.exact_alarm === "granted").catch(() => exact); } catch (e) {}
    reschedule();
  });
}

// Asks for notification permission, then (Android 12+) sends the user to the exact-alarm setting if it's off.
export async function request() {
  ls.set(ASK_KEY, E.today());
  try {
    perm = (await LN().requestPermissions()).display;
    if (perm === "granted" && exact === false) await LN().changeExactNotificationSetting().catch(() => {});
  } catch (e) {}
  ls.set(SIG_KEY, "");
  return reschedule();
}

const at = (date, min) => E.parse(date).getTime() + min * 60000;
const asleep = ms => { // quiet hours follow sleep blocks
  const d = E.ymd(new Date(ms)), m = new Date(ms).getHours() * 60 + new Date(ms).getMinutes();
  return P.segments(d).some(g => g.b.kind === "sleep" && m >= g.s && m < g.e);
};

// v8.2: Japanese nudges. Free gaps of 15 min or more between 08:00 and 22:00 (outside every block, so never in class
// or asleep), at most 2 a day: the longest ones, nudged at their start.
export const GAP_MIN = 15, NUDGES = 2; // plus one native watched-app nudge (NudgeReceiver.java): 3 a day at most
export function gaps(d) {
  const busy = P.segments(d).map(g => [g.s, g.e]).sort((a, b) => a[0] - b[0]), out = [];
  let cur = 8 * 60;
  for (const [s, e] of busy) { if (s - cur >= GAP_MIN) out.push({ s: cur, e: Math.min(s, 22 * 60) }); cur = Math.max(cur, e); if (cur >= 22 * 60) break; }
  if (22 * 60 - cur >= GAP_MIN) out.push({ s: cur, e: 22 * 60 });
  return out.filter(g => g.e - g.s >= GAP_MIN).sort((a, b) => (b.e - b.s) - (a.e - a.s)).slice(0, NUDGES).sort((a, b) => a.s - b.s);
}
// Everything due in the next 3 days, in the System voice.
export function upcoming() {
  const on = prefs(), t = E.today(), now = Date.now(), out = [];
  const add = (ms, title, body, route) => { if (ms > now + 30000 && !asleep(ms)) out.push({ at: ms, title, body, route }); };
  for (let i = 0; i < 3; i++) {
    const d = E.addDays(t, i), segs = P.segments(d).filter(g => !g.tail && !["sleep", "nap"].includes(g.b.kind));
    if (on.block) for (const g of segs) {
      const dungeon = g.b.kind === "quest", subj = dungeon && St.subjectOf(g.b), top = subj && St.current(subj), what = top ? `${g.b.title}: ${top.t}` : g.b.title;
      if (dungeon) add(at(d, g.s - 5), "[SYSTEM] Dungeon opens in 5 minutes", what, "home");
      add(at(d, g.s), dungeon ? "[SYSTEM] Dungeon open" : `[SYSTEM] ${g.b.title}`, dungeon ? `${what}. Enter now.` : `Starts now, ${P.toHM(g.s)}–${P.toHM(g.e)}.`, "home");
    }
    if (on.wind) { const w = P.windDownOn(d); if (w && w.date === d) add(at(w.date, w.at), "[SYSTEM] Wind-down", `Bed at ${P.toHM(w.bed)}. Close the day: screens off, shower, set out tomorrow.`, "home"); }
    if (on.brief) { const first = segs.filter(g => g.s >= 4 * 60).sort((a, b) => a.s - b.s)[0]; add(at(d, Math.min(first ? first.s : 480, 480)), "[SYSTEM] Daily quests have arrived", "Open the System to accept today's quests.", "home"); }
  }
  if (on.jp) { const n = K.queue().length; for (let i = 0; i < 3; i++) { const d = E.addDays(t, i); for (const g of gaps(d)) add(at(d, g.s), `[SYSTEM] ${Math.min(30, g.e - g.s)} min free`, n && i === 0 ? `Clear ${n} Japanese review${n === 1 ? "" : "s"}? Quick start is one tap.` : "A Japanese quick start fits here.", "jlpt"); } }
  // v9.2: deadlines, at 08:00 or when the morning's sleep ends.
  if (on.dl) for (let i = 0; i < 3; i++) {
    const d = E.addDays(t, i), wake = P.segments(d).filter(g => g.b.kind === "sleep" && g.s <= 480 && g.e > 480).reduce((m, g) => Math.max(m, g.e), 480);
    for (const k of Dl.list(d)) {
      const n = Dl.prep(k.id).filter(x => !x.done).length;
      if (k.start === d && k.due !== d && !Dl.prep(k.id).some(x => x.done)) add(at(d, wake), `[SYSTEM] ${k.title}: start today`, `${n} prep session${n === 1 ? "" : "s"} placed. Due ${E.fmtDate(k.due)}.`, "plan");
      if (E.addDays(k.due, -1) === d) add(at(d, wake), `[SYSTEM] ${k.title} is due tomorrow`, `${k.time ? "At " + k.time + ". " : ""}${n ? n + " prep session" + (n === 1 ? "" : "s") + " left." : "Prep done."}`, "plan");
    }
  }
  if (on.pen) for (const p of St.openPenalties()) {
    const k = live("tasks").find(x => x.id === p.task);
    if (k && k.due) add(at(k.due, 1410), "[SYSTEM] Penalty quest expires in 30 minutes", k.title, "plan");
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 60);
}

let busy = false, again = false;
export async function reschedule() {
  if (!available() || perm !== "granted") return;
  if (busy) { again = true; return; }
  busy = true;
  try {
    const list = Sy.has(1) ? upcoming() : [], sig = JSON.stringify(list);
    if (sig !== ls.get(SIG_KEY)) {
      const pend = await LN().getPending();
      if (pend.notifications.length) await LN().cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
      if (list.length) await LN().schedule({ notifications: list.map((n, i) => ({ id: 1000 + i, title: n.title, body: n.body, channelId: CHANNEL, smallIcon: "ic_stat_eye", iconColor: "#E0211F", extra: { route: n.route }, schedule: { at: new Date(n.at), allowWhileIdle: true } })) });
      ls.set(SIG_KEY, sig);
    }
  } catch (e) { ls.set(SIG_KEY, ""); }
  busy = false;
  if (again) { again = false; reschedule(); }
}
