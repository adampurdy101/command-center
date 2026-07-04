/* ============================================================
   CINEMA  ·  desktop atmosphere driver (pairs with css/cinema.css)
   ------------------------------------------------------------
   1. Panel power-on stagger when the hub appears (login / reload)
   2. Roaming scan sweep — one panel gets a slow CRT wipe every
      ~18–30s so the board feels alive without being busy
   3. Backdrop parallax — the Grid Chamber canvas drifts a few px
      with the cursor (background only; panels + globe stay put,
      per the earlier no-parallax-on-content decision)
   4. LED desync — pulse/ping phases are randomized so status
      lights don't blink in lock-step
   Vanilla, defer-loaded, self-contained. Pauses when hidden,
   inert under prefers-reduced-motion. Remove file to disable.
   ============================================================ */
(function () {
  'use strict';
  var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FINE   = !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches);
  var hub = null;

  function hubVisible() {
    hub = hub || document.getElementById('hub');
    return !!hub && !hub.classList.contains('hidden');
  }

  /* ---------- 4 · LED desync (also fine under reduced motion: it only
     offsets phases of the pulse mission.css already runs) ---------- */
  function desyncLeds() {
    var leds = document.querySelectorAll('#hub .led.on, #hub .led.amb');
    for (var i = 0; i < leds.length; i++) {
      var d = -(Math.random() * 2.6).toFixed(2) + 's';
      leds[i].style.animationDelay = d;              /* the mc-pulse */
      leds[i].style.setProperty('--cn-d', d);        /* the ping ring */
    }
  }

  /* ---------- 1 · panel power-on stagger ---------- */
  var booted = false;
  function bootPanels() {
    if (booted || REDUCE || !hubVisible()) { return; }
    booted = true;
    var seq = document.querySelectorAll('#hub .deck .panel, #hub .globe-wrap');
    for (var i = 0; i < seq.length; i++) seq[i].style.setProperty('--i', String(i));
    hub.classList.add('cn-boot');
    /* drop the class once the stagger is done so hover transforms are clean */
    setTimeout(function () { hub.classList.remove('cn-boot'); }, 80 * seq.length + 900);
  }

  /* ---------- 2 · roaming scan sweep ---------- */
  var scanTimer = null;
  function armSweeps() {
    if (REDUCE || scanTimer) return;
    var panels = [].slice.call(document.querySelectorAll('#hub .deck .panel'));
    if (!panels.length) return;
    panels.forEach(function (p) {
      if (!p.querySelector('.cn-sweep')) {
        var s = document.createElement('span');
        s.className = 'cn-sweep'; s.setAttribute('aria-hidden', 'true');
        p.appendChild(s);
      }
    });
    function once() {
      scanTimer = setTimeout(once, 18000 + Math.random() * 12000);
      if (document.hidden || !hubVisible()) return;
      var p = panels[(Math.random() * panels.length) | 0];
      if (!p || p.classList.contains('cn-scan')) return;
      p.classList.add('cn-scan');
      setTimeout(function () { p.classList.remove('cn-scan'); }, 1300);
    }
    scanTimer = setTimeout(once, 7000 + Math.random() * 6000);
  }

  /* ---------- 3 · backdrop parallax (background canvas only) ---------- */
  function armParallax() {
    if (REDUCE || !FINE) return;
    var bg = document.getElementById('page-bg');
    if (!bg) return;
    var raf = 0, nx = 0, ny = 0;
    window.addEventListener('pointermove', function (e) {
      if (document.hidden || !hubVisible()) return;
      nx = (e.clientX / window.innerWidth - 0.5) * -12;   /* ±6px drift */
      ny = (e.clientY / window.innerHeight - 0.5) * -8;
      if (!raf) raf = requestAnimationFrame(function () {
        raf = 0;
        bg.style.setProperty('--cn-px', nx.toFixed(1) + 'px');
        bg.style.setProperty('--cn-py', ny.toFixed(1) + 'px');
      });
    }, { passive: true });
  }

  /* ---------- boot ---------- */
  function start() {
    desyncLeds();
    bootPanels();
    armSweeps();
  }
  document.addEventListener('hub:ready', start);
  document.addEventListener('hub:left', function () { booted = false; });
  function init() {
    armParallax();
    if (hubVisible()) start();
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
