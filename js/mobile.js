/* ============================================================
   PWA PLUMBING  ·  command-center
   ------------------------------------------------------------
   Registers the service worker AND keeps it fresh. The important
   part for an installed iOS home-screen app: it does NOT re-fire
   'load' when you reopen it, so it would never notice a new
   deploy. We re-check for updates every time the app comes to the
   foreground, push a ready update to activate immediately, and
   reload once when it takes control — so new versions just appear.
   ============================================================ */
(function () {
  "use strict";
  if (!("serviceWorker" in navigator)) return;

  // Reload ONCE when a freshly-deployed worker takes control (no manual hard-refresh).
  var refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  var swReg = null, lastCheck = 0;

  function checkForUpdate() {
    if (!swReg) return;
    var now = Date.now();
    if (now - lastCheck < 8000) return;        // debounce focus/visibility bursts
    lastCheck = now;
    try { swReg.update(); } catch (e) {}
  }

  // When a new version finishes downloading while an old one is still controlling us,
  // tell it to take over immediately (it then triggers the reload above).
  function arm(worker) {
    if (!worker) return;
    function maybeActivate() {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        try { worker.postMessage({ type: "SKIP_WAITING" }); } catch (e) {}
      }
    }
    maybeActivate();
    worker.addEventListener("statechange", maybeActivate);
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      swReg = reg;
      arm(reg.installing || reg.waiting);
      reg.addEventListener("updatefound", function () { arm(reg.installing); });
      checkForUpdate();
    }).catch(function () {});
  });

  // THE key fix for installed apps: re-check whenever the app is brought to the front.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") checkForUpdate();
  });
  window.addEventListener("focus", checkForUpdate);
  window.addEventListener("pageshow", checkForUpdate);   // covers iOS back-forward cache restores
  setInterval(checkForUpdate, 20 * 60 * 1000);           // slow backstop while it stays open
})();
