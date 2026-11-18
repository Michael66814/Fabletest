/* Hauptspiel – Eingabe: Tastatur, Maus und Touch.

   Tastatur:  WASD oder Pfeiltasten laufen, Shift rennt, E / Enter / Leertaste wählt aus
   Maus:      mit gedrückter Taste ziehen dreht die Kamera, Mausrad zoomt
   Touch:     linke Bildschirmhälfte ist ein Joystick, rechte Hälfte dreht die Kamera */

export function createInput(canvas, stick) {
  const keys = new Set();
  const input = {
    enabled: true,
    move: { x: 0, y: 0 },        // x rechts, y vorwärts, Länge 0 bis 1
    run: false,
    look: { yaw: 0, pitch: 0 },  // gesammelte Kamera-Drehung seit dem letzten Abholen
    zoom: 0,
    interact: false,             // einmaliger Druck, wird beim Abholen zurückgesetzt
    touch: false,                // zuletzt per Touch bedient (für die Hilfe-Texte)
    used: false                  // überhaupt schon bewegt
  };
  let joy = null;                // { id, x0, y0, x, y }
  let lookPtr = null;            // { id, x, y }

  function onKey(e, down) {
    if (!input.enabled || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const c = e.code;
    const isMove = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c);
    if (isMove || c === 'ShiftLeft' || c === 'ShiftRight') {
      if (down) keys.add(c); else keys.delete(c);
      if (isMove) e.preventDefault();
      input.touch = false;
    } else if (down && !e.repeat && (c === 'KeyE' || c === 'Enter' || c === 'Space')) {
      // Enter/Leertaste auf einem Knopf bedienen den Knopf, nicht die Welt
      if ((c === 'Enter' || c === 'Space') && tag === 'BUTTON') return;
      input.interact = true;
      e.preventDefault();
    }
  }
  window.addEventListener('keydown', function (e) { onKey(e, true); });
  window.addEventListener('keyup', function (e) { onKey(e, false); });
  window.addEventListener('blur', function () { keys.clear(); joy = null; lookPtr = null; showStick(false); });

  function showStick(on, x, y) {
    if (!stick) return;
    stick.hidden = !on;
    if (on) {
      stick.style.left = x + 'px';
      stick.style.top = y + 'px';
      stick.firstElementChild.style.transform = 'translate(0px, 0px)';
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (!input.enabled) return;
    if (e.pointerType === 'mouse') {
      if (e.button !== 0 && e.button !== 2) return;
      lookPtr = { id: e.pointerId, x: e.clientX, y: e.clientY };
      input.touch = false;
    } else {
      input.touch = true;
      if (e.clientX < window.innerWidth / 2 && !joy) {
        joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
        showStick(true, e.clientX, e.clientY);
      } else if (!lookPtr) {
        lookPtr = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
    }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* z. B. bei nachgestellten Ereignissen */ }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (joy && e.pointerId === joy.id) {
      joy.x = e.clientX;
      joy.y = e.clientY;
      const dx = joy.x - joy.x0, dy = joy.y - joy.y0, max = 46;
      const len = Math.hypot(dx, dy), k = len > max ? max / len : 1;
      if (stick) stick.firstElementChild.style.transform = 'translate(' + dx * k + 'px, ' + dy * k + 'px)';
    } else if (lookPtr && e.pointerId === lookPtr.id) {
      const f = e.pointerType === 'mouse' ? 0.006 : 0.008;
      input.look.yaw -= (e.clientX - lookPtr.x) * f;
      input.look.pitch += (e.clientY - lookPtr.y) * f * 0.6;
      lookPtr.x = e.clientX;
      lookPtr.y = e.clientY;
    }
  });
  function release(e) {
    if (joy && e.pointerId === joy.id) {
      joy = null;
      showStick(false);
    }
    if (lookPtr && e.pointerId === lookPtr.id) lookPtr = null;
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('wheel', function (e) {
    if (!input.enabled) return;
    input.zoom += Math.sign(e.deltaY);
    e.preventDefault();
  }, { passive: false });

  // Aktuellen Stand berechnen; Einmal-Werte (Drehung, Zoom, Auswahl) werden dabei geleert
  input.read = function () {
    let x = 0, y = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (joy) {
      const dx = joy.x - joy.x0, dy = joy.y - joy.y0, max = 46;
      x = dx / max;
      y = -dy / max;
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    if (len < 0.12) { x = 0; y = 0; }            // kleine Wackler am Joystick ignorieren
    input.move.x = x;
    input.move.y = y;
    input.run = keys.has('ShiftLeft') || keys.has('ShiftRight') || (!!joy && len > 0.95);
    if (x || y) input.used = true;
    const out = {
      move: input.move, run: input.run,
      look: { yaw: input.look.yaw, pitch: input.look.pitch },
      zoom: input.zoom, interact: input.interact
    };
    input.look.yaw = 0;
    input.look.pitch = 0;
    input.zoom = 0;
    input.interact = false;
    return out;
  };
  // Beim Öffnen eines Fensters: alles loslassen
  input.reset = function () {
    keys.clear();
    joy = null;
    lookPtr = null;
    showStick(false);
    input.interact = false;
  };
  return input;
}
