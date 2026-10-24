/* Merging two copies of your data: this device's and another's (sync, or "Merge it in" when importing a backup).
   Pure functions on the backup's `data` shape; nothing here touches storage.
   - Collections (goals, journal, notes …): per record, the newer edit wins (_u when present, else updatedAt).
     A deletion leaves a tombstone in meta.tombs ("coll/id" → time) that wins over any older copy of the record.
   - Plan records (days, chapters, mocks, runs): per field. setRec stamps every field it writes in _f, so hours logged
     on the phone and steps logged on the computer for the same day both survive. For a field neither copy has a stamp
     for, the filled-in value wins, then the newer record (_u).
   - Settings: the newer copy (settings._u) wins as a whole.
   - Equal stamps pick the larger value, the same on every device, so two devices always end up identical.
   - cutA / cutB: a replace (import, restore point, reset) sets an epoch. Entries in the other copy stamped before it
     are dropped, so the replace reaches every device while edits made after it survive. */

// JSON with sorted keys: the same content always gives the same string, whatever order the keys were written in
export const canon = (v) => JSON.stringify(v === undefined ? null : v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, key) => { o[key] = x[key]; return o; }, {}) : x));
export const stampOf = (r) => (!r ? 0 : r._u != null ? +r._u || 0 : Date.parse(r.updatedAt || r.createdAt || '') || 0);
const blank = (v) => v === null || v === undefined || v === '';
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const newer = (a, b) => { if (!a) return b; if (!b) return a; const x = stampOf(a), y = stampOf(b); return x > y ? a : y > x ? b : canon(b) > canon(a) ? b : a; };

function mergeFields(a, b) {
  if (!a) return b;
  if (!b) return a;
  const fa = obj(a._f), fb = obj(b._f), ua = +a._u || 0, ub = +b._u || 0, out = {}, f = {};
  new Set(Object.keys(a).concat(Object.keys(b))).forEach((k) => {
    if (k === '_f' || k === '_u') return;
    const ta = +fa[k] || 0, tb = +fb[k] || 0, va = a[k], vb = b[k];
    let fromB;
    if (ta !== tb) fromB = tb > ta;
    else if (!ta && blank(va) !== blank(vb)) fromB = blank(va);
    else if (!ta && ua !== ub) fromB = ub > ua;
    else if (va === undefined || vb === undefined) fromB = va === undefined;   // a field one copy lacks: keep it
    else fromB = canon(vb) > canon(va);
    const v = fromB ? vb : va;
    if (v !== undefined) out[k] = v;
    if (ta || tb) f[k] = Math.max(ta, tb);
  });
  if (ua || ub) out._u = Math.max(ua, ub);
  if (Object.keys(f).length) out._f = f;
  return out;
}

// keep only what was written after `cut` (the other device replaced its data at that moment)
function since(d, cut, o) {
  if (!cut) return d;
  const out = { settings: stampOf(d.settings) > cut ? d.settings : null, meta: Object.assign({}, d.meta, { tombs: {} }) };
  const tombs = obj(obj(d.meta).tombs);
  Object.keys(tombs).forEach((k) => { if (tombs[k] > cut) out.meta.tombs[k] = tombs[k]; });
  o.lists.forEach((c) => { const src = obj(d[c]), r = {}; Object.keys(src).forEach((id) => { if (stampOf(src[id]) > cut) r[id] = src[id]; }); out[c] = r; });
  o.legacy.forEach((c) => {
    const src = obj(d[c]), r = {};
    Object.keys(src).forEach((id) => {
      const rec = src[id], f = obj(rec && rec._f), keep = Object.keys(f).filter((k) => f[k] > cut);
      if (!keep.length) return;
      const x = { _u: rec._u, _f: {} };
      keep.forEach((k) => { x[k] = rec[k]; x._f[k] = f[k]; });
      r[id] = x;
    });
    out[c] = r;
  });
  return out;
}

// o = { legacy: [...], lists: [...], cutA, cutB }; a = this device's data, b = the other copy's
export function mergeData(a, b, o) {
  a = since(obj(a), o.cutA, o); b = since(obj(b), o.cutB, o);
  const ma = obj(a.meta), mb = obj(b.meta), tombs = Object.assign({}, obj(ma.tombs));
  Object.keys(obj(mb.tombs)).forEach((k) => { if (!(tombs[k] >= mb.tombs[k])) tombs[k] = mb.tombs[k]; });
  const out = { settings: newer(a.settings, b.settings) || {}, meta: { seeded: Object.assign({}, obj(ma.seeded), obj(mb.seeded)), tombs } };
  o.legacy.forEach((c) => {
    const A = obj(a[c]), B = obj(b[c]), r = {};
    new Set(Object.keys(A).concat(Object.keys(B))).forEach((id) => { const x = mergeFields(A[id], B[id]); if (x) r[id] = x; });
    out[c] = r;
  });
  o.lists.forEach((c) => {
    const A = obj(a[c]), B = obj(b[c]), r = {};
    new Set(Object.keys(A).concat(Object.keys(B))).forEach((id) => {
      const x = newer(A[id], B[id]), t = tombs[c + '/' + id];
      if (x && !(t >= stampOf(x))) r[id] = x;
    });
    out[c] = r;
  });
  return out;
}

// how many records (plus settings and the tombstone list) differ between two copies
export function changes(x, y, o) {
  x = obj(x); y = obj(y);
  let n = 0;
  o.legacy.concat(o.lists).forEach((c) => {
    const X = obj(x[c]), Y = obj(y[c]);
    new Set(Object.keys(X).concat(Object.keys(Y))).forEach((id) => { if (canon(X[id]) !== canon(Y[id])) n++; });
  });
  if (canon(x.settings || {}) !== canon(y.settings || {})) n++;
  const mx = obj(x.meta), my = obj(y.meta);
  if (canon(mx.tombs || {}) !== canon(my.tombs || {}) || canon(mx.seeded || {}) !== canon(my.seeded || {})) n++;
  return n;
}
