import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, int, n } from '../lib.js'
import { Page, Card, Kpi, Loading, Table, Pill, AdminOnly } from '../ui.jsx'

const when = (v) => new Date(v).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
// A normal Pago authorization fee is $0.30. Anything above is not deducted from the user until Pagocards confirms it.
export const FEE_LIMIT = 0.30
export const overLimit = (f) => n(f.amount_usd) > FEE_LIMIT + 0.0001
// review by the admin after Pagocards answers: approved (with the amount to keep) or rejected (dropped, counts as 0)
const held = (f) => overLimit(f) && !f.rev            // still waiting for Pagocards
const eff = (f) => (f.rev ? (f.rev.status === 'approved' ? n(f.rev.approved_amount) : 0) : n(f.amount_usd))
const refundOf = (f) => (f.batch_id && f.rev ? Math.max(0, n(f.amount_usd) - eff(f)) : 0)
const stamp = () => new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 16).replace(/[-:T]/g, '')

async function load() {
  const [fees0, batches, reviews] = await Promise.all([
    q(supabase.rpc('pago_auth_fees')),
    q(supabase.from('backcharge_batches').select('*').order('batch_id', { ascending: false }).limit(30)),
    q(supabase.from('fee_reviews').select('txn_id, status, approved_amount, note, reviewed_at'))
  ])
  const rv = Object.fromEntries(reviews.map((x) => [x.txn_id, x]))
  const fees = fees0.map((f) => ({ ...f, rev: rv[f.txn_id] || null }))
  // one line per user: everything, already deducted (earlier batches), still to deduct
  const by = {}
  for (const f of fees) {
    const k = f.customer_id ?? 'none:' + (f.card_id || '')
    const u = (by[k] = by[k] || { key: String(k), email: f.email, name: f.user_name, count: 0, total: 0, charged: 0, due: 0, dueCount: 0, check: 0, checkCount: 0, refund: 0, cards: new Set() })
    const a = n(f.amount_usd)
    u.count++; u.total += a; if (f.card_id) u.cards.add(f.card_id)
    if (f.batch_id) { u.charged += a; u.refund += refundOf(f) }
    else if (held(f)) { u.check += a; u.checkCount++ }
    else if (eff(f) > 0) { u.due += eff(f); u.dueCount++ }
    if (!u.name && f.user_name) u.name = f.user_name
  }
  const users = Object.values(by).map((u) => ({ ...u, cards: [...u.cards] })).sort((a, b) => b.due - a.due || b.check - a.check || b.total - a.total)
  return { fees, batches, users }
}

function ReviewCell({ f, t, admin, onSave }) {
  const [amt, setAmt] = useState(f.rev?.status === 'approved' ? String(f.rev.approved_amount) : String(n(f.amount_usd).toFixed(2)))
  const [busy, setBusy] = useState(false)
  if (!admin) return null
  const go = async (status) => { setBusy(true); await onSave(f.txn_id, status, status === 'approved' ? amt : null); setBusy(false) }
  return (
    <span className="row gap8 wrap" style={{ alignItems: 'center', maxWidth: 200, rowGap: 6 }}>
      <input className="inp num" type="number" step="0.01" min="0" max={n(f.amount_usd)} style={{ width: 74, minHeight: 34, padding: '4px 8px' }} aria-label={t('feeApprovedAmt')} title={t('feeApprovedAmt')}
        value={amt} disabled={busy || f.rev?.status === 'rejected'} onChange={(e) => setAmt(e.target.value)} />
      <button style={{ minHeight: 34, padding: '4px 10px' }} className="btn" disabled={busy || amt === ''} onClick={() => go('approved')}>{f.rev?.status === 'approved' ? t('save') : t('feeApprove')}</button>
      <button style={{ minHeight: 34, padding: '4px 10px' }} className="btn" disabled={busy || f.rev?.status === 'rejected'} onClick={() => go('rejected')}>{t('feeReject')}</button>
      {f.rev && <button style={{ minHeight: 34, padding: '4px 10px' }} className="btn ghost" disabled={busy} onClick={() => go('pending')} title={t('feeReset')} aria-label={t('feeReset')}>↺</button>}
    </span>
  )
}

export default function Backcharges() {
  const { t, role } = useApp()
  const admin = role === 'admin'
  const r = useQuery(load)
  const d = r.data
  const [show, setShow] = useState('due')
  const [qtext, setQtext] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [note, setNote] = useState('')

  const match = (x) => !qtext || [x.email, x.name, x.user_name, x.card_id, x.order_id].some((v) => String(v || '').toLowerCase().includes(qtext.toLowerCase()))
  const due = d ? d.fees.filter((f) => !f.batch_id && !held(f) && eff(f) > 0) : []
  const toCheck = d ? d.fees.filter((f) => !f.batch_id && held(f)) : []
  const overCharged = d ? d.fees.filter((f) => f.batch_id && held(f)) : []
  const refunds = d ? d.fees.filter((f) => refundOf(f) > 0.0001) : []
  const sumOf = (l) => l.reduce((s, f) => s + n(f.amount_usd), 0)
  const tot = d ? {
    total: d.fees.reduce((s, f) => s + (!f.batch_id && held(f) ? 0 : eff(f)), 0), charged: d.fees.filter((f) => f.batch_id).reduce((s, f) => s + n(f.amount_usd), 0),
    due: due.reduce((s, f) => s + eff(f), 0), dueUsers: new Set(due.map((f) => f.customer_id)).size, refund: refunds.reduce((s, f) => s + refundOf(f), 0)
  } : {}
  const logRows = d ? d.fees.filter((f) => (show === 'all' ? true : show === 'check' ? overLimit(f) : show === 'due' ? !f.batch_id && !held(f) && eff(f) > 0 : !!f.batch_id)).filter(match) : []
  const review = async (txn, status, amount) => {
    const { error } = await supabase.rpc('admin_set_fee_review', { p_txn: txn, p_status: status, p_amount: amount === null || amount === '' ? null : Number(amount) })
    if (error) setMsg({ bad: error.message }); else r.reload()
  }

  const exportXlsx = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const summary = d.users.map((u) => ({ User: u.name || '', Email: u.email || '', 'Card IDs': u.cards.join(', '), Fees: u.count,
      'Already deducted': +u.charged.toFixed(2), 'To deduct now': +u.due.toFixed(2), 'On hold - check with Pagocards': +u.check.toFixed(2), 'To refund': +u.refund.toFixed(2), 'Total deduction': +(u.charged - u.refund + u.due).toFixed(2) }))
    summary.push({ User: 'TOTAL', Email: '', 'Card IDs': '', Fees: d.fees.length, 'Already deducted': +tot.charged.toFixed(2), 'To deduct now': +tot.due.toFixed(2), 'On hold - check with Pagocards': +sumOf(toCheck).toFixed(2), 'To refund': +tot.refund.toFixed(2), 'Total deduction': +(tot.charged - tot.refund + tot.due).toFixed(2) })
    const row = (f) => ({ Date: when(f.txn_time), User: f.user_name || '', Email: f.email || '', 'Card ID': f.card_id || '', 'Order ID': f.order_id || '',
      Amount: +n(f.amount_usd).toFixed(2), Review: f.rev ? (f.rev.status === 'approved' ? 'Approved' : 'Rejected') : '', 'Final fee': +eff(f).toFixed(2), 'To refund': +refundOf(f).toFixed(2),
      Status: f.batch_id ? `Deducted (batch ${f.batch_id})${overLimit(f) ? ' - above $0.30' : ''}` : f.rev?.status === 'rejected' ? 'Rejected - dropped' : held(f) ? 'On hold - check with Pagocards' : 'To deduct' })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary by user')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(due.map(row)), 'Fees to deduct')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.fees.filter(overLimit).map(row)), 'Above 0.30')
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
        {(toCheck.length > 0 || overCharged.length > 0) && (
          <div className="alert">
            <b>{t('feeCheckTitle')}</b> {t('feeCheckText').replace('{n}', int(toCheck.length)).replace('{a}', usd(sumOf(toCheck)))}
            {overCharged.length > 0 && <> {t('feeCheckCharged').replace('{n}', int(overCharged.length)).replace('{a}', usd(sumOf(overCharged)))}</>}
            {' '}<button className="btn ghost" style={{ minHeight: 0, padding: '2px 8px' }} onClick={() => setShow('check')}>{t('feeCheckShow')}</button>
          </div>
        )}
        {refunds.length > 0 && <div className="alert"><b>{t('feeRefundTitle')}</b> {t('feeRefundText').replace('{n}', int(refunds.length)).replace('{a}', usd(tot.refund))}</div>}
        <div className="grid-kpi">
          <Kpi tone="warn" label={t('toDeductNow')} value={usd(tot.due)} note={`${int(due.length)} ${t('fees')} · ${int(tot.dueUsers)} ${t('users')}`} />
          <Kpi tone="soft" label={t('alreadyDeducted')} value={usd(tot.charged)} />
          {toCheck.length > 0 && <Kpi tone="soft" label={t('feeOnHold')} value={usd(sumOf(toCheck))} note={`${int(toCheck.length)} ${t('fees')} · ${t('feeAbove')}`} />}
          {refunds.length > 0 && <Kpi tone="warn" label={t('feeRefund')} value={usd(tot.refund)} note={`${int(refunds.length)} ${t('fees')}`} />}
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
            { k: 'ck', h: t('feeCheckTab'), r: 1, num: 1, f: (x) => (x.check > 0 ? <span style={{ color: 'var(--accent-d)' }}>{usd(x.check)}</span> : '') },
            ...(tot.refund > 0 ? [{ k: 'rf', h: t('feeRefund'), r: 1, num: 1, f: (x) => (x.refund > 0 ? <b style={{ color: 'var(--warn)' }}>{usd(x.refund)}</b> : '') }] : []),
            { k: 't', h: t('totalDeduction'), r: 1, num: 1, f: (x) => usd(x.charged - x.refund + x.due) }
          ]} rows={d.users.filter(match).map((u) => ({ ...u }))} empty={t('nothingHere')} />
        </Card>

        <Card title={t('feeLog')} right={<div className="row gap8 wrap">
            <input className="inp" style={{ width: 240 }} aria-label={t('search')} placeholder={t('searchFeesPh')} value={qtext} onChange={(e) => setQtext(e.target.value)} />
            {[['due', t('toDeduct')], ['check', t('feeCheckTab')], ['charged', t('deducted')], ['all', t('all')]].map(([k, l]) =>
              <button key={k} className={'btn ' + (show === k ? 'on' : '')} onClick={() => setShow(k)}>{l}</button>)}</div>}>
          <Table cols={[
            { k: 'd', h: t('date'), num: 1, f: (x) => <span className="xs" style={{ whiteSpace: 'nowrap' }}>{when(x.txn_time)}</span> },
            { k: 'u', h: t('user'), f: (x) => <span className="xs">{x.user_name || '—'}</span> },
            { k: 'e', h: t('email'), f: (x) => <span className="xs num">{x.email || '—'}</span> },
            { k: 'c', h: t('cardId'), f: (x) => <span className="xs num" title={x.card_id}>{x.card_id && x.card_id.length > 12 ? '…' + x.card_id.slice(-8) : x.card_id}</span> },
            { k: 'o', h: t('orderId'), f: (x) => <span className="xs num">{x.order_id}</span> },
            { k: 'a', h: t('amount'), r: 1, num: 1, f: (x) => <span style={overLimit(x) ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>{usd(x.amount_usd)}</span> },
            { k: 's', h: t('status'), f: (x) => <span className="chips">{x.batch_id && <Pill tone="good">{`${t('deducted')} · #${x.batch_id}`}</Pill>}{!x.batch_id && !overLimit(x) && <Pill tone="warn">{t('toDeduct')}</Pill>}
              {!x.batch_id && x.rev?.status === 'approved' && eff(x) > 0 && <Pill tone="warn">{t('toDeduct')}</Pill>}
              {held(x) && <Pill tone="violet">{t('feeCheckPill')}</Pill>}{x.rev?.status === 'approved' && <Pill tone="good">{t('feeApproved')} · {usd(eff(x))}</Pill>}{x.rev?.status === 'rejected' && <Pill tone="grey">{t('feeRejected')}</Pill>}
              {refundOf(x) > 0.0001 && <Pill tone="violet">{t('feeRefund')} {usd(refundOf(x))}</Pill>}</span> },
            { k: 'rv', h: t('feeReview'), f: (x) => (overLimit(x) ? <ReviewCell f={x} t={t} admin={admin} onSave={review} /> : '') }
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
