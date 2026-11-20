// Recursive stencil-buffer portal rendering.
//
// One depth-stencil render target holds the whole frame. The stencil value of
// a pixel is the recursion level of the world visible there. To draw world W
// at level L (stencil test == L, clip plane = the portal L was entered by):
//
//   1. opaque pass of W (sky first) where stencil == L
//   2. for each visible portal P of W, nearest first, within the budget:
//        mark     P's surface, depth-tested, stencil L -> L+1
//        far      reset depth to the far plane where stencil == L+1
//        recurse  draw P's destination at L+1 from the transformed camera,
//                 clipped to the destination portal's plane and scissored to
//                 P's screen rectangle
//        restore  write P's surface depth, composite W's fog over it, and
//                 decrement stencil back to L
//      portals beyond the budget get a terminal fill: the destination's
//      horizon colour, so a cycle fades into haze instead of stopping hard
//   3. transparent pass of W where stencil == L
//
// When the eye is within NEAR_ZONE of a portal plane and inside its opening,
// the near clipping plane can slice the flat surface. The surface is then an
// open box reaching *behind* the plane: every view ray that passes through the
// opening ends on one of its inner faces beyond the near plane, and no other
// ray can reach it, so it is drawn without a depth test.
import * as THREE from '../../vendor/three/three.module.js';
import { pairXf, cameraInNearZone } from '../core/portal.js';
import { xpoint, qmul, qnorm, xmat4 } from '../core/math.js';
import { FOG_PARS } from './atmosphere.js';

export const NEAR_ZONE = 0.35;   // metres in front of the plane
const BOX_DEPTH = 0.6;          // metres behind the plane
const PAD = 0.08;               // flat surface overlap into the frame (hidden by the jambs)

export const LAYER = { OPAQUE: 0, TRANSPARENT: 1, DETAIL: 2, AVATAR: 3, LIGHTS: 31 };

function openBoxGeometry() {
  // x, y in [-1, 1], z in [-1, 0]; faces point inward; no face at z = 0.
  const P = [], I = [];
  const quad = (a, b, c, d) => { const o = P.length / 3; P.push(...a, ...b, ...c, ...d); I.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  quad([-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]);
  quad([-1, -1, 0], [-1, -1, -1], [-1, 1, -1], [-1, 1, 0]);
  quad([1, -1, -1], [1, -1, 0], [1, 1, 0], [1, 1, -1]);
  quad([-1, -1, 0], [1, -1, 0], [1, -1, -1], [-1, -1, -1]);
  quad([-1, 1, -1], [1, 1, -1], [1, 1, 0], [-1, 1, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  return g;
}

const stencilMat = (mat, func, zpass) => Object.assign(mat, {
  stencilWrite: true, stencilFunc: func, stencilFuncMask: 0xff, stencilWriteMask: 0xff,
  stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: zpass,
});

export class PortalRenderer {
  constructor(renderer) {
    this.r = renderer;
    this.gl = renderer.getContext();
    this.settings = { maxDepth: 3, maxRenders: 12, minPixels: 48, farByLevel: [6000, 2600, 1300, 800, 600] };
    this.stats = this.freshStats();
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e9);
    renderer.clippingPlanes = [this.clipPlane];
    this.cams = [];
    this.quad = new THREE.PlaneGeometry(2, 2);
    this.box = openBoxGeometry();
    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = false;
    this.mesh = new THREE.Mesh(this.quad);
    this.mesh.matrixAutoUpdate = false; this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._s = new THREE.Matrix4(); this._v = new THREE.Vector3();
    this._arr = new Array(16);

    const mark = (side, depthTest) => stencilMat(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest, side }), THREE.EqualStencilFunc, THREE.IncrementStencilOp);
    this.markMat = [mark(THREE.FrontSide, true), mark(THREE.DoubleSide, false)];
    const farShader = {
      vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
      fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
    };
    const far = (side) => stencilMat(new THREE.ShaderMaterial({ ...farShader, colorWrite: false, depthWrite: true, depthTest: true, depthFunc: THREE.AlwaysDepth, side }), THREE.EqualStencilFunc, THREE.KeepStencilOp);
    this.farMat = [far(THREE.FrontSide), far(THREE.DoubleSide)];
    // Restore: the portal surface's depth, the source world's fog over the
    // destination's image, and the stencil back to the source level.
    this.fogU = {
      uFogColor: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
      uFogParams: { value: new THREE.Vector4() }, uFogPlane: { value: new THREE.Vector4() }, uTime: { value: 0 },
      uFill: { value: new THREE.Color() }, uFillAmt: { value: 0 },
    };
    const restoreShader = {
      uniforms: this.fogU,
      vertexShader: 'varying vec3 vWorldP; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorldP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `${FOG_PARS}\nuniform vec3 uFill; uniform float uFillAmt; varying vec3 vWorldP;
        void main() { vec3 rd; float f = fogAmount(cameraPosition, vWorldP, rd);
          float a = max(f, uFillAmt);
          vec3 c = mix(uFill, fogColorFor(rd), uFillAmt > 0.0 ? f : 1.0);
          gl_FragColor = vec4(c, a); }`,
      transparent: true, depthWrite: true, depthTest: true, depthFunc: THREE.AlwaysDepth,
    };
    const restore = (side) => stencilMat(new THREE.ShaderMaterial({ ...restoreShader, side }), THREE.EqualStencilFunc, THREE.DecrementStencilOp);
    this.restoreMat = [restore(THREE.FrontSide), restore(THREE.DoubleSide)];
    // Terminal fill: an opaque haze of the destination's horizon colour, fogged by the source.
    const fill = (side, depthTest) => stencilMat(new THREE.ShaderMaterial({ ...restoreShader, transparent: false, depthFunc: THREE.LessEqualDepth, depthTest, side }), THREE.EqualStencilFunc, THREE.KeepStencilOp);
    this.fillMat = [fill(THREE.FrontSide, true), fill(THREE.DoubleSide, false)];
  }

  freshStats() {
    return { worldRenders: 0, portalsVisible: 0, portalsRendered: 0, portalsFilled: 0, maxLevel: 0, culledBackface: 0, culledClip: 0, culledOffscreen: 0, budgetHits: 0, nearZone: 0 };
  }

  camFor(level) {
    while (this.cams.length <= level) {
      const c = new THREE.PerspectiveCamera();
      c.layers.enableAll();
      this.cams.push(c);
    }
    return this.cams[level];
  }

  setClip(clip) {
    if (clip) { this.clipPlane.normal.set(clip.n[0], clip.n[1], clip.n[2]); this.clipPlane.constant = clip.d; }
    else { this.clipPlane.normal.set(0, 1, 0); this.clipPlane.constant = 1e9; }
  }

  setScissor(rect) {
    const t = this.target;
    if (rect.full) t.scissorTest = false;
    else { t.scissor.set(rect.x, rect.y, rect.w, rect.h); t.scissorTest = true; }
    this.r.setRenderTarget(t);
  }

  lockStencil(level) {
    const st = this.r.state.buffers.stencil, gl = this.gl;
    st.setLocked(false);
    st.setTest(true); st.setMask(0x00); st.setFunc(gl.EQUAL, level, 0xff); st.setOp(gl.KEEP, gl.KEEP, gl.KEEP);
    st.setLocked(true);
  }
  unlockStencil() { const st = this.r.state.buffers.stencil; st.setLocked(false); st.setMask(0xff); }

  layersFor(level, transparent) {
    let m = (1 << LAYER.LIGHTS) >>> 0;
    if (transparent) m |= 1 << LAYER.TRANSPARENT;
    else {
      m |= 1 << LAYER.OPAQUE;
      if (level <= 1) m |= 1 << LAYER.DETAIL;
      if (level >= 1) m |= 1 << LAYER.AVATAR;
    }
    return m >>> 0;
  }

  // Render `root` as seen by `camera` into `target`. getView(key) returns a
  // loaded world view or null.
  render(root, camera, target, getView) {
    const r = this.r;
    this.target = target; this.getView = getView;
    this.stats = this.freshStats();
    this.renders = 0;
    this.full = { x: 0, y: 0, w: target.width, h: target.height, full: true };
    this.setScissor(this.full);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    const cam = this.camFor(0);
    cam.copy(camera, false);
    cam.layers.enableAll();
    cam.updateMatrixWorld(true);
    this.drawWorld(root, cam, 0, null, this.full);
    this.setScissor(this.full);
    this.setClip(null);
    this.unlockStencil();
  }

  drawWorld(view, cam, level, clip, rect) {
    const r = this.r, st = this.stats;
    st.worldRenders++; st.maxLevel = Math.max(st.maxLevel, level);
    this.setClip(clip);
    view.beforeRender(cam, level, clip, this);
    this.lockStencil(level);
    cam.layers.mask = this.layersFor(level, false);
    r.render(view.scene, cam);
    this.unlockStencil();

    const list = this.visiblePortals(view, cam, level, clip, rect);
    for (const it of list) {
      const P = it.P;
      const dest = this.getView(P.link.world);
      const D = dest && dest.portal(P.link.slot);
      const minPix = level === 0 ? 0 : this.settings.minPixels;
      const ok = dest && dest.ready && D && level + 1 <= this.settings.maxDepth && this.renders < this.settings.maxRenders && it.area >= minPix;
      if (!ok) {
        if (!dest && this.wanted && level + 1 <= 2) this.wanted.add(P.link.world);
        if (dest && D && level + 1 <= this.settings.maxDepth && this.renders >= this.settings.maxRenders) st.budgetHits++;
        this.drawSurface(P, it.near, cam, this.fillMat, level, view, clip, dest, P.link.world);
        st.portalsFilled++;
        continue;
      }
      this.renders++; st.portalsRendered++;
      if (it.near) st.nearZone++;
      this.drawSurface(P, it.near, cam, this.markMat, level, view, clip);
      this.drawSurface(P, it.near, cam, this.farMat, level + 1, view, clip);
      const M = pairXf(P, D);
      const vcam = this.camFor(level + 1);
      vcam.copy(cam, false);
      const p = xpoint(M, [cam.position.x, cam.position.y, cam.position.z]);
      const q = qnorm(qmul(M.q, [cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w]));
      vcam.position.set(p[0], p[1], p[2]);
      vcam.quaternion.set(q[0], q[1], q[2], q[3]);
      // deeper levels see less far: fewer draws, and fog hides the rest
      const far = this.settings.farByLevel[Math.min(level + 1, this.settings.farByLevel.length - 1)];
      if (vcam.far !== far) { vcam.far = far; vcam.updateProjectionMatrix(); }
      vcam.updateMatrixWorld(true);
      vcam.userData.viaPortal = D;
      if (this.seen && !this.seen.has(dest.key)) this.seen.set(dest.key, vcam.position.clone());
      this.setScissor(it.rect);
      this.drawWorld(dest, vcam, level + 1, { n: D.n, d: D.d, portal: D }, it.rect);
      // back in W: restore its scissor, clip plane and uniforms (W may have been drawn again in the recursion)
      this.setScissor(rect);
      this.setClip(clip);
      view.beforeRender(cam, level, clip, this);
      this.drawSurface(P, it.near, cam, this.restoreMat, level + 1, view, clip);
    }

    this.setClip(clip);
    this.lockStencil(level);
    cam.layers.mask = this.layersFor(level, true);
    r.render(view.scene, cam);
    this.unlockStencil();
  }

  drawSurface(P, near, cam, mats, ref, view, clip, fillView, fillKey) {
    const mat = mats[near ? 1 : 0];
    mat.stencilRef = ref;
    if (mat.uniforms && mat.uniforms.uFogColor) {
      const u = view.uniforms;
      this.fogU.uFogColor.value.copy(u.uFogColor.value);
      this.fogU.uSunDir.value.copy(u.uSunDir.value);
      this.fogU.uSunColor.value.copy(u.uSunColor.value);
      this.fogU.uFogParams.value.copy(u.uFogParams.value);
      this.fogU.uFogPlane.value.copy(u.uFogPlane.value);
      if (mats === this.fillMat) {
        this.fogU.uFill.value.setRGB(...(fillView ? fillView.fillColor : (this.fillFor && this.fillFor(fillKey)) || [0.02, 0.02, 0.03]));
        this.fogU.uFillAmt.value = 1;
      } else this.fogU.uFillAmt.value = 0;
    }
    this.mesh.geometry = near ? this.box : this.quad;
    this.mesh.material = mat;
    const pad = near ? 0 : PAD;
    xmat4(P.xf, this._arr);
    this._m.fromArray(this._arr);
    this._s.makeScale(P.hw + pad, P.hh + pad, near ? BOX_DEPTH : 1);
    this.mesh.matrixWorld.multiplyMatrices(this._m, this._s);
    this.r.render(this.scene, cam);
  }

  // Portals of `view` that can be seen from `cam` inside `rect`, nearest first.
  visiblePortals(view, cam, level, clip, rect) {
    const out = [], st = this.stats;
    const eye = [cam.position.x, cam.position.y, cam.position.z];
    for (const P of view.portals) {
      if (!P.link) continue;
      const sd = P.n[0] * eye[0] + P.n[1] * eye[1] + P.n[2] * eye[2] + P.d;
      if (sd < 0) { st.culledBackface++; continue; }
      const cs = P.cornersPad;
      if (clip) {
        let any = false;
        for (const c of cs) if (clip.n[0] * c[0] + clip.n[1] * c[1] + clip.n[2] * c[2] + clip.d > 1e-4) { any = true; break; }
        if (!any) { st.culledClip++; continue; }
      }
      const near = cameraInNearZone(P, eye, NEAR_ZONE);
      let rc;
      if (near) rc = { ...rect };
      else {
        rc = this.screenRect(cs, cam, clip);
        if (!rc) { st.culledOffscreen++; continue; }
        rc = intersect(rc, rect);
        if (!rc) { st.culledOffscreen++; continue; }
      }
      st.portalsVisible++;
      const dx = P.xf.p[0] - eye[0], dy = P.xf.p[1] - eye[1], dz = P.xf.p[2] - eye[2];
      out.push({ P, rect: rc, near, area: rc.w * rc.h, dist: Math.hypot(dx, dy, dz) });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }

  screenRect(corners, cam, clip) {
    let pts = corners;
    if (clip) pts = clipPoly(pts, clip.n, clip.d);
    if (pts.length < 3) return null;
    const vm = cam.matrixWorldInverse.elements, pm = cam.projectionMatrix.elements;
    let vs = pts.map((p) => [
      vm[0] * p[0] + vm[4] * p[1] + vm[8] * p[2] + vm[12],
      vm[1] * p[0] + vm[5] * p[1] + vm[9] * p[2] + vm[13],
      vm[2] * p[0] + vm[6] * p[1] + vm[10] * p[2] + vm[14],
    ]);
    vs = clipPoly(vs, [0, 0, -1], -cam.near * 1.0001);
    if (vs.length < 3) return null;
    const W = this.target.width, H = this.target.height;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const v of vs) {
      const cx = pm[0] * v[0] + pm[4] * v[1] + pm[8] * v[2] + pm[12];
      const cy = pm[1] * v[0] + pm[5] * v[1] + pm[9] * v[2] + pm[13];
      const cw = pm[3] * v[0] + pm[7] * v[1] + pm[11] * v[2] + pm[15];
      const sx = (cx / cw * 0.5 + 0.5) * W, sy = (cy / cw * 0.5 + 0.5) * H;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    x0 = Math.max(0, Math.floor(x0) - 2); y0 = Math.max(0, Math.floor(y0) - 2);
    x1 = Math.min(W, Math.ceil(x1) + 2); y1 = Math.min(H, Math.ceil(y1) + 2);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
}

function intersect(a, b) {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function clipPoly(points, n, d) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const da = n[0] * a[0] + n[1] * a[1] + n[2] * a[2] + d, db = n[0] * b[0] + n[1] * b[1] + n[2] * b[2] + d;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  }
  return out;
}
