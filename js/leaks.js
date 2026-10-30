/* Leak map: the chapters most likely to cost you marks, ranked. It joins what Vayu already knows about each one:
   - open marks in the Error Book, and drill misses (an Error Book chapter is free text, so it's matched to the plan's
     chapter by its words; a topic that matches none still appears, under its own name);
   - the paper's state in the pass outlook, which multiplies those marks (below 40 × 1.5, at risk × 1.25);
   - overdue chapters and overdue revisions, more for high priority;
   - finished chapters with no questions practised, and unrevised high-priority chapters in a paper at risk. */
import { sortBy } from './util.js';

const SKIP = new Set(['and', 'of', 'the', 'in', 'to', 'for', 'on', 'with', 'by', 'a', 'an', 'incl', 'under', 'act', 'its', 'as']);
const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !SKIP.has(w));
const key = (s) => words(s).join(' ');

// the plan's chapter an Error Book entry is about: all its words in one chapter's name, or at least 60% of them
export function matchChapter(text, subject, chapters) {
  const w = words(text);
  if (!w.length) return null;
  let best = null, top = 0;
  chapters.forEach((c) => {
    if (c.subject !== subject) return;
    const name = new Set(words(c.name)), hit = w.filter((x) => name.has(x)).length / w.length;
    if (hit > top) { top = hit; best = c; }
  });
  return top >= 0.6 ? best : null;
}

// open marks and misses per chapter or topic, from the Error Book
export function errorTally(errors, chapters) {
  const tally = new Map();
  errors.forEach((e) => {
    if (e.fixed || !String(e.chapter || '').trim()) return;
    const c = matchChapter(e.chapter, e.paper, chapters), id = c ? 'c' + c.id : 't' + e.paper + '|' + key(e.chapter);
    const x = tally.get(id) || { id, c, subject: e.paper, name: c ? c.name : e.chapter, marks: 0, misses: 0, n: 0 };
    x.marks += +e.marks || 0; x.misses += +e.misses || 0; x.n++;
    tally.set(id, x);
  });
  return tally;
}
export const leakyIds = (tally) => new Set([...tally.values()].filter((x) => x.c).map((x) => String(x.c.id)));

export function leakMap(chapters, outlook, tally, revq) {
  const paper = {};
  outlook.papers.forEach((p) => { paper[p.key] = p; });
  const mult = (s) => { const st = paper[s] && paper[s].status; return st === 'below' ? 1.5 : st === 'risk' ? 1.25 : 1; };
  const rows = new Map();
  tally.forEach((x) => {
    const why = ['−' + (Math.round(x.marks * 2) / 2) + ' marks open'];
    if (x.misses) why.push('drill missed ' + x.misses + (x.misses === 1 ? ' time' : ' times'));
    rows.set(x.id, { id: x.id, c: x.c, subject: x.subject, name: x.name, score: (x.marks + x.misses) * mult(x.subject), why, lost: x.marks });
  });
  chapters.forEach((c) => {
    const high = c.priority === 'HIGH', atRisk = mult(c.subject) > 1, due = revq.byId[c.id];
    let add = 0;
    const why = [];
    if (c.flag === 'overdue') { add += high ? 3 : c.priority === 'LOW' ? 1 : 2; why.push('overdue'); }
    if (due && due.late > 0) { add += high ? 2 : 1; why.push(due.round + ' overdue'); }
    if (c.status === 'done' && !c.questions) { add += 1; why.push('no questions practised'); }
    if (atRisk && high && !c.rev1) { add += 1.5; why.push(paper[c.subject].code + ' is at risk'); }
    if (!add) return;
    const id = 'c' + c.id, row = rows.get(id) || { id, c, subject: c.subject, name: c.name, score: 0, why: [] };
    row.score += add; row.why = row.why.concat(why);
    rows.set(id, row);
  });
  return sortBy([...rows.values()], (r) => -r.score).slice(0, 10).map((r) => Object.assign(r, { score: Math.round(r.score * 10) / 10 }));
}
