/* Mock Tests: the 27 "boss" full papers. Marks, time, mistakes and the four writing scores per paper; each paper's
   checkpoint target from settings.paperTargets (pass line 40, target line 55 as the fallback); scores over time as six
   small multiples; the writing scorecard; move a missed paper to its fix-it day or skip it; answer-page photos kept on
   this device; a link to log the lost marks in the Error Book. */
import { html, raw, esc, fmt1, fmtN, fmtD, fmtDS, fmtDL, plural, diff, pct, sortBy, uid, $, $$, isDate } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, status, tile, empty, toast, confirm, modal } from '../components.js';
import { spot, bullet } from '../charts.js';
import { numField, textField, bind } from './parts.js';
import { isOpen } from '../prefs.js';
import { paperMultiples, passOutlook } from './insights.js';
import * as store from '../store.js';
import { openMarking, pasteMarking, decodeLink } from '../marking.js';
import { model as modelOf } from '../model.js';

let focusId = null, markingIn = null;
const P = (n) => Math.round(n * 100);

function fixItDayFor(M, f) {
  const fx = M.st.fixItDays || {}, all = Object.keys(fx).map((k) => fx[k]).filter((v, i, a) => a.indexOf(v) === i).sort(), pref = fx[f.subject];
  const busy = (d) => M.mocks.some((x) => x.id !== f.id && x.date === d && x.status !== 'skipped');
  return (pref ? [pref].concat(all.filter((d) => d !== pref)) : all).find((d) => d > M.t && !busy(d)) || null;
}
const statusChip = (M, f) => (f.status === 'taken' ? status('Taken', 'good') : f.status === 'skipped' ? chip('Skipped') : f.status === 'today' ? chip('Today · 2–5 PM', 'ink', 'flag') : f.status === 'missed' ? status('Marks not entered', 'bad') : chip('In ' + plural(diff(M.t, f.date), 'day'), 'line'));
const resultChip = (f) => (f.result === 'defeated' ? status('Target met', 'good') : f.result === 'survived' ? status('Passed · ' + (P(f.target) - Math.round(f.score * 100)) + ' short of target', 'warn') : f.result === 'wiped' ? status('Below pass · redo', 'bad') : '');

function stats(M) {
  const bs = M.boss, nx = bs.next;
  return html`<div class="tiles six">
    ${tile({ label: 'Full papers', icon: 'mocks', value: String(M.mocks.length), foot: '2 a week to 17 Nov · 3 a week to 6 Dec · daily 7–19 Dec' })}
    ${tile({ cls: 'hero', label: 'Taken', icon: 'check', value: raw('<span data-count="' + bs.fought + '">' + bs.fought + '</span><small> / ' + M.mocks.length + '</small>'), foot: bs.fought ? 'average ' + pct(bs.avg) : 'none yet' })}
    ${tile({ label: 'Best score', icon: 'trophy', value: bs.best == null ? '—' : pct(bs.best), foot: 'out of 100' })}
    ${tile({ label: 'Target met', icon: 'target', value: String(bs.defeated), foot: 'against each paper’s checkpoint target' })}
    ${tile({ label: 'Below pass', icon: 'alert', value: String(bs.wiped), foot: 'under ' + pct(M.st.passLine) + ' · redo these' })}
    ${tile({ label: 'Next paper', icon: 'calendar', value: nx ? nx.subject : '—', foot: nx ? fmtD(nx.date) + ' · ' + (nx.date === M.t ? 'today' : 'in ' + plural(diff(M.t, nx.date), 'day')) : 'all papers done' })}</div>`;
}

function scorecard(M) {
  const t = M.t, WT = t <= '2026-11-17' ? { by: '17 Nov', att: 85, pres: 6, ill: 4, speed: 10 } : t <= '2026-12-06' ? { by: '6 Dec', att: 100, pres: 7, ill: 2, speed: 20 } : { by: '19 Dec', att: 100, pres: 8, ill: 1, speed: 20 };
  const withF = (f) => sortBy(M.mocks.filter((m) => m[f] != null), (m) => m.date), last = (f) => { const l = withF(f); return l.length ? l[l.length - 1] : null; };
  const la = last('attempted'), lp = last('pres'), lpp = last('pph'), li = last('illeg'), base = withF('pph')[0] || null;
  const gain = lpp && base && base.pph > 0 ? Math.round(100 * (lpp.pph - base.pph) / base.pph) : null;
  const verdict = (ok, has) => (!has ? chip('Not logged yet') : ok ? status('On target', 'good') : status('Not yet', 'warn'));
  const row = (name, val, target, ok, has) => html`<tr><th scope="row" style="font-weight:400">${name}</th><td data-label="Latest" class="n"><b style="font-weight:500">${val}</b></td><td data-label="Target" class="n">${target}</td><td data-label="Status">${verdict(ok, has)}</td></tr>`;
  const att = M.mocks.filter((f) => f.attempted != null);
  return card({
    cls: 'span-6', title: 'Writing scorecard', icon: 'edit', sub: 'Targets by ' + WT.by + ' · from your latest paper with each score',
    body: html`<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th scope="col">Metric</th><th scope="col" class="n">Latest</th><th scope="col" class="n">Target</th><th scope="col">Status</th></tr></thead><tbody>
      ${row('Marks attempted', la ? la.attempted + ' / 100' : '—', WT.att + '+', la && la.attempted >= WT.att, !!la)}
      ${row('Presentation', lp ? lp.pres + ' / 10' : '—', WT.pres + ' / 10', lp && lp.pres >= WT.pres, !!lp)}
      ${row('Speed vs first paper', gain == null ? (lpp ? lpp.pph + ' pages/h' : '—') : (gain >= 0 ? '+' : '') + gain + '%', '+' + WT.speed + '%', gain != null && gain >= WT.speed, gain != null)}
      ${row('Unreadable words / page', li ? li.illeg : '—', WT.ill + ' or fewer', li && li.illeg <= WT.ill, !!li)}</tbody></table></div>
      <h3 class="sub-h">Marks attempted per paper</h3>
      ${spot('writing', 'line', { height: 170, x: { type: 'date', from: M.mocks[0].date, to: M.mocks[M.mocks.length - 1].date }, y: { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }, fmtY: (v) => String(Math.round(v)), refs: [{ y: 85, label: '85 by 17 Nov', color: 'var(--ink-3)' }, { y: 100, label: 'whole paper', color: 'var(--good-mark)' }],
        series: [{ id: 'att', name: 'Attempted', color: 'var(--ink)', points: att.map((f) => ({ x: f.date, y: +f.attempted, note: 'P' + M.WMAP[f.subject].paper + ' ' + f.subject })) }], empty: { text: 'Enter “Attempted” after your first paper.' }, ariaLabel: 'Marks attempted in each full paper' })}`
  });
}
function roster(M) {
  return card({
    cls: 'span-6', title: 'By paper', icon: 'list', sub: 'Every full paper per subject · green met the target, amber passed, red is below 40',
    body: html`<ul class="roster">${M.worlds.map((w) => html`<li><span class="row" style="gap:8px"><i class="dot" style="--c:${w.c}"></i><span><b style="font-weight:500">${w.code} ${w.short}</b><br><small class="muted">${w.fights[0].bossName}</small></span></span>
      <span class="pips">${w.fights.map((f) => html`<a class="pip ${f.result || (f.status === 'missed' ? 'missed' : '')}" href="#/mocks?id=${f.id}" title="${'Mock #' + f.id + ' · ' + fmtD(f.date) + (f.score != null ? ' · ' + Math.round(f.score * 100) + ' marks' : '')}">${f.score != null ? Math.round(f.score * 100) : fmtDS(f.date)}</a>`)}</span>
      <span class="small muted">avg ${w.avg == null ? '—' : Math.round(w.avg * 100)} · best ${w.best == null ? '—' : Math.round(w.best * 100)}</span></li>`)}</ul>`
  });
}

function mockCard(M, f) {
  const w = M.WMAP[f.subject], st = M.st;
  const ni = (key, label, max, step) => numField('mocks', f.id, key, f[key], label, { pre: 'm', max, step: step || 1, sm: true });
  let rescue = '';
  if (f.status === 'skipped') rescue = html`<div class="mock-rescue">Skipped · it no longer counts as missed. <button type="button" class="btn sm ghost" data-act="mock-unskip" data-id="${f.id}">Undo</button></div>`;
  else {
    if (f.moved) rescue = html`<div class="mock-rescue" style="background:var(--info-bg);color:var(--info)">${icon('calendar')} Moved from ${fmtD(f.planDate)} to ${fmtDL(f.date)}, 2–5 PM. <button type="button" class="btn sm ghost" data-act="mock-unmove" data-id="${f.id}">Undo</button></div>`;
    if (f.marks == null && (f.status === 'missed' || (!f.moved && f.status !== 'taken' && diff(M.t, f.date) <= 2))) {
      const to = fixItDayFor(M, f);
      rescue = html`${rescue}<div class="mock-rescue ${f.status === 'missed' ? 'bad' : ''}"><span>${f.status === 'missed' ? 'Not written yet?' : 'Can’t write it that day?'}</span>${to ? html`<button type="button" class="btn sm" data-act="mock-move" data-id="${f.id}">${icon('calendar')}Move to ${fmtD(to)}</button>` : html`<span>every fix-it day is taken</span>`}${f.status === 'missed' ? html`<button type="button" class="btn sm ghost" data-act="mock-skip" data-id="${f.id}">Skip it</button>` : ''}</div>`;
    }
  }
  const photos = f.photos || [];
  return html`<article class="mock ${f.status === 'today' ? 'today' : ''} ${focusId === f.id ? 'focus' : ''}" id="mock-${f.id}" aria-labelledby="mock-${f.id}-h">
    <div class="mock-head"><div><b id="mock-${f.id}-h"><i class="dot" style="--c:${w.c};margin-right:6px"></i>Mock #${f.id} · ${w.code} ${f.subject}</b><small>${f.bossName} · ${fmtD(f.date)}${f.moved ? ' (moved)' : ''} · ${f.duration}</small></div>${statusChip(M, f)}</div>
    <div class="mock-score"><span><span class="big">${f.score == null ? '—' : Math.round(f.score * 100)}</span><span class="muted small"> / 100</span></span><span class="small muted">pass ${P(st.passLine)} · target ${P(f.target)}</span></div>
    ${bullet(f.score == null ? null : f.score * 100, { pass: st.passLine * 100, target: f.target * 100, thick: true })}
    ${f.result ? html`<div>${resultChip(f)}</div>` : ''}
    <div class="fields">${ni('marks', 'Marks / ' + f.max, f.max, 0.5)}${ni('time', 'Time taken (min)', 240)}</div>
    <div class="mock-w">${ni('attempted', 'Attempted', 100)}${ni('pres', 'Presentation /10', 10, 0.5)}${ni('pph', 'Pages / hour', null, 0.1)}${ni('illeg', 'Unreadable /pg', null)}</div>
    <div class="fields"><label class="field"><span>Marked by</span><select class="in sm" id="m-mb-${f.id}" ${bind('mocks', f.id, 'markedBy', 'sel')}><option value="">—</option>${['Self', 'Claude', 'Human'].map((x) => html`<option ${raw(f.markedBy === x ? 'selected' : '')}>${x}</option>`)}</select></label></div>
    ${textField('mocks', f.id, 'mistakes', f.mistakes, 'Mistakes · weak areas', { pre: 'm', area: true, rows: 2, ph: 'What cost you marks?' })}
    <div class="photos" aria-label="Answer-page photos">${photos.map((p, i) => html`<span class="ph"><img data-blob="${p}" alt="Answer page ${i + 1} of mock #${f.id}" data-act="photo-view"><button type="button" data-act="photo-del" data-id="${f.id}" data-ph="${p}" aria-label="Delete page ${i + 1}">${icon('x')}</button></span>`)}
      <label class="btn sm">${icon('camera')}${photos.length ? 'Add pages' : 'Add answer-page photos'}<input type="file" accept="image/*" multiple class="sr-only" data-change="photos" data-id="${f.id}"></label></div>
    ${rescue}
    <div class="mock-foot"><a class="btn sm ghost" href="#/errors?paper=${encodeURIComponent(f.subject)}&mock=${f.id}">${icon('alert')}Log lost marks</a><span class="small muted">${f.coverage}</span>${f.xp ? chip('+' + fmtN(f.xp) + ' XP') : ''}</div>
  </article>`;
}
function series(M) {
  const windows = [];
  M.mocks.forEach((f) => { if (windows.indexOf(f.cadence) < 0) windows.push(f.cadence); });
  const nextWin = M.boss.next ? M.boss.next.cadence : windows[windows.length - 1];
  const focusWin = focusId ? (M.mocks.find((f) => f.id === focusId) || {}).cadence : null;
  return card({
    title: 'Full papers', icon: 'mocks', sub: 'After each paper: marks, the four writing scores, then log the lost marks',
    body: html`${windows.map((cad, i) => {
      const fs = M.mocks.filter((f) => f.cadence === cad), key = 'bw' + i, open = focusWin ? cad === focusWin : isOpen(key, cad === nextWin);
      return html`<details class="grp" data-key="${key}" ${raw(open ? 'open' : '')}><summary><b>${cad}</b><span class="muted small">${fmtDS(fs[0].date)} – ${fmtDS(fs[fs.length - 1].date)}</span><span class="grow"></span><span class="chip">${fs.filter((f) => f.score != null).length} / ${fs.length} taken</span></summary><div class="grp-body"><div class="mock-grid">${fs.map((f) => mockCard(M, f))}</div></div></details>`;
    })}`
  });
}

// ---------- photos on this device ----------
const urls = new Map();
async function paintPhotos(root) {
  for (const img of $$('img[data-blob]', root)) {
    const id = img.dataset.blob;
    if (!urls.has(id)) { try { const b = await store.getBlob(id); if (b) urls.set(id, URL.createObjectURL(b)); } catch (e) { /* missing on this device */ } }
    if (urls.has(id)) img.src = urls.get(id); else img.alt = 'Photo not on this device';
  }
}
function shrink(file) {
  return new Promise((res) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob((b) => res(b || file), 'image/jpeg', 0.82); };
    img.onerror = () => { URL.revokeObjectURL(url); res(file); };
    img.src = url;
  });
}

export default {
  enter(q) { focusId = q.id ? +q.id : null; markingIn = q.marking || null; },
  head(M) {
    const mk = M.mocks.find((x) => x.date === M.t && x.status !== 'skipped');
    return { title: 'Mock Tests', actions: raw('<button type="button" class="btn" data-act="mk-paste" title="Add a paper Claude marked: copy its “Vayu marking” block first">' + icon('copy') + 'Paste marking</button>' + (mk ? '<a class="btn primary" href="#/mocks?id=' + mk.id + '">' + icon('edit') + 'Today · mock #' + mk.id + ' ' + esc(mk.subject) + '</a>' : '')) };
  },
  render(M) { return html`${stats(M)}${passOutlook(M, { cls: 'ol-card' })}${paperMultiples(M)}<div class="grid">${scorecard(M)}${roster(M)}</div>${series(M)}`; },
  after(root) {
    paintPhotos(root);
    if (markingIn) {
      // a link from Claude's marking report: show what it adds, and drop it from the address so a reload doesn't repeat it
      const o = decodeLink(markingIn);
      markingIn = null;
      history.replaceState(null, '', location.pathname + location.search + '#/mocks');
      setTimeout(() => openMarking(modelOf(), o ? JSON.stringify(o) : ''), 80);
    }
    if (focusId) { const el = document.getElementById('mock-' + focusId); if (el) { setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60); } focusId = null; }
  },
  actions: {
    'mk-paste': () => pasteMarking(modelOf()),
    'mock-move': (el) => { const M = modelNow(), f = M.mocks.find((x) => x.id === +el.dataset.id); if (!f) return; const d = fixItDayFor(M, f); if (!d) { toast('All five fix-it days already hold a paper. Write this one on the next Sunday instead.', { tone: 'warn', ms: 6000 }); return; } store.setRecFields('mocks', f.id, { movedTo: d, skipped: null }); toast('Mock #' + f.id + ' moved to ' + fmtDL(d) + ', 2–5 PM'); },
    'mock-unmove': (el) => store.setRec('mocks', +el.dataset.id, 'movedTo', null),
    'mock-skip': (el) => store.setRec('mocks', +el.dataset.id, 'skipped', 'Yes'),
    'mock-unskip': (el) => store.setRec('mocks', +el.dataset.id, 'skipped', null),
    'photo-del': async (el) => {
      const id = +el.dataset.id, ph = el.dataset.ph, f = modelNow().mocks.find((x) => x.id === id);
      if (!f || !(await confirm({ title: 'Delete this page photo?', body: 'It’s removed from mock #' + id + ' on this device.', ok: 'Delete', danger: true }))) return;
      store.setRec('mocks', id, 'photos', f.photos.filter((x) => x !== ph));
      store.dropBlob(ph).catch(() => {});
    },
    'photo-view': (el) => { if (el.src) modal({ title: el.alt, wide: true, body: raw('<img src="' + esc(el.src) + '" alt="' + esc(el.alt) + '" style="width:100%;border-radius:14px">') }); }
  },
  changes: {
    photos: async (el) => {
      const id = +el.dataset.id, files = Array.from(el.files || []).filter((f) => /^image\//.test(f.type));
      if (!files.length) return;
      const added = [];
      for (const f of files) { try { const b = await shrink(f), key = uid('ph'); await store.putBlob(key, b); added.push(key); } catch (e) { console.warn('[mocks] photo not saved', e); } }
      const cur = (modelNow().mocks.find((x) => x.id === id) || {}).photos || [];
      if (added.length) { store.setRec('mocks', id, 'photos', cur.concat(added)); toast(plural(added.length, 'page') + ' saved on this device'); }
      else toast('Those photos couldn’t be saved.', { tone: 'bad' });
      el.value = '';
    }
  }
};
import { model as modelNow } from '../model.js';
