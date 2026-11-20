'use strict';
// The brush cuts a deterministic opaque field. Coverage is measured over the
// specimen's central area, so sweeping empty corners cannot finish a recovery.
function recovery(f, finish) {
  modal(
    '<div class="eyebrow">IN SITU / TRENCH ' +
      letter(f.zone) +
      '</div><h2>Brush the exposure</h2><div class="recovery"><canvas class="under" aria-label="Partially exposed find"></canvas><canvas class="cover" aria-label="Drag across the middle to brush away soil"></canvas></div><div class="brush-state"><span>' +
      site.deposits[f.layer].name.toUpperCase() +
      ' · ' +
      f.depth +
      ' CM</span><span id="exposure">0% exposed</span></div><p>Brush across the emerging object to lift it from the fill.</p><div class="brush-actions"><button id="sweep" class="secondary">Brush a pass</button><button id="lift" class="action" disabled>' +
      icon('box') +
      'Lift find</button></div>',
  );
  const cover = $('.cover'),
    under = $('.under');
  sampleCanvas(under, f.kind);
  const w = (cover.width = 420),
    h = (cover.height = 206),
    ctx = cover.getContext('2d', { willReadFrequently: true }),
    r = randomSource(site.seed + f.origin);
  const id = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const n = r() * 32 + 9 * Math.sin(x * 0.05 + y * 0.018) + 7 * Math.sin(y * 0.13 + x * 0.004),
        i = (y * w + x) * 4;
      id.data.set([105 + n, 87 + n, 61 + n * 0.9, 255], i);
    }
  ctx.putImageData(id, 0, 0);
  for (let i = 0; i < 2800; i++) {
    const x = r() * w,
      y = r() * h,
      s = r() * 2 + 0.5;
    ctx.fillStyle = r() > 0.5 ? '#45382780' : '#d5c29c8a';
    ctx.fillRect(x, y, s * 1.8, s);
  }
  const mask = new Set();
  let pass = 0,
    pressed = false;
  function brush(x, y, radius) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, '#000');
    g.addColorStop(0.68, '#000');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
    for (let j = 0; j < 12; j++)
      for (let i = 0; i < 8; i++) {
        if (Math.hypot(174 + i * 10 - x, 48 + j * 10 - y) < radius * 0.78) mask.add(i + j * 8);
      }
    const pct = Math.round((mask.size / 96) * 100);
    $('#exposure').textContent = pct + '% exposed';
    $('#lift').disabled = pct < 70;
  }
  brush(211, 95, 24);
  function pointer(e) {
    const b = cover.getBoundingClientRect();
    brush(((e.clientX - b.left) * w) / b.width, ((e.clientY - b.top) * h) / b.height, 29);
  }
  cover.onpointerdown = (e) => {
    pressed = true;
    cover.setPointerCapture(e.pointerId);
    pointer(e);
  };
  cover.onpointermove = (e) => {
    if (pressed) pointer(e);
  };
  cover.onpointerup = cover.onpointercancel = () => (pressed = false);
  $('#sweep').onclick = () => {
    const y = 51 + (pass++ % 4) * 36;
    for (let x = 157; x < 265; x += 8) brush(x, y + Math.sin(x * 0.05) * 3.5, 32);
  };
  $('#lift').onclick = finish;
}
