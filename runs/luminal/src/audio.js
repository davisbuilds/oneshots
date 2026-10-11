// audio.js: synthesizes the song (song.js) into one AudioBuffer, then plays it
// with sample-accurate seeking. Rendering happens offline, in chunks of eight
// bars, before the first click; every note is scheduled at its exact time, so
// the music and the level can never drift apart.
'use strict';
(function (L) {
  const SR = 44100;
  const CHUNK_BEATS = 16;
  const TAIL = 3.5;
  const mtof = n => 440 * Math.pow(2, (n - 69) / 12);

  let noise = null, impulse = null, shaperCurve = null;
  function shared() {
    if (noise) return;
    const R = L.rng(99);
    noise = new AudioBuffer({ length: SR * 2, numberOfChannels: 1, sampleRate: SR });
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1;
    // A synthetic hall: decaying stereo noise with a darker tail.
    const len = Math.floor(SR * 2.6);
    impulse = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: SR });
    for (let ch = 0; ch < 2; ch++) {
      const c = impulse.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        const env = Math.pow(1 - i / len, 2.2) * Math.exp(-t * 1.1);
        const k = 0.25 + 0.7 * Math.exp(-t * 2.5);
        lp += k * ((R() * 2 - 1) - lp);
        c[i] = lp * env * (i < SR * 0.012 ? i / (SR * 0.012) : 1);
      }
      // unit energy, so the send level means what it says
      let e = 0;
      for (let i = 0; i < len; i++) e += c[i] * c[i];
      const k = 1 / Math.sqrt(e);
      for (let i = 0; i < len; i++) c[i] *= k;
    }
    shaperCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; shaperCurve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
  }

  // ── Instruments ─────────────────────────────────────────────────────────
  // Each takes the chunk's buses, a start time t (seconds, chunk-relative),
  // duration d and the event; it schedules nodes and returns nothing.
  function env(ctx, g, t, a, peak, dec, sus, end, rel) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(peak * sus, t + a, dec);
    g.gain.setValueAtTime(peak * sus, end);
    g.gain.setTargetAtTime(0, end, rel);
  }
  function noiseSrc(ctx, t, d) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    s.start(t, (t * 7.31) % 1.9);
    s.stop(t + d);
    return s;
  }
  function osc(ctx, type, f, t, end, detune = 0) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    o.start(t); o.stop(end);
    return o;
  }
  // Detuned voices spread hard left and right through one merger: much
  // cheaper than a panner per oscillator.
  function spread(ctx, oscs, dest) {
    const m = ctx.createChannelMerger(2);
    oscs.forEach((o, k) => o.connect(m, 0, k % 2));
    m.connect(dest);
    return m;
  }
  function pan(ctx, node, p, dest) {
    const sp = ctx.createStereoPanner(); sp.pan.value = p;
    node.connect(sp); sp.connect(dest);
    return sp;
  }

  const INST = {
    kick(ctx, B, t, d, e) {
      const v = e.v;
      const o = osc(ctx, 'sine', 150, t, t + 0.6);
      o.frequency.setValueAtTime(170, t);
      o.frequency.exponentialRampToValueAtTime(52, t + 0.09);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5 * v, t + 0.003);
      g.gain.setTargetAtTime(0, t + 0.06, 0.13);
      const sh = ctx.createWaveShaper(); sh.curve = shaperCurve;
      const post = ctx.createGain(); post.gain.value = 0.45;
      o.connect(g); g.connect(sh); sh.connect(post); post.connect(B.drums);
      const n = noiseSrc(ctx, t, 0.03);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.13 * v, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
      n.connect(hp); hp.connect(ng); ng.connect(B.drums);
    },
    clap(ctx, B, t, d, e) {
      const n = noiseSrc(ctx, t, 0.4);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      for (let k = 0; k < 3; k++) { g.gain.setValueAtTime(1.1 * e.v, t + k * 0.011); g.gain.setTargetAtTime(0.05, t + k * 0.011 + 0.001, 0.004); }
      g.gain.setValueAtTime(0.9 * e.v, t + 0.034);
      g.gain.setTargetAtTime(0, t + 0.036, 0.07);
      n.connect(bp); bp.connect(g); g.connect(B.drums); g.connect(B.verb);
      const o = osc(ctx, 'triangle', 210, t, t + 0.1);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.5 * e.v, t); og.gain.setTargetAtTime(0, t, 0.025);
      o.connect(og); og.connect(B.drums);
    },
    snare(ctx, B, t, d, e) {
      const n = noiseSrc(ctx, t, 0.25);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.setValueAtTime(1.1 * e.v, t); g.gain.setTargetAtTime(0, t + 0.005, 0.045);
      n.connect(bp); bp.connect(g); g.connect(B.drums); g.connect(B.verb);
      const o = osc(ctx, 'triangle', 240, t, t + 0.08);
      o.frequency.exponentialRampToValueAtTime(160, t + 0.06);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.6 * e.v, t); og.gain.setTargetAtTime(0, t, 0.02);
      o.connect(og); og.connect(B.drums);
    },
    hat(ctx, B, t, d, e, open) {
      const len = open ? 0.35 : 0.06;
      const n = noiseSrc(ctx, t, len + 0.05);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = open ? 7000 : 8500;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.95 * e.v, t); g.gain.setTargetAtTime(0, t + 0.002, open ? 0.08 : 0.018);
      n.connect(hp); pan(ctx, hp, open ? 0.15 : -0.2, g); g.connect(B.drums);
    },
    ohat(ctx, B, t, d, e) { INST.hat(ctx, B, t, d, e, true); },
    crash(ctx, B, t, d, e) {
      const n = noiseSrc(ctx, t, 3.2);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200;
      const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 6500; pk.gain.value = 6;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.16 * e.v, t); g.gain.setTargetAtTime(0, t + 0.01, 0.75);
      n.connect(hp); hp.connect(pk); pk.connect(g); g.connect(B.drums); g.connect(B.verb);
    },
    impact(ctx, B, t, d, e) {
      const o = osc(ctx, 'sine', 70, t, t + d);
      o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.6);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.5 * e.v, t); g.gain.setTargetAtTime(0, t + 0.05, 0.6);
      o.connect(g); g.connect(B.drums);
      const n = noiseSrc(ctx, t, d);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.5);
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.5 * e.v, t); ng.gain.setTargetAtTime(0, t + 0.02, 0.5);
      n.connect(lp); lp.connect(ng); ng.connect(B.drums); ng.connect(B.verb);
    },
    riser(ctx, B, t, d, e) {
      const n = noiseSrc(ctx, t, d + 0.05);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.5;
      bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(9000, t + d);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.8 * e.v, t + d); g.gain.linearRampToValueAtTime(0, t + d + 0.03);
      n.connect(bp); bp.connect(g); g.connect(B.fx); g.connect(B.verb);
      const o = osc(ctx, 'sawtooth', 110, t, t + d + 0.05);
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(880, t + d);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(6000, t + d);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.09 * e.v, t + d); og.gain.linearRampToValueAtTime(0, t + d + 0.03);
      o.connect(lp); lp.connect(og); og.connect(B.fx);
    },
    swell(ctx, B, t, d, e) {
      const n = noiseSrc(ctx, t, d + 0.02);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(600, t); lp.frequency.exponentialRampToValueAtTime(12000, t + d);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * e.v, t + d - 0.01); g.gain.linearRampToValueAtTime(0, t + d);
      n.connect(lp); lp.connect(g); g.connect(B.fx); g.connect(B.verb);
    },
    sub(ctx, B, t, d, e) {
      const o = osc(ctx, 'sine', mtof(e.n), t, t + d + 0.3);
      const g = ctx.createGain(); env(ctx, g, t, 0.02, 0.28 * e.v, 0.3, 0.85, t + d - 0.05, 0.06);
      o.connect(g); g.connect(B.pump);
    },
    bass(ctx, B, t, d, e) {
      const f = mtof(e.n);
      const end = t + d + 0.2;
      const o1 = osc(ctx, 'sawtooth', f, t, end, -6), o2 = osc(ctx, 'square', f, t, end, 7);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
      lp.frequency.setValueAtTime(2200, t); lp.frequency.setTargetAtTime(350, t, 0.07);
      const g = ctx.createGain(); env(ctx, g, t, 0.005, 0.2 * e.v, 0.12, 0.6, t + d - 0.03, 0.03);
      const m = ctx.createGain(); m.gain.value = 0.6;
      o1.connect(lp); o2.connect(m); m.connect(lp); lp.connect(g); g.connect(B.pump);
    },
    growl(ctx, B, t, d, e) {
      const f = mtof(e.n);
      const end = t + d + 0.2;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 7;
      lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(2600, t + d * 0.35); lp.frequency.setTargetAtTime(500, t + d * 0.35, 0.05);
      for (const dt of [-12, 12]) osc(ctx, 'sawtooth', f, t, end, dt).connect(lp);
      const sq = osc(ctx, 'square', f / 2, t, end); const sg = ctx.createGain(); sg.gain.value = 0.5; sq.connect(sg); sg.connect(lp);
      const sh = ctx.createWaveShaper(); sh.curve = shaperCurve;
      const g = ctx.createGain(); env(ctx, g, t, 0.004, 0.2 * e.v, 0.15, 0.7, t + d - 0.03, 0.03);
      lp.connect(sh); sh.connect(g); g.connect(B.pump);
    },
    pad(ctx, B, t, d, e) {
      const f = mtof(e.n);
      const end = t + d + 1.6;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400 + e.v * 1200; lp.Q.value = 0.5;
      const g = ctx.createGain(); env(ctx, g, t, 0.45, 0.038 * e.v, 1, 1, t + d, 0.45);
      spread(ctx, [-14, 14, -5, 5].map(dt => osc(ctx, 'sawtooth', f, t, end, dt)), lp);
      lp.connect(g); g.connect(B.pump); g.connect(B.verb);
    },
    pluck(ctx, B, t, d, e) {
      const f = mtof(e.n);
      const end = t + 0.6;
      const cut = e.cut === undefined ? 0.5 : e.cut;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
      lp.frequency.setValueAtTime(600 + 5000 * cut, t); lp.frequency.setTargetAtTime(350 + 900 * cut, t, 0.06);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.27 * e.v, t + 0.003); g.gain.setTargetAtTime(0, t + 0.004, 0.11);
      osc(ctx, 'sawtooth', f, t, end, -4).connect(lp);
      osc(ctx, 'square', f, t, end, 5).connect(lp);
      lp.connect(g);
      pan(ctx, g, ((e.n * 37) % 7 - 3) / 6, B.pump);
      g.connect(B.delay);
    },
    lead(ctx, B, t, d, e) {
      const f = mtof(e.n);
      const end = t + d + 0.5;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.5;
      lp.frequency.setValueAtTime(5200, t); lp.frequency.setTargetAtTime(2600, t, 0.2);
      const vib = osc(ctx, 'sine', 5.5, t, end);
      const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(0, t + 0.25); vg.gain.linearRampToValueAtTime(14, t + 0.6);
      vib.connect(vg);
      const saws = [-9, 9, 0].map(dt => { const o = osc(ctx, 'sawtooth', f, t, end, dt); vg.connect(o.detune); return o; });
      spread(ctx, saws.slice(0, 2), lp);
      saws[2].connect(lp);
      const sq = osc(ctx, 'square', f / 2, t, end); const sg = ctx.createGain(); sg.gain.value = 0.35; sq.connect(sg); sg.connect(lp);
      const g = ctx.createGain(); env(ctx, g, t, 0.012, 0.125 * e.v, 0.25, 0.75, t + d - 0.02, 0.08);
      lp.connect(g); g.connect(B.main); g.connect(B.delay); g.connect(B.verb);
    },
    bell(ctx, B, t, d, e) {
      const f = mtof(e.n);
      const end = t + d + 2.5;
      const car = osc(ctx, 'sine', f, t, end);
      const mod = osc(ctx, 'sine', f * 3.5, t, end);
      const mg = ctx.createGain(); mg.gain.setValueAtTime(f * 2.2, t); mg.gain.setTargetAtTime(f * 0.1, t, 0.25);
      mod.connect(mg); mg.connect(car.frequency);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * e.v, t + 0.004); g.gain.setTargetAtTime(0, t + 0.01, 0.55);
      car.connect(g); g.connect(B.main); g.connect(B.delay); g.connect(B.verb);
    },
    stab(ctx, B, t, d, e) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1;
      lp.frequency.setValueAtTime(7000, t); lp.frequency.setTargetAtTime(1800, t, 0.08);
      const g = ctx.createGain(); env(ctx, g, t, 0.004, 0.08 * e.v, 0.12, 0.55, t + d, 0.06);
      const end = t + d + 0.4;
      for (const n of e.notes) {
        const f = mtof(n);
        spread(ctx, [-16, 16, -6, 6].map(dt => osc(ctx, 'sawtooth', f, t, end, dt)), lp);
      }
      lp.connect(g); g.connect(B.pump); g.connect(B.verb);
    },
  };

  // One chunk renders to four channels: a dry stereo mix (0-1) and a
  // stereo send (2-3) for the reverb, which runs live, so chunks can overlap
  // and simply be summed.
  function renderChunk(evs, kicks, t0, len) {
    const ctx = new OfflineAudioContext(4, Math.ceil(len * SR), SR);
    const merger = ctx.createChannelMerger(4);
    merger.connect(ctx.destination);
    ctx.destination.channelInterpretation = 'discrete';
    const route = (node, ch) => {
      const sp = ctx.createChannelSplitter(2);
      node.connect(sp);
      sp.connect(merger, 0, ch); sp.connect(merger, 1, ch + 1);
    };
    const dry = ctx.createGain(), wet = ctx.createGain();
    for (const g of [dry, wet]) { g.channelCount = 2; g.channelCountMode = 'explicit'; }
    route(dry, 0); route(wet, 2);
    const B = {
      main: ctx.createGain(), drums: ctx.createGain(), fx: ctx.createGain(),
      pump: ctx.createGain(), verb: wet, delay: ctx.createGain(),
    };
    B.main.connect(dry); B.drums.connect(dry); B.fx.connect(dry);
    // Sidechain: everything melodic ducks under each kick.
    const pumpOut = ctx.createGain();
    B.pump.connect(pumpOut); pumpOut.connect(dry);
    pumpOut.gain.setValueAtTime(1, 0);
    for (const k of kicks) {
      const tk = k.t - t0;
      if (tk < 0 || tk > len) continue;
      const depth = 1 - 0.55 * Math.min(1, k.v);
      pumpOut.gain.setValueAtTime(1, tk); pumpOut.gain.linearRampToValueAtTime(depth, tk + 0.008); pumpOut.gain.setTargetAtTime(1, tk + 0.02, 0.07);
    }
    const dl = ctx.createDelay(2); dl.delayTime.value = L.BEAT * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 3500;
    B.delay.gain.value = 0.28; B.delay.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl);
    const dg = ctx.createGain(); dg.gain.value = 0.6; dlp.connect(dg); dg.connect(dry); dg.connect(wet);
    for (const e of evs) {
      const t = e.b * L.BEAT - t0, d = e.d * L.BEAT;
      INST[e.i](ctx, B, t, d, e);
    }
    return ctx.startRendering();
  }

  // Render the song chunk by chunk, in order. onChunk({t0, buffer}) is called
  // as each finishes, so playback can start after the first one.
  // opts (for development): { only: ['lead', ...], from: beat, to: beat }
  L.renderSong = async function (onChunk, opts = {}) {
    shared();
    const ev = L.song.events.filter(e => (!opts.only || opts.only.includes(e.i)) && (opts.from === undefined || (e.b >= opts.from && e.b < opts.to)));
    const kicks = L.song.events.filter(e => e.i === 'kick' || e.i === 'impact').map(e => ({ t: e.b * L.BEAT, v: e.i === 'impact' ? 1 : e.v }));
    const nChunks = Math.ceil(L.song.LENGTH_BEATS / CHUNK_BEATS);
    const chunks = [];
    for (let c = 0; c < nChunks; c++) {
      const b0 = c * CHUNK_BEATS, b1 = b0 + CHUNK_BEATS;
      const evs = ev.filter(e => e.b >= b0 && e.b < b1);
      if (!evs.length) continue;
      const t0 = b0 * L.BEAT;
      const end = Math.max(b1 * L.BEAT, ...evs.map(e => (e.b + e.d) * L.BEAT)) + TAIL;
      const buffer = await renderChunk(evs, kicks, t0, end - t0);
      const chunk = { index: c, t0, buffer, count: nChunks };
      chunks.push(chunk);
      if (onChunk) onChunk(chunk);
    }
    return chunks;
  };

  // The mix that chunks play through: dry + live reverb send -> limiter.
  // Used by the game's AudioContext and by mixdown() for analysis.
  function buildMix(ctx) {
    shared();
    const m = {};
    m.out = ctx.createGain(); m.out.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -4; comp.knee.value = 4; comp.ratio.value = 12; comp.attack.value = 0.002; comp.release.value = 0.12;
    m.out.connect(comp);
    m.dry = ctx.createGain();
    m.dry.connect(m.out);
    m.conv = ctx.createConvolver(); m.conv.normalize = false; m.conv.buffer = impulse;
    m.wetIn = ctx.createGain(); m.wetIn.gain.value = 0.9;
    m.wetIn.connect(m.conv); m.conv.connect(m.out);
    // Final safety: linear below 0.7, a soft knee up to full scale.
    const clip = ctx.createWaveShaper();
    const curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) {
      const x = i / 1024 - 1, a = Math.abs(x);
      curve[i] = Math.sign(x) * (a < 0.7 ? a : 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3));
    }
    clip.curve = curve;
    comp.connect(clip);
    m.comp = clip;
    return m;
  }
  // Play chunk so that song time `offset` sounds at context time `when`.
  function scheduleChunk(ctx, chunk, when, offset, bus) {
    const start = chunk.t0 - offset;
    const skip = Math.max(0, -start);
    if (skip >= chunk.buffer.duration) return null;
    const src = ctx.createBufferSource();
    src.buffer = chunk.buffer;
    const sp = ctx.createChannelSplitter(4);
    src.connect(sp);
    const d = ctx.createChannelMerger(2), w = ctx.createChannelMerger(2);
    sp.connect(d, 0, 0); sp.connect(d, 1, 1); sp.connect(w, 2, 0); sp.connect(w, 3, 1);
    d.connect(bus.dry); w.connect(bus.wet);
    src.start(when + Math.max(0, start), skip);
    return src;
  }

  // Offline mixdown of all chunks (for tools/audio.mjs and the verifier).
  L.mixdown = async function (chunks) {
    const len = Math.max(...chunks.map(c => c.t0 + c.buffer.duration));
    const ctx = new OfflineAudioContext(2, Math.ceil(len * SR), SR);
    const mix = buildMix(ctx);
    mix.comp.connect(ctx.destination);
    for (const c of chunks) scheduleChunk(ctx, c, 0, 0, { dry: mix.dry, wet: mix.wetIn });
    return ctx.startRendering();
  };

  // ── Live playback ───────────────────────────────────────────────────────
  L.Audio = function () {
    const A = { ctx: null, chunks: [], srcs: [], volume: 1, muted: false, startCtx: 0, offset: 0, playing: false, cur: null };

    A.ensure = function () {
      if (A.ctx) return A.ctx;
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      A.ctx = new C({ latencyHint: 'interactive', sampleRate: SR });
      A.gain = A.ctx.createGain();
      A.gain.connect(A.ctx.destination);
      A.mix = buildMix(A.ctx);
      A.mix.comp.connect(A.gain);
      A.sfx = A.ctx.createGain(); A.sfx.gain.value = 0.5;
      A.sfx.connect(A.gain);
      A.applyVolume();
      return A.ctx;
    };
    A.applyVolume = function () { if (A.gain) A.gain.gain.value = A.muted ? 0 : A.volume; };
    A.latency = () => A.ctx ? (A.ctx.outputLatency || 0) + (A.ctx.baseLatency || 0) : 0;
    A.ready = () => A.chunks.length > 0;

    // Each play() gets its own pair of gains, so a restart can fade the old
    // sources out while the new ones start.
    function bus() {
      const ctx = A.ctx;
      const dry = ctx.createGain(), wet = ctx.createGain();
      dry.connect(A.mix.dry); wet.connect(A.mix.wetIn);
      return { dry, wet };
    }

    // A chunk finished rendering: if the song is playing, slot it in.
    A.addChunk = function (chunk) {
      A.chunks.push(chunk);
      if (A.playing && A.ctx) {
        const now = A.ctx.currentTime + 0.05;
        const src = scheduleChunk(A.ctx, chunk, now, A.offset + (now - A.startCtx), A.cur);
        if (src) A.srcs.push(src);
      }
    };

    // Start the song at `offset` seconds.
    A.play = function (offset, fadeIn) {
      A.stop(0.03);
      const ctx = A.ctx;
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      const when = ctx.currentTime + 0.03;
      const b = bus();
      if (fadeIn) for (const g of [b.dry, b.wet]) { g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(1, when + fadeIn); }
      A.cur = b;
      A.srcs = [];
      for (const c of A.chunks) { const s = scheduleChunk(ctx, c, when, Math.max(0, offset), b); if (s) A.srcs.push(s); }
      A.startCtx = when; A.offset = offset; A.playing = true;
    };
    A.stop = function (fade = 0.06) {
      if (!A.cur) return;
      const ctx = A.ctx, b = A.cur, srcs = A.srcs;
      const now = ctx.currentTime;
      for (const g of [b.dry, b.wet]) {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(0, now + fade);
      }
      for (const s of srcs) { try { s.stop(now + fade + 0.01); } catch (err) { /* never started */ } }
      setTimeout(() => { b.dry.disconnect(); b.wet.disconnect(); }, (fade + 4) * 1000);
      A.cur = null; A.srcs = []; A.playing = false;
    };
    // Song time according to the audio clock (what the listener hears now).
    A.songTime = function () {
      if (!A.ctx || !A.playing) return null;
      return A.offset + (A.ctx.currentTime - A.startCtx) - A.latency();
    };

    // Short synthesized effects on the live context.
    A.sfxPlay = function (kind) {
      const ctx = A.ctx;
      if (!ctx) return;
      const t = ctx.currentTime + 0.005;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(A.sfx);
      if (kind === 'death') {
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.45);
        g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.start(t); o.stop(t + 0.55);
        const n = ctx.createBufferSource(); n.buffer = noise;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(4000, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.5);
        const ng = ctx.createGain(); ng.gain.setValueAtTime(0.7, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        n.connect(lp); lp.connect(ng); ng.connect(A.sfx); n.start(t); n.stop(t + 0.6);
      } else if (kind === 'checkpoint') {
        o.type = 'triangle';
        o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1320, t + 0.07);
        g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o.start(t); o.stop(t + 0.3);
      } else if (kind === 'click') {
        o.type = 'sine'; o.frequency.setValueAtTime(660, t);
        g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        o.start(t); o.stop(t + 0.1);
      } else if (kind === 'best') {
        o.type = 'triangle';
        [784, 988, 1175].forEach((f, k) => o.frequency.setValueAtTime(f, t + k * 0.08));
        g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        o.start(t); o.stop(t + 0.5);
      }
    };
    return A;
  };
})(globalThis.LUMINAL = globalThis.LUMINAL || {});
