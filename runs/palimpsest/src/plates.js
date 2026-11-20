'use strict';
// The specimen painter revolves vessel profiles and lights their surface at each pixel.
const paths = {
  dig: 'M3 17l5-5 4 4-5 5H3z M10 14l6-6 M14 7l3-3 4 4-3 3z',
  book: 'M3 4h6q2 0 3 2 1-2 3-2h6v15h-6q-2 0-3 2-1-2-3-2H3z M12 6v15',
  film: 'M3 5h18v14H3z M3 9h18 M7 5l-2 4 M13 5l-2 4 M19 5l-2 4 M10 12l4 2-4 2z',
  help: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z M9 9a3 3 0 1 1 4 3c-1 0-1 1-1 2 M12 17h.01',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0z M14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
  finger:
    'M3 17c0-9 3-14 9-14 5 0 9 4 9 9 M6 20c0-5 0-14 6-14 4 0 6 3 6 7l1 5 M9 21c2-4-1-12 3-12 3 0 2 4 3 9l1 3 M12 13l.4 7',
  down: 'm6 9 6 6 6-6',
  right: 'm9 6 6 6-6 6',
  left: 'm15 6-6 6 6 6',
  arrow: 'M4 12h15m-5-5 5 5-5 5',
  orbit: 'M3 14c-2-5 10-11 17-9 7 3-7 14-14 12 M7 7c-3-1-3 3-2 5 M9 16c4 6 9 6 9 1',
  frame: 'M9 4H4v5 M15 4h5v5 M4 15v5h5 M20 15v5h-5',
  tag: 'M3 3h9l9 9-9 9-9-9z M8 8h.1',
  close: 'm6 6 12 12 M18 6 6 18',
  layers: 'm2 7 10-5 10 5-10 5z M2 12l10 5 10-5 M2 17l10 5 10-5',
  box: 'm3 7 9-5 9 5-9 5z M3 7v10l9 5 9-5V7 M12 12v10',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  play: 'm8 4 12 8-12 8z',
  pause: 'M8 4v16 M16 4v16',
  check: 'm4 12 5 5 11-11',
  edit: 'm4 17 1 3 4-1L20 8l-4-4z',
};
const icon = (name) =>
  '<i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="' + paths[name] + '"/></svg></i>';
function sampleCanvas(canvas, kind, detail = false) {
  const w = (canvas.width = 400),
    h = (canvas.height = 240),
    ctx = canvas.getContext('2d'),
    r = randomSource(5821);
  ctx.strokeStyle = '#a7a28b16';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < w; i += 22) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, h);
    ctx.stroke();
  }
  for (let i = 0; i < h; i += 22) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(w, i);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(w * 0.5, h * 0.51);
  ctx.scale(detail ? 2.9 : 1.14, detail ? 2.9 : 1.14);
  if (detail) ctx.translate(0, 8);
  const shape = (points, fill) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  function facet(points, color, grit) {
    shape(points, color);
    ctx.save();
    ctx.clip();
    for (let i = 0; i < 4200; i++) {
      const x = r() * 170 - 85,
        y = r() * 150 - 75;
      ctx.fillStyle = r() < 0.6 ? 'rgba(48,36,23,' + grit + ')' : 'rgba(255,235,184,' + grit + ')';
      ctx.fillRect(x, y, r() * 1.7 + 0.4, r() * 1.2 + 0.3);
    }
    ctx.restore();
  }
  if (['quern', 'plug', 'tally', 'seal'].includes(kind)) {
    ctx.save();
    ctx.translate(3, 25);
    ctx.scale(1, 0.25);
    const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, 72);
    sh.addColorStop(0, '#11150eaa');
    sh.addColorStop(1, '#11150e00');
    ctx.fillStyle = sh;
    ctx.fillRect(-80, -80, 160, 160);
    ctx.restore();
    if (kind === 'plug') {
      facet(
        [
          [-53, -33],
          [-27, -52],
          [51, -32],
          [30, -12],
        ],
        '#b9ab8f',
        0.2,
      );
      facet(
        [
          [-53, -33],
          [30, -12],
          [15, 53],
          [-35, 35],
        ],
        '#a29479',
        0.24,
      );
      facet(
        [
          [30, -12],
          [51, -32],
          [44, 32],
          [15, 53],
        ],
        '#796e5b',
        0.27,
      );
      ctx.strokeStyle = '#7b705c';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.moveTo(-36 + i * 6, -14 + (i % 3) * 2);
        ctx.lineTo(-33 + i * 6, -21 + (i % 3) * 2);
        ctx.stroke();
      }
    }
    if (kind === 'quern') {
      const p = [
        [-68, -14],
        [-49, -37],
        [-14, -41],
        [42, -28],
        [65, -7],
        [48, 14],
        [11, 23],
        [-41, 12],
      ];
      facet(p, '#8f8d79', 0.35);
      facet(
        [
          [-68, -14],
          [-41, 12],
          [11, 23],
          [48, 14],
          [65, -7],
          [58, 16],
          [28, 35],
          [-12, 37],
          [-59, 18],
        ],
        '#656451',
        0.36,
      );
      ctx.save();
      ctx.rotate(0.18);
      const inner = ctx.createRadialGradient(-4, -10, 2, -4, -10, 47);
      inner.addColorStop(0, '#515448');
      inner.addColorStop(1, '#989682');
      ctx.fillStyle = inner;
      ctx.beginPath();
      ctx.ellipse(-4, -10, 44, 14, 0, 0, 7);
      ctx.fill();
      ctx.restore();
    }
    if (kind === 'tally' || kind === 'seal') {
      const seal = kind === 'seal';
      ctx.save();
      ctx.rotate(seal ? 0.19 : -0.13);
      ctx.scale(seal ? 0.73 : 1, seal ? 0.77 : 1);
      const face = [
        [-49, -43],
        [-36, -50],
        [43, -46],
        [54, -33],
        [50, 34],
        [39, 46],
        [-41, 42],
        [-53, 30],
      ];
      facet(
        [
          [43, -46],
          [57, -36],
          [57, 40],
          [42, 52],
          [-39, 49],
          [-53, 30],
          [38, 37],
        ],
        '#805a3d',
        0.23,
      );
      facet(face, '#b68962', 0.24);
      ctx.lineWidth = 1.1;
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < (seal ? 5 : 6); i++) {
          const x = -36 + i * (seal ? 16 : 12) + r() * 2,
            y = -28 + j * 16;
          if (seal) {
            ctx.strokeStyle = '#77664b';
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.quadraticCurveTo(x + 3, y + 7, x - 1, y + 14);
            ctx.stroke();
          } else {
            shape(
              [
                [x, y],
                [x + 7, y + 1],
                [x + 2, y + 6],
              ],
              '#74543b',
            );
            shape(
              [
                [x + 2, y + 6],
                [x + 7, y + 1],
                [x + 9, y + 2],
              ],
              '#d3a37c',
            );
          }
        }
      ctx.restore();
    }
    ctx.restore();
    return;
  }
  ctx.fillStyle = '#11150e70';
  ctx.beginPath();
  ctx.ellipse(6, 76, 54, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  const profiles = {
    jar: [
      [-78, 24],
      [-73, 26],
      [-67, 19],
      [-48, 17],
      [-35, 26],
      [-18, 46],
      [2, 49],
      [23, 44],
      [48, 32],
      [65, 16],
      [72, 14],
      [76, 18],
    ],
    salt: [
      [-24, 65],
      [-15, 65],
      [10, 55],
      [32, 38],
      [44, 20],
      [48, 22],
    ],
    silt: [
      [-70, 23],
      [-60, 26],
      [62, 27],
      [72, 20],
    ],
    weight: [
      [-43, 17],
      [-25, 37],
      [28, 51],
      [43, 43],
      [45, 27],
    ],

    latch: [
      [-70, 19],
      [-63, 24],
      [-49, 12],
      [60, 7],
      [69, 4],
    ],
  };
  const prof = profiles[kind],
    pots = kind === 'jar' || kind === 'salt';
  const base = pots
    ? [185, 121, 72]
    : kind === 'latch'
      ? [122, 126, 91]
      : kind === 'tally' || kind === 'seal'
        ? [173, 132, 90]
        : [151, 141, 114];
  if (kind === 'jar') {
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sign * 17, -59);
      ctx.bezierCurveTo(sign * 68, -77, sign * 56, -19, sign * 39, -9);
      ctx.strokeStyle = '#805134';
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.strokeStyle = '#b17e51';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  for (let j = 1; j < prof.length; j++) {
    let [ya, ra] = prof[j - 1],
      [yb, rb] = prof[j];
    for (let y = ya; y < yb; y += 1) {
      const rad = ra + ((rb - ra) * (y - ya)) / (yb - ya);
      for (let x = -rad; x <= rad; x += 1.1) {
        const a = x / rad,
          light = 0.38 + 0.64 * Math.sqrt(Math.max(0, 1 - a * a)) - 0.23 * a + (r() - 0.5) * 0.14;
        const strata = kind === 'silt' ? 1 + 0.16 * Math.sin(y * 0.8) + 0.12 * Math.sin(y * 0.23) : 1;
        const wheel = pots ? 1 + 0.024 * Math.sin(y * 1.8) + 0.021 * Math.sin(y * 0.42) : 1;
        const band =
          kind === 'jar' && ((y > -33 && y < -26) || (y > -23 && y < -20) || (y > 38 && y < 41)) ? 0.57 : 1;
        ctx.fillStyle =
          'rgb(' + base.map((c) => Math.floor(c * light * strata * band * wheel)).join(',') + ')';
        ctx.fillRect(x, y, 1.5, 1.3);
      }
    }
  }
  const [top, rad] = prof[0];
  ctx.beginPath();
  ctx.ellipse(0, top, rad, rad * 0.21, 0, 0, Math.PI * 2);
  ctx.fillStyle = pots ? '#483829' : '#aaa187';
  ctx.fill();
  if (pots) {
    ctx.strokeStyle = '#ce9b69';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (kind === 'weight') {
    ctx.fillStyle = '#4a4537';
    ctx.beginPath();
    ctx.ellipse(0, -16, 8, 6, 0, 0, 7);
    ctx.fill();
  }
  if (kind === 'jar') {
    ctx.strokeStyle = '#75523b';
    ctx.lineWidth = 1;
    for (let i = -3; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 10 - 5, -18);
      ctx.lineTo(i * 10, -12);
      ctx.lineTo(i * 10 + 5, -18);
      ctx.stroke();
    }
  }
  ctx.restore();
}
function contourMap(canvas) {
  const w = (canvas.width = 1400),
    h = (canvas.height = 700),
    ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  for (const [x, y, s, offset] of [
    [-100, 170, 1, 2],
    [1300, 750, 1.5, 1],
    [850, -480, 1.4, 4],
  ]) {
    for (let k = 1; k < 70; k++) {
      const rad = k * 14;
      ctx.beginPath();
      for (let j = 0; j <= 240; j++) {
        const a = (j / 240) * Math.PI * 2,
          R =
            rad *
            (1 +
              0.115 * Math.sin(a * 4 + offset + rad * 0.002) +
              0.055 * Math.sin(a * 7 + rad * 0.0027) +
              0.019 * Math.cos(a * 13));
        const px = x + Math.cos(a) * R * s,
          py = y + Math.sin(a) * R * 0.72;
        if (j) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.strokeStyle = k % 5 === 0 ? '#a5ab8535' : '#b3b59620';
      ctx.lineWidth = k % 5 === 0 ? 1.2 : 0.8;
      ctx.stroke();
    }
  }
}
function drawStrata(canvas, layer, seed) {
  const w = (canvas.width = 460),
    h = (canvas.height = 42),
    c = canvas.getContext('2d'),
    r = randomSource(seed + layer * 71);
  const colors = ['#81694f', '#9e7a52', '#a2936b', '#757357'],
    color = colors[layer];
  c.fillStyle = color;
  c.fillRect(0, 0, w, h);
  for (let j = -5; j < 16; j++) {
    c.beginPath();
    const y = j * 4;
    for (let x = 0; x <= w; x += 4) {
      const v = y + Math.sin(x * 0.016 + j * 0.3) * 3.5 + Math.cos(x * 0.035 + j * 0.5) * 2 + r() * 1.1;
      if (x === 0) c.moveTo(x, v);
      else c.lineTo(x, v);
    }
    c.strokeStyle = j % 3 === 0 ? '#241e184c' : '#e1cfa23d';
    c.lineWidth = r() * 1.7 + 0.5;
    c.stroke();
  }
  for (let i = 0; i < 3200; i++) {
    c.fillStyle = r() > 0.5 ? '#201a1733' : '#ddd2aa33';
    c.fillRect(r() * w, r() * h, r() * 2 + 0.5, r() * 1.2 + 0.3);
  }
}
