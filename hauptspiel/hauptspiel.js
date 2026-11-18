/* Hauptspiel – Ablauf: Figur über die Insel laufen lassen, Stationen erkennen,
   Minispiele im Vollbild starten, Quests an der Quest-Tafel annehmen.
   Welt: welt.js · Eingabe: steuerung.js · Minispiele: platform/minigame-protocol.js
   Quests: platform/quests.js (gleicher Spielstand wie das Quest-Buch in hub/) */
import * as THREE from '../vendor/three/three.module.min.js';
import { buildWorld, makeCharacter } from './welt.js';
import { createInput } from './steuerung.js';

const QUEST_KEY = 'questbuch.v1';
const WORLD_KEY = 'welt.v1';
const manifests = globalThis.MINIGAMES || {};
const SPIELE = globalThis.SPIELE || [];
const WELT = globalThis.WELT;

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nameOf = s => s.name || (manifests[s.id] && manifests[s.id].name) || s.id;
const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---------- Quests ----------
// Bei jedem Zugriff frisch laden: Das Quest-Buch kann in einem anderen Tab offen sein.
function loadLog() {
  let saved = null;
  try { saved = JSON.parse(window.localStorage.getItem(QUEST_KEY) || 'null'); } catch (e) { /* neu */ }
  return Quests.createQuestLog({ quests: globalThis.QUESTS || [], manifests, state: saved });
}
function saveLog(l) {
  try { window.localStorage.setItem(QUEST_KEY, JSON.stringify(l.state())); } catch (e) { /* egal */ }
}
let log = loadLog();
saveLog(log);
const questTitle = id => (log.get(id) || { title: id }).title;

function toast(html) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.innerHTML = html;
  $('toasts').appendChild(node);
  window.setTimeout(() => node.remove(), 4200);
}

// ---------- Minispiel im Vollbild ----------
// Nähert sich die Figur einer Station, lädt das Minispiel schon unsichtbar vor
// (Protokoll: autoStart false). Beim Auswählen ist es dann meist sofort da.
let current = null;      // sichtbare Sitzung: { id, game }
let preloaded = null;    // vorgeladen, noch nicht gestartet
let onClosed = null;
let slowTimer = 0;

function handleEvent(spiel, name, data, session) {
  log = loadLog();
  const res = log.handle({ game: spiel.id, name, data, session });
  if (!res.progressed.length && !res.completed.length) return;
  saveLog(log);
  res.progressed.forEach(p => {
    if (p.target > 1 && p.value < p.target) toast(esc(questTitle(p.quest)) + ': ' + p.value + ' / ' + p.target);
  });
  res.completed.forEach(c => {
    const xp = c.rewards.find(r => r.type === 'xp');
    toast('<b>Quest geschafft:</b> ' + esc(questTitle(c.quest)) + (xp ? ' · ' + xp.amount + ' EP' : ''));
  });
  res.started.forEach(q => toast('Neue Quest: ' + esc(questTitle(q))));
}

function openFrame(spiel, autoStart, params) {
  const box = { id: spiel.id, game: null };
  box.game = Minigame.openMinigame({
    container: $('playerStage'),
    url: spiel.url,
    params: params || {},
    title: nameOf(spiel),
    autoStart,
    onStarted: () => {
      if (current !== box) return;
      hideLoader();
      box.game.frame.focus();
    },
    onEvent: (name, data) => { if (current === box) handleEvent(spiel, name, data, box.game.session); },
    onEnded: () => {
      if (current === box) closeGame();
      else if (preloaded === box) dropPreload();
    }
  });
  return box;
}

function preloadGame(id) {
  if (current || (preloaded && preloaded.id === id)) return;
  const spiel = SPIELE.find(s => s.id === id);
  if (!spiel || !spiel.url) return;
  dropPreload();
  preloaded = openFrame(spiel, false);
}
function dropPreload() {
  if (!preloaded) return;
  const p = preloaded;
  preloaded = null;
  p.game.destroy();
}

function showLoader(spiel) {
  $('loaderName').textContent = nameOf(spiel);
  $('loaderSlow').hidden = true;
  $('loader').hidden = false;
  window.clearTimeout(slowTimer);
  slowTimer = window.setTimeout(() => { $('loaderSlow').hidden = false; }, 12000);
}
function hideLoader() {
  window.clearTimeout(slowTimer);
  $('loader').hidden = true;
}

function playGame(id, params, label) {
  const spiel = SPIELE.find(s => s.id === id);
  if (!spiel || !spiel.url || current) return;
  closeQuests();
  $('player').hidden = false;
  $('playerTitle').textContent = label || nameOf(spiel);
  $('world').classList.add('is-behind');            // 3D-Welt nicht mehr zeichnen lassen
  pauseWorld(true);
  showLoader(spiel);
  if (preloaded && preloaded.id === id && preloaded.game.state() !== 'ended') {
    current = preloaded;
    preloaded = null;
    current.game.begin(params || {});
  } else {
    dropPreload();
    current = openFrame(spiel, true, params);
  }
}
function closeGame() {
  if (!current) return;
  const c = current;
  current = null;
  c.game.destroy();
  hideLoader();
  $('player').hidden = true;
  $('world').classList.remove('is-behind');
  log = loadLog();
  updateHud();
  pauseWorld(false);
  if (onClosed) onClosed();
}
$('btnBack').addEventListener('click', () => { if (current) current.game.stop(); });

// ---------- Quest-Tafel ----------
function rewardText(rewards) {
  return rewards.map(r => r.type === 'xp' ? r.amount + ' EP' : r.type === 'item' ? (r.count > 1 ? r.count + '× ' : '') + (r.name || r.id) : null)
    .filter(Boolean).join(' · ');
}
function renderQuest(q) {
  let html = '<li class="quest" data-quest="' + esc(q.id) + '"><div class="quest-head"><h4 class="quest-name">' + esc(q.title) + '</h4>' +
    (q.giver ? '<span class="quest-giver">' + esc(q.giver) + '</span>' : '') + '</div>' +
    (q.text ? '<p class="quest-text">' + esc(q.text) + '</p>' : '');
  if (q.status === 'active') {
    html += '<ul class="goals">' + q.objectives.map(o =>
      '<li class="goal' + (o.done ? ' is-done' : (o.current ? '' : ' is-waiting')) + '"><span>' + esc(o.text) + '</span>' +
      (o.target > 1 ? '<span class="goal-count">' + o.value + ' / ' + o.target + '</span>' : '') + '</li>').join('') + '</ul>';
  }
  html += '<div class="quest-foot"><span class="reward">' + esc(rewardText(q.rewards)) + '</span><div class="quest-actions">';
  if (q.status === 'available') {
    html += '<button class="btn btn-primary btn-small" type="button" data-accept="' + esc(q.id) + '">Annehmen</button>';
  } else if (q.status === 'active') {
    const next = q.objectives.find(o => o.current);
    if (next && SPIELE.some(s => s.id === next.game && s.url)) {
      html += '<button class="btn btn-primary btn-small" type="button" data-play="' + esc(q.id) + '" data-goal="' + esc(next.id) + '">Spielen</button>';
    }
    html += '<button class="btn btn-small" type="button" data-abandon="' + esc(q.id) + '">Aufgeben</button>';
  }
  return html + '</div></div></li>';
}
function renderQuests() {
  const all = log.list();
  const groups = [['active', 'Angenommen'], ['available', 'Neu an der Tafel'], ['completed', 'Geschafft']];
  let html = '';
  for (const [status, title] of groups) {
    const list = all.filter(q => q.status === status);
    if (list.length) html += '<h3>' + title + '</h3><ol class="quests">' + list.map(renderQuest).join('') + '</ol>';
  }
  const locked = all.filter(q => q.status === 'locked').length;
  if (locked) html += '<p class="empty">' + locked + (locked === 1 ? ' weitere Quest wird' : ' weitere Quests werden') + ' später freigeschaltet.</p>';
  $('questList').innerHTML = html || '<p class="empty">Keine Quests.</p>';
}
function openQuests() {
  log = loadLog();
  renderQuests();
  $('questPanel').hidden = false;
  input.enabled = false;
  input.reset();
  $('questCard').focus({ preventScroll: true });
}
function closeQuests() {
  if ($('questPanel').hidden) return;
  $('questPanel').hidden = true;
  input.enabled = !current;
  updateHud();
  $('scene').focus({ preventScroll: true });
}
$('btnQuestClose').addEventListener('click', closeQuests);
$('btnQuests').addEventListener('click', openQuests);
$('questPanel').addEventListener('click', e => {
  if (e.target === $('questPanel')) { closeQuests(); return; }
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.accept) {
    log = loadLog();
    log.accept(b.dataset.accept);
    saveLog(log);
    toast('Quest angenommen: ' + esc(questTitle(b.dataset.accept)));
    renderQuests();
  } else if (b.dataset.abandon) {
    log = loadLog();
    log.abandon(b.dataset.abandon);
    saveLog(log);
    renderQuests();
  } else if (b.dataset.play) {
    const q = log.get(b.dataset.play);
    const goal = q && q.objectives.find(o => o.id === b.dataset.goal);
    if (goal) playGame(goal.game, goal.launch || {}, q.title + ' · ' + goal.text);
  }
  updateHud();
});
document.addEventListener('keydown', e => {
  if (e.code === 'Escape' && !$('questPanel').hidden) closeQuests();
});

function updateHud() {
  const all = log.list();
  const active = all.filter(q => q.status === 'active').length;
  const fresh = all.filter(q => q.status === 'available' && !(q.repeatable && q.completions)).length;
  $('hudXp').textContent = String(log.profile().xp);
  $('hudQuests').textContent = String(active);
  $('hudQuestsText').textContent = (active === 1 ? 'Quest' : 'Quests') + (fresh ? ' · ' + fresh + ' neu' : '');
  $('btnQuests').classList.toggle('has-new', fresh > 0);
  if (world) world.setQuestMark(fresh > 0);
}

// ---------- Welt ----------
let world = null, renderer = null, input = null;
let paused = false;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (e) {
    return false;
  }
}

function showFallback() {
  $('world').hidden = true;
  $('fallback').hidden = false;
  $('fallbackList').innerHTML = SPIELE.filter(s => s.url).map(s =>
    '<li><span><b>' + esc(nameOf(s)) + '</b><br><small>' + esc(s.text || '') + '</small></span>' +
    '<button class="btn btn-primary btn-small" type="button" data-game="' + esc(s.id) + '">Spielen</button></li>').join('') +
    '<li><span><b>Quest-Tafel</b></span><button class="btn btn-small" type="button" id="fallbackQuests">Öffnen</button></li>';
  $('fallbackList').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b && b.dataset.game) playGame(b.dataset.game, {});
    else if (b && b.id === 'fallbackQuests') openQuests();
  });
  input = { enabled: true, reset() {} };
}

function pauseWorld(on) {
  paused = on;
  if (input) {
    input.enabled = !on;
    input.reset();
  }
}

function start() {
  const canvas = $('scene');
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !small, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
  world = buildWorld(scene, { spiele: SPIELE, welt: WELT, quality: { shadowSize: small ? 1024 : 2048 } });
  const hero = makeCharacter();
  scene.add(hero.group);

  input = createInput(canvas, $('stick'));
  canvas.tabIndex = -1;

  // Spielerposition und Kamera
  const me = { x: WELT.start.x, z: WELT.start.z, angle: Math.PI, speed: 0 };
  const cam = { yaw: 0, pitch: 0.42, dist: 12 };
  try {
    const saved = JSON.parse(window.localStorage.getItem(WORLD_KEY) || 'null');
    if (saved && isFinite(saved.x) && isFinite(saved.z) && Math.hypot(saved.x, saved.z) < world.radius) {
      me.x = saved.x; me.z = saved.z;
      if (isFinite(saved.angle)) me.angle = saved.angle;
      if (isFinite(saved.yaw)) cam.yaw = saved.yaw;
    }
  } catch (e) { /* Startpunkt */ }
  function savePos() {
    try { window.localStorage.setItem(WORLD_KEY, JSON.stringify({ x: me.x, z: me.z, angle: me.angle, yaw: cam.yaw })); } catch (e) { /* egal */ }
  }
  window.addEventListener('pagehide', savePos);
  onClosed = savePos;

  // Namensschilder der Stationen
  const labels = world.stations.map(st => {
    const node = document.createElement('div');
    node.className = 'label';
    if (st.kind === 'questtafel') node.innerHTML = 'Quest-Tafel';
    else if (st.kind === 'baustelle') node.innerHTML = 'Baustelle<small>bald verfügbar</small>';
    else node.innerHTML = esc(nameOf(st.spiel)) + '<small>Minispiel</small>';
    node.style.setProperty('--accent', st.spiel ? st.spiel.farbe : '#ffb648');
    $('labels').appendChild(node);
    return { st, node, v: new THREE.Vector3(st.x, st.labelY, st.z) };
  });

  // Station in Reichweite
  let near = null;
  function actionText(st) {
    if (st.kind === 'questtafel') return 'Quest-Tafel ansehen';
    if (st.kind === 'baustelle') return 'Baustelle ansehen';
    return nameOf(st.spiel) + ' spielen';
  }
  function interact() {
    if (!near || paused || !$('questPanel').hidden) return;
    savePos();
    if (near.kind === 'questtafel') openQuests();
    else if (near.kind === 'baustelle') toast('Hier entsteht bald ein neues Minispiel.');
    else playGame(near.spiel.id, {});
  }
  $('prompt').addEventListener('click', interact);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 68 : 55;              // hochkant etwas mehr Überblick
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const tmp = new THREE.Vector3();
  const clock = new THREE.Clock();
  let t = 0, helpTimer = 0, moved = false, saveTimer = 0;

  function step(dt) {
    const inp = input.read();
    // Kamera drehen und zoomen
    cam.yaw += inp.look.yaw;
    cam.pitch = Math.max(0.12, Math.min(1.15, cam.pitch + inp.look.pitch));
    cam.dist = Math.max(6, Math.min(22, cam.dist + inp.zoom * 1.2));

    // Laufen relativ zur Blickrichtung der Kamera
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    let mx = fx * inp.move.y + rx * inp.move.x;
    let mz = fz * inp.move.y + rz * inp.move.x;
    const amount = Math.min(1, Math.hypot(mx, mz));
    const target = amount * (inp.run ? 10 : 6);
    me.speed += (target - me.speed) * Math.min(1, dt * 10);
    if (amount > 0.01) {
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      me.x += mx * me.speed * dt;
      me.z += mz * me.speed * dt;
      // Figur dreht sich weich in Laufrichtung
      const want = Math.atan2(mx, mz);
      let d = want - me.angle;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      me.angle += d * Math.min(1, dt * 12);
      moved = true;
    }
    // Hindernisse: aus Kreisen herausschieben
    for (const c of world.colliders) {
      const dx = me.x - c.x, dz = me.z - c.z, min = c.r + 0.5;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 1e-4) {
        me.x = c.x + dx / d * min;
        me.z = c.z + dz / d * min;
      }
    }
    // Insel nicht verlassen
    const r = Math.hypot(me.x, me.z), maxR = world.radius - 1;
    if (r > maxR) { me.x *= maxR / r; me.z *= maxR / r; }

    hero.group.position.set(me.x, 0, me.z);
    hero.group.rotation.y = me.angle;
    hero.update(dt, Math.min(1, me.speed / 10), t);

    // Kamera folgt weich
    const cp = Math.cos(cam.pitch);
    tmp.set(me.x + Math.sin(cam.yaw) * cam.dist * cp, 1.4 + Math.sin(cam.pitch) * cam.dist, me.z + Math.cos(cam.yaw) * cam.dist * cp);
    camera.position.lerp(tmp, reduceMotion ? 1 : Math.min(1, dt * 8));
    camera.lookAt(me.x, 1.5, me.z);

    // nächste Station in Reichweite
    let best = null, bestD = Infinity;
    for (const st of world.stations) {
      const d = Math.hypot(me.x - st.x, me.z - st.z);
      if (d < st.reach && d < bestD) { best = st; bestD = d; }
    }
    // Minispiel in der Nähe schon vorladen
    for (const st of world.stations) {
      if (st.kind === 'spiel' && Math.hypot(me.x - st.x, me.z - st.z) < st.reach + 9) preloadGame(st.id);
    }
    if (best !== near) {
      near = best;
      $('prompt').hidden = !near;
      if (near) $('promptText').textContent = actionText(near);
    }
    if (inp.interact) interact();

    // Hilfe ausblenden, wenn man sich eine Weile bewegt hat
    if (moved) helpTimer += dt;
    $('help').classList.toggle('is-faded', helpTimer > 6);
    $('world').classList.toggle('is-touch', input.touch);

    saveTimer += dt;
    if (saveTimer > 3) { saveTimer = 0; savePos(); }
  }

  // Schilder über den Stationen; nähere verdecken fernere statt sich zu überlappen
  function placeLabels() {
    const w = window.innerWidth, h = window.innerHeight;
    const shown = [];
    labels.forEach(l => { l.d = Math.hypot(me.x - l.st.x, me.z - l.st.z); });
    labels.slice().sort((a, b) => a.d - b.d).forEach(l => {
      tmp.copy(l.v).project(camera);
      let ok = l.d < 32 && tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      const x = (tmp.x + 1) / 2 * w, y = (1 - tmp.y) / 2 * h;
      const bw = l.w || (l.w = l.node.offsetWidth || 160), bh = 34;
      if (ok) {
        for (const o of shown) {
          if (Math.abs(o.x - x) < (o.bw + bw) / 2 + 6 && Math.abs(o.y - y) < bh) { ok = false; break; }
        }
      }
      if (!ok) { l.node.style.opacity = '0'; return; }
      shown.push({ x, y, bw });
      l.node.style.opacity = String(Math.max(0, Math.min(1, (32 - l.d) / 6)));
      l.node.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%, -100%)';
    });
  }

  function frame() {
    window.requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    if (paused) return;                         // Minispiel läuft: Welt ruht
    t += dt;
    step(dt);
    world.update(reduceMotion ? 0 : t);
    renderer.render(scene, camera);
    placeLabels();
  }

  updateHud();
  $('loading').hidden = true;
  // erstes Bild sofort, damit die Kamera nicht von weit her einfliegt
  camera.position.set(me.x + Math.sin(cam.yaw) * cam.dist * Math.cos(cam.pitch), 1.4 + Math.sin(cam.pitch) * cam.dist, me.z + Math.cos(cam.yaw) * cam.dist * Math.cos(cam.pitch));
  frame();

  // Für automatische Tests (tools/hauptspiel-test.js)
  globalThis.HAUPTSPIEL = {
    log: () => log,
    playing: () => current ? { session: current.game.session, state: current.game.state() } : null,
    preloaded: () => preloaded ? { id: preloaded.id, ready: preloaded.game.ready(), state: preloaded.game.state() } : null,
    state: () => ({ x: me.x, z: me.z, angle: me.angle, near: near && near.id, paused, quests: !$('questPanel').hidden, camYaw: cam.yaw }),
    stations: () => world.stations.map(s => ({ id: s.id, kind: s.kind, x: s.x, z: s.z, reach: s.reach })),
    teleport: (x, z) => { me.x = x; me.z = z; }
  };
}

if (webglAvailable()) {
  try {
    start();
  } catch (e) {
    console.warn('3D-Welt konnte nicht starten:', e);
    showFallback();
  }
} else {
  showFallback();
}
