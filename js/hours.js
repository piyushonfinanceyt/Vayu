/* "Can I finish?": hours needed for R1 against the hours left, from your real pace.
   - Needed = the estimates of every unfinished chapter ÷ your pace. Pace = estimated hours ÷ hours actually spent, a
     smooth blend of Deep focus sessions on chapters you've finished and the last 14 days' chapters and logged hours
     (see realPace), 1 (the plan's estimates) until there's data. It's kept between 0.6 and 1.6.
   - Available = the plan's daily targets to the R1 deadline, minus what's already logged today, minus 3 hours for each
     full paper still to write in that time.
   - Core = HIGH chapters, plus MEDIUM then LOW until each paper reaches 40% of its chapter hours, because a pass needs
     40 in every paper and some papers (Audit) have no HIGH chapters at all.
   - After the R1 deadline it measures to the end of the revision phase instead. Once R1 is done there's nothing to show. */
import { addDays, diff, sortBy, sum } from './util.js';

const PAPER_HRS = 3, FLOOR = 0.4, PRIO = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const hrsOf = (c) => +c.hrs || 0;

// One smooth estimate, so a single session more or less (say, one that hasn't reached your other device yet) moves
// the answer a little instead of flipping it: estimated hours ÷ real hours, from Deep focus sessions on finished
// chapters and, at 40% weight because it counts all study and not just chapters, the last 14 days' log. Both start
// with PRIOR hours at plan pace, so a little data stays close to 1 and only a lot of data moves it far.
const PRIOR = 6, LOG_WEIGHT = 0.4;
export function realPace(M, sessions) {
  const t = M.t, done = {};
  M.chapters.forEach((c) => { if (c.status === 'done') done[c.id] = c; });
  const spent = {};
  sessions.forEach((s) => { if (s.chapterId && !s.round && done[s.chapterId]) spent[s.chapterId] = (spent[s.chapterId] || 0) + (+s.minutes || 0) / 60; });
  const ids = Object.keys(spent), estF = sum(ids, (i) => hrsOf(done[i])), actF = sum(ids, (i) => spent[i]);
  const from = addDays(t, -14), recent = M.chapters.filter((c) => c.status === 'done' && c.doneAt >= from && c.doneAt < t);
  const estL = sum(recent, hrsOf), actL = sum(M.days.filter((d) => d.date >= from && d.date < t), (d) => +d.rec.hrs || 0);
  const useLog = recent.length >= 3 && actL >= 5, useFocus = actF >= 1;
  if (!useLog && !useFocus) return { pace: 1, source: 'plan' };
  const E = (useFocus ? estF : 0) + (useLog ? LOG_WEIGHT * estL : 0), A = (useFocus ? actF : 0) + (useLog ? LOG_WEIGHT * actL : 0);
  return { pace: clampPace((E + PRIOR) / (A + PRIOR)), source: useFocus && actF >= (useLog ? LOG_WEIGHT * actL : 0) ? 'focus' : 'log' };
}
const clampPace = (p) => Math.max(0.6, Math.min(1.6, p));

// the chapters to protect first: see the note at the top
export function coreChapters(M, open) {
  const out = [];
  M.worlds.forEach((w) => {
    const all = M.chapters.filter((c) => c.subject === w.key), floor = sum(all, hrsOf) * FLOOR;
    const mine = open.filter((c) => c.subject === w.key), high = mine.filter((c) => c.priority === 'HIGH');
    let have = sum(all.filter((c) => c.status === 'done'), hrsOf) + sum(high, hrsOf);
    out.push(...high);
    sortBy(mine.filter((c) => c.priority !== 'HIGH'), (c) => (PRIO[c.priority] != null ? PRIO[c.priority] : 1) + c.planDate).forEach((c) => { if (have < floor) { out.push(c); have += hrsOf(c); } });
  });
  return out;
}

export function hoursCheck(M, sessions) {
  const t = M.t, st = M.st, r1 = st.syllabusDeadline, until = t <= r1 ? r1 : st.revisionEnd || r1;
  const open = M.chapters.filter((c) => c.status !== 'done');
  if (!open.length || t > until) return null;
  const left = M.days.filter((d) => d.date >= t && d.date <= until), logged = M.todayDay ? +M.todayDay.rec.hrs || 0 : 0;
  const targets = sum(left, (d) => (d.date === t ? Math.max(0, d.target - logged) : d.target));
  const papers = M.mocks.filter((m) => m.score == null && m.status !== 'skipped' && m.date >= t && m.date <= until).length;
  const available = Math.max(0, targets - papers * PAPER_HRS);
  const P = realPace(M, sessions), need = sum(open, hrsOf) / P.pace;
  const core = coreChapters(M, open), coreNeed = sum(core, hrsOf) / P.pace;
  const days = Math.max(1, left.filter((d) => d.date > t || d.target > logged).length);
  const perDay = (need + papers * PAPER_HRS) / days;
  const week = M.days.filter((d) => d.date < t && d.date >= addDays(t, -7));
  const recent = week.length ? sum(week, (d) => +d.rec.hrs || 0) / week.length : 0;
  const finish = recent > 0 ? addDays(t, Math.ceil((need + papers * PAPER_HRS) / recent)) : null;
  return {
    until, isR1: until === r1, open: open.length, need, available, days, perDay, papers, recent, finish, pace: P.pace, source: P.source,
    core: core.length, coreNeed, verdict: need <= available ? 'fits' : coreNeed <= available ? 'core' : 'short', onPace: recent >= perDay * 0.9,
    afterExam: !!finish && finish >= st.examDate, sepOpen: open.filter((c) => c.sep === '✅ Done').length, daysToFinish: finish ? diff(t, finish) : null
  };
}
