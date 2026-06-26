/* ============================================================
   LIGHTSABER  ·  iPhone motion saber   (window.Saber)
   ------------------------------------------------------------
   Turns the iPhone into a Star Wars lightsaber. Hum, swing
   swoosh and clash are SYNTHESIZED live with the Web Audio API
   (no audio files) so they react to how you move:

     • gyroscope rotation rate -> swing speed -> hum bends up +
       a directional Doppler swoosh that pans with the swing
     • a sharp DECELERATION/jerk spike -> a hard metallic CLASH
       (a true strike: swing fast then hit, not just wave)

   Three hum characters, switchable live: CLASSIC · VADER · KYLO.
   Full glowing GREEN blade — rock-steady vertical, extends up on
   ignite / retracts down on power-off; clash screen-shake +
   shockwave + flare.

   iPhone-only launcher (injected into the hub header). open()/
   simulate() still work anywhere so the engine can be exercised
   in a desktop preview (drag the blade to "swing"; also the
   fallback when motion permission is denied).

   This file was hardened + enhanced via a multi-agent review.
   Inline tags (F#, E#) trace each change to that spec.
   ============================================================ */
(function () {
  'use strict';

  /* ---- device gate ---------------------------------------- */
  var UA = navigator.userAgent || '';
  var IS_IPHONE = /iPhone|iPod/.test(UA);          // iPhone only (iPad masquerades as Mac; excluded)

  /* ---- palette / saber color (GREEN) ---------------------- */
  var GREEN = '#41ff7e', CORE = '#daffe4';
  function hexA(h, a) {
    return 'rgba(' + parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16) + ',' + a + ')';
  }
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); // E9

  /* ---- persisted calibration (E7) ------------------------- */
  function loadNum(k, d) { try { var v = parseFloat(localStorage.getItem(k)); return isFinite(v) ? v : d; } catch (e) { return d; } }
  function saveNum(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }

  /* ---- hum characters (E1: + buzzHz/buzzDepth/formant) ----- */
  var TYPES = {
    classic: { name: 'CLASSIC', baseF: 96, lp: 1900, subMix: 0.26, tremHz: 8.0, tremDepth: 0.16, vibHz: 6, vibCents: 6,  crackle: 0.0, buzzHz: 50, buzzDepth: 0.10, formant: 280 },
    vader:   { name: 'VADER',   baseF: 64, lp: 1180, subMix: 0.42, tremHz: 5.5, tremDepth: 0.22, vibHz: 4, vibCents: 9,  crackle: 0.0, buzzHz: 38, buzzDepth: 0.11, formant: 230 },
    kylo:    { name: 'KYLO',    baseF: 90, lp: 2300, subMix: 0.22, tremHz: 9.0, tremDepth: 0.20, vibHz: 7, vibCents: 16, crackle: 0.6, buzzHz: 58, buzzDepth: 0.16, formant: 320 }
  };
  var ORDER = ['classic', 'vader', 'kylo'];
  var curType = 'classic', cur = TYPES.classic;
  var baseF = cur.baseF, baseHum = 0.22, pitchMul = 1;

  /* ---- state ---------------------------------------------- */
  var ctx = null, on = false, opened = false, motionOK = false, motionAsked = false, motionAttached = false; // F4/F7
  var wakeLock = null;                                                   // F1
  var smoothSwing = 0, swingInput = 0, prevSwing = 0, prevA = 0, swingDir = 0, lastClash = 0; // F5/E2
  var grav = null;                                                       // F10 (per-axis gravity estimate)
  var unitMul = 1, unitPeak = 0, unitSamples = 0, unitLocked = false;    // E7 deg/s-vs-rad/s autodetect
  var swingScale = loadNum('saber.swingScale', 650);                     // E7
  var CLASH_ACC = loadNum('saber.clashAcc', 22), DECEL_THRESH = 170, JERK_THRESH = 60; // F5
  var bladeAnim = 0, bladeTarget = 0, clashFlash = 0, clashShake = 0, igniteT = 0;      // E3/E5/F15
  var idleAmt = 0;                                                       // E10 (idle "breathing")
  var showDbg = false, dbg = { swing: 0, amag: 0, src: '-' };
  var dirty = true;                                                      // F13 (idle render-skip)

  /* ============================================================
     AUDIO ENGINE
     ============================================================ */
  var master, comp, humLevel, flare, humLP, humFormant, humMix, osc1, osc2, osc3, sub, subGain;
  var tremLFO, tremDepth, buzzLFO, buzzDepth, vibLFO, vibDepth, vibDepth2, vibDepth3;
  var swNoise, swooshBP, swooshGain, swooshPan, crNoise, crackleBP, crackleGain;
  var noiseBuf2, noiseBufW, clashBufs = null, silentEl;

  function makeNoise(seconds, white) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0), b0 = 0, b1 = 0, b2 = 0;
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
    comp.threshold.value = -12; comp.knee.value = 22; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.18;
    comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = 0.95; master.connect(comp);

    /* hum chain: oscillators -> mix -> formant(peaking) -> lowpass -> level -> flare -> master */
    flare = ctx.createGain(); flare.gain.value = 1; flare.connect(master);
    humLevel = ctx.createGain(); humLevel.gain.value = 0; humLevel.connect(flare);
    humLP = ctx.createBiquadFilter(); humLP.type = 'lowpass'; humLP.frequency.value = cur.lp; humLP.Q.value = 0.8; humLP.connect(humLevel);
    humFormant = ctx.createBiquadFilter(); humFormant.type = 'peaking'; humFormant.frequency.value = cur.formant; humFormant.Q.value = 5; humFormant.gain.value = 8; humFormant.connect(humLP); // E1 hollow body
    humMix = ctx.createGain(); humMix.gain.value = 1; humMix.connect(humFormant);

    osc1 = ctx.createOscillator(); osc1.type = 'sawtooth'; osc1.frequency.value = baseF;
    osc2 = ctx.createOscillator(); osc2.type = 'sawtooth'; osc2.frequency.value = baseF; osc2.detune.value = 9;
    osc3 = ctx.createOscillator(); osc3.type = 'sawtooth'; osc3.frequency.value = baseF; osc3.detune.value = -7; // E1 third saw
    sub  = ctx.createOscillator(); sub.type  = 'sine';     sub.frequency.value  = baseF * 0.5;
    var g1 = ctx.createGain(); g1.gain.value = 0.5; osc1.connect(g1); g1.connect(humMix);
    var g2 = ctx.createGain(); g2.gain.value = 0.5; osc2.connect(g2); g2.connect(humMix);
    var g3 = ctx.createGain(); g3.gain.value = 0.5; osc3.connect(g3); g3.connect(humMix);
    subGain = ctx.createGain(); subGain.gain.value = cur.subMix; sub.connect(subGain); subGain.connect(humMix);

    /* tremolo (slow waver) + buzz (fast AM rasp, E1) both sum onto humLevel.gain */
    tremLFO = ctx.createOscillator(); tremLFO.type = 'sine'; tremLFO.frequency.value = cur.tremHz;
    tremDepth = ctx.createGain(); tremDepth.gain.value = 0; tremLFO.connect(tremDepth); tremDepth.connect(humLevel.gain);
    buzzLFO = ctx.createOscillator(); buzzLFO.type = 'sine'; buzzLFO.frequency.value = cur.buzzHz;
    buzzDepth = ctx.createGain(); buzzDepth.gain.value = 0; buzzLFO.connect(buzzDepth); buzzDepth.connect(humLevel.gain);
    /* vibrato -> oscillator detune (cents), preserving each osc's base detune */
    vibLFO = ctx.createOscillator(); vibLFO.type = 'sine'; vibLFO.frequency.value = cur.vibHz;
    vibDepth = ctx.createGain(); vibDepth.gain.value = cur.vibCents; vibLFO.connect(vibDepth); vibDepth.connect(osc1.detune);
    vibDepth2 = ctx.createGain(); vibDepth2.gain.value = cur.vibCents; vibLFO.connect(vibDepth2); vibDepth2.connect(osc2.detune);
    vibDepth3 = ctx.createGain(); vibDepth3.gain.value = cur.vibCents; vibLFO.connect(vibDepth3); vibDepth3.connect(osc3.detune);

    /* swoosh: looping pink noise -> bandpass -> gain -> (stereo pan) -> master */
    noiseBuf2 = makeNoise(2, false); noiseBufW = makeNoise(2, true);
    swNoise = ctx.createBufferSource(); swNoise.buffer = noiseBuf2; swNoise.loop = true;
    swooshBP = ctx.createBiquadFilter(); swooshBP.type = 'bandpass'; swooshBP.frequency.value = 500; swooshBP.Q.value = 1.3;
    swooshGain = ctx.createGain(); swooshGain.gain.value = 0;
    swNoise.connect(swooshBP); swooshBP.connect(swooshGain);
    if (ctx.createStereoPanner) { swooshPan = ctx.createStereoPanner(); swooshGain.connect(swooshPan); swooshPan.connect(master); } // E2
    else { swooshPan = null; swooshGain.connect(master); }

    /* crackle (KYLO instability) */
    crNoise = ctx.createBufferSource(); crNoise.buffer = noiseBufW; crNoise.loop = true;
    crackleBP = ctx.createBiquadFilter(); crackleBP.type = 'bandpass'; crackleBP.frequency.value = 1700; crackleBP.Q.value = 0.8;
    crackleGain = ctx.createGain(); crackleGain.gain.value = 0;
    crNoise.connect(crackleBP); crackleBP.connect(crackleGain); crackleGain.connect(master);

    /* 3 prebuilt clash buffers so each strike differs (E4) */
    clashBufs = [makeNoise(0.4, true), makeNoise(0.4, true), makeNoise(0.4, true)];

    osc1.start(); osc2.start(); osc3.start(); sub.start();
    tremLFO.start(); buzzLFO.start(); vibLFO.start(); swNoise.start(); crNoise.start();
    applyTypeParams();
  }

  function ensureAudio() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    /* F2: auto-recover if iOS suspends us mid-session (call/Siri/Control-Center/app-switch) */
    ctx.onstatechange = function () {
      if (opened && ctx.state === 'suspended') { var p = ctx.resume(); if (p && p.then) p.then(nudgeSession); else nudgeSession(); }
    };
    buildGraph();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function applyTypeParams() {
    if (!ctx) return;
    var t = cur, now = ctx.currentTime; baseF = t.baseF;
    osc1.frequency.setTargetAtTime(baseF * pitchMul, now, 0.06);
    osc2.frequency.setTargetAtTime(baseF * pitchMul, now, 0.06);
    osc3.frequency.setTargetAtTime(baseF * pitchMul, now, 0.06);
    sub.frequency.setTargetAtTime(baseF * 0.5 * pitchMul, now, 0.06);
    subGain.gain.setTargetAtTime(t.subMix, now, 0.06);
    humLP.frequency.setTargetAtTime(t.lp, now, 0.08);
    humFormant.frequency.setTargetAtTime(t.formant, now, 0.08);
    tremLFO.frequency.setTargetAtTime(t.tremHz, now, 0.08);
    buzzLFO.frequency.setTargetAtTime(t.buzzHz, now, 0.08);
    vibLFO.frequency.setTargetAtTime(t.vibHz, now, 0.08);
    vibDepth.gain.setTargetAtTime(t.vibCents, now, 0.08);
    vibDepth2.gain.setTargetAtTime(t.vibCents, now, 0.08);
    vibDepth3.gain.setTargetAtTime(t.vibCents, now, 0.08);
    if (on) {
      tremDepth.gain.setTargetAtTime(t.tremDepth * baseHum, now, 0.1);
      buzzDepth.gain.setTargetAtTime(t.buzzDepth * baseHum, now, 0.1);
      crackleGain.gain.setTargetAtTime(t.crackle * 0.09, now, 0.12);
    }
  }

  /* live mapping: swing (deg/s) -> hum pitch + directional swoosh (E2) */
  function applyMotion(sw) {
    if (!ctx || !on) return;
    var s = Math.min(1, sw / swingScale), now = ctx.currentTime;   // E7 swingScale
    pitchMul = 1 + 0.5 * s;
    osc1.frequency.setTargetAtTime(baseF * pitchMul, now, 0.03);
    osc2.frequency.setTargetAtTime(baseF * pitchMul, now, 0.03);
    osc3.frequency.setTargetAtTime(baseF * pitchMul, now, 0.03);
    sub.frequency.setTargetAtTime(baseF * 0.5 * pitchMul, now, 0.03);
    swooshGain.gain.setTargetAtTime(Math.pow(s, 1.5) * 0.7, now, 0.04);
    swooshBP.frequency.setTargetAtTime(380 + s * 1800, now, 0.04);
    if (swooshPan) swooshPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, swingDir * s * 1.2)), now, 0.05); // E2 pan by direction
    /* F8: don't fight the ignite swell for the first ~260ms; E10: breathe down when idle */
    if (performance.now() - igniteT > 260) {
      var breath = (1 - 0.12 * idleAmt) * (1 + 0.03 * idleAmt * Math.sin(now * 1.3));
      humLevel.gain.setTargetAtTime(baseHum * (1 + 0.22 * s) * breath, now, 0.05);
      humLP.frequency.setTargetAtTime(cur.lp - 150 * idleAmt, now, 0.2);
    }
  }

  /* one-shot swoosh "grain" fired at a swing crest (E2) */
  function swooshGrain(inten, dir) {
    if (!ctx || !on) return;
    var now = ctx.currentTime;
    var nb = ctx.createBufferSource(); nb.buffer = noiseBuf2; nb.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(600, now);
    bp.frequency.exponentialRampToValueAtTime(2200, now + 0.09);
    bp.frequency.exponentialRampToValueAtTime(520, now + 0.2);
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.5 * inten, now + 0.02); g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    nb.connect(bp); bp.connect(g);
    if (ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, dir)); g.connect(p); p.connect(master); }
    else g.connect(master);
    nb.start(now); nb.stop(now + 0.25);
  }

  function ignite() {
    if (!ctx) return;
    on = true; bladeTarget = 1; igniteT = performance.now(); dirty = true;
    var now = ctx.currentTime;
    /* E3: power-up swell (overshoot then settle) + pitch glide + lowpass open */
    humLevel.gain.cancelScheduledValues(now);
    humLevel.gain.setValueAtTime(0.0001, now);
    humLevel.gain.setTargetAtTime(baseHum * 1.25, now + 0.02, 0.06);
    humLevel.gain.setTargetAtTime(baseHum, now + 0.2, 0.10);
    osc1.frequency.setValueAtTime(baseF * 0.7, now); osc1.frequency.setTargetAtTime(baseF, now, 0.06);
    osc2.frequency.setValueAtTime(baseF * 0.7, now); osc2.frequency.setTargetAtTime(baseF, now, 0.06);
    osc3.frequency.setValueAtTime(baseF * 0.7, now); osc3.frequency.setTargetAtTime(baseF, now, 0.06);
    sub.frequency.setValueAtTime(baseF * 0.35, now); sub.frequency.setTargetAtTime(baseF * 0.5, now, 0.06);
    humLP.frequency.setValueAtTime(600, now); humLP.frequency.setTargetAtTime(cur.lp, now, 0.10);
    tremDepth.gain.setTargetAtTime(cur.tremDepth * baseHum, now, 0.1);
    buzzDepth.gain.setTargetAtTime(cur.buzzDepth * baseHum, now, 0.12);
    crackleGain.gain.setTargetAtTime(cur.crackle * 0.09, now, 0.15);
    /* snap-hiss: noise sweep up */
    var nb = ctx.createBufferSource(); nb.buffer = makeNoise(0.6, true);
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(300, now); bp.frequency.exponentialRampToValueAtTime(3200, now + 0.22);
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.5, now + 0.04); g.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    nb.connect(bp); bp.connect(g); g.connect(master); nb.start(now); nb.stop(now + 0.45);
    acquireWake();                                   // F1
  }

  function powerOff() {
    bladeTarget = 0; dirty = true;
    if (!ctx || !on) { on = false; return; }
    on = false;
    var now = ctx.currentTime;
    humLevel.gain.cancelScheduledValues(now);
    humLevel.gain.setTargetAtTime(0.0001, now, 0.12);
    tremDepth.gain.setTargetAtTime(0, now, 0.1);
    buzzDepth.gain.setTargetAtTime(0, now, 0.1);
    crackleGain.gain.setTargetAtTime(0, now, 0.1);
    swooshGain.gain.setTargetAtTime(0, now, 0.08);
    /* E3: reverse pitch glide down as the blade collapses */
    osc1.frequency.setTargetAtTime(baseF * 0.6, now, 0.08);
    osc2.frequency.setTargetAtTime(baseF * 0.6, now, 0.08);
    osc3.frequency.setTargetAtTime(baseF * 0.6, now, 0.08);
    /* descending hiss */
    var nb = ctx.createBufferSource(); nb.buffer = makeNoise(0.6, true);
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(2600, now); bp.frequency.exponentialRampToValueAtTime(280, now + 0.3);
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.35, now + 0.03); g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    nb.connect(bp); bp.connect(g); g.connect(master); nb.start(now); nb.stop(now + 0.5);
  }

  function clash(intensity) {
    /* visual + felt feedback first (E5), so it fires even at low audio */
    clashFlash = Math.min(1, 0.55 + intensity * 0.6);
    if (!reduceMotion) clashShake = 6 + 10 * Math.min(1, intensity);     // E5 screen-shake
    if (navigator.vibrate) { try { navigator.vibrate(intensity > 0.6 ? [0, 30, 20, 40] : 20); } catch (e) {} } // F16 (no-op on iOS Safari)
    dirty = true;
    if (!ctx || !on) return;
    var k = 0.55 + 0.45 * Math.min(1, intensity), now = ctx.currentTime;
    /* E4: randomize every strike so it never sounds cloned */
    var buf = clashBufs[(Math.random() * clashBufs.length) | 0];
    var cf = 1900 + Math.random() * 1700, hpf = 700 + Math.random() * 500;
    var nb = ctx.createBufferSource(); nb.buffer = buf;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = cf; bp.Q.value = 0.6;
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = hpf;
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.95 * k, now + 0.004); g.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
    nb.connect(bp); bp.connect(hp); hp.connect(g); g.connect(master); nb.start(now); nb.stop(now + 0.3);
    /* downward zap */
    var z = ctx.createOscillator(); z.type = 'square'; var zg = ctx.createGain();
    z.frequency.setValueAtTime(1000 + Math.random() * 600, now); z.frequency.exponentialRampToValueAtTime(170, now + 0.18);
    zg.gain.setValueAtTime(0.0001, now); zg.gain.linearRampToValueAtTime(0.26 * k, now + 0.005); zg.gain.exponentialRampToValueAtTime(0.001, now + 0.14 + Math.random() * 0.1);
    z.connect(zg); zg.connect(master); z.start(now); z.stop(now + 0.3);
    /* ~40% of hits get a metallic "shing" ring partial */
    if (Math.random() < 0.4) {
      var r = ctx.createOscillator(); r.type = 'triangle'; var rg = ctx.createGain();
      r.frequency.value = 3000 + Math.random() * 2000;
      rg.gain.setValueAtTime(0.0001, now); rg.gain.linearRampToValueAtTime(0.12 * k, now + 0.006); rg.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      r.connect(rg); rg.connect(master); r.start(now); r.stop(now + 0.15);
    }
    /* hum flare */
    flare.gain.cancelScheduledValues(now);
    flare.gain.setValueAtTime(1.7 * k, now); flare.gain.setTargetAtTime(1, now + 0.02, 0.12);
  }

  /* ============================================================
     MOTION
     ============================================================ */
  function requestMotion() {
    return new Promise(function (res) {
      var DME = window.DeviceMotionEvent;
      if (DME && typeof DME.requestPermission === 'function') {
        DME.requestPermission().then(function (s) { res(s === 'granted'); }).catch(function () { res(false); });
      } else if (DME) { res(true); } else { res(false); }
    });
  }

  function onMotion(e) {
    if (!opened) return;                              // F4 belt: no work while closed
    var rr = e.rotationRate || {};
    var ga = rr.gamma || 0, be = rr.beta || 0, al = rr.alpha || 0;
    var swing = Math.sqrt(al * al + be * be + ga * ga);
    /* E7: deg/s vs rad/s autodetect (iOS=deg/s; spec/Android=rad/s, ~57x smaller) */
    if (!unitLocked) {
      unitPeak = Math.max(unitPeak, swing);
      if (++unitSamples >= 40) { unitMul = (unitPeak < 20) ? (180 / Math.PI) : 1; unitLocked = true; }
    }
    swing *= unitMul;
    swingInput = swing; dbg.swing = swing; dbg.src = 'gyro';
    swingDir = Math.sign((Math.abs(ga) >= Math.abs(be)) ? ga : be); // E2 dominant in-plane axis

    /* linear acceleration magnitude (F10: per-axis gravity removal on the fallback) */
    var a = e.acceleration, amag = 0;
    if (a && a.x != null) {
      amag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); dbg.src = 'gyro+acc';
    } else {
      var ag = e.accelerationIncludingGravity;
      if (ag && ag.x != null) {
        if (!grav) grav = { x: ag.x, y: ag.y, z: ag.z };
        var kk = 0.1; grav.x += kk * (ag.x - grav.x); grav.y += kk * (ag.y - grav.y); grav.z += kk * (ag.z - grav.z);
        var lx = ag.x - grav.x, ly = ag.y - grav.y, lz = ag.z - grav.z;
        amag = Math.sqrt(lx * lx + ly * ly + lz * lz); dbg.src = 'gyro+accG';
      }
    }
    dbg.amag = amag;

    /* F5: a STRIKE is an accel spike coinciding with a rapid drop in rotation, not just fast rotation */
    var now = performance.now();
    var decel = prevSwing - swing, jerk = amag - prevA;
    prevSwing = swing; prevA = amag;
    if (on && amag > CLASH_ACC && (decel > DECEL_THRESH || jerk > JERK_THRESH) && now - lastClash > 150) {
      clash(Math.min(1, (amag - CLASH_ACC) / (2 * CLASH_ACC)));         // softened saturation
      lastClash = now;
    }
  }

  /* ============================================================
     VISUALS  ·  the glowing green blade
     ============================================================ */
  var wrap, cv, g2, CSSW = 0, CSSH = 0, DPR = 1, raf = 0, lastT = 0;
  var vignetteGrad = null;                            // F13 cached
  var risingPeak = 0, wasRising = false;              // E2 crest detect

  function resize() {
    if (!cv || !opened) return;                       // F11
    var r = wrap.getBoundingClientRect();
    CSSW = Math.max(1, r.width); CSSH = Math.max(1, r.height);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(CSSW * DPR); cv.height = Math.round(CSSH * DPR);
    var vg = g2.createRadialGradient(CSSW / 2, CSSH * 0.5, CSSH * 0.3, CSSW / 2, CSSH * 0.5, Math.max(CSSW, CSSH) * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    vignetteGrad = vg; dirty = true;
  }

  function easeOutBack(x) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
  var EOB_PEAK = 1.0999;                              // F12 normalize overshoot to land at bladeMax

  function drawHilt(cx, ey, w, h) {
    var x = cx - w / 2;
    var grd = g2.createLinearGradient(x, 0, x + w, 0);
    grd.addColorStop(0, '#1a1d22'); grd.addColorStop(0.5, '#9aa3ad'); grd.addColorStop(0.55, '#cfd6dd'); grd.addColorStop(1, '#23272d');
    g2.fillStyle = grd; rr(x, ey, w, h, 5); g2.fill();
    /* E3/F15: emitter flash on ignite */
    var ig = (now0 - igniteT) / 1000;
    var lit = (igniteT > 0 && ig >= 0 && ig < 0.18) ? (1 - ig / 0.18) : 0;
    g2.fillStyle = lit > 0 ? hexA(CORE, 0.4 + 0.6 * lit) : '#3a4047'; g2.fillRect(x - 3, ey, w + 6, 6);
    g2.fillStyle = '#cdd4db'; g2.fillRect(x - 3, ey + 1, w + 6, 2);
    g2.fillStyle = 'rgba(0,0,0,0.45)';
    for (var i = 1; i <= 4; i++) g2.fillRect(x, ey + 14 + i * (h * 0.13), w, 3);
    g2.fillStyle = (on || lit > 0) ? GREEN : '#5a636c'; g2.fillRect(x + w + 2, ey + h * 0.4, 5, 10);
  }

  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g2.beginPath(); g2.moveTo(x + r, y); g2.arcTo(x + w, y, x + w, y + h, r); g2.arcTo(x + w, y + h, x, y + h, r);
    g2.arcTo(x, y + h, x, y, r); g2.arcTo(x, y, x + w, y, r); g2.closePath();
  }

  /* stroke one blade layer as a leaning quadratic curve emitter->tip (E6) */
  function bladeStroke(cx, ey, tipX, tipY, width, color, alpha) {
    g2.strokeStyle = color; g2.globalAlpha = alpha; g2.lineWidth = width; g2.lineCap = 'round';
    g2.beginPath(); g2.moveTo(cx, ey);
    g2.quadraticCurveTo(cx + (tipX - cx) * 0.35, (ey + tipY) / 2, tipX, tipY); g2.stroke();
  }

  var now0 = 0;
  function draw(ts) {
    raf = requestAnimationFrame(draw);
    now0 = ts || performance.now();
    var dt = Math.min(0.05, (now0 - lastT) / 1000) || 0.016; lastT = now0;

    /* swing smoothing + decay (gyro + pointer) */
    smoothSwing += (swingInput - smoothSwing) * Math.min(1, dt * 14);
    swingInput *= Math.max(0, 1 - dt * 3);
    applyMotion(smoothSwing);

    /* E2: fire a swoosh grain at a swing crest */
    if (smoothSwing > risingPeak) { risingPeak = smoothSwing; wasRising = true; }
    else if (wasRising && smoothSwing < risingPeak * 0.82 && risingPeak > 250) {
      swooshGrain(Math.min(1, risingPeak / swingScale), swingDir); wasRising = false; risingPeak = smoothSwing;
    } else if (smoothSwing < 60) { wasRising = false; risingPeak = smoothSwing; }

    /* E10: idle "breathing" amount */
    idleAmt += ((smoothSwing < 8 && on ? 1 : 0) - idleAmt) * Math.min(1, dt * (smoothSwing < 8 ? 0.7 : 6));

    bladeAnim += (bladeTarget - bladeAnim) * Math.min(1, dt * (bladeTarget > bladeAnim ? 10 : 8));
    clashFlash = Math.max(0, clashFlash - dt * 3.4);
    clashShake = Math.max(0, clashShake - dt * 60);   // E5

    /* F13: when fully off + settled, paint one frame then idle-skip until next input */
    var idle = !on && bladeAnim < 0.001 && clashFlash <= 0 && clashShake <= 0 && smoothSwing < 1;
    if (idle && !dirty) return;

    var w = CSSW, h = CSSH;
    var sy = clashShake ? (Math.random() - 0.5) * clashShake : 0; // E5 clash jolt — vertical only, never left/right
    g2.setTransform(DPR, 0, 0, DPR, 0, sy * DPR);
    g2.clearRect(-8, -8, w + 16, h + 16);
    g2.fillStyle = '#02060a'; g2.fillRect(-8, -8, w + 16, h + 16);

    var cx = w * 0.5;
    var hiltH = Math.min(150, h * 0.17), hiltW = 26;
    var ey = h - hiltH - 8;
    var bladeMax = ey - h * 0.05;
    var len = bladeMax * Math.max(0, easeOutBack(Math.min(1, bladeAnim))) / EOB_PEAK; // F12
    if (bladeAnim < 0.001) len = 0;
    if (len < 4) len = 0;                              // F14 clean cutoff

    /* blade stays rock-steady vertical — only extends up / retracts down (no left-right lean) */
    var s = Math.min(1, smoothSwing / swingScale);
    var topY = ey - len, tipX = cx;

    if (len > 4) {
      /* E10: organic flicker — mostly steady, rare energy dips (deeper for KYLO) */
      var flick = 1 + 0.04 * Math.sin(now0 * 0.011) + 0.025 * Math.sin(now0 * 0.027)
        + ((Math.random() < (curType === 'kylo' ? 0.03 : 0.012)) ? -(0.14 + 0.1 * s) * (curType === 'kylo' ? 1.4 : 1) : 0);
      if (reduceMotion) flick = 1 + 0.02 * Math.sin(now0 * 0.011);
      var bright = (0.86 + 0.14 * Math.sin(now0 * 0.02)) * flick;
      var coreW = 7 * (curType === 'vader' ? 1.1 : 1);
      var glowW = 28 + s * 24;

      g2.save(); g2.globalCompositeOperation = 'lighter';

      /* blade: stacked stroked layers (soft glow -> white core) */
      bladeStroke(cx, ey, tipX, topY, glowW * 1.8, GREEN, 0.10 * bright);
      bladeStroke(cx, ey, tipX, topY, glowW, GREEN, 0.18 * bright);
      bladeStroke(cx, ey, tipX, topY, coreW * 3, GREEN, 0.55 * bright);
      bladeStroke(cx, ey, tipX, topY, coreW * 1.5, hexA(GREEN, 1), 0.9 * bright);
      bladeStroke(cx, ey, tipX, topY, coreW * 0.6, CORE, 0.98 * bright);
      /* tip cap + bloom */
      g2.globalAlpha = 1;
      g2.fillStyle = hexA(CORE, 0.96 * bright); g2.beginPath(); g2.arc(tipX, topY, coreW * 0.85, 0, Math.PI * 2); g2.fill();
      g2.fillStyle = hexA(GREEN, 0.5 * bright); g2.beginPath(); g2.arc(tipX, topY, glowW * 0.65, 0, Math.PI * 2); g2.fill();

      /* KYLO crossguard sparks */
      if (curType === 'kylo') {
        var sparks = Math.random() < 0.5 ? 2 : 0;
        for (var sp = 0; sp < sparks; sp++) {
          var syy = topY + Math.random() * len, side = Math.random() < 0.5 ? -1 : 1;
          g2.strokeStyle = hexA(GREEN, 0.8); g2.globalAlpha = 0.8; g2.lineWidth = 1.4;
          g2.beginPath(); g2.moveTo(cx + side * coreW, syy);
          g2.lineTo(cx + side * (coreW + 6 + Math.random() * 10), syy + (Math.random() - 0.5) * 14); g2.stroke();
        }
      }
      g2.globalAlpha = 1; g2.restore();
    }

    drawHilt(cx, ey, hiltW, hiltH);

    /* E5: expanding shockwave ring on clash */
    if (clashFlash > 0) {
      g2.save(); g2.globalCompositeOperation = 'lighter';
      var rad = (1 - clashFlash) * Math.max(w, h) * 0.7;
      g2.strokeStyle = hexA(CORE, clashFlash * 0.7); g2.lineWidth = 2 + clashFlash * 4;
      g2.beginPath(); g2.arc(cx, ey - len * 0.5, rad, 0, Math.PI * 2); g2.stroke();
      var ff = clashFlash * (reduceMotion ? 0.25 : 0.55);            // E9 damp flash for reduced-motion
      g2.fillStyle = 'rgba(255,255,255,' + ff + ')'; g2.fillRect(0, 0, w, h);
      g2.restore();
    }

    if (vignetteGrad) { g2.fillStyle = vignetteGrad; g2.fillRect(-8, -8, w + 16, h + 16); }

    if (idle) dirty = false;                           // F13: settled — stop redrawing until next input

    if (showDbg) {
      var d = document.getElementById('saber-dbg');
      if (d) d.textContent = 'swing ' + Math.round(dbg.swing) + '°/s  acc ' + dbg.amag.toFixed(1) +
        '  thr ' + CLASH_ACC.toFixed(0) + '/' + DECEL_THRESH + '  scale ' + Math.round(swingScale) +
        '  motion ' + (motionOK ? 'Y' : 'n') + '  ' + dbg.src + '  ' + (on ? 'ON' : 'off');
    }
  }

  /* ============================================================
     POINTER FALLBACK  ·  drag to swing (desktop test + denied-motion fallback)
     ============================================================ */
  var lastPt = null, prevPv = 0;
  function onPointer(e) {
    if (!on) return;
    var now = performance.now(), x = e.clientX, y = e.clientY;
    if (lastPt) {
      var dx = x - lastPt.x, dy = y - lastPt.y, dtp = Math.max(8, now - lastPt.t);
      var v = Math.sqrt(dx * dx + dy * dy) / dtp * 1000;
      var sw = Math.min(swingScale * 1.4, v * 0.26);
      swingInput = Math.max(swingInput, sw); dbg.swing = sw; dbg.src = 'touch';
      swingDir = Math.sign(dx);
      /* F5: strike on a sharp DROP in pointer speed, not raw high speed */
      if (prevPv - v > 1600 && prevPv > 2200 && now - lastClash > 170) { clash(Math.min(1, (prevPv - 2200) / 3000)); lastClash = now; }
      prevPv = v;
    }
    lastPt = { x: x, y: y, t: now };
  }

  /* ============================================================
     Screen Wake Lock (F1)  +  iOS audio session warm-up (F3)
     ============================================================ */
  function acquireWake() {
    try {
      if (navigator.wakeLock && !wakeLock) {
        navigator.wakeLock.request('screen').then(function (wl) {
          wakeLock = wl; wl.addEventListener('release', function () { wakeLock = null; });
        }).catch(function () {});
      }
    } catch (e) {}
  }
  function releaseWake() { try { if (wakeLock) wakeLock.release(); } catch (e) {} wakeLock = null; }

  /* NOTE: this warms up the Web Audio output on the first gesture. It does NOT
     override the iPhone ring/silent switch — that routes Web Audio to a muted
     session and there is no web API to change it. The on-screen reminder is the
     real mitigation; keep the silent switch off + volume up. (F3) */
  function silentWavURI() {
    var sr = 8000, n = Math.floor(sr * 0.25), bytes = 44 + n * 2, buf = new ArrayBuffer(bytes), dv = new DataView(buf);
    function wr(o, s) { for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); }
    wr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); wr(8, 'WAVE'); wr(12, 'fmt '); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); wr(36, 'data'); dv.setUint32(40, n * 2, true);
    var u8 = new Uint8Array(buf), bin = '';
    for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }
  function nudgeSession() {
    try {
      if (!silentEl) { silentEl = document.createElement('audio'); silentEl.loop = true; silentEl.setAttribute('playsinline', ''); silentEl.volume = 0.001; silentEl.src = silentWavURI(); }
      var p = silentEl.play(); if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  /* ============================================================
     OVERLAY  ·  DOM + controls
     ============================================================ */
  function injectCSS() {
    if (document.getElementById('saber-css')) return;
    var s = document.createElement('style'); s.id = 'saber-css';
    s.textContent =
      '#saber{position:fixed;inset:0;z-index:9999;background:#02060a;display:flex;touch-action:none;' +
      '-webkit-user-select:none;user-select:none;overscroll-behavior:none}' +
      '#saber.hidden{display:none}' +
      '#saber canvas{position:absolute;inset:0;width:100%;height:100%;display:block}' +
      '#saber .sb-btn{position:absolute;z-index:2;background:rgba(4,13,9,.55);color:' + GREEN + ';' +
      'border:1px solid ' + hexA(GREEN, 0.5) + ';border-radius:8px;font:600 13px/1 ui-monospace,Menlo,monospace;' +
      'letter-spacing:1px;padding:11px 13px;min-width:44px;min-height:44px;cursor:pointer;backdrop-filter:blur(3px);' +
      '-webkit-backdrop-filter:blur(3px);text-shadow:0 0 6px ' + hexA(GREEN, 0.7) + '}' +
      '#saber .sb-btn:active{background:' + hexA(GREEN, 0.18) + '}' +
      '#saber #saber-exit{top:max(12px,env(safe-area-inset-top));left:max(12px,env(safe-area-inset-left));font-size:18px}' +
      '#saber #saber-type{top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right))}' +
      '#saber #saber-dev{bottom:max(12px,env(safe-area-inset-bottom));right:max(12px,env(safe-area-inset-right));opacity:.6;font-size:11px;min-height:38px;padding:8px 10px}' +
      '#saber #saber-hint{position:absolute;z-index:2;left:0;right:0;top:44%;text-align:center;pointer-events:none}' +
      '#saber #saber-main{display:block;color:' + hexA(GREEN, 0.92) + ';font:600 16px/1.5 ui-monospace,Menlo,monospace;' +
      'letter-spacing:3px;text-shadow:0 0 12px ' + hexA(GREEN, 0.8) + ';transition:opacity .4s ease}' +
      '#saber #saber-sub{display:block;margin-top:8px;font-size:11px;letter-spacing:1px;color:' + hexA(GREEN, 0.5) + '}' +
      '#saber #saber-dbg{position:absolute;z-index:2;left:50%;bottom:max(12px,env(safe-area-inset-bottom));' +
      'transform:translateX(-50%);color:' + hexA(GREEN, 0.85) + ';font:600 11px/1 ui-monospace,monospace;' +
      'letter-spacing:.4px;background:rgba(0,0,0,.5);padding:7px 10px;border-radius:6px;white-space:nowrap}' +
      '#saber .hidden{display:none}';
    document.head.appendChild(s);
  }

  function buildOverlay() {
    if (wrap) return;
    injectCSS();
    wrap = document.createElement('div'); wrap.id = 'saber'; wrap.className = 'hidden';
    wrap.innerHTML =
      '<canvas id="saber-cv" aria-label="Lightsaber blade — tap to ignite"></canvas>' +
      '<button id="saber-exit" class="sb-btn" type="button" aria-label="Exit">✕</button>' +
      '<button id="saber-type" class="sb-btn" type="button" aria-label="Change saber type">CLASSIC ▸</button>' +
      '<div id="saber-hint"><span id="saber-main">TAP TO IGNITE</span><span id="saber-sub">SILENT SWITCH OFF · VOLUME UP</span></div>' +
      '<button id="saber-dev" class="sb-btn" type="button" aria-hidden="true">DEV</button>' +
      '<div id="saber-dbg" class="hidden"></div>';
    document.body.appendChild(wrap);
    cv = document.getElementById('saber-cv'); g2 = cv.getContext('2d');

    document.getElementById('saber-exit').addEventListener('click', function (e) { e.stopPropagation(); close(); });
    document.getElementById('saber-type').addEventListener('click', function (e) { e.stopPropagation(); cycleType(); });
    document.getElementById('saber-dev').addEventListener('click', function (e) {
      e.stopPropagation(); showDbg = !showDbg; dirty = true;
      document.getElementById('saber-dbg').classList.toggle('hidden', !showDbg);
    });
    cv.addEventListener('click', function () { on ? powerOff() : igniteFlow(); });
    cv.addEventListener('pointermove', onPointer, { passive: true });
    cv.addEventListener('pointerup', function () { lastPt = null; prevPv = 0; }, { passive: true });

    /* viewport lifecycle (F6 landscape) */
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('orientationchange', function () { setTimeout(resize, 80); }, { passive: true });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize, { passive: true });

    /* audio + wake-lock lifecycle (F2 + F1) */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (ctx && ctx.state === 'running') ctx.suspend();
        if (silentEl) { try { silentEl.pause(); } catch (e) {} }
      } else if (opened) {
        if (ctx && ctx.state === 'suspended') { var p = ctx.resume(); if (p && p.then) p.then(nudgeSession); else nudgeSession(); }
        acquireWake();
      }
    }, { passive: true });
    window.addEventListener('pagehide', function () {
      if (ctx && ctx.state === 'running') ctx.suspend();
      if (silentEl) { try { silentEl.pause(); } catch (e) {} }
    });
  }

  function cycleType() {
    var i = (ORDER.indexOf(curType) + 1) % ORDER.length;
    curType = ORDER[i]; cur = TYPES[curType]; applyTypeParams(); dirty = true;
    var b = document.getElementById('saber-type'); if (b) b.textContent = cur.name + ' ▸';
  }

  function setHint() {
    var m = document.getElementById('saber-main'); if (m) m.style.opacity = on ? '0' : '1'; // F3: keep #saber-sub reminder visible
  }

  /* the ignite gesture: unlock audio, ask motion permission (F4/F7), ignite */
  function igniteFlow() {
    ensureAudio(); nudgeSession(); acquireWake();
    if (!motionAsked && !motionOK) {                  // F7: only latch on a definitive grant
      requestMotion().then(function (ok) {
        motionOK = ok;
        if (ok) { motionAsked = true; if (!motionAttached) { window.addEventListener('devicemotion', onMotion); motionAttached = true; } }
        else { var sub = document.getElementById('saber-sub'); if (sub) sub.textContent = 'TAP AGAIN TO ENABLE MOTION'; }
      });
    } else if (motionOK && !motionAttached) {          // F4: re-attach cleanly after a close
      window.addEventListener('devicemotion', onMotion); motionAttached = true;
    }
    ignite(); setHint();
  }

  /* one-tap calibration to this phone + grip (E7) */
  function calibrate() {
    ensureAudio();
    if (motionOK && !motionAttached) { window.addEventListener('devicemotion', onMotion); motionAttached = true; }
    var sub = document.getElementById('saber-sub'); if (sub) sub.textContent = 'CALIBRATING — ONE HARD SWING…';
    var pkS = 0, pkA = 0, t0 = performance.now();
    (function sample() {
      pkS = Math.max(pkS, dbg.swing); pkA = Math.max(pkA, dbg.amag);
      if (performance.now() - t0 < 2500) requestAnimationFrame(sample);
      else {
        if (pkS > 50) { swingScale = Math.max(120, pkS * 0.8); saveNum('saber.swingScale', swingScale); }
        if (pkA > 8) { CLASH_ACC = Math.max(8, pkA * 0.55); saveNum('saber.clashAcc', CLASH_ACC); }
        if (sub) sub.textContent = 'CALIBRATED ✓  ·  SILENT SWITCH OFF';
      }
    })();
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  function open() {
    buildOverlay();
    wrap.classList.remove('hidden');
    opened = true; dirty = true;
    ensureAudio();                                    // F9: front-load graph onto the launcher gesture
    acquireWake();                                    // F1
    resize();
    var b = document.getElementById('saber-type'); if (b) b.textContent = cur.name + ' ▸';
    setHint();
    lastT = 0; if (!raf) raf = requestAnimationFrame(draw);
  }

  function close() {
    powerOff();
    releaseWake();                                    // F1
    if (motionAttached) { window.removeEventListener('devicemotion', onMotion); motionAttached = false; } // F4
    smoothSwing = 0; swingInput = 0;
    if (wrap) wrap.classList.add('hidden');
    opened = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (silentEl) { try { silentEl.pause(); } catch (e) {} }
    setTimeout(function () { if (!opened && ctx && ctx.state === 'running') ctx.suspend(); }, 700);
  }

  /* drive the engine without a phone (preview/testing) */
  function simulate(swing, clashI) {
    if (!opened) open();
    if (!on) igniteFlow();
    swingInput = Math.max(swingInput, swing || 0); swingDir = swingDir || 1; dbg.src = 'sim';
    if (clashI) { lastClash = performance.now(); clash(clashI); }
  }

  window.Saber = {
    open: open, close: close, simulate: simulate, calibrate: calibrate,
    setClashThreshold: function (v) { CLASH_ACC = v; saveNum('saber.clashAcc', v); },
    setSwingScale: function (v) { swingScale = v; saveNum('saber.swingScale', v); },
    setDecelThreshold: function (v) { DECEL_THRESH = v; },
    setJerkThreshold: function (v) { JERK_THRESH = v; },
    _state: function () { return { on: on, opened: opened, motionOK: motionOK, motionAttached: motionAttached, type: curType, swing: smoothSwing, scale: swingScale, clashAcc: CLASH_ACC, ctx: ctx && ctx.state, wake: !!wakeLock }; }
  };

  /* ============================================================
     LAUNCHER  ·  iPhone only (E8: self-heal on hub re-render)
     ============================================================ */
  function injectLauncher() {
    if (!IS_IPHONE) return;
    var tools = document.querySelector('#hub .tools');
    if (!tools || document.getElementById('saberBtn')) return;
    var b = document.createElement('button');
    b.id = 'saberBtn'; b.type = 'button'; b.title = 'Lightsaber (motion)'; b.textContent = '⚔ SABER';
    b.style.cssText = 'color:' + GREEN + ';border-color:' + hexA(GREEN, 0.55) + ';text-shadow:0 0 6px ' + hexA(GREEN, 0.6);
    b.addEventListener('click', open);
    var logout = tools.querySelector('.logout');
    tools.insertBefore(b, logout || null);
  }
  if (document.readyState !== 'loading') injectLauncher();
  else document.addEventListener('DOMContentLoaded', injectLauncher);
  document.addEventListener('hub:ready', injectLauncher);   // E8: re-inject after any header rebuild
})();
