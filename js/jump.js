/* Jump bar: on long pages, a sticky row of section chips under the page title. Tap one to scroll there; the chip
   for the section you're reading lights up as you scroll. Sections are the page's titled cards, or any element
   marked data-jump="Label" (the Dashboard's bands, the papers in Subjects). Rebuilt after every render. */
import { $, $$, esc, reducedMotion } from './util.js';

let bar = null, inner = null, secs = [], route = '', keepLeft = 0, lockTo = -1, lockT = 0, raf = 0, rafT = 0, bound = false;

// a chip label: the title before any " · detail", cut at a word when it's long
const short = (s) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim().split(' · ')[0];
  if (t.length <= 26) return t;
  const cut = t.slice(0, 25), sp = cut.lastIndexOf(' ');
  return (sp > 12 ? cut.slice(0, sp) : cut).replace(/[\s,;:–-]+$/, '') + '…';
};

function collect(page) {
  const out = [];
  $$('.card, [data-jump]', page).forEach((el) => {
    if (el.offsetParent === null) return;   // hidden at this width
    if (el.hasAttribute('data-jump')) { out.push({ el, label: el.dataset.jump }); return; }
    if (el.parentElement.closest('.card, [data-jump]')) return;   // inside a section already counted
    if (el.querySelector('[data-jump]')) return;                  // its own parts are the sections
    const h = el.querySelector(':scope > .card-head h2');
    if (h && short(h.textContent)) out.push({ el, label: short(h.textContent) });
  });
  return out;
}

// how far below the top of the window a section lands: under the top bar and this bar
const offset = () => (bar ? parseFloat(getComputedStyle(bar).top) || 0 : 0) + (bar ? bar.offsetHeight : 0) + 14;

export function build(main, routeId) {
  if (routeId !== route) { route = routeId; keepLeft = 0; lockTo = -1; }
  bar = null; inner = null; secs = [];
  const page = $('.page', main); if (!page) return;
  const found = collect(page);
  if (found.length < 3 || document.documentElement.scrollHeight < innerHeight * 1.6) return;
  secs = found;
  const nav = document.createElement('nav');
  nav.className = 'jump';
  nav.setAttribute('aria-label', 'Sections on this page');
  nav.innerHTML = '<div class="jump-in">' + found.map((s, i) => '<button type="button" data-jump-i="' + i + '">' + esc(s.label) + '</button>').join('') + '</div>';
  page.before(nav);
  bar = nav; inner = nav.firstElementChild;
  inner.scrollLeft = keepLeft;
  inner.addEventListener('scroll', () => { keepLeft = inner.scrollLeft; }, { passive: true });
  inner.addEventListener('click', (e) => {
    const b = e.target.closest('[data-jump-i]'); if (!b) return;
    const i = +b.dataset.jumpI, s = secs[i]; if (!s || !s.el.isConnected) return;
    lockTo = i; clearTimeout(lockT); lockT = setTimeout(() => { lockTo = -1; spy(); }, 900);
    mark(i);
    window.scrollTo({ top: Math.max(0, s.el.getBoundingClientRect().top + window.scrollY - offset()), behavior: reducedMotion() ? 'auto' : 'smooth' });
  });
  if (!bound) {
    bound = true;
    // once a frame while scrolling (with a timer as backup, for windows that don't draw frames in the background)
    const run = () => { if (!raf) return; cancelAnimationFrame(raf); clearTimeout(rafT); raf = 0; spy(); };
    window.addEventListener('scroll', () => { if (raf) return; raf = requestAnimationFrame(run) || 1; rafT = setTimeout(run, 100); }, { passive: true });
  }
  spy(true);
}

function mark(i, instant) {
  if (!inner) return;
  $$('[data-jump-i]', inner).forEach((b) => { if (+b.dataset.jumpI === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
  const b = $('[data-jump-i="' + i + '"]', inner); if (!b) return;
  const left = b.offsetLeft - (inner.clientWidth - b.offsetWidth) / 2;
  if (Math.abs(inner.scrollLeft - left) > 4) inner.scrollTo({ left: Math.max(0, left), behavior: instant || reducedMotion() ? 'auto' : 'smooth' });
}

function spy(instant) {
  if (!bar || !bar.isConnected || !secs.length) return;
  bar.classList.toggle('stuck', bar.getBoundingClientRect().top <= parseFloat(getComputedStyle(bar).top) + 0.5 && window.scrollY > 8);
  if (lockTo >= 0) return;
  const off = offset() + 8, doc = document.documentElement;
  let cur = 0;
  secs.forEach((s, i) => { if (s.el.isConnected && s.el.getBoundingClientRect().top <= off) cur = i; });
  if (window.scrollY + innerHeight >= doc.scrollHeight - 4 && window.scrollY > 0) cur = secs.length - 1;
  mark(cur, instant);
}
