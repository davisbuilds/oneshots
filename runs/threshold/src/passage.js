import * as T from '../vendor/three.module.js';
import { passage } from './spatial.js';
import { move } from './walker.js';

// Each shot is expressed in its starting world's coordinates, including the
// metre beyond a doorway. Actual swept crossings transport the remaining path.
const shots = [
  [3.5, -1.9, 16.4, 0, 4.1, 0],
  [5.5, 0.12, -1.6, 0.15, 3.3, -12],
  [3.5, 1.8, 6.5, 10, 5.0, -28],
  [5.5, -3.6, -16.6, -3.6, 3.6, -24],
  [4.1, -0.8, 4.0, -6, 6, -7],
  [4.8, 2.8, -16.6, 2.8, 3.75, -27],
  [4.2, -0.5, 2.7, -10, 5.8, -16],
  [4.6, -2.4, -16.6, -2.4, 3.0, -28],
  [3.9, -8.9, 3.4, -9.4, 5.2, -18],
  [5.9, -9.4, -23.6, -9.4, 3.1, -40],
  [3.1, -9.4, 13.4, -9.4, 3.4, -22],
  [3.4, -8.5, 8.1, 2.0, 6.1, -16],
];
export const duration = shots.reduce((sum, s) => sum + s[0], 0);
export class Passage {
  constructor() {
    this.index = 0;
    this.local = 0;
    this.elapsed = 0;
    this.transform = new T.Matrix4();
  }
  step(p, dt, getWorld, onCross) {
    while (dt > 1e-9 && this.index < shots.length) {
      const [seconds, x, z, lx, ly, lz] = shots[this.index];
      if (this.local === 0) {
        this.start = p.position.clone();
        this.transform.identity();
      }
      const step = Math.min(dt, seconds - this.local);
      this.local += step;
      this.elapsed += step;
      dt -= step;
      const frac = this.local / seconds;
      // A mild ease leaves speed at the mouth continuous between consecutive frames.
      const u = frac - 0.055 * Math.sin(2 * Math.PI * frac);
      const target = this.start
        .clone()
        .lerp(new T.Vector3(x, this.start.y, z), u)
        .applyMatrix4(this.transform);
      const delta = target.sub(p.position);
      delta.y = 0;
      p.velocity.copy(delta).divideScalar(Math.max(0.00001, step));
      move(p, delta, getWorld, (from, g, exit) => {
        this.transform.premultiply(passage(g, exit));
        onCross(from, g, exit);
      });
      const at = new T.Vector3(lx, ly, lz).applyMatrix4(this.transform);
      const q = new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().lookAt(p.position, at, new T.Vector3(0, 1, 0))
      );
      p.orientation.slerp(q, 1 - Math.exp(-3.3 * step));
      if (this.local >= seconds - 1e-8) {
        this.index++;
        this.local = 0;
      }
    }
    return this.index >= shots.length;
  }
}
