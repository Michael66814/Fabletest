/* Quest-Format und Quest-Buch.

   Eine Quest besteht aus Zielen (objectives). Jedes Ziel lauscht auf ein Ereignis
   eines Minispiels, filtert es mit "where" und zählt mit, bis "target" erreicht ist.
   Sind alle Ziele erreicht, ist die Quest geschafft und die Belohnungen gehen ins Profil.

   Läuft im Browser (globalThis.Quests) und in Node (require).
   Format und Beispiele: docs/minispiele-und-quests.md */
(function (root) {
  'use strict';

  var FORMAT = 1;
  var ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
  var OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin'];
  var NUM_OPS = ['gt', 'gte', 'lt', 'lte'];
  var QUEST_KEYS = ['id', 'title', 'text', 'giver', 'requires', 'autoAccept', 'repeatable', 'order', 'objectives', 'rewards'];
  var OBJ_KEYS = ['id', 'text', 'game', 'on', 'where', 'target', 'sum', 'scope', 'launch'];
  var REWARD_KEYS = { xp: ['type', 'amount'], item: ['type', 'id', 'count', 'name'], flag: ['type', 'id'] };

  var own = Object.prototype.hasOwnProperty;
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

  function getPath(obj, path) {
    var parts = path.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (!isObj(obj) || !own.call(obj, parts[i])) return undefined;
      obj = obj[parts[i]];
    }
    return obj;
  }

  // ---------- Filter: where ----------
  // { level: 'l4' }                  gleich
  // { percent: { gte: 80 } }         Vergleich (eq ne gt gte lt lte in nin)
  // { 'augments.shield': 0 }         Punkte greifen in verschachtelte Felder
  function matchValue(actual, cond) {
    if (!isObj(cond)) return actual === cond;
    for (var op in cond) {
      var v = cond[op];
      switch (op) {
        case 'eq': if (actual !== v) return false; break;
        case 'ne': if (actual === v) return false; break;
        case 'gt': if (!(typeof actual === 'number' && actual > v)) return false; break;
        case 'gte': if (!(typeof actual === 'number' && actual >= v)) return false; break;
        case 'lt': if (!(typeof actual === 'number' && actual < v)) return false; break;
        case 'lte': if (!(typeof actual === 'number' && actual <= v)) return false; break;
        case 'in': if (v.indexOf(actual) < 0) return false; break;
        case 'nin': if (v.indexOf(actual) >= 0) return false; break;
        default: return false;
      }
    }
    return true;
  }
  function matches(where, data) {
    if (!where) return true;
    for (var key in where) if (!matchValue(getPath(data, key), where[key])) return false;
    return true;
  }

  // ---------- Prüfung des Formats ----------
  function fieldSpec(fields, path) {
    var parts = path.split('.'), spec = null;
    for (var i = 0; i < parts.length; i++) {
      if (!fields || !own.call(fields, parts[i])) return null;
      spec = fields[parts[i]];
      fields = spec.type === 'object' ? spec.fields : null;
    }
    return spec;
  }
  function valueFits(spec, v) {
    switch (spec.type) {
      case 'number': return typeof v === 'number' && isFinite(v);
      case 'boolean': return typeof v === 'boolean';
      case 'string': return typeof v === 'string';
      case 'enum': return spec.values.indexOf(v) >= 0;
      default: return false;
    }
  }
  function checkCondition(spec, cond, where, err) {
    if (!isObj(cond)) {
      if (!valueFits(spec, cond)) err(where + ': ' + JSON.stringify(cond) + ' passt nicht zum Feldtyp ' + describe(spec));
      return;
    }
    var keys = Object.keys(cond);
    if (!keys.length) err(where + ': leerer Vergleich');
    keys.forEach(function (op) {
      var v = cond[op];
      if (OPS.indexOf(op) < 0) err(where + ': unbekannter Vergleich "' + op + '" (erlaubt: ' + OPS.join(', ') + ')');
      else if (NUM_OPS.indexOf(op) >= 0) {
        if (spec.type !== 'number') err(where + ': "' + op + '" geht nur bei Zahlen');
        else if (typeof v !== 'number') err(where + ': "' + op + '" braucht eine Zahl');
      } else if (op === 'in' || op === 'nin') {
        if (!Array.isArray(v) || !v.length) err(where + ': "' + op + '" braucht eine nicht leere Liste');
        else v.forEach(function (x) { if (!valueFits(spec, x)) err(where + ': ' + JSON.stringify(x) + ' passt nicht zum Feldtyp ' + describe(spec)); });
      } else if (!valueFits(spec, v)) {
        err(where + ': ' + JSON.stringify(v) + ' passt nicht zum Feldtyp ' + describe(spec));
      }
    });
  }
  function describe(spec) {
    return spec.type === 'enum' ? 'enum(' + spec.values.join(', ') + ')' : spec.type;
  }
  function unknownKeys(obj, allowed, where, err) {
    Object.keys(obj).forEach(function (k) {
      if (allowed.indexOf(k) < 0) err(where + ': unbekanntes Feld "' + k + '"');
    });
  }

  // Liefert eine Liste von Fehlermeldungen (leer = alles in Ordnung).
  // manifests: { spielId: manifest } – ohne Angabe werden Spiele und Ereignisse nicht geprüft.
  function validate(quests, manifests) {
    var errors = [];
    function err(msg) { errors.push(msg); }
    if (!Array.isArray(quests)) return ['Quests müssen eine Liste sein'];
    var ids = {};
    quests.forEach(function (q, qi) {
      var at = 'Quest ' + (q && q.id ? '"' + q.id + '"' : '#' + (qi + 1));
      if (!isObj(q)) return err(at + ': ist kein Objekt');
      unknownKeys(q, QUEST_KEYS, at, err);
      if (typeof q.id !== 'string' || !ID_RE.test(q.id)) err(at + ': id fehlt oder enthält ungültige Zeichen (a-z 0-9 . _ -)');
      else if (ids[q.id]) err(at + ': id gibt es doppelt');
      else ids[q.id] = q;
      if (typeof q.title !== 'string' || !q.title.trim()) err(at + ': title fehlt');
      ['text', 'giver'].forEach(function (k) { if (q[k] !== undefined && typeof q[k] !== 'string') err(at + ': ' + k + ' muss Text sein'); });
      ['autoAccept', 'repeatable'].forEach(function (k) { if (q[k] !== undefined && typeof q[k] !== 'boolean') err(at + ': ' + k + ' muss true oder false sein'); });
      if (q.order !== undefined && q.order !== 'any' && q.order !== 'sequence') err(at + ': order muss "any" oder "sequence" sein');

      if (q.requires !== undefined) {
        if (!isObj(q.requires)) err(at + ': requires muss ein Objekt sein');
        else {
          unknownKeys(q.requires, ['quests', 'flags'], at + '.requires', err);
          ['quests', 'flags'].forEach(function (k) {
            var v = q.requires[k];
            if (v !== undefined && (!Array.isArray(v) || v.some(function (x) { return typeof x !== 'string'; }))) err(at + ': requires.' + k + ' muss eine Liste von IDs sein');
          });
        }
      }

      if (!Array.isArray(q.objectives) || !q.objectives.length) err(at + ': braucht mindestens ein Ziel (objectives)');
      else {
        var objIds = {};
        q.objectives.forEach(function (o, oi) {
          var oat = at + ', Ziel ' + (o && o.id ? '"' + o.id + '"' : '#' + (oi + 1));
          if (!isObj(o)) return err(oat + ': ist kein Objekt');
          unknownKeys(o, OBJ_KEYS, oat, err);
          if (typeof o.id !== 'string' || !ID_RE.test(o.id)) err(oat + ': id fehlt oder ist ungültig');
          else if (objIds[o.id]) err(oat + ': id gibt es in dieser Quest doppelt');
          else objIds[o.id] = true;
          if (typeof o.text !== 'string' || !o.text.trim()) err(oat + ': text fehlt');
          if (typeof o.game !== 'string') err(oat + ': game fehlt');
          if (typeof o.on !== 'string') err(oat + ': on (Ereignisname) fehlt');
          if (o.where !== undefined && !isObj(o.where)) err(oat + ': where muss ein Objekt sein');
          if (o.target !== undefined && !(typeof o.target === 'number' && o.target > 0 && isFinite(o.target))) err(oat + ': target muss eine Zahl über 0 sein');
          if (o.target !== undefined && o.sum === undefined && o.target % 1 !== 0) err(oat + ': target muss beim Zählen eine ganze Zahl sein');
          if (o.scope !== undefined && o.scope !== 'total' && o.scope !== 'session') err(oat + ': scope muss "total" oder "session" sein');
          if (o.sum !== undefined && typeof o.sum !== 'string') err(oat + ': sum muss ein Feldname sein');
          if (o.launch !== undefined && !isObj(o.launch)) err(oat + ': launch muss ein Objekt sein');

          var m = manifests && typeof o.game === 'string' ? manifests[o.game] : null;
          if (manifests && typeof o.game === 'string' && !m) return err(oat + ': Spiel "' + o.game + '" ist nicht bekannt');
          if (!m) return;
          var ev = m.events && own.call(m.events, o.on) ? m.events[o.on] : null;
          if (!ev) return err(oat + ': ' + m.name + ' meldet kein Ereignis "' + o.on + '" (vorhanden: ' + Object.keys(m.events || {}).join(', ') + ')');
          if (isObj(o.where)) {
            Object.keys(o.where).forEach(function (path) {
              var spec = fieldSpec(ev.fields, path);
              if (!spec || spec.type === 'object') err(oat + ': Ereignis "' + o.on + '" hat kein Feld "' + path + '"');
              else checkCondition(spec, o.where[path], oat + ', where.' + path, err);
            });
          }
          if (typeof o.sum === 'string') {
            var s = fieldSpec(ev.fields, o.sum);
            if (!s || s.type !== 'number') err(oat + ': sum braucht ein Zahlenfeld von "' + o.on + '", "' + o.sum + '" ist keins');
          }
          if (isObj(o.launch)) {
            Object.keys(o.launch).forEach(function (k) {
              var p = m.params && own.call(m.params, k) ? m.params[k] : null;
              if (!p) err(oat + ': ' + m.name + ' kennt den Startwert "' + k + '" nicht');
              else if (!valueFits(p, o.launch[k])) err(oat + ': launch.' + k + ' = ' + JSON.stringify(o.launch[k]) + ' passt nicht zu ' + describe(p));
            });
          }
        });
      }

      if (q.rewards !== undefined) {
        if (!Array.isArray(q.rewards)) err(at + ': rewards muss eine Liste sein');
        else q.rewards.forEach(function (r, ri) {
          var rat = at + ', Belohnung #' + (ri + 1);
          if (!isObj(r) || !REWARD_KEYS[r.type]) return err(rat + ': type muss xp, item oder flag sein');
          unknownKeys(r, REWARD_KEYS[r.type], rat, err);
          if (r.type === 'xp' && !(typeof r.amount === 'number' && r.amount > 0 && r.amount % 1 === 0)) err(rat + ': amount muss eine ganze Zahl über 0 sein');
          if (r.type !== 'xp' && (typeof r.id !== 'string' || !ID_RE.test(r.id))) err(rat + ': id fehlt oder ist ungültig');
          if (r.type === 'item' && r.count !== undefined && !(typeof r.count === 'number' && r.count > 0 && r.count % 1 === 0)) err(rat + ': count muss eine ganze Zahl über 0 sein');
          if (r.type === 'item' && r.name !== undefined && typeof r.name !== 'string') err(rat + ': name muss Text sein');
        });
      }
    });

    // Voraussetzungen: gibt es die Quests, und gibt es keinen Kreis?
    quests.forEach(function (q) {
      if (!isObj(q) || !isObj(q.requires) || !Array.isArray(q.requires.quests)) return;
      q.requires.quests.forEach(function (id) {
        if (!ids[id]) err('Quest "' + q.id + '": setzt die unbekannte Quest "' + id + '" voraus');
      });
    });
    var mark = {};
    function visit(id, trail) {
      if (mark[id] === 2 || !ids[id]) return;
      if (mark[id] === 1) { err('Kreis in den Voraussetzungen: ' + trail.concat(id).join(' -> ')); return; }
      mark[id] = 1;
      var req = isObj(ids[id].requires) && Array.isArray(ids[id].requires.quests) ? ids[id].requires.quests : [];
      req.forEach(function (r) { visit(r, trail.concat(id)); });
      mark[id] = 2;
    }
    Object.keys(ids).forEach(function (id) { visit(id, []); });
    return errors;
  }

  // ---------- Quest-Buch: Zustand und Fortschritt ----------
  function freshState() {
    return { format: FORMAT, active: {}, done: {}, profile: { xp: 0, items: {}, flags: [] } };
  }
  function loadState(raw) {
    var st = freshState();
    if (!isObj(raw) || raw.format !== FORMAT) return st;
    if (isObj(raw.active)) st.active = clone(raw.active);
    if (isObj(raw.done)) st.done = clone(raw.done);
    if (isObj(raw.profile)) {
      if (typeof raw.profile.xp === 'number') st.profile.xp = raw.profile.xp;
      if (isObj(raw.profile.items)) st.profile.items = clone(raw.profile.items);
      if (Array.isArray(raw.profile.flags)) st.profile.flags = raw.profile.flags.slice();
    }
    return st;
  }

  // opts: { quests, manifests?, state? }
  function createQuestLog(opts) {
    var quests = opts.quests;
    var errors = validate(quests, opts.manifests);
    if (errors.length) throw new Error('Quest-Daten fehlerhaft:\n  ' + errors.join('\n  '));
    var byId = {};
    quests.forEach(function (q) { byId[q.id] = q; });
    var st = loadState(opts.state);
    // Fortschritt zu Quests, die es nicht mehr gibt, fliegt raus
    Object.keys(st.active).forEach(function (id) { if (!byId[id]) delete st.active[id]; });

    function target(o) { return o.target === undefined ? 1 : o.target; }
    function value(q, o) {
      var a = st.active[q.id];
      var v = a && a.progress[o.id];
      if (isObj(v)) v = v.value;                       // Ziel mit scope "session"
      return Math.min(target(o), typeof v === 'number' ? v : 0);
    }
    function objectiveDone(q, o) { return value(q, o) >= target(o); }
    function requirementsMet(q) {
      var r = q.requires || {};
      return (r.quests || []).every(function (id) { return st.done[id] > 0; }) &&
        (r.flags || []).every(function (f) { return st.profile.flags.indexOf(f) >= 0; });
    }
    function status(id) {
      var q = byId[id];
      if (!q) return null;
      if (st.active[id]) return 'active';
      if (st.done[id] > 0 && !q.repeatable) return 'completed';
      return requirementsMet(q) ? 'available' : 'locked';
    }
    function activate(q) {
      st.active[q.id] = { progress: {} };
    }
    // Quests mit autoAccept starten von selbst, sobald sie verfügbar sind
    function refresh() {
      var started = [];
      quests.forEach(function (q) {
        if (q.autoAccept && status(q.id) === 'available' && !(q.repeatable && st.done[q.id] > 0)) {
          activate(q);
          started.push(q.id);
        }
      });
      return started;
    }
    function grant(rewards) {
      var p = st.profile;
      (rewards || []).forEach(function (r) {
        if (r.type === 'xp') p.xp += r.amount;
        else if (r.type === 'item') p.items[r.id] = (p.items[r.id] || 0) + (r.count || 1);
        else if (r.type === 'flag' && p.flags.indexOf(r.id) < 0) p.flags.push(r.id);
      });
    }

    function view(q) {
      return {
        id: q.id, title: q.title, text: q.text || '', giver: q.giver || '',
        status: status(q.id), repeatable: !!q.repeatable, completions: st.done[q.id] || 0,
        order: q.order || 'any',
        objectives: q.objectives.map(function (o, i) {
          var done = objectiveDone(q, o);
          var current = !done && (q.order !== 'sequence' || q.objectives.slice(0, i).every(function (p) { return objectiveDone(q, p); }));
          return {
            id: o.id, text: o.text, game: o.game, value: value(q, o), target: target(o),
            done: done, current: current, scope: o.scope || 'total', launch: clone(o.launch) || null
          };
        }),
        rewards: clone(q.rewards) || []
      };
    }

    refresh();

    return {
      // alle Quests mit Status: locked | available | active | completed
      list: function () { return quests.map(view); },
      get: function (id) { return byId[id] ? view(byId[id]) : null; },
      status: status,
      profile: function () { return clone(st.profile); },
      // Zustand zum Speichern (JSON)
      state: function () { return clone(st); },

      accept: function (id) {
        if (status(id) !== 'available') return false;
        activate(byId[id]);
        return true;
      },
      abandon: function (id) {
        if (!st.active[id]) return false;
        delete st.active[id];
        return true;
      },

      // Ereignis eines Minispiels verarbeiten: { game, name, data, session }
      // Ergebnis: { progressed: [...], completed: [...], started: [...] }
      handle: function (evt) {
        var out = { progressed: [], completed: [], started: [] };
        var data = isObj(evt.data) ? evt.data : {};
        quests.forEach(function (q) {
          var a = st.active[q.id];
          if (!a) return;
          for (var i = 0; i < q.objectives.length; i++) {
            var o = q.objectives[i];
            var done = objectiveDone(q, o);
            if (!done && o.game === evt.game && o.on === evt.name && matches(o.where, data)) {
              var inc = o.sum ? getPath(data, o.sum) : 1;
              if (typeof inc === 'number' && inc > 0 && isFinite(inc)) {
                var before = value(q, o);
                if (o.scope === 'session') {
                  var cur = a.progress[o.id];
                  var base = isObj(cur) && cur.session === evt.session ? cur.value : 0;
                  a.progress[o.id] = { session: evt.session, value: base + inc };
                } else {
                  a.progress[o.id] = (typeof a.progress[o.id] === 'number' ? a.progress[o.id] : 0) + inc;
                }
                var after = value(q, o);
                if (after !== before) out.progressed.push({ quest: q.id, objective: o.id, value: after, target: target(o) });
              }
            }
            // Bei "sequence" zählt immer nur das erste offene Ziel. Wurde es gerade
            // erreicht, wartet das nächste Ziel auf das nächste Ereignis.
            if (q.order === 'sequence' && !done) break;
          }
          if (q.objectives.every(function (o) { return objectiveDone(q, o); })) {
            delete st.active[q.id];
            st.done[q.id] = (st.done[q.id] || 0) + 1;
            grant(q.rewards);
            out.completed.push({ quest: q.id, rewards: clone(q.rewards) || [] });
          }
        });
        if (out.completed.length) out.started = refresh();
        return out;
      }
    };
  }

  var Quests = {
    FORMAT: FORMAT,
    validate: validate,
    matches: matches,
    createQuestLog: createQuestLog
  };
  root.Quests = Quests;
  if (typeof module === 'object' && module.exports) module.exports = Quests;
})(globalThis);
