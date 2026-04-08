import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function Register() {
  const [form, setForm] = useState({ naam: '', email: '', wachtwoord: '', bevestig: '' })
  const [fout, setFout] = useState('')
  const [laden, setLaden] = useState(false)
  const { registreren } = useAuth()
  const navigate = useNavigate()

  function update(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFout('')
    if (form.wachtwoord !== form.bevestig) {
      setFout('Wachtwoorden komen niet overeen')
      return
    }
    if (form.wachtwoord.length < 8) {
      setFout('Wachtwoord moet minimaal 8 tekens bevatten')
      return
    }
    setLaden(true)
    try {
      await registreren(form.email, form.wachtwoord, form.naam)
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
          <p>Start jouw fitness journey</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <h2>Account aanmaken</h2>

          {fout && <div className="alert alert-error">{fout}</div>}

          <div className="form-group">
            <label>Naam</label>
            <input
              type="text"
              value={form.naam}
              onChange={update('naam')}
              placeholder="Jouw naam"
              required
              autoComplete="name"
            />
          </div>

          <div className="form-group">
            <label>E-mailadres</label>
            <input
              type="email"
              value={form.email}
              onChange={update('email')}
              placeholder="jouw@email.nl"
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label>Wachtwoord</label>
            <input
              type="password"
              value={form.wachtwoord}
              onChange={update('wachtwoord')}
              placeholder="Minimaal 8 tekens"
              required
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label>Wachtwoord bevestigen</label>
            <input
              type="password"
              value={form.bevestig}
              onChange={update('bevestig')}
              placeholder="Herhaal wachtwoord"
              required
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={laden}>
            {laden ? 'Account aanmaken...' : 'Account aanmaken'}
          </button>
        </form>

        <p className="auth-switch">
          Al een account? <Link to="/login">Inloggen</Link>
        </p>
      </div>
    </div>
  )
}
