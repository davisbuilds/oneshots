import * as T from '../vendor/three.module.js';
import { doorway, passage } from '../src/spatial.js';
import { PortalRenderer } from '../src/portals.js';
import { WorldStore } from '../src/world.js';

const red = 0xaa2636,
  blue = 0x245eaa,
  green = 0x44c52a,
  amber = 0xffbb17;
const v = (x, y, z) => new T.Vector3(x, y, z);
function equal(rgb, hex) {
  return rgb.slice(0, 3).every((n, i) => Math.abs(n - ((hex >> ((2 - i) * 8)) & 255)) < 4);
}
export function probes() {
  const r = new T.WebGLRenderer({ antialias: false }),
    engine = new PortalRenderer(r),
    w = 241,
    h = 161;
  r.setSize(w, h);
  document.body.append(r.domElement);
  const gl = r.getContext();
  const a = Object.assign(doorway('a', 0, 0), { to: 'b', mate: 'b' });
  const b = Object.assign(doorway('b', 10, 0, Math.PI), { to: 'a', mate: 'a' });
  const worlds = {
    a: { gates: [a], scene: new T.Scene(), fogColor: new T.Color(red) },
    b: { gates: [b], scene: new T.Scene(), fogColor: new T.Color(blue) },
  };
  const cam = new T.PerspectiveCamera(70, w / h, 0.1, 80);
  const draw = (id, x, z, yaw = 0) => {
    cam.position.set(x, 1.76, z);
    cam.rotation.set(0, yaw, 0);
    cam.updateMatrixWorld();
    engine.draw(worlds[id], cam, (k) => worlds[k], 0);
  };
  const pixel = (x, y) => {
    const p = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
    return [...p];
  };
  const check = (ok, why) => {
    if (!ok) throw Error(why);
  };
  function block(world, color, x, y, z, width, height, depth) {
    const m = new T.Mesh(new T.BoxGeometry(width, height, depth), new T.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    worlds[world].scene.add(m);
    return m;
  }
  draw('a', 0, 5);
  check(equal(pixel(120, 80), blue) && equal(pixel(1, 80), red), 'live aperture / outside colour');
  const blocker = block('a', green, 0, 1.76, 1, 0.65, 0.65, 0.25);
  draw('a', 0, 5);
  check(equal(pixel(120, 80), green), 'source object must occlude the window');
  blocker.visible = false;
  const wrongSide = block('b', amber, 10, 1.76, 1.7, 12, 12, 0.16);
  draw('a', 0, 5);
  check(equal(pixel(120, 80), blue), 'exit half-space must remove intervening destination geometry');
  wrongSide.visible = false;
  const fiducial = block('b', green, 10.7, 1.76, -3, 0.34, 0.38, 0.11);
  const projections = [];
  for (const x of [-1.2, 0, 1.2]) {
    draw('a', x, 4.2);
    const ndc = v(0.7, 1.76, -3).project(cam);
    const px = Math.round((ndc.x * 0.5 + 0.5) * (w - 1));
    check(equal(pixel(px, 80), green), 'off-axis fiducial at ' + px);
    projections.push(px);
  }
  check(projections[0] > projections[1] && projections[1] > projections[2], 'parallax direction');
  fiducial.visible = false;
  draw('a', 0, 0.002, -Math.PI / 2);
  const strip = () => [0.12, 0.28, 0.72, 0.88].map((u) => pixel(Math.floor(u * w), 80));
  const before = strip();
  check(
    before.some((p) => equal(p, red)) && before.some((p) => equal(p, blue)),
    'both sides visible inside near plane'
  );
  draw('b', 10, -0.002, -Math.PI / 2);
  const after = strip();
  check(
    before.every((p, i) => p.every((value, j) => Math.abs(value - after[i][j]) <= 2)),
    'grazing view continuity across eye boundary'
  );
  draw('a', 0, 0, -Math.PI / 2);
  check(
    strip().every((p, i) => equal(p, equal(before[i], red) ? red : blue)),
    'half-aperture at exact eye position'
  );
  // Rotate one mouth around all three axes. An independent direct-camera render
  // must put the green witness on the same pixel as the root aperture image.
  const tilted = Object.assign(doorway('b', 8, -2, 0.72, 4, 0.55, -0.38), { to: 'a', mate: 'a' });
  worlds.b.gates = [tilted];
  fiducial.visible = true;
  fiducial.position.copy(v(0.7, 1.76, -3).applyMatrix4(passage(a, tilted)));
  draw('a', 0.4, 4.2);
  const at = v(0.7, 1.76, -3).project(cam);
  const px = Math.round((at.x * 0.5 + 0.5) * (w - 1));
  check(equal(pixel(px, 80), green), 'rolled destination keeps witness aligned');
  engine.dispose();
  r.dispose();
  r.domElement.remove();
  return { parallaxPixels: projections, nearPlaneBefore: before, nearPlaneAfter: after };
}
export async function resourceProbe() {
  const renderer = new T.WebGLRenderer({ antialias: false });
  renderer.setSize(128, 84);
  renderer.shadowMap.enabled = true;
  const engine = new PortalRenderer(renderer);
  const store = new WorldStore(),
    cam = new T.PerspectiveCamera(62, 128 / 84, 0.06, 680);
  cam.position.set(0, 1.76, 13);
  cam.updateMatrixWorld();
  const cycles = [];
  for (let circuit = 0; circuit < 2; circuit++) {
    let peakTextures = 0,
      peakGeometry = 0;
    for (const id of ['1', '2', '4', '8', '16', '3', '7', '15', '31', '63', '127', '255']) {
      engine.draw(store.get(id), cam, (k) => store.get(k), 0, { depth: 1, budget: 1 });
      peakTextures = Math.max(peakTextures, renderer.info.memory.textures);
      peakGeometry = Math.max(peakGeometry, renderer.info.memory.geometries);
      if (store.entries.size > 8) throw Error('world limit exceeded');
      await new Promise(requestAnimationFrame);
    }
    store.clear();
    cycles.push({ peakTextures, peakGeometry, after: { ...renderer.info.memory } });
  }
  if (
    JSON.stringify(cycles[0].after) !== JSON.stringify(cycles[1].after) ||
    cycles[1].after.geometries >= cycles[1].peakGeometry ||
    cycles[1].after.textures >= cycles[1].peakTextures
  )
    throw Error('live GPU disposal mismatch ' + JSON.stringify(cycles));
  engine.dispose();
  renderer.dispose();
  return cycles;
}
