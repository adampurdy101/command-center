// gmail-auth-start  ·  verify_jwt = TRUE
// The front-end fetches this (with the user's Supabase JWT) and gets back a
// signed Google consent URL, then navigates the browser to it. The JWT never
// appears in a URL.
import { getUser, signState, SCOPES, REDIRECT_URI, corsFor, json } from "./shared.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });

  const user = await getUser(req);
  if (!user) return json(req, { error: "unauthorized" }, 401);

  const state = await signState(user.id);
  const params = new URLSearchParams({
    client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",      // ask for a refresh token
    prompt: "consent",           // force a refresh token on every (re)connect
    include_granted_scopes: "true",
    state,
  });
  return json(req, { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});
