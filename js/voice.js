/* Voice: a female voice that greets you, briefs you on the day and reacts to what you do. Per device, Settings → Voice.
   - Speaks with the browser's own speech (Web Speech API). Only voices installed on this device by default, so the
     words never leave it; online voices (better sound, but the browser sends the words to its speech service) are
     opt-in. Picks a female English voice (Indian English first, then British, then any) or the one chosen in Settings,
     where every voice can be heard first (Listen) before it replaces the one in use (Use).
   - Greeting: "Hellooo, Piyush!" when the app opens or comes back into view (at most every 3 hours), with a line on
     where the day stands. The first one each day is the daily briefing: the date, the day of the journey and the
     countdown, today's goal, each study block still to do with its chapters, the workout, overdue chapters, how far
     you've got and what to do right now. "Brief me" (Today's study, hold +, the command palette, P) reads it again.
   - Reactions, right after you tick or log something: a chapter done (and how many are left), an R2 / R3 tick, a quest
     or task done, every study task done, the hours target, the workout, steps / push-ups / pages / meals, mock marks
     against the target, a mistake logged or fixed, new catch-up dates, a deep focus session started or finished,
     a level or a badge. Changes that arrive from your other device, a restore or a merge stay silent.
   - Browsers only let a page speak after a tap, so a greeting waits for your first tap or key press.
   - What's being said shows in a caption above the toasts, with Stop. Nothing is said while the app is hidden, or
     during deep focus apart from its start and finish. */
import * as store from './store.js';
import { model } from './model.js';
import { pref, setPref, setPrefs } from './prefs.js';
import { todayStr, plural, greeting, diff, now } from './util.js';
import { icon } from './icons.js';
import { whatNow } from './whatnow.js';
import { blockState, studyPlan, shortGoal, midSentence } from './studyday.js';
import * as timer from './timer.js';

const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
export const supported = () => !!synth && typeof window.SpeechSynthesisUtterance === 'function';

// ---------- settings (this device) ----------
export const on = () => pref('voiceOn', true) !== false;
export const opt = (k) => pref('voice' + k, true) !== false;          // 'Greet', 'Praise', 'Brief'
export const online = () => pref('voiceOnline', false) === true;
export const rate = () => +pref('voiceRate', 1) || 1;
const subs = new Set();
export const onChange = (fn) => { subs.add(fn); };
const changed = () => subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
export function set(key, value) { setPref(key, value); if (key === 'voiceOn' && !value) stop(); changed(); }

// ---------- voices ----------
const FEM = /\b(zira|heera|neerja|aria|jenny|michelle|ana|sonia|libby|maisie|natasha|clara|emily|hazel|susan|catherine|linda|eva|samantha|karen|moira|tessa|fiona|veena|victoria|allison|ava|serena|kate|isha|lekha|swara|kalpana|aditi|raveena|priya|female|zoe|joanna|salli|kimberly|kendra|ivy|amy|emma|olivia|sara|nicky|martha|kiri|yasmin|aashi|jenna|ellie|ananya|molly|leah|luna|nancy|jane|elizabeth|abbie|bella|hollie|ashley|cora|monica|elsie|nova|amber|imani|ezinne|asilia|rehema|mia|kavya|rosa|yan|sapna)\b/i;
const MALE = /\b(david|mark|ravi|guy|george|james|daniel|alex|fred|rishi|prabhat|brian|ryan|thomas|christopher|eric|roger|male|aaron|arthur|gordon|oliver|reed|rocko|grandpa|ralph|albert|hemant|kunal|william|liam|andrew|brandon|davis|jason|tony|steffan|connor|mitchell|matthew|joey|justin|kevin|russell|sean|prakash|madhur)\b/i;
let voices = [];
function loadVoices() {
  if (!synth) return;
  const v = synth.getVoices() || [];
  if (v.length !== voices.length) { voices = v; changed(); }
}
if (synth) { loadVoices(); if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices); else synth.onvoiceschanged = loadVoices; }
const langOf = (v) => String(v.lang || '').toLowerCase().replace('_', '-');
export const female = (v) => (FEM.test(v.name) || /^Google (US English|हिन्दी)$/.test(v.name) ? true : MALE.test(v.name) ? false : null);
const local = (v) => v.localService !== false;
export const isLocal = local;
const english = (v) => /^en(-|$)/.test(langOf(v));
function score(v) {
  const l = langOf(v), f = female(v);
  return (f === true ? 20 : f === false ? -20 : 0) + (l === 'en-in' ? 6 : l === 'en-gb' ? 3 : english(v) ? 1 : 0) + (/natural|neural|enhanced|premium/i.test(v.name) ? 4 : 0) + (local(v) ? 1 : 0) + (v.default ? 1 : 0);
}
// every English (and Hindi) voice this browser has, on this device or online, the best female voice first
export function allVoices() {
  loadVoices();
  return voices.filter((v) => /^(en|hi)(-|$)/.test(langOf(v))).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}
// the ones she may speak with: this device's, and online ones once you've picked one
export const voiceList = () => allVoices().filter((v) => local(v) || online());
// the voice you picked, or the best female English voice
export function currentVoice() {
  const list = voiceList(), want = pref('voiceName', '');
  return (want && list.find((v) => v.name === want)) || list.find(english) || list[0] || null;
}
const ACCENT = { 'en-in': 'Indian English', 'en-gb': 'British English', 'en-us': 'American English', 'en-au': 'Australian English', 'en-ie': 'Irish English', 'en-ca': 'Canadian English', 'en-nz': 'New Zealand English', 'en-za': 'South African English', 'en-sg': 'Singapore English', 'en-ph': 'Philippine English', 'en-ng': 'Nigerian English', 'en-ke': 'Kenyan English', 'en-hk': 'Hong Kong English', 'en-tz': 'Tanzanian English', 'hi-in': 'Hindi (India), reads English with a Hindi accent' };
export const accent = (v) => ACCENT[langOf(v)] || v.lang;
// "Microsoft Heera - English (India)" → "Heera", "Microsoft Neerja Online (Natural) - English (India)" → "Neerja (natural)"
export const shortName = (v) => String(v.name).replace(/^Microsoft\s+/, '').replace(/\s+Online\s+\(Natural\)/i, ' (natural)').replace(/\s+-\s+.*$/, '').trim() || v.name;
const byName = (name) => allVoices().find((v) => v.name === name) || null;
// a sample in that voice; nothing changes until you choose it
export function preview(name) {
  const v = byName(name); if (!v) return false;
  const nm = firstName(model()), s = shortName(v).replace(' (natural)', '');
  return say([{ text: 'Hellooo, ' + nm + '!', rate: 0.92, pitch: 1.2, voice: v }, { text: (/^[A-Z][a-z]+$/.test(s) ? 'I’m ' + s + '. ' : 'This is how I sound. ') + 'Brilliant work today: Audit Documentation is done, and that’s your hours target hit. Let’s keep going!', voice: v }], 'greet');
}
// from now on she speaks with this voice (an online one turns online voices on)
export function use(name) {
  const v = byName(name); if (!v) return;
  setPrefs({ voiceName: v.name, voiceOnline: !local(v) });
  changed();
  say([{ text: 'Okay, ' + firstName(model()) + '! I’ll sound like this from now on.', voice: v }], 'greet');
}

// ---------- words that read well aloud ----------
function spoken(s) {
  return String(s || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\bmock #(\d+)/gi, 'mock $1')
    .replace(/#(\d+)\s+(?=[A-Z])/g, 'chapter $1, ')
    .replace(/#(\d+)/g, 'number $1')
    .replace(/(\d)\s*–\s*(\d)/g, '$1 to $2')
    .replace(/\bP([1-6])\b/g, 'Paper $1')
    .replace(/(\d)\s?h\b/g, '$1 hours').replace(/\b1 hours\b/g, '1 hour')
    .replace(/(\d)\s?min\b/g, '$1 minutes')
    .replace(/\bvs\.?\s/g, 'versus ')
    .replace(/\s*[·—–→|]\s*/g, ', ')
    .replace(/\s*,(\s*,)+/g, ',').replace(/\s{2,}/g, ' ').replace(/\s+([,.!?:])/g, '$1').replace(/^[,\s]+/, '').trim();
}
const clock = (m) => { const h = Math.floor(m / 60) % 24, mm = m % 60; return (h % 12 || 12) + (mm ? ':' + String(mm).padStart(2, '0') : '') + (h < 12 ? ' AM' : ' PM'); };
export function hrsSay(x) {
  x = Math.round((+x || 0) * 4) / 4;
  const w = Math.floor(x), f = x - w;
  if (!f) return plural(w, 'hour');
  if (f === 0.5) return w ? w + ' and a half hours' : 'half an hour';
  if (f === 0.25) return w ? w + ' and a quarter hours' : 'a quarter of an hour';
  return w ? w + ' and three quarter hours' : '45 minutes';
}
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayWords = (ds) => { const d = new Date(ds + 'T00:00'); return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; };
const andList = (a) => (a.length < 2 ? a[0] || '' : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const firstName = (M) => String(M.st.player || '').trim().split(/\s+/)[0] || 'there';
const last = {};
const pick = (key, arr) => { let i = Math.floor(Math.random() * arr.length); if (arr.length > 1 && i === last[key]) i = (i + 1) % arr.length; last[key] = i; return arr[i]; };

// ---------- speaking: one queue, a caption, Stop ----------
let queue = [], cur = null, wd = 0, cap = null, tapped = false, waiting = [];
const activated = () => tapped || !!(navigator.userActivation && navigator.userActivation.hasBeenActive);
function gate(fn) { if (activated()) fn(); else waiting.push(fn); }
['pointerup', 'keydown', 'click'].forEach((ev) => document.addEventListener(ev, (e) => {
  if (ev === 'keydown' && e.key === 'Escape') return;
  tapped = true;
  const w = waiting; waiting = []; w.forEach((f) => f());
}, { capture: true, passive: true }));

function caption(text) {
  if (!text) { if (cap) cap.hidden = true; document.body.classList.remove('voice-on'); return; }
  if (!cap) {
    cap = document.createElement('div');
    cap.className = 'voicecap'; cap.id = 'voicecap';
    cap.innerHTML = String(icon('volume')) + '<span class="vc-t"></span><button type="button" class="vc-stop" aria-label="Stop the voice">Stop</button>';
    cap.querySelector('.vc-stop').addEventListener('click', () => stop());
    document.body.append(cap);
  }
  cap.querySelector('.vc-t').textContent = text;
  cap.hidden = false;
  document.body.classList.add('voice-on');
  document.body.style.setProperty('--vc-h', cap.offsetHeight + 'px');
}
function utter(it) {
  const u = new SpeechSynthesisUtterance(it.text), v = it.voice || currentVoice();
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-IN';
  u.rate = Math.max(0.6, Math.min(1.6, rate() * (it.rate || 1)));
  u.pitch = it.pitch || 1.05;
  return u;
}
function next() {
  clearTimeout(wd);
  if (cur) return;
  if (!queue.length) { caption(''); return; }
  const it = cur = queue.shift();
  const done = () => { if (cur !== it) return; cur = null; next(); };
  it.u = utter(it);   // kept on the item: Chrome drops the end event of an utterance it has garbage-collected
  it.u.onend = done;
  it.u.onerror = (e) => {
    if (cur !== it) return;
    if (e && e.error === 'not-allowed') { const rest = [it].concat(queue); queue = []; cur = null; caption(''); tapped = false; gate(() => { queue = rest.concat(queue); setTimeout(next, 60); }); return; }
    // an online voice that can't be reached (offline, say): the same line with the best voice on this device
    const v = it.u.voice;
    if (v && !local(v) && !it.retried && e && /network|synthesis|unavailable/.test(e.error || '')) {
      const lv = allVoices().find((x) => local(x) && english(x)) || allVoices().find(local);
      if (lv) { cur = null; clearTimeout(wd); queue.unshift(Object.assign({}, it, { voice: lv, retried: true, u: null })); next(); return; }
    }
    done();
  };
  caption(it.text);
  synth.speak(it.u);
  // Chrome sometimes never ends an utterance: move on after a generous estimate
  wd = setTimeout(done, 5000 + it.text.length * 110 / rate());
}
export const speaking = () => !!cur || queue.length > 0;
export function stop() { queue = []; cur = null; clearTimeout(wd); if (synth) synth.cancel(); caption(''); }
// mode 'react' lines replace a reaction being said, and wait behind a briefing; 'greet' / 'brief' start afresh
export function say(lines, mode = 'react') {
  if (!supported() || document.hidden) return false;
  const items = [].concat(lines).filter(Boolean).map((l) => { const o = typeof l === 'string' ? { text: l } : Object.assign({}, l); o.text = spoken(o.text); o.mode = mode; return o; }).filter((o) => o.text);
  if (!items.length) return false;
  gate(() => {
    if (mode === 'react') {
      queue = queue.filter((q) => q.mode !== 'react');
      if (cur && cur.mode === 'react') { cur = null; clearTimeout(wd); synth.cancel(); }
      queue = queue.concat(items);
    } else { queue = []; if (cur) { cur = null; clearTimeout(wd); synth.cancel(); } queue = items; }
    setTimeout(next, 60);   // straight after cancel(), Chrome needs a moment before it speaks again
  });
  return true;
}

// ---------- what's said ----------
const deepOn = () => { const s = timer.state(); return !!s.deep && timer.running(); };
const hi = (M) => ({ text: 'Hellooo, ' + firstName(M) + '!', rate: 0.92, pitch: 1.2 });
function examLine(M) {
  const n = diff(M.t, M.st.examDate);
  return n > 1 ? 'Paper 1 is ' + n + ' days away' : n === 1 ? 'Paper 1 is tomorrow' : n === 0 ? 'Paper 1 is today' : '';
}
function standing(M, S) {
  const d = M.todayDay; if (!d) return '';
  const hrs = +d.rec.hrs || 0;
  if (S.total && S.done === S.total) return 'Every study task for today is done' + (hrs ? ', with ' + hrsSay(hrs) + ' studied' : '') + '.';
  if (!hrs && !S.done) return '';
  const parts = [];
  if (hrs) parts.push(hrsSay(hrs) + ' of your ' + hrsSay(d.target));
  if (S.done) parts.push(S.done + ' of ' + S.total + ' study tasks done');
  return 'So far: ' + parts.join(', and ') + (hrs ? '' : '; no hours logged yet') + '.';
}
function itemName(it) {
  // "FM · Investment Decisions – Capital Budgeting (NPV, IRR …)" → "Investment Decisions: Capital Budgeting"
  if (it.kind === 'chapter') return String(it.title).replace(/^[A-Z]{2,4}\s*·\s*/, '').replace(/\s+–\s+/g, ': ');
  if (it.kind === 'task') return it.title;
  if (it.kind === 'mock') return it.title + (it.sub ? ', ' + String(it.sub).split(' · ')[0] : '');
  return '';
}
// one block still to do: "Still open from earlier, Audit R1: …", "Now, …", "At 2 PM, timed writing and marking."
function blockLine(g, i, n, prev) {
  const open = g.items.filter((x) => !x.done), names = open.map(itemName).filter(Boolean);
  const past = g.end != null && g.end <= n;
  const when = past ? (prev === 'past' ? 'Also open' : 'Still open from earlier') : g.from != null ? (g.from <= n ? 'Now' : 'At ' + clock(g.from)) : i ? 'Then' : 'First';
  const what = g.key === 'tasks' ? 'your own study tasks' : g.key === 'mock' ? 'the full paper' : midSentence(shortGoal(g.title));
  const rest = names.length > 3 ? plural(names.length, open[0].kind === 'chapter' ? 'chapter' : 'task') : andList(names);
  return when + ', ' + what + (rest && rest.toLowerCase() !== what.toLowerCase() ? ': ' + rest : '') + '.';
}
const closer = (M) => pick('close', ['Let’s make today count!', 'You’ve got this, ' + firstName(M) + '.', 'One block at a time. Let’s go!', 'Small steps, every hour. Let’s begin.']);
// the daily briefing, sentence by sentence
export function briefing(M, withHi = true) {
  const B = blockState(M), S = studyPlan(M, B), d = M.todayDay, J = M.journey, out = [];
  if (withHi) out.push(hi(M));
  const ex = examLine(M);
  out.push(greeting(now().getHours()) + '! It’s ' + dayWords(M.t) + (J.num ? ': day ' + J.num + ' of ' + J.days : '') + (ex ? ', and ' + ex : '') + '.');
  if (!d) { out.push(M.t < M.FIRST ? 'The plan starts on ' + dayWords(M.FIRST) + '.' : 'There’s nothing planned today. Rest, and look over your weakest chapter.'); return out; }
  out.push('Today’s goal: ' + hrsSay(d.target) + (S.total ? ', across ' + plural(S.total, 'study task') : '') + '.');
  const open = S.groups.filter((g) => g.items.some((x) => !x.done)), doneG = S.groups.filter((g) => g.items.every((x) => x.done));
  open.forEach((g, i) => out.push(blockLine(g, i, B.n, i && open[i - 1].end != null && open[i - 1].end <= B.n ? 'past' : '')));
  if (doneG.length && open.length) out.push('Already done: ' + andList(doneG.map((g) => (g.key === 'tasks' ? 'your own tasks' : shortGoal(g.title)))) + '.');
  const wo = S.also.find((x) => x.kind === 'workout'), other = S.also.filter((x) => x.kind !== 'workout' && !x.done);
  if (wo && !wo.done) out.push('Workout: ' + wo.title + '.');
  if (other.length) out.push('Also on your list: ' + (other.length > 2 ? plural(other.length, 'other task') : andList(other.map((x) => x.title))) + '.');
  if (M.overdueCount) out.push('Heads up: ' + plural(M.overdueCount, 'chapter') + (M.overdueCount === 1 ? ' is' : ' are') + ' overdue. The rescue strip on Today’s study can give ' + (M.overdueCount === 1 ? 'it a new date' : 'them new dates') + ' in one tap.');
  const st = standing(M, S); if (st) out.push(st);
  const W = whatNow(M, B.n);
  if (W && W.top && !(S.total && S.done === S.total)) out.push('Right now: ' + W.top.title + '.');
  out.push(closer(M));
  return out;
}
// a greeting when the briefing has already been given today
function greetLines(M) {
  const B = blockState(M), S = studyPlan(M, B), d = M.todayDay, h = now().getHours(), out = [hi(M)];
  const late = h >= 23 || h < 4;
  if (d && d.logged && late) { out.push('The day is logged. Get some sleep; tomorrow is a fresh start.'); return out; }
  out.push(pick('back', ['Welcome back.', 'Good to see you again.', 'There you are.', 'Back for more? I love it.']));
  const st = standing(M, S); if (st) out.push(st);
  const W = whatNow(M, B.n);
  if (W && W.top && !(S.total && S.done === S.total)) out.push('Next: ' + W.top.title + '.');
  else if (d && !d.logged && h >= 20) out.push('Don’t forget tonight’s 10 PM log.');
  return out;
}
export function brief() { stop(); setPrefs({ voiceGreetAt: Date.now(), voiceBriefOn: todayStr() }); return say(briefing(model(), true), 'brief'); }
export function hello() { return say([hi(model()), 'This is how I’ll sound.'], 'greet'); }

// when the app opens or comes back into view: the briefing once a day, otherwise a greeting at most every 3 hours
let autoWait = false;
function due() {
  if (!supported() || !on()) return null;
  if (opt('Brief') && pref('voiceBriefOn', '') !== todayStr()) return 'brief';
  if (opt('Greet') && Date.now() - (+pref('voiceGreetAt', 0) || 0) > 3 * 3600e3) return 'greet';
  return null;
}
export function welcome() {
  if (autoWait || document.hidden || deepOn() || !due()) return;
  autoWait = true;
  gate(() => setTimeout(() => {
    autoWait = false;
    const k = due();
    if (!k || document.hidden || deepOn()) return;
    setPrefs(k === 'brief' ? { voiceGreetAt: Date.now(), voiceBriefOn: todayStr() } : { voiceGreetAt: Date.now() });
    const M = model();
    say(k === 'brief' ? briefing(M, true) : greetLines(M), k);
  }, 500));
}

// ---------- reactions: what changed since the last look ----------
function snap() {
  const M = model(), d = M.todayDay, r = d ? d.rec : store.dayRec(M.t), S = studyPlan(M, blockState(M)), ts = store.S.timer || {};
  const ch = {}; M.chapters.forEach((c) => { ch[c.id] = [c.status, !!c.rev1, !!c.rev2, c.planned]; });
  const tk = {}; store.list('tasks').forEach((x) => { tk[x.id] = !!x.done; });
  const mk = {}; M.mocks.forEach((m) => { mk[m.id] = m.marks; });
  const errs = store.list('errors');
  return {
    t: M.t, ch, tk, mk, hrs: +r.hrs || 0, wo: r.workoutDone === 'Yes', steps: +r.steps || 0, push: +r.pushups || 0, pages: +r.pages || 0, meals: r.meals === 'Yes',
    errN: errs.length, errFixed: errs.filter((e) => e.fixed).length, sesN: store.list('sessions').length,
    deepAt: ts.deep ? ts.startedAt || null : null, sDone: S.done, sTotal: S.total, level: M.level, badges: M.badges.map((b) => b.on)
  };
}
const chName = (M, id) => { const c = M.chapters.find((x) => String(x.id) === String(id)); return c ? c.name : 'that chapter'; };
const focusName = (M, f) => {
  if (!f || f.kind !== 'subject') return 'general study';
  const c = f.chapterId ? M.chapters.find((x) => String(x.id) === String(f.chapterId)) : null;
  return c ? c.name : (M.WMAP[f.subject] || {}).short || f.subject;
};
function reactions(a, b, byYou) {
  const M = model(), n = firstName(M), out = [], d = M.todayDay;
  const add = (p, text) => out.push([p, text]);
  const wow = () => pick('wow', ['Brilliant, ' + n + '!', 'Yes! Well done, ' + n + '.', 'That’s it, ' + n + '!', 'Lovely work, ' + n + '.', 'Superb!', 'Look at you go, ' + n + '!']);
  // deep focus: the timer can start and finish it, so these don't wait for a tap
  if (b.deepAt && b.deepAt !== a.deepAt) {
    const s = timer.state();
    add(80, pick('fs', ['Deep focus on ' + focusName(M, s.focus) + '. ' + Math.round(s.dur / 60) + ' minutes. You’ve got this; I’ll stay quiet.', 'Okay, ' + n + ': ' + Math.round(s.dur / 60) + ' minutes on ' + focusName(M, s.focus) + '. Phone down, mind on. I’ll be quiet.']));
  }
  if (b.sesN > a.sesN) {
    const s = store.list('sessions').sort((x, y) => String(y.endedAt || '').localeCompare(String(x.endedAt || '')))[0];
    if (s) {
      const name = s.deep ? focusName(M, { kind: s.subject ? 'subject' : 'general', subject: s.subject, chapterId: s.chapterId }) : '';
      const full = !s.deep || s.minutes >= (s.planned || s.minutes);
      add(85, full ? pick('fe', ['Session complete! ' + s.minutes + ' minutes' + (name ? ' on ' + name : '') + '. ' + (s.deep && !s.distractions ? 'Not one lost-focus moment. ' : '') + 'Take a breath.', 'Done! ' + s.minutes + ' focused minutes' + (name ? ' on ' + name : '') + ' added to today. Stretch, drink some water.'])
        : s.minutes + ' minutes in the bag' + (name ? ' on ' + name : '') + '. Every minute counts.');
    }
  }
  // the hours target: a 10 PM log entry or a finished focus session can cross it
  const tgt = d ? d.target : 0;
  if (tgt && b.hrs >= tgt && a.hrs < tgt) add(90, hrsSay(b.hrs) + '! That’s today’s target hit. So proud of you, ' + n + '.');
  if (!byYou) return out;
  // chapters
  const doneNow = [], undone = [], prog = [], revs = [];
  let moved = 0;
  Object.keys(b.ch).forEach((id) => {
    const x = a.ch[id], y = b.ch[id]; if (!x) return;
    if (y[0] === 'done' && x[0] !== 'done') doneNow.push(id);
    else if (x[0] === 'done' && y[0] !== 'done') undone.push(id);
    else if (y[0] === 'progress' && x[0] === 'pending') prog.push(id);
    if (y[1] && !x[1]) revs.push([id, 'R2']);
    if (y[2] && !x[2]) revs.push([id, 'R3']);
    if (x[3] !== y[3]) moved++;
  });
  const left = M.kpi.syllabus.total - M.kpi.syllabus.done;
  const leftLine = left ? plural(left, 'chapter') + ' to go for R1.' : 'That’s the whole syllabus done once!';
  if (doneNow.length === 1) add(60, wow() + ' ' + chName(M, doneNow[0]) + ' is done. ' + leftLine);
  else if (doneNow.length > 1) add(60, wow() + ' ' + doneNow.length + ' chapters done in one go. ' + leftLine);
  if (undone.length === 1 && !doneNow.length) add(20, 'Okay, ' + chName(M, undone[0]) + ' is back on your list.');
  if (prog.length === 1 && !doneNow.length) add(25, pick('prog', ['Good start on ' + chName(M, prog[0]) + '. Keep at it.', chName(M, prog[0]) + ' is under way. Nice.']));
  if (revs.length === 1) add(55, revs[0][1] + ' of ' + chName(M, revs[0][0]) + ' done. ' + pick('rev', ['That’s how it sticks.', 'Revision wins exams.', 'It’s getting stronger every round.']));
  else if (revs.length > 1) add(55, plural(revs.length, 'revision') + ' ticked. That’s how it sticks.');
  if (moved >= 2 && !doneNow.length) add(40, 'Done. ' + plural(moved, 'chapter') + ' have new dates. One day at a time; we’ll get there.');
  // plan quests and your own tasks
  const tasksDone = Object.keys(b.tk).filter((id) => b.tk[id] && !a.tk[id]).map((id) => store.get('tasks', id)).filter(Boolean);
  tasksDone.slice(0, 1).forEach((x) => {
    if (x.plan) {
      const what = x.plan === 'rev' || /^plan-rev-/.test(x.id) ? 'Revision dose' : /^plan-side-/.test(x.id) ? 'Side quest' : 'Main quest';
      add(50, wow() + ' ' + what + ' done: ' + shortGoal(String(x.title || '').replace(/^Block [A-Z] · /, '')) + '.');
    } else add(45, pick('task', ['Ticked off: ', 'Done and dusted: ', 'One less thing: ']) + x.title + '.');
  });
  // the whole day's study
  if (b.sTotal && b.sDone === b.sTotal && a.sDone < a.sTotal) add(100, 'That’s every study task for today, ' + n + '! You did it. ' + (d && d.logged && b.hrs >= (d ? d.target : 0) ? 'I’m so proud of you.' : 'Log the day tonight, then rest well.'));
  // the 10 PM log
  if (!(tgt && b.hrs >= tgt && a.hrs < tgt) && b.hrs > a.hrs && b.sesN === a.sesN && b.hrs - a.hrs >= 0.25) add(30, hrsSay(b.hrs) + ' logged' + (tgt > b.hrs ? '. ' + hrsSay(tgt - b.hrs) + ' more for today’s target.' : '.'));
  if (b.wo && !a.wo) add(48, pick('wo', ['Workout done! A strong body keeps a sharp mind.', 'Workout ticked. Endorphins on your side now.', 'Nice, the workout’s done. Your brain thanks you.']));
  if (d && b.steps >= (+M.st.steps || 0) && a.steps < (+M.st.steps || 0) && b.steps > 0) add(35, b.steps.toLocaleString('en-IN') + ' steps. Target smashed!');
  if (d && d.pushT && b.push >= d.pushT && a.push < d.pushT) add(35, b.push + ' push-ups. Strong!');
  if (d && d.pagesT && b.pages >= d.pagesT && a.pages < d.pagesT) add(33, b.pages + ' pages read. That’s the reading done.');
  if (b.meals && !a.meals) add(22, 'Meals on track. Good fuel, good focus.');
  // mock marks
  Object.keys(b.mk).forEach((id) => {
    if (b.mk[id] == null || a.mk[id] != null) return;
    const m = M.mocks.find((x) => String(x.id) === String(id)); if (!m) return;
    const sc = Math.round(m.score * 100), tg = Math.round(m.target * 100), subj = (M.WMAP[m.subject] || {}).short || m.subject;
    add(95, m.score >= m.target ? b.mk[id] + ' in ' + subj + '! Above your target of ' + tg + '. Superb, ' + n + '!'
      : m.score >= M.st.passLine ? b.mk[id] + ' in ' + subj + '. Past the pass line; ' + (tg - sc) + ' more to your target of ' + tg + '. Log what cost you marks while it’s fresh.'
        : b.mk[id] + ' in ' + subj + '. It stings, I know. Every mark you lost is a lesson: log them in the Error Book while they’re fresh. We go again.');
  });
  // the Error Book
  if (b.errN > a.errN) add(28, pick('err', ['Logged. Finding the leak is half the fix.', 'Good catch. Now it can’t surprise you in the exam.']));
  if (b.errFixed > a.errFixed) add(32, 'Fixed for good! One less leak.');
  // levels and badges
  if (b.level > a.level) add(70, 'Level up! You’re level ' + b.level + ' now.');
  const badge = M.badges.find((x, i) => x.on && a.badges[i] === false);
  if (badge) add(65, 'And you’ve unlocked a badge: ' + badge.name + '.');
  return out;
}
let snapA = null, pend = 0, quiet = false, lastInput = 0;
['pointerdown', 'keydown', 'input', 'change'].forEach((ev) => document.addEventListener(ev, () => { lastInput = Date.now(); }, { capture: true, passive: true }));
function look() {
  const a = snapA; let b;
  try { b = snap(); } catch (e) { console.warn('[voice]', e); return; }
  snapA = b;
  const q = quiet; quiet = false;
  if (!a || q || a.t !== b.t || !supported() || !on() || !opt('Praise') || document.hidden) return;
  const byYou = Date.now() - lastInput < 8000;
  let R = reactions(a, b, byYou);
  // in deep focus only its start and finish are said
  if (deepOn()) R = R.filter((r) => r[0] === 80 || r[0] === 85);
  if (!R.length) return;
  R.sort((x, y) => y[0] - x[0]);
  // what you did: the most important line and one more that matters (60 and up), said cause first (the chapter,
  // then "every study task done"; a session, then the hours target); then a level or a badge it earned
  const lvl = (r) => r[0] === 70 || r[0] === 65, did = R.filter((r) => !lvl(r));
  const top = did.slice(0, 1).concat(did.slice(1).filter((r) => r[0] >= 60)).slice(0, 2).sort((x, y) => x[0] - y[0]);
  say(top.concat(R.filter(lvl)).slice(0, 3).map((r) => r[1]), 'react');
}
// call once after the store is ready
export function start() {
  try { snapA = snap(); } catch (e) { console.warn('[voice]', e); }
  store.subscribe((info) => {
    if (info && info.coll === '*' && info.id !== 'batch') quiet = true;   // a sync, restore or merge: nothing you just did
    clearTimeout(pend); pend = setTimeout(look, 900);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else welcome(); });
  welcome();
}
