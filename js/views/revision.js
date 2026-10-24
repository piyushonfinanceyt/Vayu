/* Revision: R2 / R3 coverage, questions practised and revision days done; the "Ready for R2" and "Ready for R3"
   queues (oldest first); revision by paper; the revision doses for the next 7 days. */
import { html, raw, esc, fmt1, fmtD, fmtDS, sortBy, sum, pct, typeName } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, ring, meter, empty, linkBtn } from '../components.js';
import { bind } from './parts.js';

export default {
  head(M) { const r1 = M.chapters.filter((c) => c.rev1).length; return { title: 'Revision', sub: raw(esc('R2 ' + r1 + ' / ' + M.chapters.length + ' · Phase 2 starts ' + fmtDS(M.st.revisionStart) + ' · every chapter twice more by the ' + fmtDS(M.journey.finish) + ' finish line')) }; },
  render(M) {
    const ch = M.chapters, n = ch.length;
    const r1 = ch.filter((c) => c.rev1).length, r2 = ch.filter((c) => c.rev2).length;
    const qs = sum(ch, (c) => (c.questions === 'Yes' ? 1 : c.questions === 'Partly' ? 0.5 : 0));
    const revDays = M.days.filter((d) => /Revision/.test(d.type)), revDone = revDays.filter((d) => d.rec.status === 'done').length, revPast = revDays.filter((d) => d.date <= M.t).length;
    const tile = (label, v, sub, p, hero) => html`<div class="tile ring-tile ${hero ? 'hero' : ''}"><span class="lbl">${label}</span><span class="row" style="gap:14px;margin-top:6px">${ring(p, { size: 58, stroke: 6, text: Math.round(p * 100) + '%', color: hero ? 'var(--on-hero)' : 'var(--ink)' })}<span><span class="value" style="margin:0">${v}</span><span class="tile-foot" style="padding:0">${sub}</span></span></span></div>`;
    const tiles = html`<div class="tiles">${tile('Revision R2', r1 + ' / ' + n, pct(r1 / n) + ' of chapters', r1 / n, true)}${tile('Revision R3', r2 + ' / ' + n, pct(r2 / n) + ' of chapters', r2 / n)}${tile('Questions practised', fmt1(qs) + ' / ' + n, '“Partly” counts half', qs / n)}${tile('Revision days done', revDone + ' / ' + revDays.length, revPast + ' scheduled so far', revDays.length ? revDone / revDays.length : 0)}</div>`;
    const qRow = (c, f) => html`<li class="rq"><span class="li-main"><b><i class="dot" style="--c:${M.WMAP[c.subject].c};margin-right:8px"></i>#${c.id} ${c.name}</b><small>${c.paper} ${c.subject} · ${f === 'rev1' ? 'R1 done ' + fmtDS(c.doneAt) : 'R2 done ' + fmtDS(c.rev1At)}${c.priority === 'HIGH' ? ' · high priority' : ''}</small></span><button type="button" class="tog" ${bind('chapters', c.id, f, 'bool')} aria-pressed="false" aria-label="Mark ${f === 'rev1' ? 'R2' : 'R3'} done for chapter ${c.id}">${f === 'rev1' ? 'R2 done' : 'R3 done'}</button></li>`;
    const q1 = sortBy(ch.filter((c) => c.status === 'done' && !c.rev1), (c) => c.doneAt || ''), q2 = sortBy(ch.filter((c) => c.rev1 && !c.rev2), (c) => c.rev1At || '');
    const queues = html`<div class="grid">${card({ cls: 'span-6', title: 'Ready for R2', icon: 'revision', sub: 'Chapters with R1 done, oldest first', actions: chip(String(q1.length)), body: q1.length ? html`<ul class="list rq-list">${q1.slice(0, 25).map((c) => qRow(c, 'rev1'))}</ul>${q1.length > 25 ? html`<p class="hint">${q1.length - 25} more after these.</p>` : ''}` : empty('Chapters you finish appear here for their second pass.', linkBtn('#/subjects', 'Open Subjects'), 'revision') })}
      ${card({ cls: 'span-6', title: 'Ready for R3', icon: 'revision', sub: 'Chapters with R2 done, oldest first', actions: chip(String(q2.length)), body: q2.length ? html`<ul class="list rq-list">${q2.slice(0, 25).map((c) => qRow(c, 'rev2'))}</ul>` : empty('Chapters with R2 done appear here for the final pass.', '', 'revision') })}</div>`;
    const bySubj = card({
      cls: 'span-7', title: 'Revision by paper', icon: 'book', sub: 'R2 and R3 ticks against the chapters in each paper',
      body: html`<ul class="rev-bars">${M.worlds.map((w) => html`<li><span class="row" style="gap:8px"><i class="dot" style="--c:${w.c}"></i><b style="font-weight:500">${w.code} ${w.short}</b></span>
        <span class="rb"><small>R2</small>${meter(w.rev1 / w.chapters, { thin: true, label: w.code + ' R2' })}<b class="num">${w.rev1}/${w.chapters}</b></span>
        <span class="rb"><small>R3</small>${meter(w.rev2 / w.chapters, { thin: true, label: w.code + ' R3' })}<b class="num">${w.rev2}/${w.chapters}</b></span></li>`)}</ul>`
    });
    const next = M.days.filter((d) => d.date >= M.t).slice(0, 7);
    const upcoming = card({
      cls: 'span-5', title: 'The next 7 days', icon: 'calendar', sub: 'Revision dose for each day of the plan',
      body: next.length ? html`<ol class="timeline">${next.map((d) => html`<li class="${d.date === M.t ? 'today' : ''}"><span class="tl-date">${d.date === M.t ? 'Today' : fmtD(d.date)}</span><span class="tl-body"><a href="#/study-plan?date=${d.date}" style="text-decoration:none"><b>${d.rev}</b></a><small>${typeName(d.type)}${/Revision/.test(d.type) ? ' · ' + String(d.main).split('\n')[0] : ''}</small></span></li>`)}</ol>` : empty('The plan has ended.', '', 'calendar')
    });
    return html`${tiles}${queues}<div class="grid">${bySubj}${upcoming}</div>`;
  }
};
