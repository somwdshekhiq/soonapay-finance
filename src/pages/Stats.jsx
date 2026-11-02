import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, int, pct, monthLabel, day, n } from '../lib.js'
import { Page, Card, Kpi, Loading, Bars, Table, Pill } from '../ui.jsx'

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
  const s = await q(supabase.rpc('stats_range', { p_from: from, p_to: to }))
  return { ...s, from, to }
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

        <div className="split">
          <Card title={t('gateways')} className="wide">
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
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
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
        </div>

        <Card title={t('productMix')}>
          <Table cols={[{ k: 'line', h: t('productLine') }, ...buckets.map((b) => ({ k: b, h: bucketLabel(b), r: 1, num: 1, f: (x) => {
            const v = mixVal(b, x.line); return <span style={{ color: v < 0 ? 'var(--warn)' : undefined }}>{usd(v, 0)}</span> } }))]}
            rows={lines.map((l) => ({ key: l, line: l }))} empty={t('nothingHere')} />
        </Card>
      </>}</Loading>
    </Page>
  )
}
