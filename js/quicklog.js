/* Quick log: tonight's 10 PM log in one sheet, from the dock "+", the phone bar or the L key.
   Fields use the same data-bind as the Daily Log page, so everything saves as you type and every widget updates. */
import { model } from './model.js';
import * as store from './store.js';
import { esc, raw, fmtD, fmt1, fmtN, todayStr, addDays } from './util.js';
import { icon } from './icons.js';
import { modal } from './components.js';

export const bindAttr = (date, f, t) => 'data-bind="days|' + date + '|' + f + '|' + t + '"';
export function segRec(date, f, cur, opts, label) {
  return '<div class="seg" role="group" aria-label="' + esc(label) + '">' + opts.map((o) => '<button type="button" ' + bindAttr(date, f, 'sel') + ' data-v="' + esc(o[0]) + '" aria-pressed="' + (cur === o[0]) + '"' + (o[2] ? ' class="t-' + o[2] + '"' : '') + '>' + esc(o[1]) + '</button>').join('') + '</div>';
}

export function open(date) {
  const M = model();
  date = date || M.t;
  let d = M.dayByDate[date];
  if (!d) { date = M.t < M.FIRST ? M.FIRST : M.LAST; d = M.dayByDate[date]; }
  const r = d.rec;
  const num = (f, label, step, ph) => '<label class="field"><span>' + esc(label) + '</span><input class="in" id="ql-' + f + '" type="number" inputmode="decimal" min="0" step="' + step + '" ' + bindAttr(date, f, 'num') + ' value="' + (r[f] == null ? '' : r[f]) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '></label>';
  const body = '<div style="display:grid;gap:16px">' +
    '<div class="between wrap"><div><span class="lbl">Study hours · target ' + fmt1(d.target) + ' h' + (d.ramp ? ' (' + esc(d.ramp.name) + ')' : '') + '</span></div>' +
    '<div class="stepper"><button type="button" data-step="-0.5" data-for="ql-hrs" aria-label="Half an hour less">' + icon('minus') + '</button><input id="ql-hrs" type="number" inputmode="decimal" min="0" max="24" step="0.25" ' + bindAttr(date, 'hrs', 'num') + ' value="' + (r.hrs == null ? '' : r.hrs) + '" placeholder="0" aria-label="Study hours"><button type="button" data-step="0.5" data-for="ql-hrs" aria-label="Half an hour more">' + icon('plus') + '</button></div></div>' +
    '<div class="field"><span>Day status</span>' + segRec(date, 'status', r.status, [['done', 'Done', 'good'], ['partial', 'Partial', 'warn'], ['missed', 'Missed', 'bad']], 'Day status') + '</div>' +
    '<div class="fields">' + num('pages', 'Pages · target ' + d.pagesT, 1) + num('steps', 'Steps · target ' + fmtN(M.st.steps), 100) + num('pushups', 'Push-ups · target ' + d.pushT, 1) + '</div>' +
    '<div class="fields"><div class="field"><span>Workout · ' + esc(d.workout) + '</span>' + segRec(date, 'workoutDone', r.workoutDone, [['Yes', 'Done', 'good'], ['No', 'Skipped', 'bad']], 'Workout done') + '</div>' +
    '<div class="field"><span>Meals on track</span>' + segRec(date, 'meals', r.meals, [['Yes', 'Yes', 'good'], ['No', 'No', 'bad']], 'Meals on track') + '</div></div>' +
    '<label class="field"><span>Notes · what went wrong, what worked</span><textarea class="in" id="ql-notes" rows="2" ' + bindAttr(date, 'notes', 'text') + '>' + esc(r.notes || '') + '</textarea></label></div>';
  const foot = '<span class="lbl grow">' + icon('checkCircle') + ' Saves as you type</span>' +
    (date !== addDays(M.t, -1) && M.dayByDate[addDays(M.t, -1)] && !M.dayByDate[addDays(M.t, -1)].logged ? '<button type="button" class="btn ghost" data-ql-yday>Log yesterday</button>' : '') +
    '<a class="btn" href="#/log?date=' + date + '" data-close>Full log</a><button type="button" class="btn primary" data-close>Done</button>';
  const m = modal({ title: (date === todayStr() ? 'Tonight’s 10 PM log' : '10 PM log') + ' · ' + fmtD(date), body: raw(body), foot: raw(foot) });
  const y = m.el.querySelector('[data-ql-yday]');
  if (y) y.addEventListener('click', () => { m.close(); open(addDays(M.t, -1)); });
  return m;
}
export { store };
