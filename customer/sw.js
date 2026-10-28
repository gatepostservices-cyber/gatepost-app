// Gatepost Home service worker (scope /customer/). Bump CACHE on every release.
const CACHE = 'gp-home-v9';
const SBJS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.min.js';
const SHELL = ['./', './index.html', './app.js?v=8', './manifest.json?v=1', './icon-192.png?v=1', './apple-touch-icon.png?v=1', '../logo.png', '../arch-mark.png?v=2', '../config.js', SBJS];
// One missing file must not abort the whole install.
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('gp-home-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Own files: network first (fresh when online), cache as offline fallback. Pinned supabase-js: cache first (immutable).
// Supabase API/auth/storage and other CDN calls are never cached.
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET') return;
  if (req.url === SBJS) { e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => { if (n.ok) { const c = n.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return n; }))); return; }
  if (u.origin !== location.origin) return;
  e.respondWith(fetch(req).then(r => { if (r.ok && r.type === 'basic') { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; })
    .catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html', { ignoreSearch: true }) : Response.error()))));
});
