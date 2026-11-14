/* Würfelflug – Zeichnen auf die Canvas.
   Welt-Koordinaten sind Felder (x nach rechts, y nach oben, Boden bei y = 0). */
(function (WF) {
  'use strict';

  var C = WF.CFG;
  var TAU = Math.PI * 2;

  // ---- Farben ----
  var IVORY = '#f4ecd8';
  var IVORY_SHADE = '#d9cdb1';
  var IVORY_DARK = '#b7aa8c';
  var PIP = '#17302b';
  var DANGER = '#e8484f';
  var DANGER_LIGHT = '#ff8177';
  var DANGER_DARK = '#ad2a3b';

  // Würfelmodus: grüner Filz. Flugmodus: Nachthimmel.
  var PALETTE = {
    cube: { top: [6, 30, 27], bot: [25, 92, 76], ground: [6, 27, 24], block: [4, 19, 17], tile: [11, 41, 36], lamp: [88, 190, 150] },
    plane: { top: [8, 20, 56], bot: [36, 86, 152], ground: [7, 20, 50], block: [4, 13, 36], tile: [13, 32, 70], lamp: [110, 165, 245] }
  };
  var PORTAL_RGB = { plane: [111, 208, 255], cube: [186, 160, 255] };
  var SPEED_RGB = [[126, 232, 192], [244, 236, 216], [255, 182, 72], [255, 111, 174]];
  var CONFETTI = [IVORY, DANGER, '#ffb648', '#6fd0ff', '#7ee8c0', '#baa0ff'];

  // Augen eines Würfels (Koordinaten -1..1)
  var PIPS = [
    [],
    [[0, 0]],
    [[-1, -1], [1, 1]],
    [[-1, -1], [0, 0], [1, 1]],
    [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]
  ];

  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function rgb(c) {
    return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
  }
  function rgba(c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  }
  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }
  function hash2(x, y) {
    var h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return h;
  }
  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function roundRectPath(g, x, y, w, h, r) {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.arcTo(x + w, y, x + w, y + r, r);
    g.lineTo(x + w, y + h - r);
    g.arcTo(x + w, y + h, x + w - r, y + h, r);
    g.lineTo(x + r, y + h);
    g.arcTo(x, y + h, x, y + h - r, r);
    g.lineTo(x, y + r);
    g.arcTo(x, y, x + r, y, r);
    g.closePath();
  }

  function drawPips(g, face, cx, cy, spread, radius) {
    var list = PIPS[face];
    g.beginPath();
    for (var i = 0; i < list.length; i++) {
      var px = cx + list[i][0] * spread, py = cy + list[i][1] * spread;
      g.moveTo(px + radius, py);
      g.arc(px, py, radius, 0, TAU);
    }
    g.fill();
  }

  // Der Spielwürfel: elfenbeinfarben mit dunklen Augen
  function drawDie(g, cx, cy, size, rot, face) {
    var h = size / 2;
    g.save();
    g.translate(cx, cy);
    if (rot) g.rotate(rot);
    roundRectPath(g, -h, -h, size, size, size * 0.2);
    g.fillStyle = IVORY;
    g.fill();
    g.lineWidth = Math.max(1, size * 0.055);
    g.strokeStyle = IVORY_DARK;
    roundRectPath(g, -h + g.lineWidth / 2, -h + g.lineWidth / 2, size - g.lineWidth, size - g.lineWidth, size * 0.17);
    g.stroke();
    g.fillStyle = PIP;
    drawPips(g, face, 0, 0, size * 0.25, size * 0.088);
    g.restore();
  }

  function createRenderer(canvas) {
    var ctx = canvas.getContext('2d', { alpha: false });
    var V = { W: 0, H: 0, dpr: 1, u: 40, groundY: 0, playerSX: 0, menuSX: 0 };
    var camX = 0;
    var pal = null;                       // aktuelle Farben (Mischung aus Würfel- und Flugwelt)

    // Vorgezeichnete Teile. Sie hängen nur von Fenstergröße und Farbstimmung ab
    // und werden deshalb nicht in jedem Bild neu berechnet.
    var cache = {
      key: -1,                            // Farbstimmung, für die der Vorrat gilt
      sky: document.createElement('canvas'),
      ground: document.createElement('canvas'),
      tiles: []                           // Block-Bilder für die Augenzahlen 1..6
    };
    var decor = { far: [], near: [], stars: [], tileW: 1 };

    function X(wx) { return (wx - camX) * V.u; }
    function Y(wy) { return V.groundY - wy * V.u; }

    // ---- Größe / Aufteilung ----
    function resize() {
      var rect = canvas.getBoundingClientRect();
      var W = Math.max(120, Math.round(rect.width));
      var H = Math.max(120, Math.round(rect.height));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (W === V.W && H === V.H && dpr === V.dpr) return false;
      V.W = W; V.H = H; V.dpr = dpr;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      // Sichtbar sind immer 10 Felder Spielfeld plus Boden; im Hochformat
      // wird so weit verkleinert, dass mindestens 15 Felder Breite bleiben.
      V.u = Math.min(H / 12.6, W / 15);
      var band = 12.6 * V.u;
      V.groundY = Math.round((H - band) * 0.6 + 10.5 * V.u);
      V.playerSX = Math.max(3.4 * V.u, Math.min(6.5 * V.u, W * 0.27));
      V.menuSX = W > 900 ? W * 0.66 : W * 0.5;
      buildDecor();
      cache.key = -1;
      return true;
    }

    // Hintergrund-Deko: große, blasse Würfel, die schräg im Raum liegen. Sie sind
    // bewusst gedreht und kontrastarm, damit man sie nie mit Blöcken verwechselt.
    function makeDice(count, minSize, maxSize, seed) {
      var u = V.u, w = decor.tileW, h = V.groundY + u;
      var rnd = seeded(seed);
      var slot = w / count;
      var list = [];
      for (var i = 0; i < count; i++) {
        var size = (minSize + rnd() * (maxSize - minSize)) * u;
        list.push({
          x: slot * i + rnd() * slot,
          y: h * (0.2 + rnd() * 0.78),
          size: size,
          rot: (rnd() - 0.5) * 1.4 + (rnd() < 0.5 ? 0.35 : -0.35),
          face: 1 + Math.floor(rnd() * 6)
        });
      }
      return list;
    }

    function buildDecor() {
      decor.tileW = V.u * 32;
      decor.far = makeDice(9, 1.3, 2.2, 1207);
      decor.near = makeDice(5, 3.0, 4.6, 4211);
      var rnd = seeded(977);
      var n = Math.round(V.W * V.groundY / 9000);
      decor.stars = [];
      for (var i = 0; i < n; i++) {
        decor.stars.push({
          x: rnd() * V.W,
          y: Math.pow(rnd(), 1.6) * V.groundY * 0.85,
          r: 0.6 + rnd() * 1.3,
          a: 0.25 + rnd() * 0.6
        });
      }
    }

    function drawDice(list, factor, bodyAlpha, pipAlpha) {
      var w = decor.tileW;
      var off = (camX * V.u * factor) % w;
      if (off < 0) off += w;
      for (var i = 0; i < list.length; i++) {
        var d = list[i], reach = d.size * 0.72;
        for (var sx = d.x - off; sx < V.W + reach; sx += w) {
          if (sx < -reach) continue;
          ctx.save();
          ctx.translate(sx, d.y);
          ctx.rotate(d.rot);
          roundRectPath(ctx, -d.size / 2, -d.size / 2, d.size, d.size, d.size * 0.2);
          ctx.fillStyle = 'rgba(0,0,0,' + bodyAlpha + ')';
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,' + pipAlpha + ')';
          drawPips(ctx, d.face, 0, 0, d.size * 0.25, d.size * 0.08);
          ctx.restore();
        }
      }
    }

    // ---- Vorrat für eine Farbstimmung anlegen: Himmel, Boden, Block-Bilder ----
    function prepare(blend) {
      var key = Math.round(blend * 24);
      if (key === cache.key) return;
      cache.key = key;
      var t = key / 24;
      pal = {
        top: mix(PALETTE.cube.top, PALETTE.plane.top, t),
        bot: mix(PALETTE.cube.bot, PALETTE.plane.bot, t),
        ground: mix(PALETTE.cube.ground, PALETTE.plane.ground, t),
        block: mix(PALETTE.cube.block, PALETTE.plane.block, t),
        tile: mix(PALETTE.cube.tile, PALETTE.plane.tile, t),
        lamp: mix(PALETTE.cube.lamp, PALETTE.plane.lamp, t)
      };
      var W = V.W, H = V.H, gy = V.groundY, u = V.u, dpr = V.dpr;
      var g, i;

      // Himmel mit Lichtkegel, Sternen (nur im Flug) und abgedunkelten Rändern
      var sky = cache.sky;
      if (sky.width !== canvas.width || sky.height !== canvas.height) {
        sky.width = canvas.width;
        sky.height = canvas.height;
      }
      g = sky.getContext('2d', { alpha: false });
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      var grad = g.createLinearGradient(0, 0, 0, gy);
      grad.addColorStop(0, rgb(pal.top));
      grad.addColorStop(1, rgb(pal.bot));
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      var R = Math.max(W, H) * 0.7;
      var lamp = g.createRadialGradient(W * 0.55, gy - 3 * u, 0, W * 0.55, gy - 3 * u, R);
      lamp.addColorStop(0, rgba(pal.lamp, 0.3));
      lamp.addColorStop(1, rgba(pal.lamp, 0));
      g.fillStyle = lamp;
      g.fillRect(0, 0, W, gy);
      if (t > 0.02) {
        g.fillStyle = '#ffffff';
        for (i = 0; i < decor.stars.length; i++) {
          var st = decor.stars[i];
          g.globalAlpha = st.a * t * 0.9;
          g.beginPath();
          g.arc(st.x, st.y, st.r, 0, TAU);
          g.fill();
        }
        g.globalAlpha = 1;
      }
      var VR = Math.sqrt(W * W + H * H) / 2;
      var vig = g.createRadialGradient(W / 2, H / 2, VR * 0.55, W / 2, H / 2, VR);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.42)');
      g.fillStyle = vig;
      g.fillRect(0, 0, W, H);

      // Bodenstreifen mit Würfelaugen (zeigen, wie schnell es vorwärts geht)
      var ground = cache.ground;
      var gw = Math.ceil((W + 3 * u) * dpr), gh = Math.max(1, Math.ceil((H - gy) * dpr));
      if (ground.width !== gw || ground.height !== gh) {
        ground.width = gw;
        ground.height = gh;
      }
      g = ground.getContext('2d', { alpha: false });
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = rgb(pal.ground);
      g.fillRect(0, 0, W + 3 * u, H - gy);
      var cols = Math.ceil(W / u) + 3;
      for (var r = 0; r < 7; r++) {
        var yy = (0.62 + r * 0.78) * u;
        if (yy > H - gy + u) break;
        var shift = (r % 2) * 0.5, rad = u * 0.075;
        g.fillStyle = 'rgba(244,236,216,' + (0.13 - r * 0.014).toFixed(3) + ')';
        g.beginPath();
        for (i = -1; i <= cols; i++) {
          var px = (i + shift + 0.5) * u;
          g.moveTo(px + rad, yy);
          g.arc(px, yy, rad, 0, TAU);
        }
        g.fill();
      }
      g.fillStyle = IVORY;
      g.fillRect(0, 0, W + 3 * u, Math.max(2, Math.round(u * 0.07)));

      // Blöcke: dunkle Würfel mit den Augenzahlen 1 bis 6
      var size = Math.max(4, Math.ceil(u * dpr));
      var inset = Math.max(1, size * 0.045);
      for (var face = 1; face <= 6; face++) {
        var tile = cache.tiles[face] || (cache.tiles[face] = document.createElement('canvas'));
        if (tile.width !== size) {
          tile.width = size;
          tile.height = size;
        }
        g = tile.getContext('2d', { alpha: false });
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = rgb(pal.block);
        g.fillRect(0, 0, size, size);
        roundRectPath(g, inset, inset, size - 2 * inset, size - 2 * inset, size * 0.15);
        g.fillStyle = rgb(pal.tile);
        g.fill();
        g.fillStyle = 'rgba(244,236,216,0.11)';
        drawPips(g, face, size / 2, size / 2, size * 0.23, size * 0.07);
      }
    }

    // ---- Himmel, Boden ----
    function drawBackground() {
      ctx.drawImage(cache.sky, 0, 0, V.W, V.H);
      drawDice(decor.far, 0.14, 0.1, 0.035);
      drawDice(decor.near, 0.32, 0.13, 0.04);
    }

    function drawGround() {
      var u = V.u, dpr = V.dpr;
      var frac = camX - Math.floor(camX);
      var dx = Math.round(-(frac + 1) * u * dpr) / dpr;        // auf ganze Bildpunkte gerundet
      ctx.drawImage(cache.ground, dx, V.groundY, cache.ground.width / dpr, cache.ground.height / dpr);
    }

    // ---- Blöcke: dunkle Würfel mit heller Oberkante ----
    function drawBlocks(level) {
      var u = V.u, ROWS = C.ROWS, grid = level.grid;
      var xStart = Math.max(0, Math.floor(camX) - 1);
      var xEnd = Math.min(level.width - 1, Math.ceil(camX + V.W / u) + 1);
      var lw = Math.max(2, Math.round(u * 0.07));
      var half = Math.max(1, lw / 2);
      var x, y, sx0, sx1, sy0, sy1;

      for (x = xStart; x <= xEnd; x++) {
        sx0 = Math.round((x - camX) * u);
        sx1 = Math.round((x + 1 - camX) * u);
        for (y = 0; y < ROWS; y++) {
          if (!grid[x * ROWS + y]) continue;
          sy1 = Math.round(V.groundY - y * u);
          sy0 = Math.round(V.groundY - (y + 1) * u);
          if (y === ROWS - 1 && sy0 > 0) {                      // Decke reicht bis zum Bildrand
            ctx.fillStyle = rgb(pal.block);
            ctx.fillRect(sx0, 0, sx1 - sx0, sy0);
          }
          ctx.drawImage(cache.tiles[1 + hash2(x, y) % 6], sx0, sy0, sx1 - sx0, sy1 - sy0);
        }
      }
      // Kanten: oben kräftig (hier kann man landen), sonst dezent
      for (x = xStart; x <= xEnd; x++) {
        sx0 = Math.round((x - camX) * u);
        sx1 = Math.round((x + 1 - camX) * u);
        for (y = 0; y < ROWS; y++) {
          if (!grid[x * ROWS + y]) continue;
          sy1 = Math.round(V.groundY - y * u);
          sy0 = Math.round(V.groundY - (y + 1) * u);
          if (y < ROWS - 1 && !grid[x * ROWS + y + 1]) {
            ctx.fillStyle = IVORY;
            ctx.fillRect(sx0, sy0, sx1 - sx0, lw);
          }
          if (y > 0 && !grid[x * ROWS + y - 1]) {
            ctx.fillStyle = 'rgba(244,236,216,0.45)';
            ctx.fillRect(sx0, sy1 - lw, sx1 - sx0, lw);
          }
          ctx.fillStyle = 'rgba(244,236,216,0.28)';
          if (!level.solidAt(x - 1, y)) ctx.fillRect(sx0, sy0, half, sy1 - sy0);
          if (!level.solidAt(x + 1, y)) ctx.fillRect(sx1 - half, sy0, half, sy1 - sy0);
        }
      }
    }

    // ---- Stacheln, Sägen ----
    function drawSpike(it) {
      var p = it.pts;
      var ax = X(p[0]), ay = Y(p[1]), bx = X(p[2]), by = Y(p[3]), tx = X(p[4]), ty = Y(p[5]);
      var mx = (ax + bx) / 2, my = (ay + by) / 2;
      ctx.fillStyle = DANGER_LIGHT;
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(mx + 0.5, my); ctx.lineTo(tx, ty);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = DANGER_DARK;
      ctx.beginPath();
      ctx.moveTo(mx, my); ctx.lineTo(bx, by); ctx.lineTo(tx, ty);
      ctx.closePath();
      ctx.fill();
    }

    function drawSaw(it, t) {
      var cx = X(it.cx), cy = Y(it.cy), R = it.r * V.u;
      var teeth = it.r > 0.6 ? 12 : 8;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 5 + it.phase);
      ctx.beginPath();
      for (var i = 0; i < teeth * 2; i++) {
        var a = i / (teeth * 2) * TAU;
        var rad = i % 2 === 0 ? R : R * 0.74;
        if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
        else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fillStyle = DANGER;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.55, 0, TAU);
      ctx.fillStyle = DANGER_DARK;
      ctx.fill();
      ctx.fillStyle = DANGER_LIGHT;
      ctx.beginPath();
      ctx.arc(R * 0.3, 0, R * 0.09, 0, TAU);
      ctx.arc(-R * 0.3, 0, R * 0.09, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.15, 0, TAU);
      ctx.fillStyle = IVORY;
      ctx.fill();
      ctx.restore();
    }

    // ---- Portale ----
    function drawPlaneIcon(g, cx, cy, s, color) {
      g.save();
      g.translate(cx, cy);
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(s * 0.62, -s * 0.05);
      g.lineTo(-s * 0.6, -s * 0.42);
      g.lineTo(-s * 0.3, 0);
      g.closePath();
      g.fill();
      g.globalAlpha *= 0.65;
      g.beginPath();
      g.moveTo(s * 0.62, -s * 0.05);
      g.lineTo(-s * 0.3, 0);
      g.lineTo(-s * 0.16, s * 0.4);
      g.closePath();
      g.fill();
      g.restore();
    }

    function drawDieIcon(g, cx, cy, s, color) {
      g.save();
      g.lineWidth = Math.max(1.5, s * 0.14);
      g.strokeStyle = color;
      roundRectPath(g, cx - s * 0.5, cy - s * 0.5, s, s, s * 0.22);
      g.stroke();
      g.fillStyle = color;
      drawPips(g, 3, cx, cy, s * 0.24, s * 0.1);
      g.restore();
    }

    function drawChevrons(g, cx, cy, s, count, dir, color, lineWidth) {
      g.save();
      g.strokeStyle = color;
      g.lineWidth = lineWidth;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      var step = s * 0.62;
      var start = cx - dir * step * (count - 1) / 2;
      g.beginPath();
      for (var i = 0; i < count; i++) {
        var x = start + dir * step * i;
        g.moveTo(x - dir * s * 0.24, cy - s * 0.42);
        g.lineTo(x + dir * s * 0.24, cy);
        g.lineTo(x - dir * s * 0.24, cy + s * 0.42);
      }
      g.stroke();
      g.restore();
    }

    function drawPortal(p, t) {
      var u = V.u;
      var sx = X(p.x), yTop = Y(p.y1), yBot = Y(p.y0), h = yBot - yTop;
      var isMode = p.kind === 'mode';
      var col = isMode ? PORTAL_RGB[p.mode] : SPEED_RGB[p.speed];
      var w = (isMode ? 1.5 : 1.0) * u;

      // Lichtvorhang
      var grad = ctx.createLinearGradient(sx - w / 2, 0, sx + w / 2, 0);
      grad.addColorStop(0, rgba(col, 0));
      grad.addColorStop(0.5, rgba(col, isMode ? 0.5 : 0.3));
      grad.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(sx - w / 2, yTop, w, h);

      var lw = Math.max(2, u * 0.06);
      ctx.fillStyle = rgba(col, 0.95);
      if (isMode) {
        ctx.fillRect(sx - u * 0.2 - lw / 2, yTop, lw, h);
        ctx.fillRect(sx + u * 0.2 - lw / 2, yTop, lw, h);
      } else {
        ctx.fillRect(sx - lw / 2, yTop, lw, h);
      }

      var i, ph;
      if (isMode) {
        // aufsteigende Lichtpunkte
        var n = Math.max(4, Math.round(h / u * 1.6));
        for (i = 0; i < n; i++) {
          ph = (t * 0.45 + i * 0.6180339) % 1;
          var mx = sx + Math.sin(i * 12.9898) * u * 0.42;
          var my = yBot - ph * h;
          ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
          ctx.fillRect(mx - u * 0.035, my - u * 0.11, u * 0.07, u * 0.22);
        }
        ctx.globalAlpha = 1;
      } else {
        // Pfeile: Anzahl und Richtung zeigen das Tempo
        var count = p.speed === 0 ? 1 : p.speed;
        var dir = p.speed === 0 ? -1 : 1;
        var rows = Math.max(2, Math.floor(h / (u * 1.15)));
        var pitch = h / rows;
        for (i = 0; i < rows; i++) {
          ph = (t * 1.4 + i * 0.13) % 1;
          ctx.globalAlpha = 0.45 + 0.55 * Math.sin(ph * Math.PI);
          drawChevrons(ctx, sx + dir * (ph - 0.5) * u * 0.22, yTop + pitch * (i + 0.5), u * 0.62,
            count, dir, rgba(col, 1), Math.max(2, u * 0.11));
        }
        ctx.globalAlpha = 1;
      }

      // Sockel oben und unten
      ctx.fillStyle = rgba(col, 1);
      var capW = (isMode ? 1.5 : 0.9) * u, capH = Math.max(3, u * 0.16);
      roundRectPath(ctx, sx - capW / 2, yBot - capH, capW, capH, capH / 2);
      ctx.fill();
      roundRectPath(ctx, sx - capW / 2, yTop, capW, capH, capH / 2);
      ctx.fill();

      // Schild mit dem Symbol des Portals
      if (isMode) {
        var by = yBot - Math.min(h * 0.5, 3.2 * u) - (h > 5 * u ? u * 1.1 : 0);
        var bob = Math.sin(t * 2.2 + p.x) * u * 0.06;
        ctx.beginPath();
        ctx.arc(sx, by + bob, u * 0.62, 0, TAU);
        ctx.fillStyle = 'rgba(4,16,18,0.82)';
        ctx.fill();
        ctx.lineWidth = Math.max(2, u * 0.07);
        ctx.strokeStyle = rgba(col, 1);
        ctx.stroke();
        if (p.mode === 'plane') drawPlaneIcon(ctx, sx, by + bob + u * 0.02, u * 0.62, rgba(col, 1));
        else drawDieIcon(ctx, sx, by + bob, u * 0.56, rgba(col, 1));
      }
    }

    function drawFlag(it, reached) {
      var u = V.u;
      var sx = X(it.x), gy = Y(0);
      var col = reached ? '#7ee8c0' : 'rgba(244,236,216,0.55)';
      ctx.fillStyle = col;
      ctx.fillRect(sx - u * 0.035, gy - u * 1.5, u * 0.07, u * 1.5);
      ctx.beginPath();
      ctx.moveTo(sx + u * 0.03, gy - u * 1.5);
      ctx.lineTo(sx + u * 0.68, gy - u * 1.24);
      ctx.lineTo(sx + u * 0.03, gy - u * 0.98);
      ctx.closePath();
      ctx.fill();
    }

    function drawFinish(level) {
      var u = V.u;
      var sx = X(level.finishX);
      if (sx < -2 * u || sx > V.W + 2 * u) return;
      var gy = Y(0), size = u * 0.5, rowsN = 12;
      for (var r = 0; r < rowsN; r++) {
        for (var c = 0; c < 2; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? IVORY : 'rgba(4,16,18,0.85)';
          ctx.fillRect(Math.round(sx + (c - 1) * size), Math.round(gy - (r + 1) * size), Math.ceil(size), Math.ceil(size));
        }
      }
      ctx.fillStyle = IVORY;
      ctx.fillRect(Math.round(sx - size) - 2, gy - rowsN * size, 2, rowsN * size);
      ctx.fillRect(Math.round(sx + size), gy - rowsN * size, 2, rowsN * size);
    }

    function drawItems(level, t, G) {
      var u = V.u;
      var xStart = Math.max(0, Math.floor(camX) - 3);
      var xEnd = Math.min(level.width - 1, Math.ceil(camX + V.W / u) + 3);
      var x, i, list, it;
      for (x = xStart; x <= xEnd; x++) {
        list = level.items[x];
        if (!list) continue;
        for (i = 0; i < list.length; i++) {
          if (list[i].type === 'portal') drawPortal(list[i], t);
        }
      }
      for (x = xStart; x <= xEnd; x++) {
        list = level.items[x];
        if (!list) continue;
        for (i = 0; i < list.length; i++) {
          it = list[i];
          if (it.type === 'spike') drawSpike(it);
          else if (it.type === 'saw') drawSaw(it, t);
          else if (it.type === 'flag' && G.practice && !G.demo) drawFlag(it, it.index <= G.cpIndex);
        }
      }
    }

    // ---- Spieler ----
    function surfaceBelow(level, x, bottom) {
      var xi = Math.floor(x);
      for (var yi = Math.min(C.ROWS - 1, Math.floor(bottom - 0.02)); yi >= 0; yi--) {
        if (level.solidAt(xi, yi)) return yi + 1;
      }
      return 0;
    }

    function drawShadow(G) {
      var u = V.u;
      var hh = G.rmode === 'plane' ? C.PLANE.hh : C.CUBE.hh;
      var surf = surfaceBelow(G.level, G.rx, G.ry - hh);
      var dist = Math.max(0, G.ry - hh - surf);
      var k = 1 - clamp01(dist / 4.5);
      if (k <= 0.02) return;
      ctx.fillStyle = 'rgba(0,0,0,' + (0.32 * k).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(X(G.rx), Y(surf) + u * 0.05, u * (0.34 + 0.2 * k), u * 0.07, 0, 0, TAU);
      ctx.fill();
    }

    function drawPlane(cx, cy, tilt, face) {
      var u = V.u;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-tilt);
      // hinterer Flügel
      ctx.fillStyle = IVORY_DARK;
      ctx.beginPath();
      ctx.moveTo(u * 0.82, u * 0.04);
      ctx.lineTo(-u * 0.6, -u * 0.2);
      ctx.lineTo(-u * 0.42, u * 0.02);
      ctx.closePath();
      ctx.fill();
      // der Würfel fliegt mit
      drawDie(ctx, -u * 0.2, -u * 0.27, u * 0.46, 0, face);
      // Rumpf (Falz nach unten)
      ctx.fillStyle = IVORY_SHADE;
      ctx.beginPath();
      ctx.moveTo(u * 0.82, u * 0.04);
      ctx.lineTo(-u * 0.42, u * 0.02);
      ctx.lineTo(-u * 0.26, u * 0.34);
      ctx.closePath();
      ctx.fill();
      // vorderer Flügel
      ctx.fillStyle = IVORY;
      ctx.beginPath();
      ctx.moveTo(u * 0.82, u * 0.04);
      ctx.lineTo(-u * 0.78, -u * 0.06);
      ctx.lineTo(-u * 0.42, u * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawTrail(trail) {
      if (trail.length < 2) return;
      var u = V.u;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1.5, u * 0.07);
      for (var i = 1; i < trail.length; i += 2) {
        var a = trail[i - 1], b = trail[i];
        ctx.strokeStyle = 'rgba(244,236,216,' + (0.6 * i / trail.length).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(X(a.x), Y(a.y));
        ctx.lineTo(X(b.x), Y(b.y));
        ctx.stroke();
      }
    }

    // ---- Effekte ----
    function drawParticles(list) {
      var u = V.u;
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var k = clamp01(p.life / p.max);
        var size = p.size * u * (p.shrink ? 0.35 + 0.65 * k : 1);
        ctx.globalAlpha = (p.fade ? k : 1) * p.alpha;
        ctx.fillStyle = p.color;
        var sx = X(p.x), sy = Y(p.y);
        if (p.round) {
          ctx.beginPath();
          ctx.arc(sx, sy, size / 2, 0, TAU);
          ctx.fill();
        } else {
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(p.rot);
          ctx.fillRect(-size / 2, -size * p.aspect / 2, size, size * p.aspect);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawSpeedLines(fx) {
      if (fx.speedFx <= 0.02) return;
      var W = V.W, gy = V.groundY, u = V.u;
      ctx.fillStyle = IVORY;
      for (var i = 0; i < fx.lines.length; i++) {
        var l = fx.lines[i];
        ctx.globalAlpha = l.a * fx.speedFx;
        ctx.fillRect(l.x * (W + 6 * u) - 3 * u, u * 1.7 + l.y * (gy - u * 2.4), l.len * u, Math.max(1, u * 0.025));
      }
      ctx.globalAlpha = 1;
    }

    // ---- Ein Bild zeichnen ----
    function draw(G, now) {
      var t = now / 1000;
      var fx = G.fx;
      camX = G.camX;
      prepare(fx.modeBlend);
      ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);

      ctx.save();
      if (fx.shake > 0.002) {
        ctx.translate((Math.random() - 0.5) * fx.shake * V.u, (Math.random() - 0.5) * fx.shake * V.u);
      }
      drawBackground();
      drawGround();
      if (G.level) {
        drawBlocks(G.level);
        drawItems(G.level, t, G);
        drawFinish(G.level);
        if (G.showPlayer) {
          drawShadow(G);
          drawTrail(fx.trail);
          if (G.rmode === 'plane') drawPlane(X(G.rx), Y(G.ry), G.rrot, fx.face);
          else drawDie(ctx, X(G.rx), Y(G.ry), V.u * 0.98, G.rrot, fx.face);
        }
      }
      drawParticles(fx.particles);
      ctx.restore();

      drawSpeedLines(fx);
      if (fx.flash > 0.004) {
        ctx.fillStyle = rgba(fx.flashColor, fx.flash.toFixed(3));
        ctx.fillRect(0, 0, V.W, V.H);
      }
    }

    return {
      view: V,
      resize: resize,
      draw: draw
    };
  }

  WF.createRenderer = createRenderer;
  WF.draw = {
    PIPS: PIPS,
    PORTAL_RGB: PORTAL_RGB,
    SPEED_RGB: SPEED_RGB,
    CONFETTI: CONFETTI,
    IVORY: IVORY,
    DANGER: DANGER,
    PIP: PIP
  };
})(globalThis.WF = globalThis.WF || {});
