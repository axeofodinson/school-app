// App shell for the web build (prompt 32): once the app has opened online, it
// opens again without internet (Chromebooks in the lab, Windows). Same-origin
// only: Supabase requests are never touched (the app's own caches and queues
// handle data). Bump VERSION when this file's logic changes.
const VERSION = 'shell-v1';
const SHELL = ['/', '/index.html'];

// Precache the whole build (scripts/sw-manifest.mjs writes sw-assets.json at
// export): every route's chunk, fonts and images, so screens never opened
// online still open offline. Copies the new build no longer lists are dropped.
async function precache() {
  const c = await caches.open(VERSION);
  await c.addAll(SHELL).catch(() => undefined);
  let files = [];
  try {
    const r = await fetch('/sw-assets.json', { cache: 'no-store' });
    if (r.ok) files = (await r.json()).files || [];
  } catch {
    return; // offline install or no manifest: runtime caching still works
  }
  for (const f of files) {
    if (!(await c.match(f))) await c.add(f).catch(() => undefined);
  }
  if (files.length) {
    const keep = new Set(files);
    for (const req of await c.keys()) {
      const path = new URL(req.url).pathname;
      if ((path.startsWith('/_expo/') || path.startsWith('/assets/')) && !keep.has(path)) {
        await c.delete(req);
      }
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page tells us what it loaded before this worker took control (bundles,
// lazy chunks, fonts), so the next offline start has all of it.
self.addEventListener('message', (event) => {
  const urls = event.data && event.data.type === 'cache-urls' ? event.data.urls : null;
  if (!Array.isArray(urls)) return;
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) =>
        Promise.all(
          urls
            .filter((u) => typeof u === 'string' && new URL(u).origin === self.location.origin)
            .map((u) => c.match(u).then((hit) => hit || c.add(u).catch(() => undefined))),
        ),
      ),
  );
});

// Hashed bundles, fonts and images never change at a URL: cache first.
const immutable = (path) =>
  path.startsWith('/_expo/static/') ||
  path.startsWith('/assets/') ||
  /\.(ttf|woff2?|png|webp|svg|ico)$/.test(path);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Network first so a new release shows at once; the saved shell offline.
    // Single-page build: every route is index.html.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put('/index.html', copy));
          }
          return res;
        })
        .catch(() =>
          caches.match('/index.html').then((r) => r || caches.match('/') || Response.error()),
        ),
    );
    return;
  }

  if (immutable(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  event.respondWith(fetch(req).catch(() => caches.match(req).then((r) => r || Response.error())));
});
