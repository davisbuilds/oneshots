// views/search.js: lockers and boxes, the million-number line, and the
// sliding row.
(() => {
  const { h, range } = BB, D = BB.draw, V = BB.views;
  const fmt = (n) => n.toLocaleString('en-US');

  V.boxes = (s, c) => {
    const { W, H } = c, out = [];
    const f = D.flow(s.n, { x: 30, y: H * 0.36, w: W - 60, h: H * 0.5 }, { max: 74, min: 46, vgap: 0.75 });
    // What we are looking for, pinned above the row.
    if (s.mode === 'index') {
      const w = Math.min(54, (W - 60) / s.word.length - 10);
      out.push(D.text('cap', W / 2, H * 0.1, 'Collected', 'dimt', 15));
      s.word.split('').forEach((ch, i) => out.push(D.tile('w' + i, W / 2 + (i - (s.word.length - 1) / 2) * (w + 10), H * 0.2, { w, text: i < s.got.length ? ch : '', cls: i < s.got.length ? 'acc flat' : 'ghost' })));
    } else {
      out.push(D.text('cap', W / 2, H * 0.09, 'Looking for', 'dimt', 15));
      out.push(D.tile('target', W / 2, H * 0.2, { w: 78, h: 62, text: s.target, cls: 'sel' }));
    }
    range(s.n).forEach((i) => {
      const p = f.pos[i], v = s.open[i], closed = v == null;
      const out_ = s.mode === 'binary' && closed && (i < s.lo || i > s.hi);
      let cls = closed ? 'hid' : '';
      if (s.note[i] === 'hit' || (s.mode === 'index' && !closed)) cls = 'good';
      if (out_) cls += ' dim';
      if (!closed && s.mode === 'binary' && s.note[i] !== 'hit') cls += ' faint';
      if (c.hot((a) => a.i === i)) cls += ' hot';
      const mark = s.note[i] === 'lo' ? 'too small ▸' : s.note[i] === 'hi' ? '◂ too big' : null;
      out.push(D.tile('b' + i, p.x, p.y, { w: f.s, text: closed ? '?' : v, cls, sub: `[${i}]`, top: f.s > 52 ? mark : (mark ? (s.note[i] === 'lo' ? '▸' : '◂') : null),
        on: closed && s.status === 'play' ? () => c.act({ t: 'peek', i }) : null, label: closed ? `Box ${i}, closed` : `Box ${i}: ${v}` }));
    });
    if (s.mode === 'binary' && s.status === 'play' && s.ops > 0) out.push(D.text('left', W / 2, H - 22, `${s.hi - s.lo + 1} of ${s.n} boxes still possible`, 'dimt', 16));
    return out;
  };

  V.zoom = (s, c) => {
    const { W, H, ui } = c, out = [];
    const x0 = 60, x1 = W - 60, y = H * 0.5, span = s.hi - s.lo;
    const mid = Math.floor((s.lo + s.hi) / 2);
    if (ui.g == null || ui.g < s.lo || ui.g > s.hi) ui.g = s.lo + Math.floor(span * 0.3);
    if (c.hint && c.hint.g != null) ui.g = c.hint.g;
    const toX = (g) => (span ? x0 + ((g - s.lo) / span) * (x1 - x0) : (x0 + x1) / 2);
    const setFromX = (x) => {
      let g = Math.round(s.lo + Math.max(0, Math.min(1, (x - x0) / (x1 - x0))) * span);
      if (Math.abs(toX(g) - toX(mid)) < 14) g = mid; // the marker catches on the centre notch
      ui.g = g; c.redraw();
    };
    const drag = (e) => { if (c.demo || s.status !== 'play') return; e.preventDefault(); const svg = e.currentTarget.ownerSVGElement; setFromX(c.pt(e).x); const mv = (ev) => setFromX(c.pt(ev).x); const up = () => { svg.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }; svg.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); };
    const nudge = (d) => () => { ui.g = Math.max(s.lo, Math.min(s.hi, ui.g + d)); c.redraw(); };
    // Lamps: one per yes-or-no answer still needed in the worst case.
    const bits = Math.ceil(Math.log2(span + 2)), total = s.par, lw = Math.min(30, (W - 80) / total - 6);
    out.push(D.text('lamps', W / 2, H * 0.085, s.status === 'won' ? 'No doubt left' : `${bits} ${bits === 1 ? 'bit' : 'bits'} of doubt left`, '', 17));
    range(total).forEach((i) => out.push(h('rect', { key: 'lamp' + i, class: i < bits ? 'fill-mus' : 'fill-dim', x: W / 2 + (i - total / 2) * (lw + 6) + 3, y: H * 0.115, width: lw, height: 16, rx: 5 })));
    out.push(D.text('rem', W / 2, H * 0.27, s.status === 'won' ? `It was ${fmt(s.lo)}` : `${fmt(span + 1)} ${span ? 'numbers' : 'number'} left`, 'dimt', 16));
    // The range that is still possible.
    out.push(h('rect', { key: 'track', class: 'panel grab', x: x0, y: y - 15, width: x1 - x0, height: 30, rx: 15, onpointerdown: drag }));
    out.push(D.line('notch', toX(mid), y - 26, toX(mid), y + 26, 'wire thin dimw'));
    out.push(D.text('lo', x0, y + 52, fmt(s.lo), 'mono', 15), D.text('hi', x1, y + 52, fmt(s.hi), 'mono', 15));
    if (s.status === 'play') {
      const gx = toX(ui.g);
      out.push(h('g', { key: 'knob', class: 'mv grab', style: D.at(gx, y), onpointerdown: drag, tabindex: 0, role: 'slider', 'aria-label': 'Your guess', 'aria-valuenow': ui.g, 'aria-valuemin': s.lo, 'aria-valuemax': s.hi,
        onkeydown: (e) => { const step = e.shiftKey ? 1 : Math.max(1, Math.round(span / 50)); if (e.key === 'ArrowLeft') nudge(-step)(); else if (e.key === 'ArrowRight') nudge(step)(); else if (e.key === 'Home' || e.key === 'm') { ui.g = mid; c.redraw(); } else if (e.key === 'Enter') c.act({ t: 'guess', g: ui.g }); } },
        h('rect', { class: 'fill-ink', x: -11, y: -27, width: 28, height: 60, rx: 9 }), h('rect', { class: 'fill-acc', x: -14, y: -31, width: 28, height: 60, rx: 9 })));
      const by = H * 0.76, small = c.portrait;
      out.push(D.tile('val', W / 2, by, { w: small ? 150 : 190, h: 54, text: fmt(ui.g), font: 26, cls: c.hint ? 'hot' : '' }));
      out.push(D.btn('m1', W / 2 - (small ? 118 : 150), by, '−1', nudge(-1), { w: 58 }), D.btn('p1', W / 2 + (small ? 118 : 150), by, '+1', nudge(1), { w: 58 }));
      out.push(D.btn('guess', W / 2, by + 62, 'Guess', () => c.act({ t: 'guess', g: ui.g }), { cls: 'go', w: 150, h: 48 }));
    }
    // The last few answers.
    s.log.slice(-3).forEach((e, i, a) => out.push(D.text('log' + (s.log.length - a.length + i), W / 2, H * 0.33 + i * 20, `${fmt(e.g)}: ${e.ans === 'hit' ? 'got it' : e.ans}`, i === a.length - 1 ? '' : 'dimt', 14)));
    return out;
  };

  V.shift = (s, c) => {
    const { W, H } = c, out = [], n = s.cells.length;
    const f = D.flow(n, { x: 24, y: H * 0.42, w: W - 48, h: H * 0.4 }, { max: 76, min: 44, vgap: 0.7 });
    const g = s.gap;
    range(n).forEach((i) => out.push(D.tile('slot' + i, f.pos[i].x, f.pos[i].y, { w: f.s, cls: 'ghost' + (i === g && s.status === 'play' ? ' tap' : '') + (i === g && c.hot((a) => a.t === 'place') ? ' hot' : ''), sub: `[${i}]`,
      on: i === g && s.status === 'play' ? () => c.act({ t: 'place' }) : null, label: i === g ? 'Empty slot: place the new value here' : `Slot ${i}` })));
    s.cells.forEach((v, i) => {
      if (v == null) return;
      const movable = Math.abs(i - g) === 1 && s.status === 'play';
      out.push(D.tile('v' + v, f.pos[i].x, f.pos[i].y, { w: f.s, text: v, cls: (v === s.placed ? 'good' : '') + (c.hot((a) => a.t === 'shift' && a.i === i) ? ' hot' : ''), on: movable ? () => c.act({ t: 'shift', i }) : null, label: `${v}, slot ${i}` }));
    });
    if (s.x != null && g >= 0) {
      out.push(D.text('cap', f.pos[g].x, f.pos[g].y - f.s * 1.75, 'new', 'dimt', 14));
      out.push(D.tile('v' + s.x, f.pos[g].x, f.pos[g].y - f.s * 1.2, { w: f.s, text: s.x, cls: 'sel', on: s.status === 'play' ? () => c.act({ t: 'place' }) : null, label: `New value ${s.x}: place it in the gap` }));
    }
    out.push(D.text('note', W / 2, H - 22, 'Tap a tile beside the gap to slide it over. Tap the gap to drop the new value in.', 'dimt', c.portrait ? 12.5 : 15));
    return out;
  };
})();
