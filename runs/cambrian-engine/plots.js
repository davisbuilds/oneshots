'use strict';
const Plots = (() => {
  const ink = '#bfdea2',
    muted = '#94a99e',
    grid = '#2b3d37';
  function surface(canvas, h) {
    if (h !== undefined) canvas.style.height = h + 'px';
    const box = canvas.getBoundingClientRect(),
      w = box.width,
      height = box.height;
    if (!w || !height) return null;
    const d = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * d) || canvas.height !== Math.round(height * d)) {
      canvas.width = Math.round(w * d);
      canvas.height = Math.round(height * d);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, w, height);
    ctx.lineWidth = 1;
    ctx.font = '9px Menlo, Consolas, monospace';
    ctx.textBaseline = 'middle';
    return { ctx, w, h: height };
  }
  function segment(c, x1, y1, x2, y2) {
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }
  function series(canvas, samples, metric, viewTick) {
    const box = surface(canvas);
    if (!box || !samples.length) return;
    const { ctx: c, w, h } = box,
      left = 37,
      right = w - 9,
      base = h - 17,
      top = 8;
    const end = Math.max(1, samples.at(-1).tick);
    const max = Math.max(1, ...samples.map((s) => s[metric]));
    const x = (t) => left + ((right - left) * t) / end;
    const y = (n) => base - ((base - top) * n) / max;
    c.fillStyle = muted;
    c.strokeStyle = grid;
    c.textAlign = 'right';
    for (const n of [0, max]) {
      c.fillText(metric === 'diversity' ? n.toFixed(1) : Math.round(n), left - 7, y(n));
      segment(c, left, y(n), right, y(n));
    }
    c.fillStyle = muted;
    c.textAlign = 'left';
    c.fillText('0', left, h - 6);
    c.textAlign = 'right';
    c.fillText('t ' + end.toLocaleString('en-US'), right, h - 6);
    c.beginPath();
    const stride = Math.max(1, Math.floor(samples.length / (w * 1.8)));
    samples.forEach((s, i) => {
      if (i % stride !== 0 && i !== samples.length - 1) return;
      if (i === 0) c.moveTo(x(s.tick), y(s[metric]));
      else c.lineTo(x(s.tick), y(s[metric]));
    });
    c.strokeStyle = ink;
    c.lineWidth = 1.6;
    c.stroke();
    c.lineTo(x(samples.at(-1).tick), base);
    c.lineTo(left, base);
    c.closePath();
    const fade = c.createLinearGradient(0, top, 0, base);
    fade.addColorStop(0, '#b2dc7930');
    fade.addColorStop(1, '#b2dc7902');
    c.fillStyle = fade;
    c.fill();
    if (viewTick < end) {
      c.setLineDash([3, 3]);
      c.strokeStyle = '#efce94';
      segment(c, x(viewTick), top, x(viewTick), base);
      c.setLineDash([]);
    }
  }
  function histogram(canvas, organisms, gene) {
    const box = surface(canvas);
    if (!box) return;
    const { ctx: c, w, h } = box,
      bins = Array(12).fill(0);
    for (const o of organisms) bins[Math.min(11, Math.floor(12 * o.genome[gene]))]++;
    const max = Math.max(1, ...bins),
      left = 24,
      width = (w - left - 5) / 12,
      base = h - 18;
    bins.forEach((v, i) => {
      const bar = ((base - 9) * v) / max;
      c.fillStyle = i % 2 ? '#90be98' : '#b4cf95';
      c.fillRect(left + i * width + 1, base - bar, Math.max(1, width - 3), bar);
    });
    c.fillStyle = muted;
    c.fillText(String(max), 0, 9);
    c.fillText('0', left, h - 6);
    c.textAlign = 'right';
    c.fillText('1', w - 4, h - 6);
  }
  function habitat(canvas, world, initialShare, gut) {
    const box = surface(canvas);
    if (!box) return [];
    const { ctx: c, w, h } = box,
      left = 42,
      right = w - 14,
      top = 10,
      base = h - 19;
    const x = (g) => left + (right - left) * g;
    const y = (v) => base - (base - top) * v;
    c.textAlign = 'right';
    c.strokeStyle = grid;
    c.fillStyle = muted;
    for (const v of [0, 0.5, 1]) {
      segment(c, left, y(v), right, y(v));
      c.fillText(100 * v + '%', left - 5, y(v));
    }
    c.textAlign = 'left';
    c.fillText('Low gut', left, h - 5);
    c.textAlign = 'right';
    c.fillText('High gut', right, h - 5);
    const points = [];
    for (const o of world.organisms) {
      const column = Math.floor((o.x * world.cols) / world.width),
        row = Math.floor((o.y * world.rows) / world.height);
      const g = o.genome[gut],
        share = initialShare[row * world.cols + column];
      const px = x(g),
        py = y(share);
      c.fillStyle = g < 1 / 3 ? '#9fdfb49c' : g >= 2 / 3 ? '#efbc83aa' : '#a9beb78c';
      c.beginPath();
      c.arc(px, py, 2.65, 0, Math.PI * 2);
      c.fill();
      points.push({ x: px, y: py, o, share, g });
    }
    return points;
  }
  function familyOf(world, id) {
    let node = world.lineages[id - 1];
    while (node?.parentId) node = world.lineages[node.parentId - 1];
    return node?.id ?? null;
  }
  function familyRows(world, rootId) {
    const members = new Set([rootId]),
      children = new Map();
    for (const l of world.lineages) {
      if (!members.has(l.parentId)) continue;
      members.add(l.id);
      if (!children.has(l.parentId)) children.set(l.parentId, []);
      children.get(l.parentId).push(l.id);
    }
    const rows = [],
      queue = [rootId];
    while (queue.length) {
      const id = queue.pop(),
        node = world.lineages[id - 1];
      if (!node) continue;
      rows.push(node);
      const kids = children.get(id) ?? [];
      for (let i = kids.length - 1; i >= 0; i--) queue.push(kids[i]);
    }
    return rows;
  }
  const pageSize = 10;
  function tree(canvas, rows, page, selected, tick) {
    const group = rows.slice(page * pageSize, (page + 1) * pageSize);
    const box = surface(canvas, Math.max(139, group.length * 24 + 42));
    if (!box) return [];
    const { ctx: c, w, h } = box,
      left = 57,
      end = w - 17,
      axis = h - 21,
      span = Math.max(1, tick);
    const x = (t) => left + ((end - left) * t) / span;
    const ypos = new Map(group.map((l, i) => [l.id, 15 + i * 24]));
    c.textAlign = 'left';
    c.fillStyle = muted;
    c.strokeStyle = grid;
    for (let i = 0; i <= 3; i++) {
      const px = left + ((end - left) * i) / 3;
      segment(c, px, 4, px, axis);
      c.textAlign = i === 3 ? 'right' : 'left';
      c.fillText(Math.round((span * i) / 3).toString(), px, axis + 11);
    }
    for (const l of group) {
      const y = ypos.get(l.id),
        start = x(l.origin),
        finish = x(l.extinct ?? tick);
      if (selected === l.id) {
        c.fillStyle = '#b4dc8919';
        c.fillRect(0, y - 10, w, 20);
      }
      if (l.parentId) {
        c.strokeStyle = '#547466';
        segment(c, start, ypos.get(l.parentId) ?? 3, start, y);
      }
      c.strokeStyle = l.extinct === null ? '#9ad6af' : '#64776e';
      c.lineWidth = l.id === selected ? 2.5 : 1.5;
      segment(c, start, y, finish, y);
      c.fillStyle = c.strokeStyle;
      c.beginPath();
      c.arc(start, y, 2.7, 0, Math.PI * 2);
      c.fill();
      if (l.extinct === null) {
        c.beginPath();
        c.arc(finish, y, 3.4, 0, Math.PI * 2);
        c.fill();
      } else {
        segment(c, finish - 2.5, y - 3, finish + 2.5, y + 3);
        segment(c, finish - 2.5, y + 3, finish + 2.5, y - 3);
      }
      c.fillStyle = l.id === selected ? ink : muted;
      c.textAlign = 'left';
      c.fillText('L·' + l.id, 3, y);
    }
    return group.map((l) => ({ id: l.id, y: ypos.get(l.id) }));
  }
  return { series, histogram, habitat, familyOf, familyRows, tree, pageSize };
})();
