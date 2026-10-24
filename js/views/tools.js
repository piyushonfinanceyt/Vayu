/* Tools: the focus timer and its sessions (credited to study hours), backup and restore (JSON download, copy, import a
   file or pasted text, compatible with the original app's backups), CSV export for Excel / Sheets, restore points,
   storage status, and the keyboard shortcuts. */
import { html, raw, esc, fmt1, fmtD, fmtDY, plural, sortBy, sum, csv, download, todayStr, addDays, typeName, mmss, isObj, fmtMins } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, status, empty, toast, confirm, modal } from '../components.js';
import { renderSoon } from '../router.js';
import * as store from '../store.js';
import * as sync from '../sync.js';
import * as db from '../db.js';
import * as timer from '../timer.js';
import * as pwa from '../pwa.js';
import { model as modelOf } from '../model.js';

const CSV = {
  daily: ['Daily log', (M) => csv(M.days.map((d) => Object.assign({ date: d.date, type: typeName(d.type), target: d.target, planned_workout: d.workout, xp: d.xp }, d.rec)), [['date', 'Date'], ['type', 'Type'], ['target', 'Target h'], ['hrs', 'Hours'], ['status', 'Status'], ['pages', 'Pages'], ['book', 'Book'], ['planned_workout', 'Planned workout'], ['workoutDone', 'Workout done'], ['steps', 'Steps'], ['pushups', 'Push-ups'], ['meals', 'Meals on track'], ['notes', 'Notes'], ['xp', 'XP']])],
  chapters: ['Chapters', (M) => csv(M.chapters, [['id', 'ID'], ['paper', 'Paper'], ['subject', 'Subject'], ['name', 'Chapter'], ['priority', 'Priority'], ['hrs', 'Hours'], ['planned', 'Planned'], ['status', 'Status'], ['doneAt', 'Done on'], [(c) => (c.rev1 ? 'Yes' : ''), 'R2'], [(c) => (c.rev2 ? 'Yes' : ''), 'R3'], ['questions', 'Questions'], ['notes', 'Notes']])],
  mocks: ['Mock tests', (M) => csv(M.mocks, [['id', 'ID'], ['date', 'Date'], ['subject', 'Subject'], ['bossName', 'Mock'], ['max', 'Max'], ['marks', 'Marks'], [(m) => Math.round(m.target * 100), 'Target'], ['result', 'Result'], ['time', 'Time (min)'], ['attempted', 'Attempted'], ['pres', 'Presentation'], ['pph', 'Pages / hour'], ['illeg', 'Unreadable / page'], ['mistakes', 'Mistakes']])],
  runs: ['Runs', (M) => csv(M.runs, [['date', 'Date'], ['session', 'Session'], ['workout', 'Plan'], ['km', 'Km'], ['min', 'Min'], ['sec', 'Sec'], [(r) => (r.pace == null ? '' : mmss(r.pace)), 'Pace /km'], ['walked', 'Walk breaks'], ['effort', 'Effort'], ['notes', 'Notes']])],
  errors: ['Error Book', () => csv(sortBy(store.list('errors'), (e) => e.date), [['date', 'Date'], ['paper', 'Paper'], ['chapter', 'Chapter'], ['type', 'Type'], ['marks', 'Marks lost'], ['source', 'Source'], ['note', 'Rule'], [(e) => (e.fixed ? 'Yes' : ''), 'Fixed']])],
  habits: ['Habits (daily grid)', (M) => { const days = M.days.filter((d) => d.date <= M.t).map((d) => d.date); return csv(days.map((d) => { const r = { date: d }; M.habits.forEach((h) => { const v = M.habitDone(h, d); r[h.id] = v == null ? '' : v ? 1 : 0; }); return r; }), [['date', 'Date']].concat(M.habits.map((h) => [h.id, h.name]))); }],
  arc: ['Winter Arc (daily)', (M) => { const Z = M.arc, rows = []; for (let i = 0; i <= Z.lastIdx; i++) { const k = addDays(Z.start, i), r = { date: k, day: i + 1, done: Z.doneCount(k), pct: Z.pctOf(k), clean: Z.isClean(k) ? 'Yes' : '', note: Z.note(k) }; Z.c.habits.forEach((h) => { r['h_' + h.id] = Z.val(k, h); }); rows.push(r); } return csv(rows, [['date', 'Date'], ['day', 'Day']].concat(Z.c.habits.map((h) => ['h_' + h.id, h.name])).concat([['done', 'Habits done'], ['pct', 'Done %'], ['clean', 'Clean day'], ['note', 'Note']])); }],
  goals: ['Goals', (M) => csv(M.goals, [['title', 'Goal'], ['category', 'Category'], ['sourceLabel', 'Progress from'], [(g) => Math.round(g.progress), 'Progress %'], [(g) => (g.expected == null ? '' : Math.round(g.expected)), 'Expected %'], ['status', 'Status'], ['start', 'Start'], ['deadline', 'Deadline']])],
  sessions: ['Focus sessions', () => csv(sortBy(store.list('sessions'), (s) => s.endedAt || ''), [['date', 'Date'], ['mode', 'Mode'], ['minutes', 'Minutes'], ['subject', 'Subject'], ['startedAt', 'Started'], ['endedAt', 'Ended']])],
  finance: ['Finance', () => csv(sortBy(store.list('finance'), (t) => t.date), [['date', 'Date'], ['type', 'Type'], ['category', 'Category'], ['amount', 'Amount'], ['note', 'Note']])],
  journal: ['Journal', () => csv(sortBy(store.list('journal'), (j) => j.date), [['date', 'Date'], ['mood', 'Mood 1-5'], ['energy', 'Energy 1-3'], ['grateful', 'Grateful'], ['wins', 'Wins'], ['better', 'Do better'], ['body', 'Journal']])],
  notes: ['Notes', () => csv(store.list('notes'), [['title', 'Title'], ['body', 'Note'], [(n) => (n.tags || []).join(' '), 'Tags'], ['subject', 'Subject'], ['updatedAt', 'Updated']])]
};
const backupName = () => 'vayu-backup-' + todayStr() + '.json';

export async function importText(txt, label) {
  let o = null;
  try { o = JSON.parse(String(txt || '').trim()); } catch (e) { o = null; }
  const err = store.validateBackup(o);
  if (err) { toast(err + ' Download one from Tools first.', { tone: 'bad', ms: 5000 }); return false; }
  const full = (o.version || 1) >= 2, d = o.data, cnt = (k, one, many) => plural(isObj(d[k]) ? Object.keys(d[k]).length : 0, one, many);
  const summary = full ? 'It holds ' + [cnt('days', 'day log'), cnt('chapters', 'chapter'), cnt('mocks', 'mock'), cnt('runs', 'run'), cnt('goals', 'goal'), cnt('journal', 'journal entry', 'journal entries')].join(', ') + '.'
    : 'Original tracker backup: ' + [cnt('days', 'day log'), cnt('chapters', 'chapter'), cnt('mocks', 'mock'), cnt('runs', 'run')].join(', ') + ' and settings. Replacing keeps your goals, notes, journal and other data.';
  const when = o.exportedAt && !isNaN(Date.parse(o.exportedAt)) ? ' from ' + fmtDY(new Date(o.exportedAt).toISOString().slice(0, 10)) : '';
  const pick = await choose({ title: 'Import this backup' + when + '?', body: summary + ' Merge it in keeps everything here and takes whatever is newer in the file, entry by entry. Replace everything makes this device match the file exactly' + (sync.connected() ? ', and your synced devices too' : '') + '. A restore point is saved first either way.' });
  if (!pick) return false;
  try {
    if (pick === 'merge') { const n = await store.mergeBackup(o, label); toast(n ? 'Merged · ' + plural(n, 'entry', 'entries') + ' added or updated' : 'Nothing newer in that backup', { ms: 3000 }); }
    else { await store.importBackup(o, label); toast('Backup imported · everything replaced'); }
    return true;
  } catch (e) { toast('Import failed: ' + e.message, { tone: 'bad' }); return false; }
}
// three-way choice: merge (the default), replace, or cancel
function choose(o) {
  return new Promise((res) => {
    let answered = false;
    const m = modal({ title: o.title, body: raw('<p class="muted">' + esc(o.body) + '</p>'), foot: raw('<button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn" data-pick="replace">Replace everything</button><button type="button" class="btn primary" data-pick="merge" autofocus>Merge it in</button>'), onClose: () => { if (!answered) res(null); } });
    m.el.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { answered = true; m.close(); res(b.dataset.pick); }));
  });
}

function installCard() {
  const S = pwa.state, standalone = pwa.isStandalone(), plat = pwa.platform(), sw = pwa.swSupported();
  const line = (ok, title, sub) => html`<li>${icon(ok ? 'checkCircle' : 'info')}<span class="li-main"><b>${title}</b><small>${sub}</small></span></li>`;
  const how = { ios: 'On iPhone or iPad: open this page in Safari, tap Share, then “Add to Home Screen”.', android: 'On Android: open this page in Chrome, tap ⋮, then “Install app”.', desktop: 'On a computer: use the install icon at the right of Chrome’s or Edge’s address bar, or the button here.' };
  return card({
    cls: 'install-card', title: 'Install and offline', icon: 'install', sub: 'Put Vayu on your home screen; it opens without internet',
    actions: S.updateReady ? html`<button type="button" class="btn sm primary" data-act="pwa-update">${icon('sparkles')}Update now</button>` : '',
    body: html`<ul class="list">
        ${line(S.offlineReady, S.offlineReady ? 'Works offline' : sw ? 'Preparing the offline copy…' : 'Offline needs a web address', S.offlineReady ? 'Every page, chart and font is saved on this device. Your data always was.' : sw ? 'It finishes in the background on this first visit.' : 'Open it through a local server or a website (see the README), not as a file.')}
        ${line(standalone || S.installed, standalone ? 'Running as an installed app' : S.installed ? 'Installed on this device' : 'Not installed yet', standalone || S.installed ? 'Opens in its own window, from your home screen or app list.' : how[plat])}
        ${line(pwa.reminder().on, pwa.reminder().on ? '10 PM reminder on' : '10 PM reminder off', pwa.reminder().on ? 'Change the time or add it to your calendar in Settings.' : 'Turn it on in Settings, or add a daily calendar event.')}</ul>
      <div class="row wrap" style="margin-top:12px">${S.installEvent ? html`<button type="button" class="btn primary" data-act="pwa-install">${icon('install')}Install the app</button>` : ''}${S.reg ? html`<button type="button" class="btn" data-act="pwa-check">${icon('sync')}Check for updates</button>` : ''}<a class="btn ghost" href="#/settings">${icon('bell')}Reminder settings</a></div>`
  });
}

export default {
  head() { return { title: 'Tools', sub: raw(esc('Focus timer, backups, CSV export and restore points · your data lives on this device')) }; },
  render(M) {
    const sessions = sortBy(store.list('sessions'), (s) => s.endedAt || '').reverse(), week = sessions.filter((s) => s.date >= addDays(M.t, -6));
    const timerCard = card({ cls: 'span-6', title: 'Focus timer', icon: 'timer', sub: 'Finished focus sessions are added to that day’s study hours', body: raw(timer.widget()) });
    const sessCard = card({ cls: 'span-6', title: 'Sessions · last 7 days', icon: 'list', actions: chip(fmtMins(sum(week, (s) => +s.minutes || 0))),
      body: week.length ? html`<ul class="list">${week.slice(0, 20).map((s) => html`<li><span class="goal-ic">${icon('timer')}</span><span class="li-main"><b>${fmtMins(s.minutes)} · ${(timer.MODES[s.mode] || {}).label || s.mode}${s.subject ? ' · ' + s.subject : ''}</b><small>${fmtD(s.date)} · ${(s.endedAt || '').slice(11, 16)}</small></span><button type="button" class="icon-btn sm" data-act="session-del" data-id="${s.id}" aria-label="Delete this session">${icon('trash')}</button></li>`)}</ul>` : empty('Finished focus sessions appear here and count towards your study hours.', html`<button type="button" class="btn sm" data-act="tm-toggle">${icon('play')}Start a session</button>`, 'timer') });
    const kind = db.kind();
    const backup = card({
      cls: 'span-7', title: 'Backup and restore', icon: 'database', sub: 'Download a backup each week and before switching phones or browsers',
      body: html`<p class="muted small" style="margin-bottom:12px">Stored in ${kind === 'indexeddb' ? 'IndexedDB' : kind === 'localstorage' ? 'browser storage' : 'memory only, so nothing is saved'} on this device. Backups from the original GOD’S PLAN app import here too. Importing asks whether to merge the file in or replace everything. ${sync.connected() ? 'Sync is on, so your devices already share their data.' : raw('To log on more than one device, turn on <a href="#/settings">sync</a>.')}</p>
        <div class="row wrap"><button type="button" class="btn primary" data-act="export-json">${icon('download')}Download backup</button><button type="button" class="btn" data-act="export-copy">${icon('copy')}Copy backup</button><label class="btn">${icon('upload')}Import a backup file<input type="file" accept=".json,application/json" class="sr-only" data-change="import-file"></label></div>
        <label class="field" style="margin-top:14px"><span>Or paste a backup</span><textarea id="bk-paste" class="in" rows="3" placeholder="Paste the backup text here, then press Import"></textarea></label>
        <div class="row wrap" style="margin-top:8px"><button type="button" class="btn" data-act="import-paste">${icon('upload')}Import pasted backup</button></div>
        <h3 class="sub-h">Export CSV for Excel or Sheets</h3><div class="row wrap"><select id="csv-kind" class="in" style="width:auto" aria-label="What to export">${Object.keys(CSV).map((k) => html`<option value="${k}">${CSV[k][0]}</option>`)}</select><button type="button" class="btn" data-act="export-csv">${icon('download')}Download CSV</button></div>`
    });
    const points = card({ cls: 'span-5', title: 'Restore points', icon: 'reset', sub: 'One a day automatically, and before every import or reset', body: html`<div id="snapshots"><p class="muted small">Loading…</p></div><div class="row wrap" style="margin-top:10px"><button type="button" class="btn sm" data-act="snapshot-now">${icon('plus')}Create a restore point</button></div>` });
    const storage = card({ cls: 'span-6', title: 'Storage on this device', icon: 'lock', body: html`<ul class="list"><li>${icon(kind === 'memory' ? 'alert' : 'checkCircle')}<span class="li-main"><b>${kind === 'indexeddb' ? 'IndexedDB' : kind === 'localstorage' ? 'Browser storage (localStorage)' : 'Memory only'}</b><small>${kind === 'memory' ? 'This browser is blocking storage. Download a backup before closing.' : 'Saved as you type and when you leave the page'}</small></span></li><li>${icon('database')}<span class="li-main"><b id="storage-est">Measuring…</b><small id="storage-per">Checking protection…</small></span></li></ul><div class="row wrap" style="margin-top:10px"><button type="button" class="btn" data-act="persist">${icon('lock')}Protect from browser clean-up</button></div>` });
    const keys = [['Ctrl', 'K'], ['/'], ['L'], ['T'], ['G', 'D'], ['G', 'P'], ['G', 'L'], ['G', 'M'], ['['], [']'], ['?']], what = ['Search and commands', 'Search', 'Quick log', 'Light / dark theme', 'Dashboard', 'Study Plan', 'Daily Log', 'Mock Tests', 'Previous day', 'Next day', 'All shortcuts'];
    const shortcuts = card({ cls: 'span-6', title: 'Keyboard shortcuts', icon: 'keyboard', body: html`<ul class="kbd-list">${keys.map((k, i) => html`<li><span>${what[i]}</span><span class="row" style="gap:4px">${k.map((x) => html`<span class="kbd">${x}</span>`)}</span></li>`)}</ul>` });
    return html`${installCard()}<div class="grid">${timerCard}${sessCard}</div><div class="grid">${backup}${points}</div><div class="grid">${storage}${shortcuts}</div>`;
  },
  async after() {
    const box = document.getElementById('snapshots');
    if (box) {
      const snaps = await store.listSnapshots();
      box.innerHTML = snaps.length ? '<ul class="list">' + snaps.map((s) => '<li><span class="li-main"><b>' + esc(new Date(s.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })) + '</b><small>' + esc(s.reason || '') + '</small></span><button type="button" class="btn sm ghost" data-act="snapshot-restore" data-key="' + esc(s.key) + '">' + icon('reset') + 'Restore</button></li>').join('') + '</ul>' : '<p class="muted small">No restore points yet.</p>';
    }
    const est = await db.estimate(), per = await db.persist(false), a = document.getElementById('storage-est'), b = document.getElementById('storage-per');
    if (a) a.textContent = est && est.usage != null ? (est.usage / 1024 / 1024).toFixed(2) + ' MB used' : 'Size unknown';
    if (b) b.textContent = per ? 'Protected from automatic clean-up' : 'Not protected: the browser may clear it if space runs low';
  },
  changes: { 'import-file': async (el) => { const f = el.files && el.files[0]; if (!f) return; await importText(await f.text(), f.name); el.value = ''; } },
  actions: {
    'pwa-install': async () => { const ok = await pwa.install(); if (!ok) toast('Not installed. You can install it any time from here.', { tone: 'info' }); },
    'pwa-update': () => pwa.applyUpdate(),
    'pwa-check': async () => { const r = await pwa.checkForUpdate(); toast(r === 'found' ? 'Downloading the new version…' : r === 'latest' ? 'You have the latest version' : r === 'offline' ? 'You’re offline. Try again when connected.' : 'Updates aren’t available here', { icon: 'sync' }); },
    'tm-toggle': () => { if (timer.running()) timer.pause(); else timer.start(); },
    'tm-reset': () => timer.reset(),
    'tm-mode': (el) => timer.reset(el.dataset.v),
    'session-del': async (el) => {
      const s = store.get('sessions', el.dataset.id); if (!s) return;
      if (!(await confirm({ title: 'Delete this session?', body: 'Its ' + (s.credited || s.minutes) + ' min will be taken off ' + fmtD(s.date) + '’s study hours.', ok: 'Delete', danger: true }))) return;
      store.batch(() => { const cur = +store.dayRec(s.date).hrs || 0; store.setRec('days', s.date, 'hrs', Math.max(0, Math.round((cur - (+s.credited || +s.minutes || 0) / 60) * 100) / 100)); store.remove('sessions', s.id); });
      toast('Session deleted');
    },
    'export-json': () => { download(backupName(), JSON.stringify(store.exportObject(), null, 1), 'application/json'); toast('Backup downloaded · ' + backupName()); },
    'export-copy': () => { const json = JSON.stringify(store.exportObject(), null, 1), ta = document.getElementById('bk-paste'); const fallback = () => { if (ta) { ta.value = json; ta.focus(); ta.select(); } toast('Copying was blocked. The backup is selected in the box: press Ctrl+C.', { tone: 'warn', ms: 5000 }); }; try { navigator.clipboard.writeText(json).then(() => toast('Backup copied to the clipboard'), fallback); } catch (e) { fallback(); } },
    'import-paste': () => importText((document.getElementById('bk-paste') || {}).value, 'pasted backup'),
    'export-csv': () => { const k = (document.getElementById('csv-kind') || {}).value || 'daily', def = CSV[k]; if (!def) return; download('vayu-' + k + '-' + todayStr() + '.csv', '﻿' + def[1](modelOf()), 'text/csv'); toast(def[0] + ' CSV downloaded'); },
    'snapshot-now': async () => { await store.saveSnapshot('manual-' + Date.now(), 'Created by you'); toast('Restore point created'); renderSoon(); },
    'snapshot-restore': async (el) => { if (!(await confirm({ title: 'Restore this point?', body: 'Your current data is saved as another restore point first.' + (sync.connected() ? ' Sync is on, so your other devices go back to this point too.' : ''), ok: 'Restore' }))) return; try { await store.restoreSnapshot(el.dataset.key); toast('Restored'); } catch (e) { toast('Restore failed: ' + e.message, { tone: 'bad' }); } },
    persist: async () => { const r = await db.persist(true); toast(r ? 'This browser will keep your data' : 'The browser didn’t allow it. Keep regular backups.', { tone: r ? 'good' : 'warn' }); renderSoon(); }
  }
};
export { status, fmt1 };
