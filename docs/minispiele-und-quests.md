# Minispiele und Quests

Das Hauptspiel besteht aus vielen Minispielen. Quests verlangen etwas, das man in
einem Minispiel tut („Schaffe die Sprungfeder ohne Schild“). Damit das für jedes
Minispiel gleich funktioniert, gibt es zwei feste Verträge:

1. **Das Minispiel-Protokoll:** wie Hauptspiel und Minispiel miteinander reden.
2. **Das Quest-Format:** wie eine Quest beschrieben wird und wann sie als geschafft gilt.

Dazwischen steht das **Manifest** jedes Minispiels. Es sagt, mit welchen Angaben man
das Spiel starten kann und welche Ereignisse es meldet. Quests werden gegen das
Manifest geprüft, sodass Tippfehler schon beim Laden auffallen und nicht erst beim Spielen.

```
 Hauptspiel (hub/)                                  Minispiel (z. B. Würfelflug)
 ┌──────────────────────────┐   start {level:'l4'}   ┌─────────────────────────┐
 │ Quest-Buch               │ ─────────────────────▶ │ läuft im <iframe>       │
 │  platform/quests.js      │                        │                         │
 │                          │ ◀───────────────────── │ event pickup {kind,...} │
 │  zählt Ereignisse,       │ ◀───────────────────── │ event level.completed   │
 │  vergibt Belohnungen     │ ◀───────────────────── │ ended {outcome}         │
 └──────────────────────────┘                        └─────────────────────────┘
           ▲ prüft Quests gegen                         ▲ beschreibt sich in
           └──────────── Manifest (js/manifest.js) ─────┘
```

| Datei | Inhalt |
| --- | --- |
| `platform/minigame-protocol.js` | Protokoll, für beide Seiten: `connectHost()` im Minispiel, `openMinigame()` im Hauptspiel |
| `platform/quests.js` | Quest-Format prüfen (`validate`) und Quest-Buch (`createQuestLog`) |
| `js/manifest.js` | Manifest von Würfelflug |
| `js/embed.js` | Anbindung von Würfelflug an das Protokoll |
| `hub/` | Test-Oberfläche des Hauptspiels mit Beispiel-Quests |
| `tools/quest-test.js` | prüft Quest-Format, Quest-Buch und Manifest (ohne Browser) |
| `tools/hub-test.js` | spielt Quests im Browser durch (Hauptspiel plus Würfelflug) |

---

## 1. Minispiel-Protokoll (Version 1)

Jedes Minispiel ist eine eigene HTML-Seite und läuft im Hauptspiel in einem `<iframe>`.
Beide Seiten tauschen nur Nachrichten über `postMessage` aus. Das hat drei Vorteile:

- Ein Minispiel funktioniert weiterhin allein, ohne Hauptspiel.
- Minispiele können sich nicht in die Quere kommen (Variablen, Tastatur, Audio, Speicher).
- Ein Minispiel kann in jeder Technik gebaut sein, solange es die Nachrichten versteht.

Jede Nachricht sieht so aus: `{ proto: 'minigame', v: 1, type: '…', … }`.

### Ablauf einer Sitzung

| Richtung | `type` | Felder | Bedeutung |
| --- | --- | --- | --- |
| Minispiel → Hauptspiel | `hello` | `manifest` | Seite ist geladen, das Spiel stellt sich vor |
| Hauptspiel → Minispiel | `start` | `session`, `params` | Sitzung beginnt, z. B. mit `params: { level: 'l4' }` |
| Minispiel → Hauptspiel | `started` | `session` | Start bestätigt |
| Minispiel → Hauptspiel | `event` | `session`, `name`, `data` | etwas ist passiert (beliebig oft) |
| Hauptspiel → Minispiel | `pause` / `resume` | `session` | z. B. wenn ein Dialog im Hauptspiel aufgeht |
| Hauptspiel → Minispiel | `settings` | `session`, `settings` | z. B. `{ muted: true }` |
| Hauptspiel → Minispiel | `stop` | `session` | Hauptspiel bricht ab |
| Minispiel → Hauptspiel | `ended` | `session`, `outcome`, `summary` | Sitzung ist vorbei, genau einmal |

- `session` ist eine Kennung, die das Hauptspiel vergibt. Nachrichten mit fremder
  Kennung werden ignoriert.
- `outcome` ist `completed` (Ziel erreicht), `failed` (endgültig gescheitert) oder
  `aborted` (abgebrochen). Würfelflug meldet `completed`, wenn der Spieler über
  „Zurück“ geht und vorher mindestens ein Level ohne Übungsmodus geschafft hat.
  Ein `stop` vom Hauptspiel endet immer mit `aborted`.
- `summary` ist frei, z. B. `{ attempts: 7, best: 100, level: 'l4' }`. Für Quests
  zählen nur die `event`-Nachrichten.
- Beide Seiten prüfen, von welchem Fenster eine Nachricht kommt. Das Hauptspiel
  prüft außerdem den Ursprung (Origin) der Minispiel-Seite.
- Antwortet ein Minispiel nicht auf `stop`, beendet das Hauptspiel die Sitzung nach
  einer halben Sekunde selbst.

### Ein neues Minispiel anbinden

```js
// im Minispiel
var host = Minigame.connectHost(MANIFEST, {
  start:    function (params, session) { /* Level laden, losspielen */ },
  pause:    function () { … },
  resume:   function () { … },
  settings: function (s) { … },
  stop:     function () { /* aufräumen; "ended" schickt das Protokoll selbst */ }
});

host.emit('level.completed', { level: 'l4', practice: false, … });
host.end('completed', { … });          // wenn der Spieler zurück ins Hauptspiel will
```

`host.embedded` ist `false`, wenn die Seite allein geöffnet wurde. Dann tun `emit`
und `end` nichts, und das Spiel verhält sich wie bisher.

```js
// im Hauptspiel
var game = Minigame.openMinigame({
  container: element, url: '../index.html', params: { level: 'l4' },
  onEvent: function (name, data) { questLog.handle({ game: 'wuerfelflug', name, data, session: game.session }); },
  onEnded: function (outcome, summary) { /* Fenster schließen */ }
});
game.pause(); game.resume(); game.settings({ muted: true }); game.stop();
```

### Regeln für Ereignisse

- Ereignisse beschreiben, **was passiert ist**, nicht was eine Quest verlangt.
  Also `level.completed` mit `shieldUsed: false` statt `level.completed_without_shield`.
  So kommen neue Quests ohne Änderung am Minispiel aus.
- Jedes Feld steht mit Typ im Manifest. Neue Felder sind jederzeit erlaubt. Ein Feld
  umzubenennen oder zu entfernen bricht bestehende Quests, dafür muss die `version` steigen.
- Demo, Vorschau oder Bot melden nichts. Nur echtes Spielen zählt.

---

## 2. Manifest

```js
{
  id: 'wuerfelflug', name: 'Würfelflug', version: '1.0.0', protocol: 1, entry: 'index.html',
  params: {                                  // was "start" mitbringen darf
    level:    { type: 'enum', values: ['l1', …, 'l10'] },
    practice: { type: 'boolean' },
    muted:    { type: 'boolean' }
  },
  labels: { level: { l1: 'Aufwärmrunde', … } },   // Anzeigenamen fürs Hauptspiel
  events: {                                  // was das Spiel meldet
    'level.completed': { text: '…', fields: {
      level: { type: 'enum', values: [...] },
      practice: { type: 'boolean' },
      augments: { type: 'object', fields: { shield: { type: 'number' }, … } },
      …
    } },
    …
  }
}
```

Feldtypen: `number`, `boolean`, `string`, `enum` (mit `values`) und `object`
(mit `fields`, für verschachtelte Felder).

### Ereignisse von Würfelflug

| Ereignis | Felder | Wann |
| --- | --- | --- |
| `run.started` | `level`, `practice` | ein Level wird gestartet |
| `attempt.ended` | `level`, `practice`, `percent`, `attempt`, `finished` | Absturz oder Ziel |
| `level.completed` | `level`, `practice`, `attempts`, `seconds`, `clicks`, `augments.{total,boost,double,shield}`, `shieldUsed`, `flips` | Ziel erreicht; die Zahlen beziehen sich auf den erfolgreichen Versuch |
| `pickup` | `level`, `kind` (`boost`, `double`, `shield`) | Augment eingesammelt |
| `shield.used` | `level` | ein Schild hat einen Treffer abgefangen |
| `portal` | `level`, `mode` (`cube`, `plane`, `trick`) | durch ein Modus-Portal |
| `speed` | `level`, `speed` (0–3) | durch ein Tempo-Tor |
| `flip` | `level` | Schwerkraft im Trickmodus umgedreht |

---

## 3. Quest-Format

Eine Quest ist ein einfaches Objekt und lässt sich deshalb auch als JSON speichern.

```js
{
  id: 'wf.ohne-netz',                       // eindeutig: a-z 0-9 . _ -
  title: 'Ohne Netz',
  giver: 'Ilka, die Bergführerin',          // freiwillig
  text: 'In der Sprungfeder liegt ein Schild …',
  requires: {                               // freiwillig: wann die Quest verfügbar wird
    quests: ['wf.erster-sprung'],           //   diese Quests geschafft
    flags: []                               //   diese Flags im Profil
  },
  autoAccept: false,                        // true: startet von selbst, sobald verfügbar
  repeatable: false,                        // true: nach dem Abschluss wieder annehmbar
  order: 'any',                             // 'any' oder 'sequence' (Ziele der Reihe nach)
  objectives: [
    {
      id: 'l4',
      text: 'Schaffe die Sprungfeder ohne Übungsmodus und ohne Schild-Treffer',
      game: 'wuerfelflug',                  // welches Minispiel
      on: 'level.completed',                // welches Ereignis
      where: { level: 'l4', practice: false, shieldUsed: false },   // Filter
      target: 1,                            // wie oft (Standard 1)
      sum: undefined,                       // statt zählen: dieses Zahlenfeld aufaddieren
      scope: 'total',                       // 'total' oder 'session' (muss in einer Sitzung passieren)
      launch: { level: 'l4', practice: false }   // so startet das Hauptspiel das Minispiel
    }
  ],
  rewards: [
    { type: 'xp', amount: 80 },
    { type: 'item', id: 'feder', count: 1, name: 'Leichte Feder' },
    { type: 'flag', id: 'ilka.vertrauen' }  // unsichtbar; schaltet andere Quests frei
  ]
}
```

### Filter (`where`)

| Schreibweise | Bedeutung |
| --- | --- |
| `{ level: 'l4' }` | Feld ist genau gleich |
| `{ percent: { gte: 80 } }` | Vergleich: `eq`, `ne`, `gt`, `gte`, `lt`, `lte` |
| `{ level: { in: ['l4', 'l6'] } }` | einer von mehreren Werten (`nin`: keiner davon) |
| `{ 'augments.shield': 0 }` | Punkte greifen in verschachtelte Felder |
| `{ percent: { gte: 50, lt: 100 } }` | mehrere Vergleiche gelten zusammen |

Alle Bedingungen eines Filters müssen zutreffen. Ohne `where` zählt jedes Ereignis dieses Namens.

### Zustände einer Quest

```
locked ──(requires erfüllt)──▶ available ──(accept / autoAccept)──▶ active ──(alle Ziele)──▶ completed
                                    ▲                                  │
                                    └──────────── abandon ─────────────┘
                                    ▲
                                    └──── repeatable: nach dem Abschluss wieder verfügbar
```

### Beispiele

| Wunsch | Ziel |
| --- | --- |
| Level 1 schaffen | `on: 'level.completed', where: { level: 'l1' }` |
| 3 Augments sammeln, egal wo | `on: 'pickup', target: 3` |
| 5 Schilde einsammeln | `on: 'pickup', where: { kind: 'shield' }, target: 5` |
| in einem Versuch 80 % in Level 9 | `on: 'attempt.ended', where: { level: 'l9', percent: { gte: 80 }, practice: false }` |
| Level 7 in höchstens 3 Versuchen | `on: 'level.completed', where: { level: 'l7', attempts: { lte: 3 } }` |
| 10 Schwerkraft-Wechsel in einer Sitzung | `on: 'flip', target: 10, scope: 'session'` |
| insgesamt 500 Sprünge in geschafften Leveln | `on: 'level.completed', sum: 'clicks', target: 500` |
| erst üben, dann schaffen | zwei Ziele mit `order: 'sequence'` |

### Quest-Buch (`platform/quests.js`)

```js
var log = Quests.createQuestLog({ quests: QUESTS, manifests: MINIGAMES, state: gespeicherterStand });
log.list();                  // alle Quests mit Status und Fortschritt (für die Anzeige)
log.accept('wf.ohne-netz');
log.handle({ game: 'wuerfelflug', name: 'level.completed', data: { … }, session: 's1' });
                             // -> { progressed: [...], completed: [{ quest, rewards }], started: [...] }
log.profile();               // { xp, items, flags }
log.state();                 // JSON zum Speichern
Quests.validate(QUESTS, MINIGAMES);   // Liste von Fehlermeldungen, leer = in Ordnung
```

- `createQuestLog` prüft die Quests zuerst und bricht mit einer genauen Meldung ab,
  wenn etwas nicht stimmt, etwa ein unbekanntes Ereignis, ein falsches Feld, ein Level,
  das es nicht gibt, ein Tippfehler im Feldnamen oder ein Kreis in den Voraussetzungen.
- Der Spielstand speichert nur Fortschritt und Profil, nicht die Quests selbst.
  Quests lassen sich also ändern, ohne alte Spielstände zu verlieren. Fortschritt zu
  gelöschten Quests wird beim Laden verworfen.

---

## Ausprobieren

```
node tools/serve.js             # dann http://localhost:8080/hub/
node tools/quest-test.js        # Quest-Format und Quest-Buch, ohne Browser
node tools/hub-test.js          # Hauptspiel und Würfelflug zusammen im Browser
```

## Offene Punkte für später

- **Gemeinsame Einstellungen:** Ton und Übungsmodus speichert Würfelflug noch selbst.
  Das Hauptspiel kann sie mit `settings` überschreiben, merkt sie sich aber nicht.
- **Belohnungen im Minispiel:** Das Protokoll könnte beim `start` Gegenstände aus dem
  Profil mitgeben, etwa „startet mit Schild“. Dafür braucht Würfelflug einen neuen
  Startwert im Manifest.
- **Spielstand über Geräte hinweg:** `log.state()` ist reines JSON und kann später
  auf einen Server wandern.
