import * as T from '../vendor/three.module.js';
import { noise } from './geography.js';

const geometries = new Map();
export function shape(key, make) {
  if (!geometries.has(key)) geometries.set(key, make());
  return geometries.get(key);
}
const box = shape('dressed-block', () => {
  const outline = new T.Shape(),
    r = 0.48,
    k = 0.026;
  const corners = [
    [-r + k, -r],
    [r - k, -r],
    [r, -r + k],
    [r, r - k],
    [r - k, r],
    [-r + k, r],
    [-r, r - k],
    [-r, -r + k],
  ];
  corners.forEach(([x, y], i) => (i ? outline.lineTo(x, y) : outline.moveTo(x, y)));
  outline.closePath();
  const geo = new T.ExtrudeGeometry(outline, {
    depth: 0.96,
    bevelEnabled: true,
    bevelSize: 0.02,
    bevelThickness: 0.02,
    bevelSegments: 1,
  });
  geo.translate(0, 0, -0.48);
  return geo;
});
const cyl = shape('shaft', () => new T.CylinderGeometry(1, 1, 1, 12));
const taper = shape('taper', () => new T.CylinderGeometry(0.36, 1, 1, 8));
const bead = shape('bead', () => new T.SphereGeometry(1, 8, 5));
const ball = shape('orb', () => new T.SphereGeometry(1, 24, 16));
let surface;
function grain() {
  if (surface) return surface;
  const size = 256,
    bytes = new Uint8Array(size * size * 4);
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      // Periodic coordinates keep adjacent dressed blocks continuous.
      const u = Math.cos((x / size) * Math.PI * 2),
        v = Math.sin((x / size) * Math.PI * 2);
      const w = Math.cos((z / size) * Math.PI * 2),
        q = Math.sin((z / size) * Math.PI * 2);
      const coarse = noise(u * 3 + w * 5, v * 5 + q * 3, 119);
      const mottle = noise(u * 17 + w * 13, v * 15 + q * 11, 31);
      let h = Math.imul(x + 101, z + 37) * 1664525;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      const fine = ((h >>> 0) % 1000) / 1000;
      const vein = Math.exp(-Math.abs(coarse - 0.5) * 50);
      const shade = Math.round(145 + 46 * coarse + 41 * mottle + 28 * fine - 32 * vein);
      bytes.set([shade, shade, shade, 255], (z * size + x) * 4);
    }
  surface = new T.DataTexture(bytes, size, size, T.RGBAFormat);
  surface.wrapS = surface.wrapT = T.RepeatWrapping;
  surface.magFilter = T.LinearFilter;
  surface.minFilter = T.LinearMipmapLinearFilter;
  surface.anisotropy = 4;
  surface.generateMipmaps = true;
  surface.needsUpdate = true;
  return surface;
}
const materials = {};
export function material(kind) {
  if (materials[kind]) return materials[kind];
  if (kind === 'light') materials[kind] = new T.MeshBasicMaterial({ color: 0xffffff });
  else {
    const m = new T.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: kind === 'living' || kind === 'cap',
      roughness: kind === 'metal' ? 0.38 : 0.88,
      metalness: kind === 'metal' ? 0.42 : 0,
      side: kind === 'living' || kind === 'cap' ? T.DoubleSide : T.FrontSide,
    });
    m.customProgramCacheKey = () => 'threshold-grain-' + kind;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.grainMap = { value: grain() };
      shader.vertexShader =
        'varying vec3 grainPosition;\n' +
        shader.vertexShader.replace(
          '#include <project_vertex>',
          `
        vec4 grainVertex=vec4(transformed,1.);
        #ifdef USE_INSTANCING
        grainVertex=instanceMatrix*grainVertex;
        #endif
        grainPosition=(modelMatrix*grainVertex).xyz;
        #include <project_vertex>`
        );
      shader.fragmentShader =
        'uniform sampler2D grainMap; varying vec3 grainPosition;\n' +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          `
        #include <color_fragment>
        vec3 p=grainPosition;
        vec2 st=vec2(p.x*.71+p.z*.43,p.y+p.z*.69-p.x*.32);
        float mottling=texture2D(grainMap,st*.23).r;
        float pits=texture2D(grainMap,st*2.8).r;
        float weather=texture2D(grainMap,vec2(st.x*.75,p.y*.09+st.y*.025)).r;
        diffuseColor.rgb*=.12+.54*mottling+.29*pits+.32*weather;`
        );
      if (kind === 'stone' || kind === 'living') {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_maps>',
          `
          #include <normal_fragment_maps>
          vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
          vec3 tangentX=cross(dy,normal),tangentY=cross(normal,dx);
          float determinant=dot(dx,tangentX);
          float relief=(mottling*.052+pits*.012);
          vec3 gradient=sign(determinant)*(dFdx(relief)*tangentX+dFdy(relief)*tangentY);
          normal=normalize(max(abs(determinant),1e-8)*normal-gradient);`
        );
      }
    };
    if (kind === 'cap') {
      m.emissive.set(0x55b9a3);
      m.emissiveIntensity = 0.23;
    }
    materials[kind] = m;
  }
  return materials[kind];
}
export class Masonry {
  constructor() {
    this.groups = new Map();
    this.frame = new T.Matrix4();
    this.batches = [];
  }
  place(geometry, kind, color, x, y, z, sx, sy, sz, rotation) {
    const q = rotation?.isQuaternion
      ? rotation
      : new T.Quaternion().setFromEuler(new T.Euler(...(rotation || [0, 0, 0]), 'YXZ'));
    const m = new T.Matrix4()
      .compose(new T.Vector3(x, y, z), q, new T.Vector3(sx, sy, sz))
      .premultiply(this.frame);
    const key = geometry.uuid + kind;
    if (!this.groups.has(key)) this.groups.set(key, { geometry, kind, items: [] });
    this.groups.get(key).items.push([m, new T.Color(color)]);
  }
  box(x, y, z, w, h, d, c, rot, kind = 'stone') {
    this.place(box, kind, c, x, y, z, w, h, d, rot);
  }
  cylinder(x, y, z, rx, h, rz, c, rot, kind = 'stone') {
    this.place(cyl, kind, c, x, y, z, rx, h, rz, rot);
  }
  cone(x, y, z, rx, h, rz, c, rot, kind = 'stone') {
    this.place(taper, kind, c, x, y, z, rx, h, rz, rot);
  }
  orb(x, y, z, sx, sy, sz, c, kind = 'metal') {
    this.place(Math.max(sx, sy, sz) < 0.7 ? bead : ball, kind, c, x, y, z, sx, sy, sz);
  }
  beam(start, end, r, color, kind = 'stone') {
    const a = new T.Vector3(...start),
      b = new T.Vector3(...end),
      dir = b.clone().sub(a);
    const mid = a.addScaledVector(dir, 0.5),
      q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir.clone().normalize());
    this.place(cyl, kind, color, mid.x, mid.y, mid.z, r, dir.length(), r, q);
  }
  ring(x, y, z, r, tube, c, rot, kind = 'metal') {
    const ratio = Math.round((tube / r) * 1000) / 1000;
    const geo = shape('ring' + ratio, () => new T.TorusGeometry(1, ratio, 6, 88));
    this.place(geo, kind, c, x, y, z, r, r, r, rot);
  }
  finish(scene, shadows = true) {
    for (const { geometry, kind, items } of this.groups.values()) {
      const batch = new T.InstancedMesh(geometry, material(kind), items.length);
      items.forEach(([m, c], i) => {
        batch.setMatrixAt(i, m);
        batch.setColorAt(i, c);
      });
      batch.castShadow = shadows && kind !== 'light';
      batch.receiveShadow = kind !== 'light';
      batch.computeBoundingSphere();
      scene.add(batch);
      this.batches.push(batch);
    }
    this.groups.clear();
    return this.batches;
  }
}
export function shade(color, scale) {
  return new T.Color(color).multiplyScalar(scale);
}
export function wedge(inner, outer, count) {
  const key = ['wedge', inner, outer, count].join('/');
  return shape(key, () => {
    const a = (Math.PI / count) * 0.496,
      contour = new T.Shape();
    contour.moveTo(inner * Math.cos(-a), inner * Math.sin(-a));
    contour.lineTo(outer * Math.cos(-a), outer * Math.sin(-a));
    contour.lineTo(outer * Math.cos(a), outer * Math.sin(a));
    contour.lineTo(inner * Math.cos(a), inner * Math.sin(a));
    contour.closePath();
    const g = new T.ExtrudeGeometry(contour, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5);
    return g;
  });
}
export function arch(m, x, y, z, inner, outer, depth, count, color, kind = 'stone') {
  const geo = wedge(inner, outer, count);
  for (let i = 0; i < count; i++)
    m.place(geo, kind, shade(color, 0.88 + (0.13 * ((i * 7) % 11)) / 10), x, y, z, 1, 1, depth, [
      0,
      0,
      ((i + 0.5) * Math.PI) / count,
    ]);
}
