/* =============================================================================
   DEEP SCOPE // OVERWATCH  —  js/sniper.js
   A green-phosphor CRT sniper-scope shooter for the ADAM // COMMAND CENTER hub.

   Public interface (drops into the hub):
     window.SniperGame = { open, close, mountPreview, isOpen }

   Plain HTML/CSS/JS. No frameworks, no libraries. Everything drawn on <canvas>.
   ============================================================================= */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * PALETTE — match the dashboard's green-phosphor CRT look
   * ------------------------------------------------------------------ */
  var C = {
    green:  '#41ff7e',
    hi:     '#7dffb0',
    dim:    '#2bd964',
    faint:  '#1c8f46',
    amber:  '#ffd24a',
    red:    '#ff6b5a',
    cyan:   '#7df7ff',
    ink:    '#06100a',
    ink2:   '#0a1409'
  };
  var FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  /* ------------------------------------------------------------------ *
   * Small numeric helpers (all guard against NaN where it matters)
   * ------------------------------------------------------------------ */
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randi(a, b) { return (a + Math.random() * (b - a + 1)) | 0; }
  function fin(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : (d || 0); }
  function ease(t) { return t < 0 ? 0 : (t > 1 ? 1 : t * t * (3 - 2 * t)); }

  /* A tiny deterministic value-noise for ridgelines (stable per-seed shape). */
  function hash1(n) {
    var s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  }
  function vnoise(x, seed) {
    var i = Math.floor(x), f = x - i;
    var a = hash1(i + seed * 57.0), b = hash1(i + 1 + seed * 57.0);
    var u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  }
  function ridgeHeight(x, seed, oct) {
    if (!isFinite(x)) x = 0;
    var amp = 1, freq = 1, sum = 0, norm = 0;
    for (var o = 0; o < (oct || 4); o++) {
      sum += vnoise(x * freq, seed + o) * amp;
      norm += amp; amp *= 0.5; freq *= 2.0;
    }
    return norm > 0 ? sum / norm : 0;
  }

  /* ==================================================================== *
   * WEB AUDIO — all SFX synthesized, no assets.
   * ==================================================================== */
  var Audio2 = (function () {
    var ctx = null, master = null, enabled = true;
    function ensure() {
      if (ctx) return ctx;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { enabled = false; return null; }
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      } catch (e) { enabled = false; ctx = null; }
      return ctx;
    }
    function resume() { var c = ensure(); if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} } }

    // Filtered noise burst (used for cracks, explosions, mechanical chatter).
    function noise(dur, vol, type, freq, q, decay) {
      var c = ensure(); if (!c || !enabled) return;
      var n = Math.max(1, Math.floor(c.sampleRate * dur));
      var buf = c.createBuffer(1, n, c.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1);
      var src = c.createBufferSource(); src.buffer = buf;
      var flt = c.createBiquadFilter();
      flt.type = type || 'bandpass';
      flt.frequency.value = freq || 1200;
      flt.Q.value = q || 1;
      var g = c.createGain();
      var t = c.currentTime;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + (decay || dur));
      src.connect(flt); flt.connect(g); g.connect(master);
      src.start(t); src.stop(t + dur + 0.02);
    }
    function tone(f0, f1, dur, vol, type) {
      var c = ensure(); if (!c || !enabled) return;
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sawtooth';
      var t = c.currentTime;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    }

    return {
      resume: resume,
      setEnabled: function (b) { enabled = b; },
      isEnabled: function () { return enabled; },
      // Gun shots ----------------------------------------------------
      rifle: function () {
        tone(420, 90, 0.10, 0.32, 'square');
        noise(0.12, 0.5, 'bandpass', 1700, 0.7, 0.10);
        noise(0.05, 0.3, 'highpass', 3200, 0.5, 0.05);
      },
      mg: function () {
        tone(300, 120, 0.05, 0.22, 'square');
        noise(0.06, 0.34, 'bandpass', 1300, 0.8, 0.05);
      },
      minigun: function () {
        tone(180, 120, 0.035, 0.16, 'sawtooth');
        noise(0.04, 0.26, 'bandpass', 950, 1.1, 0.04);
      },
      spinup: function () { tone(120, 540, 0.5, 0.18, 'sawtooth'); },
      // Feedback -----------------------------------------------------
      ping: function () { tone(1600, 2200, 0.08, 0.22, 'sine'); },
      headshot: function () { tone(2200, 900, 0.16, 0.26, 'triangle'); },
      explosion: function () {
        tone(140, 30, 0.7, 0.5, 'sawtooth');
        noise(0.8, 0.6, 'lowpass', 700, 0.6, 0.7);
        noise(0.4, 0.4, 'bandpass', 240, 0.7, 0.4);
      },
      reload: function () { noise(0.05, 0.3, 'bandpass', 800, 2, 0.05); setTimeout(function () { noise(0.05, 0.3, 'bandpass', 1100, 2, 0.05); }, 130); },
      empty: function () { noise(0.04, 0.2, 'highpass', 2600, 1, 0.04); },
      overheat: function () { tone(700, 200, 0.4, 0.3, 'square'); noise(0.4, 0.3, 'lowpass', 1800, 0.6, 0.4); },
      wave: function () { tone(440, 660, 0.18, 0.2, 'sine'); setTimeout(function () { tone(660, 880, 0.2, 0.2, 'sine'); }, 150); }
    };
  })();

  /* ==================================================================== *
   * GUN DEFINITIONS — each feels distinct.
   * ==================================================================== */
  var GUNS = {
    rifle: {
      key: 'rifle', name: 'ASSAULT', label: '1 ASSAULT',
      mag: 18, reload: 1.6, fireDelay: 0.16, burst: 3, burstGap: 0.07,
      spread: 0.0016, recoil: 0.9, swayMul: 0.85, damage: 3,
      tracer: 'single', flash: 1.0, heatPerShot: 0, auto: false,
      sound: function () { Audio2.rifle(); }
    },
    mg: {
      key: 'mg', name: 'MACHINE GUN', label: '2 MG',
      mag: 60, reload: 2.3, fireDelay: 0.075, burst: 0, burstGap: 0,
      spread: 0.0085, recoil: 0.55, swayMul: 1.25, damage: 2,
      tracer: 'double', flash: 1.4, heatPerShot: 0.013, auto: true,
      sound: function () { Audio2.mg(); }
    },
    minigun: {
      key: 'minigun', name: 'MINIGUN', label: '3 MINIGUN',
      mag: Infinity, reload: 0, fireDelay: 0.028, burst: 0, burstGap: 0,
      spread: 0.011, recoil: 0.32, swayMul: 1.5, damage: 2,
      tracer: 'beam', flash: 2.0, heatPerShot: 0.018, spinup: 0.5, auto: true,
      sound: function () { Audio2.minigun(); }
    }
  };

  /* ==================================================================== *
   * THEMES — three renditions of the same game. VARIANT switches them.
   * ==================================================================== */
  var VARIANT = 'recon';
  var THEMES = {
    recon: {
      key: 'recon', name: 'MIDNIGHT RECON', sub: 'THE CLASSIC · PERFECTED',
      sky: ['#02100a', '#05160e', '#0a2214', '#10301c'],
      ridge: null, haze: '#06160d',
      moon: { r: 0.09, body: '#0e2f1b', glow: 'rgba(120,255,176,0.17)', rim: '#7dffb0', crater: 'rgba(65,255,126,0.18)' },
      aurora: true, fireflies: true, rain: 0, lightning: false, embers: false, clouds: 0.35,
      rimLo: '#1c8f46', rimHi: '#2bd964', grass: true,
      ring: '#9fffc4', dirtA: 'rgba(4,20,11,0.6)', dirtB: 'rgba(90,210,130,0.10)',
      lit: '46,140,76', shade: '2,16,9', veg: 'pine',
      spawnMul: 1, scoreMul: 1
    },
    storm: {
      key: 'storm', name: 'THUNDERHEAD', sub: 'RAIN · LIGHTNING · GUSTS',
      sky: ['#040c11', '#061119', '#0a1c1c', '#0d2418'],
      ridge: ['#0b2a22', '#082018', '#061a12', '#04120c', '#030d09'], haze: '#061418',
      moon: { r: 0.07, body: '#12242c', glow: 'rgba(150,225,255,0.12)', rim: '#a8e2f0', crater: 'rgba(150,225,255,0.14)' },
      aurora: false, fireflies: false, rain: 1, lightning: true, embers: false, clouds: 1,
      rimLo: '#1c8f46', rimHi: '#59e8c8', grass: true,
      ring: '#a8e2f0', dirtA: 'rgba(3,16,14,0.6)', dirtB: 'rgba(130,220,220,0.09)',
      lit: '38,120,104', shade: '2,14,12', veg: 'bare',
      spawnMul: 1.1, scoreMul: 1.15
    },
    blood: {
      key: 'blood', name: 'BLOOD MOON', sub: 'SIEGE NIGHT · FEVER SCORING',
      sky: ['#130506', '#1c0a07', '#2a1208', '#1c140a'],
      ridge: ['#2c120d', '#220d0a', '#180907', '#100504', '#0a0302'], haze: '#160a07',
      moon: { r: 0.12, body: '#3a0f08', glow: 'rgba(255,92,50,0.22)', rim: '#ff9a6a', crater: 'rgba(255,120,70,0.2)' },
      aurora: false, fireflies: false, rain: 0, lightning: false, embers: true, clouds: 0.2,
      rimLo: '#8a3a24', rimHi: '#ff9a6a', grass: true,
      ring: '#ffca8a', dirtA: 'rgba(14,4,2,0.65)', dirtB: 'rgba(255,150,90,0.13)',
      lit: '150,66,30', shade: '10,2,1', veg: 'snag',
      spawnMul: 1.25, scoreMul: 1.3
    }
  };
  function TH() { return THEMES[VARIANT] || THEMES.recon; }
  window.__snipVariant = function (v) { if (THEMES[v]) VARIANT = v; return VARIANT; };

  /* ==================================================================== *
   * GAME — encapsulates one playable instance (the fullscreen overlay).
   * ==================================================================== */
  function Game() {
    var self = this;

    /* ----- DOM ----- */
    this.overlay = null;
    this.canvas = null;
    this.ctx = null;
    this.built = false;
    this.running = false;
    this.rafId = 0;
    this.lastT = 0;

    /* ----- viewport ----- */
    this.W = 800; this.H = 450; this.dpr = 1;
    this.cx = 400; this.cy = 225; this.lensR = 200;

    /* ----- aim (reticle slews over a FIXED scene) ----- */
    this.camX = 0; this.camY = 0;       // kept at 0 — the background is a fixed backdrop
    this.aimX = 400; this.aimY = 225;   // reticle position (set to scene center in fit/reset)
    this.panVX = 0; this.panVY = 0;     // keyboard-driven aim velocity input
    this.zoom = 6.0; this.zoomTarget = 6.0;

    /* ----- scope motion ----- */
    this.swayT = 0;
    this.recoil = 0;     // decays each frame
    this.vibe = 0;       // minigun vibration
    this.shake = 0;      // screen shake from explosions
    this.flash = 0;      // muzzle flash level
    this.hitMarker = 0;  // reticle hit flash

    /* ----- gun state ----- */
    this.gun = GUNS.rifle;
    this.ammo = GUNS.rifle.mag;
    this.heat = 0;
    this.overheated = false;
    this.spin = 0;          // minigun spin 0..1
    this.barrelAngle = 0;
    this.firing = false;
    this.fireCooldown = 0;
    this.reloading = 0;     // seconds remaining
    this.burstLeft = 0;
    this.burstTimer = 0;

    /* ----- progression ----- */
    this.score = 0;
    this.wave = 0;
    this.kills = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.bestCombo = 0;

    /* ----- FOCUS (bullet-time) ----- */
    this.focus = 0;          // charge 0..1, fills with kills
    this.focusActive = false;
    this.focusT = 0;         // seconds remaining in current activation
    this.focusDur = 0;       // total seconds this activation
    this.focusFlash = 0;     // activation white-out flash

    /* ----- callout (DOUBLE / TRIPLE KILL banners) ----- */
    this.callout = null;     // { text, t, life }
    this.rings = [];         // expanding shockwave rings (screen space)

    this.waveBanner = 0;
    this.waveBannerText = '';
    this.spawnTimer = 1.2;
    this.waveTimer = 0;
    this.killsThisWave = 0;
    this.killsNeeded = 8;

    /* ----- entities ----- */
    this.agents = [];
    this.tracers = [];
    this.particles = [];
    this.debris = [];
    this.popups = [];     // floating "+pts" text
    this.feed = [];       // kill marker feed
    this.blooms = [];      // explosion radial washes

    /* ----- terrain ----- */
    this.layers = [];     // parallax ridgeline definitions
    this.buildTerrain();

    /* ----- controls runtime ----- */
    this.fireBtn = { active: false, id: -1, x: 0, y: 0, r: 0 };
    this.zoomSlider = { dragging: false, id: -1, x: 0, y: 0, w: 0, h: 0 };
    this.pinch = { active: false, ids: [], startDist: 0, startZoom: 0 };
    this.activePointers = {};
    this.uiHotspots = [];   // {kind, x, y, w, h, action}

    /* ----- preview (attract) ----- */
    this.previewRAF = 0;
    this.previewCanvas = null;
    this.previewCtx = null;
    this.previewT = 0;

    /* bound handlers (stable refs for add/removeEventListener) */
    this._onResize = function () { self.fit(); };
    this._onKey = function (e) { self.onKey(e); };
    this._onWheel = function (e) { self.onWheel(e); };
  }

  /* ------------------------------------------------------------------ *
   * TERRAIN — 4 parallax ridge layers receding into haze.
   * ------------------------------------------------------------------ */
  Game.prototype.buildTerrain = function () {
    this.layers = [
      { seed: 11, parallax: 0.18, baseY: 0.50, amp: 0.10, oct: 5, color: '#0c2e1c', hazeAlpha: 0.55, sky: true },
      { seed: 23, parallax: 0.34, baseY: 0.58, amp: 0.15, oct: 5, color: '#11422a', hazeAlpha: 0.40 },
      { seed: 37, parallax: 0.58, baseY: 0.66, amp: 0.20, oct: 4, color: '#155836', hazeAlpha: 0.22 },
      { seed: 53, parallax: 1.00, baseY: 0.78, amp: 0.30, oct: 4, color: '#0c3a22', hazeAlpha: 0.05, ground: true }
    ];
    // The 3rd layer (index 2) is the "play ridge" agents pop from.
    this.playLayer = 2;
  };

  /* Returns the screen Y of a ridge layer at world-screen X position. */
  Game.prototype.ridgeY = function (layer, screenX) {
    var L = this.layers[layer];
    if (!L) return this.H;
    var z = fin(this.zoom, 6);
    if (z < 0.5) z = 0.5; // never divide by ~0
    // world coordinate sampled by camera + screen position, scaled by parallax & zoom
    var wx = (fin(this.camX, 0) * L.parallax) + (fin(screenX, 0) - this.cx) / (z * 18);
    var h = ridgeHeight(wx * 0.06 + 100, L.seed, L.oct);
    var baseY = this.cy + (L.baseY - 0.5) * this.H * 0.9;
    var amp = L.amp * this.H * (0.6 + z * 0.05);
    var y = baseY - h * amp + fin(this.camY, 0) * (0.7 + L.parallax * 0.3);   // vertical pan moves the world (near layers move most)
    return fin(y, this.H);
  };

  /* ------------------------------------------------------------------ *
   * BUILD the fullscreen overlay + controls (once).
   * ------------------------------------------------------------------ */
  Game.prototype.build = function () {
    if (this.built) return;
    var self = this;

    var ov = document.createElement('div');
    ov.id = 'sniper-overlay';
    ov.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'background:radial-gradient(120% 120% at 50% 45%, #08140d 0%, #050b07 60%, #02060300 100%), #03070500',
      'background-color:#040a07',
      'overflow:hidden', 'touch-action:none', '-webkit-user-select:none', 'user-select:none',
      'font-family:' + FONT, 'display:none', 'cursor:crosshair'
    ].join(';');

    var cv = document.createElement('canvas');
    cv.id = 'sniper-canvas';
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    ov.appendChild(cv);

    // EXIT button (top-right, always visible)
    var exit = document.createElement('button');
    exit.textContent = '✕ EXIT';
    exit.style.cssText = [
      'position:absolute', 'top:12px', 'right:14px', 'z-index:60',
      'background:rgba(8,20,13,0.7)', 'color:' + C.green,
      'border:1px solid ' + C.faint, 'border-radius:8px',
      'font:600 13px/1 ' + FONT, 'letter-spacing:1px',
      'padding:9px 14px', 'cursor:pointer', 'backdrop-filter:blur(4px)'
    ].join(';');
    exit.addEventListener('click', function (e) { e.preventDefault(); self.close(); });
    ov.appendChild(exit);

    // SOUND toggle (top-left small)
    var snd = document.createElement('button');
    snd.textContent = '♪ SND';
    snd.style.cssText = [
      'position:absolute', 'top:12px', 'left:14px', 'z-index:5',
      'background:rgba(8,20,13,0.7)', 'color:' + C.dim,
      'border:1px solid ' + C.faint, 'border-radius:8px',
      'font:600 12px/1 ' + FONT, 'letter-spacing:1px',
      'padding:9px 12px', 'cursor:pointer', 'backdrop-filter:blur(4px)'
    ].join(';');
    snd.addEventListener('click', function (e) {
      e.preventDefault();
      var on = !Audio2.isEnabled();
      Audio2.setEnabled(on);
      snd.style.color = on ? C.dim : '#5a6b60';
      snd.textContent = on ? '♪ SND' : '✕ SND';
    });
    ov.appendChild(snd);

    // Keyframes for the rotate-gate phone animation (injected once)
    if (!document.getElementById('sn-rotate-style')) {
      var st = document.createElement('style');
      st.id = 'sn-rotate-style';
      st.textContent = '@keyframes snTilt{0%,28%{transform:rotate(0deg)}58%,100%{transform:rotate(-90deg)}}';
      document.head.appendChild(st);
    }

    // ROTATE-TO-LANDSCAPE gate — covers the game on portrait touch devices
    var gate = document.createElement('div');
    gate.id = 'sniper-rotate-gate';
    gate.style.cssText = [
      'position:absolute', 'inset:0', 'z-index:40', 'display:none',
      'flex-direction:column', 'align-items:center', 'justify-content:center',
      'background:radial-gradient(120% 120% at 50% 50%, #08160e 0%, #040b07 70%, #02060380 100%), #040a07',
      'color:' + C.green, 'text-align:center', 'font-family:' + FONT,
      'touch-action:none', '-webkit-user-select:none', 'user-select:none'
    ].join(';');
    gate.innerHTML =
      '<div style="width:48px;height:80px;border:3px solid ' + C.green + ';border-radius:9px;box-shadow:0 0 16px rgba(65,255,126,.55);animation:snTilt 2.2s ease-in-out infinite"></div>'
      + '<div style="font:700 22px ' + FONT + ';letter-spacing:3px;margin-top:28px;text-shadow:0 0 12px ' + C.green + '">ROTATE TO LANDSCAPE</div>'
      + '<div style="font:500 13px ' + FONT + ';letter-spacing:1px;color:' + C.dim + ';margin-top:10px;max-width:78%">DEEP SCOPE deploys in landscape — turn your device sideways</div>';
    ov.appendChild(gate);
    this.rotateGate = gate;
    this.portraitBlocked = false;

    document.body.appendChild(ov);

    this.overlay = ov;
    this.canvas = cv;
    this.ctx = cv.getContext('2d', { alpha: true });
    this.built = true;

    // Pointer events on the canvas drive ALL touch controls.
    cv.addEventListener('pointerdown', function (e) { self.onPointerDown(e); });
    cv.addEventListener('pointermove', function (e) { self.onPointerMove(e); });
    cv.addEventListener('pointerup', function (e) { self.onPointerUp(e); });
    cv.addEventListener('pointercancel', function (e) { self.onPointerUp(e); });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    this.fit();
  };

  /* ------------------------------------------------------------------ *
   * FIT — handle DPR + resize, recompute geometry & control rects.
   * ------------------------------------------------------------------ */
  Game.prototype.fit = function () {
    if (!this.canvas || !this.ctx) return;
    var rect = this.canvas.getBoundingClientRect();
    var rw = rect && isFinite(rect.width) ? rect.width : 0;
    var rh = rect && isFinite(rect.height) ? rect.height : 0;
    var W = Math.max(40, Math.floor(rw || window.innerWidth || 800));
    var H = Math.max(40, Math.floor(rh || window.innerHeight || 450));
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!isFinite(dpr) || dpr <= 0) dpr = 1;
    this.W = W; this.H = H; this.dpr = dpr;
    this.canvas.width = Math.floor(W * dpr);
    this.canvas.height = Math.floor(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.cx = W * 0.5;
    this.cy = H * 0.48;
    this.lensR = Math.max(58, Math.min(W, H) * 0.17);   // small scope overlay — the scene fills the whole screen

    // Aim reticle: default to scene center, keep it inside the playfield on resize
    if (!isFinite(this.aimX)) this.aimX = this.cx;
    if (!isFinite(this.aimY)) this.aimY = this.cy;
    this.aimX = clamp(this.aimX, W * 0.05, W * 0.95);
    this.aimY = clamp(this.aimY, H * 0.06, H * 0.86);

    // Control geometry (landscape — drag anywhere to aim, fire under the right thumb)
    var pad = Math.max(18, Math.min(W, H) * 0.05);

    // Fire button bottom-right
    this.fireBtn.r = clamp(Math.min(W, H) * 0.115, 44, 84);
    this.fireBtn.x = W - pad - this.fireBtn.r;
    this.fireBtn.y = H - pad - this.fireBtn.r;

    // Zoom slider on right edge, above fire button
    var sw = clamp(W * 0.05, 34, 54);
    var sh = clamp(H * 0.34, 130, 320);
    this.zoomSlider.w = sw;
    this.zoomSlider.h = sh;
    this.zoomSlider.x = W - pad - sw;
    // sit the slider above the gun-status block (name ~46px + ammo/heat bar) that hugs the fire button
    this.zoomSlider.y = this.fireBtn.y - this.fireBtn.r - sh - 54;

    this.updateOrientation();
  };

  /* ------------------------------------------------------------------ *
   * ORIENTATION — force landscape on phones/tablets. Where the browser
   * can't lock orientation (iOS), show a "rotate to landscape" gate that
   * blocks play until the device is held sideways.
   * ------------------------------------------------------------------ */
  Game.prototype.isTouchDevice = function () {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  };

  Game.prototype.updateOrientation = function () {
    if (!this.rotateGate) return;
    var portrait = (window.innerHeight || 0) > (window.innerWidth || 0);
    var block = portrait && this.isTouchDevice();
    this.portraitBlocked = block;
    this.rotateGate.style.display = block ? 'flex' : 'none';
    if (block) { this.firing = false; }
  };

  /* ------------------------------------------------------------------ *
   * OPEN / CLOSE
   * ------------------------------------------------------------------ */
  Game.prototype.open = function () {
    this.build();
    if (this.running) return;
    this.overlay.style.display = 'block';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    Audio2.resume();

    // Best-effort native fullscreen, then lock to landscape where supported.
    try {
      var el = this.overlay;
      var lockLandscape = function () {
        try {
          if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(function () {});
          }
        } catch (e) { /* iOS Safari has no orientation lock — the rotate gate covers it */ }
      };
      if (el.requestFullscreen) el.requestFullscreen().then(lockLandscape).catch(lockLandscape);
      else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); lockLandscape(); }
      else lockLandscape();
    } catch (e) { /* iOS Safari etc — overlay still covers viewport, gate enforces landscape */ }

    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    window.addEventListener('keydown', this._onKey);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });

    this.fit();
    this.resetGame();
    this.running = true;
    this.lastT = 0;
    var self = this;
    this.rafId = requestAnimationFrame(function (t) { self.loop(t); });
  };

  Game.prototype.close = function () {
    if (!this.built) return;
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.firing = false;

    try {
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    } catch (e) {}
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) {}

    this.overlay.style.display = 'none';
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';

    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    window.removeEventListener('keydown', this._onKey);
    this.canvas.removeEventListener('wheel', this._onWheel);
    this.activePointers = {};
    this.fireBtn.active = false; this.zoomSlider.dragging = false;
    this.pinch.active = false;
  };

  Game.prototype.resetGame = function () {
    this.score = 0; this.wave = 0; this.kills = 0; this.combo = 0; this.comboTimer = 0; this.bestCombo = 0;
    this.fever = 0; this.slowMo = 0; this.hitstop = 0;
    this.agents.length = 0; this.tracers.length = 0; this.particles.length = 0;
    this.debris.length = 0; this.popups.length = 0; this.feed.length = 0; this.blooms.length = 0;
    this.rings.length = 0; this.callout = null;
    this.focus = 0; this.focusActive = false; this.focusT = 0; this.focusDur = 0; this.focusFlash = 0;
    this.camX = 0; this.camY = 0; this.zoom = 6; this.zoomTarget = 6;
    this.aimX = this.cx; this.aimY = this.cy;
    this.recoil = 0; this.vibe = 0; this.shake = 0; this.flash = 0; this.hitMarker = 0;
    this.heat = 0; this.overheated = false; this.spin = 0;
    this.setGun('rifle');
    this.spawnTimer = 1.0; this.killsThisWave = 0;
    this.startWave(1);
  };

  /* ------------------------------------------------------------------ *
   * WAVES & SPAWNING
   * ------------------------------------------------------------------ */
  Game.prototype.startWave = function (n) {
    this.wave = n;
    this.killsThisWave = 0;
    this.killsNeeded = 6 + n * 2;
    this.waveBanner = 2.6;
    this.waveBannerText = 'WAVE ' + n;
    Audio2.wave();
  };

  Game.prototype.spawnAgent = function () {
    if (this.agents.length >= 16) return;
    var W = this.W;
    var diff = this.wave;
    var r = Math.random();
    var type;
    if (r < 0.10) type = 'depot';
    else if (r < 0.26 + diff * 0.01) type = 'drone';   // flying — aim up to hit
    else if (r < 0.58) type = 'runner';
    else type = 'popup';

    // Fixed scene: pop-up targets (popups/depots) appear within view; runners enter from a side and cross.
    var screenX = (type === 'popup' || type === 'depot')
      ? rand(W * 0.10, W * 0.90)
      : (Math.random() < 0.5 ? rand(-W * 0.12, W * 0.05) : rand(W * 0.95, W * 1.12));
    var a = {
      type: type,
      // sx is a fixed screen-space anchor (no camera scroll)
      sx: screenX,
      baseScreenX: screenX,
      layer: this.playLayer,
      state: 'rise',      // rise | up | duck | run | dead
      t: 0,
      peek: rand(0.8, 1.4),
      hp: type === 'depot' ? 4 : (type === 'runner' ? 2 : 2),
      maxhp: type === 'depot' ? 4 : 2,
      h: 0,               // pop height 0..1
      vx: 0,
      dir: Math.random() < 0.5 ? 1 : -1,
      flash: 0,
      size: type === 'depot' ? rand(1.3, 1.7) : rand(0.85, 1.15),
      dead: false
    };
    if (type === 'runner') {
      a.state = 'run';
      a.h = 1;
      a.dir = a.sx < W * 0.5 ? 1 : -1;            // run inward from whichever side they entered
      a.vx = rand(26, 46) * a.dir * (0.8 + diff * 0.04);
      a.peek = rand(4, 8);
    }
    if (type === 'depot') { a.peek = 99; a.h = 1; a.state = 'up'; }
    if (type === 'drone') {
      a.fly = true; a.h = 1; a.state = 'up'; a.peek = 99;
      a.skyY = rand(0.05, 0.95); a.bob = 0; a.spin = 0;
      a.vx = rand(22, 46) * a.dir;
      a.sx = a.dir > 0 ? -50 : W + 50;   // enter from a side and drift across
      a.hp = 2; a.maxhp = 2; a.size = rand(0.95, 1.25);
    }
    this.agents.push(a);
  };

  /* ------------------------------------------------------------------ *
   * GUN SWITCHING / FIRING
   * ------------------------------------------------------------------ */
  Game.prototype.setGun = function (key) {
    if (!GUNS[key]) return;
    if (this.gun && this.gun.key === key) return;
    this.gun = GUNS[key];
    this.ammo = (this.gun.mag === Infinity) ? Infinity : this.gun.mag;
    this.reloading = 0;
    this.burstLeft = 0;
    this.fireCooldown = 0;
    this.heat = 0; this.overheated = false; this.spin = 0;
    Audio2.reload();
  };

  Game.prototype.startReload = function () {
    if (this.gun.mag === Infinity) return;
    if (this.reloading > 0) return;
    if (this.ammo >= this.gun.mag) return;
    this.reloading = this.gun.reload;
    Audio2.reload();
  };

  Game.prototype.tryFire = function (dt) {
    var g = this.gun;

    // Minigun spin-up gate
    if (g.spinup) {
      if (this.firing && !this.overheated) {
        this.spin = clamp(this.spin + dt / g.spinup, 0, 1);
        if (this.spin < 1) return;
      } else {
        this.spin = clamp(this.spin - dt / (g.spinup * 1.4), 0, 1);
      }
    }

    if (this.reloading > 0) return;
    if (this.overheated) return;

    this.fireCooldown -= dt;

    // Handle burst pacing for the rifle.
    if (g.burst) {
      if (this.burstLeft > 0) {
        this.burstTimer -= dt;
        if (this.burstTimer <= 0) { this.fireShot(); this.burstLeft--; this.burstTimer = g.burstGap; }
        return;
      }
    }

    if (!this.firing) return;
    if (this.fireCooldown > 0) return;

    if (this.ammo !== Infinity && this.ammo <= 0) {
      Audio2.empty();
      this.startReload();
      this.fireCooldown = 0.3;
      return;
    }

    if (g.burst) {
      this.burstLeft = g.burst - 1;
      this.burstTimer = g.burstGap;
      this.fireShot();
      this.fireCooldown = g.fireDelay + g.burst * g.burstGap;
      return;
    }

    this.fireShot();
    this.fireCooldown = g.fireDelay;
  };

  Game.prototype.fireShot = function () {
    var g = this.gun;
    if (this.ammo !== Infinity) {
      if (this.ammo <= 0) return;
      this.ammo--;
    }
    g.sound();

    // Recoil + muzzle flash + vibration
    this.recoil = Math.min(2.4, this.recoil + g.recoil);
    this.flash = Math.min(2.4, this.flash + g.flash * 0.6);
    if (g.spinup) this.vibe = 1;
    this.spawnParticles(this.cx + rand(8, 16), this.H - rand(2, 10), 1, C.amber, 1.2);

    // Heat
    if (g.heatPerShot) {
      this.heat = clamp(this.heat + g.heatPerShot, 0, 1);
      if (this.heat >= 1) { this.overheated = true; this.firing = false; Audio2.overheat(); this.shake = Math.max(this.shake, 0.5); }
    }

    // Bullet direction = aim reticle + spread + recoil jitter.
    var sp = g.spread * (1 + this.recoil * 0.4);
    var ang = rand(-sp, sp);
    var jitterX = Math.sin(ang) * (this.lensR * 1.2);
    var jitterY = rand(-sp, sp) * (this.lensR * 1.2);
    var tx = fin(this.aimX + jitterX, this.aimX);
    var ty = fin(this.aimY + jitterY, this.aimY);

    // Tracer originates lower-center (the barrel) and reaches toward the aim point.
    var ox = this.cx + rand(-4, 4);
    var oy = this.H + 30;
    this.tracers.push({
      x0: fin(ox, this.cx), y0: fin(oy, this.H), x1: tx, y1: ty,
      life: g.tracer === 'beam' ? 0.05 : 0.09, age: 0,
      kind: g.tracer
    });
    if (this.tracers.length > 60) this.tracers.shift();

    // Hit test at aim point.
    this.resolveHit(tx, ty, g.damage);

    // Haptic
    if (navigator.vibrate) { try { navigator.vibrate(g.spinup ? 4 : 8); } catch (e) {} }
  };

  /* Determine which agent (if any) the shot at (tx,ty) strikes. */
  Game.prototype.resolveHit = function (tx, ty, dmg) {
    var best = null, bestD = 1e9;
    for (var i = 0; i < this.agents.length; i++) {
      var a = this.agents[i];
      if (a.dead || a.h <= 0.05) continue;
      var p = this.agentScreen(a);
      if (!p) continue;
      var dx = tx - p.x, dy = ty - p.y;
      var rad = p.r;
      var d2 = dx * dx + dy * dy;
      if (d2 < rad * rad && d2 < bestD) { bestD = d2; best = a; best._hit = p; }
    }
    if (!best) {
      // a miss keeps the combo (just no add)
      return;
    }
    var hp = best._hit;
    // Headshot if the hit Y is in the upper third of the figure.
    var head = (ty < hp.y - hp.r * 0.45) && best.type !== 'depot';
    best.hp -= dmg + (head ? 2 : 0);
    best.flash = 1;
    this.hitMarker = 1;
    Audio2.ping();
    if (best.hp <= 0) {
      this.killAgent(best, head, hp);
    } else {
      // chip particle
      this.spawnParticles(hp.x, hp.y, 4, C.hi, 1.4);
    }
  };

  Game.prototype.killAgent = function (a, head, p) {
    if (a.dead) return;
    a.dead = true; a.state = 'dead'; a.deadT = 0;
    // ragdoll launch (gravity applied in update)
    a.deadVX = (a.vx || 0) * 0.3 + (a.dir || 1) * rand(10, 60) * (head ? 1.6 : 1);
    a.deadVY = -rand(40, 130) - (head ? 60 : 0);
    a.deadSpin = rand(-7, 7);
    a.deadDX = 0; a.deadDY = 0; a.deadRot = 0;
    if (head) this.slowMo = Math.max(this.slowMo || 0, 0.5);
    this.hitstop = head ? 0.085 : 0.04;
    this.kills++;
    this.killsThisWave++;

    // Combo
    this.combo++;
    this.comboTimer = 2.4;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    if (this.combo >= 6 && !(this.fever > 0)) {
      this.fever = 8;
      this.callout = { text: 'FEVER — DOUBLE SCORE', t: 0, life: 1.8 };
      try { Audio2.focus && Audio2.focus(); } catch (e) {}
    }
    var mult = 1 + Math.min(8, this.combo - 1) * 0.25;

    // FOCUS charges with kills (headshots & depots give more), unless already in bullet-time
    if (!this.focusActive) {
      this.focus = clamp(this.focus + (head ? 0.16 : 0.10) + (a.type === 'depot' ? 0.10 : 0), 0, 1);
    }
    // Combo callout banner
    var co = this.comboName(this.combo);
    if (co) this.callout = { text: co, t: 0, life: 1.3 };
    // Shockwave ring at the kill point
    this.rings.push({ x: p.x, y: p.y, t: 0, life: head ? 0.5 : 0.38, r0: p.r * 0.4,
      r1: p.r * (head ? 4.5 : 3) + 40, col: head ? C.hi : C.green, lw: head ? 3 : 2 });
    if (this.rings.length > 14) this.rings.shift();

    var base = a.type === 'depot' ? 250 : (a.type === 'runner' ? 150 : 100);
    if (head) base += 100;
    var pts = Math.round(base * mult * (TH().scoreMul || 1) * (this.fever > 0 ? 2 : 1));
    this.score += pts;

    try { var bk = 'ccSniperX.best.' + VARIANT; if (this.score > (parseInt(localStorage.getItem(bk) || '0', 10) || 0)) localStorage.setItem(bk, String(this.score)); } catch (e) {}
    var label = head ? 'HEADSHOT' : (a.type === 'depot' ? 'DEPOT' : 'TANGO DOWN');
    this.popups.push({ x: p.x, y: p.y, t: 0, life: 1.1, text: '+' + pts + (this.fever > 0 ? ' \u2605' : ''), big: head || a.type === 'depot' });
    if (this.popups.length > 24) this.popups.shift();
    this.feed.unshift({ text: label + (mult > 1 ? '  x' + mult.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') : ''), t: 0 });
    if (this.feed.length > 5) this.feed.pop();

    if (head) Audio2.headshot();

    if (navigator.vibrate) { try { navigator.vibrate(a.type === 'depot' ? [12, 8, 30] : 18); } catch (e) {} }

    if (a.type === 'depot') {
      this.detonate(p.x, p.y, p.r);
    } else {
      this.spawnParticles(p.x, p.y, head ? 16 : 11, head ? C.hi : C.green, 2);
    }
  };

  /* Combo-streak callout names. */
  Game.prototype.comboName = function (c) {
    if (c === 2) return 'DOUBLE KILL';
    if (c === 3) return 'TRIPLE KILL';
    if (c === 4) return 'MULTI KILL';
    if (c === 5) return 'RAMPAGE';
    if (c === 7) return 'UNSTOPPABLE';
    if (c === 10) return 'GODLIKE';
    if (c > 10 && c % 5 === 0) return 'OVERWATCH x' + c;
    return null;
  };

  /* Spend the FOCUS charge to enter bullet-time. */
  Game.prototype.activateFocus = function () {
    if (this.focusActive || this.focus < 0.4) return;
    this.focusActive = true;
    this.focusDur = 2.2 + this.focus * 4.0;   // 2.2..6.2s, scaled by charge
    this.focusT = this.focusDur;
    this.focusFlash = 1;
    if (navigator.vibrate) { try { navigator.vibrate([8, 30, 8]); } catch (e) {} }
    try { Audio2.focus && Audio2.focus(); } catch (e) {}
  };

  /* Massive chain explosion from a depot. */
  Game.prototype.detonate = function (x, y, r) {
    Audio2.explosion();
    this.shake = Math.min(2.2, this.shake + 1.4);
    this.flash = Math.min(3, this.flash + 1.6);
    this.blooms.push({ x: x, y: y, t: 0, life: 0.6, r0: r, r1: r * 9 + 140 });
    if (this.blooms.length > 6) this.blooms.shift();
    this.rings.push({ x: x, y: y, t: 0, life: 0.55, r0: r, r1: r * 8 + 180, col: C.amber, lw: 4 });
    if (this.rings.length > 14) this.rings.shift();

    // debris rain
    for (var i = 0; i < 26 && this.debris.length < 90; i++) {
      var ang = rand(0, Math.PI * 2);
      var sp = rand(60, 320);
      this.debris.push({
        x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - rand(40, 160),
        t: 0, life: rand(0.7, 1.5), size: rand(1.5, 4),
        color: Math.random() < 0.4 ? C.amber : C.green
      });
    }
    this.spawnParticles(x, y, 40, C.amber, 4);
    this.spawnParticles(x, y, 24, C.hi, 3);

    // Chain to nearby agents
    var R = r * 7 + 130;
    for (var j = 0; j < this.agents.length; j++) {
      var b = this.agents[j];
      if (b.dead) continue;
      var p = this.agentScreen(b);
      if (!p) continue;
      var dd = Math.hypot(p.x - x, p.y - y);
      if (dd < R) {
        var self = this;
        (function (bb, pp, delay) {
          setTimeout(function () {
            if (!self.running) return;     // game closed/reset in the interim
            if (!bb.dead) {
              if (bb.type === 'depot') self.killAgent(bb, false, pp);
              else { bb.hp = 0; self.killAgent(bb, false, pp); }
            }
          }, delay);
        })(b, p, randi(40, 220));
      }
    }
  };

  Game.prototype.spawnParticles = function (x, y, n, color, speedMul) {
    if (!isFinite(x) || !isFinite(y)) return;
    for (var i = 0; i < n && this.particles.length < 160; i++) {
      var ang = rand(0, Math.PI * 2);
      var sp = rand(20, 120) * (speedMul || 1);
      this.particles.push({
        x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - rand(0, 40),
        t: 0, life: rand(0.3, 0.8), size: rand(1, 3), color: color || C.green
      });
    }
  };

  /* ------------------------------------------------------------------ *
   * Agent → screen position. Returns {x,y,r} or null if non-finite.
   * ------------------------------------------------------------------ */
  Game.prototype.agentScreen = function (a) {
    // Agents roam in fixed screen space (the scene no longer pans).
    var x = a.sx;
    var z = fin(this.zoom, 6);
    if (a.fly) {
      // FLYING drone: cruises the upper sky (kept on-screen so the reticle can always reach it).
      var fy = this.cy - this.H * (0.10 + (a.skyY || 0.5) * 0.28) + (a.bob || 0);
      var fH = 26 * a.size * (0.5 + z * 0.12);
      if (!isFinite(x) || !isFinite(fy) || !isFinite(fH)) return null;
      return { x: x, y: fy, top: fy - fH * 0.5, ridge: fy, r: fH * 0.72, figH: fH, pop: a.h };
    }
    var ridge = this.ridgeY(a.layer, x);
    var figH = (a.type === 'depot' ? 30 : 22) * a.size * (0.5 + z * 0.12);
    var pop = ease(a.h);
    var r = figH * 0.5 * (a.type === 'depot' ? 1.2 : 0.9);
    if (!isFinite(x) || !isFinite(ridge) || !isFinite(figH) || !isFinite(r)) return null;
    return { x: x, y: ridge - figH * pop * 0.5, top: ridge - figH * pop, ridge: ridge, r: r, figH: figH, pop: pop };
  };

  /* ------------------------------------------------------------------ *
   * KEYBOARD (desktop) & WHEEL
   * ------------------------------------------------------------------ */
  Game.prototype.onKey = function (e) {
    if (!this.running) return;
    var k = e.key;
    if (k === '1') this.setGun('rifle');
    else if (k === '2') this.setGun('mg');
    else if (k === '3') this.setGun('minigun');
    else if (k === 'r' || k === 'R') this.startReload();
    else if (k === 'f' || k === 'F' || k === 'Shift') this.activateFocus();
    else if (k === 'Escape') this.close();
    else if (k === ' ') { this.firing = true; e.preventDefault(); }
    else if (k === '+' || k === '=') this.nudgeZoom(1);
    else if (k === '-' || k === '_') this.nudgeZoom(-1);
    // Arrow keys pan (desktop convenience)
    else if (k === 'ArrowLeft') this.panVX = -1;
    else if (k === 'ArrowRight') this.panVX = 1;
    else if (k === 'ArrowUp') this.panVY = -1;
    else if (k === 'ArrowDown') this.panVY = 1;
  };

  Game.prototype.onWheel = function (e) {
    e.preventDefault();
    this.nudgeZoom(e.deltaY < 0 ? 0.6 : -0.6);
  };

  Game.prototype.nudgeZoom = function (dir) {
    this.zoomTarget = clamp(fin(this.zoomTarget, 6) + dir, 2, 12);
  };

  /* ------------------------------------------------------------------ *
   * POINTER HANDLERS — drag-anywhere aim, fire, zoom slider, UI buttons, pinch.
   * ------------------------------------------------------------------ */
  Game.prototype.onPointerDown = function (e) {
    e.preventDefault();
    var x = e.clientX, y = e.clientY, id = e.pointerId;
    try { this.canvas.setPointerCapture(id); } catch (err) {}
    Audio2.resume();
    this.activePointers[id] = { x: x, y: y, role: null };

    // Pinch-zoom detection (two touch pointers)
    var ids = Object.keys(this.activePointers);
    if (e.pointerType === 'touch' && ids.length === 2 && !this.pinch.active) {
      var a = this.activePointers[ids[0]], b = this.activePointers[ids[1]];
      this.pinch.active = true;
      this.pinch.ids = ids.slice();
      this.pinch.startDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      this.pinch.startZoom = this.zoomTarget;
    }

    // UI hotspot buttons (gun select, zoom +/-) — test first.
    for (var h = 0; h < this.uiHotspots.length; h++) {
      var hs = this.uiHotspots[h];
      if (x >= hs.x && x <= hs.x + hs.w && y >= hs.y && y <= hs.y + hs.h) {
        this.activePointers[id].role = 'ui';
        hs.action();
        return;
      }
    }

    // Zoom slider
    var zs = this.zoomSlider;
    if (x >= zs.x - 12 && x <= zs.x + zs.w + 12 && y >= zs.y - 12 && y <= zs.y + zs.h + 12) {
      this.zoomSlider.dragging = true; this.zoomSlider.id = id;
      this.activePointers[id].role = 'zoom';
      this.setZoomFromSlider(y);
      return;
    }

    // Fire button (bottom-right)
    var fb = this.fireBtn;
    if (Math.hypot(x - fb.x, y - fb.y) <= fb.r * 1.18) {
      this.fireBtn.active = true; this.fireBtn.id = id;
      this.activePointers[id].role = 'fire';
      this.firing = true;
      return;
    }

    // Otherwise — anywhere on screen is a free aim drag: grab and slide the reticle.
    this.activePointers[id].role = 'drag';
    this.activePointers[id].lastX = x;
    this.activePointers[id].lastY = y;
  };

  Game.prototype.onPointerMove = function (e) {
    var id = e.pointerId;
    var p = this.activePointers[id];
    if (!p) return;
    e.preventDefault();
    var x = e.clientX, y = e.clientY;
    p.x = x; p.y = y;

    // Pinch update
    if (this.pinch.active && this.pinch.ids.indexOf(String(id)) !== -1) {
      var a = this.activePointers[this.pinch.ids[0]], b = this.activePointers[this.pinch.ids[1]];
      if (a && b) {
        var d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        var ratio = d / (this.pinch.startDist || 1);
        this.zoomTarget = clamp(fin(this.pinch.startZoom, 6) * ratio, 2, 12);
      }
      return;
    }

    if (p.role === 'zoom') { this.setZoomFromSlider(y); return; }
    if (p.role === 'drag') {
      var dx = x - p.lastX, dy = y - p.lastY;
      p.lastX = x; p.lastY = y;
      // drag the reticle directly across the fixed scene
      this.aimX = clamp(fin(this.aimX + dx, this.aimX), this.W * 0.05, this.W * 0.95);
      this.aimY = clamp(fin(this.aimY + dy, this.aimY), this.H * 0.06, this.H * 0.86);
      return;
    }
  };

  Game.prototype.onPointerUp = function (e) {
    var id = e.pointerId;
    var p = this.activePointers[id];
    try { this.canvas.releasePointerCapture(id); } catch (err) {}
    if (p) {
      if (p.role === 'zoom') { this.zoomSlider.dragging = false; }
      if (p.role === 'fire') { this.fireBtn.active = false; this.firing = false; }
    }
    delete this.activePointers[id];

    if (this.pinch.active) {
      var ids = Object.keys(this.activePointers);
      if (ids.length < 2) this.pinch.active = false;
    }
  };

  Game.prototype.setZoomFromSlider = function (y) {
    var zs = this.zoomSlider;
    if (!(zs.h > 0)) return;
    var t = clamp((y - zs.y) / zs.h, 0, 1);
    // top = max zoom, bottom = min zoom
    this.zoomTarget = clamp(2 + (1 - t) * 10, 2, 12);
  };

  /* ==================================================================== *
   * UPDATE
   * ==================================================================== */
  Game.prototype.update = function (rdt) {
    var W = this.W, H = this.H;

    // Held in portrait on a phone/tablet — freeze the game behind the rotate gate.
    if (this.portraitBlocked) return;

    // FOCUS bullet-time: meter drains on REAL time; the world runs on scaled dt.
    if (this.focusActive) {
      this.focusT -= rdt;
      if (this.focusT <= 0) { this.focusActive = false; this.focusT = 0; this.focus = 0; }
    }
    this.focusFlash = Math.max(0, this.focusFlash - rdt * 3);
    if (this.hitstop > 0) { this.hitstop -= rdt; return; }   // frozen impact frames
    if (this.slowMo > 0) this.slowMo = Math.max(0, this.slowMo - rdt);
    if (this.fever > 0) {
      this.fever = Math.max(0, this.fever - rdt);
      if (this.fever <= 0) { this.feed.unshift({ text: 'FEVER ENDS', t: 0 }); if (this.feed.length > 5) this.feed.pop(); }
    }
    var tscale = this.focusActive ? 0.34 : (this.slowMo > 0 ? 0.38 : 1);
    var dt = rdt * tscale;

    // Smooth zoom (responsive — real time)
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, rdt * 9);
    this.zoom = clamp(fin(this.zoom, 6), 2, 12);

    // Keyboard (WASD/arrows) slews the AIM RETICLE; touch drags it directly in onPointerMove.
    var aimSpeed = Math.max(W, H) * (2.45 - clamp(this.zoom, 2, 12) * 0.07);
    var ix = this.panVX || 0;
    var iy = this.panVY || 0;
    // mild curve: a little fine control near center, quick toward the edge (not the old sluggish floor)
    var resp = function (v) { var s = Math.sign(v), a = Math.min(1, Math.abs(v)); return s * Math.pow(a, 1.25); };
    this.aimX = clamp(fin(this.aimX + resp(ix) * aimSpeed * rdt, this.aimX), W * 0.05, W * 0.95);
    this.aimY = clamp(fin(this.aimY + resp(iy) * aimSpeed * rdt, this.aimY), H * 0.06, H * 0.86);
    // decay keyboard aim
    this.panVX *= (1 - Math.min(1, rdt * 8));
    this.panVY *= (1 - Math.min(1, rdt * 8));
    this.camX = 0; this.camY = 0;   // background never pans — the mountains are a fixed backdrop

    // Scope sway (slow lissajous), amplified by gun & zoom; settles recoil.
    this.swayT += dt;
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.vibe = Math.max(0, this.vibe - dt * 4);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.flash = Math.max(0, this.flash - dt * 7);
    this.hitMarker = Math.max(0, this.hitMarker - dt * 4);

    // Heat cool / overheat recovery
    if (this.gun.heatPerShot) {
      if (!this.firing || (this.gun.spinup && this.spin < 1)) {
        this.heat = clamp(this.heat - dt * 0.28, 0, 1);
      }
      if (this.overheated && this.heat <= 0.35) this.overheated = false;
    }

    // Reload
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) { this.reloading = 0; this.ammo = this.gun.mag; }
    }

    // Auto-reload assault/mg when empty and not firing
    if (this.ammo !== Infinity && this.ammo <= 0 && this.reloading <= 0) this.startReload();

    // Firing logic (real time — full fire rate during focus)
    this.tryFire(rdt);

    // Minigun barrel spin visual
    if (this.gun.spinup) this.barrelAngle += dt * (3 + this.spin * 40);

    // Combo timer
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }

    // Wave banner
    if (this.waveBanner > 0) this.waveBanner -= dt;

    // Spawning
    this.spawnTimer -= dt;
    var spawnRate = clamp(1.5 - this.wave * 0.08, 0.45, 1.5) / ((TH().spawnMul || 1) * (this.fever > 0 ? 1.35 : 1));
    if (this.spawnTimer <= 0) {
      this.spawnAgent();
      this.spawnTimer = spawnRate * rand(0.6, 1.3);
    }

    // Wave progression
    if (this.killsThisWave >= this.killsNeeded) {
      this.startWave(this.wave + 1);
    }

    // Update agents
    for (var i = this.agents.length - 1; i >= 0; i--) {
      var a = this.agents[i];
      a.t += dt;
      a.flash = Math.max(0, a.flash - dt * 5);

      if (a.dead) {
        a.deadT = (a.deadT || 0) + dt;
        a.deadVY = (a.deadVY || 0) + 340 * dt;            // gravity on the ragdoll
        a.deadDX = (a.deadDX || 0) + (a.deadVX || 0) * dt;
        a.deadDY = (a.deadDY || 0) + a.deadVY * dt;
        a.deadRot = (a.deadRot || 0) + (a.deadSpin || 0) * dt;
        if (a.deadT > 0.9) { this.agents.splice(i, 1); }
        continue;
      }

      if (a.fly) {
        a.sx += a.vx * dt;                  // drift across the sky
        a.bob = Math.sin(a.t * 2.5) * 10;   // bob
        a.spin = (a.spin || 0) + dt * 34;   // rotor spin
        if (a.sx < -130 || a.sx > this.W + 130) { this.agents.splice(i, 1); }
        continue;                            // drones skip the ground rise/duck/run states
      }

      if (a.state === 'rise') {
        a.h = clamp(a.h + dt * 4, 0, 1);
        if (a.h >= 1) { a.state = 'up'; a.t = 0; }
      } else if (a.state === 'up') {
        if (a.type !== 'depot' && a.t > a.peek) { a.state = 'duck'; }
      } else if (a.state === 'duck') {
        a.h = clamp(a.h - dt * 3.5, 0, 1);
        if (a.h <= 0) { this.agents.splice(i, 1); continue; }
      } else if (a.state === 'run') {
        a.sx += a.vx * dt;
        a.peek -= dt;
        if (a.peek <= 0) { a.state = 'duck'; }
      }

      // cull far off-screen runners/agents
      if (a.sx < -W * 0.6 || a.sx > W * 1.6) { this.agents.splice(i, 1); }
    }

    // Tracers
    for (var t = this.tracers.length - 1; t >= 0; t--) {
      var tr = this.tracers[t];
      tr.age += dt;
      if (tr.age >= tr.life) this.tracers.splice(t, 1);
    }

    // Particles
    for (var p = this.particles.length - 1; p >= 0; p--) {
      var pt = this.particles[p];
      pt.t += dt;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vy += 90 * dt;
      pt.vx *= (1 - dt * 1.2);
      if (pt.t >= pt.life) this.particles.splice(p, 1);
    }

    // Debris
    for (var d = this.debris.length - 1; d >= 0; d--) {
      var db = this.debris[d];
      db.t += dt;
      db.x += db.vx * dt; db.y += db.vy * dt;
      db.vy += 240 * dt; db.vx *= (1 - dt * 0.6);
      if (db.t >= db.life) this.debris.splice(d, 1);
    }

    // Popups
    for (var u = this.popups.length - 1; u >= 0; u--) {
      var pu = this.popups[u]; pu.t += dt; pu.y -= dt * 26;
      if (pu.t >= pu.life) this.popups.splice(u, 1);
    }

    // Blooms
    for (var bl = this.blooms.length - 1; bl >= 0; bl--) {
      var bm = this.blooms[bl]; bm.t += dt;
      if (bm.t >= bm.life) this.blooms.splice(bl, 1);
    }

    // Shockwave rings
    for (var rg = this.rings.length - 1; rg >= 0; rg--) {
      var rn = this.rings[rg]; rn.t += dt;
      if (rn.t >= rn.life) this.rings.splice(rg, 1);
    }

    // Combo callout banner
    if (this.callout) { this.callout.t += dt; if (this.callout.t >= this.callout.life) this.callout = null; }

    // Feed
    for (var f = 0; f < this.feed.length; f++) this.feed[f].t += dt;
  };

  /* ==================================================================== *
   * RENDER
   * ==================================================================== */
  Game.prototype.render = function () {
    var ctx = this.ctx, W = this.W, H = this.H;
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);

    // Background is a FIXED backdrop — no pan, no sway. The scope and targets move; the mountains don't.
    try {
      this.drawWorld(ctx, W, H);
    } catch (e) { /* keep the frame alive */ }

    // Scope body (vignette is screen-centered; the lens rides the aim point)
    this.drawScopeBody(ctx, W, H);

    // Reticle at the moving aim point
    this.drawReticle(ctx);

    // Muzzle flash overlay
    if (this.flash > 0.02) this.drawMuzzleFlash(ctx);

    // Explosion bloom washes (full screen)
    this.drawBlooms(ctx);

    // Shockwave rings from kills / explosions
    this.drawRings(ctx);

    // FOCUS bullet-time treatment (under the HUD so readouts stay crisp)
    if (this.focusActive || this.focusFlash > 0) this.drawFocusFX(ctx, W, H);

    // FEVER edge glow while double-score streak is live
    if (this.fever > 0) {
      ctx.save();
      var fa = Math.min(1, this.fever) * (0.16 + 0.06 * Math.sin(this.swayT * 6));
      var fg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.62);
      fg.addColorStop(0, 'rgba(255,210,74,0)'); fg.addColorStop(1, 'rgba(255,180,50,' + fa.toFixed(3) + ')');
      ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // HUD + controls (screen space)
    this.drawHUD(ctx, W, H);
    this.drawControls(ctx, W, H);

    // CRT scanlines + vignette on top
    this.drawCRT(ctx, W, H);
  };

  /* --- The scene inside the lens: sky, ridges, agents, tracers, particles --- */
  Game.prototype.drawWorld = function (ctx, W, H) {
    var th = TH();
    var horizon = fin(this.cy + this.camY * 0.85, this.cy);
    var top = horizon - H * 1.2, bot = horizon + H * 0.5;
    if (isFinite(top) && isFinite(bot) && bot > top) {
      var g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, th.sky[0]); g.addColorStop(0.55, th.sky[1]);
      g.addColorStop(0.86, th.sky[2]); g.addColorStop(1, th.sky[3]);
      ctx.fillStyle = g;
    } else { ctx.fillStyle = th.sky[1]; }
    ctx.fillRect(0, 0, W, H);

    /* weather clock (render-side, self-contained) */
    var nowS = performance.now() / 1000;
    var wdt = Math.min(0.06, nowS - (this._wxLast || nowS)); this._wxLast = nowS;
    if (!this._wx) this._wx = { ltT: rand(2.5, 6), flash: 0, bolt: null, boltT: 0, shootT: rand(4, 9), shoot: null, embers: [], flies: [], cloudX: rand(0, 999) };
    var wx = this._wx;
    var aCamX = fin(this.camX, 0), aCamY = fin(this.camY, 0), T = nowS;

    /* twinkling starfield + rare shooting star */
    ctx.save();
    for (var s = 0; s < 90; s++) {
      var sxp = ((((s * 149.3 - aCamX * 0.04) % (W + 60)) + W + 60) % (W + 60)) - 30;
      var syp = ((s * 71.7) % Math.max(40, horizon)) * 0.8 + aCamY * 0.25;
      if (syp > horizon - 16 || !isFinite(sxp) || !isFinite(syp)) continue;
      var tw = 0.35 + 0.65 * Math.abs(Math.sin(T * (0.4 + (s % 7) * 0.13) + s * 1.7));
      ctx.globalAlpha = (s % 9 === 0 ? 0.9 : 0.4) * tw * (th.rain ? 0.45 : 1);
      ctx.fillStyle = (s % 11 === 0) ? C.cyan : (th.embers && s % 6 === 0 ? '#ff9a6a' : C.faint);
      var ss = (s % 13 === 0) ? 1.9 : 1.1;
      ctx.fillRect(sxp, syp, ss, ss);
    }
    ctx.restore();
    wx.shootT -= wdt;
    if (wx.shootT <= 0 && !th.rain) { wx.shootT = rand(5, 11); wx.shoot = { x: rand(W * 0.15, W * 0.85), y: rand(20, horizon * 0.4), a: rand(0.5, 0.9), t: 0 }; }
    if (wx.shoot) {
      var sh = wx.shoot; sh.t += wdt;
      var u = sh.t / 0.7;
      if (u >= 1) { wx.shoot = null; }
      else {
        var sl = 90, sxx = sh.x + Math.cos(sh.a) * u * 190, syy = sh.y + Math.sin(sh.a) * u * 190;
        if (syy < horizon - 10) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - u) * 0.8;
          var sg2 = ctx.createLinearGradient(sxx - Math.cos(sh.a) * sl, syy - Math.sin(sh.a) * sl, sxx, syy);
          sg2.addColorStop(0, 'rgba(200,255,220,0)'); sg2.addColorStop(1, th.embers ? '#ffc9a0' : '#d8ffe8');
          ctx.strokeStyle = sg2; ctx.lineWidth = 1.6; ctx.beginPath();
          ctx.moveTo(sxx - Math.cos(sh.a) * sl, syy - Math.sin(sh.a) * sl); ctx.lineTo(sxx, syy); ctx.stroke(); ctx.restore();
        }
      }
    }

    /* NEBULA — soft deep-space cloud, sky only */
    if (!th.rain) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      var nbc = th.embers ? '255,80,45' : '65,230,160';
      var nbx = W * 0.24, nby = Math.max(30, horizon - H * 0.62);
      var nb1 = ctx.createRadialGradient(nbx, nby, 0, nbx, nby, W * 0.3);
      nb1.addColorStop(0, 'rgba(' + nbc + ',0.075)'); nb1.addColorStop(0.6, 'rgba(' + nbc + ',0.025)'); nb1.addColorStop(1, 'rgba(' + nbc + ',0)');
      ctx.fillStyle = nb1; ctx.fillRect(0, 0, W, Math.max(0, horizon - 10));
      var nb2 = ctx.createRadialGradient(W * 0.5, nby * 0.5, 0, W * 0.5, nby * 0.5, W * 0.2);
      nb2.addColorStop(0, 'rgba(125,247,255,0.05)'); nb2.addColorStop(1, 'rgba(125,247,255,0)');
      ctx.fillStyle = nb2; ctx.fillRect(0, 0, W, Math.max(0, horizon - 10));
      ctx.restore();
    }

    /* MOON — themed */
    var mr = Math.min(W, H) * th.moon.r;
    var mx = W * 0.68 - aCamX * 0.02;
    var my = horizon - H * 0.31 + aCamY * 0.18;
    if (isFinite(mx) && isFinite(my)) {
      ctx.save();
      var mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 3.8);
      mg.addColorStop(0, th.moon.glow); mg.addColorStop(0.5, th.moon.glow.replace(/[\d.]+\)$/, '0.05)')); mg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, mr * 3.8, 0, Math.PI * 2); ctx.fill();
      var ringCol = th.ring || th.moon.rim, rTilt = -0.42;
      var moonRing = function (rx2, ry2, lw2, al2, a0, a1) {
        ctx.save(); ctx.globalAlpha = al2; ctx.strokeStyle = ringCol; ctx.lineWidth = lw2;
        ctx.shadowColor = ringCol; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.ellipse(mx, my, mr * rx2, mr * ry2, rTilt, a0, a1); ctx.stroke(); ctx.restore();
      };
      moonRing(1.95, 0.6, 3, 0.3, Math.PI, Math.PI * 2);
      moonRing(2.3, 0.72, 1.5, 0.18, Math.PI, Math.PI * 2);
      ctx.globalAlpha = 0.95; ctx.fillStyle = th.moon.body; ctx.shadowColor = th.moon.rim; ctx.shadowBlur = 26;
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.globalAlpha = 0.7; ctx.strokeStyle = th.moon.rim; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = th.moon.crater;
      ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.18, mr * 0.22, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.arc(mx + mr * 0.34, my + 0.24 * mr, mr * 0.15, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.arc(mx + mr * 0.1, my - mr * 0.42, mr * 0.1, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.arc(mx - mr * 0.12, my + mr * 0.38, mr * 0.12, 0, 6.28); ctx.fill();
      /* crescent shade for depth */
      ctx.globalAlpha = 0.35; ctx.fillStyle = th.sky[0];
      ctx.beginPath(); ctx.arc(mx + mr * 0.45, my - mr * 0.18, mr * 0.92, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 1;
      moonRing(1.95, 0.6, 3.2, 0.55, 0, Math.PI);
      moonRing(2.3, 0.72, 1.6, 0.32, 0, Math.PI);
      moonRing(1.62, 0.5, 1.2, 0.4, 0, Math.PI);
      ctx.restore();
    }

    /* AURORA — living curtains (recon) */
    if (th.aurora) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (var au = 0; au < 3; au++) {
        var ay = horizon - H * (0.3 + au * 0.075);
        if (!isFinite(ay)) continue;
        ctx.globalAlpha = 0.06 - au * 0.012; ctx.fillStyle = au === 1 ? C.cyan : C.green;
        ctx.beginPath(); ctx.moveTo(-20, ay);
        for (var ax = 0; ax <= W + 20; ax += 22)
          ctx.lineTo(ax, ay + Math.sin(ax * 0.012 + au * 2 + T * 0.35) * 16 + Math.sin(ax * 0.03 - T * 0.22) * 7);
        ctx.lineTo(W + 20, ay + 80); ctx.lineTo(-20, ay + 80); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    /* CLOUDS — drifting dark banks */
    if (th.clouds > 0.05) {
      ctx.save();
      for (var cl = 0; cl < 5; cl++) {
        var cyB = horizon - H * (0.34 + (cl % 3) * 0.11);
        var cw = W * (0.3 + (cl % 3) * 0.12), chh = H * (0.04 + (cl % 2) * 0.02);
        var cxB = ((wx.cloudX * 37 + cl * W * 0.33 + T * (5 + cl * 2.4)) % (W + cw * 2)) - cw;
        if (!isFinite(cxB) || !isFinite(cyB)) continue;
        ctx.globalAlpha = (0.10 + (cl % 3) * 0.03) * th.clouds;
        ctx.fillStyle = th.rain ? '#04121a' : th.sky[0];
        ctx.beginPath(); ctx.ellipse(cxB, cyB, cw, chh, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cxB + cw * 0.4, cyB - chh * 0.5, cw * 0.55, chh * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    /* MIST banks above the valley */
    ctx.save();
    for (var ms = 0; ms < 4; ms++) {
      var myB = horizon - H * (0.04 + ms * 0.06);
      var mw = W * (0.5 + ms * 0.12), mh = H * (0.05 + ms * 0.015);
      var mxB = ((W * (0.16 + ms * 0.23) + Math.sin(T * 0.07 + ms * 2.1) * W * 0.05) + W) % W;
      if (!isFinite(mxB) || !isFinite(myB)) continue;
      ctx.globalAlpha = 0.055 + ms * 0.008; ctx.fillStyle = th.haze;
      ctx.beginPath(); ctx.ellipse(mxB, myB, mw, mh, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(mxB - mw * 0.55, myB + mh * 0.3, mw * 0.6, mh * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    /* LIGHTNING — flash + bolt (storm) */
    if (th.lightning) {
      wx.ltT -= wdt;
      if (wx.ltT <= 0) {
        wx.ltT = rand(3.5, 8); wx.flash = 1; wx.boltT = 0.34;
        var bx0 = rand(W * 0.1, W * 0.9), seg = [], byy = rand(6, 30), bxx = bx0;
        seg.push([bxx, byy]);
        while (byy < horizon - 12) { byy += rand(16, 34); bxx += rand(-26, 26); seg.push([bxx, byy]); }
        wx.bolt = seg;
        try { if (Audio2 && Audio2.explosion) setTimeout(function () { try { Audio2.explosion(); } catch (e) {} }, rand(150, 500)); } catch (e) {}
      }
      if (wx.flash > 0) {
        ctx.save(); ctx.globalAlpha = wx.flash * 0.22; ctx.fillStyle = '#cfeeff'; ctx.fillRect(0, 0, W, horizon + 20); ctx.restore();
        wx.flash = Math.max(0, wx.flash - wdt * 3.2);
      }
      if (wx.boltT > 0 && wx.bolt) {
        wx.boltT -= wdt;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.max(0, wx.boltT / 0.34);
        ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 2.2; ctx.shadowColor = '#bfe9ff'; ctx.shadowBlur = 14;
        ctx.beginPath();
        for (var bi = 0; bi < wx.bolt.length; bi++) { var bp = wx.bolt[bi]; bi ? ctx.lineTo(bp[0], bp[1]) : ctx.moveTo(bp[0], bp[1]); }
        ctx.stroke();
        ctx.lineWidth = 0.8; ctx.globalAlpha *= 0.7; ctx.stroke();
        ctx.restore();
      }
    }

    /* EMBERS — rise from the horizon into the sky only (never over the dirt) */
    if (th.embers) {
      if (!wx.embers.length) for (var eb = 0; eb < 24; eb++) wx.embers.push({ x: rand(0, 1), y: rand(0, 1), sp: rand(10, 26), ph: rand(0, 6.28), s: rand(1, 2.1) });
      var skyH = Math.max(50, horizon - 14);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (var ei = 0; ei < wx.embers.length; ei++) {
        var em = wx.embers[ei];
        em.y -= em.sp * wdt / skyH;
        if (em.y < 0) { em.y = 1; em.x = rand(0, 1); }
        var exx = (em.x + Math.sin(T * 0.6 + em.ph) * 0.015) * W;
        var eyy = em.y * skyH;
        ctx.globalAlpha = (0.2 + 0.5 * Math.abs(Math.sin(T * 2 + em.ph))) * (0.3 + 0.7 * em.y);
        ctx.fillStyle = ei % 3 === 0 ? '#ffd2a0' : '#ff7a4a'; ctx.shadowColor = '#ff5a2a'; ctx.shadowBlur = 5;
        ctx.fillRect(exx, eyy, em.s, em.s);
      }
      ctx.restore();
    }

    /* Parallax ridgelines back-to-front */
    for (var li = 0; li < this.layers.length; li++) this.drawRidge(ctx, li, W, H);

    /* FIREFLIES above the play ridge (recon) */
    if (th.fireflies) {
      if (!wx.flies.length) for (var ff = 0; ff < 14; ff++) wx.flies.push({ x: rand(0, 1), y: rand(0, 1), p: rand(0, 6.28), sp: rand(0.3, 0.8) });
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (var fi = 0; fi < wx.flies.length; fi++) {
        var fl = wx.flies[fi];
        var fx2 = ((fl.x + Math.sin(T * fl.sp + fl.p) * 0.02) % 1) * W;
        var fy2 = horizon + H * 0.06 + fl.y * H * 0.22 + Math.sin(T * fl.sp * 1.7 + fl.p) * 6;
        var fa = 0.25 + 0.75 * Math.abs(Math.sin(T * (0.8 + fl.sp) + fl.p * 3));
        if (!isFinite(fx2) || !isFinite(fy2)) continue;
        ctx.globalAlpha = fa * 0.75; ctx.fillStyle = '#d6ffb0'; ctx.shadowColor = '#b6ff7d'; ctx.shadowBlur = 6;
        ctx.fillRect(fx2, fy2, 1.7, 1.7);
      }
      ctx.restore();
    }

    /* (embers now rise in the sky band, drawn before the ridges) */

    /* Agents sit on the play ridge */
    for (var ai = 0; ai < this.agents.length; ai++) this.drawAgent(ctx, this.agents[ai]);

    /* Tracers, particles, debris, popups */
    this.drawTracers(ctx);
    this.drawParticles(ctx);
    this.drawDebris(ctx);

    /* RAIN — foreground streaks (storm), over agents but under lens */
    if (th.rain) {
      if (!wx.drops) { wx.drops = []; for (var dr = 0; dr < 64; dr++) wx.drops.push({ x: Math.random(), y: Math.random(), sp: rand(0.9, 1.6), ln: rand(9, 17) }); }
      ctx.save(); ctx.strokeStyle = 'rgba(190,235,255,0.34)'; ctx.lineWidth = 1;
      for (var di = 0; di < wx.drops.length; di++) {
        var dp = wx.drops[di];
        dp.y += dp.sp * wdt * 1.1; dp.x -= dp.sp * wdt * 0.16;
        if (dp.y > 1.05) { dp.y = -0.05; dp.x = Math.random() * 1.15; }
        var dxx = dp.x * W, dyy = dp.y * H;
        ctx.globalAlpha = 0.18 + dp.sp * 0.14;
        ctx.beginPath(); ctx.moveTo(dxx, dyy); ctx.lineTo(dxx + dp.ln * 0.28, dyy + dp.ln); ctx.stroke();
      }
      ctx.restore();
    }

    this.drawPopups(ctx);
  };

  /* ---- terrain relief: pre-rendered per layer (rich detail, zero frame cost) ---- */
  Game.prototype.buildRidgeCache = function (W, H) {
    this._rcKey = W + 'x' + H + ':' + VARIANT;
    this._rc = [];
    for (var li = 0; li < this.layers.length; li++) {
      var cv = document.createElement('canvas');
      var dprC = Math.min(1.5, this.dpr || 1);
      cv.width = Math.max(2, Math.round(W * dprC)); cv.height = Math.max(2, Math.round(H * dprC));
      var c = cv.getContext('2d');
      if (!c) { this._rc.push(null); continue; }
      c.scale(dprC, dprC);
      try { this.paintRidgeLayer(c, li, W, H); } catch (e) {}
      this._rc.push(cv);
    }
  };

  Game.prototype.ridgePath = function (c, li, W, H) {
    var step = 5;
    c.beginPath();
    c.moveTo(-10, fin(this.ridgeY(li, -10), H));
    for (var x = 0; x <= W + 10; x += step) {
      var y = this.ridgeY(li, x); if (!isFinite(y)) y = H;
      c.lineTo(x, y);
    }
    c.lineTo(W + 10, H + 40); c.lineTo(-10, H + 40); c.closePath();
  };

  Game.prototype.paintRidgeLayer = function (c, li, W, H) {
    var th = TH(), L = this.layers[li], self = this;
    var col = (th.ridge && th.ridge[li]) || L.color;
    var lit = th.lit || '60,140,90', shade = th.shade || '2,12,6';
    var isPlay = li === this.playLayer, near = li >= this.playLayer - 1;
    var far = 1 - li / Math.max(1, this.layers.length - 1);   // 1 = farthest
    var step = 5;

    /* base silhouette */
    this.ridgePath(c, li, W, H);
    c.fillStyle = col; c.fill();

    /* everything textured stays clipped inside the mountain */
    c.save(); this.ridgePath(c, li, W, H); c.clip();

    /* slope-lit relief — light falls from the moon (upper right) */
    for (var x = -10; x <= W + 10; x += step) {
      var y0 = this.ridgeY(li, x), y1 = this.ridgeY(li, x + step);
      if (!isFinite(y0) || !isFinite(y1)) continue;
      var slope = (y1 - y0) / step;
      var litF = clamp(0.5 + slope * 1.6, 0, 1);          // right-facing slopes catch the light
      var bandH = 30 + hash1(x * 0.13 + li) * 26;
      if (litF > 0.55) {
        var la = (litF - 0.55) * (near ? 0.55 : 0.3);
        var lg = c.createLinearGradient(0, y0, 0, y0 + bandH);
        lg.addColorStop(0, 'rgba(' + lit + ',' + la.toFixed(3) + ')');
        lg.addColorStop(1, 'rgba(' + lit + ',0)');
        c.fillStyle = lg; c.fillRect(x, y0 - 1, step + 1, bandH);
      } else if (litF < 0.45) {
        var sa = (0.45 - litF) * (near ? 0.8 : 0.5);
        var sg2 = c.createLinearGradient(0, y0, 0, y0 + bandH * 1.4);
        sg2.addColorStop(0, 'rgba(' + shade + ',' + sa.toFixed(3) + ')');
        sg2.addColorStop(1, 'rgba(' + shade + ',0)');
        c.fillStyle = sg2; c.fillRect(x, y0 - 1, step + 1, bandH * 1.4);
      }
    }

    /* depth: fade the body down into darkness */
    var topY = this.ridgeY(li, W * 0.5);
    if (!isFinite(topY)) topY = H * L.baseY;
    var dg = c.createLinearGradient(0, topY, 0, H);
    dg.addColorStop(0, 'rgba(' + shade + ',0)');
    dg.addColorStop(1, 'rgba(' + shade + ',' + (near ? 0.62 : 0.45) + ')');
    c.fillStyle = dg; c.fillRect(0, 0, W, H);

    /* contour strata following the rim */
    c.lineWidth = 1;
    for (var st2 = 0; st2 < (near ? 6 : 3); st2++) {
      var off2 = 12 + st2 * 13 + hash1(li * 7 + st2) * 8;
      c.strokeStyle = 'rgba(' + shade + ',' + (0.5 - st2 * 0.06).toFixed(2) + ')';
      c.beginPath();
      for (var lx2 = -8; lx2 <= W + 8; lx2 += 14) {
        var ly2 = this.ridgeY(li, lx2) + off2 + Math.sin(lx2 * 0.05 + st2 * 2.7) * 2.2;
        if (!isFinite(ly2)) continue;
        lx2 === -8 ? c.moveTo(lx2, ly2) : c.lineTo(lx2, ly2);
      }
      c.stroke();
    }

    /* downslope scree strokes (erosion) */
    var scN = near ? 120 : 40;
    for (var sc2 = 0; sc2 < scN; sc2++) {
      var ha = hash1(sc2 * 3.1 + li * 17), hb = hash1(sc2 * 7.7 + li * 23), hc = hash1(sc2 * 12.9 + li * 5);
      var sx2 = ha * W;
      var sy0 = this.ridgeY(li, sx2), sy2 = sy0 + 5 + hb * (near ? 95 : 46);
      if (!isFinite(sy2)) continue;
      var sl2 = (this.ridgeY(li, sx2 + 6) - sy0) / 6;
      var ln2 = 3 + hc * (near ? 8 : 5);
      c.strokeStyle = hc > 0.62 ? 'rgba(' + lit + ',' + (0.12 + hc * 0.2).toFixed(2) + ')'
                                : 'rgba(' + shade + ',' + (0.2 + hb * 0.3).toFixed(2) + ')';
      c.lineWidth = hc > 0.85 ? 1.4 : 1;
      c.beginPath(); c.moveTo(sx2, sy2);
      c.lineTo(sx2 + (isFinite(sl2) ? sl2 : 0) * ln2 * 1.6 + (ha - 0.5) * 2, sy2 + ln2);
      c.stroke();
    }

    /* boulders with a lit edge (near layers) */
    if (near) {
      for (var bo = 0; bo < 13; bo++) {
        var bh1 = hash1(bo * 5.3 + li * 41), bh2 = hash1(bo * 9.1 + li * 13), bh3 = hash1(bo * 2.7 + li * 3);
        var bx2 = bh1 * W;
        var by2 = this.ridgeY(li, bx2) + 8 + bh2 * 70;
        if (!isFinite(by2)) continue;
        var br2 = 1.6 + bh3 * (isPlay ? 3.6 : 2.4);
        c.fillStyle = 'rgba(' + shade + ',0.85)';
        c.beginPath(); c.ellipse(bx2, by2, br2 * 1.25, br2, bh1 * 2, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(' + lit + ',' + (0.25 + bh3 * 0.3).toFixed(2) + ')'; c.lineWidth = 1;
        c.beginPath(); c.ellipse(bx2, by2, br2 * 1.25, br2, bh1 * 2, Math.PI * 1.05, Math.PI * 1.85); c.stroke();
      }
    }
    c.restore();   // unclip

    /* peak caps — bright crests where the ridge turns over */
    c.save(); c.globalCompositeOperation = 'lighter';
    for (var px2 = 8; px2 <= W - 8; px2 += step) {
      var pa = this.ridgeY(li, px2 - step), pb = this.ridgeY(li, px2), pc2 = this.ridgeY(li, px2 + step);
      if (!isFinite(pa) || !isFinite(pb) || !isFinite(pc2)) continue;
      if (pb < pa - 0.6 && pb < pc2 - 0.6) {
        c.globalAlpha = near ? 0.5 : 0.28;
        c.strokeStyle = 'rgba(' + lit + ',1)'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(px2 - 4, pa); c.lineTo(px2, pb); c.lineTo(px2 + 4, pc2); c.stroke();
      }
    }
    c.restore();

    /* vegetation silhouettes on the play ridge — character against the sky */
    if (isPlay && th.veg) {
      for (var vg2 = 0; vg2 < 11; vg2++) {
        var vh1 = hash1(vg2 * 13.7 + 91), vh2 = hash1(vg2 * 5.9 + 47);
        if (vh2 < 0.25) continue;
        var vx2 = 14 + vh1 * (W - 28);
        var vy2 = this.ridgeY(this.playLayer, vx2);
        if (!isFinite(vy2)) continue;
        var vhh = 7 + vh2 * 11;
        c.save(); c.strokeStyle = 'rgba(' + shade + ',0.95)'; c.fillStyle = 'rgba(' + shade + ',0.95)'; c.lineWidth = 1.4;
        if (th.veg === 'pine') {
          c.beginPath(); c.moveTo(vx2, vy2 - vhh); c.lineTo(vx2 - vhh * 0.34, vy2); c.lineTo(vx2 + vhh * 0.34, vy2); c.closePath(); c.fill();
          c.beginPath(); c.moveTo(vx2, vy2 - vhh); c.lineTo(vx2 - vhh * 0.26, vy2 - vhh * 0.4); c.lineTo(vx2 + vhh * 0.26, vy2 - vhh * 0.4); c.closePath(); c.fill();
        } else {
          c.beginPath(); c.moveTo(vx2, vy2 + 1); c.lineTo(vx2, vy2 - vhh); c.stroke();
          c.beginPath(); c.moveTo(vx2, vy2 - vhh * 0.55); c.lineTo(vx2 + vhh * 0.42 * (vh1 > 0.5 ? 1 : -1), vy2 - vhh * 0.86); c.stroke();
          c.beginPath(); c.moveTo(vx2, vy2 - vhh * 0.34); c.lineTo(vx2 - vhh * 0.36 * (vh1 > 0.5 ? 1 : -1), vy2 - vhh * 0.6); c.stroke();
          if (th.veg === 'snag') { c.beginPath(); c.moveTo(vx2, vy2 - vhh * 0.78); c.lineTo(vx2 + vhh * 0.2, vy2 - vhh * 1.02); c.stroke(); }
        }
        /* moonlit backlight on one edge */
        c.strokeStyle = 'rgba(' + lit + ',0.5)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(vx2 + 1, vy2); c.lineTo(vx2 + 1, vy2 - vhh * 0.7); c.stroke();
        c.restore();
      }
    }

    /* crisp rim: dark cut + glowing edge (baked) */
    c.save();
    c.beginPath();
    c.moveTo(-10, fin(this.ridgeY(li, -10), H));
    for (var rx = 0; rx <= W + 10; rx += step) {
      var ry = this.ridgeY(li, rx); if (!isFinite(ry)) ry = H;
      c.lineTo(rx, ry);
    }
    c.strokeStyle = 'rgba(' + shade + ',0.9)'; c.lineWidth = 2.6; c.stroke();
    c.strokeStyle = li >= this.playLayer ? th.rimHi : th.rimLo;
    c.globalAlpha = li >= this.playLayer ? 0.7 : 0.35;
    c.lineWidth = li === this.playLayer ? 1.4 : 1;
    c.shadowColor = li >= this.playLayer ? th.rimHi : th.rimLo;
    c.shadowBlur = li >= this.playLayer ? 6 : 2;
    c.stroke();
    c.restore();
  };

  Game.prototype.drawRidge = function (ctx, li, W, H) {
    var th = TH();
    var key = W + 'x' + H + ':' + VARIANT;
    if (!this._rc || this._rcKey !== key) { try { this.buildRidgeCache(W, H); } catch (e) { this._rc = null; this._rcKey = key; } }
    if (this._rc && this._rc[li]) {
      ctx.drawImage(this._rc[li], 0, 0, W, H);
    } else {
      this.ridgePath(ctx, li, W, H);
      ctx.fillStyle = (th.ridge && th.ridge[li]) || this.layers[li].color;
      ctx.fill();
    }

    /* live: lightning brightens the rims */
    var lt = (this._wx && this._wx.flash) ? this._wx.flash : 0;
    if (lt > 0.03) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = lt * 0.5;
      ctx.beginPath();
      var step = 6;
      ctx.moveTo(-10, fin(this.ridgeY(li, -10), H));
      for (var rx = 0; rx <= W + 10; rx += step) {
        var ry = this.ridgeY(li, rx); if (!isFinite(ry)) ry = H;
        ctx.lineTo(rx, ry);
      }
      ctx.strokeStyle = '#cfeeff'; ctx.lineWidth = 1.4; ctx.shadowColor = '#cfeeff'; ctx.shadowBlur = 10;
      ctx.stroke(); ctx.restore();
    }

    /* live: grass sway on the play ridge */
    if (th.grass && li === this.playLayer) {
      ctx.save();
      ctx.strokeStyle = th.rimHi; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
      var swayW = Math.sin((performance.now() / 1000) * 1.3) * 1.4;
      for (var gx = 4; gx <= W; gx += 9) {
        var h1 = hash1(gx * 0.37 + li * 9);
        if (h1 < 0.42) continue;
        var gy = this.ridgeY(li, gx);
        if (!isFinite(gy)) continue;
        var gh = 3 + h1 * 6;
        ctx.beginPath(); ctx.moveTo(gx, gy + 1);
        ctx.lineTo(gx + swayW * h1 + (h1 - 0.5) * 2, gy - gh);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  Game.prototype.drawAgent = function (ctx, a) {
    var p = this.agentScreen(a);
    if (!p || p.pop <= 0.03) return;
    var x = p.x, ridge = p.ridge, figH = p.figH;
    if (!isFinite(x) || !isFinite(ridge) || !isFinite(figH)) return;
    var pop = p.pop;
    var col = a.flash > 0 ? C.hi : C.green;

    ctx.save();
    ctx.translate(x, ridge);
    if (a.dead) {
      // ragdoll: drift + tumble as the body falls
      ctx.translate(a.deadDX || 0, a.deadDY || 0);
      ctx.rotate(a.deadRot || 0);
    }
    ctx.lineWidth = Math.max(1, figH * 0.06);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.shadowColor = C.green; ctx.shadowBlur = 5;
    ctx.globalAlpha = clamp(0.4 + pop * 0.6, 0, 1);

    if (a.dead) {
      ctx.globalAlpha *= clamp(1 - (a.deadT || 0) / 0.9, 0, 1);
    }

    if (a.fly) {
      // DRONE — diamond body + spinning rotor arms + scanning eye
      var dw = figH * 1.0;
      ctx.strokeStyle = a.flash > 0 ? C.amber : C.green; ctx.fillStyle = 'rgba(18,40,26,0.55)';
      ctx.lineWidth = Math.max(1, figH * 0.07); ctx.shadowColor = C.green; ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.moveTo(0, -figH * 0.22); ctx.lineTo(dw * 0.42, 0); ctx.lineTo(0, figH * 0.22); ctx.lineTo(-dw * 0.42, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      for (var rr = 0; rr < 2; rr++) {
        var sgn = rr ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sgn * dw * 0.58, -figH * 0.14); ctx.stroke();
        ctx.save(); ctx.translate(sgn * dw * 0.58, -figH * 0.14); ctx.globalAlpha *= 0.55;
        var blur = dw * 0.32 * (0.55 + 0.45 * Math.abs(Math.sin((a.spin || 0) + rr)));
        ctx.beginPath(); ctx.ellipse(0, 0, blur, 2.2, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = C.red; ctx.shadowColor = C.red; ctx.shadowBlur = 9;
      ctx.beginPath(); ctx.arc(0, figH * 0.12, Math.max(1.5, figH * 0.07), 0, Math.PI * 2); ctx.fill();
    } else if (a.type === 'depot') {
      // fuel depot / vehicle box with tank + hazard mark
      var w = figH * 0.9, hh = figH * 0.8;
      ctx.strokeStyle = a.flash > 0 ? C.amber : C.dim;
      ctx.fillStyle = 'rgba(20,40,26,0.6)';
      ctx.beginPath();
      ctx.rect(-w / 2, -hh * pop, w, hh * pop);
      ctx.fill(); ctx.stroke();
      // tank cylinder on top
      ctx.beginPath();
      ctx.ellipse(0, -hh * pop, w * 0.3, hh * 0.18, 0, 0, Math.PI * 2);
      ctx.strokeStyle = C.amber; ctx.stroke();
      // hazard
      ctx.fillStyle = C.amber;
      ctx.font = 'bold ' + Math.max(7, figH * 0.4) + 'px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⚠', 0, -hh * pop * 0.5);
    } else {
      // little stick agent: head + torso + arms/legs, partly hidden behind ridge
      var hClip = figH * pop;
      // clip below ridge (they hide behind it)
      ctx.beginPath();
      ctx.rect(-figH, -hClip - 4, figH * 2, hClip + 4);
      ctx.clip();
      var headR = figH * 0.16;
      var topY = -figH;
      // head
      ctx.beginPath();
      ctx.arc(0, topY + headR, headR, 0, Math.PI * 2);
      ctx.fillStyle = a.flash > 0 ? C.hi : C.green;
      ctx.fill();
      // torso
      ctx.beginPath();
      ctx.moveTo(0, topY + headR * 2);
      ctx.lineTo(0, topY + figH * 0.62);
      ctx.stroke();
      // arms
      var armY = topY + figH * 0.36;
      var swing = a.state === 'run' ? Math.sin(a.t * 12) * figH * 0.18 : 0;
      ctx.beginPath();
      ctx.moveTo(0, armY);
      ctx.lineTo(figH * 0.22 * a.dir, armY + figH * 0.12 + swing);
      ctx.moveTo(0, armY);
      ctx.lineTo(-figH * 0.12 * a.dir, armY + figH * 0.14 - swing);
      ctx.stroke();
      // legs
      var legY = topY + figH * 0.62;
      var legSw = a.state === 'run' ? Math.sin(a.t * 12) * figH * 0.22 : figH * 0.1;
      ctx.beginPath();
      ctx.moveTo(0, legY);
      ctx.lineTo(legSw, legY + figH * 0.34);
      ctx.moveTo(0, legY);
      ctx.lineTo(-legSw, legY + figH * 0.34);
      ctx.stroke();
    }
    ctx.restore();

    // hp pip for depots / damaged
    if (!a.dead && a.hp < a.maxhp && a.maxhp > 1) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      var bw = figH * 0.9;
      var by = p.top - 6;
      if (isFinite(bw) && isFinite(by)) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x - bw / 2, by, bw, 3);
        ctx.fillStyle = a.type === 'depot' ? C.amber : C.green;
        ctx.fillRect(x - bw / 2, by, bw * clamp(a.hp / a.maxhp, 0, 1), 3);
      }
      ctx.restore();
    }
  };

  Game.prototype.drawTracers = function (ctx) {
    for (var i = 0; i < this.tracers.length; i++) {
      var t = this.tracers[i];
      var a = clamp(1 - t.age / t.life, 0, 1);
      if (!isFinite(t.x0) || !isFinite(t.y0) || !isFinite(t.x1) || !isFinite(t.y1)) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.shadowColor = C.green;
      var seg = function (x0, y0, x1, y1, w, col, al, blur) {
        ctx.globalAlpha = al; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.shadowBlur = blur;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      };
      if (t.kind === 'double') {
        // MG: twin bolts — glow + hot white core
        seg(t.x0 - 3, t.y0, t.x1 - 1.5, t.y1, 2.6, C.green, a, 11);
        seg(t.x0 + 3, t.y0, t.x1 + 1.5, t.y1, 2.6, C.green, a, 11);
        seg(t.x0 - 3, t.y0, t.x1 - 1.5, t.y1, 1, '#eafff2', a, 0);
        seg(t.x0 + 3, t.y0, t.x1 + 1.5, t.y1, 1, '#eafff2', a, 0);
      } else if (t.kind === 'beam') {
        // Minigun: roaring laser — wide bloom, bright body, white core
        seg(t.x0, t.y0, t.x1, t.y1, 12, C.green, a * 0.38, 22);
        seg(t.x0, t.y0, t.x1, t.y1, 4.6, C.hi, a * 0.92, 14);
        seg(t.x0, t.y0, t.x1, t.y1, 1.8, '#f2fff7', a, 0);
      } else {
        // Assault: crisp bolt + hot core
        seg(t.x0, t.y0, t.x1, t.y1, 3, C.green, a, 12);
        seg(t.x0, t.y0, t.x1, t.y1, 1.2, '#eafff2', a, 0);
      }
      // muzzle spark at the barrel
      ctx.globalAlpha = a * 0.85; ctx.fillStyle = C.hi; ctx.shadowColor = C.green; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(t.x0, t.y0, (t.kind === 'beam' ? 4.5 : 3) * a + 1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  };

  Game.prototype.drawParticles = function (ctx) {
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (!isFinite(p.x) || !isFinite(p.y)) continue;
      var a = clamp(1 - p.t / p.life, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color; ctx.shadowBlur = 6;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.restore();
    }
  };

  Game.prototype.drawDebris = function (ctx) {
    for (var i = 0; i < this.debris.length; i++) {
      var d = this.debris[i];
      if (!isFinite(d.x) || !isFinite(d.y)) continue;
      var a = clamp(1 - d.t / d.life, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = d.color;
      ctx.shadowColor = d.color; ctx.shadowBlur = 4;
      ctx.fillRect(d.x - d.size / 2, d.y - d.size / 2, d.size, d.size);
      ctx.restore();
    }
  };

  Game.prototype.drawPopups = function (ctx) {
    for (var i = 0; i < this.popups.length; i++) {
      var p = this.popups[i];
      if (!isFinite(p.x) || !isFinite(p.y)) continue;
      var a = clamp(1 - p.t / p.life, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.big ? C.amber : C.hi;
      ctx.shadowColor = C.green; ctx.shadowBlur = 6;
      ctx.font = (p.big ? 'bold ' : '') + (p.big ? 16 : 12) + 'px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    }
  };

  /* --- Scope body: dark vignette outside the lens + glowing rim + ticks --- */
  Game.prototype.drawScopeBody = function (ctx, W, H) {
    var cx = this.aimX, cy = this.aimY, R = this.lensR;   // lens rides the moving aim point
    if (!isFinite(cx) || !isFinite(cy) || !isFinite(R) || R <= 0) return;

    // Gentle full-screen edge vignette — NOT a hard mask; the whole scene stays visible.
    var vig = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.34, W * 0.5, H * 0.5, Math.max(W, H) * 0.74);
    if (vig) {
      vig.addColorStop(0, 'rgba(2,8,5,0)');
      vig.addColorStop(0.7, 'rgba(2,8,5,0.12)');
      vig.addColorStop(1, 'rgba(2,8,5,0.6)');
      ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
    }

    // faint "glass" darkening just inside the small scope so the aim area reads as a lens
    var lens = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    if (lens) {
      lens.addColorStop(0, 'rgba(0,0,0,0)');
      lens.addColorStop(0.74, 'rgba(0,0,0,0)');
      lens.addColorStop(1, 'rgba(4,16,10,0.42)');
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = lens; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      // soft diagonal glint
      ctx.globalAlpha = 0.05; ctx.fillStyle = C.cyan;
      ctx.beginPath(); ctx.ellipse(cx - R * 0.3, cy - R * 0.35, R * 0.5, R * 0.18, -0.7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // glowing scope rim (double ring)
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = C.green; ctx.lineWidth = 2.2; ctx.shadowColor = C.green; ctx.shadowBlur = 12; ctx.globalAlpha = 0.95; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, R - 4), 0, Math.PI * 2);
    ctx.strokeStyle = C.faint; ctx.lineWidth = 1; ctx.shadowBlur = 0; ctx.globalAlpha = 0.6; ctx.stroke();
    ctx.restore();

    // tick marks around the rim
    ctx.save();
    ctx.strokeStyle = C.dim; ctx.globalAlpha = 0.5;
    for (var k = 0; k < 48; k++) {
      var ang = (k / 48) * Math.PI * 2;
      var major = (k % 4 === 0);
      var r0 = R + 2, r1 = R + (major ? 9 : 5);
      ctx.lineWidth = major ? 1.5 : 0.8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* --- MIL-DOT reticle, drawn at the moving aim point --- */
  Game.prototype.drawReticle = function (ctx) {
    var cx = this.aimX, cy = this.aimY, R = this.lensR;
    if (!isFinite(cx) || !isFinite(cy) || !isFinite(R) || R <= 0) return;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, R - 2), 0, Math.PI * 2); ctx.clip();

    ctx.strokeStyle = C.green;
    ctx.fillStyle = C.green;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1;
    ctx.shadowColor = C.green; ctx.shadowBlur = 3;

    var inner = R * 0.14;     // gap around center
    var postLen = R * 0.92;

    // Thick outer posts (top/bottom/left/right)
    ctx.lineWidth = 2.6;
    // left
    ctx.beginPath(); ctx.moveTo(cx - postLen, cy); ctx.lineTo(cx - inner * 2.4, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + postLen, cy); ctx.lineTo(cx + inner * 2.4, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - postLen); ctx.lineTo(cx, cy - inner * 2.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy + postLen); ctx.lineTo(cx, cy + inner * 2.4); ctx.stroke();

    // Fine cross near center
    ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(cx - inner * 2.4, cy); ctx.lineTo(cx - inner, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + inner, cy); ctx.lineTo(cx + inner * 2.4, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - inner * 2.4); ctx.lineTo(cx, cy - inner); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy + inner); ctx.lineTo(cx, cy + inner * 2.4); ctx.stroke();

    // Mil-dot ladders along each axis
    var dotSpace = R * 0.085;
    for (var d = 1; d <= 8; d++) {
      var off = inner * 2.4 + d * dotSpace;
      if (off > postLen) break;
      var dr = 1.5;
      ctx.beginPath(); ctx.arc(cx - off, cy, dr, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + off, cy, dr, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy - off, dr, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy + off, dr, 0, Math.PI * 2); ctx.fill();
    }

    // Center aiming dot
    ctx.beginPath(); ctx.arc(cx, cy, 1.6, 0, Math.PI * 2); ctx.fillStyle = C.hi; ctx.fill();

    // Hit marker flash (4 corner ticks around center)
    if (this.hitMarker > 0.02) {
      ctx.globalAlpha = this.hitMarker;
      ctx.strokeStyle = C.red; ctx.lineWidth = 2.2; ctx.shadowColor = C.red; ctx.shadowBlur = 6;
      var hg = inner * 1.3, hl = inner * 0.9;
      for (var s = 0; s < 4; s++) {
        var dx = (s < 2 ? -1 : 1), dy = (s % 2 === 0 ? -1 : 1);
        ctx.beginPath();
        ctx.moveTo(cx + dx * hg, cy + dy * (hg + hl));
        ctx.lineTo(cx + dx * hg, cy + dy * hg);
        ctx.lineTo(cx + dx * (hg + hl), cy + dy * hg);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  Game.prototype.drawMuzzleFlash = function (ctx) {
    var cx = this.aimX, cy = this.aimY, R = this.lensR;
    if (!isFinite(cx) || !isFinite(cy) || !isFinite(R) || R <= 0) return;
    var f = clamp(this.flash, 0, 2.4);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, R - 2), 0, Math.PI * 2); ctx.clip();
    // bottom-center bloom (muzzle just below view)
    var mx = cx, my = cy + R * 0.6;
    var rad = R * (0.25 + f * 0.18);
    if (isFinite(mx) && isFinite(my) && isFinite(rad) && rad > 0) {
      var gg = ctx.createRadialGradient(mx, my, 0, mx, my, rad);
      gg.addColorStop(0, 'rgba(160,255,190,' + clamp(0.5 * f, 0, 0.7) + ')');
      gg.addColorStop(0.4, 'rgba(65,255,126,' + clamp(0.22 * f, 0, 0.4) + ')');
      gg.addColorStop(1, 'rgba(65,255,126,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(mx - rad, my - rad, rad * 2, rad * 2);
    }
    ctx.restore();
  };

  Game.prototype.drawBlooms = function (ctx) {
    for (var i = 0; i < this.blooms.length; i++) {
      var b = this.blooms[i];
      var t = clamp(b.t / b.life, 0, 1);
      var r = lerp(b.r0, b.r1, ease(t));
      var a = (1 - t);
      if (!isFinite(b.x) || !isFinite(b.y) || !isFinite(r) || r <= 0) continue;
      ctx.save();
      // full-screen wash
      ctx.globalAlpha = a * 0.25;
      ctx.fillStyle = C.hi;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
      var gg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      gg.addColorStop(0, 'rgba(220,255,235,' + (a * 0.8) + ')');
      gg.addColorStop(0.3, 'rgba(125,255,176,' + (a * 0.5) + ')');
      gg.addColorStop(0.7, 'rgba(255,210,74,' + (a * 0.3) + ')');
      gg.addColorStop(1, 'rgba(255,107,90,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);
      ctx.restore();
    }
  };

  /* Expanding shockwave rings from kills & explosions. */
  Game.prototype.drawRings = function (ctx) {
    for (var i = 0; i < this.rings.length; i++) {
      var rn = this.rings[i];
      var t = clamp(rn.t / rn.life, 0, 1);
      var r = lerp(rn.r0, rn.r1, ease(t));
      var a = (1 - t);
      if (!isFinite(rn.x) || !isFinite(rn.y) || !isFinite(r) || r <= 0) continue;
      ctx.save();
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = rn.col || C.green;
      ctx.lineWidth = Math.max(0.5, (rn.lw || 2) * (1 - t * 0.6));
      ctx.shadowColor = rn.col || C.green; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(rn.x, rn.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  };

  /* FOCUS bullet-time screen treatment: activation flash + cool edge vignette. */
  Game.prototype.drawFocusFX = function (ctx, W, H) {
    ctx.save();
    if (this.focusFlash > 0) {
      ctx.globalAlpha = this.focusFlash * 0.5;
      ctx.fillStyle = C.hi;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (this.focusActive) {
      var cx = this.cx, cy = this.cy;
      var pulse = 0.5 + 0.5 * Math.sin(this.swayT * 8);
      var maxR = Math.hypot(W, H) * 0.62;
      if (isFinite(cx) && isFinite(cy) && this.lensR > 0) {
        var g = ctx.createRadialGradient(cx, cy, this.lensR * 1.2, cx, cy, maxR);
        g.addColorStop(0, 'rgba(0,20,18,0)');
        g.addColorStop(1, 'rgba(0,28,30,' + (0.45 + pulse * 0.12) + ')');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.globalAlpha = 0.06 + pulse * 0.03;
      ctx.fillStyle = C.cyan;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  /* ------------------------------------------------------------------ *
   * HUD — top, clear.
   * ------------------------------------------------------------------ */
  Game.prototype.drawHUD = function (ctx, W, H) {
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.shadowColor = C.green; ctx.shadowBlur = 4;

    // Title (indented past the top-left SND button)
    ctx.fillStyle = C.green; ctx.font = '600 14px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('DEEP SCOPE // OVERWATCH', 96, 14);

    // Score + wave (center-top)
    ctx.textAlign = 'center';
    ctx.fillStyle = C.hi; ctx.font = '700 22px ' + FONT;
    ctx.fillText(this.padScore(this.score), W * 0.5, 12);
    ctx.fillStyle = C.dim; ctx.font = '11px ' + FONT;
    ctx.fillText('SCORE', W * 0.5, 38);

    // Wave + progress (left under title, also clear of the SND button)
    ctx.textAlign = 'left';
    ctx.fillStyle = C.amber; ctx.font = '600 13px ' + FONT;
    ctx.fillText('WAVE ' + this.wave, 96, 36);
    var pw = 90, ppx = 164, ppy = 40;
    ctx.fillStyle = 'rgba(20,40,26,0.7)';
    ctx.fillRect(ppx, ppy, pw, 5);
    ctx.fillStyle = C.amber;
    ctx.fillRect(ppx, ppy, pw * clamp(this.killsThisWave / this.killsNeeded, 0, 1), 5);

    // Magnification (top-right, left of the EXIT button)
    ctx.textAlign = 'right';
    ctx.fillStyle = C.cyan; ctx.font = '600 16px ' + FONT;
    ctx.fillText(this.zoom.toFixed(1) + 'x', W - 118, 16);
    ctx.fillStyle = C.dim; ctx.font = '10px ' + FONT;
    ctx.fillText('MAG', W - 118, 36);

    // Combo
    if (this.combo > 1) {
      ctx.textAlign = 'center';
      var mult = 1 + Math.min(8, this.combo - 1) * 0.25;
      ctx.fillStyle = C.amber; ctx.font = '700 15px ' + FONT;
      ctx.fillText('x' + mult.toFixed(2) + '  COMBO ' + this.combo, W * 0.5, 56);
    }

    // Combo callout (DOUBLE / TRIPLE KILL …) — punchy mid-upper banner
    if (this.callout) {
      var ct = this.callout.t / this.callout.life;            // 0..1
      var cA = ct < 0.15 ? ct / 0.15 : clamp(1 - (ct - 0.15) / 0.85, 0, 1);
      var cpop = 1 + (ct < 0.18 ? (0.18 - ct) / 0.18 * 0.5 : 0);
      ctx.save();
      ctx.globalAlpha = cA;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.translate(W * 0.5, Math.max(H * 0.2, 116));   // keep clear of the top HUD readouts on short screens
      ctx.scale(cpop, cpop);
      ctx.fillStyle = C.amber; ctx.font = '800 30px ' + FONT;
      ctx.shadowColor = C.amber; ctx.shadowBlur = 20;
      ctx.fillText(this.callout.text, 0, 0);
      ctx.restore();
    }

    // FOCUS active indicator (pulsing, under score)
    if (this.focusActive) {
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      var fp = 0.6 + 0.4 * Math.sin(this.swayT * 8);
      ctx.globalAlpha = fp;
      ctx.fillStyle = C.cyan; ctx.font = '700 13px ' + FONT;
      ctx.shadowColor = C.cyan; ctx.shadowBlur = 10;
      // sits below the combo line when one is showing, else takes the combo slot
      ctx.fillText('◆ FOCUS ' + Math.ceil(this.focusT) + 's', W * 0.5, this.combo > 1 ? 74 : 56);
      ctx.restore();
    }

    // Kill feed (left, mid-upper)
    ctx.textAlign = 'left';
    ctx.font = '11px ' + FONT;
    for (var i = 0; i < this.feed.length; i++) {
      var fe = this.feed[i];
      var fa = clamp(1 - fe.t / 4, 0, 1);
      ctx.globalAlpha = fa;
      ctx.fillStyle = fe.text.indexOf('HEADSHOT') >= 0 ? C.hi : (fe.text.indexOf('DEPOT') >= 0 ? C.amber : C.dim);
      ctx.fillText('› ' + fe.text, 16, 70 + i * 16);
    }
    ctx.globalAlpha = 1;

    // Wave banner (center)
    if (this.waveBanner > 0) {
      var ba = clamp(this.waveBanner > 2 ? (2.6 - this.waveBanner) * 3 : this.waveBanner, 0, 1);
      ctx.globalAlpha = ba;
      ctx.textAlign = 'center';
      ctx.fillStyle = C.amber; ctx.font = '700 38px ' + FONT;
      ctx.shadowBlur = 18;
      ctx.fillText(this.waveBannerText, W * 0.5, H * 0.32);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  };

  /* Left-pad the score to 6 digits without relying on String.padStart. */
  Game.prototype.padScore = function (n) {
    var s = String(Math.max(0, Math.floor(fin(n, 0))));
    while (s.length < 6) s = '0' + s;
    return s;
  };

  /* ------------------------------------------------------------------ *
   * CONTROLS — fire, zoom slider, gun-select, +/- zoom (aim = drag anywhere).
   * Also (re)populates this.uiHotspots for hit-testing.
   * ------------------------------------------------------------------ */
  Game.prototype.drawControls = function (ctx, W, H) {
    this.uiHotspots.length = 0;
    var self = this;
    var pad = Math.max(18, Math.min(W, H) * 0.05);

    /* ---- Gun-select buttons (bottom-center cluster) ---- */
    var keys = ['rifle', 'mg', 'minigun'];
    var gbW = clamp(W * 0.12, 78, 120), gbH = clamp(Math.min(W, H) * 0.06, 44, 54), gap = 8;
    var gx0 = W * 0.5 - (gbW * 3 + gap * 2) / 2;
    var gy = H - pad - gbH;
    for (var i = 0; i < 3; i++) {
      var g = GUNS[keys[i]];
      var bx = gx0 + i * (gbW + gap);
      var active = this.gun.key === keys[i];
      ctx.save();
      ctx.globalAlpha = active ? 1 : 0.6;
      ctx.fillStyle = active ? 'rgba(65,255,126,0.18)' : 'rgba(10,22,14,0.6)';
      ctx.strokeStyle = active ? C.green : C.faint;
      ctx.lineWidth = active ? 1.8 : 1;
      this.roundRect(ctx, bx, gy, gbW, gbH, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = active ? C.hi : C.dim;
      ctx.font = '600 11px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(g.label, bx + gbW / 2, gy + gbH / 2);
      ctx.restore();
      (function (key, x, y, w, h) {
        self.uiHotspots.push({ kind: 'gun', x: x, y: y, w: w, h: h, action: function () { self.setGun(key); } });
      })(keys[i], bx, gy, gbW, gbH);
    }

    /* ---- Zoom +/- buttons (bottom-center, just above gun row) ---- */
    var zbS = clamp(Math.min(W, H) * 0.085, 44, 58);
    var zby = gy - zbS - 10;
    var zMinusX = W * 0.5 - zbS - 60, zPlusX = W * 0.5 + 60;
    this.drawZoomBtn(ctx, zMinusX, zby, zbS, '−');
    this.drawZoomBtn(ctx, zPlusX, zby, zbS, '+');
    (function () {
      self.uiHotspots.push({ kind: 'zm', x: zMinusX, y: zby, w: zbS, h: zbS, action: function () { self.nudgeZoom(-1); } });
      self.uiHotspots.push({ kind: 'zp', x: zPlusX, y: zby, w: zbS, h: zbS, action: function () { self.nudgeZoom(1); } });
    })();
    // ZOOM label between them
    ctx.save();
    ctx.fillStyle = C.dim; ctx.font = '10px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ZOOM', W * 0.5, zby + zbS / 2 - 8);
    ctx.fillStyle = C.cyan; ctx.font = '600 13px ' + FONT;
    ctx.fillText(this.zoom.toFixed(1) + 'x', W * 0.5, zby + zbS / 2 + 10);
    ctx.restore();

    /* ---- Zoom slider (right edge, above fire) ---- */
    this.drawZoomSlider(ctx);

    /* ---- Fire button (bottom-right) ---- */
    this.drawFireButton(ctx);

    /* ---- FOCUS (bullet-time) button, left of fire ---- */
    this.drawFocusButton(ctx);

    /* ---- Heat / ammo readout above fire ---- */
    this.drawGunStatus(ctx, W, H);
  };

  Game.prototype.roundRect = function (ctx, x, y, w, h, r) {
    w = Math.max(0, w); h = Math.max(0, h);
    r = Math.min(r, w / 2, h / 2);
    if (!isFinite(r) || r < 0) r = 0;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  Game.prototype.drawZoomBtn = function (ctx, x, y, s, label) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,22,14,0.65)';
    ctx.strokeStyle = C.dim; ctx.lineWidth = 1.4;
    this.roundRect(ctx, x, y, s, s, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.green; ctx.font = '700 26px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = C.green; ctx.shadowBlur = 6;
    ctx.fillText(label, x + s / 2, y + s / 2 + 1);
    ctx.restore();
  };

  Game.prototype.drawZoomSlider = function (ctx) {
    var zs = this.zoomSlider;
    if (!isFinite(zs.x) || !isFinite(zs.y) || !(zs.h > 0) || !(zs.w > 0)) return;
    ctx.save();
    // track
    ctx.fillStyle = 'rgba(10,22,14,0.6)';
    ctx.strokeStyle = C.faint; ctx.lineWidth = 1;
    this.roundRect(ctx, zs.x, zs.y, zs.w, zs.h, zs.w / 2); ctx.fill(); ctx.stroke();
    // fill from bottom up to current
    var t = clamp((this.zoom - 2) / 10, 0, 1);
    var knobY = zs.y + (1 - t) * zs.h;
    ctx.fillStyle = 'rgba(65,255,126,0.18)';
    this.roundRect(ctx, zs.x, knobY, zs.w, Math.max(0, zs.y + zs.h - knobY), zs.w / 2); ctx.fill();
    // ticks
    ctx.strokeStyle = C.faint; ctx.globalAlpha = 0.6;
    for (var k = 0; k <= 10; k++) {
      var ty = zs.y + (k / 10) * zs.h;
      ctx.lineWidth = (k % 5 === 0) ? 1.4 : 0.7;
      ctx.beginPath(); ctx.moveTo(zs.x + 4, ty); ctx.lineTo(zs.x + zs.w - 4, ty); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // knob
    ctx.fillStyle = this.zoomSlider.dragging ? C.hi : C.green;
    ctx.strokeStyle = C.ink;
    ctx.shadowColor = C.green; ctx.shadowBlur = 8;
    this.roundRect(ctx, zs.x - 3, knobY - 8, zs.w + 6, 16, 6); ctx.fill();
    // label
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.dim; ctx.font = '9px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('ZOOM', zs.x + zs.w / 2, zs.y - 6);
    ctx.restore();
  };

  Game.prototype.drawFireButton = function (ctx) {
    var fb = this.fireBtn;
    if (!isFinite(fb.x) || !isFinite(fb.y) || !(fb.r > 0)) return;
    var down = fb.active;
    ctx.save();
    // outer ring
    ctx.beginPath(); ctx.arc(fb.x, fb.y, fb.r, 0, Math.PI * 2);
    ctx.fillStyle = down ? 'rgba(255,107,90,0.28)' : 'rgba(40,16,12,0.55)';
    ctx.fill();
    ctx.strokeStyle = down ? C.red : '#a8523f';
    ctx.lineWidth = down ? 3 : 2;
    ctx.shadowColor = C.red; ctx.shadowBlur = down ? 16 : 6;
    ctx.stroke();
    // inner
    ctx.beginPath(); ctx.arc(fb.x, fb.y, fb.r * 0.66, 0, Math.PI * 2);
    ctx.strokeStyle = down ? C.red : '#c66'; ctx.lineWidth = 1.2; ctx.shadowBlur = 0;
    ctx.stroke();
    // label
    ctx.fillStyle = down ? '#fff' : C.red;
    ctx.font = '700 18px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = C.red; ctx.shadowBlur = down ? 10 : 4;
    ctx.fillText('FIRE', fb.x, fb.y);
    // spin indicator for minigun
    if (this.gun.spinup && this.spin > 0.02) {
      ctx.beginPath();
      ctx.arc(fb.x, fb.y, fb.r * 0.85, -Math.PI / 2, -Math.PI / 2 + this.spin * Math.PI * 2);
      ctx.strokeStyle = C.amber; ctx.lineWidth = 3; ctx.shadowColor = C.amber; ctx.shadowBlur = 8;
      ctx.stroke();
    }
    // sublabel
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.dim; ctx.font = '10px ' + FONT; ctx.textBaseline = 'top';
    ctx.fillText('FIRE', fb.x, fb.y + fb.r + 6);
    ctx.restore();
  };

  Game.prototype.drawFocusButton = function (ctx) {
    var fb = this.fireBtn;
    if (!isFinite(fb.x) || !isFinite(fb.y) || !(fb.r > 0)) return;
    var fr = fb.r * 0.6;
    var fx = fb.x - fb.r - fr - 12;
    var fy = fb.y;
    if (!isFinite(fx)) return;
    var ready = this.focus >= 0.4 && !this.focusActive;
    var charge = this.focusActive ? (this.focusT / Math.max(0.001, this.focusDur)) : this.focus;
    ctx.save();
    // base disc
    ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.fillStyle = this.focusActive ? 'rgba(125,247,255,0.20)' : (ready ? 'rgba(125,247,255,0.14)' : 'rgba(10,22,24,0.55)');
    ctx.fill();
    ctx.strokeStyle = (this.focusActive || ready) ? C.cyan : C.faint;
    ctx.lineWidth = (this.focusActive || ready) ? 2.4 : 1.4;
    ctx.shadowColor = C.cyan; ctx.shadowBlur = (this.focusActive || ready) ? 12 : 0;
    ctx.stroke();
    // charge / countdown arc
    ctx.beginPath();
    ctx.arc(fx, fy, fr * 0.78, -Math.PI / 2, -Math.PI / 2 + clamp(charge, 0, 1) * Math.PI * 2);
    ctx.strokeStyle = this.focusActive ? C.hi : C.cyan; ctx.lineWidth = 3.2;
    ctx.shadowColor = C.cyan; ctx.shadowBlur = 8;
    ctx.stroke();
    // label
    ctx.shadowBlur = 0;
    ctx.fillStyle = this.focusActive ? C.hi : (ready ? C.cyan : C.dim);
    ctx.font = '700 12px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.focusActive ? 'SLOW' : 'FOCUS', fx, fy);
    // sublabel
    ctx.fillStyle = C.dim; ctx.font = '9px ' + FONT; ctx.textBaseline = 'top';
    ctx.fillText(ready ? 'READY' : (this.focusActive ? '' : Math.round(charge * 100) + '%'), fx, fy + fr + 4);
    ctx.restore();
    var self = this;
    this.uiHotspots.push({ kind: 'focus', x: fx - fr, y: fy - fr, w: fr * 2, h: fr * 2, action: function () { self.activateFocus(); } });
  };

  Game.prototype.drawGunStatus = function (ctx, W, H) {
    var fb = this.fireBtn;
    if (!isFinite(fb.x) || !isFinite(fb.y) || !(fb.r > 0)) return;
    var bx = fb.x - fb.r, by = fb.y - fb.r - 30, bw = fb.r * 2, bh = 8;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = C.hi; ctx.font = '600 12px ' + FONT;
    ctx.fillText(this.gun.name, fb.x, by - 4);

    // ammo or heat bar
    ctx.fillStyle = 'rgba(10,22,14,0.7)';
    this.roundRect(ctx, bx, by, bw, bh, 3); ctx.fill();

    if (this.gun.spinup) {
      // heat bar
      var hcol = this.overheated ? C.red : (this.heat > 0.7 ? C.amber : C.green);
      ctx.fillStyle = hcol;
      this.roundRect(ctx, bx, by, bw * clamp(this.heat, 0, 1), bh, 3); ctx.fill();
      ctx.fillStyle = C.dim; ctx.font = '9px ' + FONT; ctx.textBaseline = 'top';
      ctx.fillText(this.overheated ? 'OVERHEATED' : 'HEAT', fb.x, by + bh + 2);
    } else if (this.gun.heatPerShot) {
      // mg: show heat under ammo too
      var ammoT = this.reloading > 0 ? (1 - this.reloading / this.gun.reload) : (this.ammo / this.gun.mag);
      ctx.fillStyle = this.reloading > 0 ? C.amber : C.green;
      this.roundRect(ctx, bx, by, bw * clamp(ammoT, 0, 1), bh, 3); ctx.fill();
      ctx.fillStyle = C.dim; ctx.font = '9px ' + FONT; ctx.textBaseline = 'top';
      ctx.fillText(this.reloading > 0 ? 'RELOAD' : (this.ammo + ' / ' + this.gun.mag), fb.x, by + bh + 2);
    } else {
      var at = this.reloading > 0 ? (1 - this.reloading / this.gun.reload) : (this.ammo / this.gun.mag);
      ctx.fillStyle = this.reloading > 0 ? C.amber : C.green;
      this.roundRect(ctx, bx, by, bw * clamp(at, 0, 1), bh, 3); ctx.fill();
      ctx.fillStyle = C.dim; ctx.font = '9px ' + FONT; ctx.textBaseline = 'top';
      ctx.fillText(this.reloading > 0 ? 'RELOAD' : (this.ammo + ' / ' + this.gun.mag), fb.x, by + bh + 2);
    }
    ctx.restore();
  };

  /* CRT scanlines + outer vignette overlay. */
  Game.prototype.drawCRT = function (ctx, W, H) {
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#000';
    for (var y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    ctx.restore();
    // subtle outer vignette
    var r0 = Math.min(W, H) * 0.35, r1 = Math.max(W, H) * 0.7;
    if (isFinite(r0) && isFinite(r1) && r1 > 0) {
      var vg = ctx.createRadialGradient(W / 2, H / 2, r0, W / 2, H / 2, r1);
      if (vg) {
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      }
    }
  };

  /* ==================================================================== *
   * MAIN LOOP
   * ==================================================================== */
  Game.prototype.loop = function (t) {
    if (!this.running) return;
    var self = this;
    if (!this.lastT) this.lastT = t;
    var dt = (t - this.lastT) / 1000;
    this.lastT = t;
    if (!isFinite(dt)) dt = 0;
    dt = Math.min(0.05, Math.max(0, dt));

    try { this.update(dt); } catch (e) { /* keep running */ }
    try { this.render(); } catch (e) { try { this.ctx.restore(); } catch (e2) {} }

    this.rafId = requestAnimationFrame(function (tt) { self.loop(tt); });
  };

  /* ==================================================================== *
   * PREVIEW (attract mode) — calm idle scope into a small panel canvas.
   * ==================================================================== */
  Game.prototype.mountPreview = function (canvasEl) {
    if (!canvasEl) return;
    if (this.previewRAF) cancelAnimationFrame(this.previewRAF);
    this.previewCanvas = canvasEl;
    this.previewCtx = canvasEl.getContext('2d');
    if (!this.previewCtx) { this.previewRAF = 0; return; }
    var self = this;
    this.previewT = 0;
    var last = 0, pvLast = 0;
    /* cache the canvas size (no per-frame getBoundingClientRect) + a visibility flag */
    this._pvVis = true;
    var measure = function () { var r = canvasEl.getBoundingClientRect(); self._pvW = r.width; self._pvH = r.height; };
    measure();
    try { if (self._pvRO) self._pvRO.disconnect(); if (window.ResizeObserver) { self._pvRO = new ResizeObserver(measure); self._pvRO.observe(canvasEl); } } catch (e) {}
    try { if (self._pvIO) self._pvIO.disconnect(); if (window.IntersectionObserver) { self._pvIO = new IntersectionObserver(function (es) { self._pvVis = es[0].isIntersecting; }, { rootMargin: '140px' }); self._pvIO.observe(canvasEl); } } catch (e) {}
    function frame(t) {
      if (self.previewCanvas !== canvasEl) return; // remounted elsewhere
      if (!document.body.contains(canvasEl)) { self.previewRAF = 0; return; }
      self.previewRAF = requestAnimationFrame(frame);
      if (document.hidden || self._pvVis === false) { last = t; return; } // pause when hidden / scrolled offscreen
      if (t - pvLast < 33) return; pvLast = t;     // ~30fps
      if (!last) last = t;
      var dt = Math.min(0.05, Math.max(0, (t - last) / 1000)); last = t;
      if (!isFinite(dt)) dt = 0;
      self.previewT += dt;
      try { self.renderPreview(canvasEl, dt); } catch (e) {}
    }
    this.previewRAF = requestAnimationFrame(frame);
  };

  Game.prototype.renderPreview = function (cv, dt) {
    var rw = isFinite(this._pvW) ? this._pvW : 0;   // cached size — no layout read in the loop
    var rh = isFinite(this._pvH) ? this._pvH : 0;
    var W = Math.max(40, Math.floor(rw || 280));
    var H = Math.max(40, Math.floor(rh || 160));
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!isFinite(dpr) || dpr <= 0) dpr = 1;
    if (cv.width !== Math.floor(W * dpr) || cv.height !== Math.floor(H * dpr)) {
      cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr);
    }
    var ctx = this.previewCtx;
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // ===== ATTRACT SCREEN: overwatch splash + hunting reticle + lock + radar =====
    var t = this.previewT;
    var sc = H / 130;
    var TAU = Math.PI * 2;
    var pv = this._pv;
    if (!pv) {
      pv = this._pv = { swarm: [], rings: [], emb: [], streak: [], retX: W * 0.5, retY: H * 0.3, tgt: null, fire: 0, acq: 0, radar: 0 };
      for (var i = 0; i < 8; i++) pv.swarm.push({ x: rand(0, W), y: rand(H * 0.15, H * 0.46), s: rand(0.7, 1.2) * sc, ph: rand(0, TAU), dr: Math.random() < 0.5 ? -1 : 1, fly: Math.random() < 0.6, alive: true, dead: 0 });
    }
    var horizon = H * 0.66;
    function rg(x, seed, baseY, amp) { var n = Math.sin(x * 0.0075 + seed) * 0.55 + Math.sin(x * 0.019 + seed * 1.7) * 0.3 + Math.sin(x * 0.045 + seed * 2.6) * 0.15; return baseY * H - n * amp * H; }
    function ridge(seed, baseY, amp, fill, alpha) { ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(0, H); for (var x = 0; x <= W; x += 4) ctx.lineTo(x, rg(x, seed, baseY, amp)); ctx.lineTo(W, H); ctx.closePath(); ctx.fill(); ctx.restore(); }

    // sky — theme-aware lit night
    var pvMap = {
      recon: { sky: ['#03241a', '#06381f', '#0a5030', '#0c5e38'], glow: '65,255,126', far: '#0e4226', near: '#08260f', moon: '#12492a', moonRim: '#7dffb0' },
      storm: { sky: ['#06141c', '#092030', '#0d3038', '#0d3a2a'], glow: '125,220,255', far: '#0d3a3a', near: '#07242a', moon: '#1a3a48', moonRim: '#a8e2f0' },
      blood: { sky: ['#1c0708', '#2c0e08', '#421a0a', '#33200c'], glow: '255,100,55', far: '#3a1a10', near: '#1c0c08', moon: '#5a1608', moonRim: '#ff9a6a' }
    };
    var PV = pvMap[VARIANT] || pvMap.recon;
    var skg = ctx.createLinearGradient(0, 0, 0, H);
    skg.addColorStop(0, PV.sky[0]); skg.addColorStop(0.5, PV.sky[1]); skg.addColorStop(0.8, PV.sky[2]); skg.addColorStop(1, PV.sky[3]);
    ctx.fillStyle = skg; ctx.fillRect(0, 0, W, H);
    // themed moon
    (function () {
      var mr = H * (VARIANT === 'blood' ? 0.17 : 0.12), mmx = W * 0.78, mmy = H * 0.2;
      var mgl = ctx.createRadialGradient(mmx, mmy, 0, mmx, mmy, mr * 3);
      mgl.addColorStop(0, 'rgba(' + PV.glow + ',0.22)'); mgl.addColorStop(1, 'rgba(' + PV.glow + ',0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = mgl;
      ctx.beginPath(); ctx.arc(mmx, mmy, mr * 3, 0, 6.283); ctx.fill(); ctx.restore();
      ctx.save(); ctx.fillStyle = PV.moon; ctx.strokeStyle = PV.moonRim; ctx.lineWidth = 1.2;
      ctx.shadowColor = PV.moonRim; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(mmx, mmy, mr, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.7; ctx.stroke();
      ctx.globalAlpha = 0.22; ctx.fillStyle = PV.moonRim;
      ctx.beginPath(); ctx.arc(mmx - mr * 0.3, mmy - mr * 0.15, mr * 0.2, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(mmx + mr * 0.25, mmy + mr * 0.3, mr * 0.13, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
      var prc = VARIANT === 'blood' ? '#ffca8a' : (VARIANT === 'storm' ? '#a8e2f0' : '#9fffc4');
      ctx.strokeStyle = prc; ctx.shadowColor = prc;
      ctx.shadowBlur = 6; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.ellipse(mmx, mmy, mr * 1.9, mr * 0.58, -0.42, 0, Math.PI); ctx.stroke();
      ctx.globalAlpha = 0.26;
      ctx.beginPath(); ctx.ellipse(mmx, mmy, mr * 1.9, mr * 0.58, -0.42, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.1; ctx.globalAlpha = 0.32;
      ctx.beginPath(); ctx.ellipse(mmx, mmy, mr * 2.25, mr * 0.7, -0.42, 0, Math.PI); ctx.stroke();
      ctx.restore();
    })();
    /* preview nebula + periodic shooting star (sky only) */
    (function () {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      var nc = VARIANT === 'blood' ? '255,85,45' : (VARIANT === 'storm' ? '130,210,255' : '65,230,160');
      var ng = ctx.createRadialGradient(W * 0.22, H * 0.16, 0, W * 0.22, H * 0.16, W * 0.26);
      ng.addColorStop(0, 'rgba(' + nc + ',0.09)'); ng.addColorStop(1, 'rgba(' + nc + ',0)');
      ctx.fillStyle = ng; ctx.fillRect(0, 0, W, horizon - 4);
      ctx.restore();
      pv.pshT = (pv.pshT === undefined ? rand(2, 5) : pv.pshT - dt);
      if (pv.pshT <= 0) { pv.pshT = rand(4, 8); pv.psh = { x: rand(W * 0.1, W * 0.7), y: rand(6, horizon * 0.4), t: 0 }; }
      if (pv.psh) {
        var ps = pv.psh; ps.t += dt; var pu = ps.t / 0.6;
        if (pu >= 1) pv.psh = null;
        else {
          var pxx = ps.x + pu * 130, pyy = ps.y + pu * 46;
          if (pyy < horizon - 8) {
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - pu) * 0.85;
            var pg2 = ctx.createLinearGradient(pxx - 46, pyy - 16, pxx, pyy);
            pg2.addColorStop(0, 'rgba(230,255,240,0)'); pg2.addColorStop(1, '#eaffee');
            ctx.strokeStyle = pg2; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.moveTo(pxx - 46, pyy - 16); ctx.lineTo(pxx, pyy); ctx.stroke(); ctx.restore();
          }
        }
      }
    })();
    // ambient phosphor glow rising from the horizon (additive)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var skglow = ctx.createRadialGradient(W * 0.5, horizon, 0, W * 0.5, horizon, Math.max(W, H) * 0.85);
    skglow.addColorStop(0, 'rgba(' + PV.glow + ',0.16)'); skglow.addColorStop(0.6, 'rgba(' + PV.glow + ',0.05)'); skglow.addColorStop(1, 'rgba(' + PV.glow + ',0)');
    ctx.fillStyle = skglow; ctx.fillRect(0, 0, W, H); ctx.restore();
    // stars — brighter + bloom, a few bright cyan
    if (!this._pvStars) { this._pvStars = []; for (var s2 = 0; s2 < 46; s2++) this._pvStars.push([Math.random(), Math.random() * 0.7, Math.random()]); }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (var si = 0; si < this._pvStars.length; si++) { var st = this._pvStars[si]; var stx = st[0] * W, sty = st[1] * horizon; if (sty > horizon - 5) continue; var tw = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.4 + st[2] * 9)); var big = st[2] > 0.85; ctx.globalAlpha = tw * (big ? 1 : 0.85); ctx.fillStyle = st[2] > 0.9 ? C.cyan : (st[2] > 0.6 ? C.hi : C.green); ctx.shadowColor = big ? C.cyan : C.green; ctx.shadowBlur = big ? 5 : 2; ctx.fillRect(stx, sty, big ? 1.8 : 1.2, big ? 1.8 : 1.2); }
    ctx.restore();
    // glowing horizon band (the Voice-Scope move)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var hbnd = ctx.createLinearGradient(0, horizon - 18 * sc, 0, horizon + 12 * sc);
    hbnd.addColorStop(0, 'rgba(' + PV.glow + ',0)'); hbnd.addColorStop(0.5, 'rgba(' + PV.glow + ',0.34)'); hbnd.addColorStop(1, 'rgba(' + PV.glow + ',0)');
    ctx.fillStyle = hbnd; ctx.fillRect(0, horizon - 18 * sc, W, 30 * sc); ctx.restore();

    ridge(17, 0.68, 0.12, PV.far, 0.9);

    // respawn killed targets + pick the next one
    for (var sj = 0; sj < pv.swarm.length; sj++) { var sw = pv.swarm[sj]; if (!sw.alive) { sw.dead += dt; if (sw.dead > 0.7) { sw.alive = true; sw.dead = 0; sw.x = rand(0, W); sw.y = rand(H * 0.15, H * 0.46); sw.fly = Math.random() < 0.6; } } }
    if (!pv.tgt || !pv.tgt.alive) { var liv = pv.swarm.filter(function (a) { return a.alive; }); pv.tgt = liv.length ? liv[(Math.random() * liv.length) | 0] : null; pv.acq = 0; }
    if (pv.tgt) {
      pv.retX += (pv.tgt.x - pv.retX) * Math.min(1, dt * 4); pv.retY += (pv.tgt.y - pv.retY) * Math.min(1, dt * 4);
      var near = Math.hypot(pv.tgt.x - pv.retX, pv.tgt.y - pv.retY);
      if (near < 14 * sc) pv.acq = Math.min(1, pv.acq + dt * 3);
      if (near < 6 * sc && pv.fire <= 0 && pv.acq > 0.6) {
        pv.fire = 0.34; pv.tgt.alive = false; pv.tgt.dead = 0.001;
        pv.rings.push({ x: pv.tgt.x, y: pv.tgt.y, age: 0 });
        for (var e2 = 0; e2 < 8; e2++) pv.emb.push({ x: pv.tgt.x, y: pv.tgt.y, vx: rand(-40, 40) * sc, vy: rand(-70, -10) * sc, age: 0, life: rand(0.5, 1) });
        pv.streak.push({ x0: W * 0.5, y0: H + 8, x1: pv.tgt.x, y1: pv.tgt.y, age: 0 }); pv.acq = 0;
      }
    }
    pv.fire = Math.max(0, pv.fire - dt);

    // swarm (drones / runners) — bright + glowing so they clearly read
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (var sk = 0; sk < pv.swarm.length; sk++) {
      var a = pv.swarm[sk]; if (!a.alive) continue;
      a.x += a.dr * 9 * dt * (a.s / sc); if (a.x < -12) a.x = W + 12; if (a.x > W + 12) a.x = -12;
      var yy = a.y + Math.sin(t * 2 + a.ph) * 3;
      var isTgt = (pv.tgt === a);
      ctx.save(); ctx.translate(a.x, yy); ctx.fillStyle = isTgt ? C.hi : C.green; ctx.strokeStyle = C.hi; ctx.lineWidth = 1.1; ctx.globalAlpha = 0.95; ctx.shadowColor = C.green; ctx.shadowBlur = isTgt ? 12 : 7;
      if (a.fly) {
        ctx.beginPath(); ctx.moveTo(0, -2 * a.s); ctx.lineTo(4 * a.s, 0); ctx.lineTo(0, 2 * a.s); ctx.lineTo(-4 * a.s, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6 * a.s, -1); ctx.lineTo(-3 * a.s, 0); ctx.moveTo(6 * a.s, -1); ctx.lineTo(3 * a.s, 0); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(0, -3 * a.s, 1.7 * a.s, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, -1.4 * a.s); ctx.lineTo(0, 3 * a.s); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
    // near ridge silhouette (occludes drone feet), then a glowing rim on top
    ridge(17, 0.68, 0.12, PV.near, 1);
    (function () {
      var dA = VARIANT === 'blood' ? 'rgba(14,4,2,0.7)' : (VARIANT === 'storm' ? 'rgba(3,16,14,0.7)' : 'rgba(4,20,11,0.7)');
      var dB = VARIANT === 'blood' ? 'rgba(255,150,90,0.16)' : (VARIANT === 'storm' ? 'rgba(130,220,220,0.11)' : 'rgba(90,210,130,0.12)');
      ctx.save();
      ctx.strokeStyle = dA; ctx.lineWidth = 1;
      for (var s3 = 0; s3 < 4; s3++) {
        ctx.globalAlpha = 0.5 - s3 * 0.09;
        ctx.beginPath();
        for (var gx2 = 0; gx2 <= W; gx2 += 14) {
          var gy2 = rg(gx2, 17, 0.68, 0.12) + 7 + s3 * 9 + Math.sin(gx2 * 0.04 + s3) * 1.6;
          gx2 === 0 ? ctx.moveTo(gx2, gy2) : ctx.lineTo(gx2, gy2);
        }
        ctx.stroke();
      }
      for (var d4 = 0; d4 < 40; d4++) {
        var hh1 = (Math.sin(d4 * 127.1) * 43758.5453) % 1; hh1 = hh1 < 0 ? -hh1 : hh1;
        var hh2 = (Math.sin(d4 * 311.7) * 12543.21) % 1; hh2 = hh2 < 0 ? -hh2 : hh2;
        var dx4 = hh1 * W, dy4 = rg(dx4, 17, 0.68, 0.12) + 4 + hh2 * 30;
        if (dy4 > H - 2) continue;
        ctx.globalAlpha = 0.2 + hh2 * 0.3;
        ctx.fillStyle = hh2 > 0.6 ? dB : dA;
        ctx.fillRect(dx4, dy4, 1.3 + hh1 * 1.6, 1);
      }
      ctx.restore();
    })();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75; ctx.strokeStyle = C.green; ctx.lineWidth = 1.3; ctx.shadowColor = C.green; ctx.shadowBlur = 9;
    ctx.beginPath(); for (var rrx = 0; rrx <= W; rrx += 4) { var rry = rg(rrx, 17, 0.68, 0.12); if (rrx === 0) ctx.moveTo(rrx, rry); else ctx.lineTo(rrx, rry); } ctx.stroke(); ctx.restore();

    // explosions (localized — NO full-box flash)
    for (var ri = pv.rings.length - 1; ri >= 0; ri--) {
      var r = pv.rings[ri]; r.age += dt; if (r.age > 0.6) { pv.rings.splice(ri, 1); continue; }
      var rp = r.age / 0.6, rad = (30 * rp + 4) * sc; ctx.save();
      var grd = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, rad);
      grd.addColorStop(0, 'rgba(230,255,240,' + (1 - rp) * 0.9 + ')'); grd.addColorStop(0.4, 'rgba(125,255,176,' + (1 - rp) * 0.55 + ')'); grd.addColorStop(0.72, 'rgba(255,210,74,' + (1 - rp) * 0.32 + ')'); grd.addColorStop(1, 'rgba(255,107,90,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.fill();
      ctx.globalAlpha = (1 - rp) * 0.7; ctx.strokeStyle = C.green; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(r.x, r.y, rad * 1.15, 0, TAU); ctx.stroke(); ctx.restore();
    }
    for (var ei = pv.emb.length - 1; ei >= 0; ei--) {
      var em = pv.emb[ei]; em.age += dt; if (em.age > em.life) { pv.emb.splice(ei, 1); continue; }
      em.x += em.vx * dt; em.y += em.vy * dt; em.vy += 60 * dt * sc; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, 1 - em.age / em.life); ctx.fillStyle = Math.random() < 0.4 ? C.amber : C.hi; ctx.shadowColor = C.green; ctx.shadowBlur = 5; ctx.fillRect(em.x, em.y, 1.9 * sc, 1.9 * sc); ctx.restore();
    }
    for (var ti = pv.streak.length - 1; ti >= 0; ti--) {
      var tr = pv.streak[ti]; tr.age += dt; if (tr.age > 0.12) { pv.streak.splice(ti, 1); continue; }
      ctx.save(); ctx.globalAlpha = (1 - tr.age / 0.12) * 0.9; ctx.strokeStyle = C.hi; ctx.lineWidth = 1.8; ctx.shadowColor = C.green; ctx.shadowBlur = 9;
      ctx.beginPath(); ctx.moveTo(tr.x0, tr.y0); ctx.lineTo(tr.x1, tr.y1); ctx.stroke(); ctx.restore();
    }

    // themed weather life
    if (VARIANT === 'storm') {
      if (!pv.rainD) { pv.rainD = []; for (var rd = 0; rd < 34; rd++) pv.rainD.push([Math.random(), Math.random(), rand(0.8, 1.5)]); }
      ctx.save(); ctx.strokeStyle = 'rgba(190,235,255,0.3)'; ctx.lineWidth = 1;
      for (var rdi = 0; rdi < pv.rainD.length; rdi++) {
        var rr2 = pv.rainD[rdi]; rr2[1] += rr2[2] * dt * 1.1; rr2[0] -= rr2[2] * dt * 0.15;
        if (rr2[1] > 1.05) { rr2[1] = -0.05; rr2[0] = Math.random() * 1.15; }
        ctx.globalAlpha = 0.14 + rr2[2] * 0.14;
        ctx.beginPath(); ctx.moveTo(rr2[0] * W, rr2[1] * H); ctx.lineTo(rr2[0] * W + 3, rr2[1] * H + 10); ctx.stroke();
      }
      ctx.restore();
      pv.ltT = (pv.ltT === undefined ? rand(2, 5) : pv.ltT - dt);
      if (pv.ltT <= 0) { pv.ltT = rand(3, 7); pv.ltF = 1; }
      if (pv.ltF > 0) { ctx.save(); ctx.globalAlpha = pv.ltF * 0.2; ctx.fillStyle = '#cfeeff'; ctx.fillRect(0, 0, W, horizon); ctx.restore(); pv.ltF = Math.max(0, pv.ltF - dt * 3); }
    }
    if (VARIANT === 'blood') {
      if (!pv.embR) { pv.embR = []; for (var eb2 = 0; eb2 < 16; eb2++) pv.embR.push([Math.random(), Math.random(), rand(0.05, 0.14), Math.random() * 6.28]); }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (var ebi = 0; ebi < pv.embR.length; ebi++) {
        var eb3 = pv.embR[ebi]; eb3[1] -= eb3[2] * dt; if (eb3[1] < -0.02) { eb3[1] = 1.02; eb3[0] = Math.random(); }
        ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(t * 2 + eb3[3]));
        ctx.fillStyle = ebi % 3 === 0 ? '#ffd2a0' : '#ff7a4a'; ctx.shadowColor = '#ff5a2a'; ctx.shadowBlur = 5;
        ctx.fillRect(eb3[0] * W, eb3[1] * (horizon * 0.9), 1.8, 1.8);
      }
      ctx.restore();
    }

    // dark backing so the title reads clearly over the glow (knock back the bg behind the words)
    ctx.save();
    var tbg = ctx.createRadialGradient(W * 0.5, H * 0.46, 0, W * 0.5, H * 0.46, W * 0.46);
    tbg.addColorStop(0, 'rgba(1,8,5,0.82)'); tbg.addColorStop(0.5, 'rgba(1,8,5,0.55)'); tbg.addColorStop(1, 'rgba(1,8,5,0)');
    ctx.fillStyle = tbg; ctx.fillRect(0, 0, W, H); ctx.restore();
    // TITLE — soft halo then CRISP text (no additive blow-out, so the letters stay readable)
    ctx.save(); ctx.textAlign = 'center';
    ctx.globalAlpha = 0.28; ctx.fillStyle = C.green; ctx.shadowColor = C.green; ctx.shadowBlur = 8;
    ctx.font = '800 ' + Math.round(23 * sc) + 'px ' + FONT; ctx.fillText('SNIPER SCOPE', W * 0.5, H * 0.47);
    ctx.globalAlpha = 1; ctx.fillStyle = C.hi; ctx.shadowColor = C.green; ctx.shadowBlur = 4;
    ctx.fillText('SNIPER SCOPE', W * 0.5, H * 0.47);
    ctx.font = '700 ' + Math.round(10 * sc) + 'px ' + FONT; ctx.fillStyle = C.hi; ctx.shadowBlur = 3; ctx.globalAlpha = 1;
    ctx.fillText('/ /   O V E R W A T C H', W * 0.5, H * 0.47 + 16 * sc);
    var thn = TH();
    ctx.font = '800 ' + Math.round(8.5 * sc) + 'px ' + FONT;
    ctx.fillStyle = VARIANT === 'blood' ? '#ff9a6a' : (VARIANT === 'storm' ? '#a8e2f0' : C.amber);
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6;
    ctx.fillText('\u25C6  ' + thn.name + '  \u25C6', W * 0.5, H * 0.47 + 30 * sc);
    ctx.restore();

    // hunting reticle
    ctx.save(); ctx.translate(fin(pv.retX, W * 0.5), fin(pv.retY, H * 0.3)); var rcol = pv.acq > 0.6 ? C.red : C.green; ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rcol; ctx.lineWidth = 1.7; ctx.shadowColor = rcol; ctx.shadowBlur = 11; ctx.globalAlpha = 1;
    var RR = 12 * sc; ctx.beginPath(); ctx.arc(0, 0, RR, 0, TAU); ctx.stroke();
    var angs = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    for (var qi = 0; qi < 4; qi++) { var aa = angs[qi]; ctx.beginPath(); ctx.moveTo(Math.cos(aa) * RR * 0.42, Math.sin(aa) * RR * 0.42); ctx.lineTo(Math.cos(aa) * RR * 1.5, Math.sin(aa) * RR * 1.5); ctx.stroke(); }
    if (pv.acq > 0.3) {
      var bs = (9 + (1 - pv.acq) * 14) * sc, BL = 4 * sc; ctx.strokeStyle = C.red; ctx.shadowColor = C.red; ctx.globalAlpha = pv.acq; var corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      for (var cci = 0; cci < 4; cci++) { var cnr = corners[cci]; ctx.beginPath(); ctx.moveTo(cnr[0] * bs, cnr[1] * bs - cnr[1] * BL); ctx.lineTo(cnr[0] * bs, cnr[1] * bs); ctx.lineTo(cnr[0] * bs - cnr[0] * BL, cnr[1] * bs); ctx.stroke(); }
    }
    ctx.fillStyle = C.hi; ctx.beginPath(); ctx.arc(0, 0, 1.4 * sc, 0, TAU); ctx.fill(); ctx.restore();

    // TARGET ACQUIRED (top-left)
    if (pv.acq > 0.6) { ctx.save(); var pp = 0.6 + 0.4 * Math.sin(t * 9); ctx.globalAlpha = pp; ctx.fillStyle = C.red; ctx.shadowColor = C.red; ctx.shadowBlur = 7; ctx.font = '700 ' + Math.round(9 * sc) + 'px ' + FONT; ctx.textAlign = 'left'; ctx.fillText('● TARGET ACQUIRED', 10 * sc, 14 * sc); ctx.restore(); }

    // radar (upper-right)
    pv.radar += dt * 2.2; ctx.save(); ctx.translate(W - 22 * sc, 20 * sc); var RAD = 11 * sc;
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = C.dim; ctx.lineWidth = 1.1; ctx.globalAlpha = 0.85; ctx.shadowColor = C.green; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.arc(0, 0, RAD, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, RAD * 0.55, 0, TAU); ctx.stroke();
    var sweepG = ctx.createRadialGradient(0, 0, 0, 0, 0, RAD); sweepG.addColorStop(0, 'rgba(65,255,126,0.45)'); sweepG.addColorStop(1, 'rgba(65,255,126,0)');
    ctx.fillStyle = sweepG; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, RAD, pv.radar - 0.5, pv.radar); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.hi; ctx.shadowColor = C.green; ctx.shadowBlur = 8; ctx.lineWidth = 1.4; ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(pv.radar) * RAD, Math.sin(pv.radar) * RAD); ctx.stroke();
    ctx.fillStyle = C.red; ctx.shadowColor = C.red; ctx.shadowBlur = 6; for (var bi = 0; bi < 2; bi++) { var bang = pv.radar * 0.6 + bi * 2.3, brr = RAD * (0.4 + bi * 0.3); ctx.beginPath(); ctx.arc(Math.cos(bang) * brr, Math.sin(bang) * brr, 1.6 * sc, 0, TAU); ctx.fill(); } ctx.restore();

    // DEPLOY button (throbbing)
    var dp = 0.5 + 0.5 * Math.sin(t * 2.4), bw = 108 * sc, bh = 22 * sc, bx = W * 0.5 - bw / 2, by = H - bh - 8 * sc;
    ctx.save();
    // dark button body so the label is crisp; throb lives in the glowing border, not the fill
    ctx.fillStyle = 'rgba(2,12,7,0.72)'; this.roundRect(ctx, bx, by, bw, bh, 6 * sc); ctx.fill();
    ctx.shadowColor = C.green; ctx.shadowBlur = 9 + dp * 15; ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = C.hi; ctx.font = '700 ' + Math.round(12 * sc) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('▶  DEPLOY', W * 0.5, by + bh / 2 + 1);
    var bsc = 0; try { bsc = parseInt(localStorage.getItem('ccSniperX.best.' + VARIANT) || '0', 10) || 0; } catch (e) {}
    if (bsc > 0) {
      ctx.textBaseline = 'alphabetic'; ctx.font = '700 ' + Math.round(8 * sc) + 'px ' + FONT;
      ctx.fillStyle = C.amber; ctx.shadowColor = C.amber; ctx.shadowBlur = 5; ctx.textAlign = 'left';
      ctx.fillText('BEST ' + bsc, 10 * sc, H - 10 * sc);
    }
    ctx.restore();

    // sweeping scope scan beam (additive, subtle life)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var beamX = ((t * 0.16) % 1) * (W + 80) - 40, bwd = 46 * sc;
    var beam = ctx.createLinearGradient(beamX - bwd, 0, beamX + bwd, 0);
    beam.addColorStop(0, 'rgba(65,255,126,0)'); beam.addColorStop(0.5, 'rgba(125,255,176,0.10)'); beam.addColorStop(1, 'rgba(65,255,126,0)');
    ctx.fillStyle = beam; ctx.fillRect(beamX - bwd, 0, bwd * 2, H); ctx.restore();
    // CRT scanlines (lighter) + soft green-tinted vignette (no longer crushes the image)
    ctx.save(); ctx.globalAlpha = 0.035; ctx.fillStyle = '#000';
    for (var ly = 0; ly < H; ly += 3) ctx.fillRect(0, ly, W, 1);
    ctx.globalAlpha = 1;
    var vg = ctx.createRadialGradient(W / 2, H * 0.46, H * 0.3, W / 2, H / 2, W * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,6,3,0.34)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H); ctx.restore();

    // ease the overall brightness: a GENTLE correction on web/desktop (keeps it glammed),
    // a stronger one on tablet/iPhone. multiply scales every pixel so glows soften but
    // blacks stay black (no muddying).
    if (this._pvCoarse === undefined) this._pvCoarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    var _dim = this._pvCoarse ? 185 : 225;   // web ~12% softer (still glam) · mobile ~27.5%
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgb(' + _dim + ',' + _dim + ',' + _dim + ')'; ctx.fillRect(0, 0, W, H); ctx.restore();
  };

  /* ==================================================================== *
   * Public singleton interface
   * ==================================================================== */
  var instance = null;
  function getInstance() { if (!instance) instance = new Game(); return instance; }

  // Handle keyup on window for space/arrow release (desktop firing & pan).
  window.addEventListener('keyup', function (e) {
    if (!instance || !instance.running) return;
    if (e.key === ' ') instance.firing = false;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') instance.panVX = 0;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') instance.panVY = 0;
  });

  window.SniperGame = {
    open: function (v) { if (v && window.__snipVariant) window.__snipVariant(v); getInstance().open(); },
    close: function () { if (instance) instance.close(); },
    mountPreview: function (cv, v) { if (v && window.__snipVariant) window.__snipVariant(v); getInstance().mountPreview(cv); },
    setVariant: function (v) { return window.__snipVariant ? window.__snipVariant(v) : null; },
    variant: function () { return VARIANT; },
    theme: function () { return TH(); },
    isOpen: function () { return !!(instance && instance.running); },
    // test/debug hook — manually advance the loop (preview tabs throttle rAF)
    step: function (n) { var g = instance; if (!g) return null; for (var i = 0; i < (n || 30); i++) { try { g.update(0.05); } catch (e) {} } try { g.render(); } catch (e) {} return window.SniperGame.debug(); },
    // test/debug hook — inspect live state (agents, camera, score)
    debug: function () { var g = instance; if (!g) return null;
      return { agents: g.agents.length, up: g.agents.filter(function(a){return a.h>0.2&&!a.dead;}).length,
        drones: g.agents.filter(function(a){return a.fly&&!a.dead;}).length,
        dead: g.agents.filter(function(a){return a.dead;}).length,
        camX: Math.round(g.camX), camY: Math.round(g.camY), aimX: Math.round(g.aimX), aimY: Math.round(g.aimY), wave: g.wave, score: g.score, combo: g.combo,
        focus: +g.focus.toFixed(2), focusActive: g.focusActive, rings: g.rings.length, callout: g.callout ? g.callout.text : null,
        banner: +(g.waveBanner||0).toFixed(2),
        sample: g.agents.slice(0,4).map(function(a){var p=g.agentScreen(a);return {type:a.fly?'drone':a.type,h:+a.h.toFixed(2),sx:Math.round(a.sx),sy:p?Math.round(p.y):null};}) }; }
  };
})();
