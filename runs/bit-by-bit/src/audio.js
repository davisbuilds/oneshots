// audio.js: a few synthesized sounds. Pitch follows value, so a sorted row
// sounds like a rising scale.
(() => {
  let ac = null, master = null;
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
  const sfx = BB.sfx = { on: true };
  const ctx = () => {
    if (!sfx.on) return null;
    try {
      if (!ac) { const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return null; ac = new AC(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination); }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    } catch (e) { return null; }
  };
  const note = (freq, o = {}) => {
    const a = ctx(); if (!a) return;
    const t = a.currentTime + (o.at || 0), dur = o.dur || 0.22;
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = o.type || 'triangle'; osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.3, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + dur + 0.03);
  };
  const pitch = (v) => 220 * 2 ** (SCALE[Math.max(0, Math.min(SCALE.length - 1, Math.round((v || 0) * (SCALE.length - 1))))] / 12);
  sfx.play = (ev) => {
    const v = ev.v;
    if (ev.t === 'reveal') { note(pitch(v), { dur: 0.3 }); note(pitch(v) * 2, { dur: 0.12, vol: 0.08, type: 'sine' }); }
    else if (ev.t === 'move') note(pitch(v), { dur: 0.12, vol: 0.2 });
    else if (ev.t === 'weigh') { note(160, { dur: 0.09, type: 'square', vol: 0.1 }); note(pitch(v), { at: 0.08, dur: 0.2 }); }
    else if (ev.t === 'good') { note(pitch(0.4), { dur: 0.12 }); note(pitch(0.7), { at: 0.09, dur: 0.2 }); }
    else if (ev.t === 'found') [0.3, 0.5, 0.7, 1].forEach((p, i) => note(pitch(p), { at: i * 0.07, dur: 0.25 }));
    else if (ev.t === 'strike') { note(150, { dur: 0.3, type: 'sawtooth', vol: 0.16, slide: 80 }); }
    else if (ev.t === 'no') note(190, { dur: 0.07, type: 'square', vol: 0.07 });
    else if (ev.t === 'gc') note(500, { dur: 0.4, type: 'sawtooth', vol: 0.12, slide: 60 });
    else if (ev.t === 'arrive' || ev.t === 'deq' || ev.t === 'relax') note(pitch(0.15), { dur: 0.06, vol: 0.08 });
    else if (ev.t === 'win') [0, 4, 7, 12, 16].forEach((semi, i) => note(330 * 2 ** (semi / 12), { at: i * 0.09, dur: 0.4, vol: 0.25 }));
    else if (ev.t === 'lose') [7, 4, 0].forEach((semi, i) => note(196 * 2 ** (semi / 12), { at: i * 0.16, dur: 0.35, type: 'sawtooth', vol: 0.1 }));
    else if (ev.t === 'star') note(880 * 2 ** ((v || 0) * 4 / 12), { dur: 0.3, type: 'sine', vol: 0.25 });
    else if (ev.t === 'ui') note(520, { dur: 0.05, vol: 0.08, type: 'sine' });
  };
})();
