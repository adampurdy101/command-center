/* ============================================================
   MOBILE / TABLET LAYER  ·  command-center
   ------------------------------------------------------------
   Adds, ONLY on touch / narrow devices, three things to the hub:
     1. a rotating 3D Earth (d3-geo orthographic globe)
     2. a lightweight tap-to-shoot mini-game ("Defense Grid")
     3. PWA plumbing: fullscreen button + service-worker register
   Desktop (fine pointer, wide window) is never touched: no DOM is
   injected and the geo libraries are never even downloaded there.
   ============================================================ */
(function () {
  "use strict";

  var MQ = window.matchMedia("(pointer: coarse), (max-width: 820px)");
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* ---------- service worker (safe, network-first) ---------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  /* ---------- in-page fullscreen button (Fullscreen API) ---------- */
  function wireFullscreen() {
    var btn = document.getElementById("fs-btn");
    if (!btn) return;
    function inFs() { return document.fullscreenElement || document.webkitFullscreenElement; }
    btn.addEventListener("click", function () {
      var el = document.documentElement;
      try {
        if (!inFs()) {
          (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
          btn.textContent = "⤢ EXIT FULL";
        } else {
          (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
          btn.textContent = "⤢ FULLSCREEN";
        }
      } catch (e) {}
    });
    document.addEventListener("fullscreenchange", function () {
      btn.textContent = inFs() ? "⤢ EXIT FULL" : "⤢ FULLSCREEN";
    });
  }
  wireFullscreen();

  /* ---------- helpers ---------- */
  function fit(cv) {
    var r = cv.getBoundingClientRect();
    cv.width = Math.max(2, r.width * DPR);
    cv.height = Math.max(2, r.height * DPR);
    return cv.getContext("2d");
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src; s.async = true; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  function loadGeoLibs() {
    if (window.d3 && window.topojson) return Promise.resolve();
    return loadScript("https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js")
      .then(function () { return loadScript("https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js"); })
      .catch(function () { /* offline — globe falls back to graticule only */ });
  }

  /* ---------- build + insert the mobile cards ---------- */
  function injectCards() {
    var hub = document.getElementById("hub");
    var grid = document.getElementById("grid");
    if (!hub || !grid || document.getElementById("mx-earth")) return;

    var earth = document.createElement("section");
    earth.className = "mx mx-card";
    earth.id = "mx-earth";
    earth.innerHTML =
      '<div class="titlebar"><span class="led green pulse"></span>' +
      '<span class="name">Global Track Sys</span><span class="spacer"></span>' +
      '<span class="hint">DRAG · PINCH</span></div>' +
      '<div class="stage"><canvas id="mx-globe"></canvas>' +
      '<div class="continent" id="mx-continent"></div>' +
      '<div class="readout"><span id="mx-zoom">ZOOM 1.0×</span>' +
      '<span>HOME · RENTON</span></div></div>';

    var divider = document.createElement("div");
    divider.className = "mx mx-divider";
    divider.textContent = "STATION FEED";

    var game = document.createElement("section");
    game.className = "mx mx-card";
    game.id = "mx-game";
    game.innerHTML =
      '<div class="titlebar"><span class="led amber"></span>' +
      '<span class="name">Defense Grid</span><span class="spacer"></span>' +
      '<div class="ctrls"><button class="btn" id="mx-restart">↻ NEW ROUND</button></div></div>' +
      '<div class="stage"><canvas id="mx-gamecv"></canvas></div>';

    grid.parentNode.insertBefore(earth, grid);
    grid.parentNode.insertBefore(divider, grid);
    if (grid.nextSibling) grid.parentNode.insertBefore(game, grid.nextSibling);
    else grid.parentNode.appendChild(game);
  }

  /* ============================================================
     ROTATING EARTH  ·  d3 orthographic, drag-rotate + pinch-zoom
     (auto-spins when idle; labels continents when zoomed in)
     ============================================================ */
  function initGlobe() {
    var cv = document.getElementById("mx-globe");
    if (!cv) return;
    var ctx = fit(cv);
    var land = null, borders = null;
    var graticule = (window.d3 && d3.geoGraticule10) ? d3.geoGraticule10() : null;
    var HOME = [-122.2, 47.5];
    var DESTS = { BKK: [100.5, 13.7], TYO: [139.7, 35.7], SEA: [-122.3, 47.6] };
    var ARCS = [[HOME, [100.5, 13.7]], [HOME, [139.7, 35.7]], [HOME, [151.2, -33.9]]];
    var CONTS = [
      { n: "NORTH AMERICA", c: [-100, 45] }, { n: "SOUTH AMERICA", c: [-60, -15] },
      { n: "EUROPE", c: [15, 52] }, { n: "AFRICA", c: [20, 2] }, { n: "ASIA", c: [95, 45] },
      { n: "OCEANIA", c: [134, -25] }, { n: "ANTARCTICA", c: [0, -82] }
    ];
    var rot = [0, -18], zoom = 1, lastTouch = 0, drag = null, tdrag = null, pinch = null;

    if (window.topojson && window.d3) {
      fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
        .then(function (r) { return r.json(); })
        .then(function (w) {
          land = topojson.feature(w, w.objects.countries);
          borders = topojson.mesh(w, w.objects.countries, function (a, b) { return a !== b; });
        }).catch(function () {});
    }
    window.addEventListener("resize", function () { ctx = fit(cv); });
    var now = function () { return performance.now(); };
    function continentAt(lon, lat) {
      var best = null, bd = Infinity;
      for (var i = 0; i < CONTS.length; i++) {
        var d = d3.geoDistance([lon, lat], CONTS[i].c);
        if (d < bd) { bd = d; best = CONTS[i]; }
      }
      return bd < 1.0 ? best.n : null;
    }
    function rotBy(dx, dy, r0) {
      var s = 0.28 / zoom;
      rot[0] = r0[0] + dx * s;
      rot[1] = Math.max(-89, Math.min(89, r0[1] - dy * s));
    }
    function zoomMul(m) { zoom = Math.max(1, Math.min(6, zoom * m)); }
    function tdist(e) {
      var a = e.touches[0], b = e.touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
    cv.style.cursor = "grab";
    cv.addEventListener("mousedown", function (e) { drag = { x: e.clientX, y: e.clientY, r0: rot.slice() }; cv.style.cursor = "grabbing"; lastTouch = now(); });
    window.addEventListener("mousemove", function (e) { if (!drag) return; rotBy(e.clientX - drag.x, e.clientY - drag.y, drag.r0); lastTouch = now(); });
    window.addEventListener("mouseup", function () { if (drag) { drag = null; cv.style.cursor = "grab"; lastTouch = now(); } });
    cv.addEventListener("wheel", function (e) { e.preventDefault(); zoomMul(e.deltaY < 0 ? 1.12 : 0.89); lastTouch = now(); }, { passive: false });
    cv.addEventListener("touchstart", function (e) {
      if (e.touches.length === 1) tdrag = { x: e.touches[0].clientX, y: e.touches[0].clientY, r0: rot.slice() };
      else if (e.touches.length === 2) { pinch = tdist(e); tdrag = null; }
      lastTouch = now();
    }, { passive: false });
    cv.addEventListener("touchmove", function (e) {
      e.preventDefault();
      if (e.touches.length === 2 && pinch) { var d = tdist(e); zoomMul(d / pinch); pinch = d; }
      else if (e.touches.length === 1 && tdrag) { rotBy(e.touches[0].clientX - tdrag.x, e.touches[0].clientY - tdrag.y, tdrag.r0); }
      lastTouch = now();
    }, { passive: false });
    cv.addEventListener("touchend", function (e) { if (e.touches.length === 0) { tdrag = null; pinch = null; } lastTouch = now(); });
    function interacting() { return drag || tdrag || pinch; }
    function vis(p) { return d3.geoDistance(p, [-rot[0], -rot[1]]) < 1.5; }
    var pr0 = null, pr1 = null, pz = null;

    function draw() {
      var w = cv.width / DPR, h = cv.height / DPR;
      if (!window.d3 || w < 30 || h < 30) { requestAnimationFrame(draw); return; }
      if (!interacting() && zoom <= 1.2 && now() - lastTouch > 3200) rot[0] += 0.07;
      if (pr0 === rot[0] && pr1 === rot[1] && pz === zoom && !interacting()) { requestAnimationFrame(draw); return; }
      pr0 = rot[0]; pr1 = rot[1]; pz = zoom;
      ctx.save(); ctx.scale(DPR, DPR); ctx.clearRect(0, 0, w, h);
      var R = Math.max(8, (Math.min(w, h) / 2 - 10) * 0.92);
      var proj = d3.geoOrthographic().scale(R * zoom).translate([w / 2, h / 2]).clipAngle(90).rotate([rot[0], rot[1], 0]);
      var path = d3.geoPath(proj, ctx);
      ctx.save(); ctx.beginPath(); ctx.arc(w / 2, h / 2, R, 0, 7); ctx.clip();
      ctx.beginPath(); path({ type: "Sphere" }); ctx.fillStyle = "#06170c"; ctx.fill();
      if (graticule) { ctx.beginPath(); path(graticule); ctx.strokeStyle = "rgba(65,255,126,.13)"; ctx.lineWidth = .6; ctx.stroke(); }
      if (land) {
        ctx.beginPath(); path(land); ctx.fillStyle = "rgba(41,255,126,.16)"; ctx.fill();
        ctx.shadowColor = "#41ff7e"; ctx.shadowBlur = 7; ctx.strokeStyle = "#41ff7e"; ctx.lineWidth = .8; ctx.stroke(); ctx.shadowBlur = 0;
      }
      if (borders) { ctx.beginPath(); path(borders); ctx.strokeStyle = "rgba(125,255,176,.35)"; ctx.lineWidth = .4; ctx.stroke(); }
      ARCS.forEach(function (a) {
        ctx.beginPath(); path({ type: "LineString", coordinates: a });
        ctx.strokeStyle = "rgba(125,255,176,.85)"; ctx.lineWidth = 1.3; ctx.shadowColor = "#7dffb0"; ctx.shadowBlur = 5; ctx.stroke(); ctx.shadowBlur = 0;
      });
      Object.keys(DESTS).forEach(function (k) {
        var p = DESTS[k]; if (!vis(p)) return; var xy = proj(p);
        ctx.beginPath(); ctx.arc(xy[0], xy[1], 3, 0, 7); ctx.fillStyle = "#7dffb0"; ctx.fill();
        ctx.fillStyle = "#7dffb0"; ctx.font = "10px ui-monospace,monospace"; ctx.fillText(k, xy[0] + 5, xy[1] - 4);
      });
      if (vis(HOME)) { var xy = proj(HOME); ctx.beginPath(); ctx.arc(xy[0], xy[1], 3.4, 0, 7); ctx.fillStyle = "#ffd24a"; ctx.fill(); }
      ctx.restore();
      ctx.beginPath(); ctx.arc(w / 2, h / 2, R, 0, 7); ctx.shadowColor = "#41ff7e"; ctx.shadowBlur = 14;
      ctx.strokeStyle = "rgba(125,255,176,.85)"; ctx.lineWidth = 1.4; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.restore();
      var cName = zoom > 1.45 ? continentAt(-rot[0], -rot[1]) : null;
      var cl = document.getElementById("mx-continent");
      if (cl) { if (cName) { cl.textContent = cName; cl.style.opacity = Math.min(1, (zoom - 1.45) / 0.5).toFixed(2); } else cl.style.opacity = 0; }
      var zr = document.getElementById("mx-zoom"); if (zr) zr.textContent = "ZOOM " + zoom.toFixed(1) + "×";
      requestAnimationFrame(draw);
    }
    draw();
  }

  /* ============================================================
     DEFENSE GRID  ·  30s rounds · tap a guy to shoot · high score
     ============================================================ */
  function initGame() {
    var cv = document.getElementById("mx-gamecv");
    if (!cv) return;
    var ctx = fit(cv);
    var guys = [], shots = [], bits = [], last = performance.now();
    var W = function () { return cv.width / DPR; }, H = function () { return cv.height / DPR; };
    var ROUND = 30;
    var timeLeft = ROUND, hits = 0, misses = 0, active = true;
    var hi = 0;
    try { var s = JSON.parse(localStorage.getItem("cc_defense_high") || "null"); if (s) hi = s.score | 0; } catch (e) {}
    function targetCount() { var p = 1 - timeLeft / ROUND; return Math.max(2, Math.round(6 - p * 4)); }
    function speedMul() { var p = 1 - timeLeft / ROUND; return 1 + p * 1.5; }
    function newGuy(x) { var dir = Math.random() < 0.5 ? 1 : -1; return { x: x, y: H() - 13, dir: dir, sp: 15 + Math.random() * 18, t: Math.random() * 6, hp: 1 }; }
    function spawnEdge() { var dir = Math.random() < 0.5 ? 1 : -1; var g = newGuy(dir > 0 ? -16 : W() + 16); g.dir = dir; guys.push(g); }
    function reseed() { guys = []; var n = targetCount(), m = 40, span = Math.max(60, W() - 2 * m); for (var i = 0; i < n; i++) guys.push(newGuy(m + span * i / Math.max(1, n - 1))); }
    function resetRound() { timeLeft = ROUND; hits = 0; misses = 0; active = true; shots = []; bits = []; reseed(); last = performance.now(); }
    reseed();
    window.addEventListener("resize", function () { ctx = fit(cv); });
    var rb = document.getElementById("mx-restart"); if (rb) rb.addEventListener("click", resetRound);

    function shootAt(mx, my) {
      if (!active) return;
      var hit = null, hd = 99;
      guys.forEach(function (g) {
        if (g.hp <= 0) return; var cy = g.y - 13; var d = Math.hypot(g.x - mx, cy - my);
        if (Math.abs(g.x - mx) < 20 && d < 36 && d < hd) { hd = d; hit = g; }
      });
      shots.push({ x: W() / 2, y: H() - 4, tx: mx, ty: my, life: 1 });
      if (hit) {
        hit.hp = 0; hits++;
        for (var i = 0; i < 14; i++) bits.push({ x: hit.x, y: hit.y - 12, vx: (Math.random() - 0.5) * 150, vy: (Math.random() - 0.8) * 150, life: 1 });
        if (hits > hi) { hi = hits; try { localStorage.setItem("cc_defense_high", JSON.stringify({ score: hi })); } catch (e) {} }
        beep();
      } else misses++;
    }
    function pt(e) {
      var r = cv.getBoundingClientRect();
      var t = e.changedTouches ? e.changedTouches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    cv.addEventListener("click", function (e) { var p = pt(e); shootAt(p.x, p.y); });
    cv.addEventListener("touchstart", function (e) { e.preventDefault(); var p = pt(e); shootAt(p.x, p.y); }, { passive: false });

    var ac = null;
    function beep() {
      try {
        ac = ac || new (window.AudioContext || window.webkitAudioContext)();
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = "square"; o.frequency.value = 720;
        o.frequency.exponentialRampToValueAtTime(150, ac.currentTime + 0.12);
        g.gain.value = 0.05; g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.13);
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.14);
      } catch (e) {}
    }
    function fig(g) {
      var x = g.x, fy = g.y;
      ctx.strokeStyle = g.hp > 0 ? "#41ff7e" : "#2bd964"; ctx.fillStyle = g.hp > 0 ? "#7dffb0" : "#2bd964";
      ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.shadowColor = "#41ff7e"; ctx.shadowBlur = 7;
      ctx.beginPath(); ctx.arc(x, fy - 22, 4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, fy - 18); ctx.lineTo(x, fy - 8); ctx.stroke();
      var aw = Math.sin(g.t * 8) * 3;
      ctx.beginPath(); ctx.moveTo(x, fy - 15); ctx.lineTo(x - 6, fy - 11 - aw); ctx.moveTo(x, fy - 15); ctx.lineTo(x + 6, fy - 11 + aw); ctx.stroke();
      var sw = Math.sin(g.t * 8) * 4.4;
      ctx.beginPath(); ctx.moveTo(x, fy - 8); ctx.lineTo(x - 5 + sw, fy); ctx.moveTo(x, fy - 8); ctx.lineTo(x + 5 - sw, fy); ctx.stroke();
      ctx.shadowBlur = 0; ctx.lineCap = "butt";
    }
    function hud(w) {
      ctx.font = "10px ui-monospace,monospace"; ctx.textAlign = "left";
      var ss = Math.max(0, Math.ceil(timeLeft));
      ctx.fillStyle = timeLeft < 8 ? "#ffd24a" : "#7dffb0"; ctx.fillText("TIME 0:" + String(ss).padStart(2, "0"), 8, 12);
      ctx.fillStyle = "#41ff7e"; ctx.fillText("HITS " + String(hits).padStart(2, "0"), 104, 12);
      ctx.fillStyle = "#ff6b5a"; ctx.fillText("MISS " + String(misses).padStart(2, "0"), 186, 12);
      ctx.textAlign = "right"; ctx.fillStyle = "#2bd964"; ctx.fillText("HIGH " + String(hi).padStart(2, "0"), w - 8, 12); ctx.textAlign = "left";
    }
    function draw(now2) {
      try {
        var dt = Math.min(0.05, (now2 - last) / 1000); last = now2;
        var w = W(), h = H(); ctx.save(); ctx.scale(DPR, DPR); ctx.clearRect(0, 0, w, h);
        if (active) { timeLeft -= dt; if (timeLeft <= 0) { timeLeft = 0; active = false; } }
        ctx.strokeStyle = "rgba(65,255,126,.28)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, h - 12); ctx.lineTo(w, h - 12); ctx.stroke();
        ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.moveTo(w / 2 - 6, h - 1); ctx.lineTo(w / 2 + 6, h - 1); ctx.lineTo(w / 2, h - 12); ctx.closePath(); ctx.fill();
        hud(w);
        var sm = speedMul();
        for (var i = 0; i < guys.length; i++) {
          var g = guys[i];
          if (active && g.hp > 0) { g.x += g.dir * g.sp * sm * dt; g.t += dt; if (g.x < 14) { g.x = 14; g.dir = 1; } if (g.x > w - 14) { g.x = w - 14; g.dir = -1; } }
          fig(g);
        }
        guys = guys.filter(function (g) { return g.hp > 0; });
        if (active) { var tc = targetCount(); while (guys.length < tc) spawnEdge(); if (guys.length > tc) guys.length = tc; }
        for (var s2 = 0; s2 < shots.length; s2++) {
          var sh = shots[s2]; sh.life -= dt * 5;
          ctx.strokeStyle = "rgba(214,255,224," + Math.max(0, sh.life) + ")"; ctx.lineWidth = 1.8;
          ctx.shadowColor = "#d6ffe0"; ctx.shadowBlur = 6; ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(sh.tx, sh.ty); ctx.stroke(); ctx.shadowBlur = 0;
        }
        shots = shots.filter(function (s) { return s.life > 0; });
        for (var b2 = 0; b2 < bits.length; b2++) {
          var b = bits[b2]; b.life -= dt * 1.6; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 170 * dt;
          ctx.fillStyle = "rgba(125,255,176," + Math.max(0, b.life) + ")"; ctx.fillRect(b.x, b.y, 2.4, 2.4);
        }
        bits = bits.filter(function (b) { return b.life > 0; });
        if (!active) {
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(125,255,176,.9)"; ctx.font = "14px ui-monospace,monospace";
          ctx.fillText("ROUND OVER · HITS " + hits + "  MISS " + misses, w / 2, h / 2 - 4);
          ctx.fillStyle = "rgba(125,255,176,.55)"; ctx.font = "10px ui-monospace,monospace";
          ctx.fillText("TAP “NEW ROUND” TO PLAY AGAIN", w / 2, h / 2 + 14); ctx.textAlign = "left";
        }
        ctx.restore();
      } catch (e) {}
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }

  /* ---------- orientation / resize: refit canvases ---------- */
  function wireOrientation() {
    function refit() {
      // let layout settle, then nudge a resize so canvases re-measure
      setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 120);
      setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 420);
    }
    window.addEventListener("orientationchange", refit);
    if (window.screen && screen.orientation && screen.orientation.addEventListener) {
      screen.orientation.addEventListener("change", refit);
    }
  }

  /* ---------- boot (only on touch / narrow, only once) ---------- */
  var started = false;
  function startMobile() {
    if (started || !MQ.matches) return;
    var hub = document.getElementById("hub");
    if (!hub || hub.classList.contains("hidden")) return; // wait for login
    started = true;
    injectCards();
    initGame();                 // game needs no external libs
    loadGeoLibs().then(initGlobe);
    wireOrientation();
  }

  document.addEventListener("hub:ready", startMobile);
  document.addEventListener("hub:left", function () { /* keep cards; nothing to tear down */ });
  // in case the hub is already visible when this script runs
  startMobile();
  // if the device only becomes "mobile" later (rotate into narrow / devtools), boot then
  if (MQ.addEventListener) MQ.addEventListener("change", startMobile);
})();
