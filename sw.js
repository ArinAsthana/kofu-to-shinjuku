// Offline app shell. Bump VERSION on every release so phones pick up the new files.
const VERSION = "kts-v6.0";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/app.css", "css/topo.svg",
  "js/app.js", "js/data.js", "js/store.js", "js/engine.js", "js/sync.js", "js/charts.js", "js/planner.js", "js/icons.js", "js/study.js", "js/px.js", "js/cards.js", "js/decks.js", "js/jlpt.js", "js/social.js", "js/system.js", "js/classes.js", "js/alarms.js", "js/usage.js", "js/path.js", "data/path/plan.json", "data/path/resources.json", "data/disciplines/index.json", "data/disciplines/acct.json", "data/disciplines/bjp.json", "data/disciplines/cfv.json", "data/disciplines/cmp.json", "data/disciplines/deriv.json", "data/disciplines/econ.json", "data/disciplines/jobhunt.json", "data/disciplines/maths.json", "data/disciplines/mgmt.json", "data/disciplines/music.json", "data/disciplines/politics.json", "data/disciplines/sap.json", "data/disciplines/sound.json", "data/disciplines/sql.json", "data/disciplines/strat.json", "data/jlpt/n5.json", "data/jlpt/n4.json", "data/jlpt/n3.json", "data/jlpt/n2.json", "js/firebase-config.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Same-origin: network first so a new release shows on the next open; the cache is the offline fallback.
// Firebase and Google requests go straight to the network.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
