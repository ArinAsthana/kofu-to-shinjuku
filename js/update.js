// v6.3: updates. Web code updates itself (the service worker); this adds a "System updated" toast after one,
// and, in the Android app, checks GitHub's latest Release once a day and offers the new APK (UpdaterPlugin.java).

import { isNative } from "./sync.js";
import * as E from "./engine.js";

export const APP_V = "6.3";
const REPO = "ArinAsthana/kofu-to-shinjuku", SEEN_V = "kts-ver", CHECKED = "kts-upd-check", LATER = "kts-upd-later", FOUND = "kts-upd-found";
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
const plug = () => window.Capacitor.Plugins.Updater || window.Capacitor.registerPlugin("Updater");
// Older APKs (build 9 and before) don't have the plugin: they can't self-update, and show nothing.
export const available = () => isNative() && !!(window.Capacitor.isPluginAvailable && window.Capacitor.isPluginAvailable("Updater"));

// The version this browser last ran. Returns the new version once, right after a web update.
export function webUpdated() {
  const was = ls.get(SEEN_V); ls.set(SEEN_V, APP_V);
  return was && was !== APP_V ? APP_V : null;
}

let found = null; // {build, url}
try { found = JSON.parse(ls.get(FOUND)) || null; } catch (e) {}
// At most once a day. Resolves to the newer build, if there is one.
export async function check(force = false) {
  if (!available()) return null;
  try {
    const have = (await plug().version()).code;
    if (found && found.build <= have) { found = null; ls.set(FOUND, "null"); }
    if (!force && ls.get(CHECKED) === E.today()) return found;
    const r = await (await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } })).json();
    ls.set(CHECKED, E.today());
    const build = +((r.tag_name || "").match(/^apk-(\d+)$/) || [])[1], asset = (r.assets || []).find(a => /\.apk$/.test(a.name));
    found = build > have && asset ? { build, url: asset.browser_download_url } : null;
    ls.set(FOUND, JSON.stringify(found));
  } catch (e) {}
  return found;
}
export const pending = () => found;
// The window shows once a day until the update is installed.
export const needsAsk = () => !!found && available() && ls.get(LATER) !== E.today();
export const later = () => ls.set(LATER, E.today());
// Downloads and opens Android's installer. Returns "ok", "permission" (the setting was opened) or an error message.
export async function install() {
  if (!found) return "No update";
  try { await plug().install({ url: found.url }); later(); return "ok"; }
  catch (e) { return e && e.code === "NEEDS_PERMISSION" ? "permission" : (e && e.message) || "Download failed"; }
}
