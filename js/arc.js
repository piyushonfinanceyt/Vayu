/* Winter Arc: the 92-day habit challenge (port of reference/gods-plan/js/analytics/arc.js, same rules).
   Stored in the 'arc' collection:
     'config'      {start, days, threshold, habits:[{id, name, kind:'check'|'count', target, step, unit, link}], goals:[{id, text, p}]}
     'YYYY-MM-DD'  {h: {habitId: value}, note}
   A habit is done when ticked (check) or at its target (count). Clean day = threshold % of habits done.
   XP = 10 per habit done + 25 for a perfect day. Ranks Flurry → Permafrost.
   A linked habit reads the 10 PM log (hours, pages, steps, push-ups, workout) and writes back to it, so you log once. */
import * as store from './store.js';
import { addDays, diff, clamp, isObj } from './util.js';

export const RANKS = [{ n: 'Flurry', xp: 0 }, { n: 'Frost', xp: 400 }, { n: 'Rime', xp: 1200 }, { n: 'Drift', xp: 2800 }, { n: 'Glacier', xp: 5000 }, { n: 'Permafrost', xp: 7500 }];
export const LINKS = {
  hrs: { label: 'Study hours', field: 'hrs', unit: 'h' },
  pages: { label: 'Pages read', field: 'pages', unit: 'pages' },
  steps: { label: 'Steps', field: 'steps', unit: 'steps' },
  pushups: { label: 'Push-ups', field: 'pushups', unit: '' },
  workout: { label: 'Workout done', field: 'workoutDone', check: true }
};
export const DEFAULTS = {
  start: '2026-10-01', days: 92, threshold: 80,
  habits: [
    { id: 'wake', name: 'Wake before 6:30', kind: 'check', target: 1, step: 1, unit: '' },
    { id: 'move', name: 'Workout, 45 min or more', kind: 'check', target: 1, step: 1, unit: '', link: 'workout' },
    { id: 'focus', name: 'Deep work', kind: 'count', target: 3, step: 0.5, unit: 'h', link: 'hrs' },
    { id: 'water', name: 'Water', kind: 'count', target: 3, step: 0.5, unit: 'L' },
    { id: 'read', name: 'Read', kind: 'count', target: 20, step: 5, unit: 'pages', link: 'pages' },
    { id: 'food', name: 'Home food, no junk', kind: 'check', target: 1, step: 1, unit: '' },
    { id: 'sleep', name: 'Lights out by 11', kind: 'check', target: 1, step: 1, unit: '' }
  ],
  goals: [
    { id: 'g1', text: 'Run 5 km without stopping', p: 0 },
    { id: 'g2', text: 'Finish the project I keep postponing', p: 0 },
    { id: 'g3', text: 'Read 4 books', p: 0 }
  ]
};
export const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
export const r2 = (n) => Math.round(n * 100) / 100;

export function normalize(src) {
  const s = isObj(src) ? src : {};
  const out = {
    start: /^\d{4}-\d{2}-\d{2}$/.test(s.start || '') ? s.start : DEFAULTS.start,
    days: clamp(Math.round(num(s.days, DEFAULTS.days)), 14, 366),
    threshold: clamp(Math.round(num(s.threshold, DEFAULTS.threshold)), 50, 100)
  };
  out.habits = (Array.isArray(s.habits) ? s.habits : DEFAULTS.habits).filter((h) => h && typeof h.id === 'string' && typeof h.name === 'string').slice(0, 12).map((h) => {
    const c = h.kind === 'count', L = LINKS[h.link];
    const link = L && (!!L.check === !c) ? h.link : '';
    return { id: h.id, name: h.name.slice(0, 60), kind: c ? 'count' : 'check', target: c ? Math.max(0.5, num(h.target, 1)) : 1, step: Math.max(0.1, num(h.step, 1)), unit: String(h.unit || '').slice(0, 12), link };
  });
  out.goals = (Array.isArray(s.goals) ? s.goals : DEFAULTS.goals).filter((g) => g && typeof g.id === 'string').slice(0, 8).map((g) => ({ id: g.id, text: String(g.text || '').slice(0, 80), p: clamp(Math.round(num(g.p, 0)), 0, 100) }));
  return out;
}
export const config = () => normalize(store.get('arc', 'config'));
const endOf = (c) => addDays(c.start, c.days - 1);
const dayLog = (k) => { const e = store.get('arc', k); return e && isObj(e.h) ? e : null; };

export function linkedVal(k, h) {
  const L = h.link && LINKS[h.link];
  if (!L) return null;
  const v = store.dayRec(k)[L.field];
  if (L.check) return v === 'Yes' ? 1 : v === 'No' ? 0 : null;
  return v == null || v === '' || !isFinite(+v) ? null : +v;
}
export function val(k, h) {
  const lv = linkedVal(k, h);
  if (lv != null) return lv;
  const e = dayLog(k);
  return e && typeof e.h[h.id] === 'number' ? e.h[h.id] : 0;
}
export const isDone = (h, v) => (h.kind === 'count' ? v >= h.target - 1e-9 : v >= 1);

// writes: a linked habit also writes the 10 PM log field
export function setVal(k, h, v) {
  store.batch(() => {
    const e = store.get('arc', k);
    store.put('arc', { id: k, h: Object.assign({}, e && isObj(e.h) ? e.h : {}, { [h.id]: v }), note: e && typeof e.note === 'string' ? e.note : '' });
    const L = h.link && LINKS[h.link];
    if (L && store.DAY_IDX[k] != null) store.setRec('days', k, L.field, L.check ? (v >= 1 ? 'Yes' : null) : (v > 0 ? v : null));
  });
}
export function setNote(k, text) {
  const e = store.get('arc', k);
  store.put('arc', { id: k, h: Object.assign({}, e && isObj(e.h) ? e.h : {}), note: text });
}
export const saveConfig = (c) => store.put('arc', Object.assign({ id: 'config' }, normalize(c)));

export function compute(t) {
  const c = config(), n = c.habits.length, days = c.days;
  const cache = {};
  const doneCount = (k) => { if (cache[k] == null) { let x = 0; c.habits.forEach((h) => { if (isDone(h, val(k, h))) x++; }); cache[k] = x; } return cache[k]; };
  const pctOf = (k) => (n ? Math.round(doneCount(k) / n * 100) : 0);
  const isClean = (k) => n > 0 && doneCount(k) / n * 100 >= c.threshold - 1e-9;
  const xpOf = (k) => { const d = doneCount(k); return d * 10 + (n > 0 && d === n ? 25 : 0); };
  const todayIdx = diff(c.start, t);
  const lastIdx = clamp(todayIdx, -1, days - 1);
  const pastEnd = todayIdx < days ? todayIdx - 1 : days - 1;
  let streak = 0, best = 0, run = 0, clean = 0, xp = 0, total = 0, pastN = 0, i;
  for (i = 0; i <= lastIdx; i++) {
    const k = addDays(c.start, i);
    if (isClean(k)) { clean++; run++; if (run > best) best = run; } else run = 0;
    xp += xpOf(k);
    if (i <= pastEnd) { total += pctOf(k); pastN++; }
  }
  i = lastIdx;
  if (i >= 0 && i === todayIdx && !isClean(addDays(c.start, i))) i--;
  while (i >= 0 && isClean(addDays(c.start, i))) { streak++; i--; }
  let ri = 0; RANKS.forEach((r, j) => { if (xp >= r.xp) ri = j; });
  const hs = c.habits.map((h) => {
    let done = 0;
    for (let x = 0; x <= pastEnd; x++) if (isDone(h, val(addDays(c.start, x), h))) done++;
    const strip = [];
    for (let q = 13; q >= 0; q--) {
      const idx = lastIdx - q;
      if (idx < 0) { strip.push('n'); continue; }
      strip.push(isDone(h, val(addDays(c.start, idx), h)) ? '1' : idx === todayIdx ? 't' : '0');
    }
    return { h, rate: pastN ? Math.round(done / pastN * 100) : null, strip };
  });
  let sol = null;
  for (let y = +c.start.slice(0, 4); y <= +endOf(c).slice(0, 4); y++) { const sk = y + '-12-21', si = diff(c.start, sk); if (si >= 0 && si < days) { sol = { i: si, k: sk }; break; } }
  const active = todayIdx >= 0 && todayIdx < days;
  const tk = active ? t : null;
  const today = tk ? { k: tk, done: doneCount(tk), pct: pctOf(tk), clean: isClean(tk), perfect: n > 0 && doneCount(tk) === n, xp: xpOf(tk), need: Math.max(0, Math.ceil(c.threshold / 100 * n - 1e-9) - doneCount(tk)) } : null;
  const rated = hs.filter((x) => x.rate !== null);
  const weakest = pastN >= 3 && rated.length > 1 ? rated.reduce((a, b) => (b.rate < a.rate ? b : a)) : null;
  return {
    c, n, days, start: c.start, end: endOf(c), t, todayIdx, lastIdx, pastN, active,
    dayNum: todayIdx < 0 ? 0 : Math.min(todayIdx + 1, days), elapsed: lastIdx + 1, left: active ? days - todayIdx - 1 : todayIdx < 0 ? days : 0,
    streak, best, clean, avg: pastN ? Math.round(total / pastN) : null, xp, ri, rank: RANKS[ri], next: RANKS[ri + 1] || null,
    hs, weakest, sol, today,
    val, linkedVal, isDone, doneCount, pctOf, isClean, xpOf, note: (k) => { const e = dayLog(k); return e && typeof e.note === 'string' ? e.note : ''; }
  };
}
