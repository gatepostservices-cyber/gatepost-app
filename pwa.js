// Team app PWA bootstrap: SW registration + feature-flagged web push.
(function () {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(err => console.warn('SW register failed', err));
  });
  // Web push is OFF until CFG.VAPID_PUBLIC_KEY is set in config.js and the push_subscriptions table exists
  // (see supabase-push.sql). Call GatepostPush.enable() ONLY from a user tap.
  const CFG = window.GATEPOST_CONFIG || {};
  const b64 = s => { s = (s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
  window.GatepostPush = {
    supported() { return !!(CFG.VAPID_PUBLIC_KEY && 'PushManager' in window && 'Notification' in window); },
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
      return { ok: true };
    }
  };
})();
