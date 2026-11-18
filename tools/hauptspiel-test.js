#!/usr/bin/env node
/* Hauptspiel (3D-Welt) im Browser testen.

   Prüft: Welt startet, Figur läuft per Tastatur und Touch-Joystick, Hindernisse und
   Inselrand halten sie auf, Stationen werden erkannt, Würfelflug startet und zählt
   für Quests, Quest-Tafel nimmt Quests an und startet sie, Baustelle, Speichern der
   Position, gemeinsamer Spielstand mit dem Quest-Buch, Ersatzansicht ohne WebGL.

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
const errors = [];
function watch(page) {
  page.on('pageerror', e => errors.push('Fehler im Skript: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com|ERR_(INTERNET|NAME|PROXY|TUNNEL|CONNECTION|CERT)/.test(m.text() + ' ' + (m.location().url || ''))) {
      errors.push('Konsole: ' + m.text());
    }
  });
}

async function main() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const launch = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  if (process.env.HTTPS_PROXY) launch.proxy = { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' };
  const browser = await chromium.launch(launch);
  // ein gemeinsamer Kontext: Hauptspiel und Quest-Buch teilen sich den Speicher
  const context = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await context.newPage();
  watch(page);

  const st = () => page.evaluate(() => globalThis.HAUPTSPIEL.state());
  const until = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 20000 }).then(() => true, () => false);
  const teleport = (x, z) => page.evaluate(([a, b]) => globalThis.HAUPTSPIEL.teleport(a, b), [x, z]);
  async function gameFrame() {
    const frame = await (await page.waitForSelector('iframe.minigame-frame', { timeout: 5000 })).contentFrame();
    await frame.waitForFunction(() => globalThis.WF && globalThis.WF.debug, null, { timeout: 10000 });
    return frame;
  }

  console.log('Hauptspiel – Browser-Test: ' + base + '/hauptspiel/');
  await page.goto(base + '/hauptspiel/', { waitUntil: 'load' });
  check('3D-Welt startet', await until(() => globalThis.HAUPTSPIEL && document.getElementById('loading').hidden, null, 20000) &&
    await page.isHidden('#fallback'));
  const stations = await page.evaluate(() => globalThis.HAUPTSPIEL.stations());
  check('Stationen: Würfelflug, zwei Baustellen, Quest-Tafel',
    stations.map(s => s.kind).sort().join() === 'baustelle,baustelle,questtafel,spiel', stations.map(s => s.id).join(' '));
  check('Namensschilder über den Stationen', await page.locator('.label').count() === 4 &&
    await until(() => [...document.querySelectorAll('.label')].some(l => +l.style.opacity > 0.5 && /Würfelflug/.test(l.textContent)), null, 5000));
  check('Hilfe zur Steuerung ist zu sehen', await page.isVisible('#helpKeys'));

  // ---- Laufen ----
  await page.mouse.click(640, 600);
  let s = await st();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyW');
  let s2 = await st();
  check('W läuft vorwärts (von der Kamera weg)', s2.z < s.z - 0.5 && Math.abs(s2.x - s.x) < 0.3, 'z ' + s.z.toFixed(1) + ' → ' + s2.z.toFixed(1));
  s = s2;
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyD');
  s2 = await st();
  check('D läuft nach rechts, die Figur dreht sich mit', s2.x > s.x + 0.3 && Math.abs(s2.angle - Math.PI / 2) < 0.6, 'x ' + s.x.toFixed(1) + ' → ' + s2.x.toFixed(1));

  // Kamera drehen mit der Maus
  const yaw0 = (await st()).camYaw;
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(540, 400, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  check('Maus ziehen dreht die Kamera', Math.abs((await st()).camYaw - yaw0) > 0.3);

  // ---- Hindernisse und Rand ----
  await teleport(0.3, 0.5);
  await until(() => { const d = globalThis.HAUPTSPIEL.state(); return Math.hypot(d.x, d.z) >= 2.9; }, null, 3000);
  s = await st();
  check('Brunnen ist ein Hindernis', Math.hypot(s.x, s.z) >= 2.9, 'Abstand ' + Math.hypot(s.x, s.z).toFixed(2));
  await teleport(0, 45);
  await until(() => { const d = globalThis.HAUPTSPIEL.state(); return Math.hypot(d.x, d.z) <= 29.01; }, null, 3000);
  s = await st();
  check('Figur bleibt auf der Insel', Math.hypot(s.x, s.z) <= 29.01, 'Abstand ' + Math.hypot(s.x, s.z).toFixed(2));

  // ---- Würfelflug-Station ----
  const wf = stations.find(x => x.id === 'wuerfelflug');
  await teleport(wf.x, wf.z + 4.5);
  check('an der Station erscheint „Würfelflug spielen“',
    await until(() => globalThis.HAUPTSPIEL.state().near === 'wuerfelflug', null, 3000) &&
    await page.isVisible('#prompt') && /Würfelflug spielen/.test(await page.textContent('#prompt')));
  await page.keyboard.press('KeyE');
  let frame = await gameFrame();
  check('E startet Würfelflug im Vollbild, die Welt ruht',
    await page.isVisible('#player') && (await st()).paused &&
    await frame.waitForFunction(() => globalThis.WF.debug.state().screen === 'menu', null, { timeout: 10000 }).then(() => true, () => false));
  await frame.click('[data-play="0"]');
  await frame.evaluate(() => { globalThis.WF.debug.set('autopilot', true); globalThis.WF.debug.set('timeScale', 10); });
  check('Level geschafft: Quest zählt',
    await until(() => globalThis.HAUPTSPIEL.log().status('wf.erster-sprung') === 'completed', null, 30000));
  check('Meldung „Quest geschafft“', await page.isVisible('.toast >> text=Quest geschafft'));
  await page.click('#btnBack');
  check('„Zurück zur Insel“ schließt das Minispiel, die Welt läuft weiter',
    await until(() => !globalThis.HAUPTSPIEL.playing() && !document.querySelector('iframe') && !globalThis.HAUPTSPIEL.state().paused, null, 5000));
  check('Erfahrung in der Anzeige', (await page.textContent('#hudXp')).trim() === '50');
  check('Anzeige meldet neue Quests', /neu/.test(await page.textContent('#btnQuests')));

  // ---- Quest-Tafel ----
  const qt = stations.find(x => x.id === 'questtafel');
  await teleport(qt.x * 0.7, qt.z * 0.7);
  check('an der Quest-Tafel erscheint „Quest-Tafel ansehen“',
    await until(() => globalThis.HAUPTSPIEL.state().near === 'questtafel', null, 3000));
  await page.click('#prompt');
  check('Klick öffnet die Quest-Tafel mit neuen Quests',
    await page.isVisible('#questPanel') && await page.isVisible('[data-accept="wf.glanzkugeln"]'));
  s = await st();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyW');
  s2 = await st();
  check('solange die Tafel offen ist, bleibt die Figur stehen', s2.x === s.x && s2.z === s.z);
  await page.click('[data-accept="wf.glanzkugeln"]');
  check('Quest annehmen', await until(() => globalThis.HAUPTSPIEL.log().status('wf.glanzkugeln') === 'active', null, 2000) &&
    await page.isVisible('[data-quest="wf.glanzkugeln"] [data-play]'));
  await page.click('[data-quest="wf.glanzkugeln"] [data-play]');
  frame = await gameFrame();
  check('„Spielen“ auf der Tafel startet das passende Level',
    await frame.waitForFunction(() => { const d = globalThis.WF.debug.state(); return d.screen === 'play' && d.level === 'l4'; }, null, { timeout: 10000 }).then(() => true, () => false) &&
    await page.isHidden('#questPanel'));
  await page.click('#btnBack');
  await until(() => !document.querySelector('iframe'), null, 5000);
  await page.keyboard.press('Escape');

  // ---- Baustelle ----
  const bs = stations.find(x => x.kind === 'baustelle');
  await teleport(bs.x * 0.75, bs.z * 0.75);
  const atSite = await until(([id]) => globalThis.HAUPTSPIEL.state().near === id, [bs.id], 5000);
  check('an der Baustelle erscheint „Baustelle ansehen“', atSite && /Baustelle ansehen/.test(await page.textContent('#prompt')), JSON.stringify(await st()));
  await page.keyboard.press('KeyE');
  check('Baustelle meldet „bald verfügbar“', await until(() => [...document.querySelectorAll('.toast')].some(t => /bald ein neues Minispiel/.test(t.textContent)), null, 3000) &&
    !(await page.evaluate(() => globalThis.HAUPTSPIEL.playing())));

  // ---- Position wird gespeichert ----
  await teleport(-4, 12);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload({ waitUntil: 'load' });
  await until(() => globalThis.HAUPTSPIEL, null, 20000);
  s = await st();
  check('nach dem Neuladen steht die Figur wieder dort', Math.abs(s.x + 4) < 0.6 && Math.abs(s.z - 12) < 0.6, s.x.toFixed(1) + ', ' + s.z.toFixed(1));

  // ---- gemeinsamer Spielstand ----
  const hub = await context.newPage();
  watch(hub);
  await hub.goto(base + '/hub/', { waitUntil: 'load' });
  check('Quest-Buch kennt den Fortschritt aus der Welt',
    await hub.evaluate(() => globalThis.HUB.log().status('wf.erster-sprung') === 'completed' && globalThis.HUB.log().status('wf.glanzkugeln') === 'active'));
  await hub.close();

  // ---- Handy: Touch-Joystick ----
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const phone = await phoneCtx.newPage();
  watch(phone);
  await phone.goto(base + '/hauptspiel/', { waitUntil: 'load' });
  await phone.waitForFunction(() => globalThis.HAUPTSPIEL, null, { timeout: 20000 });
  const p0 = await phone.evaluate(() => globalThis.HAUPTSPIEL.state());
  await phone.evaluate(() => {
    const c = document.getElementById('scene');
    const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true }));
    ev('pointerdown', 90, 600);
    ev('pointermove', 90, 540);
    globalThis.__lift = () => ev('pointerup', 90, 540);
  });
  check('Touch: Joystick erscheint', await phone.isVisible('#stick'));
  await phone.waitForTimeout(800);
  await phone.evaluate(() => globalThis.__lift());
  const p1 = await phone.evaluate(() => globalThis.HAUPTSPIEL.state());
  check('Touch: nach oben ziehen läuft vorwärts', p1.z < p0.z - 0.5, 'z ' + p0.z.toFixed(1) + ' → ' + p1.z.toFixed(1));
  check('Touch: Hilfe zeigt die Touch-Steuerung', await phone.isVisible('#helpTouch') && await phone.isHidden('#helpKeys'));
  check('Handy: kein seitliches Scrollen', await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await phoneCtx.close();

  check('keine Fehler in der Browser-Konsole', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();

  // ---- ohne WebGL ----
  const plain = await chromium.launch(Object.assign({}, launch, { args: ['--disable-webgl', '--disable-webgl2'] }));
  const fb = await plain.newPage();
  await fb.goto(base + '/hauptspiel/', { waitUntil: 'load' });
  await fb.waitForTimeout(500);
  check('ohne WebGL: einfache Auswahl statt Welt', await fb.isVisible('#fallback') && await fb.isVisible('#fallbackList [data-game="wuerfelflug"]'));
  await fb.click('#fallbackList [data-game="wuerfelflug"]');
  check('ohne WebGL: Würfelflug lässt sich trotzdem spielen',
    await fb.waitForSelector('iframe.minigame-frame', { timeout: 5000 }).then(() => true, () => false));
  await plain.close();

  server.close();
  const failed = results.filter(ok => !ok).length;
  console.log(failed ? '\n' + failed + ' von ' + results.length + ' Prüfungen fehlgeschlagen.' : '\nAlle ' + results.length + ' Prüfungen bestanden.');
  process.exit(failed ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
