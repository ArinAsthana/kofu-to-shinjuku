// Optional cloud sync and backup through Firebase (Firestore + Google sign-in).
// The app works fully without it. Each record store is one Firestore doc holding a JSON string:
// users/{uid}/stores/{storeName} = { json, u, v }. Merging is per record: the newer `u` wins.
// Photos are never synced.

import { firebaseConfig } from "./firebase-config.js";
import { S, RECORD_STORES, mergeState, migrate, replaceState, save, flush, onSave } from "./store.js";
import { SCHEMA_VERSION } from "./data.js";

const V = "10.12.2";
const CDN = `https://www.gstatic.com/firebasejs/${V}/`;
let fb = null, user = null, busy = false, lastSync = null, error = "", ctx = null, timer = null;

export async function init(c) {
  ctx = c;
  onSave(() => { if (user) { clearTimeout(timer); timer = setTimeout(syncNow, 4000); } });
  if (!firebaseConfig) return;
  try {
    const [app, auth, fs] = await Promise.all([import(CDN + "firebase-app.js"), import(CDN + "firebase-auth.js"), import(CDN + "firebase-firestore.js")]);
    const a = app.initializeApp(firebaseConfig);
    fb = { auth, fs, authI: auth.getAuth(a), db: fs.getFirestore(a) };
    await auth.setPersistence(fb.authI, auth.browserLocalPersistence).catch(() => {});
    auth.getRedirectResult(fb.authI).catch(e => { error = msg(e); });
    auth.onAuthStateChanged(fb.authI, u => { user = u; refresh(); if (u) syncNow(); });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && user) syncNow(); });
    window.addEventListener("online", () => user && syncNow());
  } catch (e) { error = "Sync unavailable offline. Your data is safe on this phone."; refresh(); }
}

const msg = e => (e && (e.code || e.message)) || String(e);
// Re-render the screens that show sync status, unless the user is typing.
function refresh() {
  const tab = (location.hash.slice(1) || "home").split("/")[0];
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "");
  if (ctx && (tab === "more" || tab === "home") && !typing) ctx.render();
}

export function statusText() {
  if (!firebaseConfig) return "Saved on this phone";
  if (!user) return "Saved on this phone · sync signed out";
  if (busy) return "Syncing…";
  if (error) return "Saved on this phone · sync error";
  return lastSync ? "Synced " + lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Signed in";
}

export function panelHtml(esc) {
  if (!firebaseConfig) return `<p class="small muted">Sync is off. Your data is saved on this phone. Export weekly as a backup. Firebase sync switches on once the project keys are added.</p>`;
  if (!fb) return `<p class="small muted">${esc(error || "Loading sync…")}</p>`;
  if (!user) return `<p class="small muted">Sign in with Google to back up your data and use it on your PC. Photos never leave this phone.</p>
    ${error ? `<p class="small" style="color:var(--bad)">${esc(error)}</p>` : ""}
    <div class="btns"><button class="btn primary" data-act="signin">Sign in with Google</button></div>`;
  return `<p class="small">Signed in as <b>${esc(user.email || user.displayName || "you")}</b>.</p>
    <p class="small muted">${esc(statusText())}${error ? " · " + esc(error) : ""}</p>
    <details class="small" style="margin-top:6px"><summary>Claude connector ID</summary><p class="tiny muted">Paste this as UID when setting up the Claude connector.</p><code style="user-select:all;word-break:break-all">${esc(user.uid)}</code></details>
    <div class="btns"><button class="btn" data-act="syncnow">Sync now</button><button class="btn" data-act="signout">Sign out</button></div>`;
}

export function handle(act, el, c) {
  if (act === "signin") { signIn(); return true; }
  if (act === "signout") { fb && fb.auth.signOut(fb.authI); if (isNative()) nativeAuth().signOut().catch(() => {}); return true; }
  if (act === "syncnow") { syncNow(true); return true; }
  return false;
}

// In the Android app (Capacitor), Google blocks sign-in inside the web view, so the native plugin signs in
// and hands its ID token to Firebase web auth. Sync then works exactly as in Chrome.
export const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const nativeAuth = () => window.Capacitor.Plugins.FirebaseAuthentication || window.Capacitor.registerPlugin("FirebaseAuthentication");
async function signIn() {
  if (!fb) return;
  if (isNative()) {
    try {
      const r = await nativeAuth().signInWithGoogle();
      const tok = r && r.credential && r.credential.idToken;
      if (!tok) throw new Error("Google didn't return a sign-in token");
      await fb.auth.signInWithCredential(fb.authI, fb.auth.GoogleAuthProvider.credential(tok));
    } catch (e) { error = msg(e); refresh(); }
    return;
  }
  const p = new fb.auth.GoogleAuthProvider();
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  try {
    if (standalone) await fb.auth.signInWithRedirect(fb.authI, p);
    else await fb.auth.signInWithPopup(fb.authI, p);
  } catch (e) {
    if (/popup/.test(msg(e))) await fb.auth.signInWithRedirect(fb.authI, p).catch(x => { error = msg(x); refresh(); });
    else { error = msg(e); refresh(); }
  }
}

export async function syncNow(manual) {
  if (!fb || !user || busy) return;
  busy = true; error = "";
  const { fs, db } = fb;
  try {
    await flush();
    const col = fs.collection(db, "users", user.uid, "stores");
    const snap = await fs.getDocs(col);
    const remote = {}, raw = {};
    let newer = false;
    snap.forEach(d => { const x = d.data(); raw[d.id] = x.json; if ((x.v || 1) > SCHEMA_VERSION) newer = true; try { remote[d.id] = JSON.parse(x.json); } catch (e) {} });
    if (newer) throw new Error("Cloud data is from a newer app version. Reload to update.");
    const incoming = { settings: remote.settings || null };
    RECORD_STORES.forEach(k => (incoming[k] = remote[k] || []));
    if (!incoming.settings) incoming.settings = { u: -1 };
    const merged = migrate(mergeState(S, incoming));
    const batch = fs.writeBatch(db);
    let writes = 0;
    for (const k of RECORD_STORES.concat("settings")) {
      const json = JSON.stringify(merged[k]);
      if (json !== raw[k]) {
        if (json.length > 900000) throw new Error(`"${k}" is too large to sync. Export and tell Claude.`);
        batch.set(fs.doc(col, k), { json, u: Date.now(), v: SCHEMA_VERSION }); writes++;
      }
    }
    if (writes) await batch.commit();
    const changedLocal = RECORD_STORES.concat("settings").some(k => JSON.stringify(merged[k]) !== JSON.stringify(S[k]));
    if (changedLocal) { replaceState(merged); save({ quiet: true }); }
    lastSync = new Date();
    if (changedLocal && ctx) ctx.render();
    if (manual && ctx) ctx.toast("Synced");
  } catch (e) { error = msg(e); if (manual && ctx) ctx.toast("Sync failed: " + error); }
  busy = false; refresh();
}
