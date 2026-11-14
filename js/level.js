/* Würfelflug – Level-Format.
   Ein Level besteht aus Abschnitten ("chunks"), die als Text-Bild geschrieben
   werden. Jede Zeichenkette ist eine Zeile, die unterste Zeile liegt direkt
   auf dem Boden. Zeichen:

     #   Block (man kann darauf landen, frontal dagegen ist tödlich)
     ^   Stachel am Boden        v   Stachel an der Decke
     m   kleiner Stachel         w   kleiner Stachel an der Decke
     o   kleine Säge             O   große Säge
     P   Portal: Flugmodus       C   Portal: Würfelmodus
     1 2 3 4   Tempo-Tor: langsam / normal / schnell / sehr schnell
     |   Checkpoint (nur im Übungsmodus)
     .   oder Leerzeichen: frei
*/
(function (WF) {
  'use strict';

  var C = WF.CFG;

  function scaleAbout(pts, cx, cy, f) {
    var out = [];
    for (var i = 0; i < pts.length; i += 2) {
      out.push(cx + (pts[i] - cx) * f, cy + (pts[i + 1] - cy) * f);
    }
    return out;
  }

  // Stachel-Umriss (gezeichnet) für die vier Varianten
  function spikeOutline(kind, x, y) {
    switch (kind) {
      case 'up':        return [x + 0.04, y, x + 0.96, y, x + 0.5, y + 0.96];
      case 'down':      return [x + 0.04, y + 1, x + 0.96, y + 1, x + 0.5, y + 0.04];
      case 'miniUp':    return [x + 0.18, y, x + 0.82, y, x + 0.5, y + 0.5];
      default:          return [x + 0.18, y + 1, x + 0.82, y + 1, x + 0.5, y + 0.5]; // miniDown
    }
  }

  function buildLevel(def) {
    var ROWS = C.ROWS;
    var chunks = def.chunks;
    var i, r, c;

    // ---- Breite bestimmen ----
    var widths = [];
    var contentWidth = 0;
    for (i = 0; i < chunks.length; i++) {
      var w = 0;
      if (chunks[i].length > ROWS) {
        throw new Error('Level "' + def.id + '", Abschnitt ' + i + ': mehr als ' + ROWS + ' Zeilen');
      }
      for (r = 0; r < chunks[i].length; r++) w = Math.max(w, chunks[i][r].length);
      widths.push(w);
      contentWidth += w;
    }
    var contentEnd = C.LEAD_IN + contentWidth;
    var finishX = contentEnd + C.FINISH_GAP;
    var width = finishX + C.RUN_OUT;

    var grid = new Uint8Array(width * ROWS);
    var hazards = [];      // pro Spalte: Kollisionsformen
    var items = [];        // pro Spalte: Dinge, die gezeichnet werden
    var portals = [];
    var checkpoints = [];

    function addHazard(h, xFrom, xTo) {
      for (var xi = Math.floor(xFrom); xi <= Math.floor(xTo); xi++) {
        if (xi < 0) continue;
        (hazards[xi] = hazards[xi] || []).push(h);
      }
    }
    function addItem(x, item) {
      (items[x] = items[x] || []).push(item);
    }
    function addSpike(kind, x, y) {
      var outline = spikeOutline(kind, x, y);
      var baseY = outline[1];
      var pts = scaleAbout(outline, x + 0.5, baseY, C.SPIKE_SCALE);
      addHazard({ shape: 'tri', pts: pts }, Math.min(pts[0], pts[2]), Math.max(pts[0], pts[2]) - 1e-9);
      addItem(x, { type: 'spike', kind: kind, x: x, y: y, pts: outline });
    }
    function addSaw(x, y, radius) {
      var cx = x + 0.5, cy = y + 0.5, rr = radius * C.SAW_SCALE;
      addHazard({ shape: 'circle', cx: cx, cy: cy, r: rr }, cx - rr, cx + rr - 1e-9);
      addItem(x, { type: 'saw', cx: cx, cy: cy, r: radius, phase: (x * 37 + y * 11) % 7 });
    }

    // ---- Zeichen einlesen ----
    var x0 = C.LEAD_IN;
    for (i = 0; i < chunks.length; i++) {
      var rows = chunks[i];
      for (r = 0; r < rows.length; r++) {
        var y = rows.length - 1 - r;          // unterste Zeile = Bodenhöhe 0
        var line = rows[r];
        for (c = 0; c < line.length; c++) {
          var ch = line.charAt(c);
          var x = x0 + c;
          switch (ch) {
            case ' ': case '.': break;
            case '#': grid[x * ROWS + y] = 1; break;
            case '^': addSpike('up', x, y); break;
            case 'v': addSpike('down', x, y); break;
            case 'm': addSpike('miniUp', x, y); break;
            case 'w': addSpike('miniDown', x, y); break;
            case 'o': addSaw(x, y, 0.5); break;
            case 'O': addSaw(x, y, 1.0); break;
            case 'P': portals.push({ kind: 'mode', mode: 'plane', x: x + 0.5, y: y, col: x }); break;
            case 'C': portals.push({ kind: 'mode', mode: 'cube', x: x + 0.5, y: y, col: x }); break;
            case '1': case '2': case '3': case '4':
              portals.push({ kind: 'speed', speed: +ch - 1, x: x + 0.5, y: y, col: x });
              break;
            case '|': checkpoints.push({ x: x + 0.5, col: x, index: 0 }); break;
            default:
              throw new Error('Level "' + def.id + '", Abschnitt ' + i + ', Zeile ' + r +
                ', Spalte ' + c + ': unbekanntes Zeichen "' + ch + '"');
          }
        }
      }
      x0 += widths[i];
    }

    function solidCell(xi, yi) {
      return yi < 0 || (yi < ROWS && grid[xi * ROWS + yi] === 1);
    }

    portals.sort(function (a, b) { return a.x - b.x; });
    checkpoints.sort(function (a, b) { return a.x - b.x; });
    for (i = 0; i < portals.length; i++) {
      // Ein Portal füllt den ganzen freien Durchgang seiner Spalte aus
      // (unter freiem Himmel ist es 4 Felder hoch) – man kann es nicht verfehlen.
      var p = portals[i];
      var yb = p.y, yt = p.y + 1;
      while (!solidCell(p.col, yb - 1)) yb--;
      while (yt < ROWS && !solidCell(p.col, yt)) yt++;
      if (yt >= ROWS) yt = Math.min(yb + 4, ROWS);
      p.y0 = yb;
      p.y1 = yt;
      p.type = 'portal';
      addItem(p.col, p);
    }
    for (i = 0; i < checkpoints.length; i++) {
      checkpoints[i].index = i;
      checkpoints[i].type = 'flag';
      addItem(checkpoints[i].col, checkpoints[i]);
    }

    return {
      id: def.id,
      name: def.name,
      difficulty: def.difficulty,
      width: width,
      contentEnd: contentEnd,
      finishX: finishX,
      grid: grid,
      hazards: hazards,
      items: items,
      portals: portals,
      checkpoints: checkpoints,
      // Fester Untergrund? Unter y=0 liegt überall Boden; eine Decke in der
      // obersten Zeile reicht gedanklich unendlich weit nach oben.
      solidAt: function (xi, yi) {
        if (yi < 0) return true;
        if (xi < 0 || xi >= width) return false;
        if (yi >= ROWS) yi = ROWS - 1;
        return grid[xi * ROWS + yi] === 1;
      }
    };
  }

  WF.buildLevel = buildLevel;
})(globalThis.WF = globalThis.WF || {});
