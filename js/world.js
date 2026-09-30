// Generación procedural de la ciudad y colisiones.

const CFG = { B: 360, R: 180, COLS: 5, ROWS: 3, TIME: 30 };
CFG.CELL = CFG.B + CFG.R;
CFG.W = CFG.COLS * CFG.CELL + CFG.R;
CFG.H = CFG.ROWS * CFG.CELL + CFG.R;

const roadX = (i) => i * CFG.CELL + CFG.R / 2;
const roadY = (j) => j * CFG.CELL + CFG.R / 2;
const blockRect = (i, j) => ({ x: i * CFG.CELL + CFG.R, y: j * CFG.CELL + CFG.R, w: CFG.B, h: CFG.B });

const STREETS = ['Av. Colón', 'San Martín', 'Belgrano', 'Rivadavia', 'Sarmiento', 'Mitre', 'Av. Libertador', 'Urquiza', 'Moreno', 'Alsina', 'Lavalle', 'Brown'];
const INCIDENTS = ['INCENDIO ESTRUCTURAL', 'INCENDIO EN DEPÓSITO', 'INCENDIO EN VIVIENDA', 'INCENDIO EN TALLER'];
// Zonas fijas: mismo mapa para todos → récords comparables y fantasma.
const MAPS = [
  { seed: 1107, name: 'CENTRO' },
  { seed: 2291, name: 'PUERTO' },
  { seed: 3517, name: 'BARRIO NORTE' },
  { seed: 4783, name: 'PARQUE SUR' },
  { seed: 5903, name: 'VILLA CRESPO' },
];
const SPREAD_AT = [10, 18];

const ROOF_SHADES = ['#12161D', '#151A22', '#0F1319', '#171B21', '#11151B'];

function genWorld(seed) {
  if (seed != null) U.seed(seed);
  const { B, R, COLS, ROWS, CELL, W, H } = CFG;
  const w = {
    W, H, blocks: [], solids: [], circles: [], oils: [], hydrants: [], civilians: [], cars: [],
    lamps: [], fires: [], trees: [], rubble: [], wrecks: [], cones: [], fountains: [], segs: [],
  };

  // Estación (abajo a la izquierda) e incidente (lejos, arriba a la derecha)
  const station = { i: 0, j: 2 };
  const inc = U.pick([{ i: 4, j: 0 }, { i: 3, j: 0 }, { i: 4, j: 1 }]);
  const ib = blockRect(inc.i, inc.j);
  const side = U.pick(['left', 'bottom']);
  w.arrival = side === 'left'
    ? { x: roadX(inc.i), y: ib.y + B / 2, r: 105 }
    : { x: ib.x + B / 2, y: roadY(inc.j + 1), r: 105 };
  w.incident = {
    ...inc, rect: ib, cx: ib.x + B / 2, cy: ib.y + B / 2,
    type: U.pick(INCIDENTS), street: `${U.pick(STREETS)} ${U.randi(100, 2900)}`, fire: 1, points: [],
  };
  const firePts = (r, n, stage) => {
    for (let k = 0; k < n; k++) {
      w.incident.points.push({
        x: r.x + U.rand(80, B - 80), y: r.y + U.rand(80, B - 80), r: U.rand(52, 72),
        ph: U.r() * 6, hp: 1, active: stage === 0, stage,
      });
    }
  };
  firePts(ib, 4, 0);

  const sb = blockRect(station.i, station.j);
  w.start = { x: sb.x + 120, y: roadY(station.j) + 30, a: 0 };
  w.garage = { x: sb.x + 120, y: sb.y + 16 };
  w.parked = { x: w.start.x, y: w.start.y, a: w.start.a, vx: 0, vy: 0, parked: true };

  // Plazas (bloques transitables con árboles) para abrir atajos diagonales
  const candidates = [];
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    if ((i === station.i && j === station.j) || (i === inc.i && j === inc.j)) continue;
    candidates.push({ i, j });
  }
  const parks = U.shuffle(candidates).slice(0, 2);
  const isPark = (i, j) => parks.some((p) => p.i === i && p.j === j);

  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const r = blockRect(i, j);
    let type = 'building';
    if (i === station.i && j === station.j) type = 'station';
    else if (i === inc.i && j === inc.j) type = 'incident';
    else if (isPark(i, j)) type = 'park';
    const b = { i, j, ...r, type, parts: [], details: [] };
    if (type === 'park') genPark(b, w);
    else {
      const inset = 14;
      const s = { x: r.x + inset, y: r.y + inset, w: r.w - inset * 2, h: r.h - inset * 2, kind: 'building' };
      w.solids.push(s);
      b.solid = s;
      genRoof(b, s);
    }
    w.blocks.push(b);
  }

  // Propagación: hasta 2 edificios vecinos se prenden a los SPREAD_AT segundos
  const neigh = w.blocks.filter((b) => b.type === 'building' && Math.abs(b.i - inc.i) + Math.abs(b.j - inc.j) === 1);
  w.incident.spread = U.shuffle(neigh).slice(0, 2);
  w.incident.spread.forEach((b, k) => firePts(b, 3, k + 1));

  // Muros del borde del mapa
  const T = 200;
  w.solids.push({ x: -T, y: -T, w: W + 2 * T, h: T, kind: 'wall' });
  w.solids.push({ x: -T, y: H, w: W + 2 * T, h: T, kind: 'wall' });
  w.solids.push({ x: -T, y: 0, w: T, h: H, kind: 'wall' });
  w.solids.push({ x: W, y: 0, w: T, h: H, kind: 'wall' });

  // Faroles en las esquinas
  for (let j = 0; j <= ROWS; j++) for (let i = 0; i <= COLS; i++) {
    const sx = i === 0 ? 1 : i === COLS ? -1 : U.pick([-1, 1]);
    const sy = j === 0 ? 1 : j === ROWS ? -1 : U.pick([-1, 1]);
    w.lamps.push({ x: roadX(i) + sx * 84, y: roadY(j) + sy * 84, ph: U.r() * 6 });
  }

  // Tramos de calle entre intersecciones
  for (let j = 0; j <= ROWS; j++) for (let i = 0; i < COLS; i++) w.segs.push({ h: 1, a: i * CELL + R, b: i * CELL + R + B, c: roadY(j) });
  for (let i = 0; i <= COLS; i++) for (let j = 0; j < ROWS; j++) w.segs.push({ h: 0, a: j * CELL + R, b: j * CELL + R + B, c: roadX(i) });
  const pt = (s, t, o) => (s.h ? { x: U.lerp(s.a, s.b, t), y: s.c + o } : { x: s.c + o, y: U.lerp(s.a, s.b, t) });

  const taken = [{ x: w.start.x, y: w.start.y, r: 260 }, { x: w.arrival.x, y: w.arrival.y, r: 190 }];
  const free = (p, r) => taken.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > q.r + r);

  // Hidrantes (2): obligatorio cargar agua en uno
  for (const s of U.shuffle(w.segs.slice())) {
    if (w.hydrants.length >= 2) break;
    const sd = U.pick([-1, 1]), t = U.rand(0.3, 0.7);
    const p = pt(s, t, sd * 80), z = pt(s, t, sd * 38);
    if (!free(p, 160) || U.dist(p.x, p.y, w.start.x, w.start.y) < 550) continue;
    w.hydrants.push({ x: p.x, y: p.y, zx: z.x, zy: z.y, zr: 80 });
    w.circles.push({ x: p.x, y: p.y, r: 10, kind: 'hydrant' });
    taken.push({ x: z.x, y: z.y, r: 130 });
  }

  // Civiles para rescatar (+2s cada uno)
  for (const s of U.shuffle(w.segs.slice())) {
    if (w.civilians.length >= 4) break;
    const p = pt(s, U.rand(0.2, 0.8), U.pick([-1, 1]) * 66);
    if (!free(p, 70)) continue;
    w.civilians.push({ x: p.x, y: p.y, picked: false, ph: U.r() * 6 });
    taken.push({ x: p.x, y: p.y, r: 70 });
  }

  // Obstáculos: uno por tramo, bloqueando un carril
  for (const s of U.shuffle(w.segs.slice())) {
    if (U.r() < 0.3) continue;
    const sd = U.pick([-1, 1]), t = U.rand(0.25, 0.75);
    const p = pt(s, t, sd * 38);
    if (!free(p, 70)) continue;
    taken.push({ x: p.x, y: p.y, r: 90 });
    const roll = U.r();
    if (roll < 0.3) {
      const pts = [];
      const n = U.randi(7, 10);
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; const rr = U.rand(18, 30); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      const rocks = [];
      for (let k = 0; k < 4; k++) rocks.push([U.rand(-30, 30), U.rand(-30, 30), U.rand(3, 7)]);
      w.rubble.push({ x: p.x, y: p.y, pts, rocks });
      w.circles.push({ x: p.x, y: p.y, r: 26, kind: 'rubble' });
    } else if (roll < 0.55) {
      const ww = s.h ? 66 : 34, hh = s.h ? 34 : 66;
      const box = { x: p.x - ww / 2, y: p.y - hh / 2, w: ww, h: hh, kind: 'wreck', burning: U.r() < 0.75, horiz: !!s.h };
      w.wrecks.push(box);
      w.solids.push(box);
      if (box.burning) w.fires.push({ x: p.x, y: p.y, r: 30, ph: U.r() * 6 });
    } else if (roll < 0.78) {
      for (let k = 0; k < 3; k++) {
        const c = pt(s, t, sd * (16 + k * 24));
        const cone = { x: c.x, y: c.y, r: 9, kind: 'cone' };
        w.cones.push(cone);
        w.circles.push(cone);
      }
    } else {
      w.oils.push({ x: p.x, y: p.y, r: 50, rot: U.r() * 3 });
    }
  }

  // Tránsito civil
  for (let tries = 0; w.cars.length < 5 && tries < 60; tries++) {
    const horiz = U.r() < 0.55;
    const idx = horiz ? U.randi(0, ROWS) : U.randi(0, COLS);
    const c = horiz ? roadY(idx) : roadX(idx);
    const len = horiz ? W : H;
    const car = {
      h: horiz, c, dir: U.pick([-1, 1]), pos: U.rand(120, len - 120), speed: U.rand(140, 210), v: 0,
      stopT: 0, honkCd: 0, x: 0, y: 0, fx: 0, fy: 0,
      color: U.pick(['#1E2530', '#2A2320', '#1C2226', '#262A33']),
    };
    carPlace(car);
    if (U.dist(car.x, car.y, w.start.x, w.start.y) < 500) continue;
    if (w.cars.some((o) => U.dist(o.x, o.y, car.x, car.y) < 200)) continue;
    w.cars.push(car);
  }

  U.unseed();
  return w;
}

// Carril por la derecha: la posición lateral depende de la dirección.
function carPlace(car) {
  if (car.h) {
    car.fx = car.dir; car.fy = 0;
    car.x = car.pos; car.y = car.c + car.dir * 44;
  } else {
    car.fx = 0; car.fy = car.dir;
    car.x = car.c - car.dir * 44; car.y = car.pos;
  }
}

function genRoof(b, s) {
  const vertical = U.r() < 0.5;
  const n = U.randi(1, 3);
  const cuts = n === 1 ? [0, 1] : n === 2 ? [0, U.rand(0.35, 0.65), 1] : [0, U.rand(0.25, 0.4), U.rand(0.6, 0.75), 1];
  for (let k = 0; k < cuts.length - 1; k++) {
    const a = cuts[k], c = cuts[k + 1];
    const part = vertical
      ? { x: s.x + s.w * a, y: s.y, w: s.w * (c - a), h: s.h }
      : { x: s.x, y: s.y + s.h * a, w: s.w, h: s.h * (c - a) };
    part.shade = U.pick(ROOF_SHADES);
    part.ht = U.rand(14, 34);
    b.parts.push(part);
    const nd = U.randi(1, 3);
    for (let d = 0; d < nd; d++) {
      if (part.w < 70 || part.h < 70) break;
      const kind = U.pick(['box', 'box', 'tank', 'vent', 'sky']);
      const dx = part.x + U.rand(20, part.w - 60), dy = part.y + U.rand(20, part.h - 60);
      if (kind === 'tank') b.details.push({ t: 'tank', x: dx + 18, y: dy + 18, r: U.rand(12, 18) });
      else if (kind === 'vent') b.details.push({ t: 'vent', x: dx, y: dy, w: 34, h: 14 });
      else if (kind === 'sky') b.details.push({ t: 'sky', x: dx, y: dy, w: 30, h: 30 });
      else b.details.push({ t: 'box', x: dx, y: dy, w: U.rand(22, 44), h: U.rand(18, 34) });
    }
  }
}

function genPark(b, w) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  w.fountains.push({ x: cx, y: cy, r: 38 });
  w.circles.push({ x: cx, y: cy, r: 38, kind: 'fountain' });
  let tries = 0;
  const local = [];
  while (local.length < 7 && tries++ < 200) {
    const x = b.x + U.rand(40, b.w - 40), y = b.y + U.rand(40, b.h - 40);
    if (U.dist(x, y, cx, cy) < 110) continue;
    if (local.some((t) => U.dist(t.x, t.y, x, y) < 95)) continue;
    const tree = { x, y, r: U.rand(26, 38), ph: U.r() * 6 };
    local.push(tree);
    w.trees.push(tree);
    w.circles.push({ x, y, r: 16, kind: 'tree' });
  }
}

function circleVsAABB(px, py, r, b) {
  const cx = U.clamp(px, b.x, b.x + b.w), cy = U.clamp(py, b.y, b.y + b.h);
  const dx = px - cx, dy = py - cy, d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 1e-4) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, depth: r - d };
  }
  const l = px - b.x, rr = b.x + b.w - px, t = py - b.y, bt = b.y + b.h - py;
  const m = Math.min(l, rr, t, bt);
  if (m === l) return { nx: -1, ny: 0, depth: l + r };
  if (m === rr) return { nx: 1, ny: 0, depth: rr + r };
  if (m === t) return { nx: 0, ny: -1, depth: t + r };
  return { nx: 0, ny: 1, depth: bt + r };
}

function pointBlocked(w, x, y, r) {
  for (const s of w.solids) if (circleVsAABB(x, y, r, s)) return true;
  for (const c of w.circles) if (U.dist(x, y, c.x, c.y) < r + c.r) return true;
  return false;
}
