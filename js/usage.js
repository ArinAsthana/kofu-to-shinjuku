// v5.2 phone-usage quest (Android app only). Minutes on the watched apps come from the native Usage plugin
// (UsagePlugin.java). Daily quest: stay under the limit. Over it → a penalty quest under the one-penalty cap;
// under it at wind-down (or the next morning) → XP. Arin only ever sees today's number against the limit.

import { S, live, put, touchSettings } from "./store.js";
import { XP, USAGE } from "./data.js";
import * as E from "./engine.js";
import * as P from "./planner.js";
import * as St from "./study.js";
import * as Sy from "./system.js";
import { isNative } from "./sync.js";
import { START } from "./path.js";

const ASK_KEY = "kts-usage-ask";
const plug = () => window.Capacitor.Plugins.Usage || window.Capacitor.registerPlugin("Usage");
// Needs the APK with the Usage plugin (v5.2+); older APKs and Chrome show nothing.
export const available = () => isNative() && !!(window.Capacitor.isPluginAvailable && window.Capacitor.isPluginAvailable("Usage"));
export const cfg = () => S.settings.usage || (S.settings.usage = { ...USAGE, apps: USAGE.apps.slice(), days: {}, judged: {} });
let granted = null;
export const isGranted = () => granted === true;
export const needsAsk = () => available() && Sy.has(1) && granted === false && !localStorage.getItem(ASK_KEY);
export const later = () => { try { localStorage.setItem(ASK_KEY, E.today()); } catch (e) {} };
export const openSettings = () => { later(); return plug().openSettings().catch(() => {}); };
export const today = () => cfg().days[E.today()];

const midnight = d => E.parse(d).getTime();
async function minutesOn(d) {
  const r = await plug().minutes({ start: midnight(d), end: midnight(E.addDays(d, 1)), packages: cfg().apps });
  return r.total;
}

// Reads today's (and yesterday's, if not judged) minutes, then judges. Returns true when anything changed.
export async function refresh() {
  if (!available()) return false;
  try { granted = (await plug().status()).granted; } catch (e) { granted = null; return false; }
  if (!granted || !Sy.has(1)) return false;
  const u = cfg(), t = E.today(), y = E.addDays(t, -1), before = JSON.stringify([u.days, u.judged, u.since]);
  if (!u.since) u.since = t; // days before usage access was granted are never judged
  try {
    u.days[t] = await minutesOn(t);
    if (!u.judged[y] && u.since <= y) u.days[y] = await minutesOn(y);
  } catch (e) { return false; }
  judge();
  for (const d of Object.keys(u.days)) if (E.daysBetween(d, t) > 60) delete u.days[d];
  for (const d of Object.keys(u.judged)) if (E.daysBetween(d, t) > 60) delete u.judged[d];
  const changed = JSON.stringify([u.days, u.judged, u.since]) !== before;
  if (changed) touchSettings();
  return changed;
}

function judge() {
  const u = cfg(), t = E.today(), y = E.addDays(t, -1), lim = u.limitMin || 60;
  // Yesterday, if it was never judged: the full day is known now.
  if (u.days[y] != null && !u.judged[y] && u.since <= y) settle(y, u.days[y] <= lim);
  // Today: over the limit settles it at once; under it settles at wind-down.
  const m = u.days[t];
  if (m != null && !u.judged[t]) { if (m > lim) settle(t, false); else if (P.windDownNow()) settle(t, true); }
}
function settle(d, ok) {
  const u = cfg(); u.judged[d] = ok ? "ok" : "over";
  if (ok) { const ref = "usage:" + d; if (!live("xpEvents").some(e => e.ref === ref)) put("xpEvents", { ts: Date.now(), type: "usage", xp: XP.habit, ref, label: `Phone under ${u.limitMin} min` }); return; }
  if (d < START) return; // v6: nothing counts against Arin before the Path starts
  const id = "pen-use-" + d; if (live("penalties").some(p => p.id === id)) return;
  const title = `Phone over ${u.limitMin} min`;
  // One open penalty at a time, as with blocks: a further one is recorded but waived.
  if (St.openPenalties().length) { put("penalties", { id, date: d, block: null, title, s: 0, xp: 0, task: null, waived: true }); return; }
  const task = "pentask-use-" + d;
  put("tasks", { id: task, title: "Penalty quest: 30 min phone-free (phone in another room)", mins: 30, prio: 3, energy: "low", due: E.addDays(E.today(), 1), done: false, created: Date.now(), pin: null, penalty: id });
  put("penalties", { id, date: d, block: null, title, s: 0, xp: S.settings.study?.penaltyXp ?? 30, task });
}

// Weekly report line: average minutes a day this week vs last week.
export function weekLine(t = E.today()) {
  const u = cfg(), avg = days => { const v = days.map(d => u.days[d]).filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const a = avg(E.weekDays(t)), b = avg(E.weekDays(E.addDays(t, -7)));
  if (a == null) return null;
  return `- Phone (watched apps): ${a} min/day vs limit ${u.limitMin}${b != null ? `, last week ${b} (${a <= b ? "down" : "up"} ${Math.abs(a - b)})` : ""}`;
}
