// Lógica principal: estados, camión, pasadas al límite, turbo, hidrante,
// fuego que se propaga, ataque con manguera, récords arcade y fantasma.

(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  Render.init(canvas);

  const HAZARDS = new Set(['wreck', 'rubble', 'car']);
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const REC_DT = 0.05;
  const IDLE_TO_TITLE = 30;
  const SPEED = 560, SPEED_BOOST = 800;

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin storage */ } },
  };

  let mapIdx = U.clamp(store.get('faro-map', 0), 0, MAPS.length - 1);
  const dbgMap = new URLSearchParams(location.search).get('mapa');
  if (dbgMap) mapIdx = U.clamp(+dbgMap - 1, 0, MAPS.length - 1);
  const map = () => MAPS[mapIdx];
  const boardKey = () => 'faro-board-' + map().seed;
  const ghostKey = () => 'faro-ghost-' + map().seed;

  let world = genWorld(map().seed);
  let G = null;
  let state = 'title';
  let stateT = 0;
  let paused = false;
  let T = 0;
  let lastCount = -1;
  let lastTick = 0;
  let idleT = 0;
  const cam = { x: CFG.W / 2, y: CFG.H / 2, zoom: 0.85, shake: 0, sx: 0, sy: 0 };

  document.querySelectorAll('[data-glyph]').forEach((el) => { el.innerHTML = glyphSVG(+el.dataset.glyph); });
  Input.onUserGesture(() => Sfx.init());

  // ------------------------------------------------------------ estados

  function show(id, on) { $(id).classList.toggle('hidden', !on); }

  function setState(s) {
    state = s; stateT = 0;
    show('screen-title', s === 'title');
    show('screen-brief', s === 'brief');
    show('screen-result', s === 'result');
    show('hud', s !== 'title');
    show('qte', s === 'attack');
    if (s !== 'attack') Sfx.spray(false);
  }

  function toTitle() {
    paused = false; show('screen-pause', false);
    G = null; FX.clear();
    world = genWorld(map().seed);
    setState('title');
    renderTitle();
  }

  function changeMap(d) {
    mapIdx = (mapIdx + d + MAPS.length) % MAPS.length;
    store.set('faro-map', mapIdx);
    world = genWorld(map().seed);
    FX.clear();
    Sfx.ui();
    renderTitle();
  }

  function startRun() {
    Sfx.init();
    Sfx.ui();
    world = genWorld(map().seed);
    world.skids = [];
    FX.clear();
    const s = world.start;
    G = {
      time: CFG.TIME, elapsed: 0,
      truck: { x: s.x, y: s.y, a: s.a, vx: 0, vy: 0, locked: false, oil: 0, inv: 0, rear: null },
      tank: 0, fill: null, rescued: 0, crashes: 0, mistakes: 0, perfects: 0, outs: 0,
      combo: 0, comboT: 0, bestCombo: 0, style: 0, nearCount: 0,
      turbo: 0.4, boosting: false, boostVis: 0, boostRumble: 0,
      stage: 0, rec: [], recT: 0, arriveT: 0, atk: null,
      ghost: store.get(ghostKey(), null), ghostPos: null,
      hitstop: 0, slow: 0, slowF: 0.35, flash: 0, flashColor: '255,255,255', warnCd: 0, prompt: null,
      result: null, score: 0, rank: '', post: null, ini: null, entryIdx: -1,
    };
    cam.x = s.x; cam.y = s.y; cam.zoom = 1.35;
    lastCount = -1;
    $('brief-type').textContent = world.incident.type;
    $('brief-addr').textContent = `${world.incident.street} · ZONA ${map().name}`;
    $('brief-radio').textContent = '';
    $('countdown').textContent = '';
    const top = store.get(boardKey(), [])[0];
    $('brief-rec').textContent = top ? `RÉCORD DE LA ZONA · ${top.n} · ${top.s.toLocaleString('es-AR')}` : 'SIN RÉCORD EN ESTA ZONA · ¡SÉ EL PRIMERO!';
    buildCivIcons();
    setState('brief');
  }

  function togglePause() {
    paused = !paused;
    show('screen-pause', paused);
    if (paused) Sfx.spray(false);
  }

  function banner(text, cls) {
    const el = $('banner');
    el.textContent = text;
    el.className = 'banner ' + (cls || '');
    void el.offsetWidth;
    el.classList.add('show');
  }

  // ------------------------------------------------------------- camión

  function updateTruck(dt) {
    const t = G.truck;
    const inp = state === 'play' ? Input.drive() : { sx: 0, sy: 0, stick: 0, thr: 0, brk: 0, turn: 0, boost: false };
    const fx = Math.cos(t.a), fy = Math.sin(t.a);
    let vf = t.vx * fx + t.vy * fy;
    let vl = -t.vx * fy + t.vy * fx;
    let throttle = 0, brake = 0;

    if (!t.locked) {
      if (inp.stick > 0.05) {
        // El camión gira hacia donde apunta el stick y acelera según cuánto lo empujes.
        const desired = Math.atan2(inp.sy, inp.sx);
        const diff = U.angDiff(t.a, desired);
        const rate = 3.8 * U.clamp(Math.abs(vf) / 170, 0.5, 1);
        t.a += U.clamp(diff, -rate * dt, rate * dt);
        throttle = inp.stick * (Math.abs(diff) > 2.2 ? 0.35 : 1);
      }
      if (inp.turn) {
        const rate = 3.3 * U.clamp(Math.abs(vf) / 160, 0.35, 1);
        t.a += inp.turn * rate * dt * (vf < -5 ? -1 : 1);
      }
      throttle = Math.max(throttle, inp.thr);
      brake = inp.brk;
    } else {
      brake = 1;
    }

    // Turbo: se carga con pasadas al límite, se gasta manteniendo R1.
    const wasBoosting = G.boosting;
    G.boosting = !t.locked && inp.boost && G.turbo > 0.02;
    if (G.boosting) {
      G.turbo = Math.max(0, G.turbo - 0.5 * dt);
      throttle = 1;
      if (!wasBoosting) { Sfx.boost(); cam.shake = Math.max(cam.shake, 4); }
      G.boostRumble -= dt;
      if (G.boostRumble <= 0) { Input.rumble(0.25, 0.5, 110); G.boostRumble = 0.1; }
    }
    G.boostVis += ((G.boosting ? 1 : 0) - G.boostVis) * U.damp(6, dt);

    const grip = t.oil > 0 ? 0.9 : 9;
    t.oil = Math.max(0, t.oil - dt);
    vl *= Math.exp(-grip * dt);
    if (throttle > 0) vf += throttle * (G.boosting ? 1700 : 1000) * dt;
    if (brake > 0) {
      if (t.locked) vf *= Math.exp(-7 * dt);
      else if (vf > 10) vf -= 1500 * brake * dt;
      else vf = Math.max(vf - 520 * brake * dt, -210);
    }
    vf *= Math.exp(-(throttle > 0 ? 0.5 : 1.5) * dt);
    const vmax = G.boosting ? SPEED_BOOST : SPEED;
    if (vf > vmax) vf += (vmax - vf) * U.damp(4, dt);

    t.vx = fx * vf - fy * vl;
    t.vy = fy * vf + fx * vl;
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    t.inv = Math.max(0, t.inv - dt);
    collideTruck();

    const sp = Math.hypot(t.vx, t.vy);
    // Marcas de frenada al derrapar o frenar fuerte
    const rx = -Math.sin(t.a), ry = Math.cos(t.a);
    const rear = [t.x - Math.cos(t.a) * 26 + rx * 13, t.y - Math.sin(t.a) * 26 + ry * 13, t.x - Math.cos(t.a) * 26 - rx * 13, t.y - Math.sin(t.a) * 26 - ry * 13];
    const skid = sp > 140 && (Math.abs(vl) > 110 || (brake > 0.5 && vf > 200) || t.oil > 0);
    if (skid && t.rear) {
      world.skids.push([t.rear[0], t.rear[1], rear[0], rear[1]], [t.rear[2], t.rear[3], rear[2], rear[3]]);
      if (world.skids.length > 900) world.skids.splice(0, 2);
    }
    t.rear = rear;

    if (sp > 60 && Math.random() < 0.5) {
      FX.emit({ x: t.x - fx * 40, y: t.y - fy * 40, vx: -fx * 30 + U.rand(-10, 10), vy: -fy * 30 + U.rand(-10, 10), life: 0.9, size: 10, grow: 26, add: false, color: '40,44,52', a: 0.35, drag: 1 });
    }
    if (G.boosting) {
      for (let i = 0; i < 3; i++) {
        FX.emit({ x: t.x - fx * 40 + U.rand(-5, 5), y: t.y - fy * 40 + U.rand(-5, 5), vx: -fx * U.rand(120, 260) + U.rand(-30, 30), vy: -fy * U.rand(120, 260) + U.rand(-30, 30), life: U.rand(0.15, 0.3), size: U.rand(7, 13), color: i ? '242,169,62' : '120,170,255', drag: 2 });
      }
    }
    if (t.oil > 0 && sp > 80) {
      FX.emit({ x: t.x, y: t.y, vx: U.rand(-40, 40), vy: U.rand(-40, 40), life: 0.4, size: 6, color: '160,120,220', a: 0.4 });
    }
  }

  function collideTruck() {
    const t = G.truck;
    for (const off of [22, -22]) {
      const fx = Math.cos(t.a), fy = Math.sin(t.a);
      const px = t.x + fx * off, py = t.y + fy * off, r = 17;
      for (const s of world.solids) {
        const c = circleVsAABB(px, py, r, s);
        if (c) resolve(c, s.kind, px, py);
      }
      for (let k = world.circles.length - 1; k >= 0; k--) {
        const o = world.circles[k];
        const dx = px - o.x, dy = py - o.y, d = Math.hypot(dx, dy);
        if (d >= r + o.r) continue;
        if (o.kind === 'cone') { knockCone(o, k); continue; }
        const n = d > 0.01 ? { nx: dx / d, ny: dy / d } : { nx: 1, ny: 0 };
        resolve({ ...n, depth: r + o.r - d }, o.kind, px, py);
      }
      for (const car of world.cars) {
        for (const co of [16, -16]) {
          const cx = car.x + car.fx * co, cy = car.y + car.fy * co;
          const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy);
          if (d >= r + 16) continue;
          const n = d > 0.01 ? { nx: dx / d, ny: dy / d } : { nx: 1, ny: 0 };
          if (resolve({ ...n, depth: r + 16 - d }, 'car', px, py)) { car.v = 0; car.stopT = 0.5; car.nm = 2; }
        }
      }
    }
    for (const o of world.oils) {
      if (U.dist(t.x, t.y, o.x, o.y) < o.r) {
        if (t.oil <= 0 && Math.hypot(t.vx, t.vy) > 100) { Sfx.oil(); FX.pop(t.x, t.y - 40, '¡ACEITE!', '#B08CF0', 20); }
        t.oil = 0.7;
      }
    }
  }

  function resolve(c, kind, px, py) {
    const t = G.truck;
    t.x += c.nx * c.depth;
    t.y += c.ny * c.depth;
    const vn = t.vx * c.nx + t.vy * c.ny;
    if (vn >= 0) return false;
    t.vx -= 1.35 * vn * c.nx;
    t.vy -= 1.35 * vn * c.ny;
    const impact = -vn;
    if (impact < 120) return true;
    t.vx *= 0.8; t.vy *= 0.8;
    for (let i = 0; i < 10; i++) {
      FX.emit({ x: px - c.nx * 17, y: py - c.ny * 17, vx: c.nx * U.rand(60, 260) + U.rand(-120, 120), vy: c.ny * U.rand(60, 260) + U.rand(-120, 120), life: U.rand(0.2, 0.5), size: U.rand(3, 6), color: '255,190,110', drag: 3 });
    }
    if (HAZARDS.has(kind) && t.inv <= 0 && state === 'play') {
      G.time -= 1;
      G.crashes++;
      t.inv = 0.8;
      G.hitstop = 0.07;
      G.flash = 0.35; G.flashColor = '220,38,38';
      cam.shake = 16;
      FX.pop(t.x, t.y - 50, '−1s', '#FF3C38', 30);
      Sfx.crash();
      Input.rumble(1, 0.8, 260);
      loseCombo();
    } else {
      cam.shake = Math.max(cam.shake, Math.min(10, impact / 40));
      Sfx.thud();
      Input.rumble(0.4, 0.3, 100);
    }
    return true;
  }

  function knockCone(o, k) {
    const t = G.truck;
    world.circles.splice(k, 1);
    const ci = world.cones.indexOf(o);
    if (ci >= 0) world.cones.splice(ci, 1);
    const sp = Math.hypot(t.vx, t.vy);
    t.vx *= 0.92; t.vy *= 0.92;
    for (let i = 0; i < 6; i++) {
      FX.emit({ x: o.x, y: o.y, vx: t.vx * 0.6 + U.rand(-80, 80), vy: t.vy * 0.6 + U.rand(-80, 80), life: 0.6, size: 5, add: false, color: '249,115,22', a: 0.9, drag: 2.5 });
    }
    if (sp > 60) { Sfx.cone(); Input.rumble(0.1, 0.3, 60); }
  }

  // -------------------------------------------------- pasadas al límite

  function nearMiss(dt) {
    const t = G.truck;
    const sp = Math.hypot(t.vx, t.vy);
    const fx = Math.cos(t.a), fy = Math.sin(t.a);
    const pts = [[t.x + fx * 22, t.y + fy * 22], [t.x - fx * 22, t.y - fy * 22]];
    const check = (obj, gapOf, ox = obj.x, oy = obj.y) => {
      obj.nm = Math.max(0, (obj.nm || 0) - dt);
      if (obj.nm > 0 || sp < 300) return;
      let gap = Infinity;
      for (const [px, py] of pts) gap = Math.min(gap, gapOf(px, py));
      if (gap > 2 && gap < 30) { obj.nm = 1.8; award(ox, oy); }
    };
    for (const car of world.cars) {
      check(car, (px, py) => Math.min(U.dist(px, py, car.x + car.fx * 16, car.y + car.fy * 16), U.dist(px, py, car.x - car.fx * 16, car.y - car.fy * 16)) - 33);
    }
    for (const r of world.rubble) check(r, (px, py) => U.dist(px, py, r.x, r.y) - 43);
    for (const b of world.wrecks) {
      check(b, (px, py) => {
        const dx = Math.max(b.x - px, 0, px - (b.x + b.w)), dy = Math.max(b.y - py, 0, py - (b.y + b.h));
        return Math.hypot(dx, dy) - 17;
      }, b.x + b.w / 2, b.y + b.h / 2);
    }
  }

  function award(x, y) {
    G.combo++;
    G.comboT = 3;
    G.nearCount++;
    G.bestCombo = Math.max(G.bestCombo, G.combo);
    const pts = 50 * G.combo;
    G.style += pts;
    G.turbo = Math.min(1, G.turbo + 0.22);
    G.slow = 0.12; G.slowF = 0.55;
    FX.pop(x, y - 40, G.combo > 1 ? `¡CERCA! x${G.combo}` : '¡CERCA!', '#F2A93E', 22 + Math.min(G.combo, 6) * 2);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      FX.emit({ x, y, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180, life: 0.35, size: 4, color: '242,169,62', drag: 4 });
    }
    Sfx.near(G.combo);
    Input.rumble(0.05, 0.45, 70);
    pulse('combo');
  }

  function loseCombo() {
    if (G.combo >= 2) { FX.pop(G.truck.x, G.truck.y - 80, 'COMBO PERDIDO', '#97A1AF', 16); Sfx.comboLost(); }
    G.combo = 0; G.comboT = 0;
  }

  function pulse(id) {
    const el = $(id);
    el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
  }

  // ------------------------------------------------------------- tareas

  function updateTasks(dt) {
    const t = G.truck;
    G.prompt = null;

    if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }

    for (const c of world.civilians) {
      if (c.picked || U.dist(t.x, t.y, c.x, c.y) > 50) continue;
      c.picked = true;
      G.rescued++;
      G.time += 2;
      if (G.combo > 0) G.comboT = 3;
      FX.pop(c.x, c.y - 30, '+2s', '#16A34A', 32);
      FX.pop(c.x, c.y - 4, 'CIVIL A BORDO', '#EFE8DC', 15);
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2, v = U.rand(40, 160);
        FX.emit({ x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7, size: U.rand(4, 9), color: '240,244,250', drag: 3 });
      }
      Sfx.pickup();
      Input.rumble(0.2, 0.6, 110);
      refreshCivIcons();
    }

    let near = null;
    if (G.tank < 1) for (const h of world.hydrants) if (U.dist(t.x, t.y, h.zx, h.zy) < h.zr) near = h;

    if (G.fill) updateGauge(dt);
    else if (near) {
      G.prompt = 'hydrant';
      if (Input.pressed(BTN.CROSS)) {
        G.fill = { h: near, needle: 0, dir: 1, speed: 1.3, zone: U.rand(0.35, 0.8), zw: 0.22, flash: 0, flashCls: '' };
        t.locked = true;
        Sfx.ui();
      }
    }

    const a = world.arrival;
    G.warnCd -= dt;
    if (U.dist(t.x, t.y, a.x, a.y) < a.r) {
      if (G.tank >= 1) startAttack();
      else if (G.warnCd <= 0) {
        FX.pop(t.x, t.y - 56, 'SIN AGUA · CARGÁ EN UN HIDRANTE', '#F59E0B', 20);
        Sfx.bad();
        G.warnCd = 2.2;
      }
    }
  }

  // Hidrante: la aguja oscila; ✕ en la zona verde suma presión, en el centro es PERFECTO.
  function updateGauge(dt) {
    const f = G.fill, t = G.truck;
    G.prompt = 'gauge';
    f.needle += f.dir * f.speed * dt;
    if (f.needle > 1) { f.needle = 2 - f.needle; f.dir = -1; }
    if (f.needle < 0) { f.needle = -f.needle; f.dir = 1; }
    f.flash = Math.max(0, f.flash - dt);

    if (Input.pressed(BTN.CROSS)) {
      const d = Math.abs(f.needle - f.zone);
      const h = f.h;
      if (d <= f.zw / 2) {
        const perfect = d < 0.045;
        G.tank = Math.min(1, G.tank + (perfect ? 0.5 : 0.34));
        f.flash = 0.35; f.flashCls = perfect ? 'perfect' : 'good';
        if (perfect) { G.perfects++; G.style += 100; }
        FX.pop(t.x, t.y - 50, perfect ? '¡PERFECTO!' : '¡BIEN!', perfect ? '#F2A93E' : '#5887FF', perfect ? 26 : 20);
        Sfx.gaugeHit(perfect);
        Input.rumble(0.2, perfect ? 0.8 : 0.4, 90);
        for (let i = 0; i < 14; i++) {
          FX.emit({ x: h.x, y: h.y, vx: (t.x - h.x) * U.rand(1.4, 2.2) + U.rand(-30, 30), vy: (t.y - h.y) * U.rand(1.4, 2.2) + U.rand(-30, 30), life: 0.5, size: U.rand(4, 9), color: '120,170,255', drag: 1 });
        }
        let z;
        do { z = U.rand(0.15, 0.85); } while (Math.abs(z - f.zone) < 0.2);
        f.zone = z;
        f.speed *= 1.12;
      } else {
        f.flash = 0.35; f.flashCls = 'miss';
        FX.pop(t.x, t.y - 50, 'FUERA', '#97A1AF', 18);
        Sfx.gaugeMiss();
        Input.rumble(0.5, 0.2, 90);
      }
      pulse('pgauge');
    } else if (Input.pressed(BTN.CIRCLE)) {
      G.fill = null; t.locked = false;
      return;
    }
    if (G.tank >= 1) {
      G.tank = 1; G.fill = null; t.locked = false;
      FX.pop(t.x, t.y - 80, 'TANQUE LLENO', '#5887FF', 26);
      Sfx.fill();
      Input.rumble(0.3, 0.9, 220);
    }
  }

  // --------------------------------------------------- fuego que crece

  function updateSpread() {
    if (G.stage >= world.incident.spread.length || G.elapsed < SPREAD_AT[G.stage]) return;
    const b = world.incident.spread[G.stage];
    G.stage++;
    b.burning = true;
    for (const p of world.incident.points) if (p.stage === G.stage) { p.active = true; p.hp = 1; }
    banner(G.stage === 1 ? '¡EL FUEGO SE PROPAGA!' : '¡SEGUNDA PROPAGACIÓN!', 'fire');
    Sfx.spreadAlarm();
    Input.rumble(0.7, 0.4, 350);
    cam.shake = Math.max(cam.shake, 7);
    for (const p of world.incident.points) {
      if (p.stage !== G.stage) continue;
      for (let i = 0; i < 20; i++) FX.emit({ x: p.x, y: p.y, vx: U.rand(-200, 200), vy: U.rand(-200, 200), life: 0.7, size: U.rand(8, 18), color: '242,112,60', drag: 2 });
    }
  }

  // --------------------------------------------------- ataque al fuego

  function startAttack() {
    G.arriveT = G.elapsed;
    const len = 4 + G.stage;
    const seq = [];
    for (let i = 0; i < len; i++) {
      let b;
      do { b = Math.floor(Math.random() * 4); } while (i > 0 && b === seq[i - 1]);
      seq.push(b);
    }
    const first = activeFires()[0] || { x: world.incident.cx, y: world.incident.cy };
    G.atk = { phase: 'seq', seq, i: 0, wrongT: 0, rx: first.x, ry: first.y, spraying: false, mouseT0: performance.now() };
    G.truck.locked = true;
    G.boosting = false;
    Sfx.alarm();
    Input.rumble(0.5, 0.5, 200);

    if (G.ghost && G.ghost.arriveT) {
      const d = G.arriveT - G.ghost.arriveT;
      banner(`LLEGADA ${G.arriveT.toFixed(1)} s · ${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(1)} vs RÉCORD`, d <= 0 ? 'ok' : 'slow');
    } else {
      banner(`LLEGADA ${G.arriveT.toFixed(1)} s`, 'ok');
    }
    setState('attack');
    buildQTE();
    if (dbg === 'aim') { G.atk.i = seq.length; G.atk.phase = 'aim'; refreshQTE(); }
  }

  function activeFires() {
    return world.incident.points.filter((p) => p.active && p.hp > 0);
  }

  function updateAttack(dt) {
    const a = G.atk;
    a.wrongT = Math.max(0, a.wrongT - dt);
    if (a.phase === 'seq') {
      const b = Input.anyFace();
      if (b >= 0) {
        if (b === a.seq[a.i]) {
          a.i++;
          Sfx.good(a.i);
          Input.rumble(0.2, 0.5, 90);
        } else {
          G.mistakes++;
          G.time -= 1;
          a.wrongT = 0.4;
          cam.shake = 12;
          G.flash = 0.3; G.flashColor = '220,38,38';
          FX.pop(G.truck.x, G.truck.y - 50, '−1s', '#FF3C38', 30);
          Sfx.bad();
          Input.rumble(0.9, 0.6, 220);
        }
        refreshQTE();
        if (a.i >= a.seq.length) {
          a.phase = 'aim';
          a.mouseT0 = performance.now();
          banner('¡LÍNEA LISTA! APUNTÁ Y TIRÁ AGUA', 'water');
          Sfx.fill();
          refreshQTE();
        }
      }
      return;
    }

    // Apuntar la manguera
    const inp = Input.aim();
    const m = Input.mouse, v = Render.view;
    if (m.movedAt > a.mouseT0 && performance.now() - m.movedAt < 1500) {
      a.rx = (m.x - v.ox) / v.s; a.ry = (m.y - v.oy) / v.s;
    } else {
      a.rx += inp.x * 760 * dt; a.ry += inp.y * 760 * dt;
    }
    const fires = activeFires();
    // Asistencia de puntería suave hacia el foco más cercano
    if (Math.hypot(inp.x, inp.y) < 0.35 && fires.length) {
      let best = null, bd = 110;
      for (const p of fires) { const d = U.dist(a.rx, a.ry, p.x, p.y); if (d < bd) { bd = d; best = p; } }
      if (best) { const k = U.damp(3, dt); a.rx += (best.x - a.rx) * k; a.ry += (best.y - a.ry) * k; }
    }
    const t = G.truck;
    const dd = U.dist(a.rx, a.ry, t.x, t.y);
    if (dd > 1100) { a.rx = t.x + (a.rx - t.x) * 1100 / dd; a.ry = t.y + (a.ry - t.y) * 1100 / dd; }

    a.spraying = inp.fire;
    Sfx.spray(a.spraying && !paused);
    if (a.spraying) {
      const nx = t.x + Math.cos(t.a) * 20, ny = t.y + Math.sin(t.a) * 20;
      for (let i = 0; i < 5; i++) {
        const k = 1 / U.rand(0.3, 0.42);
        FX.emit({ x: nx, y: ny, vx: (a.rx - nx) * k + U.rand(-40, 40), vy: (a.ry - ny) * k + U.rand(-40, 40), life: 1 / k, size: U.rand(5, 10), color: '150,190,255', a: 0.9 });
      }
      if (Math.random() < 0.4) FX.emit({ x: a.rx + U.rand(-30, 30), y: a.ry + U.rand(-30, 30), vx: U.rand(-20, 50), vy: U.rand(-50, 10), life: 1.2, size: 20, grow: 36, add: false, color: '190,200,215', a: 0.22, drag: 0.6 });
    }
    for (const p of fires) {
      const d = U.dist(a.rx, a.ry, p.x, p.y);
      if (a.spraying && d < 95) {
        p.hp -= 1.9 * dt * (d < 50 ? 1.2 : 0.8);
        if (p.hp <= 0) extinguish(p);
      } else {
        p.hp = Math.min(1, p.hp + 0.06 * dt);
      }
    }
    if (!activeFires().length) finish(true);
  }

  function extinguish(p) {
    p.hp = 0;
    G.outs++;
    G.style += 100;
    FX.pop(p.x, p.y - 30, '¡FOCO APAGADO!', '#DCE6FF', 20);
    for (let i = 0; i < 24; i++) {
      FX.emit({ x: p.x + U.rand(-30, 30), y: p.y + U.rand(-30, 30), vx: U.rand(-40, 80), vy: U.rand(-90, 10), life: U.rand(1.2, 2), size: U.rand(18, 32), grow: 30, add: false, color: '200,210,225', a: 0.3, drag: 0.5 });
    }
    Sfx.out();
    Input.rumble(0.3, 0.8, 160);
    cam.shake = Math.max(cam.shake, 5);
  }

  // ------------------------------------------------------------- final

  function finish(win) {
    if (G.result) return;
    G.result = win ? 'win' : 'lose';
    G.truck.locked = true;
    G.boosting = false;
    Sfx.spray(false);
    if (win) {
      G.slow = 0.9; G.slowF = 0.35;
      G.flash = 0.4; G.flashColor = '243,245,247';
      Sfx.win();
      Input.rumble(0.6, 1, 500);
    } else {
      G.time = 0;
      G.flash = 0.6; G.flashColor = '220,38,38';
      cam.shake = 18;
      Sfx.lose();
      Input.rumble(1, 1, 700);
    }
    const timeLeft = Math.max(0, G.time);
    G.contain = [400, 200, 0][G.stage];
    if (win) {
      G.score = Math.max(0, Math.round(1000 + timeLeft * 150 + G.rescued * 300 + G.style + (G.mistakes === 0 ? 300 : 0) + G.contain - G.crashes * 100));
      G.rank = G.score >= 5500 ? 'S' : G.score >= 4200 ? 'A' : G.score >= 3000 ? 'B' : 'C';
    } else {
      G.score = Math.round(G.style + G.rescued * 100);
      G.rank = 'F';
    }

    // Fantasma: se guarda el recorrido de la mejor victoria de la zona.
    if (win && (!G.ghost || G.score > G.ghost.score)) {
      G.newGhost = { name: store.get('faro-name', '---'), score: G.score, arriveT: G.arriveT, rec: G.rec };
      store.set(ghostKey(), G.newGhost);
    }
    setState('end');
  }

  function showResult() {
    const win = G.result === 'win';
    const badge = $('res-badge');
    badge.textContent = win ? 'RESUELTO' : 'CRÍTICO';
    badge.className = 'badge ' + (win ? 'resolved' : 'critical');
    $('res-title').textContent = win ? 'INCENDIO CONTROLADO' : 'LLEGASTE TARDE';
    $('res-sub').textContent = win
      ? `${world.incident.type} · ZONA ${map().name}`
      : 'El fuego se propagó. Cada segundo cuenta.';
    const rank = $('res-rank');
    rank.textContent = G.rank;
    rank.className = 'rank rank-' + G.rank;
    $('res-time').textContent = win ? `${Math.max(0, G.time).toFixed(1)} s` : '0.0 s';
    $('res-arrive').textContent = G.arriveT ? `${G.arriveT.toFixed(1)} s` : '—';
    $('res-civ').textContent = `${G.rescued} / ${world.civilians.length}`;
    $('res-combo').textContent = G.bestCombo ? `x${G.bestCombo} · ${G.nearCount} pasadas` : '—';
    $('res-spread').textContent = win ? ['Contenido', '1 edificio', '2 edificios'][G.stage] : '—';
    $('res-crash').textContent = String(G.crashes);
    $('res-score').textContent = G.score.toLocaleString('es-AR');

    const board = store.get(boardKey(), []);
    const qualifies = G.score > 0 && (board.length < 10 || G.score > board[board.length - 1].s);
    if (qualifies) {
      const last = store.get('faro-name', 'AAA').padEnd(3, 'A').slice(0, 3);
      G.ini = { letters: last.split(''), idx: 0 };
      G.post = 'initials';
      renderIni();
    } else {
      G.post = 'board';
    }
    renderBoard($('res-board'), board, -1);
    $('res-board-map').textContent = map().name;
    show('ini', G.post === 'initials');
    show('res-cta', G.post === 'board');
    $('res-best').textContent = qualifies ? '★ ENTRASTE AL TOP 10' : '';
    setState('result');
  }

  // ------------------------------------------------ iniciales arcade

  function updateInitials() {
    const ini = G.ini;
    const nav = Input.nav;
    if (nav.y) {
      const c = CHARS.indexOf(ini.letters[ini.idx]);
      ini.letters[ini.idx] = CHARS[(c - nav.y + CHARS.length) % CHARS.length];
      Sfx.letter();
    }
    if (nav.x) { ini.idx = U.clamp(ini.idx + nav.x, 0, 2); Sfx.letter(); }
    for (const ch of Input.takeTyped()) {
      ini.letters[ini.idx] = ch;
      ini.idx = Math.min(2, ini.idx + 1);
      Sfx.letter();
    }
    if (Input.keyPressed('Backspace') || Input.padPressed(BTN.CIRCLE)) { ini.idx = Math.max(0, ini.idx - 1); Sfx.letter(); }
    const confirm = Input.padPressed(BTN.CROSS) || Input.keyPressed('Enter');
    if (confirm) {
      if (ini.idx < 2 && Input.padPressed(BTN.CROSS)) { ini.idx++; Sfx.letter(); }
      else saveEntry();
    }
    renderIni();
  }

  function saveEntry() {
    const name = G.ini.letters.join('');
    store.set('faro-name', name);
    const board = store.get(boardKey(), []);
    const entry = { n: name, s: G.score, r: G.rank, t: Date.now() };
    board.push(entry);
    board.sort((a, b) => b.s - a.s);
    const top = board.slice(0, 10);
    store.set(boardKey(), top);
    if (G.newGhost) { G.newGhost.name = name; store.set(ghostKey(), G.newGhost); }
    G.entryIdx = top.indexOf(entry);
    G.post = 'board';
    renderBoard($('res-board'), top, G.entryIdx);
    show('ini', false);
    show('res-cta', true);
    $('res-best').textContent = G.entryIdx === 0 ? '★ ¡NUEVO RÉCORD DE LA ZONA!' : `★ PUESTO #${G.entryIdx + 1}`;
    Sfx.win();
    Input.rumble(0.4, 0.8, 300);
  }

  function renderIni() {
    const ini = G.ini;
    for (let i = 0; i < 3; i++) {
      const el = $('ini' + i);
      el.textContent = ini.letters[i];
      el.className = 'slot' + (i === ini.idx ? ' on' : '');
    }
  }

  function renderBoard(el, board, hi) {
    el.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const e = board[i];
      const li = document.createElement('li');
      li.className = (i === hi ? 'hi' : '') + (e ? '' : ' empty');
      li.innerHTML = e
        ? `<span class="pos">${i + 1}</span><span class="nm">${e.n}</span><span class="rk rank-${e.r}">${e.r}</span><span class="sc">${e.s.toLocaleString('es-AR')}</span>`
        : `<span class="pos">${i + 1}</span><span class="nm">---</span><span class="rk"></span><span class="sc">—</span>`;
      el.appendChild(li);
    }
  }

  function renderTitle() {
    $('map-name').textContent = map().name;
    $('map-idx').textContent = `${mapIdx + 1}/${MAPS.length}`;
    const board = store.get(boardKey(), []);
    renderBoard($('title-board-list'), board.slice(0, 5), -1);
    $('title-board-map').textContent = map().name;
    const top = board[0];
    $('title-best').textContent = top ? `RÉCORD · ${top.n} · ${top.s.toLocaleString('es-AR')}` : 'ZONA SIN RÉCORD';
  }

  // ------------------------------------------------------------- mundo

  function updateWorld(dt) {
    for (const c of world.cars) updateCar(c, dt);

    for (const p of world.incident.points) {
      if (!p.active || p.hp <= 0) continue;
      if (Math.random() < 10 * dt * p.hp) {
        FX.emit({ x: p.x + U.rand(-20, 20), y: p.y + U.rand(-20, 20), vx: U.rand(-20, 60), vy: U.rand(-80, -20), life: U.rand(0.8, 1.6), size: U.rand(2, 4), color: '255,170,80', drag: 0.4 });
      }
      if (Math.random() < 2.6 * dt * p.hp) {
        FX.emit({ x: p.x, y: p.y, vx: U.rand(20, 70), vy: U.rand(-60, -20), life: U.rand(2.5, 4), size: U.rand(30, 50), grow: 34, add: false, color: '16,18,22', a: 0.55, drag: 0.2 });
      }
    }
    for (const f of world.fires) {
      if (Math.random() < 6 * dt) FX.emit({ x: f.x + U.rand(-10, 10), y: f.y, vx: U.rand(-15, 30), vy: U.rand(-60, -20), life: U.rand(0.6, 1.2), size: U.rand(2, 3.5), color: '255,170,80', drag: 0.5 });
      if (Math.random() < 1.2 * dt) FX.emit({ x: f.x, y: f.y, vx: U.rand(10, 40), vy: U.rand(-40, -10), life: 2.2, size: 18, grow: 22, add: false, color: '18,20,24', a: 0.45, drag: 0.3 });
    }
    FX.update(dt);
  }

  function updateCar(car, dt) {
    const ax = car.x + car.fx * 50, ay = car.y + car.fy * 50;
    const blockedStatic = pointBlocked(world, ax, ay, 16);
    let blocked = blockedStatic;
    if (G && U.dist(ax, ay, G.truck.x, G.truck.y) < 50) blocked = true;
    for (const o of world.cars) if (o !== car && U.dist(ax, ay, o.x, o.y) < 36) blocked = true;
    car.honkCd -= dt;

    if (car.stopT > 0 && !blocked) car.stopT = Math.max(0, car.stopT - dt);
    if (blocked) {
      car.v = Math.max(0, car.v - 700 * dt);
      car.stopT += dt;
      if (G && !blockedStatic && car.stopT > 0.6 && car.honkCd <= 0 && U.dist(car.x, car.y, G.truck.x, G.truck.y) < 500) {
        Sfx.honk(); car.honkCd = 3;
      }
      if (car.stopT > 1.3) { car.dir *= -1; car.stopT = 0; }
    } else {
      car.v = Math.min(car.speed, car.v + 260 * dt);
    }
    car.pos += car.dir * car.v * dt;
    const len = car.h ? CFG.W : CFG.H;
    if (car.pos < 40) { car.pos = 40; car.dir = 1; }
    if (car.pos > len - 40) { car.pos = len - 40; car.dir = -1; }
    carPlace(car);
  }

  // Graba el recorrido y reproduce el fantasma del récord.
  function updateGhost(dt) {
    if (state === 'play') {
      G.recT += dt;
      while (G.recT >= REC_DT) {
        G.recT -= REC_DT;
        const t = G.truck;
        G.rec.push(Math.round(t.x), Math.round(t.y), Math.round(t.a * 100));
      }
    }
    const gh = G.ghost;
    if (!gh || !gh.rec || gh.rec.length < 6) { G.ghostPos = null; return; }
    const n = gh.rec.length / 3;
    const f = Math.min(n - 1, G.elapsed / REC_DT);
    const i = Math.floor(f), j = Math.min(n - 1, i + 1), k = f - i;
    const r = gh.rec;
    G.ghostPos = {
      x: U.lerp(r[i * 3], r[j * 3], k),
      y: U.lerp(r[i * 3 + 1], r[j * 3 + 1], k),
      a: r[i * 3 + 2] / 100 + U.angDiff(r[i * 3 + 2] / 100, r[j * 3 + 2] / 100) * k,
      name: gh.name,
    };
  }

  // ------------------------------------------------------------ cámara

  function updateCamera(dt) {
    let tx, ty, tz;
    if (!G) {
      tx = CFG.W / 2 + Math.cos(T * 0.07) * CFG.W * 0.32;
      ty = CFG.H / 2 + Math.sin(T * 0.11) * CFG.H * 0.28;
      tz = 0.85;
    } else {
      const t = G.truck;
      const sp = Math.hypot(t.vx, t.vy) / SPEED;
      tx = t.x + t.vx * 0.38; ty = t.y + t.vy * 0.38;
      tz = 1.05 - Math.min(1, sp) * 0.14 - G.boostVis * 0.12;
      if (state === 'brief') tz = 1.3;
      const endWin = (state === 'end' || state === 'result') && G.result === 'win';
      if (state === 'attack' || endWin) {
        // Encuadra el camión y todos los focos activos.
        let x0 = t.x, x1 = t.x, y0 = t.y, y1 = t.y;
        for (const p of world.incident.points) {
          if (!p.active) continue;
          x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
        }
        tx = (x0 + x1) / 2; ty = (y0 + y1) / 2;
        const v = Render.view;
        tz = U.clamp(Math.min(v.w / (x1 - x0 + 520), v.h / (y1 - y0 + 440)) / v.base, 0.55, 1.15);
      }
    }
    const k = U.damp(G ? 4.5 : 1, dt);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    cam.zoom += (tz - cam.zoom) * U.damp(2.5, dt);
    cam.shake *= Math.exp(-9 * dt);
    cam.sx = (Math.random() - 0.5) * 2 * cam.shake;
    cam.sy = (Math.random() - 0.5) * 2 * cam.shake;
  }

  // ------------------------------------------------------------- update

  function update(dt, rawDt) {
    stateT += rawDt;
    if (G) G.flash = Math.max(0, G.flash - rawDt * 1.6);

    switch (state) {
      case 'title':
        updateWorld(dt);
        if (Input.nav.x) changeMap(Input.nav.x);
        if (Input.pressed(BTN.CROSS)) startRun();
        break;

      case 'brief': {
        updateWorld(dt);
        const radio = `DESPACHO › UNIDAD 07 · ${world.incident.type} · ${world.incident.street} · PERSONAS EN RIESGO`;
        $('brief-radio').textContent = radio.slice(0, Math.floor(stateT * 70));
        const n = 3 - Math.floor((stateT - 0.6) / 0.9);
        if (stateT >= 0.6 && n !== lastCount && n >= 0) {
          lastCount = n;
          $('countdown').textContent = n > 0 ? String(n) : '¡YA!';
          $('countdown').classList.remove('pop'); void $('countdown').offsetWidth; $('countdown').classList.add('pop');
          Sfx.count(n);
          if (n === 0) Input.rumble(0.4, 0.7, 180);
        }
        if (stateT >= 0.6 + 0.9 * 3) { setState('play'); flashGo(); }
        break;
      }

      case 'play':
        G.time -= dt;
        G.elapsed += dt;
        updateTruck(dt);
        nearMiss(dt);
        updateTasks(dt);
        updateSpread();
        updateGhost(dt);
        updateWorld(dt);
        if (state === 'play' && G.time <= 0) finish(false);
        break;

      case 'attack':
        G.time -= dt;
        G.elapsed += dt;
        updateTruck(dt);
        updateSpread();
        updateAttack(dt);
        updateGhost(dt);
        updateWorld(dt);
        if (state === 'attack' && G.time <= 0) finish(false);
        break;

      case 'end':
        updateTruck(dt);
        updateWorld(dt);
        if (stateT > 1.7) showResult();
        break;

      case 'result':
        updateWorld(dt);
        if (stateT < 0.4) break;
        if (G.post === 'initials') updateInitials();
        else if (Input.pressed(BTN.CROSS)) startRun();
        else if (Input.pressed(BTN.CIRCLE)) toTitle();
        else if (idleT > IDLE_TO_TITLE) toTitle();
        break;
    }

    if (G && (state === 'play' || state === 'attack') && G.time < 5) {
      const step = Math.floor(G.time * 2);
      if (step !== lastTick) { lastTick = step; Sfx.tick(); }
    }

    updateCamera(rawDt);
    const sp = G ? Math.min(1, Math.hypot(G.truck.vx, G.truck.vy) / SPEED) : 0;
    Sfx.update(rawDt, sp, !!G && state !== 'result' && state !== 'title', !!G && G.boosting);
    Sfx.setMusic(musicLevel());
  }

  // -1 silencio · 0 ambiente · 1 partida · 2 tensión
  function musicLevel() {
    if (state === 'title' || state === 'brief') return 0;
    if (state === 'end') return -1;
    if (state === 'result') return stateT > 1.2 ? 0 : -1;
    if (state === 'attack' || G.time < 8) return 2;
    return 1;
  }

  function flashGo() {
    const el = $('go');
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  // --------------------------------------------------------------- HUD

  const hud = {};
  function cacheHud() {
    ['mute', 'hud-timer', 'hud-obj', 'hud-obj-text', 'hud-speed', 'hud-tank-fill', 'hud-tank-pct', 'hud-tank', 'hud-dist', 'prompt', 'prompt-text', 'prompt-key',
      'pgauge', 'pg-zone', 'pg-needle', 'hud-device', 'title-device', 'minimap', 'qte-fire', 'hud-turbo', 'hud-turbo-fill', 'combo', 'combo-n', 'combo-pts', 'combo-t',
      'qte-title', 'qte-seq', 'aim-help', 'title-panels']
      .forEach((id) => { hud[id] = $(id); });
  }

  function setText(el, v) { if (el._v !== v) { el._v = v; el.textContent = v; } }
  function setClass(el, c) { if (el._c !== c) { el._c = c; el.className = c; } }

  function buildCivIcons() {
    const box = $('hud-civ');
    box.innerHTML = '';
    world.civilians.forEach(() => {
      const s = document.createElement('span');
      s.className = 'civ-icon';
      s.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 21c1-4.2 4-6.5 7.5-6.5s6.5 2.3 7.5 6.5"/></svg>';
      box.appendChild(s);
    });
  }
  function refreshCivIcons() {
    const icons = $('hud-civ').children;
    for (let i = 0; i < icons.length; i++) icons[i].classList.toggle('on', i < G.rescued);
  }

  function buildQTE() {
    const box = hud['qte-seq'];
    box.innerHTML = '';
    G.atk.seq.forEach((b) => {
      const d = document.createElement('div');
      d.className = 'qte-slot';
      d.innerHTML = glyphSVG(b) + `<span class="key">${KEY_LABEL[b]}</span>`;
      box.appendChild(d);
    });
    refreshQTE();
  }
  function refreshQTE() {
    const a = G.atk, slots = hud['qte-seq'].children;
    const aim = a.phase === 'aim';
    hud['qte-seq'].classList.toggle('hidden', aim);
    hud['aim-help'].classList.toggle('hidden', !aim);
    setText(hud['qte-title'], aim ? 'APAGÁ TODOS LOS FOCOS' : 'ARMÁ LA LÍNEA');
    for (let i = 0; i < slots.length; i++) {
      slots[i].className = 'qte-slot' + (i < a.i ? ' done' : i === a.i ? ' current' : '') + (i === a.i && a.wrongT > 0 ? ' wrong' : '');
    }
    const box = $('qte');
    if (a.wrongT > 0) { box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); }
  }

  function updateHUD() {
    const kb = Input.device === 'keyboard';
    document.body.classList.toggle('kb', kb);
    const pad = Input.padLabel();
    setText(hud['title-device'], pad ? `${pad} CONECTADO` : 'TECLADO · conectá tu mando PS4 y tocá un botón');
    setText(hud['hud-device'], pad ? `${pad}` : 'TECLADO');
    hud['title-device'].classList.toggle('live', !!pad);
    setText(hud.mute, !Sfx.running ? 'CLIC O TECLA PARA ACTIVAR SONIDO' : Sfx.muted ? 'SONIDO: OFF (M)' : 'SONIDO: ON (M)');
    if (state === 'title') hud['title-panels'].classList.toggle('alt', Math.floor(T / 7) % 2 === 1);

    if (!G) return;
    const t = G.truck;
    const time = Math.max(0, G.time);
    setText(hud['hud-timer'], time.toFixed(1));
    setClass(hud['hud-timer'], 'timer' + (time < 5 ? ' critical' : time < 10 ? ' warn' : ''));
    setText(hud['hud-speed'], String(Math.round(Math.hypot(t.vx, t.vy) / 6)));

    const pct = Math.round(G.tank * 100);
    hud['hud-tank-fill'].style.width = pct + '%';
    setText(hud['hud-tank-pct'], G.tank >= 1 ? 'LLENO' : pct === 0 ? 'VACÍO' : pct + '%');
    setClass(hud['hud-tank'], 'gauge-row' + (G.tank <= 0 ? ' empty' : G.tank >= 1 ? ' full' : ''));

    hud['hud-turbo-fill'].style.width = Math.round(G.turbo * 100) + '%';
    setClass(hud['hud-turbo'], 'gauge-row' + (G.boosting ? ' boosting' : G.turbo > 0.3 ? ' ready' : ''));

    const showCombo = G.combo > 0 && (state === 'play');
    hud.combo.classList.toggle('hidden', !showCombo);
    if (showCombo) {
      setText(hud['combo-n'], String(G.combo));
      setText(hud['combo-pts'], G.style.toLocaleString('es-AR'));
      hud['combo-t'].style.width = Math.round((G.comboT / 3) * 100) + '%';
    }

    let obj = '', objClass = 'objective';
    if (state === 'attack') { obj = G.atk.phase === 'aim' ? '¡APAGÁ EL INCENDIO!' : '¡ARMÁ LA LÍNEA!'; objClass += ' fire'; }
    else if (state === 'end' || state === 'result') { obj = G.result === 'win' ? 'INCENDIO CONTROLADO' : 'TIEMPO AGOTADO'; objClass += G.result === 'win' ? ' ok' : ' fire'; }
    else if (G.fill) { obj = kb ? 'ESPACIO EN LA ZONA VERDE' : '✕ EN LA ZONA VERDE'; objClass += ' water'; }
    else if (G.tank < 1) { obj = 'CARGÁ AGUA EN UN HIDRANTE'; objClass += ' water'; }
    else { obj = 'DIRIGITE AL INCIDENTE'; objClass += ' fire'; }
    setText(hud['hud-obj-text'], obj);
    setClass(hud['hud-obj'], objClass);

    const tg = state === 'play' ? Render.target(world, G) : null;
    setText(hud['hud-dist'], tg ? `${Math.round(tg.d / 8)} m` : '');

    const showPrompt = state === 'play' && (G.prompt === 'hydrant' || G.prompt === 'gauge');
    hud.prompt.classList.toggle('hidden', !showPrompt);
    if (showPrompt) {
      const f = G.fill;
      if (!f) setClass(hud.pgauge, 'pgauge hidden');
      setText(hud['prompt-text'], f ? 'PRESIÓN' : 'CARGAR AGUA');
      setText(hud['prompt-key'], f ? (kb ? 'ESPACIO · L cancelar' : '○ cancelar') : kb ? 'ESPACIO' : '');
      if (f) {
        hud['pg-zone'].style.left = ((f.zone - f.zw / 2) * 100) + '%';
        hud['pg-zone'].style.width = (f.zw * 100) + '%';
        hud['pg-needle'].style.left = (f.needle * 100) + '%';
        setClass(hud.pgauge, 'pgauge' + (f.flash > 0 ? ' ' + f.flashCls : ''));
      }
    }

    if (state === 'attack' && G.atk) {
      const fires = world.incident.points.filter((p) => p.active);
      const tot = fires.reduce((s, p) => s + Math.max(0, p.hp), 0);
      hud['qte-fire'].style.width = Math.round((tot / Math.max(1, fires.length)) * 100) + '%';
    }
    Render.minimap(hud.minimap, world, G, T);
  }

  // --------------------------------------------------------------- loop

  let last = performance.now();
  function loop(now) {
    const rawDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    T += rawDt;
    Input.poll(rawDt);

    const nav = Input.nav;
    const anyInput = Input.anyFace() >= 0 || nav.x || nav.y || Input.drive().stick > 0.3;
    idleT = anyInput ? 0 : idleT + rawDt;

    if (Input.pressed(BTN.OPTIONS) && (state === 'play' || state === 'attack' || state === 'brief')) togglePause();
    else if (paused) {
      if (Input.pressed(BTN.CROSS)) togglePause();
      else if (Input.pressed(BTN.CIRCLE)) toTitle();
    }

    if (!paused) {
      let dt = rawDt;
      if (G && G.hitstop > 0) { G.hitstop -= rawDt; dt = 0; }
      if (G && G.slow > 0) { G.slow -= rawDt; dt *= G.slowF; }
      update(dt, rawDt);
    }

    Render.frame(world, G, cam, T, state === 'attack' ? 'attack' : state);
    updateHUD();
    Input.endFrame();
    requestAnimationFrame(loop);
  }

  addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !(G && G.post === 'initials' && state === 'result')) Sfx.toggleMute();
  });

  cacheHud();
  renderTitle();
  setState('title');

  // ?debug=play | hydrant | attack | aim | lose → atajos para probar escenas
  const dbg = new URLSearchParams(location.search).get('debug');
  if (dbg) {
    startRun();
    stateT = 10;
    const t = G.truck;
    if (dbg === 'hydrant') { const h = world.hydrants[0]; t.x = h.zx; t.y = h.zy; }
    if (dbg === 'attack' || dbg === 'aim') {
      G.tank = 1; t.x = world.arrival.x; t.y = world.arrival.y;
      if (dbg === 'aim') { G.elapsed = 19; updateSpread(); updateSpread(); }
    }
    if (dbg === 'lose') G.time = 0.3;
    if (dbg === 'win') { G.arriveT = 12.3; G.time = 9.4; G.rescued = 2; G.style = 900; G.bestCombo = 4; G.nearCount = 6; finish(true); }
    cam.x = t.x; cam.y = t.y;
  }
  requestAnimationFrame(loop);
})();
