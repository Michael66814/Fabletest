/* Hauptspiel – die 3D-Welt: Insel, Pflanzen, Stationen der Minispiele, Quest-Tafel
   und die Spielfigur. Alles aus einfachen Formen gebaut (keine Modelldateien).

   Die Insel wird in "Plan-Einheiten" gebaut (Radius 30, Orte aus spiele.js) und dann
   als Ganzes um opts.scale vergrößert. Die Figur wird nicht vergrößert: So bestimmt
   scale, wie groß die Welt im Verhältnis zur Figur wirkt und wie lang die Wege sind.
   Alles, was buildWorld zurückgibt (Hindernisse, Stationen, Radius), ist schon in
   echten Einheiten der Welt. */
import * as THREE from '../vendor/three/three.module.min.js';

const COLORS = {
  grass: '#5f9f4a', sand: '#e6d3a0', water: '#2b8fb0', dirt: '#7a5a3a',
  path: '#d9c9a0', stone: '#a3aaa0', stoneDark: '#7f877e', wood: '#8a5a34', woodDark: '#5f3d22',
  ivory: '#f4ecd8', ink: '#10201d', sky: '#a6dcf2',
  leaves: ['#3f8f4a', '#4fa356', '#2f7a45', '#5aa84a'],
  flowers: ['#ffb648', '#ff6fae', '#f4ecd8', '#baa0ff', '#6fd0ff']
};

// Zufall mit festem Startwert: die Insel sieht bei jedem Besuch gleich aus
function random(seed) {
  return function () {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const materials = new Map();
function mat(color, extra) {
  const key = color + JSON.stringify(extra || {});
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.9, metalness: 0 }, extra)));
  }
  return materials.get(key);
}
function mesh(geo, material, x, y, z, opts) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = !(opts && opts.cast === false);
  m.receiveShadow = !(opts && opts.receive === false);
  return m;
}
// Gruppe so drehen, dass ihre Vorderseite (+z) auf einen Punkt zeigt
function face(group, tx, tz) {
  group.rotation.y = Math.atan2(tx - group.position.x, tz - group.position.z);
}
function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

// ---------- Licht und Himmel ----------
function addLights(scene, quality) {
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 90, 230);
  scene.add(new THREE.HemisphereLight('#d8efff', '#4f6b3a', 1.1));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
  sun.position.set(-22, 40, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
  const s = sun.shadow.camera;
  s.left = -36; s.right = 36; s.top = 36; s.bottom = -36; s.near = 5; s.far = 110;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);
  return sun;
}

// ---------- Insel ----------
function addIsland(scene, R) {
  const top = new THREE.CylinderGeometry(R, R + 1.2, 1.6, 56, 1);
  scene.add(mesh(top, mat(COLORS.grass), 0, -0.8, 0, { cast: false }));
  scene.add(mesh(new THREE.CylinderGeometry(R + 3.5, R + 5, 1, 56, 1), mat(COLORS.sand), 0, -0.95, 0, { cast: false }));
  scene.add(mesh(new THREE.CylinderGeometry(R + 5, R + 2, 8, 56, 1), mat(COLORS.dirt), 0, -5.4, 0, { cast: false }));
  const water = mesh(new THREE.CircleGeometry(400, 64), mat(COLORS.water, { roughness: 0.35, transparent: true, opacity: 0.92 }), 0, -0.75, 0, { cast: false });
  water.rotation.x = -Math.PI / 2;
  scene.add(water);
  return water;
}

function addPath(scene, ax, az, bx, bz, width) {
  const len = Math.hypot(bx - ax, bz - az);
  const strip = mesh(new THREE.BoxGeometry(width, 0.06, len), mat(COLORS.path), (ax + bx) / 2, 0.03, (az + bz) / 2, { cast: false });
  strip.rotation.y = Math.atan2(bx - ax, bz - az);
  scene.add(strip);
  // runde Enden, damit Wege weich ineinander übergehen
  [[ax, az], [bx, bz]].forEach(function (p) {
    scene.add(mesh(new THREE.CylinderGeometry(width / 2, width / 2, 0.06, 16), mat(COLORS.path), p[0], 0.03, p[1], { cast: false }));
  });
}

function addPlaza(scene, colliders) {
  scene.add(mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.08, 40), mat(COLORS.stone), 0, 0.04, 0, { cast: false }));
  // Brunnen
  scene.add(mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.7, 16), mat(COLORS.stoneDark), 0, 0.35, 0));
  const pool = mesh(new THREE.CylinderGeometry(1.85, 1.85, 0.1, 24), mat('#5bc2e0', { roughness: 0.2, emissive: '#1d6b85', emissiveIntensity: 0.4 }), 0, 0.66, 0, { cast: false });
  scene.add(pool);
  scene.add(mesh(new THREE.CylinderGeometry(0.28, 0.4, 1.8, 8), mat(COLORS.stone), 0, 1.3, 0));
  const bowl = mesh(new THREE.CylinderGeometry(0.8, 0.35, 0.35, 12), mat(COLORS.stone), 0, 2.2, 0);
  scene.add(bowl);
  colliders.push({ x: 0, z: 0, r: 2.5 });
  // Wasserstrahl aus kleinen Tropfen
  const drops = [];
  const dropGeo = new THREE.SphereGeometry(0.09, 6, 4);
  const dropMat = mat('#bfeeff', { emissive: '#5bc2e0', emissiveIntensity: 0.5, roughness: 0.2 });
  for (let i = 0; i < 18; i++) {
    const d = mesh(dropGeo, dropMat, 0, 2.4, 0, { cast: false, receive: false });
    d.userData = { a: (i / 18) * Math.PI * 2, t: i / 18 };
    scene.add(d);
    drops.push(d);
  }
  return function update(t) {
    for (const d of drops) {
      const k = (t * 0.6 + d.userData.t) % 1;
      const r = 0.2 + k * 1.4;
      d.position.set(Math.cos(d.userData.a) * r, 2.4 + k * 1.4 - k * k * 3.1, Math.sin(d.userData.a) * r);
    }
  };
}

// ---------- Pflanzen und Steine ----------
function makeTree(rnd) {
  const g = new THREE.Group();
  const s = 0.8 + rnd() * 0.6;
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.4, 6), mat(COLORS.woodDark), 0, 0.7, 0));
  const leaf = mat(COLORS.leaves[Math.floor(rnd() * COLORS.leaves.length)]);
  const round = rnd() < 0.35;
  if (round) {
    g.add(mesh(new THREE.IcosahedronGeometry(1.35, 0), leaf, 0, 2.4, 0));
    g.add(mesh(new THREE.IcosahedronGeometry(0.9, 0), leaf, 0.5, 3.1, 0.2));
  } else {
    g.add(mesh(new THREE.ConeGeometry(1.5, 2, 7), leaf, 0, 2.2, 0));
    g.add(mesh(new THREE.ConeGeometry(1.15, 1.7, 7), leaf, 0, 3.2, 0));
    g.add(mesh(new THREE.ConeGeometry(0.75, 1.3, 7), leaf, 0, 4.0, 0));
  }
  g.scale.setScalar(s);
  g.rotation.y = rnd() * Math.PI * 2;
  return { group: g, r: 0.55 * s };
}

function scatter(scene, colliders, R, keepClear, rnd) {
  const placed = [];
  function free(x, z, gap) {
    for (const k of keepClear) {
      const d = k.seg ? distToSegment(x, z, k.seg[0], k.seg[1], k.seg[2], k.seg[3]) : Math.hypot(x - k.x, z - k.z);
      if (d < k.r + gap) return false;
    }
    for (const p of placed) if (Math.hypot(x - p.x, z - p.z) < p.r + gap) return false;
    return true;
  }
  function spot(minR, maxR, gap) {
    for (let tries = 0; tries < 80; tries++) {
      const a = rnd() * Math.PI * 2, d = minR + Math.sqrt(rnd()) * (maxR - minR);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (free(x, z, gap)) return { x, z };
    }
    return null;
  }
  // Bäume
  for (let i = 0; i < 46; i++) {
    const p = spot(8, R - 1.8, 1.6);
    if (!p) continue;
    const t = makeTree(rnd);
    t.group.position.set(p.x, 0, p.z);
    scene.add(t.group);
    placed.push({ x: p.x, z: p.z, r: 1.4 });
    colliders.push({ x: p.x, z: p.z, r: t.r });
  }
  // Steine
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 16; i++) {
    const p = spot(7, R - 1, 0.8);
    if (!p) continue;
    const s = 0.4 + rnd() * 0.8;
    const rock = mesh(rockGeo, mat(rnd() < 0.5 ? COLORS.stone : COLORS.stoneDark), p.x, s * 0.35, p.z);
    rock.scale.set(s * (1 + rnd() * 0.4), s * 0.7, s);
    rock.rotation.set(rnd(), rnd() * 6, rnd());
    scene.add(rock);
    placed.push({ x: p.x, z: p.z, r: s });
    colliders.push({ x: p.x, z: p.z, r: s * 1.05 });
  }
  // Blumen (nur Schmuck, kein Hindernis)
  const flowerGeo = new THREE.IcosahedronGeometry(0.08, 0);
  const stemGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.2, 4);
  for (let i = 0; i < 180; i++) {
    const p = spot(3, R - 0.8, 0.1);
    if (!p) continue;
    scene.add(mesh(stemGeo, mat('#3d7a35'), p.x, 0.1, p.z, { cast: false }));
    scene.add(mesh(flowerGeo, mat(COLORS.flowers[i % COLORS.flowers.length]), p.x, 0.22, p.z, { cast: false }));
  }
}

function addClouds(scene, rnd) {
  const clouds = [];
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const white = mat('#ffffff', { roughness: 1 });
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const s = 1.6 + rnd() * 1.8;
      const puff = mesh(geo, white, k * 2.1 - n, rnd() * 0.8, rnd() * 1.6, { receive: false });
      puff.scale.set(s, s * 0.7, s);
      g.add(puff);
    }
    g.userData = { a: rnd() * Math.PI * 2, r: 25 + rnd() * 35, y: 20 + rnd() * 8, v: 0.008 + rnd() * 0.01 };
    scene.add(g);
    clouds.push(g);
  }
  return function update(t) {
    for (const c of clouds) {
      const a = c.userData.a + t * c.userData.v;
      c.position.set(Math.cos(a) * c.userData.r, c.userData.y, Math.sin(a) * c.userData.r);
      c.rotation.y = -a;
    }
  };
}

// ---------- Stationen ----------
// Augen eines Würfels (Seite mit n Augen), Positionen auf einer Fläche von -1 bis 1
const PIPS = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]
};
function makeDie(size) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(size, size, size), mat(COLORS.ivory, { roughness: 0.6 })));
  const pipGeo = new THREE.SphereGeometry(size * 0.09, 10, 6);
  const pipMat = mat(COLORS.ink, { flatShading: false, roughness: 0.4 });
  const h = size / 2, o = size * 0.26;
  // Seiten: +x 1, -x 6, +y 2, -y 5, +z 3, -z 4
  const faces = [[1, 'x', 1], [6, 'x', -1], [2, 'y', 1], [5, 'y', -1], [3, 'z', 1], [4, 'z', -1]];
  for (const [n, axis, sign] of faces) {
    for (const [u, v] of PIPS[n]) {
      const p = mesh(pipGeo, pipMat, 0, 0, 0, { cast: false });
      if (axis === 'x') p.position.set(sign * h, u * o, v * o);
      if (axis === 'y') p.position.set(u * o, sign * h, v * o);
      if (axis === 'z') p.position.set(u * o, v * o, sign * h);
      p.scale.set(axis === 'x' ? 0.35 : 1, axis === 'y' ? 0.35 : 1, axis === 'z' ? 0.35 : 1);
      g.add(p);
    }
  }
  return g;
}

function stationWuerfel(spiel) {
  const g = new THREE.Group();
  const accent = spiel.farbe || '#ffb648';
  g.add(mesh(new THREE.CylinderGeometry(2.3, 2.7, 0.7, 8), mat(COLORS.stoneDark), 0, 0.35, 0));
  g.add(mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.12, 8), mat(accent, { emissive: accent, emissiveIntensity: 0.35 }), 0, 0.76, 0, { cast: false }));
  const die = makeDie(1.7);
  die.position.y = 3;
  g.add(die);
  // Flug-Portal hinter dem Würfel
  const ring = mesh(new THREE.TorusGeometry(2.6, 0.2, 10, 40), mat('#6fd0ff', { emissive: '#6fd0ff', emissiveIntensity: 0.7, flatShading: false }), 0, 3.1, -1.6);
  g.add(ring);
  const veil = mesh(new THREE.CircleGeometry(2.45, 40), new THREE.MeshBasicMaterial({ color: '#6fd0ff', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }), 0, 3.1, -1.62, { cast: false, receive: false });
  g.add(veil);
  // kleiner Papierflieger, der um den Würfel kreist
  const plane = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 1, 3),
    mat('#6fd0ff', { emissive: '#2a7fa8', emissiveIntensity: 0.4 })
  );
  plane.castShadow = true;
  g.add(plane);
  const light = new THREE.PointLight(accent, 6, 9, 2);
  light.position.set(0, 2.2, 1.2);
  g.add(light);
  return {
    group: g, collider: 2.7, reach: 5.2, labelY: 5.6,
    update(t) {
      die.position.y = 3 + Math.sin(t * 1.6) * 0.18;
      die.rotation.set(t * 0.35, t * 0.6, 0);
      const a = t * 1.3;
      plane.position.set(Math.cos(a) * 2.2, 3.4 + Math.sin(a * 2) * 0.3, Math.sin(a) * 2.2);
      plane.rotation.set(0, -a, Math.PI / 2);
      veil.material.opacity = 0.13 + Math.sin(t * 2) * 0.05;
    }
  };
}

function stationBaustelle(spiel) {
  const g = new THREE.Group();
  const accent = spiel.farbe || '#6fd0ff';
  // Absperrung mit gestreiftem Balken
  [-1.6, 1.6].forEach(function (x) {
    g.add(mesh(new THREE.BoxGeometry(0.18, 1.2, 0.18), mat(COLORS.ivory), x, 0.6, 1.2));
  });
  for (let i = 0; i < 6; i++) {
    g.add(mesh(new THREE.BoxGeometry(0.56, 0.22, 0.12), mat(i % 2 ? COLORS.ivory : '#e8484f'), -1.4 + i * 0.56, 1.0, 1.2));
  }
  // Kisten
  const crate = new THREE.BoxGeometry(1, 1, 1);
  [[-0.9, 0.5, -0.6, 0.2], [0.3, 0.5, -0.9, -0.3], [-0.4, 1.5, -0.8, 0.5]].forEach(function (c) {
    const m = mesh(crate, mat(COLORS.wood), c[0], c[1], c[2]);
    m.rotation.y = c[3];
    g.add(m);
  });
  // Leitkegel
  [[1.4, -0.2], [1.9, 0.5]].forEach(function (c) {
    g.add(mesh(new THREE.ConeGeometry(0.28, 0.8, 8), mat('#ff8a3d'), c[0], 0.4, c[1]));
    g.add(mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.12, 8), mat(COLORS.ivory), c[0], 0.42, c[1], { cast: false }));
  });
  // Bauplan-Schild in der Farbe des künftigen Spiels
  g.add(mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), mat(COLORS.woodDark), 1.1, 1.1, -1.4));
  const sign = mesh(new THREE.BoxGeometry(1.5, 1, 0.08), mat(accent, { emissive: accent, emissiveIntensity: 0.25 }), 1.1, 2.0, -1.33);
  g.add(sign);
  return { group: g, collider: 2.3, reach: 4.4, labelY: 3.4, update() {} };
}

function stationQuesttafel() {
  const g = new THREE.Group();
  [-1.3, 1.3].forEach(function (x) {
    g.add(mesh(new THREE.BoxGeometry(0.2, 2.6, 0.2), mat(COLORS.woodDark), x, 1.3, 0));
  });
  g.add(mesh(new THREE.BoxGeometry(2.9, 1.7, 0.14), mat(COLORS.wood), 0, 1.75, 0.05));
  g.add(mesh(new THREE.BoxGeometry(3.2, 0.18, 0.4), mat(COLORS.woodDark), 0, 2.7, 0.05));
  // Zettel
  const notes = [[-0.8, 1.95, '#f4ecd8', 0.1], [0.05, 1.7, '#7ee8c0', -0.08], [0.85, 1.95, '#ffb648', 0.05], [-0.35, 1.3, '#f4ecd8', -0.04], [0.65, 1.3, '#baa0ff', 0.12]];
  for (const n of notes) {
    const note = mesh(new THREE.PlaneGeometry(0.62, 0.48), mat(n[2], { side: THREE.DoubleSide }), n[0], n[1], 0.13, { cast: false });
    note.rotation.z = n[3];
    g.add(note);
  }
  // Ausrufezeichen: es gibt neue Quests
  const mark = new THREE.Group();
  const gold = mat('#ffb648', { emissive: '#ffb648', emissiveIntensity: 0.6 });
  mark.add(mesh(new THREE.BoxGeometry(0.26, 0.75, 0.26), gold, 0, 0.35, 0));
  mark.add(mesh(new THREE.SphereGeometry(0.17, 10, 8), gold, 0, -0.32, 0));
  mark.position.y = 3.7;
  g.add(mark);
  return {
    group: g, collider: 1.7, reach: 4, labelY: 4.6, mark,
    update(t) {
      mark.position.y = 3.7 + Math.sin(t * 2.4) * 0.15;
      mark.rotation.y = t * 1.5;
    }
  };
}

// ---------- Spielfigur ----------
export function makeCharacter() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const jacket = mat('#e8484f', { roughness: 0.8 });
  const skin = mat(COLORS.ivory, { roughness: 0.7 });
  const dark = mat(COLORS.ink);
  body.add(mesh(new THREE.CapsuleGeometry(0.42, 0.5, 4, 10), jacket, 0, 1.05, 0));
  body.add(mesh(new THREE.SphereGeometry(0.4, 14, 10), skin, 0, 1.78, 0));
  // Augen schauen nach vorn (+z)
  [-0.14, 0.14].forEach(function (x) {
    body.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), dark, x, 1.84, 0.35, { cast: false }));
  });
  // Mütze mit Bommel
  body.add(mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.2, 14), mat('#2f8f7a'), 0, 2.05, 0));
  body.add(mesh(new THREE.ConeGeometry(0.38, 0.42, 14), mat('#2f8f7a'), 0, 2.33, 0));
  body.add(mesh(new THREE.SphereGeometry(0.11, 8, 6), mat(COLORS.ivory), 0, 2.56, 0));
  // Arme und Beine an Drehpunkten (Schulter, Hüfte)
  function limb(x, y, len, radius, material) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.add(mesh(new THREE.CapsuleGeometry(radius, len, 3, 8), material, 0, -len / 2 - radius, 0));
    return pivot;
  }
  const armL = limb(-0.52, 1.35, 0.42, 0.11, jacket), armR = limb(0.52, 1.35, 0.42, 0.11, jacket);
  const legL = limb(-0.18, 0.62, 0.3, 0.13, dark), legR = limb(0.18, 0.62, 0.3, 0.13, dark);
  armL.rotation.z = -0.12; armR.rotation.z = 0.12;
  body.add(armL, armR);
  g.add(legL, legR);

  let phase = 0;
  return {
    group: g,
    // speed: 0 (steht) bis 1 (rennt)
    update(dt, speed, t) {
      phase += dt * (4 + speed * 7) * (speed > 0.02 ? 1 : 0);
      const k = Math.min(1, speed * 1.6);
      const swing = Math.sin(phase) * 0.8 * k;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.8;
      armR.rotation.x = swing * 0.8;
      body.position.y = Math.abs(Math.sin(phase)) * 0.09 * k + Math.sin(t * 2) * 0.015 * (1 - k);
      body.rotation.x = 0.08 * k;
    }
  };
}

// ---------- Alles zusammen ----------
export function buildWorld(world3d, opts) {
  const R = opts.welt.radius;
  const S = opts.scale || 1;
  const quality = opts.quality;
  const rnd = random(20261118);
  const colliders = [];
  const stations = [];
  const updaters = [];

  // Licht hängt an der echten Szene, alles andere an einer vergrößerten Gruppe
  const sun = addLights(world3d, quality);
  const sunOffset = sun.position.clone();
  const scene = new THREE.Group();
  scene.scale.setScalar(S);
  world3d.add(scene);

  addIsland(scene, R);
  updaters.push(addPlaza(scene, colliders));

  const keepClear = [{ x: 0, z: 0, r: 6.5 }];
  function withPath(x, z) {
    addPath(scene, 0, 0, x, z, 1.7);
    keepClear.push({ seg: [0, 0, x, z], r: 1.4 });
  }

  for (const spiel of opts.spiele) {
    const o = spiel.ort;
    const built = spiel.station === 'wuerfel' ? stationWuerfel(spiel) : stationBaustelle(spiel);
    built.group.position.set(o.x, 0, o.z);
    face(built.group, 0, 0);
    // Lampen reichen in echten Einheiten: Reichweite und Stärke mitvergrößern
    built.group.traverse(obj => {
      if (obj.isPointLight) { obj.distance *= S; obj.intensity *= S * S; }
    });
    scene.add(built.group);
    withPath(o.x * 0.78, o.z * 0.78);
    keepClear.push({ x: o.x, z: o.z, r: 5 });
    colliders.push({ x: o.x, z: o.z, r: built.collider });
    stations.push({ id: spiel.id, kind: spiel.url ? 'spiel' : 'baustelle', spiel, x: o.x, z: o.z, reach: built.reach, labelY: built.labelY });
    updaters.push(built.update);
  }

  const qt = opts.welt.questtafel;
  const board = stationQuesttafel();
  board.group.position.set(qt.x, 0, qt.z);
  face(board.group, 0, 0);
  scene.add(board.group);
  withPath(qt.x * 0.8, qt.z * 0.8);
  keepClear.push({ x: qt.x, z: qt.z, r: 3.5 });
  colliders.push({ x: qt.x, z: qt.z, r: board.collider });
  stations.push({ id: 'questtafel', kind: 'questtafel', x: qt.x, z: qt.z, reach: board.reach, labelY: board.labelY });
  updaters.push(board.update);

  const st = opts.welt.start;
  withPath(st.x, st.z + 4);
  keepClear.push({ x: st.x, z: st.z, r: 4 }, { x: st.x, z: st.z + 9, r: 7 });   // freie Sicht hinter dem Startpunkt

  scatter(scene, colliders, R, keepClear, rnd);
  updaters.push(addClouds(scene, rnd));

  return {
    scale: S,
    colliders: colliders.map(c => ({ x: c.x * S, z: c.z * S, r: c.r * S })),
    stations: stations.map(st => Object.assign({}, st, { x: st.x * S, z: st.z * S, reach: st.reach * S, labelY: st.labelY * S })),
    radius: R * S,
    start: { x: opts.welt.start.x * S, z: opts.welt.start.z * S },
    setQuestMark(visible) { board.mark.visible = visible; },
    // Schatten nur rund um die Figur berechnen: bleibt auch auf großer Insel scharf
    followShadow(x, z) {
      sun.target.position.set(x, 0, z);
      sun.position.set(x + sunOffset.x, sunOffset.y, z + sunOffset.z);
    },
    update(t) { for (const u of updaters) u(t); }
  };
}
