// Each change commits as one transaction. Passage records are local to their
// two worlds; paging the atlas never materializes the whole discovery graph.
function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const fresh = (id) => ({ id, first: Date.now(), links: {}, tuned: false });
export class Journal {
  constructor(database) {
    this.database = database;
  }
  static async open() {
    const req = indexedDB.open('threshold-field-atlas-v1', 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore('worlds', { keyPath: 'id' });
      s.createIndex('first', 'first');
    };
    return new Journal(await request(req));
  }
  read(id) {
    const s = this.database.transaction('worlds').objectStore('worlds');
    return request(s.get(id));
  }
  count() {
    return request(this.database.transaction('worlds').objectStore('worlds').count());
  }
  change(edits) {
    const tx = this.database.transaction('worlds', 'readwrite'),
      s = tx.objectStore('worlds');
    // Group edits first: both mouths of a self-loop change the same record.
    const grouped = new Map();
    for (const [id, fn] of edits) {
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id).push(fn);
    }
    for (const [id, fns] of grouped) {
      const r = s.get(id);
      r.onsuccess = () => {
        const value = r.result || fresh(id);
        for (const fn of fns) fn(value);
        s.put(value);
      };
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  }
  visit(id) {
    return this.change([[id, () => {}]]);
  }
  traverse(from, gate, exit) {
    return this.change([
      [
        from,
        (r) => {
          r.links[gate.key] = gate.to;
        },
      ],
      [
        gate.to,
        (r) => {
          r.links[exit.key] = from;
        },
      ],
    ]);
  }
  tune(id) {
    return this.change([
      [
        id,
        (r) => {
          r.tuned = true;
        },
      ],
    ]);
  }
  page(offset = 0, limit = 8) {
    const index = this.database.transaction('worlds').objectStore('worlds').index('first');
    return new Promise((resolve, reject) => {
      const records = [],
        r = index.openCursor(null, 'prev');
      let skip = offset;
      r.onerror = () => reject(r.error);
      r.onsuccess = () => {
        const cursor = r.result;
        if (!cursor || records.length === limit) {
          resolve(records);
          return;
        }
        if (skip) {
          cursor.advance(skip);
          skip = 0;
          return;
        }
        records.push(cursor.value);
        cursor.continue();
      };
    });
  }
}
const poseKey = 'threshold-mooring-v1';
export function loadPose() {
  try {
    const p = JSON.parse(localStorage.getItem(poseKey));
    if (
      !p ||
      typeof p.id !== 'string' ||
      !/^([1-9][0-9]*)$/.test(p.id) ||
      ![p.position, p.orientation].every(
        (arr, i) => Array.isArray(arr) && arr.length === 3 + i && arr.every(Number.isFinite)
      )
    )
      return null;
    return p;
  } catch {
    return null;
  }
}
export function savePose(p) {
  try {
    localStorage.setItem(
      poseKey,
      JSON.stringify({ id: p.id, position: p.position.toArray(), orientation: p.orientation.toArray() })
    );
    return true;
  } catch {
    return false;
  }
}
