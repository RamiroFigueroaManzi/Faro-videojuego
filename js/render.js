// Render: mundo nocturno + capa de luz (haces que cortan la oscuridad),
// niebla, rayos de luz y motas flotantes al estilo Hollow Knight.

const FX = {
  parts: [],
  pops: [],
  emit(p) {
    if (this.parts.length > 1100) return;
    this.parts.push(Object.assign({ vx: 0, vy: 0, drag: 0, grow: 0, life: 1, size: 4, add: true, color: '255,170,90', a: 1 }, p, { max: p.life || 1 }));
  },
  pop(x, y, text, color, size = 26) { this.pops.push({ x, y, text, color, size, life: 1.4, max: 1.4 }); },
  update(dt) {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.size += p.grow * dt;
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const q = this.pops[i];
      q.life -= dt; q.y -= 36 * dt;
      if (q.life <= 0) this.pops.splice(i, 1);
    }
  },
  clear() { this.parts.length = 0; this.pops.length = 0; },
};

const Render = (() => {
  let cv, ctx, lcv, lctx, vig, fogA, fogB, patA, patB;
  const view = { w: 1, h: 1, dpr: 1, base: 1, s: 1, ox: 0, oy: 0 };
  const sprites = {};
  const motes = [];

  function soft(color) {
    if (sprites[color]) return sprites[color];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${color},1)`);
    gr.addColorStop(0.3, `rgba(${color},0.6)`);
    gr.addColorStop(0.65, `rgba(${color},0.18)`);
    gr.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return (sprites[color] = c);
  }

  function makeFog(size, n, alpha) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    for (let i = 0; i < n; i++) {
      const x = Math.random() * size, y = Math.random() * size, r = U.rand(size * 0.08, size * 0.28);
      const col = Math.random() < 0.7 ? '151,161,175' : '200,212,232';
      const a = alpha * U.rand(0.4, 1);
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, `rgba(${col},${a})`);
        gr.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = gr;
        g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill();
      }
    }
    return c;
  }

  function makeVignette() {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(view.w / 2)); c.height = Math.max(1, Math.round(view.h / 2));
    const g = c.getContext('2d');
    const r = Math.hypot(c.width, c.height) / 2;
    const gr = g.createRadialGradient(c.width / 2, c.height / 2, r * 0.35, c.width / 2, c.height / 2, r);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.82)');
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function init(canvas) {
    cv = canvas;
    ctx = cv.getContext('2d');
    lcv = document.createElement('canvas');
    lctx = lcv.getContext('2d');
    fogA = makeFog(768, 22, 0.16);
    fogB = makeFog(1024, 16, 0.2);
    patA = ctx.createPattern(fogA, 'repeat');
    patB = ctx.createPattern(fogB, 'repeat');
    for (let i = 0; i < 70; i++) {
      motes.push({ x: Math.random(), y: Math.random(), d: U.rand(0.3, 1.4), r: U.rand(0.8, 2.4), ph: Math.random() * 6.28, vy: U.rand(5, 16) });
    }
    resize();
    addEventListener('resize', resize);
  }

  function resize() {
    view.dpr = Math.min(2, devicePixelRatio || 1);
    view.w = innerWidth; view.h = innerHeight;
    cv.width = Math.round(view.w * view.dpr);
    cv.height = Math.round(view.h * view.dpr);
    lcv.width = Math.ceil(view.w / 2);
    lcv.height = Math.ceil(view.h / 2);
    view.base = Math.min(view.w / 1500, view.h / 860);
    vig = makeVignette();
  }

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
  }

  function spr(g, color, x, y, r, a) {
    if (a <= 0.003) return;
    g.globalAlpha = Math.min(1, a);
    g.drawImage(soft(color), x - r, y - r, r * 2, r * 2);
  }

  function fireLevel(w) {
    let t = 0;
    for (const p of w.incident.points) if (p.active && p.hp > 0) t += p.hp;
    return t / 4;
  }

  // ---------------------------------------------------------------- mundo

  function drawSkids(w, vis) {
    if (!w.skids || !w.skids.length) return;
    ctx.strokeStyle = 'rgba(58,52,43,0.55)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const k of w.skids) {
      if (!vis(k[0], k[1], 20)) continue;
      ctx.moveTo(k[0], k[1]); ctx.lineTo(k[2], k[3]);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // Fantasma del récord: silueta pálida y translúcida.
  function drawGhost(G, T) {
    const g = G && G.ghostPos;
    if (!g) return;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.save(); ctx.rotate(g.a);
    ctx.globalAlpha = 0.3 + 0.08 * Math.sin(T * 5);
    ctx.fillStyle = '#8FB8F0';
    rr(ctx, -38, -17, 76, 34, 7); ctx.fill();
    ctx.globalAlpha = 0.7; ctx.strokeStyle = '#C8DAFF'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 0.85;
    ctx.font = '600 13px Oswald'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#C8DAFF'; ctx.shadowColor = '#5887FF'; ctx.shadowBlur = 10;
    ctx.fillText('RÉCORD · ' + (g.name || '???'), 0, -44);
    ctx.restore();
  }

  function drawReticle(G, T) {
    const a = G && G.atk;
    if (!a || a.phase !== 'aim') return;
    const t = G.truck, fx = Math.cos(t.a), fy = Math.sin(t.a);
    const nx = t.x + fx * 20, ny = t.y + fy * 20;
    ctx.save();
    if (!a.spraying) {
      ctx.setLineDash([6, 10]); ctx.strokeStyle = 'rgba(143,184,240,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(a.rx, a.ry); ctx.stroke(); ctx.setLineDash([]);
    }
    const pulse = 1 + Math.sin(T * 8) * 0.06;
    ctx.translate(a.rx, a.ry);
    ctx.shadowColor = '#5887FF'; ctx.shadowBlur = 14;
    ctx.strokeStyle = a.spraying ? '#DCE6FF' : '#8FB8F0'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 58 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2.5;
    for (let k = 0; k < 4; k++) {
      const an = k * Math.PI / 2 + T * 0.8;
      ctx.beginPath(); ctx.moveTo(Math.cos(an) * 40, Math.sin(an) * 40); ctx.lineTo(Math.cos(an) * 72, Math.sin(an) * 72); ctx.stroke();
    }
    ctx.fillStyle = '#DCE6FF'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawGround(w, vis, T) {
    const { W, H, R } = { ...CFG };
    ctx.fillStyle = '#080A0E';
    ctx.fillRect(0, 0, W, H);

    // Líneas centrales y sendas peatonales
    ctx.strokeStyle = 'rgba(151,161,175,0.11)';
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 30]);
    for (const s of w.segs) {
      ctx.beginPath();
      if (s.h) { ctx.moveTo(s.a + 30, s.c); ctx.lineTo(s.b - 30, s.c); }
      else { ctx.moveTo(s.c, s.a + 30); ctx.lineTo(s.c, s.b - 30); }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(243,245,247,0.05)';
    for (const s of w.segs) {
      for (let k = -76; k <= 68; k += 18) {
        if (s.h) { ctx.fillRect(s.a + 6, s.c + k, 22, 9); ctx.fillRect(s.b - 28, s.c + k, 22, 9); }
        else { ctx.fillRect(s.c + k, s.a + 6, 9, 22); ctx.fillRect(s.c + k, s.b - 28, 9, 22); }
      }
    }

    // Veredas
    for (const b of w.blocks) {
      if (!vis(b.x + b.w / 2, b.y + b.h / 2, b.w)) continue;
      ctx.fillStyle = '#0D1015';
      rr(ctx, b.x, b.y, b.w, b.h, 12); ctx.fill();
      ctx.strokeStyle = '#191E26'; ctx.lineWidth = 2; ctx.stroke();
      if (b.type === 'park') {
        ctx.fillStyle = '#0A100F';
        rr(ctx, b.x + 10, b.y + 10, b.w - 20, b.h - 20, 10); ctx.fill();
        ctx.strokeStyle = '#121A18'; ctx.lineWidth = 18; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.x + 30, b.y + 30); ctx.lineTo(b.x + b.w - 30, b.y + b.h - 30);
        ctx.moveTo(b.x + b.w - 30, b.y + 30); ctx.lineTo(b.x + 30, b.y + b.h - 30);
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
    }

    // Sombras de edificios
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    for (const b of w.blocks) {
      if (!b.parts.length || !vis(b.x + b.w / 2, b.y + b.h / 2, b.w)) continue;
      for (const p of b.parts) ctx.fillRect(p.x + p.ht * 0.55, p.y + p.ht, p.w, p.h);
    }
    // Techos
    for (const b of w.blocks) {
      if (!b.parts.length || !vis(b.x + b.w / 2, b.y + b.h / 2, b.w)) continue;
      for (const p of b.parts) {
        ctx.fillStyle = b.type === 'station' ? '#1A1311' : (b.type === 'incident' || b.burning) ? '#140D0B' : p.shade;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeStyle = '#232A35'; ctx.lineWidth = 1.5;
        ctx.strokeRect(p.x + 0.75, p.y + 0.75, p.w - 1.5, p.h - 1.5);
        ctx.fillStyle = 'rgba(243,245,247,0.045)';
        ctx.fillRect(p.x, p.y, p.w, 3); ctx.fillRect(p.x, p.y, 3, p.h);
      }
      for (const d of b.details) {
        if (d.t === 'tank') {
          ctx.fillStyle = '#1A1F27'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#2A323F'; ctx.lineWidth = 2; ctx.stroke();
          ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 0.55, 0, Math.PI * 2); ctx.stroke();
        } else if (d.t === 'vent') {
          ctx.fillStyle = '#0B0E12'; ctx.fillRect(d.x, d.y, d.w, d.h);
          ctx.strokeStyle = '#232A35'; ctx.lineWidth = 1;
          for (let k = 4; k < d.w; k += 6) { ctx.beginPath(); ctx.moveTo(d.x + k, d.y + 2); ctx.lineTo(d.x + k, d.y + d.h - 2); ctx.stroke(); }
        } else if (d.t === 'sky') {
          ctx.fillStyle = 'rgba(151,161,175,0.08)'; ctx.fillRect(d.x, d.y, d.w, d.h);
          ctx.strokeStyle = 'rgba(151,161,175,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(d.x, d.y, d.w, d.h);
        } else {
          ctx.fillStyle = '#1B212B'; ctx.fillRect(d.x, d.y, d.w, d.h);
          ctx.strokeStyle = '#2A323F'; ctx.lineWidth = 1.5; ctx.strokeRect(d.x, d.y, d.w, d.h);
        }
      }
      if (b.type === 'station') drawStationRoof(b, T);
      if (b.type === 'incident' || b.burning) drawIncidentRoof(b, w, T);
    }
  }

  function drawStationRoof(b, T) {
    const s = b.solid;
    ctx.save();
    ctx.fillStyle = 'rgba(242,112,60,0.28)';
    ctx.font = '64px Monoton';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('FARO', s.x + s.w / 2, s.y + s.h / 2 + 30);
    ctx.strokeStyle = 'rgba(242,112,60,0.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(s.x + s.w / 2, s.y + s.h / 2 - 50, 44, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(242,169,62,0.55)';
    ctx.fillRect(s.x + 40, s.y - 2, 130, 8);
    ctx.restore();
  }

  function drawIncidentRoof(b, w, T) {
    const s = b.solid;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.moveTo(s.x + ((k * 53) % s.w), s.y);
      ctx.lineTo(s.x + ((k * 97 + 40) % s.w), s.y + s.h);
      ctx.stroke();
    }
    for (const p of w.incident.points) {
      if (!p.active || p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.55, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawZones(w, G, T) {
    const needWater = G && G.tank < 1;
    if (needWater) {
      for (const h of w.hydrants) {
        ctx.fillStyle = 'rgba(59,130,246,0.07)';
        ctx.beginPath(); ctx.arc(h.zx, h.zy, h.zr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(88,135,255,0.6)'; ctx.lineWidth = 3;
        ctx.setLineDash([14, 12]); ctx.lineDashOffset = -T * 30;
        ctx.beginPath(); ctx.arc(h.zx, h.zy, h.zr, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (G) {
      const a = w.arrival, pulse = 1 + Math.sin(T * 5) * 0.05;
      ctx.fillStyle = needWater ? 'rgba(151,161,175,0.05)' : 'rgba(220,38,38,0.08)';
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = needWater ? 'rgba(151,161,175,0.35)' : 'rgba(242,112,60,0.75)';
      ctx.lineWidth = 3; ctx.setLineDash([18, 12]); ctx.lineDashOffset = T * 24;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawObjects(w, G, T, vis) {
    for (const o of w.oils) {
      if (!vis(o.x, o.y, 60)) continue;
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rot);
      ctx.fillStyle = 'rgba(14,16,24,0.95)';
      ctx.beginPath(); ctx.ellipse(0, 0, o.r, o.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createLinearGradient(-o.r, 0, o.r, 0);
      g.addColorStop(0, 'rgba(88,135,255,0.12)'); g.addColorStop(0.5, 'rgba(160,90,200,0.12)'); g.addColorStop(1, 'rgba(242,169,62,0.1)');
      ctx.strokeStyle = g; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, o.r * 0.8, o.r * 0.52, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    for (const r of w.rubble) {
      if (!vis(r.x, r.y, 40)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.arc(r.x + 5, r.y + 7, 28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#23272E'; ctx.strokeStyle = '#3A342B'; ctx.lineWidth = 2;
      ctx.beginPath();
      r.pts.forEach(([x, y], i) => (i ? ctx.lineTo(r.x + x, r.y + y) : ctx.moveTo(r.x + x, r.y + y)));
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#30353D';
      for (const [x, y, s] of r.rocks) { ctx.beginPath(); ctx.arc(r.x + x, r.y + y, s, 0, Math.PI * 2); ctx.fill(); }
    }
    for (const b of w.wrecks) {
      if (!vis(b.x, b.y, 60)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(b.x + 5, b.y + 7, b.w, b.h);
      ctx.fillStyle = '#15110F'; rr(ctx, b.x, b.y, b.w, b.h, 7); ctx.fill();
      ctx.strokeStyle = b.burning ? 'rgba(242,112,60,0.45)' : '#3A2A20'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#070606';
      if (b.horiz) { ctx.fillRect(b.x + 14, b.y + 6, 12, b.h - 12); ctx.fillRect(b.x + b.w - 24, b.y + 6, 10, b.h - 12); }
      else { ctx.fillRect(b.x + 6, b.y + 14, b.w - 12, 12); ctx.fillRect(b.x + 6, b.y + b.h - 24, b.w - 12, 10); }
    }
    for (const c of w.cones) {
      if (!vis(c.x, c.y, 20)) continue;
      ctx.fillStyle = '#F97316'; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(243,245,247,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 0.5, 0, Math.PI * 2); ctx.stroke();
    }
    for (const h of w.hydrants) {
      if (!vis(h.x, h.y, 20)) continue;
      ctx.fillStyle = '#1E3A8A'; ctx.beginPath(); ctx.arc(h.x, h.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#93C5FD'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#93C5FD'; ctx.beginPath(); ctx.arc(h.x, h.y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    for (const f of w.fountains) {
      if (!vis(f.x, f.y, 50)) continue;
      ctx.fillStyle = '#161B22'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2A323F'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#0B1A2A'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r - 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(200,212,232,0.18)'; ctx.lineWidth = 1.5;
      const k = (((T * 0.6) % 1) + 1) % 1;
      ctx.beginPath(); ctx.arc(f.x, f.y, 4 + k * (f.r - 14), 0, Math.PI * 2); ctx.stroke();
    }
    for (const l of w.lamps) {
      if (!vis(l.x, l.y, 20)) continue;
      ctx.fillStyle = '#232A35'; ctx.beginPath(); ctx.arc(l.x, l.y, 5, 0, Math.PI * 2); ctx.fill();
    }
    for (const c of w.civilians) {
      if (c.picked || !vis(c.x, c.y, 30)) continue;
      drawCivilian(c, T);
    }
  }

  // Figura pálida de máscara blanca, guiño a la estética de la referencia.
  function drawCivilian(c, T) {
    const bob = Math.sin(T * 6 + c.ph) * 1.5;
    ctx.save(); ctx.translate(c.x, c.y + bob);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.ellipse(3, 12 - bob, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1B2029';
    ctx.beginPath(); ctx.moveTo(-9, 12); ctx.quadraticCurveTo(0, -6, 9, 12); ctx.closePath(); ctx.fill();
    const wave = Math.sin(T * 10 + c.ph) * 0.6;
    ctx.strokeStyle = '#EFE8DC'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(6 + Math.cos(-1.2 + wave) * 11, Math.sin(-1.2 + wave) * 11); ctx.stroke();
    ctx.fillStyle = '#EFE8DC';
    ctx.beginPath(); ctx.ellipse(0, -6, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#05070A';
    ctx.beginPath(); ctx.ellipse(-2.6, -6, 1.8, 2.6, 0, 0, Math.PI * 2); ctx.ellipse(2.6, -6, 1.8, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawEvents(w, T, vis) {
    for (const c of w.collapses) {
      const r = c.rect;
      if (!vis(r.x + r.w / 2, r.y + r.h / 2, 150)) continue;
      if (c.state === 'warn') {
        // grietas que avanzan sobre la calle
        const k = 1 - c.t / 1.2;
        ctx.strokeStyle = 'rgba(220,38,38,' + (0.35 + 0.35 * Math.sin(T * 20)) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const sx = r.x + r.w * (0.2 + 0.2 * i), sy = r.y + r.h * (0.2 + 0.2 * ((i * 3) % 4));
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.sin(i * 2.3) * 60 * k, sy + Math.cos(i * 1.7) * 60 * k);
        }
        ctx.stroke();
      }
      if (c.state !== 'done') continue;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(r.x + 6, r.y + 8, r.w, r.h);
      ctx.fillStyle = '#23272E';
      rr(ctx, r.x - 6, r.y - 6, r.w + 12, r.h + 12, 18); ctx.fill();
      for (const [u, v, sz, rot] of c.chunks) {
        ctx.save();
        ctx.translate(r.x + u * r.w, r.y + v * r.h); ctx.rotate(rot);
        ctx.fillStyle = sz > 14 ? '#2E333B' : '#1B1F25';
        ctx.fillRect(-sz / 2, -sz / 2, sz, sz * 0.7);
        ctx.strokeStyle = '#3A342B'; ctx.lineWidth = 1.5; ctx.strokeRect(-sz / 2, -sz / 2, sz, sz * 0.7);
        ctx.restore();
      }
      // cinta de peligro
      ctx.strokeStyle = 'rgba(245,158,11,0.7)'; ctx.lineWidth = 4; ctx.setLineDash([12, 10]);
      ctx.strokeRect(r.x - 10, r.y - 10, r.w + 20, r.h + 20); ctx.setLineDash([]);
    }

    for (const b of w.wrecks) {
      if (!b.unstable || b.exploded) continue;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (!vis(cx, cy, 80)) continue;
      const armed = b.armed;
      const a = armed ? 0.6 + 0.4 * Math.sin(T * 40) : 0.45 + 0.2 * Math.sin(T * 4);
      ctx.save();
      ctx.translate(cx, cy - 42);
      ctx.fillStyle = armed ? 'rgba(255,60,56,' + a + ')' : 'rgba(245,158,11,' + a + ')';
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(12, 9); ctx.lineTo(-12, 9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#05070A'; ctx.fillRect(-1.5, -5, 3, 8); ctx.fillRect(-1.5, 5, 3, 2.5);
      ctx.restore();
      if (armed) {
        ctx.strokeStyle = 'rgba(255,60,56,' + (0.5 + 0.5 * Math.sin(T * 40)) + ')'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, 60 + (0.75 - b.fuse) * 120, 0, Math.PI * 2); ctx.stroke();
      }
    }

    const tr = w.trapped;
    if (tr && tr.state === 'active' && vis(tr.x, tr.y, 80)) {
      drawCivilian(tr, T);
      const k = Math.max(0, tr.t / 9);
      ctx.strokeStyle = 'rgba(35,42,53,0.9)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(tr.x, tr.y, 34, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = k > 0.35 ? '#EFE8DC' : '#FF3C38'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(tr.x, tr.y, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.font = '700 15px Oswald'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#EFE8DC'; ctx.fillText('¡AYUDA! ' + Math.ceil(tr.t) + 's', tr.x, tr.y - 50);
    }
  }

  function drawCars(w, vis) {
    for (const c of w.cars) {
      if (!vis(c.x, c.y, 50)) continue;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(Math.atan2(c.fy, c.fx));
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; rr(ctx, -26, -13, 58, 32, 8); ctx.fill();
      ctx.fillStyle = c.color; rr(ctx, -30, -15, 60, 30, 8); ctx.fill();
      ctx.strokeStyle = '#2E3642'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#0A0D12'; ctx.fillRect(4, -11, 10, 22); ctx.fillRect(-20, -11, 8, 22);
      ctx.fillStyle = '#F3F5F7'; ctx.fillRect(27, -12, 3, 6); ctx.fillRect(27, 6, 3, 6);
      ctx.fillStyle = c.stopT > 0.2 ? '#FF3C38' : '#7A1E1E'; ctx.fillRect(-30, -12, 3, 6); ctx.fillRect(-30, 6, 3, 6);
      ctx.restore();
    }
  }

  function drawTruck(t, T, active) {
    ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.a);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; rr(ctx, -34, -14, 76, 38, 8); ctx.fill();
    // carrocería
    ctx.fillStyle = '#B8232C'; rr(ctx, -38, -17, 76, 34, 7); ctx.fill();
    ctx.strokeStyle = '#5A1216'; ctx.lineWidth = 1.5; ctx.stroke();
    // franja lateral
    ctx.fillStyle = '#F2A93E'; ctx.fillRect(-36, -16, 52, 2.5); ctx.fillRect(-36, 13.5, 52, 2.5);
    // cabina
    ctx.fillStyle = '#8E1A21'; rr(ctx, 16, -16, 22, 32, 5); ctx.fill();
    ctx.fillStyle = '#131A24'; ctx.fillRect(31, -13, 5, 26);
    ctx.fillStyle = 'rgba(243,245,247,0.35)'; ctx.fillRect(33, -11, 1.5, 9);
    // escalera
    ctx.strokeStyle = '#C9CED6'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-34, -7); ctx.lineTo(12, -7); ctx.moveTo(-34, 7); ctx.lineTo(12, 7); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath();
    for (let x = -30; x <= 10; x += 7) { ctx.moveTo(x, -7); ctx.lineTo(x, 7); }
    ctx.stroke();
    // barra de luces
    const ph = Math.floor(T * 7) % 2 === 0;
    ctx.fillStyle = active ? (ph ? '#FF3C38' : '#5A1216') : '#3A1216'; ctx.fillRect(18, -13, 5, 12);
    ctx.fillStyle = active ? (ph ? '#1A2A55' : '#5887FF') : '#1A2A55'; ctx.fillRect(18, 1, 5, 12);
    // faros
    ctx.fillStyle = '#FFF4DE'; ctx.fillRect(37, -14, 2.5, 6); ctx.fillRect(37, 8, 2.5, 6);
    ctx.restore();
  }

  function drawCanopies(w, vis, T) {
    for (const t of w.trees) {
      if (!vis(t.x, t.y, 50)) continue;
      const sway = Math.sin(T * 0.8 + t.ph) * 1.5;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.arc(t.x + 10, t.y + 14, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0B1311';
      ctx.beginPath(); ctx.arc(t.x + sway, t.y, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#101A17';
      ctx.beginPath(); ctx.arc(t.x - t.r * 0.25 + sway, t.y - t.r * 0.25, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(151,161,175,0.12)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(t.x + sway, t.y, t.r, Math.PI * 1.0, Math.PI * 1.6); ctx.stroke();
    }
  }

  // ------------------------------------------------------------- luz

  function drawLighting(w, G, t, T, s, ox, oy, vis, active) {
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.globalAlpha = 1;
    lctx.clearRect(0, 0, lcv.width, lcv.height);
    lctx.fillStyle = 'rgba(3,4,8,0.8)';
    lctx.fillRect(0, 0, lcv.width, lcv.height);
    lctx.globalCompositeOperation = 'destination-out';
    lctx.setTransform(s / 2, 0, 0, s / 2, ox / 2, oy / 2);
    const B = '0,0,0';
    const punch = (x, y, r, a) => { if (vis(x, y, r)) spr(lctx, B, x, y, r, a); };

    for (const l of w.lamps) punch(l.x, l.y, 230, 0.62 + Math.sin(T * 3 + l.ph) * 0.03);
    for (const f of w.fires) punch(f.x, f.y, 210 * (0.92 + 0.08 * Math.sin(T * 13 + f.ph)), 0.8);
    const fire = fireLevel(w);
    for (const p of w.incident.points) if (p.active && p.hp > 0) punch(p.x, p.y, 150 + 170 * p.hp, 0.9);
    if (fire > 0.02) punch(w.incident.cx, w.incident.cy, 620 * (0.94 + 0.06 * Math.sin(T * 9)) * Math.min(1.3, 0.4 + 0.6 * fire), 0.95);
    if (G && G.tank < 1) for (const h of w.hydrants) punch(h.zx, h.zy, 130, 0.5);
    for (const c of w.civilians) if (!c.picked) punch(c.x, c.y, 80, 0.45);
    if (w.trapped && w.trapped.state === 'active') punch(w.trapped.x, w.trapped.y, 150, 0.7);
    for (const b of w.wrecks) if (b.armed) punch(b.x + b.w / 2, b.y + b.h / 2, 220, 0.6);
    for (const c of w.cars) {
      punch(c.x, c.y, 70, 0.35);
      wedge(c.x + c.fx * 28, c.y + c.fy * 28, Math.atan2(c.fy, c.fx), 190, 0.35, 0.6, vis);
    }
    if (G) punch(w.arrival.x, w.arrival.y, 170, 0.35);
    punch(w.garage.x, w.garage.y, 170, 0.6);

    const fx = Math.cos(t.a), fy = Math.sin(t.a);
    punch(t.x, t.y, 440, 0.4);
    punch(t.x, t.y, 140, 0.7);
    wedge(t.x + fx * 36, t.y + fy * 36, t.a, 420, 0.42, active ? 0.95 : 0.5, vis);
    if (active) {
      const ph = Math.floor(T * 7) % 2 === 0;
      const sx = t.x + fx * 20 + (ph ? fy * 10 : -fy * 10), sy = t.y + fy * 20 + (ph ? -fx * 10 : fx * 10);
      punch(sx, sy, 200, 0.4);
    }
    lctx.globalAlpha = 1;
  }

  function wedge(x, y, a, len, spread, alpha, vis) {
    if (!vis(x, y, len)) return;
    lctx.save();
    lctx.beginPath(); lctx.moveTo(x, y); lctx.arc(x, y, len, a - spread, a + spread); lctx.closePath(); lctx.clip();
    spr(lctx, '0,0,0', x, y, len, alpha);
    lctx.restore();
  }

  function drawGlows(w, G, t, T, vis, active) {
    ctx.globalCompositeOperation = 'lighter';
    const glow = (c, x, y, r, a) => { if (vis(x, y, r)) spr(ctx, c, x, y, r, a); };
    for (const l of w.lamps) glow('200,215,235', l.x, l.y, 190, 0.1);
    for (const f of w.fires) {
      const fl = 0.85 + 0.15 * Math.sin(T * 17 + f.ph);
      glow('242,112,60', f.x, f.y, 190, 0.32 * fl);
    }
    const fire = fireLevel(w);
    if (fire > 0.02) glow('220,38,38', w.incident.cx, w.incident.cy, 640, 0.22 * Math.min(1, fire));
    for (const p of w.incident.points) {
      if (p.active && p.hp > 0) glow('242,112,60', p.x, p.y, 150 + 160 * p.hp, (0.26 + 0.05 * Math.sin(T * 11 + p.ph)) * p.hp);
    }
    if (G && G.tank < 1) for (const h of w.hydrants) glow('59,130,246', h.zx, h.zy, 110, 0.28 + 0.08 * Math.sin(T * 4));
    for (const c of w.civilians) if (!c.picked) glow('243,245,247', c.x, c.y - 4, 46, 0.22 + 0.08 * Math.sin(T * 5 + c.ph));
    if (w.trapped && w.trapped.state === 'active') glow('243,245,247', w.trapped.x, w.trapped.y, 110, 0.25 + 0.15 * Math.sin(T * 8));
    for (const b of w.wrecks) if (b.armed) glow('255,60,56', b.x + b.w / 2, b.y + b.h / 2, 200, 0.3 + 0.25 * Math.sin(T * 40));
    glow('242,169,62', w.garage.x, w.garage.y + 10, 150, 0.28);
    if (active) {
      const fx = Math.cos(t.a), fy = Math.sin(t.a);
      const ph = Math.floor(T * 7) % 2 === 0;
      glow(ph ? '255,60,56' : '88,135,255', t.x + fx * 20, t.y + fy * 20, 190, 0.34);
      glow('255,226,180', t.x + fx * 60, t.y + fy * 60, 90, 0.12);
    }
    // llamas
    const flame = (x, y, r, k, a) => {
      for (let i = 0; i < 4; i++) {
        const ox = Math.sin(T * 7 + k + i * 1.7) * r * 0.35, oy = Math.cos(T * 5.3 + k + i * 2.1) * r * 0.35;
        const sz = r * (0.55 + 0.25 * Math.sin(T * 11 + k * 3 + i));
        glow('230,80,40', x + ox, y + oy, sz * 1.4, 0.4 * a);
        glow('255,150,80', x + ox * 0.6, y + oy * 0.6, sz * 0.55, 0.22 * a);
      }
    };
    for (const f of w.fires) if (vis(f.x, f.y, 60)) flame(f.x, f.y, f.r, f.ph, 1);
    for (const p of w.incident.points) if (p.active && p.hp > 0 && vis(p.x, p.y, 90)) flame(p.x, p.y, p.r * (0.3 + 0.7 * p.hp), p.ph, Math.min(1, p.hp * 1.4));
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawParticles(vis) {
    ctx.globalCompositeOperation = 'source-over';
    for (const p of FX.parts) {
      if (p.add || !vis(p.x, p.y, p.size)) continue;
      spr(ctx, p.color, p.x, p.y, p.size, p.a * (p.life / p.max));
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const p of FX.parts) {
      if (!p.add || !vis(p.x, p.y, p.size)) continue;
      spr(ctx, p.color, p.x, p.y, p.size, p.a * (p.life / p.max));
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function drawPops() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const q of FX.pops) {
      const k = q.life / q.max;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `700 ${q.size}px Oswald`;
      ctx.shadowColor = q.color; ctx.shadowBlur = 16;
      ctx.fillStyle = q.color;
      ctx.fillText(q.text, q.x, q.y);
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }

  function target(w, G) {
    if (!G) return null;
    if (G.tank < 1) {
      let best = null, bd = Infinity;
      for (const h of w.hydrants) {
        const d = U.dist(h.zx, h.zy, G.truck.x, G.truck.y);
        if (d < bd) { bd = d; best = h; }
      }
      return best ? { x: best.zx, y: best.zy, label: 'HIDRANTE', color: '#5887FF', d: bd } : null;
    }
    return { x: w.arrival.x, y: w.arrival.y, label: 'INCIDENTE', color: '#F2703C', d: U.dist(w.arrival.x, w.arrival.y, G.truck.x, G.truck.y) };
  }

  function drawMarker(tg, T, s, ox, oy) {
    const sx = tg.x * s + ox, sy = tg.y * s + oy;
    const { w, h } = view, m = 70;
    ctx.save();
    ctx.fillStyle = tg.color; ctx.strokeStyle = tg.color;
    ctx.shadowColor = tg.color; ctx.shadowBlur = 14;
    ctx.font = '600 13px Oswald'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (sx > m && sx < w - m && sy > m && sy < h - m) {
      const by = sy - 70 * s - Math.abs(Math.sin(T * 4)) * 10;
      ctx.beginPath(); ctx.moveTo(sx - 11, by - 8); ctx.lineTo(sx, by + 4); ctx.lineTo(sx + 11, by - 8);
      ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.fillText(tg.label, sx, by - 22);
    } else {
      const cx = w / 2, cy = h / 2, a = Math.atan2(sy - cy, sx - cx);
      const ca = Math.cos(a), sa = Math.sin(a);
      const k = Math.min((w / 2 - 56) / Math.abs(ca || 1e-6), (h / 2 - 56) / Math.abs(sa || 1e-6));
      const px = cx + ca * k, py = cy + sa * k;
      ctx.translate(px, py);
      ctx.save(); ctx.rotate(a);
      const pulse = 1 + Math.sin(T * 6) * 0.12;
      ctx.beginPath(); ctx.moveTo(18 * pulse, 0); ctx.lineTo(-10, -13); ctx.lineTo(-4, 0); ctx.lineTo(-10, 13); ctx.closePath(); ctx.fill();
      ctx.restore();
      const label = `${tg.label} · ${Math.round(tg.d / 8)} m`;
      if (ca > 0.5) { ctx.textAlign = 'right'; ctx.fillText(label, -28, 0); }
      else if (ca < -0.5) { ctx.textAlign = 'left'; ctx.fillText(label, 28, 0); }
      else ctx.fillText(label, 0, sa > 0 ? -30 : 30);
    }
    ctx.restore();
  }

  // --------------------------------------------------------- pantalla

  function screenFX(cam, T, G, state, s) {
    const { w, h } = view;
    // niebla en capas con parallax
    ctx.globalCompositeOperation = 'screen';
    const fog = (pat, size, ox, oy, a) => {
      ctx.save(); ctx.globalAlpha = a;
      const mx = ((ox % size) + size) % size, my = ((oy % size) + size) % size;
      ctx.translate(-mx, -my); ctx.fillStyle = pat; ctx.fillRect(0, 0, w + size, h + size);
      ctx.restore();
    };
    fog(patA, 768, cam.x * s * 0.8 + T * 14, cam.y * s * 0.8 + T * 4, 0.55);
    fog(patB, 1024, cam.x * s * 1.25 + T * 26, cam.y * s * 1.25 - T * 6, 0.4);

    // rayos de luz diagonales
    for (let k = 0; k < 3; k++) {
      const xb = (k * 0.34 + 0.08) * w + Math.sin(T * 0.23 + k * 2) * 60;
      const a = 0.05 + 0.025 * Math.sin(T * 0.5 + k);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgba(210,222,240,${a})`);
      g.addColorStop(1, 'rgba(210,222,240,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(xb, -10); ctx.lineTo(xb + 70 + k * 20, -10);
      ctx.lineTo(xb + 380 + k * 30, h + 10); ctx.lineTo(xb + 220, h + 10);
      ctx.closePath(); ctx.fill();
    }

    // motas flotantes
    ctx.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      const x = (((m.x * w - cam.x * s * m.d * 0.35) % w) + w) % w;
      const y = (((m.y * h - cam.y * s * m.d * 0.35 - T * m.vy) % h) + h) % h;
      spr(ctx, '220,228,240', x + Math.sin(T * 0.7 + m.ph) * 8, y, m.r * 3.2, 0.22 + 0.18 * Math.sin(T * 1.4 + m.ph));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    ctx.drawImage(vig, 0, 0, w, h);

    if (G) {
      if ((state === 'play' || state === 'qte') && G.time < 6) {
        const a = (0.5 + 0.5 * Math.sin(T * 9)) * 0.35 * (1 - G.time / 6);
        const r = Math.hypot(w, h) / 2;
        const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
        g.addColorStop(0, 'rgba(220,38,38,0)'); g.addColorStop(1, `rgba(220,38,38,${a})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
      if (G.flash > 0) {
        ctx.fillStyle = `rgba(${G.flashColor},${Math.min(0.5, G.flash)})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
  }

  // ------------------------------------------------------------ frame

  function frame(w, G, cam, T, state) {
    const { w: vw, h: vh, dpr } = view;
    const s = view.base * cam.zoom;
    const ox = vw / 2 - cam.x * s + cam.sx, oy = vh / 2 - cam.y * s + cam.sy;
    view.s = s; view.ox = ox; view.oy = oy;
    const truck = G ? G.truck : w.parked;
    const active = !!G && state !== 'title';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = COL.night; ctx.fillRect(0, 0, vw, vh);

    const x0 = -ox / s, y0 = -oy / s, x1 = x0 + vw / s, y1 = y0 + vh / s;
    const vis = (x, y, m) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;

    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    drawGround(w, vis, T);
    drawSkids(w, vis);
    drawZones(w, G, T);
    drawObjects(w, G, T, vis);
    drawEvents(w, T, vis);
    drawCars(w, vis);
    drawGhost(G, T);
    drawTruck(truck, T, active);
    drawCanopies(w, vis, T);

    drawLighting(w, G, truck, T, s, ox, oy, vis, active);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(lcv, 0, 0, vw, vh);

    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    drawGlows(w, G, truck, T, vis, active);
    drawParticles(vis);
    drawReticle(G, T);
    drawPops();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (G && G.boostVis > 0.01) speedLines(G.boostVis, T);
    screenFX(cam, T, G, state, s);
    if (state === 'play') {
      const tg = target(w, G);
      if (tg) drawMarker(tg, T, s, ox, oy);
      const tr = w.trapped;
      if (tr && tr.state === 'active') {
        drawMarker({ x: tr.x, y: tr.y, label: 'CIVIL ATRAPADO', color: '#EFE8DC', d: U.dist(tr.x, tr.y, G.truck.x, G.truck.y) }, T, s, ox, oy);
      }
    }
  }

  function speedLines(k, T) {
    const { w, h } = view, cx = w / 2, cy = h / 2, R = Math.hypot(w, h) / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(242,169,62,' + (0.22 * k) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 46; i++) {
      const a = i * 2.39996 + Math.floor(T * 30) * 0.7;
      const r0 = R * (0.55 + ((i * 37 + Math.floor(T * 40)) % 30) / 100);
      const r1 = r0 + R * 0.18 * k;
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------- radar

  function minimap(mc, w, G, T) {
    const g = mc.getContext('2d');
    const k = mc.width / w.W;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, mc.width, mc.height);
    g.fillStyle = 'rgba(5,7,10,0.6)'; g.fillRect(0, 0, mc.width, mc.height);
    g.setTransform(k, 0, 0, k, 0, 0);
    for (const b of w.blocks) {
      g.fillStyle = b.type === 'park' ? '#0F1A17' : b.type === 'station' ? '#3A2218' : (b.type === 'incident' || b.burning) ? '#3A1414' : '#1A2029';
      g.fillRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
    }
    const dot = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r / k, 0, Math.PI * 2); g.fill(); };
    for (const c of w.cars) dot(c.x, c.y, 1.6, '#4A5462');
    for (const c of w.civilians) if (!c.picked) dot(c.x, c.y, 2.2, '#EFE8DC');
    if (w.trapped && w.trapped.state === 'active') dot(w.trapped.x, w.trapped.y, 3 + 1.5 * Math.sin(T * 10), '#FFFFFF');
    for (const c of w.collapses) {
      if (c.state !== 'done') continue;
      g.fillStyle = '#F59E0B';
      g.fillRect(c.rect.x, c.rect.y, c.rect.w, c.rect.h);
    }
    if (G && G.tank < 1) for (const h of w.hydrants) dot(h.zx, h.zy, 3 + Math.sin(T * 5), '#5887FF');
    const p = 1 + 0.35 * Math.sin(T * 6);
    dot(w.incident.cx, w.incident.cy, 6 * p, 'rgba(220,38,38,0.45)');
    dot(w.incident.cx, w.incident.cy, 3.2, '#DC2626');
    if (G && G.ghostPos) dot(G.ghostPos.x, G.ghostPos.y, 2.6, 'rgba(143,184,240,0.8)');
    const t = G ? G.truck : w.parked;
    g.save(); g.translate(t.x, t.y); g.rotate(t.a); g.scale(1 / k, 1 / k);
    g.fillStyle = '#F2703C'; g.shadowColor = '#F2703C'; g.shadowBlur = 8;
    g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -4.5); g.lineTo(-3, 0); g.lineTo(-5, 4.5); g.closePath(); g.fill();
    g.restore();
  }

  return { init, frame, minimap, view, target, fireLevel };
})();
