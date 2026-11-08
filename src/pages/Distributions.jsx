import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, day, n, gapForecast, projectPeriod, lastDay } from '../lib.js'
import { Page, Card, Loading, Table, Pill, AdminOnly } from '../ui.jsx'
import { Payouts } from './Payouts.jsx'

async function load(rate, crate) {
  const draft = await q(supabase.from('distribution_periods').select('*').eq('status', 'draft').maybeSingle())
  const preview = draft ? (await q(supabase.rpc('period_preview_v2', { p_period: draft.period_id, p_rate: rate, p_company_rate: crate })))[0] : null
  const prog = draft ? (await q(supabase.rpc('period_progress', { p_period: draft.period_id })))[0] : null
  const cm = await q(supabase.from('v_customer_money').select('*').order('snapshot_date', { ascending: false }).limit(1))
  const history = await q(supabase.from('distribution_periods').select('*').neq('status', 'draft').order('period_start', { ascending: false }))
  const lines = await q(supabase.from('v_partner_statement').select('*').in('period_id', history.slice(0, 8).map((h) => h.period_id)))
  const founder = await q(supabase.from('distribution_lines').select('period_id, amount_usd').eq('partner_id', 3).eq('line_type', 'profit_share'))
  return { draft, preview, prog, history, lines, founder, gap: cm[0] && cm[0].customer_money !== null ? n(cm[0].customer_money) - n(cm[0].wallets_total) : null }
}

const RATES = [0, 0.05, 0.1, 0.2, 0.5, 1]
const CRATES = [0.2, 0.3, 0.35, 0.4, 0.5]

export default function Distributions() {
  const { t, lang, role } = useApp()
  const [rate, setRate] = useState(null)
  const [crate, setCrate] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [view, setView] = useState(null)
  const r = useQuery(() => load(rate, crate), [rate, crate])
  const d = r.data
  const p = d?.preview
  const effRate = rate ?? (d?.draft ? n(d.draft.repayment_rate) : 0)
  const effCrate = crate ?? (d?.draft && d.draft.company_rate !== null ? n(d.draft.company_rate) : 0.2)
  const pr = d && p ? projectPeriod(n(p.company_share), d.prog) : null
  const fc = pr && d.gap > 0 ? gapForecast(d.gap, pr.projected) : null

  const act = async (fn) => {
    setBusy(true); setMsg('')
    const { error } = await fn()
    setBusy(false)
    if (error) setMsg(error.message); else { setRate(null); setCrate(null); r.reload() }
  }
  const endDay = (x) => day(lastDay(x), lang)

  return (
    <Page title={t('distributions')} sub={d?.draft ? `${day(d.draft.period_start, lang)} – ${endDay(d.draft.period_end)}` : ''}
      actions={d?.draft ? <Pill tone="violet">{t('openPeriod')}</Pill> : null}>
      <Loading q={r}>{d && <>
        {msg && <div className="alert">{msg}</div>}
        {d.draft && <div className="ok xs">{t('openPeriodHint')}</div>}
        {view && <PeriodDetail period={view} t={t} lang={lang} onClose={() => setView(null)} />}
        {!d.draft && <Card><div className="muted">{t('noDraft')}</div>
          <AdminOnly><button className="btn primary" disabled={busy} onClick={() => act(() => supabase.rpc('admin_open_next_period'))}>{t('openNext')}</button></AdminOnly></Card>}
        {p && <div className="split">
          <Card title={t('howCalculated')} className="wide" style={{ gap: 4 }}>
            <div className="step"><span>{t('grossProfit')}</span><span className="num">{usd(p.gross)}</span></div>
            <div className="step"><span>{t('lessPromos')}</span><span className="num" style={{ color: 'var(--warn)' }}>−{usd(p.promos)}</span></div>
            <div className="step"><span>{t('adjustments')}</span><span className="num">{usd(p.adjustments)}</span></div>
            <div className="step total"><b>{t('netProfit')}</b><b className="num">{usd(p.net)}</b></div>
            <div className="step" style={{ flexDirection: 'column', gap: 10 }}>
              <div className="row between"><div><div>{t('financeRepayment')}</div><div className="xs muted">{t('cappedNote')} ({usd(p.outstanding)})</div></div>
                <span className="num" style={{ color: 'var(--warn)' }}>−{usd(p.repayment)}</span></div>
              <div className="row gap8 wrap" role="group" aria-label={t('repaymentRate')}>
                {RATES.map((x) => <button key={x} className={'btn ' + (Math.abs(x - effRate) < 1e-6 ? 'on' : '')} aria-pressed={Math.abs(x - effRate) < 1e-6}
                  onClick={() => setRate(x)}>{x === 1 ? 'All' : Math.round(x * 100) + '%'}</button>)}
              </div>
            </div>
            <div className="step" style={{ flexDirection: 'column', gap: 10 }}>
              <div className="row between"><div><div>{t('companyReserve')} · {Math.round(effCrate * 100)}%</div><div className="xs muted">{t('companyReserveNote')} · {t('rate20Note')}</div></div>
                <span className="num" style={{ color: 'var(--accent-d)' }}>{usd(p.company_share)}</span></div>
              <div className="row gap8 wrap" role="group" aria-label={t('companyRate')}>
                {CRATES.map((x) => <button key={x} className={'btn ' + (Math.abs(x - effCrate) < 1e-6 ? 'on' : '')} aria-pressed={Math.abs(x - effCrate) < 1e-6}
                  onClick={() => setCrate(x)}>{Math.round(x * 100)}%</button>)}
                <label className="row gap8 xs muted">{t('customRate')}
                  <input className="inp" style={{ width: 80 }} type="number" min="0" max="100" step="1" aria-label={t('customRate')}
                    onKeyDown={(e) => { if (e.key === 'Enter') setCrate(Math.min(100, Math.max(0, Number(e.target.value))) / 100) }}
                    onBlur={(e) => { if (e.target.value !== '') setCrate(Math.min(100, Math.max(0, Number(e.target.value))) / 100) }} /></label>
              </div>
              {d.gap > 0 && <div className="xs" style={{ color: 'var(--warn)' }}>{t('gapCloses')}: <b className="num">{usd(d.gap)}</b>{fc && isFinite(fc.periods) ? ' · ' + t('closesIn').replace('{amt}', usd(pr.projected)).replace('{pd}', usd(pr.perDay ?? pr.projected / 14)).replace('{p}', fc.periods).replace('{m}', fc.months) : ''}</div>}
            </div>
            <div className="step good"><div><b>{t('toDistribute')}</b><div className="xs">{t('splitFour')} · {usd(p.founder_share)} {t('each')}</div></div><b className="num">{usd(n(p.founder_share) * 4)}</b></div>
          </Card>
          <Card title={t('payouts')}>
            <Table cols={[{ k: 'n', h: t('party') }, { k: 's', h: t('profitShare'), r: 1, num: 1 }, { k: 'r', h: t('repayment'), r: 1, num: 1 }, { k: 'tt', h: t('total'), r: 1, num: 1 }]}
              rows={[['Company', p.company_share, 0], ['Ismail', p.founder_share, p.repayment], ['Mohamed', p.founder_share, 0], ['Mustafa', p.founder_share, 0], ['Moayed', p.founder_share, 0]]
                .map(([nm, s, rp]) => ({ key: nm, n: nm, s: usd(s), r: rp ? usd(rp) : '—', tt: usd(n(s) + n(rp)) }))} />
            {role === 'admin' && <div className="row gap8 wrap" style={{ marginTop: 'auto' }}>
              <button className="btn" disabled={busy} onClick={() => act(() => supabase.rpc('admin_recalculate_period_v2', { p_period: d.draft.period_id, p_rate: effRate, p_company_rate: effCrate }))}>{t('recalculate')}</button>
              <button className="btn primary" disabled={busy} onClick={async () => {
                await supabase.rpc('admin_recalculate_period_v2', { p_period: d.draft.period_id, p_rate: effRate, p_company_rate: effCrate })
                act(() => supabase.rpc('approve_period_guarded', { p_period: d.draft.period_id }))
              }}>{t('approveLock')}</button>
            </div>}
          </Card>
        </div>}

        {d.history.filter((h) => h.status === 'approved').map((h) => (
          <Card key={h.period_id} title={`${t('paymentsFor')} ${day(h.period_start, lang)} – ${endDay(h.period_end)}`}>
            <Payouts period={h} onChanged={() => r.reload()} />
          </Card>
        ))}

        <Card title={t('earlierPeriods')}>
          <Table cols={[
            { k: 'end', h: t('periodEnding'), num: 1, f: (x) => endDay(x.period_end) },
            { k: 'net', h: t('netProfit'), r: 1, num: 1, f: (x) => usd(x.net_profit_usd) },
            { k: 'rate', h: t('repaymentRate'), r: 1, num: 1, f: (x) => Math.round(n(x.repayment_rate) * 1000) / 10 + '%' },
            { k: 'rep', h: t('repayment'), r: 1, num: 1, f: (x) => usd(x.repayment_usd) },
            { k: 'each', h: t('eachFounder'), r: 1, num: 1, f: (x) => { const l = d.founder.find((f) => f.period_id === x.period_id); return usd(l ? l.amount_usd : n(x.distributable_usd) / 5) } },
            { k: 'st', h: t('status'), f: (x) => <Pill tone={x.status === 'paid' ? 'good' : 'warn'}>{t(x.status)}</Pill> },
            { k: 'v', h: '', r: 1, f: (x) => <button className="btn" onClick={() => setView(x)}>{t('viewPayments')}</button> }
          ]} rows={d.history.map((h) => ({ ...h, key: h.period_id }))} />
        </Card>
      </>}</Loading>
    </Page>
  )
}

async function loadDetail(period) {
  const [lines, mix] = await Promise.all([
    q(supabase.from('distribution_lines').select('line_type, amount_usd, share_pct, paid_on, payout_ref, partners(name)').eq('period_id', period.period_id)),
    q(supabase.rpc('stats_range', { p_from: period.period_start, p_to: period.period_end }))
  ])
  return { lines, mix }
}

const ORDER = ['Company', 'Ismail', 'Mohamed', 'Mustafa', 'Moayed']

function PeriodDetail({ period, t, lang, onClose }) {
  const r = useQuery(() => loadDetail(period), [period.period_id])
  const d = r.data
  const endDay = (x) => day(lastDay(x), lang)
  const byParty = {}
  ;(d?.lines || []).forEach((l) => {
    const k = l.partners?.name
    const o = (byParty[k] ||= { party: k, share: 0, repay: 0, paid_on: l.paid_on, ref: l.payout_ref })
    if (l.line_type === 'profit_share') o.share += n(l.amount_usd); else o.repay += n(l.amount_usd)
    o.paid_on = o.paid_on || l.paid_on
  })
  const rows = Object.values(byParty).sort((a, b) => ORDER.indexOf(a.party) - ORDER.indexOf(b.party))
  const lineTotal = rows.reduce((s, x) => s + x.share + x.repay, 0)
  const providers = {}
  ;(d?.mix?.mix || []).forEach((m) => { providers[m.line] = (providers[m.line] || 0) + n(m.profit) })
  return (
    <div className="modal-back" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <Card title={`${t('periodEnding')} ${endDay(period.period_end)}`} right={<button className="btn" onClick={onClose}>✕</button>}>
          <div className="xs muted">{day(period.period_start, lang)} – {endDay(period.period_end)} · {t('approvedOn')} {day(period.approved_on, lang)}</div>
          <Loading q={r}>{d && <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {period.gross_profit_usd !== null && <div className="step"><span>{t('grossProfit')}</span><span className="num">{usd(period.gross_profit_usd)}</span></div>}
              {period.promo_costs_usd !== null && <div className="step"><span>{t('lessPromos')}</span><span className="num">−{usd(period.promo_costs_usd)}</span></div>}
              {n(period.adjustments_usd) !== 0 && <div className="step"><span>{t('adjustments')}</span><span className="num">{usd(period.adjustments_usd)}</span></div>}
              <div className="step total"><b>{t('netProfit')}</b><b className="num">{usd(period.net_profit_usd)}</b></div>
              <div className="step"><span>{t('financeRepayment')} ({(n(period.repayment_rate) * 100).toFixed(1).replace(/\.0$/, '')}%)</span><span className="num">−{usd(period.repayment_usd)}</span></div>
              <div className="step good"><b>{t('toDistribute')}</b><b className="num">{usd(period.distributable_usd)}</b></div>
            </div>
            <h2>{t('payouts')}</h2>
            <Payouts period={period} />
            {period.notes && <div className="xs muted">{period.notes}</div>}
            <h2>{t('txnsInPeriod')}</h2>
            <div className="xs muted">{t('txnsInPeriodHint')}</div>
            <Table cols={[{ k: 'l', h: t('productLine') }, { k: 'p', h: t('profit'), r: 1, num: 1, f: (x) => usd(x.p) }]}
              rows={Object.entries(providers).sort((a, b) => b[1] - a[1]).map(([l, p]) => ({ key: l, l, p }))} empty={t('nothingHere')} />
          </>}</Loading>
        </Card>
      </div>
    </div>
  )
}
