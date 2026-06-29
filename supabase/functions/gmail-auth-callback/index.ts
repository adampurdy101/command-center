// gmail-auth-callback  ·  verify_jwt = FALSE  (Google redirects the browser here
// with no Supabase JWT). Protected instead by the HMAC-signed `state`.
// Exchanges the code for a refresh token, stores it in Vault, then redirects
// the browser back to the dashboard.
import { verifyState, exchangeCode, saveRefreshToken, APP_URL } from "./shared.ts";

function back(status: "connected" | "error", reason = ""): Response {
  const u = new URL(APP_URL);
  u.searchParams.set("gmail", status);
  if (reason) u.searchParams.set("reason", reason);
  return Response.redirect(u.toString(), 302);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  const gErr = url.searchParams.get("error");
  if (gErr) return back("error", gErr);                 // user denied, etc.

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back("error", "missing_params");

  const v = await verifyState(state);                   // CSRF + uid, 5-min expiry
  if (!v) return back("error", "bad_state");

  try {
    const tok = await exchangeCode(code);
    const refresh = tok.refresh_token as string | undefined;
    if (!refresh) return back("error", "no_refresh_token");
    await saveRefreshToken(v.uid, refresh);
    return back("connected");
  } catch (_e) {
    return back("error", "exchange_failed");
  }
});
