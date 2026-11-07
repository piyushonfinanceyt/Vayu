/* Today's study, worked out once for the Dashboard card and the voice briefing (voice.js):
   - blockState: today's timetable blocks, the one running now and the next one.
   - studyPlan: today's to-do items grouped by study block. Chapters go under the block whose bullets name them
     (Block A: Audit R1, Block B: Accounts R1 …), the revision dose (the afternoon's timed sets and marking) gets its
     own group, and the run and non-study tasks sit apart in `also`. Groups are in the order of the day's blocks.
   - shortGoal / midSentence: a block's name cut down for the one-line goal. */
import { fmt1, fmtClock, nowMin } from './util.js';

export function blockState(M) {
  const blocks = M.timetable(M.t), n = nowMin();
  const cur = blocks.find((b) => n >= b.from && n < b.end) || null, next = blocks.find((b) => b.from > n) || null;
  return { blocks, cur, next, n };
}

const STUDY_CATS = ['Accounts', 'Law', 'Tax', 'Costing', 'Audit', 'FM&SM', 'Revision', 'Mock test'];
export const noHrs = (s) => String(s || '').replace(/^•\s*/, '').replace(/\s*\(\d+(\.\d+)?h\)\s*$/, '').trim();
const firstLine = (s) => noHrs(String(s || '').split('\n')[0]);
const bulletsOf = (s) => String(s || '').split('\n').slice(1).map(noHrs).filter(Boolean);
export const dur = (m) => (m >= 60 ? fmt1(m / 60) + ' h' : m + ' min');
// "Audit R1 — close gaps first" → "Audit R1", "EXAM · P1 Advanced Accounting · 2–5 PM (…)" → "EXAM · P1 Advanced Accounting"
export function shortGoal(t) {
  let s = String(t).split(' — ')[0].replace(/\s*\([^)]*\)/g, '').trim();
  if (s.length > 36) { const p = s.split(' · '); s = p.length > 1 && p[0].length < 12 ? p[0] + ' · ' + p[1] : p[0]; }
  if (s.length > 36) s = s.split(/: |, /)[0];
  return s;
}
// lower-case a name that follows a comma, unless it starts with a paper's name
export const midSentence = (s) => (/^[A-Z][a-z]/.test(s) && !/^(Accounts|Advanced|Law|Corporate|Tax|Income|GST|Costing|Cost|Audit|FM|SM)\b/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export function studyPlan(M, B) {
  const d = M.todayDay, groups = [], also = [], by = {};
  const tag = (b) => (b ? b.label + ' · ' + fmtClock(b.from) + ' · ' + dur(b.dur) : '');
  const head = (src, fallback) => { const t = firstLine(src), b = B.blocks.find((x) => x.title === t); return { tag: tag(b), from: b ? b.from : null, end: b ? b.end : null, title: t.replace(/^Block [A-Z] · /, '').replace(/:$/, '') || fallback }; };
  const add = (key, h, it) => { if (!by[key]) { by[key] = Object.assign({ key, items: [] }, h); groups.push(by[key]); } by[key].items.push(it); };
  const mainB = d ? bulletsOf(d.main) : [], sideB = d ? bulletsOf(d.side) : [];
  M.focus.items.forEach((it) => {
    if (it.kind === 'workout') return also.push(it);
    if (it.kind === 'task') return STUDY_CATS.includes(it.cat) ? add('tasks', { tag: '', title: 'Your study tasks' }, it) : also.push(it);
    if ((it.kind === 'chapter' && mainB.includes(it.title)) || it.cat === 'Main quest') return add('main', head(d.main, 'Main quest'), it);
    if ((it.kind === 'chapter' && sideB.includes(it.title)) || it.cat === 'Side quest') return add('side', head(d.side, 'Side quest'), it);
    if (it.kind === 'chapter') return add('ch-' + it.cat, { tag: '', title: it.cat }, it);
    if (it.kind === 'mock') { const p = B.blocks.find((b) => b.label === 'Paper' || b.label === 'Exam'); return add('mock', { tag: tag(p), from: p ? p.from : null, end: p ? p.end : null, title: 'Full paper, handwritten' }, it); }
    const timed = /timed/i.test(it.title), c = timed && B.blocks.find((b) => b.kind === 'mock');
    // the timed sets (Block C) are marked in Block D: the group ends when the last of those blocks does
    const cEnd = c ? Math.max(...B.blocks.filter((b) => (b.kind === 'mock' || b.kind === 'revision') && b.from >= c.from).map((b) => b.end)) : null;
    add('rev', { tag: c ? (c.label === 'Block C' ? 'Block C + D' : c.label) + ' · ' + fmtClock(c.from) : '', from: c ? c.from : null, end: cEnd, title: timed ? 'Timed writing and marking' : 'Revision' }, it);
  });
  // in the order of the day's blocks; groups with no block (your tasks, a revision dose) go last
  const rank = { main: 0, side: 1 }, at = (g) => (g.from != null ? g.from : 9999 + (rank[g.key] ?? 2));
  groups.sort((a, b) => at(a) - at(b));
  const all = groups.flatMap((g) => g.items);
  return { groups, also, done: all.filter((i) => i.done).length, total: all.length };
}
