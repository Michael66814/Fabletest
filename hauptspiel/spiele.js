/* Liste der Minispiele im Hauptspiel.
   Ein neues Minispiel kommt hier dazu: eigene Seite, Manifest (siehe js/manifest.js)
   und ein Eintrag in dieser Liste. Ohne "url" erscheint es als „bald verfügbar“. */
(function (root) {
  'use strict';

  root.SPIELE = [
    {
      id: 'wuerfelflug',
      url: '../index.html',
      text: 'Spring mit dem Würfel über Stacheln und Blöcke, flieg durch Portale, sammle Augments.',
      details: ['10 Level', 'Geschicklichkeit'],
      farbe: '#ffb648',
      bild: 'wuerfel'
    },
    {
      id: 'bald-1',
      name: 'Nächstes Minispiel',
      text: 'Hier kommt das nächste Spiel hin.',
      farbe: '#6fd0ff',
      bild: 'frage'
    }
  ];
})(globalThis);
