// Sonido 100% sintetizado con WebAudio (sin archivos).

const Sfx = (() => {
  let ctx = null, master = null, muted = false, noiseBuf = null;
  let siren = null, engine = null;
  const VOL = 0.7;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOL;
    master.connect(ctx.destination);
    startLoops();
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
    const so = ctx.createOscillator(), sf = ctx.createBiquadFilter(), sg = ctx.createGain();
    so.type = 'triangle'; sf.type = 'lowpass'; sf.frequency.value = 2400; sg.gain.value = 0;
    so.connect(sf); sf.connect(sg); sg.connect(master); so.start();
    siren = { o: so, g: sg, phase: 0 };

    const eo = ctx.createOscillator(), ef = ctx.createBiquadFilter(), eg = ctx.createGain();
    eo.type = 'sawtooth'; eo.frequency.value = 42; ef.type = 'lowpass'; ef.frequency.value = 240; eg.gain.value = 0;
    eo.connect(ef); ef.connect(eg); eg.connect(master); eo.start();
    engine = { o: eo, g: eg };
  }

  // Sirena "hi-lo" + motor que sube con la velocidad.
  function update(dt, speedNorm, active) {
    if (!ctx || !siren) return;
    const t = ctx.currentTime;
    siren.phase += dt;
    const hi = Math.floor(siren.phase / 0.55) % 2 === 0;
    siren.o.frequency.setTargetAtTime(hi ? 880 : 660, t, 0.015);
    siren.g.gain.setTargetAtTime(active ? 0.03 : 0, t, 0.15);
    engine.o.frequency.setTargetAtTime(38 + speedNorm * 75, t, 0.05);
    engine.g.gain.setTargetAtTime(active ? 0.05 + speedNorm * 0.06 : 0, t, 0.12);
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
    mash: (p) => tone(280 + p * 520, 0.06, 'square', 0.05),
    fill: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.1, null, i * 0.07)),
    pickup: () => { tone(880, 0.12, 'triangle', 0.1); tone(1320, 0.2, 'triangle', 0.08, null, 0.08); },
    crash: () => { noise(0.4, 0.45, 700); tone(110, 0.3, 'sawtooth', 0.1, 40); },
    thud: () => noise(0.12, 0.18, 380),
    cone: () => tone(600, 0.08, 'square', 0.04, 300),
    oil: () => noise(0.35, 0.08, 1800, 0, 'bandpass'),
    good: (i) => { tone(392 * Math.pow(2, (i * 2) / 12), 0.14, 'triangle', 0.12); noise(0.25, 0.06, 3200, 0, 'highpass'); },
    bad: () => tone(170, 0.28, 'sawtooth', 0.11, 80),
    count: (n) => tone(n > 0 ? 520 : 1040, n > 0 ? 0.12 : 0.4, 'square', 0.07),
    tick: () => tone(1400, 0.03, 'square', 0.03),
    alarm: () => { tone(740, 0.12, 'square', 0.06); tone(740, 0.12, 'square', 0.06, null, 0.17); },
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.35, 'triangle', 0.1, null, i * 0.09)),
    lose: () => { tone(420, 1.0, 'sawtooth', 0.09, 70); noise(0.8, 0.15, 300); },
    honk: () => { tone(330, 0.16, 'square', 0.035); tone(415, 0.16, 'square', 0.03); },
  };
})();
