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

/* ---- who may talk to Hal (every call spends the Anthropic budget) ----
   The owner's account, plus any ids in the optional HAL_ALLOWED_USERS secret
   (comma-separated). Anyone else who signs up gets a polite refusal. */
const OWNER_IDS = new Set(
  ["30cbcbfa-7261-47de-8c91-3d97557fc5f9", ...(Deno.env.get("HAL_ALLOWED_USERS") || "").split(",")]
    .map((s) => s.trim()).filter(Boolean),
);

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
    name: "list_bills",
    description:
      "List Adam's bills from his Bill Calendar that fall due in the next N days: name, amount, due date, whether it is already marked paid, and the account it pays from. Read-only (Adam marks bills paid in the Bill Calendar app). Use for any question about bills, what is due, how much money is due, or what is left this month.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Look-ahead window in days (default 14, max 60)" },
        include_paid: { type: "boolean", description: "Also include bills already marked paid (default true)" },
      },
    },
  },
  {
    name: "mark_bill_paid",
    description:
      "Mark one of Adam's bills paid (or, with paid=false, undo a paid mark). Matches the bill by name. By default marks the oldest unpaid occurrence (for undo: the most recent paid one); pass date (YYYY-MM-DD) to target the occurrence in a specific month. Writes straight to the Bill Calendar app.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The bill's name, or part of it" },
        paid: { type: "boolean", description: "true = mark paid (default), false = mark not paid" },
        date: { type: "string", description: "Optional YYYY-MM-DD inside the month to mark" },
      },
      required: ["name"],
    },
  },
  {
    name: "add_bill",
    description:
      "Add a new bill to Adam's Bill Calendar. Needs a name and amount; due_day is the day of the month (1-31) for a monthly bill, or give due_date (YYYY-MM-DD) for the first occurrence. recur defaults to monthly. account is the paying account's nickname or bank, matched loosely. Confirm the details back to Adam in your reply.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        amount: { type: "number", description: "Dollar amount" },
        due_day: { type: "number", description: "Day of the month it is due (1-31)" },
        due_date: { type: "string", description: "First due date as YYYY-MM-DD (alternative to due_day)" },
        recur: { type: "string", enum: ["monthly", "biweekly", "once"], description: "Default monthly" },
        account: { type: "string", description: "Nickname or bank of the account it pays from, if Adam said" },
        remind_days: { type: "number", description: "Days before the due date to alert; default 2" },
      },
      required: ["name", "amount"],
    },
  },
  {
    name: "update_bill",
    description:
      "Change an existing bill: new amount, new due day, the account it pays from, its recurrence, or its name. Matches the bill by name. Only the fields given change; paid history is kept. Never deletes.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The bill's current name, or part of it" },
        amount: { type: "number" },
        due_day: { type: "number", description: "New day of the month (1-31)" },
        due_date: { type: "string", description: "New anchor date YYYY-MM-DD (biweekly / once)" },
        account: { type: "string", description: "Nickname or bank of the paying account" },
        recur: { type: "string", enum: ["monthly", "biweekly", "once"] },
        new_name: { type: "string" },
      },
      required: ["name"],
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

/* ---- Bill Calendar occurrence logic (straight port of the app / bills-ics) ---- */
type Bill = { id: number; name: string; amount: number; dueDate: string; recur: string; paidMonths?: string[]; acct?: number | null };
type Acct = { id: number; bank: string; nick: string; last4: string };
function dueDayInMonth(b: Bill, y: number, m: number): number {
  const origDay = parseInt(String(b.dueDate).split("-")[2], 10);
  return Math.min(origDay, new Date(y, m + 1, 0).getDate());
}
function occDays(b: Bill, y: number, m: number): number[] {
  if (b.recur === "biweekly") {
    const p = String(b.dueDate).split("-");
    const anchor = new Date(+p[0], +p[1] - 1, +p[2]); anchor.setHours(0, 0, 0, 0);
    const res: number[] = [], last = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const dt = new Date(y, m, d); dt.setHours(0, 0, 0, 0);
      const diff = Math.round((dt.getTime() - anchor.getTime()) / 86400000);
      if (diff >= 0 && diff % 14 === 0) res.push(d);
    }
    return res;
  }
  if (b.recur !== "monthly") {
    const p = String(b.dueDate).split("-");
    return (+p[0] === y && +p[1] - 1 === m) ? [dueDayInMonth(b, y, m)] : [];
  }
  return [dueDayInMonth(b, y, m)];
}
// paidMonths keys use a ZERO-based month ("2026-7" = August), exactly as the app writes them
function isPaidOcc(b: Bill, y: number, m: number, d: number): boolean {
  const pm = b.paidMonths || [];
  return b.recur === "biweekly" ? pm.includes(`${y}-${m}-${d}`) : pm.includes(`${y}-${m}`);
}
const paidKey = (b: Bill, y: number, m: number, d: number) => b.recur === "biweekly" ? `${y}-${m}-${d}` : `${y}-${m}`;
const ymdStr = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const norm = (s: unknown) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// loose name match: exact, then starts-with, then contains (either direction)
function findBill(bills: Bill[], name: string): { bill?: Bill; candidates?: Bill[] } {
  const q = norm(name); if (!q) return { candidates: [] };
  const exact = bills.filter((b) => norm(b.name) === q); if (exact.length === 1) return { bill: exact[0] };
  const starts = bills.filter((b) => norm(b.name).startsWith(q)); if (starts.length === 1) return { bill: starts[0] };
  const contains = bills.filter((b) => norm(b.name).includes(q) || q.includes(norm(b.name)));
  if (contains.length === 1) return { bill: contains[0] };
  return { candidates: exact.length ? exact : starts.length ? starts : contains };
}
function findAcct(accounts: Acct[], q: unknown): { acct?: Acct; candidates?: Acct[] } {
  const n = norm(q); if (!n) return { candidates: [] };
  const hit = accounts.filter((a) => norm(a.nick).includes(n) || norm(a.bank).includes(n) || norm(a.last4).includes(n) || n.includes(norm(a.nick)));
  return hit.length === 1 ? { acct: hit[0] } : { candidates: hit };
}
const BILL_COLORS = ["#e8736a", "#f2a541", "#41ff7e", "#7df7ff", "#c792ea", "#ffd24a", "#5fb3ff", "#ff8fb1"];
async function loadBillRow(db: ReturnType<typeof userClient>) {
  const { data, error } = await db.from("billdata").select("bills,accounts").maybeSingle();
  if (error) return { error: error.message };
  return { bills: (data && Array.isArray(data.bills) ? data.bills : []) as Bill[], accounts: (data && Array.isArray(data.accounts) ? data.accounts : []) as Acct[] };
}

// deno-lint-ignore no-explicit-any
async function runTool(db: ReturnType<typeof userClient>, name: string, input: any, today: string): Promise<string> {
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
    // `today` is Adam's LOCAL date from the page — the server's UTC date is already
    // tomorrow after 5 PM Pacific and would hide this evening's events
    const until = new Date(new Date(today + "T12:00:00Z").getTime() + 14 * 86400000).toISOString().slice(0, 10);
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
  if (name === "list_bills") {
    const days = Math.max(1, Math.min(60, Number(input?.days) || 14));
    const includePaid = input?.include_paid !== false;
    const { data, error } = await db.from("billdata").select("bills,accounts").maybeSingle();
    if (error) return "ERROR: " + error.message;
    if (!data || !Array.isArray(data.bills)) return "No bills found in the Bill Calendar.";
    const bills = data.bills as Bill[], accounts = (Array.isArray(data.accounts) ? data.accounts : []) as Acct[];
    const [ty, tm, td] = today.split("-").map(Number);
    const from = new Date(ty, tm - 1, td), to = new Date(ty, tm - 1, td + days);
    const out: string[] = [];
    const a = from.getFullYear() * 12 + from.getMonth(), z = to.getFullYear() * 12 + to.getMonth();
    for (let k = a; k <= z; k++) {
      const y = Math.floor(k / 12), m = k % 12;
      for (const b of bills) {
        if (!b || !b.dueDate) continue;
        for (const d of occDays(b, y, m)) {
          const dt = new Date(y, m, d);
          if (dt < from || dt > to) continue;
          const paid = isPaidOcc(b, y, m, d);
          if (paid && !includePaid) continue;
          const acct = accounts.find((x) => x.id === b.acct);
          out.push(`${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")} · ${b.name} · $${Number(b.amount || 0).toFixed(2)} · ${paid ? "PAID" : "not paid"}${acct ? " · from " + (acct.nick || acct.bank) : ""}`);
        }
      }
    }
    out.sort();
    return out.length ? out.join("\n") : `No bills due in the next ${days} days.`;
  }
  if (name === "mark_bill_paid") {
    const row = await loadBillRow(db); if ("error" in row) return "ERROR: " + row.error;
    const f = findBill(row.bills, String(input?.name || ""));
    if (!f.bill) return f.candidates && f.candidates.length ? "AMBIGUOUS: which one — " + f.candidates.map((b) => b.name).join(", ") + "?" : "ERROR: no bill matches that name";
    const b = f.bill, paid = input?.paid !== false;
    const [ty, tm, td] = today.split("-").map(Number);
    const t0 = new Date(ty, tm - 1, td);
    // every occurrence in a ±45-day window, with its paid key
    const occ: { date: Date; key: string; paid: boolean }[] = [];
    for (let k = (ty * 12 + tm - 1) - 2; k <= (ty * 12 + tm - 1) + 2; k++) {
      const y = Math.floor(k / 12), m = k % 12;
      for (const d of occDays(b, y, m)) occ.push({ date: new Date(y, m, d), key: paidKey(b, y, m, d), paid: isPaidOcc(b, y, m, d) });
    }
    let target: { date: Date; key: string; paid: boolean } | undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(input?.date || ""))) {
      const [dy, dm] = String(input.date).split("-").map(Number);
      target = occ.find((o) => o.date.getFullYear() === dy && o.date.getMonth() === dm - 1);
    } else {
      const win = occ.filter((o) => Math.abs((o.date.getTime() - t0.getTime()) / 86400000) <= 45);
      target = paid ? win.find((o) => !o.paid) : win.filter((o) => o.paid).pop();
    }
    if (!target) return paid ? `Nothing to mark — every ${b.name} occurrence near today is already paid.` : `Nothing to undo — no paid ${b.name} occurrence near today.`;
    if (target.paid === paid) return `${b.name} for ${ymdStr(target.date.getFullYear(), target.date.getMonth(), target.date.getDate())} is already ${paid ? "paid" : "not paid"}.`;
    const { error } = await db.rpc("bill_set_paid", { p_bill_id: Number(b.id), p_key: target.key, p_paid: paid });
    if (error) return "ERROR: " + error.message;
    return `${paid ? "Marked PAID" : "Marked NOT paid"}: ${b.name} $${Number(b.amount || 0).toFixed(2)} due ${ymdStr(target.date.getFullYear(), target.date.getMonth(), target.date.getDate())}. The Bill Calendar app and the dashboard both show it now.`;
  }
  if (name === "add_bill") {
    const row = await loadBillRow(db); if ("error" in row) return "ERROR: " + row.error;
    const nm = String(input?.name || "").trim().slice(0, 80), amount = Number(input?.amount);
    if (!nm) return "ERROR: missing name";
    if (!Number.isFinite(amount) || amount < 0) return "ERROR: missing amount";
    const dup = findBill(row.bills, nm); if (dup.bill && norm(dup.bill.name) === norm(nm)) return `A bill called ${dup.bill.name} already exists ($${Number(dup.bill.amount || 0).toFixed(2)}). Use update_bill to change it.`;
    const [ty, tm, td] = today.split("-").map(Number);
    let dueDate = "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(input?.due_date || ""))) dueDate = String(input.due_date);
    else {
      const day = Math.round(Number(input?.due_day));
      if (!(day >= 1 && day <= 31)) return "ERROR: need due_day (1-31) or due_date";
      // next time that day comes around: this month if still ahead, otherwise next month
      let y = ty, m = tm - 1; if (day < td) { m++; if (m > 11) { m = 0; y++; } }
      dueDate = ymdStr(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
    }
    const recur = ["monthly", "biweekly", "once"].includes(input?.recur) ? input.recur : "monthly";
    let acctId: number | null = null, acctNote = "";
    if (input?.account) {
      const fa = findAcct(row.accounts, input.account);
      if (fa.acct) { acctId = fa.acct.id; acctNote = ` · pays from ${fa.acct.nick || fa.acct.bank}`; }
      else acctNote = fa.candidates && fa.candidates.length ? ` · account not set (which one: ${fa.candidates.map((a) => a.nick).join(", ")}?)` : " · account not set (no account matched)";
    }
    const remind = Number.isFinite(Number(input?.remind_days)) ? Math.max(0, Math.min(30, Math.round(Number(input.remind_days)))) : 2;
    const bill = { id: Date.now(), name: nm, amount: Math.round(amount * 100) / 100, dueDate, recur, paidMonths: [], remindDays: remind, acct: acctId,
      color: BILL_COLORS[row.bills.length % BILL_COLORS.length], photo: null, domain: null };
    const { error } = await db.rpc("bill_upsert", { p_bill: bill });
    if (error) return "ERROR: " + error.message;
    return `Added bill: ${nm} $${bill.amount.toFixed(2)} ${recur} from ${dueDate}${acctNote}, reminder ${remind} day(s) before. It is in the Bill Calendar app now.`;
  }
  if (name === "update_bill") {
    const row = await loadBillRow(db); if ("error" in row) return "ERROR: " + row.error;
    const f = findBill(row.bills, String(input?.name || ""));
    if (!f.bill) return f.candidates && f.candidates.length ? "AMBIGUOUS: which one — " + f.candidates.map((b) => b.name).join(", ") + "?" : "ERROR: no bill matches that name";
    const b = f.bill, patch: Record<string, unknown> = { id: b.id }, changes: string[] = [];
    if (input?.amount != null) { const a = Number(input.amount); if (!Number.isFinite(a) || a < 0) return "ERROR: bad amount"; patch.amount = Math.round(a * 100) / 100; changes.push(`amount $${Number(b.amount || 0).toFixed(2)} → $${(patch.amount as number).toFixed(2)}`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(input?.due_date || ""))) { patch.dueDate = String(input.due_date); changes.push(`due date → ${patch.dueDate}`); }
    else if (input?.due_day != null) {
      const day = Math.round(Number(input.due_day)); if (!(day >= 1 && day <= 31)) return "ERROR: bad due_day";
      const [oy, om] = String(b.dueDate).split("-").map(Number);
      patch.dueDate = ymdStr(oy, om - 1, Math.min(day, new Date(oy, om, 0).getDate())); changes.push(`due day → ${day}`);
    }
    if (["monthly", "biweekly", "once"].includes(input?.recur)) { patch.recur = input.recur; changes.push(`recurrence → ${input.recur}`); }
    if (input?.new_name) { patch.name = String(input.new_name).trim().slice(0, 80); changes.push(`name → ${patch.name}`); }
    if (input?.account) {
      const fa = findAcct(row.accounts, input.account);
      if (!fa.acct) return fa.candidates && fa.candidates.length ? "AMBIGUOUS account: " + fa.candidates.map((a) => a.nick).join(", ") : "ERROR: no account matches that name";
      patch.acct = fa.acct.id; changes.push(`pays from → ${fa.acct.nick || fa.acct.bank}`);
    }
    if (!changes.length) return "ERROR: nothing to change — give an amount, due day, account, recurrence, or new name";
    const { error } = await db.rpc("bill_upsert", { p_bill: patch });
    if (error) return "ERROR: " + error.message;
    return `Updated ${b.name}: ${changes.join("; ")}. Paid history kept. The Bill Calendar app shows it now.`;
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
    "Deleting is different from completing: use delete_task only when Adam explicitly says delete or remove. For duplicates, keep one copy and delete the extras, then confirm which one you kept. The same explicit-delete rule applies to delete_event.",
    "Calendar: use add_event for appointments and anything at a specific time of day, including timed reminders ('remind me at 6 pm…') — those ring his phone. Times are Adam's local time in 24-hour HH:MM.",
    "Reminders: when Adam says 'add to my reminders' or wants a reminder with no time of day, use add_task (with a due date if he gave one) — his iPhone Reminders app shows the task list. For a timed reminder, do BOTH: add_event so it rings, and add_task so it appears in Reminders.",
    `Today is ${weekday}, ${today}${now ? `, and Adam's clock reads ${now} right now` : ""}. Upcoming days: ${cal.join("; ")}. When Adam names a day, use the date from this list exactly — never compute dates yourself.`,
    "Bills (they live in Adam's Bill Calendar app and every change lands there instantly): list_bills for what is due or how much; mark_bill_paid when Adam says he paid something (paid=false to undo); add_bill for a new bill; update_bill to change an amount, due day, account, or name. If a tool answers AMBIGUOUS, ask Adam which one. Never invent amounts or dates — ask if he did not say. Always say back the bill name, amount and date you acted on. There is no delete; he removes bills in the app. Round dollar amounts naturally when speaking.",
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
  if (!OWNER_IDS.has(userData.user.id)) return json(req, { error: "forbidden", reply: "I am sorry. This assistant is reserved for Adam." }, 403);

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
          const out = await runTool(db, block.name, block.input, today);
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
