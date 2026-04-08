import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function Login() {
  const [email, setEmail] = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [fout, setFout] = useState('')
  const [laden, setLaden] = useState(false)
  const { inloggen } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setFout('')
    setLaden(true)
    try {
      await inloggen(email, wachtwoord)
      navigate('/')
    } catch (err) {
      setFout(err.message)
    } finally {
      setLaden(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-icon">⚡</span>
          <h1>APEX Coach</h1>
          <p>Jouw AI Personal Trainer</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <h2>Inloggen</h2>

          {fout && <div className="alert alert-error">{fout}</div>}

          <div className="form-group">
            <label>E-mailadres</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="jouw@email.nl"
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label>Wachtwoord</label>
            <input
              type="password"
              value={wachtwoord}
              onChange={e => setWachtwoord(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={laden}>
            {laden ? 'Bezig met inloggen...' : 'Inloggen'}
          </button>
        </form>

        <p className="auth-switch">
          Nog geen account? <Link to="/registreren">Registreren</Link>
        </p>
      </div>
    </div>
  )
}
