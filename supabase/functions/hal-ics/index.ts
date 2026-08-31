// hal-ics  ·  verify_jwt = FALSE (Apple Calendar fetches it with no headers)
// Serves Hal's events as a private ICS calendar feed for iPhone subscription.
// Security: the feed URL carries a secret token derived (HMAC) from the
// service-role key — unguessable, never stored, and shown only to the
// logged-in user via the POST branch. GET without the token = 404.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
}

async function feedToken(): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SERVICE_KEY),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("hal-ics-feed-v1")));
  return Array.from(sig.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function icsEscape(s: string): string {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function pad(n: number): string { return String(n).padStart(2, "0"); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
  const url = new URL(req.url);
  const token = await feedToken();

  // POST with a valid login → hand back the private subscription URL
  if (req.method === "POST") {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsFor(req), "Content-Type": "application/json" } });
    const db = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
    const { data, error } = await db.auth.getUser();
    if (error || !data?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsFor(req), "Content-Type": "application/json" } });
    const feed = `${SUPABASE_URL}/functions/v1/hal-ics?t=${token}`;
    return new Response(JSON.stringify({ url: feed, webcal: feed.replace(/^https:/, "webcal:") }), { headers: { ...corsFor(req), "Content-Type": "application/json" } });
  }

  // GET with the secret token → the calendar feed itself
  if (url.searchParams.get("t") !== token) return new Response("not found", { status: 404 });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const { data: events, error } = await admin
    .from("hal_events")
    .select("id,title,on_date,at_time,duration_min,notes,created_at")
    .gte("on_date", since)
    .order("on_date")
    .limit(500);
  if (error) return new Response("feed error", { status: 500 });
  // open tasks (and the last week's completed ones) ride along as VTODOs so
  // the iPhone Reminders app can display them from the same subscription
  const { data: todos } = await admin
    .from("tasks")
    .select("id,title,done,due,priority,notes,completed_at")
    .or(`done.eq.false,completed_at.gte.${new Date(Date.now() - 7 * 86400000).toISOString()}`)
    .order("due", { ascending: true, nullsFirst: false })
    .limit(200);

  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Command Center//Hal//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Hal · Command Center",
    "X-PUBLISHED-TTL:PT15M",
  ];
  for (const ev of events || []) {
    const d = String(ev.on_date).replace(/-/g, "");
    lines.push("BEGIN:VEVENT", `UID:hal-${ev.id}@command-center`, `DTSTAMP:${stamp}`);
    if (ev.at_time) {
      const [hh, mm] = String(ev.at_time).split(":").map(Number);
      const startMin = hh * 60 + mm, endMin = startMin + (ev.duration_min || 60);
      const eh = Math.floor(endMin / 60) % 24, em = endMin % 60;
      // floating local times — the phone renders them in its own timezone
      lines.push(`DTSTART:${d}T${pad(hh)}${pad(mm)}00`);
      if (endMin < 24 * 60) lines.push(`DTEND:${d}T${pad(eh)}${pad(em)}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${d}`);
    }
    lines.push(`SUMMARY:${icsEscape(ev.title)}`);
    if (ev.notes) lines.push(`DESCRIPTION:${icsEscape(ev.notes)}`);
    // two pings: a 30-minute heads-up AND one right at the moment (reminder-style)
    lines.push("BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(ev.title)}`, "END:VALARM");
    lines.push("BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(ev.title)}`, "END:VALARM", "END:VEVENT");
  }
  for (const t of todos || []) {
    lines.push("BEGIN:VTODO", `UID:hal-task-${t.id}@command-center`, `DTSTAMP:${stamp}`);
    lines.push(`SUMMARY:${icsEscape(t.title)}`);
    if (t.due) lines.push(`DUE;VALUE=DATE:${String(t.due).replace(/-/g, "")}`);
    if (t.notes) lines.push(`DESCRIPTION:${icsEscape(t.notes)}`);
    if (t.priority === "high") lines.push("PRIORITY:1");
    lines.push(t.done ? "STATUS:COMPLETED" : "STATUS:NEEDS-ACTION");
    if (t.done) lines.push("PERCENT-COMPLETE:100");
    lines.push("END:VTODO");
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n"), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-cache" },
  });
});
