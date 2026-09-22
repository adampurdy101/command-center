// ============================================================
//  DAILIES  ·  07 panel — this morning's plan, open follow-ups,
//  and the end-of-day journal (js/dailies.js)
//  ------------------------------------------------------------
//  Tables → panel
//    daily_plans  → headline + TODAY checklist (latest plan)
//    commitments  → FOLLOW-UPS (open, who owes what, age)
//    daily_log    → detail view: last 14 journal entries
//
//  Written by Claude: the 5:30am scheduled task upserts daily_plans;
//  the evening Dailies chat inserts daily_log + commitments. Realtime
//  keeps the panel current without a reload.
//
//  window.Dailies = { data, refresh(), detail() }  — panels.js calls
//  detail() for the click-to-expand view.
// ============================================================
import { db } from "./supabase.js";

const D = { plan: null, commits: [], log: [] };
let channel = null, pollTimer = null, ready = false;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const parseDate = (s) => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const daysSince = (s) => { const d = parseDate(s); return d ? Math.round((today() - d) / 86400000) : null; };
const daysUntil = (s) => { const d = parseDate(s); return d ? Math.round((d - today()) / 86400000) : null; };
const fmtDate = (s) => { const d = parseDate(s); return d ? d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : "—"; };
const panel = () => $("panel-dailies");
const setStatus = (text, led) => {
  const p = panel(); if (!p) return;
  const s = p.querySelector(".tb .s"); if (s) s.textContent = text;
  const l = p.querySelector(".tb .led"); if (l) { l.classList.remove("on", "amb", "red"); if (led) l.classList.add(led); }
};
// how loud a follow-up should be, from its age
function ageChip(c) {
  const n = daysSince(c.asked_on) ?? 0;
  if (c.direction === "i_owe_them") {
    const u = daysUntil(c.due);
    if (u != null && u < 0) return { text: `OVERDUE ${-u}d`, cls: "down" };
    if (u === 0) return { text: "DUE TODAY", cls: "warn" };
    return { text: c.due ? `due ${fmtDate(c.due)}` : "promised", cls: "ok" };
  }
  if (n >= 7) return { text: `${n}d`, cls: "down" };
  if (n >= 3) return { text: `${n}d`, cls: "warn" };
  return { text: n <= 0 ? "today" : `${n}d`, cls: "ok" };
}

// ---------- load ----------
export async function load() {
  const [p, c, l] = await Promise.all([
    db.from("daily_plans").select("*").order("plan_date", { ascending: false }).limit(1),
    db.from("commitments").select("*").eq("status", "open").order("asked_on"),
    db.from("daily_log").select("*").order("log_date", { ascending: false }).limit(14),
  ]);
  D.plan = (p.data && p.data[0]) || null; D.commits = c.data || []; D.log = l.data || [];
  paint();
  document.dispatchEvent(new CustomEvent("dailies:updated", { detail: D }));
}

// ---------- paint ----------
function paint() {
  const p = panel(); if (!p) return;
  const bd = p.querySelector(".bd"); if (!bd) return;
  const plan = D.plan;
  const stale = plan ? daysSince(plan.plan_date) : null;      // 0 = this morning's
  const theyOwe = D.commits.filter((c) => c.direction === "they_owe_me");
  const iOwe = D.commits.filter((c) => c.direction === "i_owe_them");
  const hot = D.commits.filter((c) => ageChip(c).cls === "down").length;

  let html = "";
  if (!plan) {
    html += `<div class="row"><span class="k muted">no plan yet — first one lands at 05:30 Mon–Fri</span></div>`;
  } else {
    const items = Array.isArray(plan.today) ? plan.today : [];
    html += `<div class="row dl-head"><span class="k">${esc(fmtDate(plan.plan_date)).toUpperCase()}${stale > 0 ? ` <small>(${stale}d old)</small>` : ""}</span><span class="v">${items.length} TODAY</span></div>`;
    if (plan.headline) html += `<div class="row"><span class="k dl-headline">${esc(plan.headline)}</span></div>`;
    items.slice(0, 6).forEach((it, i) => {
      const t = typeof it === "string" ? it : it.title;
      html += `<div class="row dl-i" title="${esc(typeof it === "string" ? "" : it.why || "")}"><span class="k"><b>${i + 1}</b> ${esc(t)}</span></div>`;
    });
    if (items.length > 6) html += `<div class="row"><span class="k muted">+${items.length - 6} more · click panel</span></div>`;
  }
  if (D.commits.length) {
    html += `<div class="row dl-h"><span class="k"><span class="led"></span>FOLLOW-UPS<small>${theyOwe.length} owed to you · ${iOwe.length} you owe</small></span><span class="v">${D.commits.length}</span></div>`;
    D.commits.slice(0, 4).forEach((c) => {
      const a = ageChip(c);
      html += `<div class="row dl-c ${c.direction}" title="${esc(c.what)}"><span class="k"><span class="who">${esc(c.who)}</span> · ${esc(c.what)}</span><span class="v"><span class="chip ${a.cls}">${a.text}</span></span></div>`;
    });
  }
  const lastLog = D.log[0];
  html += `<div class="row dl-foot"><span class="k muted">JOURNAL</span><span class="v muted">${lastLog ? "last entry " + esc(fmtDate(lastLog.log_date)) : "no entries yet — tell Claude tonight"}</span></div>`;
  bd.innerHTML = html;

  if (!plan) setStatus("WAITING", "amb");
  else if (hot) setStatus(`${hot} OVERDUE`, "red");
  else if (stale > 0) setStatus("STALE", "amb");
  else setStatus("READY", "on");
}

// ---------- detail view (panels.js calls this) ----------
export function detail() {
  const plan = D.plan;
  const card = (h, body, wide = true, cls = "") => `<div class="dx-card${wide ? " dx-wide" : ""}${cls ? " " + cls : ""}"><div class="dx-h">${h}</div>${body}</div>`;
  const list = (arr, f) => arr.length ? `<div class="dx-list">${arr.map(f).join("")}</div>` : `<div class="dx-note">nothing here.</div>`;

  let planHtml;
  if (!plan) planHtml = card("TODAY", `<div class="dx-note">No plan yet. The first one is built at 05:30 Mon–Fri from your evening journal, open to-dos and calendar.</div>`);
  else {
    const items = Array.isArray(plan.today) ? plan.today : [];
    const up = Array.isArray(plan.coming_up) ? plan.coming_up : [];
    planHtml =
      card(`TODAY · ${esc(fmtDate(plan.plan_date)).toUpperCase()}${plan.headline ? ` <small>${esc(plan.headline)}</small>` : ""}`,
        list(items, (it, i) => { const t = typeof it === "string" ? it : it.title, w = typeof it === "string" ? "" : it.why;
          return `<div class="dx-li dl-i"><span class="k"><b>${i + 1}</b> ${esc(t)}${w ? ` <small class="dx-notes">— ${esc(w)}</small>` : ""}</span></div>`; })) +
      (up.length ? card("COMING UP THIS WEEK", list(up, (u) => `<div class="dx-li"><span class="k"><b>${esc(u.day || "")}</b> ${esc(u.title || "")}</span></div>`)) : "");
  }
  const commits = card("FOLLOW-UPS <small>who owes what</small>", list(D.commits, (c) => {
    const a = ageChip(c);
    return `<div class="dx-li dl-c ${c.direction}"><span class="k"><span class="who">${esc(c.who)}</span> · ${esc(c.what)}${c.job ? ` <small class="dx-notes">${esc(c.job)}</small>` : ""}` +
      `<small class="dx-notes">${c.direction === "i_owe_them" ? "you promised" : "you asked"} · ${esc(fmtDate(c.asked_on))}${c.due ? " · due " + esc(fmtDate(c.due)) : ""}</small></span>` +
      `<span class="v"><span class="chip ${a.cls}">${a.text}</span></span></div>`;
  }));
  // journal reads on light "paper" (dark text on a pale background) — easier on the eyes than green-on-black
  const log = card("JOURNAL <small>last 14 entries</small>", list(D.log, (e) => {
    const did = (e.did || []).map((x) => `<div>✓ ${esc(x)}</div>`).join("");
    const todo = (e.todo || []).map((x) => `<div>→ ${esc(x)}</div>`).join("");
    return `<div class="dx-li dl-log"><span class="k"><b>${esc(fmtDate(e.log_date)).toUpperCase()}</b>` +
      (e.summary ? `<div class="dl-sum">${esc(e.summary)}</div>` : "") +
      (did || todo ? `<div class="dl-lists">${did}${todo}</div>` : "") +
      (e.people && e.people.length ? `<small class="dx-notes">${e.people.map(esc).join(" · ")}</small>` : "") + `</span></div>`;
  }), true, "dl-paper");
  return `<div class="dx-grid">${planHtml}${commits}${log}</div>` +
    `<div class="dx-note">Evening: open the Dailies project in Claude and talk through your day. Morning: the plan is here and in a new Dailies chat by 05:30. Ask Claude "did I tell Warner…?" any time.</div>`;
}

// ---------- realtime + polling ----------
function subscribe() {
  if (channel) return;
  let t = 0; const bump = () => { clearTimeout(t); t = setTimeout(() => load().catch(() => {}), 250); };
  channel = db.channel("dailies");
  ["daily_plans", "commitments", "daily_log"].forEach((table) =>
    channel.on("postgres_changes", { event: "*", schema: "public", table }, bump));
  channel.subscribe();
  pollTimer = setInterval(() => load().catch(() => {}), 120000);
}
function unsubscribe() {
  if (channel) { try { db.removeChannel(channel); } catch (_) {} channel = null; }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ---------- boot ----------
window.Dailies = { data: D, refresh: load, detail };
function start() { if (ready) return; ready = true; load().catch((e) => console.warn("[dailies]", e)); subscribe(); }
document.addEventListener("hub:ready", start);
document.addEventListener("hub:left", () => { ready = false; unsubscribe(); });
const hubEl = $("hub");
if (hubEl && !hubEl.classList.contains("hidden")) start();
document.addEventListener("visibilitychange", () => { if (!document.hidden && ready) load().catch(() => {}); });
