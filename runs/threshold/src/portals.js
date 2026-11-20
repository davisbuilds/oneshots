import * as T from '../vendor/three.module.js';
import { WIDTH, HEIGHT, SPRING, admits, passage } from './spatial.js';

const full = [-1, -1, 1, 1];
function clip(vertices, distance) {
  const out = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length];
    const da = distance(a),
      db = distance(b);
    if (da >= 0) out.push(a);
    if (da < 0 !== db < 0) out.push(a.clone().lerp(b, da / (da - db)));
  }
  return out;
}

// Clip in homogeneous coordinates before division, including eye-straddling
// polygons. The ordinary near plane would remove the last sliver at the eye.
export function apertureRect(g, camera, parent = full, plane = null) {
  const eye = camera.position.clone().applyMatrix4(g.inverse);
  if (Math.abs(eye.z) < 1e-8 && admits(eye.x, eye.y)) return parent.slice();
  let points = [
    [-WIDTH / 2, 0],
    [WIDTH / 2, 0],
    [WIDTH / 2, HEIGHT],
    [-WIDTH / 2, HEIGHT],
  ].map(([x, y]) => new T.Vector3(x, y, 0).applyMatrix4(g.frame));
  if (plane) points = clip(points, (p) => plane.distanceToPoint(p));
  const vp = new T.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  let poly = points.map((p) => new T.Vector4(p.x, p.y, p.z, 1).applyMatrix4(vp));
  for (const distance of [
    (p) => p.w - 1e-8,
    (p) => p.x - parent[0] * p.w,
    (p) => parent[2] * p.w - p.x,
    (p) => p.y - parent[1] * p.w,
    (p) => parent[3] * p.w - p.y,
    (p) => p.w - p.z,
  ]) {
    poly = clip(poly, distance);
    if (!poly.length) return null;
  }
  const xs = poly.map((p) => p.x / p.w),
    ys = poly.map((p) => p.y / p.w);
  const rect = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  return area(rect) > 1e-9 ? rect : null;
}
const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);

export function planViews(root, getWorld, depthLimit, passLimit) {
  const nodes = [root];
  // Breadth first reserves direct windows before reflections inside them.
  for (const node of nodes) {
    node.windows = [];
    for (const gate of node.world.gates) {
      if (gate.key === node.entrance) continue;
      const rect = apertureRect(gate, node.camera, node.rect, node.plane);
      if (rect) node.windows.push({ gate, rect });
    }
    const priority = (r) => area(r) / (1 + 0.05 * ((r[0] + r[2]) ** 2 + (r[1] + r[3]) ** 2));
    node.windows.sort((a, b) => priority(b.rect) - priority(a.rect));
    for (const window of node.windows) {
      if (node.depth >= depthLimit || nodes.length - 1 >= passLimit) break;
      const g = window.gate,
        destination = getWorld(g.to);
      const exit = destination.gates.find((p) => p.key === g.mate);
      const cam = node.camera.clone();
      const m = passage(g, exit).multiply(node.camera.matrixWorld);
      m.decompose(cam.position, cam.quaternion, cam.scale);
      cam.updateMatrixWorld(true);
      const side = node.camera.position.clone().sub(g.origin).dot(g.normal) >= 0 ? 1 : -1;
      const plane = new T.Plane().setFromNormalAndCoplanarPoint(
        exit.normal.clone().multiplyScalar(side),
        exit.origin
      );
      const child = {
        world: destination,
        camera: cam,
        entrance: exit.key,
        plane,
        depth: node.depth + 1,
        rect: window.rect,
        slot: nodes.length - 1,
      };
      nodes.push(child);
      window.child = child;
    }
  }
  return nodes;
}

const vertex = `
uniform vec4 bounds;
varying vec2 screen;
void main() {
  screen = mix(bounds.xy,bounds.zw,position.xy*.5+.5);
  gl_Position = vec4(screen,0.,1.);
}`;
const fragment = `
uniform mat4 viewToGate;
uniform mat4 projection;
uniform vec4 cut;
uniform sampler2D image;
uniform vec3 veil;
uniform bool live;
varying vec2 screen;
void main() {
  vec3 eye = viewToGate[3].xyz;
  vec3 ray = mat3(viewToGate)*vec3(screen.x/projection[0][0],screen.y/projection[1][1],-1.);
  if(abs(ray.z)<1e-9 || ray.z*(eye.z>=0.?1.:-1.)>=0.) discard;
  float t = -eye.z/ray.z;
  vec3 point = eye + t*ray;
  vec2 crown = vec2(point.x,max(0.,point.y-${SPRING.toFixed(3)}));
  if(t<0. || point.y<0. || dot(crown,crown)>${((WIDTH * WIDTH) / 4).toFixed(3)} || dot(cut,vec4(point,1.))<-.00001) discard;
  gl_FragDepth = clamp(.5*(-projection[2][2]+projection[3][2]/max(t,1e-8))+.5,0.,1.);
  vec3 color = live ? texture2D(image,screen*.5+.5).rgb : veil*(.78+.22*point.y/${HEIGHT.toFixed(3)});
  gl_FragColor = vec4(color,1.);
  #include <colorspace_fragment>
}`;

export class PortalRenderer {
  constructor(renderer) {
    this.renderer = renderer;
    renderer.autoClear = false;
    renderer.info.autoReset = false;
    this.targets = [];
    this.overlay = new T.Scene();
    this.surface = new T.Mesh(
      new T.PlaneGeometry(2, 2),
      new T.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          bounds: { value: new T.Vector4() },
          viewToGate: { value: new T.Matrix4() },
          projection: { value: new T.Matrix4() },
          cut: { value: new T.Vector4() },
          image: { value: null },
          veil: { value: new T.Color() },
          live: { value: false },
        },
        depthTest: true,
        depthWrite: true,
        toneMapped: false,
      })
    );
    this.surface.frustumCulled = false;
    this.overlay.add(this.surface);
  }
  draw(world, camera, getWorld, time, { depth = 3, budget = 5 } = {}) {
    const r = this.renderer;
    camera.updateMatrixWorld(true);
    const nodes = planViews({ world, camera, depth: 0, rect: full }, getWorld, depth, budget);
    const size = r.getDrawingBufferSize(new T.Vector2());
    r.info.reset();
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      let target = null,
        width = size.x,
        height = size.y;
      if (i) {
        const scale = n.depth === 1 ? 1 : 0.55;
        width = Math.max(1, Math.ceil(size.x * scale));
        height = Math.max(1, Math.ceil(size.y * scale));
        target = this.targets[n.slot];
        if (!target) {
          target = new T.WebGLRenderTarget(width, height, {
            colorSpace: T.SRGBColorSpace,
            generateMipmaps: false,
          });
          this.targets[n.slot] = target;
        }
        target.setSize(width, height);
        const x = Math.max(0, Math.floor((n.rect[0] + 1) * 0.5 * width) - 2),
          y = Math.max(0, Math.floor((n.rect[1] + 1) * 0.5 * height) - 2);
        const x1 = Math.min(width, Math.ceil((n.rect[2] + 1) * 0.5 * width) + 2),
          y1 = Math.min(height, Math.ceil((n.rect[3] + 1) * 0.5 * height) + 2);
        target.scissor.set(x, y, x1 - x, y1 - y);
        target.scissorTest = true;
      }
      r.setRenderTarget(target);
      r.clippingPlanes = n.plane ? [n.plane] : [];
      r.setClearColor(n.world.fogColor);
      r.clear(true, true, false);
      n.world.prepare?.(n.camera, time, n.depth, n.entrance);
      r.render(n.world.scene, n.camera);
      const u = this.surface.material.uniforms;
      r.clippingPlanes = [];
      for (const win of n.windows) {
        const g = win.gate;
        u.bounds.value.fromArray(win.rect);
        u.viewToGate.value.multiplyMatrices(g.inverse, n.camera.matrixWorld);
        u.projection.value.copy(n.camera.projectionMatrix);
        u.live.value = Boolean(win.child);
        u.image.value = win.child ? this.targets[win.child.slot].texture : null;
        u.veil.value.copy(n.world.fogColor);
        u.cut.value.set(0, 0, 0, 1);
        if (n.plane) {
          const p = n.plane.clone().applyMatrix4(g.inverse);
          u.cut.value.set(p.normal.x, p.normal.y, p.normal.z, p.constant);
        }
        this.surface.material.uniformsNeedUpdate = true;
        r.render(this.overlay, n.camera);
      }
      if (n.world.effects) {
        r.clippingPlanes = n.plane ? [n.plane] : [];
        r.render(n.world.effects, n.camera);
      }
    }
    r.clippingPlanes = [];
    return {
      passes: nodes.length,
      depth: Math.max(...nodes.map((n) => n.depth)),
      windows: nodes[0].windows.length,
      targets: this.targets.length,
      calls: r.info.render.calls,
      triangles: r.info.render.triangles,
      geometries: r.info.memory.geometries,
      textures: r.info.memory.textures,
    };
  }
  dispose() {
    for (const target of this.targets) target.dispose();
    this.surface.geometry.dispose();
    this.surface.material.dispose();
  }
}
