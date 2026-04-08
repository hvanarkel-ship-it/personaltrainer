import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

const navItems = [
  { path: '/', label: 'Dashboard', icon: '⚡' },
  { path: '/coach', label: 'Coach', icon: '🤖' },
  { path: '/metingen', label: 'Metingen', icon: '📊' },
  { path: '/voeding', label: 'Voeding', icon: '🍽️' },
  { path: '/trainingen', label: 'Training', icon: '💪' },
  { path: '/instellingen', label: 'Instellingen', icon: '⚙️' },
]

export default function Layout() {
  const { gebruiker, uitloggen } = useAuth()
  const navigate = useNavigate()

  function handleUitloggen() {
    uitloggen()
    navigate('/login')
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-icon">⚡</span>
          <span className="brand-name">APEX Coach</span>
        </div>
        <div className="header-user">
          <span className="user-name">{gebruiker?.naam}</span>
          <button className="btn-uitloggen" onClick={handleUitloggen}>Uitloggen</button>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <nav className="app-nav">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
