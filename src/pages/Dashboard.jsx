import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, int, day, monthLabel, n } from '../lib.js'
import { Page, Card, Kpi, Loading, Bars, Table, AdminOnly } from '../ui.jsx'

async function load() {
  const [draft, finance, company, monthly, unpriced, waiting, balances, providers] = await Promise.all([
    q(supabase.from('distribution_periods').select('period_id, period_start, period_end, repayment_rate').eq('status', 'draft').maybeSingle()),
    q(supabase.from('v_finance_balance').select('outstanding_usd')),
    q(supabase.from('v_company_account').select('amount_usd')),
    q(supabase.from('v_distributed_monthly').select('*').order('month')),
    q(supabase.from('v_unclassified').select('txn_id', { count: 'exact', head: true }).then((r) => ({ data: r.count, error: r.error }))),
    q(supabase.from('promo_redemptions').select('redemption_id', { count: 'exact', head: true }).eq('status', 'pending').then((r) => ({ data: r.count, error: r.error }))),
    q(supabase.from('v_latest_balances').select('*')),
    q(supabase.from('providers').select('provider_id, name, status').eq('track_balance', true).order('balance_order'))
  ])
  let preview = null
  if (draft) preview = (await q(supabase.rpc('period_preview', { p_period: draft.period_id })))[0]
  return {
    draft, preview, providers, balances, unpriced, waiting,
    outstanding: finance.reduce((s, r) => s + n(r.outstanding_usd), 0),
    company: company.reduce((s, r) => s + n(r.amount_usd), 0),
    monthly: monthly.slice(-13)
  }
}

function BalanceForm({ providers, onDone, t }) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [vals, setVals] = useState({})
  const [msg, setMsg] = useState('')
  const save = async () => {
    const provs = {}
    Object.entries(vals).forEach(([k, v]) => { if (k !== 'wallets' && v !== '' && v !== undefined) provs[k] = v })
    const wallets = vals.wallets === undefined || vals.wallets === '' ? null : Number(vals.wallets)
    if (wallets === null && !Object.keys(provs).length) return
    const { error } = await supabase.rpc('admin_save_balances', { p_date: date, p_wallets: wallets, p_providers: provs })
    if (error) return setMsg(error.message)
    onDone()
  }
  return (
    <div className="card" style={{ background: 'var(--ground)', border: 0 }}>
      <div className="form-grid">
        <label className="field"><span>{t('date')}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span>{t('customerWallets')}</span><input type="number" step="0.01" onChange={(e) => setVals({ ...vals, wallets: e.target.value })} /></label>
        {providers.map((p) => (
          <label key={p.provider_id} className="field"><span>{p.name}</span>
            <input type="number" step="0.01" onChange={(e) => setVals({ ...vals, [p.provider_id]: e.target.value })} /></label>
        ))}
      </div>
      {msg && <div className="alert">{msg}</div>}
      <div className="row gap8"><button className="btn primary" onClick={save}>{t('save')}</button><button className="btn" onClick={onDone}>{t('cancel')}</button></div>
    </div>
  )
}

export default function Dashboard() {
  const { t, lang } = useApp()
  const r = useQuery(load)
  const [editing, setEditing] = useState(false)
  const d = r.data
  return (
    <Page title={t('dashboard')} sub={d?.draft ? `${t('currentPeriod')} · ${day(d.draft.period_start, lang)} – ${day(new Date(new Date(d.draft.period_end) - 864e5), lang)}` : ''}>
      <Loading q={r}>{d && <>
        <div className="grid-kpi">
          <Kpi label={t('netProfit')} value={d.preview ? usd(d.preview.net) : '—'}
               note={d.preview ? `${t('draft')} · ${t('financeRepayment')} ${usd(d.preview.repayment)} · ${usd(d.preview.founder_share)} ${t('each')}` : t('noDraft')} />
          <Kpi label={t('outstandingFinance')} value={usd(d.outstanding)} note={d.draft ? `${t('repaymentRate')} ${Math.round(n(d.draft.repayment_rate) * 100)}%` : ''} />
          <Kpi label={t('companyAccount')} value={usd(d.company)} />
          <Kpi label={t('nextDistribution')} value={d.draft ? day(new Date(new Date(d.draft.period_end) - 864e5), lang) : '—'}
               note={<a href="#/distributions">{t('distributions')}</a>} />
        </div>

        <Card title={t('moneyHeld')} right={<AdminOnly><button className="btn" onClick={() => setEditing(true)}>{t('updateBalances')}</button></AdminOnly>}>
          {editing && <BalanceForm providers={d.providers} t={t} onDone={() => { setEditing(false); r.reload() }} />}
          <div className="split">
            {(() => { const w = d.balances.find((b) => b.kind === 'customer_wallets'); return (
              <Kpi tone="warn" label={t('customerWallets')} value={w ? usd(w.amount_usd) : t('notEnteredYet')}
                   note={(w ? `${t('asOf')} ${day(w.snapshot_date, lang)} · ` : '') + t('customerWalletsNote')} />) })()}
            <div className="wide">
              <Table cols={[
                { k: 'name', h: t('providerBalance') },
                { k: 'bal', h: t('balance'), r: 1, num: 1, f: (x) => x.b ? usd(x.b.amount_usd) : <span className="muted">{t('notEnteredYet')}</span> },
                { k: 'asof', h: t('asOf'), f: (x) => x.b ? day(x.b.snapshot_date, lang) : '—' }
              ]} rows={d.providers.map((p) => ({ key: p.provider_id, name: p.name, b: d.balances.find((b) => b.kind === 'provider' && b.provider === p.name) }))} />
            </div>
          </div>
        </Card>

        <div className="split">
          <Card title={t('profitDistributedByMonth')} className="wide">
            <Bars aria={t('profitDistributedByMonth')} items={d.monthly.map((m) => ({
              label: monthLabel(m.month, lang), top: '$' + (n(m.distributed_usd) / 1000).toFixed(1) + 'k',
              values: [n(m.distributed_usd)], colors: ['#9C86F0'], title: usd(m.distributed_usd)
            }))} />
          </Card>
          <Card title={t('needsAttention')}>
            <a className="attn" href="#/rules" style={{ background: d.unpriced ? 'var(--warn-s)' : 'var(--ground)' }}>
              <span className="num" style={{ fontSize: 20, color: d.unpriced ? 'var(--warn)' : 'var(--muted)' }}>{int(d.unpriced)}</span><span>{t('unpriced')}</span></a>
            <a className="attn" href="#/promos" style={{ background: 'var(--ground)' }}>
              <span className="num" style={{ fontSize: 20, color: 'var(--muted)' }}>{int(d.waiting)}</span><span>{t('waitingCards')}</span></a>
          </Card>
        </div>
      </>}</Loading>
    </Page>
  )
}
