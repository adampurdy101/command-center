/* ============================================================
   EFFECTS  ·  visual flourishes for the Mission Control hub
   ------------------------------------------------------------
   1. Heartbeat / EKG trace (system-online pulse) — all .ekg canvases
   2. HAL 9000 eye — pulses, flares when HAL speaks
   3. Boot / power-on splash (also kills the white launch flash)
   4. Ambient sci-fi hum + beeps (toggle + volume) — the original low three-note murmur
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
    var ekgLast = 0, ekgPrev = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      if (document.hidden || window.CC_GAME_OPEN || window.CC_DECK_OPEN) return; // pause when hidden / game / globe deck
      if (now - ekgLast < 33) return; ekgLast = now; // ~30fps (sweep takes ~3.3s anyway)
      var t = now / 1000;
      var phase = (t % T) / T;                    // 0..1 sweep position (stationary trace)
      var sweepX = phase;
      // the R-wave is the board's heartbeat: the SYSTEM ONLINE lamp kicks for 90 ms on each beat
      if (ekgPrev > phase) ekgPrev = -1;
      if (ekgPrev < 0.33 && phase >= 0.33) {
        var ml = document.querySelector("#hub .master .led");
        if (ml) { ml.classList.add("beat"); setTimeout(function () { ml.classList.remove("beat"); }, 90); }
      }
      ekgPrev = phase;
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
      if (document.hidden || window.CC_GAME_OPEN || window.CC_DECK_OPEN) return; // pause when hidden / game / globe deck
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
    // pages without the splash (studio) are "booted" at once; the hub's power-on stagger
    // (js/cinema.js) waits for this flag / event so it plays AFTER the curtain, not under it
    if (!boot) { window.CC_BOOT_DONE = true; return; }
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
      else setTimeout(function () {
        boot.classList.add("gone");
        window.CC_BOOT_DONE = true;
        try { document.dispatchEvent(new CustomEvent("boot:done")); } catch (e) {}
        setTimeout(function(){ if(boot.parentNode) boot.parentNode.removeChild(boot); }, 700);
      }, 360);
    }
    setTimeout(next, 260);
    // (the green flash now fires with the power-on stagger in js/cinema.js, after the curtain)
  }

  /* ============================================================
     4 · AMBIENT HUM + BEEPS  (toggle + volume)
     ------------------------------------------------------------
     THE SOUND IS THE ORIGINAL (2026-06-23) and stays that way by Adam's request:
     three pure sines at 55 / 82.4 / 110 Hz (A1 · E2 · A2), a slow shimmer, an
     occasional soft blip. He wants the LOW background murmur — do not re-voice it.
     (A 2026-09-04 attempt to make it "phone-speaker friendly" with higher
     harmonics was rejected as too high and overpowering and reverted.)
     What changed on 2026-09-04 and stays:
       · volume ceiling ×4: gain = vol² × 0.8, so the MIDDLE of the slider is the old
         maximum (0.2) and the top is 0.8 (peaks ≈0.85, never clips)
       · iPhone rules: the AudioContext is created / resumed only inside real
         activation events (touchend / pointerup / click — NOT pointerdown, which is
         not an activation on touch) and re-resumed after iOS interruptions; a
         looping silent <audio> nudges the audio session on Apple touch devices
       · the button shows ◌ while armed-but-blocked and ● once sound really flows
       · the volume flyout opens on tap where there is no hover, clamped on screen
     Physics note: 55–110 Hz is below what an iPhone speaker (and mostly a MacBook
     speaker) can reproduce, so on those it stays faint however high the slider goes;
     headphones / desk speakers get the full deep hum. Adam knows and chose pure+low.
     ============================================================ */
  function silentWavURI(sr) {
    sr = sr || 48000;
    var n = Math.floor(sr * 0.1), buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
    function wr(o, s) { for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); }
    wr(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); wr(8, "WAVE"); wr(12, "fmt "); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); wr(36, "data"); dv.setUint32(40, n * 2, true);
    var u8 = new Uint8Array(buf), bin = ""; for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return "data:audio/wav;base64," + btoa(bin);
  }
  function startAmbient() {
    var btn = document.getElementById("amb-btn");
    if (!btn) return;
    var wrap = (btn.parentNode && btn.parentNode.classList && btn.parentNode.classList.contains("amb-wrap")) ? btn.parentNode : null;
    var pop = wrap ? wrap.querySelector(".amb-pop") : null;
    var slider = document.getElementById("amb-vol");
    var isApple = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var ac = null, master = null, on = false, beepTimer = null, silentEl = null, popTimer = null;

    // volume 0..1 (persisted). The curve changed on 2026-09-04 (ceiling ×4), so a value stored
    // under an older curve is reset ONCE (cc_ambient_v = "3") to the middle = the old maximum.
    var vol = 0.5;
    try {
      if (localStorage.getItem("cc_ambient_v") === "3") {
        var sv = parseFloat(localStorage.getItem("cc_ambient_vol")); if (!isNaN(sv)) vol = Math.max(0, Math.min(1, sv));
      } else { localStorage.setItem("cc_ambient_v", "3"); localStorage.setItem("cc_ambient_vol", String(vol)); }
    } catch (e) {}
    function gainFor() { return vol * vol * 0.8; }   // 0.5 -> 0.2 (the old max), 1.0 -> 0.8 (4x); sines sum to 1.04 so it never clips

    function build() {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.0; master.connect(ac.destination);
      // the original voice: three pure sines, A1 · E2 · A2 — the low murmur
      [55, 82.4, 110].forEach(function (f, idx) {
        var o = ac.createOscillator(); o.type = "sine"; o.frequency.value = f;
        var g = ac.createGain(); g.gain.value = idx === 0 ? 0.6 : 0.22;
        o.connect(g); g.connect(master); o.start();
      });
      // slow shimmer LFO on the master
      var lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
      var lg = ac.createGain(); lg.gain.value = 0.012;
      lfo.connect(lg); lg.connect(master.gain); lfo.start();
      master.gain.setTargetAtTime(gainFor(), ac.currentTime, 1.2);
      // an occasional soft console blip (~20–40 s apart) — through the master so the slider owns it too
      function blip() {
        if (!on) return;
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = 880 + Math.random() * 600;
        g.gain.value = 0.0; o.connect(g); g.connect(master);
        var n = ac.currentTime; g.gain.setValueAtTime(0.0, n);
        g.gain.linearRampToValueAtTime(0.15, n + 0.02);         // = the old fixed 0.03 at the middle of the slider, scales with it
        g.gain.exponentialRampToValueAtTime(0.0001, n + 0.18);
        o.start(n); o.stop(n + 0.2);
        beepTimer = setTimeout(blip, 20000 + Math.random() * 20000);
      }
      beepTimer = setTimeout(blip, 9000);

      ac.onstatechange = function () {
        // iOS parks the context ("interrupted" / "suspended") after a call, Siri or backgrounding
        if (on && ac.state !== "running") { try { var p = ac.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
        label();
      };
    }
    function ensureCtx() {
      if (!ac) build();
      if (ac.state !== "running") { try { var p = ac.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
    }
    function live() { return on && !!ac && ac.state === "running"; }
    function label() {
      var l = live();
      btn.textContent = !on ? "♪ HUM" : (l ? "♪ HUM ●" : "♪ HUM ◌");
      btn.classList.toggle("active", on);
      btn.classList.toggle("armed", on && !l);
      btn.title = on
        ? ("Ambient hum " + (l ? "on" : "armed — tap once to start") + " · volume " + Math.round(vol * 100) + "% — " + (coarse ? "tap for the volume slider" : "hover for volume"))
        : ("Ambient sound — " + (coarse ? "tap to turn on" : "click to turn on, hover for volume"));
      var hint = pop ? pop.querySelector(".amb-hint") : null;
      if (hint) hint.textContent = (on && !l) ? "TAP ANYWHERE TO START" : "IF SILENT: FLIP THE RING SWITCH";
    }
    // iOS: a looping silent <audio> keeps the audio session in "playback" so the ring/silent
    // switch is less likely to mute Web Audio. Harmless elsewhere, so only Apple touch devices run it.
    function nudgeSession() {
      if (!isApple) return;
      try {
        if (!silentEl) {
          silentEl = document.createElement("audio");
          silentEl.loop = true; silentEl.preload = "auto";
          silentEl.setAttribute("playsinline", ""); silentEl.setAttribute("webkit-playsinline", "");
          silentEl.src = silentWavURI(ac ? ac.sampleRate : 48000);
        }
        var p = silentEl.play(); if (p && p.catch) p.catch(function () {});
      } catch (e) {}
    }
    function set(v) {
      on = v;
      try { localStorage.setItem("cc_ambient", on ? "1" : "0"); } catch (e) {}
      try {
        if (on) {
          ensureCtx();
          master.gain.cancelScheduledValues(ac.currentTime);
          master.gain.setTargetAtTime(gainFor(), ac.currentTime, 1.0);
          nudgeSession();
        } else if (ac && master) {
          master.gain.cancelScheduledValues(ac.currentTime);
          master.gain.setTargetAtTime(0.0, ac.currentTime, 0.4);
          if (silentEl) { try { silentEl.pause(); } catch (e) {} }
        }
      } catch (e) {}
      label();
    }

    /* the volume flyout: hover on desktop (css), tap-to-open on touch (this .open class) */
    function place() {   // nudge the flyout back inside the viewport (the button sits at an edge on narrow layouts)
      if (!pop || !wrap) return;
      // measured from the (untransformed) wrap + the flyout's layout width, so the flyout's own
      // slide transition can never feed a stale position back into the maths
      var wr = wrap.getBoundingClientRect(), pw = pop.offsetWidth, vw = window.innerWidth, pad = 8;
      var left = wr.left + wr.width / 2 - pw / 2, right = left + pw, dx = 0;
      if (pw && left < pad) dx = pad - left; else if (pw && right > vw - pad) dx = (vw - pad) - right;
      pop.style.setProperty("--amb-dx", Math.round(dx) + "px");
    }
    function openPop(ms) { if (!wrap) return; place(); wrap.classList.add("open"); clearTimeout(popTimer); if (ms) popTimer = setTimeout(closePop, ms); }
    // no hover available (phone / tablet finger) -> the flyout opens on tap; checked live, not cached at load
    function noHover() { try { return window.matchMedia("(hover: none)").matches || window.matchMedia("(pointer: coarse)").matches; } catch (e) { return coarse; } }
    if (wrap) wrap.addEventListener("pointerenter", place);
    function closePop() { if (!wrap) return; clearTimeout(popTimer); wrap.classList.remove("open"); }
    if (pop && isApple && !pop.querySelector(".amb-hint")) {
      var h = document.createElement("span"); h.className = "amb-hint"; h.textContent = "IF SILENT: FLIP THE RING SWITCH"; pop.appendChild(h);
    }
    btn.addEventListener("click", function () {
      // armed but blocked by the autoplay policy? this click IS the activation — start, don't toggle off
      if (on && !live()) set(true); else set(!on);
      if (noHover()) { if (on) openPop(6000); else closePop(); }
    });
    if (slider) {
      slider.value = vol;
      var apply = function () {
        vol = Math.max(0, Math.min(1, parseFloat(slider.value) || 0));
        try { localStorage.setItem("cc_ambient_vol", String(vol)); } catch (e) {}
        if (!on) set(true);                                   // moving the volume is asking to hear it
        else if (ac && master) { master.gain.cancelScheduledValues(ac.currentTime); master.gain.setTargetAtTime(gainFor(), ac.currentTime, 0.08); }
        label();
        openPop(noHover() ? 6000 : 0);                        // hold the flyout open while adjusting
      };
      slider.addEventListener("input", apply);
      slider.addEventListener("change", function () { apply(); if (!noHover()) popTimer = setTimeout(closePop, 1200); });
      slider.addEventListener("pointerdown", function () { openPop(0); });
      slider.addEventListener("pointerup", function () { popTimer = setTimeout(closePop, noHover() ? 6000 : 1200); });
    }
    document.addEventListener("pointerdown", function (e) {
      if (wrap && wrap.classList.contains("open") && !wrap.contains(e.target)) closePop();
    }, true);

    /* keep it flowing: after iOS interruptions the next tap resumes it; coming back to the tab re-arms it */
    ["touchend", "click", "keydown"].forEach(function (ev) {
      window.addEventListener(ev, function () { if (on && ac && ac.state !== "running") { ensureCtx(); nudgeSession(); } }, { passive: true });
    });
    function onShow() { if (on && ac) { ensureCtx(); nudgeSession(); label(); } }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { if (silentEl) { try { silentEl.pause(); } catch (e) {} } }
      else onShow();
    });
    window.addEventListener("pageshow", onShow);

    /* remembered ON from last time: show it armed (◌) and start on the first real activation.
       touchend / pointerup / click all count as activations; pointerdown on touch does NOT (that was
       the old bug: the context was born suspended on iPhone and stayed silent). */
    try {
      if (localStorage.getItem("cc_ambient") === "1") {
        on = true; label();
        var evs = ["pointerup", "touchend", "click"];
        var arm = function (e) {
          if (wrap && e && wrap.contains(e.target)) return;   // the HUM control handles itself
          evs.forEach(function (ev) { window.removeEventListener(ev, arm, true); });
          set(true);
        };
        evs.forEach(function (ev) { window.addEventListener(ev, arm, true); });
      }
    } catch (e) {}

    // tiny read-only hook for testing / Hal ("is the hum on?")
    window.CC_AMBIENT = { isOn: function () { return on; }, isLive: live, volume: function () { return vol; }, ctxState: function () { return ac ? ac.state : "none"; } };
  }

  /* Live weather moved to js/weather.js — the richer globe weather station
     (sun times, feels-like, humidity, wind, UV, AQI, moon, Pattaya clock). */

  /* (cursor/device parallax removed by request — the globe and panels stay put) */

  /* ============================================================
     7 · FULLSCREEN  (enter + explicit exit; graceful fallback)
     ============================================================ */
  function startFullscreen() {
    var enter = document.getElementById("fs-btn");
    if (!enter) return;
    var root = document.documentElement;
    var canFS = !!(root.requestFullscreen || root.webkitRequestFullscreen);
    function inFS() { return document.fullscreenElement || document.webkitFullscreenElement; }
    function doEnter() { try { (root.requestFullscreen || root.webkitRequestFullscreen).call(root); } catch (e) {} }
    function doExit() { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} }

    function sync() {
      var f = !!inFS();
      // ONE in-bar button: it flips to a lit-green ⤡ EXIT FULLSCREEN while fullscreen
      enter.textContent = f ? "⤡ EXIT FULLSCREEN" : "⤢ FULLSCREEN";
      enter.title = f ? "Click to exit fullscreen" : "Enter fullscreen";
      enter.classList.toggle("fs-on", f);
    }
    if (!canFS) {
      // iPhone Safari has no Fullscreen API — hide the button; install-to-home-screen gives full screen
      enter.style.display = "none";
      return;
    }
    enter.addEventListener("click", function () { inFS() ? doExit() : doEnter(); });
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
    ["talkBtn", "fs-btn", "amb-btn", "voiceCfgBtn", "stopBtn", "sniperBtn", "deck-btn"].forEach(function (id) {
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
    var cells = [].slice.call(mk.querySelectorAll(".bd .v"));
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
    setInterval(step, 13320);   // once every four heartbeats — demo data should not compete with real money
  }

  /* ---------- boot ---------- */
  startEKG();
  startHalEye();
  startBoot();
  startAmbient();
  startFullscreen();
  startHaptics();
  startTickers();
  /* weather station is owned by js/weather.js */
})();
