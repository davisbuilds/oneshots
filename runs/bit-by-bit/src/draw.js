// draw.js: the shapes every view is built from. All coordinates are in the
// stage's own units; the SVG viewBox scales them to the screen.
(() => {
  const h = BB.h;
  const D = BB.draw = {};
  const at = (x, y, k) => ({ transform: `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)` + (k != null && k !== 1 ? ` scale(${k})` : '') });
  const tap = (on, label) => (on ? { onclick: on, tabindex: 0, role: 'button', 'aria-label': label } : { 'aria-label': label });

  // A paper tile centred on (x, y). o: w, h, text, cls, on, sub, top, k, r, font, label.
  D.tile = (key, x, y, o = {}) => {
    const w = o.w || 56, ht = o.h || w, r = o.r != null ? o.r : Math.min(12, ht * 0.22), font = o.font || Math.min(ht * 0.44, (w * 1.5) / Math.max(2, String(o.text == null ? '' : o.text).length));
    return h('g', { key, class: 'mv tile ' + (o.cls || '') + (o.on ? ' tap' : ''), style: at(x, y, o.k), ...tap(o.on, o.label || String(o.text == null ? key : o.text)) },
      h('rect', { class: 'sh', x: -w / 2 + 3, y: -ht / 2 + 4, width: w, height: ht, rx: r }),
      h('g', { class: 'face' },
        h('rect', { class: 'bg', x: -w / 2, y: -ht / 2, width: w, height: ht, rx: r }),
        o.text != null && h('text', { class: 'tx', y: font * 0.36, 'font-size': font.toFixed(1), text: o.text }),
        o.top != null && h('text', { class: 'top', y: -ht / 2 - 7, text: o.top }),
        o.inner),
      o.sub != null && h('text', { class: 'sub', y: ht / 2 + 19, text: o.sub }));
  };
  D.node = (key, x, y, o = {}) => {
    const r = o.r || 24, font = o.font || r * (String(o.text == null ? '' : o.text).length > 2 ? 0.62 : 0.82);
    return h('g', { key, class: 'mv tile node ' + (o.cls || '') + (o.on ? ' tap' : ''), style: at(x, y, o.k), ...tap(o.on, o.label || String(o.text == null ? key : o.text)) },
      h('circle', { class: 'sh', cx: 2.5, cy: 3.5, r }),
      h('g', { class: 'face' },
        h('circle', { class: 'bg', r }),
        o.text != null && h('text', { class: 'tx', y: font * 0.36, 'font-size': font.toFixed(1), text: o.text }),
        o.inner),
      o.badge != null && h('g', { class: 'badge ' + (o.badgeCls || ''), style: at(r * 0.82, -r * 0.82) }, h('circle', { r: 12 }), h('text', { y: 4.5, text: o.badge })),
      o.sub != null && h('text', { class: 'sub', y: r + 18, text: o.sub }));
  };
  D.text = (key, x, y, text, cls, size) => h('text', { key, class: 'mv lbl ' + (cls || ''), style: at(x, y), 'font-size': size || 16, text });
  // Paths animate between shapes in browsers that support the CSS d property.
  D.path = (key, d, cls, extra) => h('path', { key, class: cls || 'wire', d, style: { d: `path("${d}")` }, ...(extra || {}) });
  D.line = (key, x1, y1, x2, y2, cls, extra) => D.path(key, `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`, cls, extra);
  // An arrow from (x1,y1) to (x2,y2), stopping `pad` short, optionally bowed.
  D.arrow = (key, x1, y1, x2, y2, cls, o = {}) => {
    const bend = o.bend || 0, pad = o.pad || 0, pad0 = o.pad0 || 0;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const cx = mx - (dy / len) * bend, cy = my + (dx / len) * bend;
    const unit = (ax, ay, bx, by) => { const l = Math.hypot(bx - ax, by - ay) || 1; return [(bx - ax) / l, (by - ay) / l]; };
    const [ux, uy] = unit(cx, cy, x2, y2), [vx, vy] = unit(x1, y1, cx, cy);
    const ex = x2 - ux * pad, ey = y2 - uy * pad, sx = x1 + vx * pad0, sy = y1 + vy * pad0, a = o.head || 9;
    const p = (n) => n.toFixed(1);
    const d = `M${p(sx)} ${p(sy)}Q${p(cx)} ${p(cy)} ${p(ex)} ${p(ey)}M${p(ex - ux * a - uy * a * 0.6)} ${p(ey - uy * a + ux * a * 0.6)}L${p(ex)} ${p(ey)}L${p(ex - ux * a + uy * a * 0.6)} ${p(ey - uy * a - ux * a * 0.6)}`;
    return D.path(key, d, cls || 'wire', o.extra);
  };
  D.rect = (key, x, y, w, ht, cls, extra) => h('rect', { key, class: cls, x, y, width: w, height: ht, rx: 10, ...(extra || {}) });
  D.btn = (key, x, y, text, on, o = {}) => D.tile(key, x, y, { w: o.w || Math.max(96, text.length * 11 + 36), h: o.h || 44, r: 22, text, font: o.font || 17, cls: 'btn ' + (o.cls || ''), on, label: text });

  // Lay n squares out in a box, wrapping onto more rows when they get small.
  D.flow = (n, box, o = {}) => {
    const gap = o.gap != null ? o.gap : 0.16, vgap = o.vgap != null ? o.vgap : 0.5, max = o.max || 64, min = o.min || 40;
    let best = null;
    for (let rows = 1; rows <= (o.rows || 4); rows++) {
      const cols = Math.ceil(n / rows);
      const s = Math.min(max, box.w / (cols + (cols - 1) * gap), box.h / (rows + (rows - 1) * vgap));
      if (!best || s > best.s + 0.5) best = { s, rows, cols };
      if (s >= min) break;
    }
    const { s, rows, cols } = best, stepX = s * (1 + gap), stepY = s * (1 + vgap);
    const y0 = box.y + (box.h - (rows * s + (rows - 1) * s * vgap)) / 2 + s / 2;
    const pos = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), inRow = r === rows - 1 ? n - cols * (rows - 1) : cols;
      const x0 = box.x + (box.w - (inRow * s + (inRow - 1) * s * gap)) / 2 + s / 2;
      pos.push({ x: x0 + (i % cols) * stepX, y: y0 + r * stepY });
    }
    return { s, rows, cols, pos, stepX, stepY };
  };
  D.at = at;
})();
