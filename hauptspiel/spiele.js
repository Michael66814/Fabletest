/* Minispiele und Orte in der 3D-Welt des Hauptspiels.

   Ein neues Minispiel kommt hier dazu: eigene Seite, Manifest (siehe js/manifest.js)
   und ein Eintrag in SPIELE. "ort" ist die Stelle auf der Insel (x nach rechts,
   z nach vorn, die Insel hat 30 Felder Radius), "station" das Aussehen der Station.
   Ohne "url" wird es eine Baustelle: „bald verfügbar“. */
(function (root) {
  'use strict';

  root.SPIELE = [
    {
      id: 'wuerfelflug',
      url: '../index.html',
      text: 'Spring mit dem Würfel über Stacheln und Blöcke, flieg durch Portale, sammle Augments.',
      details: ['10 Level', 'Geschicklichkeit'],
      farbe: '#ffb648',
      station: 'wuerfel',
      ort: { x: 0, z: -15 }
    },
    {
      id: 'bald-ost',
      name: 'Baustelle',
      text: 'Hier entsteht bald ein neues Minispiel.',
      farbe: '#6fd0ff',
      station: 'baustelle',
      ort: { x: 15, z: -3 }
    },
    {
      id: 'bald-west',
      name: 'Baustelle',
      text: 'Hier entsteht bald ein neues Minispiel.',
      farbe: '#baa0ff',
      station: 'baustelle',
      ort: { x: -15, z: -3 }
    }
  ];

  root.WELT = {
    radius: 30,                         // Insel
    start: { x: 0, z: 9 },              // hier steht die Figur beim ersten Besuch
    questtafel: { x: 7, z: 7 }
  };
})(globalThis);
