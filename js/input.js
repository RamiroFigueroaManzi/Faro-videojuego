// Entrada unificada: joystick PS4 (Gamepad API) + teclado/mouse como respaldo.

const Input = (() => {
  const keys = new Set();
  const keysPressed = new Set();
  const typed = [];
  let prevBtn = [];
  let btnPressed = [];
  let gp = null;
  let device = 'keyboard';
  const listeners = [];
  const mouse = { x: 0, y: 0, down: false, movedAt: -1 };
  const nav = { x: 0, y: 0, tx: 0, ty: 0 };

  const KEYMAP = {
    [BTN.CROSS]: ['Space', 'KeyK', 'Enter'],
    [BTN.CIRCLE]: ['KeyL', 'Backspace'],
    [BTN.SQUARE]: ['KeyJ'],
    [BTN.TRIANGLE]: ['KeyI'],
    [BTN.OPTIONS]: ['Escape', 'KeyP'],
  };
  const BLOCK = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace', 'Tab'];

  addEventListener('keydown', (e) => {
    if (!keys.has(e.code)) {
      keysPressed.add(e.code);
      if (/^Key[A-Z]$/.test(e.code) || /^Digit\d$/.test(e.code)) typed.push(e.code.slice(-1));
    }
    keys.add(e.code);
    device = 'keyboard';
    if (BLOCK.includes(e.code)) e.preventDefault();
    listeners.forEach((f) => f());
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); mouse.down = false; });
  addEventListener('pointerdown', (e) => {
    mouse.down = true; mouse.x = e.clientX; mouse.y = e.clientY; mouse.movedAt = performance.now();
    listeners.forEach((f) => f());
  });
  addEventListener('pointerup', () => { mouse.down = false; });
  addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.movedAt = performance.now(); });
  addEventListener('gamepadconnected', () => { device = 'gamepad'; });

  function poll(dt) {
    gp = null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    btnPressed = [];
    if (gp) {
      for (let i = 0; i < gp.buttons.length; i++) {
        const down = gp.buttons[i].pressed;
        if (down && !prevBtn[i]) { btnPressed[i] = true; device = 'gamepad'; }
        prevBtn[i] = down;
      }
      if (Math.hypot(gp.axes[0] || 0, gp.axes[1] || 0) > 0.5) device = 'gamepad';
    }
    updateNav(dt || 0.016);
  }

  // Navegación de menús con repetición (stick, D-pad o flechas).
  function updateNav(dt) {
    let dx = 0, dy = 0;
    if (gp) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (ax < -0.6 || btnHeld(BTN.LEFT)) dx = -1;
      if (ax > 0.6 || btnHeld(BTN.RIGHT)) dx = 1;
      if (ay < -0.6 || btnHeld(BTN.UP)) dy = -1;
      if (ay > 0.6 || btnHeld(BTN.DOWN)) dy = 1;
    }
    if (keys.has('ArrowLeft')) dx = -1;
    if (keys.has('ArrowRight')) dx = 1;
    if (keys.has('ArrowUp')) dy = -1;
    if (keys.has('ArrowDown')) dy = 1;
    nav.fx = 0; nav.fy = 0;
    for (const [axis, d, tk, fk] of [['x', dx, 'tx', 'fx'], ['y', dy, 'ty', 'fy']]) {
      if (d === 0) { nav[axis] = 0; nav[tk] = 0; continue; }
      if (nav[axis] !== d) { nav[axis] = d; nav[tk] = 0.32; nav[fk] = d; continue; }
      nav[tk] -= dt;
      if (nav[tk] <= 0) { nav[tk] = 0.09; nav[fk] = d; }
    }
  }

  function endFrame() { keysPressed.clear(); typed.length = 0; }

  function btnHeld(b) { return !!(gp && gp.buttons[b] && gp.buttons[b].pressed); }

  function pressed(b) {
    if (btnPressed[b]) return true;
    const ks = KEYMAP[b];
    return ks ? ks.some((k) => keysPressed.has(k)) : false;
  }
  const padPressed = (b) => !!btnPressed[b];
  const keyPressed = (code) => keysPressed.has(code);

  function held(b) {
    if (btnHeld(b)) return true;
    const ks = KEYMAP[b];
    return ks ? ks.some((k) => keys.has(k)) : false;
  }

  function anyFace() {
    for (const b of [BTN.CROSS, BTN.CIRCLE, BTN.SQUARE, BTN.TRIANGLE]) if (pressed(b)) return b;
    return -1;
  }

  function drive() {
    let sx = 0, sy = 0, thr = 0, brk = 0, turn = 0, boost = false;
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
      if (btnHeld(BTN.UP)) thr = 1;
      if (btnHeld(BTN.DOWN)) brk = 1;
      if (btnHeld(BTN.LEFT)) turn -= 1;
      if (btnHeld(BTN.RIGHT)) turn += 1;
      boost = btnHeld(BTN.R1) || btnHeld(BTN.SQUARE);
    }
    if (keys.has('ArrowUp') || keys.has('KeyW')) thr = 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) brk = 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) turn -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) turn += 1;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) boost = true;
    return { sx, sy, stick: Math.hypot(sx, sy), thr, brk, turn: U.clamp(turn, -1, 1), boost };
  }

  // Apuntado de la manguera: stick derecho (o izquierdo), flechas/WASD.
  function aim() {
    let x = 0, y = 0, fire = false;
    if (gp) {
      const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0, lx = gp.axes[0] || 0, ly = gp.axes[1] || 0;
      if (Math.hypot(rx, ry) > 0.18) { x = rx; y = ry; }
      else if (Math.hypot(lx, ly) > 0.22) { x = lx; y = ly; }
      const b = gp.buttons;
      fire = (b[BTN.R2] && b[BTN.R2].value > 0.25) || btnHeld(BTN.CROSS) || btnHeld(BTN.R1);
    }
    if (keys.has('ArrowLeft') || keys.has('KeyA')) x = -1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) x = 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) y = -1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) y = 1;
    if (keys.has('Space') || keys.has('KeyK') || mouse.down) fire = true;
    return { x, y, fire };
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
    if (id.includes('dualsense') || id.includes('0ce6')) return 'DUALSENSE';
    if (id.includes('054c') || id.includes('wireless controller') || id.includes('dualshock')) return 'DUALSHOCK 4';
    return 'MANDO';
  }

  return {
    poll, endFrame, pressed, padPressed, keyPressed, held, anyFace, drive, aim, rumble, padLabel,
    onUserGesture: (f) => listeners.push(f),
    takeTyped: () => typed.splice(0),
    get nav() { return { x: nav.fx, y: nav.fy }; },
    get mouse() { return mouse; },
    get device() { return device; },
    get gamepad() { return gp; },
  };
})();
