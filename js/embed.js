/* Würfelflug – Anbindung ans Hauptspiel.
   Nur aktiv, wenn das Spiel in einem <iframe> läuft. Dann meldet es sich mit seinem
   Manifest (js/manifest.js), nimmt Startangaben entgegen (z. B. ein Level) und meldet
   Ereignisse aus js/game.js weiter. Allein geöffnet ändert sich nichts.
   Protokoll: platform/minigame-protocol.js */
(function (WF) {
  'use strict';

  var Minigame = globalThis.Minigame;
  var manifest = globalThis.MINIGAMES && globalThis.MINIGAMES.wuerfelflug;
  if (!Minigame || !manifest || typeof window === 'undefined') return;

  var control = null;      // kommt von js/game.js, sobald das Spiel läuft
  var pending = null;      // Startangaben, die vor dem Spiel eintrafen
  var fixed = false;       // Hauptspiel hat ein bestimmtes Level gestartet
  var run = null;          // Zusammenfassung der Sitzung
  var started = false;     // Hauptspiel hat mindestens einmal gestartet

  var host = Minigame.connectHost(manifest, {
    start: function (params) {
      started = true;
      pending = params;
      if (control) apply();
    },
    pause: function () { if (control) control.pause(); },
    resume: function () { if (control) control.resume(); },
    settings: function (s) {
      if (control && typeof s.muted === 'boolean') control.setMuted(s.muted);
    },
    stop: function () {
      fixed = false;
      setLabels();
      if (control) control.menu();
    }
  });
  if (!host.embedded) return;

  document.documentElement.classList.add('is-embedded');

  function setLabels() {
    var text = fixed ? 'Zurück' : 'Zum Menü';
    ['btnMenu', 'btnQuit'].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.textContent = text;
    });
  }

  function apply() {
    var p = pending || {};
    pending = null;
    run = { completed: false, attempts: 0, best: 0, level: null };
    if (typeof p.muted === 'boolean') control.setMuted(p.muted);
    var practice = typeof p.practice === 'boolean' ? p.practice : undefined;
    fixed = typeof p.level === 'string' && control.startLevel(p.level, practice);
    setLabels();
    if (!fixed) control.menu();
  }

  WF.bridge = {
    attach: function (c) {
      control = c;
      if (pending) apply();
    },
    emit: function (name, data) {
      if (run) {
        run.level = data.level;
        if (name === 'attempt.ended') {
          run.attempts++;
          if (data.percent > run.best) run.best = data.percent;
        } else if (name === 'level.completed' && !data.practice) {
          run.completed = true;
        }
      }
      host.emit(name, data);
    },
    fixedLevel: function () { return fixed; },
    // vorgeladen, aber noch nicht gestartet: nichts zeichnen, Rechenzeit sparen
    waiting: function () { return !started; },
    // Spieler verlässt das Level über "Zurück": Sitzung beenden
    left: function () {
      if (!fixed) return;
      fixed = false;
      setLabels();
      host.end(run && run.completed ? 'completed' : 'aborted', run || {});
    }
  };
})(globalThis.WF = globalThis.WF || {});
