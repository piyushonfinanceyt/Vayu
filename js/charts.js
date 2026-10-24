/* Hand-built inline-SVG charts and one shared tooltip.
   Rules (ARCHITECTURE.md §6): thin marks (bars ≤ 24px, 4px rounded data end, 2px lines, ≥ 8px markers with a 2px surface ring),
   solid hairline grid, dashed only for thresholds / projections, hatching = planned / not yet, emphasis = ink on the item that
   matters and grey for the rest, every chart has a visually hidden data table and keyboard-reachable tooltips.

   Measured charts (bars, line) are placed with spot(id, type, opts) and drawn after the view is in the DOM, at the real pixel
   width, so text never scales down on a phone. Small fixed-size marks (spark, gauge, bullet) render inline. */
import { html, raw, esc, $$, clamp, clamp01, reducedMotion, parse, diff, addDays, fmtDS } from './util.js';

// ---------- placement + drawing ----------
const specs = new Map();
export function resetSpecs() { specs.clear(); }
export function spot(id, type, opts) {
  specs.set(id, { type, opts });
  return html`<div class="chart" data-chart="${id}" style="min-height:${(opts.height || 200) + 4}px"></div>`;
}
export function drawAll(root, animate) {
  $$('[data-chart]', root).forEach((el) => {
    const s = specs.get(el.dataset.chart);
    if (!s) return;
    const w = Math.max(220, Math.floor(el.clientWidth || el.getBoundingClientRect().width));
    el.innerHTML = String(TYPES[s.type](s.opts, w));
    el.classList.toggle('anim', !!animate && !reducedMotion());
  });
}

// ---------- scales ----------
const ticksFor = (min, max, n) => { const out = [], step = (max - min) / n; for (let i = 0; i <= n; i++) out.push(min + step * i); return out; };
// a round step (1, 2, 2.5, 5 × 10^k) and the range snapped to it, so ticks read 0 · 200 · 400, never 33.3 or −87
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
function niceScale(lo, hi, want) {
  if (!(hi > lo)) { hi = lo + 1; }
  const step = niceStep((hi - lo) / (want || 4)), a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, ticks = [];
  for (let v = a; v <= b + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min: a, max: b, ticks };
}
const fmtTick = (v) => (Math.abs(v) >= 1000 ? (Math.round(v / 100) / 10) + 'k' : String(Math.round(v * 10) / 10));
const tt = (lines) => esc(lines.filter((x) => x != null && x !== '').join('|'));
const roundTop = (x, y, w, h, r) => { if (h <= 0) return ''; r = Math.min(r, w / 2, h); return 'M' + x + ' ' + (y + h) + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) + 'V' + (y + h) + 'Z'; };
let hatchSeq = 0;
const hatchDef = (id) => '<defs><pattern id="' + id + '" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><rect width="6" height="6" fill="var(--soft-2)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--hatch)" stroke-width="2.2"/></pattern></defs>';
const srTable = (caption, head, rows) => '<div class="sr-only"><table><caption>' + esc(caption) + '</caption><thead><tr>' + head.map((h) => '<th scope="col">' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((r) => '<tr>' + r.map((c, i) => (i ? '<td>' : '<th scope="row">') + esc(c) + (i ? '</td>' : '</th>')).join('') + '</tr>').join('') + '</tbody></table></div>';

// ---------- bars: logged (solid) over planned (hatched) ----------
// opts: labels[], values[] (null = not yet), targets[]?, highlight (index), fmt(v), tips[] (title per bar), unit, height, ariaLabel, caption
function bars(o, W) {
  const H = o.height || 200, n = o.labels.length, padL = 34, padR = 6, padT = 14, padB = 24;
  const vals = o.values.map((v) => (v == null ? null : +v)), tg = (o.targets || []).map((v) => (v == null ? null : +v));
  const sc = niceScale(0, Math.max(1, ...vals.filter((v) => v != null), ...tg.filter((v) => v != null)), 4), mx = sc.max;
  const ih = H - padT - padB, iw = W - padL - padR, band = iw / n, bw = Math.max(4, Math.min(24, band * 0.6));
  const y = (v) => padT + ih - (v / mx) * ih, fmt = o.fmt || fmtTick;
  const hid = 'h' + (++hatchSeq);
  let g = '';
  sc.ticks.forEach((t) => { g += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '" class="grid-l"/><text x="' + (padL - 8) + '" y="' + (y(t) + 4).toFixed(1) + '" text-anchor="end" class="tick">' + fmtTick(t) + '</text>'; });
  const every = Math.max(1, Math.ceil((n * 34) / iw));
  let marks = '', hits = '', labels = '';
  for (let i = 0; i < n; i++) {
    const cx = padL + band * i + band / 2, x = cx - bw / 2, v = vals[i], t = tg[i], on = i === o.highlight;
    if (t != null && t > 0) marks += '<path d="' + roundTop(x, y(t), bw, ih + padT - y(t), 4) + '" fill="url(#' + hid + ')" class="bar-plan"/>';
    if (v != null && v > 0) marks += '<path d="' + roundTop(x, y(v), bw, ih + padT - y(v), 4) + '" class="bar ' + (on ? 'on' : '') + '" style="animation-delay:' + (i * 18) + 'ms"/>';
    if (i % every === 0 || on) labels += '<text x="' + cx.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" class="tick ' + (on ? 'on' : '') + '">' + esc(o.labels[i]) + '</text>';
    const tip = tt([(o.tips && o.tips[i]) || o.labels[i], v == null ? 'Not logged yet' : 'Logged ' + fmt(v), t != null ? 'Planned ' + fmt(t) : null, v != null && t ? Math.round((v / t) * 100) + '% of plan' : null]);
    hits += '<rect class="hit" x="' + (padL + band * i).toFixed(1) + '" y="' + padT + '" width="' + band.toFixed(1) + '" height="' + ih + '" tabindex="0" role="img" data-tt="' + tip + '" aria-label="' + tip.replace(/\|/g, ', ') + '"/>';
  }
  const table = srTable(o.caption || o.ariaLabel || 'Chart data', ['', 'Logged', 'Planned'], o.labels.map((l, i) => [(o.tips && o.tips[i]) || l, vals[i] == null ? '—' : fmt(vals[i]), tg[i] == null ? '—' : fmt(tg[i])]));
  return raw('<svg class="cv" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="' + esc(o.ariaLabel || '') + '">' + hatchDef(hid) + g +
    '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + (padT + ih) + '" y2="' + (padT + ih) + '" class="base-l"/>' + marks + labels + hits + '</svg>' + table);
}

// ---------- line: series over dates or categories, with reference lines ----------
// opts: x {type:'date', from, to} | {type:'cat', labels}; y {min, max, ticks} | {auto:true}; series [{id, name, color, points:[{x, y, note}], dash, dots, area, faint}]
//       refs [{y, label, color}], fmtY, height, ariaLabel, empty, lowerIsBetter, compact
function line(o, W) {
  const H = o.height || 220, compact = !!o.compact, padL = compact ? 28 : 36, padR = compact ? 8 : 14, padT = compact ? 10 : 16, padB = compact ? 20 : 26;
  const series = o.series.filter((s) => s.points && s.points.length);
  const isDate = o.x.type === 'date';
  const x0 = isDate ? 0 : 0, x1 = isDate ? Math.max(1, diff(o.x.from, o.x.to)) : Math.max(1, o.x.labels.length - 1);
  const xv = (p) => (isDate ? diff(o.x.from, p.x) : p.x);
  let ymin, ymax, yticks;
  if (o.y && !o.y.auto) { ymin = o.y.min; ymax = o.y.max; yticks = o.y.ticks || ticksFor(ymin, ymax, 4); }
  else {
    const all = series.flatMap((s) => s.points.map((p) => p.y)).concat((o.refs || []).map((r) => r.y));
    let lo = Math.min(...all), hi = Math.max(...all);
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    const pad = (hi - lo) * 0.08 || Math.max(0.5, Math.abs(hi) * 0.1), dataMin = lo;
    lo -= pad; hi += pad;
    if (dataMin >= 0 && lo < 0) lo = 0;
    const sc = niceScale(lo, hi, compact ? 3 : 4);
    ymin = sc.min; ymax = sc.max; yticks = sc.ticks;
  }
  const iw = W - padL - padR, ih = H - padT - padB;
  const X = (v) => padL + ((v - x0) / (x1 - x0)) * iw, Y = (v) => padT + ih - ((v - ymin) / (ymax - ymin || 1)) * ih;
  const fmtY = o.fmtY || fmtTick;
  let g = '';
  yticks.forEach((t) => { g += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '" class="grid-l"/><text x="' + (padL - 7) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end" class="tick">' + esc(fmtY(t)) + '</text>'; });
  // x labels
  let xl = '';
  if (isDate) {
    const span = x1, want = Math.max(2, Math.floor(iw / (compact ? 70 : 90)));
    const step = Math.max(1, Math.ceil(span / want));
    for (let d = 0; d <= span; d += step) xl += '<text x="' + X(d).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (d === 0 ? 'start' : 'middle') + '" class="tick">' + esc(fmtDS(addDays(o.x.from, d))) + '</text>';
  } else {
    const every = Math.max(1, Math.ceil((o.x.labels.length * 32) / iw));
    o.x.labels.forEach((l, i) => { if (i % every === 0) xl += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" class="tick">' + esc(l) + '</text>'; });
  }
  let refs = '';
  (o.refs || []).forEach((r) => {
    if (r.y < ymin || r.y > ymax) return;
    refs += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(r.y).toFixed(1) + '" y2="' + Y(r.y).toFixed(1) + '" class="ref" style="stroke:' + (r.color || 'var(--ink-3)') + '"/>' +
      (r.label && !compact ? '<text x="' + (W - padR) + '" y="' + (Y(r.y) - 5).toFixed(1) + '" text-anchor="end" class="ref-t">' + esc(r.label) + '</text>' : '');
  });
  if (!series.length) {
    return raw('<svg class="cv" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' + g + refs + xl + '</svg><div class="chart-empty"><p>' + esc((o.empty && o.empty.text) || 'No data yet') + '</p>' + (o.empty && o.empty.action ? String(o.empty.action) : '') + '</div>');
  }
  let paths = '', dots = '';
  series.forEach((s) => {
    const pts = s.points.slice().sort((a, b) => xv(a) - xv(b));
    const d = pts.map((p, i) => (i ? 'L' : 'M') + X(xv(p)).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join('');
    if (s.area && pts.length > 1) paths += '<path d="' + d + 'L' + X(xv(pts[pts.length - 1])).toFixed(1) + ' ' + (padT + ih) + 'L' + X(xv(pts[0])).toFixed(1) + ' ' + (padT + ih) + 'Z" fill="' + s.color + '" opacity=".1"/>';
    if (pts.length > 1) paths += '<path d="' + d + '" class="ln ' + (s.dash ? 'dash' : '') + '" style="stroke:' + s.color + (s.faint ? ';opacity:.5' : '') + '" pathLength="1000"/>';
    if (s.dots !== false) pts.forEach((p) => { dots += '<circle cx="' + X(xv(p)).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="' + (compact ? 3.5 : 4.5) + '" class="pt" style="fill:' + s.color + '"/>'; });
  });
  // crosshair hit bands: one per x that has data
  const xs = Array.from(new Set(series.flatMap((s) => s.points.map((p) => xv(p))))).sort((a, b) => a - b);
  let hits = '';
  xs.forEach((v, i) => {
    const left = i ? (X(xs[i - 1]) + X(v)) / 2 : padL, right = i < xs.length - 1 ? (X(xs[i + 1]) + X(v)) / 2 : W - padR;
    const rows = series.map((s) => { const p = s.points.find((q) => xv(q) === v); return p ? s.name + ': ' + fmtY(p.y) + (p.note ? ' · ' + p.note : '') : null; });
    const title = o.tipTitle ? o.tipTitle(v) : isDate ? fmtDS(addDays(o.x.from, v)) : o.x.labels[v];
    const tip = tt([title].concat(rows));
    hits += '<g class="hit" tabindex="0" role="img" data-tt="' + tip + '" aria-label="' + tip.replace(/\|/g, ', ') + '"><rect x="' + left.toFixed(1) + '" y="' + padT + '" width="' + Math.max(6, right - left).toFixed(1) + '" height="' + ih + '" fill="transparent"/><line class="xh" x1="' + X(v).toFixed(1) + '" x2="' + X(v).toFixed(1) + '" y1="' + padT + '" y2="' + (padT + ih) + '"/></g>';
  });
  const table = srTable(o.ariaLabel || 'Chart data', ['Date'].concat(series.map((s) => s.name)), xs.map((v) => [isDate ? fmtDS(addDays(o.x.from, v)) : o.x.labels[v]].concat(series.map((s) => { const p = s.points.find((q) => xv(q) === v); return p ? fmtY(p.y) : '—'; }))));
  return raw('<svg class="cv" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="' + esc(o.ariaLabel || '') + '">' + g + refs + xl +
    '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + (padT + ih) + '" y2="' + (padT + ih) + '" class="base-l"/>' + paths + dots + hits + '</svg>' + table);
}

// ---------- timeline: today's blocks on an hour axis, with a live "now" line ----------
// opts: blocks [{from, end (minutes), label, title, kind}], now (minutes), fmtClock(min), height
function timeline(o, W) {
  const H = o.height || 118, padX = 8, top = 30, bh = 36, blocks = o.blocks || [];
  if (!blocks.length) return raw('<div class="chart-empty" style="position:static;min-height:' + H + 'px"><p>No timetable for this day.</p></div>');
  const t0 = Math.floor((Math.min(...blocks.map((b) => b.from)) - 20) / 60) * 60, t1 = Math.ceil((Math.max(...blocks.map((b) => b.end)) + 10) / 60) * 60;
  const X = (m) => padX + ((m - t0) / (t1 - t0)) * (W - 2 * padX), hid = 'h' + (++hatchSeq), fc = o.fmtClock;
  let g = '', marks = '', labels = '', hits = '';
  const stepH = W < 520 ? 180 : 120;
  for (let m = t0; m <= t1; m += 60) {
    if ((m - t0) % stepH === 0) g += '<line x1="' + X(m).toFixed(1) + '" x2="' + X(m).toFixed(1) + '" y1="' + (top - 6) + '" y2="' + (top + bh + 8) + '" class="grid-l"/><text x="' + X(m).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" class="tick">' + esc(fc(m).replace(':00', '')) + '</text>';
  }
  blocks.forEach((b, i) => {
    const x = X(b.from) + 1, w = Math.max(3, X(b.end) - X(b.from) - 2), done = o.now >= b.end, cur = o.now >= b.from && o.now < b.end;
    const cls = done ? 'tl-done' : cur ? 'tl-cur' : 'tl-next';
    marks += '<rect x="' + x.toFixed(1) + '" y="' + top + '" width="' + w.toFixed(1) + '" height="' + bh + '" rx="8" class="' + cls + '"' + (!done && !cur ? ' fill="url(#' + hid + ')"' : '') + '/>';
    if (cur) marks += '<rect x="' + x.toFixed(1) + '" y="' + top + '" width="' + Math.max(3, X(o.now) - x).toFixed(1) + '" height="' + bh + '" rx="8" class="tl-prog"/>';
    const short = b.label.replace(/^Block /, ''), lab = w >= b.label.length * 6.4 + 6 || cur ? b.label : w >= short.length * 6.4 + 4 ? short : '';
    if (lab) labels += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (top - 8) + '" text-anchor="middle" class="tl-l' + (cur ? ' on' : '') + '">' + esc(lab) + '</text>';
    const tip = tt([b.label + ' · ' + fc(b.from) + '–' + fc(b.end), b.title, done ? 'Done' : cur ? 'Now' : 'Coming up']);
    hits += '<rect class="hit" x="' + x.toFixed(1) + '" y="' + (top - 4) + '" width="' + w.toFixed(1) + '" height="' + (bh + 8) + '" tabindex="0" role="img" data-tt="' + tip + '" aria-label="' + tip.replace(/\|/g, ', ') + '"/>';
  });
  let now = '';
  if (o.now >= t0 && o.now <= t1) {
    const nx = X(o.now), anchor = nx > W - 60 ? 'end' : nx < 60 ? 'start' : 'middle';
    now = '<line x1="' + nx.toFixed(1) + '" x2="' + nx.toFixed(1) + '" y1="' + (top - 4) + '" y2="' + (top + bh + 8) + '" class="tl-now"/><circle cx="' + nx.toFixed(1) + '" cy="' + (top + bh + 8) + '" r="3.5" class="tl-now-d"/><text x="' + nx.toFixed(1) + '" y="' + (top + bh + 24) + '" text-anchor="' + anchor + '" class="tl-now-t">now ' + esc(fc(o.now)) + '</text>';
  }
  const table = srTable('Today’s timetable', ['Block', 'Time', 'What'], blocks.map((b) => [b.label, fc(b.from) + '–' + fc(b.end), b.title]));
  return raw('<svg class="cv" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="' + esc(o.ariaLabel || 'Today’s timetable') + '">' + hatchDef(hid) + g + marks + labels + now + hits + '</svg>' + table);
}

// ---------- heatmap: every plan day (weeks × weekdays), one-hue ramp by share of the hours target ----------
// opts: days [{date, score (0..1 | -1 not logged | -2 future), tip}], today, phases [{name, from, to}], height
function heatmap(o, W) {
  const days = o.days, first = days[0].date, ws = mondayOfStr(first), nW = Math.floor(diff(ws, days[days.length - 1].date) / 7) + 1;
  const padL = 26, top = o.phases ? 34 : 6, gap = 3, cw = Math.max(10, (W - padL) / nW - gap), ch = Math.max(10, Math.min(24, cw * 0.62));
  const H = top + 7 * (ch + gap) + 4, hid = 'h' + (++hatchSeq), byDate = {};
  days.forEach((d) => { byDate[d.date] = d; });
  let g = '', cells = '';
  ['M', '', 'W', '', 'F', '', 'S'].forEach((l, k) => { if (l) g += '<text x="' + (padL - 8) + '" y="' + (top + k * (ch + gap) + ch * 0.75).toFixed(1) + '" text-anchor="end" class="tick">' + l + '</text>'; });
  if (o.phases) {
    // bands sit end to end (two phases can share a week); a label shows only when it fits without touching the last one
    let bandEnd = -Infinity, labelEnd = -Infinity;
    o.phases.forEach((p) => {
      const a = Math.max(0, Math.floor(diff(ws, p.from) / 7)), b = Math.min(nW - 1, Math.floor(diff(ws, p.to) / 7));
      const x1 = Math.max(padL + a * (cw + gap), bandEnd + 4), x2 = padL + (b + 1) * (cw + gap) - gap, on = o.today >= p.from && o.today <= p.to;
      if (x2 <= x1) return;
      g += '<line x1="' + x1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y1="' + (top - 10) + '" y2="' + (top - 10) + '" class="hm-band' + (on ? ' on' : '') + '"/>';
      bandEnd = x2;
      const label = p.short || p.name, lw = label.length * 6.1;
      if ((x2 - x1 >= lw || on) && x1 >= labelEnd + 8 && x1 + lw <= W) { g += '<text x="' + x1.toFixed(1) + '" y="' + (top - 16) + '" class="hm-band-t' + (on ? ' on' : '') + '">' + esc(label) + '</text>'; labelEnd = x1 + lw; }
    });
  }
  for (let w = 0; w < nW; w++) for (let k = 0; k < 7; k++) {
    const date = addDays(ws, w * 7 + k), d = byDate[date];
    if (!d) continue;
    const x = padL + w * (cw + gap), y = top + k * (ch + gap);
    const lvl = d.score === -2 ? 'f' : d.score === -1 ? 'n' : d.score >= 0.9 ? '4' : d.score >= 0.6 ? '3' : d.score >= 0.3 ? '2' : '1';
    cells += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + cw.toFixed(1) + '" height="' + ch.toFixed(1) + '" rx="4" class="hm l' + lvl + (date === o.today ? ' today' : '') + '"' + (lvl === 'f' ? ' fill="url(#' + hid + ')"' : '') + ' tabindex="0" role="img" data-tt="' + esc(d.tip) + '" aria-label="' + esc(d.tip.replace(/\|/g, ', ')) + '"/>';
    if (d.mark) cells += '<circle cx="' + (x + cw - 5).toFixed(1) + '" cy="' + (y + 5).toFixed(1) + '" r="2" class="hm-mark" pointer-events="none"/>';
  }
  const table = srTable(o.ariaLabel || 'Heatmap', ['Day', 'Detail'], days.filter((d) => d.score !== -2).map((d) => [d.date, d.tip.replace(/\|/g, ', ')]));
  return raw('<svg class="cv tt-group" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="' + esc(o.ariaLabel || '') + '">' + hatchDef(hid) + g + cells + '</svg>' + table);
}
const mondayOfStr = (s) => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

// ---------- burn-up: actual vs plan, the gap shaded, today's pace projected to the deadline ----------
// opts: from, to, total, plan(date) -> 0..total, actual [{x, y}] (cumulative, up to today), today, unit, height
function burnup(o, W) {
  const H = o.height || 220, padL = 34, padR = 16, padT = 16, padB = 26, iw = W - padL - padR, ih = H - padT - padB, span = Math.max(1, diff(o.from, o.to));
  const X = (d) => padL + (clamp(diff(o.from, d), 0, span) / span) * iw, Y = (v) => padT + ih - (v / o.total) * ih;
  let g = '';
  niceScale(0, o.total, 3).ticks.filter((t) => t <= o.total).forEach((t) => { g += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '" class="grid-l"/><text x="' + (padL - 7) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end" class="tick">' + Math.round(t) + '</text>'; });
  const xl = [o.from, addDays(o.from, Math.round(span / 2)), o.to].map((d, i) => '<text x="' + X(d).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 ? 'start' : i === 2 ? 'end' : 'middle') + '" class="tick">' + esc(fmtDS(d)) + '</text>').join('');
  const act = o.actual.filter((p) => p.x >= o.from && p.x <= o.to);
  const planPath = 'M' + X(o.from).toFixed(1) + ' ' + Y(o.plan(o.from)).toFixed(1) + 'L' + X(o.to).toFixed(1) + ' ' + Y(o.plan(o.to)).toFixed(1);
  let gapPoly = '', actPath = '', proj = '', dot = '', labels = '', hits = '';
  if (act.length) {
    actPath = act.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join('');
    const last = act[act.length - 1], behind = last.y < o.plan(last.x);
    gapPoly = '<path d="' + act.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join('') + act.slice().reverse().map((p) => 'L' + X(p.x).toFixed(1) + ' ' + Y(o.plan(p.x)).toFixed(1)).join('') + 'Z" class="gap ' + (behind ? 'behind' : 'ahead') + '"/>';
    // project today's pace (work done since the start, not the head start) once there are a few days to go on
    const elapsed = diff(o.from, last.x), rate = elapsed > 0 ? (last.y - act[0].y) / elapsed : 0, projEnd = Math.min(o.total, last.y + rate * diff(last.x, o.to));
    if (last.x < o.to && elapsed >= 3) {
      const py = Y(projEnd), planY = Y(o.plan(o.to)), ly = Math.abs(py - planY) < 16 ? planY + 30 : py + 14;
      proj = '<line x1="' + X(last.x).toFixed(1) + '" y1="' + Y(last.y).toFixed(1) + '" x2="' + X(o.to).toFixed(1) + '" y2="' + py.toFixed(1) + '" class="proj"/><text x="' + (W - padR) + '" y="' + ly.toFixed(1) + '" text-anchor="end" class="ref-t">at this pace → ' + Math.round(projEnd) + '</text>';
    }
    dot = '<circle cx="' + X(last.x).toFixed(1) + '" cy="' + Y(last.y).toFixed(1) + '" r="5" class="pt" style="fill:var(--ink)"/>';
    const diffN = Math.round(last.y - o.plan(last.x));
    labels = '<text x="' + (X(last.x) + 8).toFixed(1) + '" y="' + (Y(last.y) + 18).toFixed(1) + '" class="bu-l">You ' + Math.round(last.y) + ' · ' + (diffN >= 0 ? diffN + ' ahead' : -diffN + ' behind') + '</text>';
    act.forEach((p, i) => {
      const left = i ? (X(act[i - 1].x) + X(p.x)) / 2 : padL, right = i < act.length - 1 ? (X(act[i + 1].x) + X(p.x)) / 2 : X(p.x) + 6;
      const tip = tt([fmtDS(p.x), 'Done ' + Math.round(p.y) + ' ' + (o.unit || ''), 'Plan ' + Math.round(o.plan(p.x))]);
      hits += '<g class="hit" tabindex="0" role="img" data-tt="' + tip + '" aria-label="' + tip.replace(/\|/g, ', ') + '"><rect x="' + left.toFixed(1) + '" y="' + padT + '" width="' + Math.max(4, right - left).toFixed(1) + '" height="' + ih + '" fill="transparent"/><line class="xh" x1="' + X(p.x).toFixed(1) + '" x2="' + X(p.x).toFixed(1) + '" y1="' + padT + '" y2="' + (padT + ih) + '"/></g>';
    });
  }
  const table = srTable(o.ariaLabel || 'Burn-up', ['Date', 'Done', 'Plan'], act.map((p) => [fmtDS(p.x), String(Math.round(p.y)), String(Math.round(o.plan(p.x)))]));
  return raw('<svg class="cv" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="' + esc(o.ariaLabel || '') + '">' + g + xl + '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + (padT + ih) + '" y2="' + (padT + ih) + '" class="base-l"/>' + gapPoly +
    '<path d="' + planPath + '" class="ln dash" style="stroke:var(--ink-3)"/><text x="' + (W - padR) + '" y="' + (Y(o.plan(o.to)) - 6).toFixed(1) + '" text-anchor="end" class="ref-t">plan ' + Math.round(o.plan(o.to)) + '</text>' +
    (actPath ? '<path d="' + actPath + '" class="ln" style="stroke:var(--ink)" pathLength="1000"/>' : '') + proj + dot + labels + hits + '</svg>' + table);
}

const TYPES = { bars, line, timeline, heatmap, burnup };

// mini week bars (no text): hatched planned behind solid logged, today in ink
export function miniBars(values, targets, today, o = {}) {
  const w = o.w || 150, h = o.h || 46, n = values.length, band = w / n, bw = Math.min(14, band * 0.6), mx = Math.max(1, ...values.map((v) => +v || 0), ...targets.map((v) => +v || 0));
  const hid = 'h' + (++hatchSeq);
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = band * i + (band - bw) / 2, t = +targets[i] || 0, v = +values[i] || 0;
    if (t) s += '<path d="' + roundTop(x, h - (t / mx) * (h - 2), bw, (t / mx) * (h - 2), 3) + '" fill="url(#' + hid + ')"/>';
    if (v) s += '<path d="' + roundTop(x, h - (v / mx) * (h - 2), bw, (v / mx) * (h - 2), 3) + '" class="bar ' + (i === today ? 'on' : '') + '"/>';
  }
  return raw('<svg class="mini-bars" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' + hatchDef(hid) + s + '</svg>');
}

// ---------- inline marks ----------
// bullet: marks bar vs below-pass band vs checkpoint target tick (0-100 scale)
export function bullet(value, o = {}) {
  const pass = o.pass != null ? o.pass : 40, tgt = o.target, v = value == null ? null : clamp(value, 0, 100);
  const label = o.label || (v == null ? 'Not taken yet' : Math.round(v) + ' marks') + (tgt != null ? ', target ' + Math.round(tgt) : '') + ', pass ' + pass;
  return html`<div class="bullet ${o.thick ? 'thick' : ''}" role="img" aria-label="${label}"><span class="b-pass" style="width:${pass}%"></span>${v != null ? html`<span class="b-val ${v >= (tgt || 101) ? 'met' : v < pass ? 'low' : ''}" style="width:${v}%"></span>` : ''}${tgt != null ? html`<span class="b-tgt" style="left:calc(${tgt}% - 1px)"></span>` : ''}</div>`;
}
// sparkline (no text, fixed size): last point in ink, the rest grey
export function spark(values, o = {}) {
  const w = o.w || 96, h = o.h || 30, v = values.map((x) => (x == null ? null : +x));
  const real = v.filter((x) => x != null);
  if (real.length < 2) return html`<svg width="${w}" height="${h}" aria-hidden="true"></svg>`;
  const mx = Math.max(...real, o.target || 0) || 1, mn = Math.min(0, ...real);
  const X = (i) => 2 + (i * (w - 4)) / (v.length - 1), Y = (x) => h - 3 - ((x - mn) / (mx - mn || 1)) * (h - 8);
  let d = '', started = false;
  v.forEach((x, i) => { if (x == null) return; d += (started ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x).toFixed(1); started = true; });
  const li = v.length - 1 - v.slice().reverse().findIndex((x) => x != null);
  return html`<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${o.target ? raw('<line x1="2" x2="' + (w - 2) + '" y1="' + Y(o.target).toFixed(1) + '" y2="' + Y(o.target).toFixed(1) + '" class="ref" />') : ''}<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".45"/><circle cx="${X(li).toFixed(1)}" cy="${Y(v[li]).toFixed(1)}" r="3.5" fill="currentColor"/></svg>`;
}
// semicircle gauge with tick marks, knob, value and an optional "expected" tick
export function gauge(value, o = {}) {
  const max = o.max || 100, p = clamp01(value / max), R = 84, cx = 110, cy = 112, L = Math.PI * R;
  let ticks = '';
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI * (1 - i / 40), r1 = R + 12, r2 = R + (i % 5 ? 17 : 22);
    ticks += '<line x1="' + (cx + r1 * Math.cos(a)).toFixed(1) + '" y1="' + (cy - r1 * Math.sin(a)).toFixed(1) + '" x2="' + (cx + r2 * Math.cos(a)).toFixed(1) + '" y2="' + (cy - r2 * Math.sin(a)).toFixed(1) + '" stroke="currentColor" stroke-width="1.5" opacity="' + (i / 40 <= p + 1e-9 ? 0.95 : 0.25) + '"/>';
  }
  const a = Math.PI * (1 - p), d = 'M' + (cx - R) + ' ' + cy + 'A' + R + ' ' + R + ' 0 0 1 ' + (cx + R) + ' ' + cy;
  let exp = '';
  if (o.expected != null) { const e = Math.PI * (1 - clamp01(o.expected / max)); exp = '<line x1="' + (cx + (R - 9) * Math.cos(e)).toFixed(1) + '" y1="' + (cy - (R - 9) * Math.sin(e)).toFixed(1) + '" x2="' + (cx + (R + 9) * Math.cos(e)).toFixed(1) + '" y2="' + (cy - (R + 9) * Math.sin(e)).toFixed(1) + '" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".55"><title>Expected by today</title></line>'; }
  return html`<svg class="gauge" viewBox="0 0 220 128" role="img" aria-label="${o.label || Math.round(value) + ' of ' + max}">${raw(ticks)}<path d="${d}" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-width="10" stroke-linecap="round"/><path class="g-val" d="${d}" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-dasharray="${L.toFixed(1)}" stroke-dashoffset="${(L * (1 - p)).toFixed(1)}" style="--len:${L.toFixed(1)}"/>${raw(exp)}<circle cx="${(cx + R * Math.cos(a)).toFixed(1)}" cy="${(cy - R * Math.sin(a)).toFixed(1)}" r="8" class="g-knob" stroke="currentColor" stroke-width="3"/></svg>`;
}

// ---------- shared tooltip ----------
let tipEl = null, pinned = null;
function ensureTip() { if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tt'; tipEl.setAttribute('role', 'tooltip'); tipEl.hidden = true; document.body.appendChild(tipEl); } return tipEl; }
function showTip(el) {
  const t = ensureTip(), lines = String(el.dataset.tt || '').split('|');
  t.innerHTML = '<b>' + esc(lines[0]) + '</b>' + lines.slice(1).map((l) => '<span>' + esc(l) + '</span>').join('');
  t.hidden = false;
  const r = el.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight;
  let left = r.left + r.width / 2 - w / 2; left = clamp(left, 8, innerWidth - w - 8);
  let top = r.top - h - 10; if (top < 8) top = r.bottom + 10;
  t.style.left = left + 'px'; t.style.top = top + 'px';
  $$('.hit.on').forEach((x) => x.classList.remove('on')); el.classList.add('on');
}
function hideTip() { if (tipEl) tipEl.hidden = true; $$('.hit.on').forEach((x) => x.classList.remove('on')); pinned = null; }
document.addEventListener('pointerover', (e) => { const h = e.target.closest && e.target.closest('[data-tt]'); if (h && e.pointerType === 'mouse') showTip(h); else if (!pinned && e.pointerType === 'mouse' && tipEl && !tipEl.hidden) hideTip(); });
document.addEventListener('pointerdown', (e) => { const h = e.target.closest && e.target.closest('[data-tt]'); if (h && e.pointerType !== 'mouse') { if (pinned === h) hideTip(); else { showTip(h); pinned = h; } } else if (!h) hideTip(); });
document.addEventListener('focusin', (e) => { const h = e.target.closest && e.target.closest('[data-tt]'); if (h) showTip(h); else if (tipEl && !tipEl.hidden) hideTip(); });
document.addEventListener('keydown', (e) => {
  const h = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-tt]');
  if (!h) return;
  if (e.key === 'Escape') { hideTip(); return; }
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const all = $$('[data-tt]', h.closest('svg, .chart, .tt-group') || document), i = all.indexOf(h), n = all[i + (e.key === 'ArrowRight' ? 1 : -1)];
  if (n) { e.preventDefault(); n.focus(); }
});
window.addEventListener('scroll', () => { if (tipEl && !tipEl.hidden && !pinned) hideTip(); }, { passive: true });
