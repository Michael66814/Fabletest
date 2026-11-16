/* Vorläufiges Hauptspiel: Minispiele auswählen und spielen.
   Ereignisse aus den Minispielen gehen ins Quest-Buch (gleicher Speicher wie hub/),
   damit Quests auch beim freien Spielen weiterkommen. */
(function () {
  'use strict';

  var QUEST_KEY = 'questbuch.v1';                     // derselbe Spielstand wie im Quest-Buch
  var manifests = globalThis.MINIGAMES || {};
  var spiele = globalThis.SPIELE || [];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nameOf(s) {
    return s.name || (manifests[s.id] && manifests[s.id].name) || s.id;
  }

  // ---------- Quest-Buch ----------
  // Den Spielstand bei jedem Ereignis frisch laden: Das Quest-Buch kann in einem
  // anderen Tab offen sein und ihn inzwischen geändert haben.
  function loadLog() {
    var saved = null;
    try { saved = JSON.parse(window.localStorage.getItem(QUEST_KEY) || 'null'); } catch (e) { /* neu */ }
    return Quests.createQuestLog({ quests: globalThis.QUESTS || [], manifests: manifests, state: saved });
  }
  function saveLog(log) {
    try { window.localStorage.setItem(QUEST_KEY, JSON.stringify(log.state())); } catch (e) { /* egal */ }
  }
  var log = loadLog();
  saveLog(log);                                       // Startquests mit autoAccept festhalten

  function questsFor(gameId) {
    return log.list().filter(function (q) {
      return q.status === 'active' && q.objectives.some(function (o) { return o.game === gameId && !o.done; });
    });
  }
  function questTitle(id) {
    var q = log.get(id);
    return q ? q.title : id;
  }

  // ---------- Anzeige ----------
  var BILDER = {
    wuerfel: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="10" width="44" height="44" rx="10" fill="#f4ecd8"/>' +
      '<circle cx="22" cy="22" r="4.5" fill="#10201d"/><circle cx="32" cy="32" r="4.5" fill="#10201d"/><circle cx="42" cy="42" r="4.5" fill="#10201d"/>' +
      '<path d="M50 8l10-4-4 10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    frage: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="10" width="44" height="44" rx="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="6 5"/>' +
      '<path d="M26 26a6 6 0 1 1 9 5c-2 1.2-3 2.6-3 5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/><circle cx="32" cy="43" r="2.4" fill="currentColor"/></svg>'
  };

  function renderStatus() {
    var p = log.profile();
    var active = log.list().filter(function (q) { return q.status === 'active'; }).length;
    var done = log.list().filter(function (q) { return q.completions > 0; }).length;
    $('status').innerHTML =
      '<div><span class="status-value" id="statusXp">' + p.xp + '</span><span class="status-label">Erfahrung</span></div>' +
      '<div><span class="status-value">' + active + '</span><span class="status-label">offene Quests</span></div>' +
      '<div><span class="status-value">' + done + '</span><span class="status-label">geschaffte Quests</span></div>';
  }

  function renderGames() {
    $('games').innerHTML = spiele.map(function (s) {
      var playable = !!s.url;
      var quests = playable ? questsFor(s.id) : [];
      var questLine = quests.length
        ? '<p class="game-quests"><b>' + quests.length + (quests.length === 1 ? ' Quest' : ' Quests') + ':</b> ' +
          esc(quests.map(function (q) { return q.title; }).join(', ')) + '</p>'
        : '';
      return '<li class="game' + (playable ? '' : ' is-soon') + '" style="--accent:' + esc(s.farbe || '#f4ecd8') + '">' +
        '<div class="game-art">' + (BILDER[s.bild] || BILDER.frage) + '</div>' +
        '<div class="game-body">' +
          '<h3 class="game-name">' + esc(nameOf(s)) + '</h3>' +
          '<p class="game-text">' + esc(s.text || '') + '</p>' +
          (s.details && s.details.length ? '<p class="game-details">' + esc(s.details.join(' · ')) + '</p>' : '') +
          questLine +
        '</div>' +
        '<div class="game-action">' +
          (playable
            ? '<button class="btn btn-primary" type="button" data-game="' + esc(s.id) + '">Spielen</button>'
            : '<span class="soon">Bald verfügbar</span>') +
        '</div></li>';
    }).join('');
  }

  function render() {
    renderStatus();
    renderGames();
  }

  function toast(html) {
    var node = document.createElement('div');
    node.className = 'toast';
    node.innerHTML = html;
    $('toasts').appendChild(node);
    window.setTimeout(function () { node.remove(); }, 4200);
  }

  // ---------- Minispiel spielen ----------
  var current = null;

  function play(id) {
    var s = spiele.filter(function (x) { return x.id === id; })[0];
    if (!s || !s.url || current) return;
    $('start').hidden = true;
    $('player').hidden = false;
    $('playerTitle').textContent = nameOf(s);
    current = Minigame.openMinigame({
      container: $('playerStage'),
      url: s.url,
      params: {},                                     // ohne Level: das Spiel zeigt sein eigenes Menü
      title: nameOf(s),
      onStarted: function () { if (current) current.frame.focus(); },
      onEvent: function (name, data) {
        log = loadLog();
        var res = log.handle({ game: s.id, name: name, data: data, session: current && current.session });
        if (!res.progressed.length && !res.completed.length) return;
        saveLog(log);
        res.completed.forEach(function (c) {
          var xp = c.rewards.filter(function (r) { return r.type === 'xp'; })[0];
          toast('<b>Quest geschafft:</b> ' + esc(questTitle(c.quest)) + (xp ? ' · ' + xp.amount + ' EP' : ''));
        });
        res.started.forEach(function (q) { toast('Neue Quest: ' + esc(questTitle(q))); });
      },
      onEnded: close
    });
  }

  function close() {
    if (!current) return;
    var c = current;
    current = null;
    c.destroy();
    $('player').hidden = true;
    $('start').hidden = false;
    log = loadLog();
    render();
    var btn = document.querySelector('[data-game]');
    if (btn) btn.focus({ preventScroll: true });
  }

  $('games').addEventListener('click', function (e) {
    var b = e.target.closest('[data-game]');
    if (b) play(b.dataset.game);
  });
  // "Zurück": das Minispiel bekommt "stop", antwortet mit "ended", dann schließt sich das Fenster
  $('btnBack').addEventListener('click', function () {
    if (current) current.stop();
  });
  // Quest-Buch in einem anderen Tab geändert: Anzeige auffrischen
  window.addEventListener('storage', function (e) {
    if (e.key === QUEST_KEY && !current) {
      log = loadLog();
      render();
    }
  });

  render();

  // Für automatische Tests (tools/hauptspiel-test.js)
  globalThis.HAUPTSPIEL = {
    log: function () { return log; },
    playing: function () { return current ? { session: current.session, state: current.state() } : null; }
  };
})();
