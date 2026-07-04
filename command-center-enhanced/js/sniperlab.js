/* =============================================================================
   SNIPER LAB — three playable redesign slices of DEEP SCOPE // OVERWATCH
   -----------------------------------------------------------------------------
   window.SniperLab = { mountPreview(key, canvas), deploy(key), close(), isOpen() }

   Shared slice engine + three worlds:
     nvg     — A · NIGHT OPS      (NVG grain, searchlights, cloaked ghosts)
     thermal — B · THERMAL HUNTER (white-hot mechs on a cold world, core weak-points)
     orbital — C · ORBITAL OVERWATCH (HAL-red eye drones vs the station shield)

   Plain canvas + Web Audio synth. No assets, no libraries.
   ============================================================================= */
(function () {
'use strict';

var TAU = Math.PI * 2;
var DPRV = Math.min(window.devicePixelRatio || 1,
  (window.matchMedia && window.matchMedia('(pointer:coarse)').matches) ? 1.25 : 1.75);
var FONT = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function fin(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : (d || 0); }
function pad6(n) { var s = String(Math.max(0, Math.floor(fin(n, 0)))); while (s.length < 6) s = '0' + s; return s; }

/* ---------------- audio (synth, shared ctx) ---------------- */
var Snd = (function () {
  var ac = null, master = null;
  function ctx() {
    if (ac) return ac;
    try { var A = window.AudioContext || window.webkitAudioContext; if (!A) return null;
      ac = new A(); master = ac.createGain(); master.gain.value = 0.45; master.connect(ac.destination);
    } catch (e) { ac = null; }
    return ac;
  }
  function resume() { var c = ctx(); if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} } }
  function noise(dur, vol, f0, q) {
    var c = ctx(); if (!c) return;
    var n = c.sampleRate * dur, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = c.createBufferSource(); src.buffer = buf;
    var flt = c.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = f0; flt.Q.value = q || 1;
    var g = c.createGain(); g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(flt); flt.connect(g); g.connect(master); src.start();
  }
  function tone(freq, dur, vol, type, slide) {
    var c = ctx(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(master); o.start(); o.stop(c.currentTime + dur + 0.02);
  }
  return {
    resume: resume,
    shot: function () { noise(0.16, 0.5, 1500, 0.7); tone(140, 0.09, 0.3, 'square', 50); },
    empty: function () { tone(220, 0.05, 0.12, 'square', 180); },
    reload: function () { tone(320, 0.05, 0.12, 'square'); setTimeout(function () { tone(430, 0.05, 0.12, 'square'); }, 130); },
    hit: function () { tone(700, 0.05, 0.16, 'triangle', 500); },
    kill: function () { noise(0.24, 0.4, 700, 0.8); tone(300, 0.14, 0.2, 'sawtooth', 90); },
    crit: function () { tone(1180, 0.1, 0.22, 'triangle', 1600); noise(0.2, 0.3, 900, 1); },
    call: function () { tone(880, 0.07, 0.16, 'square', 1320); },
    boom: function () { noise(0.5, 0.6, 220, 0.6); tone(70, 0.4, 0.32, 'sine', 36); },
    shield: function () { tone(180, 0.25, 0.3, 'sawtooth', 60); noise(0.3, 0.3, 400, 1); },
    focus: function () { tone(500, 0.3, 0.14, 'sine', 130); },
    tickHi: function () { tone(1500, 0.03, 0.08, 'square'); }
  };
})();

/* ---------------- tiny grain tile (for NVG) ---------------- */
var grainTile = null;
function getGrain() {
  if (grainTile) return grainTile;
  var c = document.createElement('canvas'); c.width = 160; c.height = 160;
  var x = c.getContext('2d'), img = x.createImageData(160, 160);
  for (var i = 0; i < img.data.length; i += 4) {
    var v = 80 + Math.random() * 175; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
    img.data[i + 3] = Math.random() * 30;
  }
  x.putImageData(img, 0, 0); grainTile = c; return c;
}

/* ---------------- value noise ridge ---------------- */
function hash1(n) { var s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, seed) {
  var i = Math.floor(x), f = x - i, a = hash1(i + seed * 57), b = hash1(i + 1 + seed * 57);
  var u = f * f * (3 - 2 * f); return a + (b - a) * u;
}
function ridge(x, seed, oct) {
  var amp = 1, fr = 1, s = 0, n = 0;
  for (var o = 0; o < oct; o++) { s += vnoise(x * fr, seed + o) * amp; n += amp; amp *= 0.5; fr *= 2; }
  return n ? s / n : 0;
}

/* ============================================================================
   WORLDS
   ============================================================================ */
var WORLDS = {

  /* ---------------- A · NIGHT OPS (NVG) ---------------- */
  nvg: {
    name: 'NIGHT OPS', sub: 'NVG // GHOST PROTOCOL',
    ui: '#41ff7e', uiHi: '#b6ffd0', uiDim: 'rgba(65,255,126,0.55)',
    tagline: 'Searchlights reveal cloaked ghosts — time the sweep, take the shot.',
    bg: function (x, g, t) {
      var W = g.WW, H = g.WH;
      var sky = x.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#020e06'); sky.addColorStop(0.5, '#04180c'); sky.addColorStop(1, '#071f10');
      x.fillStyle = sky; x.fillRect(0, 0, W, H);
      x.save(); x.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 40; i++) {
        var sx = (i * 137.5) % W, sy = ((i * 61.3) % (H * 0.42));
        x.globalAlpha = 0.18 + 0.3 * Math.abs(Math.sin(t * 1.1 + i));
        x.fillStyle = '#9fffc4'; x.fillRect(sx, sy, 1.4, 1.4);
      }
      x.restore(); x.globalAlpha = 1;
      var Ls = [[7, 0.5, 0.13, '#0a2e19'], [3, 0.62, 0.16, '#07220f'], [9, 0.76, 0.2, '#04170b']];
      for (var l = 0; l < 3; l++) {
        var L = Ls[l]; x.fillStyle = L[3]; x.beginPath(); x.moveTo(0, H);
        for (var px = 0; px <= W; px += 8) {
          var y = H * L[1] - ridge(px * 0.004 + l * 9, L[0], 4) * H * L[2];
          x.lineTo(px, y);
        }
        x.lineTo(W, H); x.closePath(); x.fill();
      }
      // searchlights (also used to reveal ghosts)
      g.cones = [];
      x.save(); x.globalCompositeOperation = 'lighter';
      for (var s = 0; s < 2; s++) {
        var bx = W * (0.25 + s * 0.5), by = H * 0.78;
        var a = -Math.PI / 2 + Math.sin(t * (0.33 + s * 0.11) + s * 2.4) * 0.75;
        g.cones.push({ x: bx, y: by, a: a, w: 0.16 });
        var len = H * 0.72;
        var gr = x.createRadialGradient(bx, by, 8, bx, by, len);
        gr.addColorStop(0, 'rgba(190,255,210,0.20)'); gr.addColorStop(1, 'rgba(190,255,210,0)');
        x.fillStyle = gr; x.beginPath(); x.moveTo(bx, by);
        x.arc(bx, by, len, a - 0.16, a + 0.16); x.closePath(); x.fill();
        x.fillStyle = 'rgba(220,255,230,0.9)'; x.fillRect(bx - 2, by - 2, 4, 4);
      }
      x.restore();
      var hz = x.createLinearGradient(0, H * 0.74, 0, H * 0.8);
      hz.addColorStop(0, 'rgba(65,255,126,0)'); hz.addColorStop(0.5, 'rgba(65,255,126,0.35)'); hz.addColorStop(1, 'rgba(65,255,126,0)');
      x.fillStyle = hz; x.fillRect(0, H * 0.74, W, H * 0.06);
    },
    inCone: function (g, wx, wy) {
      if (!g.cones) return false;
      for (var i = 0; i < g.cones.length; i++) {
        var c = g.cones[i], dx = wx - c.x, dy = wy - c.y, d = Math.hypot(dx, dy);
        if (d < 8 || d > g.WH * 0.75) continue;
        var a = Math.atan2(dy, dx), da = Math.abs(((a - c.a + Math.PI * 3) % TAU) - Math.PI);
        if (da < c.w) return true;
      }
      return false;
    },
    spawn: function (g) {
      var ghost = Math.random() < Math.min(0.55, 0.2 + g.wave * 0.08);
      var y = g.WH * rand(0.52, 0.74);
      g.targets.push({
        type: ghost ? 'ghost' : 'patrol', x: Math.random() < 0.5 ? -30 : g.WW + 30, y: y,
        vx: rand(26, 44 + g.wave * 5) * (Math.random() < 0.5 ? 1 : -1), bob: rand(0, TAU),
        r: 15, hp: 1, blink: rand(0, 2.4), lit: 0
      });
      if (Math.random() < 0.3) g.targets.push({
        type: 'drone', x: rand(0, g.WW), y: g.WH * rand(0.12, 0.34),
        vx: rand(40, 70) * (Math.random() < 0.5 ? 1 : -1), vy: rand(-8, 8), r: 12, hp: 1, ph: rand(0, TAU)
      });
    },
    upd: function (g, tg, dt) {
      tg.x += fin(tg.vx) * dt; tg.bob = (tg.bob || 0) + dt * 7;
      if (tg.type === 'drone') { tg.y += Math.sin(g.t * 1.3 + tg.ph) * 14 * dt; }
      if (tg.type === 'ghost') {
        tg.blink -= dt; if (tg.blink < -0.22) tg.blink = rand(1.8, 3);
        tg.lit = WORLDS.nvg.inCone(g, tg.x, tg.y) ? 1 : Math.max(0, tg.lit - dt * 2.4);
      }
      if (tg.x < -60 || tg.x > g.WW + 60) tg.gone = true;
    },
    draw: function (x, g, tg) {
      var vis = 1;
      if (tg.type === 'ghost') vis = clamp(0.06 + tg.lit * 0.94 + (tg.blink < 0 ? 0.85 : 0), 0.06, 1);
      x.save(); x.globalAlpha = vis;
      if (tg.type === 'drone') {
        x.translate(tg.x, tg.y);
        x.fillStyle = '#0e3a20'; x.strokeStyle = '#63ff97'; x.lineWidth = 1.4;
        x.beginPath(); x.moveTo(-13, 0); x.lineTo(0, -6); x.lineTo(13, 0); x.lineTo(0, 6); x.closePath();
        x.fill(); x.stroke();
        x.fillStyle = 'rgba(190,255,215,' + (0.5 + 0.5 * Math.sin(g.t * 9 + tg.ph)).toFixed(2) + ')';
        x.fillRect(-1.6, -1.6, 3.2, 3.2);
      } else {
        var step = Math.sin(tg.bob) * 3;
        x.translate(tg.x, tg.y);
        x.strokeStyle = tg.type === 'ghost' ? '#c9ffdd' : '#63ff97'; x.lineWidth = 2;
        x.fillStyle = 'rgba(10,46,25,0.9)';
        x.beginPath(); x.arc(0, -13, 4.4, 0, TAU); x.fill(); x.stroke();          // head
        x.beginPath(); x.moveTo(0, -8); x.lineTo(0, 4); x.stroke();               // torso
        x.beginPath(); x.moveTo(0, -5); x.lineTo(tg.vx > 0 ? 8 : -8, -1); x.stroke(); // rifle arm
        x.beginPath(); x.moveTo(0, 4); x.lineTo(-4, 13 + step); x.moveTo(0, 4); x.lineTo(4, 13 - step); x.stroke();
        if (tg.type === 'ghost' && tg.blink < 0) {                                 // IR beacon
          x.fillStyle = '#ffffff'; x.fillRect(-1.5, -20, 3, 3);
        }
      }
      x.restore();
    },
    hit: function (g, tg, wx, wy) {
      var hd = Math.hypot(wx - tg.x, wy - (tg.type === 'drone' ? tg.y : tg.y - 13));
      if (hd < (tg.type === 'drone' ? 7 : 6)) return { hit: true, crit: true };
      if (Math.hypot(wx - tg.x, wy - tg.y) < tg.r + 4) return { hit: true, crit: false };
      return { hit: false };
    },
    score: function (tg, crit) { return (tg.type === 'ghost' ? 260 : tg.type === 'drone' ? 160 : 110) + (crit ? 150 : 0); },
    reticle: 'mil',
    grain: true
  },

  /* ---------------- B · THERMAL HUNTER ---------------- */
  thermal: {
    name: 'THERMAL HUNTER', sub: 'IRONBOW // WHITE-HOT',
    ui: '#ffb257', uiHi: '#ffe9c9', uiDim: 'rgba(255,178,87,0.6)',
    tagline: 'Cold world, hot cores. Only a core shot drops a walker.',
    bg: function (x, g, t) {
      var W = g.WW, H = g.WH;
      var sky = x.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#04050f'); sky.addColorStop(0.55, '#0a1024'); sky.addColorStop(1, '#131a33');
      x.fillStyle = sky; x.fillRect(0, 0, W, H);
      var Ls = [[21, 0.52, 0.12, '#161e3e'], [5, 0.65, 0.15, '#101631'], [13, 0.78, 0.18, '#0a0f26']];
      for (var l = 0; l < 3; l++) {
        var L = Ls[l]; x.fillStyle = L[3]; x.beginPath(); x.moveTo(0, H);
        for (var px = 0; px <= W; px += 8) x.lineTo(px, H * L[1] - ridge(px * 0.0042 + l * 7, L[0], 4) * H * L[2]);
        x.lineTo(W, H); x.closePath(); x.fill();
      }
      // vents — hot decoys in the cold
      x.save(); x.globalCompositeOperation = 'lighter';
      for (var v = 0; v < 4; v++) {
        var vx2 = W * (0.14 + v * 0.24), vy = H * 0.8, pulse = 0.5 + 0.5 * Math.sin(t * 1.1 + v * 2);
        var gr = x.createRadialGradient(vx2, vy, 0, vx2, vy, 26 + pulse * 10);
        gr.addColorStop(0, 'rgba(255,190,110,' + (0.30 + pulse * 0.2).toFixed(2) + ')');
        gr.addColorStop(0.5, 'rgba(255,90,40,0.12)'); gr.addColorStop(1, 'rgba(255,90,40,0)');
        x.fillStyle = gr; x.beginPath(); x.arc(vx2, vy, 26 + pulse * 10, 0, TAU); x.fill();
      }
      // heat shimmer bands
      for (var b = 0; b < 3; b++) {
        var by = H * (0.55 + b * 0.13) + Math.sin(t * 1.7 + b) * 3;
        x.strokeStyle = 'rgba(160,190,255,0.05)'; x.lineWidth = 5; x.beginPath();
        for (var sx = 0; sx <= W; sx += 14) x.lineTo(sx, by + Math.sin(sx * 0.05 + t * 3 + b) * 2.4);
        x.stroke();
      }
      x.restore();
    },
    spawn: function (g) {
      g.targets.push({
        type: 'mech', x: Math.random() < 0.5 ? -40 : g.WW + 40, y: g.WH * rand(0.56, 0.76),
        vx: rand(18, 30 + g.wave * 4) * (Math.random() < 0.5 ? 1 : -1),
        r: 22, hp: 3, bob: rand(0, TAU), coolT: 0
      });
      if (Math.random() < 0.35) g.targets.push({
        type: 'runner', x: Math.random() < 0.5 ? -30 : g.WW + 30, y: g.WH * rand(0.6, 0.78),
        vx: rand(70, 100 + g.wave * 8) * (Math.random() < 0.5 ? 1 : -1), r: 12, hp: 1, bob: rand(0, TAU)
      });
    },
    upd: function (g, tg, dt) {
      tg.x += fin(tg.vx) * dt; tg.bob += dt * (tg.type === 'runner' ? 12 : 5);
      if (tg.x < -70 || tg.x > g.WW + 70) tg.gone = true;
    },
    draw: function (x, g, tg) {
      x.save(); x.translate(tg.x, tg.y + Math.sin(tg.bob) * 1.6);
      x.save(); x.globalCompositeOperation = 'lighter';
      var halo = x.createRadialGradient(0, 0, 2, 0, 0, tg.r * 2.4);
      halo.addColorStop(0, 'rgba(255,240,220,0.5)'); halo.addColorStop(0.4, 'rgba(255,120,50,0.22)');
      halo.addColorStop(1, 'rgba(180,40,140,0)');
      x.fillStyle = halo; x.beginPath(); x.arc(0, 0, tg.r * 2.4, 0, TAU); x.fill(); x.restore();
      if (tg.type === 'mech') {
        var hurt = tg.hp < 3;
        x.fillStyle = hurt ? '#ffd9a8' : '#ffc27a';
        x.strokeStyle = '#fff1dc'; x.lineWidth = 2;
        x.fillRect(-12, -18, 24, 22); x.strokeRect(-12, -18, 24, 22);       // torso
        var st = Math.sin(tg.bob) * 5;
        x.beginPath(); x.moveTo(-7, 4); x.lineTo(-10, 18 + st); x.moveTo(7, 4); x.lineTo(10, 18 - st); x.stroke();
        x.fillStyle = '#8a2bd9'; x.fillRect(-16, -22, 6, 5); x.fillRect(10, -22, 6, 5); // cool shoulder pods
        // WHITE-HOT CORE (weak point)
        var p = 0.6 + 0.4 * Math.sin(g.t * 6 + tg.x * 0.05);
        x.save(); x.globalCompositeOperation = 'lighter';
        x.fillStyle = 'rgba(255,255,255,' + (0.85 * p).toFixed(2) + ')';
        x.shadowColor = '#ffffff'; x.shadowBlur = 12;
        x.beginPath(); x.arc(0, -7, 4.6, 0, TAU); x.fill(); x.restore();
      } else {
        x.rotate(tg.vx > 0 ? 0.12 : -0.12);
        x.fillStyle = '#ffe1b8'; x.strokeStyle = '#ffffff'; x.lineWidth = 1.6;
        x.beginPath(); x.ellipse(0, 0, 11, 6, 0, 0, TAU); x.fill(); x.stroke();
        x.fillStyle = '#ffffff'; x.beginPath(); x.arc(tg.vx > 0 ? 5 : -5, -1, 2.4, 0, TAU); x.fill();
      }
      x.restore();
    },
    hit: function (g, tg, wx, wy) {
      var by = tg.y + Math.sin(tg.bob) * 1.6;
      if (tg.type === 'mech') {
        if (Math.hypot(wx - tg.x, wy - (by - 7)) < 6.5) return { hit: true, crit: true };
        if (wx > tg.x - 16 && wx < tg.x + 16 && wy > by - 22 && wy < by + 20) return { hit: true, crit: false };
        return { hit: false };
      }
      if (Math.hypot(wx - tg.x, wy - by) < tg.r + 3) return { hit: true, crit: Math.hypot(wx - (tg.x + (tg.vx > 0 ? 5 : -5)), wy - (by - 1)) < 4 };
      return { hit: false };
    },
    score: function (tg, crit) { return (tg.type === 'mech' ? 300 : 150) + (crit ? 180 : 0); },
    bodyHit: function (g, tg) {   // body shots only chip a mech
      if (tg.type !== 'mech') return false;
      tg.hp -= 1; tg.vx *= 0.6;
      return tg.hp > 0;
    },
    reticle: 'box',
    grain: false
  },

  /* ---------------- C · ORBITAL OVERWATCH ---------------- */
  orbital: {
    name: 'ORBITAL OVERWATCH', sub: 'STATION DEFENSE // HAL SWARM',
    ui: '#7df7ff', uiHi: '#eafcff', uiDim: 'rgba(125,247,255,0.6)',
    tagline: 'Red eyes fall toward the shield. None get through.',
    shieldMax: 8,
    bg: function (x, g, t) {
      var W = g.WW, H = g.WH;
      var sky = x.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#010208'); sky.addColorStop(0.7, '#030618'); sky.addColorStop(1, '#04102a');
      x.fillStyle = sky; x.fillRect(0, 0, W, H);
      x.save(); x.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 70; i++) {
        var sx = (i * 97.7) % W, sy = (i * 53.3) % (H * 0.85);
        x.globalAlpha = 0.2 + 0.5 * Math.abs(Math.sin(t * 0.9 + i * 1.7));
        x.fillStyle = i % 5 === 0 ? '#bffbff' : '#e6f6ff'; x.fillRect(sx, sy, 1.4, 1.4);
      }
      x.globalAlpha = 1;
      var nb = x.createRadialGradient(W * 0.75, H * 0.25, 0, W * 0.75, H * 0.25, W * 0.4);
      nb.addColorStop(0, 'rgba(125,247,255,0.05)'); nb.addColorStop(1, 'rgba(125,247,255,0)');
      x.fillStyle = nb; x.fillRect(0, 0, W, H);
      x.restore();
      // planet limb
      x.save(); x.beginPath(); x.arc(W * 0.5, H * 1.85, H * 1.06, 0, TAU); x.clip();
      var pl = x.createLinearGradient(0, H * 0.78, 0, H);
      pl.addColorStop(0, '#0a2c4a'); pl.addColorStop(1, '#03101f');
      x.fillStyle = pl; x.fillRect(0, H * 0.7, W, H * 0.3); x.restore();
      x.save(); x.globalCompositeOperation = 'lighter';
      x.strokeStyle = 'rgba(125,247,255,0.5)'; x.lineWidth = 2; x.shadowColor = '#7df7ff'; x.shadowBlur = 9;
      x.beginPath(); x.arc(W * 0.5, H * 1.85, H * 1.06, -Math.PI * 0.78, -Math.PI * 0.22); x.stroke();
      x.restore();
      // shield line
      var sy2 = g.shieldY, hp = clamp(g.shield / WORLDS.orbital.shieldMax, 0, 1);
      x.save(); x.globalCompositeOperation = 'lighter';
      x.strokeStyle = 'rgba(125,247,255,' + (0.3 + 0.45 * hp).toFixed(2) + ')';
      x.lineWidth = 2; x.shadowColor = '#7df7ff'; x.shadowBlur = 10;
      x.setLineDash([14, 7]); x.lineDashOffset = -t * 40;
      x.beginPath(); x.moveTo(0, sy2); x.lineTo(W, sy2); x.stroke(); x.setLineDash([]);
      if (g.shieldFlash > 0) {
        x.globalAlpha = g.shieldFlash;
        x.fillStyle = 'rgba(255,80,60,0.35)'; x.fillRect(0, sy2 - 12, W, 24);
      }
      x.restore();
    },
    spawn: function (g) {
      g.targets.push({
        type: 'eye', x: rand(30, g.WW - 30), y: -20,
        vy: rand(22, 34 + g.wave * 5), sway: rand(0.6, 1.6), ph: rand(0, TAU), r: 13, hp: 1
      });
      if (g.wave >= 2 && !g.bossAlive && Math.random() < 0.14) {
        g.bossAlive = true;
        g.targets.push({ type: 'mother', x: rand(80, g.WW - 80), y: -50, vy: 11, sway: 0.5, ph: 0, r: 30, hp: 6 });
      }
    },
    upd: function (g, tg, dt) {
      tg.y += fin(tg.vy) * dt * (tg.type === 'mother' ? 1 : (1 + g.wave * 0.04));
      tg.x += Math.sin(g.t * tg.sway + tg.ph) * 26 * dt;
      if (tg.y > g.shieldY - 6) {
        tg.gone = true;
        g.shield -= (tg.type === 'mother' ? 3 : 1);
        g.shieldFlash = 1; g.shake = Math.min(2, g.shake + 0.9);
        Snd.shield();
        g.popup(tg.x, g.shieldY - 24, 'SHIELD BREACH', '#ff6b5a');
        if (tg.type === 'mother') g.bossAlive = false;
      }
    },
    draw: function (x, g, tg) {
      x.save(); x.translate(tg.x, tg.y);
      var R = tg.type === 'mother' ? 26 : 11;
      x.save(); x.globalCompositeOperation = 'lighter';
      var halo = x.createRadialGradient(0, 0, 2, 0, 0, R * 2.6);
      halo.addColorStop(0, 'rgba(255,64,40,0.55)'); halo.addColorStop(0.5, 'rgba(255,64,40,0.14)');
      halo.addColorStop(1, 'rgba(255,64,40,0)');
      x.fillStyle = halo; x.beginPath(); x.arc(0, 0, R * 2.6, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(255,120,90,0.35)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(0, -R * 1.4); x.lineTo(Math.sin(g.t * tg.sway + tg.ph) * -14, -R * 3.2); x.stroke();
      x.restore();
      x.fillStyle = '#170403'; x.beginPath(); x.arc(0, 0, R, 0, TAU); x.fill();
      var ir = x.createRadialGradient(-R * 0.2, -R * 0.2, 0, 0, 0, R);
      ir.addColorStop(0, '#ffe9d8'); ir.addColorStop(0.25, '#ff9a5a'); ir.addColorStop(0.5, '#ff3418');
      ir.addColorStop(1, '#4a0a04');
      x.fillStyle = ir; x.beginPath(); x.arc(0, 0, R * 0.86, 0, TAU); x.fill();
      x.save(); x.globalCompositeOperation = 'lighter';
      x.fillStyle = 'rgba(255,250,240,' + (0.6 + 0.4 * Math.sin(g.t * 5 + tg.ph)).toFixed(2) + ')';
      x.beginPath(); x.arc(0, 0, R * 0.2, 0, TAU); x.fill(); x.restore();
      if (tg.type === 'mother') {
        x.strokeStyle = 'rgba(255,110,80,0.8)'; x.lineWidth = 2;
        var seg = TAU / 6;
        for (var s = 0; s < tg.hp; s++) { x.beginPath(); x.arc(0, 0, R + 7, s * seg + g.t, s * seg + g.t + seg * 0.7); x.stroke(); }
      }
      x.restore();
    },
    hit: function (g, tg, wx, wy) {
      var R = tg.type === 'mother' ? 26 : 11;
      var d = Math.hypot(wx - tg.x, wy - tg.y);
      if (d < R * 0.34) return { hit: true, crit: true };
      if (d < R + 4) return { hit: true, crit: false };
      return { hit: false };
    },
    score: function (tg, crit) { return (tg.type === 'mother' ? 500 : 140) + (crit ? 160 : 0); },
    bodyHit: function (g, tg) {
      if (tg.type !== 'mother') return false;
      tg.hp -= 1; return tg.hp > 0;
    },
    onKill: function (g, tg) { if (tg.type === 'mother') { g.bossAlive = false; g.shield = Math.min(WORLDS.orbital.shieldMax, g.shield + 1); g.popup(tg.x, tg.y - 30, 'SHIELD +1', '#7df7ff'); } },
    reticle: 'holo',
    grain: false
  }
};

/* ============================================================================
   ENGINE — one run of one world
   ============================================================================ */
var RUN_TIME = 75;

function Game(key) {
  this.key = key; this.world = WORLDS[key];
  this.running = false;
}

Game.prototype.reset = function () {
  this.t = 0; this.state = 'ready'; this.stateT = 0;
  this.score = 0; this.kills = 0; this.shots = 0; this.hits = 0;
  this.combo = 0; this.comboT = 0; this.mult = 1; this.bestCombo = 0;
  this.timeLeft = RUN_TIME; this.wave = 1; this.spawnT = 0.6;
  this.targets = []; this.parts = []; this.rings = []; this.pops = []; this.tracers = [];
  this.zoom = 4; this.zoomT = 4;
  this.camX = this.WW / 2; this.camY = this.WH / 2;
  this.aimSX = this.W / 2; this.aimSY = this.H / 2;
  this.ammo = 6; this.reloadT = 0;
  this.focus = 0.5; this.focusOn = false; this.tScale = 1;
  this.wind = { a: rand(0, TAU), v: rand(8, 26), t: 0 };
  this.shake = 0; this.hitstop = 0; this.flash = 0;
  this.shield = WORLDS.orbital.shieldMax; this.shieldFlash = 0; this.bossAlive = false;
  this.callout = null; this.calloutT = 0;
};

Game.prototype.popup = function (x, y, txt, col) {
  if (this.pops.length > 12) this.pops.shift();
  this.pops.push({ x: x, y: y, txt: txt, col: col || this.world.uiHi, t: 0 });
};

/* ---- input mapping ---- */
Game.prototype.screenToWorld = function (sx, sy) {
  var s = this.s;
  return { x: this.camX + (sx - this.W / 2) / s, y: this.camY + (sy - this.H / 2) / s };
};

Game.prototype.fire = function () {
  if (this.state !== 'play') { if (this.state === 'end' && this.stateT > 0.7) this.reset(); return; }
  if (this.reloadT > 0) return;
  if (this.ammo <= 0) { Snd.empty(); this.startReload(); return; }
  this.ammo--; this.shots++;
  Snd.shot();
  this.shake = Math.min(1.6, this.shake + 0.55); this.flash = 1;
  var sway = this.swayNow();
  var windK = (this.zoom - 2) / 10 * 0.9;
  var aim = this.screenToWorld(this.aimSX, this.aimSY);
  var wx = aim.x + sway.x + Math.cos(this.wind.a) * this.wind.v * windK;
  var wy = aim.y + sway.y + Math.sin(this.wind.a) * this.wind.v * windK * 0.5;
  this.tracers.push({ x: wx, y: wy, t: 0 });
  var best = null;
  for (var i = 0; i < this.targets.length; i++) {
    var tg = this.targets[i]; if (tg.dead || tg.gone) continue;
    var h = this.world.hit(this, tg, wx, wy);
    if (h.hit) { best = { tg: tg, crit: h.crit }; break; }
  }
  if (best) this.onHit(best.tg, best.crit, wx, wy);
  else {
    this.combo = 0; this.mult = 1;
    this.spawnParts(wx, wy, 5, 'rgba(200,255,220,', 0.6);
  }
  if (this.ammo <= 0) this.startReload();
};

Game.prototype.onHit = function (tg, crit, wx, wy) {
  this.hits++;
  if (!crit && this.world.bodyHit && this.world.bodyHit(this, tg)) {
    Snd.hit();
    this.spawnParts(wx, wy, 8, 'rgba(255,220,160,', 1);
    this.popup(tg.x, tg.y - 24, 'ARMOR', this.world.uiDim);
    return;
  }
  tg.dead = true;
  this.kills++;
  this.combo++; this.comboT = 3; this.bestCombo = Math.max(this.bestCombo, this.combo);
  this.mult = Math.min(8, 1 + Math.floor(this.combo / 2));
  var pts = Math.round(this.world.score(tg, crit) * this.mult);
  this.score += pts;
  this.focus = Math.min(1, this.focus + 0.16);
  Snd.kill(); if (crit) Snd.crit();
  this.rings.push({ x: tg.x, y: tg.y, r: 6, t: 0 });
  this.spawnParts(tg.x, tg.y, crit ? 26 : 16, this.key === 'thermal' ? 'rgba(255,200,120,' : (this.key === 'orbital' ? 'rgba(125,247,255,' : 'rgba(140,255,180,'), crit ? 1.5 : 1);
  this.popup(tg.x, tg.y - 26, (crit ? 'CRITICAL +' : '+') + pts, crit ? '#ffffff' : this.world.uiHi);
  if (this.world.onKill) this.world.onKill(this, tg);
  var names = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'RAMPAGE', 5: 'OVERWATCH', 7: 'LEGEND' };
  if (names[this.combo]) { this.callout = names[this.combo]; this.calloutT = 1.4; Snd.call(); }
  this.hitstop = crit ? 0.12 : 0.05;
  if (crit && this.combo >= 3) { this.slowT = 0.38; this.popup(tg.x, tg.y - 44, 'PERFECT', '#ffffff'); }
};

Game.prototype.startReload = function () {
  if (this.reloadT > 0 || this.ammo === 6) return;
  this.reloadT = 1.05; Snd.reload();
};

Game.prototype.swayNow = function () {
  var amp = (0.6 + this.zoom * 0.55) * (this.focusOn ? 0.18 : 1);
  return { x: Math.sin(this.t * 1.7) * amp + Math.sin(this.t * 3.1) * amp * 0.4, y: Math.cos(this.t * 1.3) * amp * 0.8 };
};

Game.prototype.spawnParts = function (x, y, n, colPrefix, sp) {
  for (var i = 0; i < n && this.parts.length < 140; i++) {
    var a = rand(0, TAU), v = rand(30, 130) * sp;
    this.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, t: 0, life: rand(0.3, 0.8), col: colPrefix });
  }
};

/* ---- update ---- */
Game.prototype.update = function (rdt) {
  var w = this.world;
  this.stateT += rdt;
  if (this.hitstop > 0) { this.hitstop -= rdt; return; }
  var target = this.focusOn ? 0.3 : (this.slowT > 0 ? 0.35 : 1);
  this.tScale = lerp(this.tScale, target, 0.2);
  if (this.slowT > 0) this.slowT -= rdt;
  var dt = rdt * this.tScale;
  this.t += dt;

  if (this.state === 'ready') { if (this.stateT > 1.3) { this.state = 'play'; this.stateT = 0; } return; }
  if (this.state === 'end') return;

  this.timeLeft -= rdt;
  if (this.timeLeft <= 10.2 && this.timeLeft + rdt > 10.2) Snd.tickHi();
  if (this.timeLeft <= 0 || (this.key === 'orbital' && this.shield <= 0)) { this.endRun(); return; }

  var newWave = 1 + Math.floor((RUN_TIME - this.timeLeft) / 15);
  if (newWave !== this.wave) { this.wave = newWave; this.popup(this.WW / 2, this.WH * 0.24, 'WAVE ' + this.wave, this.world.uiHi); Snd.call(); }

  this.spawnT -= dt;
  var alive = 0; for (var i = 0; i < this.targets.length; i++) if (!this.targets[i].dead && !this.targets[i].gone) alive++;
  var cap = 4 + this.wave * 2;
  if (this.spawnT <= 0 && alive < cap) { w.spawn(this); this.spawnT = Math.max(0.35, 1.5 - this.wave * 0.16); }

  for (var j = this.targets.length - 1; j >= 0; j--) {
    var tg = this.targets[j];
    if (tg.dead) { tg.deadT = (tg.deadT || 0) + dt; if (tg.deadT > 0.5) this.targets.splice(j, 1); continue; }
    w.upd(this, tg, dt);
    if (tg.gone && !tg.dead) this.targets.splice(j, 1);
  }

  if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) { this.combo = 0; this.mult = 1; } }
  if (this.calloutT > 0) this.calloutT -= rdt;
  if (this.reloadT > 0) { this.reloadT -= rdt; if (this.reloadT <= 0) this.ammo = 6; }
  if (this.focusOn) { this.focus -= rdt * 0.34; if (this.focus <= 0) { this.focus = 0; this.focusOn = false; } }

  this.wind.t -= dt;
  if (this.wind.t <= 0) { this.wind.t = rand(4, 8); this.wind.va = rand(0, TAU); this.wind.vv = rand(6, 30); }
  this.wind.a += (((this.wind.va || this.wind.a) - this.wind.a + Math.PI * 3) % TAU - Math.PI) * dt * 0.4;
  this.wind.v = lerp(this.wind.v, this.wind.vv || this.wind.v, dt * 0.5);

  this.zoom = lerp(this.zoom, this.zoomT, Math.min(1, rdt * 9));
  this.s = Math.max(1, 0.7 + this.zoom * 0.22);
  var aimW = this.screenToWorld(this.aimSX, this.aimSY);
  this.camX = lerp(this.camX, aimW.x, Math.min(1, rdt * 3.2));
  this.camY = lerp(this.camY, aimW.y, Math.min(1, rdt * 3.2));
  var hw = this.W / 2 / this.s, hh = this.H / 2 / this.s;
  this.camX = clamp(this.camX, hw, this.WW - hw); this.camY = clamp(this.camY, hh, this.WH - hh);

  for (var p = this.parts.length - 1; p >= 0; p--) {
    var pt = this.parts[p]; pt.t += dt;
    if (pt.t > pt.life) { this.parts.splice(p, 1); continue; }
    pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 140 * dt;
  }
  for (var r = this.rings.length - 1; r >= 0; r--) { var rg = this.rings[r]; rg.t += dt; if (rg.t > 0.5) this.rings.splice(r, 1); }
  for (var q = this.pops.length - 1; q >= 0; q--) { var pp = this.pops[q]; pp.t += rdt; if (pp.t > 1) this.pops.splice(q, 1); }
  for (var tr = this.tracers.length - 1; tr >= 0; tr--) { var trc = this.tracers[tr]; trc.t += rdt; if (trc.t > 0.22) this.tracers.splice(tr, 1); }
  this.shake = Math.max(0, this.shake - rdt * 4);
  this.flash = Math.max(0, this.flash - rdt * 7);
  this.shieldFlash = Math.max(0, this.shieldFlash - rdt * 2);
};

Game.prototype.endRun = function () {
  this.state = 'end'; this.stateT = 0;
  this.focusOn = false;
  var k = 'ccSniperLab.best.' + this.key;
  try {
    var prev = parseInt(localStorage.getItem(k) || '0', 10) || 0;
    this.newBest = this.score > prev;
    if (this.newBest) localStorage.setItem(k, String(this.score));
    this.best = Math.max(prev, this.score);
  } catch (e) { this.best = this.score; }
  Snd.boom();
};

Game.prototype.getBest = function () {
  try { return parseInt(localStorage.getItem('ccSniperLab.best.' + this.key) || '0', 10) || 0; } catch (e) { return 0; }
};

/* ---- render ---- */
Game.prototype.render = function (x) {
  var W = this.W, H = this.H, w = this.world;
  x.clearRect(0, 0, W, H);
  var shx = this.shake > 0 ? rand(-1, 1) * this.shake * 4 : 0;
  var shy = this.shake > 0 ? rand(-1, 1) * this.shake * 4 : 0;
  x.save();
  x.translate(W / 2 + shx, H / 2 + shy); x.scale(this.s, this.s); x.translate(-this.camX, -this.camY);
  try { w.bg(x, this, this.t); } catch (e) {}
  for (var i = 0; i < this.targets.length; i++) {
    var tg = this.targets[i];
    if (tg.dead) {
      x.save(); x.globalAlpha = Math.max(0, 1 - (tg.deadT || 0) * 2); w.draw(x, this, tg); x.restore();
      continue;
    }
    try { w.draw(x, this, tg); } catch (e) {}
  }
  x.save(); x.globalCompositeOperation = 'lighter';
  for (var p = 0; p < this.parts.length; p++) {
    var pt = this.parts[p], a = Math.max(0, 1 - pt.t / pt.life);
    x.fillStyle = pt.col + a.toFixed(2) + ')'; x.fillRect(pt.x - 1.2, pt.y - 1.2, 2.4, 2.4);
  }
  for (var r = 0; r < this.rings.length; r++) {
    var rg = this.rings[r], u = rg.t / 0.5;
    x.globalAlpha = 1 - u; x.strokeStyle = w.uiHi; x.lineWidth = 2;
    x.beginPath(); x.arc(rg.x, rg.y, 6 + u * 46, 0, TAU); x.stroke();
  }
  x.globalAlpha = 1;
  for (var tr = 0; tr < this.tracers.length; tr++) {
    var trc = this.tracers[tr], ua = 1 - trc.t / 0.22;
    x.fillStyle = 'rgba(255,255,255,' + (0.9 * ua).toFixed(2) + ')';
    x.beginPath(); x.arc(trc.x, trc.y, 2.2, 0, TAU); x.fill();
  }
  x.restore();
  // popups (world space)
  for (var q = 0; q < this.pops.length; q++) {
    var pp = this.pops[q];
    var sx = W / 2 + (pp.x - this.camX) * this.s, sy = H / 2 + (pp.y - this.camY) * this.s - pp.t * 34;
    x.save(); x.globalAlpha = Math.max(0, 1 - pp.t); x.font = '700 13px ' + FONT; x.textAlign = 'center';
    x.fillStyle = pp.col; x.shadowColor = pp.col; x.shadowBlur = 8; x.fillText(pp.txt, sx, sy); x.restore();
  }
  x.restore();
  if (w.grain) {
    x.save(); x.globalAlpha = 0.5;
    var gt = getGrain(), ox = (Math.random() * 160) | 0, oy = (Math.random() * 160) | 0;
    x.translate(-ox, -oy);
    for (var gy = 0; gy < H + 160; gy += 160) for (var gx = 0; gx < W + 160; gx += 160) x.drawImage(gt, gx, gy);
    x.restore();
  }
  this.drawScope(x, W, H);
  this.drawHUD(x, W, H);
  if (this.flash > 0) { x.save(); x.globalAlpha = this.flash * 0.16; x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H); x.restore(); }
  if (this.focusOn || this.tScale < 0.8) {
    x.save(); x.globalAlpha = 0.5;
    var fv = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
    fv.addColorStop(0, 'rgba(0,0,0,0)'); fv.addColorStop(1, 'rgba(60,130,255,0.28)');
    x.fillStyle = fv; x.fillRect(0, 0, W, H); x.restore();
  }
  // scanlines
  x.save(); x.globalAlpha = 0.05; x.fillStyle = '#000';
  for (var y = 0; y < H; y += 3) x.fillRect(0, y, W, 1); x.restore();
  if (this.state === 'ready') this.drawReady(x, W, H);
  if (this.state === 'end') this.drawEnd(x, W, H);
};

Game.prototype.drawScope = function (x, W, H) {
  var cx = this.aimSX, cy = this.aimSY, R = Math.max(60, Math.min(W, H) * 0.17);
  var w = this.world, sway = this.swayNow();
  cx += sway.x * this.s * 0.4; cy += sway.y * this.s * 0.4;
  x.save();
  x.fillStyle = 'rgba(1,6,4,0.42)';
  x.beginPath(); x.rect(0, 0, W, H); x.arc(cx, cy, R, 0, TAU, true); x.fill('evenodd');
  var lens = x.createRadialGradient(cx, cy, R * 0.4, cx, cy, R);
  lens.addColorStop(0, 'rgba(255,255,255,0)'); lens.addColorStop(1, 'rgba(0,0,0,0.28)');
  x.fillStyle = lens; x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.fill();
  x.strokeStyle = w.ui; x.lineWidth = 2.4; x.shadowColor = w.ui; x.shadowBlur = 10;
  x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.stroke();
  x.shadowBlur = 0; x.strokeStyle = w.uiDim; x.lineWidth = 1;
  x.beginPath(); x.arc(cx, cy, R + 7, 0, TAU); x.stroke();
  for (var i = 0; i < 24; i++) {
    var a = i / 24 * TAU, l = i % 6 === 0 ? 9 : 4;
    x.beginPath(); x.moveTo(cx + Math.cos(a) * (R + 7), cy + Math.sin(a) * (R + 7));
    x.lineTo(cx + Math.cos(a) * (R + 7 + l), cy + Math.sin(a) * (R + 7 + l)); x.stroke();
  }
  // reticle
  x.strokeStyle = w.uiHi; x.lineWidth = 1.3; x.shadowColor = w.ui; x.shadowBlur = 4;
  if (w.reticle === 'box') {
    x.strokeRect(cx - 15, cy - 15, 30, 30);
    x.beginPath(); x.moveTo(cx - 26, cy); x.lineTo(cx - 15, cy); x.moveTo(cx + 15, cy); x.lineTo(cx + 26, cy);
    x.moveTo(cx, cy - 26); x.lineTo(cx, cy - 15); x.moveTo(cx, cy + 15); x.lineTo(cx, cy + 26); x.stroke();
  } else if (w.reticle === 'holo') {
    x.beginPath(); x.arc(cx, cy, 14, 0, TAU); x.stroke();
    var ra = this.t * 1.4;
    x.beginPath(); x.arc(cx, cy, 21, ra, ra + 1.1); x.stroke();
    x.beginPath(); x.arc(cx, cy, 21, ra + Math.PI, ra + Math.PI + 1.1); x.stroke();
  } else {
    x.beginPath(); x.moveTo(cx - R * 0.86, cy); x.lineTo(cx + R * 0.86, cy);
    x.moveTo(cx, cy - R * 0.86); x.lineTo(cx, cy + R * 0.86); x.stroke();
    x.fillStyle = w.uiHi;
    for (var m = 1; m <= 3; m++) {
      x.fillRect(cx - 1.4 + m * 16, cy - 1.4, 2.8, 2.8); x.fillRect(cx - 1.4 - m * 16, cy - 1.4, 2.8, 2.8);
      x.fillRect(cx - 1.4, cy - 1.4 + m * 16, 2.8, 2.8); x.fillRect(cx - 1.4, cy - 1.4 - m * 16, 2.8, 2.8);
    }
  }
  x.fillStyle = '#ffffff'; x.fillRect(cx - 1, cy - 1, 2, 2);
  if (this.reloadT > 0) {
    var u = 1 - this.reloadT / 1.05;
    x.strokeStyle = w.uiHi; x.lineWidth = 3;
    x.beginPath(); x.arc(cx, cy, 30, -Math.PI / 2, -Math.PI / 2 + u * TAU); x.stroke();
    x.font = '700 10px ' + FONT; x.textAlign = 'center'; x.fillStyle = w.uiHi;
    x.fillText('RELOADING', cx, cy + 44);
  }
  x.restore();
};

Game.prototype.drawHUD = function (x, W, H) {
  var w = this.world;
  x.save(); x.textBaseline = 'top';
  x.font = '700 20px ' + FONT; x.textAlign = 'left';
  x.fillStyle = w.uiHi; x.shadowColor = w.ui; x.shadowBlur = 8;
  x.fillText(pad6(this.score), 112, 12);
  x.shadowBlur = 0; x.font = '700 12px ' + FONT; x.fillStyle = w.uiDim;
  x.fillText('SCORE', 112, 36);
  if (this.mult > 1) {
    x.font = '800 16px ' + FONT; x.fillStyle = '#ffd24a'; x.shadowColor = '#ffd24a'; x.shadowBlur = 8;
    x.fillText('x' + this.mult, 218, 14); x.shadowBlur = 0;
  }
  // timer
  x.textAlign = 'center';
  var tl = Math.max(0, this.timeLeft), urgent = tl < 10;
  x.font = '800 24px ' + FONT;
  x.fillStyle = urgent ? '#ff6b5a' : w.uiHi; x.shadowColor = urgent ? '#ff6b5a' : w.ui;
  x.shadowBlur = urgent ? 12 : 6;
  x.fillText(Math.floor(tl / 60) + ':' + String(Math.floor(tl % 60)).padStart(2, '0'), W / 2, 10);
  x.shadowBlur = 0;
  // wind
  x.font = '700 11px ' + FONT; x.fillStyle = w.uiDim;
  x.fillText('WIND ' + Math.round(this.wind.v) + '', W / 2, 40);
  x.save(); x.translate(W / 2 + 52, 46); x.rotate(this.wind.a);
  x.strokeStyle = w.uiHi; x.lineWidth = 1.6;
  x.beginPath(); x.moveTo(-8, 0); x.lineTo(8, 0); x.lineTo(4, -3); x.moveTo(8, 0); x.lineTo(4, 3); x.stroke();
  x.restore();
  // right block
  x.textAlign = 'right';
  x.font = '700 13px ' + FONT; x.fillStyle = w.uiDim;
  x.fillText('WAVE ' + this.wave, W - 16, 12);
  x.fillText('BEST ' + pad6(this.state === 'end' ? this.best : this.getBest()), W - 16, 30);
  x.fillText('ZOOM ' + this.zoom.toFixed(0) + 'x', W - 16, 48);
  // ammo pips
  x.textAlign = 'left';
  for (var a = 0; a < 6; a++) {
    x.fillStyle = a < this.ammo ? w.uiHi : 'rgba(120,140,130,0.25)';
    x.fillRect(W / 2 - 48 + a * 16, H - 26, 9, 14);
  }
  // focus bar
  x.fillStyle = w.uiDim; x.font = '700 10px ' + FONT;
  x.fillText('FOCUS', 16, H - 40);
  x.strokeStyle = w.uiDim; x.strokeRect(16, H - 26, 120, 12);
  x.fillStyle = this.focus >= 0.4 ? '#7df7ff' : w.uiDim;
  x.fillRect(18, H - 24, 116 * clamp(this.focus, 0, 1), 8);
  // shield (orbital)
  if (this.key === 'orbital') {
    x.textAlign = 'right'; x.fillStyle = w.uiDim; x.fillText('SHIELD', W - 16, H - 40);
    for (var s = 0; s < WORLDS.orbital.shieldMax; s++) {
      x.fillStyle = s < this.shield ? '#7df7ff' : 'rgba(255,107,90,0.3)';
      x.fillRect(W - 16 - (WORLDS.orbital.shieldMax - s) * 14, H - 26, 10, 12);
    }
  }
  // combo callout
  if (this.calloutT > 0 && this.callout) {
    var u = 1 - this.calloutT / 1.4, sc = 1 + (u < 0.15 ? (0.15 - u) * 4 : 0);
    x.save(); x.translate(W / 2, H * 0.2); x.scale(sc, sc);
    x.globalAlpha = Math.min(1, this.calloutT * 2);
    x.font = '900 30px ' + FONT; x.textAlign = 'center';
    x.fillStyle = '#ffd24a'; x.shadowColor = '#ffd24a'; x.shadowBlur = 16;
    x.fillText(this.callout, 0, 0); x.restore();
  }
  // touch controls
  if (this.touch) {
    x.globalAlpha = 0.85;
    x.strokeStyle = w.ui; x.lineWidth = 2; x.fillStyle = 'rgba(4,16,10,0.5)';
    var fb = this.fireBtn; x.beginPath(); x.arc(fb.x, fb.y, fb.r, 0, TAU); x.fill(); x.stroke();
    x.fillStyle = w.uiHi; x.font = '800 14px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('FIRE', fb.x, fb.y);
    var fo = this.focusBtn; x.fillStyle = 'rgba(4,16,10,0.5)';
    x.beginPath(); x.arc(fo.x, fo.y, fo.r, 0, TAU); x.fill(); x.stroke();
    x.fillStyle = this.focus >= 0.4 ? '#7df7ff' : w.uiDim; x.font = '800 11px ' + FONT;
    x.fillText('FOCUS', fo.x, fo.y);
    x.textBaseline = 'top'; x.globalAlpha = 1;
    var zi = this.zoomIn, zo = this.zoomOut;
    x.fillStyle = 'rgba(4,16,10,0.5)'; x.strokeStyle = w.uiDim;
    x.strokeRect(zi.x, zi.y, zi.w, zi.h); x.strokeRect(zo.x, zo.y, zo.w, zo.h);
    x.fillStyle = w.uiHi; x.font = '800 16px ' + FONT; x.textAlign = 'center';
    x.fillText('+', zi.x + zi.w / 2, zi.y + 6); x.fillText('−', zo.x + zo.w / 2, zo.y + 6);
  }
  x.restore();
};

Game.prototype.drawReady = function (x, W, H) {
  var w = this.world, a = Math.min(1, this.stateT * 3);
  x.save(); x.globalAlpha = a;
  x.fillStyle = 'rgba(1,6,4,0.55)'; x.fillRect(0, 0, W, H);
  x.textAlign = 'center';
  x.font = '900 34px ' + FONT; x.fillStyle = w.uiHi; x.shadowColor = w.ui; x.shadowBlur = 16;
  x.fillText(w.name, W / 2, H * 0.4);
  x.shadowBlur = 0; x.font = '700 13px ' + FONT; x.fillStyle = w.uiDim;
  x.fillText(w.sub, W / 2, H * 0.4 + 40);
  x.fillStyle = w.uiHi; x.font = '700 12px ' + FONT;
  x.fillText(w.tagline, W / 2, H * 0.4 + 66);
  x.restore();
};

Game.prototype.drawEnd = function (x, W, H) {
  var w = this.world, a = Math.min(1, this.stateT * 2.2);
  var acc = this.shots ? Math.round(this.hits / this.shots * 100) : 0;
  var medal = this.score >= 30000 ? 'PHANTOM' : this.score >= 18000 ? 'GOLD' : this.score >= 9000 ? 'SILVER' : 'BRONZE';
  x.save(); x.globalAlpha = a;
  x.fillStyle = 'rgba(1,5,3,0.78)'; x.fillRect(0, 0, W, H);
  x.textAlign = 'center';
  var failed = (this.key === 'orbital' && this.shield <= 0);
  x.font = '900 30px ' + FONT; x.fillStyle = failed ? '#ff6b5a' : w.uiHi;
  x.shadowColor = failed ? '#ff6b5a' : w.ui; x.shadowBlur = 14;
  x.fillText(failed ? 'SHIELD DOWN' : 'OP COMPLETE', W / 2, H * 0.24);
  x.shadowBlur = 0;
  x.font = '800 42px ' + FONT; x.fillStyle = '#ffffff'; x.shadowColor = w.ui; x.shadowBlur = 10;
  x.fillText(pad6(this.score), W / 2, H * 0.24 + 46); x.shadowBlur = 0;
  x.font = '700 13px ' + FONT; x.fillStyle = w.uiDim;
  x.fillText('KILLS ' + this.kills + '   ·   ACCURACY ' + acc + '%   ·   BEST STREAK x' + this.bestCombo, W / 2, H * 0.24 + 104);
  x.font = '800 16px ' + FONT; x.fillStyle = '#ffd24a'; x.shadowColor = '#ffd24a'; x.shadowBlur = 8;
  x.fillText('MEDAL · ' + medal + (this.newBest ? '   ★ NEW BEST' : ''), W / 2, H * 0.24 + 132);
  x.shadowBlur = 0;
  if (this.stateT > 0.7) {
    var p2 = 0.5 + 0.5 * Math.sin(this.stateT * 4);
    x.globalAlpha = a * (0.5 + 0.5 * p2);
    x.font = '700 13px ' + FONT; x.fillStyle = w.uiHi;
    x.fillText('TAP / CLICK TO REDEPLOY   ·   ESC TO EXIT', W / 2, H * 0.24 + 178);
  }
  x.restore();
};

/* ============================================================================
   OVERLAY + INPUT + LOOP
   ============================================================================ */
var ov = null, ovCanvas = null, ovCtx = null, current = null, rafId = 0, lastMs = 0;

function buildOverlay() {
  if (ov) return;
  ov = document.createElement('div');
  ov.id = 'snlab-ov';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#010604;display:none;touch-action:none;-webkit-user-select:none;user-select:none;overscroll-behavior:none;cursor:crosshair';
  ovCanvas = document.createElement('canvas');
  ovCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  ov.appendChild(ovCanvas);
  var exit = document.createElement('button');
  exit.textContent = '✕ EXIT';
  exit.style.cssText = 'position:absolute;top:max(10px,env(safe-area-inset-top));left:max(10px,env(safe-area-inset-left));z-index:3;background:rgba(4,13,9,.6);color:#7dffb0;border:1px solid rgba(65,255,126,.5);border-radius:7px;font:700 12px ' + FONT + ';letter-spacing:1px;padding:9px 13px;cursor:pointer';
  exit.addEventListener('click', function (e) { e.stopPropagation(); api.close(); });
  ov.appendChild(exit);
  document.body.appendChild(ov);

  ovCanvas.addEventListener('pointermove', function (e) {
    if (!current) return;
    if (current.touch && e.pointerType !== 'mouse') {
      if (current._aimId === e.pointerId) {
        current.aimSX = clamp(current.aimSX + (e.clientX - current._px) * 1.35, 0, current.W);
        current.aimSY = clamp(current.aimSY + (e.clientY - current._py) * 1.35, 0, current.H);
        current._px = e.clientX; current._py = e.clientY;
      }
      return;
    }
    current.aimSX = e.clientX; current.aimSY = e.clientY;
  });
  ovCanvas.addEventListener('pointerdown', function (e) {
    if (!current) return;
    Snd.resume();
    e.preventDefault();
    if (e.pointerType !== 'mouse') {
      current.touch = true;
      var x = e.clientX, y = e.clientY;
      var fb = current.fireBtn, fo = current.focusBtn, zi = current.zoomIn, zo = current.zoomOut;
      if (Math.hypot(x - fb.x, y - fb.y) < fb.r + 8) { current.fire(); return; }
      if (Math.hypot(x - fo.x, y - fo.y) < fo.r + 8) { tryFocus(current); return; }
      if (x > zi.x - 6 && x < zi.x + zi.w + 6 && y > zi.y - 6 && y < zi.y + zi.h + 6) { current.zoomT = clamp(current.zoomT + 1.4, 2, 12); return; }
      if (x > zo.x - 6 && x < zo.x + zo.w + 6 && y > zo.y - 6 && y < zo.y + zo.h + 6) { current.zoomT = clamp(current.zoomT - 1.4, 2, 12); return; }
      if (current.state === 'end') { current.fire(); return; }
      current._aimId = e.pointerId; current._px = x; current._py = y;
      return;
    }
    current.fire();
  });
  ovCanvas.addEventListener('pointerup', function (e) { if (current && current._aimId === e.pointerId) current._aimId = null; });
  ovCanvas.addEventListener('wheel', function (e) {
    e.preventDefault(); if (!current) return;
    current.zoomT = clamp(current.zoomT + (e.deltaY < 0 ? 0.8 : -0.8), 2, 12);
  }, { passive: false });
  window.addEventListener('keydown', function (e) {
    if (!current || ov.style.display === 'none') return;
    if (e.key === 'Escape') { api.close(); return; }
    if (e.key === ' ') { e.preventDefault(); current.fire(); }
    if (e.key === 'r' || e.key === 'R') current.startReload();
    if (e.key === 'Shift' || e.key === 'f' || e.key === 'F') tryFocus(current);
  });
  window.addEventListener('resize', fitOverlay);
}

function tryFocus(g) {
  if (g.focusOn || g.focus < 0.4 || g.state !== 'play') return;
  g.focusOn = true; Snd.focus();
}

function fitOverlay() {
  if (!ovCanvas || !current) return;
  var r = ovCanvas.getBoundingClientRect();
  ovCanvas.width = Math.max(2, r.width * DPRV); ovCanvas.height = Math.max(2, r.height * DPRV);
  ovCtx = ovCanvas.getContext('2d');
  current.W = r.width; current.H = r.height;
  current.WW = Math.max(720, r.width); current.WH = Math.max(400, r.height);
  current.shieldY = current.WH * 0.86;
  current.fireBtn = { x: r.width - 74, y: r.height - 84, r: 44 };
  current.focusBtn = { x: 66, y: r.height - 84, r: 34 };
  current.zoomIn = { x: r.width - 46, y: r.height * 0.32, w: 34, h: 30 };
  current.zoomOut = { x: r.width - 46, y: r.height * 0.32 + 40, w: 34, h: 30 };
}

function loop(ms) {
  rafId = requestAnimationFrame(loop);
  if (!current || document.hidden) { lastMs = ms; return; }
  var dt = lastMs ? Math.min(0.05, (ms - lastMs) / 1000) : 0.016;
  lastMs = ms;
  try {
    current.update(dt);
    ovCtx.setTransform(DPRV, 0, 0, DPRV, 0, 0);
    current.render(ovCtx);
  } catch (e) {}
}

/* ============================================================================
   ATTRACT PREVIEWS (cards)
   ============================================================================ */
function mountPreview(key, canvas) {
  var w = WORLDS[key]; if (!w || !canvas) return;
  var vis = true;
  try { new IntersectionObserver(function (es) { vis = es[0].isIntersecting; }, { rootMargin: '120px' }).observe(canvas); } catch (e) {}
  var fake = { WW: 0, WH: 0, t: 0, cones: [], shield: 8, shieldFlash: 0, shake: 0, wave: 1, targets: [], shieldY: 0, popup: function () {} };
  var seedT = Math.random() * 20;
  function frame(ms) {
    requestAnimationFrame(frame);
    if (!vis || document.hidden) return;
    var r = canvas.getBoundingClientRect();
    if (r.width < 20) return;
    var Wc = Math.round(r.width * DPRV), Hc = Math.round(r.height * DPRV);
    if (canvas.width !== Wc || canvas.height !== Hc) { canvas.width = Wc; canvas.height = Hc; }
    var x = canvas.getContext('2d');
    x.setTransform(DPRV, 0, 0, DPRV, 0, 0);
    var W = r.width, H = r.height, t = ms / 1000 + seedT;
    fake.WW = W; fake.WH = H; fake.t = t; fake.shieldY = H * 0.9;
    x.clearRect(0, 0, W, H);
    try { w.bg(x, fake, t); } catch (e) {}
    // a couple of idle targets drifting
    if (fake.targets.length < 3 && Math.random() < 0.02) { try { w.spawn(fake); } catch (e) {} }
    for (var i = fake.targets.length - 1; i >= 0; i--) {
      var tg = fake.targets[i];
      try { w.upd(fake, tg, 1 / 60); w.draw(x, fake, tg); } catch (e) {}
      if (tg.gone || tg.y > H) fake.targets.splice(i, 1);
    }
    fake.shield = 8;
    // sweeping lens
    var lx = W * (0.5 + 0.34 * Math.sin(t * 0.4)), ly = H * (0.5 + 0.16 * Math.sin(t * 0.63));
    var R = H * 0.3;
    x.save(); x.strokeStyle = w.ui; x.lineWidth = 2; x.shadowColor = w.ui; x.shadowBlur = 8;
    x.beginPath(); x.arc(lx, ly, R, 0, TAU); x.stroke(); x.shadowBlur = 0;
    x.strokeStyle = w.uiDim; x.beginPath(); x.moveTo(lx - R * 0.7, ly); x.lineTo(lx + R * 0.7, ly);
    x.moveTo(lx, ly - R * 0.7); x.lineTo(lx, ly + R * 0.7); x.stroke(); x.restore();
    // title
    x.save(); x.textAlign = 'center';
    x.font = '900 22px ' + FONT; x.fillStyle = w.uiHi; x.shadowColor = w.ui; x.shadowBlur = 10;
    x.fillText(w.name, W / 2, H * 0.42);
    x.shadowBlur = 0; x.font = '700 10px ' + FONT; x.fillStyle = w.uiDim;
    x.fillText(w.sub, W / 2, H * 0.42 + 20);
    var p = 0.5 + 0.5 * Math.sin(t * 2.4);
    x.globalAlpha = 0.55 + 0.45 * p; x.font = '800 12px ' + FONT; x.fillStyle = w.uiHi;
    x.fillText('▶  DEPLOY', W / 2, H * 0.42 + 46);
    x.restore();
    // scanlines
    x.save(); x.globalAlpha = 0.05; x.fillStyle = '#000';
    for (var y = 0; y < H; y += 3) x.fillRect(0, y, W, 1); x.restore();
    // best
    var best = 0; try { best = parseInt(localStorage.getItem('ccSniperLab.best.' + key) || '0', 10) || 0; } catch (e) {}
    if (best > 0) {
      x.save(); x.textAlign = 'right'; x.font = '700 10px ' + FONT; x.fillStyle = w.uiDim;
      x.fillText('BEST ' + pad6(best), W - 10, 10); x.restore();
    }
  }
  requestAnimationFrame(frame);
  canvas.style.cursor = 'pointer';
  canvas.addEventListener('click', function () { api.deploy(key); });
}

/* ============================================================================
   PUBLIC API
   ============================================================================ */
var api = {
  mountPreview: mountPreview,
  deploy: function (key) {
    if (!WORLDS[key]) return;
    buildOverlay();
    Snd.resume();
    current = new Game(key);
    ov.style.display = 'block';
    fitOverlay();
    current.reset();
    document.documentElement.style.overflow = 'hidden';
    if (!rafId) { lastMs = 0; rafId = requestAnimationFrame(loop); }
  },
  close: function () {
    if (ov) ov.style.display = 'none';
    current = null;
    document.documentElement.style.overflow = '';
  },
  isOpen: function () { return !!current; }
};
window.SniperLab = api;
})();
