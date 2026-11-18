#!/usr/bin/env node
/* Kurvenfieber – Test im echten Browser.

   Startet das Rennspiel in einem unsichtbaren Chromium (WebGL per Software) und prüft:
   Menü und Demo-Rennen, Countdown, Gas und Lenken per Tastatur, Pause, Ziel und
   Ergebnis, Bestwert im Menü, Streckenwechsel und Touch-Tasten.

   Voraussetzung: Playwright (siehe tools/smoke-test.js)
   Aufruf:        node tools/smoke-test-rennen.js [URL oder Datei] */
'use strict';

const path = require('path');
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
  results.push({ name, ok: !!ok });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? '  (' + detail + ')' : ''));
}

async function main() {
  let server = null;
  let url = process.argv[2];
  if (!url) {
    server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = 'http://127.0.0.1:' + server.address().port + '/rennen/';
  } else if (!/^[a-z]+:\/\//i.test(url)) {
    url = 'file://' + path.resolve(url);
  }

  const launch = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  if (process.env.HTTPS_PROXY) launch.proxy = { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' };
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('Fehler im Skript: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com|ERR_(INTERNET|NAME|PROXY|TUNNEL|CONNECTION|CERT)/.test(m.text() + ' ' + (m.location().url || ''))) {
      errors.push('Konsole: ' + m.text());
    }
  });
  const state = () => page.evaluate(() => globalThis.RR.debug.state());
  const until = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);
  const visible = sel => page.isVisible(sel);

  console.log('Kurvenfieber – Browser-Test: ' + url);
  await page.goto(url, { waitUntil: 'load' });

  // Menü mit Demo-Rennen
  check('Menü sichtbar', await visible('#menu'));
  check('drei Strecken zur Auswahl', (await page.$$('.track-card')).length === 3);
  let s = await state();
  check('im Hintergrund läuft ein Rennen der Computer', s.attract && s.phase === 'race');
  const t0 = s.time;
  await page.waitForTimeout(800);
  check('Demo-Rennen läuft weiter', (await state()).time > t0);

  // Rennen starten
  await page.click('#btnStart');
  s = await state();
  check('Rennen startet mit Countdown', s.screen === 'race' && s.phase === 'countdown', 'Platz ' + (s.me && s.me.place));
  check('Anzeige sichtbar, Menü weg', await visible('#hud') && !(await visible('#menu')));
  await page.keyboard.down('ArrowUp');
  check('Countdown endet, das Rennen läuft', await until(() => globalThis.RR.debug.state().phase === 'race', null, 60000));
  check('Gas gibt Tempo', await until(() => globalThis.RR.debug.state().me.v > 2, null, 30000));
  await page.keyboard.down('ArrowLeft');
  const d0 = (await state()).me.d;
  await until(() => globalThis.RR.debug.state().time > 0, null, 5000);
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  const d1 = (await state()).me.d;
  check('Lenken nach links verschiebt das Auto nach links', d1 > d0, 'd ' + d0.toFixed(2) + ' → ' + d1.toFixed(2));

  // Pause
  await page.keyboard.press('KeyP');
  check('P öffnet die Pause', await visible('#pause'));
  const tp = (await state()).time;
  await page.waitForTimeout(500);
  check('in der Pause steht die Zeit', (await state()).time === tp);
  await page.click('#btnResume');
  check('Weiter schließt die Pause', !(await visible('#pause')));

  // Kamera wechseln
  await page.keyboard.press('KeyC');
  check('C wechselt die Kamera', await page.evaluate(() => JSON.parse(localStorage.getItem('kurvenfieber.v1')).cam === 'hood'));
  await page.keyboard.press('KeyC');

  // Ziel: Spieler kurz vor die Linie setzen und den Rest vom Computer fahren lassen
  await page.evaluate(() => { globalThis.RR.debug.nearFinish(); globalThis.RR.debug.advance(3); });
  s = await state();
  check('Spieler kommt ins Ziel', s.me.finished, 'Platz ' + s.me.place);
  await page.evaluate(() => globalThis.RR.debug.advance(400));
  check('Ergebnis erscheint', await until(() => !document.getElementById('result').hidden, null, 30000));
  const rows = await page.$$eval('#resultRows tr', r => r.length);
  check('Ergebnis listet alle sechs Fahrer', rows === 6);
  const title = await page.textContent('#resultTitle');
  check('Ergebnis nennt den Platz', /Platz|Sieg/.test(title), title);

  // Nochmal, dann ins Menü
  await page.click('#btnAgain');
  s = await state();
  check('Nochmal startet ein neues Rennen', s.screen === 'race' && s.phase === 'countdown');
  await page.keyboard.press('Escape');
  await page.click('#btnQuit');
  check('Zum Menü', await visible('#menu'));
  check('Bestrunde steht im Menü', /Bestrunde/.test(await page.textContent('.track-card[data-i="0"]')));

  // andere Strecken
  for (const i of [1, 2]) {
    await page.click('.track-card[data-i="' + i + '"]');
    s = await state();
    check('Strecke ' + s.track + ' lädt', s.attract && s.track === ['Sonnenküste', 'Bergpass', 'Nachtstadt'][i]);
  }
  await page.click('#btnStart');
  await page.evaluate(() => globalThis.RR.debug.advance(30));
  s = await state();
  check('Nachtstadt: Computer-Fahrer kommt voran', s.me.dist > 400, Math.round(s.me.dist) + ' m');

  // Touch
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  phone.on('pageerror', e => errors.push('Fehler im Skript (Handy): ' + e.message));
  await phone.goto(url, { waitUntil: 'load' });
  await phone.tap('#btnStart');
  check('Handy: Touch-Tasten sichtbar', await phone.isVisible('.tbtn-gas'));
  await phone.evaluate(() => globalThis.RR.debug.advance(4));
  const gas = await phone.$('.tbtn-gas');
  const box = await gas.boundingBox();
  await phone.dispatchEvent('.tbtn-gas', 'pointerdown', { pointerId: 1, clientX: box.x + 10, clientY: box.y + 10 });
  const ok = await phone.waitForFunction(() => globalThis.RR.debug.state().me.v > 1, null, { timeout: 30000 }).then(() => true, () => false);
  check('Handy: Gas-Taste gibt Tempo', ok);
  check('Handy: ohne Wischen kein Turbo', !(await phone.evaluate(() => globalThis.RR.debug.state().me.turboOn)));
  await phone.dispatchEvent('.tbtn-gas', 'pointermove', { pointerId: 1, clientX: box.x + 10, clientY: box.y - 50 });
  await phone.waitForFunction(() => globalThis.RR.debug.state().me.turbo < 0.99, null, { timeout: 30000 }).catch(() => {});
  let st = await phone.evaluate(() => globalThis.RR.debug.state().me);
  check('Handy: Gas drücken und nach oben wischen zündet den Turbo', st.turboOn && st.turbo < 1, 'Turbo ' + Math.round(st.turbo * 100) + ' %');
  check('Handy: Gaspedal zeigt den Turbo an', await phone.$eval('.tbtn-gas', b => b.classList.contains('turbo')));
  await phone.dispatchEvent('.tbtn-gas', 'pointermove', { pointerId: 1, clientX: box.x + 10, clientY: box.y + 10 });
  await phone.waitForFunction(() => !globalThis.RR.debug.state().me.turboOn, null, { timeout: 30000 }).catch(() => {});
  st = await phone.evaluate(() => globalThis.RR.debug.state().me);
  check('Handy: Finger zurück nach unten schaltet den Turbo ab, Gas bleibt', !st.turboOn && st.v > 1);
  await phone.dispatchEvent('.tbtn-gas', 'pointerup', { pointerId: 1 });
  const sizes = await phone.$$eval('.tbtn', bs => bs.map(b => { const r = b.getBoundingClientRect(); return [b.dataset.key, Math.round(r.width), Math.round(r.height), Math.round(r.left), Math.round(r.right)]; }));
  const overlap = sizes.some((a, i) => sizes.some((b, j) => i < j && a[3] < b[4] && b[3] < a[4]));
  check('Handy: Tasten groß genug und ohne Überlappung', !overlap && sizes.every(x => x[1] >= 76 && x[2] >= 96 && x[3] >= 0 && x[4] <= 390), sizes.map(x => x[0] + ' ' + x[1] + '×' + x[2]).join(', '));
  await phone.close();

  check('keine Fehler im Browser', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  if (server) server.close();

  const failed = results.filter(r => !r.ok).length;
  console.log(failed ? '\n' + failed + ' von ' + results.length + ' Prüfungen fehlgeschlagen.' : '\nAlle ' + results.length + ' Prüfungen bestanden.');
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
