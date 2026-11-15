/* Würfelflug – Simulation (Physik + Kollision), komplett ohne Browser-APIs.
   Dieselbe Datei wird vom Spiel UND vom Prüf-Bot (tools/solve.js) benutzt.

   Spielmodi:
     cube   Würfel: springt vom Boden oder von einem Block ab
     plane  Papierflieger: jeder Klick gibt Auftrieb
     trick  Trickwürfel: 1 Klick springen, 2 Klicks Schwerkraft umdrehen,
            3 Klicks für kurze Zeit Papierflieger */
(function (WF) {
  'use strict';

  var C = WF.CFG;
  var HALF_PI = Math.PI / 2;
  var EPS = 1e-9;

  function createState() {
    return {
      x: 0, y: C.CUBE.hh, vy: 0,
      mode: 'cube',
      speedIdx: C.START_SPEED,
      onGround: true,
      coyote: 0,          // verbleibende Schritte, in denen noch abgesprungen werden darf
      buffer: 0,          // verbleibende Schritte, in denen ein früher Klick noch zählt
      rot: 0,             // Würfel: Drehwinkel, Flieger: Neigung
      portalIdx: 0,       // nächstes noch nicht durchflogenes Portal
      step: 0,
      jumps: 0,
      // Trickmodus
      grav: 1,            // 1 = Schwerkraft nach unten, -1 = nach oben
      chain: 0,           // Klicks der laufenden Klickfolge
      chainT: 0,          // verbleibende Schritte, in denen ein Klick die Folge fortsetzt
      fly: 0,             // verbleibende Schritte als Flieger (nach Dreifachklick)
      // Augments
      boost: 0,           // verbleibende Schritte mit höherer Sprungkraft
      dbl: 0,             // verbleibende Schritte mit Doppelsprung
      airJump: false,     // Doppelsprung in dieser Flugphase schon verbraucht
      shield: 0,          // 1 = Schild aktiv
      inv: 0,             // verbleibende Schritte Unverwundbarkeit nach einem Schild-Treffer
      taken: 0,           // Bitmaske der eingesammelten Augments
      dead: false,
      deathBy: '',
      done: false,
      inflate: 0,         // nur für den Bot: zusätzlicher Sicherheitsabstand zu Stacheln und Kanten
      events: null        // Array -> Ereignisse für Ton & Effekte, null -> keine
    };
  }

  function copyState(a, b) {
    b = b || {};
    b.x = a.x; b.y = a.y; b.vy = a.vy;
    b.mode = a.mode; b.speedIdx = a.speedIdx;
    b.onGround = a.onGround; b.coyote = a.coyote; b.buffer = a.buffer;
    b.rot = a.rot; b.portalIdx = a.portalIdx;
    b.step = a.step; b.jumps = a.jumps;
    b.grav = a.grav; b.chain = a.chain; b.chainT = a.chainT; b.fly = a.fly;
    b.boost = a.boost; b.dbl = a.dbl; b.airJump = a.airJump;
    b.shield = a.shield; b.inv = a.inv; b.taken = a.taken;
    b.dead = a.dead; b.deathBy = a.deathBy; b.done = a.done;
    b.inflate = a.inflate;
    b.events = null;
    return b;
  }

  function emit(s, type, data) {
    if (s.events) s.events.push({ type: type, data: data, x: s.x, y: s.y });
  }

  function kill(s, by) {
    s.dead = true;
    s.deathBy = by;
    emit(s, 'death', by);
  }

  function speedOf(s) {
    return C.BASE_SPEED * C.SPEEDS[s.speedIdx];
  }

  // Fliegt der Spieler gerade (Flug-Portal oder Dreifachklick im Trickmodus)?
  function isFlying(s) {
    return s.mode === 'plane' || s.fly > 0;
  }

  // ---- Geometrie: Dreieck gegen achsenparalleles Rechteck (Trennachsen-Test) ----
  function triHitsBox(p, l, b, r, t) {
    // p = [x0,y0,x1,y1,x2,y2]
    var minX = Math.min(p[0], p[2], p[4]), maxX = Math.max(p[0], p[2], p[4]);
    var minY = Math.min(p[1], p[3], p[5]), maxY = Math.max(p[1], p[3], p[5]);
    if (maxX <= l || minX >= r || maxY <= b || minY >= t) return false;
    for (var i = 0; i < 6; i += 2) {
      var j = (i + 2) % 6;
      var nx = p[j + 1] - p[i + 1];      // Normale der Kante
      var ny = p[i] - p[j];
      var t0 = nx * p[0] + ny * p[1], t1 = nx * p[2] + ny * p[3], t2 = nx * p[4] + ny * p[5];
      var tMin = Math.min(t0, t1, t2), tMax = Math.max(t0, t1, t2);
      var b0 = nx * l + ny * b, b1 = nx * r + ny * b, b2 = nx * l + ny * t, b3 = nx * r + ny * t;
      var bMin = Math.min(b0, b1, b2, b3), bMax = Math.max(b0, b1, b2, b3);
      if (bMax <= tMin || bMin >= tMax) return false;
    }
    return true;
  }

  function circleHitsBox(cx, cy, rad, l, b, r, t) {
    var dx = cx < l ? l - cx : (cx > r ? cx - r : 0);
    var dy = cy < b ? b - cy : (cy > t ? cy - t : 0);
    return dx * dx + dy * dy < rad * rad;
  }

  // Trifft die (um "inset" verkleinerte) Spielerbox an Position x,y eine Gefahr?
  function hazardAt(level, x, y, hw, hh, inset) {
    var l = x - hw + inset, r = x + hw - inset;
    var b = y - hh + inset, t = y + hh - inset;
    var x0 = Math.floor(l), x1 = Math.floor(r);
    for (var xi = x0; xi <= x1; xi++) {
      var list = level.hazards[xi];
      if (!list) continue;
      for (var i = 0; i < list.length; i++) {
        var h = list[i];
        if (h.shape === 'tri') {
          if (triHitsBox(h.pts, l, b, r, t)) return true;
        } else if (circleHitsBox(h.cx, h.cy, h.r, l, b, r, t)) {
          return true;
        }
      }
    }
    return false;
  }

  function collect(level, s, hw, hh) {
    var x0 = Math.floor(s.x - hw - 0.5), x1 = Math.floor(s.x + hw + 0.5);
    for (var xi = x0; xi <= x1; xi++) {
      var list = level.pickups[xi];
      if (!list) continue;
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (s.taken & p.bit) continue;
        if (!circleHitsBox(p.cx, p.cy, p.r, s.x - hw, s.y - hh, s.x + hw, s.y + hh)) continue;
        s.taken |= p.bit;
        if (p.kind === 'boost') s.boost = C.BOOST_STEPS;
        else if (p.kind === 'double') s.dbl = C.DOUBLE_STEPS;
        else s.shield = 1;
        emit(s, 'pickup', p);
      }
    }
  }

  /* Ein Physik-Schritt.
     press: Taste wurde in diesem Schritt neu gedrückt
     hold:  Taste ist (noch) gedrückt */
  function step(level, s, press, hold) {
    if (s.dead) return;

    var flying = isFlying(s);
    var dt = C.DT;
    var wasGround = s.onGround;
    s.step++;
    if (s.boost > 0) s.boost--;
    if (s.dbl > 0) s.dbl--;
    if (s.inv > 0) s.inv--;

    // ---- Eingabe ----
    if (flying) {
      if (press) {
        s.vy = C.PLANE.flapV;
        s.onGround = false;
        s.jumps++;
        emit(s, 'flap');
      }
    } else {
      if (s.mode === 'trick') {
        if (press) {
          s.chain = s.chainT > 0 ? s.chain + 1 : 1;
          s.chainT = C.CHAIN_STEPS;
          if (s.chain === 1) {
            s.buffer = C.BUFFER_STEPS;
          } else if (s.chain === 2) {
            // Doppelklick: Schwerkraft umdrehen
            s.grav = -s.grav;
            s.onGround = false;
            s.coyote = 0;
            s.buffer = 0;
            s.jumps++;
            emit(s, 'flip');
          } else {
            // Dreifachklick: für kurze Zeit Papierflieger
            s.fly = C.FLY_STEPS;
            s.grav = 1;
            s.chain = 0;
            s.chainT = 0;
            s.buffer = 0;
            s.coyote = 0;
            s.onGround = false;
            s.vy = C.PLANE.flapV;
            s.rot = 0;
            s.jumps++;
            flying = true;
            emit(s, 'fly');
          }
        } else {
          if (s.chainT > 0) s.chainT--;
          if (s.buffer > 0) s.buffer--;
        }
      } else if (press) {
        s.buffer = C.BUFFER_STEPS;
      } else if (s.buffer > 0) {
        s.buffer--;
      }

      if (!flying) {
        var jumpV = C.CUBE.jumpV * (s.boost > 0 ? C.BOOST_FACTOR : 1) * s.grav;
        if ((s.buffer > 0 || hold) && (s.onGround || s.coyote > 0)) {
          s.vy = jumpV;
          s.onGround = false;
          s.coyote = 0;
          s.buffer = 0;
          s.jumps++;
          emit(s, 'jump');
        } else if (press && s.mode === 'cube' && s.dbl > 0 && !s.airJump) {
          // Doppelsprung: ein zweiter Absprung mitten in der Luft
          s.vy = jumpV;
          s.airJump = true;
          s.buffer = 0;
          s.jumps++;
          emit(s, 'djump');
        }
      }
    }
    var groundBeforeMove = s.onGround;

    var P = flying ? C.PLANE : C.CUBE;
    var hw = P.hw, hh = P.hh;
    var g = flying ? 1 : s.grav;          // Richtung der Schwerkraft

    // ---- Bewegung ----
    s.vy -= P.g * dt * g;
    if (s.vy * g < -P.maxFall) s.vy = -P.maxFall * g;
    s.x += speedOf(s) * dt;
    s.y += s.vy * dt;

    // ---- Boden und obere Spielfeldgrenze ----
    var grounded = false;
    if (s.y - hh <= 0) {
      s.y = hh;
      if (s.vy < 0) s.vy = 0;
      if (g === 1) grounded = true;
    }
    if (s.y + hh >= C.ROWS) {
      s.y = C.ROWS - hh;
      if (s.vy > 0) s.vy = 0;
      if (g === -1) grounded = true;
    }

    // ---- Blöcke ----
    var landTol = C.LAND_TOL - s.inflate, bonkTol = C.BONK_TOL - s.inflate;
    var x0 = Math.floor(s.x - hw), x1 = Math.floor(s.x + hw - EPS);
    for (var xi = x0; xi <= x1; xi++) {
      var y0 = Math.floor(s.y - hh), y1 = Math.floor(s.y + hh - EPS);
      if (y0 < 0) y0 = 0;
      if (y1 >= C.ROWS) y1 = C.ROWS - 1;
      for (var yi = y0; yi <= y1; yi++) {
        if (!level.solidAt(xi, yi)) continue;
        var bottom = s.y - hh, top = s.y + hh;
        if (bottom >= yi + 1 || top <= yi) continue;      // nach einer Korrektur kein Kontakt mehr
        if (bottom >= yi + 1 - landTol && !level.solidAt(xi, yi + 1)) {
          // knapp über der Oberkante: aufsetzen (oder beim Aufsteigen einfach weiter)
          if (s.vy <= 0) {
            s.y = yi + 1 + hh;
            s.vy = 0;
            if (g === 1) grounded = true;
          }
        } else if (top <= yi + bonkTol && !level.solidAt(xi, yi - 1)) {
          // knapp unter der Unterkante: anstoßen – bei umgedrehter Schwerkraft ist das der "Boden"
          if (s.vy >= 0 && (s.vy > 0 || g === -1)) {
            s.y = yi - hh;
            s.vy = 0;
            if (g === -1) grounded = true;
          }
        } else {
          kill(s, 'block');
          return;
        }
      }
    }

    // ---- Stacheln und Sägen ----
    if (s.inv === 0 && hazardAt(level, s.x, s.y, hw, hh, C.HAZ_INSET - s.inflate)) {
      if (s.shield > 0) {
        s.shield = 0;
        s.inv = C.SHIELD_STEPS;
        emit(s, 'shield');
      } else {
        kill(s, 'hazard');
        return;
      }
    }

    // ---- Augments einsammeln ----
    collect(level, s, hw, hh);

    // ---- Bodenkontakt, Absprung-Kulanz, Drehung ----
    if (grounded && !wasGround) emit(s, 'land');
    if (groundBeforeMove && !grounded) s.coyote = C.COYOTE_STEPS;
    else if (s.coyote > 0) s.coyote--;
    s.onGround = grounded;
    if (grounded) s.airJump = false;

    if (flying) {
      var tilt = Math.atan2(s.vy, speedOf(s) * 1.6);
      s.rot += (tilt - s.rot) * 0.06;
    } else if (grounded) {
      var target = Math.round(s.rot / HALF_PI) * HALF_PI;
      s.rot += (target - s.rot) * 0.3;
    } else {
      s.rot += C.CUBE.spin * dt * g;
    }

    // ---- Flug auf Zeit läuft ab ----
    if (s.fly > 0) {
      s.fly--;
      if (s.fly === 0) {
        s.rot = 0;
        emit(s, 'flyend');
      }
    }

    // ---- Portale ----
    var portals = level.portals;
    while (s.portalIdx < portals.length && s.x >= portals[s.portalIdx].x) {
      var p = portals[s.portalIdx++];
      if (p.kind === 'mode') {
        if (s.mode !== p.mode) {
          s.mode = p.mode;
          s.rot = 0;
          s.coyote = 0;
          s.buffer = 0;
          s.grav = 1;
          s.chain = 0;
          s.chainT = 0;
          s.fly = 0;
          if (p.mode === 'plane') {
            if (s.vy > C.PLANE.flapV) s.vy = C.PLANE.flapV;
            if (s.vy < -C.PLANE.maxFall) s.vy = -C.PLANE.maxFall;
          }
          emit(s, 'mode', p);
        }
      } else if (s.speedIdx !== p.speed) {
        s.speedIdx = p.speed;
        emit(s, 'speed', p);
      }
    }

    // ---- Ziel ----
    if (!s.done && s.x >= level.finishX) {
      s.done = true;
      emit(s, 'finish');
    }
  }

  WF.sim = {
    createState: createState,
    copyState: copyState,
    step: step,
    speedOf: speedOf,
    isFlying: isFlying,
    hazardAt: hazardAt
  };
})(globalThis.WF = globalThis.WF || {});
