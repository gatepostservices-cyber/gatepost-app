// send-push: delivers Web Push to team-app subscribers.
// Called by DB triggers (header x-push-secret) with {audience:'admin'|'team', title, body, url},
// or by a signed-in user with {test:true} to send a test notification to their own devices.
// VAPID keys + hook secret live in public.push_config (RLS, no policies: service role only).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
let cfg: Record<string, string> | null = null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!cfg) {
    const { data, error } = await admin.from("push_config").select("key,value");
    if (error) return json({ error: "config" }, 500);
    cfg = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
    webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);
  }
  const p = await req.json().catch(() => ({}));
  let userIds: string[] = [];
  let msg = { title: String(p.title ?? "Gatepost").slice(0, 80), body: String(p.body ?? "").slice(0, 180), url: String(p.url ?? "./") };

  if (cfg.hook_secret && req.headers.get("x-push-secret") === cfg.hook_secret) {
    const roles = p.audience === "team" ? ["admin", "employee"] : ["admin"];
    const { data } = await admin.from("profiles").select("id").in("role", roles);
    userIds = (data ?? []).map((r) => r.id);
  } else {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user || !p.test) return json({ error: "forbidden" }, 403);
    userIds = [user.id];
    msg = { title: "Gatepost notifications are on", body: "You'll get alerts here.", url: "./" };
  }
  if (!userIds.length) return json({ sent: 0 });
  const { data: subs } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").in("user_id", userIds);
  let sent = 0, removed = 0, failed = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 3600, urgency: "high" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) { await admin.from("push_subscriptions").delete().eq("id", s.id); removed++; } else failed++;
    }
  }));
  return json({ sent, removed, failed });
});
