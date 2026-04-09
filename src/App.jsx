import { useState, useEffect } from 'react'
import Login from './components/Login.jsx'
import Dashboard from './components/Dashboard.jsx'
import Coach from './components/Coach.jsx'
import Training from './components/Training.jsx'
import Voeding from './components/Voeding.jsx'
import Lichaam from './components/Lichaam.jsx'
import Doelen from './components/Doelen.jsx'
import Settings from './components/Settings.jsx'
import DbStatus from './components/DbStatus.jsx'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '⚡' },
  { id: 'coach', label: 'Coach', icon: '💬' },
  { id: 'training', label: 'Training', icon: '🏋️' },
  { id: 'voeding', label: 'Voeding', icon: '🍽️' },
  { id: 'lichaam', label: 'Lichaam', icon: '📊' },
  { id: 'settings', label: 'Instellingen', icon: '⚙️' },
]

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
  const [stravaStatus, setStravaStatus] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState(null)   // Android
  const [showIosHint, setShowIosHint] = useState(false)      // iOS
  const [showUpdate, setShowUpdate] = useState(false)
  const [updateReg, setUpdateReg] = useState(null)

  useEffect(() => {
    // Auth
    const token = localStorage.getItem('apex_token')
    const saved = localStorage.getItem('apex_user')
    if (token && saved) {
      try { setUser(JSON.parse(saved)) } catch { localStorage.clear() }
    }

    // Strava callback
    const params = new URLSearchParams(window.location.search)
    const integratie = params.get('integratie')
    const status = params.get('status')
    if (integratie === 'strava' && status) {
      setStravaStatus(status)
      setScherm('settings')
      window.history.replaceState({}, '', window.location.pathname)
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

  function inloggen(token, userData) {
    localStorage.setItem('apex_token', token)
    localStorage.setItem('apex_user', JSON.stringify(userData))
    setUser(userData)
    setScherm('dashboard')
  }

  function uitloggen() {
    localStorage.removeItem('apex_token')
    localStorage.removeItem('apex_user')
    setUser(null)
  }

  async function installAndroid() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }

  function sluitIosHint() {
    localStorage.setItem('apex_ios_hint_shown', '1')
    setShowIosHint(false)
  }

  function applyUpdate() {
    updateReg?.waiting?.postMessage({ type: 'SKIP_WAITING' })
    window.location.reload()
  }

  if (laden) return <div className="loading-screen"><div className="spinner" /></div>
  if (!user) return <Login onInloggen={inloggen} />

  const schermen = {
    dashboard: Dashboard, coach: Coach, training: Training,
    voeding: Voeding, lichaam: Lichaam, doelen: Doelen, settings: Settings,
  }
  const Scherm = schermen[scherm] || Dashboard

  return (
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
          <span>🆕 Nieuwe versie beschikbaar</span>
          <button onClick={applyUpdate}>Bijwerken</button>
          <button onClick={() => setShowUpdate(false)}>✕</button>
        </div>
      )}

      <Scherm
        user={user}
        onNavigeer={(s, ctx) => { setScherm(s); if (s === 'coach' && ctx) setCoachTrigger(ctx) }}
        onUitloggen={uitloggen}
        stravaStatus={scherm === 'settings' ? stravaStatus : undefined}
        coachTrigger={scherm === 'coach' ? coachTrigger : undefined}
        onCoachTriggerUsed={() => setCoachTrigger(null)}
      />

      <nav className="bottom-nav">
        {NAV.map(item => (
          <button
            key={item.id}
            className={`nav-btn ${scherm === item.id ? 'active' : ''}`}
            onClick={() => setScherm(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
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
  )
}
