#!/usr/bin/env node
/* Vorläufiges Hauptspiel im Browser testen.

   Öffnet hauptspiel/index.html, wählt Würfelflug, spielt im Menü des Minispiels
   ein Level (der Bot übernimmt), prüft den Quest-Fortschritt und die Rückkehr.

   Voraussetzung: Playwright (siehe tools/smoke-test.js)
   Aufruf:        node tools/hauptspiel-test.js */
'use strict';

const { createServer } = require('./serve.js');

let chromium;
try {
  chromium = require('playwright').chromium;
} catch (e) {
  console.error('Playwright ist nicht installiert – siehe tools/smoke-test.js.');
  process.exit(2);
}

const results = [];
function check(name, ok, detail) {
  results.push(!!ok);
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? '  (' + detail + ')' : ''));
}

async function main() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;

  const launch = {};
  if (process.env.HTTPS_PROXY) launch.proxy = { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' };
  const browser = await chromium.launch(launch);
  const errors = [];
  function watch(page) {
    page.on('pageerror', e => errors.push('Fehler im Skript: ' + e.message));
    page.on('console', m => {
      if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com|ERR_(INTERNET|NAME|PROXY|TUNNEL|CONNECTION|CERT)/.test(m.text() + ' ' + (m.location().url || ''))) {
        errors.push('Konsole: ' + m.text());
      }
    });
  }
  // ein gemeinsamer Kontext: Hauptspiel und Quest-Buch teilen sich den Speicher
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  watch(page);
  const until = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);

  console.log('Hauptspiel – Browser-Test: ' + base + '/hauptspiel/');
  await page.goto(base + '/hauptspiel/', { waitUntil: 'load' });

  // ---- Auswahl ----
  check('Würfelflug steht zur Auswahl', await page.isVisible('[data-game="wuerfelflug"]') &&
    (await page.textContent('.game-name')).trim() === 'Würfelflug');
  check('Platzhalter für weitere Minispiele ist nicht anwählbar',
    await page.locator('.game.is-soon').count() === 1 && await page.locator('.game.is-soon [data-game]').count() === 0);
  check('offene Quest wird beim Spiel angezeigt', /Der erste Sprung/.test(await page.textContent('.game-quests')));
  check('Spielstand zeigt 0 Erfahrung', (await page.textContent('#statusXp')).trim() === '0');

  // ---- Spielen ----
  await page.click('[data-game="wuerfelflug"]');
  check('Minispiel füllt das Fenster, Auswahl ist ausgeblendet',
    await page.isVisible('#player') && await page.isHidden('#start') && (await page.textContent('#playerTitle')) === 'Würfelflug');
  const frame = await (await page.waitForSelector('iframe.minigame-frame')).contentFrame();
  await frame.waitForFunction(() => globalThis.WF && globalThis.WF.debug, null, { timeout: 10000 });
  check('Würfelflug zeigt sein eigenes Menü',
    await frame.waitForFunction(() => globalThis.WF.debug.state().screen === 'menu', null, { timeout: 10000 }).then(() => true, () => false));
  check('Sitzung läuft', await until(() => (globalThis.HAUPTSPIEL.playing() || {}).state === 'running', null, 5000));

  await frame.click('[data-play="0"]');
  await frame.evaluate(() => { globalThis.WF.debug.set('autopilot', true); globalThis.WF.debug.set('timeScale', 10); });
  check('Level im Minispiel geschafft: Quest zählt',
    await until(() => globalThis.HAUPTSPIEL.log().status('wf.erster-sprung') === 'completed', null, 30000));
  check('Meldung „Quest geschafft“ erscheint', await page.isVisible('.toast >> text=Quest geschafft'));
  await frame.waitForFunction(() => globalThis.WF.debug.state().screen === 'complete', null, { timeout: 10000 });
  check('frei gespielt: Knopf im Minispiel heißt weiter „Zum Menü“, „Nächstes Level“ ist da',
    (await frame.textContent('#btnMenu')).trim() === 'Zum Menü' && await frame.isVisible('#btnNext'));

  // ---- Zurück ----
  await page.click('#btnBack');
  check('„Zurück“ schließt das Minispiel',
    await until(() => !globalThis.HAUPTSPIEL.playing() && !document.querySelector('iframe') && !document.getElementById('start').hidden, null, 5000));
  check('Spielstand ist aktualisiert', (await page.textContent('#statusXp')).trim() === '50');
  check('nächste Quests erscheinen nicht als offen, solange nicht angenommen', await page.locator('.game-quests').count() === 0);

  // ---- Gemeinsamer Spielstand mit dem Quest-Buch ----
  const hub = await context.newPage();
  watch(hub);
  await hub.goto(base + '/hub/', { waitUntil: 'load' });
  check('Quest-Buch kennt den Fortschritt aus dem Hauptspiel',
    await hub.evaluate(() => globalThis.HUB.log().status('wf.erster-sprung')) === 'completed');
  await hub.click('[data-accept="wf.glanzkugeln"]');
  check('Quest im Quest-Buch angenommen: Hauptspiel zeigt sie beim Spiel',
    await until(() => /Glänzende Kugeln/.test((document.querySelector('.game-quests') || {}).textContent || ''), null, 5000));
  await hub.close();

  // ---- Handy ----
  const phone = await browser.newPage({ viewport: { width: 375, height: 740 } });
  watch(phone);
  await phone.goto(base + '/hauptspiel/', { waitUntil: 'load' });
  check('auf dem Handy kein seitliches Scrollen',
    await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await phone.close();

  check('keine Fehler in der Browser-Konsole', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(ok => !ok).length;
  console.log(failed ? '\n' + failed + ' von ' + results.length + ' Prüfungen fehlgeschlagen.' : '\nAlle ' + results.length + ' Prüfungen bestanden.');
  process.exit(failed ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
