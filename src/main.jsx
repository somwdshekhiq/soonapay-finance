import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase, AppCtx, T } from './lib.js'
import './styles.css'
import Dashboard from './pages/Dashboard.jsx'
import Stats from './pages/Stats.jsx'
import Distributions from './pages/Distributions.jsx'
import Finance from './pages/Finance.jsx'
import Expenses from './pages/Expenses.jsx'
import Promos from './pages/Promos.jsx'
import Rules from './pages/Rules.jsx'
import ImportPage from './pages/Import.jsx'

const ROUTES = [
  ['dashboard', Dashboard], ['statistics', Stats], ['importFiles', ImportPage], ['expenses', Expenses],
  ['distributions', Distributions], ['financePartners', Finance], ['promos', Promos], ['rules', Rules]
]

function useHash() {
  const get = () => (window.location.hash.replace('#/', '') || 'dashboard')
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

  const Current = (ROUTES.find(([k]) => k === route) || ROUTES[0])[1]
  return (
    <AppCtx.Provider value={{ role: member.role, lang, t }}>
      <div className="shell">
        <nav className="nav" aria-label="Main">
          <img className="logo" src="/logo.png" alt="SoonaPay" />
          <div className="brand">{t('appName')}</div>
          <div className="muted-inv small">{t('finance')} · {member.role === 'admin' ? t('admin') : t('viewOnly')}</div>
          <div className="nav-links">
            {ROUTES.map(([k]) => <a key={k} href={'#/' + k} className={route === k ? 'on' : ''}>{t(k)}</a>)}
          </div>
          <div className="nav-foot">
            <button className="btn nav-btn" onClick={toggleLang}>{t('language')}</button>
            <button className="btn nav-btn" onClick={() => supabase.auth.signOut()}>{t('signOut')}</button>
          </div>
        </nav>
        <Current />
      </div>
    </AppCtx.Provider>
  )
}

createRoot(document.getElementById('root')).render(<App />)
