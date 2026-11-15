import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, int, n, day, monthLabel } from '../lib.js'
import { Page, Card, Kpi, Loading, Bars, Table, Pill } from '../ui.jsx'

const C1 = '#5B2EE6', C2 = '#1E9BC8', SOFT = '#9C86F0'
const RANGES = ['30d', '90d', 'ytd', 'all']
const riyadhToday = () => new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10)
function rangeArgs(k) {
  const td = riyadhToday()
  if (k === '30d') return { p_from: new Date(Date.now() - 30 * 864e5).toISOString(), p_to: null }
  if (k === '90d') return { p_from: new Date(Date.now() - 90 * 864e5).toISOString(), p_to: null }
  if (k === 'ytd') return { p_from: td.slice(0, 5) + '01-01T00:00:00+03:00', p_to: null }
  return { p_from: null, p_to: null }
}
const price = (v) => '$' + n(v).toFixed(2)
const share = (a, b) => (b ? Math.round((100 * a) / b) : 0) + '%'

// 30-day trend of one card price, compared with the 30 days before
function trendOf(x) {
  const a = n(x.last30), b = n(x.prev30)
  if (!a && !b) return 'stopped'
  if (!b) return Date.now() - new Date(x.first_sold).getTime() <= 30 * 864e5 ? 'new' : 'up'
  if (a >= b * 1.25) return 'up'
  if (a <= b * 0.75) return 'down'
  return 'steady'
}
const TONE = { up: 'good', new: 'violet', steady: 'grey', down: 'warn', stopped: 'warn' }

export default function Giftcards() {
  const { t, lang } = useApp()
  const [range, setRange] = useState('all')
  const [allPrices, setAllPrices] = useState(false)
  const phone = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 700px)').matches
  const TOP = phone ? 5 : 10
  const r = useQuery(() => q(supabase.rpc('gift_card_stats', rangeArgs(range))), [range])
  const d = r.data
  const wk = (dow) => new Date(Date.UTC(2026, 0, 4 + dow)).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short', timeZone: 'UTC' })

  return (
    <Page title={t('giftCards')} sub={t('giftCardsSub')}>
      <div className="row gap8 wrap" role="group" aria-label={t('range')}>
        {RANGES.map((k) => <button key={k} type="button" className={'btn ' + (range === k ? 'on' : '')} aria-pressed={range === k} onClick={() => setRange(k)}>{t('gc_' + k)}</button>)}
      </div>
      <Loading q={r}>{d && (() => {
        const orders = n(d.orders)
        const prices = d.prices || []
        const fast = prices.filter((x) => n(x.last30) > 0).sort((a, b) => n(b.last30) - n(a.last30) || n(a.days_between) - n(b.days_between)).slice(0, 3)
        const l30 = n(d.last30), p30 = n(d.prev30)
        const wkMap = Object.fromEntries((d.weekday || []).map((x) => [x.dow, n(x.orders)]))
        const hrMap = Object.fromEntries((d.hours || []).map((x) => [x.hr, n(x.orders)]))
        const bestDow = [0, 1, 2, 3, 4, 5, 6].reduce((b, i) => ((wkMap[i] || 0) > (wkMap[b] || 0) ? i : b), 0)
        // hours grouped in 3-hour blocks so the chart stays readable on phones
        const blocks = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => ({ h, v: [0, 1, 2].reduce((s, k) => s + (hrMap[h + k] || 0), 0) }))
        const bestBlock = blocks.reduce((b, x) => (x.v > b.v ? x : b), blocks[0])
        const hh = (h) => String(h).padStart(2, '0')
        return <>
          <div className="grid-kpi">
            <Kpi tone="soft" label={t('gcOrders')} value={int(orders)} note={d.first ? `${day(d.first, lang)} → ${day(d.last, lang)}` : ''} />
            <Kpi tone="soft" label={t('gcSales')} value={usd(d.revenue)} note={`${t('gcAvgOrder')} ${usd(orders ? n(d.revenue) / orders : 0)}`} />
            <Kpi tone="soft" label={t('gcBuyers')} value={int(d.buyers)} note={`${int(d.repeat_buyers)} ${t('gcRepeat')} (${share(n(d.repeat_buyers), n(d.buyers))})`} />
            <Kpi tone="good" label={t('profit')} value={usd(d.profit)} note={`${usd(orders ? n(d.profit) / orders : 0)} ${t('gcPerCard')}`} />
            <Kpi tone={l30 < p30 ? 'warn' : 'good'} wide label={t('gcLast30')} value={int(l30)}
                 note={`${t('gcPrev30')} ${int(p30)}${p30 ? ` · ${l30 === p30 ? t('gcT_steady') : `${l30 > p30 ? '▲' : '▼'} ${Math.abs(Math.round((100 * (l30 - p30)) / p30))}%`}` : ''}`} />
          </div>

          {fast.length > 0 && (
            <Card title={t('gcFastest')}>
              <div className="grid-kpi">
                {fast.map((x, i) => (
                  <Kpi key={x.price} tone={i === 0 ? 'good' : 'soft'} label={`#${i + 1} · ${t('gcCard')} ${price(x.price)}`} value={`${int(x.last30)} ${t('gcInLast30')}`}
                       note={<>{x.days_between !== null ? `${t('gcEvery')} ${n(x.days_between).toFixed(1)} ${t('days')}` : ''} · {t('gcLastSold')} {day(x.last_sold, lang)}</>} />
                ))}
              </div>
            </Card>
          )}

          {(d.monthly || []).length > 0 && (
            <Card title={t('gcByMonth')} right={<div className="legend"><span><i className="dot" style={{ background: C1 }} />{t('gcOrders')}</span><span><i className="dot" style={{ background: C2 }} />{t('gcBuyers')}</span></div>}>
              <Bars aria={t('gcByMonth')} height={200} items={(phone ? d.monthly.slice(-6) : d.monthly).map((m) => ({
                label: monthLabel(m.mon + '-01', lang), tops: [int(m.orders), int(m.buyers)], sub: usd(m.revenue, 0),
                values: [n(m.orders), n(m.buyers)], colors: [C1, C2], title: `${int(m.orders)} ${t('gcOrders')} · ${int(m.buyers)} ${t('gcBuyers')} · ${usd(m.revenue)}` }))} />
              <div className="xs muted">{t('gcByMonthNote')}</div>
            </Card>
          )}

          <Card title={`${t('gcByPrice')} · ${int(prices.length)}`}>
            <Table cols={[
              { k: 'p', h: t('gcCard'), num: 1, f: (x) => <b>{price(x.price)}</b> },
              { k: 'o', h: t('gcOrders'), r: 1, num: 1, f: (x) => <span>{int(x.orders)} <span className="xs muted">{share(n(x.orders), orders)}</span></span> },
              { k: 'v', h: t('gcSales'), r: 1, num: 1, f: (x) => usd(x.revenue) },
              { k: 'b', h: t('gcBuyers'), r: 1, num: 1, f: (x) => int(x.buyers) },
              { k: 't', h: t('gcLast30Short'), r: 1, f: (x) => { const k = trendOf(x); return <span className="row gap8" style={{ justifyContent: 'flex-end' }}><span className="num">{int(x.last30)} / {int(x.prev30)}</span><Pill tone={TONE[k]}>{t('gcT_' + k)}</Pill></span> } },
              { k: 'e', h: t('gcSellsEvery'), r: 1, f: (x) => (x.days_between === null ? '—' : <span><span className="num">{n(x.days_between).toFixed(1)}</span> {t('days')}</span>) },
              { k: 'l', h: t('gcLastSold'), r: 1, num: 1, f: (x) => <span className="xs">{day(x.last_sold, lang)}</span> }
            ]} rows={(allPrices ? prices : prices.slice(0, TOP)).map((x) => ({ ...x, key: x.price }))} empty={t('nothingHere')} />
            {prices.length > TOP && <div><button type="button" className="btn" onClick={() => setAllPrices(!allPrices)}>{allPrices ? t('gcShowTop') : `${t('showMore')} (${prices.length - TOP})`}</button></div>}
            <div className="xs muted">{t('gcByPriceNote')}</div>
          </Card>

          {orders > 0 && (
            <div className="grid-kpi" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
              <Card title={t('gcWeekday')}>
                <Bars aria={t('gcWeekday')} height={160} items={[0, 1, 2, 3, 4, 5, 6].map((i) => ({
                  label: wk(i), top: int(wkMap[i] || 0), values: [wkMap[i] || 0], colors: [i === bestDow ? C1 : SOFT] }))} />
                <div className="xs muted">{t('gcBusiest')}: <b>{wk(bestDow)}</b></div>
              </Card>
              <Card title={t('gcHours')}>
                <Bars aria={t('gcHours')} height={160} items={blocks.map((x) => ({
                  label: hh(x.h), top: int(x.v), values: [x.v], colors: [x.h === bestBlock.h ? C1 : SOFT], title: `${hh(x.h)}:00–${hh(x.h + 3)}:00` }))} />
                <div className="xs muted">{t('gcBusiest')}: <b className="num">{hh(bestBlock.h)}:00–{hh(bestBlock.h + 3)}:00</b> · {t('gcRiyadhTime')}</div>
              </Card>
            </div>
          )}

          <Card title={t('gcTopBuyers')}>
            <Table cols={[
              { k: 'c', h: t('customer'), f: (x) => <a className="xs num" href={'#/customers?id=' + x.customer_id}>{x.username || x.email || '—'}</a> },
              { k: 'o', h: t('gcOrders'), r: 1, num: 1, f: (x) => int(x.orders) },
              { k: 'v', h: t('gcSales'), r: 1, num: 1, f: (x) => usd(x.revenue) },
              { k: 'l', h: t('gcLastOrder'), r: 1, num: 1, f: (x) => <span className="xs">{day(x.last_order, lang)}</span> }
            ]} rows={(d.top_buyers || []).map((x) => ({ ...x, key: x.customer_id }))} empty={t('nothingHere')} />
          </Card>

          <Card title={t('gcRecent')} right={<a className="btn" href="#/transactions?q=GC-">{t('gcAllInTxns')}</a>}>
            <Table cols={[
              { k: 'd', h: t('date'), num: 1, f: (x) => <span className="xs">{day(x.txn_time, lang)}</span> },
              { k: 'c', h: t('customer'), f: (x) => <a className="xs num" href={'#/customers?id=' + x.customer_id}>{x.username || x.email || '—'}</a> },
              { k: 'a', h: t('amount'), r: 1, num: 1, f: (x) => usd(x.amt) }
            ]} rows={(d.recent || []).map((x) => ({ ...x, key: x.txn_id }))} empty={t('nothingHere')} />
          </Card>
        </>
      })()}</Loading>
    </Page>
  )
}
