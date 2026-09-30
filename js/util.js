// Utilidades, paleta FARO y glifos de botones PS4.

// Generador con semilla (mulberry32): el mismo mapa para todos los jugadores de una zona.
let _rng = Math.random;

const U = {
  seed(s) {
    let a = s >>> 0;
    _rng = () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  unseed() { _rng = Math.random; },
  r: () => _rng(),
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a, b) => a + _rng() * (b - a),
  randi: (a, b) => Math.floor(a + _rng() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(_rng() * arr.length)],
  shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(_rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
  angDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  },
  dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
  damp: (k, dt) => 1 - Math.exp(-k * dt),
};

// Paleta tomada de FARO-estetica-videojuego.md
const COL = {
  night: '#05070A',
  panel: '#12161D',
  line: '#232A35',
  mist: '#F3F5F7',
  ash: '#97A1AF',
  ember: '#F2703C',
  emberRed: '#DF2935',
  signal: '#F59E0B',
  orange: '#F97316',
  dispatch: '#3B82F6',
  beamA: '#F2A93E',
  beamB: '#E67828',
  critical: '#DC2626',
  resolved: '#16A34A',
  info: '#2563EB',
};

// Mapeo "standard" de la Gamepad API (DualShock 4 en Chrome/Edge/Firefox)
const BTN = {
  CROSS: 0, CIRCLE: 1, SQUARE: 2, TRIANGLE: 3,
  L1: 4, R1: 5, L2: 6, R2: 7, SHARE: 8, OPTIONS: 9,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
};

const GLYPH_COLOR = { 0: '#8FB8F0', 1: '#F27A7A', 2: '#E39BD0', 3: '#5FD9B4' };
const KEY_LABEL = { 0: 'K', 1: 'L', 2: 'J', 3: 'I' };

function glyphSVG(b) {
  const c = GLYPH_COLOR[b];
  let s = '';
  if (b === 0) s = '<path d="M16 16 L32 32 M32 16 L16 32"/>';
  if (b === 1) s = '<circle cx="24" cy="24" r="9.5"/>';
  if (b === 2) s = '<rect x="15" y="15" width="18" height="18" rx="1.5"/>';
  if (b === 3) s = '<path d="M24 13.5 L34.5 31.5 L13.5 31.5 Z"/>';
  return (
    '<svg viewBox="0 0 48 48" class="glyph" aria-hidden="true">' +
    '<circle cx="24" cy="24" r="22" fill="rgba(18,22,29,.85)" stroke="#232A35" stroke-width="1.5"/>' +
    `<g fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${s}</g></svg>`
  );
}
