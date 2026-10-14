// Gatepost TEAM app service worker (scope /gatepost-app/). Bump VERSION on every release that changes the shell.
const VERSION = 'gp-team-v1';
const SHELL = ['./', './index.html', './config.js', './manifest.json?v=9', './icon-192.png?v=4', './icon-512.png?v=4', './apple-touch-icon.png?v=4', './logo.png', './arch-mark.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('gp-team-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network-first for same-origin GETs; cache is only an offline fallback.
// Never touches cross-origin requests (Supabase API/auth/storage, CDNs, PostHog) and never touches /customer/ (own SW).
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  const base = new URL('./', self.registration.scope).pathname;
  if (!u.pathname.startsWith(base) || u.pathname.startsWith(base + 'customer/') || u.pathname.startsWith(base + 'supabase/')) return;
  e.respondWith(fetch(req).then(r => {
    if (r.ok && r.type === 'basic') { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); }
    return r;
  }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
// Web push (client side; inert until the server sends pushes).
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Gatepost', { body: d.body || '', icon: 'icon-192.png?v=4', badge: 'icon-192.png?v=4', data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if (c.url.startsWith(self.registration.scope) && 'focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); }
    return clients.openWindow(url);
  }));
});
