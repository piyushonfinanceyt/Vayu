/* Focus timer: Pomodoro / Deep Work / Short Break. State lives in the store (so a reload keeps a running timer);
   a finished focus session is saved in 'sessions' and its minutes are added to that day's study hours. */
import * as store from './store.js';
import { $, esc, raw, todayStr, mmss, plural } from './util.js';
import { icon } from './icons.js';
import { modal, toast } from './components.js';

export const MODES = { pomodoro: { label: 'Pomodoro', focus: true, def: 25 }, deep: { label: 'Deep Work', focus: true, def: 50 }, short: { label: 'Short Break', focus: false, def: 5 } };
const durOf = (mode) => Math.round((+(store.settings().timer || {})[mode] || MODES[mode].def) * 60);
export function state() { const s = store.S.timer; return s && MODES[s.mode] ? s : { mode: 'pomodoro', dur: durOf('pomodoro'), endsAt: null, remaining: null }; }
export const remaining = () => { const s = state(); return s.endsAt ? Math.max(0, (s.endsAt - Date.now()) / 1000) : (s.remaining == null ? s.dur : s.remaining); };
export const running = () => !!state().endsAt;

let audio = null;
function beep() {
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    audio = audio || new C();
    [0, 0.25, 0.5].forEach((t) => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.0001, audio.currentTime + t); g.gain.exponentialRampToValueAtTime(0.2, audio.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.2); o.connect(g).connect(audio.destination); o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.22); });
  } catch (e) { /* sound is optional */ }
}
export function start() { const s = state(); store.setTimerState(Object.assign({}, s, { endsAt: Date.now() + remaining() * 1000, startedAt: s.startedAt || new Date().toISOString(), remaining: null })); }
export function pause() { const s = state(); store.setTimerState(Object.assign({}, s, { remaining: remaining(), endsAt: null })); }
export function reset(mode) { const m = mode || state().mode; store.setTimerState({ mode: m, dur: durOf(m), endsAt: null, remaining: null, startedAt: null }); }
// deep focus (focus.js): a full-screen session on one subject (and maybe one chapter) or general study
export function startFocus(minutes, focus) {
  const dur = Math.round(minutes * 60);
  store.setTimerState({ mode: 'deep', dur, endsAt: Date.now() + dur * 1000, remaining: null, startedAt: new Date().toISOString(), deep: true, focus: focus || { kind: 'general' }, distractions: 0 });
}
export function distracted() { const s = state(); store.setTimerState(Object.assign({}, s, { distractions: (+s.distractions || 0) + 1 })); }
let onDeepDone = null;
export const onFocusComplete = (fn) => { onDeepDone = fn; };
// saves a focus session for `mins` minutes (with what it was on) and credits the day's study hours
function save(s, mins) {
  const date = todayStr(), f = s.focus || {};
  const rec = { date, mode: s.mode, minutes: mins, credited: mins, startedAt: s.startedAt, endedAt: new Date().toISOString() };
  if (s.deep) Object.assign(rec, { deep: true, subject: f.subject || '', chapterId: f.chapterId || null, round: f.round || '', intention: f.intention || '', distractions: +s.distractions || 0, planned: Math.round(s.dur / 60) });
  store.add('sessions', rec, 'fs');
  store.addStudyMinutes(date, mins);
  return rec;
}
function complete() {
  const s = state(), mins = Math.round(s.dur / 60);
  let rec = null;
  store.batch(() => {
    if (MODES[s.mode].focus) rec = save(s, mins);
    reset(MODES[s.mode].focus ? 'short' : 'pomodoro');
  });
  beep();
  if (s.deep && onDeepDone) { onDeepDone(rec, s, true); return; }
  toast(MODES[s.mode].focus ? plural(mins, 'minute') + ' added to today’s study hours' : 'Break over. Back to it.', { icon: 'timer', ms: 5000 });
}
// stop a deep focus session early: the minutes actually spent still count (a minute or more)
export function endEarly() {
  const s = state(), mins = Math.floor((s.dur - remaining()) / 60);
  let rec = null;
  store.batch(() => { if (mins >= 1) rec = save(s, mins); reset('pomodoro'); });
  if (s.deep && onDeepDone) onDeepDone(rec, s, false);
  return mins;
}
export function tick() {
  if (running() && remaining() <= 0) complete();
  const r = remaining(), s = state();
  document.querySelectorAll('[data-timer-text]').forEach((el) => { el.textContent = mmss(r); });
  document.querySelectorAll('[data-timer-ring]').forEach((el) => { const c = +el.dataset.c; el.setAttribute('stroke-dashoffset', (c * (1 - r / s.dur)).toFixed(2)); });
  const dock = $('#dock-timer');
  if (dock) { const on = running(); if (on !== dock.classList.contains('running')) { dock.classList.toggle('running', on); dock.innerHTML = String(icon('timer')) + (on ? '<span class="run-dot"></span>' : ''); } dock.dataset.tip = on ? 'Focus · ' + mmss(r) + ' left' : 'Focus timer'; }
}

// inline timer for the Tools page (buttons are handled by the view: tm-toggle, tm-reset, tm-mode)
export function widget() {
  const s = state(), r = remaining(), C = 2 * Math.PI * 96;
  return '<div class="tm-widget"><div class="seg ink" role="group" aria-label="Timer mode">' + Object.keys(MODES).map((k) => '<button type="button" data-act="tm-mode" data-v="' + k + '" aria-pressed="' + (s.mode === k) + '">' + esc(MODES[k].label) + '</button>').join('') + '</div>' +
    '<div class="tm-ring"><svg viewBox="0 0 220 220" width="220" height="220" aria-hidden="true"><circle cx="110" cy="110" r="96" fill="none" stroke="var(--track)" stroke-width="10"/><circle data-timer-ring data-c="' + C.toFixed(2) + '" cx="110" cy="110" r="96" fill="none" stroke="var(--ink)" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="' + (C * (1 - r / s.dur)).toFixed(2) + '" transform="rotate(-90 110 110)"/></svg>' +
    '<div class="tm-center"><div data-timer-text role="timer" aria-live="off">' + mmss(r) + '</div><div class="lbl">' + esc(MODES[s.mode].label) + (MODES[s.mode].focus ? ' · counts as study' : '') + '</div></div></div>' +
    '<div class="row"><button type="button" class="btn primary" data-act="tm-toggle" style="min-width:120px">' + icon(running() ? 'pause' : 'play') + (running() ? 'Pause' : remaining() < s.dur ? 'Resume' : 'Start') + '</button><button type="button" class="btn" data-act="tm-reset">' + icon('reset') + 'Reset</button></div></div>';
}

export function open() {
  const C = 2 * Math.PI * 96;
  const body = () => {
    const s = state(), r = remaining();
    return '<div style="display:grid;place-items:center;gap:16px;padding:6px 0 4px">' +
      '<div class="seg ink" role="group" aria-label="Timer mode">' + Object.keys(MODES).map((k) => '<button type="button" data-tm-mode="' + k + '" aria-pressed="' + (s.mode === k) + '">' + esc(MODES[k].label) + '</button>').join('') + '</div>' +
      '<div style="position:relative;width:220px;height:220px"><svg viewBox="0 0 220 220" width="220" height="220" aria-hidden="true"><circle cx="110" cy="110" r="96" fill="none" stroke="var(--track)" stroke-width="10"/><circle data-timer-ring data-c="' + C.toFixed(2) + '" cx="110" cy="110" r="96" fill="none" stroke="var(--ink)" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="' + (C * (1 - r / s.dur)).toFixed(2) + '" transform="rotate(-90 110 110)"/></svg>' +
      '<div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center"><div><div data-timer-text role="timer" aria-live="off" style="font-size:46px;font-weight:500;letter-spacing:-.03em">' + mmss(r) + '</div><div class="lbl">' + esc(MODES[s.mode].label) + (MODES[s.mode].focus ? ' · counts as study' : '') + '</div></div></div></div>' +
      '<div class="row"><button type="button" class="btn primary" data-tm="toggle" style="min-width:120px">' + icon(running() ? 'pause' : 'play') + (running() ? 'Pause' : remaining() < s.dur ? 'Resume' : 'Start') + '</button><button type="button" class="btn" data-tm="reset">' + icon('reset') + 'Reset</button></div>' +
      '<button type="button" class="btn ghost" data-tm="deep">' + icon('target') + 'Deep focus on a subject…</button>' +
      '<p class="hint" style="text-align:center">Finished focus sessions are added to today’s hours in the 10 PM log. Lengths are in Settings.</p></div>';
  };
  const m = modal({ title: 'Focus timer', body: raw(body()) });
  const redraw = () => { m.el.querySelector('.modal-body').innerHTML = body(); };
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tm], [data-tm-mode]'); if (!b) return;
    if (b.dataset.tm === 'deep') { m.close(); document.dispatchEvent(new CustomEvent('vayu:focus')); return; }
    if (b.dataset.tmMode) reset(b.dataset.tmMode);
    else if (b.dataset.tm === 'toggle') { if (running()) pause(); else start(); }
    else reset();
    redraw();
  });
}
