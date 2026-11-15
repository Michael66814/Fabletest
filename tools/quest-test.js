#!/usr/bin/env node
/* Quest-Format und Quest-Buch prüfen (ohne Browser).

   - Die Beispiel-Quests in hub/ passen zum Manifest von Würfelflug.
   - Das Manifest passt zu den Leveln in js/levels.js.
   - Das Quest-Buch zählt, filtert, schaltet frei und vergibt Belohnungen richtig.
   - Fehlerhafte Quests werden mit verständlicher Meldung abgelehnt.

   Aufruf:  node tools/quest-test.js */
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const load = file => require(path.join(root, file));

globalThis.WF = {};
load('js/config.js');
load('js/level.js');
load('js/levels.js');
load('js/manifest.js');
load('hub/quests-wuerfelflug.js');
const Quests = load('platform/quests.js');

const manifests = globalThis.MINIGAMES;
const QUESTS = globalThis.QUESTS;
const M = manifests.wuerfelflug;

let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? '  (' + detail + ')' : ''));
}
const clone = v => JSON.parse(JSON.stringify(v));
const ev = (name, data, session) => ({ game: 'wuerfelflug', name, data, session: session || 's1' });
const completed = (level, extra) => ev('level.completed', Object.assign({
  level, practice: false, attempts: 1, seconds: 40, clicks: 20,
  augments: { total: 0, boost: 0, double: 0, shield: 0 }, shieldUsed: false, flips: 0
}, extra));

console.log('Quest-Test');

// ---- Manifest ----
const levelIds = WF.LEVEL_DEFS.map(d => d.id);
check('Manifest nennt genau die Level aus js/levels.js',
  JSON.stringify(M.params.level.values) === JSON.stringify(levelIds), levelIds.join(' '));
check('Level-Namen im Manifest stimmen',
  WF.LEVEL_DEFS.every(d => M.labels.level[d.id] === d.name));

// ---- Beispiel-Quests ----
const errs = Quests.validate(QUESTS, manifests);
check('Beispiel-Quests sind gültig', errs.length === 0, errs.join(' | '));

// ---- Ablauf ----
let log = Quests.createQuestLog({ quests: QUESTS, manifests });
check('Startquest ist automatisch aktiv', log.status('wf.erster-sprung') === 'active');
check('Folgequests sind gesperrt', log.status('wf.glanzkugeln') === 'locked' && log.status('wf.meisterpruefung') === 'locked');

let r = log.handle(completed('l2'));
check('falsches Level zählt nicht', r.completed.length === 0 && log.status('wf.erster-sprung') === 'active');
r = log.handle(ev('attempt.ended', { level: 'l1', practice: false, percent: 100, attempt: 1, finished: true }));
check('falsches Ereignis zählt nicht', r.completed.length === 0);
r = log.handle(completed('l1', { practice: true }));
check('Aufwärmrunde geschafft: Quest fertig', r.completed.length === 1 && r.completed[0].quest === 'wf.erster-sprung');
let p = log.profile();
check('Belohnung im Profil', p.xp === 50 && p.items.feder === 1, JSON.stringify(p));
check('Folgequests sind verfügbar, nicht von selbst aktiv',
  ['wf.glanzkugeln', 'wf.ohne-netz', 'wf.kopfueber', 'wf.trainingslauf'].every(id => log.status(id) === 'available'));
check('annehmen geht nur bei verfügbaren Quests', log.accept('wf.glanzkugeln') && !log.accept('wf.glanzkugeln') && !log.accept('wf.meisterpruefung'));

// Zählen
log.handle(ev('pickup', { level: 'l4', kind: 'shield' }));
r = log.handle(ev('pickup', { level: 'l6', kind: 'boost' }));
check('Zähler steigt', r.progressed.length === 1 && r.progressed[0].value === 2 && r.progressed[0].target === 3);
r = log.handle(ev('pickup', { level: 'l6', kind: 'double' }));
check('nach 3 Augments fertig', r.completed.length === 1 && log.status('wf.glanzkugeln') === 'completed');

// Filter mit mehreren Bedingungen
log.accept('wf.ohne-netz');
log.handle(completed('l4', { practice: true }));
log.handle(completed('l4', { shieldUsed: true }));
check('Übungsmodus oder Schild-Treffer zählen nicht', log.status('wf.ohne-netz') === 'active');
r = log.handle(completed('l4'));
check('sauber geschafft zählt', r.completed.length === 1 && log.profile().flags.includes('ilka.vertrauen'));

// Reihenfolge und Sitzung
log.accept('wf.kopfueber');
r = log.handle(completed('l5'));
check('sequence: zweites Ziel zählt erst nach dem ersten', r.completed.length === 0 && log.get('wf.kopfueber').objectives[1].value === 0);
for (let i = 0; i < 6; i++) log.handle(ev('flip', { level: 'l5' }, 'A'));
log.handle(ev('flip', { level: 'l3' }, 'A'));
check('Flips zählen nur im richtigen Level', log.get('wf.kopfueber').objectives[0].value === 6);
for (let i = 0; i < 5; i++) log.handle(ev('flip', { level: 'l5' }, 'B'));
check('scope session: neue Sitzung fängt bei 0 an', log.get('wf.kopfueber').objectives[0].value === 5);
for (let i = 0; i < 5; i++) r = log.handle(ev('flip', { level: 'l5' }, 'B'));
let k = log.get('wf.kopfueber');
check('10 Flips in einer Sitzung', k.objectives[0].done && !k.objectives[1].done && k.objectives[1].current);
log.handle(ev('flip', { level: 'l5' }, 'B'));
check('Zähler bleibt beim Ziel stehen', log.get('wf.kopfueber').objectives[0].value === 10);
r = log.handle(completed('l5'));
check('danach zählt das zweite Ziel', r.completed.length === 1 && log.profile().items.kompass === 1);

// Freischaltung über mehrere Voraussetzungen und Flags
check('Meisterprüfung wird verfügbar', log.status('wf.meisterpruefung') === 'available');

// Wiederholbar und Vergleich
log.accept('wf.trainingslauf');
log.handle(ev('attempt.ended', { level: 'l2', practice: false, percent: 49, attempt: 1, finished: false }));
check('49 % reichen nicht', log.status('wf.trainingslauf') === 'active');
log.handle(ev('attempt.ended', { level: 'l2', practice: false, percent: 50, attempt: 2, finished: false }));
const q = log.get('wf.trainingslauf');
check('wiederholbare Quest ist danach wieder verfügbar', q.status === 'available' && q.completions === 1);
log.accept('wf.trainingslauf');
log.handle(ev('attempt.ended', { level: 'l9', practice: false, percent: 77, attempt: 1, finished: false }));
check('und lässt sich nochmal schaffen', log.get('wf.trainingslauf').completions === 2);

// Speichern und Laden
const xp = log.profile().xp;
const saved = JSON.parse(JSON.stringify(log.state()));
const log2 = Quests.createQuestLog({ quests: QUESTS, manifests, state: saved });
check('Zustand lässt sich speichern und laden',
  log2.profile().xp === xp && log2.status('wf.kopfueber') === 'completed' && log2.status('wf.meisterpruefung') === 'available');
log.accept('wf.meisterpruefung');
const partial = Quests.createQuestLog({ quests: QUESTS.filter(x => x.id !== 'wf.meisterpruefung'), manifests, state: log.state() });
check('Fortschritt zu entfernten Quests wird verworfen', !('wf.meisterpruefung' in partial.state().active));
check('kaputter Spielstand führt zu leerem Anfang', Quests.createQuestLog({ quests: QUESTS, manifests, state: 'Unsinn' }).profile().xp === 0);

// Summe statt Anzahl
const sumQuest = [{ id: 'klickmeister', title: 'Klickmeister', objectives: [
  { id: 'k', text: '100 Sprünge in geschafften Leveln', game: 'wuerfelflug', on: 'level.completed', sum: 'clicks', target: 100 }] }];
const sumLog = Quests.createQuestLog({ quests: sumQuest, manifests });
sumLog.accept('klickmeister');
sumLog.handle(completed('l1', { clicks: 60 }));
sumLog.handle(completed('l2', { clicks: 50 }));
check('sum addiert Feldwerte', sumLog.status('klickmeister') === 'completed');

// Verschachtelte Felder und in/nin
check('Filter: verschachtelt, in, nin, Vergleich',
  Quests.matches({ 'augments.shield': 0, level: { in: ['l1', 'l2'] }, kind: { nin: ['x'] }, n: { gt: 1, lte: 3 } },
    { augments: { shield: 0 }, level: 'l2', kind: 'boost', n: 3 }) &&
  !Quests.matches({ 'augments.shield': 0 }, { augments: { shield: 1 } }) &&
  !Quests.matches({ n: { gte: 1 } }, { n: '5' }));

// ---- Fehlerhafte Quests ----
function rejects(name, mutate, needle) {
  const qs = clone(QUESTS);
  mutate(qs);
  const e = Quests.validate(qs, manifests);
  check('abgelehnt: ' + name, e.some(m => m.includes(needle)), e[0]);
}
const first = qs => qs[0].objectives[0];
rejects('unbekanntes Ereignis', qs => { first(qs).on = 'level.won'; }, 'meldet kein Ereignis "level.won"');
rejects('unbekanntes Feld im Filter', qs => { first(qs).where = { lvl: 'l1' }; }, 'kein Feld "lvl"');
rejects('Level, das es nicht gibt', qs => { first(qs).where = { level: 'l99' }; }, '"l99" passt nicht');
rejects('Zahlenvergleich bei Text', qs => { first(qs).where = { level: { gte: 3 } }; }, '"gte" geht nur bei Zahlen');
rejects('unbekannter Vergleich', qs => { first(qs).where = { attempts: { mehrAls: 3 } }; }, 'unbekannter Vergleich');
rejects('sum auf Nicht-Zahl', qs => { first(qs).sum = 'level'; }, 'sum braucht ein Zahlenfeld');
rejects('unbekanntes Spiel', qs => { first(qs).game = 'tetris'; }, 'Spiel "tetris" ist nicht bekannt');
rejects('falscher Startwert', qs => { first(qs).launch = { level: 'l1', speed: 3 }; }, 'Startwert "speed"');
rejects('doppelte Quest-ID', qs => { qs[1].id = qs[0].id; }, 'id gibt es doppelt');
rejects('unbekannte Voraussetzung', qs => { qs[1].requires.quests = ['gibts-nicht']; }, 'unbekannte Quest "gibts-nicht"');
rejects('Kreis in Voraussetzungen', qs => { qs[0].requires = { quests: ['wf.meisterpruefung'] }; }, 'Kreis');
rejects('Tippfehler im Feldnamen', qs => { first(qs).taget = 3; }, 'unbekanntes Feld "taget"');
rejects('falsche Belohnung', qs => { qs[0].rewards = [{ type: 'gold', amount: 5 }]; }, 'type muss xp, item oder flag');
let threw = false;
try { Quests.createQuestLog({ quests: [{ id: 'x' }], manifests }); } catch (e) { threw = /title fehlt/.test(e.message); }
check('createQuestLog wirft bei fehlerhaften Quests', threw);

console.log(failed ? '\n' + failed + ' Prüfung(en) fehlgeschlagen' : '\nAlles in Ordnung');
process.exit(failed ? 1 : 0);
