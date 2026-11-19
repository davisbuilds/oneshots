// The cinematic demo: a guided journey of about a minute. Each shot places the
// traveller at a start pose and then drives the real controller (walk, run,
// jump, turn) through real portals with the real physics and renderer; shots
// are joined by short fades, like cuts in a film. Nothing inside a shot is
// faked: every crossing in it is a crossing the player could make.
import { qaxis, qmul, qnorm } from '../core/math.js';

const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));

export class Demo {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.recording = false;
  }

  // Feet on the floor `dist` metres in front of a portal, facing it.
  before(world, slot, dist, side = 0, extra = {}) {
    const P = this.app.space.portals(world).find((p) => p.slot === slot);
    const n = P.n, r = [n[2], 0, -n[0]];
    return { world, feet: [P.xf.p[0] + n[0] * dist + r[0] * side, P.xf.p[1] - P.hh + 0.02, P.xf.p[2] + n[2] * dist + r[2] * side], yaw: Math.atan2(n[0], n[2]) + (extra.yaw || 0), pitch: extra.pitch ?? 0.04 };
  }

  shots() {
    const b = this.before.bind(this);
    return [
      { name: 'The Threshold', start: () => ({ world: '0,0', feet: [0, 60, 6], yaw: 0, pitch: 0.06 }),
        segs: [{ t: 8.4, move: { forward: 1 }, pitch: -0.02 }, { t: 1.0, move: { forward: 1 } }, { t: 2.9, move: { forward: 0.15 }, turn: Math.PI, pitch: 0.12 }, { t: 0.6 }] },
      { name: 'Ashmere to Velloria', start: () => b('1,0', 'E', 16, 0.8),
        segs: [{ t: 4.6, move: { forward: 1, run: false } }, { t: 1.6, move: { forward: 0.6 }, pitch: 0.42 }, { t: 2.6, move: { forward: 0.2 }, turn: Math.PI * 0.95, pitch: -0.4 }, { t: 0.5 }] },
      { name: 'Velloria to Isenholm', start: () => b('2,0', 'E', 12, -0.5),
        segs: [{ t: 4.2, move: { forward: 1 } }, { t: 2.6, move: { forward: 0.5 }, turn: 0.55 }, { t: 1.2, move: { forward: 0.3 } }] },
      { name: 'The Vault', start: () => b('3,0', 'mirror', 9, 0.3, { pitch: 0.08 }),
        segs: [{ t: 2.6, move: { forward: 1 } }, { t: 1.0, move: { forward: 0.6 } }, { t: 2.0, move: { forward: 0.1 }, turn: -Math.PI / 2 }, { t: 2.2, move: { forward: 0.5 } }] },
      { name: 'The Window in the Ceiling', start: () => ({ world: '3,0/mirror', feet: [0.2, 1.0, -5.0], yaw: 0, pitch: 0.0 }),
        segs: [{ t: 1.3, move: { forward: 1 } }, { t: 1.6, pitch: -0.3 }, { t: 2.4, pitch: 0.25, turn: 0.4 }, { t: 1.0 }] },
      { name: 'The Endless Stoa', start: () => ({ world: '0,0', feet: [16.5, 60.24, 18], yaw: 0, pitch: 0.03 }),
        segs: [{ t: 7.5, move: { forward: 1, run: true } }, { t: 1.5, move: { forward: 0.4 } }] },
    ];
  }

  start() {
    const app = this.app;
    this.active = true;
    this.list = this.shots();
    this.shot = -1;
    this.t = 0;
    app.hud.showDot(false);
    app.state = 'play';
    this.next();
  }

  stop() {
    const app = this.app;
    this.active = false;
    app.post.params.fade = 0;
    app.hud.showDot(true);
    app.hud.worldCard('THRESHOLD', 'an infinity of elsewheres');
  }

  next() {
    const app = this.app;
    this.shot++;
    if (this.shot >= this.list.length) { this.stop(); this.done = true; return; }
    const s = this.list[this.shot], p = s.start();
    const pl = app.player;
    pl.world = p.world; pl.feet = [...p.feet]; pl.vel = [0, 0, 0]; pl.up = [0, 1, 0];
    pl.look = qnorm(qmul(qaxis([0, 1, 0], p.yaw), qaxis([1, 0, 0], p.pitch)));
    pl.grounded = false;
    // load the shot's world and its neighbours while the screen is dark
    app.views.build(p.world);
    for (const P of app.space.portals(p.world)) if (Math.hypot(P.xf.p[0] - p.feet[0], P.xf.p[2] - p.feet[2]) < 60) app.views.build(P.link.world);
    this.seg = 0; this.segT = 0; this.shotT = 0; this.turned = 0; this.pitched = 0;
    app.post.params.fade = 1; app.post.params.fadeColor = [0, 0, 0];
    this.caption = s.name; this.captioned = false;
  }

  // Called every frame instead of keyboard input.
  control(dt) {
    const app = this.app, s = this.list[this.shot];
    if (!s) return { forward: 0, right: 0, run: false, jump: false };
    this.t += dt; this.shotT += dt; this.segT += dt;
    let seg = s.segs[this.seg];
    while (seg && this.segT >= seg.t) { this.segT -= seg.t; this.seg++; this.turned = 0; this.pitched = 0; seg = s.segs[this.seg]; }
    const total = s.segs.reduce((a, g) => a + g.t, 0);
    // fades at the cuts
    app.post.params.fade = Math.max(1 - this.shotT / 0.6, ease((this.shotT - (total - 0.55)) / 0.55));
    if (!this.captioned) { this.captioned = true; app.hud.note(this.caption, 2600); }
    if (!seg) { this.next(); return { forward: 0, right: 0, run: false, jump: false }; }
    // turning: eased so the camera moves like a hand-held head, not a robot
    const k = ease(this.segT / seg.t);
    if (seg.turn) { const want = seg.turn * k; app.player.turn(want - this.turned, 0); this.turned = want; }
    if (seg.pitch) { const want = seg.pitch * k; app.player.turn(0, want - this.pitched); this.pitched = want; }
    return { forward: 0, right: 0, run: false, jump: false, ...(seg.move || {}) };
  }
}
