import * as T from '../vendor/three.module.js';
import { ground, random } from './geography.js';

// A sounded station unfolds a local chart. Points lie on the actual compass
// bearings of the doors. A recorded passage lights its corresponding star.
export function starChart(info) {
  const group = new T.Group(),
    [x, z] = info.beacon;
  group.position.set(x, ground(info, x, z) + 1.63, z);
  const beads = [],
    segments = [],
    ink = new T.LineBasicMaterial({ color: 0xd8bd83 });
  const ring = new T.Vector3();
  for (let i = 0; i < 72; i++) {
    const a = (i * Math.PI) / 36,
      b = ((i + 1) * Math.PI) / 36;
    segments.push(
      Math.sin(a) * 0.73,
      0.38,
      Math.cos(a) * 0.73,
      Math.sin(b) * 0.73,
      0.38,
      Math.cos(b) * 0.73
    );
  }
  const beadGeo = new T.OctahedronGeometry(0.071);
  for (const g of info.gates) {
    ring
      .set(g.origin.x - x, 0, g.origin.z - z)
      .normalize()
      .multiplyScalar(0.73);
    const tip = ring.clone();
    tip.y = 0.48 + 0.2 * Math.abs(ring.x);
    segments.push(0, 0, 0, ring.x, 0.38, ring.z, ring.x, 0.38, ring.z, tip.x, tip.y, tip.z);
    const bead = new T.Mesh(beadGeo, new T.MeshBasicMaterial({ color: 0x8c8774 }));
    bead.position.copy(tip);
    group.add(bead);
    beads.push([g.key, bead]);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(segments, 3));
  group.add(new T.LineSegments(geo, ink));
  group.visible = false;
  return {
    group,
    links(record = {}) {
      for (const [key, bead] of beads) {
        const seen = Object.hasOwn(record, key);
        bead.material.color.set(seen ? 0xffefad : 0x8c8774);
        bead.scale.setScalar(seen ? 1.45 : 0.8);
      }
    },
    dispose() {
      geo.dispose();
      ink.dispose();
      beadGeo.dispose();
      for (const [, bead] of beads) bead.material.dispose();
    },
  };
}

export function seabirds(seed) {
  const rng = random(seed + 527),
    positions = [],
    geometry = new T.BufferGeometry();
  const count = 21,
    parameters = [];
  for (let i = 0; i < count; i++)
    parameters.push([rng() * 25, rng() * 8, rng() * 9, rng() * 7, 0.36 + rng() * 0.27]);
  const attribute = new T.Float32BufferAttribute(new Float32Array(count * 18), 3);
  geometry.setAttribute('position', attribute);
  const mesh = new T.Mesh(geometry, new T.MeshBasicMaterial({ color: '#415451', side: T.DoubleSide }));
  mesh.frustumCulled = false;
  return {
    mesh,
    animate(t) {
      for (let i = 0; i < count; i++) {
        const [lane, level, trail, phase, span] = parameters[i],
          a = t * 0.034 + phase * 0.095;
        const x = -30 + Math.sin(a) * 20 + lane * 0.6,
          z = -31 + Math.cos(a) * 12 + trail;
        const y = 7 + level * 0.34 + Math.sin(a * 2) * 1.1,
          wing = Math.sin(t * 2.4 + phase) * span * 0.29;
        positions.length = 0;
        for (const s of [-1, 1])
          positions.push(
            x,
            y,
            z + 0.1,
            x + s * span * 0.49,
            y + 0.13,
            z - 0.02,
            x + s * span,
            y + wing,
            z + 0.17
          );
        attribute.array.set(positions, i * 18);
      }
      attribute.needsUpdate = true;
    },
  };
}
