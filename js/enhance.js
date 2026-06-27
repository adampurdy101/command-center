/* ============================================================
   ENHANCE  ·  tiny micro-interactions on the live hub.
   Periodically flashes a readout so the board feels like it's
   updating in real time. Reuses the mc-tick keyframe already in
   mission.css. Self-contained; pauses when the tab is hidden.
   ============================================================ */
(function () {
  'use strict';
  var iv = null;

  function tickOne() {
    if (document.hidden) return;
    var vals = document.querySelectorAll('#hub .row .v, #hub .ag .st');
    if (!vals.length) return;
    var el = vals[(Math.random() * vals.length) | 0];
    if (!el || el.classList.contains('tick')) return;
    el.classList.add('tick');
    setTimeout(function () { el.classList.remove('tick'); }, 600);
  }

  function start() {
    if (iv) return;
    iv = setInterval(tickOne, 1500);
  }
  function stop() { if (iv) { clearInterval(iv); iv = null; } }

  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
  document.addEventListener('hub:ready', start);
  function boot() { var h = document.getElementById('hub'); if (h && !h.classList.contains('hidden')) start(); }
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
