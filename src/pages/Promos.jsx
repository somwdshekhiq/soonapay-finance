import { useState } from 'react'
import { supabase, useApp, useQuery, q, usd, int, day, n } from '../lib.js'
import { Page, Card, Loading, Table, Pill, AdminOnly } from '../ui.jsx'

async function load() {
  const [camps, reds, promos] = await Promise.all([
    q(supabase.from('promo_campaigns').select('*').order('campaign_id')),
    q(supabase.from('promo_redemptions').select('redemption_id, campaign_id, email, status, note, done_at, customer_id').order('redemption_id')),
    q(supabase.from('promo_costs').select('*').order('entry_date', { ascending: false }).limit(40))
  ])
  return { camps, reds, promos }
}

export default function Promos() {
  const { t, lang } = useApp()
  const r = useQuery(load)
  const d = r.data
  const [email, setEmail] = useState(''), [camp, setCamp] = useState(''), [msg, setMsg] = useState('')
  const [promo, setPromo] = useState({ date: new Date().toISOString().slice(0, 10), name: '', units: 1, cost: '' })

  const markDone = async (id) => {
    const { error } = await supabase.from('promo_redemptions').update({ status: 'done', done_at: new Date().toISOString() }).eq('redemption_id', id)
    setMsg(error ? error.message : t('saved')); r.reload()
  }
  const addEmail = async () => {
    const list = email.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)
    if (!list.length) return
    const cid = Number(camp || d.camps[0].campaign_id)
    const { error } = await supabase.from('promo_redemptions').insert(list.map((e) => ({ campaign_id: cid, email: e })))
    setMsg(error ? error.message : t('saved')); setEmail(''); r.reload()
  }
  const addPromo = async () => {
    const { error } = await supabase.from('promo_costs').insert({ entry_date: promo.date, promo_name: promo.name, units: n(promo.units), cost_per_unit: n(promo.cost) })
    setMsg(error ? error.message : t('saved')); r.reload()
  }

  return (
    <Page title={t('promos')}>
      <Loading q={r}>{d && <>
        {msg && <div className="ok">{msg}</div>}
        <div className="split">
          {d.camps.map((c) => {
            const rs = d.reds.filter((x) => x.campaign_id === c.campaign_id)
            const done = rs.filter((x) => x.status === 'done').length, wait = rs.filter((x) => x.status === 'pending' || x.status === 'in_progress').length
            return (
              <Card key={c.campaign_id} title={c.name} right={<span className="num small muted">{usd(c.unit_cost_usd)} {t('perCard')}</span>}>
                <div className="meter"><div style={{ width: (100 * done) / (rs.length || 1) + '%', background: 'var(--accent)' }} /></div>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
                  <div><div className="xs muted">{t('redeemed')}</div><div className="num" style={{ fontSize: 20 }}>{int(done)}</div></div>
                  <div><div className="xs" style={{ color: 'var(--warn)' }}>{t('waiting')}</div><div className="num" style={{ fontSize: 20, color: 'var(--warn)' }}>{int(wait)}</div></div>
                  <div><div className="xs muted">{t('costSoFar')}</div><div className="num" style={{ fontSize: 20 }}>{usd(done * n(c.unit_cost_usd))}</div></div>
                </div>
              </Card>
            )
          })}
        </div>

        <Card title={`${t('waitingList')} · ${d.reds.filter((x) => x.status === 'pending').length}`}
          right={<AdminOnly><div className="row gap8 wrap">
            <input className="inp" style={{ minWidth: 240, width: 'auto' }} aria-label={t('addEmail')} placeholder={t('addEmail')} value={email} onChange={(e) => setEmail(e.target.value)} />
            <select className="inp" style={{ width: 'auto' }} aria-label={t('list')} value={camp} onChange={(e) => setCamp(e.target.value)}>
              {d.camps.map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.name}</option>)}</select>
            <button className="btn" onClick={addEmail}>{t('add')}</button></div></AdminOnly>}>
          <Table cols={[
            { k: 'email', h: t('customer'), f: (x) => <span className="num xs">{x.email}</span> },
            { k: 'list', h: t('list'), f: (x) => d.camps.find((c) => c.campaign_id === x.campaign_id)?.name },
            { k: 'note', h: t('note'), f: (x) => <span className="xs muted">{x.note}</span> },
            { k: 'known', h: t('customer'), f: (x) => <Pill tone={x.customer_id ? 'good' : 'warn'}>{x.customer_id ? '✓' : '?'}</Pill> },
            { k: 'act', h: '', r: 1, f: (x) => <AdminOnly><button className="btn primary" onClick={() => markDone(x.redemption_id)}>{t('markDone')}</button></AdminOnly> }
          ]} rows={d.reds.filter((x) => x.status === 'pending').map((x) => ({ ...x, key: x.redemption_id }))} />
        </Card>

        <Card title={t('lessPromos')}>
          <AdminOnly><div className="form-grid">
            <label className="field"><span>{t('date')}</span><input type="date" value={promo.date} onChange={(e) => setPromo({ ...promo, date: e.target.value })} /></label>
            <label className="field"><span>{t('description')}</span><input value={promo.name} onChange={(e) => setPromo({ ...promo, name: e.target.value })} /></label>
            <label className="field"><span>#</span><input type="number" value={promo.units} onChange={(e) => setPromo({ ...promo, units: e.target.value })} /></label>
            <label className="field"><span>{t('amount')} / 1</span><input type="number" step="0.01" value={promo.cost} onChange={(e) => setPromo({ ...promo, cost: e.target.value })} /></label>
            <div className="field"><span>&nbsp;</span><button className="btn primary" onClick={addPromo}>{t('add')}</button></div>
          </div></AdminOnly>
          <Table cols={[
            { k: 'd', h: t('date'), num: 1, f: (x) => day(x.entry_date, lang) },
            { k: 'n', h: t('description'), f: (x) => x.promo_name },
            { k: 'u', h: '#', r: 1, num: 1, f: (x) => n(x.units) },
            { k: 'tot', h: t('total'), r: 1, num: 1, f: (x) => usd(x.total_usd) },
            { k: 's', h: t('paidFrom'), f: (x) => <Pill tone={x.funding_source === 'partner_finance' ? 'good' : 'grey'}>{x.funding_source === 'partner_finance' ? t('addedToFinance') : t('netProfit')}</Pill> }
          ]} rows={d.promos.map((x) => ({ ...x, key: x.entry_id }))} />
        </Card>
      </>}</Loading>
    </Page>
  )
}
