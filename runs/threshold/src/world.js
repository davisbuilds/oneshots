import * as T from '../vendor/three.module.js';
import { describe } from './atlas.js';
import { ground } from './geography.js';
import { Cache } from './stream.js';
import { Masonry } from './sculpt.js';
import { gatehouse, ocean, desert, forest, stone } from './places.js';
import { ice, archive, chapel, resonator } from './late-places.js';
import { sky, sea } from './atmosphere.js';
import { groundCover, pennants, motes } from './details.js';
import { starChart, seabirds } from './relics.js';
import { terrainTile, horizonTile, TILE } from './terrain.js';

function tileField(scene, info) {
  let last = '',
    visible = [],
    far = null;
  const cache = new Cache(
    64,
    (key) => {
      const [cx, cz, lod] = key.split(',').map(Number);
      const mesh = terrainTile(info, cx, cz, lod);
      const group = new T.Group();
      group.add(mesh);
      if (lod === 24) {
        const cover = new Masonry();
        groundCover(cover, info, cx, cz);
        cover.finish(group, false);
      }
      return group;
    },
    (tile) => {
      tile.removeFromParent();
      tile.children[0].geometry.dispose();
      for (const batch of tile.children.slice(1)) batch.dispose();
    }
  );
  return {
    cache,
    update(x, z) {
      const cx = Math.floor(x / TILE),
        cz = Math.floor(z / TILE),
        key = cx + ',' + cz;
      if (key === last) return;
      last = key;
      if (far) {
        far.removeFromParent();
        far.geometry.dispose();
      }
      far = horizonTile(info, cx, cz);
      scene.add(far);
      for (const tile of visible) tile.removeFromParent();
      visible = [];
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const lod = Math.max(Math.abs(dx), Math.abs(dz)) <= 1 ? 24 : 8;
          const tile = cache.get([cx + dx, cz + dz, lod].join(','));
          visible.push(tile);
          scene.add(tile);
        }
    },
    dispose() {
      cache.clear();
      far?.geometry.dispose();
    },
  };
}
export function buildWorld(id) {
  const info = describe(id),
    { biome } = info;
  const scene = new T.Scene(),
    effects = new T.Scene(),
    atmosphere = sky(info),
    fogColor = atmosphere.fog;
  scene.add(atmosphere.mesh);
  scene.fog = new T.FogExp2(
    fogColor,
    { forest: 0.02, desert: 0.008, ice: 0.014, archive: 0.013, ocean: 0.0068 }[biome]
  );
  const hemi = new T.HemisphereLight(
    biome === 'forest' ? 0x9ce0da : biome === 'ice' ? 0xc8e4ff : 0xffefda,
    biome === 'forest' ? 0x334b50 : 0x768075,
    biome === 'forest' ? 1.25 : 1.32
  );
  scene.add(hemi);
  const light = new T.DirectionalLight(
    biome === 'forest' ? 0xbaefc9 : biome === 'ice' ? 0xffe9e0 : 0xffdcaa,
    biome === 'forest' ? 1.45 : 2.22
  );
  light.position.set(-35, 43, 19);
  scene.add(light);
  light.castShadow = true;
  Object.assign(light.shadow.camera, { left: -36, right: 36, top: 39, bottom: -37, near: 1, far: 130 });
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.00025;
  light.shadow.normalBias = 0.035;
  light.shadow.autoUpdate = false;
  light.shadow.needsUpdate = true;
  const m = new Masonry();
  ({ ocean, desert, forest, ice, archive })[biome](m, info);
  for (const g of info.gates) gatehouse(m, g, info);
  if (biome === 'ocean') {
    chapel(
      m,
      info.gates.find((g) => g.key === 'fork')
    );
    pennants(m, info);
  }
  resonator(m, info);
  const batches = m.finish(scene);
  const field = biome !== 'ocean' && biome !== 'archive' ? tileField(scene, info) : null;
  const water = biome === 'ocean' ? sea() : null;
  if (water) scene.add(water);
  const dust = motes(info);
  effects.add(dust);
  const [bx, bz] = info.beacon;
  const signal = new T.Mesh(
    new T.OctahedronGeometry(0.165, 1),
    new T.MeshStandardMaterial({ color: stone[biome][3], metalness: 0.47, roughness: 0.33 })
  );
  signal.position.set(bx, ground(info, bx, bz) + 1.61, bz);
  scene.add(signal);
  const chart = starChart(info);
  scene.add(chart.group);
  const birds = biome === 'ocean' ? seabirds(info.seed) : null;
  if (birds) scene.add(birds.mesh);
  let tuned = false;
  return {
    ...info,
    scene,
    effects,
    fogColor,
    field,
    setLinks: chart.links,
    setTuned(value) {
      tuned = !!value;
      chart.group.visible = tuned;
      signal.material.emissive.set(value ? stone[biome][4] : 0);
      signal.scale.setScalar(value ? 1.29 : 1);
    },
    prepare(camera, time, depth, entrance) {
      atmosphere.uniforms.clock.value = time;
      dust.material.uniforms.clock.value = time;
      signal.rotation.y = time * (tuned ? 0.62 : 0.14);
      if (water) water.material.uniforms.clock.value = time;
      birds?.animate(time);
      if (field) {
        const center = depth ? info.gates.find((g) => g.key === entrance).origin : camera.position;
        field.update(center.x, center.z);
      }
    },
    dispose() {
      field?.dispose();
      chart.dispose();
      for (const b of batches) b.dispose();
      light.shadow.dispose();
      for (const mesh of [atmosphere.mesh, water, dust, signal, birds?.mesh])
        if (mesh) {
          mesh.geometry.dispose();
          mesh.material.dispose();
        }
      scene.clear();
      effects.clear();
    },
  };
}
export class WorldStore extends Cache {
  constructor() {
    super(8, buildWorld, (world) => world.dispose());
  }
  stats() {
    return {
      worlds: this.entries.size,
      evictions: this.evictions,
      chunks: [...this.entries.values()].reduce((sum, w) => sum + (w.field?.cache.entries.size || 0), 0),
    };
  }
}
