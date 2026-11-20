import { writeFile } from 'node:fs/promises';
import { browserSession, ready, output } from './browser.mjs';
const percentile = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
await browserSession(async (browser, url) => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(url + '/?profile');
  await ready(page);
  const hardware = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2'),
      ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  async function sample(name) {
    const data = await page.evaluate(async () => {
      const intervals = [],
        gpu = [];
      await new Promise(requestAnimationFrame);
      let last = performance.now(),
        started = last;
      do {
        await new Promise(requestAnimationFrame);
        const next = performance.now();
        intervals.push(next - last);
        last = next;
        const t = threshold.inspect().gpuMs;
        if (t !== null && t !== gpu.at(-1)) gpu.push(t);
      } while (last - started < 2500);
      return { intervals, s: threshold.inspect(), gpu };
    });
    const { s, intervals } = data,
      sorted = intervals.slice().sort((a, b) => a - b);
    const result = {
      name,
      world: s.id,
      frames: sorted.length,
      gpuMedianMs: data.gpu.length
        ? percentile(
            data.gpu.sort((a, b) => a - b),
            0.5
          )
        : null,
      maxMs: sorted.at(-1),
      meanMs: intervals.reduce((a, b) => a + b, 0) / sorted.length,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      width: s.width,
      height: s.height,
      calls: s.calls,
      triangles: s.triangles,
      passes: s.passes,
      depth: s.depth,
      worlds: s.worlds,
      chunks: s.chunks,
      geometries: s.geometries,
      textures: s.textures,
      targets: s.targets,
    };
    console.log(JSON.stringify(result));
    return result;
  }
  // Fixed native pixels qualify the 1080p claim. Adaptive samples report their own buffer sizes.
  await page.keyboard.press('i');
  await page.locator('#adaptive').uncheck();
  await page.locator('#hide-metrics').click();
  await page.waitForTimeout(1800);
  const samples = [await sample('Opening, fixed native')];
  await page.keyboard.press('i');
  await page.locator('#adaptive').check();
  await page.locator('#hide-metrics').click();
  await page.getByRole('button', { name: /Guided passage/ }).click();
  for (const [time, name] of [
    [2, 'Approach'],
    [10, 'Saffron'],
    [19, 'Canopy'],
    [28, 'Meridian'],
    [38, 'Archive'],
    [46, 'Returning aisle'],
  ]) {
    await page.waitForFunction((t) => threshold.inspect().demoSeconds >= t, time, { timeout: 65000 });
    samples.push(await sample(name));
  }
  await writeFile(
    output + 'playwright/performance.json',
    JSON.stringify({ browser: browser.version(), hardware, viewport: '1920x1080 @ 1x', samples }, null, 2) +
      '\n'
  );
});
