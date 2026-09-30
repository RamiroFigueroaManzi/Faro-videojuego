// Sonido 100% sintetizado con WebAudio (sin archivos).

const Sfx = (() => {
  let ctx = null, master = null, muted = false, noiseBuf = null;
  let siren = null, engine = null, confirmed = false;
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

  function noise(dur, vol = 0.2, freq = 800, delay = 0, type = 'lowpass') {
    if (!ctx) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
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
  }

  // Sirena "hi-lo" + motor que sube con la velocidad.
  function update(dt, speedNorm, active) {
    if (!ctx || !siren) return;
    const t = ctx.currentTime;
    siren.phase += dt;
    const hi = Math.floor(siren.phase / 0.55) % 2 === 0;
    siren.o.frequency.setTargetAtTime(hi ? 880 : 660, t, 0.015);
    siren.g.gain.setTargetAtTime(active ? 0.07 : 0, t, 0.15);
    engine.o.frequency.setTargetAtTime(65 + speedNorm * 130, t, 0.05);
    engine.f.frequency.setTargetAtTime(700 + speedNorm * 900, t, 0.05);
    engine.g.gain.setTargetAtTime(active ? 0.06 + speedNorm * 0.08 : 0, t, 0.12);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : VOL;
    return muted;
  }

  return {
    init, update, toggleMute,
    get muted() { return muted; },
    get running() { return !!ctx && ctx.state === 'running'; },
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
