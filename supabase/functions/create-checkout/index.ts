// Supabase Edge Function: create-checkout (Gatepost Home billing, Stripe TEST mode only).
// POST { action: "checkout", plan: "oncall"|"keepup"|"fullcare"|"landlord" } -> { url } (Stripe Checkout, subscription mode)
// POST { action: "portal" } -> { url } (Stripe Customer Portal: update card, cancel at period end)
// Caller must be a signed-in customer (Authorization: Bearer <user JWT>).
// Secrets: STRIPE_SECRET_KEY (must be sk_test_/rk_test_), optional STRIPE_PORTAL_CONFIG, APP_URL.
import { createClient } from "jsr:@supabase/supabase-js@2";

const PLANS: Record<string, string> = { oncall: "On-Call", keepup: "Keep-Up", fullcare: "Full Care", landlord: "Landlord" };
const APP_URL = Deno.env.get("APP_URL") ?? "https://gatepostservices-cyber.github.io/gatepost-app/customer/";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

function form(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v as Record<string, unknown>, key, out); else out.append(key, String(v));
  }
  return out;
}
async function stripe(method: string, path: string, params?: Record<string, unknown>) {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const body = params ? form(params) : undefined;
  const url = `https://api.stripe.com/v1/${path}` + (method === "GET" && body ? `?${body}` : "");
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: method === "GET" ? undefined : body });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `Stripe error ${r.status}`);
  return j;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!/^(sk|rk)_test_/.test(key)) return json({ error: "Billing is not set up yet. Call us at (505) 750-3019." }, 503);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json({ error: "Please sign in first." }, 401);
  const { data: role } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (role && role.role && role.role !== "customer") return json({ error: "Customer accounts only." }, 403);

  let input: { action?: string; plan?: string } = {};
  try { input = await req.json(); } catch { /* empty */ }
  const action = input.action ?? "checkout";

  try {
    const { data: prof } = await admin.from("customer_profiles").select("*").eq("id", user.id).maybeSingle();
    let customerId: string | null = prof?.stripe_customer_id ?? null;

    if (action === "portal") {
      if (!customerId) return json({ error: "No billing account yet. Pick a plan first." }, 400);
      const s = await stripe("POST", "billing_portal/sessions", {
        customer: customerId, return_url: APP_URL, configuration: Deno.env.get("STRIPE_PORTAL_CONFIG") || undefined,
      });
      return json({ url: s.url });
    }

    const plan = String(input.plan ?? "");
    if (!PLANS[plan]) return json({ error: "Unknown plan." }, 400);
    if (prof?.stripe_subscription_id && ["active", "trialing", "past_due"].includes(prof?.subscription_status ?? ""))
      return json({ error: "You already have a plan. Use Manage billing, or call us to change plans." }, 409);

    const prices = await stripe("GET", "prices", { "lookup_keys[]": `gp_${plan}_monthly`, active: "true", limit: 1 });
    const price = prices.data?.[0];
    if (!price || price.livemode) return json({ error: "Plan price not found." }, 500);

    if (!customerId) {
      const c = await stripe("POST", "customers", {
        email: user.email, name: prof?.full_name || undefined, phone: prof?.phone || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = c.id;
      const row = { id: user.id, stripe_customer_id: customerId, updated_at: new Date().toISOString() };
      const { error } = await admin.from("customer_profiles").upsert(row, { onConflict: "id" });
      if (error) throw new Error(error.message);
    }

    // Stripe Tax: only turn on automatic_tax once the account's tax settings are active (head office + NM registration).
    const tax = await stripe("GET", "tax/settings").catch(() => null);
    const taxOn = tax?.status === "active";

    const session = await stripe("POST", "checkout/sessions", {
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: { 0: { price: price.id, quantity: 1 } },
      automatic_tax: { enabled: taxOn },
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      allow_promotion_codes: "false",
      metadata: { supabase_user_id: user.id, plan },
      subscription_data: { metadata: { supabase_user_id: user.id, plan } },
      success_url: `${APP_URL}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}?checkout=cancel`,
    });
    return json({ url: session.url, tax: taxOn });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
