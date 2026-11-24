/* Service worker : l'application fonctionne hors ligne une fois ouverte.
   Les données ne passent jamais par ici : elles restent chiffrées dans IndexedDB. */
const VERSION = "v1.4.0";
const SHELL = ["./", "index.html", "js/vault.js", "js/lock.js", "js/drive.js", "js/app.js", "js/sync.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"];
const LIBS = ["https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL).then(() => c.addAll(LIBS).catch(() => {}))));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});
/* Réseau d'abord pour l'application (mises à jour immédiates), cache en secours hors ligne */
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  const mine = url.origin === location.origin, lib = LIBS.includes(req.url), font = /fonts\.(googleapis|gstatic)\.com/.test(url.host);
  if (!mine && !lib && !font) return;
  e.respondWith(fetch(req, mine ? { cache: "no-cache" } : undefined).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === "navigate" ? caches.match("index.html") : Response.error()))));
});
