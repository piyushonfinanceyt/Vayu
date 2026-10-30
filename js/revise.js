/* Revision schedule: when each finished chapter is due for its next pass (the plan's R2, then R3).
   - R2 falls due a set gap after R1, R3 a set gap after R2: shorter for HIGH priority, longer for LOW, and a third
     shorter for a chapter with open marks in the Error Book. Nothing falls due later than three days before that
     paper's exam.
   - Today's dose: the most urgent chapters first (days late, priority, leaks), 3 a day during R1 so revision doesn't
     crowd out new chapters, 8 a day from the start of the plan's revision phase. The rest wait their turn. */
import { addDays, diff, sortBy } from './util.js';
import { EXAM } from './drill.js';

export const REV_GAPS = { R2: { HIGH: 5, MEDIUM: 7, LOW: 10 }, R3: { HIGH: 10, MEDIUM: 14, LOW: 18 } };
export const DOSE = { r1: 3, revision: 8 };

export function nextRevision(c, leaky) {
  if (c.status !== 'done' || c.rev2) return null;
  const round = c.rev1 ? 'R3' : 'R2', from = c.rev1 ? c.rev1At : c.doneAt;
  if (!from) return null;
  let gap = REV_GAPS[round][c.priority] || REV_GAPS[round].MEDIUM;
  if (leaky) gap = Math.max(2, Math.round(gap * 0.7));
  let due = addDays(from, gap);
  const last = EXAM[c.subject] ? addDays(EXAM[c.subject], -3) : null;
  if (last && due > last) due = last;
  return { round, field: c.rev1 ? 'rev2' : 'rev1', from, due };
}

export function revisionQueue(chapters, t, revisionStart, leaky) {
  const items = [];
  chapters.forEach((c) => {
    const isLeak = leaky.has(String(c.id)), n = nextRevision(c, isLeak);
    if (n) items.push(Object.assign(n, { c, leaky: isLeak, late: diff(n.due, t) }));
  });
  const rank = (x) => x.late + (x.c.priority === 'HIGH' ? 3 : x.c.priority === 'LOW' ? -2 : 0) + (x.leaky ? 4 : 0);
  const due = sortBy(items.filter((x) => x.due <= t), (x) => -rank(x));
  const dose = t < revisionStart ? DOSE.r1 : DOSE.revision;
  const byId = {};
  items.forEach((x) => { byId[x.c.id] = x; });
  return { items, byId, due, dose, today: due.slice(0, dose), waiting: Math.max(0, due.length - dose), upcoming: sortBy(items.filter((x) => x.due > t), (x) => x.due).slice(0, 7) };
}
