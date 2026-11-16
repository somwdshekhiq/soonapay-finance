import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, int, n, day } from '../lib.js'
import { Page, Card, Kpi, Loading, Table, Pill, AdminOnly, Tabs } from '../ui.jsx'
import { readFile } from './Import.jsx'

const NOTICE_DAYS = 60
const riyadhToday = () => new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10)
const addDays = (iso, k) => new Date(new Date(iso + 'T00:00:00Z').getTime() + k * 864e5).toISOString().slice(0, 10)
const dmy = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '')
const money = (v) => (n(v) < 0 ? '-' : '') + '$' + Math.abs(n(v)).toFixed(2)
const SM = { minHeight: 32, padding: '4px 10px', whiteSpace: 'nowrap' }
const who = (x) => x.full_name || x.username || x.email || x.platform_user_id

// Text sent to customers with a negative wallet. {name} {balance} {deadline} are filled per customer.
const MSG = {
  ar: 'عزيزنا {name}، رصيد محفظتك في SoonaPay حالياً بالسالب ({balance}). نرجو إيداع مبلغ في محفظتك يغطي هذا الرصيد قبل {deadline}، وإلا ستتعرض المحفظة للإغلاق. شكراً لتعاملك مع SoonaPay.',
  en: 'Dear {name}, your SoonaPay wallet balance is negative ({balance}). Please top up your wallet to cover this amount before {deadline}, otherwise your wallet will be closed. Thank you for using SoonaPay.'
}
const fill = (lang, x) => MSG[lang].replace('{name}', who(x)).replace('{balance}', money(x.balance))
  .replace('{deadline}', dmy(x.deadline || addDays(riyadhToday(), NOTICE_DAYS)))

// Read the platform export (nonzero_wallets_YYYYMMDD_HHMMSS.xlsx) into rows for admin_import_wallets
function parseWallets(sheets) {
  for (const s of sheets) {
    const hi = s.rows.findIndex((r) => r.some((c) => String(c).trim().toLowerCase() === 'balance') && r.some((c) => String(c).trim().toLowerCase() === 'email'))
    if (hi < 0) continue
    const h = s.rows[hi].map((c) => String(c).trim().toLowerCase())
    const col = (name) => h.indexOf(name)
    const c = { id: col('user id'), user: col('username'), first: col('first name'), last: col('last name'), email: col('email'), mobile: col('mobile'),
      bal: col('balance'), cur: col('currency'), upd: col('last wallet update') }
    if (c.id < 0 || c.bal < 0) continue
    const txt = (r, i) => (i < 0 || r[i] === undefined || r[i] === null ? '' : String(r[i]).trim())
    const when = (v) => (typeof v === 'number' ? new Date((v - 25569) * 864e5).toISOString().slice(0, 19).replace('T', ' ') : String(v || ''))
    return s.rows.slice(hi + 1).filter((r) => txt(r, c.id) && txt(r, c.bal) !== '').map((r) => ({
      user_id: txt(r, c.id), username: txt(r, c.user), name: [txt(r, c.first), txt(r, c.last)].filter(Boolean).join(' '), email: txt(r, c.email),
      mobile: txt(r, c.mobile), balance: Number(r[c.bal]), currency: txt(r, c.cur), last_update: c.upd < 0 ? '' : when(r[c.upd])
    })).filter((x) => isFinite(x.balance))
  }
  return null
}
const dateFromName = (name) => { const m = /(20\d{2})(\d{2})(\d{2})/.exec(name || ''); return m ? `${m[1]}-${m[2]}-${m[3]}` : riyadhToday() }

function Upload({ t, onDone }) {
  const [file, setFile] = useState(null), [rows, setRows] = useState(null), [date, setDate] = useState(riyadhToday())
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false)
  const pick = async (e) => {
    const f = e.target.files[0]; setMsg(null); setRows(null); setFile(f || null)
    if (!f) return
    try {
      const r = parseWallets(await readFile(f))
      if (!r || !r.length) throw new Error(t('wlBadFile'))
      setRows(r); setDate(dateFromName(f.name))
    } catch (er) { setMsg({ bad: er.message }) }
  }
  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const v = await q(supabase.rpc('admin_import_wallets', { p_date: date, p_file: file.name, p_rows: rows }))
      setMsg({ ok: t('wlSaved').replace('{w}', int(v.wallets)).replace('{p}', usd(v.positive_total)).replace('{n}', int(v.negative_count)).replace('{a}', usd(v.negative_total)) })
      setRows(null); setFile(null); onDone()
    } catch (er) { setMsg({ bad: er.message }) } finally { setBusy(false) }
  }
  const pos = rows ? rows.filter((x) => x.balance > 0) : [], neg = rows ? rows.filter((x) => x.balance < 0) : []
  return (
    <Card title={t('wlUpload')}>
      <div className="xs muted">{t('wlUploadNote')}</div>
      <div className="form-grid">
        <label className="field" style={{ gridColumn: 'span 2' }}><span>{t('wlFile')}</span><input type="file" accept=".xlsx,.xls,.csv" onChange={pick} /></label>
        {rows && <label className="field"><span>{t('wlDate')}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>}
      </div>
      {rows && <div className="small">{int(rows.length)} {t('wlWallets')} · {t('wlPositive')} <b className="num">{usd(pos.reduce((s, x) => s + x.balance, 0))}</b> ({int(pos.length)}) ·{' '}
        {t('wlNegative')} <b className="num" style={{ color: 'var(--warn)' }}>{usd(neg.reduce((s, x) => s + x.balance, 0))}</b> ({int(neg.length)})</div>}
      {rows && <div><button className="btn primary" disabled={busy || !date} onClick={save}>{busy ? t('loading') : t('wlImport')}</button></div>}
      {msg && <div className={msg.bad ? 'alert' : 'ok'}>{msg.bad || msg.ok}</div>}
    </Card>
  )
}

export default function Wallets() {
  const { t, lang, role } = useApp()
  const r = useQuery(() => q(supabase.rpc('wallet_overview')))
  const d = r.data
  const [mlang, setMlang] = useState(lang === 'ar' ? 'ar' : 'en')
  const [copied, setCopied] = useState(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null)
  const [filter, setFilter] = useState('all')
  const [limit, setLimit] = useState(20)

  const copy = async (key, text) => { try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500) } catch { setMsg({ bad: t('wlCopyFail') }) } }
  const notify = async (users) => {
    setBusy(true); setMsg(null)
    try { const k = await q(supabase.rpc('admin_wallet_notice', { p_users: users, p_days: NOTICE_DAYS })); setMsg({ ok: t('wlNotified').replace('{n}', int(k)) }); r.reload() }
    catch (er) { setMsg({ bad: er.message }) } finally { setBusy(false) }
  }
  const undo = async (id) => { try { await q(supabase.rpc('admin_wallet_notice_undo', { p_notice: id })); r.reload() } catch (er) { setMsg({ bad: er.message }) } }
  const stateOf = (x) => (!x.notified_on ? 'new' : n(x.days_left) <= 0 ? 'due' : 'waiting')

  const exportXlsx = async (list) => {
    const XLSX = await import('xlsx')
    const rows = list.map((x) => ({ 'User ID': x.platform_user_id, Username: x.username || '', Name: x.full_name || '', Email: x.email || '', Mobile: x.mobile || '',
      Balance: +n(x.balance).toFixed(2), 'Negative since': x.negative_since || '', 'Notified on': x.notified_on || '', Deadline: x.deadline || addDays(riyadhToday(), NOTICE_DAYS),
      'Message (Arabic)': fill('ar', x), 'Message (English)': fill('en', x) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Negative wallets')
    XLSX.writeFile(wb, `negative-wallets-${riyadhToday()}.xlsx`)
  }

  return (
    <Page title={t('wallets')} sub={t('walletsSub')}>
      {role === 'admin' && <Upload t={t} onDone={r.reload} />}
      <Loading q={r}>{d && (!d.latest ? <div className="muted pad">{t('wlNone')}</div> : (() => {
        const L = d.latest, neg = d.negatives || []
        const counts = { all: neg.length, new: neg.filter((x) => stateOf(x) === 'new').length, waiting: neg.filter((x) => stateOf(x) === 'waiting').length, due: neg.filter((x) => stateOf(x) === 'due').length }
        const shown = filter === 'all' ? neg : neg.filter((x) => stateOf(x) === filter)
        const notNotified = neg.filter((x) => !x.notified_on)
        return <>
          {msg && <div className={msg.bad ? 'alert' : 'ok'}>{msg.bad || msg.ok}</div>}
          <div className="grid-kpi">
            <Kpi tone="soft" label={t('wlOwed')} value={usd(L.positive_total)} note={`${int(L.positive_count)} ${t('wlWallets')} · ${t('asOf')} ${day(L.snapshot_date, lang)}`} />
            <Kpi tone={L.negative_count > 0 ? 'warn' : 'good'} label={t('wlNegWallets')} value={usd(L.negative_total)} note={`${int(L.negative_count)} ${t('wlWallets')} · ${t('wlNotCounted')}`} />
            <Kpi tone="soft" label={t('wlToNotify')} value={int(counts.new)} note={`${int(counts.waiting)} ${t('wlWaiting')} · ${int(counts.due)} ${t('wlDue')}`} />
          </div>

          <Card title={`${t('wlNegList')} · ${int(neg.length)}`} right={<div className="row gap8 wrap">
              <button className="btn" disabled={!neg.length} onClick={() => exportXlsx(shown)}>{t('exportExcel')}</button>
              <AdminOnly><button className="btn primary" disabled={busy || !notNotified.length} onClick={() => notify(notNotified.map((x) => x.platform_user_id))}>
                {t('wlMarkAll').replace('{n}', int(notNotified.length))}</button></AdminOnly></div>}>
            <div className="row gap8 wrap" role="group">
              {[['all', t('all')], ['new', t('wlS_new')], ['waiting', t('wlS_waiting')], ['due', t('wlS_due')]].map(([k, l]) =>
                <button key={k} className={'btn ' + (filter === k ? 'on' : '')} aria-pressed={filter === k} onClick={() => { setFilter(k); setLimit(20) }}>{l} ({int(counts[k])})</button>)}
            </div>
            <Table cols={[
              { k: 'c', h: t('customer'), f: (x) => <span>{x.customer_id ? <a className="xs" href={'#/customers?id=' + x.customer_id}>{who(x)}</a> : <span className="xs">{who(x)}</span>}
                <div className="xs muted num">{x.email}</div>{x.mobile && <div className="xs muted num" dir="ltr" style={{ textAlign: 'start' }}>{t('wlMobile')}: {x.mobile}</div>}</span> },
              { k: 'b', h: t('balance'), r: 1, num: 1, f: (x) => <b dir="ltr" style={{ color: 'var(--warn)', unicodeBidi: 'isolate' }}>{money(x.balance)}</b> },
              { k: 's', h: t('wlSince'), num: 1, f: (x) => <span className="xs">{x.negative_since ? day(x.negative_since, lang) : '—'}</span> },
              { k: 'st', h: t('status'), f: (x) => { const s = stateOf(x); return <span className="chips">
                {s === 'new' && <Pill tone="warn">{t('wlS_new')}</Pill>}
                {s === 'waiting' && <Pill tone="violet">{t('wlNotifiedOn')} {day(x.notified_on, lang)} · {int(x.days_left)} {t('wlDaysLeft')}</Pill>}
                {s === 'due' && <Pill tone="warn">{t('wlS_due')} · {day(x.deadline, lang)}</Pill>}</span> } },
              { k: 'a', h: '', r: 1, f: (x) => <span className="row gap8" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                <button className="btn" style={SM} onClick={() => copy(x.platform_user_id, fill(mlang, x))}>{copied === x.platform_user_id ? t('wlCopied') : t('wlCopy')}</button>
                <AdminOnly>{x.notified_on ? <button className="btn ghost" style={SM} title={t('undo')} onClick={() => undo(x.notice_id)}>↺</button>
                  : <button className="btn" style={SM} disabled={busy} onClick={() => notify([x.platform_user_id])}>{t('wlMark')}</button>}</AdminOnly></span> }
            ]} rows={shown.slice(0, limit).map((x) => ({ ...x, key: x.platform_user_id }))} empty={t('nothingHere')} />
            {shown.length > limit && <div><button className="btn" onClick={() => setLimit(limit + 40)}>{t('showMore')} ({int(shown.length - limit)})</button></div>}
            <div className="xs muted">{t('wlNegNote').replace('{d}', NOTICE_DAYS)}</div>
          </Card>

          <Card title={t('wlMessage')} right={<Tabs value={mlang} onChange={setMlang} label={t('wlMessage')} items={[['ar', 'العربية'], ['en', 'English']]} />}>
            <div className="card" dir={mlang === 'ar' ? 'rtl' : 'ltr'} style={{ background: 'var(--bg)', boxShadow: 'none' }}>{MSG[mlang]}</div>
            <div className="xs muted">{t('wlMessageNote')}</div>
          </Card>

          {(d.resolved || []).length > 0 && (
            <Card title={`${t('wlResolved')} · ${int(d.resolved.length)}`}>
              <Table cols={[
                { k: 'c', h: t('customer'), f: (x) => <span className="xs">{x.username || x.email || x.platform_user_id}</span> },
                { k: 'n', h: t('wlNotifiedOn'), num: 1, f: (x) => <span className="xs">{day(x.notified_on, lang)}</span> },
                { k: 'b', h: t('wlBalanceThen'), r: 1, num: 1, f: (x) => money(x.balance_at_notice) },
                { k: 'w', h: t('wlBalanceNow'), r: 1, num: 1, f: (x) => (x.balance_now === null ? <span className="xs muted">{t('wlNotInExport')}</span> : money(x.balance_now)) }
              ]} rows={d.resolved.map((x) => ({ ...x, key: x.platform_user_id }))} />
            </Card>
          )}

          <Card title={t('wlHistory')}>
            <Table cols={[
              { k: 'd', h: t('date'), num: 1, f: (x) => day(x.snapshot_date, lang) },
              { k: 'w', h: t('wlWalletsH'), r: 1, num: 1, f: (x) => int(x.wallets) },
              { k: 'p', h: t('wlOwed'), r: 1, num: 1, f: (x) => usd(x.positive_total) },
              { k: 'n', h: t('wlNegWallets'), r: 1, num: 1, f: (x) => <span style={{ color: n(x.negative_total) < 0 ? 'var(--warn)' : undefined }}>{usd(x.negative_total)} <span className="xs muted">({int(x.negative_count)})</span></span> },
              { k: 'f', h: t('wlFile'), f: (x) => <span className="xs muted">{x.file_name}</span> }
            ]} rows={d.history.map((x) => ({ ...x, key: x.import_id }))} />
            <div className="xs muted">{t('wlHistoryNote')}</div>
          </Card>
        </>
      })())}</Loading>
    </Page>
  )
}
