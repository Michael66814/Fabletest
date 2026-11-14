# Würfelflug

Ein Geschicklichkeitsspiel für den Browser: Ein Würfel läuft von selbst nach rechts,
die Hindernisse ziehen von rechts nach links durchs Bild, und du springst per Klick
über Stacheln und Blöcke. Portale wechseln den Spielmodus (Würfel ↔ Papierflieger),
Pfeil-Tore ändern das Tempo.

Kein Build-Schritt, keine Abhängigkeiten – reines HTML, CSS und JavaScript.

## Spielen

`index.html` im Browser öffnen (Doppelklick genügt).
Oder mit kleinem Webserver: `node tools/serve.js` und dann <http://localhost:8080>.

| Eingabe | Wirkung |
| --- | --- |
| Klick, Tippen, Leertaste, Pfeil hoch oder W | springen bzw. im Flug Auftrieb geben |
| gedrückt halten | der Würfel springt bei jeder Landung sofort wieder |
| P oder Esc | Pause |
| M | Ton an/aus |
| R | Level neu starten |

## Was drin ist

- **Würfelmodus:** Springen geht nur vom Boden oder von einem Block. Auf Blöcken kann
  man landen, frontal dagegenzulaufen ist tödlich – genau wie jede Berührung mit
  Stacheln und Sägen.
- **Flugmodus:** Hinter dem blauen Portal fliegt der Würfel als Papierflieger. Jeder
  Klick gibt Auftrieb, auch mitten in der Luft. Das violette Portal führt zurück.
- **Tempo-Tore:** vier Stufen (langsam, normal, schnell, sehr schnell). Je mehr Pfeile
  ein Tor zeigt, desto schneller geht es weiter; auch die Musik zieht an.
- **Drei Level:** Aufwärmrunde (leicht), Höhenflug (mittel), Vollgas (schwer).
- **Übungsmodus:** Nach einem Fehler geht es am letzten Fähnchen weiter statt von vorn.
- **Demo:** Ein Bot spielt jedes Level fehlerfrei vor – im Menü läuft er im Hintergrund.
- Bestwerte und Einstellungen merkt sich der Browser (localStorage).
- Ton und Musik entstehen live im Browser, es gibt keine Sound-Dateien.

## Aufbau

| Datei | Aufgabe |
| --- | --- |
| `index.html`, `css/style.css` | Seite, Menü, Anzeige |
| `js/config.js` | alle Stellschrauben: Schwerkraft, Sprungkraft, Tempo, Kulanz |
| `js/levels.js` | die Level als Text-Bilder |
| `js/level.js` | liest die Text-Bilder ein |
| `js/sim.js` | Physik und Kollision (läuft auch ohne Browser) |
| `js/render.js` | Zeichnen auf die Canvas |
| `js/audio.js` | Geräusche und Musik |
| `js/game.js` | Spielablauf, Eingabe, Menüs |
| `js/demos.js` | Lösungen des Bots (wird erzeugt, nicht von Hand ändern) |
| `tools/` | Prüf-Bot, Browser-Test, Webserver, Einzeldatei-Paket |

Die Physik rechnet in festen Schritten (240 pro Sekunde). Dadurch verhält sich das
Spiel auf jedem Bildschirm gleich, und aufgezeichnete Eingaben lassen sich exakt
wiedergeben – darauf beruhen Demo und Prüf-Bot.

## Eigene Level bauen

Level stehen in `js/levels.js` als Text-Bilder. Jede Zeichenkette ist eine Zeile,
die unterste liegt auf dem Boden, ein Zeichen ist ein Feld (so groß wie der Würfel):

```
#   Block                      ^  v   Stachel am Boden / an der Decke
m  w   kleiner Stachel         o  O   kleine / große Säge
P   Portal: Flugmodus          C      Portal: Würfelmodus
1 2 3 4   Tempo-Tor (langsam … sehr schnell)
|   Fähnchen für den Übungsmodus
```

Beispiel – ein Stachel, ein Block mit Doppelstachel dahinter, dann schneller:

```js
[
  '                    ##                  ',
  '      ^         ##  ##^^       3        '
]
```

Ein Flugabschnitt braucht eine Decke: die oberste von zehn Zeilen mit `#` füllen.

Danach prüfen, ob das Level noch schaffbar ist:

```
node tools/solve.js            # alle Level prüfen und js/demos.js neu schreiben
node tools/solve.js l2 --show  # ein Level, mit eingezeichneter Flugbahn des Bots
```

Der Bot sucht eine fehlerfreie Eingabefolge und meldet, wie viel Spielraum bleibt:
das Zeitfenster jedes Sprungs in Millisekunden und den Abstand zu Hindernissen im
Flug. Findet er keinen Weg, zeigt er die Stelle, an der es hakt. Zur Orientierung:
Die Level hier haben Zeitfenster ab 154 ms (leicht) bzw. 96 ms (mittel und schwer).

## Werkzeuge

| Befehl | Zweck |
| --- | --- |
| `node tools/solve.js` | beweist, dass jedes Level schaffbar ist, und schreibt die Demos |
| `node tools/smoke-test.js` | spielt das Spiel in einem unsichtbaren Chromium durch (braucht [Playwright](https://playwright.dev)) |
| `node tools/build.js` | packt alles in eine einzige Datei `dist/wuerfelflug.html` zum Weitergeben |
| `node tools/serve.js` | lokaler Webserver |
