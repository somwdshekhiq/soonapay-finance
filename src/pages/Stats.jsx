import { supabase, useApp, useQuery, q, all, usd, int, pct, monthLabel, n } from '../lib.js'
import { Page, Card, Kpi, Loading, Bars, Table, Pill } from '../ui.jsx'

async function load() {
  const [gw, customers, top, mix] = await Promise.all([
    all('v_gateway_monthly', '*'),
    all('v_customer_summary', 'activity, money_in_usd'),
    q(supabase.from('v_top_funders').select('*').order('rank').limit(10)),
    all('v_product_mix_monthly', 'month, product_line, profit_usd')
  ])
  // monthly flows (last 12 months)
  const months = {}
  gw.forEach((g) => { const m = months[g.month] ||= { in: 0, out: 0 }; if (g.flow === 'Money In') m.in += n(g.volume_usd); else m.out += n(g.volume_usd) })
  const flows = Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).slice(-12)
  // gateway totals
  const agg = {}
  gw.forEach((g) => { const k = g.flow + '|' + g.gateway; const a = agg[k] ||= { flow: g.flow, gateway: g.gateway, n: 0, vol: 0, profit: 0 }; a.n += n(g.txn_count); a.vol += n(g.volume_usd); a.profit += n(g.profit_usd) })
  const flowTot = { 'Money In': 0, 'Money Out': 0 }
  Object.values(agg).forEach((a) => { flowTot[a.flow] += a.vol })
  const gateways = Object.values(agg).sort((a, b) => a.flow.localeCompare(b.flow) || b.vol - a.vol)
    .map((a) => ({ ...a, share: flowTot[a.flow] ? (100 * a.vol) / flowTot[a.flow] : 0, margin: a.vol ? (100 * a.profit) / a.vol : null }))
  // customers
  const counts = { new: 0, active: 0, dormant: 0 }
  customers.forEach((c) => { counts[c.activity]++ })
  const funders = customers.map((c) => n(c.money_in_usd)).filter((v) => v > 0).sort((a, b) => b - a)
  const totalIn = funders.reduce((s, v) => s + v, 0)
  const share = (k) => (100 * funders.slice(0, k).reduce((s, v) => s + v, 0)) / (totalIn || 1)
  const median = funders.length ? funders[Math.floor(funders.length / 2)] : 0
  // product mix per quarter
  const qmap = {}, lines = new Set()
  mix.forEach((m) => { const d = new Date(m.month); const qk = `Q${Math.floor(d.getMonth() / 3) + 1} ${String(d.getFullYear()).slice(2)}`; const sortk = d.getFullYear() * 10 + Math.floor(d.getMonth() / 3)
    lines.add(m.product_line); const o = qmap[sortk] ||= { label: qk, v: {} }; o.v[m.product_line] = (o.v[m.product_line] || 0) + n(m.profit_usd) })
  const quarters = Object.entries(qmap).sort(([a], [b]) => a - b).slice(-6).map(([, v]) => v)
  return { flows, gateways, counts, total: customers.length, top10: share(10), top50: share(50), avg: totalIn / (funders.length || 1), median, top, quarters, lines: [...lines] }
}

export default function Stats() {
  const { t, lang } = useApp()
  const r = useQuery(load)
  const d = r.data
  return (
    <Page title={t('statistics')} sub={t('allTime')}>
      <Loading q={r}>{d && <>
        <Card title={t('moneyInOut')} right={<div className="legend"><span><i className="dot" style={{ background: '#0B6E5E' }} />{t('moneyIn')}</span><span><i className="dot" style={{ background: '#D9822B' }} />{t('moneyOut')}</span></div>}>
          <Bars aria={t('moneyInOut')} height={200} items={d.flows.map(([m, v]) => ({
            label: monthLabel(m, lang), sub: '$' + (v.in / 1000).toFixed(1) + 'k', values: [v.in, v.out], colors: ['#0B6E5E', '#D9822B'],
            title: `${t('moneyIn')} ${usd(v.in, 0)} · ${t('moneyOut')} ${usd(v.out, 0)}` }))} />
        </Card>

        <div className="split">
          <Card title={t('gateways')} className="wide">
            <Table cols={[
              { k: 'flow', h: t('flow'), f: (x) => <span className="muted">{x.flow === 'Money In' ? t('moneyIn') : t('moneyOut')}</span> },
              { k: 'gateway', h: t('gateway') },
              { k: 'n', h: t('transactions'), r: 1, num: 1, f: (x) => int(x.n) },
              { k: 'vol', h: t('volume'), r: 1, num: 1, f: (x) => usd(x.vol, 0) },
              { k: 'share', h: t('share'), f: (x) => <div className="row gap8"><div className="meter" style={{ width: 80, height: 8 }}><div style={{ width: x.share + '%', background: x.flow === 'Money In' ? '#0B6E5E' : '#D9822B' }} /></div><span className="num xs muted">{x.share.toFixed(0)}%</span></div> },
              { k: 'profit', h: t('profit'), r: 1, num: 1, f: (x) => usd(x.profit) },
              { k: 'margin', h: t('margin'), r: 1, num: 1, f: (x) => pct(x.margin, 2) }
            ]} rows={d.gateways} />
          </Card>

          <Card title={t('customers')}>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
              <Kpi tone="soft" label={t('allCustomers')} value={int(d.total)} />
              <Kpi tone="good" label={t('newCustomers')} value={int(d.counts.new)} />
              <Kpi tone="soft" label={t('activeCustomers')} value={int(d.counts.active)} />
              <Kpi tone="warn" label={t('goneQuiet')} value={int(d.counts.dormant)} />
            </div>
            <div className="small">{t('top10')} <b className="num">{d.top10.toFixed(1)}%</b> · {t('top50')} <b className="num">{d.top50.toFixed(1)}%</b></div>
            <div className="meter" role="img" aria-label={`${d.top10.toFixed(1)}% / ${d.top50.toFixed(1)}%`}>
              <div style={{ width: d.top10 + '%', background: '#0B6E5E' }} /><div style={{ width: (d.top50 - d.top10) + '%', background: '#7FB8AD' }} />
            </div>
            <div className="xs muted">{t('avgFunded')} <span className="num">{usd(d.avg, 0)}</span> · {t('median')} <span className="num">{usd(d.median, 0)}</span></div>
            <Table cols={[
              { k: 'rank', h: '#', num: 1 },
              { k: 'email', h: t('customer'), f: (x) => <span className="xs">{x.username || x.email}</span> },
              { k: 'money_in_usd', h: t('moneyIn'), r: 1, num: 1, f: (x) => usd(x.money_in_usd, 0) },
              { k: 'share_pct', h: t('share'), r: 1, num: 1, f: (x) => pct(x.share_pct) },
              { k: 'activity', h: t('status'), f: (x) => <Pill tone={x.activity === 'dormant' ? 'warn' : 'good'}>{x.activity === 'dormant' ? t('goneQuiet') : x.activity === 'new' ? t('new') : t('active')}</Pill> }
            ]} rows={d.top} />
          </Card>
        </div>

        <Card title={t('productMix')}>
          <Table cols={[{ k: 'line', h: t('productLine') }, ...d.quarters.map((qq, i) => ({ k: 'q' + i, h: qq.label, r: 1, num: 1, f: (x) => {
            const v = qq.v[x.line] || 0; return <span style={{ color: v < 0 ? 'var(--warn)' : undefined }}>{usd(v, 0)}</span> } }))]}
            rows={d.lines.map((l) => ({ key: l, line: l }))} />
        </Card>
      </>}</Loading>
    </Page>
  )
}
