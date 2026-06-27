/* ============================================================
   NEON NOIR — now the DEFAULT look for the dashboard.
   Dresses the live hub in the Neon Noir glass theme
   (css/noir.css) with the HOLO MESH interior texture.

   • Default (no flag): Noir + Holo Mesh, clean (no switcher).
   • ?plain  (or ?noir=off): opt out → original look.
   • ?noir   : same theme PLUS the texture switcher + keys 1/2/3
               (Holo Mesh / Ghost Volume / Tactical Weave) for tuning.
   • ?tex=a|b|c : force a specific texture on any load.
   ============================================================ */
(function () {
  'use strict';
  var URL = location.href;
  if (/[?#&]plain\b/i.test(URL) || /[?#&]noir=off\b/i.test(URL)) return;   // opt out

  var EXPLICIT = /[?#&]noir\b/i.test(URL) && !/[?#&]noir=off\b/i.test(URL); // show the switcher
  var texParam = (location.search.match(/[?&]tex=([abc])/i) || [])[1];
  var DEFAULT_TEX = texParam ? texParam.toUpperCase() : 'A';                // Holo Mesh

  var ROOT = document.documentElement, applied = false;

  function setTex(t) {
    t = String(t).toUpperCase(); if ('ABC'.indexOf(t) < 0) return;
    ROOT.setAttribute('data-tex', t);
    var bs = document.querySelectorAll('#fxbar button');
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].getAttribute('data-tex') === t);
  }

  function buildBar() {
    if (document.getElementById('fxbar')) return;
    var bar = document.createElement('div'); bar.id = 'fxbar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Panel texture');
    bar.innerHTML =
      '<span class="fxlab">PANEL TEXTURE</span>' +
      '<button type="button" data-tex="A">1 · HOLO MESH</button>' +
      '<button type="button" data-tex="B">2 · GHOST VOLUME</button>' +
      '<button type="button" data-tex="C">3 · TACTICAL WEAVE</button>' +
      '<span class="fxhint">keys 1 / 2 / 3</span>';
    document.body.appendChild(bar);
    var bs = bar.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      (function (b) { b.addEventListener('click', function () { setTex(b.getAttribute('data-tex')); }); })(bs[i]);
    }
  }

  function apply() {
    if (applied) return; applied = true;
    ROOT.setAttribute('data-fx', '2');   // Neon Noir coloring
    document.querySelectorAll('#hub .panel .tb .s').forEach(function (s) {
      var t = (s.textContent || '').toUpperCase();
      if (t.indexOf('LIVE') >= 0) s.classList.add('fx-live');
      else if (t.indexOf('DEMO') >= 0) s.classList.add('fx-demo');
    });
    var gw = document.querySelector('#hub .globe-wrap');
    if (gw && !gw.querySelector('.fx-haze')) {
      var hz = document.createElement('div'); hz.className = 'fx-haze'; gw.insertBefore(hz, gw.firstChild);
    }
    document.querySelectorAll('#hub .panel').forEach(function (p) {
      if (p.firstElementChild && p.firstElementChild.classList.contains('fx-tex')) return;
      var d = document.createElement('div'); d.className = 'fx-tex'; p.insertBefore(d, p.firstChild);
    });
    if (EXPLICIT) buildBar();           // clean by default; switcher only with ?noir
    setTex(DEFAULT_TEX);
  }

  /* keys 1/2/3 swap textures — only in ?noir tuning mode, and never while typing
     or while the Sniper game (which uses 1/2/3 for weapons) is open */
  if (EXPLICIT) {
    window.addEventListener('keydown', function (e) {
      if (!applied) return;
      var el = e.target, tag = el && el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) return;
      try { if (window.SniperGame && window.SniperGame.isOpen()) return; } catch (x) {}
      var m = { '1': 'A', '2': 'B', '3': 'C' };
      if (m[e.key]) setTex(m[e.key]);
    });
  }

  document.addEventListener('hub:ready', function () { setTimeout(apply, 30); });
  function maybeNow() { var h = document.getElementById('hub'); if (h && !h.classList.contains('hidden')) apply(); }
  if (document.readyState !== 'loading') maybeNow();
  else document.addEventListener('DOMContentLoaded', maybeNow);
})();
