// ?bench: render fixed scenes and report frame costs, so the numbers can be
// measured on any machine. Each scene is warmed up, then measured frame by
// frame: JavaScript time, then a synchronous 1-pixel read that waits for the
// GPU to finish the frame (gl.finish alone does not block in every browser),
// so each frame starts on an idle GPU and the total includes the GPU's work.
export const SCENES = [
  { name: 'opening view (great door, desert behind)', world: '0,0', feet: [0, 64, 36.5], yaw: 0, pitch: -0.02 },
  { name: 'desert, looking back through the great door', world: '1,0', feet: [-24, null, 0], yaw: Math.PI / 2, pitch: 0.12 },
  { name: 'forest canopy', world: '2,0', feet: [-12, null, 2], yaw: -Math.PI / 2 + 0.3, pitch: 0.2 },
  { name: 'endless stoa (cyclic recursion)', world: '0,0', feet: [16.5, 60.24, 14], yaw: 0, pitch: 0 },
  { name: 'room that contains itself (worst case)', world: '3,0/mirror', feet: [-2, 0, 0.3], yaw: -Math.PI / 2, pitch: 0.02 },
  { name: 'inner hall, sunbeams', world: '0,0/hall', feet: [0, 0.4, -20], yaw: 0, pitch: 0.1 },
  { name: 'glacier and the vault', world: '3,0', feet: [-20, null, 10], yaw: -1.2, pitch: 0.15 },
  { name: 'procedural cavern (4,0)', world: '4,0', feet: null, yaw: 0, pitch: 0.1 },
];

export async function runBench(app, { warm = 20, frames = 90, onProgress } = {}) {
  const gl = app.renderer.getContext(), results = [];
  app.manual = true;
  for (const sc of SCENES) {
    const d = app.descs.get(sc.world);
    let feet = sc.feet || d.spawn.feet;
    if (feet[1] === null) feet = [feet[0], (d.heightAt ? d.heightAt(feet[0], feet[2]) : 0) + 0.3, feet[2]];
    window.THR.place(sc.world, feet, sc.yaw, sc.pitch);
    const px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    for (let i = 0; i < warm; i++) { app.frame(1 / 60, { noPhysics: true }); sync(); }
    const cpu = [], total = [];
    let calls = 0, tris = 0, worlds = 0, portals = 0;
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now();
      app.frame(1 / 60, { noPhysics: true });
      const t1 = performance.now();
      sync();
      const t2 = performance.now();
      cpu.push(t1 - t0); total.push(t2 - t0);
      const s = app.pr.stats, info = app.renderer.info.render;
      calls += info.calls; tris += info.triangles; worlds += s.worldRenders; portals += s.portalsRendered;
    }
    const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
    const r = {
      scene: sc.name, cpuMedian: q(cpu, 0.5), frameMedian: q(total, 0.5), frameP95: q(total, 0.95),
      draws: Math.round(calls / frames), triangles: Math.round(tris / frames), worldRenders: +(worlds / frames).toFixed(1), portals: +(portals / frames).toFixed(1),
    };
    results.push(r);
    onProgress?.(r);
    await new Promise((res) => setTimeout(res, 0));
  }
  return results;
}

export function benchTable(results, app) {
  const g = app.renderer.getContext();
  const lines = [
    `GPU: ${app.gpu}`,
    `Drawing buffer: ${g.drawingBufferWidth} x ${g.drawingBufferHeight}, quality ${app.qIndex} (${['minimal', 'low', 'medium', 'high', 'ultra'][app.qIndex]})`,
    '',
    '| scene | CPU ms (median) | frame ms incl. GPU (median) | p95 | draws | triangles | world renders | portals |',
    '| :-- | --: | --: | --: | --: | --: | --: | --: |',
    ...results.map((r) => `| ${r.scene} | ${r.cpuMedian.toFixed(1)} | ${r.frameMedian.toFixed(1)} | ${r.frameP95.toFixed(1)} | ${r.draws} | ${(r.triangles / 1000).toFixed(0)}k | ${r.worldRenders} | ${r.portals} |`),
  ];
  return lines.join('\n');
}
