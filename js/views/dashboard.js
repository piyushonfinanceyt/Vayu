/* Dashboard · Option A, the Today cockpit. It answers "what do I do right now?"
   Row 1: countdown to Paper 1 (hero) + today's timetable with a live "now" line.
   Row 2: four target meters (hours, pages, steps, push-ups) + next up (hero).
   Row 3: today's plan checklist · the 10 PM log prompt · today's / next run.
   Row 4: syllabus, XP and rank (hero), streaks, this week · Winter Arc today · next milestones. */
import { html, raw, esc, fmt1, fmtN, fmtD, fmtDS, fmtDL, fmtLong, plural, mmss, pct, diff, addDays, mondayOf, nowMin, fmtClock, greeting, now, typeName, clamp01, todayStr } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, status, ring, meter, empty, linkBtn, toast } from '../components.js';
import { spot, miniBars } from '../charts.js';
import { recSeg, numField, hoursStepper, bind, dayStatusChip } from './parts.js';
import * as store from '../store.js';
import * as arc from '../arc.js';
import * as pwa from '../pwa.js';
import { promptWeek } from '../weekly.js';

const STATUS_TONE = { ahead: 'good', ontrack: 'good', done: 'good', behind: 'warn', overdue: 'bad', upcoming: '', nodata: '' };

// ---------- row 1 ----------
function countdown(M) {
  const at = M.examAt, ms = Math.max(0, at - now()), s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const J = M.journey, st = M.st, syl = diff(M.t, st.syllabusDeadline), fin = diff(M.t, J.finish);
  const sylPos = clamp01(diff(J.start, st.syllabusDeadline) / J.days) * 100, finPos = clamp01(diff(J.start, J.finish) / J.days) * 100;
  const unit = (k, v, l) => html`<span class="cd-u"><b data-cd="${k}">${k === 'd' ? String(v) : String(v).padStart(2, '0')}</b><small>${l}</small></span>`;
  return html`<section class="card hero cd-card span-4" aria-label="Countdown to Paper 1">
    <div class="between"><span class="lbl">${icon('cap')} Paper 1 · Accounts</span><span class="chip">${fmtD(st.examDate)} · ${fmtClock(at.getHours() * 60 + at.getMinutes())}</span></div>
    <div class="cd-big"><span class="value xl" data-count="${d}">${d}</span><span class="cd-days">days to go</span></div>
    <div class="cd" role="timer" aria-label="${d} days, ${h} hours and ${m} minutes to Paper 1" data-cd-at="${at.getTime()}">${unit('h', h, 'hrs')}${unit('m', m, 'min')}${unit('s', sec, 'sec')}</div>
    <div class="jtrack" role="img" aria-label="${J.num ? 'Day ' + J.num + ' of ' + J.days : 'Journey'}, ${Math.round(J.elapsed * 100)}% of the journey gone"><i style="width:${(J.elapsed * 100).toFixed(1)}%"></i><b style="left:${sylPos.toFixed(1)}%" title="R1 deadline"></b><b style="left:${finPos.toFixed(1)}%" title="Finish line"></b></div>
    <div class="between small" style="margin-top:8px"><span>${J.num ? html`Day <b>${J.num}</b> of ${J.days}` : M.t < J.start ? 'Day 1 on ' + fmtDS(J.start) : 'Journey complete'}</span><span class="muted">${syl > 0 ? 'R1 deadline in ' + plural(syl, 'day') : syl === 0 ? 'R1 deadline today' : fin > 0 ? 'Finish line in ' + plural(fin, 'day') : 'Final look and exams'}</span></div>
  </section>`;
}

function blockState(M) {
  const blocks = M.timetable(M.t), n = nowMin();
  const cur = blocks.find((b) => n >= b.from && n < b.end) || null, next = blocks.find((b) => b.from > n) || null;
  return { blocks, cur, next, n };
}
function timetableCard(M, B) {
  const d = M.todayDay;
  if (!d) return card({ cls: 'span-8', title: 'Today’s timetable', icon: 'clock', body: empty(M.t < M.FIRST ? 'The plan starts on ' + fmtDL(M.FIRST) + '.' : 'The plan is complete. Every block is behind you.', '', 'calendar') });
  const agenda = html`<ol class="agenda">${B.blocks.map((b) => { const st = B.n >= b.end ? 'done' : B.n >= b.from ? 'cur' : ''; return html`<li class="${st}"><span class="ag-t num">${fmtClock(b.from)}</span><span class="ag-dot" aria-hidden="true"></span><span class="li-main"><b>${b.label}</b><small>${b.title}</small></span>${st === 'cur' ? chip('Now', 'ink') : ''}</li>`; })}</ol>`;
  return card({
    cls: 'span-8 tt-card', title: 'Today’s timetable', icon: 'clock',
    sub: typeName(d.type) + ' day · ' + (d.ramp ? d.ramp.name + ' · ' + fmt1(d.target) + ' h target' : fmt1(d.target) + ' h target'),
    actions: html`<a class="btn sm ghost" href="#/study-plan">Mission briefing${icon('arrowR')}</a>`,
    body: html`<div class="tt-wide">${spot('timetable', 'timeline', { blocks: B.blocks, now: B.n, fmtClock, height: 112, ariaLabel: 'Today’s timetable with the current time' })}</div>${agenda}
      <div class="tt-now">${B.cur ? html`<span><span class="lbl">Now</span><b>${B.cur.label}</b> · ${B.cur.title} <span class="muted">until ${fmtClock(B.cur.end)}</span></span>` : html`<span><span class="lbl">Now</span><b>${B.next ? 'Free until ' + fmtClock(B.next.from) : 'Day done'}</b></span>`}${B.next ? html`<span><span class="lbl">Next</span><b>${B.next.label}</b> at ${fmtClock(B.next.from)}</span>` : ''}</div>`
  });
}

// ---------- row 2 ----------
function targetMeters(M) {
  const d = M.todayDay, r = d ? d.rec : store.dayRec(M.t);
  const items = [
    ['Study', r.hrs, d ? d.target : 0, 'h', 'book', (v) => fmt1(v)],
    ['Pages', r.pages, d ? d.pagesT : +M.st.pages, '', 'reading', (v) => fmtN(v)],
    ['Steps', r.steps, +M.st.steps, '', 'steps', (v) => fmtN(v)],
    ['Push-ups', r.pushups, d ? d.pushT : M.pushToday, '', 'strength', (v) => fmtN(v)]
  ];
  return items.map(([label, v, t, u, ic, f]) => {
    const p = t ? (+v || 0) / t : 0, hit = v != null && p >= 1;
    return html`<button type="button" class="tile meter-tile" data-act="quicklog" aria-label="${label}: ${v == null ? 'not logged' : f(v) + u} of ${f(t)}${u}. Open the quick log">
      <span class="lbl">${icon(ic)}${label}</span>
      <span class="mt-ring">${ring(p, { size: 64, stroke: 6, text: v == null ? '–' : Math.round(p * 100) + '%', color: hit ? 'var(--good-mark)' : 'var(--ink)' })}</span>
      <span class="mt-val"><b>${v == null ? '–' : f(v)}</b> / ${f(t)}${u ? ' ' + u : ''}</span>
      ${hit ? html`<span class="chip good">${icon('check')}Target hit</span>` : html`<span class="chip">${v == null ? 'Not logged' : f(Math.max(0, t - (+v || 0))) + (u ? ' ' + u : '') + ' to go'}</span>`}
    </button>`;
  });
}
function nextUp(M, B) {
  const t = M.t, n = B.n, d = M.todayDay;
  const mk = M.mocks.find((x) => x.date === t && x.status !== 'skipped');
  let lbl = 'Next up', title, sub, act;
  if (mk && mk.marks == null && n >= 17 * 60) { title = 'Enter the marks for mock #' + mk.id; sub = 'P' + M.WMAP[mk.subject].paper + ' ' + mk.subject + ' · ' + mk.bossName + ' · target ' + Math.round(mk.target * 100); act = html`<a class="btn primary" href="#/mocks?id=${mk.id}">${icon('edit')}Enter marks</a>`; }
  else if (d && !d.logged && n >= 21 * 60) { title = 'Fill in tonight’s 10 PM log'; sub = 'Hours, pages, steps, push-ups, workout and meals'; act = html`<button type="button" class="btn primary" data-act="quicklog">${icon('logbook')}Open the 10 PM log</button>`; }
  else if (B.cur && (B.cur.kind === 'study' || B.cur.kind === 'mock' || B.cur.kind === 'revision')) { lbl = 'Now · until ' + fmtClock(B.cur.end); title = B.cur.label + ' · ' + B.cur.title; sub = B.next ? 'Then ' + B.next.label + ' at ' + fmtClock(B.next.from) : 'Last block of the day'; act = html`<button type="button" class="btn primary" data-act="timer">${icon('timer')}Start the focus timer</button>`; }
  else if (B.next) { lbl = 'Next · ' + fmtClock(B.next.from); title = B.next.label + ' · ' + B.next.title; sub = 'In ' + fmtMinsLeft(B.next.from - n); act = B.next.kind === 'workout' ? html`<a class="btn primary" href="#/run-5k">${icon('activity')}Open the run plan</a>` : html`<button type="button" class="btn primary" data-act="timer">${icon('timer')}Focus timer</button>`; }
  else if (mk && mk.marks == null) { title = 'Enter the marks for mock #' + mk.id; sub = mk.subject + ' · ' + mk.bossName; act = html`<a class="btn primary" href="#/mocks?id=${mk.id}">${icon('edit')}Enter marks</a>`; }
  else { title = d && d.logged ? 'Day logged. Rest well.' : 'Log today before you sleep'; sub = M.quote; act = d && d.logged ? html`<a class="btn primary" href="#/study-plan?date=${addDays(t, 1)}">${icon('calcheck')}See tomorrow</a>` : html`<button type="button" class="btn primary" data-act="quicklog">${icon('logbook')}Open the 10 PM log</button>`; }
  return html`<section class="card hero next-card span-4" aria-label="Next up"><span class="lbl">${icon('zap')} ${lbl}</span><p class="nu-title">${title}</p><p class="nu-sub">${sub}</p><div class="row wrap" style="margin-top:auto">${act}</div></section>`;
}
const fmtMinsLeft = (m) => (m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : '') : m + ' min');

// ---------- row 3 ----------
function planCard(M) {
  const items = M.focus.items, t = M.t;
  const row = (it) => {
    let ctl;
    if (it.kind === 'chapter') ctl = html`<button type="button" class="cbx" role="checkbox" aria-checked="${String(it.done)}" data-act="chapter-toggle" data-id="${it.chapterId}" aria-label="${(it.done ? 'Mark not done: ' : 'Mark done: ') + it.title}">${icon('check')}</button>`;
    else if (it.kind === 'plan') ctl = html`<button type="button" class="cbx" role="checkbox" aria-checked="${String(it.done)}" data-act="plan-toggle" data-id="${it.taskId}" data-date="${t}" data-title="${it.title}" aria-label="${(it.done ? 'Mark not done: ' : 'Mark done: ') + it.title}">${icon('check')}</button>`;
    else if (it.kind === 'workout') ctl = html`<button type="button" class="cbx" role="checkbox" aria-checked="${String(it.done)}" data-act="workout-toggle" data-date="${t}" aria-label="${(it.done ? 'Mark not done: ' : 'Mark done: ') + it.title}">${icon('check')}</button>`;
    else if (it.kind === 'task') ctl = html`<button type="button" class="cbx" role="checkbox" aria-checked="${String(it.done)}" data-act="task-toggle" data-id="${it.taskId}" aria-label="${(it.done ? 'Mark not done: ' : 'Mark done: ') + it.title}">${icon('check')}</button>`;
    else ctl = html`<a class="cbx" href="#/mocks?id=${it.mockId}" role="checkbox" aria-checked="${String(it.done)}" aria-label="${it.title}: ${it.done ? 'marks entered' : 'enter marks'}">${icon('check')}</a>`;
    return html`<li class="check ${it.done ? 'done' : ''}">${ctl}<span class="li-main"><b>${it.title}</b><small>${raw(it.color && it.kind === 'chapter' ? '<i class="dot" style="--c:' + it.color + ';margin-right:6px"></i>' : '')}${it.cat}${it.est ? ' · ' + (it.est >= 60 ? fmt1(it.est / 60) + ' h' : it.est + ' min') : ''}${it.sub ? ' · ' + it.sub : ''}</small></span>${it.priority === 'high' ? html`<span class="prio p-high">HIGH</span>` : ''}</li>`;
  };
  const F = M.focus;
  return card({
    cls: 'span-5', title: 'Today’s plan', icon: 'calcheck', sub: M.todayDay ? M.todayDay.label + ' · ' + M.todayDay.phase : 'Outside the plan',
    actions: F.total ? html`<span class="row" style="gap:8px">${ring(F.pct || 0, { size: 36, stroke: 4, label: F.done + ' of ' + F.total + ' done' })}<span class="small"><b>${F.done}</b> / ${F.total}</span></span>` : '',
    body: F.total ? html`<ul>${items.map(row)}</ul>` : empty('Nothing planned for today.', html`<a class="btn sm" href="#/study-plan">Open the plan</a>`, 'calcheck'),
    foot: M.overdueCount ? html`<a class="chip bad" href="#/subjects?flag=overdue">${icon('alert')}${plural(M.overdueCount, 'chapter')} overdue</a><a class="btn sm ghost" href="#/study-plan">Full plan${icon('arrowR')}</a>` : ''
  });
}
function logCard(M) {
  const t = M.t, d = M.todayDay;
  if (!d) return card({ cls: 'span-4', title: '10 PM log', icon: 'logbook', body: empty('The 10 PM log covers the plan days, ' + fmtDS(M.FIRST) + ' to ' + fmtDS(M.LAST) + '.', '', 'logbook') });
  const r = d.rec, hp = d.target ? (+r.hrs || 0) / d.target : 0, late = nowMin() >= 21 * 60;
  return card({
    cls: 'span-4 log-card ' + (late && !d.logged ? 'due' : ''), title: '10 PM log', icon: 'logbook',
    sub: d.logged ? 'Logged · +' + fmtN(d.xp) + ' XP so far' : late ? 'It’s time: log today before you sleep' : 'Fill it in as the day goes, finish at 10 PM',
    actions: html`<a class="btn sm ghost" href="#/log">Full log${icon('arrowR')}</a>`,
    body: html`<div class="between wrap" style="gap:12px"><div><span class="lbl">Study hours · target ${fmt1(d.target)} h</span>${meter(hp, { tone: hp >= 0.9 ? 'good' : '', label: 'Hours against target' })}</div>${hoursStepper(t, r.hrs, 'dl-hrs')}</div>
      <div class="field" style="margin-top:14px"><span>Day status</span>${recSeg('days', t, 'status', r.status, [['done', 'Done', 'good'], ['partial', 'Partial', 'warn'], ['missed', 'Missed', 'bad']], 'Day status')}</div>
      <div class="fields" style="margin-top:12px">${numField('days', t, 'pages', r.pages, 'Pages · ' + d.pagesT, { pre: 'dl' })}${numField('days', t, 'steps', r.steps, 'Steps', { pre: 'dl', step: 100 })}</div>
      ${!d.isRest ? html`<div class="field" style="margin-top:12px"><span>Workout · ${d.workout}</span>${recSeg('days', t, 'workoutDone', r.workoutDone, [['Yes', 'Done', 'good'], ['No', 'Skipped', 'bad']], 'Workout done')}</div>` : ''}
      <p class="hint">${icon('flame')} No-zero streak <b>${M.noZero.streak}</b>${M.noZero.best > M.noZero.streak ? ' (best ' + M.noZero.best + ')' : ''} · minimum ${d.minHrs} h. Push-ups, meals and notes are in the <button type="button" class="btn link" data-act="quicklog">quick log</button>.${pwa.reminder().on ? '' : html` <a href="#/settings" class="btn link">Turn on the 10 PM reminder</a>`}</p>`
  });
}
function runCard(M) {
  const R = M.run5k, t = M.t, rt = M.runs.find((r) => r.date === t && r.session !== 'Extra');
  const r = rt || M.run.next;
  if (!r) return card({ cls: 'span-3 soft', title: 'Running', icon: 'activity', body: empty('The run plan is complete.', '', 'activity') });
  const today = r.date === t, in5 = r.date >= R.R.start && r.date <= R.R.last;
  const ni = (f, label, step, max) => html`<label class="field"><span>${label}</span><input class="in sm" id="${'dr-' + f}" type="number" inputmode="decimal" min="0" ${raw(max ? 'max="' + max + '"' : '')} step="${step}" ${bind('runs', r.date, f, 'num')} value="${r[f] == null ? '' : r[f]}"></label>`;
  const daysTo = diff(t, R.R.race);
  return card({
    cls: 'span-3 run-card', title: today ? 'Today’s run' : 'Next run', icon: 'activity',
    sub: (today ? 'Today' : fmtD(r.date)) + ' · ' + r.session,
    actions: linkBtn(in5 ? '#/run-5k' : '#/health', in5 ? '5K plan' : 'Run plan'),
    body: html`<p class="small" style="margin-bottom:12px">${r.workout}</p>
      ${today ? html`<div class="run-in">${ni('km', 'km', '0.01')}${ni('min', 'min', '1')}${ni('sec', 'sec', '1', 59)}</div>
        <div class="row wrap" style="margin-top:10px"><button type="button" class="tog" ${bind('runs', r.date, 'walked', 'sel')} data-v="Yes" aria-pressed="${String(r.walked === 'Yes')}">Walk breaks</button>${r.total != null ? html`<span class="chip good">${icon('check')}${mmss(r.total)} · ${mmss(r.pace)} /km</span>` : ''}</div>` : ''}
      <div class="run-goal"><div class="between small"><span class="muted">5 km in 30:00</span><b>${pct(R.progress)}</b></div>${meter(R.progress, { thin: true, label: 'Progress to 5 km in 30:00' })}<p class="small muted" style="margin-top:6px">${daysTo > 0 ? 'Race on ' + fmtD(R.R.race) + ' · ' + plural(daysTo, 'day') : daysTo === 0 ? 'Race day · 8 AM' : R.achieved ? 'Goal reached' : 'Backup race ' + fmtD(R.R.last)}</p></div>`
  });
}

// ---------- row 4 ----------
function kpiRow(M) {
  const K = M.kpi, st = M.st, sylExp = M.EXP.syllabus(M.t) / 100, sylGap = K.syllabus.pct - sylExp;
  const sylTone = sylGap >= 0 ? 'good' : sylGap >= -0.08 ? 'warn' : 'bad';
  const ws = mondayOf(M.t), wd = []; for (let i = 0; i < 7; i++) wd.push(addDays(ws, i));
  const vals = wd.map((x) => (x <= M.t ? M.hoursOn(x) : null)), tgts = wd.map((x) => (M.dayByDate[x] ? M.dayByDate[x].target : 0));
  const rankName = String(M.rank ? M.rank.name : '').replace(/^\S+\s/, ''), nextName = M.nextRank ? String(M.nextRank.name).replace(/^\S+\s/, '') : '';
  return html`<div class="tiles kpis">
    <a class="tile" href="#/subjects"><span class="lbl">${icon('book')}Syllabus · R1</span><span class="value"><span data-count="${K.syllabus.done}">${K.syllabus.done}</span><small> / ${K.syllabus.total} chapters</small></span>
      ${meter(K.syllabus.pct, { target: sylExp, targetLabel: 'expected by today', label: 'Chapters done against the plan' })}
      <span class="tile-foot">${status(sylGap >= 0 ? 'On pace' : Math.max(1, Math.round(-sylGap * K.syllabus.total)) + ' behind plan', sylTone)}<span>${K.days.syllabus > 0 ? 'R1 deadline ' + fmtDS(st.syllabusDeadline) + ' · ' + plural(K.days.syllabus, 'day') : 'R1 deadline passed'}</span></span></a>
    <a class="tile hero" href="#/winter-arc"><span class="lbl">${icon('award')}Level and rank</span><span class="value">Level ${M.level}<small> · ${rankName}</small></span>
      ${meter(M.lvProg, { label: 'XP to the next level' })}
      <span class="tile-foot"><span>${fmtN(M.xp)} XP · ${fmtN(M.lvNext - M.xp)} to level ${M.level + 1}</span>${nextName ? html`<span>· ${nextName} at level ${M.nextRank.level}</span>` : ''}</span></a>
    <a class="tile" href="#/winter-arc"><span class="lbl">${icon('flame')}Study streak</span><span class="value"><span data-count="${K.streak.cur}">${K.streak.cur}</span><small> ${K.streak.cur === 1 ? 'day' : 'days'}</small></span>
      ${meter(K.streak.pct, { label: 'Streak towards the next milestone' })}
      <span class="tile-foot"><span>Best ${K.streak.best} · next milestone ${K.streak.next} days</span></span></a>
    <a class="tile" href="#/analytics"><span class="lbl">${icon('clock')}This week</span><span class="value"><span data-count="${Math.round(K.week.hrs * 10) / 10}" data-dec="1">${fmt1(K.week.hrs)}</span><small> / ${fmt1(K.week.target)} h</small></span>
      <span class="wk-bars">${miniBars(vals, tgts, diff(ws, M.t), { w: 168, h: 44 })}</span>
      <span class="tile-foot"><span class="row" style="gap:6px"><i class="key" aria-hidden="true"></i>logged</span><span class="row" style="gap:6px"><i class="key hatch" aria-hidden="true"></i>planned</span><span>${K.week.delta >= 0 ? '+' : '−'}${fmt1(Math.abs(K.week.delta))} h vs last week</span></span></a>
  </div>`;
}
function arcCard(M) {
  const Z = M.arc;
  if (!Z.active) return card({ cls: 'span-6', title: 'Winter Arc', icon: 'snow', body: empty(Z.todayIdx < 0 ? 'Starts ' + fmtD(Z.start) + '.' : 'Arc complete · ' + Z.clean + ' clean days.', linkBtn('#/winter-arc', 'Open the arc'), 'snow') });
  const k = M.t, done = Z.doneCount(k), need = Z.today.need;
  const item = (h) => {
    const v = Z.val(k, h), d = Z.isDone(h, v), L = h.link && arc.LINKS[h.link];
    if (h.kind === 'check') return html`<li class="check ${d ? 'done' : ''}"><button type="button" class="cbx" role="checkbox" aria-checked="${String(d)}" data-act="arc-toggle" data-id="${h.id}" aria-label="${h.name}">${icon('check')}</button><span class="li-main"><b>${h.name}</b>${L ? html`<small>${icon('link')} from the 10 PM log · ${L.label}</small>` : ''}</span></li>`;
    return html`<li class="check ${d ? 'done' : ''}"><span class="cbx" aria-hidden="true" ${raw(d ? 'style="background:var(--ink);border-color:var(--ink);color:var(--bg)"' : '')}>${icon('check')}</span><span class="li-main"><b>${h.name}</b><small>${fmt1(v)} / ${fmt1(h.target)} ${h.unit}${L ? ' · from the 10 PM log' : ''}</small></span><span class="mini-step"><button type="button" class="icon-btn sm" data-act="arc-step" data-dir="-1" data-id="${h.id}" aria-label="Less ${h.name}" ${raw(v <= 0 ? 'aria-disabled="true"' : '')}>${icon('minus')}</button><button type="button" class="icon-btn sm" data-act="arc-step" data-dir="1" data-id="${h.id}" aria-label="More ${h.name}">${icon('plus')}</button></span></li>`;
  };
  return card({
    cls: 'span-6 arc-card', title: 'Winter Arc · day ' + Z.dayNum + ' of ' + Z.days, icon: 'snow',
    sub: Z.today.perfect ? 'Perfect day · +25 XP bonus' : Z.today.clean ? 'Clean day locked in' : plural(need, 'more habit') + ' for a clean day',
    actions: html`<span class="chip">${icon('flame')}Streak ${Z.streak}</span><span class="chip">${Z.rank.n}</span>`,
    body: html`${meter(done / Math.max(1, Z.n), { target: Z.c.threshold / 100, targetLabel: 'clean day', label: done + ' of ' + Z.n + ' arc habits done' })}<ul class="arc-list">${Z.c.habits.map(item)}</ul>`
  });
}
function milestonesCard(M) {
  const up = M.milestones.filter((m) => !m.hidden && m.date >= M.t).slice(0, 5);
  return card({
    cls: 'span-6', title: 'Coming up', icon: 'flag', actions: linkBtn('#/calendar', 'Calendar'),
    body: up.length ? html`<ol class="timeline">${up.map((m) => html`<li class="${m.status}"><span class="tl-date">${m.date === M.t ? 'Today' : fmtDS(m.date)}<br><small>${diff(M.t, m.date) > 0 ? 'in ' + diff(M.t, m.date) + ' d' : ''}</small></span><span class="tl-body"><b>${m.title}</b><small>${m.desc}</small></span></li>`)}</ol>` : empty('No milestones ahead.', '', 'flag')
  });
}
function welcome(M) {
  if (store.S.meta.welcomeDismissed) return '';
  return html`<section class="notice welcome" role="region" aria-label="Getting started">${icon('info')}<div class="grow"><p><b>Your plan is loaded:</b> 110 days, 105 chapters, 27 full papers and 43 runs.</p><p class="muted">Logged progress from the original GOD’S PLAN app isn’t in the plan file. Download a backup there (Tools → Download backup) and import it here to bring it across.</p></div>
    <div class="row wrap"><label class="btn sm">${icon('upload')}Import a backup<input type="file" accept=".json,application/json" data-change="import" class="sr-only"></label><button type="button" class="btn sm ghost" data-act="welcome">Got it</button></div></section>`;
}

export default {
  head(M) {
    const h = now().getHours(), name = (M.st.player || 'there').split(' ')[0];
    return {
      eyebrow: raw(esc(fmtLong(M.t)) + (M.journey.num ? ' · Day ' + M.journey.num + ' of ' + M.journey.days : '')),
      title: esc(greeting(h) + ', ' + name),
      sub: raw(esc(M.act) + ' · <span class="quote">“' + esc(M.quote) + '”</span>'),
      actions: raw('<a class="btn" href="#/study-plan">' + icon('calcheck') + 'Today’s plan</a><button type="button" class="btn primary" data-act="quicklog">' + icon('logbook') + '10 PM log</button>')
    };
  },
  render(M) {
    const B = blockState(M);
    const wk = promptWeek(M.t);
    const review = wk ? html`<section class="notice review-prompt" role="region" aria-label="Week in review">${icon('analytics')}<div class="grow"><p><b>Your week in review is ready</b> · ${fmtDS(wk)} – ${fmtDS(addDays(wk, 6))}</p><p class="muted">Hours, chapters, papers and mistakes against last week, with one focus for next week.</p></div><div class="row wrap"><button type="button" class="btn sm primary" data-act="review">Open the review</button><button type="button" class="btn sm ghost" data-act="review-later">Not now</button></div></section>` : '';
    return html`${welcome(M)}${review}
      <div class="grid dash-r1">${countdown(M)}${timetableCard(M, B)}</div>
      <div class="grid dash-r2"><div class="meters span-8">${targetMeters(M)}</div>${nextUp(M, B)}</div>
      <div class="grid dash-r3">${planCard(M)}${logCard(M)}${runCard(M)}</div>
      ${kpiRow(M)}
      <div class="grid">${arcCard(M)}${milestonesCard(M)}</div>`;
  },
  actions: {
    'arc-toggle': (el) => { const k = todayStr(), h = arc.config().habits.find((x) => x.id === el.dataset.id); if (h) arc.setVal(k, h, arc.val(k, h) >= 1 ? 0 : 1); },
    'arc-step': (el) => { const k = todayStr(), h = arc.config().habits.find((x) => x.id === el.dataset.id); if (h) arc.setVal(k, h, Math.max(0, arc.r2(arc.val(k, h) + (+el.dataset.dir) * h.step))); }
  },
  changes: {
    import: async (el) => {
      const f = el.files && el.files[0]; if (!f) return;
      try {
        const o = JSON.parse(await f.text());
        const res = await store.importBackup(o, f.name);
        store.setMeta('welcomeDismissed', true);
        toast(res.full ? 'Backup restored · everything replaced' : 'Original tracker progress imported', { icon: 'checkCircle', ms: 4000 });
      } catch (e) { toast(e.message || 'That file couldn’t be read.', { tone: 'bad', ms: 5000 }); }
      el.value = '';
    }
  }
};
