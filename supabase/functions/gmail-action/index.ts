// gmail-action  ·  verify_jwt = TRUE
// Performs one action on a message (archive / read / flag / unflag / snooze /
// trash / send) against Gmail, then reflects it in email_cache.
import { getUser, accessTokenFor, admin, corsFor, json } from "./shared.ts";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

function b64urlStr(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// strip CR/LF so client-supplied To/Subject can't inject extra MIME headers
function clean(s: unknown): string {
  return String(s ?? "").replace(/[\r\n]+/g, " ").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });

  const user = await getUser(req);
  if (!user) return json(req, { error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const action: string = body.action;
  const id: string | undefined = body.id;
  if (action !== "send" && !id) return json(req, { error: "missing_id" }, 400);

  let access: string;
  try {
    access = await accessTokenFor(user.id);
  } catch (e) {
    if (String((e as Error).message) === "RECONNECT") return json(req, { reconnect: true });
    console.error("action token error:", e);
    return json(req, { error: "token_error" }, 500);
  }
  const auth = { Authorization: `Bearer ${access}`, "Content-Type": "application/json" };

  async function modify(addLabelIds: string[], removeLabelIds: string[]): Promise<boolean> {
    const r = await fetch(`${GMAIL}/messages/${id}/modify`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    });
    if (!r.ok) console.error("modify failed:", await r.text());
    return r.ok;
  }

  let ok = false;
  let sent = false;
  switch (action) {
    case "archive": ok = await modify([], ["INBOX"]); break;
    case "read":    ok = await modify([], ["UNREAD"]); break;
    case "flag":    ok = await modify(["STARRED"], []); break;
    case "unflag":  ok = await modify([], ["STARRED"]); break;
    case "snooze":  ok = await modify([], ["INBOX"]); break; // v1: behaves like archive
    case "trash": {
      const r = await fetch(`${GMAIL}/messages/${id}/trash`, { method: "POST", headers: auth });
      if (!r.ok) console.error("trash failed:", await r.text());
      ok = r.ok;
      break;
    }
    case "send": {
      const text = String(body.text ?? "");
      let to = clean(body.to);
      let subject = clean(body.subject);
      let threadId = body.threadId as string | undefined;
      const extra: string[] = [];

      // Replying to a specific message: derive thread-consistent headers from the
      // original (Gmail rejects a send into a thread whose Subject doesn't match).
      if (id) {
        const mr = await fetch(
          `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=References`,
          { headers: { Authorization: auth.Authorization } },
        );
        if (mr.ok) {
          const m = await mr.json();
          const hs = (m.payload?.headers || []) as { name: string; value: string }[];
          const get = (n: string) => { const h = hs.find((x) => x.name.toLowerCase() === n.toLowerCase()); return h ? h.value : ""; };
          if (!to) { const fm = get("From").match(/<([^>]+)>/); to = clean(fm ? fm[1] : get("From")); }
          subject = "Re: " + clean(get("Subject")).replace(/^\s*re:\s*/i, "");
          threadId = threadId || m.threadId;
          const msgId = get("Message-ID"), refs = get("References");
          if (msgId) { extra.push(`In-Reply-To: ${clean(msgId)}`); extra.push(`References: ${clean(refs ? refs + " " + msgId : msgId)}`); }
        }
      }
      if (!to) return json(req, { error: "missing_to" }, 400);

      const mime = [
        `To: ${to}`,
        `Subject: ${subject}`,
        ...extra,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "",
        text,
      ].join("\r\n");
      const payload: Record<string, unknown> = { raw: b64urlStr(mime) };
      if (threadId) payload.threadId = threadId;
      const r = await fetch(`${GMAIL}/messages/send`, { method: "POST", headers: auth, body: JSON.stringify(payload) });
      if (!r.ok) console.error("send failed:", await r.text());
      ok = r.ok;
      sent = true;
      break;
    }
    default:
      return json(req, { error: "unknown_action" }, 400);
  }

  // reflect in the cache
  if (ok && id) {
    const sb = admin();
    if (action === "read") {
      await sb.from("email_cache").update({ is_unread: false }).eq("user_id", user.id).eq("gmail_msg_id", id);
    } else if (action !== "send") {
      await sb.from("email_cache").update({ actioned_at: new Date().toISOString() }).eq("user_id", user.id).eq("gmail_msg_id", id);
    }
  }

  return json(req, { ok, sent });
});
