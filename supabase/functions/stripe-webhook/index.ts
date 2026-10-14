// Supabase Edge Function: stripe-webhook (Gatepost Home billing, Stripe TEST mode only).
// Deploy with verify_jwt = false. Stripe signs each event; we verify with STRIPE_WEBHOOK_SECRET.
// Handles checkout.session.completed, customer.subscription.created/updated/deleted -> public.customer_profiles.
import { createClient } from "jsr:@supabase/supabase-js@2";

const PLANS: Record<string, string> = { oncall: "On-Call", keepup: "Keep-Up", fullcare: "Full Care", landlord: "Landlord" };
const enc = new TextEncoder();

async function verify(payload: string, header: string, secret: string, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2)).filter((p) => p.length === 2).map(([k, v]) => [k, v])) as Record<string, string>;
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const t = parts["t"];
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(`${t}.${payload}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => s.length === hex.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}
async function stripeGet(path: string) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}` } });
  const j = await r.json(); if (!r.ok) throw new Error(j?.error?.message ?? `Stripe ${r.status}`); return j;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  if (!secret || !/^(sk|rk)_test_/.test(Deno.env.get("STRIPE_SECRET_KEY") ?? "")) return new Response("not configured", { status: 503 });
  const payload = await req.text();
  if (!(await verify(payload, req.headers.get("stripe-signature") ?? "", secret))) return new Response("bad signature", { status: 400 });
  const event = JSON.parse(payload);
  if (event.livemode) return new Response("live events ignored", { status: 200 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  async function applySub(sub: any, userIdHint?: string) {
    const planKey = sub.metadata?.plan ?? sub.items?.data?.[0]?.price?.metadata?.plan ?? null;
    const ended = !["active", "trialing", "past_due"].includes(sub.status);
    const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
    const row: Record<string, unknown> = {
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
      stripe_subscription_id: sub.id,
      subscription_status: sub.status,
      plan_key: ended ? null : planKey,
      plan: ended ? null : (PLANS[planKey] ?? null),
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    };
    const userId = userIdHint ?? sub.metadata?.supabase_user_id;
    const q = userId ? admin.from("customer_profiles").upsert({ id: userId, ...row }, { onConflict: "id" })
                     : admin.from("customer_profiles").update(row).eq("stripe_customer_id", row.stripe_customer_id as string);
    const { error } = await q; if (error) throw new Error(error.message);
  }

  try {
    const o = event.data.object;
    switch (event.type) {
      case "checkout.session.completed":
        if (o.mode === "subscription" && o.subscription) await applySub(await stripeGet(`subscriptions/${o.subscription}`), o.client_reference_id ?? o.metadata?.supabase_user_id);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySub(await stripeGet(`subscriptions/${o.id}`)); // re-fetch: events can arrive out of order
        break;
    }
    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error(event.type, e);
    return new Response("handler error", { status: 500 });
  }
});
