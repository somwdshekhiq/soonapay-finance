import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, int, n } from '../lib.js'
import { Page, Card, Kpi, Loading, Table, Pill, AdminOnly } from '../ui.jsx'

const when = (v) => new Date(v).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const stamp = () => new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 16).replace(/[-:T]/g, '')

async function load() {
  const [fees, batches] = await Promise.all([
    q(supabase.rpc('pago_auth_fees')),
    q(supabase.from('backcharge_batches').select('*').order('batch_id', { ascending: false }).limit(30))
  ])
  // one line per user: everything, already deducted (earlier batches), still to deduct
  const by = {}
  for (const f of fees) {
    const k = f.customer_id ?? 'none:' + (f.card_id || '')
    const u = (by[k] = by[k] || { key: String(k), email: f.email, name: f.user_name, count: 0, total: 0, charged: 0, due: 0, dueCount: 0, cards: new Set() })
    const a = n(f.amount_usd)
    u.count++; u.total += a; if (f.card_id) u.cards.add(f.card_id)
    if (f.batch_id) u.charged += a; else { u.due += a; u.dueCount++ }
    if (!u.name && f.user_name) u.name = f.user_name
  }
  const users = Object.values(by).map((u) => ({ ...u, cards: [...u.cards] })).sort((a, b) => b.due - a.due || b.total - a.total)
  return { fees, batches, users }
}

export default function Backcharges() {
  const { t } = useApp()
  const r = useQuery(load)
  const d = r.data
  const [show, setShow] = useState('due')
  const [qtext, setQtext] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [note, setNote] = useState('')

  const match = (x) => !qtext || [x.email, x.name, x.user_name, x.card_id, x.order_id].some((v) => String(v || '').toLowerCase().includes(qtext.toLowerCase()))
  const due = d ? d.fees.filter((f) => !f.batch_id) : []
  const tot = d ? {
    total: d.fees.reduce((s, f) => s + n(f.amount_usd), 0), charged: d.fees.filter((f) => f.batch_id).reduce((s, f) => s + n(f.amount_usd), 0),
    due: due.reduce((s, f) => s + n(f.amount_usd), 0), dueUsers: new Set(due.map((f) => f.customer_id)).size
  } : {}
  const logRows = d ? d.fees.filter((f) => (show === 'all' ? true : show === 'due' ? !f.batch_id : !!f.batch_id)).filter(match) : []

  const exportXlsx = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const summary = d.users.map((u) => ({ User: u.name || '', Email: u.email || '', 'Card IDs': u.cards.join(', '), Fees: u.count,
      'Already deducted': +u.charged.toFixed(2), 'To deduct now': +u.due.toFixed(2), 'Total deduction': +u.total.toFixed(2) }))
    summary.push({ User: 'TOTAL', Email: '', 'Card IDs': '', Fees: d.fees.length, 'Already deducted': +tot.charged.toFixed(2), 'To deduct now': +tot.due.toFixed(2), 'Total deduction': +tot.total.toFixed(2) })
    const row = (f) => ({ Date: when(f.txn_time), User: f.user_name || '', Email: f.email || '', 'Card ID': f.card_id || '', 'Order ID': f.order_id || '',
      Amount: +n(f.amount_usd).toFixed(2), Status: f.batch_id ? `Deducted (batch ${f.batch_id})` : 'To deduct' })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary by user')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(due.map(row)), 'Fees to deduct')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.fees.map(row)), 'All fees')
    XLSX.writeFile(wb, `pago-authorization-fees-${stamp()}.xlsx`)
  }
  const markCharged = async () => {
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('admin_mark_backcharged', { p_txn_ids: due.map((f) => f.txn_id), p_note: note })
    setBusy(false); setConfirm(false); setNote('')
    setMsg(error ? { bad: error.message } : { ok: t('batchSaved').replace('{b}', data.batch_id).replace('{n}', int(data.items)).replace('{u}', int(data.users)).replace('{a}', usd(data.total)) })
    r.reload()
  }
  const undo = async (b) => {
    const { error } = await supabase.rpc('admin_undo_backcharge', { p_batch: b })
    setMsg(error ? { bad: error.message } : { ok: t('batchUndone').replace('{b}', b) }); r.reload()
  }

  return (
    <Page title={t('backcharges')} sub={t('backchargesSub')}>
      <Loading q={r}>{d && <>
        {msg && <div className={msg.bad ? 'alert' : 'ok'}>{msg.bad || msg.ok}</div>}
        <div className="grid-kpi">
          <Kpi tone="warn" label={t('toDeductNow')} value={usd(tot.due)} note={`${int(due.length)} ${t('fees')} · ${int(tot.dueUsers)} ${t('users')}`} />
          <Kpi tone="soft" label={t('alreadyDeducted')} value={usd(tot.charged)} />
          <Kpi tone="soft" label={t('totalDeduction')} value={usd(tot.total)} note={`${int(d.fees.length)} ${t('fees')} · ${int(d.users.length)} ${t('users')}`} />
        </div>

        <Card title={t('summaryByUser')} right={<div className="row gap8 wrap">
            <button className="btn" onClick={exportXlsx}>{t('exportExcel')}</button>
            <AdminOnly><button className="btn primary" disabled={!due.length} onClick={() => setConfirm(true)}>{t('markDeducted')} ({usd(tot.due)})</button></AdminOnly></div>}>
          {confirm && (
            <div className="card" style={{ background: 'var(--warn-s)', border: 0 }}>
              <div className="small">{t('markDeductedConfirm').replace('{n}', int(due.length)).replace('{u}', int(tot.dueUsers)).replace('{a}', usd(tot.due))}</div>
              <label className="field"><span>{t('note')}</span><input value={note} placeholder={t('batchNotePh')} onChange={(e) => setNote(e.target.value)} /></label>
              <div className="row gap8"><button className="btn primary" disabled={busy} onClick={markCharged}>{busy ? t('loading') : t('confirm')}</button>
                <button className="btn" onClick={() => setConfirm(false)}>{t('cancel')}</button></div>
            </div>
          )}
          <Table cols={[
            { k: 'n', h: t('user'), f: (x) => <span className="xs">{x.name || '—'}</span> },
            { k: 'e', h: t('email'), f: (x) => x.email ? <a className="xs num" href={'#/transactions?q=' + encodeURIComponent(x.email)}>{x.email}</a> : <span className="xs muted">{t('linkedNo')}</span> },
            { k: 'c', h: t('fees'), r: 1, num: 1, f: (x) => int(x.count) },
            { k: 'ch', h: t('alreadyDeducted'), r: 1, num: 1, f: (x) => usd(x.charged) },
            { k: 'du', h: t('toDeductNow'), r: 1, num: 1, f: (x) => <b style={{ color: x.due > 0 ? 'var(--warn)' : 'var(--muted)' }}>{usd(x.due)}</b> },
            { k: 't', h: t('totalDeduction'), r: 1, num: 1, f: (x) => usd(x.total) }
          ]} rows={d.users.filter(match).map((u) => ({ ...u }))} empty={t('nothingHere')} />
        </Card>

        <Card title={t('feeLog')} right={<div className="row gap8 wrap">
            <input className="inp" style={{ width: 240 }} aria-label={t('search')} placeholder={t('searchFeesPh')} value={qtext} onChange={(e) => setQtext(e.target.value)} />
            {[['due', t('toDeduct')], ['charged', t('deducted')], ['all', t('all')]].map(([k, l]) =>
              <button key={k} className={'btn ' + (show === k ? 'on' : '')} onClick={() => setShow(k)}>{l}</button>)}</div>}>
          <Table cols={[
            { k: 'd', h: t('date'), num: 1, f: (x) => <span className="xs" style={{ whiteSpace: 'nowrap' }}>{when(x.txn_time)}</span> },
            { k: 'u', h: t('user'), f: (x) => <span className="xs">{x.user_name || '—'}</span> },
            { k: 'e', h: t('email'), f: (x) => <span className="xs num">{x.email || '—'}</span> },
            { k: 'c', h: t('cardId'), f: (x) => <span className="xs num">{x.card_id}</span> },
            { k: 'o', h: t('orderId'), f: (x) => <span className="xs num">{x.order_id}</span> },
            { k: 'a', h: t('amount'), r: 1, num: 1, f: (x) => usd(x.amount_usd) },
            { k: 's', h: t('status'), f: (x) => <Pill tone={x.batch_id ? 'good' : 'warn'}>{x.batch_id ? `${t('deducted')} · #${x.batch_id}` : t('toDeduct')}</Pill> }
          ]} rows={logRows.slice(0, 500).map((x) => ({ ...x, key: x.txn_id }))} empty={t('nothingHere')} />
          {logRows.length > 500 && <div className="xs muted">{t('showingFirst')} 500 / {int(logRows.length)} · {t('exportForAll')}</div>}
        </Card>

        {d.batches.length > 0 && (
          <Card title={t('deductionBatches')}>
            <Table cols={[
              { k: 'b', h: '#', num: 1, f: (x) => x.batch_id },
              { k: 'd', h: t('date'), num: 1, f: (x) => <span className="xs">{when(x.created_at)}</span> },
              { k: 'i', h: t('fees'), r: 1, num: 1, f: (x) => int(x.items) },
              { k: 'u', h: t('users'), r: 1, num: 1, f: (x) => int(x.users) },
              { k: 'a', h: t('amount'), r: 1, num: 1, f: (x) => usd(x.total_usd) },
              { k: 'n', h: t('note'), f: (x) => <span className="xs muted">{x.note}</span> },
              { k: 's', h: '', r: 1, f: (x) => x.undone_at ? <Pill tone="grey">{t('undone')}</Pill>
                : <AdminOnly><button className="btn ghost" onClick={() => undo(x.batch_id)}>{t('undo')}</button></AdminOnly> }
            ]} rows={d.batches.map((x) => ({ ...x, key: x.batch_id }))} />
          </Card>
        )}
      </>}</Loading>
    </Page>
  )
}
