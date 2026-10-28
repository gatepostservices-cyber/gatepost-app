// Gatepost TEAM app service worker (scope: site root). Bump VERSION on every release that changes the shell.
const VERSION = 'gp-team-v46';
const SBJS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.min.js';
const SHELL = ['./', './index.html', './config.js?v=req1', './quotes-engine.js?v=5', './quotes-sign.js?v=3', './quotes.js?v=7', './unfinished.js?v=6', './admin.js?v=19', './town.js?v=52', './simplify.js?v=3', './hubs.js?v=1', './hub-team.js?v=1', './hub-wholesale.js?v=4', './chat.js?v=8', './pwa.js?v=8', './manifest.json?v=14', './icon-192.png?v=5', './icon-512.png?v=5', './apple-touch-icon.png?v=5', './logo.png', './arch-mark.png', './assets/bots/alabaster.png', './assets/bots/marv.png', './assets/bots/wendy.png', './assets/bots/abe.png', './assets/bots/alfred.png', SBJS];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('gp-team-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Same-origin GETs: network-first, cache is only an offline fallback.
// The pinned supabase-js build is immutable, so it is served cache-first (lets the synced app open offline instead of dropping to local mode).
// Never touches Supabase API/auth/storage, PostHog, /customer/ (own SW), or /login/ (owner sign-in landing: always straight from the network, never cached, never the offline index.html fallback).
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET') return;
  if (req.url === SBJS) { e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => { if (n.ok) { const c = n.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return n; }))); return; }
  if (u.origin !== location.origin) return;
  const base = new URL('./', self.registration.scope).pathname;
  if (!u.pathname.startsWith(base) || u.pathname.startsWith(base + 'customer/') || u.pathname.startsWith(base + 'login') || u.pathname.startsWith(base + 'supabase/')) return;
  // Navigations skip the 10-min GitHub Pages HTTP cache so a new release's index.html (and its ?v= script URLs) is seen at once.
  e.respondWith((req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req)).then(r => {
    if (r.ok && r.type === 'basic') { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); }
    return r;
  }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html', { ignoreSearch: true }) : Response.error()))));
});
// Web push (server: supabase/functions/send-push).
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Gatepost', { body: d.body || '', icon: 'icon-192.png?v=5', badge: 'icon-192.png?v=5', data: { url: d.url || './' }, tag: d.tag || undefined }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if (c.url.startsWith(self.registration.scope) && 'focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); }
    return clients.openWindow(url);
  }));
});
