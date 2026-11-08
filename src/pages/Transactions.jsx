import { useEffect, useState } from 'react'
import { supabase, useApp, useQuery, q, usd, int, n } from '../lib.js'
import { Page, Card, Kpi, Loading, Table } from '../ui.jsx'

const PAGE = 100
const iso = (d) => new Date(d).toISOString().slice(0, 10)
const hashQuery = () => new URLSearchParams((window.location.hash.split('?')[1]) || '')
const when = (v) => new Date(v).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })

function blankFilters() {
  const hq = hashQuery()
  return { from: hq.get('q') ? '' : iso(Date.now() - 30 * 864e5), to: '', provider: '', type: '', direction: '', linked: 'all', profit: 'all', min: '', max: '', q: hq.get('q') || '' }
}
function toArgs(f, limit, offset) {
  return {
    p_from: f.from ? f.from + 'T00:00:00+03:00' : null,
    p_to: f.to ? new Date(new Date(f.to + 'T00:00:00+03:00').getTime() + 864e5).toISOString() : null,
    p_provider: f.provider ? Number(f.provider) : null, p_type: f.type ? Number(f.type) : null, p_direction: f.direction || null,
    p_q: f.q || null, p_linked: f.linked, p_profit: f.profit,
    p_min: f.min === '' ? null : Number(f.min), p_max: f.max === '' ? null : Number(f.max), p_limit: limit, p_offset: offset
  }
}

async function loadLists() {
  const [providers, types] = await Promise.all([
    q(supabase.from('providers').select('provider_id, name').order('name')),
    q(supabase.from('txn_types').select('txn_type_id, name').order('name'))
  ])
  return { providers, types }
}

export default function Transactions() {
  const { t } = useApp()
  const lists = useQuery(loadLists)
  const [draft, setDraft] = useState(blankFilters)
  const [f, setF] = useState(draft)
  const [page, setPage] = useState(0)
  const r = useQuery(() => q(supabase.rpc('txn_search', toArgs(f, PAGE, page * PAGE))), [JSON.stringify(f), page])
  const [busy, setBusy] = useState(false)
  const d = r.data
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value })
  const apply = (next = draft) => { setPage(0); setF(next) }

  // follow links like #/transactions?q=email
  useEffect(() => {
    const on = () => { const hq = hashQuery(); if (hq.get('q') !== null) { const next = { ...blankFilters() }; setDraft(next); apply(next) } }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const exportCsv = async () => {
    setBusy(true)
    try {
      const res = await q(supabase.rpc('txn_search', toArgs(f, 5000, 0)))
      const cols = ['txn_time', 'provider', 'txn_type', 'direction', 'status', 'email', 'raw_description', 'source_ref', 'amount_usd', 'fee_usd', 'profit', 'method']
      const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
      const csv = '﻿' + [cols.join(','), ...res.rows.map((x) => cols.map((c) => esc(c === 'txn_time' ? when(x[c]) : x[c])).join(','))].join('\n')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      a.download = `soonapay-transactions-${iso(Date.now())}.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    } finally { setBusy(false) }
  }

  const pages = d ? Math.max(1, Math.ceil(d.total / PAGE)) : 1
  return (
    <Page title={t('transactions')} sub={t('transactionsSub')}>
      <Card>
        <form className="form-grid" onSubmit={(e) => { e.preventDefault(); apply() }}>
          <label className="field" style={{ gridColumn: 'span 2' }}><span>{t('searchTxn')}</span><input value={draft.q} onChange={set('q')} placeholder={t('searchTxnPh')} /></label>
          <label className="field"><span>{t('from')}</span><input type="date" value={draft.from} onChange={set('from')} /></label>
          <label className="field"><span>{t('to')}</span><input type="date" value={draft.to} onChange={set('to')} /></label>
          <label className="field"><span>{t('provider')}</span><select value={draft.provider} onChange={set('provider')}>
            <option value="">{t('all')}</option>{(lists.data?.providers || []).map((p) => <option key={p.provider_id} value={p.provider_id}>{p.name}</option>)}</select></label>
          <label className="field"><span>{t('txnType')}</span><select value={draft.type} onChange={set('type')}>
            <option value="">{t('all')}</option>{(lists.data?.types || []).map((y) => <option key={y.txn_type_id} value={y.txn_type_id}>{y.name}</option>)}</select></label>
          <label className="field"><span>{t('direction')}</span><select value={draft.direction} onChange={set('direction')}>
            <option value="">{t('all')}</option><option value="credit">{t('credit')}</option><option value="debit">{t('debit')}</option></select></label>
          <label className="field"><span>{t('customer')}</span><select value={draft.linked} onChange={set('linked')}>
            <option value="all">{t('all')}</option><option value="yes">{t('linkedYes')}</option><option value="no">{t('linkedNo')}</option></select></label>
          <label className="field"><span>{t('profit')}</span><select value={draft.profit} onChange={set('profit')}>
            <option value="all">{t('all')}</option><option value="positive">{t('profitPos')}</option><option value="negative">{t('profitNeg')}</option><option value="zero">{t('profitZero')}</option></select></label>
          <label className="field"><span>{t('minAmount')}</span><input type="number" step="0.01" value={draft.min} onChange={set('min')} /></label>
          <label className="field"><span>{t('maxAmount')}</span><input type="number" step="0.01" value={draft.max} onChange={set('max')} /></label>
          <div className="field"><span>&nbsp;</span><div className="row gap8">
            <button className="btn primary" type="submit">{t('apply')}</button>
            <button className="btn" type="button" onClick={() => { const b = { ...blankFilters(), q: '', from: iso(Date.now() - 30 * 864e5) }; setDraft(b); apply(b) }}>{t('reset')}</button></div></div>
        </form>
      </Card>
      <Loading q={r}>{d && <>
        <div className="grid-kpi">
          <Kpi tone="soft" label={t('transactions')} value={int(d.total)} />
          <Kpi tone="soft" label={t('amount')} value={usd(d.amount, 0)} />
          <Kpi tone={n(d.profit) < 0 ? 'warn' : 'good'} label={t('profit')} value={usd(d.profit)} />
          <Kpi tone="soft" label={t('customers')} value={int(d.customers)} />
        </div>
        <Card right={<button className="btn" disabled={busy || !d.total} onClick={exportCsv}>{busy ? t('loading') : t('exportCsv')}{d.total > 5000 ? ' (5,000)' : ''}</button>}
              title={`${int(page * PAGE + (d.total ? 1 : 0))}–${int(Math.min(d.total, (page + 1) * PAGE))} / ${int(d.total)}`}>
          <Table cols={[
            { k: 'd', h: t('date'), num: 1, f: (x) => <span className="xs" style={{ whiteSpace: 'nowrap' }}>{when(x.txn_time)}</span> },
            { k: 'p', h: t('provider'), f: (x) => <span className="xs">{x.provider}</span> },
            { k: 'y', h: t('txnType'), f: (x) => <span className="xs">{x.txn_type || '—'}{x.method ? ` · ${x.method}` : ''}</span> },
            { k: 'c', h: t('customer'), f: (x) => x.email
              ? <a className="xs num" href={'#/transactions?q=' + encodeURIComponent(x.email)}>{x.email}</a>
              : <span className="xs muted">—</span> },
            { k: 'ds', h: t('description'), f: (x) => <span className="xs" title={x.raw_description || ''}>{String(x.raw_description || '').slice(0, 48)}</span> },
            { k: 'a', h: t('amount'), r: 1, num: 1, f: (x) => <span style={{ color: x.direction === 'debit' ? 'var(--muted)' : undefined }}>{x.direction === 'debit' ? '−' : ''}{usd(x.amount_usd)}</span> },
            { k: 'pf', h: t('profit'), r: 1, num: 1, f: (x) => <span style={{ color: n(x.profit) < 0 ? 'var(--warn)' : n(x.profit) > 0 ? 'var(--good)' : 'var(--muted)' }}>{usd(x.profit)}</span> }
          ]} rows={(d.rows || []).map((x) => ({ ...x, key: x.txn_id }))} empty={t('nothingHere')} />
          {pages > 1 && <div className="row between">
            <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>← {t('previous')}</button>
            <span className="small muted">{page + 1} / {pages}</span>
            <button className="btn" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>{t('next')} →</button></div>}
        </Card>
      </>}</Loading>
    </Page>
  )
}
