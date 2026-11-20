// Ambient sound, synthesised with WebAudio: every world has a soundscape made
// from its descriptor (sea, wind, drones tuned to the world, chimes, drips),
// and doorways leak: standing near one you hear the world beyond it, louder as
// you approach, so a place is heard before it is entered.
export class Sound {
  constructor(app) { this.app = app; this.voices = new Map(); this.ctx = null; this.enabled = !app.params.has('mute'); }

  start() {
    if (!this.enabled || this.ctx) return;
    // browsers allow audio only after a gesture; wait for one if needed
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
      if (!this.waiting) { this.waiting = true; const go = () => { removeEventListener('pointerdown', go); removeEventListener('keydown', go); this.waiting = false; this.start(); }; addEventListener('pointerdown', go); addEventListener('keydown', go); }
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
      this.master.gain.setTargetAtTime(0.55, this.ctx.currentTime, 2.5);
      const len = this.ctx.sampleRate * 3, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      let b = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.98 * b + 0.02 * w; d[i] = w * 0.6 + b * 2.0; }
      this.noise = buf;
      this.ctx.resume?.();
    } catch { this.ctx = null; }
  }

  // A world's soundscape: a gain node fed by its layers.
  voice(key) {
    if (this.voices.has(key)) return this.voices.get(key);
    const c = this.ctx, d = this.app.descs.get(key);
    if (!d) return null;
    const a = d.audio || {}, out = c.createGain(); out.gain.value = 0; out.connect(this.master);
    const nodes = [];
    const noise = (type, freq, q, gain, lfo = 0, lfoRate = 0.1) => {
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true; src.playbackRate.value = 0.7 + Math.random() * 0.6;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(out); src.start(c.currentTime + Math.random() * 0.1);
      if (lfo) { const o = c.createOscillator(), og = c.createGain(); o.frequency.value = lfoRate; og.gain.value = gain * lfo; o.connect(og); og.connect(g.gain); o.start(); nodes.push(o); }
      nodes.push(src);
    };
    const drone = (freq, gain) => {
      for (const [m, det] of [[1, 0], [1.5, 3], [2, -4], [0.5, 1]]) {
        const o = c.createOscillator(); o.type = m === 1 ? 'triangle' : 'sine'; o.frequency.value = freq * m; o.detune.value = det;
        const g = c.createGain(); g.gain.value = gain / (m + 0.5);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
        o.connect(lp); lp.connect(g); g.connect(out); o.start(); nodes.push(o);
      }
    };
    if (a.sea) noise('lowpass', 520, 0.6, 0.5 * a.sea, 0.8, 0.07);
    if (a.wind) noise('bandpass', 700, 0.7, 0.22 * a.wind, 0.6, 0.05 + Math.random() * 0.05);
    const base = a.base || 'wind';
    if (base === 'desert') noise('bandpass', 1800, 2.5, 0.05, 0.9, 0.11);
    if (base === 'hall' || base === 'room') noise('lowpass', 260, 0.4, 0.08, 0.3, 0.03);
    if (base === 'cave') noise('lowpass', 180, 0.6, 0.18, 0.3, 0.04);
    if (base === 'hum') noise('lowpass', 120, 1.2, 0.12, 0.2, 0.02);
    drone(a.tone || 220, base === 'tone' ? 0.05 : 0.028);
    const v = { key, out, nodes, a, d, next: 0, gain: 0 };
    this.voices.set(key, v);
    return v;
  }

  bell(freq, when, gain = 0.12, out = this.master) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(), m = c.createOscillator(), mg = c.createGain(), g = c.createGain();
    o.frequency.value = freq; m.frequency.value = freq * 3.5; mg.gain.value = freq * 1.2;
    m.connect(mg); mg.connect(o.frequency); o.connect(g); g.connect(out);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, when + 3.5);
    mg.gain.exponentialRampToValueAtTime(1, when + 2.5);
    o.start(when); m.start(when); o.stop(when + 3.6); m.stop(when + 3.6);
  }
  chime(n = 3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, base = this.app.view?.desc.audio?.tone || 220;
    [1, 1.25, 1.5, 2, 2.5].slice(0, n + 1).forEach((r, i) => this.bell(base * 2 * r, t + i * 0.18, 0.09));
  }
  cross() {
    const c = this.ctx; if (!c) return;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5;
    const g = c.createGain(), t = c.currentTime;
    f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + 1);
  }
  world() {}

  update(dt) {
    const c = this.ctx; if (!c) return;
    const app = this.app, pl = app.player, want = new Map([[pl.world, 1]]);
    // doorways leak the sound of the world beyond
    for (const P of app.space.portals(pl.world)) {
      if (!P.link || P.link.world === pl.world) continue;
      const dx = pl.eye[0] - P.xf.p[0], dy = pl.eye[1] - P.xf.p[1], dz = pl.eye[2] - P.xf.p[2];
      const dist = Math.hypot(dx, dy, dz), facing = (P.n[0] * dx + P.n[1] * dy + P.n[2] * dz) >= 0;
      const g = facing ? Math.max(0, 1 - dist / (18 + P.hh)) ** 2 * 0.9 : 0;
      if (g > 0.01) want.set(P.link.world, Math.max(want.get(P.link.world) || 0, g));
    }
    for (const [k, g] of want) this.voice(k);
    for (const [k, v] of this.voices) {
      const g = want.get(k) || 0;
      v.out.gain.setTargetAtTime(g, c.currentTime, 0.6);
      v.gain = g;
      // sparse events: chimes in forests, drips in caves
      if (g > 0.05 && c.currentTime > v.next) {
        if (v.a.chimes) { const s = [1, 1.125, 1.25, 1.5, 1.667, 2][Math.floor(Math.random() * 6)]; this.bell((v.a.tone || 220) * 2 * s, c.currentTime + 0.05, 0.035 * v.a.chimes * g, v.out); }
        if (v.a.drips) this.bell(1400 + Math.random() * 900, c.currentTime + 0.05, 0.02 * g, v.out);
        v.next = c.currentTime + (v.a.chimes || v.a.drips ? 0.8 + Math.random() * 3.5 : 999);
      }
      if (g === 0 && !want.has(k)) {
        v.idle = (v.idle || 0) + dt;
        if (v.idle > 4) { for (const n of v.nodes) { try { n.stop(); } catch { /* already stopped */ } } v.out.disconnect(); this.voices.delete(k); }
      } else v.idle = 0;
    }
  }
}
