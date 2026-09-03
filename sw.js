/* command-center service worker
   ------------------------------------------------------------
   DEPLOY RULE: bump CACHE below on EVERY deploy (v62 → v63 …).
   A new version precaches every shell file fresh, takes over
   immediately, and the page reloads itself once — that is how an
   installed phone app picks up a new build without a hard refresh.

   Strategy:
   · EVERYTHING same-origin (the page, js, css, icons, data) is
     stale-while-revalidate — answered from the cache instantly (no
     waiting on 30+ round trips), refreshed in the background. The page
     and its scripts always come from the same cached set, so a deploy
     can never mix a new index.html with old js (that skew broke login
     for one load once). The version bump above precaches the new set
     atomically and reloads the page; a hard refresh bypasses all this.
   · cross-origin (CDN libs, Supabase, weather): untouched. */
const CACHE = 'cc-shell-v70';
const SHELL = [
  '.', 'index.html',
  'css/theme.css', 'css/layout.css', 'css/mission.css', 'css/mobile.css', 'css/enhance.css', 'css/cinema.css', 'css/email.css', 'css/noir.css', 'css/deck.css', 'css/board.css', 'css/calendar.css',
  'js/mission.js', 'js/globe.js', 'js/deck.js', 'js/effects.js', 'js/weather.js', 'js/panels.js', 'js/mobile.js', 'js/sniper-x.js', 'js/cinema.js', 'js/backdrop.js', 'js/saber.js', 'js/enhance.js', 'js/email.js', 'js/gmail.js', 'js/hal.js', 'js/noir.js', 'js/app.js', 'js/board.js', 'js/bills.js', 'js/auth.js', 'js/supabase.js', 'js/config.js',
  'manifest.webmanifest', 'icons/icon.svg'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // fetch each file straight from the server (cache:'reload' skips the HTTP cache) so a
      // new version never precaches stale bytes; one missing file no longer aborts the rest
      Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))
    ).catch(() => {})
  );
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
      .then(() => self.clients.claim())
      .catch(() => {})
  );
});

function store(req, res) {
  if (!res || !res.ok) return;
  const copy = res.clone();
  caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // CDN / Supabase / weather go straight out

  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  // pages are keyed WITHOUT their query string (?v=… cache-busters, ?gmail=connected) so
  // they always hit the precached copy; everything else is keyed as requested
  const key = isPage ? new Request(url.origin + url.pathname) : req;

  e.respondWith(
    caches.match(key).then((cached) => {
      const refresh = fetch(req, { cache: 'no-cache' })
        .then((res) => { store(key, res); return res; })
        .catch(() => null);
      e.waitUntil(refresh);                       // keep the worker alive until the refresh lands
      if (cached) return cached;
      return refresh.then((res) => res || (isPage ? caches.match('index.html') : null))
        .then((res) => res || Response.error());
    })
  );
});
