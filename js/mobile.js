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
  if (!("serviceWorker" in navigator)) return;

  // Auto-reload ONCE when a newly-deployed service worker takes control, so
  // updates reach the user without manual hard-refreshes (kills stale-UI bugs).
  var refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      try { reg.update(); } catch (e) {}   // check for a new version on every load
    }).catch(function () {});
  });
})();
