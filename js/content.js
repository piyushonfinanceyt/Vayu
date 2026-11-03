/* Piyush on Finance: the YouTube channel and Instagram page you start after the exam. Nothing about it shows (no goal,
   no panel, no notification) until the day after the last paper, 13 Jan 2027; store.releaseCheck() then creates the goal.
   Pure helpers only (the forms are in contentui.js):
   - A record in 'content' is one video or post: { platform: 'youtube' | 'instagram', title, plannedFor, uploadedOn, link }.
     uploadedOn set = uploaded; else planned for a date (Missed once that date has passed).
   - Weekly targets (settings content.yt / content.ig, default 1 video and 3 posts) count Monday to Sunday.
   - Goal progress = uploads against the targets over 12 weeks, with each week capped at its target so a busy week
     can't cover a missed one. */
import { addDays, diff, mondayOf, sortBy } from './util.js';

export const CONTENT_RELEASE = '2027-01-13';
export const PLATFORMS = { youtube: { name: 'YouTube', noun: 'video', icon: 'video', c: 'var(--bad-mark)' }, instagram: { name: 'Instagram', noun: 'post', icon: 'camera', c: 'var(--p5)' } };
export const contentOn = (t) => t >= CONTENT_RELEASE;

const targetsOf = (st) => { const c = (st && st.content) || {}; return { youtube: Math.max(0, Math.round(+c.yt >= 0 ? +c.yt : 1)), instagram: Math.max(0, Math.round(+c.ig >= 0 ? +c.ig : 3)) }; };
const inWeek = (d, wk) => !!d && d >= wk && d <= addDays(wk, 6);

// per platform: uploads this week against the target, the last upload, and what to do about it
export function contentStats(list, st, t, goal) {
  const T = targetsOf(st), wk = mondayOf(t), dow = (new Date(t + 'T12:00:00').getDay() + 6) % 7;   // 0 = Monday
  const up = list.filter((x) => x.uploadedOn);
  const platforms = {};
  Object.keys(PLATFORMS).forEach((p) => {
    const mine = up.filter((x) => x.platform === p), last = sortBy(mine, (x) => x.uploadedOn).pop();
    const count = mine.filter((x) => inWeek(x.uploadedOn, wk)).length, target = T[p];
    platforms[p] = { count, target, done: count >= target, last: last ? last.uploadedOn : null, since: last ? diff(last.uploadedOn, t) : null, late: count < target && dow >= 4 };
  });
  // weeks in a row, back from this one (if it's already met) or the last one, with every target met
  const first = mondayOf(CONTENT_RELEASE), weekOk = (w) => Object.keys(PLATFORMS).every((p) => !T[p] || up.filter((x) => x.platform === p && inWeek(x.uploadedOn, w)).length >= T[p]);
  let streak = 0, w = weekOk(wk) ? wk : addDays(wk, -7);
  while (w >= first && weekOk(w)) { streak++; w = addDays(w, -7); }
  const planned = sortBy(list.filter((x) => !x.uploadedOn), (x) => x.plannedFor || '9999').map((x) => Object.assign({ state: !x.plannedFor ? 'idea' : x.plannedFor < t ? 'missed' : x.plannedFor === t ? 'today' : 'planned' }, x));
  const recent = sortBy(up, (x) => x.uploadedOn).reverse().slice(0, 8);
  const out = { platforms, streak, planned, recent, week: wk, targets: T, uploads: up.length, any: list.length > 0 };
  if (goal) Object.assign(out, goalProgress(up, T, goal.start, goal.deadline, t));
  return out;
}

// the goal's progress: capped uploads against targets over the goal's weeks, up to the deadline
export function goalProgress(up, T, start, deadline, t) {
  const weeks = Math.max(1, Math.round(diff(start, deadline) / 7)), per = T.youtube + T.instagram, target = per * weeks;
  let done = 0;
  for (let i = 0; i < weeks; i++) {
    const w = addDays(mondayOf(start), 7 * i);
    if (w > t) break;
    Object.keys(PLATFORMS).forEach((p) => { done += Math.min(T[p], up.filter((x) => x.platform === p && inWeek(x.uploadedOn, w) && x.uploadedOn >= start).length); });
  }
  return { goalDone: done, goalTarget: target, pct: target ? Math.min(100, (100 * done) / target) : 0 };
}
