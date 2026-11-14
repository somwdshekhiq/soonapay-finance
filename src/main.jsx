import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase, AppCtx, T } from './lib.js'
import { PageGuard } from './ui.jsx'
import './styles.css'
import Dashboard from './pages/Dashboard.jsx'
import Stats from './pages/Stats.jsx'
import Distributions from './pages/Distributions.jsx'
import Finance from './pages/Finance.jsx'
import Expenses from './pages/Expenses.jsx'
import Promos from './pages/Promos.jsx'
import Rules from './pages/Rules.jsx'
import ImportPage from './pages/Import.jsx'
import Notifications from './pages/Notifications.jsx'
import Providers from './pages/Providers.jsx'
import Transactions from './pages/Transactions.jsx'
import Backcharges from './pages/Backcharges.jsx'
import Customers from './pages/Customers.jsx'

const ROUTES = [
  ['dashboard', Dashboard], ['notifications', Notifications], ['statistics', Stats], ['financePartners', Finance], ['transactions', Transactions], ['backcharges', Backcharges], ['customers', Customers], ['importFiles', ImportPage], ['expenses', Expenses],
  ['distributions', Distributions], ['promos', Promos], ['rules', Rules], ['providers', Providers]
]
const ADMIN_ONLY = ['notifications', 'providers']
// menu sections (notifications sits above them, on its own)
const GROUPS = [
  ['navOverview', ['dashboard', 'statistics']],
  ['navTransactions', ['importFiles', 'transactions', 'backcharges']],
  ['navCustomers', ['customers', 'promos']],
  ['navPartners', ['distributions', 'financePartners', 'expenses']],
  ['navSettings', ['rules', 'providers']]
]

function useHash() {
  const get = () => (window.location.hash.replace('#/', '').split('?')[0] || 'dashboard')
  const [h, set] = useState(get())
  useEffect(() => { const f = () => set(get()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f) }, [])
  return h
}

function Login({ t, toggleLang }) {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    if (error) setErr(error.message)
    setBusy(false)
  }
  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <img className="logo" src="/logo.png" alt="SoonaPay" />
        <div className="row between"><div><div className="brand">{t('appName')}</div><div className="muted small">{t('finance')}</div></div>
          <button type="button" className="btn ghost" onClick={toggleLang}>{t('language')}</button></div>
        <label className="field"><span>{t('email')}</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
        <label className="field"><span>{t('password')}</span><input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></label>
        {err && <div className="alert">{err}</div>}
        <button className="btn primary" disabled={busy}>{t('signIn')}</button>
      </form>
    </div>
  )
}

function App() {
  const [session, setSession] = useState(undefined)
  const [member, setMember] = useState(undefined)
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('lang') || 'en' } catch { return 'en' } })
  const route = useHash()
  const [unread, setUnread] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  // phone menu: close whenever a page is chosen, and with Escape
  useEffect(() => { setMenuOpen(false); window.scrollTo(0, 0) }, [route])
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setMember(undefined); return }
    supabase.from('app_users').select('role, language, partner_id').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => { setMember(data || null); if (data?.language) setLang(data.language) })
  }, [session])

  // unread notifications for the admin: on every page change and once a minute
  useEffect(() => {
    if (member?.role !== 'admin') return
    let live = true
    const check = () => supabase.rpc('notif_unread').then(({ data }) => { if (live && typeof data === 'number') setUnread(data) })
    check()
    const id = setInterval(check, 60000)
    return () => { live = false; clearInterval(id) }
  }, [member, route])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    try { localStorage.setItem('lang', lang) } catch {}
  }, [lang])

  const t = (k) => T[lang][k] ?? T.en[k] ?? k
  const toggleLang = async () => {
    const next = lang === 'en' ? 'ar' : 'en'
    setLang(next)
    if (session) await supabase.from('app_users').update({ language: next }).eq('user_id', session.user.id)
  }

  if (session === undefined) return null
  if (!session) return <Login t={t} toggleLang={toggleLang} />
  if (member === undefined) return null
  if (member === null) return (
    <div className="login"><div className="card login-card"><p>{t('notMember')}</p>
      <button className="btn" onClick={() => supabase.auth.signOut()}>{t('signOut')}</button></div></div>
  )

  const routes = member.role === 'marketing' ? ROUTES.filter(([k]) => k === 'promos')
    : member.role === 'admin' ? ROUTES : ROUTES.filter(([k]) => !ADMIN_ONLY.includes(k))
  const [active, Current] = routes.find(([k]) => k === route) || routes[0]
  const has = (k) => routes.some(([x]) => x === k)
  return (
    <AppCtx.Provider value={{ role: member.role, lang, t }}>
      <div className="shell">
        <header className="topbar">
          <button type="button" className="burger" aria-label={menuOpen ? t('closeMenu') : t('menu')} aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen(!menuOpen)}>
            <span /><span /><span />
          </button>
          <div className="topbar-title">{t(active)}</div>
          {unread > 0 && <a href="#/notifications" className="badge" style={{ textDecoration: 'none' }} aria-label={`${t('notifications')}: ${unread} ${t('unread')}`}>{unread}</a>}
        </header>
        {menuOpen && <div className="nav-scrim" onClick={() => setMenuOpen(false)} />}
        <nav id="main-nav" className={'nav' + (menuOpen ? ' open' : '')} aria-label="Main">
          <img className="logo" src="/logo.png" alt="SoonaPay" />
          <div className="brand">{t('appName')}</div>
          <div className="muted-inv small">{t('finance')} · {member.role === 'admin' ? t('admin') : member.role === 'marketing' ? t('marketingRole') : t('viewOnly')}</div>
          <div className="nav-top">
            <button className="btn nav-btn" onClick={toggleLang}>{t('language')}</button>
            <button className="btn nav-btn" onClick={() => supabase.auth.signOut()}>{t('signOut')}</button>
          </div>
          <div className="nav-links">
            {has('notifications') && <a href="#/notifications" className={active === 'notifications' ? 'on' : ''} onClick={() => setMenuOpen(false)}>
              <span className="row between">{t('notifications')}{unread > 0 && <span className="badge" aria-label={`${unread} ${t('unread')}`}>{unread}</span>}</span></a>}
            {GROUPS.map(([g, keys]) => {
              const mine = keys.filter(has)
              if (!mine.length) return null
              return (
                <div key={g} className="nav-group" role="group" aria-label={t(g)}>
                  {routes.length > 1 && <div className="nav-group-h">{t(g)}</div>}
                  {mine.map((k) => <a key={k} href={'#/' + k} className={active === k ? 'on' : ''} onClick={() => setMenuOpen(false)}>{t(k)}</a>)}
                </div>
              )
            })}
          </div>
        </nav>
        <PageGuard key={active} title={t('pageError')} retry={t('tryAgain')}>
          {Current === Notifications ? <Notifications onSeen={() => setUnread(0)} /> : <Current />}
        </PageGuard>
      </div>
    </AppCtx.Provider>
  )
}

createRoot(document.getElementById('root')).render(<App />)
