/* Per-device conveniences (theme, filters, folded groups, last tab) in localStorage.
   Every access is wrapped: in a private window or with storage blocked it quietly falls back to memory. */
const KEY = 'fc.prefs';
let P = {};
try { P = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { P = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* memory only */ } };

export const prefs = () => P;
export const pref = (k, d) => (P[k] === undefined ? d : P[k]);
export function setPref(k, v) { P[k] = v; save(); }
export function setPrefs(o) { Object.assign(P, o); save(); }
export function isOpen(key, dflt) { const o = P.open || {}; return o[key] === undefined ? !!dflt : !!o[key]; }
export function setOpen(key, v) { P.open = Object.assign({}, P.open, { [key]: v }); save(); }

// ---------- theme: 'system' | 'light' | 'dark' ----------
const mq = (() => { try { return matchMedia('(prefers-color-scheme: dark)'); } catch (e) { return null; } })();
export const themePref = () => (P.theme === 'light' || P.theme === 'dark' ? P.theme : 'system');
export const resolvedTheme = () => { const t = themePref(); return t === 'system' ? (mq && mq.matches ? 'dark' : 'light') : t; };
export function applyTheme() {
  const t = resolvedTheme();
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0c0c0b' : '#edece6');
}
export function setTheme(t) { setPref('theme', t); applyTheme(); }
export function onSystemTheme(fn) { if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (themePref() === 'system') { applyTheme(); fn(); } }); }
