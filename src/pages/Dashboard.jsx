import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, int, day, monthLabel, n, lastDay, lastClosedPeriod, monthlyRecurring, gapMonths } from '../lib.js'
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
  const quiet = await q(supabase.rpc('gone_quiet', { p_days: 30, p_limit: 2000 }))
  const [lastPer, recurring] = await Promise.all([lastClosedPeriod(), monthlyRecurring()])
  let preview = null, prog = null
  if (draft) [preview, prog] = (await Promise.all([q(supabase.rpc('period_preview_v2', { p_period: draft.period_id })), q(supabase.rpc('period_progress', { p_period: draft.period_id }))])).map((x) => x[0])
  return {
    draft, preview, prog, quiet, lastPer, recurring, providers, balances, unpriced, waiting,
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
        <label className="field"><span>{t('customerOwed')}</span><input type="number" step="0.01" onChange={(e) => setVals({ ...vals, wallets: e.target.value })} /></label>
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
  const [allQuiet, setAllQuiet] = useState(false)
  const d = r.data
  return (
    <Page title={t('dashboard')} sub={d?.draft ? `${t('currentPeriod')} · ${day(d.draft.period_start, lang)} – ${day(lastDay(d.draft.period_end), lang)}` : ''}>
      <Loading q={r}>{d && <>
        <div className="grid-kpi">
          <Kpi label={t('netProfit')} value={d.preview ? usd(d.preview.net) : '—'}
               note={d.preview ? `${t('draft')} · ${t('financeRepayment')} ${usd(d.preview.repayment)} · ${usd(d.preview.founder_share)} ${t('each')}` : t('noDraft')} />
          <Kpi label={t('outstandingFinance')} value={usd(d.outstanding)} note={d.draft ? `${t('repaymentRate')} ${Math.round(n(d.draft.repayment_rate) * 100)}%` : ''} />
          <Kpi label={t('companyAccount')} value={usd(d.company)} />
          <Kpi label={t('nextDistribution')} value={d.draft ? day(lastDay(d.draft.period_end), lang) : '—'}
               note={<a href="#/distributions">{t('distributions')}</a>} />
        </div>

        {(() => {
          const w = d.balances.find((b) => b.kind === 'customer_wallets')
          const rows = d.providers.map((p) => ({ key: p.provider_id, name: p.name, b: d.balances.find((b) => b.kind === 'provider' && b.provider === p.name) }))
          const total = rows.reduce((s, x) => s + (x.b ? n(x.b.amount_usd) : 0), 0)
          const owed = w ? n(w.amount_usd) : null
          const gap = owed === null ? null : owed - total
          const reserve = d.lastPer ? d.lastPer.company : 0
          const gm = gapMonths(gap, reserve, d.recurring)
          const fill = (k) => t(k).replace('{dates}', d.lastPer ? `${day(d.lastPer.period_start, lang)} – ${day(lastDay(d.lastPer.period_end), lang)}` : '')
            .replace('{amt}', usd(reserve)).replace('{mi}', usd(gm.monthlyIn, 0)).replace('{rec}', usd(d.recurring, 0)).replace('{left}', usd(gm.left, 0)).replace('{m}', gm.months)
          return (
            <Card title={t('walletsHeading')} right={<AdminOnly><button className="btn" onClick={() => setEditing(true)}>{t('updateBalances')}</button></AdminOnly>}>
              {editing && <BalanceForm providers={d.providers} t={t} onDone={() => { setEditing(false); r.reload() }} />}
              <div className="grid-kpi">
                <Kpi tone="soft" label={t('customerOwed')} value={owed === null ? t('notEnteredYet') : usd(owed)} note={w ? `${t('asOf')} ${day(w.snapshot_date, lang)}` : ''} />
                <Kpi tone="soft" label={t('walletsTotal')} value={usd(total)} note={rows.filter((x) => !x.b).length ? `${rows.filter((x) => !x.b).length} × ${t('notEnteredYet')}` : ''} />
                <Kpi tone={gap > 0 ? 'warn' : 'good'} label={gap > 0 ? t('gapShort') : t('surplus')} value={gap === null ? '—' : usd(Math.abs(gap))}
                     note={gap > 0 ? (!d.lastPer ? t('gapNoReserve') : isFinite(gm.months) ? fill('gapLastPeriod') : fill('gapNeverCloses')) : ''} />
              </div>
              <Table cols={[
                { k: 'name', h: t('walletCol') },
                { k: 'bal', h: t('balance'), r: 1, num: 1, f: (x) => x.total ? <b>{usd(x.v)}</b> : x.b ? usd(x.b.amount_usd) : <span className="muted">{t('notEnteredYet')}</span> },
                { k: 'asof', h: t('asOf'), f: (x) => x.total ? '' : x.b ? day(x.b.snapshot_date, lang) : '—' }
              ]} rows={[...rows, { key: 'total', name: <b>{t('total')}</b>, total: true, v: total }]} />
              <div className="xs muted">{t('customerWalletsNote')}</div>
            </Card>
          )
        })()}

        <Card title={`${t('goneQuietTitle')} · ${int(d.quiet.length)}`} right={<span className="xs muted">{t('goneQuietRule')}</span>}>
          {d.quiet.length ? <>
            <div className="small">{t('goneQuietLost')} <b className="num">{usd(d.quiet.reduce((s, x) => s + n(x.profit_per_month), 0), 0)}</b> {t('perMonthShort')}</div>
            <Table cols={[
              { k: 'c', h: t('customer'), f: (x) => <a href={'#/transactions?q=' + encodeURIComponent(x.email)}><div className="xs">{x.username || x.email}</div>{x.username && <div className="xs muted num">{x.email}</div>}</a> },
              { k: 'l', h: t('lastActive'), num: 1, f: (x) => day(x.last_active, lang) },
              { k: 'q', h: t('daysQuiet'), r: 1, num: 1, f: (x) => <span style={{ color: x.days_quiet > 60 ? 'var(--warn)' : undefined }}>{int(x.days_quiet)}</span> },
              { k: 'm', h: t('activeMonths'), r: 1, num: 1, f: (x) => int(x.active_months) },
              { k: 'pm', h: t('profitPerMonth'), r: 1, num: 1, f: (x) => usd(x.profit_per_month) },
              { k: 'lp', h: t('lifetimeProfit'), r: 1, num: 1, f: (x) => usd(x.lifetime_profit) },
              { k: 'mi', h: t('moneyIn'), r: 1, num: 1, f: (x) => usd(x.money_in, 0) }
            ]} rows={(allQuiet ? d.quiet : d.quiet.slice(0, 10)).map((x) => ({ ...x, key: x.customer_id }))} />
            {d.quiet.length > 10 && <button className="btn ghost" onClick={() => setAllQuiet(!allQuiet)}>{allQuiet ? t('showLess') : `${t('showAll')} (${int(d.quiet.length)})`}</button>}
          </> : <div className="muted">{t('nothingHere')}</div>}
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
