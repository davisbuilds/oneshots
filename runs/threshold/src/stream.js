// The disposer owns only resources allocated for this entry. Geometry and
// materials from the shared sculpture library outlive every individual world.
export class Cache {
  constructor(capacity, build, dispose) {
    this.capacity = capacity;
    this.build = build;
    this.dispose = dispose;
    this.entries = new Map();
    this.evictions = 0;
  }
  get(key) {
    if (this.entries.has(key)) {
      const value = this.entries.get(key);
      this.entries.delete(key);
      this.entries.set(key, value);
      return value;
    }
    if (this.entries.size >= this.capacity) {
      const [old, value] = this.entries.entries().next().value;
      this.entries.delete(old);
      this.dispose(value);
      this.evictions++;
    }
    const value = this.build(key);
    this.entries.set(key, value);
    return value;
  }
  clear() {
    for (const v of this.entries.values()) this.dispose(v);
    this.entries.clear();
  }
}
