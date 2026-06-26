/* ============================================================
   LIGHTSABER  ·  iPhone motion saber   (window.Saber)
   ------------------------------------------------------------
   Focus: ACT and SOUND like a real lightsaber. Visuals are kept
   deliberately simple — a clean steady green blade that extends
   up on ignite and retracts down on power-off. Everything else is
   in the sound + motion feel.

   Sound is synthesized live with the Web Audio API (no files):
     • a warm steady hum (idle)
     • swing the phone -> the hum bends up AND a whoosh rises in
       pitch + volume with the swing speed (the iconic "vwoom")
     • a hard strike (swing fast + stop) -> a metallic clash

   Motion comes from the gyroscope (rotationRate, deg/s) for swing
   and the accelerometer for the strike. iPhone-only launcher.
   A clear MOTION ON/OFF indicator shows whether the gyro is
   actually feeding the sound, so it's obvious if iOS hasn't
   granted motion access.

   open()/simulate() work anywhere so the engine can be exercised
   in a desktop preview (drag the blade to "swing"; also the
   fallback when motion permission is denied).
   ============================================================ */
(function () {
  'use strict';

  var UA = navigator.userAgent || '';
  var IS_IPHONE = /iPhone|iPod/.test(UA);

  var GREEN = '#41ff7e', CORE = '#daffe4';
  function hexA(h, a) { return 'rgba(' + parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16) + ',' + a + ')'; }
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function loadNum(k, d) { try { var v = parseFloat(localStorage.getItem(k)); return isFinite(v) ? v : d; } catch (e) { return d; } }
  function saveNum(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }

  /* hum characters — warm + movie-ish; CLASSIC is the steady Jedi hum */
  var TYPES = {
    classic: { name: 'CLASSIC', baseF: 110, lp: 2100, subMix: 0.30, tremHz: 6.5, tremDepth: 0.13, vibHz: 5, vibCents: 5,  crackle: 0.00, formant: 320 },
    vader:   { name: 'VADER',   baseF: 74,  lp: 1450, subMix: 0.46, tremHz: 5.0, tremDepth: 0.18, vibHz: 4, vibCents: 8,  crackle: 0.00, formant: 240 },
    kylo:    { name: 'KYLO',    baseF: 104, lp: 2400, subMix: 0.24, tremHz: 8.0, tremDepth: 0.17, vibHz: 7, vibCents: 13, crackle: 0.45, formant: 360 }
  };
  var ORDER = ['classic', 'vader', 'kylo'];
  var curType = 'classic', cur = TYPES.classic;
  var baseF = cur.baseF, baseHum = 0.24, pitchMul = 1;

  /* state */
  var ctx = null, on = false, opened = false, motionOK = false, motionAsked = false, motionAttached = false;
  var wakeLock = null;
  var smoothSwing = 0, swingInput = 0, prevSwing = 0, prevA = 0, lastClash = 0, grav = null, lastMotionT = 0;
  var swingScale = loadNum('saber.swingScale', 380);          // deg/s that counts as a "full" swing (sensitive)
  var CLASH_ACC = loadNum('saber.clashAcc', 18), DECEL_THRESH = 140, JERK_THRESH = 55;
  var bladeAnim = 0, bladeTarget = 0, clashFlash = 0, igniteT = 0;
  var showDbg = false, dbg = { swing: 0, amag: 0, src: '-' };
  var dirty = true;

  /* ============================================================
     AUDIO
     ============================================================ */
  var master, comp, humLevel, flare, humLP, humFormant, humMix, osc1, osc2, sub, subGain;
  var tremLFO, tremDepth, vibLFO, vibDepth, vibDepth2;
  var swNoise, swooshBP, swooshGain, crNoise, crackleBP, crackleGain;
  var clashBufs = null, noisePink, silentEl;

  function makeNoise(seconds, white) {
    var len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0), b0 = 0, b1 = 0, b2 = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      if (white) { d[i] = w * 0.5; continue; }
      b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
    }
    return buf;
  }

  function buildGraph() {
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 22; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.18;
    comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = 1.0; master.connect(comp);

    /* hum: 2 detuned saws + sub -> formant -> lowpass -> level -> flare -> master */
    flare = ctx.createGain(); flare.gain.value = 1; flare.connect(master);
    humLevel = ctx.createGain(); humLevel.gain.value = 0; humLevel.connect(flare);
    humLP = ctx.createBiquadFilter(); humLP.type = 'lowpass'; humLP.frequency.value = cur.lp; humLP.Q.value = 0.7; humLP.connect(humLevel);
    humFormant = ctx.createBiquadFilter(); humFormant.type = 'peaking'; humFormant.frequency.value = cur.formant; humFormant.Q.value = 4; humFormant.gain.value = 7; humFormant.connect(humLP);
    humMix = ctx.createGain(); humMix.gain.value = 1; humMix.connect(humFormant);

    osc1 = ctx.createOscillator(); osc1.type = 'sawtooth'; osc1.frequency.value = baseF;
    osc2 = ctx.createOscillator(); osc2.type = 'sawtooth'; osc2.frequency.value = baseF; osc2.detune.value = 8;
    sub  = ctx.createOscillator(); sub.type  = 'sine';     sub.frequency.value  = baseF * 0.5;
    var g1 = ctx.createGain(); g1.gain.value = 0.5; osc1.connect(g1); g1.connect(humMix);
    var g2 = ctx.createGain(); g2.gain.value = 0.5; osc2.connect(g2); g2.connect(humMix);
    subGain = ctx.createGain(); subGain.gain.value = cur.subMix; sub.connect(subGain); subGain.connect(humMix);

    /* the waver */
    tremLFO = ctx.createOscillator(); tremLFO.type = 'sine'; tremLFO.frequency.value = cur.tremHz;
    tremDepth = ctx.createGain(); tremDepth.gain.value = 0; tremLFO.connect(tremDepth); tremDepth.connect(humLevel.gain);
    vibLFO = ctx.createOscillator(); vibLFO.type = 'sine'; vibLFO.frequency.value = cur.vibHz;
    vibDepth = ctx.createGain(); vibDepth.gain.value = cur.vibCents; vibLFO.connect(vibDepth); vibDepth.connect(osc1.detune);
    vibDepth2 = ctx.createGain(); vibDepth2.gain.value = cur.vibCents; vibLFO.connect(vibDepth2); vibDepth2.connect(osc2.detune);

    /* swoosh: the swing whoosh — pink noise -> resonant bandpass -> gain (both ride swing speed) */
    noisePink = makeNoise(2, false);
    swNoise = ctx.createBufferSource(); swNoise.buffer = noisePink; swNoise.loop = true;
    swooshBP = ctx.createBiquadFilter(); swooshBP.type = 'bandpass'; swooshBP.frequency.value = 400; swooshBP.Q.value = 1.8;
    swooshGain = ctx.createGain(); swooshGain.gain.value = 0;
    swNoise.connect(swooshBP); swooshBP.connect(swooshGain); swooshGain.connect(master);

    /* crackle (KYLO) */
    crNoise = ctx.createBufferSource(); crNoise.buffer = makeNoise(2, true); crNoise.loop = true;
    crackleBP = ctx.createBiquadFilter(); crackleBP.type = 'bandpass'; crackleBP.frequency.value = 1700; crackleBP.Q.value = 0.8;
    crackleGain = ctx.createGain(); crackleGain.gain.value = 0;
    crNoise.connect(crackleBP); crackleBP.connect(crackleGain); crackleGain.connect(master);

    clashBufs = [makeNoise(0.4, true), makeNoise(0.4, true), makeNoise(0.4, true)];

    osc1.start(); osc2.start(); sub.start(); tremLFO.start(); vibLFO.start(); swNoise.start(); crNoise.start();
    applyTypeParams();
  }

  function ensureAudio() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    ctx.onstatechange = function () { if (opened && ctx.state === 'suspended') { var p = ctx.resume(); if (p && p.then) p.then(nudgeSession); else nudgeSession(); } };
    buildGraph();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function applyTypeParams() {
    if (!ctx) return;
    var t = cur, now = ctx.currentTime; baseF = t.baseF;
    osc1.frequency.setTargetAtTime(baseF * pitchMul, now, 0.06);
    osc2.frequency.setTargetAtTime(baseF * pitchMul, now, 0.06);
    sub.frequency.setTargetAtTime(baseF * 0.5 * pitchMul, now, 0.06);
    subGain.gain.setTargetAtTime(t.subMix, now, 0.06);
    humLP.frequency.setTargetAtTime(t.lp, now, 0.08);
    humFormant.frequency.setTargetAtTime(t.formant, now, 0.08);
    tremLFO.frequency.setTargetAtTime(t.tremHz, now, 0.08);
    vibLFO.frequency.setTargetAtTime(t.vibHz, now, 0.08);
    vibDepth.gain.setTargetAtTime(t.vibCents, now, 0.08);
    vibDepth2.gain.setTargetAtTime(t.vibCents, now, 0.08);
    if (on) { tremDepth.gain.setTargetAtTime(t.tremDepth * baseHum, now, 0.1); crackleGain.gain.setTargetAtTime(t.crackle * 0.08, now, 0.12); }
  }

  /* THE swing mapping: speed -> hum pitch + bright + a loud rising whoosh */
  function applyMotion(sw) {
    if (!ctx || !on) return;
    var s = Math.min(1, sw / swingScale), now = ctx.currentTime;
    pitchMul = 1 + 0.6 * s;                                   // hum bends up clearly
    osc1.frequency.setTargetAtTime(baseF * pitchMul, now, 0.025);
    osc2.frequency.setTargetAtTime(baseF * pitchMul, now, 0.025);
    sub.frequency.setTargetAtTime(baseF * 0.5 * pitchMul, now, 0.025);
    humLP.frequency.setTargetAtTime(cur.lp + s * 1500, now, 0.03);   // tone opens up on a swing
    swooshGain.gain.setTargetAtTime(Math.min(1.1, s * s * 1.5), now, 0.025);  // prominent whoosh
    swooshBP.frequency.setTargetAtTime(220 + s * 2600, now, 0.025);          // Doppler sweep
    if (performance.now() - igniteT > 240) humLevel.gain.setTargetAtTime(baseHum * (1 + 0.18 * s), now, 0.05);
  }

  function ignite() {
    if (!ctx) return;
    on = true; bladeTarget = 1; igniteT = performance.now(); dirty = true;
    var now = ctx.currentTime;
    humLevel.gain.cancelScheduledValues(now);
    humLevel.gain.setValueAtTime(0.0001, now);
    humLevel.gain.setTargetAtTime(baseHum * 1.2, now + 0.02, 0.05);
    humLevel.gain.setTargetAtTime(baseHum, now + 0.18, 0.10);
    osc1.frequency.setValueAtTime(baseF * 0.7, now); osc1.frequency.setTargetAtTime(baseF, now, 0.05);
    osc2.frequency.setValueAtTime(baseF * 0.7, now); osc2.frequency.setTargetAtTime(baseF, now, 0.05);
    sub.frequency.setValueAtTime(baseF * 0.35, now);  sub.frequency.setTargetAtTime(baseF * 0.5, now, 0.05);
    humLP.frequency.setValueAtTime(600, now); humLP.frequency.setTargetAtTime(cur.lp, now, 0.10);
    tremDepth.gain.setTargetAtTime(cur.tremDepth * baseHum, now, 0.1);
    crackleGain.gain.setTargetAtTime(cur.crackle * 0.08, now, 0.15);
    /* snap-hiss */
    var nb = ctx.createBufferSource(); nb.buffer = makeNoise(0.6, true);
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(300, now); bp.frequency.exponentialRampToValueAtTime(3200, now + 0.22);
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(0.55, now + 0.04); g.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    nb.connect(bp); bp.connect(g); g.connect(master); nb.start(now); nb.stop(now + 0.45);
    acquireWake();
  }

  function powerOff() {
    bladeTarget = 0; dirty = true;
    if (!ctx || !on) { on = false; return; }
    on = false;
    var now = ctx.currentTime;
    humLevel.gain.cancelScheduledValues(now); humLevel.gain.setTargetAtTime(0.0001, now, 0.12);
    tremDepth.gain.setTargetAtTime(0, now, 0.1); crackleGain.gain.setTargetAtTime(0, now, 0.1); swooshGain.gain.setTargetAtTime(0, now, 0.08);
    osc1.frequency.setTargetAtTime(baseF * 0.6, now, 0.08); osc2.frequency.setTargetAtTime(baseF * 0.6, now, 0.08);
    var nb = ctx.createBufferSource(); nb.buffer = makeNoise(0.6, true);
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(2600, now); bp.frequency.exponentialRampToValueAtTime(280, now + 0.3);
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(0.35, now + 0.03); g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    nb.connect(bp); bp.connect(g); g.connect(master); nb.start(now); nb.stop(now + 0.5);
  }

  function clash(intensity) {
    clashFlash = Math.min(1, 0.5 + intensity * 0.5);
    if (navigator.vibrate) { try { navigator.vibrate(intensity > 0.6 ? [0, 30, 20, 40] : 20); } catch (e) {} }
    dirty = true;
    if (!ctx || !on) return;
    var k = 0.55 + 0.45 * Math.min(1, intensity), now = ctx.currentTime;
    var buf = clashBufs[(Math.random() * clashBufs.length) | 0];
    var nb = ctx.createBufferSource(); nb.buffer = buf;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900 + Math.random() * 1600; bp.Q.value = 0.6;
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700 + Math.random() * 500;
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(0.95 * k, now + 0.004); g.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
    nb.connect(bp); bp.connect(hp); hp.connect(g); g.connect(master); nb.start(now); nb.stop(now + 0.3);
    var z = ctx.createOscillator(); z.type = 'square'; var zg = ctx.createGain();
    z.frequency.setValueAtTime(1000 + Math.random() * 600, now); z.frequency.exponentialRampToValueAtTime(170, now + 0.18);
    zg.gain.setValueAtTime(0.0001, now); zg.gain.linearRampToValueAtTime(0.26 * k, now + 0.005); zg.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    z.connect(zg); zg.connect(master); z.start(now); z.stop(now + 0.3);
    flare.gain.cancelScheduledValues(now); flare.gain.setValueAtTime(1.6 * k, now); flare.gain.setTargetAtTime(1, now + 0.02, 0.12);
  }

  /* ============================================================
     MOTION
     ============================================================ */
  function requestMotion() {
    return new Promise(function (res) {
      var DME = window.DeviceMotionEvent;
      if (DME && typeof DME.requestPermission === 'function') { DME.requestPermission().then(function (s) { res(s === 'granted'); }).catch(function () { res(false); }); }
      else if (DME) { res(true); } else { res(false); }
    });
  }

  function onMotion(e) {
    if (!opened) return;
    var rr = e.rotationRate || {};
    var ga = rr.gamma || 0, be = rr.beta || 0, al = rr.alpha || 0;
    var swing = Math.sqrt(al * al + be * be + ga * ga);   // deg/s on iOS — no unit guessing
    swingInput = swing; dbg.swing = swing; dbg.src = 'gyro'; lastMotionT = performance.now();

    var a = e.acceleration, amag = 0;
    if (a && a.x != null) { amag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
    else {
      var ag = e.accelerationIncludingGravity;
      if (ag && ag.x != null) {
        if (!grav) grav = { x: ag.x, y: ag.y, z: ag.z };
        var kk = 0.1; grav.x += kk * (ag.x - grav.x); grav.y += kk * (ag.y - grav.y); grav.z += kk * (ag.z - grav.z);
        var lx = ag.x - grav.x, ly = ag.y - grav.y, lz = ag.z - grav.z; amag = Math.sqrt(lx * lx + ly * ly + lz * lz);
      }
    }
    dbg.amag = amag;
    var now = performance.now(), decel = prevSwing - swing, jerk = amag - prevA; prevSwing = swing; prevA = amag;
    if (on && amag > CLASH_ACC && (decel > DECEL_THRESH || jerk > JERK_THRESH) && now - lastClash > 150) {
      clash(Math.min(1, (amag - CLASH_ACC) / (2 * CLASH_ACC))); lastClash = now;
    }
  }

  /* ============================================================
     VISUALS  ·  simple clean blade
     ============================================================ */
  var wrap, cv, g2, CSSW = 0, CSSH = 0, DPR = 1, raf = 0, lastT = 0, vignetteGrad = null, now0 = 0;

  function resize() {
    if (!cv || !opened) return;
    var r = wrap.getBoundingClientRect();
    CSSW = Math.max(1, r.width); CSSH = Math.max(1, r.height);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(CSSW * DPR); cv.height = Math.round(CSSH * DPR);
    var vg = g2.createRadialGradient(CSSW / 2, CSSH * 0.5, CSSH * 0.3, CSSW / 2, CSSH * 0.5, Math.max(CSSW, CSSH) * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)'); vignetteGrad = vg; dirty = true;
  }

  function easeOutBack(x) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
  var EOB_PEAK = 1.0999;

  function drawHilt(cx, ey, w, h) {
    var x = cx - w / 2;
    var grd = g2.createLinearGradient(x, 0, x + w, 0);
    grd.addColorStop(0, '#1a1d22'); grd.addColorStop(0.5, '#9aa3ad'); grd.addColorStop(0.55, '#cfd6dd'); grd.addColorStop(1, '#23272d');
    g2.fillStyle = grd; rrect(x, ey, w, h, 5); g2.fill();
    g2.fillStyle = on ? hexA(GREEN, 0.9) : '#3a4047'; g2.fillRect(x - 3, ey, w + 6, 6);
    g2.fillStyle = '#cdd4db'; g2.fillRect(x - 3, ey + 1, w + 6, 2);
    g2.fillStyle = 'rgba(0,0,0,0.45)'; for (var i = 1; i <= 4; i++) g2.fillRect(x, ey + 14 + i * (h * 0.13), w, 3);
    g2.fillStyle = on ? GREEN : '#5a636c'; g2.fillRect(x + w + 2, ey + h * 0.4, 5, 10);
  }
  function rrect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); g2.beginPath(); g2.moveTo(x + r, y);
    g2.arcTo(x + w, y, x + w, y + h, r); g2.arcTo(x + w, y + h, x, y + h, r); g2.arcTo(x, y + h, x, y, r); g2.arcTo(x, y, x + w, y, r); g2.closePath();
  }
  function vline(cx, y0, y1, width, color, alpha) {
    g2.strokeStyle = color; g2.globalAlpha = alpha; g2.lineWidth = width; g2.lineCap = 'round';
    g2.beginPath(); g2.moveTo(cx, y0); g2.lineTo(cx, y1); g2.stroke();
  }

  function draw(ts) {
    raf = requestAnimationFrame(draw);
    now0 = ts || performance.now();
    var dt = Math.min(0.05, (now0 - lastT) / 1000) || 0.016; lastT = now0;

    /* swing smoothing — fast attack so the whoosh tracks the swing, decay when input stops */
    smoothSwing += (swingInput - smoothSwing) * Math.min(1, dt * 18);
    swingInput *= Math.max(0, 1 - dt * 2.5);
    applyMotion(smoothSwing);

    bladeAnim += (bladeTarget - bladeAnim) * Math.min(1, dt * (bladeTarget > bladeAnim ? 10 : 8));
    clashFlash = Math.max(0, clashFlash - dt * 3.2);

    var idle = !on && bladeAnim < 0.001 && clashFlash <= 0 && smoothSwing < 1;
    if (idle && !dirty) return;

    var w = CSSW, h = CSSH;
    g2.setTransform(DPR, 0, 0, DPR, 0, 0);
    g2.clearRect(0, 0, w, h);
    g2.fillStyle = '#02060a'; g2.fillRect(0, 0, w, h);

    var cx = w * 0.5, hiltH = Math.min(150, h * 0.17), hiltW = 26, ey = h - hiltH - 8;
    var bladeMax = ey - h * 0.05;
    var len = bladeMax * Math.max(0, easeOutBack(Math.min(1, bladeAnim))) / EOB_PEAK;
    if (bladeAnim < 0.001 || len < 4) len = 0;

    if (len > 4) {
      var s = Math.min(1, smoothSwing / swingScale);
      var bright = 0.9 + 0.06 * Math.sin(now0 * 0.018) + 0.12 * s;     // steady, brightens a touch on a swing
      var coreW = 7, glowW = 26 + s * 10;
      var topY = ey - len;
      g2.save(); g2.globalCompositeOperation = 'lighter';
      vline(cx, ey, topY, glowW * 1.7, GREEN, 0.10 * bright);
      vline(cx, ey, topY, glowW, GREEN, 0.18 * bright);
      vline(cx, ey, topY, coreW * 3, GREEN, 0.55 * bright);
      vline(cx, ey, topY, coreW * 1.5, GREEN, 0.9 * bright);
      vline(cx, ey, topY, coreW * 0.6, CORE, 0.98 * bright);
      g2.globalAlpha = 1;
      g2.fillStyle = hexA(CORE, 0.96 * bright); g2.beginPath(); g2.arc(cx, topY, coreW * 0.85, 0, Math.PI * 2); g2.fill();
      g2.fillStyle = hexA(GREEN, 0.5 * bright); g2.beginPath(); g2.arc(cx, topY, glowW * 0.6, 0, Math.PI * 2); g2.fill();
      g2.globalAlpha = 1; g2.restore();
    }

    drawHilt(cx, ey, hiltW, hiltH);

    if (clashFlash > 0) {     /* subtle brightness flash only — no movement, no ring */
      g2.save(); g2.globalCompositeOperation = 'lighter';
      g2.fillStyle = 'rgba(255,255,255,' + (clashFlash * (reduceMotion ? 0.2 : 0.4)) + ')'; g2.fillRect(0, 0, w, h); g2.restore();
    }
    if (vignetteGrad) { g2.fillStyle = vignetteGrad; g2.fillRect(0, 0, w, h); }
    if (idle) dirty = false;

    if (showDbg) { var d = document.getElementById('saber-dbg'); if (d) d.textContent = 'swing ' + Math.round(dbg.swing) + '°/s  acc ' + dbg.amag.toFixed(1) + '  scale ' + Math.round(swingScale) + '  motion ' + (motionLive() ? 'LIVE' : motionOK ? 'on' : 'OFF') + '  ' + (on ? 'ON' : 'off'); }
  }

  /* pointer fallback (desktop test + denied-motion) */
  var lastPt = null, prevPv = 0;
  function onPointer(e) {
    if (!on) return;
    var now = performance.now(), x = e.clientX, y = e.clientY;
    if (lastPt) {
      var dx = x - lastPt.x, dy = y - lastPt.y, dtp = Math.max(8, now - lastPt.t), v = Math.sqrt(dx * dx + dy * dy) / dtp * 1000;
      swingInput = Math.max(swingInput, Math.min(swingScale * 1.4, v * 0.26)); dbg.swing = swingInput; dbg.src = 'touch'; lastMotionT = now;
      if (prevPv - v > 1500 && prevPv > 2000 && now - lastClash > 170) { clash(Math.min(1, (prevPv - 2000) / 3000)); lastClash = now; }
      prevPv = v;
    }
    lastPt = { x: x, y: y, t: now };
  }

  function motionLive() { return motionOK && performance.now() - lastMotionT < 400; }

  /* wake lock + iOS audio warm-up */
  function acquireWake() { try { if (navigator.wakeLock && !wakeLock) navigator.wakeLock.request('screen').then(function (wl) { wakeLock = wl; wl.addEventListener('release', function () { wakeLock = null; }); }).catch(function () {}); } catch (e) {} }
  function releaseWake() { try { if (wakeLock) wakeLock.release(); } catch (e) {} wakeLock = null; }

  /* NOTE: warms up the Web Audio output. It does NOT override the iPhone ring/silent
     switch (no web API for that) — the on-screen reminder is the real mitigation. */
  function silentWavURI() {
    var sr = 8000, n = Math.floor(sr * 0.25), bytes = 44 + n * 2, buf = new ArrayBuffer(bytes), dv = new DataView(buf);
    function wr(o, s) { for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); }
    wr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); wr(8, 'WAVE'); wr(12, 'fmt '); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); wr(36, 'data'); dv.setUint32(40, n * 2, true);
    var u8 = new Uint8Array(buf), bin = ''; for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }
  function nudgeSession() { try { if (!silentEl) { silentEl = document.createElement('audio'); silentEl.loop = true; silentEl.setAttribute('playsinline', ''); silentEl.volume = 0.001; silentEl.src = silentWavURI(); } var p = silentEl.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }

  /* ============================================================
     OVERLAY
     ============================================================ */
  function injectCSS() {
    if (document.getElementById('saber-css')) return;
    var s = document.createElement('style'); s.id = 'saber-css';
    s.textContent =
      '#saber{position:fixed;inset:0;z-index:9999;background:#02060a;display:flex;touch-action:none;-webkit-user-select:none;user-select:none;overscroll-behavior:none}' +
      '#saber.hidden{display:none}#saber canvas{position:absolute;inset:0;width:100%;height:100%;display:block}' +
      '#saber .sb-btn{position:absolute;z-index:2;background:rgba(4,13,9,.55);color:' + GREEN + ';border:1px solid ' + hexA(GREEN, 0.5) + ';border-radius:8px;font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:1px;padding:11px 13px;min-width:44px;min-height:44px;cursor:pointer;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);text-shadow:0 0 6px ' + hexA(GREEN, 0.7) + '}' +
      '#saber .sb-btn:active{background:' + hexA(GREEN, 0.18) + '}' +
      '#saber #saber-exit{top:max(12px,env(safe-area-inset-top));left:max(12px,env(safe-area-inset-left));font-size:18px}' +
      '#saber #saber-type{top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right))}' +
      '#saber #saber-dev{bottom:max(12px,env(safe-area-inset-bottom));right:max(12px,env(safe-area-inset-right));opacity:.6;font-size:11px;min-height:38px;padding:8px 10px}' +
      '#saber #saber-status{position:absolute;z-index:2;left:0;right:0;top:max(14px,env(safe-area-inset-top));text-align:center;font:600 11px/1.4 ui-monospace,Menlo,monospace;letter-spacing:2px;pointer-events:none}' +
      '#saber #saber-hint{position:absolute;z-index:2;left:0;right:0;top:44%;text-align:center;pointer-events:none}' +
      '#saber #saber-main{display:block;color:' + hexA(GREEN, 0.92) + ';font:600 16px/1.5 ui-monospace,Menlo,monospace;letter-spacing:3px;text-shadow:0 0 12px ' + hexA(GREEN, 0.8) + ';transition:opacity .4s ease}' +
      '#saber #saber-sub{display:block;margin-top:8px;font-size:11px;letter-spacing:1px;color:' + hexA(GREEN, 0.5) + '}' +
      '#saber #saber-dbg{position:absolute;z-index:2;left:50%;bottom:max(12px,env(safe-area-inset-bottom));transform:translateX(-50%);color:' + hexA(GREEN, 0.85) + ';font:600 11px/1 ui-monospace,monospace;letter-spacing:.4px;background:rgba(0,0,0,.5);padding:7px 10px;border-radius:6px;white-space:nowrap}' +
      '#saber .hidden{display:none}';
    document.head.appendChild(s);
  }

  function buildOverlay() {
    if (wrap) return;
    injectCSS();
    wrap = document.createElement('div'); wrap.id = 'saber'; wrap.className = 'hidden';
    wrap.innerHTML =
      '<canvas id="saber-cv" aria-label="Lightsaber blade — tap to ignite"></canvas>' +
      '<div id="saber-status"></div>' +
      '<button id="saber-exit" class="sb-btn" type="button" aria-label="Exit">✕</button>' +
      '<button id="saber-type" class="sb-btn" type="button" aria-label="Change saber type">CLASSIC ▸</button>' +
      '<div id="saber-hint"><span id="saber-main">TAP TO IGNITE</span><span id="saber-sub">SILENT SWITCH OFF · VOLUME UP</span></div>' +
      '<button id="saber-dev" class="sb-btn" type="button" aria-hidden="true">DEV</button>' +
      '<div id="saber-dbg" class="hidden"></div>';
    document.body.appendChild(wrap);
    cv = document.getElementById('saber-cv'); g2 = cv.getContext('2d');

    document.getElementById('saber-exit').addEventListener('click', function (e) { e.stopPropagation(); close(); });
    document.getElementById('saber-type').addEventListener('click', function (e) { e.stopPropagation(); cycleType(); });
    document.getElementById('saber-dev').addEventListener('click', function (e) { e.stopPropagation(); showDbg = !showDbg; dirty = true; document.getElementById('saber-dbg').classList.toggle('hidden', !showDbg); });
    cv.addEventListener('click', function () { on ? powerOff() : igniteFlow(); });
    cv.addEventListener('pointermove', onPointer, { passive: true });
    cv.addEventListener('pointerup', function () { lastPt = null; prevPv = 0; }, { passive: true });

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('orientationchange', function () { setTimeout(resize, 80); }, { passive: true });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { if (ctx && ctx.state === 'running') ctx.suspend(); if (silentEl) { try { silentEl.pause(); } catch (e) {} } }
      else if (opened) { if (ctx && ctx.state === 'suspended') { var p = ctx.resume(); if (p && p.then) p.then(nudgeSession); else nudgeSession(); } acquireWake(); }
    }, { passive: true });
    window.addEventListener('pagehide', function () { if (ctx && ctx.state === 'running') ctx.suspend(); if (silentEl) { try { silentEl.pause(); } catch (e) {} } });

    /* status line: tells you whether the gyro is actually driving the sound */
    setInterval(updateStatus, 250);
  }

  function updateStatus() {
    var el = document.getElementById('saber-status'); if (!el || !opened) return;
    if (!on) { el.textContent = ''; return; }
    if (!window.DeviceMotionEvent) { el.style.color = hexA('#ff6b5a', 0.9); el.textContent = '◐ NO MOTION SENSOR — DRAG TO SWING'; return; }
    if (!motionOK) { el.style.color = hexA('#ffd24a', 0.95); el.textContent = '◐ MOTION OFF — TAP BLADE TO ENABLE'; return; }
    if (motionLive()) { el.style.color = hexA(GREEN, 0.95); el.textContent = '● MOTION LIVE · SWING IT'; }
    else { el.style.color = hexA(GREEN, 0.55); el.textContent = '● MOTION ON'; }
  }

  function cycleType() {
    var i = (ORDER.indexOf(curType) + 1) % ORDER.length; curType = ORDER[i]; cur = TYPES[curType]; applyTypeParams(); dirty = true;
    var b = document.getElementById('saber-type'); if (b) b.textContent = cur.name + ' ▸';
  }
  function setHint() { var m = document.getElementById('saber-main'); if (m) m.style.opacity = on ? '0' : '1'; }

  function igniteFlow() {
    ensureAudio(); nudgeSession(); acquireWake();
    if (!motionAsked && !motionOK) {
      requestMotion().then(function (ok) {
        motionOK = ok;
        if (ok) { motionAsked = true; if (!motionAttached) { window.addEventListener('devicemotion', onMotion); motionAttached = true; } }
        else { var sub = document.getElementById('saber-sub'); if (sub) sub.textContent = 'TAP AGAIN TO ENABLE MOTION'; }
        updateStatus();
      });
    } else if (motionOK && !motionAttached) { window.addEventListener('devicemotion', onMotion); motionAttached = true; }
    ignite(); setHint(); updateStatus();
  }

  function calibrate() {
    ensureAudio();
    if (motionOK && !motionAttached) { window.addEventListener('devicemotion', onMotion); motionAttached = true; }
    var sub = document.getElementById('saber-sub'); if (sub) sub.textContent = 'CALIBRATING — ONE HARD SWING…';
    var pkS = 0, pkA = 0, t0 = performance.now();
    (function sample() {
      pkS = Math.max(pkS, dbg.swing); pkA = Math.max(pkA, dbg.amag);
      if (performance.now() - t0 < 2500) requestAnimationFrame(sample);
      else { if (pkS > 50) { swingScale = Math.max(120, pkS * 0.8); saveNum('saber.swingScale', swingScale); } if (pkA > 8) { CLASH_ACC = Math.max(8, pkA * 0.55); saveNum('saber.clashAcc', CLASH_ACC); } if (sub) sub.textContent = 'CALIBRATED ✓ · SILENT SWITCH OFF'; }
    })();
  }

  /* ============================================================
     PUBLIC API + LAUNCHER
     ============================================================ */
  function open() {
    buildOverlay(); wrap.classList.remove('hidden'); opened = true; dirty = true;
    ensureAudio(); acquireWake(); resize();
    var b = document.getElementById('saber-type'); if (b) b.textContent = cur.name + ' ▸';
    setHint(); updateStatus();
    lastT = 0; if (!raf) raf = requestAnimationFrame(draw);
  }
  function close() {
    powerOff(); releaseWake();
    if (motionAttached) { window.removeEventListener('devicemotion', onMotion); motionAttached = false; }
    smoothSwing = 0; swingInput = 0;
    if (wrap) wrap.classList.add('hidden');
    opened = false; if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (silentEl) { try { silentEl.pause(); } catch (e) {} }
    setTimeout(function () { if (!opened && ctx && ctx.state === 'running') ctx.suspend(); }, 700);
  }
  function simulate(swing, clashI) {
    if (!opened) open(); if (!on) igniteFlow();
    swingInput = Math.max(swingInput, swing || 0); lastMotionT = performance.now(); dbg.src = 'sim';
    if (clashI) { lastClash = performance.now(); clash(clashI); }
  }
  window.Saber = {
    open: open, close: close, simulate: simulate, calibrate: calibrate,
    setClashThreshold: function (v) { CLASH_ACC = v; saveNum('saber.clashAcc', v); },
    setSwingScale: function (v) { swingScale = v; saveNum('saber.swingScale', v); },
    _state: function () { return { on: on, opened: opened, motionOK: motionOK, motionAttached: motionAttached, motionLive: motionLive(), type: curType, swing: smoothSwing, scale: swingScale, ctx: ctx && ctx.state }; }
  };

  function injectLauncher() {
    if (!IS_IPHONE) return;
    var tools = document.querySelector('#hub .tools'); if (!tools || document.getElementById('saberBtn')) return;
    var b = document.createElement('button'); b.id = 'saberBtn'; b.type = 'button'; b.title = 'Lightsaber (motion)'; b.textContent = '⚔ SABER';
    b.style.cssText = 'color:' + GREEN + ';border-color:' + hexA(GREEN, 0.55) + ';text-shadow:0 0 6px ' + hexA(GREEN, 0.6);
    b.addEventListener('click', open);
    var logout = tools.querySelector('.logout'); tools.insertBefore(b, logout || null);
  }
  if (document.readyState !== 'loading') injectLauncher(); else document.addEventListener('DOMContentLoaded', injectLauncher);
  document.addEventListener('hub:ready', injectLauncher);
})();
