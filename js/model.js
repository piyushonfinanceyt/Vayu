/* The derived model: one pure function of (store, today) that every view, widget and chart reads.
   Part 1 is the original tracker's game engine, ported rule for rule from reference/gods-plan/js/analytics/engine.js
   (XP, levels, ranks, streaks, Comeback Power, subject windows, run curve, mock results, badges).
   Part 2 adds the dashboard analytics (KPIs, expected pace, goals, habits, Today's Focus, the timetable,
   milestones, notifications). Memoised on the store version + today, so a re-render costs one compute.

   Ahead / behind, on a 0-100 scale:
     expected(today) = start + (target - start) x elapsed days / total days   (linear pace)
     gap = actual - expected  ->  ahead if gap >= tol, behind if gap <= -tol;  tol = max(3 points, one day's progress)
   Study hours and runs follow the plan's own (non-linear) pace instead of a straight line. */
import * as store from './store.js';
import * as arc from './arc.js';
import { errDue } from './drill.js';
import { diff, addDays, mondayOf, sum, clamp, clamp01, fmt1, fmtN, fmtD, fmtDS, mmss, plural, sortBy, todayStr, parseHours, timeToMin, now } from './util.js';

export const WORLDS = [
  { key: 'Accounts', short: 'Accounts', paper: 1, name: 'Advanced Accounting', grp: 'G1' },
  { key: 'Law', short: 'Law', paper: 2, name: 'Corporate & Other Laws', grp: 'G1' },
  { key: 'Tax', short: 'Tax', paper: 3, name: 'Taxation (Income-tax + GST)', grp: 'G1' },
  { key: 'Costing', short: 'Costing', paper: 4, name: 'Cost & Management Accounting', grp: 'G2' },
  { key: 'Audit', short: 'Audit', paper: 5, name: 'Auditing & Ethics', grp: 'G2' },
  { key: 'FM&SM', short: 'FM & SM', paper: 6, name: 'Financial Mgmt & Strategic Mgmt', grp: 'G2' }
].map((w) => Object.assign(w, { c: 'var(--p' + w.paper + ')', code: 'P' + w.paper }));
export const WMAP = {}; WORLDS.forEach((w) => { WMAP[w.key] = w; });
// CA Inter Jan 2027: Group I on 2, 4 and 6 Jan, Group II on 8, 10 and 12 Jan
const EXAM_DAY = { 1: '2027-01-02', 2: '2027-01-04', 3: '2027-01-06', 4: '2027-01-08', 5: '2027-01-10', 6: '2027-01-12' };
export const GOAL_SOURCES = {
  manual: 'Set the % yourself', readiness: 'Average of syllabus, revision, mocks and hours', syllabus: 'Chapters completed',
  hours: 'Study hours vs plan', revision: 'R2 + R3 revision ticks', mocks: 'Full mocks taken', run: '2 km time-trial progress',
  run5k: '5 km in 30:00 · best run as % of 5 km at 6:00 /km', tasks: 'Linked tasks completed'
};
export const AREA_SOURCES = { manual: 'Your check-ins', 'auto:syllabus': 'Chapters completed (auto)', 'auto:health': 'Workout, steps, push-ups and meals (auto)', 'auto:run': '2 km time-trial progress (auto)', 'auto:run5k': '5 km in 30:00 progress (auto)' };
export const STATUS_TXT = { done: 'Completed', ahead: 'Ahead', ontrack: 'On track', behind: 'Behind', overdue: 'Overdue', upcoming: 'Not started', nodata: 'No data yet', paused: 'Paused' };
export const STATUS_TONE = { done: 'good', ahead: 'good', ontrack: 'good', behind: 'warn', overdue: 'bad', upcoming: '', nodata: '', paused: '' };
export const GOAL_CATS = ['Academic', 'Health', 'Career', 'Personal', 'Finance', 'Content'];
export const CAT_ICON = { Academic: 'cap', Health: 'health', Career: 'briefcase', Personal: 'sparkles', Finance: 'coins', Content: 'video' };

// =====================================================================================
// PART 1 - the original game engine
// =====================================================================================
function computeGame(st, t) {
  const D = store.D, xp = st.xp;
  const K = +st.levelK > 0 ? +st.levelK : 22;
  const FIRST = D.days[0].date, LAST = D.days[D.days.length - 1].date;
  // the journey: Day 1 = journeyStart … last day = journeyEnd (23 Oct – 25 Dec)
  const J0 = st.journeyStart || st.comebackStart || FIRST, J1 = st.journeyEnd || LAST, JN = diff(J0, J1) + 1;
  const jNumOf = (date) => (date >= J0 && date <= J1 ? diff(J0, date) + 1 : null);
  const dayLabel = (date) => { const n = jNumOf(date); return n ? 'Day ' + n + ' of ' + JN : date < J0 ? 'Before Day 1' : date < (st.examDate || LAST) ? 'Final look' : 'Exam window'; };
  const ws = mondayOf(FIRST);
  const phases = Array.isArray(st.phases) ? st.phases : [];
  const ramp = Array.isArray(st.hoursRamp) ? st.hoursRamp : [];
  const rampFor = (date) => { if (date < J0) return null; for (const r of ramp) { if (r && r.to && date <= r.to) return r; } return null; };
  const phaseIdx = (date) => { for (let i = 0; i < phases.length; i++) { if (phases[i] && phases[i].to && date <= phases[i].to) return i; } return phases.length - 1; };
  const phaseHrs = (date) => { const p = phases[phaseIdx(date)]; return p ? +p.hrs || 0 : 0; };
  const hrsFor = (date) => { const h = phaseHrs(date), r = rampFor(date); return r ? Math.min(h, +r.hrs || h) : h; };
  const minHrs = +st.minHours || 3;
  const runMon = mondayOf(st.runStart || FIRST);
  const runWeeks = Math.floor(diff(runMon, st.runGoalDate || LAST) / 7) + 1;
  const targetSec = (w) => { const f = Math.max(0, 1 - (w - 1) / Math.max(1, runWeeks - 1)); return Math.round((+st.runGoal + (+st.runCurrent - +st.runGoal) * Math.pow(f, +st.runCurve || 1)) * 60); };

  let prev = 0;
  const days = D.days.map((p, i) => {
    const rec = store.dayRec(p.date);
    const target = hrsFor(p.date), pagesT = +st.pages || 0;
    const pushT = Math.min(+st.pushMax || 0, (+st.pushStart || 0) + Math.floor(i / Math.max(1, +st.pushEvery || 1)) * (+st.pushAdd || 0));
    const logged = rec.hrs !== null && rec.hrs !== undefined;
    const hrs = logged ? +rec.hrs : 0;
    const hit = rec.status === 'done' || (logged && target > 0 && hrs / target >= 0.8);
    const streak = hit ? prev + 1 : 0; prev = streak;
    const pages = +rec.pages || 0, steps = +rec.steps || 0, push = +rec.pushups || 0;
    const stepsHit = steps > 0 && steps >= (+st.steps || 0), pushHit = push > 0 && push >= pushT;
    const parts = [];
    const addP = (label, v) => { if (v) parts.push([label, v]); };
    addP('Study ' + fmt1(hrs) + ' h × ' + xp.hour, hrs * xp.hour);
    if (rec.status === 'done') addP('Day done', xp.dayDone); else if (rec.status === 'partial') addP('Day partial', xp.dayPartial);
    addP('Pages ' + pages + ' × ' + xp.page, pages * xp.page);
    if (rec.workoutDone === 'Yes') addP('Workout done', xp.workout);
    if (stepsHit) addP('Steps target hit', xp.steps);
    if (pushHit) addP('Push-up target hit', xp.pushups);
    if (rec.meals === 'Yes') addP('Meals on track', xp.meals);
    if (streak) addP('Streak bonus · day ' + streak, Math.min(streak, 10) * xp.streakPerDay);
    const isRest = p.workout === 'Rest / recovery';
    const quests = [
      ['quest', 'Clear main + side quest', rec.status === 'done'],
      ['study', 'Study ' + fmt1(target) + ' h', logged && hrs >= target],
      ['pages', 'Read ' + pagesT + ' pages', rec.pages != null && pages >= pagesT],
      ['workout', isRest ? 'Rest and recover' : p.workout, rec.workoutDone === 'Yes' || (isRest && logged)],
      ['push', pushT + ' push-ups', rec.pushups != null && push >= pushT],
      ['steps', fmtN(st.steps) + ' steps', stepsHit],
      ['meals', 'Meals on track', rec.meals === 'Yes'],
      ['log', 'Log it at 10 PM', logged]
    ];
    const pi = phaseIdx(p.date);
    return {
      i, date: p.date, dayNum: i + 1, jNum: jNumOf(p.date), label: dayLabel(p.date), week: Math.floor(diff(ws, p.date) / 7) + 1,
      phase: (phases[pi] || {}).name || '', phaseIdx: pi,
      type: p.type, main: p.main, side: p.side, mock: p.mock, rev: p.rev, workout: p.workout, isRest,
      run: store.RUN_BY[p.date] || null, boss: !!(p.mock && p.mock !== '—'),
      rec, target, pagesT, pushT, logged, hit, streak,
      ramp: rampFor(p.date), minHrs, minMet: logged && hrs >= minHrs,
      xp: sum(parts, (x) => x[1]), parts, quests, questsDone: quests.filter((q) => q[2]).length,
      score: p.date > t ? -2 : !logged ? -1 : (target > 0 ? Math.min(1, hrs / target) : 0)
    };
  });
  const dayByDate = {}; days.forEach((d) => { dayByDate[d.date] = d; });

  const chapters = D.chapters.map((c) => {
    const r = store.chRec(c), ov = store.S.chapters[c.id] || {};
    const done = r.status === 'done';
    let cx = 0;
    if (done) cx += xp.chapterDone + (c.priority === 'HIGH' ? xp.highBonus : 0);
    if (r.rev1) cx += xp.revision;
    if (r.rev2) cx += xp.revision;
    if (r.questions === 'Yes') cx += xp.questions; else if (r.questions === 'Partly') cx += xp.questions / 2;
    // planned = the day it's scheduled now (a catch-up replan's date, if any); planDate = the original plan's day
    const planned = r.movedTo || c.planned;
    let flag = '';
    if (done) flag = 'done'; else if (planned < t) flag = 'overdue'; else if (planned === t) flag = 'today'; else if (diff(t, planned) <= 2) flag = 'soon';
    return Object.assign({}, c, r, {
      planned, planDate: c.planned, moved: !!r.movedTo && r.movedTo !== c.planned,
      xp: cx, flag,
      doneAt: done ? (ov.doneAt || (planned <= t ? planned : t)) : null,
      rev1At: r.rev1 ? (ov.rev1At || t) : null,
      rev2At: r.rev2 ? (ov.rev2At || t) : null
    });
  });

  // each full paper's target = its paper's score for the next checkpoint (17 Nov, 6 Dec, 12 Dec, 19 Dec)
  const cps = Array.isArray(st.checkpoints) ? st.checkpoints : [];
  const cpIndex = (date) => { let k = cps.findIndex((d) => date <= d); return k < 0 ? cps.length - 1 : k; };
  const targetFor = (subject, date) => {
    const pts = st.paperTargets && st.paperTargets[subject];
    if (!pts || !cps.length) return +st.targetLine || 0.55;
    return (+pts[Math.min(cpIndex(date), pts.length - 1)] || 55) / 100;
  };
  const mocks = D.mocks.map((m) => {
    const r = store.mockRec(m), ov = store.S.mocks[m.id] || {};
    const date = r.movedTo || m.date, max = +m.max || 100;
    const target = targetFor(m.subject, date);
    const score = r.marks != null ? r.marks / max : null;
    const result = score == null ? null : score >= target ? 'defeated' : score >= st.passLine ? 'survived' : 'wiped';
    const status = r.marks != null ? 'taken' : r.skipped === 'Yes' ? 'skipped' : date === t ? 'today' : date < t ? 'missed' : 'upcoming';
    const mx = score == null ? 0 : xp.bossTaken + Math.round(score * 100) + (score >= target ? xp.bossDefeated : 0);
    return Object.assign({}, m, r, { date, planDate: m.date, moved: !!r.movedTo, photos: Array.isArray(r.photos) ? r.photos : [], max, score, target, result, status, xp: mx, bossName: String(m.boss).replace(/\s*·\s*Lv\s*\d+/, ''), takenAt: r.marks != null ? (ov.takenAt || (date <= t ? date : t)) : null });
  });
  mocks.forEach((m) => {
    if (!m.moved) return;
    const from = dayByDate[m.planDate], to = dayByDate[m.date];
    if (from) { from.movedOut = m; from.boss = mocks.some((x) => x !== m && x.date === from.date); }
    if (to) { to.movedIn = m; to.boss = true; }
  });
  // no-zero streak: days in a row with at least the minimum hours (to today, or to yesterday while today is open)
  let noZero = 0, noZeroBest = 0, run0 = 0;
  days.filter((d) => d.date >= J0 && d.date <= t).forEach((d) => { run0 = d.minMet ? run0 + 1 : 0; noZeroBest = Math.max(noZeroBest, run0); });
  for (let k = days.length - 1; k >= 0; k--) { const d = days[k]; if (d.date > t || d.date < J0) continue; if (d.minMet) noZero++; else if (d.date === t) continue; else break; }

  const extraRuns = Object.keys(store.S.runs).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !store.RUN_BY[d]).map((d) => ({ date: d, session: 'Extra', workout: 'Run logged outside the plan' }));
  const runs = D.runs.concat(extraRuns).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((rp) => {
    const r = store.runRec(rp);
    const week = Math.floor(diff(runMon, rp.date) / 7) + 1, target = targetSec(week);
    const total = (r.km != null && r.min != null) ? r.min * 60 + (+r.sec || 0) : null;
    const pace = total != null && r.km > 0 ? total / r.km : null;
    const equiv = pace == null ? null : (Math.abs(r.km - 2) < 0.05 ? total : total * Math.pow(2 / r.km, 1.06));
    const isTT = rp.session === 'Time Trial';
    const vs = equiv == null ? (rp.date < t ? 'missed' : '') : isTT ? (equiv <= target ? 'beat' : 'slower') : 'logged';
    const rx = r.km == null ? 0 : xp.run + (isTT && equiv > 0 && equiv <= target ? xp.ttBeat : 0);
    return Object.assign({}, rp, r, { week, target, targetPace: Math.round(target / 2), total, pace, equiv, isTT, vs, tt: isTT && equiv != null ? equiv / 60 : null, xp: rx });
  });

  // 5 km in 30:00 (5K plan 24 Oct – 30 Nov 2026). Credit = share of 5 km covered × share of 6:00 /km held; walk breaks don't count
  const R5 = { km: 5, sec: 1800, start: '2026-10-24', race: '2026-11-28', last: '2026-11-30' };
  const credit5 = (r) => (r.total == null || !(r.km > 0) || r.walked === 'Yes' ? 0 : r.km >= 4.95 && r.total <= R5.sec ? 1 : Math.min(1, r.km / R5.km) * Math.min(1, R5.sec / R5.km / r.pace));
  const done5 = runs.filter((r) => r.total != null && r.km > 0 && r.walked !== 'Yes');
  const best5 = done5.reduce((b, r) => (!b || credit5(r) > credit5(b) ? r : b), null);
  const longest5 = done5.reduce((b, r) => (!b || r.km > b.km ? r : b), null);
  const pred5Of = (r) => r.total * Math.pow(R5.km / r.km, 1.06);
  const pred5 = done5.filter((r) => r.km >= 2).reduce((b, r) => (b == null || pred5Of(r) < b ? pred5Of(r) : b), null);
  const plan5 = runs.filter((r) => r.session !== 'Extra' && r.date >= R5.start && r.date <= R5.last);
  const extras5 = runs.filter((r) => r.session === 'Extra' && r.date >= R5.start && r.date <= R5.last);

  const xpTotal = sum(days, (d) => d.xp) + sum(chapters, (c) => c.xp) + sum(mocks, (m) => m.xp) + sum(runs, (r) => r.xp);
  const level = Math.floor(Math.sqrt(xpTotal / K)) + 1;
  const lvStart = K * (level - 1) * (level - 1), lvNext = K * level * level;
  const ranks = (D.ranks || []).slice().sort((a, b) => a.level - b.level);
  let rank = ranks[0], nextRank = null;
  ranks.forEach((r) => { if (r.level <= level) rank = r; });
  for (const r of ranks) if (r.level > level) { nextRank = r; break; }
  const hoursTarget = sum(days.filter((d) => d.date <= t), (d) => d.target);
  const hoursLogged = sum(days, (d) => +d.rec.hrs || 0);
  const done = chapters.filter((c) => c.status === 'done').length;
  const taken = mocks.filter((m) => m.score != null);
  const avgScore = taken.length ? sum(taken, (m) => m.score) / taken.length : null;
  const ttTimes = runs.filter((r) => r.tt != null).map((r) => r.tt);
  const bestTT = ttTimes.length ? Math.min(...ttTimes) : null;
  const runProgress = bestTT == null ? 0 : clamp01((st.runCurrent - bestTT) / (st.runCurrent - st.runGoal));
  const workoutDays = days.filter((d) => d.date <= t && !d.isRest).length;
  const workoutsDone = days.filter((d) => d.rec.workoutDone === 'Yes').length;
  const parts = {
    syll: done / chapters.length,
    hours: hoursTarget ? Math.min(1, hoursLogged / hoursTarget) : 0,
    boss: avgScore == null ? 0 : Math.min(1, avgScore / st.targetLine),
    fit: (Math.min(1, workoutDays ? workoutsDone / workoutDays : 0) + runProgress) / 2
  };
  const power = 0.4 * parts.syll + 0.3 * parts.hours + 0.2 * parts.boss + 0.1 * parts.fit;
  const powerLabel = power >= 0.8 ? 'Legendary form' : power >= 0.6 ? 'Beast mode' : power >= 0.35 ? 'Powering up' : power > 0 ? 'Warming up' : 'Press start';
  const dT = dayByDate[t], dY = dayByDate[addDays(t, -1)];
  const streak = Math.max(dT ? dT.streak : 0, dY ? dY.streak : 0);
  const bestStreak = Math.max(0, ...days.map((d) => d.streak));
  const loggedDays = days.filter((d) => d.logged);
  const avgNow = loggedDays.length ? hoursLogged / loggedDays.length : 0;
  const augLogged = D.aug.filter((a) => a.actual != null);
  const avgAug = augLogged.length ? sum(augLogged, (a) => a.actual) / augLogged.length : 0;
  const stepDays = days.filter((d) => (+d.rec.steps || 0) > 0);
  const behind = chapters.filter((c) => c.planDate < t).length - done;   // against the original plan, even after a replan

  const worlds = WORLDS.map((w) => {
    const ch = chapters.filter((c) => c.subject === w.key);
    const dn = ch.filter((c) => c.status === 'done').length;
    const overdue = ch.filter((c) => c.flag === 'overdue').length;
    const ms = mocks.filter((m) => m.subject === w.key), tk = ms.filter((m) => m.score != null);
    const planned = ch.map((c) => c.planned).sort();
    const winStart = planned[0], winEnd = planned[planned.length - 1];
    const pctDone = ch.length ? dn / ch.length : 0;
    let status;
    if (pctDone >= 1) status = { cls: 'good', t: 'Completed' };
    else if (t < winStart) status = { cls: 'muted', t: 'Starts ' + fmtDS(winStart) };
    else if (overdue > 0) status = { cls: 'bad', t: overdue + ' overdue' };
    else status = { cls: 'info', t: 'In progress' };
    const lastTaken = sortBy(tk, (m) => m.date).pop() || null;
    return Object.assign({}, w, {
      chapters: ch.length, done: dn, pct: pctDone, overdue,
      hrsLeft: sum(ch.filter((c) => c.status !== 'done'), (c) => +c.hrs || 0),
      mocksPlanned: ms.length, mocksTaken: tk.length,
      avg: tk.length ? sum(tk, (m) => m.score) / tk.length : null,
      best: tk.length ? Math.max(...tk.map((m) => m.score)) : null, last: lastTaken,
      nextTarget: targetFor(w.key, t), passLine: st.passLine,
      winStart, winEnd, xp: sum(ch, (c) => c.xp) + sum(ms, (m) => m.xp),
      defeated: ms.filter((m) => m.result === 'defeated').length,
      highPending: ch.filter((c) => c.priority === 'HIGH' && c.status !== 'done').length,
      sepDone: ch.filter((c) => c.sep === '✅ Done').length,
      rev1: ch.filter((c) => c.rev1).length, rev2: ch.filter((c) => c.rev2).length,
      status, upNext: ch.filter((c) => c.status !== 'done').slice(0, 3),
      nextBoss: sortBy(ms.filter((m) => m.date >= t && m.status !== 'skipped'), (m) => m.date)[0] || null, fights: ms
    });
  });

  // ---------- pass outlook: each paper's likely exam score from its full papers, against ICAI's rules ----------
  // Pass a group: 40 in every paper and 50% aggregate (150 of 300). A paper with 60+ is exempted if its group isn't cleared.
  // Likely score = recent form (the last 3 papers, newest counts most) + half the trend until that paper's exam day,
  // capped at ±10. The range is the spread of recent scores (5–15 marks), wider while there are few papers.
  const outlookFor = (w) => {
    const pts = sortBy(mocks.filter((m) => m.subject === w.key && m.score != null), (m) => m.date).map((m) => ({ date: m.date, v: m.score * 100 }));
    const examDay = EXAM_DAY[w.paper], n = pts.length;
    if (!n) return Object.assign({}, w, { n: 0, examDay, status: 'none', need: null });
    const rec = pts.slice(-3), base = rec.reduce((a, p, i) => a + p.v * (i + 1), 0) / rec.reduce((a, p, i) => a + i + 1, 0);
    let gain = 0;
    if (n >= 3) {
      const xs = pts.map((p) => diff(pts[0].date, p.date)), mx = sum(xs) / n, my = sum(pts, (p) => p.v) / n;
      const sxx = sum(xs, (x) => (x - mx) * (x - mx)), slope = sxx ? xs.reduce((a, x, i) => a + (x - mx) * (pts[i].v - my), 0) / sxx : 0;
      gain = clamp(slope * diff(pts[n - 1].date, examDay) * 0.5, -10, 10);
    }
    const last5 = pts.slice(-5), m5 = sum(last5, (p) => p.v) / last5.length;
    const sd = last5.length > 1 ? Math.sqrt(sum(last5, (p) => (p.v - m5) * (p.v - m5)) / (last5.length - 1)) : 0;
    const band = n === 1 ? 12 : clamp(sd, 5, 15) + (n < 3 ? 4 : 0);
    const likely = Math.round(clamp(base + gain, 0, 100)), low = Math.round(clamp(likely - band, 0, 100)), high = Math.round(clamp(likely + band, 0, 100));
    const status = likely >= 60 && low >= 40 ? 'strong' : low >= 40 ? 'safe' : likely >= 40 ? 'risk' : 'below';
    return Object.assign({}, w, { n, examDay, likely, low, high, gain: Math.round(gain), last: Math.round(pts[n - 1].v), status, need: Math.max(0, 40 - low) });
  };
  const olPapers = WORLDS.map(outlookFor);
  const olGroups = [['G1', 'Group I'], ['G2', 'Group II']].map(([id, name]) => {
    const ps = olPapers.filter((p) => p.grp === id), known = ps.filter((p) => p.n);
    const sumLikely = sum(known, (p) => p.likely), sumLow = sum(known, (p) => p.low);
    const verdict = known.length < ps.length ? 'incomplete'
      : ps.every((p) => p.low >= 40) && sumLow >= 150 ? 'pass'
        : ps.every((p) => p.likely >= 40) && sumLikely >= 150 ? 'borderline' : 'notyet';
    return { id, name, papers: ps, known: known.length, sumLikely, sumLow, needAgg: known.length === ps.length ? Math.max(0, 150 - sumLikely) : null, verdict, dates: ps.map((p) => p.examDay) };
  });
  // the paper that most threatens a pass: furthest below 40 on a bad day; failing that, the lowest in a group short on aggregate
  const olKnown = olPapers.filter((p) => p.n);
  let weakest = sortBy(olKnown.filter((p) => p.low < 40), (p) => p.low)[0] || null;
  if (!weakest) { const g = olGroups.find((x) => x.needAgg > 0); if (g) weakest = sortBy(g.papers, (p) => p.likely)[0]; }
  const outlook = { papers: olPapers, groups: olGroups, weakest, taken: olKnown.length };

  const nWeeks = Math.floor(diff(ws, LAST) / 7) + 1;
  const weeks = [];
  for (let w = 1; w <= nWeeks; w++) {
    const start = addDays(ws, 7 * (w - 1)), end = addDays(start, 6);
    const dd = days.filter((d) => d.week === w);
    const inWeek = (x) => x.date >= start && x.date <= end;
    const sd = dd.filter((d) => (+d.rec.steps || 0) > 0);
    const tts = runs.filter((r) => r.week === w && r.tt != null).map((r) => r.tt);
    weeks.push({
      n: w, start, end, days: dd,
      target: sum(dd, (d) => d.target), hrs: sum(dd, (d) => +d.rec.hrs || 0),
      pages: sum(dd, (d) => +d.rec.pages || 0), pagesT: dd.length * (+st.pages || 0),
      steps: sd.length ? sum(sd, (d) => +d.rec.steps) / sd.length : null,
      runTarget: targetSec(w) / 60, bestTT: tts.length ? Math.min(...tts) : null,
      xp: sum(dd, (d) => d.xp) + sum(mocks.filter(inWeek), (m) => m.xp) + sum(runs.filter(inWeek), (r) => r.xp)
    });
  }

  const pagesTotal = sum(days, (d) => +d.rec.pages || 0);
  const pushTotal = sum(days, (d) => +d.rec.pushups || 0);
  const defeated = mocks.filter((m) => m.result === 'defeated').length;
  const badgeOn = [done >= 1, bestStreak >= 7, bestStreak >= 21, hoursLogged >= 100, hoursLogged >= 500,
    worlds.some((w) => w.pct >= 1), done >= chapters.length, taken.length >= 1, defeated >= 1, defeated >= 6,
    pagesTotal >= 500, pushTotal >= 5000, bestTT != null && bestTT < 14, bestTT != null && bestTT < 12,
    bestTT != null && bestTT <= st.runGoal, level >= 25];
  const badges = (D.badges || []).map((b, i) => Object.assign({}, b, { on: !!badgeOn[i] }));

  let act;
  const ph1 = (phases[0] && phases[0].to) || '2026-10-07', ph2 = (phases[1] && phases[1].to) || '2026-10-22';
  if (t < FIRST) act = 'The comeback starts in ' + plural(diff(t, FIRST), 'day');
  else if (t <= ph1) act = 'Old plan · Accounts + Law';
  else if (t <= ph2) act = 'Old plan · ' + (t <= '2026-10-19' ? 'Tax + Audit' : 'Costing + FM & SM');
  else if (t < '2026-10-26') act = 'Journey · baseline papers + set-up';
  else if (t <= st.syllabusDeadline) act = 'Phase 1 · Group II gaps + R1 · 2 full papers a week';
  else if (t < '2026-12-07') act = 'Phase 2 · R2 + 3 full papers a week';
  else if (t <= (st.finishLine || '2026-12-20')) act = 'Phase 3 · a full paper every day + R3';
  else if (t <= J1) act = 'Fix-it days · every lost mark';
  else if (t < '2027-01-02') act = 'Final look · one-page sheets';
  else if (t <= LAST) act = 'Exam window · one paper at a time';
  else act = 'Season complete';
  const qs = D.quotes || [];
  const quote = qs.length ? qs[((diff('2026-01-01', t) % qs.length) + qs.length) % qs.length] : '';
  const lastRunOnOrBefore = runs.filter((r) => r.date <= t).pop();
  const nextFight = sortBy(mocks.filter((m) => m.date >= t && m.marks == null && m.status !== 'skipped'), (m) => m.date)[0] || null;

  return {
    st, t, FIRST, LAST, days, dayByDate, chapters, mocks, runs, worlds, outlook, weeks, badges, ranks, hrsFor, targetSec, targetFor, cpIndex, runMon, runWeeks, phases,
    xp: xpTotal, level, lvStart, lvNext, lvProg: clamp01((xpTotal - lvStart) / (lvNext - lvStart)), rank, nextRank,
    hoursTarget, hoursLogged, done, behind, onPace: behind <= 0,
    power, parts, powerLabel, streak, bestStreak, avgNow, avgAug, mult: avgNow && avgAug ? avgNow / avgAug : 0,
    pagesTotal, pushTotal, avgSteps: stepDays.length ? sum(stepDays, (d) => +d.rec.steps) / stepDays.length : null,
    workoutsDone, mealsDays: days.filter((d) => d.rec.meals === 'Yes').length, badgeCount: badges.filter((b) => b.on).length,
    journey: { start: J0, end: J1, days: JN, finish: st.finishLine || J1, num: jNumOf(t), label: dayLabel, elapsed: clamp01(diff(J0, t) / JN) },
    noZero: { streak: noZero, best: noZeroBest, min: minHrs },
    todayDay: dayByDate[t] || null, pushToday: (dayByDate[t] || days[0]).pushT,
    boss: { fought: taken.length, avg: avgScore, best: taken.length ? Math.max(...taken.map((m) => m.score)) : null, defeated, wiped: taken.filter((m) => m.score < st.passLine).length, next: nextFight },
    run: { best: bestTT, progress: runProgress, weekTarget: lastRunOnOrBefore ? lastRunOnOrBefore.target : runs[0].target, logged: runs.filter((r) => r.km != null).length, totalKm: sum(runs, (r) => +r.km || 0), next: runs.filter((r) => r.date >= t)[0] || null },
    run5k: { R: R5, credit: credit5, pred5Of, best: best5, progress: best5 ? credit5(best5) : 0, longest: longest5, pred: pred5, plan: plan5, extras: extras5, next: plan5.filter((r) => r.date >= t)[0] || null,
      logged: plan5.filter((r) => r.km != null).length, kmPlan: sum(plan5.concat(extras5), (r) => +r.km || 0), achieved: done5.some((r) => r.km >= 4.95 && r.total <= R5.sec) },
    act, quote
  };
}

// =====================================================================================
// PART 2 - dashboard analytics
// =====================================================================================
export const linearExp = (date, d0, d1, s0, T) => {
  if (!d0 || !d1) return null;
  const total = diff(d0, d1) + 1;
  return s0 + (T - s0) * clamp01(diff(d0, date) / Math.max(1, total));
};
function evaluate(o, t) {
  if (!o.hasData || o.actual == null) return { status: 'nodata', gap: null, tol: null, daysLeft: o.deadline ? diff(t, o.deadline) : null };
  const T = o.target != null ? o.target : 100, s0 = o.startValue || 0;
  const total = o.start && o.deadline ? diff(o.start, o.deadline) + 1 : 100;
  const tol = Math.max(3, Math.abs(T - s0) / Math.max(1, total));
  const gap = o.expected == null ? 0 : o.actual - o.expected;
  let status;
  if (o.done || o.actual >= T - 1e-9) status = 'done';
  else if (o.start && t < o.start) status = 'upcoming';
  else if (o.deadline && t > o.deadline) status = 'overdue';
  else if (gap >= tol) status = 'ahead';
  else if (gap <= -tol) status = 'behind';
  else status = 'ontrack';
  return { status, gap, tol, daysLeft: o.deadline ? diff(t, o.deadline) : null };
}

// the comeback timetable (from 23 Oct): speed drill 8:50 · Block A 9:00 · Block B 11:45 · reading 1:45 · Block C 2–5 PM ·
// workout 5:15 · Block D marking 6:15 · error book 8:30. Morning-run days start with the run and Block A at 9:15.
function timetable(M, date) {
  const d = M.dayByDate[date];
  if (!d) return [];
  const first = (s) => String(s || '').split('\n')[0].replace(/^•\s*/, '').replace(/\s*\(\d+(\.\d+)?h\)\s*$/, '');
  const B = (start, dur, title, kind, label) => ({ start, dur, end: timeToMin(start) + dur, from: timeToMin(start), title, kind, label });
  const out = [], main = first(d.main), morningRun = /8:00 AM run first/.test(d.main || ''), buffer = /Buffer/.test(d.type);
  const mk = d.movedIn || (d.boss ? M.mocks.find((x) => x.date === date) : null);
  if (/Exam/.test(d.type)) {
    out.push(B('09:00', 120, 'One-page sheets only, nothing new', 'revision', 'Sheets'), B('13:30', 15, 'Report at the centre with your admit card', 'other', 'Report'), B('14:00', 180, main, 'mock', 'Exam'));
    if (!/Rest\.$/.test(d.rev || '')) out.push(B('18:30', 150, first(d.rev), 'revision', 'Next paper'));
    return out;
  }
  if (date < (M.st.comebackStart || '2026-10-23')) {
    // the old plan had no fixed blocks: main quest, side quest, revision dose
    out.push(B('07:00', Math.round((parseHours(d.main) || 4) * 60), first(d.main), 'study', 'Main'));
    out.push(B('13:00', Math.round((parseHours(d.side) || 2) * 60), first(d.side), 'study', 'Side'));
    if (!d.isRest) out.push(B('17:15', 45, d.workout, 'workout', 'Workout'));
    out.push(B('20:30', 30, first(d.rev), 'revision', 'Revise'));
    return out;
  }
  if (/^Gap day/.test(main)) return [B('09:00', 180, main, 'revision', 'Revise'), B('14:00', 90, 'One timed 50-mark set', 'mock', 'Timed set'), B('16:00', 180, first(d.side), 'revision', 'Revise')];
  out.push(morningRun ? B('08:00', 45, d.workout, 'workout', 'Run') : B('08:50', 10, 'Speed drill: copy one ICAI answer at full speed', 'other', 'Drill'));
  const rp = d.ramp, lite = !!rp && +rp.hrs < 6, rampPaper = !!rp && d.boss;
  out.push(B(morningRun ? '09:15' : '09:00', rampPaper && lite ? 60 : morningRun ? 135 : 150, main, 'study', 'Block A'));
  if (!rampPaper && d.side && !/^(Afternoon off|Rest of the day)/.test(d.side)) out.push(B('11:45', 90, first(d.side), 'study', 'Block B'));
  if (d.boss) out.push(B('13:45', 15, 'Reading time', 'other', 'Read'), B('14:00', 180, 'Full paper · ' + (mk ? 'P' + WMAP[mk.subject].paper + ' ' + mk.subject : 'mock'), 'mock', 'Paper'));
  else if (!buffer) out.push(B('13:45', 15, 'Reading time: decide the order of your sets', 'other', 'Read'), rp ? B('14:00', lite ? 45 : 90, lite ? 'One 25-mark timed question, handwritten' : 'One 50-mark timed set, handwritten', 'mock', 'Block C') : B('14:00', 180, /^R3/.test(main) ? first(d.rev) : 'Timed writing sets, handwritten (1.8 min per mark)', 'mock', 'Block C'));
  if (!morningRun && !d.isRest) out.push(B('17:15', 45, d.workout, 'workout', /Run/.test(d.workout) ? 'Run' : 'Gym'));
  if (!buffer || d.boss) out.push(B('18:15', !d.boss && lite ? 15 : 60, 'Mark against the ICAI answer, log lost marks', 'revision', 'Block D'));
  out.push(B('20:30', 20, 'Error-book review and plan tomorrow', 'other', 'Errors'));
  out.push(B('22:00', 10, 'Fill in the 10 PM log', 'log', '10 PM log'));
  return out;
}

function computeAll() {
  const S = store.S, st = store.settings(), t = todayStr();
  const M = computeGame(st, t);
  const { FIRST, LAST, days, dayByDate, chapters, mocks, runs } = M;
  Object.assign(M, { WORLDS, WMAP, GOAL_SOURCES, AREA_SOURCES, STATUS_TXT });
  M.evaluate = (o) => evaluate(o, t);

  // ---------- hours ----------
  const hoursOn = (date) => { const d = dayByDate[date]; return +((d ? d.rec : store.dayRec(date)).hrs) || 0; };
  M.hoursOn = hoursOn;
  const C0 = st.comebackStart || FIRST, planDays = days.filter((d) => d.date >= C0);
  const totalPlanHours = sum(planDays, (d) => d.target) || 1;
  const loggedDates = Object.keys(S.days).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && k >= C0).sort();
  const cumHoursAt = (date) => sum(loggedDates.filter((k) => k <= date), (k) => hoursOn(k));
  const cumTargetBefore = (date) => sum(planDays.filter((d) => d.date < date), (d) => d.target);
  M.plan = { totalHours: totalPlanHours, totalDays: days.length, revisionDays: days.filter((d) => /Revision/.test(d.type)).length, C0 };
  M.cumHoursAt = cumHoursAt;

  // ---------- cumulative metric functions (0..1 at the END of `date`) ----------
  const chapterDone = chapters.filter((c) => c.doneAt).map((c) => c.doneAt).sort();
  const revTicks = [].concat(chapters.filter((c) => c.rev1At).map((c) => c.rev1At), chapters.filter((c) => c.rev2At).map((c) => c.rev2At)).sort();
  const mockTaken = mocks.filter((m) => m.takenAt).map((m) => m.takenAt).sort();
  const countLE = (arr, date) => { let n = 0; for (const x of arr) if (x <= date) n++; return n; };
  const healthScore = (d) => { if (d.date > t) return 0; const q = d.quests; return ((q[3][2] ? 1 : 0) + (q[4][2] ? 1 : 0) + (q[5][2] ? 1 : 0) + (q[6][2] ? 1 : 0)) / 4; };
  const ttByDate = runs.filter((r) => r.tt != null).map((r) => [r.date, r.tt]);
  const bestTTat = (date) => { let b = null; ttByDate.forEach((x) => { if (x[0] <= date && (b == null || x[1] < b)) b = x[1]; }); return b; };
  const runSpan = (+st.runCurrent - +st.runGoal) || 1;
  const F = {
    syllabus: (date) => countLE(chapterDone, date) / chapters.length,
    revision: (date) => countLE(revTicks, date) / (chapters.length * 2),
    mocks: (date) => countLE(mockTaken, date) / mocks.length,
    hours: (date) => cumHoursAt(date) / totalPlanHours,
    health: (date) => sum(days.filter((d) => d.date <= date), healthScore) / days.length,
    run: (date) => { const b = bestTTat(date); return b == null ? 0 : clamp01((+st.runCurrent - b) / runSpan); },
    run5k: (date) => { let b = 0; runs.forEach((r) => { if (r.date <= date) b = Math.max(b, M.run5k.credit(r)); }); return b; }
  };
  F.readiness = (date) => (F.syllabus(date) + F.revision(date) + F.mocks(date) + F.hours(date)) / 4;
  M.chaptersDoneBy = (date) => countLE(chapterDone, date);
  const runWeekOf = (date) => clamp(Math.floor(diff(M.runMon, date) / 7) + 1, 1, M.runWeeks);
  const firstMock = mocks[0].date, lastMock = mocks[mocks.length - 1].date;
  const EXP = {
    syllabus: (date) => linearExp(date, C0, st.syllabusDeadline, 0, 100),
    revision: (date) => linearExp(date, st.revisionStart || '2026-11-01', st.revisionEnd || st.yearEnd, 0, 100),
    mocks: (date) => linearExp(date, firstMock, lastMock, 0, 100),
    hours: (date) => 100 * cumTargetBefore(date) / totalPlanHours,
    health: (date) => linearExp(date, C0, LAST, 0, 100),
    run: (date) => (date < (st.runStart || FIRST) ? 0 : 100 * clamp01((+st.runCurrent - M.targetSec(runWeekOf(date)) / 60) / runSpan)),
    run5k: (date) => linearExp(date, M.run5k.R.start, M.run5k.R.race, 40, 100)
  };
  EXP.readiness = (date) => (EXP.syllabus(date) + EXP.revision(date) + EXP.mocks(date) + EXP.hours(date)) / 4;
  M.F = F; M.EXP = EXP;
  const PLAN_MODEL = { hours: true, run: true, run5k: true, readiness: true };
  M.readiness = { value: 100 * F.readiness(t), expected: EXP.readiness(t), yesterday: 100 * F.readiness(addDays(t, -1)) };
  // Paper 1 starts at settings.examTime (2 PM) on settings.examDate
  const tm = /^\d{1,2}:\d{2}$/.test(st.examTime || '') ? st.examTime.split(':') : ['14', '00'];
  M.examAt = new Date(st.examDate + 'T00:00'); M.examAt.setHours(+tm[0], +tm[1], 0, 0);
  // whole days left on the clock (69 days 23 h reads as 69, like the live countdown)
  M.daysToExam = () => Math.max(0, Math.floor((M.examAt - now()) / 864e5));

  // ---------- KPIs ----------
  const td = dayByDate[t];
  const todayHrs = hoursOn(t), yHrs = hoursOn(addDays(t, -1));
  const wStart = mondayOf(t), off = diff(wStart, t);
  let wHrs = 0, wTarget = 0, lwSame = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(wStart, i);
    wHrs += hoursOn(d);
    if (dayByDate[d]) wTarget += dayByDate[d].target;
    if (i <= off) lwSame += hoursOn(addDays(d, -7));
  }
  const doneThisWeek = chapters.filter((c) => c.doneAt && c.doneAt >= addDays(t, -6) && c.doneAt <= t).length;
  const streakSteps = [7, 21, 30, 60, 98];
  const nextStreak = streakSteps.find((n) => n > M.streak) || Math.max(M.streak, 98);
  M.kpi = {
    study: { hrs: todayHrs, target: td ? td.target : 0, pct: td && td.target ? todayHrs / td.target : null, delta: todayHrs - yHrs },
    week: { hrs: wHrs, target: wTarget, pct: wTarget ? wHrs / wTarget : null, start: wStart, end: addDays(wStart, 6), delta: wHrs - lwSame },
    days: { exam: Math.max(0, diff(t, st.examDate)), syllabus: diff(t, st.syllabusDeadline), elapsed: clamp01(diff(st.planStart, t) / Math.max(1, diff(st.planStart, st.examDate))) },
    syllabus: { done: M.done, total: chapters.length, pct: M.done / chapters.length, week: doneThisWeek },
    streak: { cur: M.streak, best: M.bestStreak, next: nextStreak, pct: clamp01(M.streak / nextStreak) }
  };

  // ---------- life areas ----------
  const progressRecs = store.list('progress');
  const valueAt = (pts, date) => { let v = null; for (const p of pts) { if (p.date <= date) v = p.value; else break; } return v; };
  const areas = sortBy(store.list('lifeAreas'), (a) => a.slot || 99).map((a) => {
    const src = a.source || 'manual', key = src.replace('auto:', '');
    const manual = sortBy(progressRecs.filter((p) => p.areaId === a.id && p.date <= t), (p) => p.date);
    let points = [];
    if (src === 'manual') points = manual.map((p) => ({ date: p.date, value: clamp(+p.value || 0, 0, 100), note: p.note || '', id: p.id }));
    else if (F[key]) { const from = a.startDate || st.planStart || FIRST; for (let d = from; d <= t; d = addDays(d, 1)) points.push({ date: d, value: 100 * F[key](d), auto: true }); }
    const hasData = points.length > 0, latest = hasData ? points[points.length - 1] : null;
    const start = a.startDate || (manual[0] && manual[0].date) || st.planStart;
    const s0 = a.startValue != null && a.startValue !== '' ? +a.startValue : (src === 'manual' && manual[0] ? +manual[0].value : 0);
    const deadline = a.deadline || st.yearEnd, T = a.target != null && a.target !== '' ? +a.target : 100;
    const planPaced = src === 'auto:run' || src === 'auto:run5k';
    const expFn = (date) => (src === 'auto:run5k' ? EXP.run5k(date) : planPaced ? EXP.run(date) : linearExp(date, start, deadline, s0, T));
    const expected = hasData ? expFn(t) : null;
    const ev = evaluate({ hasData, actual: latest ? latest.value : null, expected, start, deadline, target: T, startValue: s0 }, t);
    return { id: a.id, area: a, name: a.name, slot: a.slot, color: 'var(--area-' + a.slot + ')', source: src, sourceLabel: AREA_SOURCES[src] || src, hidden: !!a.hidden, points, hasData, latest, expected, expFn, start, deadline, startValue: s0, target: T, status: ev.status, gap: ev.gap, valueAt: (date) => valueAt(points, date) };
  });
  M.areas = areas;
  M.areaById = {}; areas.forEach((a) => { M.areaById[a.id] = a; });

  // ---------- goals ----------
  const tasks = store.list('tasks');
  M.goals = sortBy(store.list('goals'), (g) => [g.status === 'done' ? 1 : 0, String(g.order || 99).padStart(4, '0'), g.deadline || '9999', g.createdAt || ''].join('|')).map((g) => {
    const src = g.source || 'manual';
    let actual = null, expected = null, model = 'linear', hasData = true, detail = '';
    const start = g.startDate || st.planStart, deadline = g.deadline || st.yearEnd;
    if (src === 'manual') actual = +g.progress || 0;
    else if (src === 'tasks') { const linked = tasks.filter((x) => x.goalId === g.id); actual = linked.length ? 100 * linked.filter((x) => x.done).length / linked.length : 0; detail = linked.filter((x) => x.done).length + ' / ' + linked.length + ' tasks'; hasData = linked.length > 0; }
    else if (/^lifeArea:/.test(src)) { const a = M.areaById[src.slice(9)]; if (a && a.hasData) { actual = a.latest.value; expected = a.expected; model = 'area'; } else hasData = false; }
    else if (F[src]) {
      actual = 100 * F[src](t);
      if (PLAN_MODEL[src]) { expected = EXP[src](t); model = 'plan'; }
      if (src === 'syllabus') detail = M.done + ' / ' + chapters.length + ' chapters';
      if (src === 'hours') detail = fmt1(cumHoursAt(t)) + ' / ' + fmtN(totalPlanHours) + ' h since ' + fmtDS(C0);
      if (src === 'revision') detail = (chapters.filter((c) => c.rev1).length + chapters.filter((c) => c.rev2).length) + ' / ' + chapters.length * 2 + ' revisions';
      if (src === 'mocks') detail = M.boss.fought + ' / ' + mocks.length + ' mocks';
      if (src === 'run') detail = M.run.best == null ? 'No time trial yet' : 'Best ' + mmss(M.run.best * 60) + ' → goal ' + mmss(st.runGoal * 60);
      if (src === 'run5k') detail = M.run5k.achieved ? '5 km in 30:00 done' : M.run5k.best ? 'Best ' + fmt1(M.run5k.best.km) + ' km at ' + mmss(M.run5k.best.pace) + ' /km' : 'No run logged yet';
    } else actual = +g.progress || 0;
    if (expected == null && model === 'linear') expected = linearExp(t, start, deadline, 0, 100);
    const ev = evaluate({ hasData, actual, expected, start, deadline, done: g.status === 'done' }, t);
    const status = g.status === 'done' ? 'done' : g.status === 'paused' ? 'paused' : ev.status;
    const risk = status === 'overdue' ? 'high' : status === 'behind' ? ((ev.gap <= -10 || (ev.daysLeft != null && ev.daysLeft <= 14)) ? 'high' : 'medium') : 'low';
    return { id: g.id, goal: g, title: g.title, category: g.category || 'Personal', icon: CAT_ICON[g.category] || 'sparkles', source: src, sourceLabel: GOAL_SOURCES[src] || (/^lifeArea:/.test(src) ? 'Life area · ' + ((M.areaById[src.slice(9)] || {}).name || '?') : src), progress: actual == null ? 0 : clamp(actual, 0, 100), hasData, expected, model, start, deadline, status, gap: ev.gap, daysLeft: ev.daysLeft, risk, detail };
  });
  M.goalCats = GOAL_CATS.filter((c) => M.goals.some((g) => g.category === c));
  Object.assign(M, { GOAL_CATS, CAT_ICON, STATUS_TONE });

  // ---------- progress categories (life areas + revision + mocks) ----------
  const cat = (key, label, color, actual, expected, start, deadline, href) => { const ev = evaluate({ hasData: true, actual, expected, start, deadline }, t); return { key, label, color, value: actual, expected, hasData: true, status: ev.status, gap: ev.gap, href }; };
  const categories = [];
  areas.filter((a) => !a.hidden).forEach((a) => {
    categories.push({ key: a.id, label: a.name, color: a.color, value: a.latest ? a.latest.value : null, expected: a.expected, hasData: a.hasData, status: a.status, gap: a.gap });
    if (a.id === 'la_study') {
      categories.push(cat('revision', 'Revision', 'var(--area-3)', 100 * F.revision(t), EXP.revision(t), st.revisionStart || '2026-11-18', st.revisionEnd || st.yearEnd, '#/revision'));
      categories.push(cat('mocks', 'Mock tests', 'var(--area-5)', 100 * F.mocks(t), EXP.mocks(t), firstMock, lastMock, '#/mocks'));
    }
  });
  const withData = categories.filter((c) => c.hasData && c.value != null);
  M.categories = categories;
  M.overall = withData.length ? sum(withData, (c) => c.value) / withData.length : null;
  M.overallExpected = withData.length ? sum(withData, (c) => (c.expected == null ? c.value : c.expected)) / withData.length : null;

  // ---------- habits ----------
  const hidden = st.habitsHidden || [];
  const QMAP = { h_quest: 0, h_study: 1, h_pages: 2, h_workout: 3, h_push: 4, h_steps: 5, h_meals: 6, h_log: 7 };
  const builtin = [
    { id: 'h_study', name: 'Study target', icon: 'book', kind: 'num', field: 'hrs', desc: 'Log at least the day’s target hours' },
    { id: 'h_quest', name: 'Main + side quest', icon: 'target', kind: 'status', desc: 'Day marked Done' },
    { id: 'h_pages', name: 'Read ' + st.pages + ' pages', icon: 'reading', kind: 'num', field: 'pages', desc: 'Pages read ≥ ' + st.pages },
    { id: 'h_workout', name: 'Workout', icon: 'dumbbell', kind: 'yes', field: 'workoutDone', desc: 'Planned workout done (rest days count once logged)' },
    { id: 'h_push', name: 'Push-ups', icon: 'strength', kind: 'num', field: 'pushups', desc: 'Today’s push-up target' },
    { id: 'h_steps', name: fmtN(st.steps) + ' steps', icon: 'steps', kind: 'num', field: 'steps', desc: 'Steps ≥ ' + fmtN(st.steps) },
    { id: 'h_meals', name: 'Meals on track', icon: 'meals', kind: 'yes', field: 'meals', desc: 'Ate to plan' },
    { id: 'h_log', name: 'Log at 10 PM', icon: 'clock', kind: 'log', field: 'hrs', desc: 'Hours logged for the day' }
  ].map((h) => Object.assign(h, { builtin: true, hidden: hidden.indexOf(h.id) >= 0 }));
  const custom = sortBy(store.list('habits').filter((h) => !h.archived), (h) => h.createdAt || '').map((h) => ({ id: h.id, name: h.name, icon: h.icon || 'checkCircle', kind: 'custom', builtin: false, hidden: false, since: (h.createdAt || t).slice(0, 10), rec: h }));
  const habits = builtin.concat(custom);
  const habitDone = (h, date) => {
    if (date > t) return null;
    if (h.builtin) { const d = dayByDate[date]; return d ? !!d.quests[QMAP[h.id]][2] : null; }
    if (date < h.since && !S.habitLogs[h.id + '|' + date]) return null;
    return !!S.habitLogs[h.id + '|' + date];
  };
  const habitStats = (h) => {
    let cur = 0, best = 0, run = 0, d7 = 0, n7 = 0, d30 = 0, n30 = 0;
    const startD = h.builtin ? FIRST : h.since;
    for (let d = startD; d <= t; d = addDays(d, 1)) {
      const v = habitDone(h, d);
      if (v == null) continue;
      run = v ? run + 1 : 0; if (run > best) best = run;
      const age = diff(d, t);
      if (age < 7) { n7++; if (v) d7++; }
      if (age < 30) { n30++; if (v) d30++; }
    }
    let d = t; if (habitDone(h, d) === false) d = addDays(d, -1);
    while (d >= startD) { const v = habitDone(h, d); if (v) { cur++; d = addDays(d, -1); } else break; }
    return { cur, best, pct7: n7 ? d7 / n7 : null, pct30: n30 ? d30 / n30 : null };
  };
  Object.assign(M, { habits, habitDone, habitStats });

  // ---------- Today's Focus (plan items + your tasks) ----------
  M.focusItems = (date) => {
    const d = dayByDate[date], items = [];
    if (d) {
      const chs = chapters.filter((c) => c.planned === date);
      chs.forEach((c) => items.push({ kind: 'chapter', key: 'ch-' + c.id, chapterId: c.id, title: c.name, cat: WMAP[c.subject].code + ' ' + WMAP[c.subject].short, color: WMAP[c.subject].c, priority: String(c.priority || '').toLowerCase(), est: Math.round((+c.hrs || 0) * 60), done: c.status === 'done', status: c.status }));
      if (!chs.length && !d.boss) {
        [['main', d.main], ['side', d.side]].forEach((x) => {
          if (!x[1]) return;
          const lines = String(x[1]).split('\n').map((s) => s.replace(/^•\s*/, '').trim()).filter(Boolean);
          const id = 'plan-' + x[0] + '-' + date;
          items.push({ kind: 'plan', key: id, taskId: id, title: lines[0].replace(/\s*\(\d+(\.\d+)?h\)\s*$/, ''), sub: lines.slice(1).join(' · '), cat: x[0] === 'main' ? 'Main quest' : 'Side quest', color: 'var(--ink-3)', est: (parseHours(x[1]) || 0) * 60 || null, done: !!(S.tasks[id] && S.tasks[id].done) });
        });
      }
      const mk = d.movedIn || (d.boss ? mocks.find((x) => x.date === date) : null);
      if (mk) items.push({ kind: 'mock', key: 'mock-' + mk.id, mockId: mk.id, title: 'Full paper · P' + WMAP[mk.subject].paper + ' ' + mk.subject, sub: mk.bossName + ' · ' + mk.duration, cat: 'Mock test', color: WMAP[mk.subject].c, est: 180, done: mk.marks != null });
      if (d.rev) { const id = 'plan-rev-' + date; items.push({ kind: 'plan', key: id, taskId: id, title: d.rev, cat: 'Revision', color: 'var(--ink-3)', est: parseHours(d.rev) ? parseHours(d.rev) * 60 : null, done: !!(S.tasks[id] && S.tasks[id].done) }); }
      if (!d.isRest) items.push({ kind: 'workout', key: 'wo-' + date, title: d.workout, cat: 'Workout', color: 'var(--ink-3)', est: null, done: d.rec.workoutDone === 'Yes' });
    }
    const own = sortBy(tasks.filter((x) => !x.plan && (x.date === date || (date === t && x.date && x.date < t && !x.done))), (x) => (x.done ? 1 : 0) + '|' + ({ high: 0, medium: 1, low: 2 }[x.priority] ?? 3) + '|' + (x.createdAt || ''));
    own.forEach((x) => items.push({ kind: 'task', key: 'tk-' + x.id, taskId: x.id, title: x.title, cat: x.category || 'Task', color: 'var(--ink-3)', priority: x.priority || '', est: +x.est || null, done: !!x.done, overdue: x.date < date && !x.done }));
    return items;
  };
  const todayItems = M.focusItems(t);
  M.focus = { items: todayItems, done: todayItems.filter((i) => i.done).length, total: todayItems.length };
  M.overdueCount = chapters.filter((c) => c.flag === 'overdue').length;
  M.timetable = (date) => timetable(M, date);

  // ---------- milestones ----------
  const tt1 = runs.find((r) => r.isTT);
  const hiddenMs = st.milestonesHidden || [];
  const cps = Array.isArray(st.checkpoints) ? st.checkpoints : [];
  const cpDesc = (k) => { const P = st.paperTargets || {}; return 'targets ' + Object.keys(P).map((s) => s + ' ' + P[s][k]).join(' · '); };
  const builtinMs = [
    { id: 'ms_start', date: st.planStart, title: 'Old plan begins', desc: 'Accounts + Law · before the journey', type: 'Plan', done: t >= st.planStart },
    tt1 && { id: 'ms_tt1', date: tt1.date, title: 'First 2 km time trial', desc: 'Baseline run — record your time', type: 'Fitness', done: tt1.km != null },
    { id: 'ms_comeback', date: M.journey.start, title: 'Day 1 of ' + M.journey.days + ' · the journey begins', desc: 'Baseline full papers: Costing (Fri) + Audit (Sat)', type: 'Plan', done: t >= M.journey.start },
    { id: 'ms_formopen', date: '2026-11-03', title: 'Exam form window opens', desc: 'Both groups · fill it this week', type: 'Exam', done: t > '2026-11-03' },
    { id: 'ms_form', date: '2026-11-16', title: 'Exam form deadline', desc: 'Both groups · late fee until 19 Nov', type: 'Exam', done: t > '2026-11-16' },
    { id: 'ms_syllabus', date: st.syllabusDeadline, title: 'Checkpoint 1 · R1 complete', desc: 'All ' + chapters.length + ' chapters once · ' + cpDesc(0), type: 'Study', done: M.done >= chapters.length },
    { id: 'ms_phase2', date: st.revisionStart || '2026-11-18', title: 'Phase 2 · R2 + 3 full papers a week', desc: 'Each paper revised in the days before its full paper', type: 'Revision', done: t >= (st.revisionStart || '2026-11-18') },
    { id: 'ms_race5k', date: '2026-11-28', title: '5 km race · 8 AM', desc: 'Target 30:00 · backup Mon 30 Nov', type: 'Fitness', done: M.run5k.achieved },
    { id: 'ms_cp2', date: cps[1] || '2026-12-06', title: 'Checkpoint 2 · R2 complete', desc: cpDesc(1), type: 'Mock test', done: t > (cps[1] || '2026-12-06') },
    { id: 'ms_mock1', date: firstMock, title: 'First full paper', desc: mocks[0].paper + ' ' + mocks[0].subject + ' · 3 h, 2–5 PM', type: 'Mock test', done: mocks[0].marks != null },
    { id: 'ms_cadence', date: '2026-12-07', title: 'A full paper every day', desc: 'Round 1 (7–12 Dec) and Round 2 (14–19 Dec) in exam order · R3 each morning', type: 'Mock test', done: t >= '2026-12-07' },
    { id: 'ms_cp3', date: cps[2] || '2026-12-12', title: 'Checkpoint 3 · Round 1 done', desc: cpDesc(2), type: 'Mock test', done: t > (cps[2] || '2026-12-12') },
    { id: 'ms_lastmock', date: lastMock, title: 'Final full paper (#' + mocks.length + ') · checkpoint 4', desc: 'Exam targets: ' + cpDesc(3), type: 'Mock test', done: mocks[mocks.length - 1].marks != null },
    { id: 'ms_finish', date: M.journey.finish, title: 'Finish line · Day ' + (diff(M.journey.start, M.journey.finish) + 1), desc: 'R1, R2, R3, all ' + mocks.length + ' full papers and the writing scorecard done', type: 'Revision', done: t > M.journey.finish },
    { id: 'ms_journey', date: M.journey.end, title: 'Day ' + M.journey.days + ' · journey complete', desc: 'Fix-it days done · final look 26 Dec – 1 Jan', type: 'Plan', done: t > M.journey.end },
    { id: 'ms_exam1', date: st.examDate, title: 'CA Inter · Group I', desc: 'Papers on 2, 4 and 6 Jan · 2–5 PM', type: 'Exam', done: t > '2027-01-06' },
    { id: 'ms_exam2', date: '2027-01-08', title: 'CA Inter · Group II', desc: 'Papers on 8, 10 and 12 Jan · 2–5 PM', type: 'Exam', done: t > '2027-01-12' }
  ].filter(Boolean).map((m) => Object.assign(m, { builtin: true, hidden: hiddenMs.indexOf(m.id) >= 0 }));
  const userMs = store.list('milestones').map((m) => ({ id: m.id, date: m.date, title: m.title, desc: m.desc || '', type: m.type || 'Personal', done: !!m.done, builtin: false, rec: m }));
  const msStatus = (m) => (m.done ? 'done' : m.date === t ? 'today' : m.date < t ? 'missed' : 'upcoming');
  M.milestones = sortBy(builtinMs.concat(userMs).filter((m) => m.date), (m) => m.date).map((m) => Object.assign(m, { status: msStatus(m) }));

  // ---------- Winter Arc ----------
  M.arc = arc.compute(t);

  // ---------- notifications ----------
  const notes = [];
  if (M.overdueCount) notes.push({ id: 'overdue', icon: 'alert', tone: 'warn', title: plural(M.overdueCount, 'chapter') + ' overdue', body: 'Catch up: spread them over the days left', href: '#/study-plan' });
  const mkToday = mocks.find((x) => x.date === t && x.marks == null && x.status !== 'skipped');
  if (mkToday) notes.push({ id: 'mock', icon: 'mocks', tone: 'info', title: 'Full paper today · ' + mkToday.subject, body: mkToday.duration + ' · enter the marks afterwards', href: '#/mocks?id=' + mkToday.id });
  const missedP = mocks.filter((m) => m.status === 'missed');
  if (missedP.length) notes.push({ id: 'mock-missed', icon: 'alert', tone: 'warn', title: plural(missedP.length, 'full paper') + ' not logged', body: 'Enter the marks, or move ' + (missedP.length > 1 ? 'them' : 'it') + ' to a fix-it day (21–25 Dec)', href: '#/mocks' });
  if (td && td.date >= M.journey.start && !td.minMet && M.noZero.streak > 0) notes.push({ id: 'nozero', icon: 'flame', tone: 'info', title: 'No-zero streak: ' + plural(M.noZero.streak, 'day'), body: 'Log at least ' + M.noZero.min + ' h today to keep it', href: '#/log' });
  const yd = dayByDate[addDays(t, -1)];
  if (yd && !yd.logged) notes.push({ id: 'unlogged', icon: 'clock', tone: 'warn', title: 'Yesterday isn’t logged', body: fmtD(yd.date) + ' · add your hours', href: '#/log?date=' + yd.date });
  const rt = runs.find((r) => r.date === t);
  if (rt && rt.km == null && rt.session !== 'Extra') notes.push({ id: 'run', icon: 'activity', tone: 'info', title: (rt.date === M.run5k.R.race ? '5 km race today · target 30:00' : rt.isTT ? 'Time trial today' : 'Run today · ' + rt.session), body: 'Log it after your run', href: rt.date >= M.run5k.R.start && rt.date <= M.run5k.R.last ? '#/run-5k' : '#/health' });
  const at = M.arc && M.arc.today;
  if (at && !at.clean && at.need > 0 && new Date().getHours() >= 18) notes.push({ id: 'arc', icon: 'snow', tone: 'info', title: 'Winter Arc · ' + plural(at.need, 'more habit') + ' for a clean day', body: at.done + ' of ' + M.arc.n + ' done today · streak ' + M.arc.streak, href: '#/winter-arc' });
  const behindGoals = M.goals.filter((g) => g.status === 'behind' || g.status === 'overdue');
  if (behindGoals.length) notes.push({ id: 'goals', icon: 'target', tone: 'warn', title: plural(behindGoals.length, 'goal') + ' behind schedule', body: behindGoals.slice(0, 2).map((g) => g.title).join(' · '), href: '#/goals' });
  const errDueN = store.list('errors').filter((e) => errDue(e, t)).length;
  if (errDueN) notes.push({ id: 'errors', icon: 'revision', tone: 'info', title: plural(errDueN, 'mistake') + ' due for review', body: 'Drill them · about a minute each', href: '#/errors?drill=1' });
  M.notifications = notes;

  // ---------- analytics metrics ----------
  const last7 = []; for (let i = 6; i >= 0; i--) last7.push(addDays(t, -i));
  let fDone = 0, fTot = 0, hDone = 0, hTot = 0;
  last7.forEach((d) => { const it = M.focusItems(d); fTot += it.length; fDone += it.filter((x) => x.done).length; });
  habits.filter((h) => !h.hidden).forEach((h) => last7.forEach((d) => { const v = habitDone(h, d); if (v != null) { hTot++; if (v) hDone++; } }));
  const overallAt = (date) => {
    const vals = [];
    areas.filter((a) => !a.hidden).forEach((a) => { const v = a.valueAt(date); if (v != null) vals.push(v); });
    vals.push(100 * F.revision(date), 100 * F.mocks(date));
    return vals.length ? sum(vals) / vals.length : null;
  };
  const overallExpAt = (date) => {
    const ev = [];
    areas.filter((a) => !a.hidden && a.hasData && date >= a.start).forEach((a) => ev.push(a.expFn(date)));
    ev.push(EXP.revision(date), EXP.mocks(date));
    return sum(ev) / ev.length;
  };
  const activeGoals = M.goals.filter((g) => g.status !== 'paused' && g.hasData);
  M.analytics = {
    dailyHours: todayHrs, weeklyHours: wHrs, weeklyTarget: wTarget, avgPerLoggedDay: M.avgNow,
    goalCompletion: activeGoals.length ? sum(activeGoals, (g) => g.progress) / activeGoals.length : null,
    goalsDone: M.goals.filter((g) => g.status === 'done').length, goalsTotal: M.goals.length,
    habitCompletion: hTot ? hDone / hTot : null, taskCompletion: fTot ? fDone / fTot : null, tasksDone7: fDone, tasksTotal7: fTot,
    daysRemaining: M.kpi.days.exam,
    goalRisk: M.goals.filter((g) => g.risk !== 'low' && g.status !== 'done' && g.status !== 'paused'),
    overallAt, overallExpAt
  };
  return M;
}

let cache = null, cacheKey = '';
export function model() {
  const key = store.getVersion() + '|' + todayStr();
  if (cache && cacheKey === key) return cache;
  cache = computeAll(); cacheKey = key;
  return cache;
}
