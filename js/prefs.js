/* Per-device conveniences (theme, colour theme, filters, folded groups, last tab) in localStorage.
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
// colour themes: tokens.css holds each one's light and dark colours; these are the browser-bar colours and the swatches
export const PALETTES = [
  { id: 'vayu', name: 'Vayu', sub: 'Sea-teal and ink', light: '#edece6', dark: '#0c0c0b', swatch: ['#14393a', '#edece6', '#121211'] },
  { id: 'summer', name: 'Summer', sub: 'Aqua, peach and coral', light: '#ffe2af', dark: '#0e1f20', swatch: ['#79c9c5', '#ffe2af', '#f96e5b'] },
  { id: 'orchid', name: 'Orchid', sub: 'Wine, vanilla and coral', light: '#fffbe3', dark: '#1b1017', swatch: ['#6a425c', '#fffbe3', '#ffa9a9'] },
  { id: 'granite', name: 'Granite', sub: 'Pink, buttercream and blue', light: '#fff1db', dark: '#13172a', swatch: ['#ef5a6f', '#fff1db', '#536493'] }
];
export const palettePref = () => (PALETTES.some((p) => p.id === P.palette) ? P.palette : 'vayu');
export function applyTheme() {
  const t = resolvedTheme(), id = palettePref(), root = document.documentElement;
  root.setAttribute('data-theme', t);
  if (id === 'vayu') root.removeAttribute('data-palette'); else root.setAttribute('data-palette', id);
  const meta = document.querySelector('meta[name="theme-color"]'), p = PALETTES.find((x) => x.id === id);
  if (meta) meta.setAttribute('content', t === 'dark' ? p.dark : p.light);
}
export function setTheme(t) { setPref('theme', t); applyTheme(); }
export function setPalette(id) { setPref('palette', id); applyTheme(); }
export function onSystemTheme(fn) { if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (themePref() === 'system') { applyTheme(); fn(); } }); }
