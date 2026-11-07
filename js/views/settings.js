/* Settings: theme (light / dark / system), profile, exam mode, plan dates, phase hours, habit targets, run goal,
   pass / target lines and each paper's checkpoint targets, XP rules and the level curve, timer lengths, life areas,
   the voice (on / off, which voice, speed, greeting / briefing / praise; this device only),
   and "reset all data" behind a confirm step (a restore point is saved first).
   Every field writes a settings override; clear a box to go back to your plan's value. */
import { html, raw, esc, fmtDS, fmtDY, plural, clamp, isDate, fmtClock, timeToMin } from '../util.js';
import * as pwa from '../pwa.js';
import * as sync from '../sync.js';
import { go } from '../router.js';
import { icon } from '../icons.js';
import { card, chip, status, seg, toast, confirm, form } from '../components.js';
import { themePref, setTheme, PALETTES, palettePref, setPalette, setPref, isOpen } from '../prefs.js';
import { renderSoon } from '../router.js';
import { ROUTES, routeById, navTabs, navBar, buildShell } from '../shell.js';
import * as store from '../store.js';
import * as db from '../db.js';
import { model as modelOf, AREA_SOURCES } from '../model.js';
import * as voice from '../voice.js';

let navOnEnter = false, voiceOnEnter = false;
function field(label, path, type, val, attrs) {
  const shown = val == null ? '' : type === 'pct' ? Math.round(val * 1000) / 10 : val;
  return html`<label class="field"><span>${label}</span><input id="${'s-' + path.replace(/\./g, '-')}" class="in" type="${type === 'date' ? 'date' : type === 'text' ? 'text' : type === 'time' ? 'time' : 'number'}" ${raw(type === 'num' || type === 'pct' ? 'inputmode="decimal" step="any"' : '')} data-change="set" data-path="${path}" data-t="${type}" value="${shown}" ${raw(attrs || '')}></label>`;
}
function openArea(id) {
  const M = modelOf(), a = id ? store.get('lifeAreas', id) : null, used = store.list('lifeAreas').filter((x) => x.id !== id).map((x) => +x.slot);
  const free = [1, 2, 3, 4, 5, 6, 7].filter((s) => !used.includes(s));
  if (!a && !free.length) { toast('All 7 colour slots are in use. Rename or delete an area first.', { tone: 'warn' }); return; }
  form({
    title: a ? 'Edit life area' : 'New life area',
    fields: [{ name: 'name', label: 'Name', required: true }, { name: 'source', label: 'Values come from', type: 'select', options: Object.keys(AREA_SOURCES).map((k) => [k, AREA_SOURCES[k]]) }, { name: 'startDate', label: 'Start date (blank = first check-in)', type: 'date', half: true }, { name: 'startValue', label: 'Start value %', type: 'number', min: 0, max: 100, step: 0.1, half: true }, { name: 'target', label: 'Target %', type: 'number', min: 1, max: 100, step: 1, half: true, required: true }, { name: 'deadline', label: 'Deadline', type: 'date', half: true, required: true }, { name: 'slot', label: 'Colour slot', type: 'select', options: [1, 2, 3, 4, 5, 6, 7].filter((s) => !used.includes(s) || (a && +a.slot === s)).map((s) => [s, 'Colour ' + s]), half: true }, { name: 'hidden', label: 'Hide from the charts', type: 'checkbox' }],
    values: a || { source: 'manual', target: 100, deadline: M.st.yearEnd, slot: free[0] },
    submitLabel: a ? 'Save' : 'Add area',
    onSubmit: (v) => { const rec = Object.assign({}, a || {}, v, { slot: +v.slot, startDate: v.startDate || null, startValue: v.startValue == null ? null : clamp(v.startValue, 0, 100), target: clamp(v.target || 100, 1, 100) }); if (a) store.put('lifeAreas', rec); else store.add('lifeAreas', rec, 'la'); toast(a ? 'Life area saved' : 'Life area added'); },
    onDelete: a ? () => { store.batch(() => { store.list('progress').filter((p) => p.areaId === a.id).forEach((p) => store.remove('progress', p.id)); store.remove('lifeAreas', a.id); }); toast('Life area deleted'); } : null,
    deleteBody: 'The area and its check-ins will be removed.'
  });
}

function reminderCard() {
  const R = pwa.reminder(), p = pwa.permission();
  const perm = p === 'granted' ? 'Notifications are allowed, so the reminder also reaches you when the app is in the background.'
    : p === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser’s site settings for system reminders; the in-app reminder still works.'
      : p === 'unsupported' ? 'This browser can’t show notifications, so the reminder appears inside the app. The calendar event works everywhere.'
        : 'Turning it on asks your browser for permission to notify you.';
  return card({
    title: '10 PM log reminder', icon: 'bell', sub: 'Once a day, only when today’s plan day isn’t logged yet',
    actions: R.on ? chip('On · ' + fmtClock(timeToMin(R.time)), 'ink') : chip('Off'),
    body: html`<div class="remind-row"><button type="button" class="tog" data-act="remind-toggle" aria-pressed="${String(R.on)}">${R.on ? 'Reminder on' : 'Turn the reminder on'}</button>
        <label class="field"><span>Remind me at</span><input id="remind-time" class="in" type="time" value="${R.time}" data-change="remind-time"></label></div>
      <p class="small" style="margin-top:10px">${perm}</p>
      <div class="row wrap" style="margin-top:12px"><button type="button" class="btn sm" data-act="remind-test">${icon('bell')}Send a test reminder</button><button type="button" class="btn sm" data-act="remind-ics">${icon('calendar')}Add to my phone calendar</button></div>
      <p class="hint">A web app can only notify you while it’s open or running in the background: install it (Tools → Install) and leave it open, and the reminder arrives at ${fmtClock(timeToMin(R.time))}. For a reminder that fires even when the app is closed, add the daily calendar event: open the downloaded file on your phone and save it to your calendar. It repeats every day until 12 Jan.</p>`
  });
}

// the voice (voice.js): on / off, which voice, its speed, what it does, and a test
function voiceCard() {
  if (!voice.supported()) return card({ id: 'voice-card', title: 'Voice', icon: 'volume', actions: chip('Not available'), body: html`<p class="small">This browser can’t speak. Chrome, Edge and Safari can.</p>` });
  const on = voice.on(), all = voice.allVoices(), cur = voice.currentVoice();
  const here = all.filter(voice.isLocal), net = all.filter((v) => !voice.isLocal(v));
  const tog = (act, label, v) => html`<button type="button" class="tog" data-act="${act}" aria-pressed="${String(v)}">${label}</button>`;
  // each voice: Listen plays a sample in it and changes nothing; Use makes it hers
  const row = (v) => {
    const inUse = !!cur && v.name === cur.name, g = voice.female(v), nm = voice.shortName(v);
    return html`<li class="${inUse ? 'in-use' : ''}"><span class="li-main"><b>${nm}</b><small>${[g === true ? 'Female' : g === false ? 'Male' : '', voice.accent(v)].filter(Boolean).join(' · ')}</small></span>
      <span class="vrow-act"><button type="button" class="btn sm ghost" data-act="voice-listen" data-name="${v.name}" aria-label="Listen to ${nm}">${icon('play')}Listen</button>${inUse ? chip('In use', 'ink') : html`<button type="button" class="btn sm" data-act="voice-use" data-name="${v.name}" aria-label="Use ${nm} from now on">Use</button>`}</span></li>`;
  };
  return card({
    id: 'voice-card', title: 'Voice', icon: 'volume', sub: 'Greets you, briefs you on the day and cheers what you finish',
    actions: on ? chip('On', 'ink') : chip('Off'),
    body: html`<div class="row wrap">${tog('voice-on', on ? 'Voice on' : 'Turn the voice on', on)}</div>
      <h3 class="sub-h">Her voice</h3>
      <p class="small muted">Tap <b>Listen</b> to hear a voice first. Nothing changes until you tap <b>Use</b>.</p>
      <h4 class="vlist-h">On this device · ${here.length}</h4>
      ${here.length ? html`<ul class="list vlist">${here.map(row)}</ul>` : html`<p class="small">No voices are installed on this device, so she uses your browser’s own voice.</p>`}
      ${net.length ? html`<details class="grp vmore" data-key="voice-online" ${raw(isOpen('voice-online') || (cur && !voice.isLocal(cur)) ? 'open' : '')}><summary><b>Online voices · ${net.length}</b><span class="muted small">More natural · the browser sends what she says to its speech service</span></summary><div class="grp-body"><ul class="list vlist">${net.map(row)}</ul></div></details>`
        : html`<p class="small muted vlist-none">This browser has no online voices. Microsoft Edge has the most natural ones (Neerja, Aria, Jenny, Sonia…), and Chrome has Google’s.</p>`}
      <div class="field" style="margin-top:16px"><span>Speed</span>${seg('voice-rate', [['0.9', 'Slower'], ['1', 'Normal'], ['1.12', 'Faster']], String(voice.rate()), { label: 'Speed' })}</div>
      <div class="field" style="margin-top:14px"><span>What she does</span><div class="row wrap">${tog('voice-greet', 'Greets you', voice.opt('Greet'))}${tog('voice-brief', 'Daily briefing', voice.opt('Brief'))}${tog('voice-praise', 'Praise and reactions', voice.opt('Praise'))}</div></div>
      <div class="row wrap" style="margin-top:14px"><button type="button" class="btn sm" data-act="brief" aria-keyshortcuts="V">${icon('calcheck')}Brief me now<span class="kbd kbd-hint" aria-hidden="true">V</span></button></div>
      <p class="hint"><b>More voices.</b> On Windows: Settings → Time &amp; language → Speech → Add voices. English (United Kingdom) adds Hazel and Susan, English (Australia) Catherine, English (Canada) Linda. On Android: Settings → Text-to-speech → Speech Services by Google → Install voice data → English (India), which has several women’s voices. Reopen the app afterwards and they appear here.</p>
      <p class="hint">The briefing plays the first time you open the app each day, and the greeting at most every 3 hours after that. Browsers only let a page speak after you tap it, so she starts on your first tap. Voices on this device keep everything here. Saved on this device.</p>`
  });
}

// your shortcuts: the phone's four bottom-bar slots and the computer's top tabs (shell.js reads them)
function navCard(exam) {
  const tabs = navTabs().map(routeById), bar = navBar(), rest = ROUTES.filter((r) => !tabs.some((t) => t.id === r.id));
  const slot = (i) => html`<label class="field"><span>Shortcut ${i + 1}</span><select class="in" id="nav-bb-${i}" data-change="nav-bar" data-i="${i}">${ROUTES.map((r) => html`<option value="${r.id}" ${raw(r.id === bar[i] ? 'selected' : '')}>${r.title}</option>`)}</select></label>`;
  const row = (r, i) => html`<li>${icon(r.icon)}<span class="li-main"><b>${r.title}</b>${exam && r.examHide ? html`<small>In More while exam mode is on</small>` : ''}</span>
    <span class="nav-ctl"><button type="button" class="icon-btn sm" data-act="nav-move" data-dir="-1" data-id="${r.id}" aria-label="Move ${r.title} up" ${raw(i === 0 ? 'aria-disabled="true"' : '')}>${icon('arrowU')}</button><button type="button" class="icon-btn sm" data-act="nav-move" data-dir="1" data-id="${r.id}" aria-label="Move ${r.title} down" ${raw(i === tabs.length - 1 ? 'aria-disabled="true"' : '')}>${icon('arrowD')}</button><button type="button" class="icon-btn sm" data-act="nav-out" data-id="${r.id}" aria-label="Move ${r.title} into More" ${raw(tabs.length === 1 ? 'aria-disabled="true"' : '')}>${icon('x')}</button></span></li>`;
  return card({
    id: 'nav-card', title: 'Navigation', icon: 'grid', sub: 'Your shortcuts, the tab order and the dashboard · saved on this device',
    actions: html`<button type="button" class="btn sm ghost" data-act="nav-reset">Reset</button>`,
    body: html`<h3 class="sub-h" style="margin-top:0">Phone bottom bar</h3>
      <div class="fields nav-slots">${slot(0)}${slot(1)}${slot(2)}${slot(3)}</div>
      <p class="hint">The + sits between shortcuts 2 and 3 and opens the quick log. Press and hold it, or right-click it on a computer, for more quick actions. More always lists every tab.</p>
      <h3 class="sub-h">Top bar on a computer</h3>
      <p class="hint" style="margin-top:0">Left to right, in this order. When the window is narrow, the last ones move into More.</p>
      <ul class="list nav-list">${tabs.map(row)}</ul>
      ${rest.length ? html`<p class="lbl" style="margin-top:12px">In More · tap to add to the top bar</p><div class="nav-add">${rest.map((r) => html`<button type="button" class="chip line" data-act="nav-in" data-id="${r.id}">${icon('plus')}${r.title}</button>`)}</div>` : ''}
      <h3 class="sub-h">Dashboard</h3>
      <div class="row wrap"><button type="button" class="btn sm" data-act="dash-customise">${icon('grid')}Customise the dashboard</button><span class="hint" style="margin:0">Hide the cards you don’t use and change their order.</span></div>`
  });
}
const saveNav = (k, v, msg) => { setPref(k, v); buildShell(); renderSoon(); if (msg) toast(msg, { ms: 1400 }); };

function syncCard() {
  const on = sync.connected(), S = sync.state, offline = S.kind === 'offline', ask = !on || sync.needsYou();
  const inputs = html`<div class="fields sync-fields">
      <label class="field"><span>GitHub token</span><input id="sync-token" class="in" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${on ? 'Blank keeps the current token' : 'ghp_…'}"></label>
      <label class="field"><span>Sync passphrase</span><input id="sync-pass" class="in" type="password" autocomplete="new-password" placeholder="The same on every device"></label></div>
    <div class="row wrap" style="margin-top:12px"><button type="button" class="btn primary" data-act="sync-connect"${raw(S.busy ? ' disabled' : '')}>${icon('sync')}${on ? 'Reconnect' : 'Connect and sync'}</button></div>`;
  const steps = html`<ol class="sync-steps">
      <li><span><a href="${sync.TOKEN_URL}" target="_blank" rel="noopener">Create a GitHub token ${icon('external')}</a> with only the <b>gist</b> box ticked. Pick an expiry after your exam, such as 31 Jan 2027. Make one on each device, or reuse one.</span></li>
      <li><span>Paste it below and choose a sync passphrase. Use the <b>same passphrase on every device</b>.</span></li>
      <li><span>Connect. The first device uploads its data; each next one merges with it.</span></li></ol>`;
  const head = !on ? '' : html`<ul class="list" style="margin-bottom:12px"><li>${icon(S.busy ? 'sync' : offline ? 'cloudOff' : S.error ? 'alert' : 'checkCircle')}<span class="li-main"><b>${S.busy ? 'Syncing…' : offline ? 'Offline · syncs when you’re back' : S.error ? 'Sync needs attention' : 'Synced ' + sync.ago(S.lastAt)}</b><small>${S.error || 'GitHub account @' + sync.account() + ' · encrypted · changes sync within seconds'}</small></span></li></ul>`;
  return card({
    title: 'Sync between devices', icon: 'sync', sub: 'Through an encrypted file in your GitHub account, so you can log on the phone and the computer',
    actions: !on ? chip('Off') : S.busy ? chip('Syncing…') : S.error && !offline ? status('Needs attention', 'warn') : chip('On', 'ink'),
    body: html`${head}${!on ? steps : ''}${ask ? inputs : ''}
      ${on ? html`<div class="row wrap" style="margin-top:${ask ? '10px' : '0'}"><button type="button" class="btn" data-act="sync-now"${raw(S.busy ? ' disabled' : '')}>${icon('sync')}Sync now</button><button type="button" class="btn ghost" data-act="sync-off">Turn sync off on this device</button></div>` : ''}
      <p class="hint">Each device keeps its full copy and works offline. Sync keeps the newest edit of each entry, per field for your daily log, and deletions carry over. Your data is encrypted with the passphrase before it leaves this device. The token and a key made from the passphrase stay on this device and never go into backups.</p>`
  });
}

export default {
  head() { return { title: 'Settings', sub: raw(esc('Saved on this device as you change them · clear a box to go back to your plan’s value')) }; },
  render(M) {
    const st = M.st, x = st.xp, theme = themePref(), exam = !!st.examMode;
    const profile = card({ cls: 'span-6', title: 'Profile and appearance', icon: 'user', body: html`<div class="fields">${field('Your name', 'player', 'text', st.player)}${field('Subtitle', 'subtitle', 'text', st.subtitle)}</div>
      <div class="field" style="margin-top:14px"><span>Theme</span>${seg('theme', [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], theme, { ink: true, label: 'Theme' })}<p class="hint">System follows your device’s light or dark setting. Saved on this device.</p></div>
      <div class="field" style="margin-top:14px"><span>Colour theme</span><div class="pal-picks" role="group" aria-label="Colour theme">${PALETTES.map((p) => html`<button type="button" class="pal" data-act="palette" data-id="${p.id}" aria-pressed="${String(palettePref() === p.id)}"><span class="pal-sw" aria-hidden="true">${p.swatch.map((c) => html`<i style="background:${c}"></i>`)}</span><b>${p.name}</b><small>${p.sub}</small></button>`)}</div><p class="hint">Each one has a light and a dark version. Saved on this device.</p></div>` });
    const examCard = card({ cls: 'span-6', title: 'Exam mode', icon: 'cap', body: html`<button type="button" class="tog" data-act="exam-mode" aria-pressed="${String(exam)}">Exam mode until ${fmtDS(st.examModeEnd || '2027-01-12')}</button><p class="hint">${exam ? 'On: Notes and Habit Tracker move from the top bar into More, so the bar keeps to what serves the exam. Nothing is hidden; every tab stays one tap away.' : 'Off: every tab you chose in Navigation is in the top bar.'}</p>
      <div class="fields" style="margin-top:12px">${field('R1 deadline · all chapters once', 'syllabusDeadline', 'date', st.syllabusDeadline)}${field('Paper 1 date', 'examDate', 'date', st.examDate)}${field('Paper start time', 'examTime', 'time', st.examTime)}</div>` });
    const plan = card({ title: 'Plan and targets', icon: 'calcheck', body: html`<h3 class="sub-h" style="margin-top:0">Daily study target · hours a day</h3><div class="fields">${st.phases.map((p, i) => field(p.name + ' · ' + fmtDS(p.from) + ' → ' + fmtDS(p.to), 'phases.' + i + '.hrs', 'num', p.hrs, 'min="0" max="24"'))}</div>
      <h3 class="sub-h">Habit targets</h3><div class="fields">${field('Pages a day', 'pages', 'num', st.pages)}${field('Steps a day', 'steps', 'num', st.steps)}${field('Push-ups on day 1', 'pushStart', 'num', st.pushStart)}${field('Add push-ups', 'pushAdd', 'num', st.pushAdd)}${field('…every N days', 'pushEvery', 'num', st.pushEvery)}${field('Push-up maximum', 'pushMax', 'num', st.pushMax)}${field('Minimum hours a day', 'minHours', 'num', st.minHours)}</div>
      <h3 class="sub-h">2 km running goal</h3><div class="fields">${field('Current 2 km time (minutes, 15.5 = 15:30)', 'runCurrent', 'num', st.runCurrent)}${field('Goal 2 km time (minutes)', 'runGoal', 'num', st.runGoal)}${field('Improvement curve (1 = straight line)', 'runCurve', 'num', st.runCurve)}</div>
      <h3 class="sub-h">Mock score lines</h3><div class="fields">${field('Pass line (%)', 'passLine', 'pct', st.passLine)}${field('Target line, when a paper has no checkpoint target (%)', 'targetLine', 'pct', st.targetLine)}</div>
      <h3 class="sub-h">Checkpoint targets per paper</h3><div class="tbl-wrap"><table class="tbl ptargets"><thead><tr><th scope="col">Paper</th>${(st.checkpoints || []).map((c, i) => html`<th scope="col" class="n">Checkpoint ${i + 1}<br><small class="muted">${fmtDS(c)}</small></th>`)}</tr></thead><tbody>${Object.keys(st.paperTargets || {}).map((p) => html`<tr><th scope="row">${M.WMAP[p] ? M.WMAP[p].code + ' ' + M.WMAP[p].short : p}</th>${st.paperTargets[p].map((v, i) => html`<td class="n"><input class="in sm" type="number" inputmode="numeric" min="0" max="100" id="s-pt-${p.replace(/\W/g, '')}-${i}" data-change="set" data-path="paperTargets.${p}.${i}" data-t="num" value="${v}" aria-label="${p} target at checkpoint ${i + 1}"></td>`)}</tr>`)}</tbody></table></div>` });
    const xpF = [['hour', 'Per study hour'], ['dayDone', 'Day done'], ['dayPartial', 'Day partial'], ['page', 'Per page read'], ['workout', 'Workout done'], ['steps', 'Steps target hit'], ['pushups', 'Push-up target hit'], ['meals', 'Meals on track'], ['streakPerDay', 'Streak bonus per day (max 10)'], ['chapterDone', 'Chapter done'], ['highBonus', 'HIGH-priority bonus'], ['revision', 'Each revision tick'], ['questions', 'Questions = yes (partly = half)'], ['bossTaken', 'Full paper taken (+1 per mark)'], ['bossDefeated', 'Paper target met'], ['run', 'Run logged'], ['ttBeat', 'Time-trial target beaten']];
    const xpCard = card({ cls: 'span-7', title: 'XP and levels', icon: 'award', sub: 'From your original tracker', body: html`<div class="fields">${xpF.map((a) => field(a[1], 'xp.' + a[0], 'num', x[a[0]]))}${field('Level curve: level L needs this × (L − 1)² XP', 'levelK', 'num', st.levelK)}</div><p class="hint">Ranks: ${M.ranks.map((r) => String(r.name).replace(/^\S+\s/, '') + ' (' + r.level + ')').join(' → ')}</p>` });
    const t = st.timer || {};
    const timerCard = card({ cls: 'span-5', title: 'Focus timer', icon: 'timer', body: html`<div class="fields">${field('Pomodoro (minutes)', 'timer.pomodoro', 'num', t.pomodoro)}${field('Deep Work (minutes)', 'timer.deep', 'num', t.deep)}${field('Short break (minutes)', 'timer.short', 'num', t.short)}</div>` });
    const areas = card({ cls: 'span-7', title: 'Life areas', icon: 'analytics', sub: 'Each area is a line on the Analytics life-area chart', actions: html`<button type="button" class="btn sm" data-act="area-add">${icon('plus')}Add</button>`,
      body: html`<ul class="list">${M.areas.map((a) => html`<li><i class="key line" style="--c:${a.color};width:18px"></i><span class="li-main"><b>${a.name}${a.hidden ? ' · hidden' : ''}</b><small>${a.sourceLabel} · target ${a.target}% by ${fmtDS(a.deadline)}</small></span><button type="button" class="icon-btn sm" data-act="area-edit" data-id="${a.id}" aria-label="Edit ${a.name}">${icon('edit')}</button></li>`)}</ul>` });
    const kind = db.kind(), meta = store.S.meta || {};
    const data = card({ cls: 'span-5', title: 'Your data', icon: 'database', body: html`<p class="muted small">Stored in ${kind === 'indexeddb' ? 'IndexedDB' : kind === 'localstorage' ? 'browser storage' : 'memory only'} on this device. ${meta.migratedFrom || ''}. Set up on ${String(meta.initializedAt || '').slice(0, 10)}.</p>
      <div class="row wrap" style="margin-top:12px"><a class="btn sm" href="#/tools">${icon('database')}Backup and restore</a></div>
      <div class="danger-zone"><b>Reset all data</b><p class="small muted">Every log, goal, note, journal entry and setting on this device goes back to the original plan. A restore point is kept so you can undo it from Tools.</p><button type="button" class="btn danger" data-act="reset-all">${icon('trash')}Reset all data</button></div>` });
    return html`<div class="grid">${profile}${examCard}</div>${navCard(exam)}${syncCard()}${reminderCard()}${voiceCard()}${plan}<div class="grid">${xpCard}${timerCard}</div><div class="grid">${areas}${data}</div>`;
  },
  enter(q) { navOnEnter = !!q.nav; voiceOnEnter = !!q.voice; },
  after() {
    const to = navOnEnter ? 'nav-card' : voiceOnEnter ? 'voice-card' : '';
    navOnEnter = voiceOnEnter = false;
    const c = to && document.getElementById(to); if (c) setTimeout(() => c.scrollIntoView({ block: 'start' }), 60);
  },
  segs: { theme: (v) => setTheme(v), 'voice-rate': (v) => { voice.set('voiceRate', +v || 1); voice.say('This is my ' + (+v < 1 ? 'slower' : +v > 1 ? 'faster' : 'normal') + ' speed.', 'greet'); } },
  changes: {
    'nav-bar': (el) => {
      const b = navBar(), i = +el.dataset.i, v = el.value, j = b.indexOf(v);
      if (j >= 0 && j !== i) b[j] = b[i];   // already in another slot: the two swap
      b[i] = v;
      saveNav('navBar', b, 'Bottom bar saved');
    },
    'remind-time': (el) => { pwa.setReminderTime(el.value); toast('Reminder time · ' + fmtClock(timeToMin(el.value)), { ms: 1400 }); },
    set: (el) => {
      const t = el.dataset.t; let v = el.value;
      if (t === 'num' || t === 'pct') { v = String(v).trim() === '' ? null : Number(v); if (v !== null && !isFinite(v)) return; if (t === 'pct' && v !== null) v = v / 100; }
      else if (t === 'date') { v = v || null; if (v && !isDate(v)) return; }
      else v = String(v).trim() || null;
      store.setSetting(el.dataset.path, v);
      toast(v === null ? 'Back to your plan’s value' : 'Saved', { ms: 1200 });
    }
  },
  actions: {
    'nav-move': (el) => { const t = navTabs(), i = t.indexOf(el.dataset.id), j = i + (+el.dataset.dir); if (i < 0 || j < 0 || j >= t.length) return; [t[i], t[j]] = [t[j], t[i]]; saveNav('navTabs', t); setTimeout(() => { const b = document.querySelector('[data-act="nav-move"][data-dir="' + el.dataset.dir + '"][data-id="' + el.dataset.id + '"]'); if (b && b.getAttribute('aria-disabled') !== 'true') b.focus(); }, 160); },
    'nav-out': (el) => { const t = navTabs().filter((id) => id !== el.dataset.id); if (t.length) saveNav('navTabs', t, routeById(el.dataset.id).title + ' is in More'); },
    'nav-in': (el) => saveNav('navTabs', navTabs().concat(el.dataset.id), routeById(el.dataset.id).title + ' added to the top bar'),
    'nav-reset': () => { setPref('navTabs', null); saveNav('navBar', null, 'Navigation back to the original'); },
    palette: (el) => { setPalette(el.dataset.id); renderSoon(); toast((PALETTES.find((p) => p.id === el.dataset.id) || {}).name + ' theme', { icon: 'palette', ms: 1400 }); },
    'remind-toggle': async () => {
      if (pwa.reminder().on) { pwa.disableReminder(); toast('Reminder off'); return; }
      const p = await pwa.enableReminder();
      toast(p === 'granted' ? 'Reminder on · you’ll be notified at ' + fmtClock(timeToMin(pwa.reminder().time)) : 'Reminder on · it will show inside the app', { icon: 'bell' });
    },
    'remind-test': () => pwa.checkReminder(() => go('#/log'), true),
    'remind-ics': () => pwa.downloadCalendarReminder(),
    'exam-mode': () => store.setSetting('examMode', !store.settings().examMode),
    'voice-on': () => { voice.set('voiceOn', !voice.on()); toast(voice.on() ? 'Voice on' : 'Voice off · Brief me still reads the day out', { icon: voice.on() ? 'volume' : 'volumeX', ms: 1800 }); if (voice.on()) voice.hello(); },
    'voice-greet': () => voice.set('voiceGreet', !voice.opt('Greet')),
    'voice-brief': () => voice.set('voiceBrief', !voice.opt('Brief')),
    'voice-praise': () => voice.set('voicePraise', !voice.opt('Praise')),
    'voice-listen': (el) => voice.preview(el.dataset.name),
    'voice-use': (el) => {
      const name = el.dataset.name, v = voice.allVoices().find((x) => x.name === name);
      voice.use(name);
      toast('Her voice is now ' + (v ? voice.shortName(v) : 'changed'), { icon: 'volume', ms: 1800 });
      // the Use button becomes "In use": keep the keyboard on that row
      setTimeout(() => { const b = document.querySelector('[data-act="voice-listen"][data-name="' + CSS.escape(name) + '"]'); if (b) b.focus(); }, 160);
    },
    'area-add': () => openArea(null),
    'area-edit': (el) => openArea(el.dataset.id),
    'reset-all': async () => {
      if (!(await confirm({ title: 'Erase all progress?', body: 'Every log, goal, task, note, journal entry and setting on this device goes back to the original plan.' + (sync.connected() ? ' Sync is on, so your other devices are reset too.' : '') + ' A restore point is saved first so you can undo this from Tools.', ok: 'Erase everything', danger: true }))) return;
      await store.resetAll(); toast('All data reset · restore point saved');
    },
    'sync-connect': async () => {
      const token = (document.getElementById('sync-token') || {}).value || '', pass = (document.getElementById('sync-pass') || {}).value || '';
      const done = (r) => toast(r && r.pulled ? 'Sync on · ' + plural(r.pulled, 'update') + ' merged from your other device' : 'Sync on · this device’s data is saved to GitHub', { icon: 'sync', ms: 4000 });
      try { done(await sync.connect(token, pass)); }
      catch (e) {
        if (e.kind !== 'pass' || sync.connected()) { toast(e.message, { tone: e.kind === 'offline' || e.kind === 'input' ? 'warn' : 'bad', ms: 6000 }); return; }
        const replace = await confirm({ title: 'That passphrase doesn’t match', body: 'Your GitHub account already has synced Vayu data, locked with a different passphrase. Use the passphrase you chose on your other device. If you’ve forgotten it, you can replace the synced copy with this device’s data; your other devices will then ask for the new passphrase and merge their data into it.', ok: 'Replace the synced copy', danger: true });
        if (!replace) return;
        try { done(await sync.connect(token, pass, true)); } catch (e2) { toast(e2.message, { tone: 'bad', ms: 6000 }); }
      }
    },
    'sync-now': async () => {
      try { const r = await sync.syncNow('manual'); toast(r && r.pulled ? 'Synced · ' + plural(r.pulled, 'update') + ' from your other device' : 'Up to date', { icon: 'sync', ms: 2000 }); }
      catch (e) { toast(e.message, { tone: e.kind === 'offline' ? 'warn' : 'bad', ms: 6000 }); }
    },
    'sync-off': async () => {
      if (!(await confirm({ title: 'Turn sync off on this device?', body: 'Your data stays on this device, and the synced copy stays in your GitHub account. Turn it on again any time with a token and your passphrase.', ok: 'Turn sync off' }))) return;
      sync.disconnect(); toast('Sync off on this device');
    }
  }
};
export { renderSoon, plural, fmtDY, chip };
