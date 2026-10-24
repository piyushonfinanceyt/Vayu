/* 5K Run: 5 km in 30:00 on Sat 28 Nov (backup Mon 30 Nov). The 5K plan (Mon easy · Thu pace · Sat long run or time
   trial) with a log per run, checkpoints, the predicted 5K, distance and pace trends against the goal, and coach's notes.
   Runs are logged in the same 'runs' records as the Health run plan; logging one also ticks that day's workout. */
import { html, raw, esc, fmt1, fmtD, fmtDS, fmtDL, plural, diff, addDays, mondayOf, mmss, pct, DOW, parse, isDate, sortBy } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, status, tile, meter, empty, toast } from '../components.js';
import { spot } from '../charts.js';
import { bind } from './parts.js';
import { isOpen } from '../prefs.js';
import * as store from '../store.js';

const SESS = { 'Time Trial': 'Time trial', Intervals: 'Intervals', Pace: 'Pace', Tempo: 'Tempo', Easy: 'Easy', 'Long Easy': 'Long easy', Extra: 'Extra run' };
const isEasy = (r) => r.session === 'Easy' || r.session === 'Long Easy';

function runRow(M, r) {
  const R = M.run5k, t = M.t, goalPace = R.R.sec / R.R.km;
  const ni = (f, label, step, max) => html`<label class="field"><span>${label}</span><input class="in sm" id="${'r5' + f + '-' + r.date}" type="number" inputmode="decimal" min="0" ${raw(max ? 'max="' + max + '"' : '')} step="${step}" ${bind('runs', r.date, f, 'num')} value="${r[f] == null ? '' : r[f]}"></label>`;
  const chips = [];
  if (r.total != null) {
    if (r.walked === 'Yes') chips.push(chip('Walk breaks · not counted for the goal', 'line'));
    else chips.push(r.pace <= goalPace ? status('Goal pace', 'good') : status(Math.round(r.pace - goalPace) + ' s/km off goal pace', 'warn'));
    if (isEasy(r) && r.pace < 390) chips.push(status('Too fast for an easy run · aim 6:45–7:15 /km', 'warn'));
  } else if (r.date < t && r.session !== 'Extra') chips.push(status('Not logged', 'bad'));
  if (r.doneOn && r.doneOn !== r.date) chips.push(chip('Done on ' + fmtD(r.doneOn), 'info'));
  return html`<div class="run ${r.date === t ? 'now' : ''}" id="run-${r.date}"><div class="between wrap"><span class="row" style="gap:10px"><b style="font-weight:500">${fmtD(r.date)}</b>${chip(SESS[r.session] || r.session, r.session === 'Time Trial' ? 'ink' : 'line')}</span>
    <button type="button" class="tog" ${bind('runs', r.date, 'walked', 'sel')} data-v="Yes" aria-pressed="${String(r.walked === 'Yes')}">Walk breaks</button></div>
    <p class="small muted">${r.workout}</p>
    <div class="run-in five">${ni('km', 'Distance km', '0.01')}${ni('min', 'Minutes', '1')}${ni('sec', 'Seconds', '1', 59)}${ni('effort', 'Effort 1–10', '1', 10)}${r.session === 'Extra' ? '' : html`<label class="field"><span>Done on (if moved)</span><input class="in sm" id="r5d-${r.date}" type="date" min="${addDays(r.date, -3)}" max="${addDays(r.date, 3)}" ${bind('runs', r.date, 'doneOn', 'sel')} value="${r.doneOn || ''}"></label>`}</div>
    <div class="row wrap small">${r.total != null ? html`<span>${icon('timer')} ${mmss(r.total)}</span><span>${mmss(r.pace)} /km</span>${r.walked === 'Yes' ? '' : html`<span>${pct(R.credit(r))} of the goal</span>`}` : ''}${chips}</div>
    <input class="in sm" id="r5n-${r.date}" type="text" ${bind('runs', r.date, 'notes', 'text')} value="${r.notes || ''}" placeholder="How it felt" aria-label="Run notes for ${fmtD(r.date)}"></div>`;
}

export default {
  head(M) { const R = M.run5k, d = diff(M.t, R.R.race); return { title: '5K Run', sub: raw(esc('5 km in 30:00 · ' + (d > 0 ? 'race on ' + fmtDL(R.R.race) + ', 8 AM · ' + plural(d, 'day') + ' to go' : d === 0 ? 'race day, 8 AM' : R.achieved ? 'goal reached' : 'backup race ' + fmtDL(R.R.last)))), actions: raw('<a class="btn" href="#run-add" data-act="r5-jump">' + icon('plus') + 'Log a run</a>') }; },
  render(M) {
    const R = M.run5k, G = R.R, t = M.t, goalPace = G.sec / G.km, nx = R.next, L = R.longest, daysTo = diff(t, G.race);
    const tiles = html`<div class="tiles six">
      ${tile({ cls: 'hero', label: 'Race day', icon: 'flag', value: daysTo > 0 ? plural(daysTo, 'day') : daysTo === 0 ? 'Today' : 'Done', foot: fmtD(G.race) + ' · backup ' + fmtD(G.last) })}
      ${tile({ label: 'Goal', icon: 'trophy', value: '30:00', foot: '5 km · every km in ' + mmss(goalPace) })}
      ${tile({ label: 'Goal progress', icon: 'activity', value: pct(R.progress), foot: R.achieved ? 'goal reached' : 'best run vs 5 km at 6:00 /km' })}
      ${tile({ label: 'Longest run', icon: 'steps', value: L ? fmt1(L.km) + ' km' : '—', foot: L ? fmtD(L.date) + ' · ' + mmss(L.pace) + ' /km' : 'log your first run' })}
      ${tile({ label: 'Predicted 5K', icon: 'timer', value: R.pred == null ? '—' : mmss(R.pred), foot: R.pred == null ? 'needs a non-stop run of 2 km+' : 'if you hold your best pace for 5 km' })}
      ${tile({ label: 'Plan runs logged', icon: 'calcheck', value: R.logged + ' / ' + R.plan.length, foot: fmt1(R.kmPlan) + ' km since ' + fmtDS(G.start) })}</div>`;
    const nextCard = html`<section class="card hero span-5" aria-label="${nx && nx.date === t ? 'Today’s run' : 'Next run'}"><span class="lbl">${icon('activity')} ${nx && nx.date === t ? 'Today’s run' : 'Next run'}</span>
      ${nx ? html`<p class="nu-title">${fmtDL(nx.date)} · ${SESS[nx.session] || nx.session}</p><p class="nu-sub">${nx.workout}</p><p class="small" style="color:var(--on-hero-2)">In your 5:15–6:00 PM workout slot, or 8 AM on test days. Log it below straight after.</p>` : html`<p class="nu-title">The 5K plan is complete.</p>`}
      <div style="margin-top:auto;padding-top:14px"><div class="between small"><span>Progress to 5 km in 30:00</span><b>${pct(R.progress)}</b></div>${meter(R.progress, { label: 'Progress to the goal' })}</div></section>`;
    const CHECKS = [{ date: G.start, label: 'Endurance check', goal: '25 min or 4 km non-stop' }, { date: '2026-11-07', label: '3 km time trial', km: 3, sec: 1080 }, { date: '2026-11-21', label: '4 km time trial', km: 4, sec: 1440 }, { date: G.race, label: '5 km race', km: 5, sec: 1800 }];
    const runOn = (d) => R.plan.find((r) => r.date === d) || null;
    const checkRow = (c) => {
      let r = runOn(c.date), res = '', verdict;
      if (c.date === G.race && (!r || r.total == null) && runOn(G.last) && runOn(G.last).total != null) r = runOn(G.last);
      if (!r || r.total == null) verdict = c.date < t ? status('Not logged', 'bad') : chip(c.date === t ? 'Today' : 'In ' + plural(diff(t, c.date), 'day'), 'line');
      else if (!c.km) { res = fmt1(r.km) + ' km in ' + mmss(r.total) + (r.walked === 'Yes' ? ' with walk breaks' : ' non-stop'); verdict = r.walked === 'Yes' || r.km < 3 ? status('Weeks 2–3: run/walk 4 + 1 min', 'warn') : r.km <= 4 ? status('Plan as written', 'good') : status('Plan + strides', 'good'); }
      else { const same = Math.abs(r.km - c.km) < 0.05, eq = same ? r.total : r.total * Math.pow(c.km / r.km, 1.06), gap = Math.round(eq - c.sec); res = fmt1(r.km) + ' km in ' + mmss(r.total) + (same ? '' : ' (≈ ' + mmss(eq) + ' for ' + c.km + ' km)'); verdict = r.walked === 'Yes' ? status('Run it non-stop next time', 'warn') : gap <= 0 ? status(c.km === 5 ? 'Goal reached' : 'On track', 'good') : gap <= 30 ? status(gap + ' s slow', 'warn') : status(gap + ' s slow', 'bad'); }
      return html`<li class="${c.date === t ? 'today' : r && r.total != null ? 'done' : ''}"><span class="tl-date">${fmtDS(c.date)}</span><span class="tl-body"><span class="between wrap"><b>${c.label}</b>${verdict}</span><small>${c.km ? 'target ' + mmss(c.sec) : c.goal}${res ? ' · ' + res : ''}</small></span></li>`;
    };
    const checks = card({ cls: 'span-7', title: 'Checkpoints', icon: 'flag', sub: 'Each test is judged against its target (Riegel-adjusted if the distance differs)', body: html`<ol class="timeline">${CHECKS.map(checkRow)}</ol>` });
    const from = M.runs[0].date, to = G.last, logged = M.runs.filter((r) => r.total != null && r.km > 0 && r.date <= to);
    const nonstop = logged.filter((r) => r.walked !== 'Yes');
    const predCard = card({ cls: 'span-4', title: 'Predicted 5K time', icon: 'timer', sub: 'From each non-stop run of 2 km or more · lower is better', body: spot('r5-pred', 'line', { height: 210, x: { type: 'date', from, to }, y: { auto: true }, fmtY: (v) => mmss(v * 60), refs: [{ y: 30, label: 'goal 30:00', color: 'var(--good-mark)' }], series: [{ id: 'pred', name: 'Predicted 5K', color: 'var(--ink)', points: nonstop.filter((r) => r.km >= 2).map((r) => ({ x: r.date, y: R.pred5Of(r) / 60, note: fmt1(r.km) + ' km at ' + mmss(r.pace) + ' /km' })) }], empty: { text: 'Log a non-stop run of 2 km or more.' }, ariaLabel: 'Predicted 5 km time from each run against the 30:00 goal' }) });
    const distCard = card({ cls: 'span-4', title: 'Distance per run', icon: 'steps', sub: 'Grey points had walk breaks', body: spot('r5-dist', 'line', { height: 210, x: { type: 'date', from, to }, y: { min: 0, max: 6, ticks: [0, 1, 2, 3, 4, 5, 6] }, fmtY: (v) => fmt1(v) + ' km', refs: [{ y: 5, label: 'goal 5 km', color: 'var(--good-mark)' }], series: [{ id: 'walk', name: 'With walk breaks', color: 'var(--ink-4)', dots: true, points: logged.filter((r) => r.walked === 'Yes').map((r) => ({ x: r.date, y: +r.km, note: mmss(r.total) })) }, { id: 'km', name: 'Non-stop', color: 'var(--ink)', points: nonstop.map((r) => ({ x: r.date, y: +r.km, note: mmss(r.total) + ' · ' + mmss(r.pace) + ' /km' })) }], empty: { text: 'Log your first run.' }, ariaLabel: 'Distance of each run against the 5 km goal' }) });
    const paceCard = card({ cls: 'span-4', title: 'Pace trend', icon: 'activity', sub: 'Minutes per km · lower is faster', body: spot('r5-pace', 'line', { height: 210, x: { type: 'date', from, to }, y: { auto: true }, fmtY: (v) => mmss(v * 60), refs: [{ y: 6, label: 'goal 6:00 /km', color: 'var(--good-mark)' }, { y: 6.75, label: 'easy 6:45', color: 'var(--ink-4)' }], series: [{ id: 'pace', name: 'Pace', color: 'var(--ink)', points: logged.map((r) => ({ x: r.date, y: r.pace / 60, note: fmt1(r.km) + ' km' + (r.walked === 'Yes' ? ' · walk breaks' : '') })) }], empty: { text: 'Log a run to see your pace.' }, ariaLabel: 'Pace of each run against the 6:00 per km goal pace' }) });
    const all = R.plan.concat(R.extras).sort((a, b) => (a.date < b.date ? -1 : 1));
    const weeks = Array.from(new Set(all.map((r) => mondayOf(r.date)))), curW = nx ? mondayOf(nx.date) : weeks[weeks.length - 1];
    const addForm = html`<div class="r5-add" id="run-add"><label class="field"><span>Date</span><input id="r5x-date" class="in sm" type="date" value="${t}" max="${t}"></label><label class="field"><span>Distance km</span><input id="r5x-km" class="in sm" type="number" inputmode="decimal" min="0" step="0.01"></label><label class="field"><span>Minutes</span><input id="r5x-min" class="in sm" type="number" inputmode="numeric" min="0" step="1"></label><label class="field"><span>Seconds</span><input id="r5x-sec" class="in sm" type="number" inputmode="numeric" min="0" max="59" step="1"></label><label class="field"><span>Walk breaks?</span><select id="r5x-walk" class="in sm"><option value="">No</option><option value="Yes">Yes</option></select></label><button type="button" class="btn primary" data-act="r5-add">${icon('plus')}Log run</button></div>
      <p class="hint">For a run on a day the plan doesn’t list. For a planned run done on another day, set “Done on” in that run instead.</p>`;
    const plan = card({ title: '5K plan · log your runs', icon: 'calendar', sub: 'Mon easy · Thu pace · Sat long run or time trial', body: html`${addForm}${weeks.map((w, i) => { const rs = all.filter((r) => mondayOf(r.date) === w), planned = rs.filter((r) => r.session !== 'Extra'), key = 'r5w' + i; return html`<details class="grp" data-key="${key}" ${raw(isOpen(key, w === curW) ? 'open' : '')}><summary><b>Week ${i + 1}</b><span class="muted small">${fmtDS(w)} · ${rs.map((r) => DOW[parse(r.date).getDay()] + ' ' + (SESS[r.session] || r.session)).join(' · ')}</span><span class="grow"></span><span class="chip">${planned.filter((r) => r.km != null).length} / ${planned.length} logged</span></summary><div class="grp-body runs">${rs.map((r) => runRow(M, r))}</div></details>`; })}` });
    const coach = [
      L ? 'Where you are: your longest run is ' + fmt1(L.km) + ' km at ' + mmss(L.pace) + ' /km. ' + (L.pace <= goalPace ? 'That is already goal pace, so the gap is distance, not speed.' : 'Speed and distance both need to grow, distance first.') : 'Start with Saturday’s endurance check and log it honestly, walk breaks included.',
      'After the endurance check: under 3 km non-stop → run/walk (4 min + 1 min) in weeks 2–3; 3–4 km → the plan as written; over 4 km → add strides.',
      'Easy runs at 6:45–7:15 /km. The log warns you when an easy run is faster than 6:30 /km. You should be able to talk.',
      'Pace sessions teach 6:00 /km. Check your watch every 500 m until the pace feels automatic.',
      'Tests and the race are at 8:00 AM on 7 Nov, 21 Nov and 28 Nov (Block A starts 9:15), each after a rest day. Sat 14 Nov is your first full 5 km, run slowly.',
      'Race plan: 10 min easy + 3 strides. First km in 5:55–6:00, not faster. Hold 6:00 for km 2–4, then empty the tank.',
      'Long run grows by about 1 km a week. Missed a run? Skip it, don’t double up. Sharp pain = stop and rest. Sleep at 10 PM counts as training.'
    ];
    const coachCard = card({ title: 'Coach’s notes', icon: 'info', body: html`<ul class="guide">${coach.map((g) => html`<li>${g}</li>`)}</ul>` });
    return html`${tiles}<div class="grid">${nextCard}${checks}</div><div class="grid">${predCard}${distCard}${paceCard}</div>${plan}${coachCard}`;
  },
  actions: {
    'r5-jump': (el, e) => { const a = document.getElementById('run-add'); if (a) { a.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => { const k = document.getElementById('r5x-km'); if (k) k.focus(); }, 300); } },
    'r5-add': () => {
      const v = (id) => ((document.getElementById(id) || {}).value || '').trim();
      const date = v('r5x-date'), km = v('r5x-km'), min = v('r5x-min'), sec = v('r5x-sec');
      if (!isDate(date) || km === '' || min === '') { toast('Enter the date, distance and minutes.', { tone: 'warn' }); return; }
      store.setRecFields('runs', date, { km: +km, min: +min, sec: sec === '' ? null : +sec, walked: v('r5x-walk') || null });
      toast('Run logged for ' + fmtD(date) + ' · workout ticked');
    }
  }
};
export { sortBy };
