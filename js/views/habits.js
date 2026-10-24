/* Habit Tracker: the 8 plan habits (read from and written to the 10 PM log) plus your own. A weekly grid you can tick,
   30-day strips, current and best streaks, 7- and 30-day completion, add / edit / hide habits. */
import { html, raw, esc, fmt1, fmtN, fmtD, fmtDS, fmtDL, plural, addDays, mondayOf, DOW, parse } from '../util.js';
import { icon } from '../icons.js';
import { card, tile, empty, toast, form } from '../components.js';
import { pref, setPref } from '../prefs.js';
import { renderSoon } from '../router.js';
import * as store from '../store.js';
import { model as modelOf } from '../model.js';

const ICONS = [['checkCircle', 'Check'], ['message', 'Talking'], ['reading', 'Reading'], ['heart', 'Heart'], ['moon', 'Sleep'], ['phone', 'Phone'], ['sun', 'Morning'], ['leaf', 'Mindful'], ['coins', 'Money'], ['video', 'Content'], ['activity', 'Activity']];

function weekDays(M) { const ws = addDays(mondayOf(M.t), (+pref('habitWeek', 0)) * 7), d = []; for (let i = 0; i < 7; i++) d.push(addDays(ws, i)); return d; }
function grid(M) {
  const days = weekDays(M), list = M.habits.filter((h) => !h.hidden), off = +pref('habitWeek', 0);
  const label = off === 0 ? 'This week' : off === -1 ? 'Last week' : fmtDS(days[0]) + ' – ' + fmtDS(days[6]);
  const head = html`<tr><th scope="col" class="hg-name">Habit</th>${days.map((d) => html`<th scope="col" class="${d === M.t ? 'is-today' : ''}"><span>${DOW[parse(d).getDay()]}</span><small>${parse(d).getDate()}</small></th>`)}<th scope="col" class="hg-n">Week</th><th scope="col" class="hg-n">Streak</th></tr>`;
  const rows = list.map((h) => {
    let dn = 0, el = 0;
    const cells = days.map((d) => {
      const v = M.habitDone(h, d);
      if (v != null) { el++; if (v) dn++; }
      const cls = v == null ? 'na' : v ? 'on' : d === M.t ? 'open' : 'off';
      const lbl = h.name + ', ' + fmtDL(d) + ': ' + (v == null ? (d > M.t ? 'upcoming' : 'not tracked') : v ? 'done' : 'not done');
      return html`<td><button type="button" class="hc ${cls}" data-act="habit-cell" data-h="${h.id}" data-date="${d}" ${raw(v == null ? 'aria-disabled="true" tabindex="-1"' : '')} aria-pressed="${String(!!v)}" aria-label="${lbl}" title="${lbl}">${v ? icon('check') : ''}</button></td>`;
    });
    return html`<tr><th scope="row"><span class="h-name">${icon(h.icon)}<span>${h.name}</span></span></th>${cells}<td class="hg-n num">${el ? Math.round(dn / el * 100) + '%' : '—'}</td><td class="hg-n num">${M.habitStats(h).cur}</td></tr>`;
  });
  return html`<div class="between" style="margin-bottom:10px"><div class="row"><button type="button" class="icon-btn sm" data-act="habit-week" data-dir="-1" aria-label="Previous week">${icon('chevL')}</button><b style="font-weight:500;min-width:90px;text-align:center">${label}</b><button type="button" class="icon-btn sm" data-act="habit-week" data-dir="1" aria-label="Next week" ${raw(off >= 0 ? 'aria-disabled="true"' : '')}>${icon('chevR')}</button></div><span class="legend" style="margin:0"><span><i class="key"></i>done</span><span><i class="key" style="--c:transparent;border:1.5px solid var(--line-2)"></i>missed</span><span><i class="key" style="--c:transparent;border:1.5px dashed var(--ink-3)"></i>today</span></span></div>
    <div class="tbl-wrap"><table class="hgrid"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}
function statsList(M) {
  const last30 = []; for (let i = 29; i >= 0; i--) last30.push(addDays(M.t, -i));
  return html`<ul class="hs-list">${M.habits.map((h) => {
    const s = M.habitStats(h);
    return html`<li class="${h.hidden ? 'is-hidden' : ''}"><span class="h-name">${icon(h.icon)}<span class="li-main"><b>${h.name}</b><small>${h.builtin ? h.desc : 'Your habit · since ' + fmtD(h.since)}</small></span></span>
      <span class="strip" role="img" aria-label="${h.name}, last 30 days: ${last30.filter((d) => M.habitDone(h, d)).length} done">${last30.map((d) => { const v = M.habitDone(h, d); return html`<i class="${v == null ? 'na' : v ? 'on' : 'off'}" title="${fmtD(d)}: ${v == null ? 'not tracked' : v ? 'done' : 'not done'}"></i>`; })}</span>
      <span class="hs-n"><b class="num">${s.cur}</b><small>streak</small></span><span class="hs-n"><b class="num">${s.best}</b><small>best</small></span><span class="hs-n"><b class="num">${s.pct7 == null ? '—' : Math.round(s.pct7 * 100) + '%'}</b><small>7 days</small></span><span class="hs-n"><b class="num">${s.pct30 == null ? '—' : Math.round(s.pct30 * 100) + '%'}</b><small>30 days</small></span>
      ${h.builtin ? html`<button type="button" class="icon-btn sm" data-act="habit-hide" data-id="${h.id}" aria-label="${(h.hidden ? 'Show ' : 'Hide ') + h.name}" title="${h.hidden ? 'Show' : 'Hide'}">${icon(h.hidden ? 'eye' : 'eyeOff')}</button>` : html`<button type="button" class="icon-btn sm" data-act="habit-edit" data-id="${h.id}" aria-label="Edit ${h.name}">${icon('edit')}</button>`}</li>`;
  })}</ul>`;
}
function openHabit(id) {
  const h = id ? store.get('habits', id) : null;
  form({
    title: h ? 'Edit habit' : 'New habit',
    intro: h ? '' : 'Your plan’s habits (study target, workout, steps, push-ups, meals, reading, the 10 PM log) are already tracked from your logs. Add anything else you want to build.',
    fields: [{ name: 'name', label: 'Habit', required: true, placeholder: 'Communication practice · 30 min' }, { name: 'icon', label: 'Icon', type: 'select', options: ICONS, half: true }],
    values: h || { icon: 'checkCircle' },
    submitLabel: h ? 'Save habit' : 'Add habit',
    onSubmit: (v) => { if (h) store.put('habits', Object.assign({}, h, v)); else store.add('habits', v, 'hb'); toast(h ? 'Habit saved' : 'Habit added'); },
    onDelete: h ? () => { store.batch(() => { store.list('habitLogs').filter((l) => l.habitId === h.id).forEach((l) => store.remove('habitLogs', l.id)); store.remove('habits', h.id); }); toast('Habit deleted'); } : null,
    deleteBody: 'The habit and its check-ins will be removed.'
  });
}
function numberPrompt(M, h, date) {
  const d = M.dayByDate[date], f = h.field, cur = d.rec[f];
  const target = f === 'hrs' ? d.target : f === 'pages' ? d.pagesT : f === 'pushups' ? d.pushT : f === 'steps' ? +M.st.steps : null;
  const label = { hrs: 'Hours studied', pages: 'Pages read', pushups: 'Push-ups done', steps: 'Steps' }[f] || 'Value';
  form({
    title: h.name + ' · ' + fmtD(date),
    fields: [{ name: 'v', label: label + (target != null ? ' (target ' + (f === 'steps' ? fmtN(target) : fmt1(target)) + ')' : ''), type: 'number', min: 0, max: f === 'hrs' ? 24 : 1000000, step: f === 'hrs' ? 0.25 : 1, autofocus: true }],
    values: { v: cur != null ? cur : target }, submitLabel: 'Save',
    onSubmit: (v) => { store.setRec('days', date, f, v.v); toast('Saved to the 10 PM log'); }
  });
}

export default {
  head(M) { const a = M.analytics; return { title: 'Habit Tracker', sub: raw(esc((a.habitCompletion == null ? '' : Math.round(a.habitCompletion * 100) + '% of habit checks done in the last 7 days · ') + 'plan habits come from the 10 PM log, so ticking one here updates the log, XP and streak')), actions: raw('<button type="button" class="btn primary" data-act="habit-add">' + icon('plus') + 'Add habit</button>') }; },
  render(M) {
    const vis = M.habits.filter((h) => !h.hidden), stats = vis.map((h) => ({ h, s: M.habitStats(h) }));
    const best = stats.reduce((a, x) => (x.s.cur > (a ? a.s.cur : -1) ? x : a), null), a = M.analytics;
    const tiles = html`<div class="tiles">${tile({ cls: 'hero', label: 'Last 7 days', icon: 'habits', value: a.habitCompletion == null ? '—' : Math.round(a.habitCompletion * 100) + '%', foot: 'of habit checks done' })}${tile({ label: 'Best current streak', icon: 'flame', value: best ? plural(best.s.cur, 'day') : '—', foot: best ? best.h.name : '' })}${tile({ label: 'Study streak', icon: 'book', value: plural(M.streak, 'day'), foot: 'best ' + M.bestStreak + ' · ≥ 80% of target or Done' })}${tile({ label: 'Habits tracked', icon: 'list', value: String(vis.length), foot: (M.habits.length - vis.length) + ' hidden' })}</div>`;
    return html`${tiles}${card({ title: 'Week grid', icon: 'calendar', sub: 'Tap a circle to tick it. Number habits ask for the value.', body: grid(M) })}${card({ title: 'Streaks and completion', icon: 'flame', sub: 'Last 30 days, oldest on the left', body: statsList(M) })}`;
  },
  actions: {
    'habit-add': () => openHabit(null),
    'habit-edit': (el) => openHabit(el.dataset.id),
    'habit-week': (el) => { setPref('habitWeek', Math.min(0, (+pref('habitWeek', 0)) + (+el.dataset.dir))); renderSoon(); },
    'habit-hide': (el) => { const hid = (modelOf().st.habitsHidden || []).slice(), i = hid.indexOf(el.dataset.id); if (i >= 0) hid.splice(i, 1); else hid.push(el.dataset.id); store.setSetting('habitsHidden', hid); },
    'habit-cell': (el) => {
      const M = modelOf(), h = M.habits.find((x) => x.id === el.dataset.h), date = el.dataset.date;
      if (!h || date > M.t) return;
      if (!h.builtin) { const key = h.id + '|' + date; if (store.get('habitLogs', key)) store.remove('habitLogs', key); else store.put('habitLogs', { id: key, habitId: h.id, date, done: true }); return; }
      const d = M.dayByDate[date]; if (!d) return;
      if (h.kind === 'yes') store.setRec('days', date, h.field, d.rec[h.field] === 'Yes' ? null : 'Yes');
      else if (h.kind === 'status') store.setRec('days', date, 'status', d.rec.status === 'done' ? null : 'done');
      else numberPrompt(M, h, date);
    }
  }
};
