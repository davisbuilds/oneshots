// song.js: "Heliotrope", the soundtrack, as a list of note events in beats.
// audio.js renders these into sound; the scene reads the same list to make
// the world pulse, so picture and sound share one clock.
// 128 BPM, D minor, 64 bars. The finale lifts to E minor and ends in E major.
'use strict';
(function (L) {
  const N = name => {
    // 'D5' -> 74, 'Bb4' -> 70, 'F#3' -> 54
    const m = /^([A-G])(b|#)?(-?\d)$/.exec(name);
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
    return 12 * (+m[3] + 1) + base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  };
  L.noteNum = N;

  // The note `steps` scale degrees below n in D natural minor (shift moves
  // the key, e.g. 2 for E minor).
  const DM = [2, 4, 5, 7, 9, 10, 0];
  function below(n, steps, shift = 0) {
    let m = n;
    for (let k = 0; k < steps; k++) { do { m--; } while (!DM.includes(((m - shift) % 12 + 12) % 12)); }
    return m;
  }

  // Chords as root (bass octave) + intervals.
  const CH = {
    Dm: [N('D2'), [0, 3, 7]], Bb: [N('Bb1'), [0, 4, 7]], F: [N('F2'), [0, 4, 7]], C: [N('C2'), [0, 4, 7]],
    Gm: [N('G1'), [0, 3, 7]], A: [N('A1'), [0, 4, 7]], Am: [N('A1'), [0, 3, 7]],
  };
  const PROG = ['Dm', 'Bb', 'F', 'C'];

  // The hook: [start beat in the phrase, length, note]. Eight bars.
  const HOOK = [
    [0, 1, 'A4'], [1, 0.5, 'D5'], [1.5, 0.5, 'E5'], [2, 1.5, 'F5'], [3.5, 0.5, 'E5'],
    [4, 1, 'D5'], [5, 0.5, 'F5'], [5.5, 0.5, 'D5'], [6, 2, 'Bb4'],
    [8, 1, 'A4'], [9, 0.5, 'C5'], [9.5, 0.5, 'D5'], [10, 1.5, 'F5'], [11.5, 0.5, 'G5'],
    [12, 1.5, 'E5'], [13.5, 0.5, 'D5'], [14, 1, 'C5'], [15, 1, 'E5'],
    [16, 1.5, 'A5'], [17.5, 0.5, 'G5'], [18, 1, 'F5'], [19, 0.5, 'E5'], [19.5, 0.5, 'F5'],
    [20, 2, 'D5'], [22, 0.5, 'F5'], [22.5, 0.5, 'E5'], [23, 1, 'D5'],
    [24, 1, 'C5'], [25, 1, 'F5'], [26, 1, 'A5'], [27, 0.5, 'G5'], [27.5, 0.5, 'F5'],
    [28, 3, 'E5'],
  ].map(([b, d, n]) => [b, d, N(n)]);

  function compose() {
    const ev = [];
    const add = (b, d, i, n, v = 1, x) => ev.push(Object.assign({ b, d, i, n, v }, x || {}));
    const chordAt = (bar, prog, shift = 0) => { const c = CH[prog[bar % prog.length]]; return [c[0] + shift, c[1]]; };
    const bars = (a, z, f) => { for (let bar = a; bar < z; bar++) f(bar, bar * 4); };

    // ── Harmony: pad chords and sub bass for the whole song ────────────────
    const harmony = [];
    bars(0, 24, bar => harmony[bar] = chordAt(bar, PROG));
    bars(24, 28, bar => harmony[bar] = chordAt(bar, PROG));
    bars(28, 32, bar => harmony[bar] = chordAt(bar - 28, ['Gm', 'Bb', 'C', 'A']));
    bars(32, 52, bar => harmony[bar] = chordAt(bar, PROG));
    bars(52, 60, bar => harmony[bar] = chordAt(bar, PROG, 2));
    harmony[60] = [N('E2'), [0, 4, 7]];
    const chordNotes = (bar, oct) => { const [r, iv] = harmony[bar]; return iv.map(k => r + k + 12 * oct); };

    bars(0, 60, bar => {
      const b = bar * 4;
      const notes = chordNotes(bar, 2);
      const soft = bar < 8 || (bar >= 24 && bar < 28) || (bar >= 48 && bar < 52);
      const v = bar < 4 ? 0.55 : soft ? 0.7 : bar >= 32 && bar < 48 ? 0.55 : 0.65;
      notes.forEach(n => add(b, 4, 'pad', n, v));
      add(b, 4, 'pad', notes[0] + 12, v * 0.6);
    });

    // ── 1. Dawn (bars 0-7) ────────────────────────────────────────────────
    // A bell climbs the chord; from bar 2 a soft kick marks the beat the
    // player jumps on.
    bars(0, 8, (bar, b) => {
      const c = chordNotes(bar, 3);
      [c[0], c[1], c[2], c[0] + 12].forEach((n, k) => add(b + k, 1.5, 'bell', n + 12, 0.42 - k * 0.03));
      if (bar >= 4) for (let k = 0; k < 8; k++) add(b + k * 0.5, 0.5, 'pluck', c[[0, 2, 1, 2, 0, 2, 1, 2][k]] + 12, 0.32 + 0.04 * (bar - 4), { cut: 0.35 + 0.08 * (bar - 4) });
      if (bar >= 2) for (let k = 0; k < 4; k++) add(b + k, 0.5, 'kick', 0, bar < 4 ? 0.55 : 0.8);
      if (bar >= 4) add(b, 4, 'sub', harmony[bar][0], 0.7);
      if (bar >= 6) for (let k = 0; k < 8; k++) add(b + k * 0.5, 0.1, 'hat', 0, k % 2 ? 0.35 : 0.18);
    });
    add(30, 2, 'swell', 0, 0.5);

    // ── 2. Pulse (bars 8-15) ──────────────────────────────────────────────
    bars(8, 16, (bar, b) => {
      const c = chordNotes(bar, 3);
      const root = harmony[bar][0];
      for (let k = 0; k < 4; k++) {
        add(b + k, 0.5, 'kick', 0, 1);
        add(b + k + 0.5, 0.25, 'ohat', 0, 0.42);
        add(b + k + 0.5, 0.45, 'bass', root + 12, 0.85);
      }
      if (bar >= 12) { add(b + 1, 0.5, 'clap', 0, 0.8); add(b + 3, 0.5, 'clap', 0, 0.8); }
      for (let k = 0; k < 16; k++) {
        const pat = [0, 1, 2, 3, 2, 1, 0, 1];
        const n = [c[0], c[1], c[2], c[0] + 12][pat[k % 8] % 4] + 12;
        add(b + k * 0.25, 0.25, 'pluck', n, 0.3, { cut: 0.5 + 0.05 * (bar - 8) });
      }
      add(b, 4, 'sub', root, 0.75);
    });
    for (let k = 0; k < 4; k++) add(63 + k * 0.25, 0.25, 'snare', 0, 0.35 + k * 0.12);
    add(62, 2, 'swell', 0, 0.7);

    // ── 3. Ascent (bars 16-23): the hook arrives with the ship ──────────
    bars(16, 24, (bar, b) => {
      const c = chordNotes(bar, 3);
      const root = harmony[bar][0];
      for (let k = 0; k < 4; k++) {
        add(b + k, 0.5, 'kick', 0, 1);
        add(b + k + 0.5, 0.25, 'ohat', 0, 0.45);
        add(b + k, 0.45, 'bass', root + 12, 0.6);
        add(b + k + 0.5, 0.45, 'bass', root + 24, 0.7);
      }
      add(b + 1, 0.5, 'clap', 0, 0.85); add(b + 3, 0.5, 'clap', 0, 0.85);
      for (let k = 0; k < 16; k++) add(b + k * 0.25, 0.25, 'hat', 0, k % 2 ? 0.2 : 0.3);
      for (let k = 0; k < 8; k++) add(b + k * 0.5, 0.5, 'pluck', [c[0], c[2], c[1] + 12, c[2]][k % 4] + 12, 0.22, { cut: 0.7 });
      add(b, 4, 'sub', root, 0.75);
    });
    HOOK.forEach(([o, d, n]) => add(64 + o, d, 'lead', n, 0.8));
    add(64, 3, 'crash', 0, 0.8); add(80, 3, 'crash', 0, 0.6);
    for (let k = 0; k < 8; k++) add(94 + k * 0.25, 0.25, 'snare', 0, 0.3 + k * 0.07);
    add(94, 2, 'swell', 0, 0.6);

    // ── 4. Inversion (bars 24-31): breakdown, then the build ─────────────
    bars(24, 28, (bar, b) => {
      const c = chordNotes(bar, 3);
      add(b, 4, 'sub', harmony[bar][0], 0.8);
      add(b, 0.5, 'kick', 0, 0.75); add(b + 2, 0.5, 'kick', 0, 0.6);
      for (let k = 0; k < 8; k++) add(b + k * 0.5, 0.5, 'pluck', [c[0], c[1], c[2], c[1]][k % 4] + 24, 0.2, { cut: 0.25 });
    });
    // the hook, distant and filtered, an octave down
    HOOK.slice(0, 18).forEach(([o, d, n]) => add(96 + o, d, 'bell', n, 0.4));
    bars(28, 32, (bar, b) => {
      const c = chordNotes(bar, 3);
      const k0 = bar - 28;
      for (let k = 0; k < 4; k++) if (!(bar === 31 && k === 3)) add(b + k, 0.5, 'kick', 0, 0.6 + k0 * 0.12);
      const div = [1, 2, 4, 8][k0];
      const n = bar === 31 ? 3 * div : 4 * div;
      for (let k = 0; k < n; k++) add(b + k / div, 1 / div, 'snare', 0, 0.25 + 0.55 * (k0 * 4 * div + k) / (16 * div));
      for (let k = 0; k < (bar === 31 ? 12 : 16); k++) add(b + k * 0.25, 0.25, 'pluck', [c[0], c[1], c[2], c[0] + 12][k % 4] + 12 + (k0 >= 2 ? 12 : 0), 0.22 + k0 * 0.04, { cut: 0.3 + k0 * 0.18 });
      add(b, bar === 31 ? 3 : 4, 'sub', harmony[bar][0], 0.75);
      add(b + 0.5, 0.4, 'bass', harmony[bar][0] + 12, 0.4 + k0 * 0.1);
      add(b + 2.5, 0.4, 'bass', harmony[bar][0] + 12, 0.4 + k0 * 0.1);
    });
    add(112, 15.5, 'riser', 0, 0.9);

    // ── 5. Supernova (bars 32-47): the drop ───────────────────────────────
    add(128, 4, 'impact', 0, 1);
    bars(32, 48, (bar, b) => {
      const c = chordNotes(bar, 4);
      const root = harmony[bar][0];
      for (let k = 0; k < 4; k++) {
        add(b + k, 0.5, 'kick', 0, 1.1);
        add(b + k + 0.5, 0.25, 'ohat', 0, 0.5);
        add(b + k + 0.5, 0.4, 'stab', 0, 0.75, { notes: c });
      }
      for (let k = 0; k < 16; k++) add(b + k * 0.25, 0.25, 'hat', 0, k % 4 === 2 ? 0.1 : 0.22);
      add(b + 1, 0.5, 'clap', 0, 1); add(b + 3, 0.5, 'clap', 0, 1);
      const bassPat = [0, 0, 12, 0, 0, 12, 0, 7];
      for (let k = 0; k < 8; k++) add(b + k * 0.5, 0.45, 'growl', root + 12 + bassPat[k], 0.9);
      add(b, 4, 'sub', root, 0.85);
      if (bar % 4 === 0) add(b, 3, 'crash', 0, 0.85);
      if (bar >= 40) for (let k = 0; k < 16; k++) add(b + k * 0.25, 0.25, 'pluck', [c[0], c[1], c[2], c[0] + 12][(k * 3) % 4] + 12, 0.16, { cut: 0.8 });
    });
    HOOK.forEach(([o, d, n]) => { add(128 + o, d, 'lead', n + 12, 0.8); add(128 + o, d, 'lead', n, 0.45); });
    HOOK.forEach(([o, d, n]) => { add(160 + o, d, 'lead', n + 12, 0.85); add(160 + o, d, 'lead', below(n + 12, 2), 0.4); });
    for (let k = 0; k < 8; k++) add(190 + k * 0.25, 0.25, 'snare', 0, 0.35 + k * 0.08);
    add(190, 2, 'swell', 0, 0.7);

    // ── 6. Echo (bars 48-51): breathe; bell notes fall on the jumps ──────
    add(192, 4, 'impact', 0, 0.45);
    bars(48, 52, (bar, b) => add(b, 4, 'sub', harmony[bar][0], 0.6));
    [[192, 'A4'], [193, 'D5'], [194, 'E5'], [195, 'F5'], [197, 'E5'], [198, 'D5'], [199, 'F5'],
      [201, 'C5'], [202, 'D5'], [203, 'A5'], [205, 'G5'], [206, 'E5']].forEach(([b, n]) => add(b, 2, 'bell', N(n), 0.5));
    add(204, 4, 'riser', 0, 0.55);
    add(206, 2, 'swell', 0, 0.8);

    // ── 7. Ascension (bars 52-59): up a whole step, everything at once ──
    add(208, 3, 'crash', 0, 0.9);
    bars(52, 60, (bar, b) => {
      const c = chordNotes(bar, 4);
      const root = harmony[bar][0];
      const top = bar >= 56;
      for (let k = 0; k < 4; k++) {
        add(b + k, 0.5, 'kick', 0, 1.1);
        add(b + k + 0.5, 0.25, 'ohat', 0, 0.5);
        if (top) add(b + k + 0.5, 0.4, 'stab', 0, 0.7, { notes: c });
      }
      add(b + 1, 0.5, 'clap', 0, 1); add(b + 3, 0.5, 'clap', 0, 1);
      for (let k = 0; k < 16; k++) add(b + k * 0.25, 0.25, 'hat', 0, 0.2);
      for (let k = 0; k < 16; k++) add(b + k * 0.25, 0.25, 'pluck', [c[0], c[1], c[2], c[0] + 12][k % 4] + (top ? 12 : 0), 0.2, { cut: 0.6 + (bar - 52) * 0.05 });
      const bassPat = [0, 0, 12, 0, 0, 12, 0, 7];
      for (let k = 0; k < 8; k++) add(b + k * 0.5, 0.45, top ? 'growl' : 'bass', root + 12 + (top ? bassPat[k] : 0), 0.85);
      add(b, 4, 'sub', root, 0.85);
      if (bar === 56) add(b, 3, 'crash', 0, 0.9);
    });
    HOOK.slice(0, 18).forEach(([o, d, n]) => add(208 + o, d, 'lead', n + 2, 0.7));
    HOOK.slice(18).forEach(([o, d, n]) => { add(224 + o - 16, d, 'lead', n + 14, 0.85); add(224 + o - 16, d, 'lead', n + 2, 0.5); });
    add(236, 4, 'riser', 0, 0.7);
    for (let k = 0; k < 16; k++) add(236 + k * 0.25, 0.25, 'snare', 0, 0.3 + k * 0.045);

    // ── Finale (bar 60): E major, and the light fades out ────────────────
    add(240, 6, 'impact', 0, 1);
    add(240, 4, 'crash', 0, 1);
    const fin = [N('E3'), N('G#3'), N('B3'), N('E4'), N('G#4'), N('B4')];
    fin.forEach(n => add(240, 10, 'pad', n, 0.75));
    add(240, 8, 'sub', N('E2'), 0.9);
    add(240, 1.5, 'stab', 0, 0.9, { notes: [N('E4'), N('G#4'), N('B4'), N('E5')] });
    add(240, 6, 'lead', N('E5') + 12, 0.7);
    add(240, 6, 'lead', N('B5'), 0.4);
    [N('E5'), N('G#5'), N('B5'), N('E6'), N('B5'), N('G#5'), N('E6'), N('B6')].forEach((n, k) => add(242 + k * 0.5, 2, 'bell', n, 0.35 - k * 0.02));

    ev.sort((a, b) => a.b - b.b);
    return ev;
  }

  const events = compose();
  const LENGTH_BEATS = 256;

  // Per-section energy, 0 to 1, for the visuals.
  const ENERGY = [[0, 0.25], [8, 0.35], [32, 0.55], [64, 0.7], [96, 0.35], [112, 0.6], [127, 0.2], [128, 1], [192, 0.3], [208, 0.85], [224, 0.95], [240, 1], [244, 0.4]];

  const times = inst => events.filter(e => e.i === inst).map(e => e.b * L.BEAT);
  const kicks = times('kick');
  const snares = events.filter(e => e.i === 'clap' || e.i === 'snare').map(e => e.b * L.BEAT);
  const crashes = times('crash').concat(times('impact'));

  const envAt = (list, t, decay) => {
    const i = L.lastAtOrBefore(list, t, x => x);
    return i < 0 ? 0 : Math.exp(-(t - list[i]) / decay);
  };

  L.song = {
    events, LENGTH_BEATS, duration: LENGTH_BEATS * L.BEAT + 4, HOOK, harmony: null,
    kicks, snares, crashes,
    // Visual signals at song time t.
    signals(t) {
      const beat = t / L.BEAT;
      let energy = 0.3;
      for (let i = 0; i < ENERGY.length; i++) {
        if (ENERGY[i][0] <= beat) {
          const nx = ENERGY[i + 1];
          energy = nx && nx[0] - ENERGY[i][0] <= 1 ? ENERGY[i][1] : ENERGY[i][1];
        }
      }
      return {
        beat, bar: beat / 4, energy,
        kick: envAt(kicks, t, 0.12),
        snare: envAt(snares, t, 0.1),
        crash: envAt(crashes, t, 0.6),
      };
    },
  };
})(globalThis.LUMINAL = globalThis.LUMINAL || {});
