import { useState } from 'react'
import { api } from '../api.js'

export default function Login({ onInloggen }) {
  const [modus, setModus] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', name: '', bevestig: '' })
  const [fout, setFout] = useState('')
  const [laden, setLaden] = useState(false)
  const [resetVerstuurd, setResetVerstuurd] = useState(false)

  const upd = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const gaanaar = m => { setModus(m); setFout(''); setResetVerstuurd(false) }

  async function submit(e) {
    e.preventDefault()
    setFout('')
    if (modus === 'register' && form.password !== form.bevestig) {
      return setFout('Wachtwoorden komen niet overeen')
    }
    setLaden(true)
    try {
      if (modus === 'vergeten') {
        await api.post('/auth-reset-request', { email: form.email })
        setResetVerstuurd(true)
      } else {
        const endpoint = modus === 'login' ? '/auth-login' : '/auth-register'
        const body = modus === 'login'
          ? { email: form.email, password: form.password }
          : { email: form.email, password: form.password, name: form.name }
        const data = await api.post(endpoint, body)
        onInloggen(data.token, data.user)
      }
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

        {/* ── Wachtwoord vergeten bevestiging ── */}
        {modus === 'vergeten' && resetVerstuurd ? (
          <div className="card" style={{ textAlign: 'center', padding: '24px' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📬</div>
            <h2 style={{ marginBottom: '8px' }}>Check je inbox</h2>
            <p style={{ color: 'var(--text-2)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '20px' }}>
              Als <strong>{form.email}</strong> bekend is bij ons, ontvang je binnen enkele minuten een e-mail met een resetlink.
            </p>
            <button className="btn btn-ghost btn-full" onClick={() => gaanaar('login')}>
              Terug naar inloggen
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h2>
              {modus === 'login' ? 'Inloggen' : modus === 'register' ? 'Account aanmaken' : 'Wachtwoord vergeten'}
            </h2>
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

            {modus !== 'vergeten' && (
              <div className="form-group">
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Wachtwoord</span>
                  {modus === 'login' && (
                    <button type="button" className="link-btn small" onClick={() => gaanaar('vergeten')}>
                      Vergeten?
                    </button>
                  )}
                </label>
                <input type="password" value={form.password} onChange={upd('password')} placeholder="Minimaal 8 tekens" required autoComplete={modus === 'login' ? 'current-password' : 'new-password'} />
              </div>
            )}

            {modus === 'register' && (
              <div className="form-group">
                <label>Wachtwoord bevestigen</label>
                <input type="password" value={form.bevestig} onChange={upd('bevestig')} placeholder="Herhaal wachtwoord" required autoComplete="new-password" />
              </div>
            )}

            {modus === 'vergeten' && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '12px' }}>
                Vul je e-mailadres in. Je ontvangt een link om een nieuw wachtwoord in te stellen.
              </p>
            )}

            <button type="submit" className="btn btn-primary btn-full" disabled={laden}>
              {laden ? 'Bezig...' : modus === 'login' ? 'Inloggen' : modus === 'register' ? 'Account aanmaken' : 'Resetlink versturen'}
            </button>

            {modus === 'vergeten' && (
              <button type="button" className="btn btn-ghost btn-full" style={{ marginTop: '8px' }} onClick={() => gaanaar('login')}>
                Terug naar inloggen
              </button>
            )}
          </form>
        )}

        {modus !== 'vergeten' && !resetVerstuurd && (
          <p className="login-switch">
            {modus === 'login' ? 'Nog geen account?' : 'Al een account?'}
            {' '}
            <button className="link-btn" onClick={() => gaanaar(modus === 'login' ? 'register' : 'login')}>
              {modus === 'login' ? 'Registreren' : 'Inloggen'}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
