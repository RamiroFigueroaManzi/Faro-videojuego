// Sonido 100% sintetizado con WebAudio (sin archivos).

const Sfx = (() => {
  let ctx = null, master = null, muted = false, noiseBuf = null;
  let siren = null, engine = null, water = null, confirmed = false;
  const VOL = 1;

  // Crea el contexto (o lo reanuda). Debe llamarse desde un clic o una tecla:
  // los navegadores no habilitan el audio con los botones del joystick.
  function init() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4;
      comp.attack.value = 0.004; comp.release.value = 0.2;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOL;
      master.connect(comp); comp.connect(ctx.destination);
      startLoops();
      musicSetup();
    }
    if (ctx.state !== 'running') ctx.resume().then(confirm).catch(() => {});
    else confirm();
  }

  // Bip corto la primera vez que el audio queda activo, para saber que funciona.
  function confirm() {
    if (confirmed || !ctx || ctx.state !== 'running') return;
    confirmed = true;
    tone(660, 0.1, 'triangle', 0.25);
    tone(990, 0.16, 'triangle', 0.22, null, 0.09);
  }

  function tone(freq, dur, type = 'square', vol = 0.1, slideTo = null, delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function getNoise() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function noise(dur, vol = 0.2, freq = 800, delay = 0, type = 'lowpass') {
    if (!ctx) return;
    getNoise();
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.05);
  }

  function startLoops() {
    // Sirena: diente de sierra filtrado, con armónicos que se oyen en parlantes chicos.
    const so = ctx.createOscillator(), sf = ctx.createBiquadFilter(), sg = ctx.createGain();
    so.type = 'sawtooth'; sf.type = 'lowpass'; sf.frequency.value = 2800; sg.gain.value = 0;
    so.connect(sf); sf.connect(sg); sg.connect(master); so.start();
    siren = { o: so, g: sg, phase: 0 };

    // Motor: fundamental grave + filtro abierto para que suene en notebooks.
    const eo = ctx.createOscillator(), ef = ctx.createBiquadFilter(), eg = ctx.createGain();
    eo.type = 'sawtooth'; eo.frequency.value = 70; ef.type = 'lowpass'; ef.frequency.value = 900; ef.Q.value = 2; eg.gain.value = 0;
    eo.connect(ef); ef.connect(eg); eg.connect(master); eo.start();
    engine = { o: eo, g: eg, f: ef };

    // Chorro de agua: ruido en bucle filtrado, se abre al disparar la manguera.
    const ws = ctx.createBufferSource(), wf = ctx.createBiquadFilter(), wg = ctx.createGain();
    ws.buffer = getNoise(); ws.loop = true;
    wf.type = 'bandpass'; wf.frequency.value = 2400; wf.Q.value = 0.7; wg.gain.value = 0;
    ws.connect(wf); wf.connect(wg); wg.connect(master); ws.start();
    water = { g: wg, on: false };
  }

  // ------------------------------------------------------------- música
  // Atmosférica (estilo Hollow Knight): piano, cuerdas, violonchelo y timbal
  // con reverb. Re menor, 8 compases que se repiten. El pulso se acelera
  // con la tensión. Nivel -1 = silencio, 0 = título, 1 = partida, 2 = tensión.

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const BPM = [80, 92, 108];
  const PROG = [
    { r: 50, tri: [62, 65, 69] }, // Rem
    { r: 46, tri: [58, 62, 65] }, // Si♭
    { r: 53, tri: [60, 65, 69] }, // Fa
    { r: 48, tri: [60, 64, 67] }, // Do
    { r: 50, tri: [62, 65, 69] }, // Rem
    { r: 43, tri: [58, 62, 67] }, // Solm
    { r: 46, tri: [58, 62, 65] }, // Si♭
    { r: 45, tri: [57, 61, 64] }, // La
  ];
  // Melodía: [paso en semicorcheas, nota MIDI, duración en semicorcheas]
  const MEL = [
    [[0, 69, 6], [6, 74, 2], [8, 72, 4], [12, 69, 4]],
    [[0, 70, 6], [6, 69, 2], [8, 65, 8]],
    [[0, 72, 6], [6, 77, 2], [8, 76, 4], [12, 72, 4]],
    [[0, 74, 8], [8, 72, 4], [12, 67, 4]],
    [[0, 69, 6], [6, 74, 2], [8, 77, 4], [12, 76, 4]],
    [[0, 74, 6], [6, 72, 2], [8, 70, 8]],
    [[0, 69, 4], [4, 70, 4], [8, 72, 4], [12, 74, 4]],
    [[0, 73, 12], [12, 76, 4]],
  ];
  const mus = { level: -1, step: 0, next: 0, sd: 60 / BPM[0] / 4, bus: null, dry: null, rev: null, fxDry: null, fxRev: null };

  function makeIR(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  function musicSetup() {
    const ir = makeIR(3.4, 2.4);
    const chain = (dest) => {
      const dry = ctx.createGain(), conv = ctx.createConvolver(), lp = ctx.createBiquadFilter(), wet = ctx.createGain();
      conv.buffer = ir; lp.type = 'lowpass'; lp.frequency.value = 4200; wet.gain.value = 0.85;
      dry.connect(dest); lp.connect(conv); conv.connect(wet); wet.connect(dest);
      return { dry, rev: lp };
    };
    mus.bus = ctx.createGain();
    mus.bus.gain.value = 0;
    mus.bus.connect(master);
    const m = chain(mus.bus);
    mus.dry = m.dry; mus.rev = m.rev;
    // Jingles de victoria/derrota: mismo timbre, pero fuera del bus de música.
    const f = chain(master);
    mus.fxDry = f.dry; mus.fxRev = f.rev;
  }

  function route(node, send, fx) {
    node.connect(fx ? mus.fxDry : mus.dry);
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      node.connect(s); s.connect(fx ? mus.fxRev : mus.rev);
    }
  }

  // Piano suave: triángulo + armónico senoidal, filtro que se cierra con la nota.
  function piano(m, t, vel, dur = 1.8, send = 0.5, fx = false) {
    const f = mtof(m);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
    const lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = 'triangle'; o1.frequency.value = f;
    o2.type = 'sine'; o2.frequency.value = f * 2; o2.detune.value = 4; g2.gain.value = 0.3;
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400 + vel * 9000, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(vel * 0.3, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
    route(g, send, fx);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  // Cuerdas: dos sierras desafinadas con vibrato, ataque y cierre lentos.
  function strings(notes, t, dur, vol, fx = false, cutoff = 1300) {
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5; lg.gain.value = 6;
    lfo.connect(lg);
    const lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(1.4, dur * 0.4));
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.2);
    lp.connect(g);
    route(g, 0.9, fx);
    const oscs = [lfo];
    for (const m of notes) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
        lg.connect(o.detune);
        o.connect(lp); oscs.push(o);
      }
    }
    oscs.forEach((o) => { o.start(t); o.stop(t + dur + 1.3); });
  }

  function cello(m, t, dur, vol) {
    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = mtof(m);
    lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g);
    route(g, 0.3);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function timpani(m, t, vol, fx = false) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(mtof(m) * 1.15, t);
    o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.08);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(g); route(g, 0.45, fx);
    o.start(t); o.stop(t + 1.4);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), ng = ctx.createGain();
    s.buffer = getNoise(); f.type = 'lowpass'; f.frequency.value = 260;
    ng.gain.setValueAtTime(vol * 0.8, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    s.connect(f); f.connect(ng); route(ng, 0.3, fx);
    s.start(t); s.stop(t + 0.3);
  }

  function heartbeat(t, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(75, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); route(g, 0.15);
    o.start(t); o.stop(t + 0.25);
  }

  function scheduleStep(step, t) {
    const lvl = mus.level;
    const sd = mus.sd;
    const bi = Math.floor(step / 16) % PROG.length;
    const bar = PROG[bi];
    const s = step % 16;

    // Cuerdas sostenidas: todo el compás
    if (s === 0) {
      const notes = lvl >= 1 ? bar.tri.concat(bar.tri[2] + 12) : bar.tri;
      strings(notes, t, sd * 16, lvl === 0 ? 0.012 : 0.016);
      if (lvl >= 1) strings([bar.r], t, sd * 16, 0.02, false, 600);
    }

    // Arpegio de piano (corcheas; en tensión, semicorcheas en la segunda mitad)
    const arp = [bar.r, bar.r + 7, bar.tri[0], bar.tri[1], bar.tri[2], bar.tri[1], bar.tri[0], bar.r + 7];
    const every = lvl >= 2 && s >= 8 ? 1 : 2;
    if (s % every === 0) {
      const idx = every === 1 ? s % 8 : s / 2;
      piano(arp[idx], t, lvl === 0 ? 0.05 : 0.06, 1.6, 0.55);
    }

    // Melodía
    for (const [st, m, d] of MEL[bi]) {
      if (st !== s) continue;
      piano(m + 12 * (lvl >= 2 && bi >= 4 ? 1 : 0), t, lvl === 0 ? 0.11 : 0.14, sd * d + 1.2, 0.6);
      if (lvl >= 1) strings([m], t, sd * d, 0.006, false, 2400);
    }

    if (lvl >= 1) {
      // Violonchelo: pulso que empuja
      const every2 = lvl >= 2 ? 1 : 2;
      if (s % every2 === 0) cello(bar.r - 12 + (s % 8 === 4 ? 12 : 0), t, sd * every2 * 0.95, lvl >= 2 ? 0.07 : 0.06);
      if (s === 0) timpani(bar.r - 12, t, 0.32);
      if (lvl >= 2 && s === 8) timpani(bar.r - 12, t, 0.22);
    }
    if (lvl >= 2 && (s % 8 === 0 || s % 8 === 3)) heartbeat(t, s % 8 === 0 ? 0.35 : 0.22);
  }

  function setMusic(level) {
    if (!ctx || !mus.bus) return;
    if (level === mus.level) return;
    const t = ctx.currentTime;
    if (mus.level < 0 && level >= 0) { mus.step = 0; mus.next = t + 0.08; }
    mus.level = level;
    if (level >= 0) mus.sd = 60 / BPM[level] / 4;
    const vol = level < 0 ? 0 : 1;
    mus.bus.gain.cancelScheduledValues(t);
    mus.bus.gain.setTargetAtTime(vol, t, level < 0 ? 0.35 : 0.6);
  }

  function musicTick() {
    if (mus.level < 0 || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (mus.next < now - 0.2) mus.next = now + 0.05;
    while (mus.next < now + 0.2) {
      scheduleStep(mus.step, mus.next);
      mus.next += mus.sd;
      mus.step = (mus.step + 1) % (16 * PROG.length);
    }
  }

  // Jingles con el mismo timbre que la música
  function winJingle() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    [62, 66, 69, 74, 78].forEach((m, i) => piano(m, t + i * 0.13, 0.16, 2.6, 0.7, true));
    strings([62, 66, 69, 74], t + 0.1, 2.4, 0.02, true, 1800);
    timpani(38, t, 0.3, true);
  }
  function loseJingle() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    [69, 65, 62, 57].forEach((m, i) => piano(m, t + i * 0.32, 0.14, 2.4, 0.7, true));
    strings([50, 57, 62], t, 2.6, 0.02, true, 700);
    timpani(38, t, 0.35, true);
  }

  // Sirena "hi-lo" + motor que sube con la velocidad.
  function update(dt, speedNorm, active, boost = false) {
    if (!ctx || !siren) return;
    musicTick();
    const t = ctx.currentTime;
    siren.phase += dt;
    const hi = Math.floor(siren.phase / 0.55) % 2 === 0;
    siren.o.frequency.setTargetAtTime(hi ? 880 : 660, t, 0.015);
    siren.g.gain.setTargetAtTime(active ? 0.008 : 0, t, 0.15);
    engine.o.frequency.setTargetAtTime(65 + speedNorm * 130 + (boost ? 60 : 0), t, 0.05);
    engine.f.frequency.setTargetAtTime(700 + speedNorm * 900 + (boost ? 1200 : 0), t, 0.05);
    engine.g.gain.setTargetAtTime(active ? 0.06 + speedNorm * 0.08 + (boost ? 0.05 : 0) : 0, t, 0.12);
    water.g.gain.setTargetAtTime(water.on ? 0.22 : 0, t, 0.05);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : VOL;
    return muted;
  }

  return {
    init, update, toggleMute, setMusic,
    get muted() { return muted; },
    get running() { return !!ctx && ctx.state === 'running'; },
    spray: (on) => { if (water) water.on = on; },
    fuse: () => { for (let i = 0; i < 5; i++) tone(1320, 0.05, 'triangle', 0.14, null, i * 0.14); },
    boom: () => { noise(1.2, 0.9, 420); noise(0.4, 0.5, 2400); tone(90, 0.8, 'sine', 0.5, 35); },
    rumbleLow: () => { noise(1.6, 0.5, 160); tone(48, 1.4, 'sine', 0.3, 38); },
    radio: () => { noise(0.18, 0.12, 2400, 0, 'bandpass'); tone(1046, 0.09, 'triangle', 0.16, null, 0.12); tone(1318, 0.12, 'triangle', 0.16, null, 0.24); },
    near: (c) => { const f = 700 * Math.pow(2, Math.min(c, 12) / 12); tone(f, 0.14, 'triangle', 0.2, f * 1.5); noise(0.18, 0.15, 5000, 0, 'highpass'); },
    boost: () => { noise(0.5, 0.35, 1200, 0, 'bandpass'); tone(200, 0.45, 'sawtooth', 0.12, 520); },
    comboLost: () => tone(300, 0.25, 'triangle', 0.15, 150),
    gaugeHit: (perfect) => { tone(perfect ? 1175 : 880, 0.12, 'triangle', 0.25); if (perfect) tone(1760, 0.2, 'triangle', 0.18, null, 0.07); },
    gaugeMiss: () => tone(200, 0.18, 'square', 0.14, 120),
    spreadAlarm: () => { for (let i = 0; i < 3; i++) tone(520, 0.16, 'sawtooth', 0.14, 780, i * 0.22); noise(0.9, 0.3, 500); },
    out: () => { noise(0.6, 0.35, 2600, 0, 'highpass'); tone(660, 0.18, 'triangle', 0.2); tone(990, 0.25, 'triangle', 0.18, null, 0.1); },
    letter: () => tone(1200, 0.04, 'square', 0.08),
    ui: () => tone(880, 0.07, 'triangle', 0.18),
    mash: (p) => tone(280 + p * 520, 0.07, 'square', 0.12),
    fill: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.22, null, i * 0.07)),
    pickup: () => { tone(880, 0.12, 'triangle', 0.22); tone(1320, 0.2, 'triangle', 0.2, null, 0.08); },
    crash: () => { noise(0.4, 0.8, 900); tone(120, 0.3, 'sawtooth', 0.25, 50); },
    thud: () => noise(0.14, 0.4, 500),
    cone: () => tone(600, 0.08, 'square', 0.1, 300),
    oil: () => noise(0.35, 0.25, 1800, 0, 'bandpass'),
    good: (i) => { tone(392 * Math.pow(2, (i * 2) / 12), 0.16, 'triangle', 0.28); noise(0.25, 0.15, 3200, 0, 'highpass'); },
    bad: () => tone(170, 0.3, 'sawtooth', 0.25, 80),
    count: (n) => tone(n > 0 ? 520 : 1040, n > 0 ? 0.14 : 0.45, 'square', 0.16),
    tick: () => tone(1400, 0.04, 'square', 0.08),
    alarm: () => { tone(740, 0.14, 'square', 0.15); tone(740, 0.14, 'square', 0.15, null, 0.17); },
    win: () => winJingle(),
    lose: () => loseJingle(),
    honk: () => { tone(330, 0.16, 'square', 0.09); tone(415, 0.16, 'square', 0.08); },
  };
})();
