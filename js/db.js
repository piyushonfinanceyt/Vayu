/* Storage adapter: IndexedDB -> localStorage -> memory. Every step is wrapped in try/catch, so a blocked or
   broken browser store degrades to the next one instead of breaking the app.
   Stores: records (key [collection, id]), meta (settings, meta, timer …), snapshots (restore points),
           audio (journal voice notes and mock answer-page photos, kept on this device only). */

const DB_NAME = 'final-comeback-v3';
const STORES = ['records', 'meta', 'snapshots', 'audio'];
const LS_PREFIX = 'fc3.';

const keyStr = (k) => (Array.isArray(k) ? k.join('\u0000') : String(k));
const keyArr = (s, store) => (store === 'records' ? s.split('\u0000') : s);

// ---------- IndexedDB ----------
function idbBackend() {
  let db = null;
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return {
    kind: 'indexeddb',
    async open() {
      if (!('indexedDB' in window)) throw new Error('IndexedDB is not available');
      db = await new Promise((res, rej) => {
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = () => { STORES.forEach((s) => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); }); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('The database is blocked by another tab'));
      });
      // a quick round trip proves the store really works (some private modes open but refuse writes)
      await this.write([{ s: 'meta', k: '_probe', v: Date.now() }]);
    },
    write(ops) {
      return new Promise((res, rej) => {
        const t = db.transaction(STORES, 'readwrite');
        ops.forEach((o) => { const st = t.objectStore(o.s); if (o.v === undefined) st.delete(o.k); else st.put(o.v, o.k); });
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error || new Error('Write aborted'));
      });
    },
    async getAll(store) {
      const st = db.transaction(store).objectStore(store);
      const [keys, vals] = await Promise.all([req(st.getAllKeys()), req(st.getAll())]);
      return keys.map((k, i) => [k, vals[i]]);
    },
    get(store, key) { return req(db.transaction(store).objectStore(store).get(key)); },
    clear(store) { return new Promise((res, rej) => { const t = db.transaction(store, 'readwrite'); t.objectStore(store).clear(); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
  };
}

// ---------- localStorage (one JSON key per store; audio stays in memory) ----------
function lsBackend() {
  const mem = {};
  const load = (s) => { if (mem[s]) return mem[s]; let o = {}; if (s !== 'audio') { try { o = JSON.parse(localStorage.getItem(LS_PREFIX + s) || '{}') || {}; } catch (e) { o = {}; } } mem[s] = o; return o; };
  const save = (s) => { if (s === 'audio') return; localStorage.setItem(LS_PREFIX + s, JSON.stringify(mem[s])); };
  return {
    kind: 'localstorage',
    async open() { localStorage.setItem(LS_PREFIX + 'probe', '1'); localStorage.removeItem(LS_PREFIX + 'probe'); STORES.forEach(load); },
    async write(ops) {
      const touched = new Set();
      ops.forEach((o) => { const m = load(o.s), k = keyStr(o.k); if (o.v === undefined) delete m[k]; else m[k] = o.v; touched.add(o.s); });
      touched.forEach(save);
    },
    async getAll(store) { const m = load(store); return Object.keys(m).map((k) => [keyArr(k, store), m[k]]); },
    async get(store, key) { return load(store)[keyStr(key)]; },
    async clear(store) { mem[store] = {}; save(store); }
  };
}

// ---------- memory (nothing survives a reload) ----------
function memBackend() {
  const mem = {}; STORES.forEach((s) => { mem[s] = new Map(); });
  return {
    kind: 'memory',
    async open() {},
    async write(ops) { ops.forEach((o) => { const k = keyStr(o.k); if (o.v === undefined) mem[o.s].delete(k); else mem[o.s].set(k, o.v); }); },
    async getAll(store) { return Array.from(mem[store].entries()).map(([k, v]) => [keyArr(k, store), v]); },
    async get(store, key) { return mem[store].get(keyStr(key)); },
    async clear(store) { mem[store].clear(); }
  };
}

let backend = null;
export async function open() {
  for (const make of [idbBackend, lsBackend, memBackend]) {
    const b = make();
    try { await b.open(); backend = b; return b.kind; } catch (e) { console.warn('[db] ' + b.kind + ' unavailable:', e && e.message); }
  }
  return 'memory';
}
export const kind = () => (backend ? backend.kind : 'memory');
export const write = (ops) => (ops.length ? backend.write(ops) : Promise.resolve());
export const getAll = (store) => backend.getAll(store);
export const get = (store, key) => backend.get(store, key);
export const clear = (store) => backend.clear(store);

export async function estimate() { try { return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (e) { return null; } }
export async function persist(ask) {
  try {
    if (!navigator.storage || !navigator.storage.persisted) return false;
    if (await navigator.storage.persisted()) return true;
    return ask && navigator.storage.persist ? await navigator.storage.persist() : false;
  } catch (e) { return false; }
}
