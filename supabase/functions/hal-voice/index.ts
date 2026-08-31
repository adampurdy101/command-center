// hal-voice  ·  verify_jwt = TRUE
// Text-to-speech for Hal, used by the iPhone app (and any device where the
// on-device voice is weak). Forwards the reply text to ElevenLabs and streams
// the MP3 back. The widget falls back to the browser voice if this fails.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
// deep, calm premade ElevenLabs voice; override with the ELEVENLABS_VOICE_ID secret
const VOICE_ID = Deno.env.get("ELEVENLABS_VOICE_ID") || "pNInz6obpgDQGcFmaJgB";

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
  if (!key) return json(req, { error: "no_tts_key" }, 500);

  const body = await req.json().catch(() => ({}));
  const text = String(body.text || "").slice(0, 500).trim();
  if (!text) return json(req, { error: "missing_text" }, 400);

  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        voice_settings: { stability: 0.55, similarity_boost: 0.7 },
      }),
    },
  );
  if (!r.ok) {
    console.error("elevenlabs tts failed:", r.status, await r.text());
    return json(req, { error: "tts_failed" }, 502);
  }
  return new Response(r.body, {
    status: 200,
    headers: { ...corsFor(req), "Content-Type": "audio/mpeg" },
  });
});
