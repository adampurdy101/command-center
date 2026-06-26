/* ============================================================
   LIVING BACKDROP  ·  "GRID CHAMBER"  (Option A)
   ------------------------------------------------------------
   A slow 3D grid-chamber rendered on a canvas BEHIND the hub
   panels. The panels are opaque, so this never washes over your
   data — it glows in the 8px gutters, behind the header, and
   around the globe, giving the page depth.

   Notes:
   • No scanlines / vignette here — .crt::before / ::after already
     paint those on top (css/layout.css), so we'd double up.
   • Renders at a capped DPR (it lives behind opaque panels, no
     need for full retina) and throttles to ~30fps.
   • Pauses when the tab is hidden or the hub is hidden (login),
     and honors prefers-reduced-motion (paints one static frame).
   Self-contained IIFE, defer-loaded.
   ============================================================ */
(function () {
  'use strict';
  var cv = document.getElementById('page-bg');
  if (!cv) return;
  var ctx = cv.getContext('2d', { alpha: true });
  if (!ctx) return;

  /* palette — matches the hub */
  var C = { g: '#41ff7e', hi: '#7dffb0', dim: '#2bd964', faint: '#1c8f46', cyan: '#7df7ff' };
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function hexA(h, a) {
    return 'rgba(' + parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16) + ',' + a + ')';
  }

  /* ---------- sizing: capped DPR, draw in CSS pixels ---------- */
  var DPR = 1, W = 1, H = 1;
  function resize() {
    var r = cv.getBoundingClientRect();
    var cssW = Math.max(1, Math.round(r.width));
    var cssH = Math.max(1, Math.round(r.height));
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    cv.width = Math.round(cssW * DPR);
    cv.height = Math.round(cssH * DPR);
    W = cssW; H = cssH;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  /* ---------- shared helpers (ported from the approved mockup) ---------- */
  function glowPools(t, strength) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var ps = [[C.g, 0], [C.cyan, 2.2], [C.g, 4.4]];
    for (var i = 0; i < ps.length; i++) {
      var px = (0.5 + 0.42 * Math.sin(t * 0.12 + ps[i][1])) * W,
          py = (0.42 + 0.26 * Math.cos(t * 0.1 + ps[i][1] * 1.5)) * H,
          r = W * 0.28;
      var g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, hexA(ps[i][0], strength)); g.addColorStop(1, hexA(ps[i][0], 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }
  function pgrid(t, HOR, ceiling) {
    var vpx = W / 2; ctx.save(); ctx.strokeStyle = C.g; ctx.lineWidth = 1.1;
    /* converging verticals — floor (and ceiling) */
    for (var i = -17; i <= 17; i++) {
      ctx.globalAlpha = Math.max(0, 0.20 - Math.abs(i) * 0.004); var bx = vpx + i * (W * 0.08);
      ctx.beginPath(); ctx.moveTo(vpx, HOR); ctx.lineTo(bx, H); ctx.stroke();
      if (ceiling) { ctx.beginPath(); ctx.moveTo(vpx, HOR); ctx.lineTo(bx, 0); ctx.stroke(); }
    }
    /* receding horizontals, scrolling toward the viewer */
    var sc = (t * 0.22) % 1;
    for (var k = 0; k < 16; k++) {
      var p = (k + sc) / 16;
      var yf = HOR + (H - HOR) * Math.pow(p, 1.9);
      ctx.globalAlpha = 0.26 * (1 - p * 0.35); ctx.beginPath(); ctx.moveTo(0, yf); ctx.lineTo(W, yf); ctx.stroke();
      if (ceiling) {
        var yc = HOR - HOR * Math.pow(p, 1.9);
        ctx.globalAlpha = 0.18 * (1 - p * 0.35); ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(W, yc); ctx.stroke();
      }
    }
    ctx.restore();
    /* glowing horizon */
    ctx.save();
    var hb = ctx.createLinearGradient(0, HOR - 44, 0, HOR + 44);
    hb.addColorStop(0, 'rgba(65,255,126,0)'); hb.addColorStop(0.5, 'rgba(125,255,176,0.26)'); hb.addColorStop(1, 'rgba(65,255,126,0)');
    ctx.fillStyle = hb; ctx.fillRect(0, HOR - 44, W, 88);
    ctx.strokeStyle = C.hi; ctx.globalAlpha = 0.7; ctx.shadowColor = C.g; ctx.shadowBlur = 18; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(0, HOR); ctx.lineTo(W, HOR); ctx.stroke();
    ctx.restore();
  }

  /* ---------- the Grid Chamber scene ---------- */
  var emb = [];
  function scene(t, dt) {
    /* base vertical wash */
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#03150f'); g.addColorStop(0.5, '#051a0f'); g.addColorStop(1, '#082a15');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    glowPools(t, 0.16);
    pgrid(t, H * 0.45, true);
    /* rising embers */
    if (emb.length < 90 && Math.random() < 0.7) {
      emb.push({ x: Math.random() * W, y: H + 5, vy: -rnd(10, 30), vx: rnd(-7, 7), ph: Math.random() * 6, life: rnd(4, 8), age: 0 });
    }
    ctx.save();
    for (var i = emb.length - 1; i >= 0; i--) {
      var e = emb[i]; e.age += dt; e.y += e.vy * dt; e.x += e.vx * dt;
      if (e.y < -6 || e.age > e.life) { emb.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, 1 - e.age / e.life) * 0.8 * (0.5 + 0.5 * Math.sin(t * 3 + e.ph));
      ctx.fillStyle = C.hi; ctx.shadowColor = C.g; ctx.shadowBlur = 6; ctx.fillRect(e.x, e.y, 1.8, 1.8);
    }
    ctx.restore();
  }

  /* ---------- loop: ~30fps, pause when hidden ---------- */
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var raf = 0, last = 0, t0 = 0, started = false;
  function frame(ms) {
    raf = requestAnimationFrame(frame);
    if (!t0) t0 = ms;
    if (ms - last < 33) return;                 /* cap ~30fps */
    var dt = Math.min(0.05, (ms - last) / 1000) || 0.016; last = ms;
    scene((ms - t0) / 1000, dt);
  }
  function start() { if (started) return; started = true; last = 0; t0 = 0; raf = requestAnimationFrame(frame); }
  function stop() { started = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  function paintStatic() { resize(); scene(2.2, 0.016); }

  function hubVisible() {
    var hub = document.getElementById('hub');
    return !!hub && !hub.classList.contains('hidden');
  }

  window.addEventListener('resize', function () {
    resize();
    if (reduce && hubVisible()) scene(2.2, 0.016);
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else if (!reduce && hubVisible()) { resize(); start(); }
  });

  function boot() {
    resize();
    if (reduce) { if (hubVisible()) scene(2.2, 0.016); }
    else if (hubVisible()) start();
    /* the hub starts hidden behind the login screen — start/stop as it toggles */
    var hub = document.getElementById('hub');
    if (hub) {
      new MutationObserver(function () {
        if (hubVisible()) { resize(); reduce ? scene(2.2, 0.016) : start(); }
        else stop();
      }).observe(hub, { attributes: true, attributeFilter: ['class'] });
    }
  }
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
