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
  // Secuenciador propio: Re menor, 124 BPM, 4 compases (Dm · B♭ · Gm · A).
  // Nivel -1 = silencio, 0 = ambiente (título), 1 = partida, 2 = tensión.

  const SD = 60 / 124 / 4;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const PROG = [
    { bass: 38, chord: [62, 65, 69] },
    { bass: 34, chord: [58, 62, 65] },
    { bass: 31, chord: [55, 58, 62] },
    { bass: 33, chord: [57, 61, 64] },
  ];
  const ARP = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 3, 2, 1, 0, 1];
  const mus = { level: -1, step: 0, next: 0, bus: null, echo: null };

  function musicSetup() {
    mus.bus = ctx.createGain();
    mus.bus.gain.value = 0;
    mus.bus.connect(master);
    const d = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
    d.delayTime.value = SD * 3; fb.gain.value = 0.35; lp.type = 'lowpass'; lp.frequency.value = 1800;
    d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(mus.bus);
    mus.echo = d;
  }

  function voice(dest, freq, t, dur, type, vol, att = 0.008, cutoff = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = o;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = cutoff;
      o.connect(f); out = f;
    }
    out.connect(g);
    for (const d of [].concat(dest)) g.connect(d);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function drum(kind, t) {
    if (kind === 'kick') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g); g.connect(mus.bus);
      o.start(t); o.stop(t + 0.3);
      return;
    }
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = getNoise();
    const hat = kind === 'hat';
    f.type = hat ? 'highpass' : 'bandpass';
    f.frequency.value = hat ? 7000 : 1800;
    const dur = hat ? 0.05 : 0.16;
    g.gain.setValueAtTime(hat ? 0.09 : 0.14, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(mus.bus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  function scheduleStep(step, t) {
    const lvl = mus.level;
    const bar = PROG[Math.floor(step / 16) % 4];
    const s = step % 16;

    if (s === 0) {
      const dur = SD * 16 + 0.3;
      for (const m of bar.chord) {
        voice(mus.bus, mtof(m), t, dur, 'triangle', 0.035, 0.5, 1400);
        voice(mus.bus, mtof(m) * 1.004, t, dur, 'sawtooth', 0.012, 0.6, 900);
      }
      voice(mus.bus, mtof(bar.bass), t, dur, 'sine', lvl >= 1 ? 0.05 : 0.08, 0.4);
    }

    const arpEvery = lvl >= 2 ? 1 : 2;
    if (lvl === 0 ? s % 4 === 0 : s % arpEvery === 0) {
      const tones = bar.chord.concat(bar.chord[0] + 12);
      const m = tones[ARP[s]] + (lvl >= 2 && s % 4 === 3 ? 12 : 0);
      voice([mus.bus, mus.echo], mtof(m + 12), t, SD * 1.6, 'triangle', lvl === 0 ? 0.035 : 0.045, 0.005, 3000);
    }

    if (lvl >= 1) {
      if (s % 2 === 0) {
        const m = bar.bass + 12 + (s % 8 === 6 ? 12 : 0);
        voice(mus.bus, mtof(m), t, SD * 1.8, 'sawtooth', 0.075, 0.005, lvl >= 2 ? 700 : 480);
      }
      if (s % 4 === 0) drum('kick', t);
      if (s % 4 === 2) drum('hat', t);
      if (lvl >= 2) {
        if (s % 2 === 1) drum('hat', t);
        if (s === 4 || s === 12) drum('snare', t);
      }
    }
  }

  function setMusic(level) {
    if (!ctx || !mus.bus) return;
    if (level === mus.level) return;
    const t = ctx.currentTime;
    if (mus.level < 0 && level >= 0) { mus.step = 0; mus.next = t + 0.05; }
    mus.level = level;
    const vol = level < 0 ? 0 : level === 0 ? 1.4 : 1;
    mus.bus.gain.cancelScheduledValues(t);
    mus.bus.gain.setTargetAtTime(vol, t, level < 0 ? 0.25 : 0.4);
  }

  function musicTick() {
    if (mus.level < 0 || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (mus.next < now - 0.2) mus.next = now + 0.05;
    while (mus.next < now + 0.15) {
      scheduleStep(mus.step, mus.next);
      mus.next += SD;
      mus.step = (mus.step + 1) % 64;
    }
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
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.4, 'triangle', 0.24, null, i * 0.09)),
    lose: () => { tone(420, 1.0, 'sawtooth', 0.22, 70); noise(0.8, 0.35, 400); },
    honk: () => { tone(330, 0.16, 'square', 0.09); tone(415, 0.16, 'square', 0.08); },
  };
})();
