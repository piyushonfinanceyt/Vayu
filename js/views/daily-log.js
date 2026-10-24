/* Daily Log: the 10 PM log (hours, status, pages, book, workout, steps, push-ups, meals, notes) with its XP and the
   8 daily quests · quick log (timestamped entries through the day: logs/<id> {date, time, cat, text, mins}) ·
   history for the last 7 / 14 / 30 days with a logged-vs-target chart · edit any day or entry. */
import { html, raw, esc, fmt1, fmtN, fmtD, fmtDL, plural, diff, addDays, isDate, pad, typeName, sum, sortBy, fmtMins, todayStr } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, tile, seg, empty, toast, form, meter } from '../components.js';
import { spot } from '../charts.js';
import { recSeg, numField, textField, hoursStepper, dayStatusChip, typeChip } from './parts.js';
import { pref, setPref } from '../prefs.js';
import { go } from '../router.js';
import * as store from '../store.js';

export const CATS = [['study', 'Study', 'book'], ['break', 'Break', 'leaf'], ['workout', 'Workout', 'dumbbell'], ['meal', 'Meal', 'meals'], ['water', 'Water', 'activity'], ['sleep', 'Sleep', 'moon'], ['distraction', 'Distraction', 'phone'], ['mood', 'Mood', 'heart'], ['note', 'Note', 'notes']];
const CAT = {}; CATS.forEach((c) => { CAT[c[0]] = c; });
const HINT = { study: 'Costing · marginal costing questions', break: 'Walk outside', workout: 'Push-ups + 2 km run', meal: 'Dal, rice, salad', water: '1 litre', sleep: 'Slept 11:10 PM – 6:20 AM', distraction: 'Instagram, 25 min', mood: 'Tired after lunch', note: 'Anything worth remembering' };
const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const entriesOn = (date) => sortBy(store.list('logs').filter((l) => l.date === date), (l) => (l.time || '99:99') + (l.createdAt || ''));
const draft = { date: null, time: '', text: '', mins: '' };
let cur = null;
const pickDate = (M, q) => { let d = isDate(q.date) ? q.date : M.t; return d > M.t ? M.t : d; };

function pmCard(M, date) {
  const d = M.dayByDate[date];
  if (!d) return card({ cls: 'span-7', title: '10 PM log', icon: 'logbook', body: empty('The 10 PM log covers the plan days, ' + fmtD(M.FIRST) + ' to ' + fmtD(M.LAST) + '. Quick log entries work on any day.', html`<a class="btn sm" href="#/log">Go to today</a>`, 'logbook') });
  const r = d.rec, hp = d.target ? (+r.hrs || 0) / d.target : 0, st = M.st;
  const formHtml = html`<div class="stack">
    <div class="between wrap" style="gap:12px"><div class="grow"><span class="lbl">Study hours · target ${fmt1(d.target)} h${d.ramp ? ' (' + d.ramp.name + ')' : ''} · minimum ${d.minHrs} h</span><div class="row" style="margin-top:8px">${meter(hp, { tone: hp >= 0.9 ? 'good' : '', label: 'Hours against target' })}<b class="num" style="font-weight:500;min-width:42px;text-align:right">${Math.round(hp * 100)}%</b></div></div>${hoursStepper(date, r.hrs, 'f-hrs')}</div>
    <div class="field"><span>Day status</span>${recSeg('days', date, 'status', r.status, [['done', 'Done', 'good'], ['partial', 'Partial', 'warn'], ['missed', 'Missed', 'bad']], 'Day status')}</div>
    <div class="fields">${numField('days', date, 'pages', r.pages, 'Pages read · target ' + d.pagesT, { pre: 'f' })}${textField('days', date, 'book', r.book, 'Book', { pre: 'f', ph: 'Book title' })}</div>
    <div class="field"><span>Workout · ${d.workout}</span>${recSeg('days', date, 'workoutDone', r.workoutDone, [['Yes', 'Done', 'good'], ['No', 'Skipped', 'bad']], 'Workout done')}</div>
    <div class="fields">${numField('days', date, 'steps', r.steps, 'Steps · target ' + fmtN(st.steps), { pre: 'f', step: 100 })}${numField('days', date, 'pushups', r.pushups, 'Push-ups · target ' + d.pushT, { pre: 'f' })}</div>
    <div class="field"><span>Meals on track?</span>${recSeg('days', date, 'meals', r.meals, [['Yes', 'Yes', 'good'], ['No', 'No', 'bad']], 'Meals on track')}</div>
    ${textField('days', date, 'notes', r.notes, 'Notes · what went wrong, what worked', { pre: 'f', area: true, rows: 3 })}</div>`;
  const xp = html`<div class="xpbox"><div class="between"><span class="lbl">XP from this day</span><b style="font-size:20px;font-weight:500">+${fmtN(d.xp)}</b></div>
    ${d.parts.length ? html`<ul class="xp-list" style="margin-top:6px">${d.parts.map((p) => html`<li><span class="muted">${p[0]}</span><b class="num" style="font-weight:500">+${fmtN(p[1])}</b></li>`)}</ul>` : html`<p class="small muted" style="margin-top:6px">Log your hours to start earning XP. Every chapter you mark done adds +${st.xp.chapterDone}.</p>`}
    <div class="between" style="margin-top:12px"><span class="lbl">Daily quests</span>${chip(d.questsDone + ' / 8', d.questsDone === 8 ? 'good' : '')}</div>
    <ul class="quests">${d.quests.map((x) => html`<li class="${x[2] ? 'done' : ''}">${icon(x[2] ? 'checkCircle' : 'circle')}<span>${x[1]}</span></li>`)}</ul></div>`;
  return card({ cls: 'span-7', title: '10 PM log', icon: 'logbook', sub: typeName(d.type) + ' day · saves as you type', actions: typeChip(d.type), body: html`${formHtml}${xp}` });
}

function quickCard(M, date) {
  if (draft.date !== date) Object.assign(draft, { date, time: '', text: '', mins: '' });
  const cat = CAT[pref('qlCat')] ? pref('qlCat') : 'study', list = entriesOn(date);
  const byCat = {}; list.forEach((l) => { if (l.mins) byCat[l.cat] = (byCat[l.cat] || 0) + l.mins; });
  return card({
    cls: 'span-5', title: 'Quick log', icon: 'clock', sub: 'Study blocks, breaks, meals, water, sleep and distractions as they happen', actions: chip(plural(list.length, 'entry', 'entries')),
    body: html`<div class="ql-cats" role="group" aria-label="Entry type">${CATS.map((c) => html`<button type="button" data-seg="ql-cat" data-v="${c[0]}" aria-pressed="${String(cat === c[0])}">${c[1]}</button>`)}</div>
      <div class="ql-form"><input id="ql-time" class="in" type="time" value="${draft.time || (date === M.t ? nowHM() : '21:00')}" aria-label="Time" data-input="ql-draft">
        <input id="ql-text" class="in ql-text" type="text" maxlength="280" value="${draft.text}" placeholder="${HINT[cat]}" aria-label="What happened" autocomplete="off" data-input="ql-draft">
        <input id="ql-mins" class="in" type="number" inputmode="numeric" min="0" max="1440" step="1" value="${draft.mins}" placeholder="min" aria-label="Minutes, optional" data-input="ql-draft">
        <button type="button" class="btn primary" data-act="ql-add" data-date="${date}">${icon('plus')}Log it</button></div>
      ${Object.keys(byCat).length ? html`<div class="row wrap" style="margin-top:12px;gap:6px">${CATS.filter((c) => byCat[c[0]]).map((c) => chip(c[1] + ' · ' + fmtMins(byCat[c[0]])))}</div>` : ''}
      ${list.length ? html`<ul class="ql-list" style="margin-top:12px">${list.map((l) => { const c = CAT[l.cat] || CAT.note; return html`<li><span class="ql-t num">${l.time || '—'}</span><span class="li-main"><b>${c[1]}</b>${l.text ? html`<small>${l.text}</small>` : ''}</span>${l.mins ? html`<span class="num small">${fmtMins(l.mins)}</span>` : html`<span></span>`}<span class="row" style="gap:0"><button type="button" class="icon-btn sm" data-act="ql-edit" data-id="${l.id}" aria-label="Edit ${c[1]} at ${l.time || ''}">${icon('edit')}</button><button type="button" class="icon-btn sm" data-act="ql-del" data-id="${l.id}" aria-label="Delete ${c[1]} at ${l.time || ''}">${icon('trash')}</button></span></li>`; })}</ul>`
        : html`<p class="small muted" style="margin-top:14px">Nothing logged yet for this day.</p>`}`
  });
}
function addEntry(date) {
  const text = String(draft.date === date ? draft.text : '').trim(), mins = String(draft.mins || '').trim(), cat = CAT[pref('qlCat')] ? pref('qlCat') : 'study';
  const time = (draft.date === date && draft.time) || (date === todayStr() ? nowHM() : '21:00');
  if (!text && !mins) { toast('Write what happened, or add minutes', { tone: 'warn' }); const t = document.getElementById('ql-text'); if (t) t.focus(); return; }
  const m = mins === '' ? null : Number(mins);
  if (m != null && (!isFinite(m) || m < 0 || m > 1440)) { toast('Minutes must be between 0 and 1440', { tone: 'warn' }); return; }
  Object.assign(draft, { text: '', mins: '', time: '' });
  store.add('logs', { date, time, cat, text: text.slice(0, 280), mins: m }, 'lg');
  toast(CAT[cat][1] + ' logged at ' + time);
  setTimeout(() => { const t = document.getElementById('ql-text'); if (t) t.focus(); }, 60);
}

function historyCard(M, date) {
  const n = +pref('logRange', 14), qCount = {};
  store.list('logs').forEach((l) => { qCount[l.date] = (qCount[l.date] || 0) + 1; });
  const days = []; for (let i = n - 1; i >= 0; i--) days.push(addDays(M.t, -i));
  const rows = days.slice().reverse().map((day) => {
    const d = M.dayByDate[day], r = d ? d.rec : null;
    return html`<tr class="${day === date ? 'sel' : ''}"><th scope="row"><a href="#/log?date=${day}">${fmtD(day)}</a></th>
      <td data-label="Hours" class="n">${d ? (r.hrs == null ? '–' : fmt1(r.hrs)) + ' / ' + fmt1(d.target) : '–'}</td><td data-label="Status">${r && r.status ? dayStatusChip(r.status) : '–'}</td>
      <td data-label="Pages" class="n">${r && r.pages != null ? r.pages : '–'}</td><td data-label="Steps" class="n">${r && r.steps != null ? fmtN(r.steps) : '–'}</td><td data-label="Push-ups" class="n">${r && r.pushups != null ? r.pushups : '–'}</td>
      <td data-label="Workout">${r && r.workoutDone ? (r.workoutDone === 'Yes' ? 'Done' : 'Skipped') : '–'}</td><td data-label="Meals">${r && r.meals ? r.meals : '–'}</td><td data-label="Quick" class="n">${qCount[day] || '–'}</td></tr>`;
  });
  const chart = spot('log-hist', 'bars', { labels: days.map((x) => fmtD(x).slice(4)), tips: days.map((x) => fmtD(x)), values: days.map((x) => (M.dayByDate[x] && M.dayByDate[x].logged ? +M.dayByDate[x].rec.hrs : M.dayByDate[x] ? 0 : null)), targets: days.map((x) => (M.dayByDate[x] ? M.dayByDate[x].target : null)), highlight: days.indexOf(date), fmt: (v) => fmt1(v) + ' h', height: 190, ariaLabel: 'Study hours logged against target, last ' + n + ' days' });
  return card({
    cls: 'span-12', title: 'History', icon: 'calendar', sub: 'Tap a day to open its log',
    actions: seg('log-range', [['7', '7 days'], ['14', '14 days'], ['30', '30 days']], String(n), { label: 'History range' }),
    body: html`<div class="legend"><span><i class="key" style="--c:var(--line-2)"></i>logged hours</span><span><i class="key hatch"></i>target</span><span><i class="key"></i>selected day</span></div>${chart}
      <div class="tbl-wrap" style="margin-top:14px"><table class="tbl cards"><thead><tr><th scope="col">Day</th><th scope="col" class="n">Hours</th><th scope="col">Status</th><th scope="col" class="n">Pages</th><th scope="col" class="n">Steps</th><th scope="col" class="n">Push-ups</th><th scope="col">Workout</th><th scope="col">Meals</th><th scope="col" class="n">Quick</th></tr></thead><tbody>${rows}</tbody></table></div>`
  });
}
function statsRow(M) {
  const last = []; for (let i = 0; i < 7; i++) last.push(addDays(M.t, -i));
  const days = last.map((x) => M.dayByDate[x]).filter(Boolean), logged = days.filter((d) => d.logged).length;
  const hrs = sum(days, (d) => +d.rec.hrs || 0), tgt = sum(days, (d) => +d.target || 0);
  const steps = days.map((d) => d.rec.steps).filter((v) => v != null && v !== '').map(Number);
  return html`<div class="tiles">${tile({ label: 'Days logged', icon: 'checkCircle', value: raw(logged + '<small> / ' + days.length + '</small>'), foot: 'last 7 days' })}
    ${tile({ cls: 'hero', label: 'Study hours', icon: 'book', value: raw('<span data-count="' + Math.round(hrs * 10) / 10 + '" data-dec="1">' + fmt1(hrs) + '</span><small> / ' + fmt1(tgt) + ' h</small>'), foot: tgt ? Math.round((hrs / tgt) * 100) + '% of target · last 7 days' : 'last 7 days' })}
    ${tile({ label: 'Average steps', icon: 'steps', value: steps.length ? fmtN(sum(steps) / steps.length) : '—', foot: steps.length ? plural(steps.length, 'day') + ' logged · target ' + fmtN(M.st.steps) : 'no steps logged yet' })}
    ${tile({ label: 'Quick entries today', icon: 'clock', value: String(entriesOn(M.t).length), foot: 'study, breaks, meals, sleep…' })}</div>`;
}

export default {
  head(M, q) { const date = pickDate(M, q); return { title: 'Daily Log', actions: raw((date !== M.t ? '<a class="btn" href="#/log">' + icon('calendar') + 'Today</a>' : '') + (M.dayByDate[date] ? '<a class="btn" href="#/study-plan?date=' + date + '">' + icon('calcheck') + 'Plan for this day</a>' : '')) }; },
  render(M, q) {
    const date = pickDate(M, q), d = M.dayByDate[date];
    cur = date;
    const nav = html`<section class="card daynav"><a class="icon-btn" href="#/log?date=${addDays(date, -1)}" aria-label="Previous day">${icon('chevL')}</a>
      <div class="dn"><b>${fmtDL(date)}</b><span>${d ? d.label + ' · ' + typeName(d.type) + ' · ' : ''}${date === M.t ? 'today' : plural(diff(date, M.t), 'day') + ' ago'}</span></div>
      <a class="icon-btn" href="#/log?date=${addDays(date, 1)}" ${raw(date >= M.t ? 'aria-disabled="true" tabindex="-1"' : '')} aria-label="Next day">${icon('chevR')}</a>
      <input type="date" class="in sm" data-nav-date="log" max="${M.t}" value="${date}" aria-label="Pick a day">${d && d.rec.status ? dayStatusChip(d.rec.status) : ''}</section>`;
    return html`${nav}${statsRow(M)}<div class="grid">${pmCard(M, date)}${quickCard(M, date)}</div><div class="grid">${historyCard(M, date)}</div>`;
  },
  step(dir) { if (!cur) return; const n = addDays(cur, dir); if (n <= todayStr()) go('#/log?date=' + n); },
  segs: { 'log-range': (v) => setPref('logRange', +v), 'ql-cat': (v) => setPref('qlCat', v) },
  inputs: { 'ql-draft': (el) => { if (el.id === 'ql-text') draft.text = el.value; else if (el.id === 'ql-mins') draft.mins = el.value; else draft.time = el.value; } },
  actions: {
    'ql-add': (el) => addEntry(el.dataset.date),
    'ql-del': (el) => { const l = store.remove('logs', el.dataset.id); if (l) toast('Entry deleted', { action: { label: 'Undo', fn: () => store.put('logs', l) } }); },
    'ql-edit': (el) => {
      const l = store.get('logs', el.dataset.id); if (!l) return;
      form({
        title: 'Edit entry · ' + fmtD(l.date),
        fields: [{ name: 'time', label: 'Time', type: 'time', half: true, required: true }, { name: 'cat', label: 'Type', type: 'select', half: true, options: CATS.map((c) => [c[0], c[1]]) }, { name: 'text', label: 'What happened' }, { name: 'mins', label: 'Minutes (optional)', type: 'number', min: 0, max: 1440, step: 1, half: true }],
        values: l, submitLabel: 'Save',
        onSubmit: (v) => { if (!v.text && v.mins == null) return 'Write what happened, or add minutes.'; store.put('logs', Object.assign({}, l, v, { text: String(v.text || '').slice(0, 280) })); toast('Saved'); },
        onDelete: () => { store.remove('logs', l.id); toast('Entry deleted'); }
      });
    }
  }
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target && /^ql-(text|mins|time)$/.test(e.target.id)) { e.preventDefault(); const b = document.querySelector('[data-act="ql-add"]'); if (b) addEntry(b.dataset.date); }
});
