import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, day, n } from '../lib.js'
import { Card, Loading, Table, Pill, AdminOnly } from '../ui.jsx'

const ORDER = ['Company', 'Ismail', 'Mohamed', 'Mustafa', 'Moayed']
const today = () => new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10)

async function loadPayees(periodId, admin) {
  const lines = await q(supabase.from('distribution_lines')
    .select('partner_id, line_type, amount_usd, paid_on, payout_ref, paid_amount, paid_currency, paid_to_account, proof_path, partners(name, is_company)')
    .eq('period_id', periodId))
  const accounts = admin ? await q(supabase.rpc('admin_partner_accounts')) : []
  const by = {}
  for (const l of lines) {
    const o = (by[l.partner_id] ||= { partner_id: l.partner_id, name: l.partners?.name, company: l.partners?.is_company, share: 0, repay: 0 })
    if (l.line_type === 'profit_share') o.share += n(l.amount_usd); else o.repay += n(l.amount_usd)
    for (const k of ['paid_on', 'payout_ref', 'paid_amount', 'paid_currency', 'paid_to_account', 'proof_path']) o[k] = o[k] ?? l[k]
    o.account_on_file = accounts.find((a) => a.partner_id === l.partner_id)?.payout_details || ''
  }
  return Object.values(by).filter((x) => x.share + x.repay > 0).sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name))
}

function PayForm({ period, payee, t, onDone }) {
  const due = payee.share + payee.repay
  const [f, setF] = useState({ date: payee.paid_on || today(), amount: payee.paid_amount ?? due.toFixed(2), currency: payee.paid_currency || 'USD',
    account: payee.paid_to_account || '', ref: payee.payout_ref || '' })
  const [file, setFile] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    setBusy(true); setMsg('')
    try {
      let path = null
      if (file) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
        path = `${period.period_id}/${payee.partner_id}-${Date.now()}.${ext}`
        const up = await supabase.storage.from('payout-proofs').upload(path, file, { contentType: file.type || undefined })
        if (up.error) throw new Error(up.error.message)
      }
      await q(supabase.rpc('admin_record_payout', { p_period: period.period_id, p_partner: payee.partner_id, p_paid_on: f.date,
        p_amount: f.amount === '' ? null : Number(f.amount), p_currency: f.currency, p_account: f.account, p_ref: f.ref, p_proof: path }))
      onDone()
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="card" style={{ background: 'var(--ground)', border: 0 }}>
      <div className="small"><b>{payee.name}</b> · {t('due')} <span className="num">{usd(due)}</span>{payee.account_on_file && <span className="muted"> · {t('accountOnFile')}: {payee.account_on_file}</span>}</div>
      <div className="form-grid">
        <label className="field"><span>{t('paidOn')}</span><input type="date" value={f.date} onChange={set('date')} /></label>
        <label className="field"><span>{t('amountSent')}</span><input type="number" step="0.01" value={f.amount} onChange={set('amount')} /></label>
        <label className="field"><span>{t('currency')}</span><input value={f.currency} onChange={set('currency')} placeholder="USD / SAR / SDG" /></label>
        <label className="field"><span>{t('toAccount')}</span><input value={f.account} onChange={set('account')} /></label>
        <label className="field"><span>{t('reference')}</span><input value={f.ref} onChange={set('ref')} /></label>
        <label className="field"><span>{t('proofScreenshot')}</span><input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
      </div>
      {msg && <div className="alert">{msg}</div>}
      <div className="row gap8"><button className="btn primary" disabled={busy} onClick={save}>{busy ? t('loading') : t('save')}</button>
        <button className="btn" onClick={onDone}>{t('cancel')}</button></div>
    </div>
  )
}

export function Payouts({ period, onChanged }) {
  const { t, lang, role } = useApp()
  const r = useQuery(() => loadPayees(period.period_id, role === 'admin'), [period.period_id, period.status])
  const [edit, setEdit] = useState(null)
  const [msg, setMsg] = useState('')
  const rows = r.data || []
  const done = () => { setEdit(null); r.reload(); onChanged && onChanged() }
  const keep = async (x) => {
    const { error } = await supabase.rpc('admin_record_payout', { p_period: period.period_id, p_partner: x.partner_id, p_paid_on: today(),
      p_amount: Number((x.share + x.repay).toFixed(2)), p_currency: 'USD', p_account: null, p_ref: t('keptInCompany'), p_proof: null })
    setMsg(error ? error.message : ''); done()
  }
  const clear = async (x) => { const { error } = await supabase.rpc('admin_clear_payout', { p_period: period.period_id, p_partner: x.partner_id }); setMsg(error ? error.message : ''); done() }
  const proof = async (path) => {
    const { data, error } = await supabase.storage.from('payout-proofs').createSignedUrl(path, 300)
    if (error) return setMsg(error.message)
    window.open(data.signedUrl, '_blank', 'noopener')
  }
  const paidCount = rows.filter((x) => x.paid_on).length
  return (
    <Loading q={r}>{r.data && <>
      <div className="row between wrap gap8">
        <div className="small">{t('paidSoFar')}: <b className="num">{paidCount} / {rows.length}</b></div>
        <Pill tone={period.status === 'paid' ? 'good' : 'warn'}>{t(period.status)}</Pill>
      </div>
      {msg && <div className="alert">{msg}</div>}
      {edit && <PayForm period={period} payee={edit} t={t} onDone={done} />}
      <Table cols={[
        { k: 'p', h: t('party'), f: (x) => <b>{x.name}</b> },
        { k: 'd', h: t('due'), r: 1, num: 1, f: (x) => <span title={x.repay ? `${t('profitShare')} ${usd(x.share)} + ${t('repayment')} ${usd(x.repay)}` : ''}>{usd(x.share + x.repay)}</span> },
        { k: 'pd', h: t('paidOn'), num: 1, f: (x) => (x.paid_on ? day(x.paid_on, lang) : <span className="muted">—</span>) },
        { k: 'a', h: t('amountSent'), r: 1, num: 1, f: (x) => (x.paid_amount !== null && x.paid_amount !== undefined ? `${n(x.paid_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${x.paid_currency || ''}` : '—') },
        { k: 'ac', h: t('toAccount'), f: (x) => <span className="xs num">{x.paid_to_account || '—'}</span> },
        { k: 'rf', h: t('reference'), f: (x) => <span className="xs num">{x.payout_ref || '—'}</span> },
        { k: 'pr', h: t('proof'), f: (x) => (x.proof_path ? <button className="btn ghost" style={{ minHeight: 32, padding: '4px 0' }} onClick={() => proof(x.proof_path)}>{t('view')}</button> : '—') },
        { k: 'x', h: '', r: 1, f: (x) => <AdminOnly><div className="row gap8" style={{ justifyContent: 'flex-end' }}>
          {!x.paid_on && x.company && <button className="btn ghost" onClick={() => keep(x)}>{t('markKept')}</button>}
          <button className="btn" onClick={() => setEdit(x)}>{x.paid_on ? t('edit') : t('recordPayment')}</button>
          {x.paid_on && <button className="btn ghost" onClick={() => clear(x)}>{t('clear')}</button>}</div></AdminOnly> }
      ]} rows={rows.map((x) => ({ ...x, key: x.partner_id }))} />
    </>}</Loading>
  )
}
