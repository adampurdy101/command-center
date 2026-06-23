/* ============================================================
   PWA PLUMBING  ·  command-center
   ------------------------------------------------------------
   The mobile/tablet *layout* lives in css/mobile.css and the
   interactive content (globe, game, voice) in js/mission.js.
   This file only adds the installable-app glue:
     1. service-worker registration (offline shell)
     2. the in-page Fullscreen button (Fullscreen API fallback
        for iPad, where Add-to-Home-Screen gives true full screen)
   ============================================================ */
(function () {
  "use strict";

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
})();
