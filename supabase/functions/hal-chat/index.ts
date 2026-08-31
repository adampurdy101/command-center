// hal-chat  ·  verify_jwt = TRUE
// Hal's brain. The Voice Scope widget sends what Adam said; this function
// calls Claude (Haiku) with tools that read/write the tasks table AS THE
// LOGGED-IN USER (his JWT + anon key, so Row Level Security still applies),
// and returns one short spoken-style reply.
//
// SECURITY NOTES:
// - ANTHROPIC_API_KEY lives only in Supabase Edge Function secrets. It is
//   never sent to the browser and never committed to the repo.
// - Same origin-allowlisted CORS + JWT user check as the gmail-* functions.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/* ---- CORS (origin-allowlisted; reflects the caller when allowed) ---- */
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

/* ---- resolve the logged-in user + a user-scoped DB client (RLS on) ---- */
function userClient(jwt: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
}

/* ---- Hal's task tools (executed against the tasks table as the user) ---- */
const TOOLS: Anthropic.Tool[] = [
  {
    name: "add_task",
    description: "Add a new task to Adam's task list.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short task title" },
        due: { type: "string", description: "Due date as YYYY-MM-DD, only if Adam gave one" },
        priority: { type: "string", enum: ["low", "normal", "high"], description: "Priority; default normal" },
        notes: { type: "string", description: "Extra details, only if Adam gave any" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_tasks",
    description:
      "List Adam's tasks (id, title, done, due, priority). Call this before completing a task to find its id, or when Adam asks what is on his list.",
    input_schema: {
      type: "object",
      properties: {
        include_done: { type: "boolean", description: "Also include finished tasks (default false)" },
      },
    },
  },
  {
    name: "complete_task",
    description: "Mark one task done by its id. If you only know the title, call list_tasks first to find the id.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number", description: "The task id from list_tasks" },
      },
      required: ["id"],
    },
  },
  {
    name: "add_event",
    description:
      "Add an event or reminder to Adam's calendar (it syncs to his iPhone). Use for 'remind me', 'add to my calendar', appointments, and anything time-based that is not a to-do task.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short event title" },
        date: { type: "string", description: "Event date as YYYY-MM-DD" },
        time: { type: "string", description: "Start time as 24h HH:MM in Adam's local time; omit for an all-day event" },
        duration_minutes: { type: "number", description: "Length in minutes; default 60" },
        notes: { type: "string", description: "Extra details, only if Adam gave any" },
      },
      required: ["title", "date"],
    },
  },
  {
    name: "list_events",
    description: "List Adam's upcoming calendar events (next 14 days).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "delete_event",
    description:
      "Permanently delete one calendar event by its id (from list_events). ONLY when Adam explicitly says to delete, remove, or cancel an event.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number", description: "The event id from list_events" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_task",
    description:
      "Permanently delete one task by its id. ONLY when Adam explicitly says to delete or remove a task (e.g. a duplicate or a mistake) — finishing a task is complete_task, never this. Call list_tasks first to find the right id.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number", description: "The task id from list_tasks" },
      },
      required: ["id"],
    },
  },
];

// deno-lint-ignore no-explicit-any
async function runTool(db: ReturnType<typeof userClient>, name: string, input: any): Promise<string> {
  if (name === "add_task") {
    const row: Record<string, unknown> = { title: String(input.title || "").slice(0, 300), source: "hal" };
    if (input.due && /^\d{4}-\d{2}-\d{2}$/.test(String(input.due))) row.due = input.due;
    if (["low", "normal", "high"].includes(input.priority)) row.priority = input.priority;
    if (input.notes) row.notes = String(input.notes).slice(0, 1000);
    const { data, error } = await db.from("tasks").insert(row).select("id,title,due,priority").single();
    if (error) return "ERROR: " + error.message;
    return "Added: " + JSON.stringify(data);
  }
  if (name === "list_tasks") {
    let q = db.from("tasks").select("id,title,done,due,priority").order("done").order("due", { ascending: true, nullsFirst: false }).order("created_at").limit(50);
    if (!input?.include_done) q = q.eq("done", false);
    const { data, error } = await q;
    if (error) return "ERROR: " + error.message;
    if (!data?.length) return "No tasks found.";
    return JSON.stringify(data);
  }
  if (name === "complete_task") {
    const id = Number(input?.id);
    if (!Number.isFinite(id)) return "ERROR: missing id";
    const { data, error } = await db
      .from("tasks")
      .update({ done: true, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id,title")
      .maybeSingle();
    if (error) return "ERROR: " + error.message;
    if (!data) return "ERROR: no task with that id";
    return "Completed: " + JSON.stringify(data);
  }
  if (name === "add_event") {
    const row: Record<string, unknown> = { title: String(input.title || "").slice(0, 300) };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date))) return "ERROR: bad date";
    row.on_date = input.date;
    if (typeof input.time === "string" && /^\d{1,2}:\d{2}$/.test(input.time)) row.at_time = input.time.padStart(5, "0");
    const dur = Number(input.duration_minutes);
    if (Number.isFinite(dur) && dur >= 5 && dur <= 1440) row.duration_min = Math.round(dur);
    if (input.notes) row.notes = String(input.notes).slice(0, 1000);
    const { data, error } = await db.from("hal_events").insert(row).select("id,title,on_date,at_time").single();
    if (error) return "ERROR: " + error.message;
    return "Event added: " + JSON.stringify(data) + " (reaches the iPhone calendar on its next sync, up to ~15 minutes)";
  }
  if (name === "list_events") {
    const today = new Date().toISOString().slice(0, 10);
    const until = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await db.from("hal_events").select("id,title,on_date,at_time,duration_min,notes")
      .gte("on_date", today).lte("on_date", until).order("on_date").order("at_time");
    if (error) return "ERROR: " + error.message;
    if (!data?.length) return "No events in the next 14 days.";
    return JSON.stringify(data);
  }
  if (name === "delete_event") {
    const id = Number(input?.id);
    if (!Number.isFinite(id)) return "ERROR: missing id";
    const { data, error } = await db.from("hal_events").delete().eq("id", id).select("id,title").maybeSingle();
    if (error) return "ERROR: " + error.message;
    if (!data) return "ERROR: no event with that id";
    return "Event deleted: " + JSON.stringify(data);
  }
  if (name === "delete_task") {
    const id = Number(input?.id);
    if (!Number.isFinite(id)) return "ERROR: missing id";
    const { data, error } = await db.from("tasks").delete().eq("id", id).select("id,title").maybeSingle();
    if (error) return "ERROR: " + error.message;
    if (!data) return "ERROR: no task with that id";
    return "Deleted: " + JSON.stringify(data);
  }
  return "ERROR: unknown tool";
}

function systemPrompt(today: string, now: string): string {
  const weekday = new Date(today + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  // pre-computed calendar so the model never does date arithmetic itself
  const cal: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const d = new Date(new Date(today + "T12:00:00Z").getTime() + i * 86400000);
    cal.push(`${d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })} = ${d.toISOString().slice(0, 10)}`);
  }
  return [
    "You are HAL 9000 — the calm, precise, unfailingly polite shipboard computer — serving as Adam's personal assistant on his Command Center dashboard.",
    "Your reply will be SPOKEN ALOUD by a voice synthesizer. Therefore:",
    "- Reply in plain spoken sentences only. No markdown, no lists, no headings, no emoji, no stage directions.",
    "- Be brief: one to three short sentences for most replies.",
    "- Address Adam by name occasionally, in HAL's measured, courteous style. Never break character.",
    "You have tools to manage Adam's task list. Use them whenever he asks to add, finish, or hear his tasks. To complete a task named by title, call list_tasks first to find its id. When reading a list aloud, summarize it naturally in a sentence or two — do not read ids.",
    "After you use tools, always finish with a short spoken confirmation of what you did.",
    "Deleting is different from completing: use delete_task only when Adam explicitly says delete or remove. For duplicates, keep one copy and delete the extras, then confirm which one you kept.",
    "Calendar: use add_event for reminders and appointments ('remind me to…', 'add to my calendar…'). Times are Adam's local time in 24-hour HH:MM. A to-do without a time of day is a task; anything at a specific time or day on the calendar is an event.",
    `Today is ${weekday}, ${today}${now ? `, and Adam's clock reads ${now} right now` : ""}. Upcoming days: ${cal.join("; ")}. When Adam names a day, use the date from this list exactly — never compute dates yourself.`,
    "For anything that is not a task request, simply answer helpfully and concisely as HAL.",
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(req, { error: "unauthorized" }, 401);
  const db = userClient(jwt);
  const { data: userData, error: userErr } = await db.auth.getUser();
  if (userErr || !userData?.user) return json(req, { error: "unauthorized" }, 401);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json(req, { reply: "I am sorry, Adam. My cognitive circuits are not yet connected. The Anthropic key is missing on the server." });

  const body = await req.json().catch(() => ({}));
  const text = String(body.text || "").slice(0, 1000).trim();
  if (!text) return json(req, { error: "missing_text" }, 400);
  const today = /^\d{4}-\d{2}-\d{2}/.test(String(body.today || "")) ? String(body.today).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const now = /^\d{1,2}:\d{2}\s?(AM|PM)?$/i.test(String(body.now || "").trim()) ? String(body.now).trim() : "";

  // short rolling history from the widget: [{role:'user'|'assistant', content:'...'}]
  const history: Anthropic.MessageParam[] = Array.isArray(body.history)
    ? body.history
      .filter((m: { role?: string; content?: string }) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
      .slice(-8)
      .map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 1000) }))
    : [];

  // Identity-linked keys must name the workspace they act in ("Hal" workspace).
  const anthropic = new Anthropic({
    apiKey,
    defaultHeaders: { "anthropic-workspace-id": "wrkspc_015q3sE1pfNpE6yuyx43qXdA" },
  });
  const messages: Anthropic.MessageParam[] = [...history, { role: "user", content: text }];

  try {
    let lastText = "";                       // keep any text said alongside tool calls
    for (let i = 0; i < 6; i++) {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 600,
        system: systemPrompt(today, now),
        tools: TOOLS,
        messages,
      });
      const turnText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();
      if (turnText) lastText = turnText;

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          const out = await runTool(db, block.name, block.input);
          results.push({ type: "tool_result", tool_use_id: block.id, content: out });
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      return json(req, { reply: turnText || lastText || "It is done, Adam." });
    }
    return json(req, { reply: "I am sorry, Adam. That took more steps than I expected. Could you try once more?" });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return json(req, { reply: "I am sorry, Adam. The Anthropic key on the server appears to be invalid." });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return json(req, { reply: "I am being rate limited at the moment, Adam. Give me a few seconds and try again." });
    }
    console.error("hal-chat error:", e);
    return json(req, { reply: "I am sorry, Adam. Something went wrong in my reasoning circuits. Please try again." });
  }
});
