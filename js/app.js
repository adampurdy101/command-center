// ============================================================
//  APP  ·  auth boot + live data wiring for Mission Control
//  ------------------------------------------------------------
//  The rich interface (clock, cities, globe, Voice Scope, HAL,
//  Defense Grid) is owned by js/mission.js. This module only:
//    1. boots Supabase auth (login ⇄ hub)
//    2. fills the Daily Brief panel with live data after login
// ============================================================
import { initAuth } from "./auth.js";
import { db } from "./supabase.js";

// ---------- Daily Brief · live from Supabase (demo fallback) ----------
async function updateBrief() {
  const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.textContent = val; };
  let brief = null;
  try {
    const { data } = await db.from("daily_brief")
      .select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
    brief = data;
  } catch (_) { /* table may not exist yet — fall back to demo */ }

  const report = document.getElementById("brief-report");
  if (brief) {
    set("brief-unread", brief.unread ?? "–");
    set("brief-flagged", brief.flagged ?? "0");
    // an empty next-event reads as a data gap — show a calm "all clear" instead of a lonely dash
    const nextEl = document.getElementById("brief-next");
    if (nextEl) {
      const hasNext = brief.next_event != null && String(brief.next_event).trim() !== "";
      nextEl.textContent = hasNext ? brief.next_event : "CLEAR · nothing scheduled";
      nextEl.classList.toggle("muted", !hasNext);
    }
    set("brief-tasks", brief.open_tasks ?? "0");
    set("brief-stat", "LIVE");
    if (report) report.onclick = () => alert(brief.digest || "No digest text yet.");
  } else {
    // clearly-labeled demo numbers until the 06:00 job is wired
    set("brief-unread", "201");
    set("brief-flagged", "3");
    set("brief-next", "10:30 · Wall Shops sync");
    set("brief-tasks", "0");
    set("brief-stat", "DEMO");
    if (report) report.onclick = () =>
      alert("Morning digest will appear here once the 6 AM job writes to Supabase (daily_brief).");
  }
}

// ---------- Agent Ops · live from Supabase (demo fallback) ----------
// Liveness is derived from heartbeat freshness, so a crashed agent visibly goes stale.
function agentLed(a) {
  const hb = a.last_heartbeat ? Date.parse(a.last_heartbeat) : 0;
  if (!hb) return "amb";
  const age = Date.now() - hb;
  return age < 90e3 ? "on" : age < 600e3 ? "amb" : "red";
}

function renderAgents(rows) {
  const bd = document.getElementById("agents-bd");
  if (!bd) return;
  bd.innerHTML = "";
  rows.forEach((a) => {
    const row = document.createElement("div"); row.className = "ag";
    const led = document.createElement("span"); led.className = "led " + agentLed(a);
    const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = a.name || "agent";
    const st = document.createElement("span"); st.className = "st"; st.textContent = String(a.status || "—").toUpperCase();
    row.append(led, nm, st); bd.appendChild(row);
  });
  const up = document.createElement("div"); up.className = "row"; up.style.cssText = "margin-top:auto;font-size:10px";
  up.innerHTML = '<span class="k">UPTIME</span><span class="v">99.4%</span>';
  bd.appendChild(up);
}

let agentChannel = null, hbTimer = null;

// The dashboard registers ITSELF as a live agent — the template every real agent follows
// (a 5-line upsert by name) and proof the whole loop works end-to-end.
async function heartbeatSelf() {
  try {
    const { data: u } = await db.auth.getUser();
    const uid = u && u.user && u.user.id; if (!uid) return;
    await db.from("agents").upsert(
      { user_id: uid, name: "command-center", kind: "dashboard", status: "ONLINE", last_heartbeat: new Date().toISOString(), last_msg: "dashboard open" },
      { onConflict: "user_id,name" }
    );
  } catch (_) { /* logged out / offline — panel stays on demo rows */ }
}

async function fetchAgents() {
  const stat = document.getElementById("agents-stat");
  let rows = null;
  try { const { data } = await db.from("agents").select("*").order("created_at", { ascending: true }); rows = data; } catch (_) {}
  if (rows && rows.length) { renderAgents(rows); if (stat) stat.textContent = rows.length + " LIVE"; }
  else if (stat) stat.textContent = "DEMO";    // keep the hardcoded demo rows until real agents check in
}

async function bootAgents() {
  await heartbeatSelf();
  await fetchAgents();
  try {
    if (agentChannel) db.removeChannel(agentChannel);
    agentChannel = db.channel("agent-ops")
      .on("postgres_changes", { event: "*", schema: "public", table: "agents" }, fetchAgents)
      .subscribe();
  } catch (_) {}
  if (hbTimer) clearInterval(hbTimer);
  hbTimer = setInterval(heartbeatSelf, 45000);  // keep the heartbeat fresh while the hub is open
}

function teardownAgents() {
  if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
  try { if (agentChannel) { db.removeChannel(agentChannel); agentChannel = null; } } catch (_) {}
}

// ---------- boot ----------
initAuth();

let hubStarted = false;
document.addEventListener("hub:ready", () => {
  if (hubStarted) return;
  hubStarted = true;
  updateBrief();
  bootAgents();
});
document.addEventListener("hub:left", () => { hubStarted = false; teardownAgents(); });
