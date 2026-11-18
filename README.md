# Würfelflug

Ein Geschicklichkeitsspiel für den Browser: Ein Würfel läuft von selbst nach rechts,
die Hindernisse ziehen von rechts nach links durchs Bild, und du springst per Klick
über Stacheln und Blöcke. Portale wechseln den Spielmodus (Würfel, Papierflieger,
Trickwürfel), Pfeil-Tore ändern das Tempo, und Augments helfen ein Stück weit.

Kein Build-Schritt, keine Abhängigkeiten – reines HTML, CSS und JavaScript.

Zweites Minigame im Ordner `rennen/`: **Kurvenfieber**, ein 3D-Autorennen gegen
Computergegner – siehe [unten](#zweites-minigame-kurvenfieber).

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
- **Flugmodus (blaues Portal):** Der Würfel fliegt als Papierflieger. Jeder Klick gibt
  Auftrieb, auch mitten in der Luft. Das violette Portal führt zurück.
- **Trickmodus (grünes Portal):** Ein Klick springt, ein Doppelklick dreht die
  Schwerkraft um (dann läuft der Würfel an der Decke), ein Dreifachklick macht ihn
  3 Sekunden lang zum Papierflieger.
- **Augments zum Einsammeln:** Sprungkraft (6 s höher springen), Doppelsprung (8 s lang
  ein zweiter Absprung in der Luft) und Schild (schützt einmal vor Stacheln und Sägen).
- **Tempo-Tore:** vier Stufen (langsam, normal, schnell, sehr schnell). Je mehr Pfeile
  ein Tor zeigt, desto schneller geht es weiter; auch die Musik zieht an.
- **Zehn Level** von 41 Sekunden bis 1:46 Minuten, im Menü nach Schwierigkeit geordnet.
- **Schwierigkeitswertung:** Jedes Level bekommt eine Zahl von 1 bis 10 und eine Stufe
  (Leicht, Mittel, Schwer, Sehr schwer, Extrem). Sie wird berechnet, nicht geschätzt –
  siehe unten.
- **Statistik:** geschaffte Level, Spielzeit, Versuche, durchschnittlicher Fortschritt
  pro Versuch, Erfolgsquote, Klicks, Portale, Augments, Schwerkraft-Wechsel sowie
  Bestwert, Versuche und Bestzeit je Level.
- **Übungsmodus:** Nach einem Fehler geht es am letzten Fähnchen weiter statt von vorn.
- **Demo:** Ein Bot spielt jedes Level fehlerfrei vor – im Menü läuft er im Hintergrund.
- Bestwerte, Statistik und Einstellungen merkt sich der Browser (localStorage).
- Ton und Musik entstehen live im Browser, es gibt keine Sound-Dateien.

## Schwierigkeitswertung

Der Prüf-Bot (`tools/solve.js`) spielt jedes Level durch und bewertet jede Stelle mit
einer Erfolgsquote:

- **Aktionen am Boden** (Sprung, Doppel-/Dreifachklick, Doppelsprung): Wie groß ist das
  Zeitfenster in Millisekunden, und wie wahrscheinlich trifft man es bei einem
  Tippfehler von ±40 ms?
- **Flugabschnitte:** Ein „unpräziser Pilot“ mit Reaktionsfehlern fliegt jeden
  Abschnitt 60-mal; gezählt wird der Anteil geglückter Flüge.
- **Länge:** Die Aufwände aller Stellen werden addiert, lange Level sammeln also von
  selbst mehr an. Dazu kommt ein kleiner Ausdauer-Zuschlag pro Sekunde.

Die Summe wird auf die Skala 1–10 abgebildet. Aktuelle Rangliste:

| Rang | Level | Wertung | Stufe | Dauer |
| --- | --- | --- | --- | --- |
| 1 | Aufwärmrunde | 2,4 | Leicht | 0:41 |
| 2 | Sprungfeder | 3,7 | Mittel | 0:45 |
| 3 | Kopfstand | 3,7 | Mittel | 0:47 |
| 4 | Höhenflug | 4,3 | Mittel | 0:57 |
| 5 | Dauerlauf | 4,3 | Mittel | 1:32 |
| 6 | Wechselbad | 5,3 | Schwer | 0:55 |
| 7 | Vollgas | 5,4 | Schwer | 0:51 |
| 8 | Sägewerk | 5,7 | Schwer | 0:55 |
| 9 | Nadelöhr | 7,2 | Sehr schwer | 1:12 |
| 10 | Würfelhölle | 8,5 | Extrem | 1:46 |

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
| `js/demos.js` | Lösungen und Schwierigkeitswertung des Bots (wird erzeugt, nicht von Hand ändern) |
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
T   Portal: Trickmodus (braucht wie der Flug eine Decke)
J   Augment Sprungkraft        D      Augment Doppelsprung        S   Augment Schild
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
node tools/solve.js            # alle Level prüfen, Wertung und Demos neu schreiben (ca. 4 Minuten)
node tools/solve.js l2 --show  # ein Level, mit eingezeichneter Flugbahn des Bots
node tools/solve.js --quick    # nur Lösbarkeit, ohne Wertung (schnell)
```

Der Bot sucht eine fehlerfreie Eingabefolge und meldet, wie viel Spielraum bleibt:
das Zeitfenster jedes Sprungs in Millisekunden und den Abstand zu Hindernissen im
Flug. Findet er keinen Weg, zeigt er die Stelle, an der es hakt. Zur Orientierung:
Kein Level hier hat ein Zeitfenster unter 96 ms; das leichteste beginnt bei 154 ms.

## Werkzeuge

| Befehl | Zweck |
| --- | --- |
| `node tools/solve.js` | beweist, dass jedes Level schaffbar ist, berechnet die Wertung und schreibt die Demos |
| `node tools/smoke-test.js` | spielt das Spiel in einem unsichtbaren Chromium durch (braucht [Playwright](https://playwright.dev)) |
| `node tools/build.js` | packt alles in eine einzige Datei `dist/wuerfelflug.html` zum Weitergeben |
| `node tools/build.js rennen` | dasselbe für das Rennen: `dist/kurvenfieber.html` |
| `node tools/race-test.js` | prüft die Rennstrecken und fährt Rennen nur mit Computerautos (ohne Browser, 1 Sekunde) |
| `node tools/smoke-test-rennen.js` | spielt das Rennen in einem unsichtbaren Chromium durch |
| `node tools/serve.js` | lokaler Webserver |

---

# Zweites Minigame: Kurvenfieber

Ein 3D-Autorennen im Browser gegen fünf Computergegner. Drei Rundkurse, drei
Schwierigkeitsstufen, 2, 3 oder 5 Runden. Du startest als Letzter.

`rennen/index.html` öffnen (Doppelklick genügt) oder über den Knopf im Menü von Würfelflug.
Mit Webserver: `node tools/serve.js`, dann <http://localhost:8080/rennen/>.

| Eingabe | Wirkung |
| --- | --- |
| Pfeil hoch oder W | Gas |
| Pfeil runter oder S | bremsen, im Stand rückwärts |
| Pfeil links/rechts oder A/D | lenken |
| Leertaste oder Shift | Turbo |
| C | Kamera: hinter dem Auto oder auf der Motorhaube |
| P/Esc, M, R | Pause, Ton, Neustart |
| Gamepad | linker Stick lenkt, rechter Trigger Gas, linker Trigger Bremse, A Turbo |
| Handy | Tasten am unteren Rand |

## Was drin ist

- **Drei Strecken:** *Sonnenküste* (1,3 km, weite Bögen auf einer Insel mit Palmen),
  *Bergpass* (1,7 km, Haarnadeln und 40 m Höhenunterschied im Nadelwald) und
  *Nachtstadt* (1,3 km, enge Ecken zwischen Hochhäusern, Laternen und Scheinwerfer).
- **Computergegner** fahren die Ideallinie (außen anfahren, innen am Scheitel), bremsen
  vor Kurven rechtzeitig, überholen auf der Seite mit mehr Platz und fahren dir nicht
  ins Heck. Jeder hat ein etwas anderes Können und eine eigene Spur. Wer weit hinter dir
  liegt, holt ein wenig auf.
- **Fahrphysik:** Zu schnell in der Kurve, und das Auto rutscht nach außen und verliert
  Tempo. Gras bremst, die Leitplanke noch mehr. Autos rempeln sich gegenseitig.
- **Turbo:** mehr Schub und höheres Spitzentempo, füllt sich langsam von selbst wieder auf.
- **Anzeige:** Platz, Runde, Zeit, Bestrunde, Abstände zu allen Fahrern, Minikarte,
  Tacho, Turbo-Balken, Warnung bei falscher Richtung, Startampel.
- **Ergebnis** mit Zeiten und Abständen aller Fahrer; Bestrunde und Siege je Strecke
  merkt sich der Browser.
- Motor, Reifenquietschen und Rempler entstehen live im Browser, ohne Sound-Dateien.

## Aufbau

| Datei | Aufgabe |
| --- | --- |
| `rennen/index.html`, `rennen/css/style.css` | Seite, Menü, Anzeige |
| `rennen/js/tracks.js` | Strecken (Stützpunkte mit Höhe), Autos, Schwierigkeitsstufen |
| `rennen/js/track.js` | glatte Kurve durch die Stützpunkte, Ideallinie, Kurventempo (läuft auch ohne Browser) |
| `rennen/js/sim.js` | Fahrphysik, Computergegner, Zusammenstöße, Runden (läuft auch ohne Browser) |
| `rennen/js/render3d.js` | 3D-Szene: Fahrbahn, Gelände, Landschaft, Autos, Kamera |
| `rennen/js/audio.js` | Motor und Geräusche |
| `rennen/js/game.js` | Ablauf, Eingabe, Anzeige, Menü |
| `rennen/vendor/three.min.js` | [Three.js](https://threejs.org) r149 (MIT-Lizenz), liegt bei, damit das Spiel ohne Netz läuft |

Jedes Auto wird entlang der Strecke beschrieben: Weg `s`, seitlicher Abstand `d` und
Winkel zur Fahrtrichtung. Daraus folgen Rundenzählung, Platzierung, Leitplanke und
Ideallinie ganz direkt. Die Physik rechnet in festen Schritten (120 pro Sekunde).

## Eigene Strecke

In `rennen/js/tracks.js` einen Eintrag mit Stützpunkten `[x, z, Höhe]` in Metern anlegen
(geschlossener Rundkurs, Start am ersten Punkt). Für Stadtkurse baut `corners()` aus
einem Vieleck abgerundete Ecken. Danach prüfen:

```
node tools/race-test.js
```

Der Test meldet zu enge Kurven, Streckenteile, die sich zu nahe kommen, und ob ein
fehlerfreier Testfahrer und ein volles Feld auf jeder Schwierigkeit ins Ziel kommen.
