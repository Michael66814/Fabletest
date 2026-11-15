#!/usr/bin/env node
/* Würfelflug – Prüf-Bot.

   Sucht für jedes Level eine Eingabefolge, die bis ins Ziel führt, und beweist
   damit, dass das Level schaffbar ist. Daraus berechnet er eine Schwierigkeits-
   wertung (siehe rate()) und schreibt Lösung und Wertung nach js/demos.js.

   Aufruf:  node tools/solve.js            alle Level prüfen, js/demos.js schreiben
            node tools/solve.js l2         nur ein Level (schreibt nichts)
            node tools/solve.js l2 --show  zusätzlich die Flugbahn als Text-Bild
            node tools/solve.js --check    alle prüfen, js/demos.js nicht anfassen
            node tools/solve.js --quick    nur Lösbarkeit, ohne Wertung */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
['config', 'level', 'sim', 'levels'].forEach(f => require(path.join(root, 'js', f + '.js')));
const WF = globalThis.WF;
const C = WF.CFG;
const sim = WF.sim;
const SPS = C.STEPS_PER_SECOND;

const TICK = 4;                 // Entscheidung alle 4 Physikschritte (= 60-mal pro Sekunde)
const BEAM = 4000;              // höchstens so viele Zustände pro Zeitscheibe merken
const GAP = 6;                  // Abstand der Klicks bei Doppel-/Dreifachklick: 6 Ticks = 100 ms

// Was der Bot in einem Zug tun kann: nichts, ein Klick, Doppelklick, Dreifachklick
const NONE = { at: [], len: 1 };
const PRESS = { at: [0], len: 1 };
const DOUBLE = { at: [0, GAP], len: GAP + 1 };
const TRIPLE = { at: [0, GAP, 2 * GAP], len: 2 * GAP + 1 };

function actionsFor(s) {
  if (sim.isFlying(s)) return [NONE, PRESS];
  if (s.mode === 'cube') {
    return s.onGround || (s.dbl > 0 && !s.airJump) ? [NONE, PRESS] : [NONE];
  }
  // Trickmodus: neue Klickfolge erst, wenn die vorige abgelaufen ist
  if (s.chainT > 0) return [NONE];
  return s.onGround ? [NONE, PRESS, DOUBLE, TRIPLE] : [NONE, DOUBLE, TRIPLE];
}

function keyOf(s) {
  return s.mode.charAt(0) + Math.round(s.y * 20) + '|' + Math.round(s.vy * 2.5) + '|' +
    (s.onGround ? 1 : 0) + s.grav + s.chain + (s.airJump ? 1 : 0) + s.shield + '|' +
    Math.ceil(s.chainT / TICK) + '|' + Math.ceil(s.fly / 24) + '|' + Math.ceil(s.boost / 24) + '|' +
    Math.ceil(s.dbl / 24) + '|' + Math.ceil(s.inv / 8);
}

/* Breitensuche über Zeitscheiben. Pro (gerundetem) Zustand wird der günstigste
   Weg behalten: wenige Klicks, viel Abstand zu Gefahren. */
function solve(level, inflate) {
  const slices = new Map();
  const put = (tick, node) => {
    let m = slices.get(tick);
    if (!m) slices.set(tick, m = new Map());
    const key = keyOf(node.s);
    const old = m.get(key);
    if (!old || node.cost < old.cost) m.set(key, node);
  };
  put(0, { s: sim.createState(), cost: 0, parent: null, presses: null });

  let best = null, lastX = 0, tick = 0, maxTick = 0;
  while (!best && tick <= maxTick) {
    let cur = slices.get(tick);
    slices.delete(tick);
    if (cur && cur.size > BEAM) {
      cur = new Map(Array.from(cur.entries()).sort((a, b) => a[1].cost - b[1].cost).slice(0, BEAM));
    }
    if (cur) {
      for (const node of cur.values()) {
        const s0 = node.s;
        if (s0.x > lastX) lastX = s0.x;
        for (const act of actionsFor(s0)) {
          const s = sim.copyState(s0);
          for (let k = 0; k < act.len && !s.dead && !s.done; k++) {
            s.inflate = sim.isFlying(s) ? inflate : 0;       // Sicherheitsabstand nur im Flug
            sim.step(level, s, act.at.indexOf(k) >= 0, false);
            for (let i = 1; i < TICK && !s.dead; i++) sim.step(level, s, false, false);
          }
          if (s.dead) continue;

          let cost = node.cost + act.at.length;
          const P = sim.isFlying(s) ? C.PLANE : C.CUBE;
          if (s.inv === 0) {
            // Nähe zu Gefahren kostet -> der Bot hält Abstand, wo es geht
            if (sim.hazardAt(level, s.x, s.y, P.hw, P.hh, C.HAZ_INSET - s.inflate - 0.15)) cost += 0.6;
            else if (sim.hazardAt(level, s.x, s.y, P.hw, P.hh, C.HAZ_INSET - s.inflate - 0.35)) cost += 0.25;
          }
          if (s.mode === 'plane' && (s.y < 1.2 || s.y > C.ROWS - 2.2)) cost += 0.05;

          const child = {
            s, cost, parent: node,
            presses: act.at.length ? act.at.map(k => (tick + k) * TICK) : null
          };
          if (s.done) {
            if (!best || cost < best.cost) best = child;
          } else {
            put(tick + act.len, child);
            if (tick + act.len > maxTick) maxTick = tick + act.len;
          }
        }
        node.s = null;          // Speicher freigeben
      }
    }
    tick++;
  }

  if (!best) return { ok: false, reachedX: lastX };
  const presses = [];
  for (let n = best; n; n = n.parent) if (n.presses) presses.push.apply(presses, n.presses);
  presses.sort((a, b) => a - b);
  return { ok: true, presses, cost: best.cost };
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
    const mark = sim.isFlying(s) ? '~' : (s.mode === 'trick' ? '+' : '*');
    const pressed = set.has(s.step);
    if (pressed && opts.onPress) opts.onPress(s);
    sim.step(level, s, pressed, false);
    if (trace) trace.push({ x: s.x, y: s.y, mark });
  }
  return { s, trace, snaps };
}

/* Zeitfenster pro Aktion am Boden (Sprung, Doppel-/Dreifachklick, Doppelsprung):
   Um wie viele Millisekunden darf sie zu früh oder zu spät kommen, wenn alle
   anderen Eingaben wie geplant bleiben? Klicks im Flug zählen hier nicht. */
function actionWindows(level, presses) {
  const BACK = 72;                              // 0,3 s vor der Aktion einsteigen
  const HORIZON = Math.round(2.2 * SPS);

  // Klicks zu Aktionen bündeln (Klickfolgen gehören zusammen)
  const info = new Map();
  replay(level, presses, { onPress: s => info.set(s.step, { flying: sim.isFlying(s), x: s.x, speedIdx: s.speedIdx, mode: s.mode }) });
  const groups = [];
  let last = null;
  presses.forEach((p, i) => {
    const at = info.get(p);
    if (!at || at.flying) { last = null; return; }
    if (last && p - last.steps[last.steps.length - 1] <= 40) {
      last.idx.push(i);
      last.steps.push(p);
    } else {
      last = { idx: [i], steps: [p], x: at.x, speedIdx: at.speedIdx, mode: at.mode };
      groups.push(last);
    }
  });

  const snapAt = new Set(groups.map(g => Math.max(0, g.steps[0] - BACK)));
  const ref = replay(level, presses, { snapAt });
  const out = [];
  for (const g of groups) {
    const first = g.steps[0];
    const from = ref.snaps.get(Math.max(0, first - BACK));
    if (!from) continue;
    const ok = d => {
      const mod = presses.slice();
      g.idx.forEach(i => { mod[i] = presses[i] + d; });
      return !replay(level, mod, { from, until: first + HORIZON }).s.dead;
    };
    let early = 0, late = 0;
    while (early > -BACK + 1 && ok(early - 1)) early--;
    while (late < 72 && ok(late + 1)) late++;
    out.push({ x: g.x, speedIdx: g.speedIdx, mode: g.mode, clicks: g.steps.length, ms: (late - early + 1) * 1000 / SPS });
  }
  return out;
}

/* ---- Flugabschnitte: ein "unpräziser Pilot" ----
   Ein einfacher Regler mit Tipp-Ungenauigkeit, Schätzfehlern und begrenzter
   Tippfrequenz fliegt jeden Flugabschnitt viele Male. Der Anteil der geglückten
   Flüge sagt, wie schwer der Abschnitt für einen Menschen ungefähr ist. */
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function flightSafe(level, x, y, margin) {
  const P = C.PLANE;
  if (sim.hazardAt(level, x, y, P.hw, P.hh, C.HAZ_INSET - margin)) return false;
  for (let xi = Math.floor(x - P.hw); xi <= Math.floor(x + P.hw); xi++) {
    for (let yi = Math.floor(y - margin); yi <= Math.floor(y + margin); yi++) {
      if (yi >= 0 && yi < C.ROWS - 1 && level.solidAt(xi, yi)) return false;
    }
  }
  return true;
}

function pilotFlight(level, start, rnd) {
  const P = C.PLANE;
  const JITTER = 0.04, SIGHT = 0.2, MIN_GAP = 0.13;
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / Math.sqrt(0.5); };
  const s = sim.copyState(start);
  let lastFlap = -999, target = Math.max(1.5, s.y), nextDecision = 0, pending = -1, noise = 0;
  let lo = P.hh, hi = C.ROWS - 1 - P.hh;
  while (!s.dead && !s.done && s.mode === 'plane') {
    const speed = sim.speedOf(s);
    if (s.step >= nextDecision) {
      // Zielhöhe: dort, wo der Weg voraus am längsten frei ist
      const maxD = speed * 1.2;
      let best = -1e9, bestY = target;
      for (let y = 0.5; y <= 8.5; y += 0.25) {
        let run = maxD;
        for (let d = 0; d <= maxD; d += 0.25) {
          if (!flightSafe(level, s.x + 0.5 + d, y, 0.25)) { run = d; break; }
        }
        const score = run - Math.abs(y - s.y) * 0.5 - Math.abs(y - 4.5) * 0.05 - (Math.abs(y - target) > 0.01 ? 0.3 : 0);
        if (score > best) { best = score; bestY = y; }
      }
      target = bestY;
      // freies Höhenband um die Zielhöhe auf der Strecke direkt voraus
      lo = P.hh; hi = C.ROWS - 1 - P.hh;
      for (let x = s.x + 0.2; x <= s.x + speed * 0.9; x += 0.25) {
        if (!flightSafe(level, x, target, 0.05)) continue;
        let a = target, b = target;
        while (a - 0.1 >= P.hh && flightSafe(level, x, a - 0.1, 0.05)) a -= 0.1;
        while (b + 0.1 <= C.ROWS - 1 - P.hh && flightSafe(level, x, b + 0.1, 0.05)) b += 0.1;
        if (a > lo) lo = a;
        if (b < hi) hi = b;
      }
      noise = gauss() * SIGHT;
      nextDecision = s.step + Math.round(0.07 * SPS);
    }
    let center = Math.min(Math.max(target, lo + 0.8), hi - 0.95);
    if (hi - lo < 1.8) center = (lo + hi) / 2 + 0.1;
    const y = s.y + noise, predY = y + s.vy * 0.06;
    let want = false;
    if (y < lo + 0.25) want = true;
    else if (y < center - 1.1) want = y + 1.14 < hi - 0.05;
    else if (predY < center - 0.5 && s.vy < 1.5) want = (y + 1.14 < hi - 0.05) || y < lo + 0.4;
    if (want && pending < 0 && s.step - lastFlap > MIN_GAP * SPS) {
      pending = s.step + Math.round((0.02 + rnd() * 2 * JITTER) * SPS);
    }
    let press = false;
    if (pending >= 0 && s.step >= pending) { press = true; lastFlap = s.step; pending = -1; }
    sim.step(level, s, press, false);
  }
  return !s.dead;
}

function flightPassRates(level, presses) {
  const set = new Set(presses);
  const s = sim.createState();
  const starts = [];
  let mode = s.mode;
  while (!s.dead && !s.done) {
    sim.step(level, s, set.has(s.step), false);
    if (s.mode !== mode) {
      mode = s.mode;
      if (mode === 'plane') starts.push(sim.copyState(s));
    }
  }
  const TRIALS = 60;
  return starts.map((st, i) => {
    const rnd = seeded(1000 + i * 77);
    let ok = 0;
    for (let k = 0; k < TRIALS; k++) if (pilotFlight(level, st, rnd)) ok++;
    return { x: st.x, rate: ok / TRIALS };
  });
}

function erf(x) {
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return y;
}

/* ---- Schwierigkeitswertung ----
   Grundidee: Ein Level ist so schwer, wie es unwahrscheinlich ist, alle Stellen
   hintereinander zu schaffen. Jede Stelle bekommt eine Erfolgsquote:
     - Aktion am Boden: Chance, das Zeitfenster zu treffen (Tippfehler ±40 ms)
     - Flugabschnitt:   Anteil geglückter Flüge des unpräzisen Piloten
     - Flug auf Zeit im Trickmodus: pauschal
   Die Aufwände (−ln der Quoten) werden addiert – lange Level sammeln also von
   selbst mehr an – und dazu kommt ein kleiner Ausdauer-Zuschlag pro Sekunde.
   Das Ergebnis wird auf eine Skala von 1 bis 10 abgebildet. */
function rate(level, presses, seconds) {
  const SIGMA = 40;
  const wins = actionWindows(level, presses);
  let effort = 0;
  for (const w of wins) {
    const p = erf(w.ms / (2 * Math.SQRT2 * SIGMA));
    effort += -Math.log(Math.max(0.02, p)) + (w.clicks > 1 ? 0.03 : 0);
  }
  const flights = flightPassRates(level, presses);
  for (const f of flights) effort += -Math.log(Math.max(0.05, Math.min(0.995, f.rate)));
  let timedFlights = 0;
  replay(level, presses, { onPress: s => { if (s.mode === 'trick' && s.fly === 0 && s.chain === 2 && s.chainT > 0) timedFlights++; } });
  effort += timedFlights * 0.12;
  effort += seconds * 0.012;
  const score = Math.max(1, Math.min(10, 1 + 9 * (1 - Math.exp(-effort / 4))));
  const sorted = wins.map(w => w.ms).sort((a, b) => a - b);
  return {
    score: Math.round(score * 10) / 10,
    effort,
    wins,
    flights,
    timedFlights,
    minWindow: sorted.length ? sorted[0] : null,
    medianWindow: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
  };
}

// Text-Bild eines Level-Ausschnitts mit eingezeichneter Flugbahn
function ascii(level, xFrom, xTo, trace) {
  const rows = [];
  const marks = new Map();
  if (trace) {
    for (const p of trace) {
      const key = Math.floor(p.x) + ',' + Math.floor(p.y);
      if (!marks.has(key)) marks.set(key, p.mark);
    }
  }
  const PICK = { boost: 'J', double: 'D', shield: 'S' };
  for (let y = C.ROWS - 1; y >= 0; y--) {
    let line = '';
    for (let x = xFrom; x < xTo; x++) {
      let ch = marks.get(x + ',' + y) || ' ';
      if (level.solidAt(x, y)) ch = '#';
      const its = level.items[x];
      if (its) {
        for (const it of its) {
          if (it.type === 'spike' && it.y === y) ch = /own/.test(it.kind) ? 'v' : '^';
          if (it.type === 'saw' && Math.floor(it.cy) === y) ch = it.r > 0.6 ? 'O' : 'o';
          if (it.type === 'pickup' && Math.floor(it.cy) === y) ch = PICK[it.kind];
          if (it.type === 'portal' && it.y === y) {
            ch = it.kind === 'mode' ? { plane: 'P', cube: 'C', trick: 'T' }[it.mode] : String(it.speed + 1);
          }
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

function analyse(def, opts) {
  const level = WF.buildLevel(def);
  const report = { id: def.id, name: def.name, ok: false };
  const t0 = Date.now();

  // Größten Sicherheitsabstand im Flug suchen, mit dem das Level noch lösbar ist
  let found = null;
  const blocked = {};
  for (const inflate of [0.3, 0.2, 0.1, 0]) {
    const res = solve(level, inflate);
    if (res.ok) { found = { inflate, res }; break; }
    blocked[inflate] = res.reachedX;
  }
  if (!found) {
    const x = Math.floor(blocked[0]);
    console.log('\n✗ ' + def.id + ' "' + def.name + '": NICHT lösbar – Bot scheitert bei x ≈ ' + x);
    console.log(ascii(level, Math.max(0, x - 40), x + 20));
    return report;
  }

  const presses = found.res.presses;
  const check = replay(level, presses, { trace: opts.show });
  if (!check.s.done || check.s.dead) throw new Error('Wiedergabe der Lösung scheitert: ' + def.id);
  report.ok = true;
  report.presses = presses;
  report.seconds = check.s.step / SPS;

  let line = '\n✓ ' + def.id + ' "' + def.name + '": lösbar – ' + report.seconds.toFixed(1) + ' s, ' +
    level.finishX + ' Felder, ' + presses.length + ' Klicks, Abstand im Flug ' + found.inflate.toFixed(1);
  if (!opts.quick) {
    const r = rate(level, presses, report.seconds);
    report.rating = r;
    line += '\n  Schwierigkeit ' + r.score.toFixed(1) + ' (Aufwand ' + r.effort.toFixed(2) + ')' +
      (r.minWindow ? ' · Zeitfenster: kleinstes ' + r.minWindow.toFixed(0) + ' ms, Median ' + r.medianWindow.toFixed(0) + ' ms' : '') +
      (r.flights.length ? ' · Flüge: ' + r.flights.map(f => Math.round(f.rate * 100) + ' %').join(', ') : '') +
      (r.timedFlights ? ' · ' + r.timedFlights + '× Flug auf Zeit' : '');
    const tight = r.wins.filter(w => w.ms < 90).sort((a, b) => a.ms - b.ms).slice(0, 8);
    for (const w of tight) {
      line += '\n    knapp: ' + w.ms.toFixed(0) + ' ms bei x≈' + w.x.toFixed(0) + ' (' + C.SPEED_NAMES[w.speedIdx] + ', ' + w.mode + ')';
    }
  }
  if (found.inflate < 0.3) {
    line += '\n  Engstellen im Flug: ' + Object.keys(blocked).map(k => 'Abstand ' + k + ' → x≈' + Math.floor(blocked[k])).join(', ');
  }
  console.log(line + '\n  (' + (Date.now() - t0) + ' ms Rechenzeit)');
  if (opts.show) {
    for (let x = 0; x < level.finishX + 6; x += 100) {
      console.log('\n' + ascii(level, x, Math.min(level.width, x + 100), check.trace));
    }
  }
  return report;
}

function writeDemos(reports) {
  const lines = [];
  lines.push('/* Würfelflug – Ergebnisse des Prüf-Bots: Lösungen (für die Demo) und Schwierigkeitswertung.');
  lines.push('   AUTOMATISCH ERZEUGT von tools/solve.js – nach Level-Änderungen neu erzeugen:');
  lines.push('     node tools/solve.js');
  lines.push('   DEMOS: Physikschritte, in denen geklickt wird (als Abstand zum vorigen Klick).');
  lines.push('   RATINGS: score = Schwierigkeit 1–10, seconds = Dauer eines fehlerfreien Durchlaufs. */');
  lines.push('(function (WF) {');
  lines.push("  'use strict';");
  lines.push('  WF.DEMOS = {');
  reports.forEach((r, i) => {
    const deltas = r.presses.map((p, k) => (k === 0 ? p : p - r.presses[k - 1]));
    lines.push('    ' + JSON.stringify(r.id) + ': ' + JSON.stringify(deltas) + (i < reports.length - 1 ? ',' : ''));
  });
  lines.push('  };');
  lines.push('  WF.RATINGS = {');
  reports.forEach((r, i) => {
    const data = { score: r.rating.score, seconds: Math.round(r.seconds * 10) / 10 };
    lines.push('    ' + JSON.stringify(r.id) + ': ' + JSON.stringify(data) + (i < reports.length - 1 ? ',' : ''));
  });
  lines.push('  };');
  lines.push('})(globalThis.WF = globalThis.WF || {});');
  fs.writeFileSync(path.join(root, 'js', 'demos.js'), lines.join('\n') + '\n');
}

function main() {
  const args = process.argv.slice(2);
  const opts = { show: args.includes('--show'), quick: args.includes('--quick') };
  const checkOnly = args.includes('--check');
  const ids = args.filter(a => !a.startsWith('--'));
  const defs = WF.LEVEL_DEFS.filter(d => ids.length === 0 || ids.includes(d.id));
  if (defs.length === 0) {
    console.error('Kein Level gefunden. Vorhanden: ' + WF.LEVEL_DEFS.map(d => d.id).join(', '));
    process.exit(2);
  }
  const reports = defs.map(d => analyse(d, opts));
  const failed = reports.filter(r => !r.ok);
  if (failed.length) {
    console.error('\n' + failed.length + ' Level nicht lösbar.');
    process.exit(1);
  }
  if (!opts.quick) {
    console.log('\nRangliste nach Schwierigkeit:');
    reports.slice().sort((a, b) => a.rating.score - b.rating.score).forEach((r, i) => {
      console.log('  ' + String(i + 1).padStart(2) + '. ' + r.rating.score.toFixed(1) + '  ' + r.name + ' (' + r.seconds.toFixed(0) + ' s)');
    });
  }
  if (!checkOnly && !opts.quick && ids.length === 0) {
    writeDemos(reports);
    console.log('\njs/demos.js geschrieben.');
  }
}

module.exports = { solve, replay, actionWindows, rate, ascii };
if (require.main === module) main();
