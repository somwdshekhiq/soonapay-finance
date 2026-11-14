import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, day, n, lastDay } from '../lib.js'
import { Page, Card, Kpi, Loading, Table, Pill, Bars } from '../ui.jsx'

async function load() {
  const [partners, lines] = await Promise.all([
    q(supabase.from('partners').select('partner_id, name, is_company').order('partner_id')),
    q(supabase.from('distribution_lines').select('partner_id, line_type, amount_usd, paid_on, payout_ref, paid_amount, paid_currency, distribution_periods!inner(period_id, period_start, period_end, status)').limit(2000))
  ])
  return { partners, lines }
}

export default function Partner() {
  const { t, lang, partnerId } = useApp()
  const r = useQuery(load)
  const d = r.data
  const [sel, setSel] = useState(null)
  const [shown, setShown] = useState(8)
  const pid = sel ?? partnerId ?? d?.partners.find((p) => !p.is_company)?.partner_id
  const me = d?.partners.find((p) => p.partner_id === pid)
  const by = {}
  for (const l of d?.lines || []) {
    if (l.partner_id !== pid || !n(l.amount_usd)) continue
    const p = l.distribution_periods
    const o = (by[p.period_id] ||= { key: p.period_id, start: p.period_start, end: p.period_end, status: p.status, share: 0, repay: 0, paid_on: null, ref: null, paid_amount: null, cur: null })
    if (l.line_type === 'profit_share') o.share += n(l.amount_usd); else o.repay += n(l.amount_usd)
    o.paid_on = o.paid_on || l.paid_on; o.ref = o.ref || l.payout_ref; o.paid_amount = o.paid_amount ?? l.paid_amount; o.cur = o.cur || l.paid_currency
  }
  const rows = Object.values(by).sort((a, b) => new Date(b.end) - new Date(a.end))
  const closed = rows.filter((x) => x.status !== 'draft')
  const yearNow = String(new Date().getFullYear())
  const tot = (list, k) => list.reduce((s, x) => s + x[k], 0)
  const waiting = closed.filter((x) => !x.paid_on && !me?.is_company)
  const open = rows.find((x) => x.status === 'draft')
  const chart = [...closed].slice(0, 12).reverse()
  return (
    <Page title={t('partnerStatement')} sub={t('ps_sub')} actions={d && (
      <div className="row gap8 wrap" role="group" aria-label={t('party')}>
        {d.partners.map((p) => <button key={p.partner_id} className={'btn ' + (p.partner_id === pid ? 'on' : '')} aria-pressed={p.partner_id === pid} onClick={() => { setSel(p.partner_id); setShown(8) }}>{p.name}</button>)}
      </div>)}>
      <Loading q={r}>{d && me && <>
        <div className="grid-kpi">
          <Kpi tone="good" label={t('ps_total')} value={usd(tot(closed, 'share'))} note={`${closed.length} ${t('ps_periods')}`} />
          <Kpi label={`${t('ps_year')} ${yearNow}`} value={usd(tot(closed.filter((x) => String(x.end).startsWith(yearNow)), 'share'))} />
          {tot(closed, 'repay') > 0 && <Kpi label={t('ps_repaid')} value={usd(tot(closed, 'repay'))} />}
          {!me.is_company && <Kpi tone={waiting.length ? 'warn' : 'soft'} label={t('ps_waiting')} value={usd(tot(waiting, 'share') + tot(waiting, 'repay'))} note={waiting.length ? `${waiting.length} ${t('ps_periods')}` : t('ps_allPaid')} />}
          {open && <Kpi tone="soft" label={t('ps_open')} value={usd(open.share + open.repay)} note={`${t('periodEnding')} ${day(lastDay(open.end), lang)}`} />}
        </div>
        <Card title={t('ps_chart')}>
          {chart.length ? <Bars aria={t('ps_chart')} height={190} items={chart.map((x) => ({
            label: day(lastDay(x.end), lang).slice(0, 6), tops: [usd(x.share, 0)], values: [Math.max(0, x.share)], colors: ['#7C5CF6'], title: usd(x.share) }))} />
            : <div className="muted">{t('nothingHere')}</div>}
        </Card>
        <Card title={t('ps_byPeriod')}>
          <Table cols={[
            { k: 'e', h: t('periodEnding'), num: 1, f: (x) => day(lastDay(x.end), lang) },
            { k: 's', h: t('profitShare'), r: 1, num: 1, f: (x) => usd(x.share) },
            { k: 'r', h: t('repayment'), r: 1, num: 1, f: (x) => (x.repay ? usd(x.repay) : '—') },
            { k: 't', h: t('total'), r: 1, num: 1, f: (x) => <b>{usd(x.share + x.repay)}</b> },
            { k: 'st', h: t('status'), f: (x) => x.status === 'draft' ? <Pill tone="violet">{t('ps_openPill')}</Pill>
              : me.is_company ? <Pill tone="grey">{t('ps_kept')}</Pill>
              : x.paid_on ? <Pill tone="good">{t('paid')} · {day(x.paid_on, lang)}</Pill> : <Pill tone="warn">{t('ps_waitingPill')}</Pill> },
            { k: 'ref', h: t('reference'), f: (x) => <span className="xs muted num">{x.ref || ''}{x.paid_amount && x.cur && x.cur !== 'USD' ? ` · ${n(x.paid_amount).toLocaleString()} ${x.cur}` : ''}</span> }
          ]} rows={rows.slice(0, shown)} empty={t('nothingHere')} />
          {rows.length > shown && <div className="row gap8"><span className="xs muted">{shown} / {rows.length}</span>
            <button className="btn ghost" onClick={() => setShown(shown + 12)}>{t('showMore')}</button>
            <button className="btn ghost" onClick={() => setShown(rows.length)}>{t('showAll')}</button></div>}
        </Card>
      </>}</Loading>
    </Page>
  )
}
