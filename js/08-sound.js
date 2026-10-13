
/* ---------------------------------------------------------------
   Sound: one generative placeholder per pose class, played in a
   long reverb (the court is a big glazed room). Group members can
   replace any class with their own labelled recording.
---------------------------------------------------------------- */
const Sound = (() => {
  let ctx = null, bus = null, analyser = null, noiseBuf = null, voice = null;
  const api = { on: false, cls: null, custom: {}, customName: {} };
  function impulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    bus = ctx.createGain(); bus.gain.value = 0.9;
    const dry = ctx.createGain(); dry.gain.value = 0.8;
    const verb = ctx.createConvolver(); verb.buffer = impulse(3.4, 2.4);
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
    bus.connect(dry); bus.connect(verb); verb.connect(wet);
    dry.connect(analyser); wet.connect(analyser); analyser.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const noise = (out, loop = true) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = loop; s.connect(out); return s; };
  const filt = (type, f, q = 1) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const env = (g, t, a, h, r, peak) => { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + a + h); g.gain.exponentialRampToValueAtTime(0.0001, t + a + h + r); };
  function hit(out, t, { type = 'lowpass', f = 900, q = 1, a = 0.004, h = 0.02, r = 0.12, peak = 0.5, pan = 0 } = {}) {
    const g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null, fl = filt(type, f, q);
    const s = noise(fl, false); fl.connect(g);
    if (p) { p.pan.value = pan; g.connect(p); p.connect(out); } else g.connect(out);
    env(g, t, a, h, r, peak); s.start(t, Math.random() * 1.5); s.stop(t + a + h + r + 0.05);
  }
  function tone(out, t, { f = 220, type = 'sine', a = 0.5, h = 1, r = 1.5, peak = 0.05, sweep } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (sweep) o.frequency.exponentialRampToValueAtTime(sweep, t + a + h + r);
    o.connect(g); g.connect(out); env(g, t, a, h, r, peak); o.start(t); o.stop(t + a + h + r + 0.05);
  }
  const PATCH = {
    standing(out) { // footsteps across the hall + distant voices
      const mur = filt('bandpass', 520, 1.4), mg = ctx.createGain(); mg.gain.value = 0.05; const n = noise(mur); mur.connect(mg); mg.connect(out); n.start();
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.31; lg.gain.value = 0.03; lfo.connect(lg); lg.connect(mg.gain); lfo.start();
      return { nodes: [n, lfo], tick: (t) => { hit(out, t, { f: 700, r: 0.1, peak: 0.35, pan: Math.random() * 1.6 - 0.8 }); return 0.7 + Math.random() * 1.1; } };
    },
    walking(out) { let s = 1; return { nodes: [], tick: (t) => { s = -s; hit(out, t, { f: 820, r: 0.11, peak: 0.55, pan: s * 0.35 }); hit(out, t + 0.012, { type: 'bandpass', f: 130, q: 2, r: 0.09, peak: 0.6, pan: s * 0.35 }); return 0.52; } }; },
    seated(out) { // chair creaks and page turns
      return { nodes: [], tick: (t) => {
        if (Math.random() < 0.6) hit(out, t, { type: 'highpass', f: 2400, a: 0.05, h: 0.08, r: 0.22, peak: 0.12, pan: Math.random() - 0.5 });
        else tone(out, t, { f: 95 + Math.random() * 40, type: 'sawtooth', a: 0.04, h: 0.12, r: 0.2, peak: 0.035, sweep: 140 });
        return 1.6 + Math.random() * 2.4;
      } };
    },
    crouching(out) { // close, low, dry
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 68; g.gain.value = 0.05; o.connect(g); g.connect(out); o.start();
      return { nodes: [o], tick: (t) => { hit(out, t, { type: 'bandpass', f: 1800 + Math.random() * 1200, q: 4, r: 0.04, peak: 0.25, pan: Math.random() * 0.4 - 0.2 }); return 0.35 + Math.random() * 0.9; } };
    },
    reclining(out) { // long sighs and a soft chord
      const nodes = [];
      for (const f of [196, 247, 294]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.value = 0.012; o.connect(g); g.connect(out); o.start(); nodes.push(o); }
      return { nodes, tick: (t) => { const g = ctx.createGain(), fl = filt('bandpass', 450, 1.2); const s = noise(fl, false); fl.connect(g); g.connect(out); fl.frequency.setValueAtTime(380, t); fl.frequency.linearRampToValueAtTime(900, t + 1.4); fl.frequency.linearRampToValueAtTime(300, t + 3.2); env(g, t, 1.2, 0.4, 1.8, 0.16); s.start(t); s.stop(t + 3.6); return 4.6 + Math.random() * 2; } };
    },
    horizontal(out) { // breathing and the fountain
      const fl = filt('bandpass', 1300, 0.7), fg = ctx.createGain(); fg.gain.value = 0.045; const n = noise(fl); fl.connect(fg); fg.connect(out); n.start();
      return { nodes: [n], tick: (t) => { const g = ctx.createGain(), lp = filt('lowpass', 650, 0.7); const s = noise(lp, false); lp.connect(g); g.connect(out); env(g, t, 1.6, 0.2, 2.2, 0.2); s.start(t); s.stop(t + 4.2); return 4.6; } };
    },
  };
  function stopVoice(fade = 0.6) {
    if (!voice) return;
    const v = voice; voice = null; clearTimeout(v.timer);
    const t = ctx.currentTime; v.gain.gain.cancelScheduledValues(t); v.gain.gain.setValueAtTime(v.gain.gain.value, t); v.gain.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => { v.nodes.forEach(n => { try { n.stop(); } catch (_) {} }); v.gain.disconnect(); }, fade * 1000 + 100);
  }
  api.enable = async () => { init(); if (ctx.state === 'suspended') await ctx.resume(); api.on = true; };
  api.play = (cls) => {
    if (!ctx || !api.on || !cls) return;
    if (voice && voice.cls === cls) return;
    stopVoice();
    const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(bus);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.8);
    const v = { cls, gain, nodes: [], timer: 0 };
    if (api.custom[cls]) {
      const s = ctx.createBufferSource(); s.buffer = api.custom[cls]; s.loop = true; s.connect(gain); s.start(); v.nodes.push(s);
    } else {
      const p = PATCH[cls](gain); v.nodes = p.nodes;
      const loop = () => { if (voice !== v) return; const wait = p.tick(ctx.currentTime + 0.05); v.timer = setTimeout(loop, wait * 1000); };
      loop();
    }
    voice = v; api.cls = cls;
  };
  api.stop = () => { stopVoice(); api.cls = null; };
  api.disable = () => { stopVoice(); api.on = false; api.cls = null; };
  api.level = () => {
    if (!analyser || !voice) return 0;
    const a = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(a);
    let s = 0; for (let i = 0; i < a.length; i += 4) { const x = (a[i] - 128) / 128; s += x * x; }
    return Math.sqrt(s / (a.length / 4));
  };
  api.drawWave = (c) => {
    const g = c.getContext('2d'), w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(158,73,100,.75)'; g.lineWidth = 2; g.beginPath();
    if (analyser && voice) {
      const a = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(a);
      for (let i = 0; i < w; i++) { const v = a[Math.floor(i / w * a.length)] / 128 - 1; const y = h / 2 + v * h * 1.6; i ? g.lineTo(i, y) : g.moveTo(i, y); }
    } else { g.moveTo(0, h / 2); g.lineTo(w, h / 2); }
    g.stroke();
  };
  api.load = async (cls, file) => {
    init();
    const buf = await file.arrayBuffer();
    api.custom[cls] = await ctx.decodeAudioData(buf);
    api.customName[cls] = file.name;
    if (api.cls === cls) { stopVoice(0.2); api.cls = null; api.play(cls); }
  };
  return api;
})();
