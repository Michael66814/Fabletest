/* Minispiel-Protokoll, Version 1.

   Jedes Minispiel ist eine eigene Seite und läuft im Hauptspiel in einem <iframe>.
   Hauptspiel und Minispiel reden nur über window.postMessage miteinander. So kann
   ein Minispiel weiter allein laufen, und Minispiele stören sich nicht gegenseitig
   (eigene Variablen, eigene Tastatur-Abfrage, eigenes Audio).

   Ablauf einer Sitzung:

     Minispiel  -> hello    { manifest }                 sobald die Seite geladen ist
     Hauptspiel -> start    { session, params }          z. B. { level: 'l4' }
     Minispiel  -> started  { session }
     Minispiel  -> event    { session, name, data }      beliebig oft
     Hauptspiel -> pause / resume / settings { muted }   jederzeit
     Hauptspiel -> stop     { session }                  Hauptspiel bricht ab
     Minispiel  -> ended    { session, outcome, summary } genau einmal am Ende

   Jede Nachricht hat die Form { proto: 'minigame', v: 1, type, ... }.
   Ausführlich: docs/minispiele-und-quests.md */
(function (root) {
  'use strict';

  var PROTO = 'minigame';
  var VERSION = 1;
  var OUTCOMES = ['completed', 'failed', 'aborted'];

  function isMessage(d) {
    return !!d && typeof d === 'object' && d.proto === PROTO && d.v === VERSION && typeof d.type === 'string';
  }
  function message(type, payload) {
    var msg = { proto: PROTO, v: VERSION, type: type };
    if (payload) for (var k in payload) if (Object.prototype.hasOwnProperty.call(payload, k)) msg[k] = payload[k];
    return msg;
  }
  // Bei file:// ist der Ursprung "null"; dann geht nur "*"
  function targetOrigin(origin) {
    return !origin || origin === 'null' ? '*' : origin;
  }

  // ---------- Seite des Minispiels ----------
  // handlers: start(params, session), pause(), resume(), settings(s), stop()
  function connectHost(manifest, handlers) {
    handlers = handlers || {};
    var win = root.window;
    var parentWin = win && win.parent;
    var embedded = !!parentWin && parentWin !== win;
    var hostOrigin = null;
    var session = null;

    function post(type, payload) {
      if (!embedded) return;
      parentWin.postMessage(message(type, payload), hostOrigin ? targetOrigin(hostOrigin) : '*');
    }
    function call(name, a, b) {
      if (typeof handlers[name] === 'function') handlers[name](a, b);
    }

    var api = {
      embedded: embedded,
      session: function () { return session; },
      // Ereignis ans Hauptspiel melden (nur während einer Sitzung)
      emit: function (name, data) {
        if (session) post('event', { session: session, name: String(name), data: data || {} });
      },
      // Sitzung beenden: outcome = completed | failed | aborted
      end: function (outcome, summary) {
        if (!session) return;
        var s = session;
        session = null;
        post('ended', {
          session: s,
          outcome: OUTCOMES.indexOf(outcome) >= 0 ? outcome : 'aborted',
          summary: summary || {}
        });
      }
    };

    if (embedded) {
      win.addEventListener('message', function (e) {
        if (e.source !== parentWin || !isMessage(e.data)) return;
        var d = e.data;
        if (d.type === 'start') {
          if (session) api.end('aborted');            // alte Sitzung sauber schließen
          hostOrigin = e.origin;
          session = String(d.session);
          post('started', { session: session });
          call('start', d.params && typeof d.params === 'object' ? d.params : {}, session);
          return;
        }
        if (!session || d.session !== session) return;
        if (d.type === 'pause') call('pause');
        else if (d.type === 'resume') call('resume');
        else if (d.type === 'settings') call('settings', d.settings || {});
        else if (d.type === 'stop') {
          call('stop');
          api.end('aborted');
        }
      });
      post('hello', { manifest: manifest });
    }
    return api;
  }

  // ---------- Seite des Hauptspiels ----------
  // opts: container, url, params, title,
  //       onHello(manifest), onStarted(), onEvent(name, data), onEnded(outcome, summary)
  //       autoStart: false = nur vorladen; die Sitzung beginnt erst mit begin(params)
  function openMinigame(opts) {
    var doc = root.document;
    var frame = doc.createElement('iframe');
    var base = root.location ? root.location.href : undefined;
    var expected = new URL(opts.url, base).origin;
    var session = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var state = 'loading';                            // loading | running | ended
    var manifest = null;
    var hello = false;
    var wantStart = opts.autoStart !== false;

    frame.src = opts.url;
    frame.title = opts.title || 'Minispiel';
    frame.setAttribute('allow', 'autoplay');
    frame.className = 'minigame-frame';

    function send(type, payload) {
      if (state === 'ended' || !frame.contentWindow) return;
      frame.contentWindow.postMessage(message(type, payload), targetOrigin(expected));
    }
    function cb(name, a, b) {
      if (typeof opts[name] === 'function') opts[name](a, b);
    }
    function onMessage(e) {
      if (e.source !== frame.contentWindow || !isMessage(e.data)) return;
      if (expected !== 'null' && e.origin !== expected) return;
      var d = e.data;
      if (d.type === 'hello') {
        manifest = d.manifest || null;
        if (manifest && manifest.protocol !== VERSION) {
          finish('failed', { error: 'Protokollversion ' + manifest.protocol + ' wird nicht unterstützt' });
          return;
        }
        hello = true;
        cb('onHello', manifest);
        if (wantStart) send('start', { session: session, params: opts.params || {} });
      } else if (d.session !== session) {
        return;
      } else if (d.type === 'started') {
        state = 'running';
        cb('onStarted');
      } else if (d.type === 'event') {
        if (state === 'running') cb('onEvent', d.name, d.data || {});
      } else if (d.type === 'ended') {
        finish(d.outcome, d.summary || {});
      }
    }
    function finish(outcome, summary) {
      if (state === 'ended') return;
      state = 'ended';
      root.removeEventListener('message', onMessage);
      cb('onEnded', outcome, summary);
    }

    root.addEventListener('message', onMessage);
    opts.container.appendChild(frame);

    return {
      session: session,
      frame: frame,
      manifest: function () { return manifest; },
      state: function () { return state; },
      ready: function () { return hello; },
      // vorgeladenes Minispiel starten (bei autoStart: false)
      begin: function (params) {
        if (wantStart || state === 'ended') return;
        wantStart = true;
        if (params) opts.params = params;
        if (hello) send('start', { session: session, params: opts.params || {} });
      },
      pause: function () { send('pause', { session: session }); },
      resume: function () { send('resume', { session: session }); },
      settings: function (s) { send('settings', { session: session, settings: s }); },
      // Abbrechen: Das Minispiel antwortet mit "ended"; antwortet es nicht, beenden wir selbst
      stop: function () {
        if (state === 'ended') return;
        send('stop', { session: session });
        root.setTimeout(function () { finish('aborted', {}); }, 500);
      },
      destroy: function () {
        finish('aborted', {});
        if (frame.parentNode) frame.parentNode.removeChild(frame);
      }
    };
  }

  var Minigame = {
    PROTO: PROTO,
    VERSION: VERSION,
    OUTCOMES: OUTCOMES,
    isMessage: isMessage,
    connectHost: connectHost,
    openMinigame: openMinigame
  };
  root.Minigame = Minigame;
  if (typeof module === 'object' && module.exports) module.exports = Minigame;
})(globalThis);
