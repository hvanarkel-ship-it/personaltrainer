import { useState, useEffect, Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { fout: null } }
  static getDerivedStateFromError(err) { return { fout: err?.message || 'Onbekende fout' } }
  render() {
    if (this.state.fout) return (
      <div style={{ padding: 24, textAlign: 'center', fontFamily: '-apple-system, sans-serif' }}>
        <p style={{ fontSize: '2rem', marginBottom: 8 }}>⚠️</p>
        <h2 style={{ marginBottom: 8 }}>Er is iets misgegaan</h2>
        <p style={{ color: '#6b7280', marginBottom: 20, fontSize: '0.875rem' }}>{this.state.fout}</p>
        <button onClick={() => window.location.reload()} style={{ background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 20px', fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
          App herladen
        </button>
      </div>
    )
    return this.props.children
  }
}
import Login from './components/Login.jsx'
import Onboarding from './components/Onboarding.jsx'
import WachtwoordReset from './components/WachtwoordReset.jsx'
import Dashboard from './components/Dashboard.jsx'
import Coach from './components/Coach.jsx'
import Training from './components/Training.jsx'
import Voeding from './components/Voeding.jsx'
import Lichaam from './components/Lichaam.jsx'
import Doelen from './components/Doelen.jsx'
import Settings from './components/Settings.jsx'
import Statistieken from './components/Statistieken.jsx'
import DbStatus from './components/DbStatus.jsx'
import Styleguide from './components/Styleguide.jsx'

const APP_VERSION = 'v2026.04-2'

const NAV = [
  { id: 'dashboard', label: 'Home' },
  { id: 'coach', label: 'Coach' },
  { id: 'training', label: 'Training' },
  { id: 'voeding', label: 'Voeding' },
  { id: 'lichaam', label: 'Lichaam' },
  { id: 'settings', label: 'Meer' },
]

function NavIcoon({ id }) {
  const props = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (id === 'dashboard') return (
    <svg {...props}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
  )
  if (id === 'coach') return (
    <svg {...props}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
  )
  if (id === 'training') return (
    <svg {...props}><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>
  )
  if (id === 'voeding') return (
    <svg {...props}><path d="M3 2v7c0 1.1.9 2 2 2s2-.9 2-2V2"/><line x1="7" y1="11" x2="7" y2="22"/><path d="M21 15V2s-5 3-5 7 5 5 5 5z"/><line x1="16" y1="22" x2="16" y2="15"/></svg>
  )
  if (id === 'lichaam') return (
    <svg {...props}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  )
  if (id === 'settings') return (
    <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
  )
  return null
}

// iOS detectie
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () =>
  window.navigator.standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches

export default function App() {
  const [user, setUser] = useState(null)
  const [laden, setLaden] = useState(true)
  const [scherm, setScherm] = useState('dashboard')
  const [coachTrigger, setCoachTrigger] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState(null)   // Android
  const [showIosHint, setShowIosHint] = useState(false)      // iOS
  const [showUpdate, setShowUpdate] = useState(false)
  const [updateReg, setUpdateReg] = useState(null)
  const [toonOnboarding, setToonOnboarding] = useState(false)
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('reset'))
  const [suuntoStatus, setSuuntoStatus] = useState(() => new URLSearchParams(window.location.search).get('suunto'))
  const [isStyleguide] = useState(() => window.location.pathname === '/styleguide' || new URLSearchParams(window.location.search).has('styleguide'))

  useEffect(() => {
    // Auth
    const token = localStorage.getItem('apex_token')
    const saved = localStorage.getItem('apex_user')
    if (token && saved) {
      try { setUser(JSON.parse(saved)) } catch { localStorage.clear() }
    }

    // Online / offline
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    // Android install prompt
    const onInstallPrompt = (e) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', onInstallPrompt)

    // iOS install hint (één keer tonen)
    if (isIos() && !isStandalone() && !localStorage.getItem('apex_ios_hint_shown')) {
      setTimeout(() => setShowIosHint(true), 2500)
    }

    // SW update
    const onUpdate = (e) => { setUpdateReg(e.detail.reg); setShowUpdate(true) }
    window.addEventListener('sw-update-available', onUpdate)

    setLaden(false)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('beforeinstallprompt', onInstallPrompt)
      window.removeEventListener('sw-update-available', onUpdate)
    }
  }, [])

  async function inloggen(token, userData) {
    localStorage.setItem('apex_token', token)
    localStorage.setItem('apex_user', JSON.stringify(userData))
    setUser(userData)
    setScherm('dashboard')
    // Check onboarding: only if not already completed for this user
    const vlagKey = `apex_onboarding_${userData.id}`
    if (!localStorage.getItem(vlagKey)) {
      try {
        const profiel = await fetch('/api/profiel', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
        if (!profiel.gewicht_kg) setToonOnboarding(true)
        else localStorage.setItem(vlagKey, '1')
      } catch { /* stil falen — toon gewoon de app */ }
    }
  }

  function uitloggen() {
    localStorage.removeItem('apex_token')
    localStorage.removeItem('apex_user')
    setUser(null)
  }

  async function installAndroid() {
    if (!installPrompt) return
    try {
      await installPrompt.prompt()
      const { outcome } = await installPrompt.userChoice
      if (outcome === 'accepted') setInstallPrompt(null)
    } catch {
      setInstallPrompt(null)
    }
  }

  function sluitIosHint() {
    localStorage.setItem('apex_ios_hint_shown', '1')
    setShowIosHint(false)
  }

  function applyUpdate() {
    updateReg?.waiting?.postMessage({ type: 'SKIP_WAITING' })
    window.location.reload()
  }

  // Na Suunto OAuth callback: navigeer naar instellingen en toon resultaat
  useEffect(() => {
    if (suuntoStatus && user) {
      window.history.replaceState({}, '', window.location.pathname)
      setScherm('settings')
    }
  }, [suuntoStatus, user])

  if (isStyleguide) return <ErrorBoundary><Styleguide /></ErrorBoundary>
  if (laden) return <div className="loading-screen"><div className="spinner" /></div>
  if (resetToken) return (
    <WachtwoordReset token={resetToken} onInloggen={(token, userData) => {
      window.history.replaceState({}, '', window.location.pathname)
      setResetToken(null)
      inloggen(token, userData)
    }} />
  )
  if (!user) return <Login onInloggen={inloggen} />
  if (toonOnboarding) return (
    <Onboarding user={user} onKlaar={() => {
      localStorage.setItem(`apex_onboarding_${user.id}`, '1')
      setToonOnboarding(false)
    }} />
  )

  const schermen = {
    dashboard: Dashboard, training: Training,
    voeding: Voeding, lichaam: Lichaam, doelen: Doelen, settings: Settings,
    statistieken: Statistieken,
  }
  const Scherm = schermen[scherm]

  const navProps = {
    onNavigeer: (s, ctx) => { setScherm(s); if (s === 'coach' && ctx) setCoachTrigger(ctx) },
    onUitloggen: uitloggen,
  }

  return (
    <ErrorBoundary>
    <div className="app">
      <DbStatus />

      {/* Offline banner */}
      {!isOnline && (
        <div className="offline-banner">
          📵 Geen internetverbinding — je ziet gecachte data
        </div>
      )}

      {/* SW update banner */}
      {showUpdate && (
        <div className="update-banner">
          <span>🆕 Update beschikbaar ({APP_VERSION})</span>
          <button onClick={applyUpdate}>Bijwerken</button>
          <button onClick={() => setShowUpdate(false)}>✕</button>
        </div>
      )}

      {/* Coach blijft altijd gemount zodat dialooghistorie niet verloren gaat */}
      <div style={{ display: scherm === 'coach' ? 'contents' : 'none' }}>
        <Coach
          user={user}
          {...navProps}
          coachTrigger={coachTrigger}
          onCoachTriggerUsed={() => setCoachTrigger(null)}
        />
      </div>

      {/* Alle andere schermen mounten/unmounten normaal */}
      {Scherm && scherm !== 'coach' && (
        <Scherm
          user={user}
          {...navProps}
          {...(scherm === 'settings' ? { suuntoStatus, onSuuntoStatusClear: () => setSuuntoStatus(null) } : {})}
        />
      )}

      <div className="app-versie">{APP_VERSION}</div>

      <nav className="bottom-nav">
        {NAV.map(item => (
          <button
            key={item.id}
            className={`nav-btn ${scherm === item.id ? 'active' : ''}`}
            onClick={() => setScherm(item.id)}
          >
            <span className="nav-icon"><NavIcoon id={item.id} /></span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Android install prompt */}
      {installPrompt && (
        <div className="install-banner">
          <div className="install-banner-content">
            <span className="install-icon">⚡</span>
            <div>
              <strong>Installeer APEX Coach</strong>
              <p>Zet de app op je beginscherm voor snelle toegang</p>
            </div>
          </div>
          <div className="install-banner-acties">
            <button className="btn btn-primary" onClick={installAndroid}>Installeren</button>
            <button className="btn btn-ghost" onClick={() => setInstallPrompt(null)}>Niet nu</button>
          </div>
        </div>
      )}

      {/* iOS install hint */}
      {showIosHint && (
        <div className="ios-hint-overlay" onClick={sluitIosHint}>
          <div className="ios-hint-sheet" onClick={e => e.stopPropagation()}>
            <div className="ios-hint-header">
              <span className="install-icon">⚡</span>
              <strong>Installeer APEX Coach</strong>
            </div>
            <p>Zet de app op je beginscherm voor de beste ervaring (geen adresbalk, sneller).</p>
            <ol className="ios-stappen">
              <li>Tik op het <strong>Deel-icoontje</strong> <span className="ios-share-icon">⬆️</span> in Safari</li>
              <li>Kies <strong>"Zet op beginscherm"</strong></li>
              <li>Tik op <strong>"Voeg toe"</strong></li>
            </ol>
            <button className="btn btn-primary btn-full" onClick={sluitIosHint} style={{ marginTop: '16px' }}>
              Begrepen
            </button>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  )
}
