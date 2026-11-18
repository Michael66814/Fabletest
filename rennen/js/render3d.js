/* Kurvenfieber – 3D-Darstellung mit Three.js.
   Baut aus der Streckentabelle Fahrbahn, Randsteine, Leitplanken, Gelände und Landschaft
   und stellt die Autos aus der Simulation dar. Keine Spiellogik. */
(function (RR) {
  'use strict';

  var T = RR.track;
  var THREE = globalThis.THREE;
  // Farbangaben als sRGB verstehen (sonst wirkt mit sRGB-Ausgabe alles ausgewaschen)
  if (THREE && THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

  // ---- kleine Helfer -----------------------------------------------------
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function smooth(a, b, x) { var t = T.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  // weiches Rauschen aus Sinuswellen (reicht für sanfte Hügel)
  function hills(x, z, seed) {
    return Math.sin(x * 0.011 + seed) * Math.cos(z * 0.013 - seed * 0.7) * 0.6 +
      Math.sin((x + z) * 0.027 + seed * 2.1) * 0.25 +
      Math.cos((x - z * 0.6) * 0.051 - seed) * 0.15;
  }

  function canvasTex(w, h, draw, repeat) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }

  // mehrere Geometrien (mit Farbe je Teil) zu einer zusammenfügen
  function merge(parts) {
    var pos = [], nor = [], col = [];
    parts.forEach(function (p) {
      var g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      if (p.matrix) g.applyMatrix4(p.matrix);
      var a = g.attributes.position.array, n = g.attributes.normal.array;
      var c = new THREE.Color(p.color);
      for (var i = 0; i < a.length; i += 3) {
        pos.push(a[i], a[i + 1], a[i + 2]);
        nor.push(n[i], n[i + 1], n[i + 2]);
        col.push(c.r, c.g, c.b);
      }
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return out;
  }
  function mat4(x, y, z, rx, ry, rz, sx, sy, sz) {
    var m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)),
      new THREE.Vector3(sx || 1, sy || sx || 1, sz || sx || 1));
    return m;
  }

  // ---- Texturen ----------------------------------------------------------
  function asphaltTex(night) {
    return canvasTex(256, 512, function (g, w, h) {
      g.fillStyle = night ? '#2b2d33' : '#45474d';
      g.fillRect(0, 0, w, h);
      var r = rng(7);
      for (var i = 0; i < 9000; i++) {
        var v = Math.floor(r() * 40) - 20;
        g.fillStyle = 'rgba(' + (128 + v) + ',' + (128 + v) + ',' + (132 + v) + ',' + (0.05 + r() * 0.08) + ')';
        g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
      }
      // Randlinien
      g.fillStyle = '#e9e6dc';
      g.fillRect(6, 0, 7, h);
      g.fillRect(w - 13, 0, 7, h);
      // Mittellinie gestrichelt
      g.fillStyle = 'rgba(240, 236, 220, 0.85)';
      g.fillRect(w / 2 - 3, 0, 6, h * 0.45);
    }, true);
  }
  function kerbTex() {
    return canvasTex(16, 64, function (g, w, h) {
      g.fillStyle = '#d8333a'; g.fillRect(0, 0, w, h / 2);
      g.fillStyle = '#f2f0ea'; g.fillRect(0, h / 2, w, h / 2);
    }, true);
  }
  function wallTex(kind) {
    return canvasTex(128, 32, function (g, w, h) {
      if (kind === 'city') {
        g.fillStyle = '#9a9c9f'; g.fillRect(0, 0, w, h);
        for (var i = 0; i < w; i += 32) { g.fillStyle = '#f2c230'; g.fillRect(i, h - 10, 16, 10); g.fillStyle = '#1b1b1b'; g.fillRect(i + 16, h - 10, 16, 10); }
      } else if (kind === 'pines') {
        g.fillStyle = '#b9c0c6'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#d8dde1'; g.fillRect(0, 6, w, 8);
        g.fillStyle = '#7e868d'; g.fillRect(0, 18, w, 3);
        g.fillStyle = '#5b6168'; for (var j = 0; j < w; j += 64) g.fillRect(j, 0, 6, h);
      } else {
        for (var k = 0; k < w; k += 32) { g.fillStyle = '#e8484f'; g.fillRect(k, 0, 16, h); g.fillStyle = '#f4f2ec'; g.fillRect(k + 16, 0, 16, h); }
      }
    }, true);
  }
  function checkerTex(cols, rows) {
    return canvasTex(cols * 16, rows * 16, function (g) {
      for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
        g.fillStyle = (x + y) % 2 ? '#111' : '#f5f5f0';
        g.fillRect(x * 16, y * 16, 16, 16);
      }
    });
  }
  function windowTex() {
    return canvasTex(128, 128, function (g, w, h) {
      g.fillStyle = '#20232c'; g.fillRect(0, 0, w, h);
      var r = rng(3);
      for (var y = 4; y < h; y += 16) for (var x = 4; x < w; x += 16) {
        var on = r();
        g.fillStyle = on > 0.72 ? (r() > 0.3 ? '#e8c47a' : '#a9cfee') : '#11131a';
        g.fillRect(x, y, 8, 9);
      }
      g.fillStyle = '#15171d'; g.fillRect(0, 0, 4, 4);   // Dachfarbe in der Ecke
    }, true);
  }
  function blobTex() {
    return canvasTex(64, 64, function (g) {
      var gr = g.createRadialGradient(32, 32, 4, 32, 32, 31);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
  }
  function bannerTex(text) {
    return canvasTex(512, 64, function (g, w, h) {
      for (var x = 0; x < w; x += 16) for (var y = 0; y < h; y += 16) {
        g.fillStyle = ((x + y) / 16) % 2 ? '#111' : '#f5f5f0'; g.fillRect(x, y, 16, 16);
      }
      g.fillStyle = '#111'; g.fillRect(150, 6, 212, 52);
      g.fillStyle = '#ffb02e'; g.font = '900 40px Rubik, Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
    });
  }

  // ---- Fahrbahn als Band entlang der Strecke -----------------------------
  // from/to: seitlicher Abstand (d), lift: Höhe über der Strecke, vScale: Meter je Texturlänge
  function ribbon(tr, from, to, lift, vScale, opts) {
    opts = opts || {};
    var n = tr.count, pos = [], uv = [], idx = [];
    var p = {};
    var keep = opts.filter ? [] : null;
    for (var i = 0; i <= n; i++) {
      var s = (i % n) * tr.step;
      var f = typeof from === 'function' ? from(i % n) : from;
      var t = typeof to === 'function' ? to(i % n) : to;
      var l1 = typeof lift === 'function' ? lift(i % n, 0) : lift;
      var l2 = typeof lift === 'function' ? lift(i % n, 1) : lift;
      T.toWorld(tr, s, f, p); pos.push(p.x, p.y + l1, p.z);
      T.toWorld(tr, s, t, p); pos.push(p.x, p.y + l2, p.z);
      var v = i * tr.step / vScale;
      uv.push(0, v, 1, v);
      if (i < n && (!opts.filter || opts.filter(i))) {
        var a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);   // Oberseite zeigt nach oben
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ---- Szene -------------------------------------------------------------
  function Renderer(canvas) {
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.outputEncoding = THREE.sRGBEncoding;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.0;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2600);
    this.cam = { mode: 'chase', yaw: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false, orbit: 0 };
    this.carMeshes = [];
    this.scene = null;
    this.quality = 1;
  }

  Renderer.prototype.resize = function (w, h, dpr) {
    this.gl.setPixelRatio(Math.min(dpr || 1, this.quality > 0 ? 2 : 1.25));
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    // im Hochformat weiter aufziehen, damit die Straße breit genug bleibt
    this.baseFov = w < h ? 78 : 60;
    this.camera.updateProjectionMatrix();
  };

  Renderer.prototype.dispose = function () {
    if (!this.scene) return;
    this.scene.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          if (m.map) m.map.dispose();
          if (m.emissiveMap) m.emissiveMap.dispose();
          m.dispose();
        });
      }
    });
    this.scene = null;
    this.carMeshes = [];
  };

  Renderer.prototype.buildTrack = function (tr) {
    this.dispose();
    var th = tr.def.theme;
    var scene = this.scene = new THREE.Scene();
    this.track = tr;
    this.night = th.night;
    scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
    scene.background = new THREE.Color(th.fog);
    var b = T.bounds(tr);
    var cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    this.center = new THREE.Vector3(cx, (b.minY + b.maxY) / 2, cz);
    this.radius = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2;

    // Himmel
    var skyGeo = new THREE.SphereGeometry(2000, 32, 16);
    var cols = [], top = new THREE.Color(th.sky[0]), mid = new THREE.Color(th.sky[1]), hor = new THREE.Color(th.sky[2]);
    var sp = skyGeo.attributes.position;
    for (var i = 0; i < sp.count; i++) {
      var y = sp.getY(i) / 2000, c = new THREE.Color();
      if (y > 0.25) c.copy(mid).lerp(top, smooth(0.25, 0.9, y));
      else c.copy(hor).lerp(mid, smooth(-0.05, 0.25, y));
      cols.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    var sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    sky.renderOrder = -1;
    scene.add(sky);
    this.sky = sky;
    if (th.night) this.addStars(scene);
    else this.addClouds(scene, b);

    // Licht
    var hemi = new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.night ? 0.9 : 0.75);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(th.sun, th.night ? 0.5 : 1.5);
    sun.position.set(th.sunPos[0], th.sunPos[1], th.sunPos[2]).normalize().multiplyScalar(120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    var sc = sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 320;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
    this.sunDir = sun.position.clone().normalize();

    this.grid = T.buildGrid(tr, 20);
    this.buildTerrain(scene, tr, b);
    this.buildRoad(scene, tr);
    this.buildScenery(scene, tr, b);
    this.buildStart(scene, tr);
    this.blob = blobTex();
  };

  Renderer.prototype.addStars = function (scene) {
    var r = rng(11), pos = [];
    for (var i = 0; i < 900; i++) {
      var u = r() * Math.PI * 2, v = 0.08 + r() * 0.9;
      var y = Math.sin(v), rr = Math.cos(v);
      pos.push(Math.cos(u) * rr * 1800, y * 1800, Math.sin(u) * rr * 1800);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    var stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 2.2, sizeAttenuation: false, fog: false }));
    scene.add(stars);
    this.stars = stars;
  };

  Renderer.prototype.addClouds = function (scene, b) {
    var r = rng(5), parts = [];
    var geo = new THREE.IcosahedronGeometry(1, 1);
    for (var c = 0; c < 26; c++) {
      var ang = r() * Math.PI * 2, dist = 500 + r() * 900;
      var x = Math.cos(ang) * dist, z = Math.sin(ang) * dist, y = 160 + r() * 140;
      for (var k = 0; k < 5; k++) {
        var s = 18 + r() * 22;
        parts.push({ geo: geo, color: 0xffffff, matrix: mat4(x + (k - 2) * 22 + r() * 10, y + r() * 8, z + r() * 20, 0, 0, 0, s * 1.4, s * 0.6, s) });
      }
    }
    var clouds = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x8899aa, emissiveIntensity: 0.35, fog: false, transparent: true, opacity: 0.92 }));
    clouds.position.set(this.center.x, 0, this.center.z);
    scene.add(clouds);
    this.clouds = clouds;
  };

  // Geländehöhe an (x, z): an der Strecke knapp unter der Fahrbahn, weiter weg Hügel
  Renderer.prototype.heightAt = function (x, z) {
    var tr = this.track, th = tr.def.theme;
    var near = this.grid.nearest(x, z, 160);
    var dist = near ? near.dist : 160;
    var trackY = near ? tr.y[near.i] : this.center.y;
    var base;
    if (th.scenery === 'palms') {
      base = 2.5 + hills(x, z, 1) * 3 - Math.max(0, dist - 70) * 0.11;
    } else if (th.scenery === 'pines') {
      base = trackY + hills(x, z, 3) * 6 + Math.max(0, dist - 30) * (0.35 + 0.25 * hills(z, x, 9)) + Math.max(0, dist - 160) * 0.6;
    } else {
      base = 0;
    }
    var t = smooth(tr.wall + 3, tr.wall + (th.scenery === 'city' ? 10 : 42), dist);
    return (trackY - 0.7) * (1 - t) + base * t;
  };

  Renderer.prototype.buildTerrain = function (scene, tr, b) {
    var th = tr.def.theme;
    var margin = 900, cell = 9;
    var x0 = b.minX - margin, z0 = b.minZ - margin;
    var nx = Math.ceil((b.maxX - b.minX + 2 * margin) / cell), nz = Math.ceil((b.maxZ - b.minZ + 2 * margin) / cell);
    var pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Float32Array((nx + 1) * (nz + 1) * 3);
    var grass = new THREE.Color(th.ground), far = new THREE.Color(th.groundFar), sand = new THREE.Color(0xe8d49a);
    var rock = new THREE.Color(0x8a8c88), snow = new THREE.Color(0xf2f4f6), c = new THREE.Color();
    var r = rng(21);
    for (var j = 0; j <= nz; j++) for (var i = 0; i <= nx; i++) {
      var x = x0 + i * cell, z = z0 + j * cell;
      // innen feiner Zufall, damit das Raster nicht auffällt
      if (i > 0 && j > 0 && i < nx && j < nz) { x += (r() - 0.5) * cell * 0.5; z += (r() - 0.5) * cell * 0.5; }
      var h = this.heightAt(x, z);
      var k = (j * (nx + 1) + i) * 3;
      pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
      var near = this.grid.nearest(x, z, 160), dist = near ? near.dist : 160;
      c.copy(grass).lerp(far, smooth(60, 400, dist) * 0.7);
      if (th.scenery === 'palms' && h < 1.6) c.copy(sand);
      if (th.scenery === 'pines') {
        var rel = h - (near ? tr.y[near.i] : 0);
        if (rel > 18) c.lerp(rock, smooth(18, 40, rel));
        if (h > 95) c.lerp(snow, smooth(95, 120, h));
      }
      var v = 0.94 + r() * 0.1;
      col[k] = c.r * v; col[k + 1] = c.g * v; col[k + 2] = c.b * v;
    }
    var idx = [];
    for (j = 0; j < nz; j++) for (i = 0; i < nx; i++) {
      var a = j * (nx + 1) + i, bb = a + 1, cc = a + nx + 1, d = cc + 1;
      idx.push(a, cc, bb, bb, cc, d);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    var m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    m.receiveShadow = true;
    scene.add(m);

    if (th.sea) {
      var sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshPhongMaterial({ color: 0x1f8fb0, specular: 0x9fdfff, shininess: 60, transparent: true, opacity: 0.93 }));
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(this.center.x, 0, this.center.z);
      scene.add(sea);
      this.sea = sea;
    }
  };

  Renderer.prototype.buildRoad = function (scene, tr) {
    var th = tr.def.theme, hw = tr.halfWidth;
    var road = new THREE.Mesh(ribbon(tr, -hw, hw, 0.02, 24), new THREE.MeshLambertMaterial({ map: asphaltTex(th.night) }));
    road.receiveShadow = true;
    // u läuft von links (d = -hw) nach rechts – Textur passt symmetrisch
    scene.add(road);

    // Seitenstreifen bis zur Leitplanke, dann eine Böschung nach unten
    var shoulderCol = th.scenery === 'city' ? 0x3a3d45 : th.scenery === 'palms' ? 0xd9c58c : 0x6b7a4c;
    var shMat = new THREE.MeshLambertMaterial({ color: shoulderCol });
    [-1, 1].forEach(function (side) {
      var a = side * hw, bOut = side * (tr.wall + 0.6), c = side * (tr.wall + 3);
      var g1 = side > 0 ? ribbon(tr, a, bOut, -0.01, 10) : ribbon(tr, bOut, a, -0.01, 10);
      var m1 = new THREE.Mesh(g1, shMat); m1.receiveShadow = true; scene.add(m1);
      var g2 = side > 0 ? ribbon(tr, bOut, c, function (i, e) { return e ? -1.6 : -0.01; }, 10)
        : ribbon(tr, c, bOut, function (i, e) { return e ? -0.01 : -1.6; }, 10);
      var m2 = new THREE.Mesh(g2, shMat); m2.receiveShadow = true; scene.add(m2);
    });

    // Randsteine in Kurven
    var kTex = kerbTex();
    var curvy = function (i) {
      var m = 0;
      for (var k = -4; k <= 4; k++) m = Math.max(m, Math.abs(tr.kappa[(i + k + tr.count) % tr.count]));
      return m > 1 / 140;
    };
    var kerbMat = new THREE.MeshLambertMaterial({ map: kTex });
    [-1, 1].forEach(function (side) {
      var g = side > 0 ? ribbon(tr, hw - 0.3, hw + 0.9, 0.05, 3, { filter: curvy }) : ribbon(tr, -hw - 0.9, -hw + 0.3, 0.05, 3, { filter: curvy });
      var m = new THREE.Mesh(g, kerbMat); m.receiveShadow = true; scene.add(m);
    });

    // Leitplanken
    var wTex = wallTex(th.scenery);
    var wMat = new THREE.MeshLambertMaterial({ map: wTex, side: THREE.DoubleSide });
    var height = th.scenery === 'city' ? 1.1 : 0.85;
    [-1, 1].forEach(function (side) {
      var d = side * tr.wall;
      var g = ribbon(tr, d, d, function (i, e) { return e ? height : -0.4; }, 8);
      // u/v tauschen: Textur läuft entlang der Planke
      var uv = g.attributes.uv;
      for (var i = 0; i < uv.count; i++) { var u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, u); }
      var m = new THREE.Mesh(g, wMat); m.castShadow = true; m.receiveShadow = true; scene.add(m);
    });
  };

  Renderer.prototype.buildStart = function (scene, tr) {
    var p = T.toWorld(tr, 0, 0);
    var hw = tr.halfWidth;
    var line = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 2.4), new THREE.MeshLambertMaterial({ map: checkerTex(16, 2) }));
    line.rotation.order = 'YXZ';
    line.rotation.y = p.h; line.rotation.x = -Math.PI / 2;
    line.position.set(p.x, p.y + 0.035, p.z);
    line.receiveShadow = true;
    scene.add(line);

    // Startbrücke
    var g = new THREE.Group();
    var post = new THREE.MeshLambertMaterial({ color: 0x2b2e35 });
    [-1, 1].forEach(function (s) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7.5, 0.7), post);
      m.position.set(s * (tr.wall + 0.2), 3.75 - 0.4, 0); m.castShadow = true; g.add(m);
    });
    var beam = new THREE.Mesh(new THREE.BoxGeometry(tr.wall * 2 + 1.4, 1.6, 0.6), [
      post, post, post, post,
      new THREE.MeshBasicMaterial({ map: bannerTex('START · ZIEL') }),
      new THREE.MeshBasicMaterial({ map: bannerTex('START · ZIEL') })
    ]);
    beam.position.y = 7.2; beam.castShadow = true;
    g.add(beam);
    // Startampel
    this.lights = [];
    for (var i = 0; i < 3; i++) {
      var lm = new THREE.MeshBasicMaterial({ color: 0x331111 });
      var l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), lm);
      l.position.set((i - 1) * 0.9, 6.05, -0.35);
      g.add(l);
      this.lights.push(lm);
    }
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.h;
    scene.add(g);

    // Tribüne neben der Startgeraden
    var trib = [], r = rng(31);
    var crowd = [0xe8484f, 0xffb02e, 0x2f6fe0, 0xf4f4f4, 0x3fcf9a, 0x9b6cff, 0x222222];
    for (var row = 0; row < 5; row++) {
      trib.push({ geo: new THREE.BoxGeometry(26, 0.8, 1.6), color: 0x9aa0a8, matrix: mat4(0, row * 0.8 + 0.4, row * 1.6, 0, 0, 0) });
      for (var k = 0; k < 22; k++) {
        trib.push({ geo: new THREE.BoxGeometry(0.5, 0.75, 0.4), color: crowd[Math.floor(r() * crowd.length)], matrix: mat4(-12 + k * 1.1 + r() * 0.3, row * 0.8 + 1.15, row * 1.6, 0, 0, 0) });
      }
    }
    trib.push({ geo: new THREE.BoxGeometry(27, 0.3, 9), color: 0xdddddd, matrix: mat4(0, 7.5, 3.2, -0.12, 0, 0) });
    [-13, 13].forEach(function (x) { trib.push({ geo: new THREE.BoxGeometry(0.4, 7.5, 0.4), color: 0x555555, matrix: mat4(x, 3.75, 7, 0, 0, 0) }); });
    var stand = new THREE.Mesh(merge(trib), new THREE.MeshLambertMaterial({ vertexColors: true }));
    var sp = T.toWorld(tr, -40, tr.wall + 4);
    stand.position.set(sp.x, sp.y - 0.4, sp.z);
    stand.rotation.y = sp.h - Math.PI / 2;
    stand.castShadow = true; stand.receiveShadow = true;
    scene.add(stand);
  };

  Renderer.prototype.buildScenery = function (scene, tr, b) {
    var th = tr.def.theme, self = this, r = rng(tr.def.id.length * 977 + 13);
    var dummy = new THREE.Object3D();

    function spots(count, minD, maxD, clear) {
      var out = [], tries = 0;
      while (out.length < count && tries < count * 20) {
        tries++;
        var s = r() * tr.length, side = r() < 0.5 ? -1 : 1;
        var off = tr.wall + minD + Math.pow(r(), 1.6) * (maxD - minD);
        var p = T.toWorld(tr, s, side * off);
        var near = self.grid.nearest(p.x, p.z, tr.wall + clear);
        if (near) continue;
        out.push({ x: p.x, z: p.z, y: self.heightAt(p.x, p.z), h: p.h, side: side, off: off });
      }
      return out;
    }
    function instanced(geo, matOpts, list, place) {
      var m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(matOpts), list.length);
      list.forEach(function (it, i) { place(it, dummy, i); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      return m;
    }

    if (th.scenery === 'palms') {
      var palm = merge([
        { geo: new THREE.CylinderGeometry(0.22, 0.38, 7, 6), color: 0x8a6a45, matrix: mat4(0, 3.5, 0, 0, 0, 0.08) },
        { geo: new THREE.ConeGeometry(0.5, 1, 6), color: 0x2f7a3a, matrix: mat4(0.3, 7.2, 0, 0, 0, 0) }
      ].concat([0, 1, 2, 3, 4, 5, 6].map(function (k) {
        var a = k / 7 * Math.PI * 2;
        return { geo: new THREE.BoxGeometry(0.9, 0.1, 4.2), color: k % 2 ? 0x2f8a3e : 0x3fa04a, matrix: mat4(0.3 + Math.sin(a) * 1.8, 6.8, Math.cos(a) * 1.8, 0.38 * Math.cos(a), a, -0.38 * Math.sin(a) * 0) };
      })));
      var pl = spots(260, 2, 70, 3);
      instanced(palm, { vertexColors: true }, pl, function (it, o) {
        var s = 0.8 + r() * 0.5;
        o.position.set(it.x, it.y - 0.2, it.z); o.rotation.set(0, r() * 6.28, (r() - 0.5) * 0.2); o.scale.set(s, s, s);
      });
      var rocks = spots(80, 3, 90, 3);
      instanced(new THREE.DodecahedronGeometry(1, 0), { color: 0xb8ab90, flatShading: true }, rocks, function (it, o) {
        var s = 0.6 + r() * 1.8;
        o.position.set(it.x, it.y, it.z); o.rotation.set(r() * 3, r() * 3, 0); o.scale.set(s, s * 0.6, s);
      });
      // Sonnenschirme am Strand
      var umb = merge([
        { geo: new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), color: 0xeeeeee, matrix: mat4(0, 1.3, 0) },
        { geo: new THREE.ConeGeometry(1.6, 0.6, 8), color: 0xe8484f, matrix: mat4(0, 2.6, 0) }
      ]);
      var beach = spots(200, 30, 130, 20).filter(function (it) { return it.y > 0.3 && it.y < 1.6; }).slice(0, 40);
      instanced(umb, { vertexColors: true }, beach, function (it, o) { o.position.set(it.x, it.y, it.z); o.rotation.set(0, r() * 6, 0); });
    } else if (th.scenery === 'pines') {
      var pine = merge([
        { geo: new THREE.CylinderGeometry(0.25, 0.35, 2, 5), color: 0x6b4a2e, matrix: mat4(0, 1, 0) },
        { geo: new THREE.ConeGeometry(2.4, 4.2, 7), color: 0x2c5e35, matrix: mat4(0, 3.6, 0) },
        { geo: new THREE.ConeGeometry(1.9, 3.6, 7), color: 0x33693c, matrix: mat4(0, 5.6, 0) },
        { geo: new THREE.ConeGeometry(1.3, 3, 7), color: 0x3a7543, matrix: mat4(0, 7.4, 0) }
      ]);
      var pn = spots(900, 2, 200, 3);
      instanced(pine, { vertexColors: true, flatShading: true }, pn, function (it, o) {
        var s = 0.7 + r() * 0.8;
        o.position.set(it.x, it.y - 0.3, it.z); o.rotation.set(0, r() * 6.28, 0); o.scale.set(s, s * (0.9 + r() * 0.4), s);
      });
      var rk = spots(160, 2, 120, 3);
      instanced(new THREE.DodecahedronGeometry(1, 0), { color: 0x8d8f8c, flatShading: true }, rk, function (it, o) {
        var s = 0.8 + r() * 2.6;
        o.position.set(it.x, it.y, it.z); o.rotation.set(r() * 3, r() * 3, 0); o.scale.set(s, s * 0.7, s);
      });
    } else {
      // Stadt: Hochhäuser mit Fenstern, Laternen an der Strecke
      var parts = [], winTex = windowTex();
      var bl = spots(380, 14, 170, 14);
      var bpos = [], buv = [], bidx = [], base = 0;
      bl.forEach(function (it) {
        var w = 10 + r() * 16, d = 10 + r() * 16, h = 12 + Math.pow(r(), 2) * 70 * (it.off > 60 ? 1.4 : 0.8);
        var g = new THREE.BoxGeometry(w, h, d);
        var uv = g.attributes.uv, n = g.attributes.normal;
        for (var i = 0; i < uv.count; i++) {
          var ny = n.getY(i);
          if (Math.abs(ny) > 0.5) { uv.setXY(i, 0.01, 0.99); continue; }
          var horiz = Math.abs(n.getX(i)) > 0.5 ? d : w;
          uv.setXY(i, uv.getX(i) * horiz / 12, uv.getY(i) * h / 12);
        }
        g.applyMatrix4(mat4(it.x, it.y + h / 2 - 0.5, it.z, 0, it.h + (r() - 0.5) * 0.3, 0));
        var p = g.attributes.position, u2 = g.attributes.uv;
        for (i = 0; i < p.count; i++) { bpos.push(p.getX(i), p.getY(i), p.getZ(i)); buv.push(u2.getX(i), u2.getY(i)); }
        var gi = g.index.array;
        for (i = 0; i < gi.length; i++) bidx.push(gi[i] + base);
        base += p.count;
      });
      var bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3));
      bg.setAttribute('uv', new THREE.Float32BufferAttribute(buv, 2));
      bg.setIndex(bidx);
      bg.computeVertexNormals();
      var bm = new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.55, color: 0x4a4f5c }));
      bm.castShadow = true; bm.receiveShadow = true;
      scene.add(bm);
      void parts;
    }

    // Laternen (Nacht) bzw. Streckenposten-Pfosten
    if (th.night) {
      var lamps = [];
      for (var s = 0; s < tr.length; s += 34) {
        var side = (Math.floor(s / 34) % 2) ? 1 : -1;
        var p = T.toWorld(tr, s, side * (tr.wall + 1.2));
        lamps.push({ x: p.x, y: p.y, z: p.z, h: p.h, side: side });
      }
      var pole = merge([
        { geo: new THREE.CylinderGeometry(0.12, 0.16, 8, 6), color: 0x3b3f48, matrix: mat4(0, 4, 0) },
        { geo: new THREE.BoxGeometry(0.2, 0.2, 2.4), color: 0x3b3f48, matrix: mat4(0, 8, 1.1) }
      ]);
      var bulbGeo = new THREE.BoxGeometry(0.5, 0.18, 0.9);
      instanced(pole, { vertexColors: true }, lamps, function (it, o) {
        o.position.set(it.x, it.y - 0.3, it.z); o.rotation.set(0, it.h + (it.side > 0 ? Math.PI / 2 : -Math.PI / 2), 0); o.scale.set(1, 1, 1);
      });
      var bulbs = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), lamps.length);
      lamps.forEach(function (it, i) {
        dummy.position.set(it.x, it.y - 0.3, it.z); dummy.rotation.set(0, it.h + (it.side > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
        dummy.translateY(7.85); dummy.translateZ(2.1);
        dummy.updateMatrix(); bulbs.setMatrixAt(i, dummy.matrix);
      });
      scene.add(bulbs);
      // Lichtkegel auf der Fahrbahn
      var pool = canvasTex(64, 64, function (g) {
        var gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
        gr.addColorStop(0, 'rgba(255,225,160,0.55)'); gr.addColorStop(1, 'rgba(255,225,160,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      });
      var pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ map: pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), lamps.length);
      lamps.forEach(function (it, i) {
        var q = T.toWorld(tr, 0, 0);
        void q;
        dummy.position.set(it.x, it.y + 0.06, it.z); dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.translateX(0);
        dummy.updateMatrix(); pools.setMatrixAt(i, dummy.matrix);
      });
      // Lichtkegel zur Straßenmitte hin verschieben
      lamps.forEach(function (it, i) {
        var s2 = 0;
        var near = self.grid.nearest(it.x, it.z, 30);
        if (near) s2 = near.i * tr.step;
        var c = T.toWorld(tr, s2, it.side * (tr.halfWidth - 2));
        dummy.position.set(c.x, c.y + 0.06, c.z); dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.updateMatrix(); pools.setMatrixAt(i, dummy.matrix);
      });
      pools.renderOrder = 1;
      scene.add(pools);
    }
  };

  // ---- Autos -------------------------------------------------------------
  function carModel(color, accent, night) {
    var g = new THREE.Group();
    var paint = new THREE.MeshStandardMaterial({ color: color, roughness: 0.32, metalness: 0.35 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6 });
    var glass = new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.1, metalness: 0.6 });
    var acc = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 });

    // Karosserie: Seitenprofil (Länge x Höhe), über die Breite ausgezogen
    var sh = new THREE.Shape();
    sh.moveTo(-2.2, 0.28);
    sh.lineTo(2.05, 0.28);
    sh.quadraticCurveTo(2.25, 0.3, 2.22, 0.55);
    sh.lineTo(2.0, 0.72);
    sh.lineTo(0.75, 0.86);
    sh.lineTo(-1.9, 0.92);
    sh.quadraticCurveTo(-2.22, 0.92, -2.22, 0.7);
    sh.lineTo(-2.2, 0.28);
    var body = new THREE.ExtrudeGeometry(sh, { depth: 1.7, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 2, steps: 1 });
    body.translate(0, 0, -0.85);
    body.rotateY(-Math.PI / 2);   // Länge entlang z
    var bm = new THREE.Mesh(body, paint);
    bm.castShadow = true;
    g.add(bm);

    // Kabine
    var cab = new THREE.Shape();
    cab.moveTo(-1.35, 0.86);
    cab.lineTo(0.6, 0.86);
    cab.lineTo(-0.05, 1.36);
    cab.lineTo(-1.05, 1.38);
    cab.lineTo(-1.6, 0.9);
    var cg = new THREE.ExtrudeGeometry(cab, { depth: 1.36, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
    cg.translate(0, 0, -0.68);
    cg.rotateY(-Math.PI / 2);
    var cm = new THREE.Mesh(cg, glass);
    cm.castShadow = true;
    g.add(cm);
    // Dach in Wagenfarbe
    var roof = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.95), paint);
    roof.position.set(0, 1.42, -0.55);
    g.add(roof);
    // Streifen
    var stripe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 4.1), acc);
    stripe.position.set(0, 0.99, 0.0);
    stripe.scale.y = 1;
    var stripeH = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 1.25), acc);
    stripeH.position.set(0, 0.88, 1.38);
    stripeH.rotation.x = 0.11;
    g.add(stripeH);
    var stripeR = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.97), acc);
    stripeR.position.set(0, 1.46, -0.55);
    g.add(stripeR);
    void stripe;

    // Heckflügel
    var wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.45), acc);
    wing.position.set(0, 1.25, -2.0);
    wing.castShadow = true;
    g.add(wing);
    [-0.6, 0.6].forEach(function (x) {
      var p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.2), dark);
      p.position.set(x, 1.06, -1.95); g.add(p);
    });

    // Lichter
    var head = new THREE.MeshBasicMaterial({ color: night ? 0xfff6d8 : 0xe8eef2 });
    var tail = new THREE.MeshBasicMaterial({ color: 0x8a1018 });
    [-0.62, 0.62].forEach(function (x) {
      var h = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.05), head);
      h.position.set(x, 0.66, 2.23); g.add(h);
      var t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.05), tail);
      t.position.set(x, 0.74, -2.33); g.add(t);
    });

    // Räder
    var wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    var rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.32, 6);
    rimGeo.rotateZ(Math.PI / 2);
    var rimMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.3, metalness: 0.8 });
    var wheels = [];
    [[-0.92, 1.35], [0.92, 1.35], [-0.92, -1.42], [0.92, -1.42]].forEach(function (w, i) {
      var pivot = new THREE.Group();
      pivot.position.set(w[0], 0.36, w[1]);
      var spin = new THREE.Group();
      var tire = new THREE.Mesh(wheelGeo, dark); tire.castShadow = true;
      spin.add(tire);
      spin.add(new THREE.Mesh(rimGeo, rimMat));
      pivot.add(spin);
      g.add(pivot);
      wheels.push({ pivot: pivot, spin: spin, front: i < 2 });
    });

    return { group: g, wheels: wheels, tail: tail };
  }

  Renderer.prototype.buildCars = function (race) {
    var self = this;
    this.carMeshes.forEach(function (c) { self.scene.remove(c.root); });
    this.carMeshes = [];
    var blobMat = new THREE.MeshBasicMaterial({ map: this.blob, transparent: true, depthWrite: false });
    race.cars.forEach(function (car) {
      var m = carModel(car.color, car.accent, self.night);
      var root = new THREE.Group();
      var tilt = new THREE.Group();   // Neigen in Kurven und beim Bremsen
      tilt.add(m.group);
      root.add(tilt);
      var blob = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 5.6), blobMat);
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.04;
      root.add(blob);
      if (self.night && car.isPlayer) {
        var spot = new THREE.SpotLight(0xfff2d0, 2.2, 90, 0.42, 0.5, 1);
        spot.position.set(0, 0.8, 2);
        var tgt = new THREE.Object3D(); tgt.position.set(0, 0, 30);
        root.add(tgt); spot.target = tgt;
        root.add(spot);
      }
      self.scene.add(root);
      self.carMeshes.push({ root: root, tilt: tilt, wheels: m.wheels, tail: m.tail, roll: 0, pitch: 0, lastV: 0 });
    });
  };

  var tmpW = {};
  Renderer.prototype.placeCars = function (race, dt) {
    var tr = race.track;
    for (var i = 0; i < race.cars.length; i++) {
      var car = race.cars[i], cm = this.carMeshes[i];
      var p = T.toWorld(tr, car.s, car.d, tmpW);
      var slope = T.sample(tr, tr.slope, car.s);
      cm.root.position.set(p.x, p.y + 0.02, p.z);
      cm.root.rotation.order = 'YXZ';
      cm.root.rotation.y = p.h + car.psi;
      cm.root.rotation.x = -Math.atan(slope * Math.cos(car.psi));
      // Karosserie neigt sich nach außen und beim Bremsen nach vorn
      var accel = dt > 0 ? (car.v - cm.lastV) / dt : 0;
      cm.lastV = car.v;
      var rollT = T.clamp(-car.yawRate * car.v / 15, -1, 1) * 0.055;
      var pitchT = T.clamp(-accel / 25, -1, 1) * 0.04;
      var k = 1 - Math.exp(-dt * 8);
      cm.roll += (rollT - cm.roll) * k;
      cm.pitch += (pitchT - cm.pitch) * k;
      cm.tilt.rotation.z = cm.roll;
      cm.tilt.rotation.x = cm.pitch;
      for (var w = 0; w < 4; w++) {
        var wh = cm.wheels[w];
        wh.spin.rotation.x = car.wheelSpin;
        if (wh.front) wh.pivot.rotation.y = car.steer * 0.42;
      }
      cm.tail.color.setHex(car.brake > 0.05 && car.v > 0.5 ? 0xff2a2a : 0x8a1018);
    }
  };

  // ---- Kamera ------------------------------------------------------------
  Renderer.prototype.updateCamera = function (race, focusIdx, dt, mode) {
    var tr = race.track, car = race.cars[focusIdx], cam = this.cam;
    var p = T.toWorld(tr, car.s, car.d, tmpW);
    var yaw = p.h + car.psi;
    if (car.v < -1) yaw += 0;   // rückwärts: Kamera bleibt hinter dem Auto
    var target = new THREE.Vector3(p.x, p.y, p.z);
    if (!cam.init || mode !== cam.mode) { cam.yaw = yaw; cam.init = true; cam.mode = mode; cam.snap = true; }
    cam.yaw += T.wrapAngle(yaw - cam.yaw) * (1 - Math.exp(-dt * (mode === 'hood' ? 30 : 5)));
    var fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
    var speed = Math.abs(car.v);
    var desired = new THREE.Vector3(), look = new THREE.Vector3();
    if (mode === 'hood') {
      desired.set(p.x + Math.sin(yaw) * 0.3, p.y + 1.45, p.z + Math.cos(yaw) * 0.3);
      look.set(p.x + fx * 30, p.y + 1.1 + T.sample(tr, tr.slope, car.s + 15) * 30, p.z + fz * 30);
    } else if (mode === 'orbit') {
      cam.orbit += dt * 0.18;
      var a = cam.yaw + Math.PI * 0.75 + Math.sin(cam.orbit) * 0.9;
      desired.set(p.x + Math.sin(a) * 15, p.y + 5.5 + Math.sin(cam.orbit * 0.7) * 2, p.z + Math.cos(a) * 15);
      look.set(p.x + fx * 4, p.y + 1, p.z + fz * 4);
    } else {
      var back = 7.6 + speed * 0.03, up = 2.7 + speed * 0.012;
      desired.set(p.x - fx * back, p.y + up, p.z - fz * back);
      // nicht unter die Fahrbahn (Kuppen)
      var gy = T.sample(tr, tr.y, car.s - back) + 1.6;
      if (desired.y < gy) desired.y = gy;
      look.set(p.x + fx * 6, p.y + 1.2, p.z + fz * 6);
    }
    if (cam.snap) { cam.pos.copy(desired); cam.look.copy(look); cam.snap = false; }
    var kp = mode === 'hood' ? 1 : 1 - Math.exp(-dt * (mode === 'orbit' ? 3 : 14));
    cam.pos.lerp(desired, kp);
    cam.look.lerp(look, mode === 'hood' ? 1 : 1 - Math.exp(-dt * 16));
    this.camera.position.copy(cam.pos);
    this.camera.lookAt(cam.look);
    var fov = (this.baseFov || 60) + (mode === 'orbit' ? 0 : T.clamp(speed / 64, 0, 1.3) * 14) + (car.turboOn && car.turbo > 0 ? 6 : 0);
    this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-dt * 4));
    this.camera.updateProjectionMatrix();

    // Schatten folgen dem Auto
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDir, 120);
    if (this.sky) this.sky.position.copy(this.camera.position);
    if (this.stars) this.stars.position.copy(this.camera.position);
  };

  Renderer.prototype.setLights = function (n) {
    // n = Anzahl leuchtender Startampeln (0…3), -1 = alle grün
    if (!this.lights) return;
    for (var i = 0; i < 3; i++) {
      this.lights[i].color.setHex(n < 0 ? 0x2bff6a : i < n ? 0xff2a2a : 0x331111);
    }
  };

  Renderer.prototype.render = function () {
    if (this.sea) this.sea.position.y = Math.sin(performance.now() / 1600) * 0.08;
    this.gl.render(this.scene, this.camera);
  };

  RR.Renderer = Renderer;
})(globalThis.RR = globalThis.RR || {});
