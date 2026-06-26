/* command-center service worker — minimal + safe.
   Network-first so the live site always wins; cache is only a
   last-resort offline fallback. Old caches are cleared on activate. */
const CACHE = 'cc-shell-v19';
const SHELL = [
  '.', 'index.html',
  'css/theme.css', 'css/layout.css', 'css/mission.css', 'css/mobile.css',
  'js/mission.js', 'js/effects.js', 'js/panels.js', 'js/mobile.js', 'js/sniper.js', 'js/backdrop.js', 'js/saber.js',
  'manifest.webmanifest', 'icons/icon.svg'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      // a freshly-deployed worker force-reloads any open tab so a stale page can't linger
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => { clients.forEach((c) => { try { c.navigate(c.url); } catch (err) {} }); })
      .catch(() => {})
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // only handle same-origin; let CDN (d3/topojson) go straight to network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    // {cache:'no-cache'} forces a revalidation so "network-first" actually delivers
    // fresh assets — otherwise the browser's heuristic HTTP cache (the dev/Pages server
    // sends no Cache-Control) serves stale files and your deploys never show up.
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || caches.match('index.html')))
  );
});
