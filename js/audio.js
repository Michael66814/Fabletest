/* Würfelflug – Ton: alle Geräusche und die Musik werden live im Browser erzeugt
   (Web Audio), es gibt keine Sound-Dateien. */
(function (WF) {
  'use strict';

  function midi(n) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  // Akkordfolge der Musik: 8 Takte in a-Moll
  var BARS = [
    { bass: 45, tones: [69, 72, 76] },   // Am
    { bass: 41, tones: [65, 69, 72] },   // F
    { bass: 48, tones: [64, 67, 72] },   // C
    { bass: 43, tones: [62, 67, 71] },   // G
    { bass: 45, tones: [69, 72, 76] },   // Am
    { bass: 41, tones: [65, 69, 72] },   // F
    { bass: 38, tones: [62, 65, 69] },   // Dm
    { bass: 40, tones: [64, 68, 71] }    // E
  ];
  var ARP_HIT = [1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0];
  var ARP_NOTE = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 2, 1, 3];
  var BASS_HIT = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  var BPM = 124;
  var MASTER = 1.3;          // Gesamtlautstärke

  function createAudio() {
    var ac = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
    var muted = false;
    var music = { on: false, next: 0, step: 0, arp: 0, tempo: 1 };

    function ensure() {
      if (ac) return true;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        ac = new AC();
        master = ac.createGain();
        master.gain.value = muted ? 0 : MASTER;
        var limiter = ac.createDynamicsCompressor();     // fängt laute Spitzen ab
        limiter.threshold.value = -9;
        limiter.ratio.value = 6;
        master.connect(limiter);
        limiter.connect(ac.destination);
        musicBus = ac.createGain();
        musicBus.gain.value = 0;
        musicBus.connect(master);
        sfxBus = ac.createGain();
        sfxBus.gain.value = 0.85;
        sfxBus.connect(master);
        var len = Math.floor(ac.sampleRate * 0.8);
        noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
        var data = noiseBuf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      } catch (e) {
        ac = null;
        return false;
      }
      return true;
    }

    // Browser erlauben Ton erst nach einem Klick oder Tastendruck
    function unlock() {
      if (!ensure()) return;
      if (ac.state === 'suspended') {
        var p = ac.resume();
        if (p && p.catch) p.catch(function () {});
      }
    }

    function envelope(g, t0, vol, attack, dur) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    }

    function tone(o) {
      var t0 = o.at || ac.currentTime;
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f0, t0);
      if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
      envelope(g, t0, o.vol, o.attack || 0.006, o.dur);
      osc.connect(g);
      g.connect(o.bus || sfxBus);
      osc.start(t0);
      osc.stop(t0 + o.dur + 0.03);
    }

    function noise(o) {
      var t0 = o.at || ac.currentTime;
      var src = ac.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      var f = ac.createBiquadFilter();
      f.type = o.type || 'bandpass';
      f.frequency.setValueAtTime(o.f0, t0);
      if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
      f.Q.value = o.q || 0.8;
      var g = ac.createGain();
      envelope(g, t0, o.vol, o.attack || 0.004, o.dur);
      src.connect(f);
      f.connect(g);
      g.connect(o.bus || sfxBus);
      src.start(t0, Math.random() * 0.4);
      src.stop(t0 + o.dur + 0.03);
    }

    function ready() {
      return ac && !muted && ac.state === 'running';
    }

    var sfx = {
      jump: function () {
        if (!ready()) return;
        tone({ type: 'triangle', f0: 330, f1: 560, dur: 0.11, vol: 0.2 });
      },
      flap: function () {
        if (!ready()) return;
        noise({ type: 'bandpass', f0: 800, f1: 1900, q: 0.9, dur: 0.09, vol: 0.14 });
        tone({ type: 'sine', f0: 250, f1: 400, dur: 0.08, vol: 0.1 });
      },
      land: function () {
        if (!ready()) return;
        tone({ type: 'sine', f0: 150, f1: 85, dur: 0.07, vol: 0.12 });
      },
      death: function () {
        if (!ready()) return;
        noise({ type: 'lowpass', f0: 2600, f1: 180, q: 0.5, dur: 0.4, vol: 0.5 });
        tone({ type: 'sawtooth', f0: 230, f1: 48, dur: 0.36, vol: 0.2 });
      },
      portal: function (mode) {
        if (!ready()) return;
        var notes = mode === 'plane' ? [76, 83, 88] : [88, 83, 76];
        var t = ac.currentTime;
        for (var i = 0; i < notes.length; i++) {
          tone({ type: 'triangle', f0: midi(notes[i]), dur: 0.26, vol: 0.17, at: t + i * 0.07 });
        }
        noise({ type: 'bandpass', f0: 1200, f1: 4200, q: 1.2, dur: 0.3, vol: 0.08 });
      },
      speed: function (faster) {
        if (!ready()) return;
        if (faster) {
          noise({ type: 'bandpass', f0: 500, f1: 3400, q: 1.1, dur: 0.32, vol: 0.2 });
          tone({ type: 'sine', f0: 320, f1: 900, dur: 0.24, vol: 0.09 });
        } else {
          noise({ type: 'bandpass', f0: 3200, f1: 450, q: 1.1, dur: 0.34, vol: 0.2 });
          tone({ type: 'sine', f0: 820, f1: 300, dur: 0.26, vol: 0.09 });
        }
      },
      pickup: function () {
        if (!ready()) return;
        var t = ac.currentTime;
        tone({ type: 'triangle', f0: midi(79), dur: 0.12, vol: 0.16, at: t });
        tone({ type: 'triangle', f0: midi(86), dur: 0.2, vol: 0.16, at: t + 0.06 });
      },
      flip: function (up) {
        if (!ready()) return;
        tone({ type: 'sine', f0: up ? 260 : 620, f1: up ? 620 : 260, dur: 0.16, vol: 0.14 });
      },
      shield: function () {
        if (!ready()) return;
        noise({ type: 'highpass', f0: 2400, f1: 6000, q: 0.8, dur: 0.22, vol: 0.2 });
        tone({ type: 'triangle', f0: midi(84), f1: midi(72), dur: 0.25, vol: 0.14 });
      },
      checkpoint: function () {
        if (!ready()) return;
        var t = ac.currentTime;
        tone({ type: 'sine', f0: midi(81), dur: 0.16, vol: 0.13, at: t });
        tone({ type: 'sine', f0: midi(88), dur: 0.22, vol: 0.13, at: t + 0.08 });
      },
      finish: function () {
        if (!ready()) return;
        var notes = [72, 76, 79, 84, 88], t = ac.currentTime;
        for (var i = 0; i < notes.length; i++) {
          tone({ type: 'triangle', f0: midi(notes[i]), dur: 0.42, vol: 0.2, at: t + i * 0.09 });
        }
        tone({ type: 'sine', f0: midi(60), dur: 0.9, vol: 0.2, at: t + 0.36 });
      },
      click: function () {
        if (!ready()) return;
        tone({ type: 'sine', f0: 660, f1: 880, dur: 0.05, vol: 0.08 });
      }
    };

    // ---- Musik: kleiner Schritt-Sequenzer (16tel-Noten) ----
    function scheduleStep(step, t) {
      var bar = BARS[Math.floor(step / 16) % BARS.length];
      var s = step % 16;
      if (s % 4 === 0) {
        tone({ type: 'sine', f0: 150, f1: 46, dur: 0.17, vol: 0.5, at: t, bus: musicBus, attack: 0.003 });
      }
      if (s === 4 || s === 12) {
        noise({ type: 'bandpass', f0: 1900, q: 0.7, dur: 0.11, vol: 0.13, at: t, bus: musicBus });
      }
      if (s % 2 === 1 || s % 4 === 2) {
        noise({ type: 'highpass', f0: 7200, q: 0.7, dur: 0.035, vol: s % 4 === 2 ? 0.075 : 0.03, at: t, bus: musicBus });
      }
      if (BASS_HIT[s]) {
        tone({ type: 'triangle', f0: midi(bar.bass), dur: 0.2, vol: 0.34, at: t, bus: musicBus });
      }
      if (ARP_HIT[s]) {
        var idx = ARP_NOTE[music.arp++ % ARP_NOTE.length];
        var note = idx === 3 ? bar.tones[0] + 12 : bar.tones[idx];
        tone({ type: 'triangle', f0: midi(note), dur: 0.17, vol: 0.13, at: t, bus: musicBus });
      }
    }

    function update() {
      if (!ac || !music.on || ac.state !== 'running') return;
      var now = ac.currentTime;
      if (music.next < now - 0.1) music.next = now + 0.05;      // nach einer Pause nichts nachholen
      while (music.next < now + 0.18) {
        scheduleStep(music.step, music.next);
        music.step++;
        music.next += 60 / (BPM * music.tempo) / 4;
      }
    }

    var musicApi = {
      start: function () {
        if (!ensure()) return;
        if (!music.on) {
          music.on = true;
          music.step = 0;
          music.arp = 0;
          music.next = ac.currentTime + 0.08;
        }
        musicBus.gain.setTargetAtTime(0.5, ac.currentTime, 0.05);
      },
      stop: function () {
        if (!ac) return;
        music.on = false;
        musicBus.gain.setTargetAtTime(0, ac.currentTime, 0.04);
      },
      setTempo: function (mul) {
        music.tempo = mul;
      }
    };

    return {
      unlock: unlock,
      update: update,
      sfx: sfx,
      music: musicApi,
      setMuted: function (m) {
        muted = !!m;
        if (ac) master.gain.setTargetAtTime(muted ? 0 : MASTER, ac.currentTime, 0.02);
      },
      isMuted: function () { return muted; }
    };
  }

  WF.createAudio = createAudio;
})(globalThis.WF = globalThis.WF || {});
