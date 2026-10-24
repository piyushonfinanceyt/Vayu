/* Finance: income, spending and savings by month (₹). Budget bar, where the money went, a six-month spending trend
   against the budget, and every transaction (add, edit, delete). Everything stays on this device. */
import { html, raw, esc, fmtINR, fmtD, plural, sortBy, sum, monthStart, monthEnd, addMonths, MONL, MON, parse, pct, todayStr, clamp01 } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, status, tile, meter, empty, toast, form } from '../components.js';
import { spot } from '../charts.js';
import { pref, setPref } from '../prefs.js';
import { renderSoon } from '../router.js';
import * as store from '../store.js';
import { model as modelOf } from '../model.js';

const EXP = ['Food', 'Rent', 'Transport', 'Books & study', 'Fees & exams', 'Health & fitness', 'Phone & internet', 'Shopping', 'Family', 'Other'];
const INC = ['Salary / stipend', 'Freelance', 'Family support', 'Scholarship', 'Other'];
function openTx(id, preset) {
  const t = id ? store.get('finance', id) : null;
  form({
    title: t ? 'Edit transaction' : 'New ' + ((preset && preset.type) === 'income' ? 'income' : 'expense'),
    fields: [{ name: 'type', label: 'Type', type: 'select', options: [['expense', 'Expense'], ['income', 'Income']], half: true }, { name: 'amount', label: 'Amount (₹)', type: 'number', min: 0, step: 0.01, required: true, half: true, autofocus: true }, { name: 'category', label: 'Category', type: 'select', options: EXP.concat(INC.filter((c) => !EXP.includes(c))), half: true }, { name: 'date', label: 'Date', type: 'date', required: true, half: true }, { name: 'note', label: 'Note', placeholder: 'ICAI exam fee, Group II' }],
    values: t || Object.assign({ type: 'expense', category: 'Food', date: todayStr() }, preset || {}),
    submitLabel: t ? 'Save' : 'Add',
    onSubmit: (v) => { if (!(v.amount > 0)) return 'Enter an amount above 0.'; if (t) store.put('finance', Object.assign({}, t, v)); else store.add('finance', v, 'fx'); toast(t ? 'Transaction saved' : 'Transaction added'); },
    onDelete: t ? () => { store.remove('finance', t.id); toast('Transaction deleted'); } : null
  });
}

export default {
  head(M) { const month = pref('finMonth') || monthStart(M.t); return { title: 'Finance', sub: raw(esc(MONL[parse(month).getMonth()] + ' ' + month.slice(0, 4) + ' · everything stays on this device')), actions: raw('<button type="button" class="btn" data-act="tx-add" data-type="income">' + icon('plus') + 'Income</button><button type="button" class="btn primary" data-act="tx-add" data-type="expense">' + icon('plus') + 'Expense</button>') }; },
  render(M) {
    const month = pref('finMonth') || monthStart(M.t), mEnd = monthEnd(month), all = store.list('finance'), f = M.st.finance || {};
    const inM = sortBy(all.filter((t) => t.date >= month && t.date <= mEnd), (t) => t.date + (t.createdAt || '')).reverse();
    const inc = sum(inM.filter((t) => t.type === 'income'), (t) => +t.amount || 0), exp = sum(inM.filter((t) => t.type !== 'income'), (t) => +t.amount || 0), net = inc - exp;
    const totalNet = sum(all, (t) => (t.type === 'income' ? 1 : -1) * (+t.amount || 0));
    const nav = html`<section class="card daynav"><button type="button" class="icon-btn" data-act="fin-month" data-dir="-1" aria-label="Previous month">${icon('chevL')}</button><div class="dn"><b>${MONL[parse(month).getMonth()]} ${month.slice(0, 4)}</b><span>${plural(inM.length, 'transaction')}</span></div><button type="button" class="icon-btn" data-act="fin-month" data-dir="1" aria-label="Next month">${icon('chevR')}</button>${month !== monthStart(M.t) ? html`<button type="button" class="btn sm" data-act="fin-now">This month</button>` : ''}<button type="button" class="btn sm ghost" data-act="fin-settings">${icon('settings')}Budget and savings</button></section>`;
    const over = f.budget && exp > f.budget;
    const tiles = html`<div class="tiles">${tile({ label: 'Income', icon: 'arrowD', value: fmtINR(inc), foot: plural(inM.filter((t) => t.type === 'income').length, 'entry', 'entries') })}
      ${tile({ cls: 'hero', label: 'Spent', icon: 'arrowU', value: fmtINR(exp), foot: f.budget ? pct(exp / f.budget) + ' of the ' + fmtINR(f.budget) + ' budget' : 'no budget set' })}
      ${tile({ label: 'Saved this month', icon: 'coins', value: fmtINR(net), foot: inc ? 'savings rate ' + pct(net / inc) : 'add your income to see the rate' })}
      ${tile({ label: 'Total saved', icon: 'finance', value: fmtINR(totalNet), foot: f.savingsTarget ? pct(Math.max(0, totalNet) / f.savingsTarget) + ' of the ' + fmtINR(f.savingsTarget) + ' target' : 'set a savings target' })}</div>`;
    const byCat = {}; inM.filter((t) => t.type !== 'income').forEach((t) => { const c = t.category || 'Other'; byCat[c] = (byCat[c] || 0) + (+t.amount || 0); });
    const cats = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]), mx = cats.length ? byCat[cats[0]] : 1;
    const where = card({ cls: 'span-5', title: 'Where it went', icon: 'analytics', sub: 'Spending by category this month',
      body: html`${f.budget ? html`<div class="between small" style="margin-bottom:6px"><span class="muted">Budget used</span><b style="font-weight:500">${fmtINR(exp)} / ${fmtINR(f.budget)}</b></div>${meter(clamp01(exp / f.budget), { tone: over ? 'bad' : '', label: 'Budget used' })}${over ? html`<p style="margin-top:8px">${status('Over budget by ' + fmtINR(exp - f.budget), 'bad')}</p>` : ''}` : html`<p class="hint" style="margin-top:0">Set a monthly budget to see how much is left. <button type="button" class="btn link" data-act="fin-settings">Set a budget</button></p>`}
        ${cats.length ? html`<ul class="hbars" style="margin-top:12px">${cats.map((c, i) => html`<li><span>${c}</span><div class="hbar"><i class="${i === 0 ? 'on' : ''}" style="width:${(byCat[c] / mx * 100).toFixed(1)}%"></i></div><b class="num">${fmtINR(byCat[c])}</b></li>`)}</ul>` : html`<p class="muted" style="margin-top:12px">No spending recorded this month.</p>`}` });
    const months = []; for (let i = 5; i >= 0; i--) months.push(addMonths(month, -i));
    const spendBy = (m) => sum(all.filter((t) => t.type !== 'income' && t.date >= m && t.date <= monthEnd(m)), (t) => +t.amount || 0);
    const trend = card({ cls: 'span-7', title: 'Spending, six months', icon: 'clock', sub: f.budget ? 'Solid = spent · hatched = budget' : 'Spending per month', body: spot('fin-trend', 'bars', { labels: months.map((m) => MON[parse(m).getMonth()]), tips: months.map((m) => MONL[parse(m).getMonth()] + ' ' + m.slice(0, 4)), values: months.map((m) => (m <= monthStart(M.t) ? spendBy(m) : null)), targets: f.budget ? months.map(() => +f.budget) : null, highlight: 5, fmt: (v) => fmtINR(v), height: 200, ariaLabel: 'Spending for each of the last six months' + (f.budget ? ' against the monthly budget' : '') }) });
    const tx = card({ title: 'Transactions', icon: 'list', actions: chip(plural(inM.length, 'entry', 'entries')),
      body: inM.length ? html`<ul class="list">${inM.map((t) => html`<li><span class="goal-ic">${icon(t.type === 'income' ? 'arrowD' : 'arrowU')}</span><button type="button" class="li-main link-like" data-act="tx-edit" data-id="${t.id}"><b>${t.category || 'Other'}</b><small>${fmtD(t.date)}${t.note ? ' · ' + t.note : ''}</small></button><b class="num tx-amt ${t.type === 'income' ? 'in' : 'out'}">${t.type === 'income' ? '+' : '−'}${fmtINR(t.amount)}</b></li>`)}</ul>`
        : empty('No transactions in ' + MONL[parse(month).getMonth()] + ' yet. Add exam fees, books, food and your stipend.', html`<button type="button" class="btn sm primary" data-act="tx-add" data-type="expense">${icon('plus')}Add your first entry</button>`, 'finance') });
    return html`${nav}${tiles}<div class="grid">${trend}${where}</div>${tx}`;
  },
  actions: {
    'tx-add': (el) => openTx(null, el.dataset.type ? { type: el.dataset.type, category: el.dataset.type === 'income' ? INC[0] : 'Food' } : null),
    'tx-edit': (el) => openTx(el.dataset.id),
    'fin-month': (el) => { setPref('finMonth', addMonths(pref('finMonth') || monthStart(todayStr()), +el.dataset.dir)); renderSoon(); },
    'fin-now': () => { setPref('finMonth', null); renderSoon(); },
    'fin-settings': () => {
      const f = modelOf().st.finance || {};
      form({ title: 'Budget and savings', fields: [{ name: 'budget', label: 'Monthly spending budget (₹)', type: 'number', min: 0, step: 100, half: true }, { name: 'savingsTarget', label: 'Savings target (₹)', type: 'number', min: 0, step: 100, half: true }, { name: 'info', type: 'info', text: 'Savings = income minus spending, added up across every month.' }], values: f, submitLabel: 'Save', onSubmit: (v) => { store.setSetting('finance', { budget: v.budget, savingsTarget: v.savingsTarget }); toast('Saved'); } });
    }
  }
};
