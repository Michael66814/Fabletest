/* Würfelflug – Spielablauf: Eingabe, Zustände (Menü, Spiel, Pause, Ziel),
   Effekte und die Verbindung zur Oberfläche. */
(function (WF) {
  'use strict';

  var C = WF.CFG;
  var sim = WF.sim;
  var STORE_KEY = 'wuerfelflug.v1';
  var DIFFICULTY = ['', 'Leicht', 'Mittel', 'Schwer'];
  var MUSIC_TEMPO = [0.9, 1, 1.1, 1.2];
  var SPEED_FX = [0, 0, 0.6, 1];

  var IVORY = WF.draw.IVORY;

  function $(id) { return document.getElementById(id); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function start(hot) {
    var root = $('game');
    var canvas = $('stage');
    var renderer = WF.createRenderer(canvas);
    var audio = WF.createAudio();
    var V = renderer.view;
    var levels = WF.LEVEL_DEFS.map(function (def) { return WF.buildLevel(def); });
    var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var el = {
      hud: $('hud'), hudTry: $('hudTry'), hudTag: $('hudTag'), hudFill: $('hudFill'),
      hudPct: $('hudPct'), hudProgress: $('hudProgress'),
      btnSound: $('btnSound'), btnPause: $('btnPause'), btnTakeover: $('btnTakeover'),
      toast: $('toast'), menu: $('menu'), levels: $('levels'), optPractice: $('optPractice'),
      pause: $('pause'), pauseCard: $('pauseCard'), pauseLevel: $('pauseLevel'),
      complete: $('complete'), completeCard: $('completeCard'), completeLevel: $('completeLevel'),
      completeTitle: $('completeTitle'), completeNote: $('completeNote'),
      statTries: $('statTries'), statClicks: $('statClicks'), statTime: $('statTime'),
      btnNext: $('btnNext')
    };

    // ---------- Gespeicherte Einstellungen und Bestwerte ----------
    var store = { best: {}, muted: false, practice: false };
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (parsed.best && typeof parsed.best === 'object') store.best = parsed.best;
          store.muted = !!parsed.muted;
          store.practice = !!parsed.practice;
        }
      }
    } catch (e) { /* ohne Speicher läuft das Spiel trotzdem */ }
    if (hot && typeof hot === 'object') {
      if (typeof hot.muted === 'boolean') store.muted = hot.muted;
      if (typeof hot.practice === 'boolean') store.practice = hot.practice;
    }
    function saveStore() {
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* egal */ }
    }
    function saveBest(level, value) {
      var v = Math.floor(value);
      if (!(store.best[level.id] >= v)) {
        store.best[level.id] = v;
        saveStore();
      }
    }

    // ---------- Spielzustand ----------
    var G = {
      level: levels[0], levelIdx: 0,
      s: sim.createState(),
      rx: 0, ry: 0.5, rrot: 0, rmode: 'cube', camX: 0,
      showPlayer: true, practice: false, demo: true, cpIndex: -1,
      fx: {
        particles: [], trail: [], lines: [],
        shake: 0, flash: 0, flashColor: [255, 255, 255],
        modeBlend: 0, speedFx: 0, face: 1
      }
    };
    var screen = 'menu';          // menu | play | pause | complete
    var phase = 'run';            // run | dead | ready | finish
    var phaseT = 0;
    var acc = 0, lastT = 0;
    var attempts = 1;
    var prev = { x: 0, y: 0.5, rot: 0 };
    var events = [];
    var demoSet = null;
    var cpState = null, cpNext = 0, cpWaiting = -1;
    var camFreeze = 0;
    var lastSpeedIdx = C.START_SPEED;
    var finishStep = 0, finishJumps = 0;
    var attractIdx = 0;
    var input = { held: false, pressed: false };
    var debug = { autopilot: false, timeScale: 1 };     // nur für automatische Tests
    var shownPct = -1, shownTry = '';
    var toastTimer = 0;

    for (var li = 0; li < 16; li++) {
      G.fx.lines.push({ x: Math.random(), y: Math.random(), len: rand(1.2, 3.6), a: rand(0.1, 0.32), v: rand(1.3, 2.5) });
    }

    function demoFor(level) {
      var d = WF.DEMOS && WF.DEMOS[level.id];
      if (!d) return null;
      var set = new Set(), t = 0;
      for (var i = 0; i < d.length; i++) {
        t += d[i];
        set.add(t);
      }
      return set;
    }

    function pct() {
      return Math.max(0, Math.min(100, 100 * G.s.x / G.level.finishX));
    }

    // ---------- Effekte ----------
    function spawn(p) {
      if (G.fx.particles.length < 420) G.fx.particles.push(p);
    }
    function puff(x, y, n, color, power) {
      for (var i = 0; i < n; i++) {
        var life = rand(0.22, 0.42);
        spawn({
          x: x + rand(-0.3, 0.3), y: y + rand(0, 0.12),
          vx: rand(-2.6, 0.6) * power, vy: rand(0.4, 2.4) * power, g: 6,
          life: life, max: life, size: rand(0.1, 0.2), color: color, alpha: 0.75,
          round: true, fade: true, shrink: true, rot: 0, vr: 0, aspect: 1
        });
      }
    }
    function burst(x, y, n, color, power, round) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2, v = rand(2, 9) * power, life = rand(0.35, 0.8);
        spawn({
          x: x, y: y, vx: Math.cos(a) * v + 2.5, vy: Math.sin(a) * v + 2, g: 22,
          life: life, max: life, size: rand(0.12, 0.3), color: color, alpha: 1,
          round: !!round, fade: true, shrink: true, rot: rand(0, 6), vr: rand(-12, 12), aspect: 1
        });
      }
    }
    function confetti() {
      var colors = WF.draw.CONFETTI;
      for (var i = 0; i < 110; i++) {
        var life = rand(1.6, 3.2);
        spawn({
          x: G.level.finishX + rand(-3, 15), y: rand(5, 13),
          vx: rand(-1.5, 1.5), vy: rand(-5, 1), g: 3.5,
          life: life, max: life, size: rand(0.16, 0.3), color: colors[i % colors.length], alpha: 1,
          round: false, fade: true, shrink: false, rot: rand(0, 6), vr: rand(-9, 9), aspect: 0.5
        });
      }
    }
    function flash(color, strength) {
      if (reduceMotion) return;
      G.fx.flashColor = color;
      G.fx.flash = strength;
    }
    function toast(text, cssColor) {
      if (screen !== 'play') return;
      el.toast.textContent = text;
      el.toast.style.setProperty('--toast-color', cssColor);
      el.toast.classList.remove('show');
      void el.toast.offsetWidth;                 // Animation neu starten
      el.toast.classList.add('show');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(function () { el.toast.classList.remove('show'); }, 2200);
    }
    function sfx(name, arg) {
      if (screen === 'play') audio.sfx[name](arg);
    }
    function cssRgb(c) {
      return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    }

    // ---------- Ereignisse aus der Simulation ----------
    function handleEvents() {
      for (var i = 0; i < events.length; i++) {
        var e = events[i], p = e.data, col;
        switch (e.type) {
          case 'jump':
            puff(e.x, e.y - C.CUBE.hh, 5, IVORY, 1);
            sfx('jump');
            break;
          case 'flap':
            puff(e.x - 0.5, e.y - 0.25, 3, IVORY, 0.8);
            sfx('flap');
            break;
          case 'land':
            if (G.s.mode === 'cube') {
              G.fx.face = G.fx.face % 6 + 1;            // gelandet = neu gewürfelt
              puff(e.x, e.y - C.CUBE.hh, 4, IVORY, 0.7);
              sfx('land');
            }
            break;
          case 'mode':
            col = WF.draw.PORTAL_RGB[p.mode];
            burst(e.x, e.y, 16, cssRgb(col), 0.9, true);
            flash(col, 0.22);
            prev.rot = G.s.rot;
            G.fx.trail.length = 0;
            toast(p.mode === 'plane' ? 'Flugmodus: Jeder Klick gibt Auftrieb' : 'Würfelmodus: Springen nur vom Boden', cssRgb(col));
            sfx('portal', p.mode);
            break;
          case 'speed':
            col = WF.draw.SPEED_RGB[p.speed];
            flash(col, 0.14);
            toast('Tempo: ' + C.SPEED_NAMES[p.speed], cssRgb(col));
            sfx('speed', p.speed > lastSpeedIdx);
            lastSpeedIdx = p.speed;
            audio.music.setTempo(MUSIC_TEMPO[p.speed]);
            break;
        }
      }
      events.length = 0;
    }

    // ---------- Ein Durchlauf ----------
    function syncRender(a) {
      var s = G.s;
      G.rx = prev.x + (s.x - prev.x) * a;
      G.ry = prev.y + (s.y - prev.y) * a;
      G.rrot = prev.rot + (s.rot - prev.rot) * a;
      G.rmode = s.mode;
      if (phase === 'finish') G.camX = camFreeze;
      else G.camX = G.rx - (screen === 'menu' ? V.menuSX : V.playerSX) / V.u;
    }

    function resetRun(useCheckpoint) {
      if (useCheckpoint && cpState) {
        sim.copyState(cpState, G.s);
        cpNext = G.cpIndex + 1;
      } else {
        G.s = sim.createState();
        cpState = null;
        G.cpIndex = -1;
        cpNext = 0;
      }
      cpWaiting = -1;
      events.length = 0;
      G.s.events = events;
      prev.x = G.s.x; prev.y = G.s.y; prev.rot = G.s.rot;
      acc = 0;
      G.showPlayer = true;
      G.fx.trail.length = 0;
      lastSpeedIdx = G.s.speedIdx;
      input.pressed = false;
      audio.music.setTempo(MUSIC_TEMPO[G.s.speedIdx]);
      syncRender(0);
    }

    function trackCheckpoint() {
      var s = G.s, cps = G.level.checkpoints;
      if (cpNext < cps.length && s.x >= cps[cpNext].x) cpWaiting = cpNext++;
      // gespeichert wird erst in einem sicheren Moment (Würfel: am Boden)
      if (cpWaiting >= 0 && (s.mode === 'plane' || s.onGround)) {
        cpState = sim.copyState(s);
        G.cpIndex = cpWaiting;
        cpWaiting = -1;
        burst(cps[G.cpIndex].x, 1.3, 8, '#7ee8c0', 0.5, true);
        sfx('checkpoint');
      }
    }

    function trackTrail() {
      var s = G.s, trail = G.fx.trail;
      if (s.step % 5 !== 0) return;
      if (s.mode === 'plane') {
        trail.push({ x: s.x - 0.55, y: s.y });
        if (trail.length > 30) trail.shift();
      } else if (trail.length) {
        trail.shift();
      }
    }

    function onDeath() {
      var s = G.s;
      phase = 'dead';
      phaseT = 0.75;
      G.showPlayer = false;
      G.fx.trail.length = 0;
      burst(s.x, s.y, 16, IVORY, 1, false);
      burst(s.x, s.y, 6, WF.draw.PIP, 0.8, true);
      burst(s.x, s.y, 9, WF.draw.DANGER, 1.1, true);
      if (!reduceMotion) G.fx.shake = 0.45;
      flash([255, 120, 110], 0.26);
      sfx('death');
      if (!G.demo && !G.practice) saveBest(G.level, pct());
    }

    function respawn() {
      attempts++;
      var fromCheckpoint = G.practice && !!cpState;
      resetRun(fromCheckpoint);
      if (fromCheckpoint) {
        phase = 'ready';
        phaseT = 0.5;
      } else {
        phase = 'run';
      }
    }

    function onFinish() {
      phase = 'finish';
      phaseT = 1.7;
      camFreeze = G.camX;
      finishStep = G.s.step;
      finishJumps = G.s.jumps;
      confetti();
      flash([244, 236, 216], 0.2);
      sfx('finish');
      if (!G.demo && !G.practice) saveBest(G.level, 100);
    }

    function afterFinish() {
      if (screen === 'menu') {
        attractIdx = (attractIdx + 1) % levels.length;
        startAttract();
      } else if (G.demo) {
        showMenu();
      } else {
        showComplete();
      }
    }

    function stepOnce() {
      var s = G.s;
      prev.x = s.x; prev.y = s.y; prev.rot = s.rot;
      var press = false, hold = false;
      if (phase === 'run') {
        if (G.demo || debug.autopilot) {
          press = demoSet ? demoSet.has(s.step) : false;
        } else {
          press = input.pressed;
          hold = input.held;
          input.pressed = false;
        }
      }
      sim.step(G.level, s, press, hold);
      handleEvents();
      if (s.dead) {
        onDeath();
        return false;
      }
      if (phase === 'run') {
        trackTrail();
        if (G.practice) trackCheckpoint();
        if (s.done) onFinish();
      }
      return true;
    }

    function update(dt) {
      if (phase === 'run' || phase === 'finish') {
        acc += dt * debug.timeScale;
        var guard = 0;
        while (acc >= C.DT && guard++ < 48) {
          acc -= C.DT;
          if (!stepOnce()) {
            acc = 0;
            break;
          }
        }
        if (guard >= 48) acc = 0;
      }
      if (phase !== 'run') {
        phaseT -= dt * debug.timeScale;
        if (phaseT <= 0) {
          if (phase === 'dead') respawn();
          else if (phase === 'ready') phase = 'run';
          else if (phase === 'finish') afterFinish();
        }
      }
    }

    function updateFx(dt) {
      var fx = G.fx, s = G.s, i;
      fx.modeBlend += ((s.mode === 'plane' ? 1 : 0) - fx.modeBlend) * Math.min(1, dt * 4.5);
      var speedTarget = phase === 'dead' ? 0 : SPEED_FX[s.speedIdx];
      fx.speedFx += (speedTarget - fx.speedFx) * Math.min(1, dt * 4);
      fx.shake *= Math.exp(-dt * 9);
      fx.flash *= Math.exp(-dt * 6);

      var list = fx.particles, n = 0;
      for (i = 0; i < list.length; i++) {
        var p = list[i];
        p.life -= dt;
        if (p.life <= 0) continue;
        p.vy -= p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        list[n++] = p;
      }
      list.length = n;

      for (i = 0; i < fx.lines.length; i++) {
        var l = fx.lines[i];
        l.x -= dt * l.v;
        if (l.x < 0) {
          l.x += 1;
          l.y = Math.random();
        }
      }
    }

    function updateHud() {
      var value = pct();
      el.hudFill.style.transform = 'scaleX(' + (value / 100).toFixed(4) + ')';
      var whole = Math.floor(value);
      if (whole !== shownPct) {
        shownPct = whole;
        el.hudPct.textContent = whole + ' %';
        el.hudProgress.setAttribute('aria-valuenow', String(whole));
      }
      var label = G.demo ? 'Demo' : 'Versuch ' + attempts;
      if (label !== shownTry) {
        shownTry = label;
        el.hudTry.textContent = label;
      }
    }

    function frame(t) {
      window.requestAnimationFrame(frame);
      var dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
      lastT = t;
      renderer.resize();
      if (screen !== 'pause' && screen !== 'complete') update(dt);
      if (screen !== 'pause') updateFx(dt);
      syncRender(phase === 'run' || phase === 'finish' ? acc / C.DT : 1);
      if (phase === 'dead') G.showPlayer = false;
      else if (phase === 'ready') G.showPlayer = Math.floor(t / 80) % 2 === 0;
      else G.showPlayer = true;
      if (screen !== 'menu') updateHud();
      renderer.draw(G, t);
      audio.update();
    }

    // ---------- Bildschirme ----------
    function setScreen(name) {
      screen = name;
      root.setAttribute('data-screen', name);
      el.menu.hidden = name !== 'menu';
      el.hud.hidden = name === 'menu';
      el.pause.hidden = name !== 'pause';
      el.complete.hidden = name !== 'complete';
      el.btnPause.hidden = name === 'complete';
      if (name !== 'play') {
        el.toast.classList.remove('show');
        input.held = false;
        input.pressed = false;
      }
    }

    function startAttract() {
      G.level = levels[attractIdx];
      G.levelIdx = attractIdx;
      G.demo = true;
      G.practice = false;
      demoSet = demoFor(G.level);
      attempts = 1;
      phase = 'run';
      resetRun(false);
    }

    function showMenu() {
      audio.music.stop();
      renderLevelList();
      setScreen('menu');
      startAttract();
    }

    function startGame(idx, demo) {
      G.level = levels[idx];
      G.levelIdx = idx;
      G.demo = !!demo;
      G.practice = !demo && store.practice;
      demoSet = demoFor(G.level);
      attempts = 1;
      phase = 'run';
      G.fx.particles.length = 0;
      G.fx.face = 1;
      resetRun(false);
      setScreen('play');
      el.hudTag.hidden = !G.practice;
      el.btnTakeover.hidden = !G.demo;
      shownPct = -1;
      shownTry = '';
      audio.unlock();
      audio.music.start();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      // Wer zum ersten Mal spielt, bekommt die Steuerung kurz eingeblendet
      if (!G.demo && !(store.best[levels[0].id] > 0)) toast('Klicken, tippen oder Leertaste: springen', IVORY);
    }

    function restartLevel() {
      cpState = null;
      attempts++;
      phase = 'run';
      resetRun(false);
      setScreen('play');
      audio.music.start();
    }

    function pauseGame() {
      if (screen !== 'play') return;
      el.pauseLevel.textContent = levelLabel() + ' · ' + Math.floor(pct()) + ' %';
      setScreen('pause');
      audio.music.stop();
      el.pauseCard.focus({ preventScroll: true });
    }

    function resumeGame() {
      if (screen !== 'pause') return;
      setScreen('play');
      audio.music.start();
    }

    function levelLabel() {
      return 'Level ' + (G.levelIdx + 1) + ' · ' + G.level.name;
    }

    function showComplete() {
      el.completeLevel.textContent = levelLabel();
      el.statTries.textContent = String(attempts);
      el.statClicks.textContent = String(finishJumps);
      el.statTime.textContent = (finishStep / C.STEPS_PER_SECOND).toFixed(1).replace('.', ',') + ' s';
      el.completeNote.hidden = !G.practice;
      el.btnNext.hidden = G.levelIdx >= levels.length - 1;
      setScreen('complete');
      audio.music.stop();
      el.completeCard.focus({ preventScroll: true });
    }

    // ---------- Levelliste im Menü ----------
    // Würfelbild mit n Augen: Level 1 zeigt eine Eins, Level 2 eine Zwei …
    function dieSvg(n) {
      var out = '<svg class="level-die" viewBox="0 0 42 42" aria-hidden="true"><rect class="die-body" x="2" y="2" width="38" height="38" rx="9"/>';
      var pos = WF.draw.PIPS[Math.max(1, Math.min(6, n))];
      for (var i = 0; i < pos.length; i++) {
        out += '<circle class="die-pip" cx="' + (21 + pos[i][0] * 9.5) + '" cy="' + (21 + pos[i][1] * 9.5) + '" r="3.6"/>';
      }
      return out + '</svg>';
    }

    function levelMeta(level) {
      var best = store.best[level.id] || 0;
      var text = DIFFICULTY[level.difficulty] || '';
      if (best >= 100) return text + ' · Geschafft';
      if (best > 0) return text + ' · Bestwert ' + best + ' %';
      return text + ' · Noch nicht gespielt';
    }

    function renderLevelList() {
      if (!el.levels.children.length) {
        var html = '';
        for (var i = 0; i < levels.length; i++) {
          html += '<li class="level">' +
            '<button class="level-main" type="button" data-play="' + i + '">' + dieSvg(i + 1) +
            '<span class="level-text"><span class="level-name">' + levels[i].name + '</span>' +
            '<span class="level-meta" id="levelMeta' + i + '"></span></span>' +
            '<span class="level-go" aria-hidden="true">Spielen</span></button>' +
            (demoFor(levels[i]) ? '<button class="level-demo" type="button" data-demo="' + i + '" aria-label="Demo ansehen: ' + levels[i].name + '">Demo</button>' : '') +
            '</li>';
        }
        el.levels.innerHTML = html;
      }
      for (var k = 0; k < levels.length; k++) {
        $('levelMeta' + k).textContent = levelMeta(levels[k]);
      }
    }

    // ---------- Eingabe ----------
    function press() {
      input.held = true;
      input.pressed = true;
    }
    function release() {
      input.held = false;
    }

    canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      audio.unlock();
      if (screen === 'play' && !G.demo) {
        press();
        e.preventDefault();
      }
    });
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    function isJumpKey(e) {
      return e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW';
    }
    window.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isJumpKey(e)) {
        if (screen !== 'play') return;            // im Menü bedient die Taste die Schaltflächen
        e.preventDefault();
        audio.unlock();
        if (!e.repeat && !G.demo) press();
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        if (screen === 'play') pauseGame();
        else if (screen === 'pause') resumeGame();
      } else if (e.code === 'KeyM') {
        setMuted(!store.muted);
      } else if (e.code === 'KeyR') {
        if ((screen === 'play' || screen === 'pause') && !G.demo) restartLevel();
      }
    });
    window.addEventListener('keyup', function (e) {
      if (isJumpKey(e)) release();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && screen === 'play' && !G.demo) pauseGame();
    });

    function setMuted(m) {
      store.muted = !!m;
      audio.setMuted(store.muted);
      el.btnSound.setAttribute('aria-pressed', store.muted ? 'true' : 'false');
      el.btnSound.setAttribute('aria-label', store.muted ? 'Ton einschalten' : 'Ton stummschalten');
      saveStore();
    }

    function onClick(node, fn) {
      node.addEventListener('click', function (e) {
        audio.unlock();
        audio.sfx.click();
        fn(e);
        if (node.blur && screen === 'play') node.blur();     // Leertaste soll springen, nicht den Knopf drücken
      });
    }

    el.levels.addEventListener('click', function (e) {
      var target = e.target;
      while (target && target !== el.levels && !(target.dataset && (target.dataset.play || target.dataset.demo))) {
        target = target.parentNode;
      }
      if (!target || target === el.levels) return;
      audio.unlock();
      audio.sfx.click();
      if (target.dataset.play) startGame(+target.dataset.play, false);
      else startGame(+target.dataset.demo, true);
    });
    el.optPractice.addEventListener('change', function () {
      store.practice = el.optPractice.checked;
      saveStore();
    });
    onClick(el.btnSound, function () { setMuted(!store.muted); });
    onClick(el.btnPause, pauseGame);
    onClick(el.btnTakeover, function () { startGame(G.levelIdx, false); });
    onClick($('btnResume'), resumeGame);
    onClick($('btnRestart'), restartLevel);
    onClick($('btnQuit'), showMenu);
    onClick($('btnAgain'), function () { startGame(G.levelIdx, false); });
    onClick($('btnMenu'), showMenu);
    onClick(el.btnNext, function () { startGame(Math.min(levels.length - 1, G.levelIdx + 1), false); });

    // Offene Seiten übernehmen Einstellungen, wenn das Spiel aktualisiert wird
    var hotApi = window.claude && window.claude.hot;
    if (hotApi && typeof hotApi.snapshot === 'function') {
      try {
        hotApi.snapshot(function () { return { muted: store.muted, practice: store.practice }; });
      } catch (e) { /* nicht verfügbar */ }
    }

    // ---------- Los ----------
    el.optPractice.checked = store.practice;
    setMuted(store.muted);
    renderer.resize();
    showMenu();
    lastT = window.performance.now();
    window.requestAnimationFrame(frame);

    // Für automatische Tests (tools/smoke-test.js)
    WF.debug = {
      set: function (key, value) { debug[key] = value; },
      state: function () {
        return {
          screen: screen, phase: phase, level: G.level.id, demo: G.demo, practice: G.practice,
          x: G.s.x, y: G.s.y, mode: G.s.mode, speedIdx: G.s.speedIdx, dead: G.s.dead, done: G.s.done,
          pct: pct(), attempts: attempts, cpIndex: G.cpIndex, jumps: G.s.jumps,
          best: store.best, muted: store.muted
        };
      }
    };
  }

  function boot() {
    var hot = window.claude && window.claude.hot;
    if (hot && typeof hot.ready === 'function') hot.ready(start);
    else start((hot && hot.data) || {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(globalThis.WF = globalThis.WF || {});
