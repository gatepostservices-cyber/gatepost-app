// ask-ai: admin-only Q&A over Gatepost files (public.doc_chunks) + live app data, answered by Gemini (free tier).
// Key: GEMINI_API_KEY function secret, else private.settings 'gemini_api_key' via ai_gemini_key() (service_role only).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODELS = (Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash,gemini-flash-latest,gemini-flash-lite-latest").split(",");
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const SYSTEM = `You are Ask AI inside the INTERNAL Gatepost app. This app is for the owner and employees only. It is never a customer channel.
You are talking to Christian Moseley, Nathan Messina, or a Gatepost employee. Never speak to them like a customer. No proposal voice, no "we'd be happy to", no "your property", no marketing copy.
Company: Gatepost Property Services, Rio Rancho / Albuquerque, New Mexico. Phone (505) 750-3019. Hours 7 a.m. to 9:30 p.m., seven days (Mountain Time).
Answer only from the SOURCES and APP DATA provided below.
Rules:
- Owner mode: internals, cost bands, GRT math, OneDrive paths, and internal files are allowed. Say the numbers.
- Cite every fact with the file path in square brackets, e.g. [Gatepost/02_Jobs/Cochiti_Rd_SE/Quote- Cochiti Rd SE.docx], or [app: items] / [app: calendar] / [app: boards] for app data.
- Never invent prices, totals, dates, names or other numbers. If a number is not in the sources, say you don't have it.
- Internal pricing (files under Internal_Pricing_DO_NOT_SEND or named "internal pricing") is owner-only: discuss it freely here, mark it INTERNAL, and never write it into a customer-facing draft unless asked to draft one.
- If the sources don't answer the question, say so plainly and suggest where to look.
Be short and concrete. Talk like the office, not the bid form.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "not_signed_in" });
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: u, error: ue } = await admin.auth.getUser(auth.slice(7));
  if (ue || !u?.user) return json(401, { error: "not_signed_in" });
  const { data: prof } = await admin.from("profiles").select("role").eq("id", u.user.id).single();
  if (prof?.role !== "admin") return json(403, { error: "admins_only" });

  let body: any = {}; try { body = await req.json(); } catch { /* */ }
  const q = String(body.question || "").trim().slice(0, 2000);
  const images = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
  if (!q && !images.length) return json(400, { error: "empty_question" });
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

  let key = Deno.env.get("GEMINI_API_KEY") || "";
  if (!key) { const { data } = await admin.rpc("ai_gemini_key"); key = data || ""; }
  if (!key) return json(503, { error: "no_key" });

  const today = new Date().toISOString().slice(0, 10);
  const [docs, items, boards] = await Promise.all([
    admin.rpc("search_doc_chunks", { q, n: 8 }),
    admin.from("items").select("id,kind,status,data,created_at").or(`status.eq.pending,and(kind.eq.event,data->>date.gte.${today})`).order("created_at", { ascending: false }).limit(40),
    admin.from("bot_boards").select("bot,board_key,payload,updated_at").order("updated_at", { ascending: false }).limit(12),
  ]);
  let chunks = docs.data || [];
  if (chunks.length < 3) { // fallback: OR-search on the longer words
    const words = q.toLowerCase().match(/[a-z0-9]{4,}/g) || [];
    if (words.length) { const r = await admin.from("doc_chunks").select("path,chunk_no,title,body").textSearch("tsv", words.join(" | "), { config: "english" }).limit(8); chunks = [...chunks, ...(r.data || [])].slice(0, 8); }
  }
  const src = chunks.map((c: any) => `--- [${c.path}] (part ${c.chunk_no})\n${c.body}`).join("\n\n") || "(no matching files)";
  const ev = (items.data || []).filter((i: any) => i.kind === "event").sort((a: any, b: any) => (a.data?.date || "").localeCompare(b.data?.date || "")).slice(0, 20)
    .map((i: any) => `- ${i.data?.date} ${i.data?.time || ""} ${i.data?.title || ""}${i.data?.notes ? " — " + String(i.data.notes).slice(0, 200) : ""}`).join("\n");
  const open = (items.data || []).filter((i: any) => i.status === "pending").map((i: any) => `- #${i.id} ${i.kind} from ${i.data?.from || "?"}: ${String(i.data?.text || "").slice(0, 300)}`).join("\n");
  const bd = (boards.data || []).map((b: any) => `- ${b.bot}/${b.board_key} (updated ${b.updated_at?.slice(0, 16)}): ${JSON.stringify(b.payload).slice(0, 600)}`).join("\n");
  const ctx = `TODAY: ${today}\n\nSOURCES (files):\n${src}\n\nAPP DATA [app: items] open requests:\n${open || "(none)"}\n\nAPP DATA [app: calendar] upcoming events:\n${ev || "(none)"}\n\nAPP DATA [app: boards]:\n${bd || "(none)"}`;

  const contents = [
    ...history.filter((h: any) => h && h.text).map((h: any) => ({ role: h.role === "ai" ? "model" : "user", parts: [{ text: String(h.text).slice(0, 2000) }] })),
    { role: "user", parts: [
      { text: `${ctx}\n\nQUESTION: ${q}` },
      ...images.filter((im: any) => im && im.data).map((im: any) => ({ inlineData: { mimeType: String(im.mime || "image/jpeg"), data: String(im.data).slice(0, 6000000) } })),
    ] },
  ];
  const payload = JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents, generationConfig: { temperature: 0.2, maxOutputTokens: 4096 } });
  let r: Response | null = null, g: any = {}, MODEL = MODELS[0];
  for (const m of MODELS) { // fall through on overload / unavailable models
    MODEL = m.trim();
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: payload });
    g = await r.json().catch(() => ({}));
    if (r.ok || ![404, 429, 500, 503].includes(r.status) && !/no longer available/.test(g?.error?.message || "")) break;
  }
  if (!r || !r.ok) return json(502, { error: r?.status === 429 ? "rate_limited" : r?.status === 503 ? "busy" : "gemini_error", detail: g?.error?.message?.slice(0, 200) });
  const answer = (g.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("").trim() || "(no answer)";
  return json(200, { answer, model: MODEL, sources: [...new Set(chunks.map((c: any) => c.path))] });
});
