// Geometry helpers: transformed primitives with world-scale UVs, merging, and
// a few procedural shapes shared by the world builders.
import * as THREE from 'three';
import { xmat4 } from '../core/math.js';

const _m = new THREE.Matrix4(), _arr = new Array(16);

export function matFromXf(x, out = new THREE.Matrix4()) { return out.fromArray(xmat4(x, _arr)); }

// Box with UVs in metres (so detail textures keep a constant scale).
export function boxGeo(he) {
  const g = new THREE.BoxGeometry(he[0] * 2, he[1] * 2, he[2] * 2);
  const uv = g.attributes.uv, n = g.attributes.normal, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (nx > 0.5) uv.setXY(i, z, y); else if (ny > 0.5) uv.setXY(i, x, z); else uv.setXY(i, x, y);
  }
  return g;
}

export function transformed(geo, matrix) { const g = geo.index ? geo : geo; g.applyMatrix4(matrix); return g; }

// Merge non-indexed or indexed geometries with position/normal/uv (and
// optional color) into one indexed geometry.
export function merge(list, { colors = false } = {}) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const col = colors ? new Float32Array(nv * 3) : null;
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    const a = g.attributes, c = a.position.count;
    pos.set(a.position.array.subarray(0, c * 3), vo * 3);
    if (a.normal) nor.set(a.normal.array.subarray(0, c * 3), vo * 3);
    if (a.uv) uv.set(a.uv.array.subarray(0, c * 2), vo * 2);
    if (col) { if (a.color) col.set(a.color.array.subarray(0, c * 3), vo * 3); else col.fill(1, vo * 3, (vo + c) * 3); }
    if (g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx[io + i] = ix[i] + vo; io += ix.length; }
    else { for (let i = 0; i < c; i++) idx[io + i] = vo + i; io += c; }
    vo += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  for (const g of list) g.dispose();
  return out;
}

export function tint(geo, rgb) {
  const c = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < c.length; i += 3) { c[i] = rgb[0]; c[i + 1] = rgb[1]; c[i + 2] = rgb[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

// Build geometry for a descriptor part in world coordinates.
export function partGeometry(part) {
  let g;
  switch (part.kind) {
    case 'box': g = boxGeo(part.he); break;
    case 'cyl': g = new THREE.CylinderGeometry(part.r1 ?? part.r, part.r, part.h, part.seg || 16, 1, false); break;
    case 'cone': g = new THREE.ConeGeometry(part.r, part.h, part.seg || 12); break;
    case 'sphere': g = new THREE.SphereGeometry(part.r, part.seg || 16, Math.max(6, (part.seg || 16) >> 1)); break;
    case 'ico': g = new THREE.IcosahedronGeometry(part.r, part.detail || 0); break;
    case 'torus': g = new THREE.TorusGeometry(part.r, part.tube, 12, part.seg || 48, part.arc || Math.PI * 2); break;
    case 'lathe': g = new THREE.LatheGeometry(part.points.map((p) => new THREE.Vector2(p[0], p[1])), part.seg || 24); break;
    default: throw new Error('unknown part kind ' + part.kind);
  }
  if (g.index === null) g = g.toNonIndexed();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (part.color) tint(g, part.color);
  g.applyMatrix4(matFromXf(part.xf, _m));
  return g;
}
