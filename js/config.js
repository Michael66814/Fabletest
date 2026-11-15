/* Würfelflug – zentrale Konstanten (Physik, Tempo, Maße).
   Alle Längen sind in "Feldern" angegeben: 1 Feld = Kantenlänge des Würfels. */
(function (WF) {
  'use strict';

  var STEPS_PER_SECOND = 240;

  WF.CFG = {
    // Fester Physik-Zeitschritt. Dadurch läuft das Spiel auf jedem Bildschirm
    // (60 Hz, 144 Hz …) exakt gleich und Aufzeichnungen bleiben reproduzierbar.
    STEPS_PER_SECOND: STEPS_PER_SECOND,
    DT: 1 / STEPS_PER_SECOND,

    // Spielfeld: 10 Felder hoch, darunter liegt der Boden.
    ROWS: 10,

    // Tempo in Feldern pro Sekunde = BASE_SPEED * SPEEDS[index]
    BASE_SPEED: 9.6,
    SPEEDS: [0.78, 1, 1.25, 1.5],
    SPEED_NAMES: ['Langsam', 'Normal', 'Schnell', 'Sehr schnell'],
    START_SPEED: 1,

    // Würfel: springt nur vom Boden (oder von einem Block) ab.
    CUBE: {
      hw: 0.5, hh: 0.5,        // halbe Breite / Höhe der Kollisionsbox
      g: 87,                   // Schwerkraft
      jumpV: 20,               // Absprunggeschwindigkeit -> ca. 2,3 Felder hoch, 0,46 s Flugzeit
      maxFall: 26,
      spin: Math.PI / 0.46     // dreht sich pro Sprung um 180°
    },

    // Papierflieger: jeder Klick gibt Auftrieb – auch mitten in der Luft.
    PLANE: {
      hw: 0.5, hh: 0.3,
      g: 34,
      flapV: 8.8,              // Auftrieb pro Klick
      maxFall: 12
    },

    // Kulanz: so weit darf der Spieler eine Blockkante "verfehlen" und wird
    // trotzdem sanft auf den Block gesetzt bzw. unter ihm hindurchgeschoben.
    LAND_TOL: 0.3,
    BONK_TOL: 0.3,

    // Die tödliche Box des Spielers ist ringsum etwas kleiner als das Bild,
    // und Stacheln/Sägen sind ebenfalls kleiner als gezeichnet (fairer).
    HAZ_INSET: 0.1,
    SPIKE_SCALE: 0.74,
    SAW_SCALE: 0.82,

    // Eingabe-Komfort beim Würfel
    BUFFER_STEPS: Math.round(0.10 * STEPS_PER_SECOND),  // zu früher Klick zählt noch
    COYOTE_STEPS: Math.round(0.06 * STEPS_PER_SECOND),  // kurz nach der Kante noch abspringen

    // Trickmodus: 1 Klick springen, 2 Klicks Schwerkraft umdrehen, 3 Klicks Flug auf Zeit
    CHAIN_STEPS: Math.round(0.30 * STEPS_PER_SECOND),   // so schnell müssen die Klicks aufeinander folgen
    FLY_STEPS: 3 * STEPS_PER_SECOND,                    // Dauer des Flugs nach dem Dreifachklick

    // Augments zum Einsammeln
    BOOST_STEPS: 6 * STEPS_PER_SECOND,     // Sprungkraft: so lange springt der Würfel höher …
    BOOST_FACTOR: 1.3,                     // … und zwar mit 1,3-facher Absprunggeschwindigkeit
    DOUBLE_STEPS: 8 * STEPS_PER_SECOND,    // Doppelsprung: so lange ist ein zweiter Sprung in der Luft möglich
    SHIELD_STEPS: Math.round(0.8 * STEPS_PER_SECOND),   // Schild: so lange ist man nach dem Treffer unverwundbar
    PICKUP_RADIUS: 0.45,

    // Level-Aufbau
    LEAD_IN: 14,     // freie Anlaufstrecke vor dem ersten Hindernis
    FINISH_GAP: 7,   // Abstand vom letzten Hindernis bis zum Ziel
    RUN_OUT: 40      // freie Strecke hinter dem Ziel
  };
})(globalThis.WF = globalThis.WF || {});
