import { useState } from 'react'
let XLSX = null // loaded on first use, keeps other pages light
import { supabase, useApp, useQuery, q, usd, int, day, n } from '../lib.js'
import { Page, Card, Loading, Table, Pill, AdminOnly } from '../ui.jsx'
import { FeeForm, TypeForm } from './Rules.jsx'

const FIELDS = ['ref', 'time', 'amount', 'fee', 'direction', 'raw_type', 'raw_category', 'desc', 'status', 'email', 'method']
const REQUIRED = ['ref', 'time', 'amount']
const OUTCOME = {
  new: { tone: 'good', bg: '#FFFFFF' },
  other: { tone: 'grey', bg: '#F6F5F9' },
  test: { tone: 'grey', bg: '#F6F5F9' },
  duplicate: { tone: 'grey', bg: '#F6F5F9' },
  needs_rule: { tone: 'warn', bg: '#FFF3E6' },
  invalid: { tone: 'warn', bg: '#FFF3E6' }
}

async function load() {
  const [profiles, providers, batches] = await Promise.all([
    q(supabase.from('import_profiles').select('*').is('active_to', null).order('profile_id')),
    q(supabase.from('providers').select('provider_id, name, status')),
    q(supabase.from('import_batches').select('*').order('imported_at', { ascending: false }).limit(12))
  ])
  const [types, methods, typeRules] = await Promise.all([
    q(supabase.from('txn_types').select('txn_type_id, name, counts_for_profit').order('name')),
    q(supabase.from('payment_methods').select('method_id, name').order('name')),
    q(supabase.from('classification_rules').select('*'))
  ])
  const last = {}
  await Promise.all(profiles.map(async (p) => {
    const filter = p.fixed_txn_type
      ? supabase.from('transactions').select('txn_time, txn_types!inner(name)').eq('provider_id', p.provider_id).eq('txn_types.name', p.fixed_txn_type)
      : supabase.from('transactions').select('txn_time').eq('provider_id', p.provider_id)
    const rows = await q(filter.order('txn_time', { ascending: false }).limit(1))
    last[p.profile_id] = rows[0]?.txn_time
  }))
  return { profiles, providers, batches, last, types, methods, typeRules, provs: providers }
}

// ---------- file helpers ----------
const pad = (x) => String(x).padStart(2, '0')
function toTimeString(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') {
    // Excel serial date -> exact seconds (avoids floating-point drift)
    const d = new Date(Math.round((v - 25569) * 86400) * 1000)
    if (isNaN(d)) return null
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  }
  const s = String(v).trim()
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])} ${pad(iso[4])}:${iso[5]}:${iso[6] || '00'}`
  const dOnly = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (dOnly) return `${dOnly[1]}-${pad(dOnly[2])}-${pad(dOnly[3])} 00:00:00`
  const p = new Date(s)
  if (isNaN(p)) return null
  return `${p.getFullYear()}-${pad(p.getMonth() + 1)}-${pad(p.getDate())} ${pad(p.getHours())}:${pad(p.getMinutes())}:${pad(p.getSeconds())}`
}
function toNumber(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v
  const s = String(v).replace(/[^0-9.\-]/g, '')
  if (s === '' || s === '-' || s === '.') return null
  const x = Number(s)
  return isNaN(x) ? null : x
}
const norm = (h) => String(h ?? '').trim().toLowerCase()

async function readFile(file) {
  XLSX = XLSX || (await import('xlsx'))
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: true })
  const sheets = wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' }) }))
  return sheets
}

// Find the header row (first row containing the profile's reference column) and map fields to column indexes
function locate(sheets, map) {
  const want = norm(map.ref)
  for (const s of sheets) {
    for (let i = 0; i < Math.min(15, s.rows.length); i++) {
      const hdr = s.rows[i].map(norm)
      if (hdr.includes(want)) {
        const idx = {}
        FIELDS.forEach((f) => { if (map[f]) { const j = hdr.indexOf(norm(map[f])); if (j >= 0) idx[f] = j } })
        return { sheet: s, headerRow: i, headers: s.rows[i].map((h) => String(h)), idx }
      }
    }
  }
  const s = sheets[0]
  return { sheet: s, headerRow: 0, headers: (s.rows[0] || []).map((h) => String(h)), idx: {} }
}

function buildRows(found, profile) {
  const out = []
  const { sheet, headerRow, idx } = found
  for (let i = headerRow + 1; i < sheet.rows.length; i++) {
    const r = sheet.rows[i]
    const get = (f) => (idx[f] === undefined ? '' : r[idx[f]])
    const ref = String(get('ref') ?? '').trim()
    if (!ref) continue
    const desc = String(get('desc') ?? '')
    let email = String(get('email') ?? '').trim()
    if (!email && profile.email_from_description) email = (desc.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [''])[0]
    out.push({
      ref, time: toTimeString(get('time')), amount: toNumber(get('amount')), fee: toNumber(get('fee')),
      direction: String(get('direction') ?? '').trim(), raw_type: String(get('raw_type') ?? '').trim(),
      raw_category: String(get('raw_category') ?? '').trim(), desc, status: String(get('status') ?? '').trim(), email,
      method: String(get('method') ?? '').trim()
    })
  }
  return out
}

// Preview all rows in chunks; keep each result linked to its source row
export async function previewRows(profileId, rows) {
  let out = []
  for (let i = 0; i < rows.length; i += 800) {
    const part = rows.slice(i, i + 800)
    const res = await q(supabase.rpc('import_preview', { p_profile: profileId, p_rows: part }))
    out = out.concat(res.map((x) => ({ ...x, row: part[x.idx] })))
  }
  return out
}

async function chunked(rows, size, fn) {
  let res = []
  for (let i = 0; i < rows.length; i += size) res = res.concat(await fn(rows.slice(i, i + size)))
  return res
}

// ---------- one provider slot ----------
function Slot({ profile, provider, last, state, setState, t, lang }) {
  const s = state || {}
  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setState({ file, busy: true })
    try {
      const sheets = await readFile(file)
      const found = locate(sheets, profile.column_map)
      const missing = REQUIRED.filter((f) => found.idx[f] === undefined)
      setState({ file, sheets, found, missing, busy: false })
      if (!missing.length) await preview(file, found)
    } catch (err) { setState({ file, error: err.message, busy: false }) }
  }
  const preview = async (file, found) => {
    const rows = buildRows(found, profile)
    setState({ file, found, rows, busy: true, missing: [] })
    const res = await previewRows(profile.profile_id, rows)
    setState({ file, found, rows, preview: res, busy: false, missing: [] })
  }
  const remap = (f, j) => {
    const found = { ...s.found, idx: { ...s.found.idx, [f]: Number(j) } }
    const missing = REQUIRED.filter((x) => found.idx[x] === undefined)
    setState({ ...s, found, missing })
  }
  const saveMapping = async () => {
    const map = { ...profile.column_map }
    Object.entries(s.found.idx).forEach(([f, j]) => { map[f] = s.found.headers[j] })
    await supabase.from('import_profiles').update({ column_map: map }).eq('profile_id', profile.profile_id)
    profile.column_map = map
    await preview(s.file, s.found)
  }
  const counts = {}
  ;(s.preview || []).forEach((r) => { counts[r.outcome] = (counts[r.outcome] || 0) + 1 })

  return (
    <div className="card" style={{ padding: 16, gap: 8, border: s.preview ? '2px solid var(--accent)' : undefined }}>
      <div className="row between"><b>{profile.name}</b><span className="xs muted">{provider?.name}</span></div>
      <label className="btn" style={{ textAlign: 'center', borderStyle: 'dashed', background: 'var(--ground)' }}>
        {s.file ? <span className="num xs">{s.file.name}</span> : t('chooseFile')}
        <input key={s.file ? s.file.name : 'empty'} type="file" accept=".csv,.xlsx,.xls" onChange={onFile} style={{ position: 'absolute', left: -9999 }} />
      </label>
      {s.file && <button className="btn ghost" onClick={() => setState(undefined)}>✕ {t('removeFile')}</button>}
      {!s.file && <div className="xs muted">{t('lastImport')}: {day(last, lang)}</div>}
      {s.busy && <div className="xs muted">{t('loading')}</div>}
      {s.error && <div className="alert xs">{s.error}</div>}
      {s.missing?.length > 0 && (
        <div className="alert xs" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>{t('mapColumns')}</div>
          {s.missing.map((f) => (
            <label key={f} className="field"><span>{t('field_' + f)}</span>
              <select onChange={(e) => remap(f, e.target.value)} defaultValue="">
                <option value="" disabled>—</option>
                {s.found.headers.map((h, j) => <option key={j} value={j}>{h || `(${j + 1})`}</option>)}
              </select></label>
          ))}
          <button className="btn primary" disabled={s.missing.length > 0 && REQUIRED.some((f) => s.found.idx[f] === undefined)} onClick={saveMapping}>{t('saveMapping')}</button>
        </div>
      )}
      {s.preview && (
        <div className="row wrap gap8">
          <Pill tone="good">{int(counts.new || 0)} {t('outcome_new')}</Pill>
          {counts.duplicate > 0 && <Pill>{int(counts.duplicate)} {t('outcome_duplicate')}</Pill>}
          {(counts.other || 0) + (counts.test || 0) > 0 && <Pill>{int((counts.other || 0) + (counts.test || 0))} {t('outcome_other')}</Pill>}
          {(counts.needs_rule || 0) + (counts.invalid || 0) > 0 && <Pill tone="warn">{int((counts.needs_rule || 0) + (counts.invalid || 0))} {t('outcome_needs_rule')}</Pill>}
        </div>
      )}
    </div>
  )
}

export default function ImportPage() {
  const { t, lang, role } = useApp()
  const r = useQuery(load)
  const [slots, setSlots] = useState({})
  const [show, setShow] = useState('attention')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const d = r.data
  const setSlot = (id) => (v) => setSlots((all) => ({ ...all, [id]: v }))

  const filled = d ? d.profiles.filter((p) => slots[p.profile_id]?.preview) : []
  const allPreview = filled.flatMap((p) => slots[p.profile_id].preview.map((x) => ({ ...x, file: p.name, profile: p })))
  const [modal, setModal] = useState(null)
  const [actMsg, setActMsg] = useState('')

  // Re-run the preview of every loaded file (after a rule was added)
  const refresh = async () => {
    await r.reload()
    for (const p of filled) {
      const s0 = slots[p.profile_id]
      const res = await previewRows(p.profile_id, s0.rows)
      setSlots((all) => ({ ...all, [p.profile_id]: { ...all[p.profile_id], preview: res } }))
    }
  }
  const ensureMethod = async (name) => {
    if (!name) return null
    const found = d.methods.find((m) => m.name.toLowerCase() === name.toLowerCase())
    if (found) return found.method_id
    const res = await supabase.from('payment_methods').insert({ name, direction: 'both' }).select('method_id').single()
    if (res.error) throw new Error(res.error.message)
    return res.data.method_id
  }
  const typeId = (name) => d.types.find((y) => y.name === name)?.txn_type_id
  const patternFor = (x) => { const words = String(x.row?.desc || '').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '').trim().split(/\s+/).slice(0, 4).join(' ')
    return words ? '%' + words + '%' : null }
  // "Mark as Other / $0": known type without a fee rule -> zero fee rule; unknown row -> type rule to Other
  const markOther = async (x) => {
    setActMsg('')
    try {
      const prov = x.profile.provider_id
      if (x.txn_type) {
        const method_id = x.row?.method ? await ensureMethod(x.row.method) : null
        const res = await supabase.from('profit_rules').insert({ provider_id: prov, txn_type_id: typeId(x.txn_type), method_id, note: 'Marked as $0 from import' })
        if (res.error) throw new Error(res.error.message)
      } else {
        const byCat = !patternFor(x) && x.row?.raw_category
        const pattern = byCat ? x.row.raw_category : patternFor(x)
        if (!pattern) throw new Error(t('error'))
        const prio = Math.max(0, ...d.typeRules.filter((tr) => tr.provider_id === prov).map((tr) => tr.priority)) + 1
        const res = await supabase.from('classification_rules').insert({ provider_id: prov, match_field: byCat ? 'raw_category' : 'raw_description',
          pattern, direction_filter: 'any', txn_type_id: typeId('Other'), priority: prio })
        if (res.error) throw new Error(res.error.message)
      }
      await refresh()
    } catch (e) { setActMsg(e.message) }
  }
  const openRule = async (x) => {
    setActMsg('')
    try {
      if (x.txn_type) {
        const method_id = x.row?.method ? await ensureMethod(x.row.method) : null
        await r.reload()
        setModal({ kind: 'fee', init: { provider_id: x.profile.provider_id, txn_type_id: typeId(x.txn_type), method_id } })
      } else {
        setModal({ kind: 'type', init: { provider_id: x.profile.provider_id, pattern: patternFor(x) || '', match_field: patternFor(x) ? 'raw_description' : 'raw_category' } })
      }
    } catch (e) { setActMsg(e.message) }
  }
  const toSave = filled.reduce((s, p) => s + slots[p.profile_id].preview.filter((x) => x.outcome !== 'duplicate' && x.outcome !== 'invalid').length, 0)
  const newProfit = allPreview.filter((x) => x.outcome === 'new').reduce((s, x) => s + n(x.profit), 0)
  const shown = allPreview.filter((x) => show === 'all' ? true : show === 'attention' ? ['needs_rule', 'invalid'].includes(x.outcome) : x.outcome === show)

  const saveAll = async () => {
    setBusy(true)
    const out = []
    for (const p of filled) {
      const s = slots[p.profile_id]
      try {
        const res = await chunked(s.rows, 2000, (part) => q(supabase.rpc('import_commit', { p_profile: p.profile_id, p_file: s.file.name, p_rows: part })))
        const sum = res.reduce((a, x) => ({ inserted: a.inserted + x.inserted, duplicates: a.duplicates + x.duplicates, needs_rule: a.needs_rule + x.needs_rule, new_customers: a.new_customers + x.new_customers }),
          { inserted: 0, duplicates: 0, needs_rule: 0, new_customers: 0 })
        out.push({ name: p.name, ...sum })
      } catch (e) { out.push({ name: p.name, error: e.message }) }
    }
    setResult(out); setSlots({}); setBusy(false); r.reload()
  }

  return (
    <Page title={t('importFiles')} sub={t('importSub')}>
      <Loading q={r}>{d && <>
        {role !== 'admin' && <div className="alert">{t('onlyAdmin')}</div>}
        {result && <div className="ok">{result.map((x) => <div key={x.name}>{x.name}: {x.error ? x.error
          : `${int(x.inserted)} ${t('outcome_new')} · ${int(x.duplicates)} ${t('outcome_duplicate')} · ${int(x.needs_rule)} ${t('outcome_needs_rule')} · ${int(x.new_customers)} ${t('newCustomersShort')}`}</div>)}</div>}
        {role === 'admin' && <div className="grid-kpi" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 12 }}>
          {d.profiles.map((p) => <Slot key={p.profile_id} profile={p} provider={d.providers.find((x) => x.provider_id === p.provider_id)}
            last={d.last[p.profile_id]} state={slots[p.profile_id]} setState={setSlot(p.profile_id)} t={t} lang={lang} />)}
        </div>}

        {actMsg && <div className="alert">{actMsg}</div>}
        {modal && (
          <div className="modal-back" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setModal(null) }}>
            <div className="modal">
              {modal.kind === 'fee'
                ? <FeeForm d={d} t={t} mode="add" init={modal.init} onDone={async () => { setModal(null); await refresh() }} />
                : <TypeForm d={d} t={t} init={modal.init} onDone={async () => { setModal(null); await refresh() }} />}
            </div>
          </div>
        )}
        {allPreview.length > 0 && (
          <Card title={`${t('combinedPreview')} · ${filled.length}`} right={
            <div className="row gap8 wrap" role="group">
              {['attention', 'new', 'other', 'duplicate', 'all'].map((k) => <button key={k} className={'btn ' + (show === k ? 'on' : '')} onClick={() => setShow(k)}>{t('show_' + k)}</button>)}
            </div>}>
            <div className="legend"><span><i className="dot" style={{ background: '#fff', border: '1px solid var(--line)' }} />{t('legendPriced')}</span>
              <span><i className="dot" style={{ background: '#F6F5F9' }} />{t('legendOther')}</span>
              <span><i className="dot" style={{ background: '#FFF3E6' }} />{t('legendNeedsRule')}</span></div>
            <Table cols={[
              { k: 'file', h: t('provider') },
              { k: 'd', h: t('date'), num: 1, f: (x) => (x.txn_time ? new Date(x.txn_time).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—') },
              { k: 'ref', h: 'Ref', f: (x) => <span className="num xs">{String(x.ref || '').slice(0, 18)}</span> },
              { k: 'descr', h: t('description'), f: (x) => <span className="xs">{String(x.descr || '').slice(0, 60)}</span> },
              { k: 'a', h: t('amount'), r: 1, num: 1, f: (x) => usd(x.amount) },
              { k: 'ty', h: t('txnType'), f: (x) => x.txn_type || '—' },
              { k: 'p', h: t('profit'), r: 1, num: 1, f: (x) => usd(x.profit) },
              { k: 'o', h: t('status'), f: (x) => <Pill tone={OUTCOME[x.outcome].tone}>{t('outcome_' + x.outcome)}</Pill> },
              { k: 'act', h: '', f: (x) => x.outcome === 'needs_rule' ? <AdminOnly><div className="row gap8">
                <button className="btn" onClick={() => openRule(x)}>{x.txn_type ? t('addRule') : t('addTypeRule')}</button>
                <button className="btn ghost" onClick={() => markOther(x)}>{t('markOther')}</button></div></AdminOnly> : null }
            ]} rows={shown.slice(0, 300).map((x, i) => ({ ...x, key: x.file + i }))} rowStyle={(x) => ({ background: OUTCOME[x.outcome].bg })} empty={t('nothingHere')} />
            {shown.length > 300 && <div className="xs muted">{t('showingFirst')} 300 / {int(shown.length)}</div>}
            <div className="row between wrap gap16">
              <div className="small">{t('profitInFiles')}: <b className="num">{usd(newProfit)}</b></div>
              <div className="row gap8">
                <button className="btn" onClick={() => setSlots({})}>{t('clear')}</button>
                <button className="btn primary" disabled={busy || !toSave} onClick={saveAll}>{busy ? t('loading') : `${t('saveRows')} (${int(toSave)})`}</button>
              </div>
            </div>
          </Card>
        )}

        <Card title={t('recentImports')}>
          <Table cols={[
            { k: 'f', h: t('file'), f: (x) => x.file_name },
            { k: 'p', h: t('provider'), f: (x) => d.providers.find((p) => p.provider_id === x.provider_id)?.name },
            { k: 'd', h: t('date'), num: 1, f: (x) => day(x.imported_at, lang) },
            { k: 'n', h: t('outcome_new'), r: 1, num: 1, f: (x) => int(x.rows_inserted) },
            { k: 's', h: t('outcome_duplicate'), r: 1, num: 1, f: (x) => int(x.rows_skipped_duplicate) }
          ]} rows={d.batches.map((b) => ({ ...b, key: b.batch_id }))} />
        </Card>
      </>}</Loading>
    </Page>
  )
}
