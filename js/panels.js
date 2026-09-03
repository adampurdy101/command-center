/* ============================================================
   PANELS  ·  click a dashboard panel → expanded detail view
   ------------------------------------------------------------
   The five deck panels (Daily Brief, Markets, Projects, Agent
   Ops, Life Admin) inflate on hover and open a full, richer
   detail overlay on click. Brief / Projects / Agent Ops / Life
   Admin draw from the LIVE data in window.CC (js/board.js) when
   it's loaded; Markets is still demo until the market agent is
   wired. Voice Scope + Defense Grid are left interactive (no
   detail view).
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
  function txt(id) { var el = document.getElementById(id); return el ? el.textContent.trim() : ""; }
  function list(items) {
    return '<div class="dx-list">' + items.map(function (it) {
      return '<div class="dx-li"><span class="k">' + it[0] + '</span><span class="v ' + (it[2] || "") + '">' + it[1] + '</span></div>';
    }).join("") + '</div>';
  }
  /* live data (js/board.js) — null until it has loaded */
  function live() { var CC = window.CC; return (CC && CC.data) ? CC : null; }
  function esc(s) { var CC = window.CC; return CC ? CC.esc(s) : String(s == null ? "" : s); }
  function tagClass(t) { return (t === "warn" || t === "up" || t === "down") ? t : ""; }

  /* pinned / recent notes card (shared by Brief + Life) */
  function notesCard(CC, tag) {
    var notes = CC.data.notes.filter(function (n) { return !tag || (n.tags || []).indexOf(tag) >= 0; }).slice(0, 6);
    if (!notes.length) return "";
    return '<div class="dx-card dx-wide"><div class="dx-h">NOTES' + (tag ? " · " + tag.toUpperCase() : "") + '</div><div class="dx-list">' +
      notes.map(function (n) {
        return '<div class="dx-li dx-note-li"><span class="k">' + (n.pinned ? "📌 " : "") + esc(n.title) +
          (n.body ? ' <small class="dx-notes">— ' + esc(n.body) + '</small>' : "") + '</span><span class="v muted">' + CC.fmtWhen(n.updated_at) + '</span></div>';
      }).join("") + '</div></div>';
  }

  /* ---------- per-panel detail builders ---------- */
  var VIEWS = {
    brief: function () {
      var CC = live();
      var inbox = '<div class="dx-card"><div class="dx-h">INBOX</div>' +
        '<div class="dx-big">' + (txt("brief-unread") || "–") + '<small>unread</small></div>' +
        rows([["Flagged", txt("brief-flagged") || "–", "warn"], ["Next event", txt("brief-next") || "—"]]) + '</div>';
      if (!CC) {
        return '<div class="dx-grid">' + inbox +
          '<div class="dx-card"><div class="dx-h">TO-DO</div><div class="dx-note">loading…</div></div></div>';
      }
      var open = CC.data.tasks.filter(function (t) { return !t.done; });
      var done = CC.data.tasks.filter(function (t) { return t.done; }).slice(0, 8);
      var overdue = open.filter(function (t) { return CC.dueLabel(t.due).cls === "down"; }).length;
      var c = CC.laneCounts(open);
      // the strip: three big lane numbers + a proportional bar, so the shape of the day reads instantly
      var total = open.length || 1;
      var strip = '<div class="dx-card"><div class="dx-h">TASKS · ' + open.length + ' OPEN' + (overdue ? ' <span class="warn">· ' + overdue + ' OVERDUE</span>' : "") + '</div>' +
        '<div class="lane-strip">' + CC.LANES.map(function (ln) {
          return '<div class="ls lane-' + ln.key + '"><span class="led"></span><b>' + c[ln.key] + '</b><span>' + ln.label + '</span></div>';
        }).join("") + '</div>' +
        '<div class="lane-bar">' + CC.LANES.map(function (ln) { return '<span class="lane-' + ln.key + '" style="width:' + (c[ln.key] / total * 100) + '%"></span>'; }).join("") + '</div></div>';
      // three lane columns
      var lanes = '<div class="dx-lanes">' + CC.LANES.map(function (ln) {
        var items = open.filter(function (t) { return CC.lane(t) === ln.key; });
        return '<div class="dx-card dx-lane lane-' + ln.key + '"><div class="dx-h"><span class="led"></span>' + ln.label + ' <small>' + ln.hint + '</small><span class="cnt">' + items.length + '</span></div>' +
          (items.length ? '<div class="todo">' + items.map(function (t) { return CC.taskRow(t, { detail: true }); }).join("") + '</div>'
                        : '<div class="dx-note">empty</div>') + '</div>';
      }).join("") + '</div>';
      var recent = done.length
        ? '<div class="dx-card dx-wide dx-done"><div class="dx-h">RECENTLY DONE <small>click ☑ to reopen</small></div><div class="todo">' +
          done.map(function (t) { return CC.taskRow(t); }).join("") + '</div></div>'
        : "";
      return '<div class="dx-grid">' + inbox + strip + '</div>' + lanes + '<div class="dx-grid">' + recent + notesCard(CC) + '</div>' +
        '<div class="dx-note">NOW = today · NEXT = this week · LATER = when there\'s room. Claude sets the lane when you give it something; say "bump X to now" to move it.</div>';
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
      var CC = live();
      if (!CC || !CC.data.projects.length) {
        return '<div class="dx-grid"><div class="dx-card dx-wide"><div class="dx-h">PROJECTS</div><div class="dx-note">' +
          (CC ? "no active projects — tell Claude what you're working on." : "loading…") + '</div></div></div>';
      }
      return '<div class="dx-grid">' + CC.data.projects.map(function (p) {
        var d = CC.dueLabel(p.deadline), pct = Math.max(0, Math.min(100, p.progress | 0));
        var items = [["Phase", esc(p.phase || "—")]];
        if (p.deadline) items.push(["Deadline", d.text + " · " + esc(p.deadline), d.cls]);
        if (p.notes) items.push(["Notes", esc(p.notes)]);
        items.push(["Updated", CC.fmtWhen(p.updated_at)]);
        return '<div class="dx-card dx-wide"><div class="dx-h">' + esc(p.name).toUpperCase() + '</div><div class="dx-ringrow">' +
          ring(pct, pct ? "#41ff7e" : "#1c8f46") + '<div style="flex:1">' + rows(items) + '</div></div></div>';
      }).join("") + notesCard(CC, "projects") + '</div>' +
        '<div class="dx-note">Tell Claude "WSH is at 70%" or "MML deadline is Sept 12" and the bars update.</div>';
    },
    agents: function () {
      var CC = live();
      if (!CC) return '<div class="dx-grid"><div class="dx-card dx-wide"><div class="dx-h">AGENTS</div><div class="dx-note">loading…</div></div></div>';
      var led = function (s) { return /online|run|heartbeat/i.test(s) ? "up" : /err|fail|down/i.test(s) ? "down" : ""; };
      var agents = CC.data.agents.length
        ? list(CC.data.agents.map(function (a) { return [esc(a.name) + ' <small class="dx-notes">' + esc(a.kind) + '</small>', esc(a.status) + (a.last_run ? " · " + CC.fmtWhen(a.last_run) : ""), led(a.status)]; }))
        : '<div class="dx-note">no agents registered.</div>';
      var log = CC.data.log.length
        ? CC.data.log.map(function (l) { return "<div>› [" + CC.clock(l.created_at) + "] <b>" + esc(l.agent) + "</b> → " + esc(l.action) + "</div>"; }).join("")
        : "<div>› quiet.</div>";
      return '<div class="dx-grid">' +
        '<div class="dx-card dx-wide"><div class="dx-h">AGENTS</div>' + agents + '</div>' +
        '<div class="dx-card dx-wide"><div class="dx-h">OPS LOG · LATEST FIRST</div><div class="dx-log">' + log + '</div></div>' +
        '</div>';
    },
    life: function () {
      var CC = live();
      if (!CC) return '<div class="dx-grid"><div class="dx-card dx-wide"><div class="dx-h">OPEN ITEMS</div><div class="dx-note">loading…</div></div></div>';
      var items = CC.data.life;
      var open = items.length
        ? '<div class="dx-list">' + items.map(function (i) {
            return '<div class="dx-li"><span class="k">' + esc(i.label) + (i.notes ? ' <small class="dx-notes">— ' + esc(i.notes) + '</small>' : "") +
              '</span><span class="v ' + tagClass(i.tag) + '">' + esc(i.status || "") + '</span></div>';
          }).join("") + '</div>'
        : '<div class="dx-note">nothing tracked — tell Claude.</div>';
      var attn = items.filter(function (i) { return i.tag === "warn"; }).length;
      return '<div class="dx-grid">' +
        '<div class="dx-card dx-wide"><div class="dx-h">OPEN ITEMS</div>' + open + '</div>' +
        '<div class="dx-card"><div class="dx-h">STATUS</div><div class="dx-ringrow">' + ring(items.length ? Math.round((items.length - attn) / items.length * 100) : 100, attn ? "#ffd24a" : "#41ff7e") +
          '<div>' + rows([["Tracked", items.length], ["Need attention", attn, attn ? "warn" : "up"]]) + '</div></div></div>' +
        notesCard(CC, "life") + '</div>' +
        '<div class="dx-note">Tell Claude "Tesla is now in arbitration" and the status flips here.</div>';
    }
  };

  var TITLES = { brief: "01 · DAILY BRIEF", life: "03 · LIFE ADMIN", projects: "04 · PROJECTS", agents: "05 · AGENT OPS", markets: "06 · MARKETS" };

  /* ---------- overlay ---------- */
  var overlay = null, openKey = null;
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
    openKey = key;
    o.querySelector(".dx-title").textContent = TITLES[key] || "";
    var body = o.querySelector(".dx-body");
    body.innerHTML = VIEWS[key]();
    // live to-do ticks inside the detail view
    var ticks = body.querySelectorAll(".todo-i .tick");
    for (var i = 0; i < ticks.length; i++) {
      ticks[i].addEventListener("click", function (e) {
        e.stopPropagation();
        var CC = live(); if (!CC) return;
        var id = +this.closest(".todo-i").getAttribute("data-id");
        var t = CC.data.tasks.filter(function (x) { return x.id === id; })[0];
        this.textContent = (t && t.done) ? "☐" : "☑";
        CC.toggleTask(id, !(t && t.done)).then(function () { if (openKey === key) open(key); });
      });
    }
    o.classList.remove("hidden");
    try { navigator.vibrate && navigator.vibrate(10); } catch (e) {}
  }
  function close() { openKey = null; if (overlay) overlay.classList.add("hidden"); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  // data changed while a detail view is open (Claude wrote a row) → redraw in place
  document.addEventListener("board:updated", function () {
    if (openKey && overlay && !overlay.classList.contains("hidden")) open(openKey);
  });

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
          panel.addEventListener("click", function (e) {
            // the to-do ☐ buttons in the Daily Brief body handle themselves
            if (e.target && e.target.closest && e.target.closest(".tick")) return;
            open(key);
          });
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
      return t && t.closest && t.closest("button,a,input,select,textarea,.btn,.tools,.mail-launch,[role=button]");
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
