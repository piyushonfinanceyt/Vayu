/* Dashboard, the Today cockpit. It answers "what do I do right now?"
   On top, four key numbers: the countdown to Paper 1 (hero), R1 chapters against the plan, the pass outlook, this week.
   Then three bands, each a jump-bar section:
   Now: What now? and Next up, beside today's timetable with a live "now" line.
   Today: today's study (the day's goal and its to-do list, block by block), the four target meters, the 10 PM log,
   today's run, the Winter Arc habits.
   Progress: Can I finish?, the next milestones, level, streak and badges (and Piyush on Finance from 13 Jan).
   Customise hides cards and changes their order within a band (dashlayout.js, saved on this device). */
import { html, raw, esc, fmt1, fmtN, fmtD, fmtDS, fmtDL, fmtLong, plural, mmss, pct, diff, addDays, mondayOf, nowMin, fmtClock, greeting, now, typeName, clamp01, todayStr } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, status, ring, meter, empty, linkBtn, toast } from '../components.js';
import { spot, miniBars } from '../charts.js';
import { recSeg, numField, hoursStepper, bind, dayStatusChip } from './parts.js';
import * as store from '../store.js';
import * as arc from '../arc.js';
import * as pwa from '../pwa.js';
import { promptWeek } from '../weekly.js';
import { whatNow } from '../whatnow.js';
import { hoursCheck } from '../hours.js';
import * as sync from '../sync.js';
import { contentCard } from './insights.js';
import { BANDS, bandCells, isShown } from '../dashlayout.js';
import { replan, PACES, paceNow } from '../replan.js';
import { blockState, studyPlan, noHrs, dur, shortGoal, midSentence } from '../studyday.js';

// ---------- the four key numbers ----------
function summary(M) {
  const at = M.examAt, ms = Math.max(0, at - now()), s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const J = M.journey, st = M.st, syl = diff(M.t, st.syllabusDeadline), fin = diff(M.t, J.finish);
  const sylPos = clamp01(diff(J.start, st.syllabusDeadline) / J.days) * 100, finPos = clamp01(diff(J.start, J.finish) / J.days) * 100;
  const two = (v) => String(v).padStart(2, '0');
  const cd = html`<div class="tile hero ds-cd" role="group" aria-label="Countdown to Paper 1">
    <span class="lbl ds-cd-top"><span class="row" style="gap:6px">${icon('cap')}Paper 1 · Accounts</span><span>${fmtD(st.examDate)} · ${fmtClock(at.getHours() * 60 + at.getMinutes())}</span></span>
    <span class="ds-cd-main"><span class="value"><span data-count="${d}">${d}</span><small> ${d === 1 ? 'day' : 'days'} to go</small></span>
      <span class="ds-clock num" role="timer" aria-label="${d} days, ${h} hours and ${m} minutes to Paper 1" data-cd-at="${at.getTime()}"><b data-cd="h">${two(h)}</b>h <b data-cd="m">${two(m)}</b>m <b data-cd="s">${two(sec)}</b>s</span></span>
    <div class="jtrack" role="img" aria-label="${J.num ? 'Day ' + J.num + ' of ' + J.days : 'Journey'}, ${Math.round(J.elapsed * 100)}% of the journey gone"><i style="width:${(J.elapsed * 100).toFixed(1)}%"></i><b style="left:${sylPos.toFixed(1)}%" title="R1 deadline"></b><b style="left:${finPos.toFixed(1)}%" title="Finish line"></b></div>
    <span class="tile-foot"><span>${J.num ? html`Day <b>${J.num}</b> of ${J.days}` : M.t < J.start ? 'Day 1 on ' + fmtDS(J.start) : 'Journey complete'}</span><span>${syl > 0 ? 'R1 deadline in ' + plural(syl, 'day') : syl === 0 ? 'R1 deadline today' : fin > 0 ? 'Finish line in ' + plural(fin, 'day') : 'Final look and exams'}</span></span></div>`;
  const K = M.kpi, sylExp = M.EXP.syllabus(M.t) / 100, gap = K.syllabus.pct - sylExp, behind = Math.max(1, Math.round(-gap * K.syllabus.total));
  const tone = gap >= 0 ? 'good' : gap >= -0.08 ? 'warn' : 'bad';
  const r1 = html`<a class="tile" href="#/subjects"><span class="lbl">${icon('book')}R1 chapters</span><span class="value"><span data-count="${K.syllabus.done}">${K.syllabus.done}</span><small> / ${K.syllabus.total}</small></span>
    ${meter(K.syllabus.pct, { thin: true, target: sylExp, targetLabel: 'expected by today', label: 'Chapters done against the plan' })}
    <span class="tile-foot"><span class="tone ${tone}">${icon(gap >= 0 ? 'check' : 'alert')}${gap >= 0 ? 'On pace' : behind + ' behind plan'}</span></span></a>`;
  const O = M.outlook, known = O.papers.filter((p) => p.seen), at40 = known.filter((p) => p.likely >= 40).length, w = O.weakest;
  const pass = html`<a class="tile" href="#/mocks"><span class="lbl">${icon('gauge')}Will I pass?</span>
    ${known.length ? html`<span class="value"><span data-count="${at40}">${at40}</span><small> / ${O.papers.length} at 40+</small></span>` : html`<span class="value">–</span>`}
    <span class="tile-foot">${w ? html`<span class="tone ${w.low < 40 ? 'warn' : ''}">${icon(w.low < 40 ? 'alert' : 'info')}Weakest: ${w.code} · likely ${w.likely}</span>` : known.length ? html`<span class="tone good">${icon('check')}No paper below 40</span>` : html`<span>Enter mock marks to see it</span>`}</span></a>`;
  const ws = mondayOf(M.t), wd = []; for (let i = 0; i < 7; i++) wd.push(addDays(ws, i));
  const vals = wd.map((x) => (x <= M.t ? M.hoursOn(x) : null)), tgts = wd.map((x) => (M.dayByDate[x] ? M.dayByDate[x].target : 0));
  const week = html`<a class="tile" href="#/analytics"><span class="lbl">${icon('clock')}This week</span><span class="value"><span data-count="${Math.round(K.week.hrs * 10) / 10}" data-dec="1">${fmt1(K.week.hrs)}</span><small> / ${fmt1(K.week.target)} h</small></span>
    <span class="wk-bars ds-bars">${miniBars(vals, tgts, diff(ws, M.t), { w: 132, h: 28 })}</span>
    <span class="tile-foot"><span>${K.week.delta >= 0 ? '+' : '−'}${fmt1(Math.abs(K.week.delta))} h vs last week</span></span></a>`;
  return html`<div class="dsum">${cd}${r1}${pass}${week}</div>`;
}

function timetableCard(M, B) {
  const d = M.todayDay;
  if (!d) return card({ cls: 'span-8 tt-card', title: 'Today’s timetable', icon: 'clock', body: empty(M.t < M.FIRST ? 'The plan starts on ' + fmtDL(M.FIRST) + '.' : 'The plan is complete. Every block is behind you.', '', 'calendar') });
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
// "Can I finish?": hours needed against hours left, from your real pace (hours.js)
function hoursCard(M) {
  const H = hoursCheck(M, store.list('sessions'));
  if (!H) return '';
  const h = (x) => Math.round(x), late = H.finish ? (H.afterExam ? 'after the exam' : fmtDS(H.finish)) : '';
  const tag = H.verdict === 'short' ? status('Not enough hours', 'bad') : H.verdict === 'core' ? status('Core only', 'warn') : H.onPace ? status('On pace', 'good') : status('Pace too low', 'warn');
  const say = H.verdict === 'fits' ? 'Everything fits the plan’s hours.' : H.verdict === 'core' ? 'All of it doesn’t fit, but the core does: ' + plural(H.core, 'chapter') + ', ' + h(H.coreNeed) + ' h. That’s the HIGH chapters, plus enough of each paper to reach 40% of its hours.' : 'Even the core of ' + plural(H.core, 'chapter') + ' needs ' + h(H.coreNeed) + ' h, more than the ' + h(H.available) + ' h the plan gives.';
  const rate = H.recent > 0 ? 'At your last 7 days’ rate, it ends ' + late + '.' : 'No hours logged in the last 7 days.';
  const paceTxt = H.source === 'plan' ? 'plan estimates' : (H.pace >= 1 ? 'you run ' + H.pace.toFixed(1) + '× estimates' : 'you take ' + (1 / H.pace).toFixed(1) + '× estimates');
  return card({
    cls: 'hours-card', id: 'hours-check', title: 'Can I finish?', icon: 'gauge', sub: (H.isR1 ? 'R1 by ' : 'R1 by the end of revision, ') + fmtDS(H.until) + ' · ' + plural(H.days, 'day') + ' left', actions: tag,
    body: html`<div class="hc-nums">
        <div><span class="lbl">Hours needed</span><b>${h(H.need)}</b><small>${plural(H.open, 'chapter')} · ${paceTxt}</small></div>
        <div><span class="lbl">Hours available</span><b>${h(H.available)}</b><small>your targets${H.papers ? ', less ' + plural(H.papers, 'full paper') : ''}</small></div>
        <div><span class="lbl">Needed a day</span><b>${fmt1(H.perDay)}</b><small>you’re averaging ${fmt1(H.recent)}</small></div></div>
      <div class="hbar" role="img" aria-label="${'Hours available cover ' + Math.min(100, Math.round((H.available / H.need) * 100)) + '% of the hours needed'}"><i class="on" style="width:${Math.min(100, (H.available / H.need) * 100).toFixed(1)}%"></i></div>
      <p class="hc-say">${say} ${rate}</p>
      ${H.sepOpen ? html`<p class="hint">${plural(H.sepOpen, 'chapter')} you covered in September count in full. Mark one done if it doesn’t need R1 again.</p>` : ''}
      ${H.verdict !== 'fits' ? html`<a class="btn sm ghost" href="#/study-plan">Open Catch up${icon('arrowR')}</a>` : ''}
      ${syncLine()}`
  });
}
// whether this device is up to date with the others: these numbers come from what's saved here
function syncLine() {
  if (!sync.connected()) return html`<p class="hc-sync off">${icon('cloudOff')}<span>Sync is off on this device, so these numbers use only what’s saved here. <a href="#/settings">Turn it on</a></span></p>`;
  const bad = sync.needsYou();
  return html`<p class="hc-sync ${bad ? 'bad' : ''}">${icon(bad ? 'alert' : 'sync')}<span data-sync-ago>${sync.statusText()}</span>${bad ? html`<a href="#/settings">Fix it</a>` : html`<button type="button" class="btn link" data-act="sync-refresh">Sync now</button>`}</p>`;
}
function whatNowCard(M, W) {
  const T = W.top;
  return html`<section class="wn" aria-label="What now?"><span class="wn-ic">${icon(T.icon)}</span>
    <div class="wn-main"><span class="lbl">What now?</span><b>${T.title}</b><small>${T.why}</small></div>
    ${T.start ? html`<button type="button" class="btn wn-go" data-act="now-go" data-id="${T.id}">${icon(T.focus ? 'play' : 'arrowR')}${T.start}</button>` : ''}
    ${W.also.length ? html`<div class="wn-alt"><span>Or</span>${W.also.map((x) => html`<button type="button" class="btn link" data-act="now-go" data-id="${x.id}">${x.title}</button>`)}</div>` : ''}</section>`;
}
// `same`: What now?'s title; Next up stays out of the way when it would only repeat it
function nextUp(M, B, same) {
  const t = M.t, n = B.n, d = M.todayDay;
  const mk = M.mocks.find((x) => x.date === t && x.status !== 'skipped');
  let lbl = 'Next up', title, sub, act;
  if (mk && mk.marks == null && n >= 17 * 60) { title = 'Enter the marks for mock #' + mk.id; sub = 'P' + M.WMAP[mk.subject].paper + ' ' + mk.subject + ' · ' + mk.bossName + ' · target ' + Math.round(mk.target * 100); act = html`<a class="btn primary" href="#/mocks?id=${mk.id}">${icon('edit')}Enter marks</a>`; }
  else if (d && !d.logged && n >= 21 * 60) { title = 'Fill in tonight’s 10 PM log'; sub = 'Hours, pages, steps, push-ups, workout and meals'; act = html`<button type="button" class="btn primary" data-act="quicklog">${icon('logbook')}Open the 10 PM log</button>`; }
  else if (B.cur && (B.cur.kind === 'study' || B.cur.kind === 'mock' || B.cur.kind === 'revision')) { lbl = 'Now · until ' + fmtClock(B.cur.end); title = B.cur.label + ' · ' + B.cur.title; sub = B.next ? 'Then ' + B.next.label + ' at ' + fmtClock(B.next.from) : 'Last block of the day'; act = html`<button type="button" class="btn primary" data-act="timer">${icon('timer')}Start the focus timer</button>`; }
  else if (B.next) { lbl = 'Next · ' + fmtClock(B.next.from); title = B.next.label + ' · ' + B.next.title; sub = 'In ' + fmtMinsLeft(B.next.from - n); act = B.next.kind === 'workout' ? html`<a class="btn primary" href="#/run-5k">${icon('activity')}Open the run plan</a>` : html`<button type="button" class="btn primary" data-act="timer">${icon('timer')}Focus timer</button>`; }
  else if (mk && mk.marks == null) { title = 'Enter the marks for mock #' + mk.id; sub = mk.subject + ' · ' + mk.bossName; act = html`<a class="btn primary" href="#/mocks?id=${mk.id}">${icon('edit')}Enter marks</a>`; }
  else { title = d && d.logged ? 'Day logged. Rest well.' : 'Log today before you sleep'; sub = M.quote; act = d && d.logged ? html`<a class="btn primary" href="#/study-plan?date=${addDays(t, 1)}">${icon('calcheck')}See tomorrow</a>` : html`<button type="button" class="btn primary" data-act="quicklog">${icon('logbook')}Open the 10 PM log</button>`; }
  if (same && String(title).trim().toLowerCase() === String(same).trim().toLowerCase()) return '';
  return html`<section class="card hero next-card span-4" aria-label="Next up"><span class="lbl">${icon('zap')} ${lbl}</span><p class="nu-title">${title}</p><p class="nu-sub">${sub}</p><div class="row wrap" style="margin-top:auto">${act}</div></section>`;
}
const fmtMinsLeft = (m) => (m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : '') : m + ' min');

// ---------- Today's study: the day's goal, then the to-do list block by block (grouping in studyday.js) ----------
function checkRow(M, it, opts = {}) {
  const t = M.t, lbl = (it.done ? 'Mark not done: ' : 'Mark done: ') + it.title;
  let ctl;
  if (it.kind === 'chapter') ctl = html`<button type="button" class="cbx" role="checkbox" aria-checked="${String(it.done)}" data-act="chapter-toggle" data-id="${it.chapterId}" aria-label="${lbl}">${icon('check')}</button>`;
  else if (it.kind === 'plan') ctl = html`<button type="button" class="cbx" role="checkbox" aria-checked="${String(it.done)}" data-act="plan-toggle" data-id="${it.taskId}" data-date="${t}" data-title="${it.title}" aria-label="${lbl}">${icon('check')}</button>`;
  else if (it.kind === 'workout') ctl = html`<button type="button" class="cbx" role="checkbox" aria-checked="${String(it.done)}" data-act="workout-toggle" data-date="${t}" aria-label="${lbl}">${icon('check')}</button>`;
  else if (it.kind === 'task') ctl = html`<button type="button" class="cbx" role="checkbox" aria-checked="${String(it.done)}" data-act="task-toggle" data-id="${it.taskId}" aria-label="${lbl}">${icon('check')}</button>`;
  else ctl = html`<a class="cbx" href="#/mocks?id=${it.mockId}" role="checkbox" aria-checked="${String(it.done)}" aria-label="${it.title}: ${it.done ? 'marks entered' : 'enter marks'}">${icon('check')}</a>`;
  // the revision dose reads as two lines: the timed sets, then the marking
  let parts = it.kind === 'plan' && it.cat === 'Revision' ? String(it.title).split(' · ') : [it.title];
  let small = opts.brief ? '' : it.kind === 'task' ? [it.cat, it.est ? dur(it.est) : ''].filter(Boolean).join(' · ') : it.kind === 'plan' ? [parts.slice(1).join(' · '), it.sub].filter(Boolean).join(' · ') : it.kind === 'mock' ? it.sub : it.status === 'progress' ? 'In progress' : '';
  // a quest whose first line is already the group's heading shows what's under it instead
  if (it.kind === 'plan' && opts.head && noHrs(parts[0]).replace(/:$/, '').endsWith(opts.head)) { parts = [it.sub || 'Done with this block']; small = ''; }
  return html`<li class="check ${it.done ? 'done' : ''}">${ctl}<span class="li-main"><b>${parts[0]}</b>${small ? html`<small>${small}</small>` : ''}</span>${it.priority === 'high' ? html`<span class="prio p-high">HIGH</span>` : ''}</li>`;
}
// Overdue rescue: the catch-up planner's answer where the day's study is (replan.js, at the pace picked in Catch up).
// Shows while any chapter is overdue: how many and how much plan time, where they'd go, and one tap to use the dates.
function rescue(M) {
  if (!M.overdueCount) return '';
  const pace = paceNow(), R = replan(M, pace), dl = fmtDS(R.deadline);
  const hrs = M.chapters.filter((c) => c.flag === 'overdue').reduce((a, c) => a + (+c.hrs || 0), 0);
  const late = R.pastDeadline && R.finish ? diff(R.deadline, R.finish) : 0;
  const at = pace === 1 ? '' : ' at ' + (PACES.find((p) => p[0] === pace) || [0, ''])[1] + ' pace';
  const say = !R.moves.length ? 'No better dates at this pace. Catch up has slower paces to try.'
    : R.mode === 'fold' ? 'They fit into the room left on lighter days and the buffer day. Nothing else moves, and R1 still ends by ' + fmtDS(R.finish) + ' (deadline ' + dl + ').'
    : R.fits ? 'New dates' + at + ' for ' + plural(R.moves.length, 'chapter') + ', and R1 still ends by ' + fmtDS(R.finish) + ' (deadline ' + dl + ').'
    : 'New dates' + at + ' for ' + plural(R.moves.length, 'chapter') + ', but R1 ends ' + (R.finish ? fmtDS(R.finish) + ', ' + plural(late, 'day') + ' after the ' + dl + ' deadline' : 'after the exam') + ': ' + R.pastDeadline + ' of them land in the revision days after it.' + (R.nowhere.length ? ' ' + plural(R.nowhere.length, 'chapter') + (R.nowhere.length === 1 ? ' doesn’t' : ' don’t') + ' fit before the exam at all.' : '');
  // where the moved chapters land: the first four days
  const ids = new Set(R.moves.map((m) => String(m.id)));
  const land = R.days.map((x) => [x.date, x.ids.filter((id) => ids.has(String(id))).length]).filter((x) => x[1]);
  return html`<div class="notice sd-rescue ${R.fits ? '' : 'warn'}" role="region" aria-label="Overdue chapters">${icon('alert')}
    <div class="grow"><p><b>${plural(M.overdueCount, 'chapter')} overdue</b> · ${fmt1(hrs)} h of plan time</p><p class="sd-say">${say}</p>
      ${land.length ? html`<p class="sd-land"><span class="lbl">Where they go</span>${land.slice(0, 4).map(([dt, n]) => html`<span><b>${dt === M.t ? 'Today' : fmtDS(dt)}</b> +${n}</span>`)}${land.length > 4 ? html`<span>+ ${plural(land.length - 4, 'more day')}</span>` : ''}</p>` : ''}</div>
    <div class="sd-rescue-act">${R.moves.length ? html`<button type="button" class="btn primary sm" data-act="replan-apply">${icon('calcheck')}Use these dates</button>` : ''}<a class="btn ghost sm" href="#/study-plan?catchup=1">Details${icon('arrowR')}</a></div></div>`;
}
function studyCard(M, S) {
  const d = M.todayDay, r = d ? d.rec : store.dayRec(M.t), hrs = +r.hrs || 0, tgt = d ? d.target : 0;
  const chOf = (it) => (it.kind === 'chapter' ? M.chapters.find((c) => c.id === it.chapterId) : null);
  const grp = (g) => {
    const n = g.items.filter((i) => i.done).length, next = g.items.map(chOf).find((c, i) => c && !g.items[i].done);
    return html`<div class="sd-grp${n === g.items.length ? ' all' : ''}"><div class="sd-grp-h"><span class="li-main">${g.tag ? html`<span class="lbl">${g.tag}</span>` : ''}<b>${g.title}</b></span>
      <span class="sd-n">${n === g.items.length ? html`<span class="tone good">${icon('check')}Done</span>` : n + ' / ' + g.items.length}</span>
      ${next ? html`<button type="button" class="icon-btn sm" data-act="focus" data-subject="${next.subject}" data-chapter="${next.id}" aria-label="Deep focus on ${next.name}" title="Deep focus on ${next.name}">${icon('play')}</button>` : ''}</div>
      <ul>${g.items.map((it) => checkRow(M, it, { head: g.title }))}</ul></div>`;
  };
  // the goal in one line, from each block's short name: "Audit R1, Accounts R1, then timed writing and marking"
  const names = [...new Set(S.groups.map((g) => shortGoal(g.title)))].map((s, i) => (i ? midSentence(s) : s));
  const say = names.length > 1 ? names.slice(0, -1).join(', ') + ', then ' + names[names.length - 1] : names[0] || 'Study ' + fmt1(tgt) + ' h';
  const goal = d ? html`<div class="sd-goal"><div class="sd-goal-t"><span class="lbl">Today’s goal · ${fmt1(tgt)} h${S.total ? ' · ' + plural(S.total, 'task') : ''}</span><b>${say}</b></div>
      <span class="sd-goal-n small">${r.hrs == null && !hrs ? 'No hours logged yet' : hrs >= tgt ? html`<span class="tone good">${icon('check')}${fmt1(hrs)} h studied</span>` : html`<b>${fmt1(hrs)} h</b> studied · ${fmt1(tgt - hrs)} h to go`}</span>
      ${meter(tgt ? hrs / tgt : 0, { tone: hrs >= tgt && tgt ? 'good' : '', label: fmt1(hrs) + ' of ' + fmt1(tgt) + ' hours studied today' })}</div>` : '';
  return card({
    cls: 'study-card', id: 'today-study', title: 'Today’s study', icon: 'book', sub: d ? d.label + ' · ' + (d.ramp ? d.ramp.name : d.phase) : 'Outside the plan',
    actions: S.total ? html`<span class="row" style="gap:8px">${ring(S.done / S.total, { size: 36, stroke: 4, label: S.done + ' of ' + S.total + ' study tasks done' })}<span class="small"><b>${S.done}</b> / ${S.total}</span></span>` : '',
    body: S.total || S.also.length ? html`${rescue(M)}${goal}${S.groups.length ? html`<div class="sd-groups">${S.groups.map(grp)}</div>` : empty('No study planned for today.', html`<a class="btn sm" href="#/study-plan">Open the plan</a>`, 'book')}
      ${S.also.length ? html`<div class="sd-also"><span class="lbl">Also today</span><ul>${S.also.map((it) => checkRow(M, it, { brief: true }))}</ul></div>` : ''}` : html`${rescue(M)}${empty('Nothing planned for today.', html`<a class="btn sm" href="#/study-plan">Open the plan</a>`, 'calcheck')}`,
    foot: html`${M.overdueCount ? html`<a class="chip bad" href="#/subjects?flag=overdue">${icon('alert')}See the ${plural(M.overdueCount, 'overdue chapter')}</a>` : ''}<span class="grow"></span>${'speechSynthesis' in window ? html`<button type="button" class="btn sm ghost" data-act="brief" title="Read today out loud · P" aria-keyshortcuts="P">${icon('volume')}Brief me<span class="kbd kbd-hint" aria-hidden="true">P</span></button>` : ''}<a class="btn sm ghost" href="#/study-plan">Mission briefing${icon('arrowR')}</a>`
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

// ---------- Progress: level, streak and badges ----------
function rankTiles(M) {
  const K = M.kpi, rankName = String(M.rank ? M.rank.name : '').replace(/^\S+\s/, ''), nextName = M.nextRank ? String(M.nextRank.name).replace(/^\S+\s/, '') : '';
  const nb = M.badges.length, left = nb - M.badgeCount;
  return html`<div class="tiles rank-tiles">
    <a class="tile hero" href="#/winter-arc"><span class="lbl">${icon('award')}Level and rank</span><span class="value">Level ${M.level}<small> · ${rankName}</small></span>
      ${meter(M.lvProg, { label: 'XP to the next level' })}
      <span class="tile-foot"><span>${fmtN(M.xp)} XP · ${fmtN(M.lvNext - M.xp)} to level ${M.level + 1}</span>${nextName ? html`<span>· ${nextName} at level ${M.nextRank.level}</span>` : ''}</span></a>
    <a class="tile" href="#/winter-arc"><span class="lbl">${icon('flame')}Study streak</span><span class="value"><span data-count="${K.streak.cur}">${K.streak.cur}</span><small> ${K.streak.cur === 1 ? 'day' : 'days'}</small></span>
      ${meter(K.streak.pct, { label: 'Streak towards the next milestone' })}
      <span class="tile-foot"><span>Best ${K.streak.best} · next milestone ${K.streak.next} days</span></span></a>
    <a class="tile" href="#/winter-arc"><span class="lbl">${icon('trophy')}Badges</span><span class="value"><span data-count="${M.badgeCount}">${M.badgeCount}</span><small> / ${nb}</small></span>
      ${meter(M.badgeCount / Math.max(1, nb), { label: 'Badges unlocked' })}
      <span class="tile-foot"><span>${left ? plural(left, 'badge') + ' still to unlock' : 'Every badge unlocked'}</span></span></a>
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
      actions: raw('<a class="btn" href="#/study-plan">' + icon('calcheck') + 'Today’s plan</a><button type="button" class="btn" data-act="focus">' + icon('target') + 'Deep focus</button><button type="button" class="btn primary" data-act="quicklog">' + icon('logbook') + '10 PM log</button>')
    };
  },
  render(M) {
    const B = blockState(M);
    const wk = promptWeek(M.t);
    const review = wk ? html`<section class="notice review-prompt" role="region" aria-label="Week in review">${icon('analytics')}<div class="grow"><p><b>Your week in review is ready</b> · ${fmtDS(wk)} – ${fmtDS(addDays(wk, 6))}</p><p class="muted">Hours, chapters, papers and mistakes against last week, with one focus for next week.</p></div><div class="row wrap"><button type="button" class="btn sm primary" data-act="review">Open the review</button><button type="button" class="btn sm ghost" data-act="review-later">Not now</button></div></section>` : '';
    const W = whatNow(M, nowMin()), wnOn = isShown('whatnow'), S = studyPlan(M, B);
    const parts = {
      whatnow: whatNowCard(M, W), next: nextUp(M, B, wnOn ? W.top.title : ''), timetable: timetableCard(M, B),
      meters: html`<div class="meters">${targetMeters(M)}</div>`, plan: studyCard(M, S), log: logCard(M), run: runCard(M), arc: arcCard(M),
      finish: hoursCard(M), coming: milestonesCard(M), rank: rankTiles(M), content: contentCard(M)
    };
    const meta = {
      now: esc(fmtClock(B.n) + ' · ' + (B.cur ? B.cur.label + ' until ' + fmtClock(B.cur.end) : B.next ? 'free until ' + fmtClock(B.next.from) : 'day done')),
      today: S.total ? esc(S.done + ' of ' + S.total + ' study tasks done') : '',
      progress: '<a href="#/analytics">Analytics' + icon('arrowR') + '</a>'
    };
    const bands = BANDS.map(([b, name]) => {
      const cells = bandCells(b, parts);
      return cells ? '<section class="band" data-jump="' + name + '" aria-labelledby="band-' + b + '"><div class="band-h"><h2 id="band-' + b + '">' + name + '</h2>' + (meta[b] ? '<span class="band-meta">' + meta[b] + '</span>' : '') + '</div><div class="grid band-g">' + cells + '</div></section>' : '';
    }).join('');
    return html`${welcome(M)}${review}${isShown('summary') ? summary(M) : ''}${raw(bands)}
      <div class="dash-foot"><button type="button" class="btn ghost sm" data-act="dash-customise">${icon('grid')}Customise the dashboard</button></div>`;
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
