import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, day, n } from '../lib.js'
import { Page, Card, Loading, Table, Pill, AdminOnly } from '../ui.jsx'

async function load() {
  const [rules, typeRules, unc, provs, types, methods] = await Promise.all([
    q(supabase.from('profit_rules').select('*').order('provider_id').order('txn_type_id').order('valid_from')),
    q(supabase.from('classification_rules').select('*').order('provider_id').order('priority')),
    q(supabase.from('v_unclassified').select('*').order('txn_time', { ascending: false }).limit(500)),
    q(supabase.from('providers').select('provider_id, name, status').order('name')),
    q(supabase.from('txn_types').select('txn_type_id, name, counts_for_profit').order('name')),
    q(supabase.from('payment_methods').select('method_id, name').order('name'))
  ])
  return { rules, typeRules, unc, provs, types, methods }
}

const FIELDS = [
  ['fixed_profit', 'fixedProfit', '$'], ['pct_profit', 'profitPct', '%'], ['fixed_cost', 'fixedCost', '$'],
  ['pct_cost', 'costPct', '%'], ['extra_cost', 'extraCost', '$'], ['pct_fee_profit', 'feeProfitPct', '%'], ['pct_fee_cost', 'feeCostPct', '%']
]
const isPct = (u) => u === '%'
const show = (v, u) => (!n(v) ? '—' : isPct(u) ? (n(v) * 100).toFixed(3).replace(/\.?0+$/, '') + '%' : usd(v))
const OPEN = (x) => new Date(x.valid_to).getFullYear() >= 2999
const nowLocal = () => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16) }
const statusOf = (x) => { const now = Date.now(); const f = new Date(x.valid_from).getTime(), to = new Date(x.valid_to).getTime()
  return f > now ? 'upcoming' : to <= now ? 'ended' : 'active' }

export function FeeForm({ d, t, init, mode, onDone }) {
  // mode: 'add' | 'change' | 'correct'
  const [v, setV] = useState(() => {
    const o = { provider_id: init?.provider_id ?? '', txn_type_id: init?.txn_type_id ?? '', method_id: init?.method_id ?? '', note: mode === 'change' ? '' : init?.note ?? '', from: nowLocal() }
    FIELDS.forEach(([k, , u]) => { o[k] = init ? (isPct(u) ? +(n(init[k]) * 100).toFixed(6) : n(init[k])) : 0 })
    return o
  })
  const [msg, setMsg] = useState('')
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })
  const vals = () => { const o = {}; FIELDS.forEach(([k, , u]) => { o[k] = isPct(u) ? n(v[k]) / 100 : n(v[k]) }); return o }
  const save = async () => {
    setMsg('')
    let res
    if (mode === 'change') {
      res = await supabase.rpc('admin_change_rule', { p_rule: init.rule_id, p_from: new Date(v.from).toISOString(), p_vals: vals(), p_note: v.note || null })
    } else if (mode === 'correct') {
      res = await supabase.from('profit_rules').update({ ...vals(), note: v.note || null }).eq('rule_id', init.rule_id)
      if (!res.error) res = await supabase.rpc('admin_reprice_open')
    } else {
      if (!v.provider_id || !v.txn_type_id) return setMsg(t('provider') + ' / ' + t('txnType') + ' ?')
      res = await supabase.from('profit_rules').insert({ provider_id: +v.provider_id, txn_type_id: +v.txn_type_id, method_id: v.method_id ? +v.method_id : null,
        ...vals(), valid_from: new Date(v.from).toISOString(), note: v.note || null })
      if (!res.error) res = await supabase.rpc('admin_reprice_open')
    }
    if (res.error) return setMsg(res.error.message)
    onDone()
  }
  return (
    <div className="card" style={{ background: 'var(--ground)', border: 0 }}>
      <b>{mode === 'add' ? t('addRule') : mode === 'change' ? t('changeFromDate') : t('correctRule')}</b>
      <div className="xs muted">{mode === 'change' ? t('changeHint') : mode === 'correct' ? t('correctHint') : t('addHint')}</div>
      <div className="form-grid">
        {mode === 'add' ? <>
          <label className="field"><span>{t('provider')}</span><select value={v.provider_id} onChange={set('provider_id')}><option value="">—</option>{d.provs.map((p) => <option key={p.provider_id} value={p.provider_id}>{p.name}</option>)}</select></label>
          <label className="field"><span>{t('txnType')}</span><select value={v.txn_type_id} onChange={set('txn_type_id')}><option value="">—</option>{d.types.map((x) => <option key={x.txn_type_id} value={x.txn_type_id}>{x.name}</option>)}</select></label>
          <label className="field"><span>{t('method')}</span><select value={v.method_id} onChange={set('method_id')}><option value="">{t('anyMethod')}</option>{d.methods.map((x) => <option key={x.method_id} value={x.method_id}>{x.name}</option>)}</select></label>
        </> : <div className="field" style={{ gridColumn: 'span 2' }}><span>{t('rule')}</span>
          <b style={{ color: 'var(--ink)' }}>{d.provs.find((p) => p.provider_id === init.provider_id)?.name} · {d.types.find((x) => x.txn_type_id === init.txn_type_id)?.name}{init.method_id ? ' · ' + d.methods.find((m) => m.method_id === init.method_id)?.name : ''}</b></div>}
        {FIELDS.map(([k, label, u]) => (
          <label key={k} className="field"><span>{t(label)} ({u})</span><input type="number" step="any" value={v[k]} onChange={set(k)} /></label>
        ))}
        {mode !== 'correct' && <label className="field"><span>{mode === 'change' ? t('newPriceFrom') : t('validFrom')}</span><input type="datetime-local" value={v.from} onChange={set('from')} /></label>}
        <label className="field" style={{ gridColumn: 'span 2' }}><span>{t('note')}</span><input value={v.note} onChange={set('note')} /></label>
      </div>
      <div className="xs muted num">profit = fixed profit + profit % × amount + fee-profit % × fee − fixed cost − cost % × amount − fee-cost % × fee − extra cost</div>
      {msg && <div className="alert">{msg}</div>}
      <div className="row gap8"><button className="btn primary" onClick={save}>{t('save')}</button><button className="btn" onClick={onDone}>{t('cancel')}</button></div>
    </div>
  )
}

export function TypeForm({ d, t, init, onDone }) {
  const [v, setV] = useState({ provider_id: init?.provider_id ?? '', match_field: init?.match_field ?? 'raw_description', pattern: init?.pattern ?? '',
    direction_filter: init?.direction_filter ?? 'any', txn_type_id: init?.txn_type_id ?? '', priority: init?.priority ?? '' })
  const [msg, setMsg] = useState('')
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })
  const save = async () => {
    if (!v.provider_id || !v.txn_type_id || !v.pattern) return setMsg(t('error'))
    const prio = v.priority !== '' ? +v.priority : Math.max(0, ...d.typeRules.filter((r) => r.provider_id === +v.provider_id).map((r) => r.priority)) + 1
    const row = { provider_id: +v.provider_id, match_field: v.match_field, pattern: v.pattern, direction_filter: v.direction_filter, txn_type_id: +v.txn_type_id, priority: prio }
    let res = init?.rule_id ? await supabase.from('classification_rules').update(row).eq('rule_id', init.rule_id) : await supabase.from('classification_rules').insert(row)
    if (!res.error) res = await supabase.rpc('admin_reprice_open')
    if (res.error) return setMsg(res.error.message)
    onDone()
  }
  return (
    <div className="card" style={{ background: 'var(--ground)', border: 0 }}>
      <b>{init?.rule_id ? t('editTypeRule') : t('addTypeRule')}</b>
      <div className="xs muted">{t('typeRuleHint')}</div>
      <div className="form-grid">
        <label className="field"><span>{t('provider')}</span><select value={v.provider_id} onChange={set('provider_id')}><option value="">—</option>{d.provs.map((p) => <option key={p.provider_id} value={p.provider_id}>{p.name}</option>)}</select></label>
        <label className="field"><span>{t('matchOn')}</span><select value={v.match_field} onChange={set('match_field')}>
          <option value="raw_description">{t('description')}</option><option value="raw_category">{t('categoryCol')}</option><option value="raw_type">{t('typeCol')}</option></select></label>
        <label className="field"><span>{t('contains')}</span><input value={v.pattern} onChange={set('pattern')} placeholder="%card funding%" /></label>
        <label className="field"><span>{t('direction')}</span><select value={v.direction_filter} onChange={set('direction_filter')}><option value="any">{t('any')}</option><option value="credit">credit</option><option value="debit">debit</option></select></label>
        <label className="field"><span>{t('txnType')}</span><select value={v.txn_type_id} onChange={set('txn_type_id')}><option value="">—</option>{d.types.map((x) => <option key={x.txn_type_id} value={x.txn_type_id}>{x.name}</option>)}</select></label>
        <label className="field"><span>{t('priority')}</span><input type="number" value={v.priority} onChange={set('priority')} placeholder={t('last')} /></label>
      </div>
      {msg && <div className="alert">{msg}</div>}
      <div className="row gap8"><button className="btn primary" onClick={save}>{t('save')}</button><button className="btn" onClick={onDone}>{t('cancel')}</button></div>
    </div>
  )
}

export default function Rules() {
  const { t, lang } = useApp()
  const r = useQuery(load)
  const d = r.data
  const [tab, setTab] = useState('fees')
  const [f, setF] = useState({ provider: '', status: 'active', type: '', text: '' })
  const [form, setForm] = useState(null) // {kind:'fee'|'type', mode, init}
  const pName = (id) => d?.provs.find((p) => p.provider_id === id)?.name
  const tName = (id) => d?.types.find((x) => x.txn_type_id === id)?.name
  const mName = (id) => d?.methods.find((x) => x.method_id === id)?.name
  const done = () => { setForm(null); r.reload() }
  const endRule = async (table, id) => {
    await supabase.from(table).update({ valid_to: new Date().toISOString() }).eq('rule_id', id)
    await supabase.rpc('admin_reprice_open'); r.reload()
  }
  const match = (x) => (!f.provider || x.provider_id === +f.provider) && (!f.type || x.txn_type_id === +f.type) &&
    (f.status === 'all' || statusOf(x) === f.status)
  const text = (s) => !f.text || String(s || '').toLowerCase().includes(f.text.toLowerCase())

  const filters = d && (
    <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
      <label className="field"><span>{t('provider')}</span><select value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}>
        <option value="">{t('allProviders')}</option>{d.provs.map((p) => <option key={p.provider_id} value={p.provider_id}>{p.name}{p.status === 'retired' ? ' (retired)' : ''}</option>)}</select></label>
      {tab !== 'unpriced' && <label className="field"><span>{t('status')}</span><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
        <option value="active">{t('activeNow')}</option><option value="upcoming">{t('upcoming')}</option><option value="ended">{t('ended')}</option><option value="all">{t('all')}</option></select></label>}
      {tab === 'fees' && <label className="field"><span>{t('txnType')}</span><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
        <option value="">{t('all')}</option>{d.types.filter((x) => !f.provider || d.rules.some((rr) => rr.provider_id === +f.provider && rr.txn_type_id === x.txn_type_id)).map((x) => <option key={x.txn_type_id} value={x.txn_type_id}>{x.name}</option>)}</select></label>}
      <label className="field"><span>{t('search')}</span><input value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder={t('searchHint')} /></label>
    </div>
  )

  const fees = d ? d.rules.filter(match).filter((x) => text(pName(x.provider_id) + ' ' + tName(x.txn_type_id) + ' ' + mName(x.method_id) + ' ' + x.note)) : []
  const types = d ? d.typeRules.filter((x) => (!f.provider || x.provider_id === +f.provider) && (f.status === 'all' || statusOf(x) === f.status)).filter((x) => text(x.pattern + ' ' + tName(x.txn_type_id))) : []
  const unc = d ? d.unc.filter((x) => !f.provider || x.provider_id === +f.provider).filter((x) => text(x.raw_description + ' ' + x.raw_type + ' ' + x.raw_category)) : []

  return (
    <Page title={t('feeRules')} actions={<div className="row gap8 wrap" role="tablist">
      {[['fees', t('feeRulesTab')], ['types', t('typeRulesTab')], ['unpriced', `${t('needsAttention')}${d ? ' · ' + d.unc.length : ''}`]].map(([k, l]) =>
        <button key={k} role="tab" aria-selected={tab === k} className={'btn ' + (tab === k ? 'on' : '')} onClick={() => { setTab(k); setForm(null) }}>{l}</button>)}
    </div>}>
      <Loading q={r}>{d && <>
        <Card>{filters}</Card>

        {tab === 'fees' && <Card title={`${t('feeRulesTab')} · ${fees.length}`} right={<AdminOnly><button className="btn primary" onClick={() => setForm({ kind: 'fee', mode: 'add', init: f.provider ? { provider_id: +f.provider } : null })}>+ {t('addRule')}</button></AdminOnly>}>
          {form?.kind === 'fee' && <FeeForm d={d} t={t} mode={form.mode} init={form.init} onDone={done} />}
          <Table cols={[
            { k: 'p', h: t('provider'), f: (x) => pName(x.provider_id) },
            { k: 'ty', h: t('txnType'), f: (x) => tName(x.txn_type_id) },
            { k: 'm', h: t('method'), f: (x) => mName(x.method_id) || <span className="muted">{t('anyMethod')}</span> },
            ...FIELDS.map(([k, label, u]) => ({ k, h: t(label), r: 1, num: 1, f: (x) => show(x[k], u) })),
            { k: 'vf', h: t('validFrom'), num: 1, f: (x) => (new Date(x.valid_from).getFullYear() <= 2024 ? <span className="muted">{t('base')}</span> : day(x.valid_from, lang)) },
            { k: 'vt', h: t('validTo'), f: (x) => <Pill tone={statusOf(x) === 'active' ? 'good' : statusOf(x) === 'upcoming' ? 'violet' : 'grey'}>{OPEN(x) ? t('open') : day(x.valid_to, lang)}</Pill> },
            { k: 'note', h: t('note'), f: (x) => <span className="xs muted">{x.note}</span> },
            { k: 'act', h: '', f: (x) => <AdminOnly><div className="row gap8">
              {statusOf(x) !== 'ended' && <button className="btn" onClick={() => setForm({ kind: 'fee', mode: 'change', init: x })}>{t('changeFromDate')}</button>}
              <button className="btn ghost" onClick={() => setForm({ kind: 'fee', mode: 'correct', init: x })}>{t('correct')}</button>
              {statusOf(x) !== 'ended' && <button className="btn ghost" onClick={() => endRule('profit_rules', x.rule_id)}>{t('endRule')}</button>}
            </div></AdminOnly> }
          ]} rows={fees.map((x) => ({ ...x, key: x.rule_id }))} empty={t('nothingHere')} />
        </Card>}

        {tab === 'types' && <Card title={`${t('typeRulesTab')} · ${types.length}`} right={<AdminOnly><button className="btn primary" onClick={() => setForm({ kind: 'type', init: f.provider ? { provider_id: +f.provider } : null })}>+ {t('addTypeRule')}</button></AdminOnly>}>
          <div className="xs muted">{t('typeRuleHint')}</div>
          {form?.kind === 'type' && <TypeForm d={d} t={t} init={form.init} onDone={done} />}
          <Table cols={[
            { k: 'p', h: t('provider'), f: (x) => pName(x.provider_id) },
            { k: 'pr', h: '#', num: 1, f: (x) => x.priority },
            { k: 'mf', h: t('matchOn'), f: (x) => ({ raw_description: t('description'), raw_category: t('categoryCol'), raw_type: t('typeCol') })[x.match_field] },
            { k: 'pat', h: t('contains'), f: (x) => <span className="num xs">{x.pattern}</span> },
            { k: 'dir', h: t('direction'), f: (x) => x.direction_filter },
            { k: 'ty', h: t('txnType'), f: (x) => <span>{tName(x.txn_type_id)}{d.types.find((y) => y.txn_type_id === x.txn_type_id)?.counts_for_profit === false && <span className="muted"> · $0</span>}</span> },
            { k: 'st', h: t('status'), f: (x) => <Pill tone={statusOf(x) === 'active' ? 'good' : 'grey'}>{t(statusOf(x) === 'active' ? 'activeNow' : statusOf(x))}</Pill> },
            { k: 'act', h: '', f: (x) => <AdminOnly><div className="row gap8">
              <button className="btn" onClick={() => setForm({ kind: 'type', init: x })}>{t('edit')}</button>
              {statusOf(x) === 'active' && <button className="btn ghost" onClick={() => endRule('classification_rules', x.rule_id)}>{t('endRule')}</button>}
            </div></AdminOnly> }
          ]} rows={types.map((x) => ({ ...x, key: x.rule_id }))} empty={t('nothingHere')} />
        </Card>}

        {tab === 'unpriced' && <Card title={`${t('needsAttention')} · ${unc.length}`}>
          <div className="xs muted">{t('unpricedHint')}</div>
          {form?.kind === 'type' && <TypeForm d={d} t={t} init={form.init} onDone={done} />}
          {form?.kind === 'fee' && <FeeForm d={d} t={t} mode="add" init={form.init} onDone={done} />}
          <Table cols={[
            { k: 'p', h: t('provider'), f: (x) => pName(x.provider_id) },
            { k: 'd', h: t('date'), num: 1, f: (x) => day(x.txn_time, lang) },
            { k: 'desc', h: t('description'), f: (x) => <span className="xs">{x.raw_description || x.raw_category || x.raw_type}</span> },
            { k: 'a', h: t('amount'), r: 1, num: 1, f: (x) => usd(x.amount_usd) },
            { k: 'ty', h: t('txnType'), f: (x) => tName(x.txn_type_id) || <Pill tone="warn">{t('unknownType')}</Pill> },
            { k: 'act', h: '', f: (x) => <AdminOnly>{x.txn_type_id
              ? <button className="btn" onClick={() => setForm({ kind: 'fee', init: { provider_id: x.provider_id, txn_type_id: x.txn_type_id, method_id: x.method_id } })}>{t('addRule')}</button>
              : <button className="btn" onClick={() => setForm({ kind: 'type', init: { provider_id: x.provider_id, pattern: '%' + String(x.raw_description || '').split(' ').slice(0, 3).join(' ') + '%' } })}>{t('addTypeRule')}</button>}</AdminOnly> }
          ]} rows={unc.map((x) => ({ ...x, key: x.txn_id }))} empty={t('nothingHere')} />
        </Card>}
      </>}</Loading>
    </Page>
  )
}
