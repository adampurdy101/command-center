// ============================================================
//  BOARD  ·  live data for the deck panels
//  ------------------------------------------------------------
//  Reads the Supabase tables Claude writes to and paints them
//  into the panels. Real-time: when a row changes (Claude adds a
//  to-do from chat, you tick one off), the panel repaints on its
//  own — no reload.
//
//  Tables → panels
//    tasks       → 01 Daily Brief  (TASKS count + to-do rows)
//    projects    → 03 Projects     (one block per active project)
//    agents      → 04 Agent Ops    (LED + status per agent)
//    agent_log   → 04 Agent Ops    (detail view ops log)
//    life_items  → 05 Life Admin   (label + status rows)
//    notes       → detail views    (pinned notes)
//
//  Everything is exposed on window.CC so panels.js (the click-to-
//  expand detail views) can draw from the same data:
//    CC.data           { tasks, projects, agents, log, life, notes }
//    CC.refresh()      re-pull everything and repaint
//    CC.toggleTask(id) mark a task done / not done
//    CC.addTask(title, due?) add a to-do from the page
// ============================================================
import { db } from "./supabase.js";

const D = { tasks: [], projects: [], agents: [], log: [], life: [], notes: [] };
let channel = null, pollTimer = null, ready = false;

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const panelByName = (word) => {
  const panels = document.querySelectorAll("#hub .col .panel");
  for (const p of panels) {
    const n = p.querySelector(".tb .n");
    if (n && n.textContent.toLowerCase().includes(word)) return p;
  }
  return null;
};
const setStatus = (panel, text, ledClass) => {
  if (!panel) return;
  const s = panel.querySelector(".tb .s"); if (s) s.textContent = text;
  const led = panel.querySelector(".tb .led");
  if (led && ledClass) { led.classList.remove("on", "amb", "red"); led.classList.add(ledClass); }
};
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const parseDate = (s) => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const daysUntil = (s) => { const d = parseDate(s); return d ? Math.round((d - today()) / 86400000) : null; };
// "T−3d" / "TODAY" / "OVERDUE 2d"
function dueLabel(s) {
  const n = daysUntil(s);
  if (n == null) return { text: "", cls: "" };
  if (n < 0) return { text: `OVERDUE ${-n}d`, cls: "down" };
  if (n === 0) return { text: "TODAY", cls: "warn" };
  if (n === 1) return { text: "TOMORROW", cls: "warn" };
  if (n <= 7) return { text: `T−${n}d`, cls: "warn" };
  return { text: `T−${n}d`, cls: "" };
}
const tagClass = (t) => (t === "warn" || t === "up" || t === "down") ? t : "";

// ---------- lanes: NOW / NEXT / LATER ----------
// Claude sets priority when it files a task; the lane is what you SEE.
//   NOW   = high priority, or due today / tomorrow / overdue
//   NEXT  = normal priority, or due within a week
//   LATER = low priority with nothing pressing
export const LANES = [
  { key: "now",   label: "NOW",   hint: "do today" },
  { key: "next",  label: "NEXT",  hint: "this week" },
  { key: "later", label: "LATER", hint: "when there's room" },
];
export function lane(t) {
  const n = daysUntil(t.due);
  if (t.priority === "high" || (n != null && n <= 1)) return "now";
  if (t.priority === "low" && (n == null || n > 7)) return "later";
  return "next";
}
const laneRank = { now: 0, next: 1, later: 2 };
const fmtWhen = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso), ms = Date.now() - d.getTime(), m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

// ---------- load ----------
export async function load() {
  const [t, p, a, g, l, n] = await Promise.all([
    db.from("tasks").select("*").order("done").order("due", { ascending: true, nullsFirst: false }).order("created_at"),
    db.from("projects").select("*").eq("active", true).order("created_at"),
    db.from("agents").select("*").order("created_at"),
    db.from("agent_log").select("*").order("created_at", { ascending: false }).limit(12),
    db.from("life_items").select("*").order("sort").order("created_at"),
    db.from("notes").select("*").order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(20),
  ]);
  D.tasks = t.data || []; D.projects = p.data || []; D.agents = a.data || [];
  D.log = g.data || []; D.life = l.data || []; D.notes = n.data || [];
  // open first, then by lane (NOW → NEXT → LATER), then soonest due, then oldest
  D.tasks.sort((x, y) => (x.done - y.done) || (laneRank[lane(x)] - laneRank[lane(y)]) ||
    ((x.due || "9999") < (y.due || "9999") ? -1 : (x.due || "9999") > (y.due || "9999") ? 1 : 0) ||
    (x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : 0));
  paint();
  document.dispatchEvent(new CustomEvent("board:updated", { detail: D }));
}

// ---------- paint ----------
function paint() { paintBrief(); paintProjects(); paintAgents(); paintLife(); }

// one to-do row (shared by the panel and the detail view)
export function taskRow(t, { detail = false } = {}) {
  const L = lane(t), d = dueLabel(t.due);
  const chip = t.done ? `<span class="chip ok">${fmtWhen(t.completed_at || t.updated_at)}</span>`
             : d.text ? `<span class="chip ${d.cls || "ok"}">${d.text}</span>` : "";
  const notes = detail && t.notes ? `<small class="dx-notes">${esc(t.notes)}</small>` : "";
  return `<div class="row todo-i lane-${L}${t.done ? " done" : ""}" data-id="${t.id}" title="${esc(t.notes || t.title)}">
    <button class="tick" type="button" aria-label="${t.done ? "reopen" : "mark done"}">${t.done ? "☑" : "☐"}</button>
    <span class="k"><span class="ttl">${esc(t.title)}</span>${notes}</span>
    <span class="v">${chip}</span></div>`;
}
export function laneCounts(open) {
  const c = { now: 0, next: 0, later: 0 }; open.forEach((t) => c[lane(t)]++); return c;
}

function paintBrief() {
  const open = D.tasks.filter((t) => !t.done);
  const c = laneCounts(open);
  const el = $("brief-tasks");
  if (el) {
    el.innerHTML = open.length === 0 ? "ALL CLEAR"
      : `<span class="lc now">${c.now}</span><span class="lc next">${c.next}</span><span class="lc later">${c.later}</span>`;
    el.classList.toggle("muted", open.length === 0);
    el.classList.add("lanes-inline");
  }
  // to-do lanes live under the digest row inside the Daily Brief body
  const bd = $("brief-bd"); if (!bd) return;
  let box = $("brief-todo");
  if (!box) { box = document.createElement("div"); box.id = "brief-todo"; box.className = "todo"; bd.appendChild(box); }
  if (!open.length) {
    box.innerHTML = `<div class="row todo-h"><span class="k">TO-DO</span><span class="v muted">nothing open — tell Claude</span></div>`;
    return;
  }
  const MAX = 8; let used = 0, html = "";
  LANES.forEach((ln) => {
    const items = open.filter((t) => lane(t) === ln.key); if (!items.length) return;
    html += `<div class="row todo-h lane-${ln.key}"><span class="k"><span class="led"></span>${ln.label}<small>${ln.hint}</small></span><span class="v">${items.length}</span></div>`;
    items.forEach((t) => { if (used < MAX) { html += taskRow(t); used++; } });
  });
  if (open.length > used) html += `<div class="row"><span class="k muted">+${open.length - used} more · click panel</span></div>`;
  box.innerHTML = html;
  box.querySelectorAll(".tick").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation(); const id = +b.closest(".todo-i").dataset.id; b.textContent = "☑"; toggleTask(id, true);
  }));
}

function paintProjects() {
  const panel = panelByName("project"); if (!panel) return;
  const bd = panel.querySelector(".bd"); if (!bd) return;
  if (!D.projects.length) { setStatus(panel, "NONE ACTIVE", "amb"); bd.innerHTML = `<div class="row"><span class="k muted">no active projects — tell Claude</span></div>`; return; }
  bd.innerHTML = D.projects.map((p, i) => {
    const d = dueLabel(p.deadline);
    const pct = Math.max(0, Math.min(100, p.progress | 0));
    return `<div class="proj"${i ? ' style="margin-top:6px"' : ""} title="${esc(p.notes || p.name)}">
      <div class="row"><span class="k" style="font-size:11px;color:var(--hi)">${esc(p.name).toUpperCase()}</span><span class="v">${pct ? pct + "%" : ""}</span></div>
      ${p.phase ? `<div class="row"><span class="k" style="font-size:11px">${esc(p.phase)}</span></div>` : ""}
      <div class="bar"><span style="width:${pct}%"></span></div>
      ${p.deadline ? `<div class="row"><span class="k">DEADLINE</span><span class="v ${d.cls}">${d.text} · ${esc(p.deadline)}</span></div>` : ""}
    </div>`;
  }).join("");
  setStatus(panel, `${D.projects.length} ACTIVE`, "on");
}

function paintAgents() {
  const panel = panelByName("agent"); if (!panel || !D.agents.length) return;
  const bd = panel.querySelector(".bd"); if (!bd) return;
  const led = (s) => /online|run|heartbeat/i.test(s) ? "on" : /err|fail|down/i.test(s) ? "red" : "amb";
  bd.innerHTML = D.agents.map((a) =>
    `<div class="ag" title="${esc(a.kind)}"><span class="led ${led(a.status)}"></span><span class="nm">${esc(a.name)}</span><span class="st">${esc(a.status)}${a.last_run ? " · " + fmtWhen(a.last_run) : ""}</span></div>`
  ).join("") + (D.log[0]
    ? `<div class="row" style="margin-top:auto;font-size:10px"><span class="k">LAST</span><span class="v" style="font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%">${esc(D.log[0].action)}</span></div>`
    : "");
  setStatus(panel, `${D.agents.filter((a) => led(a.status) === "on").length} LIVE`, "on");
}

function paintLife() {
  const panel = panelByName("life"); if (!panel) return;
  const bd = panel.querySelector(".bd"); if (!bd) return;
  if (!D.life.length) { setStatus(panel, "EMPTY", "amb"); bd.innerHTML = `<div class="row"><span class="k muted">nothing tracked — tell Claude</span></div>`; return; }
  bd.innerHTML = D.life.map((i) =>
    `<div class="row" title="${esc(i.notes || i.label)}"><span class="k">${esc(i.label)}</span><span class="v ${tagClass(i.tag)}">${esc(i.status || "")}</span></div>`
  ).join("");
  const warn = D.life.filter((i) => i.tag === "warn").length;
  setStatus(panel, warn ? `${warn} NEED ATTN` : "LIVE", warn ? "amb" : "on");
}

// ---------- writes from the page ----------
export async function toggleTask(id, done) {
  const t = D.tasks.find((x) => x.id === id); if (!t) return;
  const next = done == null ? !t.done : !!done;
  const { error } = await db.from("tasks").update({ done: next, completed_at: next ? new Date().toISOString() : null }).eq("id", id);
  if (error) { console.warn("[board] toggleTask", error.message); return; }
  t.done = next; paint();
  try { await db.from("agent_log").insert({ agent: "you", action: `${next ? "finished" : "reopened"}: ${t.title}` }); } catch (_) {}
}
export async function addTask(title, due = null, priority = "normal") {
  const { error } = await db.from("tasks").insert({ title, due, priority, source: "page" });
  if (error) { console.warn("[board] addTask", error.message); return false; }
  await load(); return true;
}

// ---------- realtime + polling fallback ----------
function subscribe() {
  if (channel) return;
  let t = 0; const bump = () => { clearTimeout(t); t = setTimeout(() => load().catch(() => {}), 250); };
  channel = db.channel("board");
  ["tasks", "projects", "agents", "agent_log", "life_items", "notes"].forEach((table) =>
    channel.on("postgres_changes", { event: "*", schema: "public", table }, bump));
  channel.subscribe();
  pollTimer = setInterval(() => load().catch(() => {}), 90000);   // belt + suspenders
}
function unsubscribe() {
  if (channel) { try { db.removeChannel(channel); } catch (_) {} channel = null; }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ---------- boot ----------
window.CC = { data: D, refresh: load, toggleTask, addTask, dueLabel, fmtWhen, clock, esc, lane, LANES, taskRow, laneCounts };
function start() { if (ready) return; ready = true; load().catch((e) => console.warn("[board]", e)); subscribe(); }
document.addEventListener("hub:ready", start);
document.addEventListener("hub:left", () => { ready = false; unsubscribe(); });
// auth can resolve before this module evaluates (hub:ready already fired) — catch up
const hubEl = $("hub");
if (hubEl && !hubEl.classList.contains("hidden")) start();
document.addEventListener("visibilitychange", () => { if (!document.hidden && ready) load().catch(() => {}); });
