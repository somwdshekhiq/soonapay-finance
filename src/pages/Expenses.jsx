import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, day, n } from '../lib.js'
import { Page, Card, Kpi, Loading, Table, Pill, AdminOnly } from '../ui.jsx'

async function load() {
  const [cats, recent, recurring, company, finance, fx, isml] = await Promise.all([
    q(supabase.from('expense_categories').select('*').order('name')),
    q(supabase.from('expenses').select('expense_id, expense_date, description, amount_usd, funding_source, category_id, expense_categories(name)').order('expense_date', { ascending: false }).limit(1000)),
    q(supabase.from('recurring_expenses').select('*').order('active', { ascending: false }).order('name')),
    q(supabase.from('v_company_account').select('amount_usd')),
    q(supabase.from('v_finance_balance').select('outstanding_usd')),
    q(supabase.from('fx_rates').select('*').order('rate_date', { ascending: false })),
    q(supabase.from('partners').select('partner_id').eq('name', 'Ismail').single())
  ])
  const rate = (cur) => (cur === 'USD' ? 1 : n(fx.find((f) => f.currency === cur)?.usd_per_unit) || null)
  const paidRec = await q(supabase.from('expenses').select('recurring_id, expense_date, amount_usd').not('recurring_id', 'is', null).order('expense_date', { ascending: false }))
  return { cats, recent, recurring, rate, lender: isml.partner_id, paidRec,
    company: company.reduce((s, r) => s + n(r.amount_usd), 0), finance: finance.reduce((s, r) => s + n(r.outstanding_usd), 0) }
}

function ExpenseForm({ d, onSaved, onCancel, t }) {
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
      <div className="row gap8"><button className="btn primary" onClick={save}>{t('save')}</button><button className="btn" onClick={onCancel}>{t('cancel')}</button></div>
    </Card>
  )
}

export default function Expenses() {
  const { t, lang } = useApp()
  const r = useQuery(load)
  const d = r.data
  const [msg, setMsg] = useState('')
  const [recForm, setRecForm] = useState(null)
  const [adding, setAdding] = useState(false)
  const [flt, setFlt] = useState({ cat: '', month: '', src: '' })
  const [shownN, setShownN] = useState(30)
  const months = d ? [...new Set(d.recent.map((x) => String(x.expense_date).slice(0, 7)))] : []
  const list = d ? d.recent.filter((x) => (!flt.cat || String(x.category_id) === flt.cat) && (!flt.month || String(x.expense_date).slice(0, 7) === flt.month) && (!flt.src || x.funding_source === flt.src)) : []
  const listTotal = list.reduce((s, x) => s + n(x.amount_usd), 0)
  const byCat = Object.entries(list.reduce((m, x) => { const k = x.expense_categories?.name || '—'; m[k] = (m[k] || 0) + n(x.amount_usd); return m }, {})).sort((a, b) => b[1] - a[1])
  const setF = (k) => (e) => { setFlt({ ...flt, [k]: e.target.value }); setShownN(30) }
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
    <Page title={t('expenses')} actions={<AdminOnly>{!adding && <button className="btn" onClick={() => setAdding(true)}>+ {t('newExpense')}</button>}</AdminOnly>}>
      <Loading q={r}>{d && <>
        {msg && <div className="ok">{msg}</div>}
        {adding && <AdminOnly><ExpenseForm d={d} t={t} onCancel={() => setAdding(false)} onSaved={() => { setMsg(t('saved')); setAdding(false); r.reload() }} /></AdminOnly>}
        <Card title={t('recurringItems')} right={<AdminOnly><button className="btn" onClick={() => setRecForm({})}>{t('addRecurring')}</button></AdminOnly>}>
          <div className="xs muted">{t('recurringNote')}</div>
          {recForm && <RecurringForm d={d} t={t} init={recForm.init} onDone={() => { setRecForm(null); r.reload() }} />}
          {(() => {
            const active = d.recurring.filter((x) => x.active)
            const monthly = active.reduce((s, x) => s + n(x.amount_orig) * (d.rate(x.currency) || 0), 0)
            return <div className="small">{t('monthlyTotal')}: <b className="num">{usd(monthly)}</b> · {active.length} {t('items')}</div>
          })()}
          {d.recurring.map((rec) => <SalaryRow key={rec.recurring_id} rec={rec} t={t} lang={lang} cat={d.cats.find((c) => c.category_id === rec.category_id)?.name}
            last={d.paidRec.find((p) => p.recurring_id === rec.recurring_id)} usdAmt={n(rec.amount_orig) * (d.rate(rec.currency) || 0)}
            onConfirm={confirmSalary} onEdit={() => setRecForm({ init: rec })} />)}
        </Card>
        <Card title={t('allExpenses')}>
          <div className="form-grid">
            <label className="field"><span>{t('category')}</span><select value={flt.cat} onChange={setF('cat')}><option value="">{t('allCategories')}</option>{d.cats.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}</select></label>
            <label className="field"><span style={{ textTransform: 'capitalize' }}>{t('month')}</span><select value={flt.month} onChange={setF('month')}><option value="">{t('allMonths')}</option>{months.map((m) => <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { month: 'short', year: 'numeric' })}</option>)}</select></label>
            <label className="field"><span>{t('paidFrom')}</span><select value={flt.src} onChange={setF('src')}><option value="">{t('anySource')}</option><option value="company_account">{t('companyAccount')}</option><option value="partner_finance">{t('addedToFinance')}</option></select></label>
          </div>
          <div className="grid-kpi">
            <Kpi tone="soft" label={t('total')} value={usd(listTotal)} note={`${list.length} ${t('items')}`} />
            <div className="kpi soft" style={{ gridColumn: 'span 2' }}>
              <div className="small muted">{t('byCategory')}</div>
              {byCat.slice(0, 6).map(([k, v]) => (
                <div key={k} className="row gap8 xs"><span style={{ flex: '0 0 42%' }}>{k}</span>
                  <div className="meter" style={{ flex: 1, height: 8 }}><div style={{ width: (listTotal ? (100 * v) / listTotal : 0) + '%', background: 'var(--accent)' }} /></div>
                  <span className="num" style={{ flex: '0 0 70px', textAlign: 'end' }}>{usd(v, 0)}</span></div>
              ))}
            </div>
          </div>
          <Table cols={[
            { k: 'd', h: t('date'), num: 1, f: (x) => day(x.expense_date, lang) },
            { k: 'desc', h: t('description'), f: (x) => x.description },
            { k: 'c', h: t('category'), f: (x) => <span className="muted">{x.expense_categories?.name}</span> },
            { k: 's', h: t('paidFrom'), f: (x) => <Pill tone={x.funding_source === 'partner_finance' ? 'good' : 'grey'}>{x.funding_source === 'partner_finance' ? t('addedToFinance') : t('companyAccount')}</Pill> },
            { k: 'a', h: t('amount'), r: 1, num: 1, f: (x) => usd(x.amount_usd) }
          ]} rows={list.slice(0, shownN).map((x) => ({ ...x, key: x.expense_id }))} empty={t('nothingHere')} />
          {list.length > shownN && <div className="row gap8"><span className="xs muted">{shownN} / {list.length}</span>
            <button className="btn ghost" onClick={() => setShownN(shownN + 30)}>{t('showMore')}</button>
            <button className="btn ghost" onClick={() => setShownN(list.length)}>{t('showAll')}</button></div>}
        </Card>
      </>}</Loading>
    </Page>
  )
}

function SalaryRow({ rec, t, lang, cat, last, usdAmt, onConfirm, onEdit }) {
  const [src, setSrc] = useState(rec.default_funding_source || 'company_account')
  const ym = new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 7)
  const thisMonth = last && String(last.expense_date).slice(0, 7) === ym
  return (
    <div className="row between wrap gap16" style={{ padding: 14, borderRadius: 8, background: 'var(--ground)', opacity: rec.active ? 1 : 0.55 }}>
      <div>
        <b>{rec.name}</b> {!rec.active && <Pill tone="grey">{t('stopped')}</Pill>}
        <div className="xs muted">{cat}{rec.payee ? ` · ${rec.payee}` : ''} · <span className="num">{n(rec.amount_orig).toLocaleString()} {rec.currency}</span> = <span className="num">{usd(usdAmt)}</span> {t('perMonth')}
          {rec.day_of_month ? ` · ${t('dueDay')} ${rec.day_of_month}` : ''}</div>
        <div className="xs" style={{ marginTop: 4 }}>{last
          ? <span style={{ color: thisMonth ? 'var(--good)' : 'var(--warn)' }}>{thisMonth ? t('recordedThisMonth') : t('notYetThisMonth')} · {t('lastRecorded')} {day(last.expense_date, lang)}</span>
          : <span className="muted">{t('neverRecorded')}</span>}</div>
      </div>
      <AdminOnly><div className="row gap8 wrap">
        {rec.active && <>
          <select className="inp" style={{ width: 'auto' }} value={src} onChange={(e) => setSrc(e.target.value)} aria-label={t('paidFrom')}>
            <option value="partner_finance">{t('addedToFinance')}</option><option value="company_account">{t('companyAccount')}</option></select>
          <button className="btn primary" onClick={() => onConfirm(rec, src)}>{t('recordThisMonth')}</button></>}
        <button className="btn ghost" onClick={onEdit}>{t('edit')}</button>
      </div></AdminOnly>
    </div>
  )
}

function RecurringForm({ d, t, init, onDone }) {
  const [f, setF] = useState(init || { name: '', category_id: d.cats.find((c) => /internet/i.test(c.name))?.category_id || d.cats[0]?.category_id, payee: '',
    amount_orig: '', currency: 'SAR', day_of_month: 1, default_funding_source: 'company_account', active: true, start_date: new Date().toISOString().slice(0, 10) })
  const [msg, setMsg] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    if (!f.name.trim() || !n(f.amount_orig)) return setMsg(t('nameAmountRequired'))
    const row = { name: f.name.trim(), category_id: Number(f.category_id), payee: f.payee || null, amount_orig: n(f.amount_orig), currency: f.currency,
      day_of_month: Math.min(28, Math.max(1, Number(f.day_of_month) || 1)), default_funding_source: f.default_funding_source, active: !!f.active,
      start_date: f.start_date || new Date().toISOString().slice(0, 10), end_date: f.active ? null : (f.end_date || new Date().toISOString().slice(0, 10)) }
    const res = f.recurring_id ? await supabase.from('recurring_expenses').update(row).eq('recurring_id', f.recurring_id) : await supabase.from('recurring_expenses').insert(row)
    if (res.error) return setMsg(res.error.message)
    onDone()
  }
  return (
    <div className="card" style={{ border: '1px solid var(--line)' }}>
      <h2>{f.recurring_id ? t('editRecurring') : t('addRecurring')}</h2>
      <div className="form-grid">
        <label className="field" style={{ gridColumn: 'span 2' }}><span>{t('name')}</span><input value={f.name} placeholder={t('recurringNamePh')} onChange={set('name')} /></label>
        <label className="field"><span>{t('category')}</span><select value={f.category_id} onChange={set('category_id')}>{d.cats.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}</select></label>
        <label className="field"><span>{t('payee')}</span><input value={f.payee || ''} onChange={set('payee')} /></label>
        <label className="field"><span>{t('amount')}</span><input type="number" step="0.01" value={f.amount_orig} onChange={set('amount_orig')} /></label>
        <label className="field"><span>{t('currency')}</span><select value={f.currency} onChange={set('currency')}><option>USD</option><option>SAR</option><option>EUR</option><option>GBP</option><option>SDG</option></select></label>
        <label className="field"><span>{t('dueDay')}</span><input type="number" min="1" max="28" value={f.day_of_month || ''} onChange={set('day_of_month')} /></label>
        <label className="field"><span>{t('paidFrom')}</span><select value={f.default_funding_source} onChange={set('default_funding_source')}>
          <option value="company_account">{t('companyAccount')}</option><option value="partner_finance">{t('addedToFinance')}</option></select></label>
      </div>
      <label className="row gap8 small"><input type="checkbox" checked={!!f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />{t('recurringActive')}</label>
      {msg && <div className="alert">{msg}</div>}
      <div className="row gap8"><button className="btn primary" onClick={save}>{t('save')}</button><button className="btn" onClick={onDone}>{t('cancel')}</button></div>
    </div>
  )
}
