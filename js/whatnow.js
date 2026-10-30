/* "What now?": the single best thing to do at this moment, and one tap to start it. Each possible task gets a score and
   the highest wins; the next two are offered as alternatives.
   - Fixed points first: today's full paper from 1:25 PM, its marks after 5 PM, the 10 PM log from 9 PM, sleep from 11 PM.
   - Chapters (in progress, overdue, today's) score higher for high priority, a place on the leak map, a weak paper in
     the pass outlook, and the morning. They drop late in the evening and once today's hours are done.
   - Revision due scores by days late; mistakes and flashcards score by how many are due, and rise in the evening,
     when short recall work suits tired hours.
   A chapter or revision starts Deep focus already set up: paper, chapter, length and intention. */
import { fmt1, plural, diff, sortBy } from './util.js';
import * as store from './store.js';
import { errDue } from './drill.js';

const OUT = { below: 12, risk: 6 };
export const chapterItem = (M, c, mins) => ({
  id: 'ch-' + c.id, icon: 'book', title: (c.status === 'progress' ? 'Finish ' : 'Study ') + '#' + c.id + ' ' + c.name,
  mins, start: 'Start ' + mins + ' min', focus: { kind: 'subject', subject: c.subject, chapterId: c.id, intention: (c.status === 'progress' ? 'Finish ' : 'Get through ') + c.name }
});
export const revisionItem = (M, x, mins) => ({
  id: 'rev-' + x.c.id, icon: 'revision', title: x.round + ' of #' + x.c.id + ' ' + x.c.name,
  mins, start: 'Start ' + mins + ' min', focus: { kind: 'subject', subject: x.c.subject, chapterId: x.c.id, intention: 'Recall first, then check against your notes', round: x.round, revField: x.field }
});

// n = minutes since midnight
export function whatNow(M, n) {
  const t = M.t, d = M.todayDay, tm = M.st.timer || {}, deep = +tm.deep || 50, short = +tm.pomodoro || 25;
  const hrs = d ? +d.rec.hrs || 0 : 0, target = d ? d.target : 0, doneHours = target > 0 && hrs >= target;
  const mk = M.mocks.find((x) => x.date === t && x.status !== 'skipped' && x.marks == null);
  const eve = n >= 20 * 60, late = n >= 23 * 60 || n < 5 * 60;
  const paper = {}, leak = {};
  M.outlook.papers.forEach((p) => { paper[p.key] = p; });
  M.leaks.forEach((r) => { if (r.c && r.lost) leak[r.c.id] = r.score; });   // marks actually lost, not just overdue
  const left = 22 * 60 - n, gate = mk && n < 13 * 60 + 45 ? 13 * 60 + 45 - n : left;   // time before the paper, or before the 10 PM log
  const len = (want) => Math.max(15, Math.min(want, gate > 0 ? gate : want));
  const items = [];
  const push = (it, score, why) => items.push(Object.assign(it, { score, why }));

  if (late) push(d && d.logged ? { id: 'sleep', icon: 'moon', title: 'Sleep', start: '' } : { id: 'log', icon: 'logbook', title: 'Fill in tonight’s log, then sleep', start: 'Open the log', log: true }, 200, d && d.logged ? 'Today is logged. Tomorrow’s hours start with tonight’s sleep.' : 'It takes two minutes, and tomorrow starts clean.');
  if (mk && n >= 13 * 60 + 25 && n < 17 * 60) push({ id: 'mock-' + mk.id, icon: 'mocks', title: 'Write today’s full paper: P' + M.WMAP[mk.subject].paper + ' ' + mk.subject, start: 'Open the paper', href: '#/mocks?id=' + mk.id }, 150, '2–5 PM, under exam conditions.');
  if (mk && n >= 17 * 60) push({ id: 'marks-' + mk.id, icon: 'edit', title: 'Enter the marks for mock #' + mk.id, start: 'Enter marks', href: '#/mocks?id=' + mk.id }, 120, 'The pass forecast and leak map update from it.');
  if (d && !d.logged && n >= 21 * 60) push({ id: 'log', icon: 'logbook', title: 'Fill in tonight’s 10 PM log', start: 'Open the log', log: true }, 110, 'Hours, pages, steps, workout and meals.');

  const pick = M.chapters.filter((c) => c.status === 'progress' || c.flag === 'overdue' || c.flag === 'today');
  pick.forEach((c) => {
    let s = c.status === 'progress' ? 58 : c.flag === 'overdue' ? 55 + Math.min(diff(c.planned, t), 5) * 2 : 50;
    const why = [c.status === 'progress' ? 'Already started' : c.flag === 'overdue' ? plural(diff(c.planned, t), 'day') + ' overdue' : 'Planned for today'];
    if (c.priority === 'HIGH') { s += 8; why.push('high priority'); }
    if (leak[c.id]) { s += Math.min(15, leak[c.id] * 2); why.push('marks lost here before'); }
    const st = paper[c.subject] && paper[c.subject].status;
    if (OUT[st]) { s += OUT[st]; why.push(paper[c.subject].code + ' is ' + (st === 'below' ? 'below 40' : 'at risk')); }
    if (n < 12 * 60) s += 5;
    if (eve) s -= 20;
    if (doneHours) s -= 15;
    push(chapterItem(M, c, len(deep)), s, why.join(' · '));
  });
  M.revq.today.forEach((x) => {
    let s = 45 + Math.min(x.late, 7) * 2;
    const why = [x.late > 0 ? plural(x.late, 'day') + ' late' : 'Due today'];
    if (x.c.priority === 'HIGH') { s += 5; why.push('high priority'); }
    if (x.leaky) { s += 8; why.push('has open mistakes'); }
    push(revisionItem(M, x, len(short)), s, why.join(' · '));
  });
  const errs = store.list('errors').filter((e) => errDue(e, t)).length;
  if (errs) push({ id: 'drill', icon: 'alert', title: 'Drill ' + plural(errs, 'mistake'), start: 'Start drill', href: '#/errors?drill=1' }, 40 + Math.min(errs, 10) * 1.5 + (n >= 18 * 60 ? 15 : 0), 'They come back until they stop costing marks.');
  if (M.cardsDue) push({ id: 'cards', icon: 'zap', title: 'Drill ' + plural(M.cardsDue, 'flashcard'), start: 'Start cards', href: '#/revision?drill=1' }, 35 + Math.min(M.cardsDue, 20) * 0.5 + (eve ? 15 : 0), 'A few seconds each.');

  const ranked = sortBy(items, (x) => -x.score).filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);
  if (!ranked.length) ranked.push({ id: 'ahead', icon: 'flame', title: doneHours ? 'Today’s hours are done' : 'Nothing urgent right now', start: 'Pick a focus', setup: true, why: doneHours ? fmt1(hrs) + ' of ' + fmt1(target) + ' h. Rest, or get ahead on tomorrow.' : 'Choose a paper and put in a focus session.', score: 0 });
  return { top: ranked[0], also: ranked.slice(1, 3).filter((x) => x.start), hrs, target };
}
