// Gatepost Home service worker. Bump CACHE on every release.
const CACHE = 'gp-home-v1';
const SHELL = ['./', './index.html', './app.js?v=1', './manifest.json?v=1', './icon-192.png?v=1', '../logo.png', '../arch-mark.png', '../config.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('gp-home-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Network first for our own files (always fresh when online), cache as offline fallback. Supabase/CDN calls are not cached.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
