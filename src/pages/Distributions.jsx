import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, day, n } from '../lib.js'
import { Page, Card, Loading, Table, Pill, AdminOnly } from '../ui.jsx'

async function load(rate) {
  const draft = await q(supabase.from('distribution_periods').select('*').eq('status', 'draft').maybeSingle())
  const preview = draft ? (await q(supabase.rpc('period_preview', { p_period: draft.period_id, p_rate: rate })))[0] : null
  const history = await q(supabase.from('distribution_periods').select('*').neq('status', 'draft').order('period_start', { ascending: false }))
  const lines = await q(supabase.from('v_partner_statement').select('*').in('period_id', history.slice(0, 8).map((h) => h.period_id)))
  return { draft, preview, history, lines }
}

const RATES = [0, 0.1, 0.2, 0.5, 1]

export default function Distributions() {
  const { t, lang, role } = useApp()
  const [rate, setRate] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const r = useQuery(() => load(rate), [rate])
  const d = r.data
  const p = d?.preview
  const effRate = rate ?? (d?.draft ? n(d.draft.repayment_rate) : 0)

  const act = async (fn) => {
    setBusy(true); setMsg('')
    const { error } = await fn()
    setBusy(false)
    if (error) setMsg(error.message); else { setRate(null); r.reload() }
  }
  const endDay = (x) => day(new Date(new Date(x) - 864e5), lang)

  return (
    <Page title={t('distributions')} sub={d?.draft ? `${day(d.draft.period_start, lang)} – ${endDay(d.draft.period_end)}` : ''}
      actions={d?.draft ? <Pill tone="warn">{t('draft')}</Pill> : null}>
      <Loading q={r}>{d && <>
        {msg && <div className="alert">{msg}</div>}
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
            <div className="step good"><div><b>{t('toDistribute')}</b><div className="xs">{t('splitFive')} · {usd(p.founder_share)} {t('each')}</div></div><b className="num">{usd(p.distributable)}</b></div>
          </Card>
          <Card title={t('payouts')}>
            <Table cols={[{ k: 'n', h: t('party') }, { k: 's', h: t('profitShare'), r: 1, num: 1 }, { k: 'r', h: t('repayment'), r: 1, num: 1 }, { k: 'tt', h: t('total'), r: 1, num: 1 }]}
              rows={[['Company', p.company_share, 0], ['Ismail', p.founder_share, p.repayment], ['Mohamed', p.founder_share, 0], ['Mustafa', p.founder_share, 0], ['Moayed', p.founder_share, 0]]
                .map(([nm, s, rp]) => ({ key: nm, n: nm, s: usd(s), r: rp ? usd(rp) : '—', tt: usd(n(s) + n(rp)) }))} />
            {role === 'admin' && <div className="row gap8 wrap" style={{ marginTop: 'auto' }}>
              <button className="btn" disabled={busy} onClick={() => act(() => supabase.rpc('admin_recalculate_period', { p_period: d.draft.period_id, p_rate: effRate }))}>{t('recalculate')}</button>
              <button className="btn primary" disabled={busy} onClick={async () => {
                await supabase.rpc('admin_recalculate_period', { p_period: d.draft.period_id, p_rate: effRate })
                act(() => supabase.rpc('approve_period_guarded', { p_period: d.draft.period_id }))
              }}>{t('approveLock')}</button>
            </div>}
          </Card>
        </div>}

        <Card title={t('earlierPeriods')}>
          <Table cols={[
            { k: 'end', h: t('periodEnding'), num: 1, f: (x) => endDay(x.period_end) },
            { k: 'net', h: t('netProfit'), r: 1, num: 1, f: (x) => usd(x.net_profit_usd) },
            { k: 'rate', h: t('repaymentRate'), r: 1, num: 1, f: (x) => Math.round(n(x.repayment_rate) * 1000) / 10 + '%' },
            { k: 'rep', h: t('repayment'), r: 1, num: 1, f: (x) => usd(x.repayment_usd) },
            { k: 'each', h: t('eachOfFive'), r: 1, num: 1, f: (x) => usd(n(x.distributable_usd) / 5) },
            { k: 'st', h: t('status'), f: (x) => <Pill tone="good">{t(x.status)}</Pill> }
          ]} rows={d.history.map((h) => ({ ...h, key: h.period_id }))} />
        </Card>
      </>}</Loading>
    </Page>
  )
}
