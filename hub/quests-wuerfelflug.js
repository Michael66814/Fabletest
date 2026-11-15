/* Beispiel-Quests für Würfelflug.
   Format: docs/minispiele-und-quests.md – geprüft wird mit  node tools/quest-test.js */
(function (root) {
  'use strict';

  var QUESTS = root.QUESTS = root.QUESTS || [];
  QUESTS.push(
    {
      id: 'wf.erster-sprung',
      title: 'Der erste Sprung',
      giver: 'Ilka, die Bergführerin',
      text: 'Bevor du in die Berge darfst, will ich sehen, wie du springst. Schaff die Aufwärmrunde.',
      autoAccept: true,
      objectives: [
        { id: 'l1', text: 'Schaffe die Aufwärmrunde', game: 'wuerfelflug', on: 'level.completed',
          where: { level: 'l1' }, launch: { level: 'l1' } }
      ],
      rewards: [{ type: 'xp', amount: 50 }, { type: 'item', id: 'feder', name: 'Leichte Feder' }]
    },
    {
      id: 'wf.glanzkugeln',
      title: 'Glänzende Kugeln',
      giver: 'Bero, der Sammler',
      text: 'Die leuchtenden Kugeln in den Leveln – ich sammle sie. Bring mir drei, egal welche.',
      requires: { quests: ['wf.erster-sprung'] },
      objectives: [
        { id: 'augments', text: 'Sammle 3 Augments ein', game: 'wuerfelflug', on: 'pickup',
          target: 3, launch: { level: 'l4' } }
      ],
      rewards: [{ type: 'xp', amount: 40 }]
    },
    {
      id: 'wf.ohne-netz',
      title: 'Ohne Netz',
      giver: 'Ilka, die Bergführerin',
      text: 'In der Sprungfeder liegt ein Schild. Schaff das Level, ohne dass es dich retten muss – und ohne Fähnchen.',
      requires: { quests: ['wf.erster-sprung'] },
      objectives: [
        { id: 'l4', text: 'Schaffe die Sprungfeder ohne Übungsmodus und ohne Schild-Treffer',
          game: 'wuerfelflug', on: 'level.completed',
          where: { level: 'l4', practice: false, shieldUsed: false },
          launch: { level: 'l4', practice: false } }
      ],
      rewards: [{ type: 'xp', amount: 80 }, { type: 'flag', id: 'ilka.vertrauen' }]
    },
    {
      id: 'wf.kopfueber',
      title: 'Kopfüber',
      giver: 'Mara, die Akrobatin',
      text: 'Erst üben, dann zeigen: Dreh im Kopfstand zehnmal die Schwerkraft um, an einem Stück. Danach spiel das Level durch.',
      requires: { quests: ['wf.erster-sprung'] },
      order: 'sequence',
      objectives: [
        { id: 'flips', text: 'Drehe im Kopfstand 10-mal die Schwerkraft um (in einer Sitzung)',
          game: 'wuerfelflug', on: 'flip', where: { level: 'l5' }, target: 10, scope: 'session',
          launch: { level: 'l5', practice: true } },
        { id: 'l5', text: 'Schaffe den Kopfstand', game: 'wuerfelflug', on: 'level.completed',
          where: { level: 'l5' }, launch: { level: 'l5' } }
      ],
      rewards: [{ type: 'xp', amount: 80 }, { type: 'item', id: 'kompass', name: 'Verdrehter Kompass' }]
    },
    {
      id: 'wf.trainingslauf',
      title: 'Trainingslauf',
      giver: 'Ilka, die Bergführerin',
      text: 'Bleib in Übung: Komm in irgendeinem Level ohne Fähnchen über die Hälfte. Geht beliebig oft.',
      requires: { quests: ['wf.erster-sprung'] },
      repeatable: true,
      objectives: [
        { id: 'halb', text: 'Erreiche in einem Versuch mindestens 50 %', game: 'wuerfelflug',
          on: 'attempt.ended', where: { practice: false, percent: { gte: 50 } } }
      ],
      rewards: [{ type: 'xp', amount: 10 }]
    },
    {
      id: 'wf.meisterpruefung',
      title: 'Die Meisterprüfung',
      giver: 'Ilka, die Bergführerin',
      text: 'Du hast mein Vertrauen. Jetzt die Würfelhölle – ohne Fähnchen.',
      requires: { quests: ['wf.ohne-netz', 'wf.kopfueber'], flags: ['ilka.vertrauen'] },
      objectives: [
        { id: 'l10', text: 'Schaffe die Würfelhölle ohne Übungsmodus', game: 'wuerfelflug',
          on: 'level.completed', where: { level: 'l10', practice: false },
          launch: { level: 'l10', practice: false } }
      ],
      rewards: [{ type: 'xp', amount: 300 }, { type: 'flag', id: 'titel.wuerfelmeister' }]
    }
  );
})(globalThis);
