/* THE central state store. One in-memory source of truth, persisted record by record (see db.js).

   The data format is the original tracker's, field for field (reference/gods-plan/js/state/store.js), so a backup
   downloaded from the original app imports straight in:
     days / chapters / mocks / runs  overlays on top of the plan (hrs, status, pages, book, workoutDone, steps,
                                     pushups, meals, notes · status, rev1, rev2, questions · marks, time, mistakes,
                                     attempted, pres, pph, illeg, markedBy, movedTo, skipped, photos · km, min, sec,
                                     effort, notes, walked, doneOn)
     settings                        overrides on top of the plan settings (paths like phases.2.hrs)
     goals, tasks, schedule, habits, habitLogs, notes, milestones, lifeAreas, progress, sessions, resources, finance,
     arc, journal, logs, errors      collections of records with id / createdAt / updatedAt
   Every write bumps `version` and notifies subscribers; the model (model.js) is recomputed from it.
   For merging copies between devices (merge.js, sync.js): plan records stamp each written field in _f, deletions
   leave a tombstone in meta.tombs, and a replace (import, restore point, reset) sets meta.epoch. */
import * as db from './db.js';
import { clone, isObj, nv, todayStr, uid } from './util.js';
import { canon, mergeData, changes } from './merge.js';

const round2 = (x) => Math.round(x * 100) / 100;

const D = window.__FC_DATA__;
export { D };

export const LEGACY = ['days', 'chapters', 'mocks', 'runs'];
export const LISTS = ['goals', 'tasks', 'schedule', 'habits', 'habitLogs', 'notes', 'milestones', 'lifeAreas', 'progress', 'sessions', 'resources', 'finance', 'arc', 'journal', 'logs', 'errors'];
export const COLLS = LEGACY.concat(LISTS);

// the original tracker's starting log (your 25 Sep entries), used on a fresh device
const INITIAL_LOCAL = {
  days: { '2026-09-25': { steps: 11525, workoutDone: 'Yes' } },
  runs: { '2026-09-25': { km: 1.34, min: 7, sec: 16, notes: 'Two easy runs: 0.78 km in 4:11 and 0.56 km in 3:05' } }
};
const OLD_LS_KEY = 'finalComeback.v1';

// ---------- plan lookups ----------
export const DAY_IDX = {}; D.days.forEach((d, i) => { DAY_IDX[d.date] = i; });
export const CH_BY = {}; D.chapters.forEach((c) => { CH_BY[c.id] = c; });
export const MOCK_BY = {}; D.mocks.forEach((m) => { MOCK_BY[m.id] = m; });
export const RUN_BY = {}; D.runs.forEach((r) => { RUN_BY[r.date] = r; });
const DAY_ST = { '✅ Done': 'done', '🟡 Partial': 'partial', '❌ Missed': 'missed' };
const CH_ST = { '⬜ Pending': 'pending', '🔄 In Progress': 'progress', '✅ Done': 'done' };

// ---------- state ----------
export const S = { settings: {}, meta: {}, timer: null };
COLLS.forEach((c) => { S[c] = {}; });
let version = 0;
export const getVersion = () => version;

// ---------- settings ----------
const APP_DEFAULTS = {
  player: 'Piyush',
  subtitle: 'CA Inter · Jan 2027',
  examTime: '14:00',
  timer: { pomodoro: 25, deep: 50, short: 5 },
  habitsHidden: [],
  finance: { budget: null, savingsTarget: null }
};
const DEF = (() => { const s = clone(D.settings); Object.keys(APP_DEFAULTS).forEach((k) => { if (s[k] === undefined) s[k] = clone(APP_DEFAULTS[k]); }); return s; })();
function merge(a, b) {
  if (!isObj(b)) return a;
  const o = Object.assign({}, a);
  Object.keys(b).forEach((k) => {
    const bv = b[k];
    if (bv === null || bv === undefined || k === '_u') return;
    if (isObj(a[k]) && isObj(bv)) o[k] = merge(a[k], bv); else o[k] = bv;
  });
  return o;
}
let settingsCache = null, settingsVer = -1;
export function settings() {
  if (settingsCache && settingsVer === version) return settingsCache;
  const s = merge(DEF, S.settings);
  if (Array.isArray(s.phases)) s.phases = s.phases.map((p, i) => { const d = DEF.phases[i] || {}; const o = Object.assign({}, d, p); if (o.hrs == null || o.hrs === '') o.hrs = d.hrs; return o; });
  settingsCache = s; settingsVer = version;
  return s;
}
export const defaults = () => DEF;

// ---------- plan records = seed ⊕ overlay (identical semantics to the original) ----------
function pick(base, over) {
  const o = Object.assign({}, base);
  if (isObj(over)) Object.keys(base).forEach((k) => { if (k in over && over[k] !== undefined) o[k] = over[k]; });
  return o;
}
export function dayRec(date) {
  const p = D.days[DAY_IDX[date]], l = (p && p.log) || {};
  return pick({ hrs: nv(l.hrs), status: DAY_ST[l.status] || null, pages: nv(l.pages), book: l.book || '', workoutDone: l.workoutDone || null, steps: nv(l.steps), pushups: nv(l.pushups), meals: l.meals || null, notes: l.notes || '' }, S.days[date]);
}
export const chRec = (c) => pick({ status: CH_ST[c.status] || 'pending', rev1: c.rev1 === '✓', rev2: c.rev2 === '✓', questions: c.questions || null, notes: c.notes || '', movedTo: null }, S.chapters[c.id]);
// a chapter's day: the catch-up replanner's date (movedTo) when it has one, otherwise the plan's
export const plannedOf = (c) => (S.chapters[c.id] && S.chapters[c.id].movedTo) || c.planned;
export const mockRec = (m) => pick({ marks: nv(m.marks), time: nv(m.time), mistakes: m.mistakes || '', attempted: nv(m.attempted), pres: nv(m.pres), pph: nv(m.pph), illeg: nv(m.illeg), markedBy: m.markedBy || null, photos: null, movedTo: null, skipped: null }, S.mocks[m.id]);
export const runRec = (r) => pick({ km: nv(r.km), min: nv(r.min), sec: nv(r.sec), effort: nv(r.effort), notes: r.notes || '', walked: r.walked || null, doneOn: r.doneOn || null }, S.runs[r.date]);

// ---------- change events (batched) ----------
const subs = new Set();
let batchDepth = 0, batched = [];
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
function emit(info) {
  version++;
  if (batchDepth) { batched.push(info); return; }
  subs.forEach((fn) => { try { fn(info); } catch (e) { console.error(e); } });
}
export function batch(fn) {
  batchDepth++;
  try { return fn(); } finally {
    batchDepth--;
    if (!batchDepth && batched.length) { const all = batched; batched = []; const info = all.length === 1 ? all[0] : { coll: '*', id: 'batch', items: all }; subs.forEach((f) => { try { f(info); } catch (e) { console.error(e); } }); }
  }
}

// ---------- write-behind persistence (coalesced per record) ----------
const pending = new Map();
let flushTimer = 0, saveError = null, writing = 0;
function queueWrite(store, key, value) {
  pending.set(store + '\u0001' + (Array.isArray(key) ? key.join('\u0000') : key), { s: store, k: key, v: value === undefined ? undefined : clone(value) });
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 120);
}
export async function flush() {
  clearTimeout(flushTimer);
  if (!pending.size) return;
  const ops = Array.from(pending.values());
  pending.clear();
  writing++;
  try { await db.write(ops); saveError = null; }
  catch (e) {
    console.error('[store] save failed', e);
    saveError = e;
    ops.forEach((o) => { const k = o.s + '\u0001' + (Array.isArray(o.k) ? o.k.join('\u0000') : o.k); if (!pending.has(k)) pending.set(k, o); });
    flushTimer = setTimeout(flush, 4000);
  }
  writing--;
}
export const saveStatus = () => ({ pending: pending.size + writing, error: saveError, kind: db.kind() });
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
window.addEventListener('pagehide', () => { flush(); });

const touch = (coll, id, rec, quiet) => { queueWrite('records', [coll, String(id)], rec); if (!quiet) emit({ coll, id }); };

// ---------- generic collections ----------
export function put(coll, rec, opts) {
  const t = new Date().toISOString(), old = S[coll][rec.id];
  const out = Object.assign({}, rec, { createdAt: rec.createdAt || (old && old.createdAt) || t, updatedAt: t });
  // defaults seeded on a new device carry _u: 0 ("never edited"), so they never win over your edited copy in a merge
  if (opts && opts.seed) out._u = 0; else delete out._u;
  S[coll][out.id] = out;
  touch(coll, out.id, out, opts && opts.quiet);
  return out;
}
export const add = (coll, fields, prefix) => put(coll, Object.assign({ id: uid(prefix || coll.slice(0, 2)) }, fields));
export function patch(coll, id, fields) { const old = S[coll][id]; if (!old) return null; return put(coll, Object.assign({}, old, fields)); }
export function remove(coll, id) { if (!(id in S[coll])) return null; const old = S[coll][id]; delete S[coll][id]; touch(coll, id, undefined); tomb(coll + '/' + id); return old; }
// a deletion is remembered for 120 days, so a copy synced within that time doesn't bring the record back
function tomb(key) {
  const t = Date.now(), keep = t - 120 * 864e5, cur = S.meta.tombs || {}, next = {};
  Object.keys(cur).forEach((k) => { if (cur[k] > keep) next[k] = cur[k]; });
  next[key] = t;
  S.meta.tombs = next;
  saveMeta();
}
const stampFields = (f, keys, t) => { const o = Object.assign({}, f); keys.forEach((k) => { o[k] = t; }); return o; };
export const get = (coll, id) => S[coll][id];
export const list = (coll) => Object.keys(S[coll]).map((k) => S[coll][k]);

// ---------- original-format records ----------
export function setRec(sec, id, field, value) {
  let base;
  if (sec === 'days') base = dayRec(id);
  else if (sec === 'chapters') base = chRec(CH_BY[id]);
  else if (sec === 'mocks') base = mockRec(MOCK_BY[id]);
  else base = runRec(RUN_BY[id] || { date: id });       // a run logged outside the plan has no plan entry
  const prev = S[sec][id] || {};
  const extra = {}, today = todayStr();
  if (sec === 'chapters' && field === 'status') extra.doneAt = value === 'done' ? (prev.doneAt || today) : null;
  if (sec === 'chapters' && (field === 'rev1' || field === 'rev2')) extra[field + 'At'] = value ? (prev[field + 'At'] || today) : null;
  if (sec === 'mocks' && field === 'marks') { const md = prev.movedTo || MOCK_BY[id].date; extra.takenAt = value != null ? (prev.takenAt || (md <= today ? md : today)) : null; }
  if (sec === 'days' && field === 'status') extra.autoStatus = false;
  const t = Date.now(), rec = Object.assign({}, prev, base, extra, { _u: t });
  rec[field] = value;
  rec._f = stampFields(prev._f, [field].concat(Object.keys(extra)), t);
  S[sec][id] = rec;
  batch(() => {
    touch(sec, String(id), rec);
    // log once: a logged run also ticks that day's workout (and with it the Winter Arc workout habit);
    // autoTick remembers which day the run ticked, so moving the run moves the tick
    if (sec === 'runs' && (field === 'km' || field === 'min' || field === 'doneOn') && rec.km != null) {
      const day = rec.doneOn || id, was = rec.autoTick;
      if (was && was !== day && DAY_IDX[was] != null && dayRec(was).workoutDone === 'Yes') setRec('days', was, 'workoutDone', null);
      if (DAY_IDX[day] != null && dayRec(day).workoutDone !== 'Yes') setRec('days', day, 'workoutDone', 'Yes');
      if (was !== day) { rec.autoTick = day; rec._f = stampFields(rec._f, ['autoTick'], Date.now()); S.runs[id] = rec; touch(sec, String(id), rec, true); }
    }
    // finishing every chapter planned for a day marks that day Done (it feeds the streak, like the original rule)
    if (sec === 'chapters' && field === 'status' && CH_BY[id]) syncDayStatus(plannedOf(CH_BY[id]));
  });
  return rec;
}
export function setRecFields(sec, id, fields) { let r = null; batch(() => { Object.keys(fields).forEach((f) => { r = setRec(sec, id, f, fields[f]); }); }); return r; }

// the plan's study items for a day: its chapters, or the main / side quest when no chapter is planned
export function planItemsDone(date) {
  const p = D.days[DAY_IDX[date]];
  if (!p) return null;
  const chs = D.chapters.filter((c) => plannedOf(c) === date);
  if (chs.length) return chs.map((c) => chRec(c).status === 'done');
  const boss = !!(p.mock && p.mock !== '—');
  if (boss) return null;
  return ['main', 'side'].filter((k) => p[k]).map((k) => { const t = S.tasks['plan-' + k + '-' + date]; return !!(t && t.done); });
}
export function syncDayStatus(date) {
  const items = planItemsDone(date);
  if (!items || !items.length) return;
  const all = items.every(Boolean), r = dayRec(date), ov = S.days[date] || {};
  if (all && !r.status) { setRec('days', date, 'status', 'done'); S.days[date].autoStatus = true; queueWrite('records', ['days', date], S.days[date]); }
  else if (!all && r.status === 'done' && ov.autoStatus) setRec('days', date, 'status', null);
}
export function togglePlanTask(id, date, title, kind) {
  batch(() => {
    const cur = get('tasks', id);
    if (cur) patch('tasks', id, { done: !cur.done, doneAt: !cur.done ? todayStr() : null });
    else put('tasks', { id, plan: kind, date, title, done: true, doneAt: todayStr() });
    syncDayStatus(date);
  });
}
// focus-timer minutes go into the same field the 10 PM log uses
export function addStudyMinutes(date, minutes) {
  const cur = +dayRec(date).hrs || 0;
  setRec('days', date, 'hrs', round2(cur + minutes / 60));
}

export function setSetting(path, value) {
  const s = clone(S.settings || {}), cur = settings(), parts = path.split('.');
  let o = s, c = cur;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (o[k] === undefined || o[k] === null) o[k] = Array.isArray(c && c[k]) ? clone(c[k]) : {};
    o = o[k]; c = c ? c[k] : undefined;
  }
  o[parts[parts.length - 1]] = value;
  S.settings = s;
  S.settings._u = Date.now();
  queueWrite('meta', 'settings', S.settings);
  emit({ coll: 'settings', id: path });
}
export function saveMeta() { queueWrite('meta', 'meta', S.meta); }
export function setMeta(key, value, quiet) { S.meta[key] = value; saveMeta(); if (!quiet) emit({ coll: 'meta', id: key }); }
export function setTimerState(value) { S.timer = value; queueWrite('meta', 'timer', value); emit({ coll: 'timer', id: 'timer' }); }

// ---------- defaults created once (editable, never re-created) ----------
export function defaultAreas() {
  const st = settings();
  return [
    { id: 'la_study', name: 'Study', slot: 1, source: 'auto:syllabus', startDate: st.comebackStart || st.planStart, deadline: st.syllabusDeadline, startValue: 0, target: 100 },
    { id: 'la_health', name: 'Health', slot: 2, source: 'auto:health', startDate: st.comebackStart || st.planStart, deadline: st.yearEnd, startValue: 0, target: 100 },
    { id: 'la_comm', name: 'Communication', slot: 3, source: 'manual', startDate: null, deadline: st.yearEnd, startValue: null, target: 100, hidden: true },
    { id: 'la_running', name: 'Running', slot: 4, source: 'auto:run5k', startDate: '2026-10-24', deadline: '2026-11-30', startValue: 40, target: 100 },
    { id: 'la_finance', name: 'Finance', slot: 5, source: 'manual', startDate: null, deadline: st.yearEnd, startValue: null, target: 100, hidden: true },
    { id: 'la_career', name: 'Career', slot: 6, source: 'manual', startDate: null, deadline: st.yearEnd, startValue: null, target: 100, hidden: true },
    { id: 'la_content', name: 'Content', slot: 7, source: 'manual', startDate: null, deadline: st.yearEnd, startValue: null, target: 100, hidden: true }
  ];
}
export function defaultGoals() {
  const st = settings();
  const mm = Math.floor(st.runGoal), ss = Math.round((st.runGoal - mm) * 60);
  return [
    { id: 'g_cainter', title: 'Clear CA Inter — Jan 2027 attempt', category: 'Academic', source: 'readiness', startDate: st.planStart, deadline: st.examDate, status: 'active', order: 1, notes: 'Progress is the average of syllabus, revision, mock and study-hour progress.' },
    { id: 'g_syllabus', title: 'R1 of all 105 chapters (Group II gaps first)', category: 'Academic', source: 'syllabus', startDate: '2026-10-23', deadline: st.syllabusDeadline, status: 'active', order: 2 },
    { id: 'g_hours', title: 'Log the planned study hours', category: 'Academic', source: 'hours', startDate: st.planStart, deadline: st.yearEnd, status: 'active', order: 3 },
    { id: 'g_revision', title: 'Revise every chapter twice more (R2 + R3)', category: 'Academic', source: 'revision', startDate: st.revisionStart || '2026-11-01', deadline: st.revisionEnd || st.yearEnd, status: 'active', order: 4 },
    { id: 'g_mocks', title: 'Write all ' + D.mocks.length + ' full papers by hand', category: 'Academic', source: 'mocks', startDate: D.mocks[0].date, deadline: D.mocks[D.mocks.length - 1].date, status: 'active', order: 5 },
    { id: 'g_run2k', title: 'Run 2 km in ' + mm + ':' + String(ss).padStart(2, '0'), category: 'Health', source: 'run', startDate: st.runStart, deadline: st.runGoalDate, status: 'active', order: 6 },
    { id: 'g_run5k', title: 'Run 5 km in 30:00 before 1 Dec', category: 'Health', source: 'run5k', startDate: '2026-10-24', deadline: '2026-11-30', status: 'active', order: 7 }
  ];
}
function ensureDefaults() {
  S.meta.seeded = S.meta.seeded || {};
  const seeded = S.meta.seeded, q = { quiet: true, seed: true };
  let changed = false;
  if (!seeded.lifeAreas) { defaultAreas().forEach((a) => put('lifeAreas', a, q)); seeded.lifeAreas = true; changed = true; }
  if (!seeded.goals) { defaultGoals().forEach((g) => put('goals', g, q)); seeded.goals = true; changed = true; }
  if (!seeded.resources) {
    put('resources', { id: 'rs_icai', title: 'ICAI — official site (exam dates & notices)', url: 'https://www.icai.org', type: 'Link', subject: '', notes: 'Your plan says: check icai.org for any change to the CA Inter Jan 2027 dates.', pinned: true }, q);
    seeded.resources = true; changed = true;
  }
  if (changed) saveMeta();
}

// ---------- first run ----------
function loadOldLocal() {
  try { const raw = localStorage.getItem(OLD_LS_KEY); if (!raw) return null; const o = JSON.parse(raw); return isObj(o) && isObj(o.data) ? o.data : null; } catch (e) { return null; }
}
async function firstRun() {
  const old = loadOldLocal(), data = old || INITIAL_LOCAL, ops = [];
  LEGACY.forEach((sec) => { const src = isObj(data[sec]) ? data[sec] : {}; Object.keys(src).forEach((k) => { if (src[k] != null) ops.push({ s: 'records', k: [sec, String(k)], v: src[k] }); }); });
  ops.push({ s: 'meta', k: 'settings', v: isObj(data.settings) ? data.settings : {} });
  const meta = { initializedAt: new Date().toISOString(), schema: 3, migratedFrom: old ? 'Saved progress from the original tracker in this browser' : 'Built-in starting log from the original tracker (25 Sep)' };
  ops.push({ s: 'meta', k: 'meta', v: meta });
  await db.write(ops);
}

// ---------- backup / restore ----------
function snapshotData() {
  const data = { settings: clone(S.settings) };
  COLLS.forEach((c) => { data[c] = clone(S[c]); });
  data.meta = { seeded: clone(S.meta.seeded || {}), tombs: clone(S.meta.tombs || {}), epoch: S.meta.epoch || 0 };
  return data;
}
// version 2 = the original app's full backup format (kept, so either app can read the other's file)
// app: 'final-comeback' is the shared backup format id (the original GOD'S PLAN app reads and writes it), so it stays
export const exportObject = () => ({ app: 'final-comeback', version: 2, exportedAt: new Date().toISOString(), source: 'Vayu', data: snapshotData() });
export async function saveSnapshot(key, reason) {
  await flush();
  await db.write([{ s: 'snapshots', k: key, v: { key, createdAt: new Date().toISOString(), reason, data: snapshotData() } }]);
  const all = await db.getAll('snapshots');
  const auto = all.filter((e) => /^auto-/.test(e[0])).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const other = all.filter((e) => !/^auto-/.test(e[0])).sort((a, b) => ((a[1] && a[1].createdAt) < (b[1] && b[1].createdAt) ? 1 : -1));
  const drop = auto.slice(7).concat(other.slice(8)).map((e) => ({ s: 'snapshots', k: e[0], v: undefined }));
  if (drop.length) await db.write(drop);
}
async function autoSnapshot() {
  const key = 'auto-' + todayStr();
  if (S.meta.lastSnapshot === key) return;
  try { await saveSnapshot(key, 'Daily automatic restore point'); S.meta.lastSnapshot = key; saveMeta(); } catch (e) { console.warn('[store] snapshot failed', e); }
}
export async function listSnapshots() {
  const all = await db.getAll('snapshots');
  return all.map((e) => e[1]).filter(Boolean).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
export function validateBackup(o) {
  if (!isObj(o) || o.app !== 'final-comeback' || !isObj(o.data)) return 'That file isn’t a Vayu or GOD’S PLAN backup.';
  return null;
}
// version 1 (original tracker) replaces only plan progress + settings; version 2 replaces everything
export async function importBackup(o, label) {
  const err = validateBackup(o);
  if (err) throw new Error(err);
  await flush();
  await saveSnapshot('pre-import-' + Date.now(), 'Before importing ' + (label || 'a backup'));
  const full = (o.version || 1) >= 2, data = o.data, sections = full ? COLLS : LEGACY, counts = {};
  const ops = [];
  sections.forEach((c) => {
    Object.keys(S[c]).forEach((id) => ops.push({ s: 'records', k: [c, String(id)], v: undefined }));
    S[c] = {};
    const src = isObj(data[c]) ? data[c] : {};
    counts[c] = 0;
    Object.keys(src).forEach((k) => { if (src[k] == null) return; S[c][k] = src[k]; ops.push({ s: 'records', k: [c, String(k)], v: src[k] }); counts[c]++; });
  });
  S.settings = isObj(data.settings) ? data.settings : {};
  if (full && data.meta && isObj(data.meta.seeded)) S.meta.seeded = Object.assign({}, S.meta.seeded, data.meta.seeded);
  if (full) S.meta.tombs = data.meta && isObj(data.meta.tombs) ? clone(data.meta.tombs) : {};
  S.meta.epoch = Date.now();   // with sync on, the replace reaches your other devices too
  ops.push({ s: 'meta', k: 'settings', v: S.settings }, { s: 'meta', k: 'meta', v: S.meta });
  // deletes first, then puts (same key may appear in both)
  await db.write(ops.filter((x) => x.v === undefined));
  await db.write(ops.filter((x) => x.v !== undefined));
  ensureDefaults();
  emit({ coll: '*', id: 'import' });
  return { full, counts };
}
export async function restoreSnapshot(key) {
  const snap = await db.get('snapshots', key);
  if (!snap) throw new Error('Restore point not found');
  return importBackup({ app: 'final-comeback', version: 2, data: snap.data }, 'restore point');
}

// ---------- merging another copy in (sync, "Merge it in") ----------
const KINDS = { legacy: LEGACY, lists: LISTS };
export const snapshot = () => snapshotData();
export const mergeWith = (mine, theirs, cutA, cutB) => mergeData(mine, theirs, Object.assign({ cutA, cutB }, KINDS));
export const countChanges = (x, y) => changes(x, y, KINDS);
// writes merged data into this device, changing only what differs; returns how many entries changed.
// Synchronous up to the write-behind queue, so take the snapshot, merge and apply with no await in between.
export function applyData(data, epoch, id) {
  let n = 0;
  COLLS.forEach((c) => {
    const src = isObj(data[c]) ? data[c] : {};
    Object.keys(S[c]).forEach((k) => { if (src[k] == null) { delete S[c][k]; queueWrite('records', [c, k], undefined); n++; } });
    Object.keys(src).forEach((k) => { if (src[k] != null && canon(S[c][k]) !== canon(src[k])) { S[c][k] = clone(src[k]); queueWrite('records', [c, k], src[k]); n++; } });
  });
  if (canon(S.settings || {}) !== canon(data.settings || {})) { S.settings = clone(data.settings || {}); queueWrite('meta', 'settings', S.settings); n++; }
  const m = isObj(data.meta) ? data.meta : {};
  S.meta.seeded = Object.assign({}, S.meta.seeded, m.seeded);
  S.meta.tombs = clone(m.tombs || {});
  if (epoch != null) S.meta.epoch = epoch;
  saveMeta();
  if (n) emit({ coll: '*', id: id || 'sync' });
  return n;
}
// "Merge it in": a backup file joins what's here instead of replacing it (newest edit wins, as in sync)
export async function mergeBackup(o, label) {
  const err = validateBackup(o);
  if (err) throw new Error(err);
  await saveSnapshot('pre-merge-' + Date.now(), 'Before merging ' + (label || 'a backup'));
  const merged = mergeWith(snapshotData(), o.data, 0, 0);
  return applyData(merged, null, 'merge');
}
export async function resetAll() {
  await flush();
  await saveSnapshot('pre-reset-' + Date.now(), 'Before “Reset all data”');
  await db.clear('records');
  COLLS.forEach((c) => { S[c] = {}; });
  S.settings = {};
  S.meta.seeded = {};
  S.meta.tombs = {};
  S.meta.epoch = Date.now();
  S.meta.welcomeDismissed = false;
  await db.write([{ s: 'meta', k: 'settings', v: S.settings }, { s: 'meta', k: 'meta', v: S.meta }]);
  ensureDefaults();
  emit({ coll: '*', id: 'reset' });
}

// ---------- init ----------
async function readMeta() { const m = {}; (await db.getAll('meta')).forEach((e) => { m[e[0]] = e[1]; }); return m; }
export async function init() {
  const kind = await db.open();
  let meta = await readMeta();
  if (!isObj(meta.meta) || !meta.meta.initializedAt) { await firstRun(); meta = await readMeta(); }
  S.meta = isObj(meta.meta) ? meta.meta : {};
  S.settings = isObj(meta.settings) ? meta.settings : {};
  S.timer = meta.timer || null;
  (await db.getAll('records')).forEach((e) => { const k = e[0], c = k[0], id = k[1]; if (S[c] && e[1] != null) S[c][id] = e[1]; });
  ensureDefaults();
  version++;
  autoSnapshot();
  return kind;
}

// audio / photo blobs (kept on this device)
export const putBlob = (id, blob) => db.write([{ s: 'audio', k: id, v: blob }]);
export const getBlob = (id) => db.get('audio', id);
export const dropBlob = (id) => db.write([{ s: 'audio', k: id, v: undefined }]);
