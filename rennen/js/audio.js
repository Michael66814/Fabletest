/* Kurvenfieber – Ton. Alles wird live erzeugt, es gibt keine Sound-Dateien.
   Motor: zwei Oszillatoren mit Tiefpass, Tonhöhe folgt Tempo und Gang.
   Quietschen: gefiltertes Rauschen. Dazu Countdown-Piepser und Rempler. */
(function (RR) {
  'use strict';

  var ctx = null, master = null, muted = false;
  var engine = null, skid = null, wind = null;

  function ensure() {
    if (ctx) return ctx;
    var AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx.destination);
    return ctx;
  }

  function noiseBuffer() {
    var len = ctx.sampleRate * 1.5, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function startLoops() {
    if (engine || !ensure()) return;
    var g = ctx.createGain(); g.gain.value = 0;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 3;
    var o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    var o2 = ctx.createOscillator(); o2.type = 'square';
    var o2g = ctx.createGain(); o2g.gain.value = 0.35;
    o1.connect(f); o2.connect(o2g); o2g.connect(f); f.connect(g); g.connect(master);
    o1.start(); o2.start();
    engine = { g: g, f: f, o1: o1, o2: o2 };

    var nb = noiseBuffer();
    var src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 4;
    var sg = ctx.createGain(); sg.gain.value = 0;
    src.connect(bp); bp.connect(sg); sg.connect(master); src.start();
    skid = { g: sg };

    var src2 = ctx.createBufferSource(); src2.buffer = nb; src2.loop = true;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    var wg = ctx.createGain(); wg.gain.value = 0;
    src2.connect(lp); lp.connect(wg); wg.connect(master); src2.start();
    wind = { g: wg, f: lp };
  }

  // Gänge: Tonhöhe steigt im Gang und fällt beim Schalten
  var GEARS = [0, 14, 26, 37, 48, 58, 80];
  function rpm(v) {
    v = Math.abs(v);
    for (var i = 1; i < GEARS.length; i++) {
      if (v < GEARS[i]) {
        var t = (v - GEARS[i - 1]) / (GEARS[i] - GEARS[i - 1]);
        return { gear: i, r: 0.32 + t * 0.62 };
      }
    }
    return { gear: GEARS.length - 1, r: 1 };
  }

  // jeden Frame: Zustand des Spielerautos
  function update(car, active) {
    if (!engine) return;
    var t = ctx.currentTime;
    if (!active || !car) {
      engine.g.gain.setTargetAtTime(0, t, 0.08);
      skid.g.gain.setTargetAtTime(0, t, 0.05);
      wind.g.gain.setTargetAtTime(0, t, 0.1);
      return;
    }
    var r = rpm(car.v);
    var base = 38 + r.r * 120 + r.gear * 6 + (car.turboOn && car.turbo > 0 ? 18 : 0);
    engine.o1.frequency.setTargetAtTime(base, t, 0.03);
    engine.o2.frequency.setTargetAtTime(base * 0.5, t, 0.03);
    engine.f.frequency.setTargetAtTime(500 + car.throttle * 1400 + r.r * 600, t, 0.05);
    engine.g.gain.setTargetAtTime(0.07 + car.throttle * 0.07, t, 0.05);
    var sl = car.slip > 0.05 && Math.abs(car.v) > 8 ? Math.min(0.16, car.slip * 0.3) : 0;
    if (car.brake > 0.5 && car.v > 15) sl = Math.max(sl, 0.05);
    skid.g.gain.setTargetAtTime(sl, t, 0.04);
    wind.g.gain.setTargetAtTime(Math.min(0.12, Math.abs(car.v) / 600) + (car.offroad && Math.abs(car.v) > 3 ? 0.12 : 0), t, 0.1);
    wind.f.frequency.setTargetAtTime(car.offroad ? 260 : 300 + Math.abs(car.v) * 12, t, 0.1);
  }

  function beep(freq, dur, type, vol) {
    if (!ensure() || muted) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function thump(power) {
    if (!ensure() || muted) return;
    var t = ctx.currentTime;
    var src = ctx.createBufferSource(); src.buffer = noiseBuffer();
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300 + power * 500;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.15 + power * 0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.3);
  }

  function fanfare() {
    [523, 659, 784, 1047].forEach(function (f, i) {
      setTimeout(function () { beep(f, 0.22, 'triangle', 0.14); }, i * 130);
    });
  }

  RR.audio = {
    unlock: function () { if (ensure() && ctx.state === 'suspended') ctx.resume(); startLoops(); },
    update: update,
    beep: beep,
    thump: thump,
    fanfare: fanfare,
    setMuted: function (m) { muted = m; if (master) master.gain.value = m ? 0 : 0.6; },
    isMuted: function () { return muted; },
    suspend: function () { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume: function () { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  };
})(globalThis.RR = globalThis.RR || {});
