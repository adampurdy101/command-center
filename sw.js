/* command-center service worker — minimal + safe.
   Network-first so the live site always wins; cache is only a
   last-resort offline fallback. Old caches are cleared on activate. */
const CACHE = 'cc-shell-v60';
const SHELL = [
  '.', 'index.html',
  'css/theme.css', 'css/layout.css', 'css/mission.css', 'css/mobile.css', 'css/enhance.css', 'css/cinema.css', 'css/email.css', 'css/noir.css', 'css/deck.css', 'css/board.css',
  'js/mission.js', 'js/globe.js', 'js/deck.js', 'js/effects.js', 'js/weather.js', 'js/panels.js', 'js/mobile.js', 'js/sniper-x.js', 'js/cinema.js', 'js/backdrop.js', 'js/saber.js', 'js/enhance.js', 'js/email.js', 'js/gmail.js', 'js/hal.js', 'js/noir.js', 'js/app.js', 'js/board.js', 'js/auth.js', 'js/supabase.js', 'js/config.js',
  'manifest.webmanifest', 'icons/icon.svg'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

// the page posts this when it spots a ready update, so we take over without waiting
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING' || (e.data && e.data.type === 'SKIP_WAITING')) self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      // claim controls open pages → fires controllerchange → the page reloads itself once
      // (cleaner than force-navigating here, which double-reloaded)
      .then(() => self.clients.claim())
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
