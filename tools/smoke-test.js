#!/usr/bin/env node
/* Würfelflug – Test im echten Browser.

   Startet das Spiel in einem unsichtbaren Chromium und prüft die wichtigsten
   Abläufe: Menü, Springen per Klick und Leertaste, Tod und Neustart, Pause,
   Zielbildschirm, Statistik, Übungsmodus mit Checkpoint, Augments, Trickmodus
   und die Demo aller Level.

   Voraussetzung: Playwright  (npm install --no-save playwright && npx playwright install chromium)
   Aufruf:        node tools/smoke-test.js [URL oder Datei]
                  ohne Angabe wird das Spiel aus diesem Ordner getestet. */
'use strict';

const path = require('path');
const { createServer } = require('./serve.js');

let chromium;
try {
  chromium = require('playwright').chromium;
} catch (e) {
  console.error('Playwright ist nicht installiert – siehe Kommentar am Anfang dieser Datei.');
  process.exit(2);
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? '  (' + detail + ')' : ''));
}

async function main() {
  let server = null;
  let url = process.argv[2];
  if (!url) {
    server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = 'http://127.0.0.1:' + server.address().port + '/';
  } else if (!/^[a-z]+:\/\//i.test(url)) {
    url = 'file://' + path.resolve(url);
  }

  const launch = {};
  if (process.env.HTTPS_PROXY) launch.proxy = { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' };
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('Fehler im Skript: ' + e.message));
  page.on('console', m => {
    // fehlende Webschrift (kein Netz) ist kein Fehler des Spiels
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com|ERR_(INTERNET|NAME|PROXY|TUNNEL|CONNECTION|CERT)/.test(m.text() + ' ' + (m.location().url || ''))) {
      errors.push('Konsole: ' + m.text());
    }
  });

  const state = () => page.evaluate(() => globalThis.WF.debug.state());
  const until = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);
  const set = (key, value) => page.evaluate(([k, v]) => globalThis.WF.debug.set(k, v), [key, value]);

  console.log('Würfelflug – Browser-Test: ' + url);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  // ---- Menü ----
  let s = await state();
  check('Menü wird angezeigt', s.screen === 'menu' && await page.isVisible('#menu'));
  const ids = s.levelIds;
  check('zehn Level stehen zur Auswahl, das leichteste zuerst', await page.locator('.level-main').count() === 10 && ids[0] === 'l1');
  const x0 = s.x;
  await page.waitForTimeout(700);
  s = await state();
  check('im Hintergrund läuft die Demo', s.demo && s.x > x0 + 2, 'x ' + x0.toFixed(1) + ' → ' + s.x.toFixed(1));

  // ---- Spielen: ohne Eingabe stirbt der Würfel am ersten Stachel und startet neu ----
  await page.click('[data-play="0"]');
  s = await state();
  check('Level 1 startet', s.screen === 'play' && !s.demo && s.level === 'l1' && await page.isVisible('#hud'));
  check('ohne Klick: Tod am ersten Stachel, automatischer Neustart',
    await until(() => globalThis.WF.debug.state().attempts === 2 && globalThis.WF.debug.state().phase === 'run', null, 9000));

  // ---- Springen per Klick und per Leertaste ----
  const box = await page.locator('#stage').boundingBox();
  let before = (await state()).jumps;
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);
  check('Klick lässt den Würfel springen',
    await until(j => { const d = globalThis.WF.debug.state(); return d.jumps > j && d.y > 0.8; }, before, 2000));
  await until(() => globalThis.WF.debug.state().y <= 0.5 && globalThis.WF.debug.state().phase === 'run', null, 3000);
  before = (await state()).jumps;
  await page.keyboard.press('Space');
  check('Leertaste lässt den Würfel springen',
    await until(j => globalThis.WF.debug.state().jumps > j, before, 2000));

  // ---- Pause ----
  await page.keyboard.press('KeyP');
  s = await state();
  const pausedX = s.x;
  await page.waitForTimeout(400);
  check('P pausiert das Spiel', s.screen === 'pause' && (await state()).x === pausedX && await page.isVisible('#pause'));
  await page.click('#btnResume');
  check('"Weiter" setzt fort', (await state()).screen === 'play');

  // ---- Stummschalten ----
  await page.keyboard.press('KeyM');
  check('M schaltet den Ton stumm', (await state()).muted === true &&
    await page.getAttribute('#btnSound', 'aria-pressed') === 'true');
  await page.keyboard.press('KeyM');

  // ---- Level durchspielen (der Bot übernimmt die Eingabe, 10-fache Geschwindigkeit) ----
  await page.keyboard.press('KeyR');
  await set('autopilot', true);
  await set('timeScale', 10);
  const done = await until(() => globalThis.WF.debug.state().screen === 'complete', null, 30000);
  s = await state();
  check('Level 1 wird bis ins Ziel gespielt', done && s.done && !s.dead, Math.round(s.pct) + ' %');
  check('Zielbildschirm zeigt Versuche, Klicks und Zeit', await page.isVisible('#complete') &&
    /\d/.test(await page.textContent('#statClicks')) && /s$/.test(await page.textContent('#statTime')));
  check('Bestwert wird gespeichert', s.best && s.best.l1 === 100);
  await page.click('#btnNext');
  s = await state();
  check('"Nächstes Level" startet das nächstschwerere Level', s.screen === 'play' && s.levelIdx === 1 && s.level === ids[1]);

  // ---- Augments: im Level "Sprungfeder" werden Sprungkraft, Doppelsprung und Schild eingesammelt ----
  await page.keyboard.press('Escape');
  await page.click('#btnQuit');
  await page.click('[data-play="' + ids.indexOf('l4') + '"]');
  const shielded = await until(() => globalThis.WF.debug.state().shield === 1, null, 30000);
  const l4done = await until(() => globalThis.WF.debug.state().screen === 'complete', null, 30000);
  s = await state();
  check('Augments werden eingesammelt und wirken (Level mit Sprungkraft, Doppelsprung, Schild)',
    shielded && l4done && s.taken === 7 && s.shield === 0, 'eingesammelt: Bitmaske ' + s.taken);
  await page.click('#btnMenu');

  // ---- Trickmodus mit echten Klicks: Doppelklick dreht die Schwerkraft, Dreifachklick fliegt ----
  await set('timeScale', 4);
  await page.click('[data-play="' + ids.indexOf('l5') + '"]');
  await until(() => globalThis.WF.debug.state().mode === 'trick', null, 30000);
  await set('autopilot', false);
  await set('timeScale', 1);
  const clicks = async n => {
    for (let k = 0; k < n; k++) {
      await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);
      if (k < n - 1) await page.waitForTimeout(90);
    }
  };
  await clicks(2);
  const flipped = await until(() => globalThis.WF.debug.state().grav === -1, null, 1500);
  await page.waitForTimeout(450);
  await clicks(3);
  const flew = await until(() => globalThis.WF.debug.state().fly > 0, null, 1500);
  check('echter Doppelklick dreht die Schwerkraft, echter Dreifachklick startet den Flug', flipped && flew);
  await set('autopilot', true);
  await set('timeScale', 10);
  await page.keyboard.press('Escape');
  await page.click('#btnQuit');
  await page.click('[data-play="1"]');

  // ---- zurück ins Menü ----
  await set('autopilot', false);
  await set('timeScale', 1);
  await page.keyboard.press('Escape');
  await page.click('#btnQuit');
  check('zurück im Menü, Level 1 ist als geschafft markiert', (await state()).screen === 'menu' &&
    /geschafft/.test(await page.textContent('#levelBest0')));

  // ---- Statistik und Spielregeln ----
  await page.click('#btnStats');
  s = await state();
  const grid = await page.textContent('#statsGrid');
  check('Statistik zeigt geschaffte Level, Spielzeit und Versuche', await page.isVisible('#stats') &&
    /Geschaffte Level\s*2 \/ 10/.test(grid) && /Spielzeit/.test(grid) && s.stats.tries >= 3 && s.stats.wins === 2,
    s.stats.tries + ' Versuche, ' + s.stats.wins + ' Siege, Ø ' + Math.round(s.stats.pct / s.stats.tries) + ' %');
  check('Statistik listet alle zehn Level', await page.locator('#statsRows tr').count() === 10);
  await page.click('#btnStatsClose');
  await page.click('#btnRules');
  check('Spielregeln lassen sich öffnen', await page.isVisible('#rules') && /Trickmodus/.test(await page.textContent('#rules')));
  await page.click('#btnRulesClose');

  // ---- Übungsmodus: nach dem Tod geht es am Fähnchen weiter ----
  await page.check('#optPractice');
  await set('autopilot', true);
  await set('timeScale', 10);
  await page.click('[data-play="0"]');
  const reached = await until(() => globalThis.WF.debug.state().cpIndex >= 1, null, 20000);
  await set('autopilot', false);
  await set('timeScale', 4);
  const tries = (await state()).attempts;
  const respawned = await until(t => {
    const d = globalThis.WF.debug.state();
    return d.attempts > t && d.phase !== 'dead';
  }, tries, 20000);
  s = await state();
  check('Übungsmodus: Neustart am Checkpoint statt am Anfang', reached && respawned && s.practice && s.x > 60,
    'weiter bei x ≈ ' + s.x.toFixed(0));
  await set('timeScale', 1);
  await page.keyboard.press('Escape');
  await page.click('#btnQuit');
  await page.uncheck('#optPractice');

  // ---- Demo: der Bot spielt jedes Level bis ins Ziel ----
  for (let i = 0; i < ids.length; i++) {
    await set('timeScale', 10);
    await page.click('[data-demo="' + i + '"]');
    if (ids[i] === 'l5') {
      check('Trickmodus: Doppelklick dreht die Schwerkraft, Dreifachklick fliegt',
        await until(() => globalThis.WF.debug.state().grav === -1, null, 20000) &&
        await until(() => globalThis.WF.debug.state().fly > 0, null, 30000));
    }
    const finished = await until(() => {
      const d = globalThis.WF.debug.state();
      return d.demo && d.screen === 'play' && d.done;
    }, null, 60000);
    s = await state();
    check('Demo von Level ' + (i + 1) + ' (' + ids[i] + ') erreicht das Ziel', finished && !s.dead, Math.round(s.pct) + ' %');
    await until(() => globalThis.WF.debug.state().screen === 'menu', null, 10000);
  }
  await set('timeScale', 1);

  check('keine Fehler in der Browser-Konsole', errors.length === 0, errors.join(' | '));

  await browser.close();
  if (server) server.close();
  const failed = results.filter(r => !r.ok);
  console.log(failed.length ? '\n' + failed.length + ' von ' + results.length + ' Prüfungen fehlgeschlagen.' :
    '\nAlle ' + results.length + ' Prüfungen bestanden.');
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
