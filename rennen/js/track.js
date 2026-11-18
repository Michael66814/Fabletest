/* Kurvenfieber – Streckengeometrie, ohne Browser-APIs (läuft auch in Node).

   Aus den Stützpunkten wird eine geschlossene Catmull-Rom-Kurve und daraus eine Tabelle
   mit einem Eintrag alle STEP Meter: Lage, Höhe, Richtung, Krümmung.

   Koordinaten: x/z waagerecht, y nach oben (wie in Three.js).
   Jedes Auto wird entlang der Strecke beschrieben:
     s    Weg entlang der Mittellinie (0 … Länge, Start-/Ziellinie bei 0)
     d    seitlicher Abstand zur Mittellinie, positiv = links
   heading: Fahrtrichtung als Winkel, Richtung = (sin h, cos h)
   kappa:   Krümmung, positiv = Linkskurve (1 / Radius) */
(function (RR) {
  'use strict';

  var STEP = 2;          // Abstand der Tabelleneinträge in Metern
  var SHOULDER = 4.5;    // Grünstreifen zwischen Fahrbahnrand und Leitplanke

  function build(def) {
    var pts = def.points;
    var n = pts.length;

    // 1) dichte Abtastung der Kurve (zentripetales Catmull-Rom, geschlossen)
    var dense = [];
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      for (var k = 0; k < 60; k++) dense.push(catmull(p0, p1, p2, p3, k / 60));
    }
    // 2) Bogenlänge
    var cum = [0];
    for (i = 1; i <= dense.length; i++) {
      var a = dense[i - 1], b = dense[i % dense.length];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    var length = cum[dense.length];
    var count = Math.round(length / STEP);
    var step = length / count;

    // 3) gleichmäßig neu abtasten
    var x = new Float64Array(count), z = new Float64Array(count), y = new Float64Array(count);
    var j = 0;
    for (i = 0; i < count; i++) {
      var target = i * step;
      while (cum[j + 1] < target) j++;
      var t = (target - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
      var A = dense[j], B = dense[(j + 1) % dense.length];
      x[i] = A[0] + (B[0] - A[0]) * t;
      z[i] = A[1] + (B[1] - A[1]) * t;
      y[i] = A[2] + (B[2] - A[2]) * t;
    }

    // 4) Richtung und Krümmung
    var heading = new Float64Array(count), kappa = new Float64Array(count), slope = new Float64Array(count);
    for (i = 0; i < count; i++) {
      var pi = (i - 1 + count) % count, ni = (i + 1) % count;
      heading[i] = Math.atan2(x[ni] - x[pi], z[ni] - z[pi]);
      slope[i] = (y[ni] - y[pi]) / (2 * step);
    }
    var raw = new Float64Array(count);
    for (i = 0; i < count; i++) raw[i] = wrapAngle(heading[(i + 1) % count] - heading[(i - 1 + count) % count]) / (2 * step);
    smoothInto(raw, kappa, 2);

    var tr = {
      def: def,
      name: def.name,
      length: length,
      count: count,
      step: step,
      halfWidth: def.width / 2,
      wall: def.width / 2 + SHOULDER,
      x: x, z: z, y: y, heading: heading, kappa: kappa, slope: slope
    };
    tr.racingLine = buildRacingLine(tr);
    tr.cornerSpeed = buildCornerSpeed(tr);
    return tr;
  }

  function catmull(p0, p1, p2, p3, t) {
    // zentripetale Parametrisierung (alpha = 0.5) vermeidet Schlaufen und Spitzen
    var t0 = 0;
    var t1 = t0 + Math.pow(dist(p0, p1), 0.5) || t0 + 1e-4;
    var t2 = t1 + Math.pow(dist(p1, p2), 0.5) || t1 + 1e-4;
    var t3 = t2 + Math.pow(dist(p2, p3), 0.5) || t2 + 1e-4;
    var tt = t1 + (t2 - t1) * t;
    var out = [];
    for (var c = 0; c < 3; c++) {
      var a1 = lerpT(p0[c], p1[c], t0, t1, tt), a2 = lerpT(p1[c], p2[c], t1, t2, tt), a3 = lerpT(p2[c], p3[c], t2, t3, tt);
      var b1 = lerpT(a1, a2, t0, t2, tt), b2 = lerpT(a2, a3, t1, t3, tt);
      out.push(lerpT(b1, b2, t1, t2, tt));
    }
    // Index 0 = x, 1 = z, 2 = Höhe
    return out;
  }
  function lerpT(a, b, ta, tb, t) { return a + (b - a) * (t - ta) / (tb - ta); }
  function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }

  function wrapAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  function smoothInto(src, dst, radius) {
    var n = src.length;
    for (var i = 0; i < n; i++) {
      var sum = 0;
      for (var k = -radius; k <= radius; k++) sum += src[(i + k + n) % n];
      dst[i] = sum / (2 * radius + 1);
    }
  }

  // Ideallinie: am Scheitel innen, davor und danach außen.
  // Ergebnis: bevorzugter seitlicher Abstand d je Tabelleneintrag.
  function buildRacingLine(tr) {
    var n = tr.count, line = new Float64Array(n), tmp = new Float64Array(n);
    var lim = tr.halfWidth - 1.8;
    var win = Math.round(24 / tr.step);
    // geglättete Krümmung: wohin biegt die Strecke hier insgesamt?
    var curv = new Float64Array(n);
    smoothInto(tr.kappa, curv, win);
    for (var i = 0; i < n; i++) {
      // innen in der Kurve (d hat dasselbe Vorzeichen wie kappa)
      var inside = clamp(curv[i] * 160, -1, 1);
      // vor der Kurve nach außen: Blick 40 m voraus
      var ahead = curv[(i + Math.round(40 / tr.step)) % n];
      var outside = clamp(-ahead * 120, -1, 1) * (1 - Math.abs(inside));
      line[i] = clamp(inside + outside, -1, 1) * lim;
    }
    smoothInto(line, tmp, Math.round(14 / tr.step));
    return tmp;
  }

  // Höchstgeschwindigkeit je Kurvenstelle bei Querbeschleunigung 1 (wird mit sqrt(Grip) skaliert)
  function buildCornerSpeed(tr) {
    var n = tr.count, out = new Float64Array(n);
    var curv = new Float64Array(n);
    smoothInto(tr.kappa.map(Math.abs), curv, 3);
    for (var i = 0; i < n; i++) {
      // die Ideallinie vergrößert den Radius ein Stück
      var k = Math.max(curv[i] * 0.78, 1e-5);
      out[i] = Math.sqrt(1 / k);
    }
    return out;
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // --- Abfragen -------------------------------------------------------------

  function wrapS(tr, s) {
    s %= tr.length;
    return s < 0 ? s + tr.length : s;
  }

  // Tabellenwert an Stelle s (linear interpoliert)
  function sample(tr, arr, s) {
    var f = wrapS(tr, s) / tr.step;
    var i = Math.floor(f), t = f - i;
    i %= tr.count;
    return arr[i] + (arr[(i + 1) % tr.count] - arr[i]) * t;
  }
  function sampleAngle(tr, s) {
    var f = wrapS(tr, s) / tr.step;
    var i = Math.floor(f), t = f - i;
    i %= tr.count;
    var a = tr.heading[i];
    return a + wrapAngle(tr.heading[(i + 1) % tr.count] - a) * t;
  }

  // Weltposition zu (s, d): {x, y, z, h}
  function toWorld(tr, s, d, out) {
    out = out || {};
    var h = sampleAngle(tr, s);
    var cx = sample(tr, tr.x, s), cz = sample(tr, tr.z, s);
    // links von der Fahrtrichtung (sin h, cos h) liegt (cos h, -sin h)
    out.x = cx + Math.cos(h) * d;
    out.z = cz - Math.sin(h) * d;
    out.y = sample(tr, tr.y, s);
    out.h = h;
    return out;
  }

  // nächster Streckenpunkt zu einer Weltposition (grob, über alle Einträge)
  function nearest(tr, px, pz) {
    var best = Infinity, bi = 0;
    for (var i = 0; i < tr.count; i++) {
      var dx = tr.x[i] - px, dz = tr.z[i] - pz, q = dx * dx + dz * dz;
      if (q < best) { best = q; bi = i; }
    }
    return { i: bi, dist: Math.sqrt(best) };
  }

  // Raster für schnelle Abstandsabfragen (Gelände, Bäume)
  function buildGrid(tr, cell) {
    var grid = new Map();
    for (var i = 0; i < tr.count; i++) {
      var key = Math.floor(tr.x[i] / cell) + ',' + Math.floor(tr.z[i] / cell);
      var list = grid.get(key);
      if (!list) grid.set(key, list = []);
      list.push(i);
    }
    return {
      // nächster Eintrag innerhalb von radius Metern, sonst null
      nearest: function (px, pz, radius) {
        var r = Math.ceil(radius / cell), gx = Math.floor(px / cell), gz = Math.floor(pz / cell);
        var best = radius * radius, bi = -1;
        for (var a = -r; a <= r; a++) for (var b = -r; b <= r; b++) {
          var list = grid.get((gx + a) + ',' + (gz + b));
          if (!list) continue;
          for (var k = 0; k < list.length; k++) {
            var i = list[k], dx = tr.x[i] - px, dz = tr.z[i] - pz, q = dx * dx + dz * dz;
            if (q < best) { best = q; bi = i; }
          }
        }
        return bi < 0 ? null : { i: bi, dist: Math.sqrt(best) };
      }
    };
  }

  function bounds(tr) {
    var b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, minY: Infinity, maxY: -Infinity };
    for (var i = 0; i < tr.count; i++) {
      b.minX = Math.min(b.minX, tr.x[i]); b.maxX = Math.max(b.maxX, tr.x[i]);
      b.minZ = Math.min(b.minZ, tr.z[i]); b.maxZ = Math.max(b.maxZ, tr.z[i]);
      b.minY = Math.min(b.minY, tr.y[i]); b.maxY = Math.max(b.maxY, tr.y[i]);
    }
    return b;
  }

  RR.track = {
    build: build,
    wrapS: wrapS,
    wrapAngle: wrapAngle,
    sample: sample,
    sampleAngle: sampleAngle,
    toWorld: toWorld,
    nearest: nearest,
    buildGrid: buildGrid,
    bounds: bounds,
    clamp: clamp
  };
})(globalThis.RR = globalThis.RR || {});
