// ============================================================
//  STATIONS  ·  the five panels
//  ------------------------------------------------------------
//  Each station is one object: { id, num, name, render }.
//  render(bodyEl) fills the panel body and returns a status
//  string for the title bar ("ONLINE", "DEMO", "3 DUE"...).
//
//  >>> TO ADD A 6TH STATION <<<
//  1. Write a new object like the ones below.
//  2. Add it to the STATIONS array at the bottom.
//  3. That's it — the grid builds itself from the array.
//
//  Phase 1: every panel shows clearly-labeled DEMO data except
//  where noted. Real data gets wired in one panel at a time.
// ============================================================

import { db } from "./supabase.js";

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const row = (k, v, vClass = "") =>
  `<div class="row"><span class="k">${k}</span><span class="v ${vClass}">${v}</span></div>`;
const demoTag = `<span class="demo-tag">DEMO</span>`;

// tiny inline sparkline (SVG) from an array of numbers
function sparkline(values, color = "var(--text-bright)") {
  const w = 120, h = 28, max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1)) * w},${h - ((v - min) / span) * h}`).join(" ");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow:visible">
    <polyline fill="none" stroke="${color}" stroke-width="1.5" points="${pts}"
      style="filter: drop-shadow(0 0 3px ${color})"/></svg>`;
}

// ---------------------------------------------------------------
// 01 · DAILY BRIEF
//   Phase 1: reads the latest digest from Supabase if present
//   (table: daily_brief). Until the morning job is wired, it
//   gracefully shows DEMO numbers.
// ---------------------------------------------------------------
const dailyBrief = {
  id: "brief", num: "01", name: "Daily Brief",
  async render(body) {
    let brief = null;
    try {
      const { data } = await db.from("daily_brief")
        .select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
      brief = data;
    } catch (_) { /* table may not exist yet — fine */ }

    if (brief) {
      body.innerHTML =
        row("UNREAD MAIL", `<span class="big">${brief.unread ?? "–"}</span>`) +
        row("FLAGGED", brief.flagged ?? "–", brief.flagged ? "warn" : "") +
        row("NEXT EVENT", brief.next_event ?? "—") +
        row("OPEN TASKS", brief.open_tasks ?? "–");
      const btn = el("button", "btn", "DAILY REPORT  READY ▸");
      btn.onclick = () => alert(brief.digest || "No digest text yet.");
      body.appendChild(btn);
      return "LIVE";
    }

    // ---- demo fallback ----
    body.innerHTML =
      row(`UNREAD MAIL ${demoTag}`, `<span class="big">12</span>`) +
      row("FLAGGED", "2", "warn") +
      row("NEXT EVENT", "10:30 · Wall Shops sync") +
      row("OPEN TASKS", "7");
    const btn = el("button", "btn", "DAILY REPORT  READY ▸");
    btn.onclick = () => alert("Morning digest will appear here once the 6 AM job is wired (Milestone 3).");
    body.appendChild(btn);
    return "DEMO";
  },
};

// ---------------------------------------------------------------
// 02 · MARKETS  (demo until market job is wired)
// ---------------------------------------------------------------
const markets = {
  id: "markets", num: "02", name: "Markets",
  async render(body) {
    const watch = [
      { sym: "NVDA", chg: +2.4 }, { sym: "VRT", chg: +1.1 },
      { sym: "NBIS", chg: -3.2 }, { sym: "AMD", chg: +0.6 },
    ];
    body.innerHTML = watch.map(w =>
      row(w.sym, (w.chg >= 0 ? "+" : "") + w.chg.toFixed(1) + "%", w.chg >= 0 ? "up" : "down")
    ).join("");
    body.appendChild(el("div", null, sparkline([3, 5, 4, 7, 6, 9, 8, 11])));
    body.appendChild(el("div", null,
      row("S&P 500", "+0.8%", "up") + row("MARKET", "OPEN", "up")));
    body.appendChild(el("div", null, demoTag));
    return "DEMO";
  },
};

// ---------------------------------------------------------------
// 03 · PROJECTS  (demo until wired to Supabase 'projects')
// ---------------------------------------------------------------
const projects = {
  id: "projects", num: "03", name: "Projects",
  async render(body) {
    const pct = 62;
    const deadlineDays = 38;
    body.innerHTML =
      row("ACTIVE", "Western State Hospital") +
      row("PHASE", "Wall Shops") +
      `<div class="row"><span class="k">PROGRESS</span><span class="v">${pct}%</span></div>` +
      `<div class="bar"><span style="width:${pct}%"></span></div>` +
      row("DEADLINE", `T-minus ${deadlineDays}d`, "warn");
    body.appendChild(el("div", null, demoTag));
    return "DEMO";
  },
};

// ---------------------------------------------------------------
// 04 · AGENT OPS  ·  the heart of it
//   Status row per agent + scrolling action log.
//   >>> TO REGISTER A NEW AGENT <<< add to the AGENTS array.
// ---------------------------------------------------------------
const AGENTS = [
  { name: "hal-openclaw", state: "HEARTBEAT", led: "amber", when: "manual" },
  { name: "mail-agent",   state: "IDLE",      led: "green", when: "—" },
  { name: "market-agent", state: "IDLE",      led: "green", when: "—" },
  // --- add new hub-built agents below this line ---
];

const agentOps = {
  id: "agents", num: "04", name: "Agent Ops",
  async render(body) {
    const list = el("div", null);
    AGENTS.forEach(a => {
      list.appendChild(el("div", "agent",
        `<span class="led ${a.led} pulse"></span>
         <span class="name">${a.name}</span>
         <span class="state">${a.state}</span>
         <span class="when">${a.when}</span>`));
    });
    body.appendChild(list);

    const log = el("div", "logbox", "");
    log.id = "agent-log";
    const lines = [
      "[boot] hub shell online",
      "[hal ] heartbeat row stubbed — direct read pending",
      "[mail] standing by for 06:00 PT job",
    ];
    log.innerHTML = lines.map(l => `<div><span class="t">›</span> ${l}</div>`).join("");
    body.appendChild(log);
    return `${AGENTS.length} AGENTS`;
  },
};

// ---------------------------------------------------------------
// 05 · LIFE ADMIN  (demo; will pull bills from BillCalendar later)
// ---------------------------------------------------------------
const lifeAdmin = {
  id: "life", num: "05", name: "Life Admin",
  async render(body) {
    const items = [
      { k: "Tesla lemon-law", v: "AWAITING REPLY", c: "warn" },
      { k: "Skin routine",    v: "Step 2 · retinol", c: "" },
      { k: "Mom care / POA",  v: "docs in review", c: "warn" },
      { k: "Dog walk",        v: "5:30 PM", c: "" },
      { k: "Home bills",      v: "all paid", c: "up" },
    ];
    body.innerHTML = items.map(i => row(i.k, i.v, i.c)).join("");
    body.appendChild(el("div", null, demoTag));
    return "DEMO";
  },
};

// the registry — order here = order on screen
export const STATIONS = [dailyBrief, markets, projects, agentOps, lifeAdmin];
