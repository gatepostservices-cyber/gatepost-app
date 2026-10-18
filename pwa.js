// Team app PWA bootstrap: SW registration + feature-flagged web push.
(function () {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).then(r => r.update()).catch(err => console.warn('SW register failed', err));
    // A new release took over: reload once so the installed app never keeps running an old build.
    { const had = !!navigator.serviceWorker.controller; let done = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !done) { done = true; location.reload(); } }); }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {}); });
  });
  // Web push: GatepostPush.enable() must run from a user tap. Server: supabase/functions/send-push + supabase-push.sql.
  const CFG = window.GATEPOST_CONFIG || {};
  const b64 = s => { s = (s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
  window.GatepostPush = {
    supported() { return !!(CFG.VAPID_PUBLIC_KEY && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window); },
    async enable(sb) {
      if (!this.supported()) return { ok: false, reason: 'not-configured-or-unsupported' };
      if ((await Notification.requestPermission()) !== 'granted') return { ok: false, reason: 'denied' };
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(CFG.VAPID_PUBLIC_KEY) });
      const j = sub.toJSON();
      if (sb) {
        const { data: { user } } = await sb.auth.getUser();
        const { error } = await sb.from('push_subscriptions').upsert({ user_id: user && user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent }, { onConflict: 'endpoint' });
        if (error) return { ok: false, reason: error.message };
      }
      if (sb) { try { await sb.functions.invoke('send-push', { body: { test: true } }); } catch (_) {} }
      return { ok: true };
    },
    async status() {
      if (!('Notification' in window) || !('PushManager' in window)) return 'unsupported';
      if (Notification.permission === 'denied') return 'denied';
      const reg = await navigator.serviceWorker.getRegistration();
      return reg && (await reg.pushManager.getSubscription()) ? 'on' : 'off';
    }
  };
  // UI entry point (Places menu -> Notifications).
  window.gpPushUI = async () => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (ios && !standalone) return alert('On iPhone/iPad, notifications need the app on your Home Screen first:\nShare button -> "Add to Home Screen", then open Gatepost from the Home Screen icon and tap Notifications again.');
    if (!GatepostPush.supported()) return alert('This browser does not support web push notifications.');
    const st = await GatepostPush.status();
    if (st === 'denied') return alert('Notifications are blocked for this app. Turn them on in your browser or phone Settings, then try again.');
    const r = await GatepostPush.enable(window.gpSb);
    alert(r.ok ? (st === 'on' ? 'Notifications are already on for this device. A test notification was sent.' : 'Notifications are on for this device. You should get a test notification now.') : 'Could not turn on notifications: ' + r.reason);
  };
})();
