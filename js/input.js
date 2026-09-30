// Entrada unificada: joystick PS4 (Gamepad API) + teclado como respaldo.

const Input = (() => {
  const keys = new Set();
  const keysPressed = new Set();
  let prevBtn = [];
  let btnPressed = [];
  let gp = null;
  let device = 'keyboard';
  let listeners = [];

  const KEYMAP = {
    [BTN.CROSS]: ['Space', 'KeyK', 'Enter'],
    [BTN.CIRCLE]: ['KeyL', 'Backspace'],
    [BTN.SQUARE]: ['KeyJ'],
    [BTN.TRIANGLE]: ['KeyI'],
    [BTN.OPTIONS]: ['Escape', 'KeyP'],
  };
  const BLOCK = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace'];

  addEventListener('keydown', (e) => {
    if (!keys.has(e.code)) keysPressed.add(e.code);
    keys.add(e.code);
    device = 'keyboard';
    if (BLOCK.includes(e.code)) e.preventDefault();
    listeners.forEach((f) => f());
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  addEventListener('pointerdown', () => listeners.forEach((f) => f()));
  addEventListener('gamepadconnected', () => { device = 'gamepad'; });

  function poll() {
    gp = null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    btnPressed = [];
    if (!gp) return;
    for (let i = 0; i < gp.buttons.length; i++) {
      const down = gp.buttons[i].pressed;
      if (down && !prevBtn[i]) { btnPressed[i] = true; device = 'gamepad'; }
      prevBtn[i] = down;
    }
    if (Math.hypot(gp.axes[0] || 0, gp.axes[1] || 0) > 0.5) device = 'gamepad';
  }

  function endFrame() { keysPressed.clear(); }

  function pressed(b) {
    if (btnPressed[b]) return true;
    const ks = KEYMAP[b];
    return ks ? ks.some((k) => keysPressed.has(k)) : false;
  }

  // Devuelve el primer botón de cara (✕○□△) presionado este frame, o -1.
  function anyFace() {
    for (const b of [BTN.CROSS, BTN.CIRCLE, BTN.SQUARE, BTN.TRIANGLE]) if (pressed(b)) return b;
    return -1;
  }

  function drive() {
    let sx = 0, sy = 0, thr = 0, brk = 0, turn = 0;
    if (gp) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const m = Math.hypot(ax, ay);
      if (m > 0.22) {
        const k = Math.min(1, (m - 0.22) / 0.68) / m;
        sx = ax * k; sy = ay * k;
      }
      const b = gp.buttons;
      thr = Math.max(thr, b[BTN.R2] ? b[BTN.R2].value : 0);
      brk = Math.max(brk, b[BTN.L2] ? b[BTN.L2].value : 0);
      if (b[BTN.UP] && b[BTN.UP].pressed) thr = 1;
      if (b[BTN.DOWN] && b[BTN.DOWN].pressed) brk = 1;
      if (b[BTN.LEFT] && b[BTN.LEFT].pressed) turn -= 1;
      if (b[BTN.RIGHT] && b[BTN.RIGHT].pressed) turn += 1;
    }
    if (keys.has('ArrowUp') || keys.has('KeyW')) thr = 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) brk = 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) turn -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) turn += 1;
    return { sx, sy, stick: Math.hypot(sx, sy), thr, brk, turn: U.clamp(turn, -1, 1) };
  }

  function rumble(strong = 0.5, weak = 0.5, ms = 120) {
    const act = gp && gp.vibrationActuator;
    if (!act || !act.playEffect) return;
    try {
      act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak });
    } catch (e) { /* sin vibración */ }
  }

  function padLabel() {
    if (!gp) return null;
    const id = gp.id.toLowerCase();
    if (id.includes('054c') || id.includes('wireless controller') || id.includes('dualshock')) return 'DUALSHOCK 4';
    if (id.includes('dualsense')) return 'DUALSENSE';
    return 'MANDO';
  }

  return {
    poll, endFrame, pressed, anyFace, drive, rumble, padLabel,
    onUserGesture: (f) => listeners.push(f),
    get device() { return device; },
    get gamepad() { return gp; },
  };
})();
