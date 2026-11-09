/* Small touches that make the whole app nicer to use, wherever you are in it.
   - A tick pops: the box you just ticked (a chapter, a task, a quest, a habit) springs and draws its check. Only
     that box, and it carries on smoothly when the page redraws under it. Unticking stays quiet.
   - Swipe on a phone: on a day-by-day page (Study Plan, Daily Log, Journal, Calendar), swipe left for the next
     day and right for the one before; the page slides in from that side. [ and ] do the same on a keyboard.
   - Back to top: on a long page, once you're a couple of screens down, a round button takes you to the top.
   All of it follows "reduce motion": no pop, no slide, an instant jump. */
import { reducedMotion } from './util.js';
import { icon } from './icons.js';
import { modalOpen } from './components.js';
import { currentView, current, nudge } from './router.js';
import { isOpen as paletteOpen } from './palette.js';
import * as hyper from './hyper.js';
import * as focus from './focus.js';

// ---------- 1. a tick pops ----------
const TICKS = '[role="checkbox"], .cbx, .hc';
const isOn = (n) => (n.getAttribute('aria-checked') || n.getAttribute('aria-pressed')) === 'true';
const POP = [{ transform: 'scale(.8)' }, { transform: 'scale(1.14)', offset: 0.45 }, { transform: 'scale(1)' }];
const DRAW = [{ strokeDashoffset: 23 }, { strokeDashoffset: 0 }];
const POP_MS = 420;
let tk = null, obs = null, endT = 0;

// the same box after a redraw: by id, else by what it toggles
function find() {
  if (tk.id) return document.getElementById(tk.id);
  if (tk.sel) { try { return document.querySelector(tk.sel); } catch (e) { return null; } }
  return tk.el.isConnected ? tk.el : null;
}
function play() {
  if (!tk) return;
  const n = find();
  if (!n || n === tk.last || !isOn(n)) return;
  tk.last = n;
  if (!tk.t0) tk.t0 = performance.now();
  const at = performance.now() - tk.t0;   // a redraw mid-pop picks up where the old box was
  if (at > POP_MS) return;
  const a = n.animate(POP, { duration: POP_MS, easing: 'cubic-bezier(.2,.8,.2,1)' }); a.currentTime = at;
  const p = n.querySelector('svg path');
  if (p) { p.style.strokeDasharray = '23'; const d = p.animate(DRAW, { duration: 300, delay: 60, easing: 'ease-out', fill: 'backwards' }); d.currentTime = at; }
}
function stop() { if (obs) obs.disconnect(); obs = null; clearTimeout(endT); tk = null; }
document.addEventListener('click', (e) => {
  const b = e.target && e.target.closest ? e.target.closest(TICKS) : null;
  if (!b || isOn(b) || b.getAttribute('aria-disabled') === 'true' || reducedMotion() || !b.animate) return;
  stop();
  const keys = ['data-act', 'data-id', 'data-date', 'data-h'].filter((k) => b.hasAttribute(k));
  tk = { id: b.id, el: b, last: null, t0: 0, sel: keys.length ? keys.map((k) => '[' + k + '="' + CSS.escape(b.getAttribute(k)) + '"]').join('') : '' };
  obs = new MutationObserver(play);
  obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked', 'aria-pressed'] });
  endT = setTimeout(stop, 1500);
  setTimeout(play, 0);   // a box that ticks itself in place
}, true);

// ---------- 2. swipe a day-by-day page ----------
let sw = null;
const scrollsX = (n) => {
  for (let p = n; p && p !== document.body; p = p.parentElement) {
    if (p.scrollWidth > p.clientWidth + 2) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; }
  }
  return false;
};
document.addEventListener('touchstart', (e) => {
  sw = null;
  const v = currentView(), t = e.target;
  if (e.touches.length !== 1 || !v || !v.step || !t.closest) return;
  if (modalOpen() || paletteOpen() || hyper.isOpen() || focus.shown() || document.body.classList.contains('modal-open')) return;
  if (!t.closest('#main') || t.closest('input, textarea, select, [contenteditable="true"], svg, canvas, .jump, [data-noswipe]') || scrollsX(t)) return;
  const p = e.touches[0];
  if (p.clientX < 24 || p.clientX > innerWidth - 24) return;   // edge swipes are the browser's own back and forward
  sw = { x: p.clientX, y: p.clientY, t: Date.now() };
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (!sw) return;
  const s = sw, p = e.changedTouches[0], dx = p.clientX - s.x, dy = p.clientY - s.y; sw = null;
  if (Date.now() - s.t > 700 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
  if (window.getSelection && String(window.getSelection())) return;   // selecting text, not swiping
  step(dx < 0 ? 1 : -1);
}, { passive: true });
document.addEventListener('touchcancel', () => { sw = null; }, { passive: true });
// one day on (1) or back (-1), sliding in from that side; also the [ and ] keys (main.js)
export function step(d) {
  const v = currentView();
  if (!v || !v.step) return false;
  nudge(d);
  v.step(d, current().q);
  return true;
}

// ---------- 3. back to top ----------
const top = document.createElement('button');
top.type = 'button'; top.className = 'totop'; top.id = 'totop';
top.setAttribute('aria-label', 'Back to top'); top.title = 'Back to top';
top.tabIndex = -1; top.setAttribute('aria-hidden', 'true');
top.innerHTML = String(icon('arrowUp'));
document.body.appendChild(top);
let shown = false, raf = 0;
function place() {
  raf = 0;
  const on = window.scrollY > innerHeight * 2 && document.documentElement.scrollHeight > innerHeight * 3.5;
  if (on === shown) return;
  shown = on;
  top.classList.toggle('on', on);
  top.tabIndex = on ? 0 : -1;
  if (on) top.removeAttribute('aria-hidden'); else top.setAttribute('aria-hidden', 'true');
}
window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(place); }, { passive: true });
window.addEventListener('resize', () => { if (!raf) raf = requestAnimationFrame(place); }, { passive: true });
top.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  const m = document.getElementById('main');
  if (m) { try { m.focus({ preventScroll: true }); } catch (e) { m.focus(); } }
});
