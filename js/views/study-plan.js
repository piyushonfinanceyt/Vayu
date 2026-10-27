/* Study Plan: all 110 days (Study / Revision / Mock / Buffer / Exam). Mission briefing for the selected day, the chapters
   planned for it, mark the day Done / Partial / Missed with hours and pages, the 8 phases, every day by week with a
   day-type filter, and how the plan works. Same targets and rules as the original "Today" tab. */
import { html, raw, esc, fmt1, fmtN, fmtD, fmtDS, fmtDL, plural, diff, addDays, isDate, typeName } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, meter, seg, status, toast, confirm } from '../components.js';
import { replan, PACES } from '../replan.js';
import { model } from '../model.js';
import * as store from '../store.js';
import { spot } from '../charts.js';
import { recSeg, numField, hoursStepper, planText, dayStatusChip, typeChip, TYPE_ICON } from './parts.js';
import { pref, setPref, isOpen } from '../prefs.js';
import { go, renderSoon } from '../router.js';

let sel = null;
const pickDate = (M, q) => { const d = isDate(q.date) ? q.date : M.t; return d < M.FIRST ? M.FIRST : d > M.LAST ? M.LAST : d; };

// the day's hours target in words (ramp weeks cut the 2–5 PM block, never the chapters; the minimum day is never zero)
function targetTxt(d) {
  const r = d.ramp, lite = !!r && +r.hrs < 6, buffer = /Buffer/.test(d.type) && !d.boss;
  let s = fmt1(d.target) + ' h';
  if (buffer) s += ' · follow the plan below.';
  else if (r && d.boss) s += ' · ' + r.name + ': Block A' + (lite ? ' for 1 h' : '') + ', the full paper, then marking. Skip Block B.';
  else if (r) s += ' · ' + r.name + ': Blocks A and B, then ' + (lite ? 'one 25-mark timed question (45 min) and 15 min of marking.' : 'one 50-mark timed set (90 min) and 1 h of marking.');
  else s += ' · the full timetable.';
  return s + ' Minimum day: ' + d.minHrs + ' h. Never a zero.';
}
function briefing(M, d) {
  const st = M.st, J = M.journey;
  const left = d.date <= st.syllabusDeadline ? plural(diff(d.date, st.syllabusDeadline), 'day') + ' from this day to the R1 deadline (' + fmtDS(st.syllabusDeadline) + ')'
    : d.date <= J.finish ? plural(diff(d.date, J.finish), 'day') + ' from this day to the ' + fmtDS(J.finish) + ' finish line'
      : plural(Math.max(0, diff(d.date, st.examDate)), 'day') + ' from this day to Paper 1';
  const mk = d.movedIn || null;
  const mockTxt = mk ? 'Moved here: mock #' + mk.id + ' · P' + M.WMAP[mk.subject].paper + ' ' + mk.subject + ' full paper (planned ' + fmtD(mk.planDate) + ') · 3 h, 2–5 PM'
    : d.movedOut && !d.boss ? 'Mock #' + d.movedOut.id + ' was moved to ' + fmtDL(d.movedOut.date)
      : d.boss ? String(d.mock).replace(/^💀\s*BOSS:\s*/, '') : 'No full paper today';
  const row = (ic, label, body) => html`<dt>${icon(ic)}${label}</dt><dd>${body}</dd>`;
  return html`<dl class="brief">${row('target', 'Today’s target', targetTxt(d))}${row('book', 'Main quest', planText(d.main))}${row('reading', 'Side quest', planText(d.side))}${row('mocks', 'Full paper', d.boss || mk ? html`<b style="font-weight:500">${mockTxt}</b>` : html`<span class="muted">${mockTxt}</span>`)}${row('revision', 'Revision dose', d.rev)}${row('dumbbell', 'Workout', d.workout + (d.run ? '  →  ' + d.run.workout : ''))}${row('clock', 'Countdown', left)}</dl>`;
}
function chaptersFor(M, d) {
  const list = M.chapters.filter((c) => c.planned === d.date);
  if (!list.length) return html`<p class="muted small">No new chapters planned for this day. Use it for revision, the full paper and the error book.</p>`;
  return html`<ul class="plan-ch">${list.map((c) => html`<li><span class="li-main"><b><i class="dot" style="--c:${M.WMAP[c.subject].c};margin-right:8px"></i>#${c.id} ${c.name}</b><small>${c.paper} ${c.subject} · ${fmt1(c.hrs)} h · ${c.priority === 'HIGH' ? 'high priority' : c.priority.toLowerCase() + ' priority'}${c.moved ? ' · moved from ' + fmtDS(c.planDate) : ''}</small></span>${recSeg('chapters', c.id, 'status', c.status, [['pending', 'Pending'], ['progress', 'In progress'], ['done', 'Done', 'good']], 'Status of chapter ' + c.id)}</li>`)}</ul>`;
}
// ---------- catch up: spread unfinished chapters over the days left (replan.js) ----------
const paceNow = () => { const p = +pref('replanPace', 1); return PACES.some((x) => x[0] === p) ? p : 1; };
function catchUpCard(M) {
  const moved = M.chapters.filter((c) => c.moved && c.status !== 'done').length;
  if (!M.overdueCount && !moved) return '';
  const pace = paceNow(), R = replan(M, pace), dl = fmtDS(R.deadline);
  const overHrs = M.chapters.filter((c) => c.flag === 'overdue').reduce((a, c) => a + (+c.hrs || 0), 0);
  const lead = M.overdueCount ? plural(M.overdueCount, 'chapter') + ' overdue (' + fmt1(overHrs) + ' h of plan time)' + (moved ? ' · ' + moved + ' already moved by an earlier catch-up' : '')
    : 'You’re on a catch-up plan · ' + plural(moved, 'chapter') + ' moved from the original dates';
  const late = R.pastDeadline ? diff(R.deadline, R.finish) : 0;
  const prios = ['LOW', 'MEDIUM', 'HIGH'].map((p) => [p, R.pastPrio.filter((x) => x === p).length]).filter((x) => x[1]).map((x) => x[1] + ' ' + x[0].toLowerCase()).join(', ');
  const verdict = !R.moves.length ? 'Nothing to move: the current dates already fit at this pace.'
    : R.mode === 'fold' ? 'The ' + plural(R.moves.length, 'overdue chapter') + ' fit into the room left on lighter days and the buffer day. Nothing else moves, and R1 still finishes by ' + fmtD(R.finish) + ' (deadline ' + dl + ').'
    : R.fits ? 'New dates: ' + plural(R.moves.length, 'chapter') + ' move, and R1 still finishes by ' + fmtD(R.finish) + ' (deadline ' + dl + ').'
      : 'At this pace R1 finishes ' + (R.finish ? fmtD(R.finish) + ', ' + plural(late, 'day') + ' after the ' + dl + ' deadline' : 'after the exam') + '. ' + plural(R.pastDeadline, 'chapter') + (prios ? ' (' + prios + ' priority)' : '') + ' move into the revision days after it.' + (R.nowhere.length ? ' ' + plural(R.nowhere.length, 'chapter') + ' don’t fit before the exam at all.' : '');
  const name = (id) => { const c = M.chapters.find((x) => String(x.id) === String(id)); return c ? '#' + c.id + ' ' + c.name : '#' + id; };
  return card({
    cls: 'catchup', id: 'catch-up', title: 'Catch up', icon: 'revision', sub: 'Give every unfinished chapter a day again · if they don’t all fit, low-priority chapters slip first',
    actions: R.fits ? status('Fits by ' + dl, 'good') : status(late ? plural(late, 'day') + ' late' : 'Doesn’t fit', 'warn'),
    body: html`<p>${lead}</p>
      <div class="field" style="margin-top:12px"><span>Your pace</span>${seg('replan-pace', PACES.map((p) => [String(p[0]), p[1]]), String(pace), { label: 'Your pace' })}<p class="hint">Plan pace means you finish each chapter in its estimated time. Pick a slower pace if chapters take you longer, and the dates spread out to match.</p></div>
      <div class="notice ${R.fits ? '' : 'warn'} cu-verdict">${icon(R.fits ? 'calcheck' : 'alert')}<p>${verdict}</p></div>
      ${R.moves.length ? html`<h3 class="sub-h">${R.mode === 'fold' ? 'Where they go' : 'The next days with the new dates'}</h3><ul class="cu-days">${R.days.slice(0, 5).map((d) => {
        const ids = R.mode === 'fold' ? d.ids.filter((id) => R.moves.some((m) => String(m.id) === String(id))) : d.ids;
        return html`<li><span class="cu-d"><b>${fmtD(d.date)}</b><small>${R.mode === 'fold' ? 'day total ' : ''}${fmt1(d.used)} of ${fmt1(d.cap)} h${d.late ? ' · revision day' : ''}</small></span><span class="cu-ch">${R.mode === 'fold' ? '+ ' : ''}${ids.map(name).join(' · ')}</span></li>`;
      })}</ul>` : ''}
      <div class="row wrap" style="margin-top:14px">${R.moves.length ? html`<button type="button" class="btn primary" data-act="replan-apply">${icon('calcheck')}Use these dates</button>` : ''}${moved ? html`<button type="button" class="btn ghost" data-act="replan-reset">Back to the original plan</button>` : ''}</div>
      <p class="hint">The original plan isn’t changed, so “Back to the original plan” always works. Mock, revision and exam days stay as they are. A restore point is saved before the dates change.</p>`
  });
}
const replanActions = {
  'replan-apply': async () => {
    const R = replan(model(), paceNow());
    if (!R.moves.length) { toast('Nothing to move'); return; }
    const prev = {};
    R.moves.forEach((m) => { const ov = store.S.chapters[m.id]; prev[m.id] = (ov && ov.movedTo) || null; });
    await store.saveSnapshot('pre-replan-' + Date.now(), 'Before the catch-up replan');
    store.batch(() => R.moves.forEach((m) => store.setRec('chapters', m.id, 'movedTo', m.to === m.plan ? null : m.to)));
    toast(plural(R.moves.length, 'chapter') + ' moved · R1 finishes ' + fmtDS(R.finish), { icon: 'calcheck', ms: 7000, action: { label: 'Undo', fn: () => store.batch(() => Object.keys(prev).forEach((id) => store.setRec('chapters', id, 'movedTo', prev[id]))) } });
  },
  'replan-reset': async () => {
    const ids = Object.keys(store.S.chapters).filter((id) => store.S.chapters[id] && store.S.chapters[id].movedTo);
    if (!ids.length) return;
    if (!(await confirm({ title: 'Back to the original plan?', body: plural(ids.length, 'chapter') + ' go back to the dates in your plan. Anything planned before today will show as overdue again.', ok: 'Use the original dates' }))) return;
    store.batch(() => ids.forEach((id) => store.setRec('chapters', id, 'movedTo', null)));
    toast('Back to the original plan');
  }
};

function dayLogCard(M, d) {
  const r = d.rec, hp = d.target ? (+r.hrs || 0) / d.target : 0, future = d.date > M.t;
  const fact = (k, v) => html`<div><span class="muted">${k}</span><b style="font-weight:500">${v}</b></div>`;
  return html`<section class="card hero day-log span-5" aria-label="Log for this day">
    <div class="between"><span class="lbl">${icon('logbook')} ${future ? 'Planned day' : 'Mark this day'}</span>${chip('+' + fmtN(d.xp) + ' XP')}</div>
    <div class="between wrap" style="margin-top:12px;gap:12px"><div><span class="value"><span>${r.hrs == null ? '–' : fmt1(r.hrs)}</span><small> / ${fmt1(d.target)} h</small></span>${meter(hp, { label: 'Hours against target' })}</div>${future ? '' : hoursStepper(d.date, r.hrs, 'sp-hrs')}</div>
    ${future ? html`<p class="small muted" style="margin-top:12px">You can log this day from ${fmtDL(d.date)}.</p>` : html`
      <div class="field" style="margin-top:14px"><span>Day status</span>${recSeg('days', d.date, 'status', r.status, [['done', 'Done', 'good'], ['partial', 'Partial', 'warn'], ['missed', 'Missed', 'bad']], 'Day status', { cls: 'on-hero' })}</div>
      <div class="fields" style="margin-top:12px">${numField('days', d.date, 'pages', r.pages, 'Pages read · target ' + d.pagesT, { pre: 'sp' })}</div>`}
    <div class="facts">${fact('Workout', r.workoutDone === 'Yes' ? 'Done' : r.workoutDone === 'No' ? 'Skipped' : '—')}${fact('Steps', r.steps == null ? '—' : fmtN(r.steps))}${fact('Push-ups', r.pushups == null ? '—' : r.pushups + ' / ' + d.pushT)}${fact('Daily quests', d.questsDone + ' / 8')}</div>
    <div class="row wrap" style="margin-top:14px"><a class="btn primary" href="#/log?date=${d.date > M.t ? M.t : d.date}">${icon('edit')}${d.logged ? 'Edit the 10 PM log' : 'Full 10 PM log'}</a></div>
  </section>`;
}
function phasesCard(M) {
  const t = M.t;
  return card({
    cls: 'span-5', title: 'The 8 phases', icon: 'flag', sub: 'Daily study target per phase · edit in Settings',
    body: html`<ul class="phases">${M.phases.map((p) => {
      const s = diff(p.from, t), e = diff(t, p.to), k = t > p.to ? 'done' : t < p.from ? 'next' : 'now';
      const pc = k === 'done' ? 1 : k === 'now' ? (s + 1) / (diff(p.from, p.to) + 1) : 0;
      return html`<li><span><b>${p.name}</b><br><small class="muted">${fmtDS(p.from)} – ${fmtDS(p.to)} · ${p.hrs} h a day</small></span>${k === 'now' ? chip('Now · ' + plural(e, 'day') + ' left', 'ink') : k === 'done' ? chip('Done', '') : chip('In ' + plural(-s, 'day'), 'line')}${meter(pc, { thin: true, label: p.name + ' elapsed' })}</li>`;
    })}</ul>`
  });
}
function daysCard(M, date) {
  const filt = pref('dayFilter', 'all');
  const types = [['all', 'All'], ['Study', 'Study'], ['Revision', 'Revision'], ['Mock', 'Mock'], ['Buffer', 'Buffer'], ['Exam', 'Exam']];
  const selWeek = M.dayByDate[date].week;
  const body = M.weeks.map((w) => {
    const rows = w.days.filter((x) => filt === 'all' || typeName(x.type) === filt);
    if (!rows.length) return '';
    const key = 'dw' + w.n, open = isOpen(key, w.n === selWeek);
    return html`<details class="grp" data-key="${key}" ${raw(open ? 'open' : '')}><summary><b>Week ${w.n}</b><span class="muted small">${fmtDS(w.start)} – ${fmtDS(w.end)}</span><span class="grow"></span><span class="chip">${fmt1(w.hrs)} / ${fmt1(w.target)} h</span><span class="chip line">${fmtN(w.xp)} XP</span></summary><div class="grp-body">${rows.map((x) => html`<a class="drow ${x.date === date ? 'sel' : ''} ${x.date === M.t ? 'now' : ''}" href="#/study-plan?date=${x.date}" ${raw(x.date === date ? 'aria-current="date"' : '')}><span>${x.jNum ? html`<b style="font-weight:500">D${x.jNum}</b> · ` : ''}${fmtD(x.date)}</span><span class="dr-type">${icon(TYPE_ICON[typeName(x.type)] || 'calendar')} ${typeName(x.type)}${x.boss ? ' · full paper' : ''}</span><span class="num">${x.logged ? fmt1(x.rec.hrs) : '–'} / ${fmt1(x.target)} h</span><span class="dr-st">${x.rec.status ? dayStatusChip(x.rec.status) : x.date < M.t ? html`<span class="chip">Not logged</span>` : ''}</span><span class="num muted dr-xp">+${fmtN(x.xp)}</span></a>`)}</div></details>`;
  });
  return card({ cls: 'span-12', title: 'All ' + M.days.length + ' days · ' + fmtDS(M.FIRST) + ' – ' + fmtDS(M.LAST), icon: 'calendar', sub: 'The journey: Day 1 = ' + fmtDS(M.journey.start) + ', Day ' + M.journey.days + ' = ' + fmtDS(M.journey.end), actions: seg('day-filter', types, filt, { label: 'Day type' }), body: html`${body}` });
}
function howCard(M) {
  const st = M.st, J = M.journey;
  return html`<section class="card"><details class="grp" data-key="howplan" ${raw(isOpen('howplan') ? 'open' : '')}><summary><b>How the plan works</b></summary><div class="grp-body prose">
    <p><b>The ${J.days}-day journey: Day 1 = ${fmtDS(J.start)}, last day ${fmtDS(J.end)}.</b> Every revision round, full paper and writing set is finished by the <b>${fmtDS(J.finish)} finish line</b>. Your logs from before Day 1 are kept. Eight hours a day in four blocks: A content 9–11:30, B practice 11:45–1:15, C handwritten timed writing 2–5 PM (your exam slot), D marking against ICAI answers 6:15–7:15.</p>
    <p><b>Phase 1 · ${fmtDS(J.start)} – ${fmtDS(st.syllabusDeadline)}:</b> baseline papers, then Group II gaps and R1 of every chapter. Two full papers a week. <b>Phase 2 · ${fmtDS(st.revisionStart)} – 6 Dec:</b> R2 in the days before each full paper; three full papers a week. <b>Phase 3 · 7 – 20 Dec:</b> a full paper every day, two rounds in exam order, with R3 of that paper each morning. <b>Fix-it days · 21 – 25 Dec:</b> redo every lost mark and catch up any missed paper. <b>Final look · 26 Dec – 1 Jan:</b> one-page sheets only.</p>
    <p><b>Checkpoints:</b> ${(st.checkpoints || []).map((c) => fmtDS(c)).join(' · ')}. Each full paper is judged against its paper’s next checkpoint target.</p>
    <p><b>Streak:</b> a day counts when you log at least 80% of the target hours or mark it Done. Miss a day and it resets.</p>
    <p><b>Exam dates:</b> ICAI has announced CA Inter January 2027: Group I on 2, 4 and 6 Jan and Group II on 8, 10 and 12 Jan, 2–5 PM. Check icai.org for any change.</p></div></details></section>`;
}

export default {
  enter(q) { if (isDate(q.date)) sel = q.date; },
  head(M, q) {
    const date = pickDate(M, q), d = M.dayByDate[date];
    return { title: 'Study Plan', sub: raw(esc(M.days.length + ' days · ' + fmtDS(M.FIRST) + ' – ' + fmtDS(M.LAST) + ' · ') + esc(M.act)), actions: raw((date !== M.t && M.t >= M.FIRST && M.t <= M.LAST ?'<a class="btn" href="#/study-plan?date=' + M.t + '">' + icon('calendar') + 'Today</a>' : '') + '<button type="button" class="btn primary" data-act="quicklog" data-date="' + (d && date <= M.t ? date : M.t) + '">' + icon('logbook') + '10 PM log</button>') };
  },
  render(M, q) {
    const date = pickDate(M, q), d = M.dayByDate[date];
    sel = date;
    const nav = html`<section class="card daynav"><a class="icon-btn" href="#/study-plan?date=${addDays(date, -1)}" ${raw(date <= M.FIRST ? 'aria-disabled="true" tabindex="-1"' : '')} aria-label="Previous day">${icon('chevL')}</a>
      <div class="dn"><b>${d.jNum ? 'Day ' + d.jNum + ' of ' + M.journey.days : d.label} · ${fmtDL(date)}</b><span>${typeName(d.type)} · ${d.phase}${date === M.t ? ' · today' : ''}</span></div>
      <a class="icon-btn" href="#/study-plan?date=${addDays(date, 1)}" ${raw(date >= M.LAST ? 'aria-disabled="true" tabindex="-1"' : '')} aria-label="Next day">${icon('chevR')}</a>
      <input type="date" class="in sm" data-nav-date="study-plan" min="${M.FIRST}" max="${M.LAST}" value="${date}" aria-label="Pick a day">${typeChip(d.type)}</section>`;
    const brief = card({ cls: 'span-7', title: 'Mission briefing', icon: 'flag', sub: fmtDL(date), body: html`${briefing(M, d)}<h3 class="sub-h">Chapters planned for this day${M.overdueCount && date === M.t ? html` · <a class="chip bad" href="#/subjects?flag=overdue">${icon('alert')}${M.overdueCount} overdue</a>` : ''}</h3>${chaptersFor(M, d)}` });
    return html`${nav}${catchUpCard(M)}<div class="grid">${brief}${dayLogCard(M, d)}</div><div class="grid">${phasesCard(M)}${weekSummary(M, d)}</div><div class="grid">${daysCard(M, date)}</div>${howCard(M)}`;
  },
  step(dir) { if (!sel) return; const n = addDays(sel, dir); if (n >= FIRST_DAY && n <= LAST_DAY) go('#/study-plan?date=' + n); },
  segs: { 'day-filter': (v) => setPref('dayFilter', v), 'replan-pace': (v) => { setPref('replanPace', +v); renderSoon(); } },
  actions: replanActions
};
const FIRST_DAY = window.__FC_DATA__.days[0].date, LAST_DAY = window.__FC_DATA__.days[window.__FC_DATA__.days.length - 1].date;
// week strip: the selected day's week, logged vs planned hours per day
function weekSummary(M, d) {
  const w = M.weeks[d.week - 1];
  const tips = w.days.map((x) => fmtD(x.date) + ' · ' + typeName(x.type));
  return card({
    cls: 'span-7', title: 'Week ' + w.n + ' · ' + fmtDS(w.start) + ' – ' + fmtDS(w.end), icon: 'clock',
    sub: fmt1(w.hrs) + ' of ' + fmt1(w.target) + ' h logged · ' + fmtN(w.xp) + ' XP',
    actions: html`<span class="legend" style="margin:0"><span><i class="key" style="--c:var(--line-2)"></i>logged</span><span><i class="key hatch"></i>planned</span></span>`,
    body: spot('plan-week', 'bars', { labels: w.days.map((x) => fmtD(x.date).slice(0, 6)), tips, values: w.days.map((x) => (x.date <= M.t ? +x.rec.hrs || 0 : null)), targets: w.days.map((x) => x.target), highlight: w.days.findIndex((x) => x.date === d.date), fmt: (v) => fmt1(v) + ' h', height: 210, ariaLabel: 'Study hours logged against the plan for each day of week ' + w.n })
  });
}
