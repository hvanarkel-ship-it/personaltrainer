import { useState, useEffect } from 'react'
import Login from './components/Login.jsx'
import Dashboard from './components/Dashboard.jsx'
import Coach from './components/Coach.jsx'
import Training from './components/Training.jsx'
import Voeding from './components/Voeding.jsx'
import Lichaam from './components/Lichaam.jsx'
import Doelen from './components/Doelen.jsx'
import Settings from './components/Settings.jsx'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '⚡' },
  { id: 'coach', label: 'Coach', icon: '💬' },
  { id: 'training', label: 'Training', icon: '🏋️' },
  { id: 'voeding', label: 'Voeding', icon: '🍽️' },
  { id: 'lichaam', label: 'Lichaam', icon: '📊' },
  { id: 'settings', label: 'Instellingen', icon: '⚙️' },
]

export default function App() {
  const [user, setUser] = useState(null)
  const [laden, setLaden] = useState(true)
  const [scherm, setScherm] = useState('dashboard')
  const [stravaStatus, setStravaStatus] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem('apex_token')
    const saved = localStorage.getItem('apex_user')
    if (token && saved) {
      try { setUser(JSON.parse(saved)) } catch { localStorage.clear() }
    }

    // Strava OAuth callback afhandeling
    const params = new URLSearchParams(window.location.search)
    const integratie = params.get('integratie')
    const status = params.get('status')
    if (integratie === 'strava' && status) {
      setStravaStatus(status)
      setScherm('settings')
      // Verwijder query params zonder page reload
      window.history.replaceState({}, '', window.location.pathname)
    }

    setLaden(false)
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

  if (laden) return <div className="loading-screen"><div className="spinner" /></div>
  if (!user) return <Login onInloggen={inloggen} />

  const schermen = {
    dashboard: Dashboard,
    coach: Coach,
    training: Training,
    voeding: Voeding,
    lichaam: Lichaam,
    doelen: Doelen,
    settings: Settings,
  }
  const Scherm = schermen[scherm] || Dashboard

  return (
    <div className="app">
      <Scherm
        user={user}
        onNavigeer={setScherm}
        onUitloggen={uitloggen}
        stravaStatus={scherm === 'settings' ? stravaStatus : undefined}
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
    </div>
  )
}
