/* Week in review: a one-page summary of a Monday–Sunday week, compared with the week before, ending with one focus
   for next week. Opens on Sundays from the Dashboard (and Monday morning for the week just ended), from Analytics,
   and from the Sunday evening notification. "Save image" draws the page as a 1080 × 1350 PNG to send a mentor.
   - Hours are counted over the week's days up to today; targets likewise, so a week in progress isn't marked down.
   - Chapters done use each chapter's done date; papers count in the week they were written.
   - The focus is the first that applies: a paper below 40 on a bad day (pass outlook), overdue chapters, hours under
     80% of target, five or more mistakes due, otherwise keep the rhythm. Up to two more go under "Also". */
import { html, raw, fmt1, fmtD, fmtDS, plural, addDays, mondayOf, sum, now } from './util.js';
import { icon } from './icons.js';
import { modal, toast } from './components.js';
import { pref, setPref } from './prefs.js';
import { errDue } from './drill.js';
import * as store from './store.js';

const DOW1 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// the week to show by default: this week on Sunday, otherwise the last full week
export const defaultWeek = (t) => { const d = new Date(t + 'T12:00:00').getDay(); return d === 0 ? mondayOf(t) : addDays(mondayOf(t), -7); };
// show the Sunday prompt on Sunday, and on Monday before 6 PM for the week just ended, until the review is opened
export function promptWeek(t) {
  const d = new Date(t + 'T12:00:00').getDay();
  const wk = d === 0 ? mondayOf(t) : d === 1 && now().getHours() < 18 ? addDays(mondayOf(t), -7) : null;
  return wk && pref('reviewSeen') !== wk ? wk : null;
}

function stats(M, start, end) {
  const t = M.t, upto = end < t ? end : t;
  const dd = M.days.filter((d) => d.date >= start && d.date <= upto);
  const inW = (x) => !!x && x >= start && x <= end;
  const errs = store.list('errors');
  const chDone = M.chapters.filter((c) => c.status === 'done' && inW(c.doneAt));
  const steps = dd.filter((d) => (+d.rec.steps || 0) > 0);
  return {
    start, end, elapsed: dd.length,
    hrs: sum(dd, (d) => +d.rec.hrs || 0), target: sum(dd, (d) => d.target),
    logged: dd.filter((d) => d.logged).length, minMet: dd.filter((d) => d.minMet).length,
    daily: DOW1.map((n, i) => { const date = addDays(start, i), d = M.dayByDate[date]; return { n, date, hrs: d && date <= t ? +d.rec.hrs || 0 : null, target: d ? d.target : 0, future: date > t }; }),
    chDone, chPlanned: M.chapters.filter((c) => inW(c.planDate)).length,
    revs: M.chapters.filter((c) => inW(c.rev1At)).length + M.chapters.filter((c) => inW(c.rev2At)).length,
    mocks: M.mocks.filter((m) => m.score != null && inW(m.takenAt || m.date)),
    errLogged: errs.filter((e) => inW(e.date)), drilled: errs.filter((e) => inW(e.reviewedAt)).length,
    workouts: dd.filter((d) => d.rec.workoutDone === 'Yes').length,
    steps: steps.length ? sum(steps, (d) => +d.rec.steps) / steps.length : null
  };
}

export function weekReview(M, start) {
  const end = addDays(start, 6), W = stats(M, start, end), P = stats(M, addDays(start, -7), addDays(start, -1));
  const best = W.daily.filter((d) => d.hrs).sort((a, b) => b.hrs - a.hrs)[0] || null;
  const focus = [], O = M.outlook, w = O && O.weakest;
  if (w && w.need) focus.push({ icon: 'target', text: 'Lift ' + w.code + ' ' + w.short + ': likely ' + w.likely + ', it needs +' + w.need + ' marks to clear 40 on a bad day. Give it two extra sessions and redo the questions from its last paper.', href: '#/mocks' });
  const overdue = M.overdueCount || 0;
  if (overdue) focus.push({ icon: 'calcheck', text: 'Clear the ' + plural(overdue, 'overdue chapter') + ' first: Catch up in Study Plan gives them new days.', href: '#/study-plan' });
  if (W.target > 0 && W.hrs < W.target * 0.8) focus.push({ icon: 'timer', text: 'Protect your study hours: ' + fmt1(W.hrs) + ' of ' + fmt1(W.target) + ' h this week. Never drop below ' + fmt1(M.st.minHours || 3) + ' h, even on a bad day.', href: '#/log' });
  const due = store.list('errors').filter((e) => errDue(e, M.t)).length;
  if (due >= 5) focus.push({ icon: 'revision', text: 'Drill the ' + plural(due, 'mistake') + ' due in the Error Book: about 20 minutes.', href: '#/errors?drill=1' });
  if (!focus.length) focus.push({ icon: 'flame', text: 'Keep the rhythm: same hours, and next week’s chapters on their planned days.', href: '#/study-plan' });
  return { start, end, partial: end > M.t, W, P, best, focus: focus[0], also: focus.slice(1, 3), name: (M.st.player || '').split(' ')[0] };
}

const delta = (a, b, f) => { const d = a - b; return !b && !a ? '' : (d > 0 ? '+' : d < 0 ? '−' : '±') + (f || String)(Math.abs(d)) + ' vs last week'; };
const pctOf = (a, b) => (b > 0 ? Math.round((a / b) * 100) + '%' : '—');

function sheet(M, R) {
  const W = R.W, P = R.P, mx = Math.max(1, ...W.daily.map((d) => Math.max(d.hrs || 0, d.target || 0)));
  const avg = W.mocks.length ? Math.round(sum(W.mocks, (m) => m.score * 100) / W.mocks.length) : null;
  const tile = (lbl, val, sub, d) => html`<div class="wr-tile"><span class="lbl">${lbl}</span><b>${val}</b><small>${sub}</small>${d ? html`<small class="wr-d">${d}</small>` : ''}</div>`;
  return html`<div class="wr">
    <div class="wr-nav"><button type="button" class="icon-btn sm" data-wk="-7" aria-label="Previous week">${icon('chevL')}</button><b>${fmtDS(R.start)} – ${fmtDS(R.end)}${R.partial ? ' · so far' : ''}</b><button type="button" class="icon-btn sm" data-wk="7" aria-label="Next week" ${raw(addDays(R.start, 7) > M.t ? 'disabled' : '')}>${icon('chevR')}</button></div>
    <div class="wr-tiles">
      ${tile('Study hours', fmt1(W.hrs) + ' h', 'of ' + fmt1(W.target) + ' h target · ' + pctOf(W.hrs, W.target), delta(W.hrs, P.hrs, fmt1))}
      ${tile('Chapters done', String(W.chDone.length), W.chPlanned + ' planned this week' + (W.revs ? ' · ' + plural(W.revs, 'revision') : ''), delta(W.chDone.length, P.chDone.length))}
      ${tile('Full papers', String(W.mocks.length), avg == null ? 'none written' : 'average ' + avg + ' marks', '')}
      ${tile('Mistakes', String(W.errLogged.length), '−' + fmt1(sum(W.errLogged, (e) => +e.marks || 0)) + ' marks logged · ' + W.drilled + ' drilled', '')}
    </div>
    <div class="wr-days" role="img" aria-label="${'Hours each day: ' + W.daily.map((d) => d.n + ' ' + (d.hrs == null ? 'not yet' : fmt1(d.hrs))).join(', ')}">${W.daily.map((d) => html`<div class="wr-day ${d.future ? 'future' : ''}"><span class="wr-bar"><i class="t" style="height:${(d.target / mx * 100).toFixed(1)}%"></i><i class="v ${R.best && d.date === R.best.date ? 'best' : ''}" style="height:${((d.hrs || 0) / mx * 100).toFixed(1)}%"></i></span><small>${d.hrs == null ? '—' : fmt1(d.hrs)}</small><span>${d.n}</span></div>`)}</div>
    <ul class="wr-list">
      <li>${icon('flame')}<span>${plural(W.minMet, 'day')} at the ${fmt1(M.st.minHours || 3)} h minimum · ${W.logged} of ${W.elapsed} logged${R.best ? ' · best day ' + fmtD(R.best.date) + ', ' + fmt1(R.best.hrs) + ' h' : ''}</span></li>
      ${W.chDone.length ? html`<li>${icon('book')}<span>Done: ${W.chDone.slice(0, 5).map((c) => c.name).join(' · ')}${W.chDone.length > 5 ? ' · +' + (W.chDone.length - 5) + ' more' : ''}</span></li>` : ''}
      ${W.mocks.length ? html`<li>${icon('mocks')}<span>${W.mocks.map((m) => 'P' + M.WMAP[m.subject].paper + ' ' + m.subject + ' ' + Math.round(m.score * 100)).join(' · ')}</span></li>` : ''}
      <li>${icon('activity')}<span>${W.workouts} workout${W.workouts === 1 ? '' : 's'}${W.steps ? ' · ' + Math.round(W.steps).toLocaleString('en-IN') + ' steps a day' : ''}</span></li>
    </ul>
    <a class="wr-focus" href="${R.focus.href}"><span class="lbl">Next week’s focus</span><span class="wr-f">${icon(R.focus.icon)}<b>${R.focus.text}</b></span></a>
    ${R.also.length ? html`<div class="wr-also"><span class="lbl">Also</span><ul>${R.also.map((f) => html`<li><a href="${f.href}">${f.text}</a></li>`)}</ul></div>` : ''}
  </div>`;
}

export function openReview(M, start) {
  let wk = start || defaultWeek(M.t);
  setPref('reviewSeen', promptWeek(M.t) || pref('reviewSeen'));
  const canShare = !!(navigator.canShare && window.File && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }));
  const m = modal({ title: 'Week in review', wide: true, body: raw('<div data-wr></div>'),
    foot: raw('<button type="button" class="btn" data-close>Close</button>' + (canShare ? '<button type="button" class="btn" data-share>' + icon('external') + 'Share</button>' : '') + '<button type="button" class="btn primary" data-save>' + icon('download') + 'Save image</button>') });
  const box = m.el.querySelector('[data-wr]');
  const paint = () => { box.innerHTML = String(sheet(M, weekReview(M, wk))); };
  m.el.addEventListener('click', async (e) => {
    const nav = e.target.closest('[data-wk]');
    if (nav && !nav.disabled) { wk = addDays(wk, +nav.dataset.wk); paint(); return; }
    if (e.target.closest('.wr a[href]')) { m.close(); return; }
    const save = e.target.closest('[data-save]'), share = e.target.closest('[data-share]');
    if (!save && !share) return;
    const R = weekReview(M, wk), blob = await png(M, R), name = 'vayu-week-' + R.start + '.png';
    if (share) { try { await navigator.share({ files: [new File([blob], name, { type: 'image/png' })], title: 'My week · ' + fmtDS(R.start) + ' – ' + fmtDS(R.end) }); } catch (err) { /* cancelled */ } return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Saved · ' + name);
  });
  paint();
}

// ---------- the shareable image (always light, so it reads anywhere) ----------
async function png(M, R) {
  const W = R.W, c = document.createElement('canvas'), S = 1080, H = 1350;
  c.width = S; c.height = H;
  const g = c.getContext('2d'), F = (w, px) => w + ' ' + px + 'px Outfit, "Segoe UI", system-ui, sans-serif';
  try { await document.fonts.load(F(500, 40)); } catch (e) { /* system font */ }
  const ink = '#141412', ink2 = '#5d5c55', line = '#dedcd3', soft = '#f1f0ea', brand = '#14393a';
  g.fillStyle = '#edece6'; g.fillRect(0, 0, S, H);
  g.fillStyle = '#ffffff'; round(g, 48, 48, S - 96, H - 96, 40); g.fill();
  const x0 = 96;
  // header
  g.fillStyle = '#0b0b0a'; round(g, x0, 96, 64, 64, 18); g.fill();
  g.strokeStyle = '#f4f3ee'; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(x0 + 16, 116); g.lineTo(x0 + 31, 148); g.lineTo(x0 + 46, 116); g.stroke();
  g.fillStyle = '#f4f3ee'; g.beginPath(); g.arc(x0 + 52, 110, 4.5, 0, 7); g.fill();
  g.fillStyle = ink; g.font = F(500, 26); g.fillText('V A Y U  ·  WEEK IN REVIEW', x0 + 88, 138);
  g.font = F(500, 64); g.fillText(fmtDS(R.start) + ' – ' + fmtDS(R.end), x0, 250);
  g.fillStyle = ink2; g.font = F(400, 28); g.fillText((R.name ? R.name + ' · ' : '') + 'CA Inter Jan 2027' + (R.partial ? ' · week so far' : ''), x0, 296);
  // four numbers
  const avg = W.mocks.length ? Math.round(sum(W.mocks, (m) => m.score * 100) / W.mocks.length) + ' avg' : 'none';
  const tiles = [['Study hours', fmt1(W.hrs), 'of ' + fmt1(W.target) + ' h'], ['Chapters', String(W.chDone.length), W.chPlanned + ' planned'], ['Full papers', String(W.mocks.length), avg], ['Mistakes', String(W.errLogged.length), W.drilled + ' drilled']];
  tiles.forEach((tl, i) => {
    const x = x0 + (i % 2) * 452, y = 330 + Math.floor(i / 2) * 166;
    g.fillStyle = soft; round(g, x, y, 436, 150, 24); g.fill();
    g.fillStyle = ink2; g.font = F(400, 26); g.fillText(tl[0], x + 28, y + 46);
    g.fillStyle = ink; g.font = F(500, 60); g.fillText(tl[1], x + 28, y + 116);
    const wv = g.measureText(tl[1]).width; g.fillStyle = ink2; g.font = F(400, 26); g.fillText(tl[2], x + 40 + wv, y + 114);
  });
  // daily bars
  const by = 736, bh = 160, mx = Math.max(1, ...W.daily.map((d) => Math.max(d.hrs || 0, d.target || 0))), bw = 72, gap = (S - 2 * x0 - 7 * bw) / 6;
  g.fillStyle = ink2; g.font = F(400, 26); g.fillText('Hours each day · grey is the target', x0, by - 22);
  W.daily.forEach((d, i) => {
    const x = x0 + i * (bw + gap), th = (d.target / mx) * bh, vh = ((d.hrs || 0) / mx) * bh;
    g.fillStyle = soft; round(g, x, by + bh - th, bw, Math.max(th, 1), 10); g.fill();
    if (vh) { g.fillStyle = R.best && d.date === R.best.date ? brand : ink; round(g, x + 10, by + bh - vh, bw - 20, vh, 8); g.fill(); }
    g.fillStyle = ink; g.font = F(500, 24); g.textAlign = 'center'; g.fillText(d.hrs == null ? '—' : fmt1(d.hrs), x + bw / 2, by + bh + 36);
    g.fillStyle = ink2; g.font = F(400, 22); g.fillText(d.n, x + bw / 2, by + bh + 66); g.textAlign = 'left';
  });
  // focus
  const fy = 1004;
  g.fillStyle = brand; round(g, x0, fy, S - 2 * x0, 196, 28); g.fill();
  g.fillStyle = '#cfe0dc'; g.font = F(500, 24); g.fillText('NEXT WEEK’S FOCUS', x0 + 36, fy + 54);
  g.fillStyle = '#ffffff'; g.font = F(500, 30); wrap(g, R.focus.text, x0 + 36, fy + 96, S - 2 * x0 - 72, 40, 3);
  g.fillStyle = ink2; g.font = F(400, 22); g.fillText('Made with Vayu · ' + plural(W.minMet, 'day') + ' at the minimum · ' + W.workouts + ' workouts', x0, H - 86);
  g.strokeStyle = line; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, H - 124); g.lineTo(S - x0, H - 124); g.stroke();
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
function round(g, x, y, w, h, r) { r = Math.min(r, h / 2, w / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function wrap(g, text, x, y, maxW, lh, maxLines) {
  const words = String(text).split(' '); let lineTxt = '', n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = lineTxt ? lineTxt + ' ' + words[i] : words[i];
    if (g.measureText(test).width > maxW && lineTxt) {
      if (++n === maxLines) { g.fillText(lineTxt + '…', x, y); return; }
      g.fillText(lineTxt, x, y); y += lh; lineTxt = words[i];
    } else lineTxt = test;
  }
  if (lineTxt) g.fillText(lineTxt, x, y);
}
