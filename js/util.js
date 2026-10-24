/* Shared helpers. Date and number formatting is ported unchanged from the original tracker
   (reference/gods-plan/js/core/util.js), so streaks, weeks and targets compute exactly as before.
   Dates are local 'YYYY-MM-DD' strings everywhere. */

// ---------- markup ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

// Markup that is already safe. html`` returns Raw, so templates nest without double-escaping.
export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => (s instanceof Raw ? s : new Raw(s == null ? '' : String(s)));
const part = (v) => (v == null || v === false || v === true ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v));
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1];
  return new Raw(out);
}
export const $ = (s, root) => (root || document).querySelector(s);
export const $$ = (s, root) => Array.from((root || document).querySelectorAll(s));

// ---------- dates ----------
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const parse = (s) => { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
export const diff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

// ?asof=2026-11-20 in the page URL shows the app as it would look on that date (testing other plan phases)
let ASOF = null;
try { const q = new URLSearchParams(location.search).get('asof'); if (isDate(q)) ASOF = q; } catch (e) { ASOF = null; }
export const asOf = () => ASOF;
export const todayStr = () => ASOF || ymd(new Date());
// "now" for clock-based widgets: the simulated day keeps the real time of day
export const now = () => { const n = new Date(); if (!ASOF) return n; const d = parse(ASOF); d.setHours(n.getHours(), n.getMinutes(), n.getSeconds(), 0); return d; };
export const nowMin = () => { const n = now(); return n.getHours() * 60 + n.getMinutes(); };

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const fmtD = (s) => { const d = parse(s); return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; };
export const fmtDS = (s) => { const d = parse(s); return d.getDate() + ' ' + MON[d.getMonth()]; };
export const fmtDL = (s) => { const d = parse(s); return DOWL[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; };
export const fmtDY = (s) => { const d = parse(s); return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); };
export const fmtLong = (s) => { const d = parse(s); return DOWL[d.getDay()] + ', ' + d.getDate() + ' ' + MONL[d.getMonth()] + ' ' + d.getFullYear(); };
export const mondayOf = (s) => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
export const monthStart = (s) => s.slice(0, 8) + '01';
export const monthEnd = (s) => { const d = parse(monthStart(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return ymd(d); };
export const addMonths = (s, n) => { const d = parse(monthStart(s)); d.setMonth(d.getMonth() + n); return ymd(d); };
export const relDay = (from, to) => { const n = diff(from, to); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 0 ? 'in ' + n + ' days' : -n + ' days ago'; };

// ---------- time of day ----------
export const timeToMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; };
export const minToTime = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
export const fmtClock = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60, h12 = h % 12 || 12; return h12 + (mm ? ':' + pad(mm) : '') + (h < 12 ? ' AM' : ' PM'); };
export const greeting = (h) => (h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');

// ---------- numbers ----------
export const nv = (v) => (v === null || v === undefined || v === '' || !isFinite(+v)) ? null : +v;
export const fmtN = (x) => Math.round(+x || 0).toLocaleString('en-IN');
export const fmt1 = (x) => String(Math.round((+x || 0) * 10) / 10);
export const fmt2 = (x) => String(Math.round((+x || 0) * 100) / 100);
export const pct = (x) => Math.round((+x || 0) * 100) + '%';
export const mmss = (sec) => { if (sec == null || !isFinite(sec)) return '—'; sec = Math.round(sec); return Math.floor(sec / 60) + ':' + pad(sec % 60); };
export const fmtINR = (x) => { const v = Math.round((+x || 0) * 100) / 100; return (v < 0 ? '−' : '') + '₹' + Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }); };
export const fmtMins = (m) => { m = Math.round(+m || 0); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? h + 'h ' + r + 'm' : h + 'h') : r + 'm'; };
export const signed = (x, f) => (x > 0 ? '+' : x < 0 ? '−' : '±') + (f || fmt1)(Math.abs(x));
export const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
export const parseHours = (text) => { const m = /\((\d+(?:\.\d+)?)\s*h\)/i.exec(String(text || '')); return m ? +m[1] : null; };

// ---------- objects ----------
export const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
export const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
export const uid = (prefix) => (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const sortBy = (arr, f) => arr.slice().sort((a, b) => { const x = f(a), y = f(b); return x < y ? -1 : x > y ? 1 : 0; });
export const debounce = (fn, ms) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

// CSV: rows = array of objects, cols = [[key | fn, header]]
export const csv = (rows, cols) => {
  const cell = (v) => { if (v === null || v === undefined) return ''; const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.map((c) => cell(c[1])).join(',')].concat(rows.map((r) => cols.map((c) => cell(typeof c[0] === 'function' ? c[0](r) : r[c[0]])).join(','))).join('\r\n');
};
// save text as a file (no network involved)
export function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// 'Step type' strings in the plan carry an emoji prefix ("📘 Study"); this returns the words
export const typeName = (t) => String(t || '').split(' ').slice(1).join(' ') || String(t || '');
