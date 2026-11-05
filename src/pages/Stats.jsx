import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, int, pct, monthLabel, day, n } from '../lib.js'
import { Page, Card, Kpi, Loading, Bars, Table, Pill, Trend } from '../ui.jsx'

const IN = '#5B2EE6', OUT = '#1E9BC8', SOFT = '#9C86F0'
const toIso = (d) => new Date(d).toISOString().slice(0, 10)

async function load(range) {
  let from, to
  if (range.mode === 'period') {
    const p = await q(supabase.from('distribution_periods').select('period_start, period_end').eq('status', 'draft').maybeSingle())
    from = p ? p.period_start : new Date(Date.now() - 14 * 864e5).toISOString()
    to = p ? p.period_end : new Date().toISOString()
  } else if (range.mode === 'range') {
    from = range.from + 'T00:00:00+03:00'
    to = new Date(new Date(range.to + 'T00:00:00+03:00').getTime() + 864e5).toISOString()
  } else {
    from = '2024-01-01T00:00:00+03:00'
    to = new Date(Date.now() + 864e5).toISOString()
  }
  // daily view: whole range when short, otherwise the last 60 days of it
  const dFrom = new Date(to) - new Date(from) > 92 * 864e5 ? new Date(new Date(to).getTime() - 60 * 864e5).toISOString() : from
  const [s, daily, mix] = await Promise.all([
    q(supabase.rpc('stats_range', { p_from: from, p_to: to })),
    q(supabase.rpc('stats_daily', { p_from: dFrom, p_to: to })),
    q(supabase.rpc('stats_customer_mix', { p_months: 12 }))
  ])
  // stop the daily chart at the last day that has data (later days are just not imported yet)
  let last = daily.length - 1
  while (last > 0 && Number(daily[last].txns) === 0) last--
  return { ...s, from, to, daily: daily.slice(0, last + 1), custMix: mix }
}

export default function Stats() {
  const { t, lang } = useApp()
  const today = toIso(Date.now())
  const [range, setRange] = useState({ mode: 'all', from: toIso(Date.now() - 30 * 864e5), to: today })
  const [draft, setDraft] = useState({ from: range.from, to: range.to })
  const r = useQuery(() => load(range), [range.mode, range.from, range.to])
  const d = r.data

  // gateways with share of their flow and margin
  const flowTot = {}
  ;(d?.gateways || []).forEach((g) => { flowTot[g.flow] = (flowTot[g.flow] || 0) + n(g.vol) })
  const gateways = (d?.gateways || []).map((g) => ({ ...g, share: flowTot[g.flow] ? (100 * n(g.vol)) / flowTot[g.flow] : 0, margin: n(g.vol) ? (100 * n(g.profit)) / n(g.vol) : null }))
    .sort((a, b) => a.flow.localeCompare(b.flow) || n(b.vol) - n(a.vol))

  // product mix: columns = buckets, rows = product lines
  const buckets = [...new Set((d?.mix || []).map((m) => m.k))].slice(-6)
  const lines = [...new Set((d?.mix || []).map((m) => m.line))]
  const mixVal = (k, l) => n((d?.mix || []).find((m) => m.k === k && m.line === l)?.profit)
  const bucketLabel = (k) => (k.includes('Q') ? k.replace(/^(\d{2})(\d{2})-/, '$2 ').replace('"', '') : monthLabel(k + '-01', lang))

  const c = d?.customers || {}
  const share10 = c.total_in ? (100 * n(c.top10)) / n(c.total_in) : 0
  const share50 = c.total_in ? (100 * n(c.top50)) / n(c.total_in) : 0
  const flows = (d?.flows || []).slice(d?.bucket === 'day' ? -31 : -12)

  const filter = (
    <div className="row gap8 wrap" role="group" aria-label={t('range')}>
      <button className={'btn ' + (range.mode === 'period' ? 'on' : '')} onClick={() => setRange({ ...range, mode: 'period' })}>{t('thisPeriod')}</button>
      <button className={'btn ' + (range.mode === 'range' ? 'on' : '')} onClick={() => setRange({ ...range, mode: 'range' })}>{t('dateRange')}</button>
      <button className={'btn ' + (range.mode === 'all' ? 'on' : '')} onClick={() => setRange({ ...range, mode: 'all' })}>{t('allTime')}</button>
    </div>
  )

  return (
    <Page title={t('statistics')} sub={d ? `${day(d.from, lang)} – ${day(new Date(new Date(d.to) - 864e5), lang)} · ${int(d.txns)} ${t('transactions')} · ${t('profit')} ${usd(d.profit)}` : ''} actions={filter}>
      {range.mode === 'range' && (
        <Card>
          <div className="row gap16 wrap" style={{ alignItems: 'flex-end' }}>
            <label className="field"><span>{t('from')}</span><input type="date" value={draft.from} max={draft.to} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
            <label className="field"><span>{t('to')}</span><input type="date" value={draft.to} min={draft.from} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label>
            <button className="btn primary" onClick={() => setRange({ mode: 'range', ...draft })}>{t('apply')}</button>
          </div>
        </Card>
      )}
      <Loading q={r}>{d && <>
        <Card title={t('moneyInOut')} right={<div className="legend"><span><i className="dot" style={{ background: IN }} />{t('moneyIn')}</span><span><i className="dot" style={{ background: OUT }} />{t('moneyOut')}</span></div>}>
          {flows.length ? <Bars aria={t('moneyInOut')} height={210} items={flows.map((m) => ({
            label: d.bucket === 'day' ? day(m.k, lang).slice(0, 6) : monthLabel(m.k, lang),
            top: '$' + (n(m.in) >= 1000 ? (n(m.in) / 1000).toFixed(1) + 'k' : Math.round(n(m.in))),
            values: [n(m.in), n(m.out)], colors: [IN, OUT], title: `${t('moneyIn')} ${usd(m.in, 0)} · ${t('moneyOut')} ${usd(m.out, 0)}` }))} />
            : <div className="muted">{t('nothingHere')}</div>}
        </Card>

        {d.daily.length > 1 && (() => {
          const vals = d.daily.map((x) => n(x.profit))
          const items = d.daily.map((x, i) => {
            const win = vals.slice(Math.max(0, i - 6), i + 1)
            return { label: day(x.d, lang).slice(0, 6), v: vals[i], avg: i >= 6 ? win.reduce((a, b) => a + b, 0) / win.length : null }
          })
          const total = vals.reduce((a, b) => a + b, 0), avgDay = total / vals.length
          const last7 = vals.slice(-7), prev7 = vals.slice(-14, -7)
          const a7 = last7.reduce((a, b) => a + b, 0) / (last7.length || 1), p7 = prev7.length ? prev7.reduce((a, b) => a + b, 0) / prev7.length : null
          const best = d.daily.reduce((b, x) => (n(x.profit) > n(b.profit) ? x : b), d.daily[0])
          return (
            <Card title={t('dailyProfit')} right={<div className="legend"><span><i className="dot" style={{ background: SOFT }} />{t('perDay')}</span><span><i className="dot" style={{ background: '#4318C4' }} />{t('avg7')}</span></div>}>
              <div className="grid-kpi">
                <Kpi tone="soft" label={t('avgPerDay')} value={usd(avgDay)} note={`${vals.length} ${t('days')} · ${t('to')} ${day(d.daily[d.daily.length - 1].d, lang)}`} />
                <Kpi tone={p7 !== null && a7 < p7 ? 'warn' : 'good'} label={t('last7avg')} value={usd(a7)}
                     note={p7 !== null ? `${t('prev7')} ${usd(p7)} · ${a7 >= p7 ? '▲' : '▼'} ${Math.abs(p7 ? (100 * (a7 - p7)) / p7 : 0).toFixed(0)}%` : ''} />
                <Kpi tone="soft" label={t('bestDay')} value={usd(best.profit)} note={day(best.d, lang)} />
              </div>
              <Trend aria={t('dailyProfit')} items={items} fmt={(v) => usd(v)} />
            </Card>
          )
        })()}

        {d.custMix.length > 0 && (
          <Card title={t('newVsReturning')} right={<div className="legend"><span><i className="dot" style={{ background: IN }} />{t('newCust')}</span><span><i className="dot" style={{ background: OUT }} />{t('returningCust')}</span></div>}>
            <Bars aria={t('newVsReturning')} height={190} items={d.custMix.map((m) => ({
              label: monthLabel(m.month, lang), top: int(n(m.new_customers) + n(m.returning_customers)),
              values: [n(m.new_customers), n(m.returning_customers)], colors: [IN, OUT],
              title: `${t('newCust')} ${int(m.new_customers)} · ${t('returningCust')} ${int(m.returning_customers)}` }))} />
            <div className="xs muted">{t('newVsReturningNote')}</div>
          </Card>
        )}

        <Card title={t('productMix')}>
          <Table cols={[{ k: 'line', h: t('productLine') }, ...buckets.map((b) => ({ k: b, h: bucketLabel(b), r: 1, num: 1, f: (x) => {
            const v = mixVal(b, x.line); return <span style={{ color: v < 0 ? 'var(--warn)' : undefined }}>{usd(v, 0)}</span> } }))]}
            rows={lines.map((l) => ({ key: l, line: l }))} empty={t('nothingHere')} />
        </Card>

          <Card title={t('gateways')}>
            <Table cols={[
              { k: 'flow', h: t('flow'), f: (x) => <span className="muted">{x.flow === 'Money In' ? t('moneyIn') : t('moneyOut')}</span> },
              { k: 'gateway', h: t('gateway') },
              { k: 'n', h: t('transactions'), r: 1, num: 1, f: (x) => int(x.n) },
              { k: 'vol', h: t('volume'), r: 1, num: 1, f: (x) => usd(x.vol, 0) },
              { k: 'share', h: t('share'), f: (x) => <div className="row gap8"><div className="meter" style={{ width: 80, height: 8 }}><div style={{ width: x.share + '%', background: x.flow === 'Money In' ? IN : OUT }} /></div><span className="num xs muted">{x.share.toFixed(0)}%</span></div> },
              { k: 'profit', h: t('profit'), r: 1, num: 1, f: (x) => usd(x.profit) },
              { k: 'margin', h: t('margin'), r: 1, num: 1, f: (x) => pct(x.margin, 2) }
            ]} rows={gateways.map((g) => ({ ...g, key: g.flow + g.gateway }))} empty={t('nothingHere')} />
          </Card>

          <Card title={t('customers')}>
            <div className="grid-kpi">
              <Kpi tone="soft" label={t('allCustomers')} value={int(c.all)} />
              <Kpi tone="good" label={t('newCustomers').replace(/,.*$/, '') + ' · ' + t('inRange')} value={int(c.new)} />
              <Kpi tone="soft" label={t('active') + ' · ' + t('inRange')} value={int(c.active)} />
              <Kpi tone="warn" label={t('goneQuiet')} value={int(c.quiet)} />
            </div>
            <div className="small">{t('top10')} <b className="num">{share10.toFixed(1)}%</b> · {t('top50')} <b className="num">{share50.toFixed(1)}%</b></div>
            <div className="meter" role="img" aria-label={`${share10.toFixed(1)}% / ${share50.toFixed(1)}%`}>
              <div style={{ width: share10 + '%', background: IN }} /><div style={{ width: (share50 - share10) + '%', background: SOFT }} />
            </div>
            <div className="xs muted">{t('avgFunded')} <span className="num">{usd(c.funders ? n(c.total_in) / n(c.funders) : 0, 0)}</span> · {t('median')} <span className="num">{usd(c.median, 0)}</span></div>
            <Table cols={[
              { k: 'rank', h: '#', num: 1 },
              { k: 'email', h: t('customer'), f: (x) => <span className="xs">{x.username || x.email}</span> },
              { k: 'mi', h: t('moneyIn'), r: 1, num: 1, f: (x) => usd(x.mi, 0) },
              { k: 's', h: t('share'), r: 1, num: 1, f: (x) => pct(c.total_in ? (100 * n(x.mi)) / n(c.total_in) : 0) },
              { k: 'q', h: t('status'), f: (x) => <Pill tone={x.quiet ? 'warn' : 'good'}>{x.quiet ? t('goneQuiet') : t('active')}</Pill> }
            ]} rows={(d.top || []).map((x) => ({ ...x, key: x.rank + x.email }))} empty={t('nothingHere')} />
          </Card>
      </>}</Loading>
    </Page>
  )
}
