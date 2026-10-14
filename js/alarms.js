// v5.1 alarms: local notifications scheduled on the phone (Android app only; Chrome keeps the wind-down notification
// in app.js). Rebuilt from the plan on every open and save, for the next 3 days. Per-phone settings live in localStorage.

import { live } from "./store.js";
import * as E from "./engine.js";
import * as P from "./planner.js";
import * as St from "./study.js";
import * as Sy from "./system.js";
import { isNative } from "./sync.js";

export const TYPES = [["block", "Block starting", "At the start, and 5 min before a Dungeon"], ["wind", "Wind-down", "1 h before bed"], ["pen", "Penalty deadline", "30 min before it lapses"], ["brief", "Morning brief", "First block or 08:00, whichever is earlier"]];
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
