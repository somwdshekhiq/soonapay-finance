import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, day, n } from '../lib.js'
import { Page, Card, Loading, Table, Pill, AdminOnly } from '../ui.jsx'

async function load() {
  const [cats, recent, recurring, company, finance, fx, isml] = await Promise.all([
    q(supabase.from('expense_categories').select('*').order('name')),
    q(supabase.from('expenses').select('expense_id, expense_date, description, amount_usd, funding_source, expense_categories(name)').order('expense_date', { ascending: false }).limit(30)),
    q(supabase.from('recurring_expenses').select('*').eq('active', true)),
    q(supabase.from('v_company_account').select('amount_usd')),
    q(supabase.from('v_finance_balance').select('outstanding_usd')),
    q(supabase.from('fx_rates').select('*').order('rate_date', { ascending: false })),
    q(supabase.from('partners').select('partner_id').eq('name', 'Ismail').single())
  ])
  const rate = (cur) => (cur === 'USD' ? 1 : n(fx.find((f) => f.currency === cur)?.usd_per_unit) || null)
  return { cats, recent, recurring, rate, lender: isml.partner_id,
    company: company.reduce((s, r) => s + n(r.amount_usd), 0), finance: finance.reduce((s, r) => s + n(r.outstanding_usd), 0) }
}

function ExpenseForm({ d, onSaved, t }) {
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), cat: d.cats[0]?.category_id, desc: '', amount: '', cur: 'USD', fx: '', source: null, receipt: '' })
  const [msg, setMsg] = useState('')
  const fx = f.fx !== '' ? Number(f.fx) : d.rate(f.cur)
  const usdAmt = n(f.amount) * (fx || 0)
  const save = async () => {
    if (!f.source) return setMsg(t('paidFrom') + ' ?')
    if (!f.desc || !n(f.amount) || !fx) return setMsg(t('error'))
    const { error } = await supabase.from('expenses').insert({
      expense_date: f.date, category_id: f.cat, description: f.desc, amount_orig: n(f.amount), currency: f.cur, fx_usd_per_unit: fx,
      funding_source: f.source, financed_by: f.source === 'partner_finance' ? d.lender : null, receipt_ref: f.receipt || null })
    if (error) return setMsg(error.message)
    onSaved()
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <Card title={t('newExpense')}>
      <div className="form-grid">
        <label className="field"><span>{t('date')}</span><input type="date" value={f.date} onChange={set('date')} /></label>
        <label className="field"><span>{t('category')}</span><select value={f.cat} onChange={set('cat')}>{d.cats.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}</select></label>
        <label className="field" style={{ gridColumn: 'span 2' }}><span>{t('description')}</span><input value={f.desc} onChange={set('desc')} /></label>
        <label className="field"><span>{t('amount')}</span><input type="number" step="0.01" value={f.amount} onChange={set('amount')} /></label>
        <label className="field"><span>{t('currency')}</span><select value={f.cur} onChange={set('cur')}><option>USD</option><option>SAR</option><option>EUR</option><option>GBP</option><option>SDG</option></select></label>
        {f.cur !== 'USD' && <label className="field"><span>USD / {f.cur}</span><input type="number" step="0.000001" placeholder={String(d.rate(f.cur) ?? '')} value={f.fx} onChange={set('fx')} /></label>}
        <div className="field"><span>{t('inUsd')}</span><div className="num" style={{ fontSize: 20, color: 'var(--ink)', paddingTop: 8 }}>{usd(usdAmt)}</div></div>
      </div>
      <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="small muted" style={{ paddingBottom: 10 }}>{t('paidFrom')}</legend>
        <div className="row gap16 wrap" style={{ alignItems: 'stretch' }}>
          <button type="button" className={'choice ' + (f.source === 'company_account' ? 'on' : '')} aria-pressed={f.source === 'company_account'} onClick={() => setF({ ...f, source: 'company_account' })}>
            <b>{t('companyAccount')}</b><span className="small muted">{usd(d.company)} → <span className="num">{usd(d.company - (f.source === 'company_account' ? usdAmt : 0))}</span></span></button>
          <button type="button" className={'choice ' + (f.source === 'partner_finance' ? 'on' : '')} aria-pressed={f.source === 'partner_finance'} onClick={() => setF({ ...f, source: 'partner_finance' })}>
            <b>{t('addedToFinance')}</b><span className="small muted">{usd(d.finance)} → <span className="num">{usd(d.finance + (f.source === 'partner_finance' ? usdAmt : 0))}</span></span></button>
        </div>
      </fieldset>
      {msg && <div className="alert">{msg}</div>}
      <div><button className="btn primary" onClick={save}>{t('save')}</button></div>
    </Card>
  )
}

export default function Expenses() {
  const { t, lang } = useApp()
  const r = useQuery(load)
  const d = r.data
  const [msg, setMsg] = useState('')
  const confirmSalary = async (rec, source) => {
    const fx = d.rate(rec.currency)
    const { error } = await supabase.from('expenses').insert({
      expense_date: new Date().toISOString().slice(0, 10), category_id: rec.category_id,
      description: `${rec.name} — ${new Date().toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}`,
      amount_orig: rec.amount_orig, currency: rec.currency, fx_usd_per_unit: fx, funding_source: source,
      financed_by: source === 'partner_finance' ? d.lender : null, recurring_id: rec.recurring_id })
    setMsg(error ? error.message : t('saved')); r.reload()
  }
  return (
    <Page title={t('expenses')}>
      <Loading q={r}>{d && <>
        {msg && <div className="ok">{msg}</div>}
        <AdminOnly><ExpenseForm d={d} t={t} onSaved={() => { setMsg(t('saved')); r.reload() }} /></AdminOnly>
        <Card title={t('monthlySalaries')}>
          {d.recurring.map((rec) => <SalaryRow key={rec.recurring_id} rec={rec} t={t} usdAmt={n(rec.amount_orig) * (d.rate(rec.currency) || 0)} onConfirm={confirmSalary} />)}
        </Card>
        <Card title={t('recentExpenses')}>
          <Table cols={[
            { k: 'd', h: t('date'), num: 1, f: (x) => day(x.expense_date, lang) },
            { k: 'desc', h: t('description'), f: (x) => x.description },
            { k: 'c', h: t('category'), f: (x) => <span className="muted">{x.expense_categories?.name}</span> },
            { k: 's', h: t('paidFrom'), f: (x) => <Pill tone={x.funding_source === 'partner_finance' ? 'good' : 'grey'}>{x.funding_source === 'partner_finance' ? t('addedToFinance') : t('companyAccount')}</Pill> },
            { k: 'a', h: t('amount'), r: 1, num: 1, f: (x) => usd(x.amount_usd) }
          ]} rows={d.recent.map((x) => ({ ...x, key: x.expense_id }))} />
        </Card>
      </>}</Loading>
    </Page>
  )
}

function SalaryRow({ rec, t, usdAmt, onConfirm }) {
  const [src, setSrc] = useState(rec.default_funding_source)
  return (
    <div className="row between wrap gap16" style={{ padding: 14, borderRadius: 8, background: 'var(--ground)' }}>
      <div><b>{rec.name}</b><div className="xs muted"><span className="num">{n(rec.amount_orig).toLocaleString()} {rec.currency}</span> = <span className="num">{usd(usdAmt)}</span></div></div>
      <AdminOnly><div className="row gap8 wrap">
        <select className="inp" style={{ width: 'auto' }} value={src} onChange={(e) => setSrc(e.target.value)} aria-label={t('paidFrom')}>
          <option value="partner_finance">{t('addedToFinance')}</option><option value="company_account">{t('companyAccount')}</option></select>
        <button className="btn primary" onClick={() => onConfirm(rec, src)}>{t('confirmPayment')}</button>
      </div></AdminOnly>
    </div>
  )
}
