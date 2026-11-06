/* Catch-up replanner: gives every unfinished chapter a day again, so missed days stop piling up as "overdue".
   It only proposes dates; applying them writes chapters[id].movedTo (the original plan stays, see store.js).
   - Capacity is measured in the plan's own chapter-hours (each chapter's estimate). At plan pace a study day can take
     what the plan already put on it, or the plan's average chapter day if that's more; a buffer day takes the average.
     A slower pace scales that down. Mock, revision and exam days take no chapters before the R1 deadline.
     Today counts in full before noon, half until 6 PM, then not at all.
   - Fold first (plan pace only): overdue chapters go, in the plan's order, into the room left on lighter days and the
     buffer day, and nothing else moves.
   - Otherwise reflow: every unfinished chapter is laid out again in the plan's order (subject runs stay together).
     When they can't all fit by the deadline, the lowest priority ones slip past it first (LOW, then MEDIUM; the
     latest-planned first) into the revision days after it, at half capacity. A day is filled until its capacity is
     used; one chapter may run it over by up to a quarter.
   applyReplan / resetReplan write the dates (or put the original ones back). They're global actions, so Study Plan's
   Catch up card and the Dashboard's overdue rescue both use them. */
import { now, sortBy, sum, plural, fmtDS } from './util.js';
import { pref } from './prefs.js';
import { model } from './model.js';
import * as store from './store.js';
import { toast, confirm } from './components.js';

const PRIO = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const prio = (c) => (PRIO[c.priority] != null ? PRIO[c.priority] : 1);
export const PACES = [[1, 'Plan pace'], [0.85, '85%'], [0.7, '70%'], [0.55, '55%']];
// the pace you picked in Catch up (saved on this device)
export const paceNow = () => { const p = +pref('replanPace', 1); return PACES.some((x) => x[0] === p) ? p : 1; };

export async function applyReplan() {
  const R = replan(model(), paceNow());
  if (!R.moves.length) { toast('Nothing to move'); return; }
  const prev = {};
  R.moves.forEach((m) => { const ov = store.S.chapters[m.id]; prev[m.id] = (ov && ov.movedTo) || null; });
  await store.saveSnapshot('pre-replan-' + Date.now(), 'Before the catch-up replan');
  store.batch(() => R.moves.forEach((m) => store.setRec('chapters', m.id, 'movedTo', m.to === m.plan ? null : m.to)));
  toast(plural(R.moves.length, 'chapter') + ' moved · R1 finishes ' + fmtDS(R.finish), { icon: 'calcheck', ms: 7000, action: { label: 'Undo', fn: () => store.batch(() => Object.keys(prev).forEach((id) => store.setRec('chapters', id, 'movedTo', prev[id]))) } });
}
export async function resetReplan() {
  const ids = Object.keys(store.S.chapters).filter((id) => store.S.chapters[id] && store.S.chapters[id].movedTo);
  if (!ids.length) return;
  if (!(await confirm({ title: 'Back to the original plan?', body: plural(ids.length, 'chapter') + ' go back to the dates in your plan. Anything planned before today will show as overdue again.', ok: 'Use the original dates' }))) return;
  store.batch(() => ids.forEach((id) => store.setRec('chapters', id, 'movedTo', null)));
  toast('Back to the original plan');
}

export function replan(M, pace) {
  const t = M.t, deadline = M.st.syllabusDeadline;
  const planLoad = {};
  M.chapters.forEach((c) => { planLoad[c.planDate] = (planLoad[c.planDate] || 0) + (+c.hrs || 0); });
  const loads = Object.keys(planLoad).filter((d) => d <= deadline).map((d) => planLoad[d]);
  const base = loads.length ? sum(loads) / loads.length : 8;
  const h = now().getHours(), todayShare = h < 12 ? 1 : h < 18 ? 0.5 : 0;
  const doneToday = sum(M.chapters.filter((c) => c.status === 'done' && c.doneAt === t), (c) => +c.hrs || 0);
  const mkDays = () => M.days.filter((d) => d.date >= t && d.date < M.st.examDate).map((d) => {
    const type = d.type || '';
    let cap = 0;
    if (d.date <= deadline) cap = /Study/i.test(type) ? Math.max(base, planLoad[d.date] || 0) * pace : /Buffer/i.test(type) ? base * pace : 0;
    else cap = /Revision|Buffer|Study/i.test(type) ? base * pace * 0.5 : 0;
    if (d.date === t) cap = Math.max(0, cap * todayShare - doneToday);
    return { date: d.date, cap, used: 0, ids: [], late: d.date > deadline };
  });
  const open = sortBy(M.chapters.filter((c) => c.status !== 'done'), (c) => c.planDate + '|' + String(c.id).padStart(4, '0'));
  const overdue = open.filter((c) => c.planned < t);
  const result = (mode, placed, nowhere, days) => {
    const moves = placed.filter((c) => c._to !== c.planned).map((c) => ({ id: c.id, from: c.planned, to: c._to, plan: c.planDate }));
    const all = open.map((c) => { const p = placed.find((x) => x.id === c.id); return p ? p._to : c.planned; });
    const finish = all.length ? all.slice().sort().pop() : null;
    const past = placed.filter((c) => c._to > deadline);
    return { mode, pace, base, deadline, finish, moves, nowhere, overdue: overdue.length, pastDeadline: past.length, pastPrio: past.map((c) => c.priority), days: days.filter((d) => d.ids.length), fits: !past.length && !nowhere.length && finish <= deadline };
  };

  // ---- fold: overdue chapters into spare room, nothing else moves ----
  if (pace === 1 && overdue.length) {
    const days = mkDays(), byDate = {};
    days.forEach((d) => { byDate[d.date] = d; });
    open.filter((c) => c.planned >= t).forEach((c) => { const d = byDate[c.planned]; if (d) { d.used += +c.hrs || 0; d.ids.push(c.id); } });
    // in the plan's order, never earlier than the one before, so a chapter never lands ahead of the one it builds on
    const placed = [];
    let ok = true, from = 0;
    overdue.forEach((c) => {
      const hrs = +c.hrs || 0, k = days.findIndex((x, i) => i >= from && !x.late && x.cap > 0 && x.used + hrs <= x.cap * 1.1);
      if (k < 0) { ok = false; return; }
      const d = days[k];
      from = k; d.used += hrs; d.ids.push(c.id); placed.push(Object.assign({}, c, { _to: d.date }));
    });
    if (ok) return result('fold', placed, [], days.filter((d) => placed.some((c) => c._to === d.date)));
  }

  // ---- reflow: lay every unfinished chapter out again ----
  const days = mkDays();
  const need = sum(open, (c) => +c.hrs || 0), capBefore = sum(days.filter((d) => !d.late), (d) => d.cap);
  const spill = new Set();
  if (need > capBefore) {
    let over = need - capBefore;
    for (const c of sortBy(open, (x) => prio(x) * 1e4 - Number(x.planDate.replace(/-/g, '')) / 1e4)) {
      if (over <= 0) break;
      if (c.priority === 'HIGH') continue;
      spill.add(c.id); over -= +c.hrs || 0;
    }
  }
  const place = (list, pool) => {
    let k = 0;
    const out = [];
    list.forEach((c) => {
      const hrs = +c.hrs || 0;
      while (k < pool.length && (pool[k].cap <= 0 || (pool[k].used > 0 && pool[k].used + hrs > pool[k].cap * 1.25))) k++;
      if (k >= pool.length) { out.push(c); return; }
      pool[k].used += hrs; pool[k].ids.push(c.id); c._to = pool[k].date;
    });
    return out;
  };
  const kept = open.filter((c) => !spill.has(c.id)).map((c) => Object.assign({}, c));
  const late = open.filter((c) => spill.has(c.id)).map((c) => Object.assign({}, c));
  const rest = place(kept, days.filter((d) => !d.late)).concat(late);
  const nowhere = place(rest, days.filter((d) => d.late));
  return result('reflow', kept.concat(late).filter((c) => c._to), nowhere, days);
}
