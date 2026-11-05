import { useEffect, useState } from 'react'
import { supabase, useApp, q, int } from '../lib.js'
import { Page, Card, Loading, Pill } from '../ui.jsx'

const when = (v, lang) => new Date(v).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB',
  { timeZone: 'Asia/Riyadh', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function Notifications({ onSeen }) {
  const { t, lang } = useApp()
  const [st, setSt] = useState({ loading: true })
  const [open, setOpen] = useState({})
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const prev = (await q(supabase.rpc('notif_mark_seen'))) || '1970-01-01'
        const [rows, camps] = await Promise.all([
          q(supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)),
          q(supabase.from('promo_campaigns').select('campaign_id, name'))
        ])
        if (live) setSt({ rows, camps, prev: new Date(prev) })
        onSeen && onSeen()
      } catch (e) { if (live) setSt({ error: e }) }
    })()
    return () => { live = false }
  }, [])
  const r = { loading: st.loading, error: st.error, data: st.rows ? st : null }
  return (
    <Page title={t('notifications')} sub={t('notificationsSub')}>
      <Loading q={r}>{st.rows && (
        <Card>
          {!st.rows.length && <div className="muted">{t('noNotifications')}</div>}
          {st.rows.map((x) => {
            const fresh = new Date(x.created_at) > st.prev
            const camp = st.camps.find((c) => c.campaign_id === x.campaign_id)?.name || ''
            const emails = x.detail?.emails || []
            return (
              <div key={x.notif_id} className="step" style={{ flexDirection: 'column', gap: 6, background: fresh ? 'var(--accent-s)' : undefined, borderRadius: fresh ? 8 : 0, padding: fresh ? 14 : '14px 0' }}>
                <div className="row between wrap gap8">
                  <div><b>{x.actor_name}</b> {t('addedToList').replace('{n}', int(x.item_count))} <b>{camp}</b></div>
                  <div className="row gap8">{fresh && <Pill tone="violet">{t('new')}</Pill>}<span className="xs muted num">{when(x.created_at, lang)}</span></div>
                </div>
                <div className="row gap8 wrap">
                  {emails.length > 0 && <button className="btn ghost" style={{ minHeight: 32, padding: '4px 0' }} aria-expanded={!!open[x.notif_id]}
                    onClick={() => setOpen({ ...open, [x.notif_id]: !open[x.notif_id] })}>{open[x.notif_id] ? t('hideEmails') : t('showEmails')}</button>}
                  <a className="small" href="#/promos" style={{ alignSelf: 'center' }}>{t('openWaitingList')}</a>
                </div>
                {open[x.notif_id] && <div className="xs num" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{emails.map((e) => <span key={e}>{e}</span>)}</div>}
              </div>
            )
          })}
        </Card>
      )}</Loading>
    </Page>
  )
}
