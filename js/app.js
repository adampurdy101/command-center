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

// ---------- boot ----------
initAuth();

let hubStarted = false;
document.addEventListener("hub:ready", () => {
  if (hubStarted) return;
  hubStarted = true;
  updateBrief();
});
document.addEventListener("hub:left", () => { hubStarted = false; });
