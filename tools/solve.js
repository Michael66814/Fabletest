#!/usr/bin/env node
/* Würfelflug – Prüf-Bot.

   Sucht für jedes Level eine Eingabefolge, die bis ins Ziel führt, und beweist
   damit, dass das Level schaffbar ist. Zusätzlich misst er, wie viel Spielraum
   bleibt (Zeitfenster pro Sprung, Sicherheitsabstand zu Stacheln), und schreibt
   die gefundene Lösung als Demo nach js/demos.js.

   Aufruf:  node tools/solve.js            alle Level prüfen, Demos schreiben
            node tools/solve.js l2         nur ein Level
            node tools/solve.js l2 --show  zusätzlich die Flugbahn als Text-Bild
            node tools/solve.js --check    nur prüfen, js/demos.js nicht anfassen
*/
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
['config', 'level', 'sim', 'levels'].forEach(f => require(path.join(root, 'js', f + '.js')));
const WF = globalThis.WF;
const C = WF.CFG;
const sim = WF.sim;

const TICK = 4;                 // Entscheidung alle 4 Physikschritte (= 60-mal pro Sekunde)
const BEAM = 5000;              // höchstens so viele Zustände pro Zeitscheibe merken

function keyOf(s) {
  const qy = Math.round(s.y * 20);            // 0,05 Felder
  const qv = Math.round(s.vy * 2.5) + 100;    // 0,4 Felder/s
  return (qy * 512 + qv) * 4 + (s.mode === 'plane' ? 2 : 0) + (s.onGround ? 1 : 0);
}

/* Breitensuche über Zeitscheiben. Alle Zustände einer Scheibe haben dasselbe x,
   sie unterscheiden sich nur in Höhe und Fallgeschwindigkeit. Pro (gerundetem)
   Zustand wird der günstigste Weg behalten: wenige Klicks, viel Abstand. */
function solve(level, inflate) {
  const start = sim.createState();
  let frontier = new Map();
  frontier.set(keyOf(start), { s: start, cost: 0, parent: null, press: false });
  let tick = 0;
  let best = null;
  let lastX = 0;
  let maxStates = 0;

  while (frontier.size > 0 && !best) {
    const next = new Map();
    for (const node of frontier.values()) {
      const s0 = node.s;
      lastX = s0.x;
      for (let action = 0; action < 2; action++) {
        if (action === 1 && s0.mode === 'cube' && !s0.onGround) continue;
        const s = sim.copyState(s0);
        s.inflate = s.mode === 'plane' ? inflate : 0;   // Sicherheitsabstand nur im Flug
        sim.step(level, s, action === 1, false);
        for (let i = 1; i < TICK && !s.dead; i++) sim.step(level, s, false, false);
        if (s.dead) continue;

        let cost = node.cost + (action ? 1 : 0);
        const P = s.mode === 'plane' ? C.PLANE : C.CUBE;
        // Nähe zu Gefahren kostet -> der Bot hält Abstand, wo es geht
        if (sim.hazardAt(level, s.x, s.y, P.hw, P.hh, C.HAZ_INSET - s.inflate - 0.15)) cost += 0.6;
        else if (sim.hazardAt(level, s.x, s.y, P.hw, P.hh, C.HAZ_INSET - s.inflate - 0.35)) cost += 0.25;
        // Flieger: nicht unnötig an Boden oder Decke kleben
        if (s.mode === 'plane' && (s.y < 1.2 || s.y > C.ROWS - 2.2)) cost += 0.05;

        const child = { s: s, cost: cost, parent: node, press: action === 1 };
        if (s.done) {
          if (!best || cost < best.cost) best = child;
          continue;
        }
        const key = keyOf(s);
        const old = next.get(key);
        if (!old || cost < old.cost) next.set(key, child);
      }
      node.s = null;            // Speicher freigeben, der Zustand wird nicht mehr gebraucht
    }
    tick++;
    if (next.size > BEAM) {
      const arr = Array.from(next.entries()).sort((a, b) => a[1].cost - b[1].cost).slice(0, BEAM);
      frontier = new Map(arr);
    } else {
      frontier = next;
    }
    if (frontier.size > maxStates) maxStates = frontier.size;
  }

  if (!best) return { ok: false, reachedX: lastX, ticks: tick, maxStates };

  const presses = [];
  let n = best, t = tick - 1;
  while (n.parent) {
    if (n.press) presses.push(t * TICK);
    n = n.parent;
    t--;
  }
  presses.reverse();
  return { ok: true, presses, cost: best.cost, ticks: tick, maxStates };
}

// Spielt eine Eingabefolge ab und liefert den Verlauf zurück.
function replay(level, presses, opts) {
  opts = opts || {};
  const s = opts.from ? sim.copyState(opts.from) : sim.createState();
  const until = opts.until || Infinity;
  const set = presses instanceof Set ? presses : new Set(presses);
  const trace = opts.trace ? [] : null;
  const snaps = opts.snapAt ? new Map() : null;
  while (!s.dead && !s.done && s.step < until && s.x < level.width - 1) {
    if (snaps && opts.snapAt.has(s.step)) snaps.set(s.step, sim.copyState(s));
    const modeBefore = s.mode;
    sim.step(level, s, set.has(s.step), false);
    if (trace) trace.push({ x: s.x, y: s.y, mode: modeBefore });
  }
  return { s, trace, snaps };
}

/* Zeitfenster pro Würfel-Sprung: Um wie viele Millisekunden darf ein einzelner
   Klick zu früh oder zu spät kommen (alle anderen bleiben wie geplant)? */
function jumpWindows(level, presses) {
  const BACK = 72;                              // 0,3 s vor dem Klick einsteigen
  const HORIZON = Math.round(2.2 * C.STEPS_PER_SECOND);
  const snapAt = new Set(presses.map(p => Math.max(0, p - BACK)));
  const ref = replay(level, presses, { snapAt });
  const out = [];
  for (let i = 0; i < presses.length; i++) {
    const p = presses[i];
    const from = ref.snaps.get(Math.max(0, p - BACK));
    if (!from) continue;
    // Zustand genau beim Klick bestimmen (für Modus und Position)
    const at = replay(level, presses, { from, until: p }).s;
    if (at.mode !== 'cube') continue;
    const ok = d => {
      const mod = presses.slice();
      mod[i] = p + d;
      const res = replay(level, mod, { from, until: p + HORIZON }).s;
      return !res.dead;
    };
    let early = 0, late = 0;
    while (early > -BACK + 1 && ok(early - 1)) early--;
    while (late < 72 && ok(late + 1)) late++;
    out.push({
      index: i, step: p, x: at.x, speedIdx: at.speedIdx,
      early, late,
      ms: (late - early + 1) * 1000 / C.STEPS_PER_SECOND
    });
  }
  return out;
}

// Text-Bild eines Level-Ausschnitts mit eingezeichneter Flugbahn
function ascii(level, xFrom, xTo, trace) {
  const rows = [];
  const marks = new Map();
  if (trace) {
    for (const p of trace) {
      const key = Math.floor(p.x) + ',' + Math.floor(p.y);
      if (!marks.has(key)) marks.set(key, p.mode === 'plane' ? '~' : '*');
    }
  }
  for (let y = C.ROWS - 1; y >= 0; y--) {
    let line = '';
    for (let x = xFrom; x < xTo; x++) {
      let ch = marks.get(x + ',' + y) || ' ';
      if (level.solidAt(x, y)) ch = '#';
      const its = level.items[x];
      if (its) {
        for (const it of its) {
          if (it.type === 'spike' && it.y === y) ch = it.kind.indexOf('Down') >= 0 || it.kind === 'down' ? 'v' : '^';
          if (it.type === 'saw' && Math.floor(it.cy) === y) ch = it.r > 0.6 ? 'O' : 'o';
          if (it.type === 'portal' && it.y === y) ch = it.kind === 'mode' ? (it.mode === 'plane' ? 'P' : 'C') : String(it.speed + 1);
          if (it.type === 'flag' && y === 0) ch = '|';
        }
      }
      line += ch;
    }
    rows.push(line);
  }
  let ruler = '';
  for (let x = xFrom; x < xTo; x++) ruler += x % 10 === 0 ? String(Math.floor(x / 10) % 10) : (x % 5 === 0 ? '+' : '-');
  rows.push(ruler + '  (x ab ' + xFrom + ')');
  return rows.join('\n');
}

function durationOf(level, presses) {
  return replay(level, presses).s.step / C.STEPS_PER_SECOND;
}

function analyse(def, show) {
  const level = WF.buildLevel(def);
  const report = { id: def.id, name: def.name, ok: false };
  const t0 = Date.now();

  // Größten Sicherheitsabstand suchen, mit dem das Level noch lösbar ist
  let found = null;
  for (const inflate of [0.3, 0.2, 0.1, 0]) {
    const res = solve(level, inflate);
    if (res.ok) { found = { inflate, res }; break; }
    report.blockedAt = report.blockedAt || {};
    report.blockedAt[inflate] = res.reachedX;
  }
  report.ms = Date.now() - t0;
  if (!found) {
    const x = Math.floor(report.blockedAt[0]);
    console.log('\n✗ ' + def.id + ' "' + def.name + '": NICHT lösbar – Bot scheitert bei x ≈ ' + x);
    console.log(ascii(level, Math.max(0, x - 30), x + 14));
    return report;
  }

  const presses = found.res.presses;
  const check = replay(level, presses, { trace: show });
  if (!check.s.done || check.s.dead) throw new Error('Wiedergabe der Lösung scheitert: ' + def.id);

  const wins = jumpWindows(level, presses);
  const tight = wins.filter(w => w.ms < 90).sort((a, b) => a.ms - b.ms);
  report.ok = true;
  report.presses = presses;
  report.inflate = found.inflate;
  report.seconds = durationOf(level, presses);
  report.minWindow = wins.length ? Math.min.apply(null, wins.map(w => w.ms)) : null;

  console.log('\n✓ ' + def.id + ' "' + def.name + '": lösbar – ' +
    report.seconds.toFixed(1) + ' s, ' + level.finishX + ' Felder, ' + presses.length + ' Klicks, ' +
    'Abstand im Flug ' + found.inflate.toFixed(1) + ', ' + report.ms + ' ms Rechenzeit');
  if (found.inflate < 0.3) {
    const bl = report.blockedAt;
    console.log('  Engstellen im Flug (mit größerem Abstand kein Durchkommen): ' +
      Object.keys(bl).map(k => 'Abstand ' + k + ' → x≈' + Math.floor(bl[k])).join(', '));
  }
  if (wins.length) {
    const sorted = wins.map(w => w.ms).sort((a, b) => a - b);
    console.log('  Sprung-Zeitfenster: kleinstes ' + sorted[0].toFixed(0) + ' ms, Median ' +
      sorted[Math.floor(sorted.length / 2)].toFixed(0) + ' ms (' + wins.length + ' Würfel-Sprünge)');
    for (const w of tight.slice(0, 12)) {
      console.log('    knapp: ' + w.ms.toFixed(0) + ' ms bei x≈' + w.x.toFixed(1) +
        ' (Tempo ' + C.SPEED_NAMES[w.speedIdx] + ')');
    }
  }
  if (show) {
    for (let x = 0; x < level.finishX + 6; x += 100) {
      console.log('\n' + ascii(level, x, Math.min(level.width, x + 100), check.trace));
    }
  }
  return report;
}

function writeDemos(reports) {
  const lines = [];
  lines.push('/* Würfelflug – aufgezeichnete Lösungen des Prüf-Bots (für "Demo ansehen").');
  lines.push('   AUTOMATISCH ERZEUGT von tools/solve.js – nach Level-Änderungen neu erzeugen:');
  lines.push('     node tools/solve.js');
  lines.push('   Jede Zahl ist der Physikschritt, in dem geklickt wird (als Abstand zum vorigen Klick). */');
  lines.push('(function (WF) {');
  lines.push("  'use strict';");
  lines.push('  WF.DEMOS = {');
  reports.forEach((r, i) => {
    const deltas = r.presses.map((p, k) => (k === 0 ? p : p - r.presses[k - 1]));
    lines.push('    ' + JSON.stringify(r.id) + ': ' + JSON.stringify(deltas) + (i < reports.length - 1 ? ',' : ''));
  });
  lines.push('  };');
  lines.push('})(globalThis.WF = globalThis.WF || {});');
  fs.writeFileSync(path.join(root, 'js', 'demos.js'), lines.join('\n') + '\n');
}

function main() {
  const args = process.argv.slice(2);
  const show = args.includes('--show');
  const checkOnly = args.includes('--check');
  const ids = args.filter(a => !a.startsWith('--'));
  const defs = WF.LEVEL_DEFS.filter(d => ids.length === 0 || ids.includes(d.id));
  if (defs.length === 0) {
    console.error('Kein Level gefunden. Vorhanden: ' + WF.LEVEL_DEFS.map(d => d.id).join(', '));
    process.exit(2);
  }
  const reports = defs.map(d => analyse(d, show));
  const failed = reports.filter(r => !r.ok);
  if (failed.length) {
    console.error('\n' + failed.length + ' Level nicht lösbar.');
    process.exit(1);
  }
  if (!checkOnly && ids.length === 0) {
    writeDemos(reports);
    console.log('\njs/demos.js geschrieben.');
  }
}

module.exports = { solve, replay, jumpWindows, ascii };
if (require.main === module) main();
