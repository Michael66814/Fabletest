/* Kurvenfieber – Fahrphysik, Computergegner und Rennablauf, ohne Browser-APIs.
   Dieselbe Datei benutzen das Spiel und der Test tools/race-test.js.

   Die Physik rechnet in festen Schritten (DT). Jedes Auto lebt in Streckenkoordinaten
   (s entlang der Strecke, d seitlich, psi = Winkel zur Streckenrichtung), siehe track.js. */
(function (RR) {
  'use strict';

  var T = RR.track;
  var DT = 1 / 120;

  var CAR = {
    length: 4.4,
    width: 2.0,
    wheelbase: 2.6,
    vmax: 64,          // m/s, gut 230 km/h
    accel: 13,         // Anfahrbeschleunigung
    brake: 24,
    reverse: 9,        // Höchsttempo rückwärts
    drag: 0.9,         // Rollwiderstand ohne Gas
    grip: 15,          // größte Querbeschleunigung in m/s²
    steerRate: 3.6,    // wie schnell das Lenkrad (Tastatur) einschlägt, pro Sekunde
    offroadVmax: 25,
    turboVmax: 76,
    turboAccel: 9,
    turboDrain: 0.26,  // Anteil pro Sekunde
    turboFill: 0.035
  };

  function createRace(opts) {
    var tr = opts.track;
    var race = {
      track: tr,
      laps: opts.laps || 3,
      cars: [],
      time: -opts.countdown,   // < 0: Countdown läuft
      phase: 'countdown',
      steps: 0,
      events: [],              // Geräusche usw. für die Oberfläche
      finishedCount: 0,
      playerIdx: -1
    };
    var n = opts.cars.length;
    for (var i = 0; i < n; i++) {
      var c = opts.cars[i];
      // Startaufstellung: zwei Reihen hinter der Linie, der Letzte startet ganz hinten
      var row = Math.floor(i / 2), side = i % 2 ? -1 : 1;
      var dist = -10 - row * 9 - (i % 2) * 4.5;
      var car = {
        idx: i,
        name: c.name,
        color: c.color,
        accent: c.accent,
        isPlayer: !!c.isPlayer,
        skill: c.skill || 1,
        bias: c.bias || 0,
        s: T.wrapS(tr, dist), d: side * tr.halfWidth * 0.42, psi: 0, v: 0,
        dist: dist,
        steer: 0, steerTarget: 0, throttle: 0, brake: 0, turboOn: false,
        turbo: 1,
        slip: 0, offroad: false, wrongWay: false,
        lap: 0, lapStart: 0, lastLap: 0, bestLap: 0, lapTimes: [],
        finished: false, finishTime: 0, place: i + 1,
        stuck: 0, resets: 0, hits: 0,
        wheelSpin: 0, yawRate: 0
      };
      race.cars.push(car);
      if (car.isPlayer) race.playerIdx = i;
    }
    order(race);
    return race;
  }

  // Lenkwinkel nimmt mit dem Tempo ab
  function steerAngle(v) { return 0.6 / (1 + Math.abs(v) / 16); }

  // ---- Fahrphysik --------------------------------------------------------
  function drive(race, car, dt) {
    var tr = race.track;
    var kap = T.sample(tr, tr.kappa, car.s);
    var slope = T.sample(tr, tr.slope, car.s);
    var absD = Math.abs(car.d);
    car.offroad = absD > tr.halfWidth + 0.4;

    // Lenkung nachführen (Tastatur schlägt nicht sofort voll ein)
    var rate = CAR.steerRate * (Math.abs(car.steerTarget) < Math.abs(car.steer) || car.steerTarget * car.steer < 0 ? 1.7 : 1);
    var ds = car.steerTarget - car.steer;
    car.steer += T.clamp(ds, -rate * dt, rate * dt);

    // Längsrichtung
    var turbo = car.turboOn && car.turbo > 0 && car.throttle > 0;
    if (turbo) car.turbo = Math.max(0, car.turbo - CAR.turboDrain * dt);
    else if (car.isPlayer) car.turbo = Math.min(1, car.turbo + CAR.turboFill * dt);
    var vmax = (turbo ? CAR.turboVmax : CAR.vmax) * (car.isPlayer ? 1 : (0.8 + 0.2 * car.skill) * (car.boost || 1));
    if (car.offroad) vmax = Math.min(vmax, CAR.offroadVmax);
    var a = 0;
    if (car.throttle > 0 && car.v >= -0.5) {
      var r = Math.max(0, car.v) / vmax;
      a += car.throttle * (CAR.accel * (1 - r * r) + (turbo ? CAR.turboAccel : 0));
      if (r > 1) a -= (r - 1) * 20;    // über Höchsttempo (z. B. beim Verlassen der Fahrbahn) bremsen
    }
    if (car.brake > 0) {
      if (car.v > 0.5) a -= car.brake * CAR.brake;
      else a -= car.brake * 6 * (car.v > -CAR.reverse ? 1 : 0);  // rückwärts
    }
    if (car.throttle > 0 && car.v < -0.5) a += CAR.brake * car.throttle;
    a -= Math.sign(car.v) * (CAR.drag + 0.00035 * car.v * car.v);
    if (car.offroad) a -= Math.sign(car.v) * 5;
    a -= slope * 9.81 * 0.6;
    var v0 = car.v;
    car.v += a * dt;
    if (v0 > 0 && car.v < 0 && car.brake <= 0) car.v = 0;
    if (v0 < 0 && car.v > 0 && car.throttle <= 0) car.v = 0;
    if (Math.abs(car.v) < 0.05 && car.throttle <= 0 && car.brake <= 0) car.v = 0;

    // Querrichtung: gewünschte Drehrate, begrenzt durch die Haftung
    var v = car.v;
    var omega = car.steer * v * steerAngle(v) / CAR.wheelbase;
    var grip = CAR.grip * (car.offroad ? 0.7 : 1);
    var lat = Math.abs(v * omega);
    car.slip = 0;
    if (lat > grip && Math.abs(v) > 1) {
      car.slip = Math.min(1, (lat - grip) / grip);
      omega = Math.sign(omega) * grip / Math.abs(v) * (1 + 0.12 * car.slip);   // leicht übersteuern
      car.v -= Math.sign(v) * car.slip * 7 * dt;                              // Reifen radieren
    }
    car.yawRate = omega;

    // Bewegung in Streckenkoordinaten
    var denom = Math.max(0.2, 1 - kap * car.d);
    var dsdt = car.v * Math.cos(car.psi) / denom;
    var dddt = car.v * Math.sin(car.psi);
    car.psi = T.wrapAngle(car.psi + (omega - kap * dsdt) * dt);
    car.s = T.wrapS(tr, car.s + dsdt * dt);
    car.dist += dsdt * dt;
    car.d += dddt * dt;
    car.wheelSpin += car.v * dt / 0.34;

    // Leitplanke
    var lim = tr.wall - CAR.width / 2 - 0.2;
    if (Math.abs(car.d) > lim) {
      var side = Math.sign(car.d);
      car.d = side * lim;
      var into = Math.sin(car.psi) * side * Math.sign(car.v || 1);   // > 0: Richtung Planke
      if (into > 0) {
        var impact = Math.abs(car.v) * into;
        car.v *= 1 - Math.min(0.75, 0.25 + into * 0.9);
        car.psi -= side * Math.sign(car.v || 1) * into * 0.9;   // abprallen, längs zur Planke drehen
        if (impact > 3) race.events.push({ type: 'wall', car: car.idx, power: Math.min(1, impact / 25) });
        car.hits++;
      }
    }
    car.wrongWay = Math.cos(car.psi) < -0.2 && Math.abs(car.v) > 2;
  }

  // ---- Computergegner ----------------------------------------------------
  function think(race, car) {
    var tr = race.track;
    var v = Math.max(car.v, 0);
    var grip = CAR.grip * car.skill * car.skill;
    var brake = CAR.brake * 0.7 * car.skill;

    // Zieltempo: jede Kurve voraus rechtzeitig anbremsen
    var range = v * v / (2 * brake) + 30;
    var vt = CAR.vmax * 2;
    for (var x = 0; x <= range; x += 4) {
      var vc = T.sample(tr, tr.cornerSpeed, car.s + x) * Math.sqrt(grip);
      vt = Math.min(vt, Math.sqrt(vc * vc + 2 * brake * Math.max(0, x - v * 0.15)));
    }

    // Ziel-Spur: Ideallinie plus eigene Vorliebe, Ausweichen vor Autos voraus
    var look = Math.max(10, v * 0.6);
    var dT = T.sample(tr, tr.racingLine, car.s + look) + car.bias;
    var hw = tr.halfWidth - 1.3;
    for (var i = 0; i < race.cars.length; i++) {
      var o = race.cars[i];
      if (o === car) continue;
      var gap = o.dist - car.dist;
      if (gap <= 0 || gap > 28) continue;
      var dd = o.d - dT;
      if (Math.abs(dd) < 2.7) {
        // an der Seite mit mehr Platz vorbei
        var left = o.d + 2.9, right = o.d - 2.9;
        var canL = left <= hw, canR = right >= -hw;
        if (canL && (!canR || Math.abs(left - car.d) <= Math.abs(right - car.d))) dT = left;
        else if (canR) dT = right;
        // kein Platz oder schon dicht dran: nicht auffahren
        if (gap < 10 && Math.abs(o.d - car.d) < 2.3) vt = Math.min(vt, o.v - 0.5 + gap * 0.3);
      }
    }
    dT = T.clamp(dT, -hw, hw);

    // Lenken: Zielpunkt voraus anpeilen
    var kap = T.sample(tr, tr.kappa, car.s + 2);
    var psiDes = Math.atan2(dT - car.d, look);
    var omegaDes = kap * v + 3.2 * (psiDes - car.psi) * Math.max(v, 4) / look * 2.2;
    var per = Math.max(v, 1) * steerAngle(v) / CAR.wheelbase;
    car.steerTarget = T.clamp(omegaDes / per, -1, 1);
    car.steer = car.steerTarget;   // Computer lenkt direkt

    // Gas und Bremse
    if (v < vt - 0.5) { car.throttle = 1; car.brake = 0; }
    else if (v > vt + 1.2) { car.throttle = 0; car.brake = T.clamp((v - vt) / 6, 0.15, 1); }
    else { car.throttle = 0.35; car.brake = 0; }

    // Gummiband: wer weit hinter dem Spieler liegt, bekommt etwas mehr Kraft
    car.boost = 1;
    if (race.playerIdx >= 0) {
      var p = race.cars[race.playerIdx];
      var behind = p.dist - car.dist;
      if (!p.finished) car.boost = 1 + T.clamp((behind - 60) / 400, -0.04, 0.05);
    }
  }

  // Festgefahrene Computerautos zurück auf die Strecke setzen
  function unstick(race, car, dt) {
    if (car.isPlayer || race.phase !== 'race' || car.finished) return;
    var bad = car.v < 3 || Math.cos(car.psi) < 0.3;
    car.stuck = bad ? car.stuck + dt : 0;
    if (car.stuck > 2.5) {
      car.stuck = 0;
      car.resets++;
      car.d = T.sample(race.track, race.track.racingLine, car.s);
      car.psi = 0;
      car.v = 8;
    }
  }

  // ---- Zusammenstöße zwischen Autos --------------------------------------
  function collide(race) {
    var cars = race.cars, L = CAR.length, W = CAR.width;
    for (var i = 0; i < cars.length; i++) {
      for (var j = i + 1; j < cars.length; j++) {
        var a = cars[i], b = cars[j];
        var dsx = b.dist - a.dist;
        // dist kann sich um ganze Runden unterscheiden
        var len = race.track.length;
        dsx -= Math.round(dsx / len) * len;
        var ddx = b.d - a.d;
        var ox = L - Math.abs(dsx), oy = W - Math.abs(ddx);
        if (ox <= 0 || oy <= 0) continue;
        if (ox < oy * 1.6) {
          // Auffahren: der Hintere schiebt, Tempo wird ausgetauscht
          var front = dsx > 0 ? b : a, back = dsx > 0 ? a : b;
          var push = ox / 2;
          front.dist += push; front.s = T.wrapS(race.track, front.s + push);
          back.dist -= push; back.s = T.wrapS(race.track, back.s - push);
          var rel = back.v - front.v;
          if (rel > 0) {
            back.v -= rel * 0.6;
            front.v += rel * 0.4;
            if (rel > 2) race.events.push({ type: 'bump', car: back.idx, other: front.idx, power: Math.min(1, rel / 15) });
          }
        } else {
          // seitlich: auseinanderdrücken, etwas Drehung
          var sgn = ddx > 0 ? 1 : -1, p = oy / 2 + 0.02;
          a.d -= sgn * p; b.d += sgn * p;
          a.psi -= sgn * 0.04; b.psi += sgn * 0.04;
          a.v *= 0.995; b.v *= 0.995;
          if (Math.abs(a.v - b.v) > 0 || Math.abs(a.v) > 5) race.events.push({ type: 'scrape', car: a.idx, other: b.idx, power: 0.3 });
        }
      }
    }
  }

  // ---- Runden und Platzierung --------------------------------------------
  function laps(race, car) {
    var L = race.track.length;
    var done = Math.floor(car.dist / L);   // abgeschlossene Runden
    if (car.finished) return;
    if (done > car.lap) {
      var lapTime = race.time - car.lapStart;
      car.lap = done;
      car.lapStart = race.time;
      car.lastLap = lapTime;
      car.lapTimes.push(lapTime);
      if (!car.bestLap || lapTime < car.bestLap) car.bestLap = lapTime;
      if (car.lap >= race.laps) {
        car.finished = true;
        car.finishTime = race.time;
        race.finishedCount++;
        race.events.push({ type: 'finish', car: car.idx, place: race.finishedCount });
      } else {
        race.events.push({ type: 'lap', car: car.idx, lap: car.lap + 1, time: lapTime });
      }
    }
  }

  function order(race) {
    var sorted = race.cars.slice().sort(function (a, b) {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.dist - a.dist;
    });
    for (var i = 0; i < sorted.length; i++) sorted[i].place = i + 1;
    race.standings = sorted;
  }

  // ---- ein Zeitschritt ---------------------------------------------------
  // input: { steer: -1…1 (links positiv), throttle: 0…1, brake: 0…1, turbo: bool }
  function step(race, input) {
    race.steps++;
    race.time += DT;
    if (race.phase === 'countdown') {
      if (race.time >= 0) { race.phase = 'race'; race.time = 0; race.events.push({ type: 'go' }); }
    }
    var running = race.phase !== 'countdown';
    for (var i = 0; i < race.cars.length; i++) {
      var car = race.cars[i];
      if (car.isPlayer && !car.finished) {
        car.steerTarget = input ? input.steer : 0;
        car.throttle = input ? input.throttle : 0;
        car.brake = input ? input.brake : 0;
        car.turboOn = !!(input && input.turbo);
      } else {
        think(race, car);
        car.turboOn = false;
        if (car.finished) { car.throttle = Math.min(car.throttle, 0.3); }
      }
      if (!running) { car.v = 0; continue; }   // Countdown: alle stehen
      drive(race, car, DT);
      unstick(race, car, DT);
    }
    collide(race);
    if (running) {
      for (i = 0; i < race.cars.length; i++) laps(race, race.cars[i]);
    }
    order(race);
    if (race.phase === 'race' && race.finishedCount === race.cars.length) race.phase = 'done';
  }

  RR.sim = {
    DT: DT,
    CAR: CAR,
    createRace: createRace,
    step: step,
    think: think
  };
})(globalThis.RR = globalThis.RR || {});
