/* Sync between your devices through a secret GitHub Gist, encrypted end to end.
   - Every device keeps its full copy (IndexedDB) and works offline. A sync downloads the gist, merges it into this
     device's copy (merge.js: newest edit wins, per field for plan days; deletions carry over), and uploads the result
     when this device had something the gist didn't.
   - The gist holds one file, vayu-sync.json: your data encrypted with AES-GCM under a key made from your sync
     passphrase (PBKDF2). A secret gist is readable by anyone who has its link, so only scrambled text goes there.
   - Saved on this device only, never in backups: the GitHub token (scope "gist"), and the derived key (not the passphrase).
   - It runs when the app opens or comes back on screen, a few seconds after you change something, when you leave the
     app, every 3 minutes while it's open, and when the connection returns.
   - A replace (import, restore point, reset) carries an epoch: devices that see a newer epoch drop what they had from
     before it, so the replace reaches them too. The first sync of a device always merges and never replaces.
   - A second file, vayu-widget.json, holds the Windows widgets' summary of today and the next 6 days (widgets.js),
     encrypted with the same key and uploaded only when it changed. The service worker of a copy with widgets on the
     board reads it while that copy is closed, so the widgets follow what you log on your other devices. For that the
     worker gets this device's token, gist id and key (as a CryptoKey it can't export) in its own IndexedDB. */
import * as store from './store.js';
import { toast } from './components.js';
import { plural } from './util.js';
import { model } from './model.js';
import { snapshot as widgetSnapshot } from './widgets.js';

const KEY = 'fc.sync', FILE = 'vayu-sync.json', WFILE = 'vayu-widget.json', API = 'https://api.github.com', ITER = 250000;
export const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Vayu%20sync';

let cfg = load();
export const state = { busy: false, error: null, kind: null, lastAt: cfg.lastAt || null };
const subs = new Set();
export const onChange = (fn) => { subs.add(fn); };
const changed = () => subs.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

function load() { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* this device can't keep it */ } }
export const connected = () => !!(cfg.token && cfg.key);
export const account = () => cfg.login || '';
export const ago = (iso) => {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (!iso || !isFinite(s)) return 'never';
  return s < 45 ? 'just now' : s < 3600 ? plural(Math.round(s / 60) || 1, 'minute') + ' ago' : s < 86400 ? plural(Math.round(s / 3600), 'hour') + ' ago' : new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
};

// ---------- GitHub ----------
const fail = (kind, message) => Object.assign(new Error(message), { kind });
async function gh(path, opts = {}, token = cfg.token) {
  let res;
  try {
    res = await fetch(API + path, {
      method: opts.method || 'GET', cache: 'no-store',
      headers: Object.assign({ Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token }, opts.body ? { 'Content-Type': 'application/json' } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
  } catch (e) { throw fail('offline', 'Can’t reach GitHub. Vayu syncs again when you’re back online.'); }
  if (res.status === 401) throw fail('token', 'GitHub didn’t accept the token. It may have expired or been deleted: create a new one and paste it below.');
  if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') throw fail('rate', 'GitHub’s hourly limit is used up. Sync resumes within the hour.');
  if (res.status === 403 || (res.status === 404 && opts.write)) throw fail('token', 'This token can’t save gists. Create one with the “gist” box ticked.');
  if (res.status === 404 && opts.allow404) return null;
  if (!res.ok) throw fail('github', 'GitHub answered with error ' + res.status + '. Vayu will try again shortly.');
  return res.json();
}
async function findGist(token) {
  const list = await gh('/gists?per_page=100', {}, token);
  const mine = (Array.isArray(list) ? list : []).filter((g) => g.files && g.files[FILE]).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return mine.length ? gh('/gists/' + mine[0].id, {}, token) : null;
}
async function envelope(gist) {
  const f = gist.files && gist.files[FILE];
  if (!f) return null;
  const text = f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
  try { const o = JSON.parse(text); return o && o.app === 'vayu-sync' && o.iv && o.data && o.kdf ? o : null; } catch (e) { return null; }
}

// ---------- encryption ----------
const te = new TextEncoder(), td = new TextDecoder();
const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, 256));
}
const aes = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
async function encrypt(obj, raw) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(raw), te.encode(JSON.stringify(obj))));
  return { cipher: 'AES-GCM', iv: toB64(iv), data: toB64(ct) };
}
async function seal(obj, raw, salt) {
  return JSON.stringify(Object.assign({ app: 'vayu-sync', v: 1, note: 'Your Vayu data, encrypted with your sync passphrase. Change it only from the app.', savedAt: new Date().toISOString(), kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITER, salt: toB64(salt) } }, await encrypt(obj, raw)), null, 1);
}
const sealWidget = async (snap, raw) => JSON.stringify(Object.assign({ app: 'vayu-widget', v: 1, note: 'The summary your Windows widgets show, encrypted with your sync passphrase.', savedAt: new Date().toISOString() }, await encrypt(snap, raw)), null, 1);

// ---------- the service worker's copy of the sync details (widget refresh while the app is closed) ----------
function workerStore(fn) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('vayu-worker', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction('kv', 'readwrite');
      fn(tx.objectStore('kv'));
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}
let shared = '';
async function shareWithWorker() {
  const sig = cfg.gistId + '|' + cfg.salt + '|' + cfg.token;
  if (shared === sig || !('indexedDB' in window)) return;
  const key = await crypto.subtle.importKey('raw', fromB64(cfg.key), 'AES-GCM', false, ['decrypt']);
  await workerStore((kv) => kv.put({ token: cfg.token, gistId: cfg.gistId, key }, 'sync'));
  shared = sig;
}
async function unseal(env, raw) {
  let o;
  try { o = JSON.parse(td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, await aes(raw), fromB64(env.data)))); }
  catch (e) { throw fail('pass', 'That passphrase doesn’t open your synced data. Use the one you chose on your other device.'); }
  return o && o.data ? o.data : null;   // opened but empty or damaged: this device's copy replaces it
}

// ---------- connect / disconnect ----------
// token: a GitHub token with the gist scope (blank = keep this device's); pass: the sync passphrase.
// replace: start the synced copy over from this device (after a forgotten passphrase).
export async function connect(token, pass, replace) {
  token = String(token || '').trim() || cfg.token;
  if (!token) throw fail('input', 'Paste a GitHub token first.');
  if (!pass) throw fail('input', 'Type your sync passphrase: the same one on every device.');
  if (!(window.crypto && crypto.subtle)) throw fail('github', 'This browser can’t encrypt. Open Vayu over https.');
  state.busy = true; changed();
  try {
    const user = await gh('/user', {}, token);
    const gist = await findGist(token), env = gist ? await envelope(gist) : null;
    let salt, key;
    if (env && !replace) {
      salt = fromB64(env.kdf.salt);
      key = await deriveKey(pass, salt);
      await unseal(env, key);
    } else {
      salt = crypto.getRandomValues(new Uint8Array(16));
      key = await deriveKey(pass, salt);
    }
    cfg = { token, login: user.login, gistId: gist ? gist.id : null, salt: toB64(salt), key: toB64(key), synced: null, lastAt: null, fresh: !!replace };
    save();
  } finally { state.busy = false; changed(); }
  return syncNow('connect');
}
export function disconnect() {
  clearTimeout(timer);
  cfg = {}; save();
  shared = '';
  workerStore((kv) => kv.delete('sync')).catch(() => {});
  Object.assign(state, { busy: false, error: null, kind: null, lastAt: null });
  changed();
}

// ---------- one sync ----------
let running = null, again = false, timer = 0, lastTry = 0, seq = 0, cleanSeq = 0;
export const needsYou = () => state.kind === 'token' || state.kind === 'pass';
export function syncNow(reason) {
  if (!connected()) return Promise.resolve(null);
  // a bad token or passphrase won't fix itself: wait for you instead of retrying in the background
  if (needsYou() && reason !== 'connect' && reason !== 'manual') return Promise.resolve(null);
  if (running) { again = true; return running; }
  lastTry = Date.now();
  const startSeq = seq;
  running = (async () => {
    state.busy = true; changed();
    try {
      if (navigator.onLine === false) throw fail('offline', 'You’re offline. Vayu syncs when the connection is back.');
      await store.flush();
      const raw = fromB64(cfg.key);
      let gist = cfg.gistId ? await gh('/gists/' + cfg.gistId, { allow404: true }) : null;
      if (!gist && !cfg.fresh) gist = await findGist();
      const env = gist && !cfg.fresh ? await envelope(gist) : null;
      if (env && env.kdf.salt !== cfg.salt) throw fail('pass', 'Your sync passphrase was changed on another device. Enter the new one here.');
      const theirs = env ? await unseal(env, raw) : null;
      const first = !cfg.synced || cfg.synced !== (gist && gist.id);
      // another device replaced everything (import, restore point, reset): keep a way back before following it
      if (theirs && !first && (+(theirs.meta && theirs.meta.epoch) || 0) > (+store.S.meta.epoch || 0)) await store.saveSnapshot('pre-sync-' + Date.now(), 'Before following a replace from your other device');
      // merge and apply with no await in between, so nothing you type meanwhile is lost
      const mine = store.snapshot();
      const eMine = +(mine.meta && mine.meta.epoch) || 0, eTheirs = theirs ? +(theirs.meta && theirs.meta.epoch) || 0 : 0;
      let cutA = 0, cutB = 0, epoch = eMine;
      if (theirs && first) epoch = eTheirs;
      else if (theirs) { if (eTheirs > eMine) cutA = eTheirs; if (eMine > eTheirs) cutB = eMine; epoch = Math.max(eMine, eTheirs); }
      const merged = theirs ? store.mergeWith(mine, theirs, cutA, cutB) : mine;
      const pulled = theirs ? store.applyData(merged, epoch, 'sync') : 0;
      const push = !theirs || epoch !== eTheirs || store.countChanges(merged, theirs) > 0;
      // the widgets' summary of the merged data: sent when it changed (an edit, a new day), the "at" stamp aside
      const snap = widgetSnapshot(model()), snapSig = JSON.stringify(Object.assign({}, snap, { at: 0 }));
      const files = {};
      if (push) files[FILE] = { content: await seal(store.exportObject(), raw, fromB64(cfg.salt)) };
      if (push || snapSig !== cfg.widgetSent || !(gist && gist.files && gist.files[WFILE])) files[WFILE] = { content: await sealWidget(snap, raw) };
      if (Object.keys(files).length) {
        gist = gist ? await gh('/gists/' + gist.id, { method: 'PATCH', body: { files }, write: true })
          : await gh('/gists', { method: 'POST', body: { public: false, description: 'Vayu sync · encrypted, change it only from the app', files }, write: true });
      }
      Object.assign(cfg, { gistId: gist.id, synced: gist.id, lastAt: new Date().toISOString(), fresh: false, widgetSent: snapSig });
      save();
      shareWithWorker().catch((e) => console.warn('[sync] widget refresh not set up:', e && e.message));
      if (seq === startSeq) cleanSeq = seq;
      Object.assign(state, { error: null, kind: null, lastAt: cfg.lastAt });
      if (pulled && reason !== 'connect') toast('Synced · ' + plural(pulled, 'update') + ' from your other device', { icon: 'sync', ms: 2600 });
      return { pulled, pushed: push, first };
    } catch (e) {
      if (!e.kind) console.error('[sync]', e);
      const was = state.kind;
      Object.assign(state, { error: e.kind ? e.message : 'Sync failed: ' + e.message, kind: e.kind || 'error' });
      if (needsYou() && was !== state.kind && reason !== 'connect' && reason !== 'manual') toast('Sync needs attention', { tone: 'warn', ms: 8000, action: { label: 'Open Settings', fn: () => { location.hash = '#/settings'; } } });
      if (reason === 'connect' || reason === 'manual') throw e;
      return null;
    } finally {
      state.busy = false; running = null; changed();
      if (again) { again = false; schedule(1500); }
    }
  })();
  return running;
}
export function schedule(ms) {
  if (!connected()) return;
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow('auto'); }, ms == null ? 10000 : ms);
}

// ---------- when to sync ----------
export function start() {
  store.subscribe((info) => {
    if (!info || info.id === 'sync' || info.coll === 'meta' || info.coll === 'timer') return;
    seq++;
    schedule();
  });
  const pull = () => { if (Date.now() - lastTry > 30000) schedule(700); };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { pull(); return; }
    if (seq !== cleanSeq) { clearTimeout(timer); syncNow('leave'); }
  });
  window.addEventListener('focus', pull);
  window.addEventListener('online', () => schedule(600));
  setInterval(() => { if (!document.hidden) syncNow('poll'); }, 3 * 60 * 1000);
  schedule(1200);
}
