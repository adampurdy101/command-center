/* ============================================================
   PANELS  ·  click a dashboard panel → expanded detail view
   ------------------------------------------------------------
   The five deck panels (Daily Brief, Markets, Projects, Agent
   Ops, Life Admin) inflate on hover and open a full, richer
   detail overlay on click. Demo data, structured so it can wire
   to live sources later. Voice Scope + Defense Grid are left
   interactive (no detail view).
   ============================================================ */
(function () {
  "use strict";

  /* ---------- tiny chart helpers (inline SVG) ---------- */
  function spark(vals, w, h, color) {
    var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals), span = (max - min) || 1;
    var pts = vals.map(function (v, i) { return (i / (vals.length - 1) * w).toFixed(1) + "," + (h - (v - min) / span * h).toFixed(1); }).join(" ");
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:' + h + 'px">' +
      '<polyline fill="none" stroke="' + color + '" stroke-width="1.6" points="' + pts + '" style="filter:drop-shadow(0 0 3px ' + color + ')"/></svg>';
  }
  function bars(vals, labels, color) {
    var max = Math.max.apply(null, vals) || 1, n = vals.length, bw = 100 / n;
    var rects = vals.map(function (v, i) {
      var bh = v / max * 88, x = i * bw + bw * 0.15, y = 92 - bh;
      return '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + (bw * 0.7).toFixed(2) + '" height="' + bh.toFixed(2) +
        '" fill="' + color + '" opacity="0.85"/>' +
        '<text x="' + (x + bw * 0.35).toFixed(2) + '" y="99" fill="#2bd964" font-size="4" text-anchor="middle">' + (labels[i] || "") + '</text>';
    }).join("");
    return '<svg viewBox="0 0 100 100" style="width:100%;height:120px">' + rects + '</svg>';
  }
  function ring(pct, color) {
    var r = 26, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    return '<svg viewBox="0 0 64 64" style="width:64px;height:64px">' +
      '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="rgba(65,255,126,.15)" stroke-width="6"/>' +
      '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="6" stroke-linecap="round" ' +
      'stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 32 32)" style="filter:drop-shadow(0 0 4px ' + color + ')"/>' +
      '<text x="32" y="36" fill="#7dffb0" font-size="13" text-anchor="middle" font-family="ui-monospace,monospace">' + pct + '%</text></svg>';
  }
  function rows(items) {
    return items.map(function (it) {
      return '<div class="dx-row"><span class="k">' + it[0] + '</span><span class="v ' + (it[2] || "") + '">' + it[1] + '</span></div>';
    }).join("");
  }

  /* ---------- per-panel detail builders ---------- */
  var VIEWS = {
    brief: function () {
      return '<div class="dx-grid">' +
        '<div class="dx-card"><div class="dx-h">INBOX</div>' +
          '<div class="dx-big">' + (txt("brief-unread") || "201") + '<small>unread</small></div>' +
          rows([["Flagged", txt("brief-flagged") || "3", "warn"], ["Open tasks", txt("brief-tasks") || "0"], ["Newsletters", "44"], ["VIP senders", "5", "up"]]) +
        '</div>' +
        '<div class="dx-card"><div class="dx-h">UNREAD · LAST 7 DAYS</div>' + bars([42, 38, 51, 29, 47, 33, 21], ["M", "T", "W", "T", "F", "S", "S"], "#41ff7e") + '</div>' +
        '<div class="dx-card dx-wide"><div class="dx-h">FLAGGED &amp; AWAITING</div>' +
          list([["Wall Shops — RFI #214", "due today", "warn"], ["Tesla lemon-law — counsel reply", "2d", "warn"], ["WSH submittal log", "review", ""], ["Mom · POA docs", "in review", "warn"]]) + '</div>' +
        '<div class="dx-card dx-wide"><div class="dx-h">UPCOMING</div>' +
          list([["10:30 — Wall Shops sync", "Teams", ""], ["13:00 — Submittal review", "office", ""], ["17:30 — Dog walk", "—", ""], ["06:00 — Morning digest job", "auto", "up"]]) + '</div>' +
        '</div>' +
        '<div class="dx-actions"><button class="btn" onclick="alert(\'Digest runs from the 06:00 job (Supabase). On-demand run wires in later.\')">▸ RUN DIGEST NOW</button></div>';
    },
    markets: function () {
      var wl = [["NVDA", 2.4, [3, 5, 4, 7, 6, 9, 8, 11]], ["VRT", 1.1, [6, 6, 7, 6, 8, 7, 9, 9]], ["NBIS", -3.2, [9, 8, 8, 6, 7, 5, 4, 4]], ["AMD", 0.6, [5, 6, 5, 6, 6, 7, 6, 7]], ["PLTR", 3.8, [4, 5, 6, 6, 8, 9, 10, 12]]];
      return '<div class="dx-grid">' +
        '<div class="dx-card dx-wide"><div class="dx-h">WATCHLIST</div>' +
          wl.map(function (r) { return '<div class="dx-wl"><span class="sym">' + r[0] + '</span><span class="mini">' + spark(r[2], 90, 22, r[1] >= 0 ? "#41ff7e" : "#ff6b5a") + '</span><span class="chg ' + (r[1] >= 0 ? "up" : "down") + '">' + (r[1] >= 0 ? "+" : "") + r[1] + '%</span></div>'; }).join("") + '</div>' +
        '<div class="dx-card"><div class="dx-h">INDICES</div>' + rows([["S&amp;P 500", "+0.8%", "up"], ["NASDAQ", "+1.2%", "up"], ["DOW", "−0.2%", "down"], ["VIX", "14.1", ""], ["10Y", "4.21%", ""]]) + '</div>' +
        '<div class="dx-card dx-wide"><div class="dx-h">NVDA · INTRADAY</div>' + spark([100, 101, 100.5, 102, 103, 102.4, 104, 105, 104.6, 106, 107], 320, 90, "#41ff7e") + '</div>' +
        '</div><div class="dx-note">DEMO feed — live quotes wire to the market agent in a later pass.</div>';
    },
    projects: function () {
      return '<div class="dx-grid">' +
        '<div class="dx-card"><div class="dx-h">WESTERN STATE HOSPITAL</div><div class="dx-ringrow">' + ring(62, "#41ff7e") + '<div>' + rows([["Phase", "Wall Shops"], ["Deadline", "T−38d", "warn"], ["RFIs open", "7", "warn"], ["Submittals", "23 / 40"]]) + '</div></div></div>' +
        '<div class="dx-card"><div class="dx-h">MILESTONES</div>' + list([["Demo complete", "done", "up"], ["Rough-in", "done", "up"], ["Wall shops", "62%", "warn"], ["Inspections", "pending", ""], ["Turnover", "T−38d", ""]]) + '</div>' +
        '<div class="dx-card dx-wide"><div class="dx-h">PROGRESS · 8 WEEKS</div>' + spark([20, 28, 33, 39, 44, 51, 57, 62], 320, 80, "#7dffb0") + '</div>' +
        '</div>';
    },
    agents: function () {
      return '<div class="dx-grid">' +
        '<div class="dx-card dx-wide"><div class="dx-h">AGENTS</div>' +
          list([["hal-openclaw", "HEARTBEAT · 2m ago", "up"], ["mail-agent", "IDLE · next 06:00", ""], ["market-agent", "RUNNING", "warn"], ["brief-agent", "IDLE", ""]]) + '</div>' +
        '<div class="dx-card"><div class="dx-h">UPTIME</div><div class="dx-ringrow">' + ring(99, "#41ff7e") + '<div>' + rows([["7-day", "99.4%", "up"], ["Incidents", "0", "up"], ["Avg run", "1.8s"]]) + '</div></div></div>' +
        '<div class="dx-card dx-wide"><div class="dx-h">OPS LOG</div><div class="dx-log">' +
          ["[06:00] mail-agent → digest written to supabase", "[09:14] market-agent → quotes refreshed", "[09:31] hal-openclaw → heartbeat ok", "[boot ] hub shell online", "[mail ] standing by for 06:00 PT job"].map(function (l) { return "<div>› " + l + "</div>"; }).join("") + '</div></div>' +
        '</div>';
    },
    life: function () {
      return '<div class="dx-grid">' +
        '<div class="dx-card dx-wide"><div class="dx-h">OPEN ITEMS</div>' +
          list([["Tesla lemon-law", "awaiting reply", "warn"], ["Mom care / POA", "docs in review", "warn"], ["Skin routine", "step 2 · retinol", ""], ["Dog walk", "17:30", ""], ["Home bills", "all paid", "up"]]) + '</div>' +
        '<div class="dx-card"><div class="dx-h">THIS WEEK</div><div class="dx-ringrow">' + ring(70, "#ffd24a") + '<div>' + rows([["Done", "7 / 10", "up"], ["Overdue", "1", "warn"], ["Bills due", "0", "up"]]) + '</div></div></div>' +
        '<div class="dx-card dx-wide"><div class="dx-h">REMINDERS</div>' + list([["Renew passport", "Aug", ""], ["Car service", "T−2w", "warn"], ["Pattaya trip — book flights", "open", ""]]) + '</div>' +
        '</div>';
    }
  };

  function txt(id) { var el = document.getElementById(id); return el ? el.textContent.trim() : ""; }
  function list(items) {
    return '<div class="dx-list">' + items.map(function (it) {
      return '<div class="dx-li"><span class="k">' + it[0] + '</span><span class="v ' + (it[2] || "") + '">' + it[1] + '</span></div>';
    }).join("") + '</div>';
  }

  var TITLES = { brief: "01 · DAILY BRIEF", markets: "02 · MARKETS", projects: "03 · PROJECTS", agents: "04 · AGENT OPS", life: "05 · LIFE ADMIN" };

  /* ---------- overlay ---------- */
  var overlay = null;
  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "detail"; overlay.className = "hidden";
    overlay.innerHTML = '<div class="dx-box"><div class="dx-head"><span class="dx-title"></span><span class="dx-sp"></span>' +
      '<button class="btn dx-close" type="button">✕ CLOSE</button></div><div class="dx-body"></div></div>';
    (document.getElementById("hub") || document.body).appendChild(overlay);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    overlay.querySelector(".dx-close").addEventListener("click", close);
    return overlay;
  }
  function open(key) {
    if (!VIEWS[key]) return;
    var o = ensureOverlay();
    o.querySelector(".dx-title").textContent = TITLES[key] || "";
    o.querySelector(".dx-body").innerHTML = VIEWS[key]();
    o.classList.remove("hidden");
    try { navigator.vibrate && navigator.vibrate(10); } catch (e) {}
  }
  function close() { if (overlay) overlay.classList.add("hidden"); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

  /* ---------- wire the five deck panels ---------- */
  function keyOf(panel) {
    var n = panel.querySelector(".tb .n"); if (!n) return null;
    var s = n.textContent.toLowerCase();
    if (s.indexOf("brief") >= 0) return "brief";
    if (s.indexOf("market") >= 0) return "markets";
    if (s.indexOf("project") >= 0) return "projects";
    if (s.indexOf("agent") >= 0) return "agents";
    if (s.indexOf("life") >= 0) return "life";
    return null;
  }
  var TOUCH = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0) ||
    (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

  function wire() {
    var panels = document.querySelectorAll("#hub .col .panel");
    for (var i = 0; i < panels.length; i++) {
      (function (panel) {
        if (panel.__dxWired) return;          // wire() can run twice (initial + hub:ready)
        var key = keyOf(panel); if (!key) return;
        panel.__dxWired = true;
        panel.classList.add("dx-clickable");
        panel.setAttribute("data-dxkey", key);
        if (TOUCH) {
          // touch: single tap/scrub highlights, double-tap opens (handled globally below)
          panel.setAttribute("title", "Double-tap to open");
        } else {
          panel.setAttribute("title", "Click for detail");
          panel.addEventListener("click", function () { open(key); });
        }
        // don't let the inner "READY ▸" button also open the panel
        var rep = panel.querySelector("#brief-report");
        if (rep) rep.addEventListener("click", function (e) { e.stopPropagation(); });
      })(panels[i]);
    }
    if (TOUCH) setupTouch();
  }

  /* ---------- touch: finger-scrub highlight + double-tap to open ---------- */
  var touchReady = false;
  function setupTouch() {
    if (touchReady) return; touchReady = true;
    var DOUBLE_MS = 380, MOVE_TOL = 12, ARM_MS = 1500;
    var startX = 0, startY = 0, moved = false, lastKey = null, lastTime = 0, armTimer = 0;

    function under(x, y, sel) {
      var el = document.elementFromPoint(x, y);
      return el && el.closest ? el.closest(sel) : null;
    }
    function clearHL() {
      var hl = document.querySelectorAll("#hub .touch-hover");
      for (var i = 0; i < hl.length; i++) hl[i].classList.remove("touch-hover");
    }
    function disarm() {
      if (armTimer) { clearTimeout(armTimer); armTimer = 0; }
      var a = document.querySelector("#hub .dx-armed"); if (a) a.classList.remove("dx-armed");
      lastKey = null; lastTime = 0;
    }
    function highlight(x, y) {
      clearHL();
      var p = under(x, y, "#hub .col .panel.dx-clickable"); if (p) p.classList.add("touch-hover");
      var r = under(x, y, "#hub .col .panel .bd .row, #hub .col .panel .bd .ag"); if (r) r.classList.add("touch-hover");
      return p;
    }
    function onInnerControl(t) {
      return t && t.closest && t.closest("button,a,input,select,textarea,.btn,.tools");
    }

    document.addEventListener("touchstart", function (e) {
      var t = e.touches[0]; if (!t) return;
      startX = t.clientX; startY = t.clientY; moved = false;
      if (onInnerControl(e.target)) return;            // let buttons/links behave normally
      if (!under(t.clientX, t.clientY, "#hub .col .panel.dx-clickable")) { disarm(); clearHL(); return; }
      highlight(t.clientX, t.clientY);
    }, { passive: true });

    document.addEventListener("touchmove", function (e) {
      var t = e.touches[0]; if (!t) return;
      var dx = Math.abs(t.clientX - startX), dy = Math.abs(t.clientY - startY);
      if (dx > MOVE_TOL || dy > MOVE_TOL) moved = true;
      if (moved || dy > dx) return;                    // once it's a scroll / vertical drag, stop hit-testing
      if (onInnerControl(e.target)) return;
      highlight(t.clientX, t.clientY);                 // horizontal scrub still follows the finger
    }, { passive: true });

    document.addEventListener("touchend", function (e) {
      var t = e.changedTouches[0]; if (!t) return;
      if (onInnerControl(e.target)) { disarm(); return; }
      if (moved) { lastKey = null; lastTime = 0; return; }   // a scrub/scroll, keep last highlight
      var p = under(t.clientX, t.clientY, "#hub .col .panel.dx-clickable");
      if (!p) { disarm(); clearHL(); return; }
      var key = p.getAttribute("data-dxkey");
      var now = Date.now();
      if (lastKey === key && (now - lastTime) < DOUBLE_MS) {   // second tap → open
        disarm(); clearHL();
        open(key);
      } else {                                                 // first tap → arm + hint
        disarm(); clearHL();
        p.classList.add("dx-armed");
        lastKey = key; lastTime = now;
        armTimer = setTimeout(disarm, ARM_MS);
      }
    }, { passive: true });
  }

  if (document.getElementById("hub")) wire();
  document.addEventListener("hub:ready", wire);
})();
