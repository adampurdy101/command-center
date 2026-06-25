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
  var FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

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

    /* ----- camera / aim (world pans under fixed reticle) ----- */
    this.camX = 0; this.camY = 0;       // world offset
    this.panVX = 0; this.panVY = 0;     // joystick-driven pan velocity input
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
    this.stick = { active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0, R: 64, homeX: 0, homeY: 0 };
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
    var y = baseY - h * amp + fin(this.camY, 0) * L.parallax * 0.4;
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
      'position:absolute', 'top:12px', 'right:14px', 'z-index:5',
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
    this.cy = H * 0.46;
    this.lensR = Math.max(80, Math.min(W, H) * 0.47);

    // Control geometry (landscape, two thumbs)
    var pad = Math.max(18, Math.min(W, H) * 0.05);
    // Joystick bottom-left
    this.stick.R = clamp(Math.min(W, H) * 0.13, 50, 92);
    this.stick.homeX = pad + this.stick.R;
    this.stick.homeY = H - pad - this.stick.R;
    if (!this.stick.active) { this.stick.cx = this.stick.homeX; this.stick.cy = this.stick.homeY; this.stick.dx = 0; this.stick.dy = 0; }

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
    this.zoomSlider.y = this.fireBtn.y - this.fireBtn.r - sh - 18;
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

    // Best-effort native fullscreen.
    try {
      var el = this.overlay;
      if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) { /* iOS Safari etc — overlay still covers viewport */ }

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
    this.stick.active = false; this.fireBtn.active = false; this.zoomSlider.dragging = false;
    this.pinch.active = false;
  };

  Game.prototype.resetGame = function () {
    this.score = 0; this.wave = 0; this.kills = 0; this.combo = 0; this.comboTimer = 0;
    this.agents.length = 0; this.tracers.length = 0; this.particles.length = 0;
    this.debris.length = 0; this.popups.length = 0; this.feed.length = 0; this.blooms.length = 0;
    this.camX = 0; this.camY = 0; this.zoom = 6; this.zoomTarget = 6;
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
    if (r < 0.12 + diff * 0.005) type = 'depot';
    else if (r < 0.55) type = 'runner';
    else type = 'popup';

    // World X chosen relative to current camera so they appear near view sometimes.
    var screenX = rand(-W * 0.3, W * 1.3);
    var a = {
      type: type,
      // sx is a screen-space anchor that scrolls as the camera pans
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
      a.vx = rand(28, 52) * a.dir * (0.8 + diff * 0.05);
      a.peek = rand(2.5, 5);
    }
    if (type === 'depot') { a.peek = 99; a.h = 1; a.state = 'up'; }
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

    // Heat
    if (g.heatPerShot) {
      this.heat = clamp(this.heat + g.heatPerShot, 0, 1);
      if (this.heat >= 1) { this.overheated = true; this.firing = false; Audio2.overheat(); this.shake = Math.max(this.shake, 0.5); }
    }

    // Bullet direction = reticle center + spread + recoil jitter.
    var sp = g.spread * (1 + this.recoil * 0.4);
    var ang = rand(-sp, sp);
    var jitterX = Math.sin(ang) * this.cx;
    var jitterY = rand(-sp, sp) * this.cy;
    var tx = fin(this.cx + jitterX, this.cx);
    var ty = fin(this.cy + jitterY, this.cy);

    // Tracer originates lower-center (the barrel) and reaches toward aim point.
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
    a.dead = true; a.state = 'dead';
    this.kills++;
    this.killsThisWave++;

    // Combo
    this.combo++;
    this.comboTimer = 2.4;
    var mult = 1 + Math.min(8, this.combo - 1) * 0.25;

    var base = a.type === 'depot' ? 250 : (a.type === 'runner' ? 150 : 100);
    if (head) base += 100;
    var pts = Math.round(base * mult);
    this.score += pts;

    var label = head ? 'HEADSHOT' : (a.type === 'depot' ? 'DEPOT' : 'TANGO DOWN');
    this.popups.push({ x: p.x, y: p.y, t: 0, life: 1.1, text: '+' + pts, big: head || a.type === 'depot' });
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

  /* Massive chain explosion from a depot. */
  Game.prototype.detonate = function (x, y, r) {
    Audio2.explosion();
    this.shake = Math.min(2.2, this.shake + 1.4);
    this.flash = Math.min(3, this.flash + 1.6);
    this.blooms.push({ x: x, y: y, t: 0, life: 0.6, r0: r, r1: r * 9 + 140 });
    if (this.blooms.length > 6) this.blooms.shift();

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
    // Agents store a screen-space X that scrolls as the camera pans.
    var x = a.sx;
    var ridge = this.ridgeY(a.layer, x);
    var z = fin(this.zoom, 6);
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
   * POINTER HANDLERS — joystick, fire, zoom slider, UI buttons, pinch.
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

    // Joystick — activate if pressed anywhere in left-bottom region.
    if (x < this.W * 0.5 && y > this.H * 0.4) {
      this.stick.active = true; this.stick.id = id;
      this.stick.cx = this.stick.homeX; this.stick.cy = this.stick.homeY;
      this.stick.dx = 0; this.stick.dy = 0;
      this.activePointers[id].role = 'stick';
      this.updateStick(x, y);
      return;
    }

    // Otherwise — treat as a free aim drag on the world (right area) = pan.
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

    if (p.role === 'stick') { this.updateStick(x, y); return; }
    if (p.role === 'zoom') { this.setZoomFromSlider(y); return; }
    if (p.role === 'drag') {
      var dx = x - p.lastX, dy = y - p.lastY;
      p.lastX = x; p.lastY = y;
      var z = Math.max(0.5, fin(this.zoom, 6));
      // direct world drag (slower at high zoom)
      this.camX -= dx / (z * 1.4);
      this.camY -= dy / (z * 1.4);
      return;
    }
  };

  Game.prototype.onPointerUp = function (e) {
    var id = e.pointerId;
    var p = this.activePointers[id];
    try { this.canvas.releasePointerCapture(id); } catch (err) {}
    if (p) {
      if (p.role === 'stick') { this.stick.active = false; this.stick.dx = 0; this.stick.dy = 0; }
      if (p.role === 'zoom') { this.zoomSlider.dragging = false; }
      if (p.role === 'fire') { this.fireBtn.active = false; this.firing = false; }
    }
    delete this.activePointers[id];

    if (this.pinch.active) {
      var ids = Object.keys(this.activePointers);
      if (ids.length < 2) this.pinch.active = false;
    }
  };

  Game.prototype.updateStick = function (x, y) {
    var dx = x - this.stick.homeX, dy = y - this.stick.homeY;
    var d = Math.hypot(dx, dy);
    var R = this.stick.R || 1;
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    this.stick.cx = this.stick.homeX + dx;
    this.stick.cy = this.stick.homeY + dy;
    this.stick.dx = R ? dx / R : 0; // -1..1
    this.stick.dy = R ? dy / R : 0;
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
  Game.prototype.update = function (dt) {
    var W = this.W, H = this.H;

    // Smooth zoom
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 9);
    this.zoom = clamp(fin(this.zoom, 6), 2, 12);

    // Joystick pan: world scrolls under fixed reticle. Push further = faster.
    var panSpeedBase = 320 / Math.max(2, this.zoom); // less pan at high mag
    var sx = this.stick.active ? this.stick.dx : (this.panVX || 0);
    var sy = this.stick.active ? this.stick.dy : (this.panVY || 0);
    // apply nonlinear response for fine control
    var resp = function (v) { return Math.sign(v) * v * v; };
    var panDX = resp(sx) * panSpeedBase * dt;
    var panDY = resp(sy) * panSpeedBase * dt * 0.7;
    this.camX = fin(this.camX + panDX, this.camX || 0);
    this.camY = fin(this.camY + panDY, this.camY || 0);
    this.camY = clamp(this.camY, -H * 0.25, H * 0.25);
    // decay keyboard pan
    this.panVX *= (1 - Math.min(1, dt * 6));
    this.panVY *= (1 - Math.min(1, dt * 6));

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

    // Firing logic
    this.tryFire(dt);

    // Minigun barrel spin visual
    if (this.gun.spinup) this.barrelAngle += dt * (3 + this.spin * 40);

    // Combo timer
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }

    // Wave banner
    if (this.waveBanner > 0) this.waveBanner -= dt;

    // Spawning
    this.spawnTimer -= dt;
    var spawnRate = clamp(1.5 - this.wave * 0.08, 0.45, 1.5);
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
      // pan agents with the camera horizontally (so panning aims onto them)
      a.sx -= panDX;

      if (a.dead) {
        a.deadT = (a.deadT || 0) + dt;
        if (a.deadT > 0.25) { this.agents.splice(i, 1); }
        continue;
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

    // scope sway offset (applied to WORLD, reticle stays centered)
    var swA = 6 / Math.max(2, this.zoom) + this.zoom * 0.25;
    var swayX = Math.sin(this.swayT * 0.7) * swA + Math.sin(this.swayT * 1.9) * swA * 0.4;
    var swayY = Math.cos(this.swayT * 0.53) * swA * 0.7 + Math.cos(this.swayT * 2.3) * swA * 0.3;
    // recoil kick (mostly vertical) + vibe + shake
    var recK = this.recoil * 6;
    var vib = this.vibe * (3 + Math.sin(this.swayT * 90) * 3);
    var shk = this.shake * 10;
    var ox = swayX + (Math.random() - 0.5) * shk + (Math.random() - 0.5) * vib;
    var oy = swayY + recK + (Math.random() - 0.5) * shk + (Math.random() - 0.5) * vib;
    ox = fin(ox, 0); oy = fin(oy, 0);

    try {
      ctx.save();
      ctx.translate(ox, oy);
      this.drawWorld(ctx, W, H);
      ctx.restore();
    } catch (e) { try { ctx.restore(); } catch (e2) {} }

    // Lens mask vignette (outside circle darkened) — draw after world.
    this.drawScopeBody(ctx, W, H);

    // Reticle (centered, stays put)
    this.drawReticle(ctx);

    // Muzzle flash overlay
    if (this.flash > 0.02) this.drawMuzzleFlash(ctx);

    // Explosion bloom washes (full screen)
    this.drawBlooms(ctx);

    // HUD + controls (screen space)
    this.drawHUD(ctx, W, H);
    this.drawControls(ctx, W, H);

    // CRT scanlines + vignette on top
    this.drawCRT(ctx, W, H);
  };

  /* --- The scene inside the lens: sky, ridges, agents, tracers, particles --- */
  Game.prototype.drawWorld = function (ctx, W, H) {
    // Sky band gradient behind mountains
    var skyTop = this.cy - this.lensR * 1.1;
    var skyBot = this.cy + this.lensR * 0.4;
    if (isFinite(skyTop) && isFinite(skyBot) && skyBot > skyTop) {
      var g = ctx.createLinearGradient(0, skyTop, 0, skyBot);
      g.addColorStop(0, '#04140c');
      g.addColorStop(0.6, '#06180e');
      g.addColorStop(1, '#0a2014');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = '#06180e'; ctx.fillRect(0, 0, W, H);
    }

    // faint scan stars
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (var s = 0; s < 40; s++) {
      var sxp = ((s * 137.5 + this.camX * 0.05) % (W + 40)) - 20;
      var syp = (s * 53.3) % (H * 0.35) + 8;
      if (!isFinite(sxp) || !isFinite(syp)) continue;
      ctx.fillStyle = (s % 7 === 0) ? C.cyan : C.faint;
      ctx.globalAlpha = 0.15 + (s % 5) * 0.05;
      ctx.fillRect(sxp, syp, 1.4, 1.4);
    }
    ctx.restore();

    // Parallax ridgelines back-to-front
    for (var li = 0; li < this.layers.length; li++) {
      this.drawRidge(ctx, li, W, H);
    }

    // Agents sit on the play ridge (drawn after their ridge, before foreground haze)
    for (var ai = 0; ai < this.agents.length; ai++) {
      this.drawAgent(ctx, this.agents[ai]);
    }

    // Tracers (drawn in world so they sway with recoil)
    this.drawTracers(ctx);

    // Particles & debris
    this.drawParticles(ctx);
    this.drawDebris(ctx);

    // Popups
    this.drawPopups(ctx);
  };

  Game.prototype.drawRidge = function (ctx, li, W, H) {
    var L = this.layers[li];
    var step = 6;
    ctx.beginPath();
    var firstY = this.ridgeY(li, -10);
    ctx.moveTo(-10, fin(firstY, H));
    for (var x = 0; x <= W + 10; x += step) {
      var y = this.ridgeY(li, x);
      if (!isFinite(y)) y = H;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W + 10, H + 40);
    ctx.lineTo(-10, H + 40);
    ctx.closePath();

    // fill with layer color + haze
    var topY = this.ridgeY(li, W * 0.5);
    var gr = null;
    if (isFinite(topY)) {
      gr = ctx.createLinearGradient(0, topY - 20, 0, H);
      gr.addColorStop(0, L.color);
      gr.addColorStop(1, li === this.layers.length - 1 ? '#04100a' : L.color);
    }
    ctx.fillStyle = gr || L.color;
    ctx.fill();

    // haze veil over far layers
    if (L.hazeAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = L.hazeAlpha;
      ctx.fillStyle = '#06160d';
      ctx.fill();
      ctx.restore();
    }

    // glowing rim line
    ctx.save();
    ctx.beginPath();
    var fy = this.ridgeY(li, -10);
    ctx.moveTo(-10, fin(fy, H));
    for (var rx = 0; rx <= W + 10; rx += step) {
      var ry = this.ridgeY(li, rx);
      if (!isFinite(ry)) ry = H;
      ctx.lineTo(rx, ry);
    }
    ctx.strokeStyle = li >= this.playLayer ? C.dim : C.faint;
    ctx.globalAlpha = li >= this.playLayer ? 0.7 : 0.35;
    ctx.lineWidth = li === this.playLayer ? 1.4 : 1;
    ctx.shadowColor = C.green;
    ctx.shadowBlur = li >= this.playLayer ? 6 : 2;
    ctx.stroke();
    ctx.restore();
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
    ctx.lineWidth = Math.max(1, figH * 0.06);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.shadowColor = C.green; ctx.shadowBlur = 5;
    ctx.globalAlpha = clamp(0.4 + pop * 0.6, 0, 1);

    if (a.dead) {
      ctx.globalAlpha *= clamp(1 - (a.deadT || 0) * 4, 0, 1);
    }

    if (a.type === 'depot') {
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
      ctx.globalAlpha = a;
      ctx.strokeStyle = t.kind === 'beam' ? C.hi : C.green;
      ctx.shadowColor = C.green;
      ctx.shadowBlur = t.kind === 'beam' ? 16 : 8;
      ctx.lineCap = 'round';
      if (t.kind === 'double') {
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(t.x0 - 3, t.y0); ctx.lineTo(t.x1 - 1.5, t.y1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(t.x0 + 3, t.y0); ctx.lineTo(t.x1 + 1.5, t.y1); ctx.stroke();
      } else if (t.kind === 'beam') {
        ctx.lineWidth = 3.4;
        ctx.beginPath(); ctx.moveTo(t.x0, t.y0); ctx.lineTo(t.x1, t.y1); ctx.stroke();
        ctx.globalAlpha = a * 0.5; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(t.x0, t.y0); ctx.lineTo(t.x1, t.y1); ctx.stroke();
      } else {
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(t.x0, t.y0); ctx.lineTo(t.x1, t.y1); ctx.stroke();
      }
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
    var cx = this.cx, cy = this.cy, R = this.lensR;
    if (!isFinite(cx) || !isFinite(cy) || !isFinite(R) || R <= 0) return;

    // Darken everything outside the lens circle using even-odd fill.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cx, cy, R, 0, Math.PI * 2, true);
    ctx.fillStyle = '#030806';
    ctx.fill('evenodd');
    ctx.restore();

    // soft inner lens vignette (darken edges inside lens)
    var vg = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
    if (vg) {
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(0.82, 'rgba(2,8,5,0.15)');
      vg.addColorStop(1, 'rgba(2,8,5,0.85)');
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = vg; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.restore();
    }

    // Lens glint (faint diagonal highlight)
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = C.cyan;
    ctx.beginPath();
    ctx.ellipse(cx - R * 0.35, cy - R * 0.4, R * 0.5, R * 0.18, -0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Glowing rim ring
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = C.green; ctx.lineWidth = 2.4;
    ctx.shadowColor = C.green; ctx.shadowBlur = 14; ctx.globalAlpha = 0.9;
    ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, R - 5), 0, Math.PI * 2);
    ctx.strokeStyle = C.faint; ctx.lineWidth = 1; ctx.shadowBlur = 0; ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.restore();

    // Elevation / windage tick marks around the rim
    ctx.save();
    ctx.strokeStyle = C.dim; ctx.globalAlpha = 0.55;
    for (var k = 0; k < 72; k++) {
      var ang = (k / 72) * Math.PI * 2;
      var major = (k % 6 === 0);
      var r0 = R + 3, r1 = R + (major ? 11 : 6);
      var x0 = cx + Math.cos(ang) * r0, y0 = cy + Math.sin(ang) * r0;
      var x1 = cx + Math.cos(ang) * r1, y1 = cy + Math.sin(ang) * r1;
      ctx.lineWidth = major ? 1.6 : 0.8;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.restore();
  };

  /* --- MIL-DOT reticle, always centered --- */
  Game.prototype.drawReticle = function (ctx) {
    var cx = this.cx, cy = this.cy, R = this.lensR;
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
    var cx = this.cx, cy = this.cy, R = this.lensR;
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

  /* ------------------------------------------------------------------ *
   * HUD — top, clear.
   * ------------------------------------------------------------------ */
  Game.prototype.drawHUD = function (ctx, W, H) {
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.shadowColor = C.green; ctx.shadowBlur = 4;

    // Title
    ctx.fillStyle = C.green; ctx.font = '600 14px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('DEEP SCOPE // OVERWATCH', 56, 14);

    // Score + wave (center-top)
    ctx.textAlign = 'center';
    ctx.fillStyle = C.hi; ctx.font = '700 22px ' + FONT;
    ctx.fillText(this.padScore(this.score), W * 0.5, 12);
    ctx.fillStyle = C.dim; ctx.font = '11px ' + FONT;
    ctx.fillText('SCORE', W * 0.5, 38);

    // Wave + progress (left under title)
    ctx.textAlign = 'left';
    ctx.fillStyle = C.amber; ctx.font = '600 13px ' + FONT;
    ctx.fillText('WAVE ' + this.wave, 56, 36);
    var pw = 90, ppx = 120, ppy = 40;
    ctx.fillStyle = 'rgba(20,40,26,0.7)';
    ctx.fillRect(ppx, ppy, pw, 5);
    ctx.fillStyle = C.amber;
    ctx.fillRect(ppx, ppy, pw * clamp(this.killsThisWave / this.killsNeeded, 0, 1), 5);

    // Magnification (right-of-center top)
    ctx.textAlign = 'right';
    ctx.fillStyle = C.cyan; ctx.font = '600 16px ' + FONT;
    ctx.fillText(this.zoom.toFixed(1) + 'x', W - 70, 16);
    ctx.fillStyle = C.dim; ctx.font = '10px ' + FONT;
    ctx.fillText('MAG', W - 70, 36);

    // Combo
    if (this.combo > 1) {
      ctx.textAlign = 'center';
      var mult = 1 + Math.min(8, this.combo - 1) * 0.25;
      ctx.fillStyle = C.amber; ctx.font = '700 15px ' + FONT;
      ctx.fillText('x' + mult.toFixed(2) + '  COMBO ' + this.combo, W * 0.5, 56);
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
   * CONTROLS — joystick, fire, zoom slider, gun-select, +/- zoom.
   * Also (re)populates this.uiHotspots for hit-testing.
   * ------------------------------------------------------------------ */
  Game.prototype.drawControls = function (ctx, W, H) {
    this.uiHotspots.length = 0;
    var self = this;
    var pad = Math.max(18, Math.min(W, H) * 0.05);

    /* ---- Gun-select buttons (bottom-center cluster, above stick area) ---- */
    var keys = ['rifle', 'mg', 'minigun'];
    var gbW = clamp(W * 0.12, 78, 120), gbH = 30, gap = 8;
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
    var zbS = clamp(Math.min(W, H) * 0.085, 40, 58);
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

    /* ---- Joystick (bottom-left) ---- */
    this.drawJoystick(ctx);

    /* ---- Fire button (bottom-right) ---- */
    this.drawFireButton(ctx);

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

  Game.prototype.drawJoystick = function (ctx) {
    var s = this.stick;
    if (!isFinite(s.homeX) || !isFinite(s.homeY) || !(s.R > 0)) return;
    ctx.save();
    // base ring
    ctx.beginPath(); ctx.arc(s.homeX, s.homeY, s.R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,18,12,0.5)';
    ctx.fill();
    ctx.strokeStyle = C.faint; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.8; ctx.stroke();
    // cross guide
    ctx.globalAlpha = 0.3; ctx.strokeStyle = C.dim; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(s.homeX - s.R, s.homeY); ctx.lineTo(s.homeX + s.R, s.homeY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s.homeX, s.homeY - s.R); ctx.lineTo(s.homeX, s.homeY + s.R); ctx.stroke();
    ctx.globalAlpha = 1;
    // knob
    var kx = s.active ? s.cx : s.homeX, ky = s.active ? s.cy : s.homeY;
    ctx.beginPath(); ctx.arc(kx, ky, s.R * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = s.active ? 'rgba(65,255,126,0.28)' : 'rgba(20,40,26,0.7)';
    ctx.fill();
    ctx.strokeStyle = s.active ? C.green : C.dim; ctx.lineWidth = 2;
    ctx.shadowColor = C.green; ctx.shadowBlur = s.active ? 10 : 4;
    ctx.stroke();
    // label
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.dim; ctx.font = '10px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('AIM', s.homeX, s.homeY + s.R + 6);
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
    var last = 0;
    function frame(t) {
      if (self.previewCanvas !== canvasEl) return; // remounted elsewhere
      if (!document.body.contains(canvasEl)) { self.previewRAF = 0; return; }
      if (!last) last = t;
      var dt = Math.min(0.05, Math.max(0, (t - last) / 1000)); last = t;
      if (!isFinite(dt)) dt = 0;
      self.previewT += dt;
      try { self.renderPreview(canvasEl, dt); } catch (e) {}
      self.previewRAF = requestAnimationFrame(frame);
    }
    this.previewRAF = requestAnimationFrame(frame);
  };

  Game.prototype.renderPreview = function (cv, dt) {
    var rect = cv.getBoundingClientRect();
    var rw = rect && isFinite(rect.width) ? rect.width : 0;
    var rh = rect && isFinite(rect.height) ? rect.height : 0;
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

    var cx = W / 2, cy = H * 0.46, R = Math.min(W, H) * 0.46;
    var T = this.previewT;
    var pan = Math.sin(T * 0.18) * 40; // slow drift

    // sky
    ctx.fillStyle = '#06160d'; ctx.fillRect(0, 0, W, H);

    // simple parallax ridges
    var defs = [
      { seed: 11, py: 0.55, amp: 0.10, col: '#11422a', par: 0.3 },
      { seed: 23, py: 0.66, amp: 0.16, col: '#15402a', par: 0.6 },
      { seed: 37, py: 0.80, amp: 0.24, col: '#0c3a22', par: 1.0 }
    ];
    for (var di = 0; di < defs.length; di++) {
      var L = defs[di];
      ctx.beginPath();
      ctx.moveTo(-5, H);
      for (var x = -5; x <= W + 5; x += 5) {
        var wx = (x + pan * L.par) * 0.04;
        var h = ridgeHeight(wx + 50, L.seed, 4);
        var y = cy + (L.py - 0.5) * H - h * L.amp * H;
        ctx.lineTo(x, fin(y, H));
      }
      ctx.lineTo(W + 5, H); ctx.closePath();
      ctx.fillStyle = L.col; ctx.fill();
      ctx.strokeStyle = C.faint; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // a couple idle agents bobbing
    for (var ai = 0; ai < 2; ai++) {
      var ax = cx + (ai === 0 ? -R * 0.4 : R * 0.5) - pan * 0.6;
      var bob = (Math.sin(T * 1.3 + ai * 2) * 0.5 + 0.5);
      var ar = cy + 0.12 * H;
      var fh = 10;
      if (!isFinite(ax) || !isFinite(ar)) continue;
      ctx.save();
      ctx.globalAlpha = 0.4 + bob * 0.5;
      ctx.fillStyle = C.green; ctx.shadowColor = C.green; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(ax, ar - fh * bob, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // scope body mask
    if (isFinite(cx) && isFinite(cy) && R > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(cx, cy, R, 0, Math.PI * 2, true);
      ctx.fillStyle = '#040a07'; ctx.fill('evenodd');
      ctx.restore();
      // rim
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = C.green; ctx.lineWidth = 1.6; ctx.shadowColor = C.green; ctx.shadowBlur = 8; ctx.globalAlpha = 0.9; ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;

      // mini reticle
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, R - 2), 0, Math.PI * 2); ctx.clip();
      ctx.strokeStyle = C.green; ctx.globalAlpha = 0.8; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
      ctx.fillStyle = C.hi; ctx.beginPath(); ctx.arc(cx, cy, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // DEPLOY prompt (pulsing)
      var pa = 0.5 + Math.sin(T * 2.4) * 0.4;
      ctx.globalAlpha = clamp(pa, 0, 1);
      ctx.fillStyle = C.amber; ctx.font = '600 11px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = C.amber; ctx.shadowBlur = 6;
      ctx.fillText('DEPLOY · FULLSCREEN', cx, cy + R * 0.55);
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    // scanlines
    ctx.globalAlpha = 0.05; ctx.fillStyle = '#000';
    for (var sy = 0; sy < H; sy += 3) ctx.fillRect(0, sy, W, 1);
    ctx.globalAlpha = 1;
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
    open: function () { getInstance().open(); },
    close: function () { if (instance) instance.close(); },
    mountPreview: function (cv) { getInstance().mountPreview(cv); },
    isOpen: function () { return !!(instance && instance.running); }
  };
})();
