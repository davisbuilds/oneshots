import { Euler, Matrix4, Quaternion, Vector3 } from '../vendor/three.module.js';

export const WIDTH = 6, SPRING = 4.8, HEIGHT = SPRING + WIDTH / 2;
export function doorway(key, x, z, yaw = 0, y = 0, pitch = 0, roll = 0) {
  const rotation = new Quaternion().setFromEuler(new Euler(pitch, yaw, roll, 'YXZ'));
  const origin = new Vector3(x, y, z);
  const frame = new Matrix4().compose(origin, rotation, new Vector3(1, 1, 1));
  return { key, origin, rotation, frame, inverse: frame.clone().invert(),
    normal: new Vector3(0, 0, 1).applyQuaternion(rotation) };
}
const turn = new Matrix4().makeRotationY(Math.PI);
export function passage(source, exit) {
  return exit.frame.clone().multiply(turn).multiply(source.inverse);
}
export function admits(x, y, radius = 0, below = 0, above = 0) {
  const edge = Math.abs(x) + radius;
  const crown = Math.max(0, y + above - SPRING);
  return y - below >= -.025 && edge * edge + crown * crown <= WIDTH * WIDTH / 4;
}
export function crossing(gate, start, finish, radius = 0, below = 0, above = 0) {
  const local = start.clone().applyMatrix4(gate.inverse);
  const end = finish.clone().applyMatrix4(gate.inverse);
  if (local.z === 0 || local.z * end.z > 0 || local.z === end.z) return null;
  const t = local.z / (local.z - end.z);
  local.lerp(end, t);
  return admits(local.x, local.y, radius, below, above) ? { t } : null;
}

export const EYE = 1.76, BODY = .23;
export function barrier(x, z, width, depth, yaw = 0) {
  return { x, z, hx: width / 2, hz: depth / 2, cos: Math.cos(yaw), sin: Math.sin(yaw) };
}

// Slab intersection in the obstacle frame. Expanding each slab gives the walker
// a conservative square footprint at a convex corner.
export function impact(box, origin, delta, radius = BODY) {
  const dx = origin.x - box.x, dz = origin.z - box.z;
  const p = [box.cos * dx - box.sin * dz, box.sin * dx + box.cos * dz];
  const d = [box.cos * delta.x - box.sin * delta.z, box.sin * delta.x + box.cos * delta.z];
  const extent = [box.hx + radius, box.hz + radius];
  let near = -Infinity, far = Infinity, axis = 0;
  for (let i = 0; i < 2; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (Math.abs(p[i]) >= extent[i]) return null;
      continue;
    }
    const a = (-extent[i] - p[i]) / d[i], b = (extent[i] - p[i]) / d[i];
    if (Math.min(a,b) > near) { near = Math.min(a,b); axis = i; }
    far = Math.min(far, Math.max(a,b));
  }
  if (near < -1e-8 || near > 1 || near > far || far < 0) return null;
  const normal = axis === 0 ? new Vector3(box.cos, 0, -box.sin) : new Vector3(box.sin, 0, box.cos);
  return { t: Math.max(0, near), normal: normal.multiplyScalar(-Math.sign(d[axis])) };
}

export function advance(player, displacement, getWorld, onCross = () => {}) {
  const left = displacement.clone();
  for (let step = 0; step < 24 && left.lengthSq() > 1e-16; step++) {
    const world = getWorld(player.id);
    const end = player.position.clone().add(left);
    let hit = null;
    for (const box of world.barriers) {
      const block = impact(box, player.position, left);
      if (block && (!hit || block.t < hit.t)) hit = block;
    }
    for (const gate of world.gates) {
      const cut = crossing(gate, player.position, end, BODY, EYE, .15);
      if (cut && (!hit || cut.t < hit.t)) hit = { ...cut, gate };
    }
    if (!hit) { player.position.copy(end); break; }
    player.position.addScaledVector(left, hit.t);
    left.multiplyScalar(1 - hit.t);
    if (hit.gate) {
      const g = hit.gate, target = getWorld(g.to);
      const exit = target.gates.find(p => p.key === g.mate);
      const m = passage(g, exit), rotation = new Quaternion().setFromRotationMatrix(m);
      const sign = Math.sign(displacement.lengthSq() && player.velocity.dot(g.normal)) ||
        Math.sign(end.clone().sub(g.origin).dot(g.normal)) || -1;
      // Direction of the actual sweep can differ from velocity (strafe or slide).
      const approachSign = Math.sign(end.clone().sub(player.position).dot(g.normal)) || sign;
      player.position.applyMatrix4(m).addScaledVector(exit.normal, -approachSign * 1e-7);
      player.orientation.premultiply(rotation);
      player.velocity.applyQuaternion(rotation);
      left.applyQuaternion(rotation);
      const previous = player.id;
      player.id = g.to;
      onCross(previous, g, exit);
    } else {
      player.position.addScaledVector(hit.normal, 1e-6);
      left.addScaledVector(hit.normal, -left.dot(hit.normal));
      const inward = player.velocity.dot(hit.normal);
      if (inward < 0) player.velocity.addScaledVector(hit.normal, -inward);
    }
  }
}
