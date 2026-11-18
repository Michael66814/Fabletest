#!/usr/bin/env node
/* Quest-Buch und Minispiel zusammen im Browser testen.

   Öffnet hub/index.html, startet Würfelflug über eine Quest im <iframe>, lässt den
   Bot spielen und prüft, dass Ereignisse ankommen, Quests fertig werden, Belohnungen
   gutgeschrieben und Sitzungen sauber beendet werden.

   Voraussetzung: Playwright (siehe tools/smoke-test.js)
   Aufruf:        node tools/hub-test.js */
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
  const url = 'http://127.0.0.1:' + server.address().port + '/hub/';

  const launch = {};
  if (process.env.HTTPS_PROXY) launch.proxy = { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' };
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push('Fehler im Skript: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com|ERR_(INTERNET|NAME|PROXY|TUNNEL|CONNECTION|CERT)/.test(m.text() + ' ' + (m.location().url || ''))) {
      errors.push('Konsole: ' + m.text());
    }
  });

  const status = id => page.evaluate(i => globalThis.HUB.log().status(i), id);
  const until = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);
  async function gameFrame() {
    await page.waitForSelector('iframe.minigame-frame', { timeout: 5000 });
    const handle = await page.$('iframe.minigame-frame');
    const frame = await handle.contentFrame();
    await frame.waitForFunction(() => globalThis.WF && globalThis.WF.debug, null, { timeout: 10000 });
    return frame;
  }
  const gameState = frame => frame.evaluate(() => globalThis.WF.debug.state());
  const frameUntil = (frame, fn, arg, ms) => frame.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);

  console.log('Quest-Buch – Browser-Test: ' + url);
  await page.goto(url, { waitUntil: 'load' });

  // ---- Start ----
  check('Startquest ist aktiv, Folgequests gesperrt',
    await status('wf.erster-sprung') === 'active' && await status('wf.glanzkugeln') === 'locked' &&
    await page.isVisible('[data-quest="wf.erster-sprung"] [data-play]'));

  // ---- Quest spielen: Würfelflug startet mit dem Level aus "launch" ----
  await page.click('[data-quest="wf.erster-sprung"] [data-play]');
  let frame = await gameFrame();
  check('Würfelflug startet im iframe direkt in der Aufwärmrunde',
    await frameUntil(frame, () => { const s = globalThis.WF.debug.state(); return s.screen === 'play' && s.level === 'l1' && !s.demo; }));
  check('Minispiel ist als eingebettet markiert',
    await frame.evaluate(() => document.documentElement.classList.contains('is-embedded')));
  const session = await page.evaluate(() => globalThis.HUB.playing());
  check('Sitzung läuft', session && session.state === 'running', session && session.session);

  // Bot spielt das Level, zehnfach schnell
  await frame.evaluate(() => { globalThis.WF.debug.set('autopilot', true); globalThis.WF.debug.set('timeScale', 10); });
  check('Ziel erreicht: Quest ist abgeschlossen',
    await until(() => globalThis.HUB.log().status('wf.erster-sprung') === 'completed', null, 30000));
  const profile = await page.evaluate(() => globalThis.HUB.log().profile());
  check('Belohnung gutgeschrieben', profile.xp === 50 && profile.items.feder === 1, JSON.stringify(profile));
  check('Meldung "Quest geschafft" erscheint', await page.isVisible('.toast >> text=Quest geschafft'));

  await frameUntil(frame, () => globalThis.WF.debug.state().screen === 'complete');
  check('Zielbildschirm: "Nächstes Level" ausgeblendet, Knopf heißt "Zurück"',
    await frame.isHidden('#btnNext') && (await frame.textContent('#btnMenu')).trim() === 'Zurück');
  await frame.click('#btnMenu');
  check('"Zurück" beendet die Sitzung und schließt das Minispiel',
    await until(() => !globalThis.HUB.playing() && document.getElementById('player').hidden && !document.querySelector('iframe'), null, 5000));
  check('Folgequests sind jetzt verfügbar', await status('wf.glanzkugeln') === 'available' && await status('wf.trainingslauf') === 'available');

  // ---- Zweite Quest: Fortschritt während des Spiels, Abbruch über das Hauptspiel ----
  await page.click('[data-accept="wf.glanzkugeln"]');
  check('Quest annehmen', await status('wf.glanzkugeln') === 'active');
  await page.click('[data-quest="wf.glanzkugeln"] [data-play]');
  frame = await gameFrame();
  await frameUntil(frame, () => globalThis.WF.debug.state().level === 'l4' && globalThis.WF.debug.state().screen === 'play');
  await frame.evaluate(() => { globalThis.WF.debug.set('autopilot', true); globalThis.WF.debug.set('timeScale', 10); });
  check('eingesammelte Augments zählen schon während des Spiels',
    await until(() => globalThis.HUB.log().get('wf.glanzkugeln').objectives[0].value >= 1, null, 30000),
    'Stand ' + (await page.evaluate(() => globalThis.HUB.log().get('wf.glanzkugeln').objectives[0].value)) + ' / 3');
  await page.click('#btnClose');
  check('"Zurück zum Quest-Buch" bricht ab und schließt das Minispiel',
    await until(() => !globalThis.HUB.playing() && !document.querySelector('iframe'), null, 5000));

  // ---- Startwert practice aus "launch" ----
  await page.click('[data-accept="wf.kopfueber"]');
  await page.click('[data-quest="wf.kopfueber"] [data-play]');
  frame = await gameFrame();
  check('launch.practice schaltet den Übungsmodus ein',
    await frameUntil(frame, () => { const s = globalThis.WF.debug.state(); return s.level === 'l5' && s.practice === true && s.screen === 'play'; }));
  await page.click('#btnClose');
  await until(() => !document.querySelector('iframe'), null, 5000);

  // ---- Frei spielen: Menü erscheint, Demo meldet nichts ----
  const before = JSON.stringify(await page.evaluate(() => globalThis.HUB.log().state()));
  await page.click('#btnFree');
  frame = await gameFrame();
  check('ohne Level erscheint das Menü von Würfelflug',
    await frameUntil(frame, () => globalThis.WF.debug.state().screen === 'menu'));
  await page.waitForTimeout(1500);
  check('Demo im Menü ändert keinen Quest-Fortschritt',
    JSON.stringify(await page.evaluate(() => globalThis.HUB.log().state())) === before);
  await page.click('#btnClose');
  await until(() => !document.querySelector('iframe'), null, 5000);

  // ---- Speichern ----
  await page.reload({ waitUntil: 'load' });
  check('Fortschritt bleibt nach Neuladen erhalten',
    await status('wf.erster-sprung') === 'completed' && await status('wf.glanzkugeln') === 'active' &&
    (await page.evaluate(() => globalThis.HUB.log().profile().xp)) === 50);

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
