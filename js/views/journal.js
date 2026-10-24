/* Journal: one page a day — mood, energy, grateful, wins, do better, free writing with a rotating prompt — plus voice notes
   recorded in the browser (or added from your phone's recorder) and kept on this device. Past entries with a mood strip.
   Record: journal/'j_YYYY-MM-DD' {date, mood 1-5, energy 1-3, grateful, wins, better, body, voice:[{id, at, dur, mime, size, name}]}.
   The audio itself lives in this browser's IndexedDB (same record format as the original app). */
import { html, raw, esc, fmtD, fmtDL, fmtLong, plural, diff, addDays, sortBy, sum, mmss, isDate, todayStr, uid, pad, MON, parse, clamp01, debounce, download } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, empty, toast, confirm, menu, form } from '../components.js';
import { pref, setPref } from '../prefs.js';
import { renderSoon, go } from '../router.js';
import * as store from '../store.js';

export const MOODS = [[1, '😞', 'Low'], [2, '😕', 'Meh'], [3, '🙂', 'Okay'], [4, '😊', 'Good'], [5, '🤩', 'Great']];
const ENERGY = [[1, 'Low'], [2, 'Steady'], [3, 'High']];
const PROMPTS = ['What moved you one step closer to CA Inter today?', 'Which chapter felt hardest today, and why?', 'What distracted you most today, and how will you guard against it tomorrow?', 'One thing you are proud of from today.', 'What would make tomorrow a 10/10 day?', 'What did you learn about yourself today?', 'Where did your time actually go today?', 'What are you avoiding, and what is the smallest next step?', 'Who or what helped you today?', 'Which mistake from practice today do you never want to repeat? Write the rule.', 'How did your body feel today: sleep, food, movement?', 'If you read this on exam day, what would you want to remember?', 'What will you do differently tomorrow morning?', 'What made you smile today?'];
const TEXT = ['grateful', 'wins', 'better', 'body'];
const MAX_SEC = 15 * 60;
const jid = (d) => 'j_' + d;
const entry = (d) => store.get('journal', jid(d)) || null;
const hasText = (e) => !!e && TEXT.some((k) => String(e[k] || '').trim());
const isEmpty = (e) => !e || (!hasText(e) && !e.mood && !e.energy && !(e.voice || []).length);
const words = (e) => TEXT.reduce((n, k) => n + ((String((e && e[k]) || '').trim().match(/\S+/g) || []).length), 0);
const clockOf = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : pad(d.getHours()) + ':' + pad(d.getMinutes()); };
let cur = null;

function save(date, fields) {
  const e = entry(date), next = Object.assign({ id: jid(date), date, voice: [] }, e || {}, fields);
  if (isEmpty(next)) { if (e) store.remove('journal', jid(date)); return; }
  store.put('journal', next);
}
const pending = {};
const flushText = () => { Object.keys(pending).forEach((date) => { save(date, pending[date]); delete pending[date]; }); };
const saveSoon = debounce(flushText, 450);
window.addEventListener('pagehide', flushText);

// ---------- voice notes (kept in this browser) ----------
const R = { state: 'idle', date: null, rec: null, stream: null, chunks: [], t0: 0, timer: 0, cancel: false };
const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined');
const elapsed = () => (R.t0 ? (Date.now() - R.t0) / 1000 : 0);
const pickMime = () => { if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return ''; return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || ''; };
async function startRec(date) {
  if (R.state !== 'idle') return;
  if (!canRecord()) { toast('Recording isn’t available in this browser. Use “Add audio file”.', { tone: 'warn', ms: 6000 }); return; }
  R.state = 'starting'; R.date = date; renderSoon();
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { R.state = 'idle'; renderSoon(); toast(e && e.name === 'NotFoundError' ? 'No microphone found on this device.' : 'Microphone access is blocked. Allow it, or use “Add audio file”.', { tone: 'warn', ms: 6000 }); return; }
  let rec = null; const mime = pickMime();
  try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : {}); } catch (e) { try { rec = new MediaRecorder(stream); } catch (e2) { rec = null; } }
  if (!rec) { stream.getTracks().forEach((t) => t.stop()); R.state = 'idle'; renderSoon(); toast('Couldn’t start recording.', { tone: 'warn' }); return; }
  Object.assign(R, { rec, stream, chunks: [], cancel: false });
  rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) R.chunks.push(ev.data); };
  rec.onstop = finishRec;
  rec.start(1000); R.t0 = Date.now(); R.state = 'rec';
  R.timer = setInterval(() => { const t = document.getElementById('rec-time'); if (t) t.textContent = mmss(elapsed()); if (elapsed() >= MAX_SEC) stopRec(false); }, 250);
  renderSoon();
}
function stopRec(cancel) { if (R.state !== 'rec' || !R.rec) return; R.cancel = !!cancel; R.dur = elapsed(); R.state = 'saving'; clearInterval(R.timer); try { R.rec.stop(); } catch (e) { finishRec(); } renderSoon(); }
async function finishRec() {
  const { rec, date, cancel, chunks } = R, dur = R.dur || elapsed();
  try { if (R.stream) R.stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* already stopped */ }
  const type = String((rec && rec.mimeType) || (chunks[0] && chunks[0].type) || 'audio/webm').split(';')[0], blob = new Blob(chunks, { type });
  Object.assign(R, { state: 'idle', rec: null, stream: null, chunks: [], t0: 0, dur: 0 });
  if (cancel) { renderSoon(); toast('Recording discarded'); return; }
  if (!blob.size || dur < 0.8) { renderSoon(); toast('That was too short to keep', { tone: 'warn' }); return; }
  await addVoice(date, blob, dur, 'Voice note · ' + clockOf(new Date().toISOString()));
}
window.addEventListener('pagehide', () => { if (R.state === 'rec') stopRec(false); });
async function addVoice(date, blob, dur, name) {
  const id = uid('vn');
  try { await store.putBlob(id, blob); } catch (e) { toast('This browser couldn’t keep the audio.', { tone: 'bad' }); return; }
  const e = entry(date) || {};
  save(date, { voice: (e.voice || []).concat({ id, at: new Date().toISOString(), dur: dur != null && isFinite(dur) ? Math.round(dur * 10) / 10 : null, mime: blob.type || 'audio/webm', size: blob.size, name: String(name || 'Voice note').slice(0, 80) }) });
  toast('Voice note saved', { icon: 'mic' });
}
const probe = (blob) => new Promise((res) => { const a = document.createElement('audio'), u = URL.createObjectURL(blob); let done = false; const fin = (v) => { if (done) return; done = true; URL.revokeObjectURL(u); res(v); }; a.preload = 'metadata'; a.onloadedmetadata = () => fin(isFinite(a.duration) ? a.duration : null); a.onerror = () => fin(null); setTimeout(() => fin(null), 4000); a.src = u; });
// one shared player that survives re-renders
const player = { el: null, id: null, playing: false }, urls = new Map();
function audioEl() {
  if (player.el) return player.el;
  const a = new Audio();
  ['timeupdate', 'play', 'pause', 'ended'].forEach((ev) => a.addEventListener(ev, () => { player.playing = !a.paused && !a.ended; paint(); }));
  a.addEventListener('error', () => { if (player.id) { player.playing = false; paint(); toast('This voice note can’t play here', { tone: 'warn' }); } });
  player.el = a; return a;
}
async function togglePlay(id) {
  const a = audioEl();
  if (player.id === id && a.src) { if (a.paused) a.play().catch(() => {}); else a.pause(); return; }
  if (!urls.has(id)) { const b = await store.getBlob(id); if (!b) { toast('This recording isn’t on this device', { tone: 'warn' }); return; } urls.set(id, URL.createObjectURL(b)); }
  a.pause(); player.id = id; a.src = urls.get(id); a.play().catch(() => toast('Couldn’t play this voice note', { tone: 'warn' }));
}
function paint() {
  const a = player.el;
  document.querySelectorAll('[data-vn]').forEach((row) => {
    const on = row.dataset.vn === player.id, playing = on && player.playing, b = row.querySelector('.vn-play');
    if (b && b.dataset.state !== (playing ? 'p' : 's')) { b.dataset.state = playing ? 'p' : 's'; b.innerHTML = String(icon(playing ? 'pause' : 'play')); b.setAttribute('aria-label', (playing ? 'Pause ' : 'Play ') + row.dataset.name); }
    const dur = on && a && isFinite(a.duration) ? a.duration : +row.dataset.dur || 0, t = on && a ? a.currentTime : 0;
    const fill = row.querySelector('.vn-bar i'); if (fill) fill.style.width = (dur ? clamp01(t / dur) * 100 : 0).toFixed(1) + '%';
    const tm = row.querySelector('.vn-time'); if (tm) tm.textContent = on && t > 0.05 ? mmss(t) + ' / ' + mmss(dur) : (+row.dataset.dur ? mmss(+row.dataset.dur) : '—');
  });
}

// ---------- render ----------
const promptFor = (date) => { let h = 0; for (let i = 0; i < date.length; i++) h = (h * 31 + date.charCodeAt(i)) | 0; return PROMPTS[(Math.abs(h) + (+pref('jPromptOff', 0))) % PROMPTS.length]; };
function stats(t) {
  const all = store.list('journal'), by = {}; all.forEach((e) => { by[e.date] = e; });
  const counts = (e) => !!e && (hasText(e) || (e.voice || []).length > 0);
  let streak = 0, d = counts(by[t]) ? t : addDays(t, -1);
  while (counts(by[d])) { streak++; d = addDays(d, -1); }
  const moods = all.filter((e) => e.mood && diff(e.date, t) < 30 && e.date <= t).map((e) => e.mood);
  return { by, streak, month: all.filter((e) => e.date.slice(0, 7) === t.slice(0, 7) && counts(e)).length, voices: sum(all, (e) => (e.voice || []).length), avgMood: moods.length ? sum(moods) / moods.length : null };
}
function writeCard(date, e) {
  const f = (k) => (e && e[k]) || '';
  const field = (k, label, ph, rows) => html`<label class="field"><span>${label}</span>${rows ? html`<textarea id="jf-${k}" class="in ${k === 'body' ? 'jr-body' : ''}" rows="${rows}" data-input="jf" data-f="${k}" data-date="${date}" placeholder="${ph}">${f(k)}</textarea>` : html`<input id="jf-${k}" class="in" type="text" data-input="jf" data-f="${k}" data-date="${date}" value="${f(k)}" placeholder="${ph}" autocomplete="off">`}</label>`;
  return card({
    cls: 'span-7', title: date === todayStr() ? 'Today’s entry' : 'Entry · ' + fmtD(date), icon: 'journal',
    body: html`<div class="field"><span>How was the day?</span><div class="moods" role="group" aria-label="Mood">${MOODS.map((m) => html`<button type="button" class="mood m${m[0]}" data-act="j-mood" data-date="${date}" data-v="${m[0]}" aria-pressed="${String(!!(e && e.mood === m[0]))}"><span aria-hidden="true">${m[1]}</span>${m[2]}</button>`)}</div></div>
      <div class="field" style="margin-top:12px"><span>Energy</span><div class="seg" role="group" aria-label="Energy">${ENERGY.map((x) => html`<button type="button" data-act="j-energy" data-date="${date}" data-v="${x[0]}" aria-pressed="${String(!!(e && e.energy === x[0]))}">${x[1]}</button>`)}</div></div>
      <div class="jr-prompt"><span class="lbl">${icon('sparkles')}Prompt</span><p>${promptFor(date)}</p><div class="row wrap"><button type="button" class="btn sm" data-act="j-prompt-use" data-date="${date}">${icon('plus')}Use this prompt</button><button type="button" class="btn sm ghost" data-act="j-prompt-next">Another prompt</button></div></div>
      <div class="stack">${field('grateful', 'Grateful for', 'One thing, person or moment')}<div class="fields">${field('wins', 'Wins today', 'Big or small', 3)}${field('better', 'Do better tomorrow', 'One change you will make', 3)}</div>${field('body', 'Journal', 'Write freely about your day…', 8)}</div>
      <p class="hint"><span id="jr-words">${plural(words(e), 'word')}</span> · saves as you type${e && e.updatedAt ? ' · last edit ' + clockOf(e.updatedAt) : ''}</p>`
  });
}
function voiceCard(date, e) {
  const rec = R.state === 'rec', busy = R.state === 'starting' || R.state === 'saving', list = (e && e.voice) || [];
  const panel = rec ? html`<div class="rec-panel on"><button type="button" class="rec-btn" data-act="vn-stop" aria-label="Stop and save">${icon('stop')}</button><div class="li-main"><b><i class="rec-dot" aria-hidden="true"></i>Recording${R.date !== date ? ' for ' + fmtD(R.date) : ''} · <span id="rec-time" class="num">${mmss(elapsed())}</span></b><small>Tap stop to save · up to 15 minutes</small></div><button type="button" class="btn sm ghost" data-act="vn-cancel">Discard</button></div>`
    : html`<div class="rec-panel"><button type="button" class="rec-btn" data-act="vn-rec" data-date="${date}" ${raw(busy ? 'aria-disabled="true"' : '')} aria-label="Record a voice note">${icon('mic')}</button><div class="li-main"><b>${R.state === 'starting' ? 'Waiting for the microphone…' : R.state === 'saving' ? 'Saving…' : 'Record a voice note'}</b><small>${canRecord() ? 'Talk through your day. It’s saved with this entry, on this device.' : 'This browser can’t record. Add a file from your phone’s voice recorder.'}</small></div></div>`;
  return card({
    cls: 'span-5', title: 'Voice notes', icon: 'mic', actions: list.length ? chip(String(list.length)) : '',
    body: html`${panel}<div class="row wrap" style="margin:12px 0"><label class="btn sm">${icon('upload')}Add audio file<input type="file" accept="audio/*,.m4a,.webm,.mp3,.wav,.ogg" multiple class="sr-only" data-change="vfile" data-date="${date}"></label><span class="hint" style="margin:0">Kept in this browser. Back up from Tools before switching devices.</span></div>
      ${list.length ? html`<ul class="vn-list">${list.map((v) => html`<li class="vn" data-vn="${v.id}" data-dur="${v.dur || ''}" data-name="${v.name || 'Voice note'}"><button type="button" class="vn-play" data-act="vn-play" data-id="${v.id}" data-state="s" aria-label="Play ${v.name || 'voice note'}">${icon('play')}</button><div class="li-main"><b>${v.name || 'Voice note'}</b><div class="vn-bar"><i></i></div><small><span class="vn-time num">${v.dur ? mmss(v.dur) : '—'}</span> · ${clockOf(v.at)}</small></div><button type="button" class="icon-btn sm" data-act="vn-more" data-id="${v.id}" data-date="${date}" aria-label="More for ${v.name || 'voice note'}" aria-haspopup="menu">${icon('moreV')}</button></li>`)}</ul>` : html`<p class="muted small">No voice notes for this day yet.</p>`}`
  });
}
function pastCard(M, date, s) {
  const t = M.t, q = String(pref('jrQ', '')).trim().toLowerCase();
  let all = sortBy(store.list('journal').filter((e) => e.date <= t), (e) => e.date).reverse();
  if (q) all = all.filter((e) => (TEXT.map((k) => e[k] || '').join(' ') + ' ' + (e.voice || []).map((v) => v.name).join(' ') + ' ' + fmtLong(e.date)).toLowerCase().includes(q));
  const list = pref('jrAll') ? all : all.slice(0, 20);
  const strip = html`<div class="mood-strip" role="list" aria-label="Mood, last 35 days">${Array.from({ length: 35 }, (_, i) => addDays(t, i - 34)).map((d) => { const e = s.by[d], m = e && e.mood, has = e && (hasText(e) || (e.voice || []).length); return html`<a role="listitem" class="ms ${m ? 'm' + m : has ? 'has' : ''} ${d === date ? 'sel' : ''}" href="#/journal?date=${d}" title="${fmtD(d) + (m ? ' · ' + MOODS[m - 1][2] : has ? ' · written' : ' · no entry')}" aria-label="${fmtD(d) + (m ? ', mood ' + MOODS[m - 1][2] : has ? ', entry' : ', no entry')}"></a>`; })}</div>
    <div class="legend" style="margin-top:8px">${MOODS.map((m) => html`<span><i class="key ms-k m${m[0]}"></i>${m[2]}</span>`)}<span><i class="key ms-k has"></i>written, no mood</span></div>`;
  const rows = list.length ? html`<ul class="list">${list.map((e) => { const snip = (e.body || e.wins || e.grateful || e.better || '').replace(/\s+/g, ' ').trim(), nv = (e.voice || []).length; return html`<li><a class="li-main jr-row" href="#/journal?date=${e.date}" style="text-decoration:none"><b>${fmtD(e.date)} ${e.mood ? MOODS[e.mood - 1][1] : ''}</b><small>${snip ? snip.slice(0, 160) : nv ? 'Voice notes only' : 'Mood only'}</small></a>${nv ? chip(String(nv), '', 'mic') : ''}<span class="small muted">${plural(words(e), 'word')}</span></li>`; })}</ul>${all.length > 20 ? html`<button type="button" class="btn sm ghost" data-act="jr-all">${pref('jrAll') ? 'Show fewer' : 'Show all ' + all.length}</button>` : ''}`
    : empty(q ? 'No entries match “' + q + '”.' : 'Your past entries will show up here.', '', 'journal');
  return card({ title: 'Past entries', icon: 'list', actions: html`<label class="search-inline">${icon('search')}<input id="jr-search" class="in sm" type="search" placeholder="Search the journal" value="${pref('jrQ', '')}" data-input="jr-q" aria-label="Search the journal"></label>`,
    body: html`<div class="row wrap" style="gap:6px;margin-bottom:12px">${chip(plural(s.streak, 'day') + ' streak', 'ink', 'flame')}${chip(s.month + ' this month')}${chip(plural(s.voices, 'voice note'))}${s.avgMood ? chip('Average mood ' + MOODS[Math.round(s.avgMood) - 1][1] + ' ' + (Math.round(s.avgMood * 10) / 10) + ' / 5') : ''}</div>${strip}<div style="margin-top:14px">${rows}</div>` });
}

export default {
  head(M, q) { const date = isDate(q.date) && q.date <= M.t ? q.date : M.t; return { title: 'Journal', actions: raw((date !== M.t ? '<a class="btn" href="#/journal">' + icon('calendar') + 'Today</a>' : '') + '<a class="btn" href="#/log?date=' + date + '">' + icon('logbook') + 'Daily log</a>') }; },
  render(M, q) {
    const date = isDate(q.date) && q.date <= M.t ? q.date : M.t, e = entry(date), s = stats(M.t);
    cur = date;
    const nav = html`<section class="card daynav"><a class="icon-btn" href="#/journal?date=${addDays(date, -1)}" aria-label="Previous day">${icon('chevL')}</a><div class="dn"><b>${fmtDL(date)}</b><span>${date === M.t ? 'Today' : plural(diff(date, M.t), 'day') + ' ago'}${e && e.mood ? ' · ' + MOODS[e.mood - 1][1] + ' ' + MOODS[e.mood - 1][2] : ''} · journal streak ${plural(s.streak, 'day')}</span></div><a class="icon-btn" href="#/journal?date=${addDays(date, 1)}" ${raw(date >= M.t ? 'aria-disabled="true" tabindex="-1"' : '')} aria-label="Next day">${icon('chevR')}</a><input type="date" class="in sm" data-nav-date="journal" max="${M.t}" value="${date}" aria-label="Pick a day"></section>`;
    return html`${nav}<div class="grid top">${writeCard(date, e)}${voiceCard(date, e)}</div>${pastCard(M, date, s)}`;
  },
  after() { paint(); },
  step(dir) { if (!cur) return; const n = addDays(cur, dir); if (n <= todayStr()) go('#/journal?date=' + n); },
  inputs: {
    jf: (el) => { const d = el.dataset.date; pending[d] = Object.assign(pending[d] || {}, { [el.dataset.f]: el.value }); saveSoon(); const w = document.getElementById('jr-words'); if (w) { const e = Object.assign({}, entry(d) || {}, pending[d]); w.textContent = plural(words(e), 'word'); } },
    'jr-q': (el) => { setPref('jrQ', el.value); renderSoon(); }
  },
  changes: {
    vfile: async (el) => {
      const date = el.dataset.date;
      for (const f of Array.from(el.files || [])) {
        if (!/^audio\//.test(f.type) && !/\.(m4a|webm|mp3|wav|ogg|aac|opus)$/i.test(f.name)) { toast(f.name + ' isn’t an audio file', { tone: 'warn' }); continue; }
        if (f.size > 20 * 1024 * 1024) { toast(f.name + ' is over 20 MB', { tone: 'warn' }); continue; }
        await addVoice(date, f, await probe(f), f.name.replace(/\.[^.]+$/, '') || 'Audio');
      }
      el.value = '';
    }
  },
  actions: {
    'j-mood': (el) => { flushText(); const e = entry(el.dataset.date), v = +el.dataset.v; save(el.dataset.date, { mood: e && e.mood === v ? null : v }); },
    'j-energy': (el) => { flushText(); const e = entry(el.dataset.date), v = +el.dataset.v; save(el.dataset.date, { energy: e && e.energy === v ? null : v }); },
    'j-prompt-next': () => { setPref('jPromptOff', (+pref('jPromptOff', 0)) + 1); renderSoon(); },
    'j-prompt-use': (el) => {
      const date = el.dataset.date, ta = document.getElementById('jf-body'), curText = ta ? ta.value : ((entry(date) || {}).body || ''), add = promptFor(date) + '\n';
      flushText(); save(date, { body: curText.trim() ? curText.replace(/\s+$/, '') + '\n\n' + add : add });
      setTimeout(() => { const t = document.getElementById('jf-body'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 80);
    },
    'jr-all': () => { setPref('jrAll', !pref('jrAll')); renderSoon(); },
    'vn-rec': (el) => startRec(el.dataset.date),
    'vn-stop': () => stopRec(false),
    'vn-cancel': () => stopRec(true),
    'vn-play': (el) => togglePlay(el.dataset.id),
    'vn-more': (el) => {
      const date = el.dataset.date, id = el.dataset.id, e = entry(date), v = e && (e.voice || []).find((x) => x.id === id); if (!v) return;
      menu(el, [
        { label: 'Save audio file', icon: 'download', fn: async () => { const b = await store.getBlob(id); if (!b) { toast('This recording isn’t on this device', { tone: 'warn' }); return; } download('journal-' + date + '-' + clockOf(v.at).replace(':', '') + (/mp4|m4a/.test(v.mime) ? '.m4a' : /mpeg/.test(v.mime) ? '.mp3' : /wav/.test(v.mime) ? '.wav' : /ogg/.test(v.mime) ? '.ogg' : '.webm'), b, v.mime); } },
        { label: 'Rename', icon: 'edit', fn: () => form({ title: 'Rename voice note', fields: [{ name: 'name', label: 'Name', required: true, autofocus: true }], values: { name: v.name || '' }, onSubmit: (x) => { save(date, { voice: (entry(date).voice || []).map((y) => (y.id === id ? Object.assign({}, y, { name: x.name.slice(0, 80) }) : y)) }); } }) },
        '-',
        { label: 'Delete voice note', icon: 'trash', fn: async () => { if (!(await confirm({ title: 'Delete this voice note?', body: (v.name || 'Voice note') + ' will be removed from this device.', ok: 'Delete', danger: true }))) return; if (player.id === id && player.el) player.el.pause(); save(date, { voice: (entry(date).voice || []).filter((x) => x.id !== id) }); store.dropBlob(id).catch(() => {}); toast('Voice note deleted'); } }
      ], { align: 'end' });
    }
  }
};
export { MON, parse };
