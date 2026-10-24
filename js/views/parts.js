/* Small markup helpers shared by the views (all return Raw). */
import { html, raw, esc, fmt1, fmtD, typeName } from '../util.js';
import { icon } from '../icons.js';

// data-bind attribute for plan records: sec | id | field | type (num, text, sel, bool)
export const bind = (sec, id, f, t) => raw('data-bind="' + esc(sec + '|' + id + '|' + f + '|' + t) + '"');

// segmented control bound to a plan record field (tap the active option again to clear it)
export function recSeg(sec, id, f, cur, opts, label, o = {}) {
  return html`<div class="seg ${o.cls || ''}" role="group" aria-label="${label}">${opts.map((x) => html`<button type="button" id="${'sg-' + sec + '-' + id + '-' + f + '-' + x[0]}" ${bind(sec, id, f, 'sel')} data-v="${x[0]}" aria-pressed="${String(cur === x[0])}" ${raw(x[2] ? 'class="t-' + x[2] + '"' : '')}>${x[1]}</button>`)}</div>`;
}
export function numField(sec, id, f, val, label, o = {}) {
  return html`<label class="field ${o.cls || ''}"><span>${label}</span><input class="in ${o.sm ? 'sm' : ''}" id="${(o.pre || 'n') + '-' + sec + '-' + id + '-' + f}" type="number" inputmode="decimal" min="0" ${raw(o.max != null ? 'max="' + o.max + '"' : '')} step="${o.step || 1}" ${bind(sec, id, f, 'num')} value="${val == null ? '' : val}" ${raw(o.ph ? 'placeholder="' + esc(o.ph) + '"' : '')}></label>`;
}
export function textField(sec, id, f, val, label, o = {}) {
  return o.area
    ? html`<label class="field"><span>${label}</span><textarea class="in" id="${(o.pre || 't') + '-' + sec + '-' + id + '-' + f}" rows="${o.rows || 2}" ${bind(sec, id, f, 'text')} ${raw(o.ph ? 'placeholder="' + esc(o.ph) + '"' : '')}>${val || ''}</textarea></label>`
    : html`<label class="field"><span>${label}</span><input class="in ${o.sm ? 'sm' : ''}" id="${(o.pre || 't') + '-' + sec + '-' + id + '-' + f}" type="text" ${bind(sec, id, f, 'text')} value="${val || ''}" ${raw(o.ph ? 'placeholder="' + esc(o.ph) + '"' : '')}></label>`;
}
export function hoursStepper(date, val, id) {
  return html`<div class="stepper"><button type="button" data-step="-0.5" data-for="${id}" aria-label="Half an hour less">${icon('minus')}</button><input id="${id}" type="number" inputmode="decimal" min="0" max="24" step="0.25" ${bind('days', date, 'hrs', 'num')} value="${val == null ? '' : val}" placeholder="0" aria-label="Study hours"><button type="button" data-step="0.5" data-for="${id}" aria-label="Half an hour more">${icon('plus')}</button></div>`;
}

export const DAY_STATUS = { done: ['Done', 'good', 'check'], partial: ['Partial', 'warn', 'alert'], missed: ['Missed', 'bad', 'x'] };
export const dayStatusChip = (s) => (DAY_STATUS[s] ? html`<span class="chip ${DAY_STATUS[s][1]}">${icon(DAY_STATUS[s][2])}${DAY_STATUS[s][0]}</span>` : html`<span class="chip">Not logged</span>`);
export const TYPE_ICON = { Study: 'book', Buffer: 'leaf', Mock: 'mocks', Revision: 'revision', Exam: 'cap' };
export const typeChip = (t) => { const n = typeName(t); return html`<span class="chip line">${icon(TYPE_ICON[n] || 'calendar')}${n}</span>`; };

// plan text ("Accounts:\n• AS 1 … (1h)") → heading + bullet list
export function planText(t) {
  if (!t) return html`<span class="muted">—</span>`;
  let out = '', list = [];
  const flush = () => { if (list.length) { out += '<ul class="plan-ul">' + list.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>'; list = []; } };
  String(t).split('\n').forEach((l) => { const s = l.trim(); if (!s) return; if (s.indexOf('• ') === 0) list.push(s.slice(2)); else { flush(); out += /:$/.test(s) ? '<b class="plan-h">' + esc(s.replace(/:$/, '')) + '</b>' : '<p>' + esc(s) + '</p>'; } });
  flush();
  return raw(out);
}
export const hrsOf = (h, t) => (h == null ? '–' : fmt1(h)) + ' / ' + fmt1(t) + ' h';
export { fmtD };
