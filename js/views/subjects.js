/* Subjects: the 105 chapters across P1–P6. Paper cards, filters (paper, status, priority, overdue / soon / done in
   Sep '26, search), then a List (status, R2 / R3 ticks, questions, notes per chapter) or a Board (kanban:
   Pending · In progress · Done · Revised, drag a card or use its Move menu). Same fields as the original "Quests". */
import { html, raw, esc, fmt1, fmtN, fmtD, fmtDS, plural, diff, addDays, mondayOf, sum, pct } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, status, seg, meter, empty, menu, prio } from '../components.js';
import { recSeg, bind } from './parts.js';
import { pref, setPref, setPrefs, isOpen } from '../prefs.js';
import { renderSoon } from '../router.js';
import * as store from '../store.js';

const flagChip = (f) => (f === 'overdue' ? status('Overdue', 'bad') : f === 'today' ? chip('Today', 'ink', 'flag') : f === 'soon' ? chip('Due soon', 'line', 'clock') : '');
const COLS = [['pending', 'Pending', 'circle'], ['progress', 'In progress', 'clock'], ['done', 'Done · R1', 'check'], ['revised', 'Revised · R2 / R3', 'revision']];
const colOf = (c) => (c.rev1 || c.rev2 ? 'revised' : c.status);
function moveTo(id, col) {
  const c = store.chRec(store.CH_BY[id]);
  store.batch(() => {
    if (col === 'revised') { store.setRec('chapters', id, 'status', 'done'); if (!c.rev1) store.setRec('chapters', id, 'rev1', true); }
    else { store.setRec('chapters', id, 'status', col); if (c.rev1) store.setRec('chapters', id, 'rev1', false); if (c.rev2) store.setRec('chapters', id, 'rev2', false); }
  });
}

function filtered(M) {
  const qW = pref('qWorld', 'all'), qS = pref('qStatus', 'all'), qP = pref('qPri', 'all'), qF = pref('qFlag', 'all'), raw0 = String(pref('qSearch', '')).trim().toLowerCase();
  let list = M.chapters;
  if (qW !== 'all') list = list.filter((c) => c.subject === qW);
  if (qS !== 'all') list = list.filter((c) => c.status === qS);
  if (qP !== 'all') list = list.filter((c) => c.priority === qP);
  if (qF === 'overdue') list = list.filter((c) => c.flag === 'overdue'); else if (qF === 'soon') list = list.filter((c) => c.flag === 'today' || c.flag === 'soon'); else if (qF === 'sep') list = list.filter((c) => c.sep === '✅ Done');
  if (/^#\d+$/.test(raw0)) list = list.filter((c) => String(c.id) === raw0.slice(1));
  else if (raw0) list = list.filter((c) => c.name.toLowerCase().indexOf(raw0) >= 0 || String(c.id) === raw0);
  return { list, qW, qS, qP, qF, q: raw0, any: qS !== 'all' || qP !== 'all' || qF !== 'all' || !!raw0 };
}

function paperCards(M, qW) {
  return html`<div class="papers">${M.worlds.map((w) => html`<button type="button" class="paper ${qW === w.key ? 'sel' : ''}" data-act="subj-filter" data-world="${w.key}" aria-pressed="${String(qW === w.key)}">
    <span class="between"><span class="row" style="gap:10px"><span class="code" style="--c:${w.c}">${w.code}</span><span><b>${w.short}</b><small>${w.name}</small></span></span>${status(w.status.t, w.status.cls === 'info' ? '' : w.status.cls)}</span>
    <span class="paper-num"><span class="value">${w.done}<small> / ${w.chapters}</small></span><span class="muted small">${pct(w.pct)}</span></span>
    ${meter(w.pct, { label: w.code + ' chapters done' })}
    <span class="between small muted"><span>${fmtDS(w.winStart)} → ${fmtDS(w.winEnd)}</span><span>${fmt1(w.hrsLeft)} h left · mocks ${w.mocksTaken}/${w.mocksPlanned}</span></span></button>`)}</div>`;
}

function filters(M, F) {
  return card({
    title: 'Filters', icon: 'filter', sub: 'Done = +' + M.st.xp.chapterDone + ' XP (HIGH +' + M.st.xp.highBonus + ') · each revision +' + M.st.xp.revision + ' · questions +' + M.st.xp.questions,
    actions: F.any || F.qW !== 'all' ? html`<button type="button" class="btn sm ghost" data-act="subj-reset">${icon('x')}Clear filters</button>` : '',
    body: html`<div class="filter-grid">
      <div class="field"><span>Status</span>${seg('q-status', [['all', 'All'], ['pending', 'Pending'], ['progress', 'In progress'], ['done', 'Done']], F.qS, { label: 'Status' })}</div>
      <div class="field"><span>Priority</span>${seg('q-pri', [['all', 'All'], ['HIGH', 'High'], ['MEDIUM', 'Medium'], ['LOW', 'Low']], F.qP, { label: 'Priority' })}</div>
      <div class="field"><span>Show</span>${seg('q-flag', [['all', 'Everything'], ['overdue', 'Overdue'], ['soon', 'Today and soon'], ['sep', 'Done in Sep ’26']], F.qF, { label: 'Show' })}</div>
      <label class="field"><span>Search</span><input id="q-search" class="in" type="search" value="${pref('qSearch', '')}" placeholder="Chapter name or #number" data-input="q-search" autocomplete="off"></label></div>
      ${scout(M, F)}`
  });
}
function scout(M, F) {
  if (F.qW === 'all') {
    const hrs = sum(M.worlds, (w) => w.hrsLeft), high = sum(M.worlds, (w) => w.highPending), od = sum(M.worlds, (w) => w.overdue);
    return html`<div class="scout"><span><b>${M.done}</b> of ${M.chapters.length} chapters done · ${pct(M.done / M.chapters.length)} · ${fmt1(hrs)} h of chapters left · ${high} high priority pending</span>${M.onPace ? status('On pace', 'good') : status(plural(M.behind, 'chapter') + ' behind the plan', 'warn')}${od ? html`<a class="chip bad" href="#/subjects?flag=overdue">${icon('alert')}${od} overdue</a>` : ''}</div>`;
  }
  const w = M.worlds.find((x) => x.key === F.qW), nb = w.nextBoss;
  return html`<div class="scout two"><div><span class="lbl">${w.code} · ${w.name} · Group ${w.grp.slice(1)}</span><p>${w.done} of ${w.chapters} done · ${w.overdue ? w.overdue + ' overdue' : 'nothing overdue'} · ${w.sepDone} were done in September</p><span class="lbl">Up next</span>${w.upNext.length ? html`<ol class="upnext">${w.upNext.map((c) => html`<li>#${c.id} ${c.name} <span class="muted">· ${fmtD(c.planned)}</span></li>`)}</ol>` : html`<p>Paper complete.</p>`}</div>
    <div><span class="lbl">Full papers</span><p>${w.mocksTaken} of ${w.mocksPlanned} written · average ${w.avg == null ? '—' : Math.round(w.avg * 100)} · best ${w.best == null ? '—' : Math.round(w.best * 100)} · target now ${Math.round(w.nextTarget * 100)}</p><span class="lbl">Next full paper</span><p>${nb ? fmtD(nb.date) + ' (' + (nb.date === M.t ? 'today' : 'in ' + plural(diff(M.t, nb.date), 'day')) + ') · ' + nb.bossName : '—'}</p><span class="lbl">XP from this paper</span><p>${fmtN(w.xp)} XP · ${w.highPending} high-priority chapters pending</p></div></div>`;
}

function chapterRow(M, c) {
  return html`<div class="ch ${c.status === 'done' ? 'done' : ''}" id="ch-${c.id}"><span class="ch-no num">#${c.id}</span><div class="ch-body">
    <div class="ch-name">${c.name}</div>
    <div class="ch-meta"><i class="dot" style="--c:${M.WMAP[c.subject].c}"></i><span>${c.paper} ${c.subject} · ${fmt1(c.hrs)} h · ${fmtD(c.planned)}</span>${prio(c.priority)}${flagChip(c.flag)}${c.sep === '✅ Done' ? chip('Sep ’26 ✓', 'line') : ''}${c.xp ? chip('+' + fmtN(c.xp) + ' XP') : ''}</div>
    <div class="ch-ctl">${recSeg('chapters', c.id, 'status', c.status, [['pending', 'Pending'], ['progress', 'In progress'], ['done', 'Done', 'good']], 'Status of chapter ' + c.id)}
      <button type="button" class="tog" id="tg-${c.id}-r1" ${bind('chapters', c.id, 'rev1', 'bool')} aria-pressed="${String(!!c.rev1)}" title="Revision 2 (Phase 2)">R2</button>
      <button type="button" class="tog" id="tg-${c.id}-r2" ${bind('chapters', c.id, 'rev2', 'bool')} aria-pressed="${String(!!c.rev2)}" title="Revision 3 (final)">R3</button>
      <select id="cq-${c.id}" class="in sm" ${bind('chapters', c.id, 'questions', 'sel')} aria-label="Questions practised for chapter ${c.id}">${[['', 'Questions?'], ['Yes', 'Questions: yes'], ['Partly', 'Questions: partly'], ['No', 'Questions: no']].map((o) => html`<option value="${o[0]}" ${raw((c.questions || '') === o[0] ? 'selected' : '')}>${o[1]}</option>`)}</select>
      <input id="cn-${c.id}" class="in sm note" type="text" ${bind('chapters', c.id, 'notes', 'text')} value="${c.notes || ''}" placeholder="Notes" aria-label="Notes for chapter ${c.id}"></div></div></div>`;
}
function listBody(M, F) {
  const list = F.list;
  if (!list.length) return empty('No chapters match these filters.', html`<button type="button" class="btn sm" data-act="subj-reset">Clear filters</button>`, 'filter');
  if (F.qW !== 'all' || F.any) {
    if (F.qW !== 'all') return html`${list.map((c) => chapterRow(M, c))}`;
    return html`${M.WORLDS.map((w) => { const l = list.filter((c) => c.subject === w.key); return l.length ? html`<h3 class="grp-title"><i class="dot" style="--c:${w.c}"></i>${w.code} ${w.short} <span class="muted">${l.length}</span></h3>${l.map((c) => chapterRow(M, c))}` : ''; })}`;
  }
  // no filters: this week's chapters open on top, then one folded group per paper
  const ws = mondayOf(M.t), we = addDays(ws, 6), wk = list.filter((c) => c.planned >= ws && c.planned <= we);
  return html`${wk.length ? html`<h3 class="grp-title">This week · ${fmtDS(ws)} – ${fmtDS(we)} <span class="muted">${wk.length}</span></h3>${wk.map((c) => chapterRow(M, c))}` : html`<p class="hint">No chapters planned this week.</p>`}
    ${M.WORLDS.map((w) => { const l = list.filter((c) => c.subject === w.key), key = 'sp-p' + w.paper; return html`<details class="grp" data-key="${key}" ${raw(isOpen(key) ? 'open' : '')}><summary><i class="dot" style="--c:${w.c}"></i><b>${w.code} ${w.short}</b><span class="muted small">${l.filter((c) => c.status === 'done').length} / ${l.length} done</span></summary><div class="grp-body">${l.map((c) => chapterRow(M, c))}</div></details>`; })}`;
}
function boardBody(M, F) {
  return html`<div class="board" role="list">${COLS.map(([k, label, ic]) => {
    const items = F.list.filter((c) => colOf(c) === k);
    return html`<section class="col" data-col="${k}" role="listitem" aria-label="${label}, ${items.length} chapters"><header class="col-h"><span class="row" style="gap:8px">${icon(ic)}<b>${label}</b></span><span class="chip">${items.length}</span></header>
      <div class="col-body">${items.length ? items.map((c) => html`<article class="kcard" draggable="true" data-ch="${c.id}" id="kc-${c.id}">
        <div class="between"><span class="chip line"><i class="dot" style="--c:${M.WMAP[c.subject].c}"></i>${c.paper} ${M.WMAP[c.subject].short}</span><button type="button" class="icon-btn sm" data-act="kc-move" data-id="${c.id}" aria-label="Move chapter ${c.id}" aria-haspopup="menu">${icon('moreV')}</button></div>
        <p class="kc-title">#${c.id} ${c.name}</p>
        <div class="kc-meta">${icon('calendar')}<span>${fmtDS(c.planned)}</span><span>· ${fmt1(c.hrs)} h</span>${c.priority === 'HIGH' ? prio('high') : ''}${flagChip(c.flag)}${c.rev1 ? chip('R2', 'good') : ''}${c.rev2 ? chip('R3', 'good') : ''}</div></article>`) : html`<p class="col-empty">Drop a chapter here</p>`}</div></section>`;
  })}</div><p class="hint">Drag a card between columns, or use its ⋮ menu. Revised means R2 is ticked; R3 is on the chapter’s menu.</p>`;
}

export default {
  enter(q) {
    const p = {};
    if (q.world) p.qWorld = q.world;
    if (q.flag) Object.assign(p, { qFlag: q.flag, qWorld: 'all', qStatus: 'all', qPri: 'all', qSearch: '' });
    if (q.q) Object.assign(p, { qSearch: q.q, qWorld: 'all', qStatus: 'all', qPri: 'all', qFlag: 'all', subjView: 'list' });
    if (Object.keys(p).length) setPrefs(p);
  },
  head(M) {
    const mode = pref('subjView', 'list');
    return { title: 'Subjects', sub: raw(esc(M.done + ' of ' + M.chapters.length + ' chapters done · R1 deadline ' + fmtDS(M.st.syllabusDeadline))), actions: seg('subj-view', [['list', 'List'], ['board', 'Board']], mode, { ink: true, label: 'Layout' }) };
  },
  render(M) {
    const F = filtered(M), mode = pref('subjView', 'list');
    return html`${paperCards(M, F.qW)}${filters(M, F)}
      ${card({ title: F.qW === 'all' ? 'All papers' : M.WMAP[F.qW].code + ' ' + F.qW, icon: mode === 'board' ? 'grid' : 'book', actions: chip(plural(F.list.length, 'chapter')), cls: mode === 'board' ? 'board-card' : '', body: mode === 'board' ? boardBody(M, F) : html`<div class="chlist">${listBody(M, F)}</div>` })}`;
  },
  segs: {
    'subj-view': (v) => setPref('subjView', v), 'q-status': (v) => setPref('qStatus', v), 'q-pri': (v) => setPref('qPri', v), 'q-flag': (v) => setPref('qFlag', v)
  },
  inputs: { 'q-search': (el) => { setPref('qSearch', el.value); renderSoon(); } },
  actions: {
    'subj-filter': (el) => { setPrefs({ qWorld: pref('qWorld') === el.dataset.world ? 'all' : el.dataset.world, qSearch: '' }); renderSoon(); },
    'subj-reset': () => { setPrefs({ qWorld: 'all', qStatus: 'all', qPri: 'all', qFlag: 'all', qSearch: '' }); renderSoon(); },
    'kc-move': (el) => {
      const id = el.dataset.id, c = store.chRec(store.CH_BY[id]), cur = colOf(c);
      menu(el, [{ heading: 'Move chapter #' + id }].concat(COLS.filter((x) => x[0] !== cur).map((x) => ({ label: x[1], icon: x[2], fn: () => moveTo(id, x[0]) })), ['-', { label: c.rev2 ? 'Untick R3' : 'Tick R3 (final revision)', icon: 'revision', fn: () => { store.batch(() => { if (!c.rev2) store.setRec('chapters', id, 'status', 'done'); store.setRec('chapters', id, 'rev2', !c.rev2); }); } }, { label: 'Open in the list', icon: 'list', fn: () => { setPrefs({ subjView: 'list', qSearch: '#' + id, qWorld: 'all', qStatus: 'all', qPri: 'all', qFlag: 'all' }); renderSoon(); } }]), { align: 'end' });
    }
  }
};

// ---------- drag and drop on the board ----------
let dragId = null;
document.addEventListener('dragstart', (e) => { const k = e.target.closest && e.target.closest('.kcard'); if (!k) return; dragId = k.dataset.ch; k.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (x) { /* old browsers */ } });
document.addEventListener('dragend', (e) => { const k = e.target.closest && e.target.closest('.kcard'); if (k) k.classList.remove('dragging'); document.querySelectorAll('.col.over').forEach((c) => c.classList.remove('over')); dragId = null; });
document.addEventListener('dragover', (e) => { const col = e.target.closest && e.target.closest('.col'); if (!col || !dragId) return; e.preventDefault(); document.querySelectorAll('.col.over').forEach((c) => { if (c !== col) c.classList.remove('over'); }); col.classList.add('over'); });
document.addEventListener('drop', (e) => { const col = e.target.closest && e.target.closest('.col'); if (!col || !dragId) return; e.preventDefault(); col.classList.remove('over'); moveTo(dragId, col.dataset.col); dragId = null; });
