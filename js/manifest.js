/* Würfelflug – Manifest für das Hauptspiel.
   Beschreibt, mit welchen Angaben man das Spiel starten kann (params) und welche
   Ereignisse es meldet (events). Das Hauptspiel prüft Quests gegen diese Angaben.
   Die Level-Liste muss zu js/levels.js passen; das prüft tools/quest-test.js. */
(function (root) {
  'use strict';

  var LEVELS = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'l9', 'l10'];
  var LEVEL = { type: 'enum', values: LEVELS, text: 'Level-ID' };
  var PRACTICE = { type: 'boolean', text: 'im Übungsmodus gespielt' };

  var list = root.MINIGAMES = root.MINIGAMES || {};
  list.wuerfelflug = {
    id: 'wuerfelflug',
    name: 'Würfelflug',
    version: '1.0.0',
    protocol: 1,
    entry: 'index.html',

    // Angaben beim Start (Nachricht "start", Feld params). Alle sind freiwillig.
    params: {
      level: { type: 'enum', values: LEVELS, text: 'Dieses Level sofort starten; ohne Angabe erscheint das Menü' },
      practice: { type: 'boolean', text: 'Übungsmodus an oder aus' },
      muted: { type: 'boolean', text: 'Ton aus' }
    },

    // Anzeigenamen, damit das Hauptspiel Level beim Namen nennen kann
    labels: {
      level: {
        l1: 'Aufwärmrunde', l2: 'Höhenflug', l3: 'Vollgas', l4: 'Sprungfeder', l5: 'Kopfstand',
        l6: 'Dauerlauf', l7: 'Wechselbad', l8: 'Sägewerk', l9: 'Nadelöhr', l10: 'Würfelhölle'
      }
    },

    // Gemeldete Ereignisse und ihre Felder. Demo-Läufe melden nichts.
    events: {
      'run.started': {
        text: 'Ein Level wurde gestartet',
        fields: { level: LEVEL, practice: PRACTICE }
      },
      'attempt.ended': {
        text: 'Ein Versuch ist vorbei, durch Absturz oder im Ziel',
        fields: {
          level: LEVEL, practice: PRACTICE,
          percent: { type: 'number', text: 'erreichter Fortschritt, 0 bis 100' },
          attempt: { type: 'number', text: 'Nummer des Versuchs in diesem Lauf' },
          finished: { type: 'boolean', text: 'im Ziel angekommen' }
        }
      },
      'level.completed': {
        text: 'Ein Level wurde bis ins Ziel gespielt',
        fields: {
          level: LEVEL, practice: PRACTICE,
          attempts: { type: 'number', text: 'Versuche bis zum Ziel' },
          seconds: { type: 'number', text: 'Dauer des erfolgreichen Versuchs' },
          clicks: { type: 'number', text: 'Sprünge im erfolgreichen Versuch' },
          augments: {
            type: 'object', text: 'im erfolgreichen Versuch eingesammelte Augments',
            fields: {
              total: { type: 'number' }, boost: { type: 'number' },
              double: { type: 'number' }, shield: { type: 'number' }
            }
          },
          shieldUsed: { type: 'boolean', text: 'ein Schild hat einen Treffer abgefangen' },
          flips: { type: 'number', text: 'Schwerkraft-Wechsel im erfolgreichen Versuch' }
        }
      },
      'pickup': {
        text: 'Ein Augment wurde eingesammelt',
        fields: { level: LEVEL, kind: { type: 'enum', values: ['boost', 'double', 'shield'] } }
      },
      'shield.used': {
        text: 'Ein Schild hat einen Treffer abgefangen',
        fields: { level: LEVEL }
      },
      'portal': {
        text: 'Durch ein Modus-Portal geflogen',
        fields: { level: LEVEL, mode: { type: 'enum', values: ['cube', 'plane', 'trick'] } }
      },
      'speed': {
        text: 'Durch ein Tempo-Tor gefahren',
        fields: { level: LEVEL, speed: { type: 'number', text: '0 langsam bis 3 sehr schnell' } }
      },
      'flip': {
        text: 'Schwerkraft im Trickmodus umgedreht',
        fields: { level: LEVEL }
      }
    }
  };
})(globalThis);
