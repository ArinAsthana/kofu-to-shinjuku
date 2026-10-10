// Offline app shell. Bump VERSION on every release so phones pick up the new files.
const VERSION = "kts-v1.0.0";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/app.js", "js/data.js", "js/store.js", "js/engine.js", "js/sync.js", "js/firebase-config.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Same-origin: cache first, then network. Firebase and Google requests go straight to the network.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
