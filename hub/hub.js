/* Quest-Buch – kleine Test-Oberfläche für das Hauptspiel.
   Zeigt die Quests, startet Minispiele im <iframe> und gibt deren Ereignisse ans
   Quest-Buch weiter. Ein echtes Hauptspiel (Karte, Figuren …) ersetzt nur diese Datei;
   Protokoll und Quest-Format bleiben gleich. */
(function () {
  'use strict';

  var STORE_KEY = 'questbuch.v1';
  // Wo die Minispiele liegen (relativ zu dieser Seite)
  var GAMES = {
    wuerfelflug: { url: '../index.html' }
  };
  var STATUS_TITLES = { active: 'Aktiv', available: 'Verfügbar', completed: 'Abgeschlossen', locked: 'Gesperrt' };
  var manifests = globalThis.MINIGAMES || {};

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var saved = null;
  try { saved = JSON.parse(window.localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { /* neu anfangen */ }
  var log = Quests.createQuestLog({ quests: globalThis.QUESTS || [], manifests: manifests, state: saved });
  function save() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(log.state())); } catch (e) { /* egal */ }
  }

  // ---------- Anzeige ----------
  var itemNames = {};
  (globalThis.QUESTS || []).forEach(function (q) {
    (q.rewards || []).forEach(function (r) { if (r.type === 'item' && r.name) itemNames[r.id] = r.name; });
  });
  function questTitle(id) {
    var q = log.get(id);
    return q ? q.title : id;
  }
  function rewardText(rewards) {
    return rewards.map(function (r) {
      if (r.type === 'xp') return r.amount + ' EP';
      if (r.type === 'item') return (r.count > 1 ? r.count + '× ' : '') + (r.name || r.id);
      return null;                                     // Flags sind unsichtbar
    }).filter(Boolean).join(' · ');
  }
  function lockedText(q) {
    var def = (globalThis.QUESTS || []).filter(function (d) { return d.id === q.id; })[0];
    var need = ((def.requires || {}).quests || []).filter(function (id) { return log.status(id) !== 'completed'; });
    return need.length ? 'Erst: ' + need.map(questTitle).join(', ') : 'Noch nicht freigeschaltet';
  }

  function renderProfile() {
    var p = log.profile();
    var items = Object.keys(p.items).map(function (id) {
      return (p.items[id] > 1 ? p.items[id] + '× ' : '') + (itemNames[id] || id);
    });
    var titles = p.flags.filter(function (f) { return f.indexOf('titel.') === 0; }).map(function (f) { return f.slice(6); });
    $('profile').innerHTML =
      '<div><dt>Erfahrung</dt><dd id="xp">' + p.xp + ' EP</dd></div>' +
      '<div><dt>Gegenstände</dt><dd>' + (items.length ? esc(items.join(', ')) : '–') + '</dd></div>' +
      (titles.length ? '<div><dt>Titel</dt><dd>' + esc(titles.join(', ')) + '</dd></div>' : '');
  }

  function renderQuest(q) {
    var html = '<li class="quest" data-quest="' + esc(q.id) + '" data-status="' + q.status + '">' +
      '<div class="quest-head"><h3 class="quest-title">' + esc(q.title) + '</h3>' +
      (q.giver ? '<span class="quest-giver">' + esc(q.giver) + '</span>' : '') + '</div>' +
      (q.text ? '<p class="quest-text">' + esc(q.text) + '</p>' : '');
    if (q.status === 'active' || q.status === 'completed') {
      html += '<ol class="objectives">';
      q.objectives.forEach(function (o) {
        var done = q.status === 'completed' || o.done;
        var shown = done ? o.target : o.value;
        html += '<li class="objective" data-done="' + done + '" data-current="' + (o.current || done) + '">' +
          '<span class="objective-text">' + esc(o.text) + (o.scope === 'session' ? ' <small>(eine Sitzung)</small>' : '') + '</span>' +
          (o.target > 1 ? '<span class="objective-count">' + shown + ' / ' + o.target + '</span>' : '<span></span>') +
          (o.target > 1 ? '<div class="objective-meter"><span style="width:' + Math.round(100 * shown / o.target) + '%"></span></div>' : '') +
          '</li>';
      });
      html += '</ol>';
    }
    html += '<div class="quest-foot"><span class="rewards">' + esc(rewardText(q.rewards)) +
      (q.repeatable && q.completions ? ' · ' + q.completions + '× geschafft' : '') + '</span><div class="quest-actions">';
    if (q.status === 'available') {
      html += '<button class="btn btn-primary btn-small" type="button" data-accept="' + esc(q.id) + '">Annehmen</button>';
    } else if (q.status === 'active') {
      var next = q.objectives.filter(function (o) { return o.current; })[0];
      if (next) html += '<button class="btn btn-primary btn-small" type="button" data-play="' + esc(q.id) + '" data-objective="' + esc(next.id) + '">Spielen</button>';
      html += '<button class="btn btn-small" type="button" data-abandon="' + esc(q.id) + '">Aufgeben</button>';
    } else if (q.status === 'locked') {
      html += '<span class="locked-note">' + esc(lockedText(q)) + '</span>';
    }
    return html + '</div></div></li>';
  }

  function render() {
    var groups = { active: [], available: [], completed: [], locked: [] };
    log.list().forEach(function (q) { groups[q.status].push(q); });
    var html = '';
    ['active', 'available', 'completed', 'locked'].forEach(function (s) {
      if (!groups[s].length) return;
      html += '<section><h2>' + STATUS_TITLES[s] + '</h2><ol class="quests">' + groups[s].map(renderQuest).join('') + '</ol></section>';
    });
    $('sections').innerHTML = html || '<p class="empty">Keine Quests vorhanden.</p>';
    renderProfile();
  }

  function toast(html) {
    var node = document.createElement('div');
    node.className = 'toast';
    node.innerHTML = html;
    $('toasts').appendChild(node);
    window.setTimeout(function () { node.remove(); }, 4200);
  }

  // ---------- Minispiel starten ----------
  var current = null;

  function play(gameId, params, label) {
    var game = GAMES[gameId];
    if (!game || current) return;
    $('player').hidden = false;
    $('playerTitle').textContent = label || (manifests[gameId] ? manifests[gameId].name : gameId);
    current = Minigame.openMinigame({
      container: $('playerStage'),
      url: game.url,
      params: params || {},
      title: manifests[gameId] ? manifests[gameId].name : gameId,
      onStarted: function () { if (current) current.frame.focus(); },
      onEvent: function (name, data) {
        var res = log.handle({ game: gameId, name: name, data: data, session: current && current.session });
        if (!res.progressed.length && !res.completed.length) return;
        save();
        res.progressed.forEach(function (p) {
          if (p.target > 1 && p.value < p.target) toast(esc(questTitle(p.quest)) + ': ' + p.value + ' / ' + p.target);
        });
        res.completed.forEach(function (c) {
          var r = rewardText(c.rewards);
          toast('<b>Quest geschafft:</b> ' + esc(questTitle(c.quest)) + (r ? ' · ' + esc(r) : ''));
        });
        res.started.forEach(function (id) { toast('Neue Quest: ' + esc(questTitle(id))); });
        render();
      },
      onEnded: function () { close(); }
    });
  }

  function close() {
    if (!current) return;
    var c = current;
    current = null;
    c.destroy();
    $('player').hidden = true;
    render();
  }

  // ---------- Bedienung ----------
  $('sections').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.accept) {
      log.accept(b.dataset.accept);
      save();
      render();
    } else if (b.dataset.abandon) {
      log.abandon(b.dataset.abandon);
      save();
      render();
    } else if (b.dataset.play) {
      var q = log.get(b.dataset.play);
      var o = q && q.objectives.filter(function (x) { return x.id === b.dataset.objective; })[0];
      if (o) play(o.game, o.launch || {}, q.title + ' · ' + o.text);
    }
  });
  $('btnClose').addEventListener('click', function () {
    if (current) current.stop();                       // Minispiel antwortet mit "ended", dann schließt sich das Fenster
  });
  $('btnFree').addEventListener('click', function () { play('wuerfelflug', {}, 'Würfelflug'); });
  var resetArmed = 0;
  $('btnReset').addEventListener('click', function () {
    if (!resetArmed) {
      $('btnReset').textContent = 'Wirklich löschen? Nochmal drücken';
      resetArmed = window.setTimeout(function () { resetArmed = 0; $('btnReset').textContent = 'Fortschritt löschen'; }, 4000);
      return;
    }
    window.clearTimeout(resetArmed);
    resetArmed = 0;
    $('btnReset').textContent = 'Fortschritt löschen';
    log = Quests.createQuestLog({ quests: globalThis.QUESTS || [], manifests: manifests });
    save();
    render();
  });
  document.addEventListener('keydown', function (e) {
    if (e.code === 'Escape' && current && document.activeElement !== current.frame) current.stop();
  });

  render();

  // Für automatische Tests (tools/hub-test.js)
  globalThis.HUB = {
    log: function () { return log; },
    playing: function () { return current ? { session: current.session, state: current.state() } : null; },
    frame: function () { return current && current.frame; }
  };
})();
