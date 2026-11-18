#!/usr/bin/env node
/* Kurvenfieber – Prüfung ohne Browser.

   1. Jede Strecke: Ist sie fahrbar? (keine zu engen Kurven, kein Abschnitt zu nah an einem anderen)
   2. Jede Strecke und Schwierigkeit: Ein Rennen nur mit Computerautos. Alle müssen ins Ziel
      kommen, ohne sich festzufahren. Ausgegeben werden Rundenzeiten und Reihenfolge.
   3. Ein Testfahrer mit fehlerfreier Ideallinie (Können 1,0) als Maßstab für die Gegner.

   Aufruf:  node tools/race-test.js */
'use strict';

const path = require('path');
const dir = path.join(__dirname, '..', 'rennen', 'js');
['tracks.js', 'track.js', 'sim.js'].forEach(f => require(path.join(dir, f)));
const RR = globalThis.RR;

let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? '  (' + detail + ')' : ''));
}
const fmt = t => Math.floor(t / 60) + ':' + (t % 60).toFixed(2).padStart(5, '0');

function runRace(tr, skills, laps) {
  const cars = skills.map((skill, i) => ({ name: 'Auto ' + (i + 1), skill, bias: ((i * 7) % 5 - 2) * 0.35 }));
  const race = RR.sim.createRace({ track: tr, cars, laps, countdown: 1 });
  const maxSteps = (laps * tr.length / 12 + 60) / RR.sim.DT;
  let wallHits = 0;
  while (race.phase !== 'done' && race.steps < maxSteps) {
    RR.sim.step(race, null);
    for (const e of race.events) if (e.type === 'wall') wallHits++;
    race.events.length = 0;
  }
  return { race, wallHits };
}

for (const def of RR.TRACKS) {
  const tr = RR.track.build(def);
  console.log('\n' + def.name + '  (' + Math.round(tr.length) + ' m)');

  // 1) Geometrie
  let maxK = 0;
  for (let i = 0; i < tr.count; i++) maxK = Math.max(maxK, Math.abs(tr.kappa[i]));
  check('engste Kurve hat Platz für die Leitplanke', maxK * tr.wall < 0.7, 'Radius ' + (1 / maxK).toFixed(1) + ' m');
  let minSep = Infinity;
  for (let i = 0; i < tr.count; i += 2) for (let j = i + 2; j < tr.count; j += 2) {
    const arc = Math.min(j - i, tr.count - (j - i)) * tr.step;
    if (arc < 80) continue;
    minSep = Math.min(minSep, Math.hypot(tr.x[i] - tr.x[j], tr.z[i] - tr.z[j]));
  }
  check('Streckenteile berühren sich nicht', minSep > 2 * tr.wall + 10, 'kleinster Abstand ' + minSep.toFixed(1) + ' m');

  // 3) Testfahrer allein
  const solo = runRace(tr, [1], 3);
  const bot = solo.race.cars[0];
  check('Testfahrer kommt ins Ziel', bot.finished, 'beste Runde ' + fmt(bot.bestLap || 0) + ', Planke ' + solo.wallHits + '×');

  // 2) volles Feld je Schwierigkeit
  for (const diff of RR.DIFFICULTY) {
    const skills = [0.97, 1.0, 1.03, 0.985, 1.015, 0.995].map(f => Math.min(1, diff.skill * f));
    const { race, wallHits } = runRace(tr, skills, 3);
    const all = race.cars.every(c => c.finished);
    const resets = race.cars.reduce((n, c) => n + c.resets, 0);
    const best = Math.min(...race.cars.map(c => c.bestLap || Infinity));
    const last = Math.max(...race.cars.map(c => c.finishTime || 0));
    check(diff.name + ': alle 6 Autos im Ziel', all,
      'schnellste Runde ' + fmt(best) + ' (' + Math.round(best / bot.bestLap * 100) + ' % vom Testfahrer)' +
      ', Letzter nach ' + fmt(last) + ', Planke ' + wallHits + '×, zurückgesetzt ' + resets + '×');
    check(diff.name + ': niemand fährt sich fest', resets <= 1);
  }
}

console.log(failed ? '\n' + failed + ' Prüfung(en) fehlgeschlagen.' : '\nAlles in Ordnung.');
process.exit(failed ? 1 : 0);
