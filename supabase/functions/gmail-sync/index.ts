// gmail-sync  ·  verify_jwt = TRUE
// Pulls recent inbox messages (metadata only — no bodies), upserts the slim
// rows into email_cache, and returns the list. Bodies are fetched live by the
// client when a thread is opened, never stored here.
import { getUser, accessTokenFor, admin, corsFor, json } from "./shared.ts";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX = 25;          // small cap — personal app
const CONCURRENCY = 6;   // bound the per-message metadata fetches

type Header = { name: string; value: string };
function header(headers: Header[], name: string): string {
  const h = (headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}
function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m) return { name: (m[1] || "").trim() || m[2].trim(), email: m[2].trim() };
  return { name: from.trim(), email: from.trim() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });

  const user = await getUser(req);
  if (!user) return json(req, { error: "unauthorized" }, 401);

  let access: string;
  try {
    access = await accessTokenFor(user.id);
  } catch (e) {
    if (String((e as Error).message) === "RECONNECT") {
      return json(req, { connected: false, reconnect: true, items: [] });
    }
    console.error("sync token error:", e);
    return json(req, { error: "token_error" }, 500);
  }
  const auth = { Authorization: `Bearer ${access}` };

  // recent inbox message ids
  const listRes = await fetch(`${GMAIL}/messages?maxResults=${MAX}&labelIds=INBOX`, { headers: auth });
  if (listRes.status === 401) return json(req, { connected: false, reconnect: true, items: [] });
  if (!listRes.ok) return json(req, { error: "gmail_list_failed" }, 502);
  const list = await listRes.json();
  const ids: string[] = (list.messages || []).map((m: { id: string }) => m.id);

  let reconnect = false;
  async function fetchMeta(id: string): Promise<Record<string, unknown> | null> {
    const mr = await fetch(
      `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: auth },
    );
    if (mr.status === 401) { reconnect = true; return null; }
    if (!mr.ok) return null;
    const m = await mr.json();
    const hs: Header[] = m.payload?.headers || [];
    const from = parseFrom(header(hs, "From"));
    const labels: string[] = m.labelIds || [];
    const internal = Number(m.internalDate);
    return {
      user_id: user.id,
      gmail_msg_id: m.id,
      thread_id: m.threadId,
      from_name: from.name,
      from_email: from.email,
      subject: header(hs, "Subject"),
      snippet: m.snippet || "",
      received_at: Number.isFinite(internal) ? new Date(internal).toISOString() : null,
      is_unread: labels.includes("UNREAD"),
      labels,
      cached_at: new Date().toISOString(),
      // NB: deliberately NOT writing actioned_at/hal_summary/hal_draft/band here,
      // so upsert preserves them on rows we've already enriched/acted on.
    };
  }

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const chunk = ids.slice(i, i + CONCURRENCY);
    const got = await Promise.all(chunk.map(fetchMeta));
    for (const r of got) if (r) rows.push(r);
    if (reconnect) break;
  }
  if (reconnect) return json(req, { connected: false, reconnect: true, items: [] });

  const sb = admin();
  if (rows.length) {
    const { error } = await sb.from("email_cache").upsert(rows, { onConflict: "user_id,gmail_msg_id" });
    if (error) { console.error("cache write failed:", error.message); return json(req, { error: "cache_write_failed" }, 500); }
  }
  await sb.from("sync_state").upsert(
    { user_id: user.id, last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );

  return json(req, { connected: true, count: rows.length, items: rows });
});
