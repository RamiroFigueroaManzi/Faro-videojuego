// Lógica principal: estados, camión, tareas, secuencia final y HUD.

(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  Render.init(canvas);

  const HAZARDS = new Set(['wreck', 'rubble', 'car']);
  const MASH_STEP = 1 / 12;
  const QTE_LEN = 6;

  let world = genWorld();
  let G = null;
  let state = 'title';
  let stateT = 0;
  let paused = false;
  let T = 0;
  let lastCount = -1;
  let lastTick = 0;
  const cam = { x: CFG.W / 2, y: CFG.H / 2, zoom: 0.85, shake: 0, sx: 0, sy: 0 };

  let best = 0;
  try { best = +localStorage.getItem('faro-best') || 0; } catch (e) { /* sin storage */ }

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
    show('qte', s === 'qte');
  }

  function toTitle() {
    paused = false; show('screen-pause', false);
    G = null; FX.clear();
    world = genWorld();
    setState('title');
    renderBest();
  }

  function startRun() {
    Sfx.init();
    Sfx.ui();
    world = genWorld();
    FX.clear();
    const s = world.start;
    G = {
      time: CFG.TIME,
      truck: { x: s.x, y: s.y, a: s.a, vx: 0, vy: 0, locked: false, oil: 0, inv: 0 },
      tank: 0, fill: null, rescued: 0, crashes: 0, mistakes: 0, qte: null,
      hitstop: 0, slow: 0, flash: 0, flashColor: '255,255,255', warnCd: 0, prompt: null,
      result: null, score: 0, rank: '',
    };
    cam.x = s.x; cam.y = s.y; cam.zoom = 1.35;
    lastCount = -1;
    $('brief-type').textContent = world.incident.type;
    $('brief-addr').textContent = world.incident.street;
    $('brief-radio').textContent = '';
    $('countdown').textContent = '';
    buildCivIcons();
    setState('brief');
  }

  function togglePause() {
    paused = !paused;
    show('screen-pause', paused);
  }

  // ------------------------------------------------------------- camión

  function updateTruck(dt) {
    const t = G.truck;
    const inp = state === 'play' ? Input.drive() : { sx: 0, sy: 0, stick: 0, thr: 0, brk: 0, turn: 0 };
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

    const grip = t.oil > 0 ? 0.9 : 9;
    t.oil = Math.max(0, t.oil - dt);
    vl *= Math.exp(-grip * dt);
    if (throttle > 0) vf += throttle * 1000 * dt;
    if (brake > 0) {
      if (t.locked) vf *= Math.exp(-7 * dt);
      else if (vf > 10) vf -= 1500 * brake * dt;
      else vf = Math.max(vf - 520 * brake * dt, -210);
    }
    vf *= Math.exp(-(throttle > 0 ? 0.5 : 1.5) * dt);
    vf = Math.min(vf, 560);

    t.vx = fx * vf - fy * vl;
    t.vy = fy * vf + fx * vl;
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    t.inv = Math.max(0, t.inv - dt);
    collideTruck();

    // estela de humo del caño de escape y chispas al derrapar
    const sp = Math.hypot(t.vx, t.vy);
    if (sp > 60 && Math.random() < 0.5) {
      FX.emit({ x: t.x - fx * 40, y: t.y - fy * 40, vx: -fx * 30 + U.rand(-10, 10), vy: -fy * 30 + U.rand(-10, 10), life: 0.9, size: 10, grow: 26, add: false, color: '40,44,52', a: 0.35, drag: 1 });
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
        if (o.kind === 'cone') { knockCone(o, k, dx, dy); continue; }
        const n = d > 0.01 ? { nx: dx / d, ny: dy / d } : { nx: 1, ny: 0 };
        resolve({ ...n, depth: r + o.r - d }, o.kind, px, py);
      }
      for (const car of world.cars) {
        for (const co of [16, -16]) {
          const cx = car.x + car.fx * co, cy = car.y + car.fy * co;
          const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy);
          if (d >= r + 16) continue;
          const n = d > 0.01 ? { nx: dx / d, ny: dy / d } : { nx: 1, ny: 0 };
          if (resolve({ ...n, depth: r + 16 - d }, 'car', px, py)) { car.v = 0; car.stopT = 0.5; }
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
    } else {
      cam.shake = Math.max(cam.shake, Math.min(10, impact / 40));
      Sfx.thud();
      Input.rumble(0.4, 0.3, 100);
    }
    return true;
  }

  function knockCone(o, k, dx, dy) {
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

  // ------------------------------------------------------------- tareas

  function updateTasks(dt) {
    const t = G.truck;
    G.prompt = null;

    for (const c of world.civilians) {
      if (c.picked || U.dist(t.x, t.y, c.x, c.y) > 50) continue;
      c.picked = true;
      G.rescued++;
      G.time += 2;
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

    if (G.fill) {
      G.prompt = 'mash';
      if (Input.pressed(BTN.CROSS)) {
        G.fill.p += MASH_STEP;
        Sfx.mash(G.fill.p);
        Input.rumble(0.15, 0.35, 50);
        const h = G.fill.h;
        for (let i = 0; i < 6; i++) {
          FX.emit({ x: h.x, y: h.y, vx: (t.x - h.x) * U.rand(1.2, 2) + U.rand(-30, 30), vy: (t.y - h.y) * U.rand(1.2, 2) + U.rand(-30, 30), life: 0.45, size: U.rand(4, 8), color: '120,170,255', drag: 1 });
        }
      } else if (Input.pressed(BTN.CIRCLE)) {
        G.fill = null; t.locked = false;
      }
      if (G.fill) {
        G.fill.p = Math.max(0, G.fill.p - 0.22 * dt);
        G.tank = G.fill.p;
        if (G.fill.p >= 1) {
          G.tank = 1; G.fill = null; t.locked = false;
          FX.pop(t.x, t.y - 50, 'TANQUE LLENO', '#5887FF', 26);
          Sfx.fill();
          Input.rumble(0.3, 0.9, 220);
        }
      }
    } else if (near) {
      G.prompt = 'hydrant';
      if (Input.pressed(BTN.CROSS)) {
        G.fill = { h: near, p: Math.max(G.tank, MASH_STEP) };
        t.locked = true;
        Sfx.mash(G.fill.p);
      }
    }

    const a = world.arrival;
    G.warnCd -= dt;
    if (U.dist(t.x, t.y, a.x, a.y) < a.r) {
      if (G.tank >= 1) startQTE();
      else if (G.warnCd <= 0) {
        FX.pop(t.x, t.y - 56, 'SIN AGUA · CARGÁ EN UN HIDRANTE', '#F59E0B', 20);
        Sfx.bad();
        G.warnCd = 2.2;
      }
    }
  }

  // --------------------------------------------------- secuencia final

  function startQTE() {
    const seq = [];
    for (let i = 0; i < QTE_LEN; i++) {
      let b;
      do { b = U.randi(0, 3); } while (i > 0 && b === seq[i - 1]);
      seq.push(b);
    }
    G.qte = { seq, i: 0, wrongT: 0 };
    G.truck.locked = true;
    Sfx.alarm();
    Input.rumble(0.5, 0.5, 200);
    setState('qte');
    buildQTE();
  }

  function updateQTE(dt) {
    const q = G.qte;
    q.wrongT = Math.max(0, q.wrongT - dt);
    const b = Input.anyFace();
    if (b >= 0) {
      if (b === q.seq[q.i]) {
        q.i++;
        Sfx.good(q.i);
        Input.rumble(0.2, 0.5, 90);
        spray(26);
      } else {
        G.mistakes++;
        G.time -= 1;
        q.wrongT = 0.4;
        cam.shake = 12;
        G.flash = 0.3; G.flashColor = '220,38,38';
        FX.pop(G.truck.x, G.truck.y - 50, '−1s', '#FF3C38', 30);
        Sfx.bad();
        Input.rumble(0.9, 0.6, 220);
        for (const p of world.incident.points) {
          for (let i = 0; i < 6; i++) FX.emit({ x: p.x, y: p.y, vx: U.rand(-160, 160), vy: U.rand(-160, 160), life: 0.6, size: U.rand(8, 16), color: '242,112,60', drag: 2 });
        }
      }
      refreshQTE();
    }
    world.incident.fire = Math.max(0, (QTE_LEN - q.i) / QTE_LEN + q.wrongT * 0.35);
    if (q.i >= QTE_LEN) finish(true);
  }

  function spray(n) {
    const t = G.truck, inc = world.incident;
    const tx = inc.cx + U.rand(-80, 80), ty = inc.cy + U.rand(-80, 80);
    for (let i = 0; i < n; i++) {
      const k = U.rand(1.6, 2.4);
      FX.emit({ x: t.x, y: t.y, vx: (tx - t.x) * k + U.rand(-50, 50), vy: (ty - t.y) * k + U.rand(-50, 50), life: U.rand(0.35, 0.55), size: U.rand(5, 10), color: '150,190,255', a: 0.9, drag: 1.2 });
    }
    for (let i = 0; i < 8; i++) {
      FX.emit({ x: tx, y: ty, vx: U.rand(-30, 60), vy: U.rand(-60, 20), life: 1.6, size: 24, grow: 40, add: false, color: '190,200,215', a: 0.25, drag: 0.6 });
    }
  }

  // ------------------------------------------------------------- final

  function finish(win) {
    if (G.result) return;
    G.result = win ? 'win' : 'lose';
    G.truck.locked = true;
    if (win) {
      world.incident.fire = 0;
      G.slow = 0.9;
      G.flash = 0.4; G.flashColor = '243,245,247';
      Sfx.win();
      Input.rumble(0.6, 1, 500);
      const inc = world.incident;
      for (let i = 0; i < 60; i++) {
        FX.emit({ x: inc.cx + U.rand(-150, 150), y: inc.cy + U.rand(-150, 150), vx: U.rand(-30, 90), vy: U.rand(-90, 10), life: U.rand(1.5, 2.6), size: U.rand(20, 40), grow: 30, add: false, color: '200,210,225', a: 0.3, drag: 0.4 });
      }
    } else {
      G.time = 0;
      G.flash = 0.6; G.flashColor = '220,38,38';
      cam.shake = 18;
      Sfx.lose();
      Input.rumble(1, 1, 700);
    }
    const timeLeft = Math.max(0, G.time);
    if (win) {
      G.score = Math.max(0, Math.round(1000 + timeLeft * 150 + G.rescued * 400 + (G.mistakes === 0 ? 500 : 0) - G.crashes * 100));
      G.rank = G.score >= 4200 ? 'S' : G.score >= 3300 ? 'A' : G.score >= 2400 ? 'B' : 'C';
    } else {
      G.score = G.rescued * 100 + (G.tank >= 1 ? 200 : 0);
      G.rank = 'F';
    }
    G.newBest = G.score > best;
    if (G.newBest) {
      best = G.score;
      try { localStorage.setItem('faro-best', String(best)); } catch (e) { /* sin storage */ }
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
      ? `${world.incident.type} · ${world.incident.street}`
      : 'El fuego se propagó. Cada segundo cuenta.';
    const rank = $('res-rank');
    rank.textContent = G.rank;
    rank.className = 'rank rank-' + G.rank;
    $('res-time').textContent = win ? `${Math.max(0, G.time).toFixed(1)} s` : '0.0 s';
    $('res-civ').textContent = `${G.rescued} / ${world.civilians.length}`;
    $('res-crash').textContent = String(G.crashes);
    $('res-mist').textContent = G.qte ? String(G.mistakes) : '—';
    $('res-score').textContent = G.score.toLocaleString('es-AR');
    $('res-best').textContent = G.newBest ? '★ NUEVO RÉCORD' : `Récord: ${best.toLocaleString('es-AR')}`;
    $('res-best').classList.toggle('new', !!G.newBest);
    setState('result');
  }

  // ------------------------------------------------------------- mundo

  function updateWorld(dt) {
    for (const c of world.cars) updateCar(c, dt);

    const inc = world.incident;
    if (inc.fire > 0.02) {
      for (const p of inc.points) {
        if (Math.random() < 14 * dt * inc.fire) {
          FX.emit({ x: p.x + U.rand(-20, 20), y: p.y + U.rand(-20, 20), vx: U.rand(-20, 60), vy: U.rand(-80, -20), life: U.rand(0.8, 1.6), size: U.rand(2, 4), color: '255,170,80', drag: 0.4 });
        }
        if (Math.random() < 3.5 * dt * inc.fire) {
          FX.emit({ x: p.x, y: p.y, vx: U.rand(20, 70), vy: U.rand(-60, -20), life: U.rand(2.5, 4), size: U.rand(30, 50), grow: 34, add: false, color: '16,18,22', a: 0.55, drag: 0.2 });
        }
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
    let blockedStatic = pointBlocked(world, ax, ay, 16);
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

  // ------------------------------------------------------------ cámara

  function updateCamera(dt) {
    let tx, ty, tz;
    if (!G) {
      tx = CFG.W / 2 + Math.cos(T * 0.07) * CFG.W * 0.32;
      ty = CFG.H / 2 + Math.sin(T * 0.11) * CFG.H * 0.28;
      tz = 0.85;
    } else {
      const t = G.truck;
      const sp = Math.hypot(t.vx, t.vy) / 560;
      tx = t.x + t.vx * 0.38; ty = t.y + t.vy * 0.38;
      tz = 1.05 - sp * 0.14;
      if (state === 'brief') tz = 1.3;
      if (state === 'qte' || (state === 'end' && G.result === 'win') || (state === 'result' && G.result === 'win')) {
        tx = (t.x + world.incident.cx) / 2; ty = (t.y + world.incident.cy) / 2; tz = 1.12;
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
    if (G) { G.flash = Math.max(0, G.flash - rawDt * 1.6); }

    switch (state) {
      case 'title':
        updateWorld(dt);
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
        updateTruck(dt);
        updateTasks(dt);
        updateWorld(dt);
        if (G.time <= 0) finish(false);
        break;

      case 'qte':
        G.time -= dt;
        updateTruck(dt);
        updateQTE(dt);
        updateWorld(dt);
        if (state === 'qte' && G.time <= 0) finish(false);
        break;

      case 'end':
        updateTruck(dt);
        updateWorld(dt);
        if (stateT > 1.7) showResult();
        break;

      case 'result':
        updateWorld(dt);
        if (stateT > 0.4) {
          if (Input.pressed(BTN.CROSS)) startRun();
          else if (Input.pressed(BTN.CIRCLE)) toTitle();
        }
        break;
    }

    // tic-tac cuando queda poco
    if (G && (state === 'play' || state === 'qte') && G.time < 5) {
      const step = Math.floor(G.time * 2);
      if (step !== lastTick) { lastTick = step; Sfx.tick(); }
    }

    updateCamera(rawDt);
    const sp = G ? Math.min(1, Math.hypot(G.truck.vx, G.truck.vy) / 560) : 0;
    Sfx.update(rawDt, sp, !!G && state !== 'result' && state !== 'title');
    Sfx.setMusic(musicLevel());
  }

  // -1 silencio · 0 ambiente · 1 partida · 2 tensión
  function musicLevel() {
    if (state === 'title' || state === 'brief') return 0;
    if (state === 'end') return -1;
    if (state === 'result') return stateT > 1.2 ? 0 : -1;
    if (state === 'qte' || G.time < 8) return 2;
    return 1;
  }

  function flashGo() {
    const el = $('go');
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  // --------------------------------------------------------------- HUD

  const hud = {};
  function cacheHud() {
    ['mute', 'hud-timer', 'hud-obj', 'hud-obj-text', 'hud-speed', 'hud-tank-fill', 'hud-tank-pct', 'hud-tank', 'hud-dist', 'prompt', 'prompt-ring', 'prompt-text', 'prompt-key', 'hud-device', 'title-device', 'minimap', 'qte-fire']
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
    const box = $('qte-seq');
    box.innerHTML = '';
    G.qte.seq.forEach((b) => {
      const d = document.createElement('div');
      d.className = 'qte-slot';
      d.innerHTML = glyphSVG(b) + `<span class="key">${KEY_LABEL[b]}</span>`;
      box.appendChild(d);
    });
    refreshQTE();
  }
  function refreshQTE() {
    const q = G.qte, slots = $('qte-seq').children;
    for (let i = 0; i < slots.length; i++) {
      slots[i].className = 'qte-slot' + (i < q.i ? ' done' : i === q.i ? ' current' : '') + (i === q.i && q.wrongT > 0 ? ' wrong' : '');
    }
    const box = $('qte');
    if (q.wrongT > 0) { box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); }
  }

  function updateHUD() {
    const kb = Input.device === 'keyboard';
    document.body.classList.toggle('kb', kb);
    const pad = Input.padLabel();
    const devText = pad ? `${pad} CONECTADO` : 'TECLADO · conectá tu mando PS4 y tocá un botón';
    setText(hud['title-device'], devText);
    setText(hud['hud-device'], pad ? `${pad}` : 'TECLADO');
    hud['title-device'].classList.toggle('live', !!pad);
    setText(hud.mute, !Sfx.running ? 'CLIC O TECLA PARA ACTIVAR SONIDO' : Sfx.muted ? 'SONIDO: OFF (M)' : 'SONIDO: ON (M)');

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

    let obj = '', objClass = 'objective';
    if (state === 'qte') { obj = '¡SECUENCIA DE ATAQUE!'; objClass += ' fire'; }
    else if (state === 'end' || state === 'result') { obj = G.result === 'win' ? 'INCENDIO CONTROLADO' : 'TIEMPO AGOTADO'; objClass += G.result === 'win' ? ' ok' : ' fire'; }
    else if (G.fill) { obj = kb ? '¡MACHACÁ ESPACIO!' : '¡MACHACÁ ✕!'; objClass += ' water'; }
    else if (G.tank < 1) { obj = 'CARGÁ AGUA EN UN HIDRANTE'; objClass += ' water'; }
    else { obj = 'DIRIGITE AL INCIDENTE'; objClass += ' fire'; }
    setText(hud['hud-obj-text'], obj);
    setClass(hud['hud-obj'], objClass);

    const tg = state === 'play' ? Render.target(world, G) : null;
    setText(hud['hud-dist'], tg ? `${Math.round(tg.d / 8)} m` : '');

    const showPrompt = state === 'play' && (G.prompt === 'hydrant' || G.prompt === 'mash');
    hud.prompt.classList.toggle('hidden', !showPrompt);
    if (showPrompt) {
      const p = G.fill ? G.fill.p : 0;
      hud['prompt-ring'].style.strokeDashoffset = String(163.4 * (1 - p));
      setText(hud['prompt-text'], G.fill ? '¡MACHACÁ!' : 'CARGAR AGUA');
      hud.prompt.classList.toggle('mashing', !!G.fill);
      setText(hud['prompt-key'], kb ? 'ESPACIO' : G.fill ? '○ cancelar' : '');
    }

    if (state === 'qte' && G.qte) {
      hud['qte-fire'].style.width = Math.round(world.incident.fire * 100) + '%';
    }
    Render.minimap(hud.minimap, world, G, T);
  }

  function renderBest() {
    $('title-best').textContent = best > 0 ? `RÉCORD · ${best.toLocaleString('es-AR')}` : '';
  }

  // --------------------------------------------------------------- loop

  let last = performance.now();
  function loop(now) {
    const rawDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    T += rawDt;
    Input.poll();

    if (Input.pressed(BTN.OPTIONS) && (state === 'play' || state === 'qte' || state === 'brief')) togglePause();
    else if (paused) {
      if (Input.pressed(BTN.CROSS)) togglePause();
      else if (Input.pressed(BTN.CIRCLE)) toTitle();
    }

    if (!paused) {
      let dt = rawDt;
      if (G && G.hitstop > 0) { G.hitstop -= rawDt; dt = 0; }
      if (G && G.slow > 0) { G.slow -= rawDt; dt *= 0.35; }
      update(dt, rawDt);
    }
    Render.frame(world, G, cam, T, state);
    updateHUD();
    Input.endFrame();
    requestAnimationFrame(loop);
  }

  addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') Sfx.toggleMute();
  });

  cacheHud();
  renderBest();
  setState('title');

  // ?debug=play | hydrant | qte → atajos para probar escenas
  const dbg = new URLSearchParams(location.search).get('debug');
  if (dbg) {
    startRun();
    stateT = 10;
    const t = G.truck;
    if (dbg === 'hydrant') { const h = world.hydrants[0]; t.x = h.zx; t.y = h.zy; }
    if (dbg === 'qte') { G.tank = 1; t.x = world.arrival.x; t.y = world.arrival.y; }
    if (dbg === 'lose') G.time = 0.3;
    cam.x = t.x; cam.y = t.y;
  }
  requestAnimationFrame(loop);
})();
