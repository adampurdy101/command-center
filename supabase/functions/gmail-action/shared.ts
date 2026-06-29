// ============================================================
//  SHARED HELPERS for the gmail-* edge functions.
//  Canonical copy. A duplicate of this file is bundled into each
//  function as ./shared.ts at deploy time — keep them in sync.
//
//  SECURITY NOTES:
//  - The Google client secret + refresh token NEVER leave the server.
//  - The refresh token is stored encrypted in Supabase Vault via
//    SECURITY DEFINER RPCs (execute granted to service_role only).
//  - The OAuth `state` is an HMAC-signed {uid, exp}, signed with the
//    auto-injected service-role key, giving CSRF protection + a verified
//    user id carried from auth-start to auth-callback. 5-minute expiry.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

/* ---- fixed, non-secret config for this deployment ---- */
export const REDIRECT_URI = "https://fzsfizqkolkxkorgvtcl.supabase.co/functions/v1/gmail-auth-callback";
export const APP_URL = "https://adampurdy101.github.io/command-center/";
export const SCOPES = "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/* ---- CORS (origin-allowlisted; reflects the caller when allowed) ---- */
const ALLOW = [
  "https://adampurdy101.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];
export function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOW.includes(origin) ? origin : ALLOW[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
}
export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

/* ---- service-role client (bypasses RLS; used for Vault RPCs + cache writes keyed by user_id) ---- */
export const admin = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/* ---- resolve the logged-in user from the request's Authorization header ---- */
export async function getUser(req: Request) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

/* ---- base64url ---- */
function b64urlFromBytes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function bytesFromB64url(str: string): Uint8Array {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function b64urlText(input: string): string {
  return b64urlFromBytes(new TextEncoder().encode(input));
}

/* ---- HMAC-signed state (CSRF + carries uid), keyed by the service-role key ---- */
async function hmacKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SERVICE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function signState(uid: string): Promise<string> {
  const body = b64urlText(JSON.stringify({ uid, exp: Date.now() + 5 * 60 * 1000 }));
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(body)),
  );
  return `${body}.${b64urlFromBytes(sigBytes)}`;
}
export async function verifyState(state: string): Promise<{ uid: string } | null> {
  try {
    const [body, sig] = (state || "").split(".");
    if (!body || !sig) return null;
    // NB: decode + verify are INSIDE the try — malformed base64url throws, and we
    // must return null (→ clean error redirect) rather than an uncaught 500.
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      bytesFromB64url(sig),
      new TextEncoder().encode(body),
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(bytesFromB64url(body)));
    if (!payload?.uid || typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    return { uid: String(payload.uid) };
  } catch {
    return null;
  }
}

/* ---- token storage via SECURITY DEFINER RPCs (Vault) ---- */
export async function saveRefreshToken(uid: string, token: string): Promise<void> {
  const { error } = await admin().rpc("store_gmail_refresh_token", { p_user: uid, p_token: token });
  if (error) throw new Error("token store failed: " + error.message);
}
export async function loadRefreshToken(uid: string): Promise<string | null> {
  const { data, error } = await admin().rpc("read_gmail_refresh_token", { p_user: uid });
  if (error) { console.error("read_gmail_refresh_token rpc error:", error.message); return null; }
  return data || null;
}
export async function deleteRefreshToken(uid: string): Promise<void> {
  await admin().rpc("delete_gmail_refresh_token", { p_user: uid });
}

/* ---- Google OAuth: code exchange + access-token refresh ---- */
export async function exchangeCode(code: string): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    code,
    client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
    client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  });
  const r = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error("code exchange failed: " + (await r.text()));
  return await r.json();
}
// returns a fresh access token, or throws Error("RECONNECT") if the refresh token is dead/missing
export async function accessTokenFor(uid: string): Promise<string> {
  const rt = await loadRefreshToken(uid);
  if (!rt) throw new Error("RECONNECT");
  const body = new URLSearchParams({
    client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
    client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    refresh_token: rt,
    grant_type: "refresh_token",
  });
  const r = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    const t = await r.text();
    if (t.includes("invalid_grant")) throw new Error("RECONNECT");   // refresh token dead → reconnect
    console.error("token refresh failed:", t);
    throw new Error("token refresh failed");
  }
  const j = await r.json();
  if (!j.access_token) throw new Error("RECONNECT");
  return j.access_token as string;
}
