import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, day, n } from '../lib.js'
import { Page, Card, Kpi, Loading, Table, Pill } from '../ui.jsx'

async function load() {
  const [ledger, stmt, company] = await Promise.all([
    q(supabase.from('v_finance_ledger').select('*').order('entry_date')),
    q(supabase.from('v_partner_statement').select('*')),
    q(supabase.from('v_company_account').select('*').order('dt'))
  ])
  let bal = 0
  const rows = ledger.map((e, i) => {
    const signed = e.entry_type === 'repayment' ? -n(e.amount_usd) : n(e.amount_usd)
    bal += signed
    return { ...e, key: i, signed, after: bal }
  }).reverse()
  const drawn = ledger.filter((e) => e.entry_type !== 'repayment').reduce((s, e) => s + n(e.amount_usd), 0)
  const repaid = ledger.filter((e) => e.entry_type === 'repayment').reduce((s, e) => s + n(e.amount_usd), 0)
  const partners = {}
  stmt.forEach((s) => { const p = partners[s.partner] ||= { partner: s.partner, share: 0, repay: 0, total: 0 }
    p.share += n(s.profit_share_usd); p.repay += n(s.finance_repayment_usd); p.total += n(s.total_usd) })
  // totals per calendar year (by the period's end date, Riyadh)
  const yearOf = (v) => new Date(new Date(v).getTime() + 3 * 36e5 - 1000).getUTCFullYear()
  const byYear = {}
  stmt.forEach((s) => { const y = yearOf(s.period_end); (byYear[s.partner] ||= {})[y] = (byYear[s.partner][y] || 0) + n(s.total_usd) })
  const years = [...new Set(stmt.map((s) => yearOf(s.period_end)))].sort()
  return { rows, drawn, repaid, outstanding: drawn - repaid, partners: Object.values(partners), byYear, years, company: [...company].reverse(),
    companyBal: company.reduce((s, c) => s + n(c.amount_usd), 0) }
}

export default function Finance() {
  const { t, lang } = useApp()
  const r = useQuery(load)
  const d = r.data
  const [finN, setFinN] = useState(10)
  const [coN, setCoN] = useState(10)
  const order = ['Company', 'Ismail', 'Mohamed', 'Mustafa', 'Moayed']
  const more = (shown, total, setN) => total > 10 && (
    <div className="row gap8 wrap" style={{ alignItems: 'center' }}>
      <span className="xs muted">{t('showing')} {Math.min(shown, total)} / {total}</span>
      {shown < total && <button className="btn ghost" onClick={() => setN(shown + 20)}>{t('showMore')}</button>}
      {shown < total && <button className="btn ghost" onClick={() => setN(total)}>{t('showAll')}</button>}
      {shown > 10 && <button className="btn ghost" onClick={() => setN(10)}>{t('showLess')}</button>}
    </div>)
  return (
    <Page title={t('financePartners')}>
      <Loading q={r}>{d && <>
        <Card title={t('outstandingFinance')} right={<span className="xs muted">{t('lender')}: Ismail</span>}>
          <div className="grid-kpi">
            <Kpi tone="soft" label={t('totalFinanced')} value={usd(d.drawn)} />
            <Kpi tone="soft" label={t('repaidSoFar')} value={usd(d.repaid)} />
            <Kpi tone="warn" label={t('stillOwed')} value={usd(d.outstanding)} />
          </div>
          <div className="meter" role="img" aria-label={`${Math.round((100 * d.repaid) / (d.drawn || 1))}%`}>
            <div style={{ width: (100 * d.repaid) / (d.drawn || 1) + '%', background: 'var(--accent)' }} />
          </div>
          <Table cols={[
            { k: 'd', h: t('date'), num: 1, f: (x) => day(x.entry_date, lang) },
            { k: 'e', h: t('entry'), f: (x) => x.description },
            { k: 'ty', h: t('movement'), f: (x) => <Pill tone={x.signed < 0 ? 'good' : 'violet'}>{x.signed < 0 ? t('repaidMove') : t('financedMove')}</Pill> },
            { k: 'a', h: t('amount'), r: 1, num: 1, f: (x) => <span style={{ color: x.signed < 0 ? 'var(--accent-d)' : undefined }}>{x.signed < 0 ? '−' : '+'}{usd(Math.abs(x.signed))}</span> },
            { k: 'b', h: t('owedAfter'), r: 1, num: 1, f: (x) => usd(x.after) }
          ]} rows={d.rows.slice(0, finN)} />
          {more(finN, d.rows.length, setFinN)}
        </Card>

        <Card title={t('partnerStatements')}>
            <Table cols={[
              { k: 'partner', h: t('party') },
              { k: 'share', h: t('profitShare'), r: 1, num: 1, f: (x) => usd(x.share) },
              { k: 'repay', h: t('repayment'), r: 1, num: 1, f: (x) => (x.repay ? usd(x.repay) : '—') },
              ...d.years.map((y) => ({ k: 'y' + y, h: String(y), r: 1, num: 1, f: (x) => usd(d.byYear[x.partner]?.[y] || 0) })),
              { k: 'total', h: t('total'), r: 1, num: 1, f: (x) => usd(x.total) }
            ]} rows={[...d.partners].sort((a, b) => order.indexOf(a.partner) - order.indexOf(b.partner)).map((p) => ({ ...p, key: p.partner }))} />
        </Card>
        <Card title={t('companyAccount')} right={<span className="num" style={{ fontSize: 22 }}>{usd(d.companyBal)}</span>}>
            <Table cols={[
              { k: 'dt', h: t('date'), num: 1, f: (x) => day(x.dt, lang) },
              { k: 'source', h: t('entry'), f: (x) => <span className="xs">{x.source}</span> },
              { k: 'ty', h: t('movement'), f: (x) => <Pill tone={n(x.amount_usd) < 0 ? 'warn' : 'good'}>{n(x.amount_usd) < 0 ? t('moveOut') : t('moveIn')}</Pill> },
              { k: 'amount_usd', h: t('amount'), r: 1, num: 1, f: (x) => <span style={{ color: n(x.amount_usd) < 0 ? 'var(--warn)' : 'var(--accent-d)' }}>{usd(x.amount_usd)}</span> },
              { k: 'bal', h: t('balanceAfter'), r: 1, num: 1, f: (x) => usd(x.balance_usd) }
            ]} rows={d.company.slice(0, coN).map((c, i) => ({ ...c, key: i }))} />
            {more(coN, d.company.length, setCoN)}
            <div className="xs muted">{t('companyNote')}</div>
        </Card>
      </>}</Loading>
    </Page>
  )
}
