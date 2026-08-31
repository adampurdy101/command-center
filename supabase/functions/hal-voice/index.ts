// hal-voice  ·  verify_jwt = TRUE
// Text-to-speech for Hal, used by the iPhone app (and any device where the
// on-device voice is weak). Forwards the reply text to ElevenLabs and streams
// the MP3 back. The widget falls back to the browser voice if this fails.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
// The widget's voice personas mapped to ElevenLabs premade voices, so the
// same dropdown choice drives every platform. Fallback: Adam (deep US male).
const VOICES: Record<string, string> = {
  am_michael: "flq6f7yk4E4fJM5XTYuZ", // Michael — US male (calm)
  am_onyx:    "VR6AewLTigWG4xSOukaG", // deep US male (Arnold)
  am_fenrir:  "TxGEqnHWrfWFTfGW9XjX", // resonant US male (Josh)
  am_adam:    "pNInz6obpgDQGcFmaJgB", // Adam — US male
  am_eric:    "cjVigY5qzO86Huf0OWal", // Eric — US male
  bm_george:  "JBFqnCBsd6RMkjVDRZzb", // George — UK male (measured)
  bm_daniel:  "onwK4e9ZLuTAKqWW03F9", // Daniel — UK male
};
const DEFAULT_VOICE = Deno.env.get("ELEVENLABS_VOICE_ID") || VOICES.am_adam;

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

  // diagnostic: which of the mapped voices actually exist on this account
  if (body.list === true) {
    const vr = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", { headers: { "xi-api-key": key } });
    const vj = await vr.json().catch(() => ({}));
    // deno-lint-ignore no-explicit-any
    const have = new Set(((vj.voices || []) as any[]).map((v) => v.voice_id));
    const report: Record<string, boolean> = {};
    for (const [k2, id] of Object.entries(VOICES)) report[k2] = have.has(id);
    return json(req, { report, total: (vj.voices || []).length });
  }

  const text = String(body.text || "").slice(0, 500).trim();
  if (!text) return json(req, { error: "missing_text" }, 400);
  const wanted = VOICES[String(body.voice || "")] || DEFAULT_VOICE;

  async function tts(voiceId: string): Promise<Response> {
    return await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`,
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
  }
  let r = await tts(wanted);
  if (!r.ok && wanted !== DEFAULT_VOICE) {
    console.error("tts voice failed, falling back:", wanted, r.status, await r.text());
    r = await tts(DEFAULT_VOICE);
  }
  if (!r.ok) {
    console.error("elevenlabs tts failed:", r.status, await r.text());
    return json(req, { error: "tts_failed" }, 502);
  }
  return new Response(r.body, {
    status: 200,
    headers: { ...corsFor(req), "Content-Type": "audio/mpeg" },
  });
});
