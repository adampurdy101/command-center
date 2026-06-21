// ============================================================
//  APP  ·  boots the hub once you're logged in
//  - clock + date
//  - builds the 5 station panels from the STATIONS registry
//  - command console (Phase 1: routes + logs, real backend later)
// ============================================================
import { initAuth } from "./auth.js";
import { CONFIG } from "./config.js";
import { STATIONS } from "./stations.js";

// ---------- header text ----------
function setHeader() {
  document.getElementById("callsign-main").textContent = CONFIG.CALLSIGN;
  document.getElementById("callsign-sub").textContent = CONFIG.STATION;
}

// ---------- live clock ----------
function startClock() {
  const t = document.getElementById("clock-time");
  const d = document.getElementById("clock-date");
  const tick = () => {
    const now = new Date();
    t.textContent = now.toLocaleTimeString("en-US", { hour12: false });
    d.textContent = now.toLocaleDateString("en-US",
      { weekday: "short", year: "numeric", month: "short", day: "2-digit" }).toUpperCase();
  };
  tick();
  setInterval(tick, 1000);
}

// ---------- build panels ----------
async function buildPanels() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  for (const st of STATIONS) {
    const panel = document.createElement("section");
    panel.className = "panel";
    panel.id = `panel-${st.id}`;
    panel.innerHTML = `
      <div class="titlebar">
        <span class="led green pulse"></span>
        <span class="num">${st.num}</span>
        <span class="name">${st.name}</span>
        <span class="spacer"></span>
        <span class="stat" id="stat-${st.id}">…</span>
      </div>
      <div class="body" id="body-${st.id}"></div>
      <div class="foot"><span>STATION ${st.num}</span><span id="upd-${st.id}">—</span></div>`;
    grid.appendChild(panel);

    const body = panel.querySelector(`#body-${st.id}`);
    try {
      const status = await st.render(body);
      panel.querySelector(`#stat-${st.id}`).textContent = status || "OK";
    } catch (e) {
      panel.querySelector(`#stat-${st.id}`).textContent = "ERR";
      body.innerHTML = `<div class="row"><span class="k down">render failed</span></div>`;
      console.error(`[station ${st.id}]`, e);
    }
    panel.querySelector(`#upd-${st.id}`).textContent =
      "upd " + new Date().toLocaleTimeString("en-US", { hour12: false });
    flash(panel);
  }
}

// brief flash when a panel updates
function flash(panel) {
  panel.classList.remove("flash");
  void panel.offsetWidth; // restart animation
  panel.classList.add("flash");
}

// ---------- command console ----------
function startConsole() {
  const input = document.getElementById("cmd-input");
  const clog = document.getElementById("cmd-log");
  const push = (text, cls = "") =>
    clog.insertAdjacentHTML("afterbegin",
      `<div class="${cls}"><span class="t">${new Date().toLocaleTimeString("en-US",{hour12:false})}</span> ${text}</div>`);

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const cmd = input.value.trim();
    if (!cmd) return;
    input.value = "";
    push(`› ${cmd}`, "text-hi");
    route(cmd, push);
  });
}

// very small router. Phase 1 = acknowledge + stub.
// Later: route to Supabase Edge Functions / GitHub workflow_dispatch.
function route(cmd, push) {
  const c = cmd.toLowerCase();
  if (c.includes("brief") || c.includes("email") || c.includes("mail")) {
    push("→ mail-agent: digest is produced by the 06:00 job (Milestone 3). On-demand run comes later.", "text-dim");
  } else if (c.includes("market") || c.includes("stock") || c.includes("watch")) {
    push("→ market-agent: live quotes wired in a later pass.", "text-dim");
  } else if (c === "help") {
    push("commands: brief · markets · projects · agents · life  (backends arrive panel-by-panel)", "text-dim");
  } else {
    push("→ noted. command routing backend is built in a later pass.", "text-dim");
  }
}

// ---------- boot ----------
setHeader();
initAuth();

// only build the dashboard once auth says we're in — and never more than once
let hubStarted = false;
document.addEventListener("hub:ready", () => {
  if (hubStarted) return;
  hubStarted = true;
  startClock();
  buildPanels();
  startConsole();
});
document.addEventListener("hub:left", () => { hubStarted = false; });
