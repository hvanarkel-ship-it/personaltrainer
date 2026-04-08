import { useState } from 'react'
import { api } from '../api.js'

export default function Login({ onInloggen }) {
  const [modus, setModus] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', name: '', bevestig: '' })
  const [fout, setFout] = useState('')
  const [laden, setLaden] = useState(false)

  const upd = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setFout('')
    if (modus === 'register' && form.password !== form.bevestig) {
      return setFout('Wachtwoorden komen niet overeen')
    }
    setLaden(true)
    try {
      const endpoint = modus === 'login' ? '/auth-login' : '/auth-register'
      const body = modus === 'login'
        ? { email: form.email, password: form.password }
        : { email: form.email, password: form.password, name: form.name }
      const data = await api.post(endpoint, body)
      onInloggen(data.token, data.user)
    } catch (err) {
      setFout(err.message)
    } finally {
      setLaden(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">⚡</div>
          <h1>APEX Coach</h1>
          <p>Jouw AI Personal Trainer</p>
        </div>

        <form onSubmit={submit}>
          <h2>{modus === 'login' ? 'Inloggen' : 'Account aanmaken'}</h2>
          {fout && <div className="alert alert-error">{fout}</div>}

          {modus === 'register' && (
            <div className="form-group">
              <label>Naam</label>
              <input type="text" value={form.name} onChange={upd('name')} placeholder="Jouw naam" required autoComplete="name" />
            </div>
          )}

          <div className="form-group">
            <label>E-mailadres</label>
            <input type="email" value={form.email} onChange={upd('email')} placeholder="email@domein.nl" required autoComplete="email" />
          </div>

          <div className="form-group">
            <label>Wachtwoord</label>
            <input type="password" value={form.password} onChange={upd('password')} placeholder="Minimaal 8 tekens" required autoComplete={modus === 'login' ? 'current-password' : 'new-password'} />
          </div>

          {modus === 'register' && (
            <div className="form-group">
              <label>Wachtwoord bevestigen</label>
              <input type="password" value={form.bevestig} onChange={upd('bevestig')} placeholder="Herhaal wachtwoord" required autoComplete="new-password" />
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-full" disabled={laden}>
            {laden ? 'Bezig...' : modus === 'login' ? 'Inloggen' : 'Account aanmaken'}
          </button>
        </form>

        <p className="login-switch">
          {modus === 'login' ? 'Nog geen account?' : 'Al een account?'}
          {' '}
          <button className="link-btn" onClick={() => { setModus(m => m === 'login' ? 'register' : 'login'); setFout('') }}>
            {modus === 'login' ? 'Registreren' : 'Inloggen'}
          </button>
        </p>
      </div>
    </div>
  )
}
