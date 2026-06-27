/* ============================================================
   NEON NOIR activator.  Inert unless the URL contains ?noir
   (or #noir). When active, dresses the live hub in the Neon
   Noir glass theme (css/noir.css) + a switchable interior
   texture, and adds a small texture switcher (keys 1/2/3).
   The normal site "/" is never touched.
   ============================================================ */
(function () {
  'use strict';
  if (!/[?#&]noir\b/i.test(location.href)) return;

  var ROOT = document.documentElement;
  var DEFAULT_TEX = 'B';                 // Ghost Volume — the most "glass"
  var applied = false;

  function setTex(t) {
    t = String(t).toUpperCase(); if ('ABC'.indexOf(t) < 0) return;
    ROOT.setAttribute('data-tex', t);
    try { localStorage.setItem('cc.noir.tex', t); } catch (e) {}
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
    /* accent discipline: amber for DEMO, cyan-green for LIVE */
    document.querySelectorAll('#hub .panel .tb .s').forEach(function (s) {
      var t = (s.textContent || '').toUpperCase();
      if (t.indexOf('LIVE') >= 0) s.classList.add('fx-live');
      else if (t.indexOf('DEMO') >= 0) s.classList.add('fx-demo');
    });
    /* atmospheric haze behind the globe */
    var gw = document.querySelector('#hub .globe-wrap');
    if (gw && !gw.querySelector('.fx-haze')) {
      var hz = document.createElement('div'); hz.className = 'fx-haze'; gw.insertBefore(hz, gw.firstChild);
    }
    /* interior texture layer behind each panel's content */
    document.querySelectorAll('#hub .panel').forEach(function (p) {
      if (p.firstElementChild && p.firstElementChild.classList.contains('fx-tex')) return;
      var d = document.createElement('div'); d.className = 'fx-tex'; p.insertBefore(d, p.firstChild);
    });
    buildBar();
    var start = DEFAULT_TEX; try { start = localStorage.getItem('cc.noir.tex') || DEFAULT_TEX; } catch (e) {}
    setTex(start);
  }

  /* keys 1/2/3 swap the texture once the theme is live */
  window.addEventListener('keydown', function (e) {
    if (!applied) return;
    var m = { '1': 'A', '2': 'B', '3': 'C' };
    if (m[e.key]) setTex(m[e.key]);
  });

  /* the hub is revealed after login (auth fires hub:ready); also handle an already-open hub */
  document.addEventListener('hub:ready', function () { setTimeout(apply, 30); });
  function maybeNow() { var h = document.getElementById('hub'); if (h && !h.classList.contains('hidden')) apply(); }
  if (document.readyState !== 'loading') maybeNow();
  else document.addEventListener('DOMContentLoaded', maybeNow);
})();
