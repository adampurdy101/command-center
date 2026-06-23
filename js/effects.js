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
    window.addEventListener("resize", refit);
    var BEATS = 1.7, RATE = 0.95;
    function frame(now) {
      var t = now / 1000;
      var beatPhase = (t * RATE) % 1;
      var flash = beatPhase < 0.06 ? 1 : 0.55;     // brighten on the R spike
      for (var ci = 0; ci < cans.length; ci++) {
        var c = cans[ci]; if (!c.ctx) { c.ctx = fitC(c.cv); if (!c.ctx) continue; }
        var ctx = c.ctx, w = c.cv.width / DPR, h = c.cv.height / DPR, mid = h * 0.56, amp = h * 0.42;
        ctx.save(); ctx.scale(DPR, DPR); ctx.clearRect(0, 0, w, h);
        ctx.lineWidth = 1.4; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(65,255,126," + flash + ")";
        ctx.shadowColor = "#41ff7e"; ctx.shadowBlur = 6 * flash;
        ctx.beginPath();
        for (var x = 0; x <= w; x++) {
          var u = (((x / w) * BEATS - t * RATE) % 1 + 1) % 1;
          var y = mid - ecg(u) * amp;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // leading blip at the right edge
        var ue = ((BEATS - t * RATE) % 1 + 1) % 1;
        var ye = mid - ecg(ue) * amp;
        ctx.shadowBlur = 8; ctx.fillStyle = "#d6ffe0";
        ctx.beginPath(); ctx.arc(w - 1, ye, 1.6, 0, 7); ctx.fill();
        ctx.restore();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ============================================================
     2 · HAL 9000 EYE  (idle pulse; flares while HAL speaks)
     ============================================================ */
  function startHalEye() {
    var eye = document.getElementById("hal-eye");
    if (!eye) return;
    function frame(now) {
      var t = now / 1000;
      var HAL = window.HAL || { speaking: false, level: 0 };
      var base = 0.55 + 0.18 * Math.sin(t * 1.6);           // calm breathing
      var lvl = HAL.speaking ? Math.max(base, 0.7 + 0.3 * (HAL.level || 0)) : base;
      eye.style.setProperty("--eye", lvl.toFixed(3));
      eye.classList.toggle("awake", !!HAL.speaking);
      requestAnimationFrame(frame);
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
      master.gain.setTargetAtTime(0.05, ac.currentTime, 1.2);
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
        beepTimer = setTimeout(blip, 3500 + Math.random() * 6000);
      }
      beepTimer = setTimeout(blip, 2500);
    }
    function set(v) {
      on = v; btn.classList.toggle("active", on);
      btn.textContent = on ? "♪ HUM ●" : "♪ HUM";
      try { localStorage.setItem("cc_ambient", on ? "1" : "0"); } catch (e) {}
      try {
        if (on) { if (!ac) build(); else { ac.resume(); nodes[0] && nodes[0].gain.setTargetAtTime(0.05, ac.currentTime, 1.0); } }
        else if (ac && nodes[0]) { nodes[0].gain.setTargetAtTime(0.0, ac.currentTime, 0.4); }
      } catch (e) {}
    }
    btn.addEventListener("click", function () { set(!on); });
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

  /* ============================================================
     6 · TILT PARALLAX  (cursor on desktop, device tilt on mobile)
     ============================================================ */
  function startParallax() {
    var hub = document.getElementById("hub");
    var globeWrap = document.querySelector("#hub .globe-wrap");
    if (!hub) return;
    var nx = 0, ny = 0, cx = 0, cy = 0;
    function apply() {
      cx += (nx - cx) * 0.08; cy += (ny - cy) * 0.08;
      if (window.__setGlobeTilt) window.__setGlobeTilt(cx * 16, cy * 12);
      if (globeWrap) globeWrap.style.transform =
        "perspective(900px) rotateY(" + (cx * 5).toFixed(2) + "deg) rotateX(" + (-cy * 5).toFixed(2) + "deg)";
      if (!coarse) {  // skip column shift on touch screens (avoids horizontal overflow)
        var cols = hub.querySelectorAll(".col");
        for (var i = 0; i < cols.length; i++)
          cols[i].style.transform = "translate3d(" + (-cx * 7).toFixed(1) + "px," + (-cy * 5).toFixed(1) + "px,0)";
      }
      requestAnimationFrame(apply);
    }
    requestAnimationFrame(apply);

    if (!coarse) {
      window.addEventListener("mousemove", function (e) {
        nx = (e.clientX / window.innerWidth) * 2 - 1;
        ny = (e.clientY / window.innerHeight) * 2 - 1;
      });
    } else {
      function onTilt(e) {
        var g = e.gamma || 0, b = e.beta || 0;            // gamma: L/R, beta: F/B
        nx = Math.max(-1, Math.min(1, g / 35));
        ny = Math.max(-1, Math.min(1, (b - 45) / 35));
      }
      function enable() {
        if (typeof DeviceOrientationEvent !== "undefined" &&
            typeof DeviceOrientationEvent.requestPermission === "function") {
          DeviceOrientationEvent.requestPermission().then(function (s) {
            if (s === "granted") window.addEventListener("deviceorientation", onTilt);
          }).catch(function () {});
        } else {
          window.addEventListener("deviceorientation", onTilt);
        }
        window.removeEventListener("pointerdown", enable);
      }
      window.addEventListener("pointerdown", enable, { once: true });
    }
  }

  /* ============================================================
     7 · FULLSCREEN  (enter + explicit exit; graceful fallback)
     ============================================================ */
  function startFullscreen() {
    var enter = document.getElementById("fs-btn"), exit = document.getElementById("fs-exit");
    var root = document.documentElement;
    var canFS = !!(root.requestFullscreen || root.webkitRequestFullscreen);
    function inFS() { return document.fullscreenElement || document.webkitFullscreenElement; }
    function sync() {
      var f = inFS();
      if (enter) enter.style.display = (!canFS || f) ? "none" : "";
      if (exit) exit.style.display = (canFS && f) ? "" : "none";
    }
    if (!canFS) {
      // iPhone Safari has no Fullscreen API — hide both; install-to-home-screen gives full screen
      if (enter) enter.style.display = "none";
      if (exit) exit.style.display = "none";
      return;
    }
    if (enter) enter.addEventListener("click", function () {
      try { (root.requestFullscreen || root.webkitRequestFullscreen).call(root); } catch (e) {}
    });
    if (exit) exit.addEventListener("click", function () {
      try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {}
    });
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

  /* ---------- boot ---------- */
  startEKG();
  startHalEye();
  startBoot();
  startAmbient();
  startParallax();
  startFullscreen();
  startHaptics();
  loadWeather();
  setInterval(loadWeather, 15 * 60 * 1000);
})();
