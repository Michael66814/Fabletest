/* Kurvenfieber – Spielablauf: Menü, Eingabe, Rennen, Anzeige, Ergebnis. */
(function (RR) {
  'use strict';

  var T = RR.track, S = RR.sim;
  var $ = function (id) { return document.getElementById(id); };
  var game = $('game'), canvas = $('stage');
  var STORE = 'kurvenfieber.v1';

  // ---- gespeicherte Einstellungen und Bestwerte --------------------------
  var save = load();
  function load() {
    var d = { track: 0, diff: 1, laps: 3, cam: 'chase', muted: false, records: {} };
    try {
      var raw = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (raw && typeof raw === 'object') Object.keys(d).forEach(function (k) { if (raw[k] !== undefined) d[k] = raw[k]; });
    } catch (e) { /* kein Speicher, egal */ }
    if (!(d.track >= 0 && d.track < RR.TRACKS.length)) d.track = 0;
    if (!(d.diff >= 0 && d.diff < RR.DIFFICULTY.length)) d.diff = 1;
    if ([2, 3, 5].indexOf(d.laps) < 0) d.laps = 3;
    return d;
  }
  function persist() { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch (e) { /* egal */ } }
  function record(trackId) { return save.records[trackId] || (save.records[trackId] = { bestLap: 0, wins: 0, races: 0, bestPlace: 0 }); }

  // ---- Formatierung ------------------------------------------------------
  function fmtTime(t, digits) {
    if (!(t > 0)) return '–';
    digits = digits === undefined ? 1 : digits;
    var m = Math.floor(t / 60), s = t - m * 60;
    var str = s.toFixed(digits);
    if (s < 10) str = '0' + str;
    return m + ':' + str.replace('.', ',');
  }
  function hex(c) { return '#' + ('000000' + c.toString(16)).slice(-6); }

  // ---- 3D --------------------------------------------------------------
  var R;
  try {
    R = new RR.Renderer(canvas);
  } catch (e) {
    $('noGl').hidden = false;
    $('menu').hidden = true;
    return;
  }
  var tracks = RR.TRACKS.map(function () { return null; });
  function getTrack(i) { return tracks[i] || (tracks[i] = T.build(RR.TRACKS[i])); }

  // ---- Zustand ----------------------------------------------------------
  var screen = 'menu';      // menu | race | pause | result
  var race = null, trackIdx = -1, attract = true;
  var acc = 0, lastT = 0;
  var finishWait = 0, resultShown = false;
  var input = { steer: 0, throttle: 0, brake: 0, turbo: false };
  var keys = {};
  var touchKeys = {};
  var lastCount = 4;

  function setScreen(s) {
    screen = s;
    game.dataset.screen = s;
    $('menu').hidden = s !== 'menu';
    $('hud').hidden = s === 'menu';
    $('pause').hidden = s !== 'pause';
    $('result').hidden = s !== 'result';
    $('touch').hidden = !(isTouch && (s === 'race'));
    if (s === 'pause') RR.audio.suspend(); else RR.audio.resume();
  }

  // ---- Rennen aufsetzen --------------------------------------------------
  function newRace(idx, opts) {
    var tr = getTrack(idx);
    if (idx !== trackIdx) { R.buildTrack(tr); trackIdx = idx; drawMinimapBase(tr); }
    var diff = RR.DIFFICULTY[save.diff];
    var spread = [0.985, 1.0, 0.97, 1.015, 0.99];
    var biases = [0.4, -0.5, 0.15, -0.2, 0.6];
    var cars = [];
    // Gegner in zufälliger Reihenfolge, der Spieler startet als Letzter
    var order = [1, 2, 3, 4, 5].sort(function () { return Math.random() - 0.5; });
    order.forEach(function (ci, k) {
      var c = RR.CARS[ci];
      cars.push({ name: c.name, color: c.color, accent: c.accent, skill: Math.min(1, diff.skill * spread[k]), bias: biases[k] });
    });
    var me = RR.CARS[0];
    if (opts.attract) {
      cars.push({ name: 'Sonne', color: me.color, accent: me.accent, skill: 0.95, bias: 0 });
    } else {
      cars.push({ name: me.name, color: me.color, accent: me.accent, isPlayer: true });
    }
    race = S.createRace({ track: tr, cars: cars, laps: opts.attract ? 999 : save.laps, countdown: opts.attract ? 0.01 : 3.6 });
    R.buildCars(race);
    attract = !!opts.attract;
    R.cam.init = false;
    finishWait = 0;
    resultShown = false;
    lastCount = 4;
    acc = 0;
    $('hudCount').textContent = race.cars.length;
    $('hudLaps').textContent = race.laps;
    $('pauseTrack').textContent = tr.name;
    $('banner').classList.remove('show');
    $('centerMsg').textContent = '';
    if (attract) {
      // ein paar Sekunden vorspulen, damit das Feld schon unterwegs ist
      for (var i = 0; i < 240 * 4; i++) S.step(race, null);
      race.events.length = 0;
    }
  }

  function startRace() {
    RR.audio.unlock();
    newRace(save.track, {});
    setScreen('race');
    canvas.focus();
  }

  function toMenu() {
    newRace(save.track, { attract: true });
    setScreen('menu');
    renderMenu();
  }

  // ---- Eingabe -----------------------------------------------------------
  var KEYMAP = {
    ArrowUp: 'gas', KeyW: 'gas',
    ArrowDown: 'brake', KeyS: 'brake',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'turbo', ShiftLeft: 'turbo', ShiftRight: 'turbo'
  };
  window.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    var k = KEYMAP[e.code];
    if (k && screen === 'race') { keys[k] = true; e.preventDefault(); RR.audio.unlock(); return; }
    if (e.repeat) return;
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (screen === 'race') { setScreen('pause'); $('btnResume').focus(); }
      else if (screen === 'pause') resume();
      else if (!$('help').hidden) closeHelp();
    } else if (e.code === 'KeyM') toggleSound();
    else if (e.code === 'KeyC' && (screen === 'race' || screen === 'pause')) toggleCam();
    else if (e.code === 'KeyR' && (screen === 'race' || screen === 'pause' || screen === 'result')) startRace();
    else if ((e.code === 'Enter') && screen === 'menu' && document.activeElement === document.body) startRace();
  });
  window.addEventListener('keyup', function (e) { var k = KEYMAP[e.code]; if (k) keys[k] = false; });
  window.addEventListener('blur', function () { keys = {}; touchKeys = {}; if (screen === 'race') setScreen('pause'); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && screen === 'race') setScreen('pause'); });

  var isTouch = false;
  window.addEventListener('touchstart', function () {
    if (!isTouch) { isTouch = true; game.classList.add('touching'); if (screen === 'race') $('touch').hidden = false; }
  }, { passive: true });
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) { isTouch = true; game.classList.add('touching'); }

  Array.prototype.forEach.call(document.querySelectorAll('.tbtn'), function (b) {
    var k = b.dataset.key;
    var startY = 0;
    var down = function (e) {
      e.preventDefault();
      touchKeys[k] = true; b.classList.add('down'); RR.audio.unlock();
      startY = e.clientY;
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    };
    var up = function () {
      touchKeys[k] = false; b.classList.remove('down');
      if (k === 'gas') { touchKeys.turbo = false; b.classList.remove('turbo'); }
    };
    // Gaspedal: Finger nach oben schieben schaltet den Turbo zu, zurückschieben wieder ab
    if (k === 'gas') {
      b.addEventListener('pointermove', function (e) {
        if (!touchKeys.gas) return;
        var lift = startY - e.clientY;
        var on = touchKeys.turbo ? lift > 18 : lift > 36;
        if (on !== !!touchKeys.turbo) { touchKeys.turbo = on; b.classList.toggle('turbo', on); }
      });
    }
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });

  function readInput() {
    var on = function (k) { return keys[k] || touchKeys[k]; };
    var steer = (on('left') ? 1 : 0) - (on('right') ? 1 : 0);
    var throttle = on('gas') ? 1 : 0, brake = on('brake') ? 1 : 0, turbo = !!on('turbo');
    // Gamepad
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; pads && i < pads.length; i++) {
      var p = pads[i];
      if (!p) continue;
      var ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.15) steer = -ax;
      if (p.buttons[7] && p.buttons[7].value > 0.05) throttle = Math.max(throttle, p.buttons[7].value);
      if (p.buttons[6] && p.buttons[6].value > 0.05) brake = Math.max(brake, p.buttons[6].value);
      if (p.buttons[0] && p.buttons[0].pressed) turbo = true;
      if (p.buttons[12] && p.buttons[12].pressed) throttle = 1;
      if (p.buttons[13] && p.buttons[13].pressed) brake = 1;
    }
    input.steer = steer; input.throttle = throttle; input.brake = brake; input.turbo = turbo;
    return input;
  }

  // ---- Hauptschleife -----------------------------------------------------
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
    lastT = now;
    if (!race) return;
    var running = screen === 'race' || screen === 'menu' || screen === 'result';
    if (running) {
      var inp = readInput();
      acc += dt;
      var n = 0;
      while (acc >= S.DT && n < 24) { S.step(race, attract ? null : inp); acc -= S.DT; n++; }
      if (n >= 24) acc = 0;
      handleEvents();
    }
    var focus = race.playerIdx >= 0 ? race.playerIdx : race.standings[0].idx;
    var me = race.cars[focus];
    var camMode = attract ? 'orbit' : (me.finished ? 'orbit' : save.cam);
    R.placeCars(race, running ? dt : 0);
    R.updateCamera(race, focus, running ? dt : 0, camMode);
    updateLights();
    R.render();
    if (!attract) {
      RR.audio.update(me, screen === 'race' && !me.finished);
      updateHud(me);
      if (me.finished && !resultShown) {
        finishWait += dt;
        if (finishWait > 2.5 && (race.phase === 'done' || finishWait > 14)) showResult();
      }
    } else {
      RR.audio.update(null, false);
    }
  }

  function updateLights() {
    if (attract) { R.setLights(-1); return; }
    if (race.phase === 'countdown') {
      var t = -race.time;   // Sekunden bis zum Start
      var lit = t > 3 ? 0 : t > 2 ? 1 : t > 1 ? 2 : 3;
      R.setLights(lit);
      var count = Math.ceil(t);
      if (count !== lastCount && count <= 3 && count >= 1) {
        lastCount = count;
        RR.audio.beep(440, 0.18, 'square', 0.12);
        showCenter(String(count));
      }
    } else {
      R.setLights(race.time < 4 ? -1 : 0);
    }
  }

  function showCenter(text) {
    var el = $('centerMsg');
    el.textContent = text;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }
  var bannerTimer = 0;
  function banner(text, ms) {
    var el = $('banner');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2200);
  }

  var lastThump = 0;
  function handleEvents() {
    var ev = race.events;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (attract) continue;
      var mine = e.car === race.playerIdx || e.other === race.playerIdx;
      if (e.type === 'go') { RR.audio.beep(880, 0.45, 'square', 0.14); showCenter('Los!'); }
      else if ((e.type === 'wall' || e.type === 'bump') && mine) {
        var now = performance.now();
        if (now - lastThump > 180) { RR.audio.thump(e.power); lastThump = now; }
      } else if (e.type === 'lap' && e.car === race.playerIdx) {
        var car = race.cars[race.playerIdx];
        var best = car.bestLap === e.time;
        banner((e.lap === race.laps ? 'Letzte Runde!  ' : 'Runde ' + e.lap + '  ') + fmtTime(e.time, 2) + (best && car.lapTimes.length > 1 ? '  · Bestzeit' : ''), 2600);
        RR.audio.beep(e.lap === race.laps ? 990 : 660, 0.15, 'triangle', 0.12);
      } else if (e.type === 'finish' && e.car === race.playerIdx) {
        showCenter(e.place === 1 ? 'Sieg!' : 'Platz ' + e.place);
        RR.audio.fanfare();
      }
    }
    ev.length = 0;
  }

  // ---- Anzeige -----------------------------------------------------------
  var hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }

  function updateHud(me) {
    setText('hudPlace', String(me.place));
    setText('hudLap', String(Math.min(race.laps, Math.max(1, me.lap + 1))));
    var t = race.phase === 'countdown' ? 0 : (me.finished ? me.finishTime : race.time);
    setText('hudTime', fmtTime(t));
    setText('hudBest', fmtTime(me.bestLap, 2));
    setText('hudSpeed', String(Math.round(Math.abs(me.v) * 3.6)));
    var fill = $('turboFill');
    fill.style.transform = 'scaleX(' + me.turbo.toFixed(3) + ')';
    fill.classList.toggle('on', !!(me.turboOn && me.turbo > 0 && me.throttle > 0));
    $('warn').hidden = !(me.wrongWay && race.phase === 'race' && !me.finished);
    updateStandings(me);
    drawMinimap();
  }

  var standingsKey = '';
  function updateStandings(me) {
    var list = race.standings, key = '';
    var L = race.track.length;
    var rows = list.map(function (c) {
      var gap = '';
      if (c !== me && !c.finished && !me.finished) {
        var dd = c.dist - me.dist;
        var sec = Math.abs(dd) / Math.max(15, Math.abs(me.v));
        gap = Math.abs(dd) > L ? (dd > 0 ? '+1 R' : '−1 R') : (dd > 0 ? '−' : '+') + sec.toFixed(1);
      } else if (c.finished) gap = '✓';
      key += c.idx + gap + '|';
      return '<li' + (c === me ? ' class="me"' : '') + '><span class="pos">' + c.place + '</span><span class="dot" style="background:' + hex(c.color) + '"></span><span>' + c.name + '</span><span class="gap">' + gap + '</span></li>';
    });
    if (key !== standingsKey) { standingsKey = key; $('standings').innerHTML = rows.join(''); }
  }

  // Minikarte: Strecke einmal vorzeichnen, Autos jeden Frame
  var mini = $('minimap'), miniCtx = mini.getContext('2d'), miniBase = null, miniMap = null;
  function drawMinimapBase(tr) {
    var b = T.bounds(tr);
    var size = mini.width, pad = 14;
    var sc = (size - 2 * pad) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    var ox = (size - (b.maxX - b.minX) * sc) / 2, oz = (size - (b.maxZ - b.minZ) * sc) / 2;
    // von oben gesehen: x nach rechts, z nach unten
    miniMap = function (x, z) { return [ox + (x - b.minX) * sc, oz + (z - b.minZ) * sc]; };
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    g.lineJoin = 'round';
    g.beginPath();
    for (var i = 0; i <= tr.count; i++) {
      var p = miniMap(tr.x[i % tr.count], tr.z[i % tr.count]);
      if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]);
    }
    g.strokeStyle = 'rgba(244,236,216,0.85)'; g.lineWidth = 6; g.stroke();
    g.strokeStyle = 'rgba(20,24,32,0.9)'; g.lineWidth = 3; g.stroke();
    var s0 = miniMap(tr.x[0], tr.z[0]);
    g.fillStyle = '#fff'; g.fillRect(s0[0] - 3, s0[1] - 3, 6, 6);
    miniBase = c;
  }
  function drawMinimap() {
    if (!miniBase) return;
    var g = miniCtx;
    g.clearRect(0, 0, mini.width, mini.height);
    g.drawImage(miniBase, 0, 0);
    var tmp = {};
    for (var i = race.cars.length - 1; i >= 0; i--) {
      var car = race.standings[i];
      var p = T.toWorld(race.track, car.s, car.d, tmp), q = miniMap(p.x, p.z);
      g.beginPath();
      g.arc(q[0], q[1], car.isPlayer ? 6 : 4.5, 0, Math.PI * 2);
      g.fillStyle = hex(car.color);
      g.fill();
      if (car.isPlayer) { g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke(); }
    }
  }

  // ---- Ergebnis ----------------------------------------------------------
  function showResult() {
    resultShown = true;
    var me = race.cars[race.playerIdx];
    var tr = race.track;
    // wer noch fährt, bekommt eine geschätzte Zeit
    var est = race.cars.map(function (c) {
      if (c.finished) return { car: c, time: c.finishTime, est: false };
      var left = race.laps * tr.length - c.dist;
      var avg = Math.max(10, c.dist / Math.max(1, race.time));
      return { car: c, time: race.time + left / avg, est: true };
    }).sort(function (a, b) { return a.time - b.time; });
    var place = est.findIndex(function (r) { return r.car === me; }) + 1;
    var rec = record(tr.def.id);
    var newBest = me.bestLap && (!rec.bestLap || me.bestLap < rec.bestLap);
    if (newBest) rec.bestLap = me.bestLap;
    rec.races++;
    if (place === 1) rec.wins++;
    if (!rec.bestPlace || place < rec.bestPlace) rec.bestPlace = place;
    persist();

    $('resultTrack').textContent = tr.name + ' · ' + RR.DIFFICULTY[save.diff].name + ' · ' + race.laps + ' Runden';
    $('resultTitle').textContent = place === 1 ? 'Sieg!' : place + '. Platz';
    var note = place === 1 ? 'Du hast alle fünf Gegner hinter dir gelassen.' :
      place <= 3 ? 'Auf dem Podest. ' : 'Da geht noch was. ';
    if (place > 1 && save.diff > 0 && place >= 5) note += 'Probier es mit leichteren Gegnern.';
    if (newBest) note += ' <b>Neue Bestrunde: ' + fmtTime(me.bestLap, 2) + '</b>';
    $('resultNote').innerHTML = note;
    var winner = est[0].time;
    $('resultRows').innerHTML = est.map(function (r, i) {
      var c = r.car;
      var time = i === 0 ? fmtTime(r.time, 2) : '+' + (r.time - winner).toFixed(2).replace('.', ',') + ' s';
      if (r.est) time = '≈ ' + time;
      return '<tr' + (c === me ? ' class="me"' : '') + '><td>' + (i + 1) + '</td><td><span class="dot" style="background:' + hex(c.color) + '"></span>' + c.name + '</td><td>' + time + '</td><td>' + fmtTime(c.bestLap, 2) + '</td></tr>';
    }).join('');
    setScreen('result');
    $('btnAgain').focus();
  }

  // ---- Menü --------------------------------------------------------------
  function trackIcon(def) {
    var tr = getTrack(RR.TRACKS.indexOf(def));
    var b = T.bounds(tr), sc = 44 / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    var ox = (54 - (b.maxX - b.minX) * sc) / 2, oz = (54 - (b.maxZ - b.minZ) * sc) / 2;
    var d = '';
    for (var i = 0; i < tr.count; i += 3) {
      d += (i ? 'L' : 'M') + (ox + (tr.x[i] - b.minX) * sc).toFixed(1) + ' ' + (oz + (tr.z[i] - b.minZ) * sc).toFixed(1);
    }
    var s0 = [ox + (tr.x[0] - b.minX) * sc, oz + (tr.z[0] - b.minZ) * sc];
    return '<svg viewBox="0 0 54 54" aria-hidden="true"><path d="' + d + 'Z" fill="none" stroke="#f4ecd8" stroke-width="3" stroke-linejoin="round"/><circle cx="' + s0[0].toFixed(1) + '" cy="' + s0[1].toFixed(1) + '" r="3.2" fill="#ffb02e"/></svg>';
  }

  function renderMenu() {
    $('tracks').innerHTML = RR.TRACKS.map(function (def, i) {
      var rec = save.records[def.id];
      var recText = rec && rec.bestLap ? 'Bestrunde ' + fmtTime(rec.bestLap, 2) + (rec.wins ? ' · ' + rec.wins + (rec.wins === 1 ? ' Sieg' : ' Siege') : '') : '';
      return '<button class="track-card" type="button" role="radio" aria-checked="' + (i === save.track) + '" data-i="' + i + '">' +
        trackIcon(def) +
        '<span><span class="track-name">' + def.name + '</span><span class="track-info">' + def.blurb + ' ' + (getTrack(i).length / 1000).toFixed(1).replace('.', ',') + ' km</span>' +
        (recText ? '<span class="track-rec">' + recText + '</span>' : '') + '</span>' +
        '<span class="track-level">' + def.level + '</span></button>';
    }).join('');
    $('tracks').setAttribute('role', 'radiogroup');
    $('diffs').setAttribute('role', 'radiogroup');
    $('lapsSeg').setAttribute('role', 'radiogroup');
    $('diffs').innerHTML = RR.DIFFICULTY.map(function (d, i) {
      return '<button type="button" role="radio" aria-checked="' + (i === save.diff) + '" data-i="' + i + '">' + d.name + '</button>';
    }).join('');
    $('lapsSeg').innerHTML = [2, 3, 5].map(function (n) {
      return '<button type="button" role="radio" aria-checked="' + (n === save.laps) + '" data-n="' + n + '">' + n + ' Runden</button>';
    }).join('');
  }

  $('tracks').addEventListener('click', function (e) {
    var b = e.target.closest('[data-i]'); if (!b) return;
    var i = +b.dataset.i;
    if (i === save.track) return;
    save.track = i; persist(); renderMenu();
    newRace(i, { attract: true });
    var nb = $('tracks').querySelector('[data-i="' + i + '"]'); if (nb) nb.focus();
  });
  $('diffs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-i]'); if (!b) return;
    save.diff = +b.dataset.i; persist(); renderMenu();
    var nb = $('diffs').querySelector('[data-i="' + save.diff + '"]'); if (nb) nb.focus();
  });
  $('lapsSeg').addEventListener('click', function (e) {
    var b = e.target.closest('[data-n]'); if (!b) return;
    save.laps = +b.dataset.n; persist(); renderMenu();
    var nb = $('lapsSeg').querySelector('[data-n="' + save.laps + '"]'); if (nb) nb.focus();
  });

  $('btnStart').addEventListener('click', startRace);
  $('btnHelp').addEventListener('click', function () { $('help').hidden = false; $('btnHelpClose').focus(); });
  function closeHelp() { $('help').hidden = true; $('btnHelp').focus(); }
  $('btnHelpClose').addEventListener('click', closeHelp);
  $('btnPause').addEventListener('click', function () { if (screen === 'race') { setScreen('pause'); $('btnResume').focus(); } });
  function resume() { setScreen('race'); lastT = 0; canvas.focus(); }
  $('btnResume').addEventListener('click', resume);
  $('btnRestart').addEventListener('click', startRace);
  $('btnQuit').addEventListener('click', toMenu);
  $('btnAgain').addEventListener('click', startRace);
  $('btnMenu').addEventListener('click', toMenu);
  $('btnNextTrack').addEventListener('click', function () {
    save.track = (save.track + 1) % RR.TRACKS.length; persist(); startRace();
  });

  function toggleSound() {
    save.muted = !save.muted; persist();
    RR.audio.setMuted(save.muted);
    $('btnSound').setAttribute('aria-pressed', String(save.muted));
  }
  $('btnSound').addEventListener('click', toggleSound);
  function toggleCam() {
    save.cam = save.cam === 'chase' ? 'hood' : 'chase'; persist();
    banner(save.cam === 'chase' ? 'Kamera: hinter dem Auto' : 'Kamera: Motorhaube', 1200);
  }
  $('btnCam').addEventListener('click', toggleCam);
  RR.audio.setMuted(save.muted);
  $('btnSound').setAttribute('aria-pressed', String(save.muted));

  // ---- Größe -------------------------------------------------------------
  function resize() {
    var w = game.clientWidth, h = game.clientHeight;
    R.quality = Math.min(w, h) < 500 ? 0 : 1;
    R.resize(w, h, window.devicePixelRatio || 1);
  }
  window.addEventListener('resize', resize);

  // ---- Test-Zugang (tools/smoke-test-rennen.js) --------------------------
  RR.debug = {
    state: function () {
      var me = race && race.playerIdx >= 0 ? race.cars[race.playerIdx] : null;
      return {
        screen: screen, phase: race && race.phase, time: race && race.time, attract: attract,
        track: race && race.track.name,
        me: me && { s: me.s, d: me.d, v: me.v, lap: me.lap, place: me.place, dist: me.dist, finished: me.finished, offroad: me.offroad, turboOn: me.turboOn, turbo: me.turbo },
        leader: race && race.standings[0].name
      };
    },
    // Rennen sofort fast beenden: Spieler kurz vor der Ziellinie der letzten Runde
    nearFinish: function () {
      var me = race.cars[race.playerIdx];
      var L = race.track.length;
      me.dist = race.laps * L - 30; me.lap = race.laps - 1; me.s = T.wrapS(race.track, me.dist); me.v = 40;
    },
    // Spielerauto vom Computer fahren lassen und die Zeit vorspulen
    advance: function (sec) {
      var me = race.cars[race.playerIdx];
      for (var i = 0; i < sec / S.DT; i++) {
        if (me && !me.finished && race.phase !== 'countdown') S.think(race, me);
        S.step(race, me ? { steer: me.steerTarget, throttle: me.throttle, brake: me.brake, turbo: false } : null);
      }
      handleEvents();
      return this.state();
    },
    calls: function () { return R.gl.info.render.calls; },
    renderer: function () { return R; }
  };

  resize();
  renderMenu();
  newRace(save.track, { attract: true });
  setScreen('menu');
  requestAnimationFrame(frame);
})(globalThis.RR = globalThis.RR || {});
