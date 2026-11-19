// Persistence of everything the player changes or discovers, kept apart from
// generation: worlds are regenerated from their seeds and this overlay is
// applied on top (lodestones woken, the instrument taken, worlds visited,
// journal entries, photographs, the last position).
import { UNIVERSE } from '../core/multiverse.js';

export const SAVE_KEY = 'threshold.save.v1';
// Each universe seed is a different multiverse (the same address is another
// world in each), so each keeps its own journey. The default keeps the plain key.
export const saveKey = (universe = UNIVERSE) => ((universe >>> 0) === UNIVERSE ? SAVE_KEY : `${SAVE_KEY}:${universe >>> 0}`);

export function emptySave() {
  return { v: 1, visited: {}, lit: {}, seen: {}, instrument: false, journal: [], photos: {}, pos: null, hints: {}, created: Date.now() };
}

export class Save {
  constructor(storage, key = SAVE_KEY) {
    this.storage = storage; this.key = key;
    this.data = this.load();
    this.dirty = false;
  }
  load() {
    try {
      const raw = this.storage && this.storage.getItem(this.key);
      if (!raw) return emptySave();
      const d = JSON.parse(raw);
      return d && d.v === 1 ? { ...emptySave(), ...d } : emptySave();
    } catch { return emptySave(); }
  }
  flush() {
    if (!this.dirty || !this.storage) return;
    try { this.storage.setItem(this.key, JSON.stringify(this.data)); this.dirty = false; }
    catch {
      // storage full: drop photographs first, they are the bulk
      this.data.photos = {};
      try { this.storage.setItem(this.key, JSON.stringify(this.data)); this.dirty = false; } catch { /* keep in memory */ }
    }
  }
  touch() { this.dirty = true; }
  reset() { this.data = emptySave(); this.dirty = true; this.flush(); }

  visit(key, info, now = Date.now()) {
    const v = this.data.visited[key];
    if (v) { v.n++; v.last = now; this.touch(); return false; }
    this.data.visited[key] = { first: now, last: now, n: 1, name: info.name, epithet: info.epithet, archetype: info.archetype, coord: info.coord, links: info.links };
    this.data.journal.push({ t: now, kind: 'world', key, text: info.name });
    this.touch();
    return true;
  }
  isLit(key) { return !!this.data.lit[key]; }
  light(key, now = Date.now()) {
    if (this.data.lit[key]) return false;
    this.data.lit[key] = now;
    this.data.journal.push({ t: now, kind: 'lodestone', key, text: this.data.visited[key]?.name || key });
    this.touch();
    return true;
  }
  see(key, landmarkId, name) {
    const s = (this.data.seen[key] ||= []);
    if (s.includes(landmarkId)) return false;
    s.push(landmarkId);
    this.data.journal.push({ t: Date.now(), kind: 'landmark', key, text: name });
    this.touch();
    return true;
  }
  photo(key, dataUrl) {
    if (this.data.photos[key]) return;
    const keys = Object.keys(this.data.photos);
    if (keys.length >= 40) delete this.data.photos[keys[0]];
    this.data.photos[key] = dataUrl;
    this.touch();
  }
  setPos(world, feet, look) { this.data.pos = { world, feet: feet.map((x) => +x.toFixed(3)), look: look.map((x) => +x.toFixed(5)) }; this.touch(); }
}
