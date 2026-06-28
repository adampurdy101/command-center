/* ============================================================
   EFFECTS  ·  visual flourishes for the Mission Control hub
   ------------------------------------------------------------
   1. Heartbeat / EKG trace (system-online pulse) — all .ekg canvases
   2. HAL 9000 eye — pulses, flares when HAL speaks
   3. Boot / power-on splash (also kills the white launch flash)
   4. Ambient sci-fi hum + beeps (toggle)
   5. Live weather — Renton + Pattaya (Open-Meteo)
   6. Tilt parallax — cursor (desktop) / device tilt (mobile)
   7. Fullscreen enter + explicit exit (graceful where unsupported)
   8. Light haptics on key taps
   Pure vanilla, no deps. Everything degrades quietly.
   ============================================================ */
(function () {
  "use strict";
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var coarse = window.matchMedia("(pointer: coarse)").matches;

  /* ============================================================
     1 · HEARTBEAT / EKG
     ============================================================ */
  function ecg(u) { // u in [0,1) → amplitude (-1..1)
    var y = 0;
    y += 0.10 * Math.exp(-Math.pow((u - 0.18) / 0.022, 2)); // P
    y -= 0.07 * Math.exp(-Math.pow((u - 0.30) / 0.011, 2)); // Q
    y += 0.98 * Math.exp(-Math.pow((u - 0.33) / 0.009, 2)); // R
    y -= 0.24 * Math.exp(-Math.pow((u - 0.37) / 0.013, 2)); // S
    y += 0.24 * Math.exp(-Math.pow((u - 0.58) / 0.040, 2)); // T
    return y;
  }
  function fitC(cv) {
    var r = cv.getBoundingClientRect();
    if (r.width < 2) return null;
    cv.width = r.width * DPR; cv.height = r.height * DPR;
    return cv.getContext("2d");
  }
  function startEKG() {
    var nodes = [].slice.call(document.querySelectorAll(".ekg"));
    if (!nodes.length) return;
    var cans = nodes.map(function (cv) { return { cv: cv, ctx: null }; });
    function refit() { cans.forEach(function (c) { var x = fitC(c.cv); if (x) c.ctx = x; }); }
    refit();
    window.addEventListener("resize", refit); window.addEventListener("orientationchange", refit);
    var BPM = 18, T = 60 / BPM;                  // slow, calm monitor sweep (~3.3s across) — was 43, was 65
    var ekgLast = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      if (document.hidden) return;                 // pause when tab hidden
      if (now - ekgLast < 33) return; ekgLast = now; // ~30fps (sweep takes ~3.3s anyway)
      var t = now / 1000;
      var phase = (t % T) / T;                    // 0..1 sweep position (stationary trace)
      var sweepX = phase;
      for (var ci = 0; ci < cans.length; ci++) {
        var c = cans[ci]; if (!c.ctx) continue;   // no per-frame getBoundingClientRect; refit() handles new canvases
        var ctx = c.ctx, w = c.cv.width / DPR, h = c.cv.height / DPR, mid = h * 0.56, amp = h * 0.44;
        ctx.save(); ctx.scale(DPR, DPR); ctx.clearRect(0, 0, w, h);
        ctx.lineJoin = "round"; ctx.lineCap = "round";
        // faint full waveform (the monitor's resting trace — one beat fills the width)
        ctx.lineWidth = 1.1; ctx.strokeStyle = "rgba(43,217,100,0.28)";
        ctx.beginPath();
        for (var x = 0; x <= w; x++) { var y = mid - ecg(x / w) * amp; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
        // bright beam: the part of the trace the sweep has drawn this beat
        ctx.lineWidth = 1.7; ctx.strokeStyle = "#41ff7e"; ctx.shadowColor = "#41ff7e"; ctx.shadowBlur = 7;
        ctx.beginPath();
        var sx = sweepX * w, started = false;
        for (var x2 = 0; x2 <= sx; x2++) { var y2 = mid - ecg(x2 / w) * amp; if (!started) { ctx.moveTo(x2, y2); started = true; } else ctx.lineTo(x2, y2); }
        ctx.stroke();
        // glowing sweep head
        var yh = mid - ecg(sweepX) * amp;
        ctx.shadowBlur = 9; ctx.fillStyle = "#d6ffe0";
        ctx.beginPath(); ctx.arc(sx, yh, 1.9, 0, 7); ctx.fill();
        ctx.restore();
      }
    }
    requestAnimationFrame(frame);
  }

  /* ============================================================
     2 · HAL 9000 EYE  (idle pulse; flares while HAL speaks)
     ============================================================ */
  function startHalEye() {
    var eye = document.getElementById("hal-eye");
    if (!eye) return;
    var eyeLast = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      if (document.hidden) return;                 // pause when tab hidden
      if (now - eyeLast < 50) return; eyeLast = now; // 20fps is ample for a breathing CSS var
      var t = now / 1000;
      var HAL = window.HAL || { speaking: false, level: 0 };
      var base = 0.55 + 0.18 * Math.sin(t * 1.6);           // calm breathing
      var lvl = HAL.speaking ? Math.max(base, 0.7 + 0.3 * (HAL.level || 0)) : base;
      eye.style.setProperty("--eye", lvl.toFixed(3));
      eye.classList.toggle("awake", !!HAL.speaking);
    }
    requestAnimationFrame(frame);
  }

  /* ============================================================
     3 · BOOT / POWER-ON SPLASH
     ============================================================ */
  function startBoot() {
    var boot = document.getElementById("boot"), log = document.getElementById("boot-log");
    if (!boot) return;
    var lines = [
      "▸ POWER ON", "▸ CRT WARM-UP … OK", "▸ LOADING STAR FIELD",
      "▸ GLOBAL TRACK SYS … LOCKED", "▸ HAL 9000 … STANDBY", "▸ ALL STATIONS NOMINAL", "▸ SYSTEM ONLINE"
    ];
    var i = 0;
    function next() {
      if (log && i < lines.length) {
        var d = document.createElement("div"); d.textContent = lines[i]; log.appendChild(d);
      }
      i++;
      if (i <= lines.length) setTimeout(next, 230);
      else setTimeout(function () { boot.classList.add("gone"); setTimeout(function(){ if(boot.parentNode) boot.parentNode.removeChild(boot); }, 700); }, 360);
    }
    setTimeout(next, 260);
    // a quick green flash when the hub appears after login
    document.addEventListener("hub:ready", function () {
      var f = document.getElementById("flash");
      if (f) { f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }
    });
  }

  /* ============================================================
     4 · AMBIENT HUM + BEEPS  (toggle)
     ============================================================ */
  function startAmbient() {
    var btn = document.getElementById("amb-btn");
    if (!btn) return;
    var ac = null, nodes = [], beepTimer = null, on = false;
    // user-controllable volume (0..1 slider). 0.5 maps to the old 0.05 "perfect" default; 1.0 is really loud.
    var vol = 0.5; try { var sv = parseFloat(localStorage.getItem("cc_ambient_vol")); if (!isNaN(sv)) vol = Math.max(0, Math.min(1, sv)); } catch (e) {}
    function gainFor() { return vol * vol * 0.2; }
    function build() {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      var master = ac.createGain(); master.gain.value = 0.0; master.connect(ac.destination);
      [55, 82.4, 110].forEach(function (f, idx) {
        var o = ac.createOscillator(); o.type = "sine"; o.frequency.value = f;
        var g = ac.createGain(); g.gain.value = idx === 0 ? 0.6 : 0.22;
        o.connect(g); g.connect(master); o.start();
      });
      // slow shimmer LFO on master
      var lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
      var lg = ac.createGain(); lg.gain.value = 0.012;
      lfo.connect(lg); lg.connect(master.gain); lfo.start();
      master.gain.setTargetAtTime(gainFor(), ac.currentTime, 1.2);
      nodes = [master];
      function blip() {
        if (!on) return;
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = 880 + Math.random() * 600;
        g.gain.value = 0.0; o.connect(g); g.connect(ac.destination);
        var n = ac.currentTime; g.gain.setValueAtTime(0.0, n);
        g.gain.linearRampToValueAtTime(0.03, n + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, n + 0.18);
        o.start(n); o.stop(n + 0.2);
        beepTimer = setTimeout(blip, 20000 + Math.random() * 20000);  // an occasional accent, ~20–40s apart
      }
      beepTimer = setTimeout(blip, 9000);
    }
    function set(v) {
      on = v; btn.classList.toggle("active", on);
      btn.textContent = on ? "♪ HUM ●" : "♪ HUM";
      try { localStorage.setItem("cc_ambient", on ? "1" : "0"); } catch (e) {}
      try {
        if (on) { if (!ac) build(); else { ac.resume(); nodes[0] && nodes[0].gain.setTargetAtTime(gainFor(), ac.currentTime, 1.0); } }
        else if (ac && nodes[0]) { nodes[0].gain.setTargetAtTime(0.0, ac.currentTime, 0.4); }
      } catch (e) {}
    }
    btn.addEventListener("click", function () { set(!on); });
    // volume slider — live, persisted, works whether the hum is on or off
    var slider = document.getElementById("amb-vol");
    if (slider) {
      slider.value = vol;
      var apply = function () {
        vol = Math.max(0, Math.min(1, parseFloat(slider.value) || 0));
        try { localStorage.setItem("cc_ambient_vol", String(vol)); } catch (e) {}
        if (on && ac && nodes[0]) nodes[0].gain.setTargetAtTime(gainFor(), ac.currentTime, 0.12);
      };
      slider.addEventListener("input", apply);
      slider.addEventListener("change", apply);
    }
    // if the user had it on before, arm it and resume on first interaction (autoplay policy)
    try {
      if (localStorage.getItem("cc_ambient") === "1") {
        var arm = function () { set(true); window.removeEventListener("pointerdown", arm); };
        window.addEventListener("pointerdown", arm, { once: true });
      }
    } catch (e) {}
  }

  /* ============================================================
     5 · LIVE WEATHER  (Renton + Pattaya, Open-Meteo, no key)
     ============================================================ */
  function wxSymbol(code) {
    if (code === 0) return "☀";
    if (code <= 2) return "🌤";
    if (code === 3) return "☁";
    if (code >= 45 && code <= 48) return "🌫";
    if (code >= 51 && code <= 67) return "🌧";
    if (code >= 71 && code <= 77) return "❄";
    if (code >= 80 && code <= 82) return "🌦";
    if (code >= 95) return "⛈";
    return "·";
  }
  function loadWeather() {
    var spots = [
      { id: "wx-home", label: "RENTON", lat: 47.48, lon: -122.21 },
      { id: "wx-bkk", label: "PATTAYA", lat: 12.93, lon: 100.88 }
    ];
    spots.forEach(function (s) {
      var url = "https://api.open-meteo.com/v1/forecast?latitude=" + s.lat + "&longitude=" + s.lon +
        "&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto";
      fetch(url).then(function (r) { return r.json(); }).then(function (d) {
        var el = document.getElementById(s.id); if (!el || !d || !d.current) return;
        var temp = Math.round(d.current.temperature_2m);
        el.textContent = s.label + " " + temp + "° " + wxSymbol(d.current.weather_code);
      }).catch(function () {});
    });
  }

  /* (cursor/device parallax removed by request — the globe and panels stay put) */

  /* ============================================================
     7 · FULLSCREEN  (enter + explicit exit; graceful fallback)
     ============================================================ */
  function startFullscreen() {
    var enter = document.getElementById("fs-btn"), exit = document.getElementById("fs-exit");
    var root = document.documentElement;
    var canFS = !!(root.requestFullscreen || root.webkitRequestFullscreen);
    function inFS() { return document.fullscreenElement || document.webkitFullscreenElement; }
    function doEnter() { try { (root.requestFullscreen || root.webkitRequestFullscreen).call(root); } catch (e) {} }
    function doExit() { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} }
    // remove any leftover floating exit button from a previous build
    var stray = document.getElementById("fs-exit-fixed");
    if (stray && stray.parentNode) stray.parentNode.removeChild(stray);

    function sync() {
      var f = !!inFS();
      // ONE in-bar button, right where ⤢ FULLSCREEN was: it flips to a lit-green
      // ⤡ EXIT FULLSCREEN while fullscreen, blended into the top bar.
      if (enter) {
        enter.style.display = canFS ? "" : "none";
        enter.textContent = f ? "⤡ EXIT FULLSCREEN" : "⤢ FULLSCREEN";
        enter.title = f ? "Click to exit fullscreen" : "Enter fullscreen";
        enter.classList.toggle("fs-on", f);
      }
      if (exit) exit.style.display = "none";   // legacy 2nd button stays unused
    }
    if (!canFS) {
      // iPhone Safari has no Fullscreen API — hide both; install-to-home-screen gives full screen
      if (enter) enter.style.display = "none";
      if (exit) exit.style.display = "none";
      return;
    }
    if (enter) enter.addEventListener("click", function () { inFS() ? doExit() : doEnter(); });
    if (exit) exit.addEventListener("click", doExit);
    // Esc always exits (covers cases where the native hint is missed)
    document.addEventListener("keydown", function (e) { if ((e.key === "Escape" || e.key === "Esc") && inFS()) doExit(); });
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    sync();
  }

  /* ============================================================
     8 · LIGHT HAPTICS on key taps (mobile)
     ============================================================ */
  function startHaptics() {
    if (!coarse || !navigator.vibrate) return;
    ["talkBtn", "restartBtn", "fs-btn", "fs-exit", "amb-btn", "voiceCfgBtn", "stopBtn"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("pointerdown", function () { try { navigator.vibrate(8); } catch (e) {} });
    });
  }

  /* ============================================================
     9 · LIVE PANEL TICKERS  (gentle motion so the deck breathes)
     ------------------------------------------------------------
     The Markets panel is DEMO data, but a frozen quote board reads
     as dead. We random-walk the four percentages + the sparkline on
     a slow cadence — purely cosmetic, recolors up/down, flashes on
     change. Everything else (LEDs, globe, heartbeat) already moves.
     ============================================================ */
  function startTickers() {
    function panelByName(name) {
      var ps = [].slice.call(document.querySelectorAll("#hub .panel"));
      for (var i = 0; i < ps.length; i++) {
        var n = ps[i].querySelector(".tb .n");
        if (n && n.textContent.toLowerCase().indexOf(name) >= 0) return ps[i];
      }
      return null;
    }
    var mk = panelByName("market");
    if (!mk) return;
    var cells = [].slice.call(mk.querySelectorAll(".bd .row .v"));
    var poly = mk.querySelector("svg.spark polyline");
    if (!cells.length) return;
    // seed from whatever the markup currently shows (markup uses a Unicode
    // minus "−" — normalize it to ASCII so negative quotes don't flip positive)
    var vals = cells.map(function (c) {
      return parseFloat(c.textContent.replace(/[−–—]/g, "-").replace(/[^\-0-9.]/g, "")) || 0;
    });
    var seed = vals.slice();   // each quote drifts but is pulled back toward its starting value
    var hist = (poly ? (poly.getAttribute("points") || "").trim().split(/\s+/)
      .map(function (p) { return parseFloat(p.split(",")[1]); }).filter(function (v) { return !isNaN(v); }) : []);
    if (hist.length < 2) hist = [24, 18, 21, 12, 16, 8, 12, 5, 9, 3];
    function fmt(v) { return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + "%"; }
    function step() {
      for (var i = 0; i < cells.length; i++) {
        // gentle random walk + mean-reversion toward the seed so it never drifts off to the rails
        vals[i] = Math.max(-9, Math.min(9, vals[i] + (seed[i] - vals[i]) * 0.05 + (Math.random() - 0.5) * 0.4));
        var c = cells[i];
        c.textContent = fmt(vals[i]);
        c.classList.toggle("up", vals[i] >= 0);
        c.classList.toggle("down", vals[i] < 0);
        c.classList.remove("tick"); void c.offsetWidth; c.classList.add("tick");      // re-trigger flash
      }
      if (poly) {
        hist.push(Math.max(2, Math.min(28, hist[hist.length - 1] + (Math.random() - 0.5) * 6)));
        hist.shift();
        var n = hist.length, pts = hist.map(function (y, i) {
          return Math.round(i * (200 / (n - 1))) + "," + y.toFixed(0);
        }).join(" ");
        poly.setAttribute("points", pts);
      }
    }
    setInterval(step, 2600);
  }

  /* ---------- boot ---------- */
  startEKG();
  startHalEye();
  startBoot();
  startAmbient();
  startFullscreen();
  startHaptics();
  startTickers();
  loadWeather();
  setInterval(loadWeather, 15 * 60 * 1000);
})();
