/* Hyper study mode (P): one full screen for the study day, with the rest of the app out of the way.
   - Timer: a session on the paper and chapter picked in Subjects (or general study) for 25, 50 or 90 minutes
     (your timer lengths), then pause, "Lost focus", end early or a 5-minute break. It is the same deep focus
     timer as everywhere else (timer.js): the minutes go to today's study hours, and a finished session opens
     the usual completion screen on top (focus.js).
   - Subjects: the six papers with R1 chapters done and this week's focus time; the chosen paper's chapters
     (today's first, then in progress, overdue and next) to tick off, tap to pick for the next session, or ▶ to
     start one on right away.
   - Today's goal: the day's hours against the target, the running session's minutes shown as they build, and its
     study to-do list (studyday.js); today's run when one is planned (log the km and time here); push-ups with
     +5 / +10 / +20.
   - Days left: a live countdown to Paper 1, the journey day and the R1 deadline.
   While a session is on, the top bar carries a small timer on narrower screens and the browser tab shows the
   time left. P, Esc or Exit leaves; Space starts or pauses the timer; F full screen; B a 5-minute break;
   following a link leaves too. It stays open through a
   reload (pref 'hyper') and keeps the screen awake where the browser allows it. Menus, dialogs, toasts, the
   voice caption and the deep focus screens sit above it; the app underneath is inert while it is open. */
import { html, raw, esc, fmt1, fmtN, fmtD, fmtDS, fmtMins, fmtClock, plural, mmss, diff, nowMin, now, clamp01, sortBy } from './util.js';
import { icon } from './icons.js';
import { confirm, toast } from './components.js';
import { pref, setPref } from './prefs.js';
import * as store from './store.js';
import * as timer from './timer.js';
import { model } from './model.js';
import { weekBySubject } from './focus.js';
import { blockState, studyPlan, noHrs, shortGoal, midSentence } from './studyday.js';

const C = 2 * Math.PI * 120;
let el = null, unsub = null, clockT = 0, soonT = 0, lock = null, pending = false, prevFocus = null, blockKey = '';
let curName = '', baseTitle = '', shownTitle = '', askedTitle = '', popped = null, fsMine = false, titleObs = null;

export const isOpen = () => !!el;

// ---------- what the next session is on: today's pick, else the first open chapter planned for today ----------
function pick(M) {
  const p = pref('hyperPick');
  if (p && p.date === M.t && (p.kind === 'general' || M.WMAP[p.subject])) return p;
  const it = M.focus.items.find((i) => i.kind === 'chapter' && !i.done), ch = it ? M.chapters.find((c) => c.id === it.chapterId) : null;
  const fs = pref('focusSubject');
  return { date: M.t, kind: 'subject', subject: ch ? ch.subject : M.WMAP[fs] ? fs : 'Accounts', chapterId: ch ? ch.id : '' };
}
const setPick = (M, o) => { setPref('hyperPick', Object.assign({}, pick(M), o, { date: M.t })); render(); };
const lengths = (M) => { const st = M.st.timer || {}; return [...new Set([+st.pomodoro || 25, +st.deep || 50, 90])].sort((a, b) => a - b); };
const minutes = (M) => { const L = lengths(M), m = +pref('hyperMinutes', pref('focusMinutes', 50)); return L.includes(m) ? m : L[Math.min(1, L.length - 1)]; };
const label = (M, f) => {
  if (!f || f.kind !== 'subject') return { name: 'General study', sub: 'Any paper', c: 'var(--ink-3)' };
  const w = M.WMAP[f.subject] || {}, ch = f.chapterId ? M.chapters.find((c) => String(c.id) === String(f.chapterId)) : null;
  return { name: (w.code ? w.code + ' ' : '') + (w.short || f.subject), sub: ch ? '#' + ch.id + ' ' + ch.name : 'Any chapter', c: w.c || 'var(--ink)' };
};
const live = () => timer.running() || timer.state().remaining != null;
const endsAt = (s) => { const e = new Date(s.endsAt); return fmtClock(e.getHours() * 60 + e.getMinutes()); };
// minutes of the focus session on now (they reach today's hours when it ends)
const sessionMins = () => { const s = timer.state(); return live() && timer.MODES[s.mode].focus ? Math.max(0, Math.floor((s.dur - timer.remaining()) / 60)) : 0; };

// ---------- 1. timer ----------
function timerPanel(M, P) {
  const s = timer.state(), on = live(), run = timer.running(), isBreak = on && !timer.MODES[s.mode].focus;
  const L = on ? (s.deep ? label(M, s.focus) : { name: timer.MODES[s.mode].label, sub: isBreak ? 'Stand up, drink water, rest your eyes' : 'Counts towards today’s study hours', c: 'var(--on-hero-2)' }) : label(M, P);
  const N = label(M, P), next = on && (N.name + N.sub !== L.name + L.sub) ? N : null;   // picked in Subjects for after this one
  const mins = minutes(M), r = on ? timer.remaining() : mins * 60, dur = on ? s.dur : mins * 60, off = (C * (1 - r / dur)).toFixed(2);
  const today = store.list('sessions').filter((x) => x.date === M.t && timer.MODES[x.mode] && timer.MODES[x.mode].focus), fm = today.reduce((a, x) => a + (+x.minutes || 0), 0);
  const ctl = !on
    ? html`<div class="seg" role="group" aria-label="Session length">${lengths(M).map((n) => html`<button type="button" id="${'hy-len-' + n}" data-hy="len" data-v="${n}" aria-pressed="${String(n === mins)}">${n} min</button>`)}</div>
      <div class="hy-ctl"><button type="button" class="btn primary" id="hy-go" data-hy="go">${icon('play')}Start ${mins} min</button><button type="button" class="btn" id="hy-break" data-hy="break">${icon('timer')}5-min break</button></div>`
    : isBreak
      ? html`<div class="hy-ctl"><button type="button" class="btn primary" id="hy-toggle" data-hy="toggle">${icon(run ? 'pause' : 'play')}${run ? 'Pause' : 'Resume'}</button><button type="button" class="btn" id="hy-skip" data-hy="skip">${icon('arrowR')}Skip the break</button></div>`
      : html`<div class="hy-ctl">${s.deep ? html`<button type="button" class="btn" id="hy-lost" data-hy="lost">${icon('wave')}Lost focus${+s.distractions ? ' · ' + s.distractions : ''}</button>` : ''}<button type="button" class="btn primary" id="hy-toggle" data-hy="toggle">${icon(run ? 'pause' : 'play')}${run ? 'Pause' : 'Resume'}</button><button type="button" class="btn" id="hy-end" data-hy="end">${icon('stop')}End</button></div>`;
  return html`<section class="hy-panel hy-timer" aria-labelledby="hy-h-timer">
    <div class="hy-ph"><h2 id="hy-h-timer">${icon('timer')}Timer</h2><span class="hy-state">${on ? (run ? (isBreak ? 'On a break' : 'In focus') : 'Paused') : 'Ready'}</span></div>
    <div class="hy-tbody">
      <div class="hy-what"><b><i class="dot" style="--c:${L.c}"></i>${L.name}</b><span>${L.sub}</span></div>
      <div class="hy-ring${run ? ' on' : ''}"><svg viewBox="0 0 280 280" aria-hidden="true"><circle cx="140" cy="140" r="120" fill="none" stroke="var(--hero-track)" stroke-width="8"/><circle ${raw(on ? 'data-timer-ring data-c="' + C.toFixed(2) + '"' : '')} cx="140" cy="140" r="120" fill="none" stroke="var(--on-hero)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${on ? off : 0}" transform="rotate(-90 140 140)"/></svg>
        <div class="hy-time"><span ${raw(on ? 'data-timer-text' : '')} role="timer" aria-live="off">${mmss(r)}</span><small>${on ? (run ? 'ends ' + endsAt(s) : 'paused') : 'minutes'}</small></div></div>
      ${ctl}
      ${next ? html`<p class="hy-next"><span>Next</span> ${next.name}${next.sub !== 'Any chapter' && next.sub !== 'Any paper' ? ' · ' + next.sub : ''}</p>` : ''}
      <p class="hy-sess">${today.length ? 'Today · ' + plural(today.length, 'session') + ' · ' + fmtMins(fm) + ' focused' : 'No focus sessions yet today'}<span class="kbd-hint" aria-hidden="true"> · <kbd class="kbd">Space</kbd> ${!on ? 'starts' : run ? 'pauses' : 'resumes'}</span></p>
    </div></section>`;
}

// ---------- 2. subjects ----------
function chapterList(M, subject) {
  const t = M.t, ch = M.chapters.filter((c) => c.subject === subject);
  const todays = ch.filter((c) => c.planned === t), rank = (c) => (c.status === 'progress' ? 0 : c.flag === 'overdue' ? 1 : 2);
  const rest = sortBy(ch.filter((c) => c.status !== 'done' && c.planned !== t), (c) => rank(c) + '|' + c.planned);
  // what's still to do first (today's, in progress, overdue, next), then today's finished ones to untick if needed
  return todays.filter((c) => c.status !== 'done').concat(rest).slice(0, 10).concat(todays.filter((c) => c.status === 'done'));
}
function subjectsPanel(M, P) {
  const wk = weekBySubject(M.t), list = chapterList(M, P.subject), w0 = M.worlds.find((w) => w.key === P.subject) || M.worlds[0];
  const on = live(), mins = minutes(M);
  const paper = (w) => {
    const sel = P.subject === w.key, fm = wk[w.key] || 0;
    const say = w.code + ' ' + w.short + ': ' + w.done + ' of ' + w.chapters + ' R1 chapters done' + (w.overdue ? ', ' + w.overdue + ' overdue' : '') + ', ' + (fm ? fmtMins(fm) : 'no') + ' focus this week';
    return html`<button type="button" class="hy-paper${w.overdue ? ' late' : ''}" id="${'hy-p-' + w.paper}" data-hy="paper" data-k="${w.key}" aria-pressed="${String(sel)}" aria-label="${say}" title="${say}">
      <span class="hy-paper-h"><i class="dot" style="--c:${w.c}"></i><b>${w.code}</b>${w.short}</span>${w.overdue ? html`<span class="hy-late" aria-hidden="true">${w.overdue}</span>` : ''}
      <span class="hy-bar" aria-hidden="true"><i style="width:${(clamp01(w.pct) * 100).toFixed(1)}%"></i></span>
      <span class="hy-paper-f" aria-hidden="true"><span>${w.done}/${w.chapters}</span><span>${icon('clock')}${fm ? fmtMins(fm) : '0m'}</span></span></button>`;
  };
  // tap a chapter's name to make it the next session; ▶ starts a session on it straight away
  const row = (c) => {
    const done = c.status === 'done', picked = !done && P.kind === 'subject' && String(P.chapterId) === String(c.id);
    const when = c.planned === M.t ? 'Today' : c.flag === 'overdue' ? 'Overdue · ' + fmtDS(c.planned) : fmtDS(c.planned);
    const meta = html`<b>${c.name}</b><small>${when}${c.status === 'progress' ? ' · in progress' : ''}${c.hrs ? ' · ' + fmt1(c.hrs) + ' h' : ''}</small>`;
    return html`<li class="check${done ? ' done' : ''}${picked ? ' aim' : ''}"><button type="button" class="cbx" role="checkbox" id="${'hy-cbx-' + c.id}" aria-checked="${String(done)}" data-act="chapter-toggle" data-id="${c.id}" aria-label="${(done ? 'Mark not done: ' : 'Mark done: ') + c.name}">${icon('check')}</button>
      ${done ? html`<span class="li-main">${meta}</span>` : html`<button type="button" class="li-main hy-pick" id="${'hy-pick-' + c.id}" data-hy="pick" data-id="${c.id}" aria-pressed="${String(picked)}" title="${picked ? 'Up next' : 'Make this the next session'}">${meta}</button>`}
      ${picked ? html`<span class="chip ink hy-nx">Next</span>` : ''}
      ${!done && !on ? html`<button type="button" class="icon-btn sm hy-play" id="${'hy-go-' + c.id}" data-hy="go-ch" data-id="${c.id}" aria-label="${'Start ' + mins + ' minutes on ' + c.name}" title="${'Start ' + mins + ' min on this'}">${icon('play')}</button>` : ''}</li>`;
  };
  return html`<section class="hy-panel hy-subj" aria-labelledby="hy-h-subj">
    <div class="hy-ph"><h2 id="hy-h-subj">${icon('book')}Subjects</h2><button type="button" class="tog hy-gen" id="hy-gen" data-hy="general" aria-pressed="${String(P.kind === 'general')}">General study</button></div>
    <div class="hy-papers" role="group" aria-label="Papers">${M.worlds.map(paper)}</div>
    <div class="hy-sub-h"><span class="lbl">${w0.code} ${w0.short} · chapters</span><span class="lbl">R1 ${w0.done} / ${w0.chapters}</span></div>
    <div class="hy-scroll" data-scroll="subj">${list.length ? html`<ul class="hy-list">${list.map(row)}</ul>` : html`<p class="hy-empty">${icon('checkCircle')}Every ${w0.short} chapter is done.</p>`}</div>
  </section>`;
}

// ---------- 3. today: goal, run, push-ups ----------
function itemRow(M, it, head) {
  const t = M.t, lbl = (it.done ? 'Mark not done: ' : 'Mark done: ') + it.title, id = 'hy-it-' + it.kind + '-' + String(it.taskId || it.chapterId || it.mockId || it.title).replace(/[^\w-]/g, '').slice(0, 40);
  let ctl;
  if (it.kind === 'chapter') ctl = html`<button type="button" class="cbx" role="checkbox" id="${id}" aria-checked="${String(it.done)}" data-act="chapter-toggle" data-id="${it.chapterId}" aria-label="${lbl}">${icon('check')}</button>`;
  else if (it.kind === 'plan') ctl = html`<button type="button" class="cbx" role="checkbox" id="${id}" aria-checked="${String(it.done)}" data-act="plan-toggle" data-id="${it.taskId}" data-date="${t}" data-title="${it.title}" aria-label="${lbl}">${icon('check')}</button>`;
  else if (it.kind === 'task') ctl = html`<button type="button" class="cbx" role="checkbox" id="${id}" aria-checked="${String(it.done)}" data-act="task-toggle" data-id="${it.taskId}" aria-label="${lbl}">${icon('check')}</button>`;
  else ctl = html`<a class="cbx" id="${id}" href="#/mocks?id=${it.mockId}" role="checkbox" aria-checked="${String(it.done)}" aria-label="${it.title}: ${it.done ? 'marks entered' : 'enter marks'}">${icon('check')}</a>`;
  let parts = it.kind === 'plan' && it.cat === 'Revision' ? String(it.title).split(' · ') : [it.title], small = it.kind === 'plan' ? parts.slice(1).join(' · ') : it.kind === 'mock' ? it.sub : it.status === 'progress' ? 'In progress' : '';
  if (it.kind === 'plan' && head && noHrs(parts[0]).replace(/:$/, '').endsWith(head)) { parts = [it.sub || 'Done with this block']; small = ''; }
  return html`<li class="check${it.done ? ' done' : ''}">${ctl}<span class="li-main"><b>${parts[0]}</b>${small ? html`<small>${small}</small>` : ''}</span>${it.priority === 'high' ? html`<span class="prio p-high">HIGH</span>` : ''}</li>`;
}
function goalPanel(M, S) {
  const d = M.todayDay, r = d ? d.rec : store.dayRec(M.t), hrs = +r.hrs || 0, tgt = d ? d.target : 0;
  const names = [...new Set(S.groups.map((g) => shortGoal(g.title)))].map((x, i) => (i ? midSentence(x) : x));
  const say = names.length > 1 ? names.slice(0, -1).join(', ') + ', then ' + names[names.length - 1] : names[0] || (d ? 'Study ' + fmt1(tgt) + ' h' : 'Nothing planned today');
  const hit = tgt && hrs >= tgt, sess = sessionMins(), w1 = clamp01(tgt ? hrs / tgt : 0), w2 = clamp01(tgt ? (hrs + sess / 60) / tgt : 0) - w1;
  const togo = Math.max(0, tgt - hrs - sess / 60);
  return html`<section class="hy-panel hy-goal" aria-labelledby="hy-h-goal">
    <div class="hy-ph"><h2 id="hy-h-goal">${icon('target')}Today’s goal</h2><span class="lbl">${d ? d.label : 'Outside the plan'}${S.total ? ' · ' + S.done + ' / ' + S.total + ' done' : ''}</span></div>
    <div class="hy-hrs"><b data-pop="hrs" data-v="${fmt1(hrs)}">${fmt1(hrs)}</b><span>/ ${fmt1(tgt)} h studied</span><span class="grow"></span>${sess ? html`<span class="chip ink" title="Added to today’s hours when the session ends">+${fmtMins(sess)} now</span>` : ''}${hit ? html`<span class="chip good">${icon('check')}Target hit</span>` : tgt ? html`<span class="chip">${togo ? fmt1(togo) + ' h to go' : 'Target in reach'}</span>` : ''}</div>
    <div class="meter ${hit ? 'good' : ''}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(w1 * 100)}" aria-label="${fmt1(hrs) + ' of ' + fmt1(tgt) + ' hours studied today' + (sess ? ', plus ' + plural(sess, 'minute') + ' in this session' : '')}"><i style="width:${(w1 * 100).toFixed(1)}%"></i>${w2 > 0 ? html`<i class="hy-pend" style="left:${(w1 * 100).toFixed(1)}%;width:${(w2 * 100).toFixed(1)}%"></i>` : ''}</div>
    <p class="hy-say">${say}</p>
    <div class="hy-scroll" data-scroll="goal">${S.groups.length ? S.groups.map((g) => html`<div class="hy-grp"><p class="hy-gh">${g.tag ? html`<span class="lbl">${g.tag}</span>` : ''}<b>${g.title}</b></p><ul class="hy-list">${g.items.map((it) => itemRow(M, it, g.title))}</ul></div>`) : html`<p class="hy-empty">${icon('calcheck')}No study tasks planned for today.</p>`}</div>
  </section>`;
}
// a run is planned today: the run plan's session, or a "Run –" workout on a day the plan has no session for
function todayRun(M) {
  const t = M.t, d = M.todayDay, rt = M.runs.find((r) => r.date === t && r.session !== 'Extra');
  if (rt) return rt;
  return d && !d.isRest && /^Run\b/i.test(d.workout || '') ? Object.assign({ date: t, session: 'Run', workout: d.workout }, store.runRec({ date: t })) : null;
}
function runPanel(M, R) {
  const t = M.t, d = M.todayDay, blk = M.timetable(t).find((b) => b.kind === 'workout'), done = !!(d && d.rec.workoutDone === 'Yes');
  const total = R.km != null && R.min != null ? R.min * 60 + (+R.sec || 0) : null, pace = total != null && R.km > 0 ? total / R.km : null;
  const ni = (f, lbl, name, step, max) => html`<label class="hy-u"><input class="in sm" id="${'hy-run-' + f}" type="number" inputmode="decimal" min="0" ${raw(max ? 'max="' + max + '"' : '')} step="${step}" data-bind="${'runs|' + t + '|' + f + '|num'}" value="${R[f] == null ? '' : R[f]}" aria-label="${name}"><span aria-hidden="true">${lbl}</span></label>`;
  return html`<section class="hy-panel hy-run" aria-labelledby="hy-h-run">
    <div class="hy-ph"><h2 id="hy-h-run">${icon('activity')}Today’s run</h2><span class="lbl">${R.session}${blk ? ' · ' + fmtClock(blk.from) : ''}</span></div>
    <p class="hy-run-w" title="${R.workout}">${R.workout}</p>
    <div class="hy-run-in">${ni('km', 'km', 'Distance in km', '0.01')}${ni('min', 'min', 'Time, minutes', '1')}${ni('sec', 'sec', 'Time, seconds', '1', 59)}</div>
    <div class="hy-run-f"><span class="hy-chk"><button type="button" class="cbx" role="checkbox" id="hy-run-done" aria-checked="${String(done)}" data-act="workout-toggle" data-date="${t}" aria-label="${done ? 'Mark the run not done' : 'Mark the run done'}">${icon('check')}</button><span>${done ? 'Run done' : 'Mark it done'}</span></span>${total != null ? html`<span class="chip good">${icon('check')}${mmss(total)} · ${mmss(pace)} /km</span>` : ''}<a class="btn sm ghost" href="#/run-5k">5K plan${icon('arrowR')}</a></div>
  </section>`;
}
function pushPanel(M) {
  const d = M.todayDay, r = d ? d.rec : store.dayRec(M.t), n = +r.pushups || 0, T = d ? d.pushT : M.pushToday, hit = T && n >= T;
  return html`<section class="hy-panel hy-push" aria-labelledby="hy-h-push">
    <div class="hy-ph"><h2 id="hy-h-push">${icon('strength')}Push-ups</h2>${hit ? html`<span class="chip good">${icon('check')}Target hit</span>` : html`<span class="lbl">${fmtN(Math.max(0, T - n))} to go</span>`}</div>
    <div class="hy-big"><b data-pop="push" data-v="${n}">${fmtN(n)}</b><span>/ ${fmtN(T)} today</span></div>
    <div class="meter ${hit ? 'good' : ''}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(clamp01(T ? n / T : 0) * 100)}" aria-label="${fmtN(n) + ' of ' + fmtN(T) + ' push-ups'}"><i style="width:${(clamp01(T ? n / T : 0) * 100).toFixed(1)}%"></i></div>
    <div class="hy-push-b" role="group" aria-label="Add push-ups">${[5, 10, 20].map((k) => html`<button type="button" class="btn sm" id="${'hy-push-' + k}" data-hy="push" data-v="${k}" aria-label="${'Add ' + k + ' push-ups'}">+${k}</button>`)}<button type="button" class="btn sm" id="hy-push-undo" data-hy="push" data-v="-5" aria-label="Take away 5 push-ups" ${raw(n ? '' : 'disabled')}>−5</button>${hit ? '' : html`<button type="button" class="btn sm primary" id="hy-push-all" data-hy="push" data-v="all">${icon('check')}All ${fmtN(T)}</button>`}</div>
  </section>`;
}

// ---------- 4. days left ----------
function countdownPanel(M) {
  const at = M.examAt, s = Math.floor(Math.max(0, at - now()) / 1000), J = M.journey, st = M.st, syl = diff(M.t, st.syllabusDeadline);
  const p = { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }, two = (v) => String(v).padStart(2, '0');
  return html`<section class="hy-panel hy-cd" aria-labelledby="hy-h-cd">
    <div class="hy-ph"><h2 id="hy-h-cd">${icon('cap')}Days left</h2><span class="lbl">Paper 1 · ${fmtD(st.examDate)} · ${fmtClock(at.getHours() * 60 + at.getMinutes())}</span></div>
    <div class="hy-cd-row">
      <div class="hy-cd-main" data-cd-at="${at.getTime()}" role="timer" aria-label="${p.d + ' days, ' + p.h + ' hours and ' + p.m + ' minutes to Paper 1'}">
        <b class="hy-cd-d" data-cd="d">${p.d}</b><span class="hy-cd-u">${p.d === 1 ? 'day' : 'days'}</span>
        <span class="hy-cd-hms" aria-hidden="true"><b data-cd="h">${two(p.h)}</b>h <b data-cd="m">${two(p.m)}</b>m <b data-cd="s">${two(p.s)}</b>s</span></div>
      <div class="hy-cd-side">
        <div class="meter thin" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(J.elapsed * 100)}" aria-label="${Math.round(J.elapsed * 100) + '% of the journey gone'}"><i style="width:${(J.elapsed * 100).toFixed(1)}%"></i></div>
        <p class="hy-cd-f"><span>${J.num ? html`Day <b>${J.num}</b> of ${J.days}` : M.t < J.start ? 'Day 1 on ' + fmtDS(J.start) : 'Journey complete'}</span><span>${syl > 0 ? 'R1 deadline in ' + plural(syl, 'day') : syl === 0 ? 'R1 deadline today' : 'R1 deadline passed'}</span></p></div>
    </div>
  </section>`;
}

// ---------- the screen ----------
function nowLine(B) {
  if (B.cur) return html`<b>${B.cur.label}</b> until ${fmtClock(B.cur.end)}`;
  return B.next ? html`Free until <b>${B.next.label}</b> at ${fmtClock(B.next.from)}` : 'Day done';
}
function screen() {
  const M = model(), P = pick(M), B = blockState(M), S = studyPlan(M, B), R = todayRun(M), run = timer.running(), on = live(), s = timer.state(), fs = !!document.fullscreenElement;
  blockKey = (B.cur ? B.cur.label : '') + '|' + (B.next ? B.next.label : '');
  curName = on ? (s.deep ? label(M, s.focus).name : timer.MODES[s.mode].label) : '';
  return html`<header class="hy-top${on ? ' live' : ''}">
      <span class="hy-tag"><i class="hy-pulse${run ? ' on' : ''}" aria-hidden="true"></i>Hyper<span class="hy-tw"> study</span></span>
      <span class="hy-now"><span class="hy-date">${fmtD(M.t)} · </span><span data-hy-clock>${fmtClock(nowMin())}</span>${M.todayDay ? html`<span class="hy-blk"> · ${nowLine(B)}</span>` : ''}</span>
      <span class="grow"></span>
      ${on ? html`<button type="button" class="hy-mini" id="hy-mini" data-hy="toggle" aria-label="${(run ? 'Pause' : 'Resume') + ' the timer, ' + curName}" title="${run ? 'Pause' : 'Resume'}"><span data-timer-text>${mmss(timer.remaining())}</span>${icon(run ? 'pause' : 'play')}</button>` : ''}
      ${fsOK() ? html`<button type="button" class="btn sm ghost" id="hy-fs" data-hy="fs" aria-pressed="${String(fs)}" aria-label="Full screen" aria-keyshortcuts="F" title="${fs ? 'Leave full screen · F' : 'Full screen, nothing else on the screen · F'}">${icon(fs ? 'minimize' : 'maximize')}<span class="hy-bl">Full screen</span><kbd class="kbd kbd-hint" aria-hidden="true">F</kbd></button>` : ''}
      ${'speechSynthesis' in window ? html`<button type="button" class="btn sm ghost hy-brief" id="hy-brief" data-act="brief" aria-label="Brief me" aria-keyshortcuts="V" title="Read today out loud · V">${icon('volume')}<span class="hy-bl">Brief me</span><kbd class="kbd kbd-hint" aria-hidden="true">V</kbd></button>` : ''}
      <button type="button" class="btn sm" id="hy-exit" data-hy="exit" aria-label="Exit Hyper study" aria-keyshortcuts="P Escape" title="Leave Hyper study · P or Esc">${icon('x')}<span class="hy-bl">Exit</span><kbd class="kbd kbd-hint" aria-hidden="true">P</kbd></button>
    </header>
    <div class="hy-grid${R ? '' : ' no-run'}">${timerPanel(M, P)}${subjectsPanel(M, P)}${goalPanel(M, S)}${R ? runPanel(M, R) : ''}${pushPanel(M)}${countdownPanel(M)}</div>`;
}
function render() {
  clearTimeout(soonT); soonT = 0;
  if (!el) return;
  const a = document.activeElement, mine = a && el.contains(a);
  if (mine && a.matches('input, select, textarea')) { pending = true; return; }   // never redraw under typing: on blur
  pending = false;
  const fid = mine ? a.id : '', top = el.scrollTop, sc = {};
  el.querySelectorAll('[data-scroll]').forEach((n) => { sc[n.dataset.scroll] = n.scrollTop; });
  el.innerHTML = String(screen());
  el.scrollTop = top;
  el.querySelectorAll('[data-scroll]').forEach((n) => { if (sc[n.dataset.scroll]) n.scrollTop = sc[n.dataset.scroll]; });
  // focus stays on the same control; when it's gone (Start became Pause), on the one that took its place
  if (fid) {
    const alt = SWAP[fid] || (/^hy-go-/.test(fid) ? 'hy-toggle' : '');
    const n = document.getElementById(fid) || (alt && (document.getElementById(alt) || document.getElementById('hy-go')));
    (n || el).focus({ preventScroll: true });
  } else if (mine) el.focus({ preventScroll: true });
  // a number that just changed (push-ups, hours) gives a small bounce
  const was = popped; popped = {};
  el.querySelectorAll('[data-pop]').forEach((n) => { const k = n.dataset.pop; popped[k] = n.dataset.v; if (was && was[k] != null && was[k] !== n.dataset.v) n.classList.add('pop'); });
  title();
}
const SWAP = { 'hy-go': 'hy-toggle', 'hy-break': 'hy-toggle', 'hy-toggle': 'hy-go', 'hy-end': 'hy-go', 'hy-skip': 'hy-go', 'hy-lost': 'hy-toggle', 'hy-push-all': 'hy-push-5', 'hy-push-undo': 'hy-push-5', 'hy-gen': 'hy-gen', 'hy-mini': 'hy-go' };
const soon = () => { if (!soonT) soonT = setTimeout(render, 40); };
// Today's goal alone, each minute of a session (a full redraw would restart the ring's breathing)
function patchGoal() {
  const g = el && el.querySelector('.hy-goal'); if (!g) return;
  const a = document.activeElement; if (a && g.contains(a)) { soon(); return; }
  const sc = g.querySelector('[data-scroll]'), top = sc ? sc.scrollTop : 0, M = model();
  g.outerHTML = String(goalPanel(M, studyPlan(M, blockState(M))));
  const n = el.querySelector('.hy-goal [data-scroll]'); if (n) n.scrollTop = top;
}
function clock() {
  if (!el) return;
  const c = el.querySelector('[data-hy-clock]'), t = fmtClock(nowMin());
  if (c && c.textContent !== t) {
    c.textContent = t;
    const B = blockState(model());
    if ((B.cur ? B.cur.label : '') + '|' + (B.next ? B.next.label : '') !== blockKey) soon();   // a block started or ended
    else if (timer.running() && sessionMins()) patchGoal();
  }
  title();
}
// the browser tab shows the time left while a session is on: "23:41 · P1 Accounts"
function title() {
  if (el && live()) {
    // the browser trims and collapses spaces in a title, so build it the same way or it never matches (and loops)
    const s = timer.state(), name = curName || (s.deep ? 'Focus' : timer.MODES[s.mode].label);
    const t = (mmss(timer.remaining()) + (timer.running() ? '' : ' paused') + ' · ' + name).replace(/\s+/g, ' ').trim();
    if (document.title !== shownTitle) baseTitle = document.title;   // the page changed it
    if (t !== askedTitle || document.title !== shownTitle) { askedTitle = t; document.title = t; }
    shownTitle = document.title;   // as the browser keeps it: the next call (and the title watcher) then leaves it alone
  } else if (shownTitle) { if (document.title === shownTitle) document.title = baseTitle; shownTitle = ''; askedTitle = ''; }
}
// real full screen (the browser's own bars go too); the whole page, so dialogs and toasts still show
const fsOK = () => !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
function fullscreen() {
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
  // some hosts (embedded views) neither grant nor refuse: say so after a moment rather than nothing at all
  let settled = false;
  const no = () => { if (settled) return; settled = true; toast('This browser won’t go full screen here', { tone: 'warn' }); };
  fsMine = true;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => { settled = true; }, no);
  setTimeout(() => { if (!document.fullscreenElement) no(); }, 2000);
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) fsMine = false; if (el) soon(); });
async function wake(on) {
  try {
    if (on && navigator.wakeLock && !lock && !document.hidden) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
    if (!on && lock) { const l = lock; lock = null; await l.release(); }
  } catch (e) { lock = null; }
}
const setInert = (on) => ['.skip', '.app', '#dock', '#bottombar'].forEach((s) => { const n = document.querySelector(s); if (n) n.inert = on; });

export function open() {
  if (el) { render(); return; }
  prevFocus = document.activeElement;
  el = document.createElement('div');
  el.className = 'hyper intro'; el.id = 'hyper'; el.tabIndex = -1;
  popped = null;
  setTimeout(() => { if (el) el.classList.remove('intro'); }, 900);   // the cards rise in once, on opening
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Hyper study mode');
  el.addEventListener('click', onClick);
  el.addEventListener('focusout', () => { if (pending) setTimeout(() => { if (pending) render(); }, 0); });
  document.body.append(el);
  document.body.classList.add('hyper-on');
  setInert(true);
  setPref('hyper', 1);
  unsub = store.subscribe(soon);
  clockT = setInterval(clock, 1000);
  // the page sets its own title on every redraw; put the time left straight back
  const tt = document.querySelector('title');
  if (tt && window.MutationObserver) { titleObs = new MutationObserver(title); titleObs.observe(tt, { childList: true, characterData: true, subtree: true }); }
  wake(true);
  render();
  setTimeout(() => { const b = el && (el.querySelector('#hy-toggle') || el.querySelector('#hy-go')); if (b) b.focus({ preventScroll: true }); }, 30);
}
export function close() {
  if (!el) return;
  const going = live();
  if (titleObs) { titleObs.disconnect(); titleObs = null; }
  el.remove(); el = null;
  title();
  if (fsMine && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (going) toast('Hyper study closed · the timer keeps running. P brings it back', { icon: 'timer', ms: 3500 });
  clearTimeout(soonT); soonT = 0; pending = false;
  document.body.classList.remove('hyper-on');
  setInert(false);
  setPref('hyper', 0);
  if (unsub) unsub(); unsub = null;
  clearInterval(clockT);
  wake(false);
  if (prevFocus && prevFocus !== document.body && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
  prevFocus = null;
}
export const toggle = () => (el ? close() : open());
// keys while it's open (main.js): F full screen, B a 5-minute break
export function onKey(k) {
  if (!el) return false;
  if (k === 'f' && fsOK()) { fullscreen(); return true; }
  if (k === 'b' && !live()) { timer.reset('short'); timer.start(); return true; }
  return false;
}
// Space: start the picked session, or pause / resume the one that's on
export function toggleTimer() {
  if (!el) return;
  if (!live()) { start(model()); return; }
  if (timer.running()) timer.pause(); else timer.start();
}
function start(M) {
  if (live()) return;
  const P = pick(M), mins = minutes(M);
  setPref('focusKind', P.kind); setPref('focusSubject', P.subject); setPref('focusMinutes', mins);
  timer.startFocus(mins, P.kind === 'subject' ? { kind: 'subject', subject: P.subject, chapterId: P.chapterId || null } : { kind: 'general' });
}

async function onClick(e) {
  const b = e.target.closest('[data-hy]'); if (!b || b.disabled) return;
  const a = b.dataset.hy, M = model();
  if (a === 'exit') { close(); return; }
  if (a === 'go') { start(M); return; }
  if (a === 'toggle') { if (timer.running()) timer.pause(); else timer.start(); return; }
  if (a === 'lost') { timer.distracted(); return; }
  if (a === 'skip') { timer.reset('pomodoro'); return; }
  if (a === 'break') { timer.reset('short'); timer.start(); return; }
  if (a === 'len') { setPref('hyperMinutes', +b.dataset.v); render(); return; }
  if (a === 'end') {
    const s = timer.state(), done = Math.floor((s.dur - timer.remaining()) / 60);
    if (!(await confirm({ title: 'End this session?', body: done >= 1 ? plural(done, 'minute') + ' of ' + Math.round(s.dur / 60) + ' will count towards today’s study hours.' : 'Less than a minute has passed, so nothing will be added.', ok: 'End session' }))) return;
    if (live()) timer.endEarly();
    return;
  }
  if (a === 'paper') { const k = b.dataset.k, P = pick(M); setPick(M, { kind: 'subject', subject: k, chapterId: P.subject === k ? P.chapterId : '' }); return; }
  if (a === 'general') { const P = pick(M); setPick(M, { kind: P.kind === 'general' ? 'subject' : 'general' }); return; }
  if (a === 'pick') { const P = pick(M), id = b.dataset.id, on = P.kind === 'subject' && String(P.chapterId) === id; setPick(M, { kind: 'subject', chapterId: on ? '' : +id || id }); return; }
  if (a === 'go-ch') { const id = b.dataset.id; setPref('hyperPick', Object.assign({}, pick(M), { kind: 'subject', chapterId: +id || id, date: M.t })); start(M); return; }
  if (a === 'fs') { fullscreen(); return; }
  if (a === 'push') {
    const d = M.todayDay, r = d ? d.rec : store.dayRec(M.t), n = +r.pushups || 0, T = d ? d.pushT : M.pushToday;
    const v = b.dataset.v === 'all' ? Math.max(n, T) : Math.max(0, n + +b.dataset.v);
    store.setRec('days', M.t, 'pushups', v > 0 ? v : null);
  }
}
// following a link (a mock's marks, the 5K plan) or a G shortcut leaves Hyper study for that page
window.addEventListener('hashchange', () => { if (el) close(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && el) wake(true); });
