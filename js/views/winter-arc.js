/* Winter Arc: three layers.
   1. Momentum board (option C): the 110-day study heatmap across the plan's phases, study streak, level and arc day.
   2. The 92-day challenge (port of the original): day sheet, clean / perfect days, arc rank, streaks, calendar,
      where you slip, arc goals and arc settings. Linked habits read and write the 10 PM log.
   3. The game hub: level and the 9-rank ladder, XP rules (settings.xp) with where your XP came from, 16 badges,
      boss defeats and the quote of the day. */
import { html, raw, esc, fmt1, fmtN, fmtD, fmtDS, fmtDY, plural, diff, addDays, clamp, sum, MONL, parse, todayStr, isDate, debounce } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, status, tile, ring, meter, empty, toast, confirm } from '../components.js';
import { isOpen } from '../prefs.js';
import { renderSoon } from '../router.js';
import * as store from '../store.js';
import * as arc from '../arc.js';
import { studyHeatmap, heatLegend } from './insights.js';

let sel = null, armed = null, armT = 0;
const fmtV = (v) => (Math.abs(v) >= 1000 ? fmtN(v) : String(Math.round(v * 100) / 100));
const rankName = (r) => String(r ? r.name : '').replace(/^\S+\s/, '');
const rankEmoji = (r) => String(r ? r.name : '').split(' ')[0];
function arm(key) { armed = key; clearTimeout(armT); armT = setTimeout(() => { armed = null; renderSoon(); }, 4000); renderSoon(); }
function selDay(Z) { const last = Z.lastIdx >= 0 ? addDays(Z.start, Z.lastIdx) : Z.start; if (!sel || sel < Z.start || sel > Z.end || sel > Z.t) sel = Z.active ? Z.t : last; return sel; }

// ---------- 1. momentum board ----------
function momentum(M) {
  const Z = M.arc, nx = M.nextRank;
  return html`${card({ title: '110 days at a glance', icon: 'calendar', sub: 'Every plan day, shaded by how much of its hours target you logged · the bar above marks each phase', body: html`${heatLegend()}${studyHeatmap(M, { id: 'arc-heat' })}` })}
    <div class="tiles">
      <div class="tile hero"><span class="lbl">${icon('flame')}Study streak</span><span class="value xl"><span data-count="${M.streak}">${M.streak}</span><small> ${M.streak === 1 ? 'day' : 'days'}</small></span><span class="tile-foot">Best ${M.bestStreak} · no-zero streak ${M.noZero.streak} (≥ ${M.noZero.min} h)</span></div>
      <div class="tile"><span class="lbl">${icon('award')}Level</span><span class="row" style="gap:14px;margin-top:6px">${ring(M.lvProg, { size: 64, stroke: 6, text: String(M.level), label: 'Level ' + M.level + ', ' + Math.round(M.lvProg * 100) + '% to the next' })}<span><b style="font-weight:500;font-size:17px">${rankName(M.rank)}</b><br><span class="small muted">${fmtN(M.xp)} XP · ${fmtN(M.lvNext - M.xp)} to level ${M.level + 1}</span></span></span></div>
      <div class="tile"><span class="lbl">${icon('snow')}Winter Arc</span><span class="value">${Z.active ? 'Day ' + Z.dayNum : Z.todayIdx < 0 ? 'Starts ' + fmtDS(Z.start) : 'Complete'}<small> / ${Z.days}</small></span><span class="tile-foot">${Z.clean} clean days · rank ${Z.rank.n}</span></div>
      <div class="tile"><span class="lbl">${icon('trophy')}Badges</span><span class="value">${M.badgeCount}<small> / ${M.badges.length}</small></span><span class="tile-foot">${nx ? rankName(nx) + ' at level ' + nx.level : 'Top rank reached'}</span></div></div>`;
}

// ---------- 2. the 92-day challenge ----------
function track(Z) {
  const fill = clamp(Z.elapsed / Z.days * 100, 0, 100);
  const sol = Z.sol ? html`<b class="atrack-tick" style="left:${((Z.sol.i + 0.5) / Z.days * 100).toFixed(2)}%" title="Shortest day · ${fmtDS(Z.sol.k)}"></b>` : '';
  return html`<span class="atrack" role="img" aria-label="${Z.elapsed} of ${Z.days} days gone"><i style="width:${fmtV(fill)}%"></i>${sol}</span>`;
}
function chipFor(Z, k, fut) {
  if (!Z.n) return ['Add a habit in the arc settings', ''];
  if (fut) return ['Opens ' + fmtD(k), ''];
  const d = Z.doneCount(k);
  if (d === Z.n) return ['Perfect day · +25 XP bonus', 'good'];
  if (Z.isClean(k)) return ['Clean day', 'good'];
  return [plural(Math.ceil(Z.c.threshold / 100 * Z.n - 1e-9) - d, 'more habit') + ' for a clean day', 'warn'];
}
function habitItem(Z, h, k, fut) {
  const v = Z.val(k, h), d = Z.isDone(h, v), L = h.link && arc.LINKS[h.link];
  const link = L ? html`<span class="alink" title="Shared with your 10 PM log: log it in either place">${icon('link')}${L.label}</span>` : '';
  if (h.kind === 'check') return html`<li class="check ${d ? 'done' : ''}"><button type="button" class="cbx" role="checkbox" aria-checked="${String(d)}" data-act="arc-toggle" data-id="${h.id}" data-k="${k}" ${raw(fut ? 'aria-disabled="true"' : '')} aria-label="${h.name}">${icon('check')}</button><span class="li-main"><b>${h.name}</b>${link}</span></li>`;
  const pc = clamp(v / h.target * 100, 0, 100);
  return html`<li class="check ${d ? 'done' : ''}"><span class="cbx" aria-hidden="true" ${raw(d ? 'style="background:var(--ink);border-color:var(--ink);color:var(--bg)"' : '')}>${icon('check')}</span><span class="li-main"><b>${h.name}</b>${link}<span class="ah-meter"><i style="width:${pc.toFixed(0)}%"></i></span></span>
    <span class="ah-step"><button type="button" class="icon-btn sm" data-act="arc-step" data-dir="-1" data-id="${h.id}" data-k="${k}" aria-label="Less ${h.name}" ${raw(fut || v <= 0 ? 'aria-disabled="true"' : '')}>${icon('minus')}</button><output class="num"><b>${fmtV(v)}</b> / ${fmtV(h.target)} ${h.unit}</output><button type="button" class="icon-btn sm" data-act="arc-step" data-dir="1" data-id="${h.id}" data-k="${k}" aria-label="More ${h.name}" ${raw(fut ? 'aria-disabled="true"' : '')}>${icon('plus')}</button></span></li>`;
}
function daySheet(Z) {
  const k = selDay(Z), idx = diff(Z.start, k), fut = k > Z.t, [txt, tone] = chipFor(Z, k, fut);
  return card({
    cls: 'span-7', title: 'Day sheet', icon: 'calcheck',
    actions: html`<button type="button" class="icon-btn" data-act="arc-day" data-dir="-1" aria-label="Previous day" ${raw(idx <= 0 ? 'aria-disabled="true"' : '')}>${icon('chevL')}</button><span class="small" style="min-width:110px;text-align:center"><b style="font-weight:500">${fmtD(k)}</b><br><span class="muted">Day ${idx + 1} of ${Z.days}${k === Z.t ? ' · today' : ''}</span></span><button type="button" class="icon-btn" data-act="arc-day" data-dir="1" aria-label="Next day" ${raw(idx >= Z.days - 1 || k >= Z.t ? 'aria-disabled="true"' : '')}>${icon('chevR')}</button>`,
    body: html`${Z.n ? html`${meter(Z.doneCount(k) / Z.n, { target: Z.c.threshold / 100, targetLabel: 'clean day', label: Z.doneCount(k) + ' of ' + Z.n + ' habits done' })}<div class="between small" style="margin:8px 0 4px"><span>${Z.doneCount(k)} of ${Z.n} · ${Z.pctOf(k)}%</span>${fut ? '' : html`<span class="muted">+${Z.xpOf(k)} arc XP</span>`}</div>` : ''}
      <p style="margin:6px 0 4px">${tone ? status(txt, tone) : chip(txt)}${k !== Z.t && Z.active ? html` <button type="button" class="btn sm ghost" data-act="arc-today">Back to today</button>` : ''}</p>
      <ul class="arc-sheet">${Z.c.habits.map((h) => habitItem(Z, h, k, fut))}</ul>
      <label class="field" style="margin-top:12px"><span>Note for ${fmtD(k)}</span><textarea id="arc-note" class="in" maxlength="400" rows="2" data-input="arc-note" data-k="${k}" placeholder="What worked, what didn’t." ${raw(fut ? 'disabled' : '')}>${Z.note(k)}</textarea></label>`
  });
}
function statsCard(Z) {
  const nx = Z.next, prog = nx ? (Z.xp - Z.rank.xp) / (nx.xp - Z.rank.xp) : 1;
  const st = (l, v, u) => html`<div><dt>${l}</dt><dd>${v}${u ? html`<small> ${u}</small>` : ''}</dd></div>`;
  return card({
    title: 'Streaks and arc rank', icon: 'flame',
    body: html`<dl class="arc-stats">${st('Streak', Z.streak, Z.streak === 1 ? 'day' : 'days')}${st('Best run', Z.best, Z.best === 1 ? 'day' : 'days')}${st('Clean days', Z.clean, '/ ' + Math.max(Z.elapsed, 0))}${st('Average', Z.avg == null ? '–' : Z.avg, Z.avg == null ? '' : '%')}</dl>
      <div class="between" style="margin-top:14px"><b style="font-weight:500">${Z.rank.n}</b><span class="small muted">${fmtN(Z.xp)} arc XP${nx ? ' · ' + fmtN(nx.xp - Z.xp) + ' to ' + nx.n : ' · top rank'}</span></div>${meter(prog, { label: 'Progress to the next arc rank' })}
      <p class="hint">A clean day needs ${Z.c.threshold}% of habits. Averages count finished days only. Arc XP is 10 per habit plus 25 for a perfect day.</p>`
  });
}
function ratesCard(Z) {
  if (!Z.n) return '';
  return card({
    title: 'Where you slip', icon: 'activity', sub: 'Last 14 days, newest on the right',
    body: html`${Z.weakest ? html`<p class="small" style="margin-bottom:8px">Weakest habit: <b style="font-weight:500">${Z.weakest.h.name}</b> at ${Z.weakest.rate}%.</p>` : Z.pastN < 3 ? html`<p class="hint">Rates show up after three finished days.</p>` : ''}
      <ul class="arates">${Z.hs.map((x) => html`<li><div class="between small"><span>${x.h.name}</span><b class="num" style="font-weight:500">${x.rate === null ? '–' : x.rate + '%'}</b></div><div class="astrip" aria-hidden="true">${x.strip.map((s) => html`<i data-s="${s}"></i>`)}</div></li>`)}</ul>`
  });
}
function calCard(Z) {
  const k0 = selDay(Z), months = [];
  let cur = null;
  for (let i = 0; i < Z.days; i++) {
    const k = addDays(Z.start, i), d = parse(k), mk = k.slice(0, 7);
    if (!cur || cur.mk !== mk) { cur = { mk, y: d.getFullYear(), m: d.getMonth(), off: (d.getDay() + 6) % 7, cells: [], clean: 0, elapsed: 0 }; months.push(cur); }
    const fut = i > Z.lastIdx, pc = Z.pctOf(k), lvl = fut ? 'f' : pc === 0 ? '0' : pc < 50 ? '1' : !Z.isClean(k) ? '2' : Z.doneCount(k) === Z.n ? '4' : '3';
    if (!fut) { cur.elapsed++; if (Z.isClean(k)) cur.clean++; }
    const sol = k.slice(5) === '12-21';
    cur.cells.push(html`<button type="button" class="acell" data-act="arc-pick" data-k="${k}" data-lvl="${lvl}" ${raw(k === Z.t ? 'aria-current="date"' : '')} aria-pressed="${String(k === k0)}" ${raw(fut ? 'aria-disabled="true" tabindex="-1"' : '')} ${raw(sol ? 'data-sol="1"' : '')} aria-label="${fmtD(k) + (fut ? ', not open yet' : ', ' + pc + ' percent') + (sol ? ', winter solstice' : '')}">${d.getDate()}</button>`);
  }
  return card({
    cls: 'span-7', title: 'The ' + Z.days + ' days', icon: 'calendar',
    body: html`<div class="legend"><span><i class="key" style="--c:var(--track)"></i>none</span><span><i class="key l1"></i>some</span><span><i class="key l2"></i>most</span><span><i class="key l3"></i>clean</span><span><i class="key l4"></i>perfect</span><span><i class="key" style="--c:transparent;border:2px solid var(--info)"></i>shortest day</span></div>
      <div class="amonths">${months.map((m) => html`<div><div class="between small" style="margin-bottom:6px"><b style="font-weight:500">${MONL[m.m]}</b><span class="muted">${m.elapsed ? m.clean + ' / ' + m.elapsed + ' clean' : plural(m.cells.length, 'day')}</span></div><div class="adow" aria-hidden="true"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div><div class="amgrid">${raw(new Array(m.off + 1).join('<span></span>'))}${m.cells}</div></div>`)}</div>`
  });
}
function goalsCard(Z) {
  return card({
    cls: 'span-5', title: 'Arc goals', icon: 'target', sub: 'Rename, then drag to log progress',
    body: html`<ul class="agoals">${Z.c.goals.map((g) => html`<li><div class="row"><input type="text" class="in sm grow" id="arc-gt-${g.id}" maxlength="80" value="${g.text}" data-change="arc-goal-text" data-id="${g.id}" aria-label="Goal"><button type="button" class="btn sm ghost ${armed === 'g:' + g.id ? 'danger' : ''}" data-act="arc-goal-del" data-id="${g.id}">${armed === 'g:' + g.id ? 'Tap again' : 'Remove'}</button></div>
      <div class="row" style="margin-top:6px"><input type="range" class="grow" min="0" max="100" step="5" value="${g.p}" id="arc-gr-${g.id}" data-input="arc-goal-p" data-id="${g.id}" aria-label="Progress on ${g.text}"><output class="num small" id="arc-go-${g.id}" style="min-width:40px;text-align:right">${g.p}%</output></div></li>`)}</ul>
      ${Z.c.goals.length < 8 ? html`<button type="button" class="btn sm" data-act="arc-goal-add">${icon('plus')}Add a goal</button>` : ''}`
  });
}
function settingsCard(Z) {
  const c = Z.c;
  const linkOpts = (h) => html`<option value="">Only here</option>${Object.keys(arc.LINKS).filter((key) => !!arc.LINKS[key].check === (h.kind === 'check')).map((key) => html`<option value="${key}" ${raw(h.link === key ? 'selected' : '')}>${arc.LINKS[key].label} (10 PM log)</option>`)}`;
  const row = (h) => { const cnt = h.kind === 'count', a = armed === 'h:' + h.id, f = (fld, label, input) => html`<label class="field ${fld === 'name' ? 'wide' : ''}"><span>${label}</span>${input}</label>`;
    return html`<div class="ahed">${f('name', 'Name', html`<input class="in sm" type="text" id="arc-hn-${h.id}" maxlength="60" value="${h.name}" data-change="arc-hf" data-f="name" data-id="${h.id}">`)}
      ${f('kind', 'Type', html`<select class="in sm" id="arc-hk-${h.id}" data-change="arc-hf" data-f="kind" data-id="${h.id}"><option value="check" ${raw(cnt ? '' : 'selected')}>Done or not</option><option value="count" ${raw(cnt ? 'selected' : '')}>Count</option></select>`)}
      ${cnt ? html`${f('target', 'Daily target', html`<input class="in sm" type="number" id="arc-ht-${h.id}" min="0.5" step="any" value="${h.target}" data-change="arc-hf" data-f="target" data-id="${h.id}">`)}${f('step', 'Step', html`<input class="in sm" type="number" id="arc-hs-${h.id}" min="0.1" step="any" value="${h.step}" data-change="arc-hf" data-f="step" data-id="${h.id}">`)}${f('unit', 'Unit', html`<input class="in sm" type="text" id="arc-hu-${h.id}" maxlength="12" value="${h.unit}" data-change="arc-hf" data-f="unit" data-id="${h.id}">`)}` : ''}
      ${f('link', 'Counts from', html`<select class="in sm" id="arc-hl-${h.id}" data-change="arc-hf" data-f="link" data-id="${h.id}">${linkOpts(h)}</select>`)}
      <button type="button" class="btn sm ghost ${a ? 'danger' : ''}" data-act="arc-habit-del" data-id="${h.id}">${a ? 'Tap again to remove' : 'Remove'}</button></div>`; };
  return html`<section class="card"><details class="grp" data-key="arcset" ${raw(isOpen('arcset') ? 'open' : '')}><summary><span class="row" style="gap:8px">${icon('settings')}<b>Winter Arc settings</b></span></summary><div class="grp-body">
    <div class="fields"><label class="field"><span>First day</span><input class="in" type="date" id="arc-s-start" value="${c.start}" data-change="arc-set" data-f="start"></label><label class="field"><span>Length in days</span><input class="in" type="number" id="arc-s-days" min="14" max="366" value="${c.days}" data-change="arc-set" data-f="days"></label>
      <label class="field"><span>A clean day needs</span><select class="in" id="arc-s-thr" data-change="arc-set" data-f="threshold">${[50, 60, 70, 80, 90, 100].map((t) => html`<option value="${t}" ${raw(t === c.threshold ? 'selected' : '')}>${t}% of habits</option>`)}</select></label></div>
    <h3 class="sub-h">Habits</h3><p class="hint" style="margin:0 0 10px">“Counts from” links a habit to your 10 PM log, so you log it once and it counts in both places.</p>${c.habits.map(row)}
    <div class="row wrap" style="margin-top:12px">${c.habits.length < 12 ? html`<button type="button" class="btn sm" data-act="arc-habit-add">${icon('plus')}Add a habit</button>` : ''}<span class="grow"></span><button type="button" class="btn sm danger" data-act="arc-reset">${icon('trash')}Reset the Winter Arc</button></div></div></details></section>`;
}

// ---------- 3. the game hub ----------
function levelCard(M) {
  const ranks = M.ranks, idx = ranks.findIndex((r) => r === M.rank);
  return html`<section class="card hero span-5" aria-label="Level and rank"><span class="lbl">${icon('award')} Level and rank</span>
    <div class="row" style="gap:16px;margin:12px 0"><span class="lv-badge"><small>Level</small><b>${M.level}</b></span><span><b style="font-size:22px;font-weight:500">${rankEmoji(M.rank)} ${rankName(M.rank)}</b><br><span class="small" style="color:var(--on-hero-2)">${fmtN(M.xp)} XP · ${fmtN(M.xp - M.lvStart)} / ${fmtN(M.lvNext - M.lvStart)} to level ${M.level + 1}</span></span></div>
    ${meter(M.lvProg, { label: 'XP to the next level' })}
    <ol class="ladder">${ranks.map((r, i) => html`<li class="${i < idx ? 'past' : i === idx ? 'cur' : ''}"><span class="num">L${r.level}</span><span>${rankName(r)}</span>${i === idx ? chip('You', '') : ''}</li>`)}</ol>
    <p class="small" style="color:var(--on-hero-2);margin-top:10px">Level L needs ${M.st.levelK} × (L − 1)² XP. Comeback power ${Math.round(M.power * 100)}% · ${M.powerLabel}.</p></section>`;
}
function xpCard(M) {
  const src = [['Study days (hours, pages, quests, streak)', sum(M.days, (d) => d.xp)], ['Chapters and revision', sum(M.chapters, (c) => c.xp)], ['Full papers', sum(M.mocks, (m) => m.xp)], ['Runs', sum(M.runs, (r) => r.xp)]];
  const mx = Math.max(1, ...src.map((s) => s[1])), x = M.st.xp;
  const rules = [['Per study hour', x.hour], ['Day done / partial', x.dayDone + ' / ' + x.dayPartial], ['Per page read', x.page], ['Workout done', x.workout], ['Steps target hit', x.steps], ['Push-up target hit', x.pushups], ['Meals on track', x.meals], ['Streak bonus per day (max 10)', x.streakPerDay], ['Chapter done (HIGH bonus)', x.chapterDone + ' (+' + x.highBonus + ')'], ['Each revision tick', x.revision], ['Questions = yes', x.questions], ['Full paper taken (+1 per mark)', x.bossTaken], ['Paper target met', x.bossDefeated], ['Run logged / time trial beaten', x.run + ' / ' + x.ttBeat]];
  return card({
    cls: 'span-7', title: 'Where your XP comes from', icon: 'sparkles', sub: fmtN(M.xp) + ' XP in total · rules from your plan (edit them in Settings)',
    body: html`<ul class="hbars">${src.map((s, i) => html`<li><span>${s[0]}</span><div class="hbar"><i class="${i === src.findIndex((q) => q[1] === mx) ? 'on' : ''}" style="width:${(s[1] / mx * 100).toFixed(1)}%"></i></div><b class="num">${fmtN(s[1])}</b></li>`)}</ul>
      <details class="grp" data-key="xprules" ${raw(isOpen('xprules') ? 'open' : '')} style="margin-top:8px"><summary><b>XP rules</b><span class="muted small">from your original tracker</span></summary><div class="grp-body"><table class="tbl"><tbody>${rules.map((r) => html`<tr><td>${r[0]}</td><td class="n"><b style="font-weight:500">+${r[1]}</b></td></tr>`)}</tbody></table></div></details>`
  });
}
function badgesCard(M) {
  return card({ title: 'Badges', icon: 'trophy', actions: chip(M.badgeCount + ' / ' + M.badges.length + ' unlocked'), body: html`<ul class="badges">${M.badges.map((b) => html`<li class="${b.on ? 'on' : ''}"><span class="badge-ic" aria-hidden="true">${b.on ? b.icon : icon('lock')}</span><span class="li-main"><b>${b.name}</b><small>${b.desc}</small></span>${b.on ? status('Unlocked', 'good') : ''}</li>`)}</ul>` });
}
function bossCard(M) {
  const won = M.mocks.filter((m) => m.result === 'defeated'), next = M.boss.next;
  return card({
    cls: 'span-6', title: 'Boss defeats', icon: 'skull', sub: 'Full papers that met their checkpoint target', actions: chip(won.length + ' / ' + M.mocks.length),
    body: won.length ? html`<ul class="list">${won.map((m) => html`<li><span class="li-main"><b>${m.bossName}</b><small>Mock #${m.id} · ${m.paper} ${m.subject} · ${fmtD(m.date)}</small></span>${status(Math.round(m.score * 100) + ' / target ' + Math.round(m.target * 100), 'good')}</li>`)}</ul>` : empty(next ? 'No boss defeated yet. Next up: ' + next.bossName + ' on ' + fmtD(next.date) + '.' : 'No full paper met its target.', html`<a class="btn sm" href="#/mocks">Mock Tests</a>`, 'skull')
  });
}
function quoteCard(M) {
  return html`<section class="card soft span-6 quote-card"><span class="lbl">${icon('sparkles')} Quote of the day</span><p class="big-quote">“${M.quote}”</p><p class="small muted">${M.act}</p></section>`;
}

const saveNote = debounce((k, text) => arc.setNote(k, text), 500);
const saveGoalP = debounce((id, v) => { const c = arc.config(), g = c.goals.find((x) => x.id === id); if (g && g.p !== v) { g.p = v; arc.saveConfig(c); } }, 400);
const habitOf = (id) => arc.config().habits.find((h) => h.id === id);

export default {
  enter(q) { if (isDate(q.date)) sel = q.date; },
  head(M) {
    const Z = M.arc;
    return { title: 'Winter Arc', sub: raw(esc((Z.active ? 'Day ' + Z.dayNum + ' of ' + Z.days + ' · ' + plural(Z.left, 'day') + ' left' : Z.todayIdx < 0 ? 'Starts ' + fmtDY(Z.start) : 'Arc complete') + ' · ' + fmtDS(Z.start) + ' – ' + fmtDY(Z.end) + ' · level ' + M.level + ' ' + rankName(M.rank))) };
  },
  render(M) {
    const Z = M.arc;
    const hero = html`<section class="card hero arc-hero"><div class="between wrap"><span class="lbl">${icon('snow')} The 92-day challenge · ${fmtDS(Z.start)} – ${fmtDY(Z.end)}</span>${Z.today ? chip(Z.today.done + ' / ' + Z.n + ' today' + (Z.today.clean ? ' · clean' : '')) : ''}</div>
      <div class="arc-row"><p class="arc-dn"><b>${Z.todayIdx < 0 ? '00' : String(Math.min(Z.dayNum, Z.days)).padStart(2, '0')}</b><small>/ ${Z.days}</small></p><div class="grow"><div class="between small" style="margin-bottom:8px"><span>${Z.active ? (Z.left === 0 ? 'Final day' : plural(Z.left, 'day') + ' left') : Z.todayIdx < 0 ? 'Starts in ' + plural(-Z.todayIdx, 'day') : 'Arc complete'}</span><span style="color:var(--on-hero-2)">${Z.elapsed} of ${Z.days} days gone${Z.sol ? ' · shortest day ' + fmtDS(Z.sol.k) : ''}</span></div>${track(Z)}</div></div></section>`;
    return html`${momentum(M)}
      <h2 class="section-h">The challenge</h2>${hero}
      <div class="grid">${daySheet(Z)}<div class="span-5 stack-col">${statsCard(Z)}${ratesCard(Z)}</div></div>
      <div class="grid">${calCard(Z)}${goalsCard(Z)}</div>${settingsCard(Z)}
      <h2 class="section-h">Levels, XP and badges</h2>
      <div class="grid">${levelCard(M)}${xpCard(M)}</div>${badgesCard(M)}<div class="grid">${bossCard(M)}${quoteCard(M)}</div>`;
  },
  inputs: {
    'arc-note': (el) => { if (el.dataset.k <= todayStr()) saveNote(el.dataset.k, el.value.slice(0, 400)); },
    'arc-goal-p': (el) => { const v = clamp(Math.round(+el.value || 0), 0, 100), o = document.getElementById('arc-go-' + el.dataset.id); if (o) o.textContent = v + '%'; saveGoalP(el.dataset.id, v); }
  },
  changes: {
    'arc-goal-text': (el) => { const c = arc.config(), g = c.goals.find((x) => x.id === el.dataset.id); if (g) { g.text = el.value.trim().slice(0, 80) || 'Goal'; arc.saveConfig(c); } },
    'arc-set': (el) => { const c = arc.config(), f = el.dataset.f; if (f === 'start') { if (!isDate(el.value)) return; c.start = el.value; } else if (f === 'days') c.days = clamp(Math.round(+el.value || 92), 14, 366); else c.threshold = clamp(Math.round(+el.value || 80), 50, 100); arc.saveConfig(c); },
    'arc-hf': (el) => {
      const c = arc.config(), h = c.habits.find((x) => x.id === el.dataset.id), f = el.dataset.f; if (!h) return;
      if (f === 'name') h.name = el.value.trim().slice(0, 60) || 'Habit'; else if (f === 'unit') h.unit = el.value.trim().slice(0, 12); else if (f === 'target') h.target = Math.max(0.5, arc.num(el.value, 1)); else if (f === 'step') h.step = Math.max(0.1, arc.num(el.value, 1)); else if (f === 'link') h.link = el.value;
      else if (f === 'kind') { h.kind = el.value === 'count' ? 'count' : 'check'; h.link = ''; if (h.kind === 'count') { h.target = h.target > 1 ? h.target : 1; h.step = h.step > 0 ? h.step : 1; } else h.target = 1; }
      arc.saveConfig(c);
    }
  },
  actions: {
    'arc-toggle': (el) => { const h = habitOf(el.dataset.id), k = el.dataset.k; if (!h || k > todayStr()) return; arc.setVal(k, h, arc.val(k, h) >= 1 ? 0 : 1); },
    'arc-step': (el) => { const h = habitOf(el.dataset.id), k = el.dataset.k; if (!h || k > todayStr()) return; arc.setVal(k, h, clamp(arc.r2(arc.val(k, h) + (+el.dataset.dir) * h.step), 0, 99999)); },
    'arc-day': (el) => { sel = addDays(sel, +el.dataset.dir); renderSoon(); },
    'arc-today': () => { sel = todayStr(); renderSoon(); },
    'arc-pick': (el) => { if (el.dataset.k > todayStr()) return; sel = el.dataset.k; renderSoon(); },
    'arc-habit-add': () => { const c = arc.config(); if (c.habits.length >= 12) return; const id = 'h' + Date.now().toString(36); c.habits.push({ id, name: 'New habit', kind: 'check', target: 1, step: 1, unit: '', link: '' }); arc.saveConfig(c); setTimeout(() => { const n = document.getElementById('arc-hn-' + id); if (n) { n.focus(); n.select(); } }, 120); },
    'arc-habit-del': (el) => { const id = el.dataset.id; if (armed !== 'h:' + id) { arm('h:' + id); return; } armed = null; const c = arc.config(); c.habits = c.habits.filter((h) => h.id !== id); arc.saveConfig(c); toast('Habit removed'); },
    'arc-goal-add': () => { const c = arc.config(); if (c.goals.length >= 8) return; const id = 'g' + Date.now().toString(36); c.goals.push({ id, text: 'New goal', p: 0 }); arc.saveConfig(c); setTimeout(() => { const n = document.getElementById('arc-gt-' + id); if (n) { n.focus(); n.select(); } }, 120); },
    'arc-goal-del': (el) => { const id = el.dataset.id; if (armed !== 'g:' + id) { arm('g:' + id); return; } armed = null; const c = arc.config(); c.goals = c.goals.filter((g) => g.id !== id); arc.saveConfig(c); },
    'arc-reset': async () => {
      if (!(await confirm({ title: 'Reset the Winter Arc?', body: 'Clears every arc day, note, goal and habit change. Your 10 PM log isn’t touched. A restore point is saved first.', ok: 'Reset the arc', danger: true }))) return;
      await store.saveSnapshot('pre-arc-reset-' + Date.now(), 'Before resetting the Winter Arc');
      store.batch(() => { store.list('arc').forEach((r) => store.remove('arc', r.id)); arc.saveConfig(arc.DEFAULTS); });
      sel = null; toast('Winter Arc reset · restore point saved');
    }
  }
};
