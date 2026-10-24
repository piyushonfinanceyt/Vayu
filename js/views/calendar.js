/* Calendar: the month grid (study share, full paper, milestone and open-task markers, told apart by shape as well as
   colour), the selected day's details (plan, focus items, timetable, run, paper, notes) and what's coming up. */
import { html, raw, esc, fmt1, fmtD, fmtDS, fmtDL, fmtLong, plural, diff, addDays, monthStart, monthEnd, addMonths, MONL, parse, isDate, typeName, mmss, fmtClock, todayStr } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, status, empty } from '../components.js';
import { pref, setPrefs } from '../prefs.js';
import { renderSoon, go } from '../router.js';
import { dayStatusChip } from './parts.js';
import * as store from '../store.js';

function grid(M, month, sel) {
  const first = monthStart(month), off = (parse(first).getDay() + 6) % 7, start = addDays(first, -off), weeks = Math.ceil((off + parse(monthEnd(month)).getDate()) / 7);
  const tasks = {}; store.list('tasks').forEach((x) => { if (x.date && !x.plan && !x.done) tasks[x.date] = (tasks[x.date] || 0) + 1; });
  const ms = {}; M.milestones.forEach((m) => { if (!m.hidden) (ms[m.date] = ms[m.date] || []).push(m.title); });
  let h = html`<div class="mcal" role="grid" aria-label="${MONL[parse(first).getMonth()]} ${first.slice(0, 4)}"><div class="mc-row mc-head" role="row">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => html`<span role="columnheader">${x}</span>`)}</div>`;
  for (let w = 0; w < weeks; w++) {
    let row = '';
    for (let k = 0; k < 7; k++) {
      const date = addDays(start, w * 7 + k), inM = date.slice(0, 7) === first.slice(0, 7), d = M.dayByDate[date];
      const lvl = d ? (d.score === -2 ? '' : d.score === -1 ? 'n' : d.score >= 0.9 ? '4' : d.score >= 0.6 ? '3' : d.score >= 0.3 ? '2' : '1') : '';
      const parts = [fmtDL(date)];
      if (d) parts.push(typeName(d.type) + (d.logged ? ' · ' + fmt1(d.rec.hrs) + ' of ' + fmt1(d.target) + ' h' : d.date <= M.t ? ' · not logged' : ''));
      if (d && d.boss) parts.push('full paper');
      if (ms[date]) parts.push(ms[date].join(', '));
      if (tasks[date]) parts.push(plural(tasks[date], 'open task'));
      row += String(html`<button type="button" role="gridcell" class="mc ${inM ? '' : 'out'} ${date === M.t ? 'today' : ''} ${sel === date ? 'sel' : ''} ${lvl ? 'l' + lvl : ''}" data-act="cal-pick" data-date="${date}" aria-label="${parts.join(' · ')}" title="${parts.join(' · ')}" aria-pressed="${String(sel === date)}">
        <span class="mc-n">${parse(date).getDate()}</span>${d ? html`<span class="mc-type">${typeName(d.type)}</span>` : ''}
        <span class="mc-marks">${d && d.boss ? html`<i class="mk-paper" aria-hidden="true"></i>` : ''}${ms[date] ? html`<i class="mk-ms" aria-hidden="true"></i>` : ''}${tasks[date] ? html`<i class="mk-task" aria-hidden="true"></i>` : ''}</span></button>`);
    }
    h = html`${h}<div class="mc-row" role="row">${raw(row)}</div>`;
  }
  return html`${h}</div>`;
}
function details(M, date) {
  const d = M.dayByDate[date], items = M.focusItems(date), blocks = M.timetable(date), run = M.runs.find((r) => r.date === date), mock = M.mocks.find((x) => x.date === date), msl = M.milestones.filter((x) => x.date === date && !x.hidden);
  const sessions = store.list('sessions').filter((s) => s.date === date), journal = store.get('journal', 'j_' + date), logs = store.list('logs').filter((l) => l.date === date);
  return html`<div class="dd-sum">${[['Study', fmt1(M.hoursOn(date)) + (d ? ' / ' + fmt1(d.target) : '') + ' h'], ['Plan items', items.filter((i) => i.done).length + ' / ' + items.length], ['Focus sessions', String(sessions.length)], ['Day', d && d.rec.status ? ({ done: 'Done', partial: 'Partial', missed: 'Missed' })[d.rec.status] : '—']].map((x) => html`<div><span class="lbl">${x[0]}</span><b>${x[1]}</b></div>`)}</div>
    ${d ? html`<div class="dd-sec"><h3>${d.label} · ${typeName(d.type)}</h3><p>${String(d.main).split('\n').map((s) => s.replace(/^•\s*/, '')).join(' · ')}</p>${d.side ? html`<p class="muted">${String(d.side).split('\n').map((s) => s.replace(/^•\s*/, '')).join(' · ')}</p>` : ''}<p class="muted small">${icon('dumbbell')} ${d.workout}${d.rev ? ' · ' + d.rev : ''}</p></div>` : html`<div class="dd-sec"><p class="muted">Outside the plan (${fmtDS(M.FIRST)} – ${fmtDS(M.LAST)}).</p></div>`}
    ${msl.length ? html`<div class="dd-sec"><h3>Milestones</h3>${msl.map((x) => html`<p>${icon('flag')} <b style="font-weight:500">${x.title}</b> <span class="muted">${x.desc}</span></p>`)}</div>` : ''}
    ${mock ? html`<div class="dd-sec"><h3>Full paper</h3><p>Mock #${mock.id} · ${mock.paper} ${mock.subject} · ${mock.bossName} · target ${Math.round(mock.target * 100)} · ${mock.marks != null ? html`<b style="font-weight:500">${Math.round(mock.score * 100)} marks</b>` : html`<a href="#/mocks?id=${mock.id}">enter marks</a>`}</p></div>` : ''}
    ${items.length ? html`<div class="dd-sec"><h3>Plan items</h3><ul>${items.map((i) => html`<li class="dd-item ${i.done ? 'done' : ''}">${icon(i.done ? 'checkCircle' : 'circle')}<span>${i.title}</span><small class="muted">${i.cat}</small></li>`)}</ul></div>` : ''}
    ${blocks.length && d ? html`<details class="grp" data-key="cal-tt"><summary><b>Timetable</b><span class="muted small">${blocks.length} blocks</span></summary><div class="grp-body"><ul>${blocks.map((b) => html`<li class="dd-item"><span class="num small muted" style="min-width:64px">${fmtClock(b.from)}</span><span>${b.label} · ${b.title}</span></li>`)}</ul></div></details>` : ''}
    ${run ? html`<div class="dd-sec"><h3>Run · ${run.session}</h3><p class="muted">${run.workout}</p>${run.total != null ? html`<p><b style="font-weight:500">${fmt1(run.km)} km in ${mmss(run.total)}</b> · ${mmss(run.pace)} /km${run.walked === 'Yes' ? ' · walk breaks' : ''}</p>` : ''}</div>` : ''}
    ${journal ? html`<div class="dd-sec"><h3>Journal</h3><p>${(journal.body || journal.wins || journal.grateful || 'Mood logged').slice(0, 220)}</p></div>` : ''}
    ${logs.length ? html`<div class="dd-sec"><h3>Quick log</h3>${logs.map((l) => html`<p class="small">${l.time || ''} · ${l.cat}${l.text ? ' · ' + l.text : ''}</p>`)}</div>` : ''}
    ${d && (d.rec.notes || '').trim() ? html`<div class="dd-sec"><h3>Notes</h3><p>${d.rec.notes}</p></div>` : ''}`;
}

export default {
  enter(q) { if (isDate(q.date)) setPrefs({ calSel: q.date, calMonth: monthStart(q.date) }); },
  head(M) { return { title: 'Calendar', sub: raw(esc('Plan days, full papers, milestones and tasks · ' + fmtDS(M.FIRST) + ' – ' + fmtDS(M.LAST))) }; },
  render(M) {
    const sel = pref('calSel') || M.t, month = pref('calMonth') || monthStart(sel);
    const cal = card({ cls: 'span-8', title: MONL[parse(month).getMonth()] + ' ' + month.slice(0, 4), icon: 'calendar',
      actions: html`<button type="button" class="btn sm ghost" data-act="cal-today">Today</button><button type="button" class="icon-btn" data-act="cal-month" data-dir="-1" aria-label="Previous month">${icon('chevL')}</button><button type="button" class="icon-btn" data-act="cal-month" data-dir="1" aria-label="Next month">${icon('chevR')}</button>`,
      body: html`${grid(M, month, sel)}<div class="legend" style="margin-top:12px"><span><i class="key l4"></i>≥ 90% of hours</span><span><i class="key l3"></i>60–89%</span><span><i class="key l1"></i>&lt; 60%</span><span><i class="key ln"></i>not logged</span><span><i class="mk-paper inline"></i>full paper</span><span><i class="mk-ms inline"></i>milestone</span><span><i class="mk-task inline"></i>open task</span></div>` });
    const det = card({ cls: 'span-4', title: fmtLong(sel), icon: 'info', actions: M.dayByDate[sel] && sel <= M.t ? html`<a class="btn sm" href="#/log?date=${sel}">${icon('edit')}Daily log</a>` : M.dayByDate[sel] ? html`<a class="btn sm" href="#/study-plan?date=${sel}">${icon('calcheck')}Plan</a>` : '', body: details(M, sel) });
    const up = M.milestones.filter((m) => !m.hidden && m.date >= M.t).slice(0, 8);
    const ms = card({ title: 'Coming up', icon: 'flag', body: up.length ? html`<ol class="timeline">${up.map((m) => html`<li class="${m.status}"><span class="tl-date">${m.date === M.t ? 'Today' : fmtDS(m.date)}</span><span class="tl-body"><button type="button" class="ms-btn" data-act="cal-pick" data-date="${m.date}"><b>${m.title}</b><small>${m.desc}</small></button></span></li>`)}</ol>` : empty('No milestones ahead.', '', 'flag') });
    return html`<div class="grid">${cal}${det}</div>${ms}`;
  },
  step(dir) { const sel = pref('calSel') || todayStr(), n = addDays(sel, dir); setPrefs({ calSel: n, calMonth: monthStart(n) }); renderSoon(); },
  actions: {
    'cal-pick': (el) => { setPrefs({ calSel: el.dataset.date, calMonth: monthStart(el.dataset.date) }); renderSoon(); },
    'cal-today': () => { const t = todayStr(); setPrefs({ calSel: t, calMonth: monthStart(t) }); renderSoon(); },
    'cal-month': (el) => { setPrefs({ calMonth: addMonths(pref('calMonth') || monthStart(todayStr()), +el.dataset.dir) }); renderSoon(); }
  }
};
export { go, status, chip, dayStatusChip };
