/* Kurvenfieber – die Strecken.

   Jede Strecke ist ein geschlossener Rundkurs aus Stützpunkten [x, z, Höhe] in Metern.
   Durch die Punkte wird eine glatte Kurve gelegt (siehe track.js). Die Start-/Ziellinie
   liegt am ersten Punkt, gefahren wird in Richtung des zweiten.

   corners(): baut aus einem Vieleck einen Stadtkurs mit abgerundeten Ecken.
   Prüfen, ob eine Strecke fahrbar ist:  node tools/race-test.js */
(function (RR) {
  'use strict';

  // Vieleck -> Stützpunkte: an jeder Ecke zwei Punkte im Abstand r vor und nach der Ecke
  function corners(poly, r) {
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var p = poly[(i - 1 + poly.length) % poly.length], v = poly[i], n = poly[(i + 1) % poly.length];
      var a = unit(v[0] - p[0], v[1] - p[1]), b = unit(n[0] - v[0], n[1] - v[1]);
      var y = v[2] || 0;
      out.push([v[0] - a[0] * r, v[1] - a[1] * r, y]);
      out.push([v[0] - a[0] * r * 0.3 + b[0] * r * 0.3, v[1] - a[1] * r * 0.3 + b[1] * r * 0.3, y]);
      out.push([v[0] + b[0] * r, v[1] + b[1] * r, y]);
    }
    // Start mitten auf der ersten Geraden
    var f = poly[0], g = poly[1];
    out.unshift([(f[0] + g[0]) / 2, (f[1] + g[1]) / 2, ((f[2] || 0) + (g[2] || 0)) / 2]);
    // die ersten drei Eckpunkte gehören ans Ende (sie liegen vor dem Start)
    var head = out.splice(1, 3);
    return out.concat(head);
  }
  function unit(x, z) { var l = Math.hypot(x, z) || 1; return [x / l, z / l]; }

  RR.TRACKS = [
    {
      id: 'kueste',
      name: 'Sonnenküste',
      blurb: 'Weite Bögen am Meer. Gut zum Einfahren.',
      level: 'Leicht',
      width: 13,
      points: [
        [0, 0, 2], [110, -4, 2], [210, 6, 3], [285, 55, 5], [315, 140, 9], [285, 225, 12],
        [205, 262, 11], [130, 232, 8], [62, 250, 5], [-15, 300, 4], [-110, 285, 3],
        [-170, 215, 2], [-168, 128, 3], [-110, 72, 2], [-62, 18, 2]
      ],
      theme: {
        sky: [0x2f8fe0, 0xbfe6ff, 0xffe2b0], fog: 0xcfe8f5, fogNear: 180, fogFar: 900,
        ground: 0x6fae4a, groundFar: 0xe2cf92, sun: 0xfff1d6, sunPos: [-300, 380, 220],
        hemi: [0xdff1ff, 0x5c7a3a], scenery: 'palms', sea: true, night: false
      }
    },
    {
      id: 'pass',
      name: 'Bergpass',
      blurb: 'Haarnadeln, Kuppen und 40 Meter Höhenunterschied.',
      level: 'Mittel',
      width: 12,
      points: [
        [0, 0, 0], [140, 0, 2], [250, -18, 7], [322, -82, 13], [318, -168, 19], [250, -205, 23],
        [182, -168, 25], [168, -105, 27], [112, -70, 29], [52, -100, 32], [22, -170, 36],
        [-42, -222, 39], [-122, -200, 34], [-158, -128, 27], [-128, -62, 20], [-168, 6, 13],
        [-196, 86, 8], [-140, 146, 4], [-60, 124, 2], [-58, 52, 1], [-40, 8, 0]
      ],
      theme: {
        sky: [0x4f7fb8, 0xc9d9ea, 0xf3e6d8], fog: 0xc8d6e2, fogNear: 140, fogFar: 750,
        ground: 0x5c8a45, groundFar: 0x8d9a8a, sun: 0xfff4e6, sunPos: [260, 320, -260],
        hemi: [0xe0ecff, 0x46603a], scenery: 'pines', sea: false, night: false
      }
    },
    {
      id: 'stadt',
      name: 'Nachtstadt',
      blurb: 'Enge Ecken zwischen Hochhäusern, bei Nacht.',
      level: 'Schwer',
      width: 12,
      points: corners([
        [0, 0, 0], [270, 0, 0], [270, 170, 2], [150, 170, 4], [150, 280, 6],
        [-70, 280, 4], [-70, 140, 2], [-160, 140, 1], [-160, -10, 0]
      ], 32),
      theme: {
        sky: [0x050816, 0x142048, 0x3a2f5c], fog: 0x141a33, fogNear: 90, fogFar: 520,
        ground: 0x2a2f38, groundFar: 0x1c2029, sun: 0x9fb4ff, sunPos: [-200, 300, 150],
        hemi: [0x5866a0, 0x1a1c24], scenery: 'city', sea: false, night: true
      }
    }
  ];

  RR.CARS = [
    { name: 'Du', color: 0xffb02e, accent: 0x1a1a1a },
    { name: 'Blitz', color: 0xe8484f, accent: 0xf4f4f4 },
    { name: 'Kobalt', color: 0x2f6fe0, accent: 0xf4f4f4 },
    { name: 'Minze', color: 0x3fcf9a, accent: 0x14322a },
    { name: 'Veilchen', color: 0x9b6cff, accent: 0xf4f4f4 },
    { name: 'Kreide', color: 0xeeeeea, accent: 0xd03030 }
  ];

  RR.DIFFICULTY = [
    { id: 'leicht', name: 'Leicht', skill: 0.8 },
    { id: 'normal', name: 'Normal', skill: 0.9 },
    { id: 'schwer', name: 'Schwer', skill: 0.97 }
  ];
})(globalThis.RR = globalThis.RR || {});
