// hal-ears  ·  verify_jwt = TRUE
// Speech-to-text for the iPhone app, where Apple blocks live speech
// recognition inside installed (home-screen) web apps. The widget records a
// short clip and posts it here; we forward it to ElevenLabs Scribe and return
// the transcript. The ElevenLabs key lives only in Supabase secrets.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOW = [
  "https://adampurdy101.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];
function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOW.includes(origin) ? origin : ALLOW[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(req, { error: "unauthorized" }, 401);
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await db.auth.getUser();
  if (error || !data?.user) return json(req, { error: "unauthorized" }, 401);

  const key = Deno.env.get("ELEVENLABS_API_KEY");
  if (!key) return json(req, { error: "no_stt_key" }, 500);

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch (_) { /* fall through */ }
  if (!file || file.size < 1000) return json(req, { error: "no_audio" }, 400);
  if (file.size > 8_000_000) return json(req, { error: "too_large" }, 400);

  const out = new FormData();
  out.append("model_id", "scribe_v1");
  out.append("file", file, file.name || "speech.m4a");
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: out,
  });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    console.error("elevenlabs stt failed:", r.status, detail);
    return json(req, { error: "stt_failed", upstream: r.status, detail }, 502);
  }
  const j = await r.json().catch(() => null);
  const text = j && typeof j.text === "string" ? j.text.trim() : "";
  if (!text) return json(req, { error: "empty_transcript" }, 200);
  return json(req, { text });
});
