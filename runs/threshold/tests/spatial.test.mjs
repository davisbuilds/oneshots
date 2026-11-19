import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Quaternion, Vector3 } from '../vendor/three.module.js';
import { doorway, passage, crossing } from '../src/spatial.js';
const v = (x, y, z) => new Vector3(x, y, z);
const close = (a, b) => assert.ok(a.distanceTo(b) < 1e-8, `${a.toArray()} ≠ ${b.toArray()}`);
const a = doorway('a', 0, 0);
const b = doorway('b', 10, -4, Math.PI / 2, 6);

test('a front approach exits facing away from a displaced quarter-turn doorway', () => {
  const m = passage(a, b);
  close(v(0, 2, -3).applyMatrix4(m), v(13, 8, -4));
  close(v(1, 0, 0).transformDirection(m), v(0, 0, 1));
});
test('inverse frames preserve the pose and the magnitude of velocity, including rolled portals', () => {
  const c = doorway('c', -11, 17, -1.7, 5, 0.85, -0.72);
  const m = passage(b, c),
    inv = passage(c, b),
    rot = new Quaternion().setFromRotationMatrix(m);
  const back = new Quaternion().setFromRotationMatrix(inv);
  const pose = new Quaternion().setFromAxisAngle(v(1, 3, 2).normalize(), 2);
  close(v(-4, 3, -7).applyMatrix4(m).applyMatrix4(inv), v(-4, 3, -7));
  assert.ok(Math.abs(back.clone().multiply(rot).multiply(pose).dot(pose)) > 1 - 1e-12);
  close(v(12, -2, 31).applyQuaternion(rot).applyQuaternion(back), v(12, -2, 31));
  assert.ok(
    Math.max(...inv.multiply(m).elements.map((x, i) => Math.abs(x - new Matrix4().elements[i]))) < 1e-10
  );
});
test('swept opening accepts a fast crossing and excludes masonry, the curved crown and grazing motion', () => {
  assert.equal(crossing(a, v(0, 2, 25), v(0, 2, -75), 0.25, 1.7, 0.12)?.t, 0.25);
  assert.equal(crossing(a, v(2.85, 2, 1), v(2.85, 2, -1), 0.25), null);
  assert.equal(crossing(a, v(2.6, 7.15, 1), v(2.6, 7.15, -1)), null);
  assert.ok(crossing(a, v(0, 7.15, 1), v(0, 7.15, -1)));
  assert.equal(crossing(a, v(-1, 2, 0), v(1, 2, 0)), null);
  assert.ok(crossing(a, v(1, 2, -1), v(1, 2, 0.01)));
});
