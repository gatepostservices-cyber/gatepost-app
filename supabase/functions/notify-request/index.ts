// OPTIONAL STUB — Supabase Edge Function: SMS alert when a new agent request is inserted.
// Server-side only. Secrets live in Supabase (Edge Functions -> Secrets), never in config.js:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, ALERT_TO, WEBHOOK_SECRET
// Wire up: Database -> Webhooks -> on INSERT into public.items -> POST to this function,
// with header x-webhook-secret: <WEBHOOK_SECRET>. Not deployed; disabled until secrets exist.
Deno.serve(async (req) => {
  const env = (k: string) => Deno.env.get(k) ?? "";
  if (req.headers.get("x-webhook-secret") !== env("WEBHOOK_SECRET") || !env("WEBHOOK_SECRET"))
    return new Response("forbidden", { status: 403 });
  const { record } = await req.json();
  if (!record || record.kind !== "request" || record.status !== "pending") return new Response("skip");
  if (!env("TWILIO_ACCOUNT_SID")) return new Response("twilio not configured");
  const body = new URLSearchParams({
    From: env("TWILIO_FROM"), To: env("ALERT_TO"),
    Body: `Gatepost: new request from ${record.data?.from ?? "agent"}: ${String(record.data?.text ?? "").slice(0, 120)}. Open the app to allow/deny.`,
  });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env("TWILIO_ACCOUNT_SID")}/Messages.json`, {
    method: "POST", body,
    headers: { Authorization: "Basic " + btoa(`${env("TWILIO_ACCOUNT_SID")}:${env("TWILIO_AUTH_TOKEN")}`) },
  });
  return new Response(r.ok ? "sent" : "twilio error", { status: r.ok ? 200 : 502 });
});
