/* Error Book drill: spaced repeats for logged mistakes (a Leitner box per mistake).
   - "Got it" moves a mistake up a box and it comes back after 1, 3, 7, 14, then 30 days; getting it right at the
     top box marks it fixed for good. "Missed it" drops it to the first box: it comes back tomorrow.
   - A repeat never lands on or after its paper's exam day: it comes back two days before instead, so every open
     mistake gets one last look before that paper.
   - Mistakes logged before the drill existed keep the old rule until their first drill: due 3 days after the last review. */
import { addDays, diff } from './util.js';

export const GAPS = [1, 3, 7, 14, 30];
// CA Inter Jan 2027, by Error Book paper key
export const EXAM = { Accounts: '2027-01-02', Law: '2027-01-04', Tax: '2027-01-06', Costing: '2027-01-08', Audit: '2027-01-10', 'FM&SM': '2027-01-12' };

export const errDue = (e, t) => !e.fixed && (e.dueOn ? e.dueOn <= t : (!e.reviewedAt || diff(e.reviewedAt, t) >= 3));

// the fields to patch after one drill answer
export function grade(e, ok, t) {
  const box = Math.max(0, Math.min(GAPS.length - 1, +e.box || 0)), reviews = (+e.reviews || 0) + 1;
  if (!ok) return { box: 0, dueOn: cap(addDays(t, GAPS[0]), e.paper, t), reviewedAt: t, reviews, misses: (+e.misses || 0) + 1 };
  if (e.box != null && box === GAPS.length - 1) return { box, dueOn: null, reviewedAt: t, reviews, fixed: true, fixedAt: t };
  const next = e.box == null ? 1 : box + 1;
  return { box: next, dueOn: cap(addDays(t, GAPS[next]), e.paper, t), reviewedAt: t, reviews };
}
function cap(date, paper, t) {
  const ex = EXAM[paper];
  if (!ex || t >= ex) return date;
  const last = addDays(ex, -2);
  return date >= ex ? (last > t ? last : addDays(t, 1)) : date;
}
// "back tomorrow", "back in 7 days", "fixed for good"
export const nextText = (p, t) => (p.fixed ? 'fixed for good' : !p.dueOn ? '' : diff(t, p.dueOn) === 1 ? 'back tomorrow' : 'back in ' + diff(t, p.dueOn) + ' days');
