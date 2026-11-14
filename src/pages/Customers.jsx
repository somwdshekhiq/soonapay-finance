import { useEffect, useState } from 'react'
import { supabase, useApp, useQuery, q, usd, int, day, monthLabel, n } from '../lib.js'
import { Page, Card, Kpi, Loading, Table, Pill, Bars } from '../ui.jsx'

const PAGE = 50
const TONE = { active: 'good', new: 'violet', quiet: 'warn', lost: 'grey', none: 'grey' }
const STATUSES = ['all', 'active', 'new', 'quiet', 'lost']
const SORTS = ['profit', 'money_in', 'last', 'first', 'txns']
const hashGet = (k) => new URLSearchParams(window.location.hash.split('?')[1] || '').get(k)
const hashId = () => hashGet('id')
const initial = (x) => String(x.username || x.email || '?').trim().charAt(0)

function Who({ x, lg }) {
  return (
    <div className="row gap8" style={{ minWidth: 0 }}>
      <span className={'avatar' + (lg ? ' lg' : '')} aria-hidden="true">{initial(x)}</span>
      <div style={{ minWidth: 0, textAlign: 'start' }}>
        <div style={lg ? { fontSize: 20, fontWeight: 600 } : { fontWeight: 500 }}>{x.username || x.email}</div>
        {x.username && <div className="xs muted num" style={{ overflowWrap: 'anywhere' }}>{x.email}</div>}
      </div>
    </div>
  )
}

function Detail({ id }) {
  const { t, lang } = useApp()
  const r = useQuery(() => q(supabase.rpc('customer_detail', { p_id: Number(id) })), [id])
  const d = r.data
  const c = d?.customer, tot = d?.totals || {}
  const quietDays = tot.last_txn ? Math.floor((Date.now() - new Date(tot.last_txn)) / 864e5) : null
  const status = !tot.last_txn ? 'none' : (Date.now() - new Date(tot.first_txn)) / 864e5 <= 30 ? 'new' : quietDays <= 30 ? 'active' : quietDays <= 180 ? 'quiet' : 'lost'
  return (
    <Page title={t('customers')} sub={<a href="#/customers" style={{ textDecoration: 'none' }}>← {t('backToCustomers')}</a>}>
      <Loading q={r}>{d && (c ? <>
        <Card>
          <div className="row between wrap gap16">
            <Who x={c} lg />
            <div className="row gap8 wrap">
              <Pill tone={TONE[status]}>{t('st_' + status)}</Pill>
              {tot.first_txn && <span className="small muted">{t('customerSince')} {day(tot.first_txn, lang)} · {t('lastActive')} {day(tot.last_txn, lang)}{quietDays > 30 ? ` (${int(quietDays)} ${t('days')})` : ''}</span>}
            </div>
          </div>
          <div className="grid-kpi">
            <Kpi tone="good" label={t('lifetimeProfit')} value={usd(tot.profit)} note={`${usd(n(tot.profit) / Math.max(1, n(tot.active_months)))} ${t('perActiveMonth')} · ${int(tot.active_months)} ${t('activeMonths')}`} />
            <Kpi tone="soft" label={t('moneyIn')} value={usd(tot.money_in, 0)} />
            <Kpi tone="soft" label={t('moneyOut')} value={usd(tot.money_out, 0)} />
            <Kpi tone="soft" label={t('transactions')} value={int(tot.txns)} note={<a href={'#/transactions?q=' + encodeURIComponent(c.email)}>{t('allTxns')} →</a>} />
            {n(d.fees.total) > 0 && <Kpi tone={n(d.fees.due) > 0 ? 'warn' : 'soft'} label={t('feesDue')} value={usd(d.fees.due)} note={`${int(d.fees.count)} ${t('fees')} · ${t('alreadyDeducted')} ${usd(d.fees.charged)}`} />}
          </div>
        </Card>

        <div className="split">
          <Card title={t('monthlyProfit')} className="wide">
            {d.monthly.length ? <Bars aria={t('monthlyProfit')} height={190} items={d.monthly.map((m) => ({
              label: monthLabel(m.month, lang), tops: [usd(m.profit, 0)], values: [Math.max(0, n(m.profit))], colors: ['#7C5CF6'],
              title: `${usd(m.profit)} · ${int(m.txns)} ${t('transactions')}` }))} /> : <div className="muted">{t('nothingHere')}</div>}
          </Card>
          <Card title={`${t('cards')} · ${d.cards.length}`}>
            {d.cards.length ? d.cards.map((k, i) => (
              <div key={i} className="row between gap8" style={{ padding: '8px 0', borderBottom: i < d.cards.length - 1 ? '1px solid var(--line2)' : 0 }}>
                <div style={{ minWidth: 0 }}><div className="small">{k.name_on_card || '—'}</div><div className="xs muted num" style={{ overflowWrap: 'anywhere' }}>{k.card_ref}</div></div>
                <div className="chips"><Pill tone="violet">{k.source}</Pill>{k.status && <Pill tone={/active/i.test(k.status) ? 'good' : 'grey'}>{k.status}</Pill>}</div>
              </div>
            )) : <div className="muted">{t('nothingHere')}</div>}
            {d.redemptions.length > 0 && <>
              <h2 style={{ marginTop: 8 }}>{t('promosTaken')}</h2>
              {d.redemptions.map((x, i) => (
                <div key={i} className="row between gap8 small"><span>{x.campaign}</span>
                  <span className="row gap8"><span className="muted xs">{day(x.done_at || x.added_at, lang)}</span><Pill tone={x.status === 'done' ? 'good' : 'warn'}>{x.status}</Pill></span></div>
              ))}
            </>}
          </Card>
        </div>

        <Card title={t('byProduct')}>
          <Table cols={[
            { k: 'type', h: t('txnType') },
            { k: 'n', h: t('transactions'), r: 1, num: 1, f: (x) => int(x.n) },
            { k: 'a', h: t('amount'), r: 1, num: 1, f: (x) => usd(Math.abs(n(x.amount)), 0) },
            { k: 'p', h: t('profit'), r: 1, num: 1, f: (x) => <b style={{ color: n(x.profit) < 0 ? 'var(--warn)' : undefined }}>{usd(x.profit)}</b> }
          ]} rows={d.by_type.map((x) => ({ ...x, key: x.type }))} empty={t('nothingHere')} />
        </Card>

        <Card title={t('recentTxns')} right={<a className="small" href={'#/transactions?q=' + encodeURIComponent(c.email)}>{t('allTxns')} →</a>}>
          <Table cols={[
            { k: 'd', h: t('date'), num: 1, f: (x) => <span className="xs" style={{ whiteSpace: 'nowrap' }}>{new Date(x.txn_time).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span> },
            { k: 'p', h: t('provider'), f: (x) => <span className="xs">{x.provider}</span> },
            { k: 'y', h: t('txnType'), f: (x) => <span className="xs">{x.type}</span> },
            { k: 'ds', h: t('description'), f: (x) => <span className="xs muted">{String(x.descr || '').slice(0, 44)}</span> },
            { k: 'a', h: t('amount'), r: 1, num: 1, f: (x) => usd(Math.abs(n(x.amount_usd))) },
            { k: 'pf', h: t('profit'), r: 1, num: 1, f: (x) => <span style={{ color: n(x.profit) > 0 ? 'var(--good)' : n(x.profit) < 0 ? 'var(--warn)' : 'var(--muted)' }}>{usd(x.profit)}</span> }
          ]} rows={d.recent.map((x) => ({ ...x, key: x.txn_id }))} empty={t('nothingHere')} />
        </Card>
      </> : <div className="alert">{t('nothingHere')}</div>)}</Loading>
    </Page>
  )
}

function List({ q0 }) {
  const { t, lang } = useApp()
  const [f, setF] = useState({ q: q0, status: 'all', sort: 'profit' })
  const [text, setText] = useState(q0)
  const [page, setPage] = useState(0)
  const r = useQuery(() => q(supabase.rpc('customer_list', { p_q: f.q || null, p_status: f.status, p_sort: f.sort, p_limit: PAGE, p_offset: page * PAGE })), [f.q, f.status, f.sort, page])
  const d = r.data
  const upd = (patch) => { setPage(0); setF({ ...f, ...patch }) }
  const counts = d?.counts || {}
  const allCount = Object.values(counts).reduce((s, v) => s + n(v), 0)
  const pages = d ? Math.max(1, Math.ceil(n(d.total) / PAGE)) : 1
  const open = (x) => { window.location.hash = '#/customers?id=' + x.customer_id }
  return (
    <Page title={t('customers')} sub={t('customersSub')}>
      <Card>
        <form className="row gap8 wrap" onSubmit={(e) => { e.preventDefault(); upd({ q: text.trim() }) }}>
          <input className="inp" style={{ flex: '1 1 260px', width: 'auto' }} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('searchCustomersPh')} aria-label={t('search')} />
          <button className="btn primary" type="submit">{t('search')}</button>
          {f.q && <button className="btn" type="button" onClick={() => { setText(''); upd({ q: '' }) }}>{t('clear')}</button>}
          <select className="inp" style={{ flex: '0 1 200px', width: 'auto' }} value={f.sort} onChange={(e) => upd({ sort: e.target.value })} aria-label={t('sortBy')}>
            {SORTS.map((s) => <option key={s} value={s}>{t('sortBy')}: {t('sort_' + s)}</option>)}</select>
        </form>
        <div className="row gap8 wrap" role="group" aria-label={t('status')}>
          {STATUSES.map((s) => <button key={s} type="button" className={'btn ' + (f.status === s ? 'on' : '')} aria-pressed={f.status === s} onClick={() => upd({ status: s })}>
            {s === 'all' ? t('all') : t('st_' + s)} <span className="num xs" style={{ opacity: 0.7 }}>{int(s === 'all' ? allCount : counts[s])}</span></button>)}
        </div>
        <div className="xs muted">{t('statusNote')}</div>
      </Card>
      <Loading q={r}>{d && <>
        <div className="grid-kpi">
          <Kpi label={t('customers')} value={int(d.total)} />
          <Kpi label={t('moneyIn')} value={usd(d.money_in, 0)} />
          <Kpi label={t('profit')} value={usd(d.profit, 0)} note={n(d.total) ? `${usd(n(d.profit) / n(d.total))} ${t('perCustomer')}` : ''} />
        </div>
        <Card title={`${int(page * PAGE + (n(d.total) ? 1 : 0))}–${int(Math.min(n(d.total), (page + 1) * PAGE))} / ${int(d.total)}`}>
          <Table cols={[
            { k: 'c', h: t('customer'), f: (x) => <a href={'#/customers?id=' + x.customer_id} style={{ textDecoration: 'none', color: 'inherit' }}><Who x={x} /></a> },
            { k: 's', h: t('status'), f: (x) => <Pill tone={TONE[x.status]}>{t('st_' + x.status)}</Pill> },
            { k: 'l', h: t('lastActive'), num: 1, f: (x) => (x.last_txn ? day(x.last_txn, lang) : '—') },
            { k: 'n', h: t('transactions'), r: 1, num: 1, f: (x) => int(x.txns) },
            { k: 'k', h: t('cards'), r: 1, num: 1, f: (x) => int(x.cards) },
            { k: 'mi', h: t('moneyIn'), r: 1, num: 1, f: (x) => usd(x.money_in, 0) },
            { k: 'p', h: t('profit'), r: 1, num: 1, f: (x) => <b style={{ color: n(x.profit) < 0 ? 'var(--warn)' : undefined }}>{usd(x.profit)}</b> },
            { k: 'o', h: '', r: 1, f: (x) => <button className="btn ghost" onClick={() => open(x)} aria-label={`${t('openItem')} ${x.email}`}>{t('openItem')} →</button> }
          ]} rows={d.rows.map((x) => ({ ...x, key: x.customer_id }))} empty={t('nothingHere')} />
          {f.q && !n(d.total) && <div><a className="btn" style={{ display: 'inline-block', textDecoration: 'none' }} href={'#/transactions?q=' + encodeURIComponent(f.q)}>{t('searchTxnsFor')} “{f.q}” →</a></div>}
          {pages > 1 && <div className="row between">
            <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>← {t('previous')}</button>
            <span className="small muted">{page + 1} / {pages}</span>
            <button className="btn" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>{t('next')} →</button></div>}
        </Card>
      </>}</Loading>
    </Page>
  )
}

export default function Customers() {
  const [id, setId] = useState(hashId)
  const [q0, setQ0] = useState(() => hashGet('q') || '')
  useEffect(() => {
    const on = () => { setId(hashId()); setQ0(hashGet('q') || ''); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return id ? <Detail key={id} id={id} /> : <List key={q0} q0={q0} />
}
