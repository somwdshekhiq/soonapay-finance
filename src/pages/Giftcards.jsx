import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, int, n, day, monthLabel } from '../lib.js'
import { Page, Card, Kpi, Loading, Bars, Table, Pill, Tabs } from '../ui.jsx'

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
const CardName = ({ x }) => {
  const { t } = useApp()
  return x.product
    ? <span><b>{x.product}</b> <bdi className="muted">{x.denomination}</bdi><div className="xs muted num">{price(x.price)}</div></span>
    : <span><b className="num">{price(x.price)}</b><div className="xs muted">{t('gcNotInList')}</div></span>
}
const TONE = { up: 'good', new: 'violet', steady: 'grey', down: 'warn', stopped: 'warn' }

// Card list (gift_card_products) — admins can add / edit; sales are matched to it by exact price
const BLANK = { product_id: '', product: '', denomination: '', price: '', active: true }
function CardList({ prices }) {
  const { t, role } = useApp()
  const list = useQuery(() => q(supabase.from('gift_card_products').select('*').order('product').order('price')))
  const [form, setForm] = useState(null), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const sold = Object.fromEntries((prices || []).filter((x) => x.product_id).map((x) => [x.product_id, n(x.cards)]))
  const set = (k) => (e) => setForm({ ...form, [k]: k === 'active' ? e.target.checked : e.target.value })
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg('')
    try {
      const row = { product_id: Number(form.product_id), product: form.product.trim(), denomination: form.denomination.trim() || null,
        price: Number(form.price), active: form.active, updated_at: new Date().toISOString() }
      if (!row.product_id || !row.product || !(row.price > 0)) throw new Error(t('gcFormRequired'))
      const req = form.isNew ? supabase.from('gift_card_products').insert(row) : supabase.from('gift_card_products').update(row).eq('product_id', form.orig)
      await q(req); setForm(null); list.reload()
    } catch (er) { setMsg(/unique|duplicate/i.test(er.message) ? t('gcDupPrice') : er.message) } finally { setBusy(false) }
  }
  return (
    <Card title={t('gcCardList')} right={role === 'admin' && !form && <button className="btn primary" onClick={() => setForm({ ...BLANK, isNew: true })}>+ {t('gcAddCard')}</button>}>
      {form && (
        <form className="form-grid" onSubmit={save}>
          <label className="field"><span>{t('gcPlatformId')}</span><input type="number" required value={form.product_id} onChange={set('product_id')} /></label>
          <label className="field"><span>{t('gcProduct')}</span><input required value={form.product} onChange={set('product')} placeholder="PUBG (global)" /></label>
          <label className="field"><span>{t('gcDenomination')}</span><input dir="ltr" value={form.denomination} onChange={set('denomination')} placeholder="60 UC" /></label>
          <label className="field"><span>{t('gcPrice')} ($)</span><input type="number" step="0.01" min="0.01" required value={form.price} onChange={set('price')} /></label>
          <label className="field row gap8" style={{ alignItems: 'center' }}><input type="checkbox" style={{ width: 18, height: 18, flex: 'none' }} checked={form.active} onChange={set('active')} /><span>{t('gcActive')}</span></label>
          <div className="field"><span>&nbsp;</span><div className="row gap8">
            <button className="btn primary" disabled={busy}>{t('save')}</button>
            <button type="button" className="btn" onClick={() => { setForm(null); setMsg('') }}>{t('cancel')}</button></div></div>
        </form>
      )}
      {msg && <div className="alert">{msg}</div>}
      <Loading q={list}>{list.data && <Table cols={[
        { k: 'i', h: 'ID', num: 1, f: (x) => <span className="xs muted">{x.product_id}</span> },
        { k: 'p', h: t('gcProduct'), f: (x) => <b>{x.product}</b> },
        { k: 'd', h: t('gcDenomination'), f: (x) => x.denomination ? <bdi>{x.denomination}</bdi> : '—' },
        { k: 'r', h: t('gcPrice'), r: 1, num: 1, f: (x) => price(x.price) },
        { k: 's', h: t('gcOrders'), r: 1, num: 1, f: (x) => int(sold[x.product_id] || 0) },
        { k: 'a', h: t('status'), f: (x) => <span className="row gap8">{x.active ? <Pill tone="good">{t('gcActive')}</Pill> : <Pill>{t('stopped')}</Pill>}
          {role === 'admin' && <button type="button" className="btn" onClick={() => setForm({ ...BLANK, ...x, denomination: x.denomination || '', orig: x.product_id, isNew: false })}>{t('edit')}</button>}</span> }
      ]} rows={list.data.map((x) => ({ ...x, key: x.product_id }))} empty={t('nothingHere')} />}</Loading>
      <div className="xs muted">{t('gcCardListNote')}</div>
    </Card>
  )
}

export default function Giftcards() {
  const { t, lang } = useApp()
  const [tab, setTab] = useState('stats')
  const [range, setRange] = useState('all')
  const [allPrices, setAllPrices] = useState(false)
  const phone = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 700px)').matches
  const TOP = phone ? 5 : 10
  const r = useQuery(() => q(supabase.rpc('gift_card_stats', rangeArgs(range))), [range])
  const d = r.data
  const wk = (dow) => new Date(Date.UTC(2026, 0, 4 + dow)).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short', timeZone: 'UTC' })

  return (
    <Page title={t('giftCards')} sub={t('giftCardsSub')}>
      <Tabs value={tab} onChange={setTab} label={t('giftCards')} items={[['stats', t('statistics')], ['list', t('gcCardList')]]} />
      {tab === 'list' && <CardList prices={d?.prices} />}
      {tab === 'stats' && <>
      <div className="row gap8 wrap" role="group" aria-label={t('range')}>
        {RANGES.map((k) => <button key={k} type="button" className={'btn ' + (range === k ? 'on' : '')} aria-pressed={range === k} onClick={() => setRange(k)}>{t('gc_' + k)}</button>)}
      </div>
      <Loading q={r}>{d && (() => {
        const orders = n(d.orders), cards = n(d.cards)
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
            <Kpi tone="soft" label={t('gcOrders')} value={int(cards)} note={<>{int(orders)} {t('gcOrdersWord')} · {int(d.multi_orders)} {t('gcMulti')}{d.first && <div>{day(d.first, lang)} → {day(d.last, lang)}</div>}</>} />
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
                  <Kpi key={x.price} tone={i === 0 ? 'good' : 'soft'} label={`#${i + 1} · ${x.product ? `${x.product} · ${x.denomination || ''}` : t('gcNotInList')} · ${price(x.price)}`} value={`${int(x.last30)} ${t('gcInLast30')}`}
                       note={<>{x.days_between !== null ? `${t('gcEvery')} ${n(x.days_between).toFixed(1)} ${t('days')}` : ''} · {t('gcLastSold')} {day(x.last_sold, lang)}</>} />
                ))}
              </div>
            </Card>
          )}

          {(d.games || []).length > 0 && (
            <Card title={t('gcByGame')}>
              <Table cols={[
                { k: 'g', h: t('gcGame'), f: (x) => x.product ? <b>{x.product}</b> : <span className="muted">{t('gcNotInList')}</span> },
                { k: 'o', h: t('gcOrders'), r: 1, num: 1, f: (x) => <span>{int(x.cards)} <span className="xs muted">{share(n(x.cards), cards)}</span></span> },
                { k: 'n', h: t('gcOrderCount'), r: 1, num: 1, f: (x) => int(x.orders) },
                { k: 'v', h: t('gcSales'), r: 1, num: 1, f: (x) => usd(x.revenue) },
                { k: 'b', h: t('gcBuyers'), r: 1, num: 1, f: (x) => int(x.buyers) },
                { k: 'l', h: t('gcLast30Short2'), r: 1, num: 1, f: (x) => int(x.last30) }
              ]} rows={d.games.map((x) => ({ ...x, key: x.product || '~' }))} empty={t('nothingHere')} />
            </Card>
          )}

          {(d.monthly || []).length > 0 && (
            <Card title={t('gcByMonth')} right={<div className="legend"><span><i className="dot" style={{ background: C1 }} />{t('gcOrders')}</span><span><i className="dot" style={{ background: C2 }} />{t('gcBuyers')}</span></div>}>
              <Bars aria={t('gcByMonth')} height={200} items={(phone ? d.monthly.slice(-6) : d.monthly).map((m) => ({
                label: monthLabel(m.mon + '-01', lang), tops: [int(m.cards), int(m.buyers)], sub: usd(m.revenue, 0),
                values: [n(m.cards), n(m.buyers)], colors: [C1, C2], title: `${int(m.cards)} ${t('gcOrders')} · ${int(m.orders)} ${t('gcOrdersWord')} · ${int(m.buyers)} ${t('gcBuyers')} · ${usd(m.revenue)}` }))} />
              <div className="xs muted">{t('gcByMonthNote')}</div>
            </Card>
          )}

          <Card title={`${t('gcByCard')} · ${int(prices.length)}`} right={<span className="xs muted">{int(d.matched)} / {int(orders)} {t('gcMatched')}</span>}>
            <Table cols={[
              { k: 'p', h: t('gcCard'), f: (x) => <CardName x={x} /> },
              { k: 'o', h: t('gcOrders'), r: 1, num: 1, f: (x) => <span>{int(x.cards)} <span className="xs muted">{share(n(x.cards), cards)}</span></span> },
              { k: 'n', h: t('gcOrderCount'), r: 1, num: 1, f: (x) => <span>{int(x.orders)}{n(x.multi_orders) > 0 && <div className="xs muted">{int(x.multi_orders)} {t('gcMultiShort')}</div>}</span> },
              { k: 'v', h: t('gcSales'), r: 1, num: 1, f: (x) => usd(x.revenue) },
              { k: 'b', h: t('gcBuyers'), r: 1, num: 1, f: (x) => int(x.buyers) },
              { k: 't', h: t('gcLast30Short'), r: 1, f: (x) => { const k = trendOf(x); return <span className="row gap8" style={{ justifyContent: 'flex-end' }}><span className="num">{int(x.last30)} / {int(x.prev30)}</span><Pill tone={TONE[k]}>{t('gcT_' + k)}</Pill></span> } },
              { k: 'e', h: t('gcSellsEvery'), r: 1, f: (x) => (x.days_between === null ? '—' : <span><span className="num">{n(x.days_between).toFixed(1)}</span> {t('days')}</span>) },
              { k: 'l', h: t('gcLastSold'), r: 1, num: 1, f: (x) => <span className="xs">{day(x.last_sold, lang)}</span> }
            ]} rows={(allPrices ? prices : prices.slice(0, TOP)).map((x) => ({ ...x, key: x.card_key }))} empty={t('nothingHere')} />
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
              { k: 'o', h: t('gcOrders'), r: 1, num: 1, f: (x) => int(x.cards) },
              { k: 'n', h: t('gcOrderCount'), r: 1, num: 1, f: (x) => int(x.orders) },
              { k: 'v', h: t('gcSales'), r: 1, num: 1, f: (x) => usd(x.revenue) },
              { k: 'l', h: t('gcLastOrder'), r: 1, num: 1, f: (x) => <span className="xs">{day(x.last_order, lang)}</span> }
            ]} rows={(d.top_buyers || []).map((x) => ({ ...x, key: x.customer_id }))} empty={t('nothingHere')} />
          </Card>

          <Card title={t('gcRecent')} right={<a className="btn" href="#/transactions?q=GC-">{t('gcAllInTxns')}</a>}>
            <Table cols={[
              { k: 'd', h: t('date'), num: 1, f: (x) => <span className="xs">{day(x.txn_time, lang)}</span> },
              { k: 'c', h: t('customer'), f: (x) => <a className="xs num" href={'#/customers?id=' + x.customer_id}>{x.username || x.email || '—'}</a> },
              { k: 'g', h: t('gcCard'), f: (x) => x.product ? <span className="xs">{n(x.qty) > 1 && <b className="num">{x.qty} × </b>}{x.product} · <bdi>{x.denomination}</bdi></span> : <span className="xs muted">{t('gcNotInList')}</span> },
              { k: 'a', h: t('amount'), r: 1, num: 1, f: (x) => usd(x.amt) }
            ]} rows={(d.recent || []).map((x) => ({ ...x, key: x.txn_id }))} empty={t('nothingHere')} />
          </Card>
        </>
      })()}</Loading>
      </>}
    </Page>
  )
}
