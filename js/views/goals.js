/* Goals: three tabs. Goals (progress linked to your logs, or a slider you set, with the expected-pace tick and
   ahead / behind status), Milestones (the plan's own plus yours) and Tasks (kanban: Overdue · Today · Upcoming · Done). */
import { html, raw, esc, fmtD, fmtDS, fmtDY, plural, diff, sortBy, clamp, todayStr, debounce } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, status, tile, tabs, meter, empty, toast, menu, form, confirm, prio } from '../components.js';
import { pref, setPref } from '../prefs.js';
import { renderSoon } from '../router.js';
import * as store from '../store.js';

const TASK_CATS = ['Accounts', 'Law', 'Tax', 'Costing', 'Audit', 'FM&SM', 'Revision', 'Mock test', 'Health', 'Communication', 'Career', 'Finance', 'Content', 'Personal', 'Other'];
const MS_TYPES = ['Exam', 'Study', 'Revision', 'Mock test', 'Application', 'Career', 'Articleship', 'Personal', 'Financial', 'Fitness', 'Other'];
const MS_ICON = { Exam: 'cap', Study: 'book', Revision: 'revision', 'Mock test': 'mocks', Fitness: 'activity', Plan: 'flag', Personal: 'heart', Career: 'briefcase', Articleship: 'briefcase', Application: 'notes', Financial: 'coins', Other: 'flag' };
let tab = 'goals';

// ---------- forms ----------
function sourceOptions(M) {
  const o = [['manual', 'Set the % myself'], ['readiness', 'Auto · CA Inter readiness'], ['syllabus', 'Auto · chapters completed'], ['hours', 'Auto · study hours vs plan'], ['revision', 'Auto · R2 + R3 revisions'], ['mocks', 'Auto · full papers taken'], ['run', 'Auto · 2 km time trial'], ['run5k', 'Auto · 5 km in 30:00'], ['tasks', 'Auto · linked tasks completed']];
  M.areas.forEach((a) => o.push(['lifeArea:' + a.id, 'Life area · ' + a.name]));
  return o;
}
export function openGoalForm(M, id, preset) {
  const g = id ? store.get('goals', id) : null;
  form({
    title: g ? 'Edit goal' : 'New goal',
    fields: [
      { name: 'title', label: 'Goal', required: true, placeholder: 'Score 60+ in every paper' },
      { name: 'category', label: 'Category', type: 'select', options: M.GOAL_CATS, half: true },
      { name: 'status', label: 'Status', type: 'select', options: [['active', 'Active'], ['done', 'Completed'], ['paused', 'Paused']], half: true },
      { name: 'source', label: 'Progress comes from', type: 'select', options: sourceOptions(M) },
      { name: 'progress', label: 'Progress % (when you set it yourself)', type: 'number', min: 0, max: 100, step: 1 },
      { name: 'startDate', label: 'Start date', type: 'date', half: true },
      { name: 'deadline', label: 'Deadline', type: 'date', half: true, required: true },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
    ],
    values: g || Object.assign({ category: 'Academic', source: 'manual', progress: 0, startDate: M.t, deadline: M.st.yearEnd, status: 'active' }, preset || {}),
    submitLabel: g ? 'Save goal' : 'Add goal',
    onOpen: (root) => { const src = root.querySelector('[name=source]'), pf = root.querySelector('[name=progress]').closest('.field'); const upd = () => { pf.hidden = src.value !== 'manual'; }; src.addEventListener('change', upd); upd(); },
    onSubmit: (v) => {
      if (v.startDate && v.deadline && v.deadline < v.startDate) return 'The deadline must be after the start date.';
      const rec = Object.assign({}, g || {}, v, { progress: v.progress == null ? 0 : clamp(v.progress, 0, 100), completedAt: v.status === 'done' ? ((g && g.completedAt) || todayStr()) : null });
      if (g) store.put('goals', rec); else store.add('goals', Object.assign(rec, { order: 50 }), 'g');
      toast(g ? 'Goal saved' : 'Goal added');
    },
    onDelete: g ? () => { store.remove('goals', g.id); toast('Goal deleted'); } : null,
    deleteBody: g ? '“' + g.title + '” will be removed. Linked tasks stay.' : ''
  });
}
export function openTaskForm(M, id, preset) {
  const tk = id ? store.get('tasks', id) : null;
  form({
    title: tk ? 'Edit task' : 'New task',
    fields: [
      { name: 'title', label: 'Task', required: true, placeholder: 'Practise 20 MCQs · Costing' },
      { name: 'date', label: 'Date', type: 'date', half: true },
      { name: 'priority', label: 'Priority', type: 'select', options: [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], half: true },
      { name: 'category', label: 'Category', type: 'select', options: TASK_CATS, half: true },
      { name: 'est', label: 'Estimated minutes', type: 'number', min: 0, max: 1440, step: 5, half: true },
      { name: 'goalId', label: 'Counts towards goal', type: 'select', options: [['', '— none —']].concat(M.goals.map((g) => [g.id, g.title])) },
      { name: 'done', label: 'Completed', type: 'checkbox' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
    ],
    values: tk || Object.assign({ date: M.t, priority: 'medium', category: 'Other', est: null, goalId: '' }, preset || {}),
    submitLabel: tk ? 'Save task' : 'Add task',
    onSubmit: (v) => { const rec = Object.assign({}, tk || {}, v, { goalId: v.goalId || null, doneAt: v.done ? ((tk && tk.doneAt) || todayStr()) : null }); if (tk) store.put('tasks', rec); else store.add('tasks', rec, 't'); toast(tk ? 'Task saved' : 'Task added'); },
    onDelete: tk ? () => { store.remove('tasks', tk.id); toast('Task deleted'); } : null
  });
}
function openMilestoneForm(id) {
  const r = id ? store.get('milestones', id) : null;
  form({
    title: r ? 'Edit milestone' : 'New milestone',
    fields: [{ name: 'title', label: 'Milestone', required: true, placeholder: 'Articleship application' }, { name: 'date', label: 'Date', type: 'date', required: true, half: true }, { name: 'type', label: 'Type', type: 'select', options: MS_TYPES, half: true }, { name: 'desc', label: 'Description', type: 'textarea', rows: 2 }, { name: 'done', label: 'Achieved', type: 'checkbox' }],
    values: r || { date: todayStr(), type: 'Personal' },
    submitLabel: r ? 'Save' : 'Add milestone',
    onSubmit: (v) => { if (r) store.put('milestones', Object.assign({}, r, v)); else store.add('milestones', v, 'ms'); toast(r ? 'Milestone saved' : 'Milestone added'); },
    onDelete: r ? () => { store.remove('milestones', r.id); toast('Milestone deleted'); } : null
  });
}

// ---------- tabs ----------
function goalRow(M, g) {
  const tone = M.STATUS_TONE[g.status], live = g.status !== 'done' && g.status !== 'paused';
  return html`<li class="goal ${g.status === 'done' ? 'is-done' : ''}"><span class="goal-ic">${icon(g.icon)}</span><div class="li-main">
    <div class="between"><button type="button" class="goal-title" data-act="goal-edit" data-id="${g.id}">${g.title}</button><span class="small muted">${icon('calendar')} ${fmtDY(g.deadline)}</span></div>
    <div class="goal-bar">${meter(g.progress / 100, { target: g.expected != null && live && g.hasData ? g.expected / 100 : null, targetLabel: 'expected by today', label: g.title })}<b class="num">${g.hasData ? Math.round(g.progress) + '%' : '—'}</b>${tone ? status(M.STATUS_TXT[g.status], tone) : chip(M.STATUS_TXT[g.status])}</div>
    <div class="goal-detail"><span>${g.sourceLabel}${g.detail ? ' · ' + g.detail : ''}</span>${g.expected != null && live && g.hasData ? html`<span>Expected today ${Math.round(g.expected)}% (${g.model === 'plan' ? 'plan pace' : 'straight line'})</span>` : ''}${g.daysLeft != null && g.daysLeft >= 0 && live ? html`<span>${plural(g.daysLeft, 'day')} left</span>` : ''}${g.risk === 'high' && live ? status('High risk', 'bad') : ''}</div>
    ${g.source === 'manual' && live ? html`<label class="goal-slider"><span class="sr-only">Progress for ${g.title}</span><input type="range" min="0" max="100" step="1" value="${Math.round(g.progress)}" data-input="goal-progress" data-id="${g.id}" id="gs-${g.id}"></label>` : ''}</div>
    <button type="button" class="icon-btn sm" data-act="goal-menu" data-id="${g.id}" aria-label="Options for ${g.title}" aria-haspopup="menu">${icon('moreV')}</button></li>`;
}
function goalsTab(M) {
  const g = M.goals, c = (s) => g.filter((x) => x.status === s).length, cat = pref('goalsCat', 'All');
  const list = g.filter((x) => cat === 'All' || x.category === cat);
  const tiles = html`<div class="tiles">${tile({ cls: 'hero', label: 'Goals', icon: 'target', value: String(g.length), foot: c('done') + ' completed · ' + c('paused') + ' paused' })}${tile({ label: 'Ahead or on track', icon: 'arrowU', value: String(c('ahead') + c('ontrack')), foot: 'of ' + g.filter((x) => x.hasData && !['done', 'paused', 'upcoming'].includes(x.status)).length + ' in progress' })}${tile({ label: 'Behind', icon: 'arrowD', value: String(c('behind') + c('overdue')), foot: M.analytics.goalRisk.filter((x) => x.risk === 'high').length + ' at high risk' })}${tile({ label: 'Average progress', icon: 'analytics', value: M.analytics.goalCompletion == null ? '—' : Math.round(M.analytics.goalCompletion) + '%', foot: 'active goals with data' })}</div>`;
  return html`${tiles}${card({
    title: 'Your goals', icon: 'target', sub: 'Linked goals update from your logs. The tick on each bar is where you’re expected to be today.',
    actions: html`<div class="seg" role="group" aria-label="Category">${['All'].concat(M.goalCats).map((x) => html`<button type="button" data-seg="goals-cat" data-v="${x}" aria-pressed="${String(cat === x)}">${x === 'All' ? 'All' : x}</button>`)}</div><button type="button" class="btn sm primary" data-act="goal-add">${icon('plus')}Add goal</button>`,
    body: list.length ? html`<ul class="goals">${list.map((x) => goalRow(M, x))}</ul>` : empty('No goals in this category yet.', html`<button type="button" class="btn sm" data-act="goal-add">${icon('plus')}Add a goal</button>`, 'target')
  })}`;
}
function msTab(M) {
  const show = !!pref('msShowHidden'), list = M.milestones.filter((m) => show || !m.hidden);
  return card({
    title: 'Milestones', icon: 'flag', sub: 'Your plan’s milestones update themselves. Add your own for applications, articleship, personal or financial dates.',
    actions: html`<button type="button" class="tog" data-act="ms-hidden" aria-pressed="${String(show)}">Show hidden</button><button type="button" class="btn sm primary" data-act="ms-add">${icon('plus')}Add milestone</button>`,
    body: html`<ol class="timeline ms-full">${list.map((m) => html`<li class="${m.status} ${m.hidden ? 'is-hidden' : ''}"><span class="tl-date">${fmtDS(m.date)}<br><small>${m.date.slice(0, 4)}</small></span><span class="tl-body"><button type="button" class="ms-btn" data-act="ms-edit" data-id="${m.id}"><span class="row" style="gap:8px">${icon(MS_ICON[m.type] || 'flag')}<b>${m.title}</b>${m.status === 'done' ? status('Done', 'good') : m.status === 'today' ? chip('Today', 'ink') : m.status === 'missed' ? chip(m.builtin ? 'Passed' : 'Missed') : chip('In ' + plural(diff(M.t, m.date), 'day'), 'line')}</span><small>${m.desc}</small></button></span></li>`)}</ol>`
  });
}
function tasksTab(M) {
  const all = store.list('tasks').filter((x) => !x.plan), t = M.t;
  const goalName = {}; M.goals.forEach((g) => { goalName[g.id] = g.title; });
  const cols = [
    ['Overdue', 'alert', all.filter((x) => x.date && x.date < t && !x.done)],
    ['Today', 'flag', all.filter((x) => x.date === t && !x.done)],
    ['Upcoming', 'calendar', all.filter((x) => (!x.date || x.date > t) && !x.done)],
    ['Done', 'checkCircle', sortBy(all.filter((x) => x.done), (x) => x.doneAt || '').reverse().slice(0, 20)]
  ];
  const kcard = (x) => html`<article class="kcard ${x.done ? 'done' : ''}"><div class="row" style="align-items:flex-start;gap:10px"><button type="button" class="cbx" role="checkbox" aria-checked="${String(!!x.done)}" data-act="task-toggle" data-id="${x.id}" aria-label="${(x.done ? 'Mark not done: ' : 'Mark done: ') + x.title}">${icon('check')}</button><button type="button" class="kc-title link-like" data-act="task-edit" data-id="${x.id}">${x.title}</button></div>
    <div class="kc-meta">${chip(x.category || 'Task', 'line')}${x.date ? html`<span>${icon('calendar')} ${fmtDS(x.date)}</span>` : ''}${x.est ? html`<span>· ${x.est} min</span>` : ''}${prio(x.priority === 'high' ? 'high' : '')}</div>${x.goalId && goalName[x.goalId] ? html`<p class="small muted">${icon('target')} ${goalName[x.goalId]}</p>` : ''}</article>`;
  return card({
    cls: 'board-card', title: 'Tasks', icon: 'checkCircle', sub: 'Your own to-dos. Plan items from the study plan appear in Today’s plan on the Dashboard.',
    actions: html`<button type="button" class="btn sm primary" data-act="task-add">${icon('plus')}Add task</button>`,
    body: all.length ? html`<div class="board">${cols.map(([label, ic, items]) => html`<section class="col"><header class="col-h"><span class="row" style="gap:8px">${icon(ic)}<b>${label}</b></span><span class="chip">${items.length}</span></header><div class="col-body">${items.length ? items.map(kcard) : html`<p class="col-empty">${label === 'Overdue' ? 'Nothing overdue' : 'Nothing here'}</p>`}</div></section>`)}</div>`
      : empty('No tasks yet. Add the things your plan doesn’t list: forms, fees, books to buy.', html`<button type="button" class="btn sm primary" data-act="task-add">${icon('plus')}Add your first task</button>`, 'checkCircle')
  });
}

const saveProgress = debounce((id, v) => store.patch('goals', id, { progress: v }), 300);
export default {
  enter(q) { if (['goals', 'milestones', 'tasks'].includes(q.tab)) tab = q.tab; },
  head(M) {
    const due = store.list('tasks').filter((x) => !x.plan && !x.done && x.date && x.date <= M.t).length;
    return { title: 'Goals', sub: raw(esc(M.goals.length + ' goals · ' + M.milestones.filter((m) => !m.hidden && m.date >= M.t).length + ' milestones ahead · ' + (due ? plural(due, 'task') + ' due' : 'no tasks due'))), actions: tabs('goals', [['goals', 'Goals', 'target'], ['milestones', 'Milestones', 'flag'], ['tasks', 'Tasks', 'checkCircle']], tab, { ink: true, label: 'Goals sections' }) };
  },
  render(M) { return html`<div role="tabpanel" aria-labelledby="tab-goals-${tab}">${tab === 'milestones' ? msTab(M) : tab === 'tasks' ? tasksTab(M) : goalsTab(M)}</div>`; },
  tabs: { goals: (v) => { tab = v; } },
  segs: { 'goals-cat': (v) => setPref('goalsCat', v) },
  inputs: { 'goal-progress': (el) => { const v = clamp(+el.value || 0, 0, 100), b = el.closest('.goal').querySelector('.goal-bar b'); if (b) b.textContent = v + '%'; saveProgress(el.dataset.id, v); } },
  actions: {
    'goal-add': () => openGoalForm(modelOf(), null),
    'goal-edit': (el) => openGoalForm(modelOf(), el.dataset.id),
    'goal-menu': (el) => {
      const g = store.get('goals', el.dataset.id); if (!g) return;
      menu(el, [
        { label: 'Edit goal', icon: 'edit', fn: () => openGoalForm(modelOf(), g.id) },
        g.status === 'done' ? { label: 'Mark active again', icon: 'reset', fn: () => store.patch('goals', g.id, { status: 'active', completedAt: null }) } : { label: 'Mark complete', icon: 'checkCircle', fn: () => { store.patch('goals', g.id, { status: 'done', completedAt: todayStr() }); toast('Goal completed'); } },
        g.status === 'paused' ? { label: 'Resume', icon: 'play', fn: () => store.patch('goals', g.id, { status: 'active' }) } : { label: 'Pause', icon: 'pause', fn: () => store.patch('goals', g.id, { status: 'paused' }) },
        { label: 'Add a task for this goal', icon: 'plus', fn: () => openTaskForm(modelOf(), null, { goalId: g.id }) },
        '-',
        { label: 'Delete goal', icon: 'trash', fn: async () => { if (await confirm({ title: 'Delete this goal?', body: '“' + g.title + '” will be removed.', ok: 'Delete', danger: true })) { store.remove('goals', g.id); toast('Goal deleted'); } } }
      ], { align: 'end' });
    },
    'task-add': (el) => openTaskForm(modelOf(), null, el.dataset.date ? { date: el.dataset.date } : null),
    'task-edit': (el) => openTaskForm(modelOf(), el.dataset.id),
    'ms-add': () => openMilestoneForm(null),
    'ms-hidden': () => { setPref('msShowHidden', !pref('msShowHidden')); renderSoon(); },
    'ms-edit': (el) => {
      const id = el.dataset.id;
      if (store.get('milestones', id)) { openMilestoneForm(id); return; }
      const M = modelOf(), ms = M.milestones.find((x) => x.id === id);
      menu(el, [{ heading: 'From your plan · updates itself' },
        { label: ms && ms.hidden ? 'Show on the timeline' : 'Hide from the timeline', icon: ms && ms.hidden ? 'eye' : 'eyeOff', fn: () => { const h = (M.st.milestonesHidden || []).slice(), i = h.indexOf(id); if (i >= 0) h.splice(i, 1); else h.push(id); store.setSetting('milestonesHidden', h); } },
        { label: 'Open the day in the plan', icon: 'calcheck', href: '#/study-plan?date=' + (ms ? ms.date : '') }]);
    }
  }
};
import { model as modelOf } from '../model.js';
