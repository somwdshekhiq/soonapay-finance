import { useState } from 'react'
import { supabase, useApp, useQuery, q, day } from '../lib.js'
import { Page, Card, Loading, Table, Pill } from '../ui.jsx'
import { readFile, FIELDS, REQUIRED } from './Import.jsx'

async function load() {
  const [providers, profiles, types] = await Promise.all([
    q(supabase.from('providers').select('*').order('provider_id')),
    q(supabase.from('import_profiles').select('*').order('profile_id')),
    q(supabase.from('txn_types').select('txn_type_id, name').order('name'))
  ])
  return { providers, profiles, types }
}

// Guess which file column holds each field, from common header words
const GUESS = {
  ref: ['reference', 'ref', 'trx', 'transaction id', 'id', 'batch'], time: ['date', 'time', 'created', 'paid at'],
  amount: ['amount', 'total', 'value'], fee: ['fee', 'charge', 'commission'], direction: ['direction', 'type', 'dr/cr'],
  raw_type: ['type'], raw_category: ['category', 'wallet', 'product'], desc: ['description', 'user', 'details', 'narration', 'store', 'reference'],
  status: ['status', 'state'], email: ['email', 'e-mail'], method: ['method', 'gateway', 'channel']
}
function guess(headers, field, used) {
  const low = headers.map((h) => String(h).trim().toLowerCase())
  for (const w of GUESS[field] || []) {
    const i = low.findIndex((h, j) => !used.has(j) && (h === w || h.includes(w)))
    if (i >= 0) return headers[i]
  }
  return ''
}
function findHeader(rows) {
  for (let i = 0; i < Math.min(15, rows.length); i++) if (rows[i].filter((c) => String(c).trim() !== '').length >= 3) return i
  return 0
}

function ProviderForm({ init, onDone, t }) {
  const [f, setF] = useState(init || { name: '', status: 'active', source_timezone: 'Asia/Riyadh', track_balance: false, balance_order: null, notes: '' })
  const [msg, setMsg] = useState('')
  const save = async () => {
    if (!f.name.trim()) return setMsg(t('nameRequired'))
    const row = { name: f.name.trim(), status: f.status, source_timezone: f.source_timezone || 'UTC', track_balance: !!f.track_balance,
      balance_order: f.balance_order === '' || f.balance_order === null ? null : Number(f.balance_order), notes: f.notes || null,
      retired_on: f.status === 'retired' ? (f.retired_on || new Date().toISOString().slice(0, 10)) : null }
    const res = f.provider_id ? await supabase.from('providers').update(row).eq('provider_id', f.provider_id) : await supabase.from('providers').insert(row)
    if (res.error) return setMsg(res.error.message)
    onDone()
  }
  return (
    <Card title={f.provider_id ? t('editProvider') : t('addProvider')}>
      <div className="form-grid">
        <label className="field"><span>{t('name')}</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field"><span>{t('status')}</span><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="active">{t('active')}</option><option value="retired">{t('retired')}</option></select></label>
        <label className="field"><span>{t('fileTimezone')}</span><input value={f.source_timezone} onChange={(e) => setF({ ...f, source_timezone: e.target.value })} /></label>
        <label className="field"><span>{t('walletOrder')}</span><input type="number" value={f.balance_order ?? ''} onChange={(e) => setF({ ...f, balance_order: e.target.value })} /></label>
      </div>
      <label className="row gap8 small"><input type="checkbox" checked={!!f.track_balance} onChange={(e) => setF({ ...f, track_balance: e.target.checked })} />{t('trackWallet')}</label>
      <label className="field"><span>{t('note')}</span><input value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
      {msg && <div className="alert">{msg}</div>}
      <div className="row gap8"><button className="btn primary" onClick={save}>{t('save')}</button><button className="btn" onClick={onDone}>{t('cancel')}</button></div>
    </Card>
  )
}

function ProfileForm({ d, init, onDone, t }) {
  const blank = { provider_id: d.providers.find((p) => p.status === 'active')?.provider_id, name: '', file_type: 'xlsx', header_row: 1, column_map: {},
    amount_parse: 'number_in_text', timezone: 'Asia/Riyadh', fixed_direction: '', fixed_txn_type: '', valid_status: '', email_from_description: false }
  const [f, setF] = useState(init ? { ...init, fixed_direction: init.fixed_direction || '', fixed_txn_type: init.fixed_txn_type || '', valid_status: init.valid_status || '' } : blank)
  const [headers, setHeaders] = useState(init ? Object.values(init.column_map || {}) : [])
  const [sample, setSample] = useState(null)
  const [msg, setMsg] = useState('')
  const map = f.column_map || {}
  const setMap = (k, v) => setF({ ...f, column_map: { ...map, [k]: v || undefined } })

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setMsg('')
    try {
      const sheets = await readFile(file)
      const s = sheets[0], hr = findHeader(s.rows)
      const hs = s.rows[hr].map((h) => String(h).trim()).filter(Boolean)
      const used = new Set(), cm = {}
      for (const fld of FIELDS) {
        if (fld === 'raw_type' && cm.direction) continue
        const g = guess(hs, fld, used)
        if (g) { cm[fld] = g; used.add(hs.indexOf(g)) }
      }
      const ext = file.name.split('.').pop().toLowerCase()
      setHeaders(hs); setSample(s.rows.slice(hr + 1, hr + 4))
      setF({ ...f, header_row: hr + 1, file_type: ext === 'csv' ? 'csv' : 'xlsx', column_map: cm, name: f.name || file.name.replace(/\.[^.]+$/, '') })
    } catch (err) { setMsg(err.message) }
  }
  const save = async () => {
    const missing = REQUIRED.filter((k) => !map[k])
    if (!f.name.trim() || missing.length) return setMsg(`${t('missingFields')}: ${missing.map((k) => t('field_' + k)).join(', ') || t('name')}`)
    if (!f.fixed_direction && !map.direction) return setMsg(t('needDirection'))
    const cm = Object.fromEntries(Object.entries(map).filter(([, v]) => v))
    const row = { provider_id: Number(f.provider_id), name: f.name.trim(), file_type: f.file_type, header_row: Number(f.header_row) || 1, column_map: cm,
      amount_parse: f.amount_parse || 'number_in_text', timezone: f.timezone || 'Asia/Riyadh', fixed_direction: f.fixed_direction || null,
      fixed_txn_type: f.fixed_txn_type || null, valid_status: f.valid_status.trim() || null, email_from_description: !!f.email_from_description }
    const res = f.profile_id ? await supabase.from('import_profiles').update(row).eq('profile_id', f.profile_id) : await supabase.from('import_profiles').insert(row)
    if (res.error) return setMsg(res.error.message)
    onDone()
  }
  return (
    <Card title={f.profile_id ? t('editProfile') : t('addProfile')}>
      {!f.profile_id && <label className="field"><span>{t('sampleFile')}</span><input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} /></label>}
      <div className="xs muted">{t('sampleFileNote')}</div>
      <div className="form-grid">
        <label className="field"><span>{t('provider')}</span><select value={f.provider_id} onChange={(e) => setF({ ...f, provider_id: e.target.value })}>
          {d.providers.map((p) => <option key={p.provider_id} value={p.provider_id}>{p.name}</option>)}</select></label>
        <label className="field"><span>{t('slotName')}</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field"><span>{t('direction')}</span><select value={f.fixed_direction} onChange={(e) => setF({ ...f, fixed_direction: e.target.value })}>
          <option value="">{t('fromColumn')}</option><option value="credit">{t('allCredit')}</option><option value="debit">{t('allDebit')}</option></select></label>
        <label className="field"><span>{t('txnType')}</span><select value={f.fixed_txn_type} onChange={(e) => setF({ ...f, fixed_txn_type: e.target.value })}>
          <option value="">{t('byTypeRules')}</option>{d.types.map((y) => <option key={y.txn_type_id} value={y.name}>{y.name}</option>)}</select></label>
        <label className="field"><span>{t('validStatus')}</span><input value={f.valid_status} placeholder={t('validStatusPh')} onChange={(e) => setF({ ...f, valid_status: e.target.value })} /></label>
        <label className="field"><span>{t('fileTimezone')}</span><input value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} /></label>
      </div>
      <label className="row gap8 small"><input type="checkbox" checked={!!f.email_from_description} onChange={(e) => setF({ ...f, email_from_description: e.target.checked })} />{t('emailFromDesc')}</label>
      <h2 style={{ marginTop: 8 }}>{t('columnMapping')}</h2>
      <div className="form-grid">
        {FIELDS.map((k) => (
          <label key={k} className="field"><span>{t('field_' + k)}{REQUIRED.includes(k) ? ' *' : ''}</span>
            {headers.length
              ? <select value={map[k] || ''} onChange={(e) => setMap(k, e.target.value)}>
                  <option value="">—</option>{[...new Set(headers)].map((h) => <option key={h} value={h}>{h}</option>)}</select>
              : <input value={map[k] || ''} onChange={(e) => setMap(k, e.target.value)} placeholder={t('columnHeader')} />}
          </label>
        ))}
      </div>
      {sample && headers.length > 0 && (
        <div className="tbl-wrap"><table className="tbl"><thead><tr>{FIELDS.filter((k) => map[k]).map((k) => <th key={k}>{t('field_' + k)}</th>)}</tr></thead>
          <tbody>{sample.map((r, i) => <tr key={i}>{FIELDS.filter((k) => map[k]).map((k) => {
            const hs = (headers.length ? headers : []); const j = hs.indexOf(map[k])
            return <td key={k} className="xs">{String(r[j] ?? '').slice(0, 30)}</td> })}</tr>)}</tbody></table></div>
      )}
      {msg && <div className="alert">{msg}</div>}
      <div className="row gap8"><button className="btn primary" onClick={save}>{t('save')}</button><button className="btn" onClick={onDone}>{t('cancel')}</button></div>
    </Card>
  )
}

export default function Providers() {
  const { t, lang } = useApp()
  const r = useQuery(load)
  const d = r.data
  const [form, setForm] = useState(null)
  const done = () => { setForm(null); r.reload() }
  const toggleProfile = async (p) => {
    await supabase.from('import_profiles').update({ active_to: p.active_to ? null : new Date().toISOString().slice(0, 10) }).eq('profile_id', p.profile_id)
    r.reload()
  }
  return (
    <Page title={t('providers')} sub={t('providersSub')} actions={<div className="row gap8 wrap">
      <button className="btn" onClick={() => setForm({ kind: 'provider' })}>{t('addProvider')}</button>
      <button className="btn primary" onClick={() => setForm({ kind: 'profile' })}>{t('addProfile')}</button></div>}>
      <Loading q={r}>{d && <>
        {form?.kind === 'provider' && <ProviderForm init={form.init} onDone={done} t={t} />}
        {form?.kind === 'profile' && <ProfileForm d={d} init={form.init} onDone={done} t={t} />}
        <Card title={t('providers')}>
          <Table cols={[
            { k: 'name', h: t('name'), f: (x) => <b>{x.name}</b> },
            { k: 's', h: t('status'), f: (x) => <Pill tone={x.status === 'active' ? 'good' : 'grey'}>{x.status === 'active' ? t('active') : t('retired')}</Pill> },
            { k: 'w', h: t('walletCol'), f: (x) => (x.track_balance ? '✓ · ' + (x.balance_order ?? '') : '—') },
            { k: 'p', h: t('importSlots'), f: (x) => d.profiles.filter((p) => p.provider_id === x.provider_id && !p.active_to).map((p) => p.name).join(', ') || <span className="muted">—</span> },
            { k: 'n', h: t('note'), f: (x) => <span className="xs muted">{x.notes}</span> },
            { k: 'a', h: '', r: 1, f: (x) => <button className="btn ghost" onClick={() => setForm({ kind: 'provider', init: x })}>{t('edit')}</button> }
          ]} rows={d.providers.map((x) => ({ ...x, key: x.provider_id }))} />
        </Card>
        <Card title={t('importSlots')}>
          <Table cols={[
            { k: 'n', h: t('slotName'), f: (x) => <b>{x.name}</b> },
            { k: 'p', h: t('provider'), f: (x) => d.providers.find((p) => p.provider_id === x.provider_id)?.name },
            { k: 'd', h: t('direction'), f: (x) => x.fixed_direction ? t(x.fixed_direction === 'credit' ? 'allCredit' : 'allDebit') : t('fromColumn') },
            { k: 'y', h: t('txnType'), f: (x) => x.fixed_txn_type || <span className="muted">{t('byTypeRules')}</span> },
            { k: 'c', h: t('columnMapping'), f: (x) => <span className="xs muted">{Object.entries(x.column_map || {}).map(([k, v]) => `${t('field_' + k)}: ${v}`).join(' · ')}</span> },
            { k: 's', h: t('status'), f: (x) => <Pill tone={x.active_to ? 'grey' : 'good'}>{x.active_to ? `${t('off')} · ${day(x.active_to, lang)}` : t('active')}</Pill> },
            { k: 'a', h: '', r: 1, f: (x) => <div className="row gap8" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setForm({ kind: 'profile', init: x })}>{t('edit')}</button>
              <button className="btn ghost" onClick={() => toggleProfile(x)}>{x.active_to ? t('turnOn') : t('turnOff')}</button></div> }
          ]} rows={d.profiles.map((x) => ({ ...x, key: x.profile_id }))} />
        </Card>
      </>}</Loading>
    </Page>
  )
}
