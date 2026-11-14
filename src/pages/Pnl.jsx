import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, monthLabel, n } from '../lib.js'
import { Page, Card, Kpi, Loading, Table, Bars } from '../ui.jsx'

const sum = (rows, k) => rows.reduce((s, r) => s + n(r[k]), 0)

export default function Pnl() {
  const { t, lang } = useApp()
  const r = useQuery(() => q(supabase.rpc('pnl_monthly', { p_months: 60 })))
  const d = r.data
  const years = d ? [...new Set(d.rows.map((x) => String(x.month).slice(0, 4)))].sort().reverse() : []
  const [yr, setYr] = useState('last12')
  const rows = !d ? [] : yr === 'last12' ? d.rows.slice(-12) : yr === 'all' ? d.rows : d.rows.filter((x) => String(x.month).startsWith(yr))
  const tot = { gross: sum(rows, 'gross'), promos: sum(rows, 'promos'), expenses: sum(rows, 'expenses'), net: sum(rows, 'net'), founders: sum(rows, 'founders'), company: sum(rows, 'company'), repay: sum(rows, 'repay') }
  const cats = !d ? [] : Object.entries(d.categories.filter((c) => yr === 'last12' || yr === 'all' || c.yr === yr)
    .reduce((m, c) => { m[c.category] = (m[c.category] || 0) + n(c.total); return m }, {})).sort((a, b) => b[1] - a[1])
  const catTotal = cats.reduce((s, c) => s + c[1], 0)
  const money = (v, strong) => <span style={{ color: n(v) < 0 ? 'var(--warn)' : undefined, fontWeight: strong ? 600 : undefined }}>{usd(v, 0)}</span>
  return (
    <Page title={t('pnl')} sub={t('pl_sub')} actions={
      <div className="row gap8 wrap" role="group" aria-label={t('range')}>
        {['last12', ...years, 'all'].map((k) => <button key={k} className={'btn ' + (yr === k ? 'on' : '')} aria-pressed={yr === k} onClick={() => setYr(k)}>{k === 'last12' ? t('pl_last12') : k === 'all' ? t('allTime') : k}</button>)}
      </div>}>
      <Loading q={r}>{d && <>
        <div className="grid-kpi">
          <Kpi label={t('pl_gross')} value={usd(tot.gross, 0)} />
          <Kpi label={t('pl_promos')} value={usd(-tot.promos, 0)} note={tot.gross ? `${(100 * tot.promos / tot.gross).toFixed(0)}% ${t('pl_ofProfit')}` : ''} />
          <Kpi label={t('expenses')} value={usd(-tot.expenses, 0)} note={tot.gross ? `${(100 * tot.expenses / tot.gross).toFixed(0)}% ${t('pl_ofProfit')}` : ''} />
          <Kpi tone={tot.net < 0 ? 'warn' : 'good'} label={t('pl_net')} value={usd(tot.net, 0)} note={tot.gross ? `${(100 * tot.net / tot.gross).toFixed(0)}% ${t('pl_ofProfit')}` : ''} />
        </div>
        {n(d.undated_promos) > 0 && (yr === 'all' || yr === 'last12') && <div className="alert">{t('pl_undated').replace('{a}', usd(d.undated_promos, 0))}</div>}

        <Card title={t('pl_chart')} right={<div className="legend"><span><i className="dot" style={{ background: '#7C5CF6' }} />{t('pl_gross')}</span><span><i className="dot" style={{ background: '#E8833A' }} />{t('pl_costs')}</span></div>}>
          {rows.length ? <Bars aria={t('pl_chart')} height={220} items={rows.map((m) => ({
            label: monthLabel(m.month, lang), sub: usd(m.net, 0), tops: ['', ''],
            values: [Math.max(0, n(m.gross)), n(m.promos) + n(m.expenses)], colors: ['#7C5CF6', '#E8833A'],
            title: `${t('pl_gross')} ${usd(m.gross, 0)} · ${t('pl_costs')} ${usd(n(m.promos) + n(m.expenses), 0)} · ${t('pl_net')} ${usd(m.net, 0)}` }))} />
            : <div className="muted">{t('nothingHere')}</div>}
          <div className="xs muted">{t('pl_chartNote')}</div>
        </Card>

        <div className="split">
          <Card title={t('pl_byMonth')} className="wide">
            <Table cols={[
              { k: 'm', h: t('month'), f: (x) => (x.total ? <b>{t('total')}</b> : monthLabel(x.month, lang)) },
              { k: 'g', h: t('pl_gross'), r: 1, num: 1, f: (x) => money(x.gross, x.total) },
              { k: 'p', h: t('pl_promos'), r: 1, num: 1, f: (x) => money(-n(x.promos), x.total) },
              { k: 'e', h: t('expenses'), r: 1, num: 1, f: (x) => money(-n(x.expenses), x.total) },
              { k: 'n', h: t('pl_net'), r: 1, num: 1, f: (x) => money(x.net, true) },
              { k: 'f', h: t('pl_founders'), r: 1, num: 1, f: (x) => <span className="muted">{usd(x.founders, 0)}</span> }
            ]} rows={[...[...rows].reverse().map((x) => ({ ...x, key: x.month })), { key: 'total', total: true, ...tot }]} empty={t('nothingHere')} />
            <div className="xs muted">{t('pl_note')}</div>
          </Card>
          <Card title={t('pl_expenseCats')}>
            {cats.length ? cats.map(([k, v]) => (
              <div key={k}>
                <div className="row between small"><span>{k}</span><span className="num">{usd(v, 0)}</span></div>
                <div className="meter" style={{ height: 8, marginTop: 4 }}><div style={{ width: (catTotal ? (100 * v) / catTotal : 0) + '%', background: 'var(--accent)' }} /></div>
              </div>
            )) : <div className="muted">{t('nothingHere')}</div>}
            {yr === 'last12' && <div className="xs muted">{t('pl_catsNote')}</div>}
          </Card>
        </div>
      </>}</Loading>
    </Page>
  )
}
