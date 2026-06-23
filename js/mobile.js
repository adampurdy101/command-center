/* ============================================================
   PWA PLUMBING  ·  command-center
   ------------------------------------------------------------
   The mobile/tablet layout lives in css/mobile.css, the
   interactive content in js/mission.js, and the visual
   flourishes (heartbeat, HAL eye, boot, ambient, weather, tilt,
   fullscreen) in js/effects.js. This file only registers the
   service worker for the installable/offline shell.
   ============================================================ */
(function () {
  "use strict";
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
