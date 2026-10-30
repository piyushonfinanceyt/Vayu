/* Deep focus: a full-screen study session on one paper (and, if you like, one chapter) or on general study.
   - Set up: General or one of the six papers (each shows its focus time this week), then an optional chapter from that
     paper (in progress first, then overdue and today's), a length (your Pomodoro and Deep Work lengths, 90 or your
     own) and an optional one-line intention.
   - In focus: everything else is covered; only the paper, the chapter, the ring and the time remain. The screen
     stays awake (Wake Lock, where the browser allows it), toasts and reminders wait, and "Lost focus" keeps an
     honest count of distractions. Minimise hides it while the timer keeps running; the dock timer brings it back.
   - Finished, or ended early: the minutes spent go to today's study hours as a session tagged with the paper,
     chapter, intention and distractions; then mark the chapter done or in progress, take a 5-minute break, or go again.
   The timer state lives in the store (timer.js), so a reload during a session reopens it. */
import { raw, esc, fmtMins, plural, mondayOf, sortBy, mmss, fmtDS } from './util.js';
import { icon } from './icons.js';
import { modal, toast, confirm } from './components.js';
import { pref, setPref } from './prefs.js';
import * as store from './store.js';
import * as timer from './timer.js';
import { model } from './model.js';

const C = 2 * Math.PI * 120;
let el = null, lock = null, setup = null;

const weekBySubject = (t) => {
  const from = mondayOf(t), out = { '': 0 };
  store.list('sessions').filter((s) => s.date >= from && s.date <= t).forEach((s) => { const k = s.subject || ''; out[k] = (out[k] || 0) + (+s.minutes || 0); });
  return out;
};
const chapterOptions = (M, subject) => {
  const open = M.chapters.filter((c) => c.subject === subject && c.status !== 'done');
  const rank = (c) => (c.status === 'progress' ? 0 : c.flag === 'overdue' ? 1 : c.flag === 'today' ? 2 : 3);
  return sortBy(open, (c) => rank(c) + '|' + c.planned).slice(0, 14);
};
const label = (M, f) => {
  if (!f || f.kind !== 'subject') return { name: 'General study', sub: f && f.intention ? '' : 'Any subject', c: 'var(--ink-3)' };
  const w = M.WMAP[f.subject] || {}, ch = f.chapterId ? M.chapters.find((c) => String(c.id) === String(f.chapterId)) : null;
  return { name: (w.code ? w.code + ' ' : '') + (w.short || f.subject) + (f.round ? ' · ' + f.round : ''), sub: ch ? '#' + ch.id + ' ' + ch.name : 'Any chapter', c: w.c || 'var(--ink)' };
};

// ---------- set up ----------
export function openSetup(preset) {
  const M = model(), t = M.t, wk = weekBySubject(t);
  setup = Object.assign({ kind: pref('focusKind', 'general'), subject: pref('focusSubject', 'Accounts'), chapterId: '', minutes: +pref('focusMinutes', 50) || 50, intention: '' }, preset || {});
  const st = M.st.timer || {}, lens = [...new Set([+st.pomodoro || 25, +st.deep || 50, 90])].sort((a, b) => a - b);
  const body = () => {
    const ch = setup.kind === 'subject' ? chapterOptions(M, setup.subject) : [];
    const tile = (k, name, sub, c, on) => `<button type="button" class="fx-pick${on ? ' on' : ''}" data-fx-pick="${esc(k)}" aria-pressed="${on}"><i class="dot" style="--c:${c}"></i><b>${esc(name)}</b><small>${esc(sub)}</small></button>`;
    return `<div class="fx-setup">
      <span class="lbl">Focus on</span>
      <div class="fx-picks">${tile('general', 'General', fmtMins(wk[''] || 0) + ' this week', 'var(--ink-3)', setup.kind === 'general')}${M.worlds.map((w) => tile(w.key, w.code + ' ' + w.short, fmtMins(wk[w.key] || 0) + ' this week', w.c, setup.kind === 'subject' && setup.subject === w.key)).join('')}</div>
      ${setup.kind === 'subject' ? `<label class="field"><span>Chapter</span><select class="in" data-fx-ch><option value="">Any chapter in ${esc(M.WMAP[setup.subject].short)}</option>${ch.map((c) => `<option value="${c.id}"${String(setup.chapterId) === String(c.id) ? ' selected' : ''}>#${c.id} ${esc(c.name)}${c.status === 'progress' ? ' · in progress' : c.flag === 'overdue' ? ' · overdue' : c.flag === 'today' ? ' · today' : ' · ' + fmtDS(c.planned)}</option>`).join('')}</select></label>` : ''}
      <span class="lbl">How long</span>
      <div class="seg" role="group" aria-label="Length">${lens.map((n) => `<button type="button" data-fx-len="${n}" aria-pressed="${setup.minutes === n}">${n} min</button>`).join('')}<label class="fx-own"><input class="in sm" type="number" min="5" max="180" step="5" inputmode="numeric" data-fx-own value="${lens.includes(setup.minutes) ? '' : setup.minutes}" placeholder="Own" aria-label="Your own length in minutes"></label></div>
      <label class="field"><span>Intention · optional</span><input class="in" type="text" maxlength="80" data-fx-int value="${esc(setup.intention)}" placeholder="${setup.kind === 'subject' ? 'Finish the illustrations on ' + esc(M.WMAP[setup.subject].short) : 'Clear today’s revision list'}"></label>
      <p class="hint">Everything else is hidden until the time is up or you end it. The minutes count towards today’s study hours${setup.kind === 'subject' ? ' and ' + esc(M.WMAP[setup.subject].short) + '’s focus time' : ''}.</p></div>`;
  };
  const m = modal({ title: 'Deep focus', body: raw(body()), foot: raw('<button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" data-fx-go>' + icon('play') + 'Start focus</button>') });
  const redraw = () => { const keep = (m.el.querySelector('[data-fx-int]') || {}).value; if (keep != null) setup.intention = keep; m.el.querySelector('.modal-body').innerHTML = body(); };
  m.el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-fx-pick]'), l = e.target.closest('[data-fx-len]');
    if (p) { const k = p.dataset.fxPick; if (k === 'general') setup.kind = 'general'; else { setup.kind = 'subject'; if (setup.subject !== k) setup.chapterId = ''; setup.subject = k; } redraw(); }
    if (l) { setup.minutes = +l.dataset.fxLen; redraw(); }
    if (e.target.closest('[data-fx-go]')) {
      const own = +(m.el.querySelector('[data-fx-own]') || {}).value;
      if (own) setup.minutes = Math.max(5, Math.min(180, Math.round(own)));
      setup.intention = ((m.el.querySelector('[data-fx-int]') || {}).value || '').trim();
      const chSel = m.el.querySelector('[data-fx-ch]'); setup.chapterId = chSel ? chSel.value : '';
      setPref('focusKind', setup.kind); setPref('focusSubject', setup.subject); setPref('focusMinutes', setup.minutes);
      m.close();
      timer.startFocus(setup.minutes, setup.kind === 'subject' ? { kind: 'subject', subject: setup.subject, chapterId: setup.chapterId ? +setup.chapterId || setup.chapterId : null, intention: setup.intention } : { kind: 'general', intention: setup.intention });
      enter();
    }
  });
  m.el.addEventListener('change', (e) => { if (e.target.matches('[data-fx-ch]')) setup.chapterId = e.target.value; if (e.target.matches('[data-fx-own]') && +e.target.value) { setup.minutes = Math.max(5, Math.min(180, Math.round(+e.target.value))); } });
}

// ---------- in focus ----------
async function wake(on) {
  try {
    if (on && navigator.wakeLock && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
    if (!on && lock) { await lock.release(); lock = null; }
  } catch (e) { lock = null; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && el && timer.running()) wake(true); });
document.addEventListener('vayu:focus', () => openSetup());   // from the focus timer dialog (timer.js can't import this module)

function screen() {
  const M = model(), s = timer.state(), L = label(M, s.focus), r = timer.remaining(), run = timer.running();
  return `<div class="fx-top"><span class="fx-tag"><i class="dot" style="--c:${L.c}"></i>Deep focus</span><button type="button" class="icon-btn" data-fx="min" aria-label="Minimise, the timer keeps running">${icon('minimize')}</button></div>
    <div class="fx-mid"><div class="fx-what"><b>${esc(L.name)}</b><span>${esc(L.sub)}</span></div>
      <div class="fx-ring ${run ? 'fx-on' : ''}"><svg viewBox="0 0 280 280" aria-hidden="true"><circle cx="140" cy="140" r="120" fill="none" stroke="var(--fx-track)" stroke-width="8"/><circle data-timer-ring data-c="${C.toFixed(2)}" cx="140" cy="140" r="120" fill="none" stroke="${L.c}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - r / s.dur)).toFixed(2)}" transform="rotate(-90 140 140)"/></svg>
        <div class="fx-time"><span data-timer-text role="timer" aria-live="off">${mmss(r)}</span><small>${run ? 'of ' + Math.round(s.dur / 60) + ' min' : 'paused'}</small></div></div>
      ${s.focus && s.focus.intention ? `<p class="fx-int">“${esc(s.focus.intention)}”</p>` : ''}</div>
    <div class="fx-bot"><button type="button" class="btn fx-btn" data-fx="lost">${icon('wave')}Lost focus${+s.distractions ? ' · ' + s.distractions : ''}</button><button type="button" class="btn fx-btn primary" data-fx="toggle">${icon(run ? 'pause' : 'play')}${run ? 'Pause' : 'Resume'}</button><button type="button" class="btn fx-btn" data-fx="end">${icon('stop')}End</button></div>`;
}
export function enter() {
  if (!el) {
    el = document.createElement('div');
    el.className = 'focus-mode'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Deep focus');
    el.addEventListener('click', onClick);
    document.body.append(el);
  }
  document.body.classList.add('focus-on');
  el.hidden = false;
  el.innerHTML = screen();
  wake(timer.running());
  setTimeout(() => { const b = el && el.querySelector('[data-fx="toggle"]'); if (b) b.focus(); }, 30);
}
function leave() { if (el) { el.remove(); el = null; } document.body.classList.remove('focus-on'); wake(false); }
async function onClick(e) {
  const b = e.target.closest('[data-fx]'); if (!b) return;
  const a = b.dataset.fx;
  if (a === 'min') { leave(); toast('Focus continues · the timer button brings it back', { icon: 'timer' }); return; }
  if (a === 'toggle') { if (timer.running()) timer.pause(); else timer.start(); el.innerHTML = screen(); wake(timer.running()); return; }
  if (a === 'lost') { timer.distracted(); el.innerHTML = screen(); return; }
  if (a === 'end') {
    const s = timer.state(), done = Math.floor((s.dur - timer.remaining()) / 60);
    if (!(await confirm({ title: 'End this focus session?', body: done >= 1 ? plural(done, 'minute') + ' of ' + Math.round(s.dur / 60) + ' will count towards today’s study hours.' : 'Less than a minute has passed, so nothing will be added.', ok: 'End session' }))) return;
    timer.endEarly();
    return;
  }
  if (a === 'done') { leave(); return; }
  if (a === 'break') { leave(); timer.reset('short'); timer.start(); toast('5-minute break started', { icon: 'timer' }); return; }
  if (a === 'again') { const f = b.dataset.f ? JSON.parse(b.dataset.f) : {}; leave(); openSetup(f); return; }
  if (a === 'rev-done') { store.setRec('chapters', b.dataset.id, b.dataset.field, true); b.closest('.fx-ch').innerHTML = '<p class="fx-ok">' + icon('checkCircle') + esc(b.dataset.round) + ' marked done</p>'; return; }
  if (a === 'ch-done' || a === 'ch-prog') { store.setRec('chapters', b.dataset.id, 'status', a === 'ch-done' ? 'done' : 'progress'); b.closest('.fx-ch').innerHTML = '<p class="fx-ok">' + icon('checkCircle') + (a === 'ch-done' ? 'Marked done' : 'Marked in progress') + '</p>'; }
}

// ---------- finished ----------
timer.onFocusComplete((rec, s, full) => {
  const M = model(), L = label(M, s.focus), f = s.focus || {}, mins = rec ? rec.minutes : 0;
  const ch = f.chapterId ? M.chapters.find((c) => String(c.id) === String(f.chapterId)) : null;
  const wk = weekBySubject(M.t), key = f.kind === 'subject' ? f.subject : '';
  if (!el) enter();
  wake(false);
  el.innerHTML = `<div class="fx-top"><span class="fx-tag"><i class="dot" style="--c:${L.c}"></i>Deep focus</span></div>
    <div class="fx-mid fx-end">${icon(full ? 'checkCircle' : 'flag')}<h2>${full ? 'Session complete' : mins ? 'Session ended' : 'Session ended early'}</h2>
      <p>${mins ? plural(mins, 'minute') + ' on ' + esc(L.name) + ' added to today’s study hours.' : 'Nothing was added: it was under a minute.'}</p>
      <p class="fx-meta">${+s.distractions ? plural(+s.distractions, 'lost-focus moment') : 'No lost-focus moments'} · ${esc(f.kind === 'subject' ? (M.WMAP[f.subject] || {}).short || f.subject : 'General')} this week ${fmtMins(wk[key] || 0)}</p>
      ${ch && f.revField && mins ? `<div class="fx-ch"><p>#${ch.id} ${esc(ch.name)}</p><div class="row wrap" style="justify-content:center"><button type="button" class="btn" data-fx="rev-done" data-id="${ch.id}" data-field="${esc(f.revField)}" data-round="${esc(f.round)}">${icon('check')}Mark ${esc(f.round)} done</button></div></div>` : ''}
      ${ch && ch.status !== 'done' ? `<div class="fx-ch"><p>#${ch.id} ${esc(ch.name)}</p><div class="row wrap" style="justify-content:center"><button type="button" class="btn" data-fx="ch-done" data-id="${ch.id}">${icon('check')}Mark it done</button>${ch.status === 'pending' ? `<button type="button" class="btn ghost" data-fx="ch-prog" data-id="${ch.id}">Still in progress</button>` : ''}</div></div>` : ''}</div>
    <div class="fx-bot"><button type="button" class="btn fx-btn" data-fx="break">${icon('timer')}5-minute break</button><button type="button" class="btn fx-btn" data-fx="again" data-f="${esc(JSON.stringify({ kind: f.kind || 'general', subject: f.subject || pref('focusSubject', 'Accounts'), chapterId: f.chapterId || '', minutes: Math.round(s.dur / 60) }))}">${icon('reset')}Go again</button><button type="button" class="btn fx-btn primary" data-fx="done">Done</button></div>`;
  setTimeout(() => { const b = el && el.querySelector('[data-fx="done"]'); if (b) b.focus(); }, 30);
});

// a reload, or tapping the timer, while a deep focus session is on brings the screen back
export const active = () => { const s = timer.state(); return !!s.deep && (timer.running() || s.remaining != null); };
export function resume() { if (active()) enter(); }
