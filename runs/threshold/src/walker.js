import * as T from '../vendor/three.module.js';
import { advance, EYE } from './spatial.js';
import { ground } from './geography.js';

const up = new T.Vector3(0, 1, 0);
export function opening() {
  const position = new T.Vector3(-2.65, EYE, 18.6),
    camera = new T.PerspectiveCamera();
  camera.position.copy(position);
  camera.lookAt(-1.8, 3.46, -0.2);
  return { id: '1', position, orientation: camera.quaternion.clone(), velocity: new T.Vector3() };
}
export function look(p, dx, dy) {
  const e = new T.Euler().setFromQuaternion(p.orientation, 'YXZ');
  e.y -= dx;
  e.x = T.MathUtils.clamp(e.x - dy, -1.49, 1.49);
  p.orientation.setFromEuler(e);
}
export function move(p, delta, getWorld, onCross) {
  advance(p, delta, getWorld, onCross);
  p.position.y = ground(getWorld(p.id), p.position.x, p.position.z) + EYE;
}
export function walk(p, keys, dt, getWorld, onCross) {
  look(
    p,
    (+keys.has('ArrowRight') - +keys.has('ArrowLeft')) * dt * 1.53,
    (+keys.has('PageDown') - +keys.has('PageUp')) * dt * 0.95
  );
  const yaw = new T.Euler().setFromQuaternion(p.orientation, 'YXZ').y;
  const fwd =
    Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
  const strafe = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6.8 : 3.9;
  const goal = new T.Vector3(strafe, 0, fwd).normalize().applyAxisAngle(up, yaw).multiplyScalar(speed);
  p.velocity.lerp(goal, 1 - Math.exp(-dt * (fwd || strafe ? 16 : 22)));
  move(p, p.velocity.clone().multiplyScalar(dt), getWorld, onCross);
}
