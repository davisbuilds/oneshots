// audio.js: synthesizes the song (song.js) into one AudioBuffer, then plays it
// with sample-accurate seeking. Rendering happens offline, in chunks of eight
// bars, before the first click; every note is scheduled at its exact time, so
// the music and the level can never drift apart.
'use strict';
(function (L) {
  const SR = 44100;
  const CHUNK_BEATS = 32;
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
      g.gain.linearRampToValueAtTime(0.95 * v, t + 0.003);
      g.gain.setTargetAtTime(0, t + 0.06, 0.13);
      const sh = ctx.createWaveShaper(); sh.curve = shaperCurve;
      o.connect(g); g.connect(sh); sh.connect(B.drums);
      const n = noiseSrc(ctx, t, 0.03);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.25 * v, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
      n.connect(hp); hp.connect(ng); ng.connect(B.drums);
    },
    clap(ctx, B, t, d, e) {
      const n = noiseSrc(ctx, t, 0.4);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      for (let k = 0; k < 3; k++) { g.gain.setValueAtTime(0.5 * e.v, t + k * 0.011); g.gain.setTargetAtTime(0.05, t + k * 0.011 + 0.001, 0.004); }
      g.gain.setValueAtTime(0.42 * e.v, t + 0.034);
      g.gain.setTargetAtTime(0, t + 0.036, 0.07);
      n.connect(bp); bp.connect(g); g.connect(B.drums); g.connect(B.verb);
      const o = osc(ctx, 'triangle', 210, t, t + 0.1);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.18 * e.v, t); og.gain.setTargetAtTime(0, t, 0.025);
      o.connect(og); og.connect(B.drums);
    },
    snare(ctx, B, t, d, e) {
      const n = noiseSrc(ctx, t, 0.25);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.4 * e.v, t); g.gain.setTargetAtTime(0, t + 0.005, 0.045);
      n.connect(bp); bp.connect(g); g.connect(B.drums); g.connect(B.verb);
      const o = osc(ctx, 'triangle', 240, t, t + 0.08);
      o.frequency.exponentialRampToValueAtTime(160, t + 0.06);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.25 * e.v, t); og.gain.setTargetAtTime(0, t, 0.02);
      o.connect(og); og.connect(B.drums);
    },
    hat(ctx, B, t, d, e, open) {
      const len = open ? 0.35 : 0.06;
      const n = noiseSrc(ctx, t, len + 0.05);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = open ? 7000 : 8500;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.22 * e.v, t); g.gain.setTargetAtTime(0, t + 0.002, open ? 0.08 : 0.018);
      n.connect(hp); pan(ctx, hp, open ? 0.15 : -0.2, g); g.connect(B.drums);
    },
    ohat(ctx, B, t, d, e) { INST.hat(ctx, B, t, d, e, true); },
    crash(ctx, B, t, d, e) {
      const n = noiseSrc(ctx, t, 3.2);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200;
      const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 6500; pk.gain.value = 6;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.32 * e.v, t); g.gain.setTargetAtTime(0, t + 0.01, 0.75);
      n.connect(hp); hp.connect(pk); pk.connect(g); g.connect(B.drums); g.connect(B.verb);
    },
    impact(ctx, B, t, d, e) {
      const o = osc(ctx, 'sine', 70, t, t + d);
      o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.6);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.9 * e.v, t); g.gain.setTargetAtTime(0, t + 0.05, 0.6);
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
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4 * e.v, t + d); g.gain.linearRampToValueAtTime(0, t + d + 0.03);
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
      const g = ctx.createGain(); env(ctx, g, t, 0.02, 0.42 * e.v, 0.3, 0.85, t + d - 0.05, 0.06);
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
      const g = ctx.createGain(); env(ctx, g, t, 0.004, 0.13 * e.v, 0.15, 0.7, t + d - 0.03, 0.03);
      lp.connect(sh); sh.connect(g); g.connect(B.pump);
    },
    pad(ctx, B, t, d, e) {
      const f = mtof(e.n);
      const end = t + d + 1.6;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400 + e.v * 1200; lp.Q.value = 0.5;
      const g = ctx.createGain(); env(ctx, g, t, 0.45, 0.045 * e.v, 1, 1, t + d, 0.45);
      [-14, -5, 5, 14].forEach((dt, k) => pan(ctx, osc(ctx, 'sawtooth', f, t, end, dt), k % 2 ? 0.55 : -0.55, lp));
      lp.connect(g); g.connect(B.pump); g.connect(B.verb);
    },
    pluck(ctx, B, t, d, e) {
      const f = mtof(e.n);
      const end = t + 0.6;
      const cut = e.cut === undefined ? 0.5 : e.cut;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
      lp.frequency.setValueAtTime(600 + 5000 * cut, t); lp.frequency.setTargetAtTime(350 + 900 * cut, t, 0.06);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.11 * e.v, t + 0.003); g.gain.setTargetAtTime(0, t + 0.004, 0.11);
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
      [-9, 0, 9].forEach((dt, k) => {
        const o = osc(ctx, 'sawtooth', f, t, end, dt);
        vg.connect(o.detune);
        pan(ctx, o, (k - 1) * 0.5, lp);
      });
      const sq = osc(ctx, 'square', f / 2, t, end); const sg = ctx.createGain(); sg.gain.value = 0.35; sq.connect(sg); sg.connect(lp);
      const g = ctx.createGain(); env(ctx, g, t, 0.012, 0.075 * e.v, 0.25, 0.75, t + d - 0.02, 0.08);
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
      const g = ctx.createGain(); env(ctx, g, t, 0.004, 0.05 * e.v, 0.12, 0.55, t + d, 0.06);
      const end = t + d + 0.4;
      for (const n of e.notes) {
        const f = mtof(n);
        [-16, -6, 6, 16].forEach((dt, k) => pan(ctx, osc(ctx, 'sawtooth', f, t, end, dt), (k - 1.5) * 0.4, lp));
      }
      lp.connect(g); g.connect(B.pump); g.connect(B.verb);
    },
  };

  function renderChunk(evs, kicks, t0, len) {
    const ctx = new OfflineAudioContext(2, Math.ceil(len * SR), SR);
    const out = ctx.createGain(); out.gain.value = 1; out.connect(ctx.destination);
    const B = {
      main: ctx.createGain(), drums: ctx.createGain(), fx: ctx.createGain(),
      pump: ctx.createGain(), verb: ctx.createGain(), delay: ctx.createGain(),
    };
    B.main.connect(out); B.drums.connect(out); B.fx.connect(out);
    // Sidechain: everything melodic ducks under each kick.
    const pumpOut = ctx.createGain();
    B.pump.connect(pumpOut); pumpOut.connect(out);
    pumpOut.gain.setValueAtTime(1, 0);
    for (const k of kicks) {
      const tk = k.t - t0;
      if (tk < -0.5 || tk > len) continue;
      const depth = 1 - 0.55 * Math.min(1, k.v);
      if (tk >= 0) { pumpOut.gain.setValueAtTime(1, tk); pumpOut.gain.linearRampToValueAtTime(depth, tk + 0.008); pumpOut.gain.setTargetAtTime(1, tk + 0.02, 0.07); }
    }
    const conv = ctx.createConvolver(); conv.normalize = false; conv.buffer = impulse;
    B.verb.gain.value = 0.22; B.verb.connect(conv);
    const vg = ctx.createGain(); vg.gain.value = 0.5; conv.connect(vg); vg.connect(out);
    const dl = ctx.createDelay(2); dl.delayTime.value = L.BEAT * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 3500;
    B.delay.gain.value = 0.28; B.delay.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl);
    const dg = ctx.createGain(); dg.gain.value = 0.6; dlp.connect(dg); dg.connect(out); dg.connect(B.verb);
    for (const e of evs) {
      const t = e.b * L.BEAT - t0, d = e.d * L.BEAT;
      INST[e.i](ctx, B, t, d, e);
    }
    return ctx.startRendering();
  }

  // Soft-knee limiter with 5 ms lookahead, applied to the whole mix.
  function master(L0, R0) {
    const n = L0.length, look = Math.floor(SR * 0.005);
    const ceiling = 0.92;
    let gain = 1;
    const rel = Math.exp(-1 / (SR * 0.12));
    const peakAhead = new Float32Array(n);
    // running max over the lookahead window (simple, fast enough at 44.1 kHz)
    for (let i = n - 1; i >= 0; i--) {
      const p = Math.max(Math.abs(L0[i]), Math.abs(R0[i]));
      peakAhead[i] = i + 1 < n ? Math.max(p, peakAhead[i + 1] * 0.9995) : p;
    }
    for (let i = 0; i < n; i++) {
      const p = peakAhead[Math.min(n - 1, i)];
      const want = p * gain > ceiling ? ceiling / p : 1;
      gain = want < gain ? want : 1 - (1 - gain) * rel;
      if (gain > 1) gain = 1;
      const a = L0[i] * gain, b = R0[i] * gain;
      L0[i] = Math.tanh(a * 1.05) / 1.05;
      R0[i] = Math.tanh(b * 1.05) / 1.05;
    }
    void look;
  }

  // Render the whole song. onProgress(0..1). Resolves to an AudioBuffer.
  L.renderSong = async function (onProgress) {
    shared();
    const ev = L.song.events;
    const kicks = ev.filter(e => e.i === 'kick' || e.i === 'impact').map(e => ({ t: e.b * L.BEAT, v: e.i === 'impact' ? 1 : e.v }));
    const total = L.song.duration;
    const out = new AudioBuffer({ length: Math.ceil(total * SR), numberOfChannels: 2, sampleRate: SR });
    const OL = out.getChannelData(0), OR = out.getChannelData(1);
    const nChunks = Math.ceil(L.song.LENGTH_BEATS / CHUNK_BEATS);
    let done = 0;
    const jobs = [];
    for (let c = 0; c < nChunks; c++) {
      const b0 = c * CHUNK_BEATS, b1 = b0 + CHUNK_BEATS;
      const evs = ev.filter(e => e.b >= b0 && e.b < b1);
      const t0 = b0 * L.BEAT;
      const end = Math.max(b1 * L.BEAT, ...evs.map(e => (e.b + e.d) * L.BEAT)) + TAIL;
      jobs.push(renderChunk(evs, kicks, t0, end - t0).then(buf => {
        const off = Math.round(t0 * SR);
        const a = buf.getChannelData(0), b = buf.getChannelData(1);
        const m = Math.min(a.length, OL.length - off);
        for (let i = 0; i < m; i++) { OL[off + i] += a[i]; OR[off + i] += b[i]; }
        done++;
        if (onProgress) onProgress(done / (nChunks + 1));
      }));
      // Two chunks at a time keeps memory down without serialising everything.
      if (jobs.length >= 2) await Promise.all(jobs.splice(0));
    }
    await Promise.all(jobs);
    master(OL, OR);
    if (onProgress) onProgress(1);
    return out;
  };

  // ── Live playback ───────────────────────────────────────────────────────
  L.Audio = function () {
    const A = { ctx: null, buffer: null, src: null, gain: null, sfx: null, volume: 1, muted: false, startCtx: 0, offset: 0, playing: false };

    A.ensure = function () {
      if (A.ctx) return A.ctx;
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      A.ctx = new C({ latencyHint: 'interactive', sampleRate: SR });
      A.gain = A.ctx.createGain();
      A.gain.connect(A.ctx.destination);
      A.music = A.ctx.createGain();
      A.music.connect(A.gain);
      A.sfx = A.ctx.createGain(); A.sfx.gain.value = 0.5;
      A.sfx.connect(A.gain);
      A.applyVolume();
      return A.ctx;
    };
    A.applyVolume = function () { if (A.gain) A.gain.gain.value = A.muted ? 0 : A.volume; };
    A.latency = () => A.ctx ? (A.ctx.outputLatency || 0) + (A.ctx.baseLatency || 0) : 0;

    // Start the song at `offset` seconds; returns the context time it starts.
    A.play = function (offset, fadeIn) {
      A.stop(0);
      const ctx = A.ctx;
      if (!ctx || !A.buffer) return;
      if (ctx.state === 'suspended') ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = A.buffer;
      const g = ctx.createGain();
      src.connect(g); g.connect(A.music);
      const when = ctx.currentTime + 0.03;
      if (fadeIn) { g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(1, when + fadeIn); }
      src.start(when, Math.max(0, offset));
      A.src = src; A.srcGain = g;
      A.startCtx = when; A.offset = offset; A.playing = true;
    };
    A.stop = function (fade = 0.06) {
      if (!A.src) return;
      const ctx = A.ctx, src = A.src, g = A.srcGain;
      const now = ctx.currentTime;
      try {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(0, now + fade);
        src.stop(now + fade + 0.01);
      } catch (err) { /* already stopped */ }
      A.src = null; A.playing = false;
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
