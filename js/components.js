/* UI primitives: cards, tiles, chips, segmented controls, tabs, meters, rings, empty states,
   plus the overlay layer (toast with Undo, popover menu, modal, form, confirm) and count-up numbers. */
import { html, raw, esc, $, $$, clamp01, reducedMotion } from './util.js';
import { icon } from './icons.js';

// ---------- building blocks (all return Raw markup) ----------
export function card(o) {
  const hid = o.id ? o.id + '-h' : '';
  return html`<section class="card ${o.cls || ''}" ${raw(o.id ? 'id="' + esc(o.id) + '"' : '')} ${raw(hid ? 'aria-labelledby="' + hid + '"' : '')}>
    ${o.title ? html`<div class="card-head"><div class="grow"><h2 ${raw(hid ? 'id="' + hid + '"' : '')}>${o.icon ? icon(o.icon) : ''}<span>${o.title}</span></h2>${o.sub ? html`<p class="card-sub">${o.sub}</p>` : ''}</div>${o.actions ? html`<div class="card-actions">${o.actions}</div>` : ''}</div>` : ''}
    ${o.body}${o.foot ? html`<div class="card-foot">${o.foot}</div>` : ''}</section>`;
}
export function tile(o) {
  const tag = o.href ? 'a' : 'div';
  return html`<${raw(tag)} class="tile ${o.cls || ''}" ${raw(o.href ? 'href="' + esc(o.href) + '" style="text-decoration:none"' : '')}>
    <span class="lbl">${o.icon ? icon(o.icon) : ''}${o.label}</span>
    <span class="value">${o.value}${o.unit ? html`<small> ${o.unit}</small>` : ''}</span>
    ${o.foot ? html`<span class="tile-foot">${o.foot}</span>` : ''}</${raw(tag)}>`;
}
export const chip = (text, tone, ic) => html`<span class="chip ${tone || ''}">${ic ? icon(ic) : ''}${text}</span>`;
// status chip: colour never carries meaning alone, so it always has an icon + a word
const STATUS_IC = { good: 'check', warn: 'alert', bad: 'x', info: 'info' };
export const status = (text, tone) => chip(text, tone, STATUS_IC[tone]);
export const dot = (c) => html`<i class="dot" style="--c:${c}" aria-hidden="true"></i>`;
export const prio = (p) => (p ? html`<span class="prio p-${String(p).toLowerCase()}">${{ high: 'HIGH', medium: 'MED', low: 'LOW' }[String(p).toLowerCase()] || p}</span>` : '');
export function seg(name, opts, cur, o = {}) {
  return html`<div class="seg ${o.ink ? 'ink' : ''}" role="group" aria-label="${o.label || name}">${opts.map((x) => html`<button type="button" data-seg="${name}" data-v="${x[0]}" aria-pressed="${String(String(cur) === String(x[0]))}" ${raw(x[2] ? 'class="t-' + x[2] + '"' : '')}>${x[1]}</button>`)}</div>`;
}
// in-page tabs: role=tablist with arrow-key navigation (handled in main.js)
export function tabs(name, opts, cur, o = {}) {
  return html`<div class="seg ${o.ink ? 'ink' : ''}" role="tablist" aria-label="${o.label || name}">${opts.map((x) => html`<button type="button" role="tab" id="tab-${name}-${x[0]}" data-tab="${name}" data-v="${x[0]}" aria-selected="${String(String(cur) === String(x[0]))}" tabindex="${String(cur) === String(x[0]) ? '0' : '-1'}">${x[2] ? icon(x[2]) : ''}${x[1]}</button>`)}</div>`;
}
export function meter(p, o = {}) {
  const w = (clamp01(p || 0) * 100).toFixed(1);
  return html`<div class="meter ${o.thin ? 'thin' : ''} ${o.tone || ''}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(w)}" aria-label="${o.label || 'Progress'}"><i style="width:${w}%"></i>${o.target != null ? html`<b style="left:calc(${(clamp01(o.target) * 100).toFixed(1)}% - 1px)" title="${o.targetLabel || 'expected'}"></b>` : ''}</div>`;
}
export function ring(p, o = {}) {
  const size = o.size || 56, sw = o.stroke || 6, r = (size - sw) / 2, c = 2 * Math.PI * r, v = clamp01(p || 0);
  return html`<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" ${raw(o.label ? 'role="img" aria-label="' + esc(o.label) + '"' : 'aria-hidden="true"')}>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${sw}"/>
    <circle class="ring-v" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${o.color || 'var(--ink)'}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - v)).toFixed(2)}" style="--len:${c.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    ${o.text != null ? html`<text x="50%" y="50%" dy=".35em" text-anchor="middle" class="ring-t">${o.text}</text>` : ''}</svg>`;
}
export const empty = (text, action, ic) => html`<div class="empty">${ic ? icon(ic) : ''}<p>${text}</p>${action || ''}</div>`;
export const linkBtn = (href, label, ic) => html`<a class="btn sm ghost" href="${href}">${label}${icon(ic || 'arrowR')}</a>`;

// ---------- count-up numbers (on page entry only) ----------
export function countUp(root) {
  if (reducedMotion()) return;
  $$('[data-count]', root).forEach((el) => {
    const to = +el.dataset.count, dec = +(el.dataset.dec || 0), suffix = el.dataset.suffix || '', t0 = performance.now(), dur = 750;
    if (!isFinite(to) || to === 0) return;
    const fmt = (v) => (dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-IN')) + suffix;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(to * e); if (k < 1) requestAnimationFrame(step); else el.textContent = fmt(to); };
    el.textContent = fmt(0);
    requestAnimationFrame(step);
  });
}

// ---------- toasts ----------
export function toast(msg, o = {}) {
  const box = $('#toasts'); if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (o.tone || '');
  el.setAttribute('role', o.tone === 'bad' ? 'alert' : 'status');
  el.innerHTML = String(icon(o.icon || (o.tone === 'bad' ? 'alert' : o.tone === 'warn' ? 'info' : 'checkCircle'))) + '<span>' + esc(msg) + '</span>';
  if (o.action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = o.action.label; b.addEventListener('click', () => { o.action.fn(); kill(); }); el.appendChild(b); }
  box.appendChild(el);
  let gone = false;
  const kill = () => { if (gone) return; gone = true; el.classList.add('out'); setTimeout(() => el.remove(), 220); };
  setTimeout(kill, o.ms || (o.action ? 6000 : 2600));
  while (box.children.length > 3) box.firstElementChild.remove();
}

// ---------- popover menu ----------
let openPop = null, popAnchor = null;
export function closeMenu() { if (openPop) { openPop.remove(); openPop = null; if (popAnchor) { popAnchor.setAttribute('aria-expanded', 'false'); popAnchor = null; } } }
export const menuOpen = () => !!openPop;
export function menu(anchor, items, o = {}) {
  if (openPop && popAnchor === anchor) { closeMenu(); return; }
  closeMenu();
  const el = document.createElement('div');
  el.className = 'pop ' + (o.cls || '');
  el.setAttribute('role', 'menu');
  if (o.html) el.innerHTML = String(o.html);
  else {
    el.innerHTML = items.filter(Boolean).map((it, i) => {
      if (it === '-') return '<hr>';
      if (it.heading) return '<h4>' + esc(it.heading) + '</h4>';
      const inner = (it.icon ? String(icon(it.icon)) : '') + '<span class="grow">' + esc(it.label) + (it.hint ? '<small>' + esc(it.hint) + '</small>' : '') + '</span>' + (it.kbd ? '<span class="kbd">' + esc(it.kbd) + '</span>' : '');
      return it.href ? '<a class="mi" role="menuitem" href="' + esc(it.href) + '"' + (it.active ? ' aria-current="page"' : '') + ' data-mi="' + i + '">' + inner + '</a>'
        : '<button type="button" class="mi" role="menuitem" data-mi="' + i + '"' + (it.active ? ' aria-current="page"' : '') + '>' + inner + '</button>';
    }).join('');
  }
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  let left = o.align === 'end' ? r.right - w : r.left;
  left = Math.max(12, Math.min(left, innerWidth - w - 12));
  let top = r.bottom + 8;
  if (top + h > innerHeight - 12 && r.top - h - 8 > 12) top = r.top - h - 8;
  el.style.left = left + 'px'; el.style.top = Math.max(12, top) + 'px';
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mi]'); if (!b) return;
    const it = items.filter(Boolean)[+b.dataset.mi];
    closeMenu();
    if (it && it.fn) { e.preventDefault(); it.fn(); }
  });
  el.addEventListener('keydown', (e) => {
    const list = $$('.mi', el), i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (list[i + 1] || list[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (list[i - 1] || list[list.length - 1]).focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); const a = anchor; closeMenu(); a.focus(); }
    else if (e.key === 'Tab') closeMenu();
  });
  openPop = el; popAnchor = anchor;
  anchor.setAttribute('aria-expanded', 'true');
  const first = $('[aria-current="page"], .mi', el);
  if (first && o.focus !== false) setTimeout(() => first.focus(), 0);
  return el;
}
document.addEventListener('pointerdown', (e) => { if (openPop && !openPop.contains(e.target) && !(popAnchor && popAnchor.contains(e.target))) closeMenu(); }, true);
window.addEventListener('resize', closeMenu);

// ---------- modal ----------
const stack = [];
export function modal(o) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const id = 'm' + Date.now().toString(36);
  scrim.innerHTML = '<div class="modal ' + (o.wide ? 'wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="' + id + '"><div class="modal-head"><h2 id="' + id + '">' + esc(o.title) + '</h2><button type="button" class="icon-btn" data-close aria-label="Close">' + icon('x') + '</button></div><div class="modal-body">' + String(o.body || '') + '</div>' + (o.foot ? '<div class="modal-foot">' + String(o.foot) + '</div>' : '') + '</div>';
  const prevFocus = document.activeElement;
  document.body.appendChild(scrim);
  document.body.classList.add('modal-open');
  const dlg = $('.modal', scrim);
  const close = (v) => {
    if (!scrim.isConnected) return;
    scrim.remove(); stack.splice(stack.indexOf(api), 1);
    if (!stack.length) document.body.classList.remove('modal-open');
    if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* element gone */ }
    if (o.onClose) o.onClose(v);
  };
  scrim.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('[data-close]')) close(); });
  scrim.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', dlg).filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  const api = { el: dlg, scrim, close };
  stack.push(api);
  setTimeout(() => { const a = $('[autofocus], input, select, textarea, .btn.primary', dlg) || $('[data-close]', dlg); if (a) a.focus(); }, 30);
  if (o.onOpen) o.onOpen(dlg, api);
  return api;
}
export const modalOpen = () => stack.length > 0;

// ---------- form in a modal ----------
function fieldHtml(f, v) {
  const id = 'ff-' + f.name, val = v == null ? '' : v;
  const req = f.required ? ' required' : '';
  let input;
  if (f.type === 'select') input = '<select class="in" id="' + id + '" name="' + f.name + '"' + req + '>' + f.options.map((x) => { const o = Array.isArray(x) ? x : [x, x]; return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
  else if (f.type === 'textarea') input = '<textarea class="in" id="' + id + '" name="' + f.name + '" rows="' + (f.rows || 3) + '"' + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + '>' + esc(val) + '</textarea>';
  else if (f.type === 'checkbox') return '<label class="row" style="grid-column:1/-1;min-height:40px"><input type="checkbox" id="' + id + '" name="' + f.name + '"' + (val ? ' checked' : '') + '> <span>' + esc(f.label) + '</span></label>';
  else if (f.type === 'info') return '<p class="hint" style="grid-column:1/-1">' + esc(f.text) + '</p>';
  else input = '<input class="in" id="' + id + '" name="' + f.name + '" type="' + (f.type || 'text') + '" value="' + esc(val) + '"' + (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') + (f.step != null ? ' step="' + f.step + '"' : '') + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + (f.type === 'number' ? ' inputmode="decimal"' : '') + (f.autofocus ? ' autofocus' : '') + req + '>';
  return '<label class="field" style="grid-column:' + (f.half ? 'span 1' : '1/-1') + '" for="' + id + '"><span>' + esc(f.label) + '</span>' + input + '</label>';
}
export function form(o) {
  const body = (o.intro ? '<p class="muted" style="margin-bottom:12px">' + esc(o.intro) + '</p>' : '') + '<form class="mform" novalidate><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">' + o.fields.map((f) => fieldHtml(f, (o.values || {})[f.name])).join('') + '</div><p class="hint" role="alert" data-err style="color:var(--bad)"></p></form>';
  const foot = (o.onDelete ? '<button type="button" class="btn ghost danger" data-del>' + icon('trash') + 'Delete</button><span class="grow"></span>' : '') + '<button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" data-ok>' + esc(o.submitLabel || 'Save') + '</button>';
  const m = modal({ title: o.title, body: raw(body), foot: raw(foot), wide: o.wide });
  const read = () => { const out = {}; o.fields.forEach((f) => { if (f.type === 'info') return; const el = m.el.querySelector('[name="' + f.name + '"]'); if (!el) return; out[f.name] = f.type === 'checkbox' ? el.checked : f.type === 'number' ? (el.value.trim() === '' ? null : Number(el.value)) : el.value.trim(); }); return out; };
  const submit = () => {
    const v = read(), errBox = m.el.querySelector('[data-err]');
    const missing = o.fields.find((f) => f.required && (v[f.name] == null || v[f.name] === ''));
    if (missing) { errBox.textContent = 'Fill in “' + missing.label + '”.'; m.el.querySelector('[name="' + missing.name + '"]').focus(); return; }
    const err = o.onSubmit(v);
    if (typeof err === 'string') { errBox.textContent = err; return; }
    m.close(true);
  };
  m.el.querySelector('[data-ok]').addEventListener('click', submit);
  m.el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  m.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); submit(); } });
  const del = m.el.querySelector('[data-del]');
  if (del) del.addEventListener('click', async () => { if (await confirm({ title: 'Delete this?', body: o.deleteBody || 'This can’t be undone.', ok: 'Delete', danger: true })) { o.onDelete(); m.close(true); } });
  if (o.onOpen) o.onOpen(m.el);
  return m;
}
export function confirm(o) {
  return new Promise((res) => {
    let answered = false;
    const m = modal({
      title: o.title, body: raw('<p class="muted">' + esc(o.body || '') + '</p>'),
      foot: raw('<button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn ' + (o.danger ? 'danger' : 'primary') + '" data-yes autofocus>' + esc(o.ok || 'OK') + '</button>'),
      onClose: () => { if (!answered) res(false); }
    });
    m.el.querySelector('[data-yes]').addEventListener('click', () => { answered = true; m.close(); res(true); });
  });
}
