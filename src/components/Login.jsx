import { useState } from 'react'
import { api } from '../api.js'

export default function Login({ onInloggen }) {
  const [modus, setModus]           = useState('login')
  const [form, setForm]             = useState({ email: '', password: '', name: '', bevestig: '' })
  const [fout, setFout]             = useState('')
  const [laden, setLaden]           = useState(false)
  const [resetVerstuurd, setResetVerstuurd] = useState(false)

  const upd    = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const gaanaar = m => { setModus(m); setFout(''); setResetVerstuurd(false) }

  async function submit(e) {
    e.preventDefault()
    setFout('')
    if (modus === 'register' && form.password !== form.bevestig)
      return setFout('Wachtwoorden komen niet overeen')
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
    } catch (err) { setFout(err.message) }
    finally { setLaden(false) }
  }

  return (
    <div className="auth-screen">
      <div className="auth-intro">
        <div className="auth-brand"><span className="brand-symbol" aria-hidden="true">Λ</span> APEX Coach</div>
        <p className="auth-eyebrow">JOUW PERSOONLIJKE VOORUITGANG</p>
        <h1>Sterker worden.<br /><span>Op jouw tempo.</span></h1>
        <p className="auth-description">Training, voeding en herstel. Alles in balans, met een coach die met je meedenkt.</p>
        <div className="auth-orbits" aria-hidden="true"><div /><div /><div /><span>APEX<small>Vind je balans.</small></span></div>
        <div className="auth-pillars"><span>Training</span><span>Voeding</span><span>Herstel</span></div>
      </div>
      <div className="auth-panel">
      {modus === 'vergeten' && resetVerstuurd ? (
        <div className="auth-form">
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 'var(--space-3)' }}>📬</div>
            <h2 className="t-lg" style={{ marginBottom: 'var(--space-2)' }}>Check je inbox</h2>
            <p className="t-sm t-muted" style={{ marginBottom: 'var(--space-4)' }}>
              Als <strong style={{ color: 'var(--text)' }}>{form.email}</strong> bekend is, ontvang je een resetlink.
            </p>
            <button className="btn btn-ghost btn-full" onClick={() => gaanaar('login')}>
              Terug naar inloggen
            </button>
          </div>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <h2 className="t-lg" style={{ textAlign: 'center' }}>
            {modus === 'login' ? 'Welkom terug.' : modus === 'register' ? 'Jouw volgende stap.' : 'Wachtwoord vergeten'}
          </h2>
          <p className="auth-form-description">{modus === 'login' ? 'Log in en werk verder aan jouw doelen.' : modus === 'register' ? 'Maak een account aan en begin met jouw doelen.' : 'We helpen je weer op weg.'}</p>

          {fout && (
            <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(255,92,92,0.25)', borderRadius: 'var(--r-sm)', padding: 'var(--space-3) var(--space-4)', color: 'var(--red)', fontSize: 'var(--t-sm)', fontWeight: 500 }}>
              {fout}
            </div>
          )}

          {modus === 'register' && (
            <div className="form-group">
              <label htmlFor="auth-name">Naam</label>
              <input className="input" id="auth-name" type="text" value={form.name} onChange={upd('name')}
                placeholder="Jouw naam" required autoComplete="name" />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="auth-email">E-mailadres</label>
            <input className="input" id="auth-email" type="email" value={form.email} onChange={upd('email')}
              placeholder="email@domein.nl" required autoComplete="email" />
          </div>

          {modus !== 'vergeten' && (
            <div className="form-group">
              <label htmlFor="auth-password" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Wachtwoord</span>
                {modus === 'login' && (
                  <button type="button" onClick={() => gaanaar('vergeten')}
                    style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 'var(--t-xs)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Vergeten?
                  </button>
                )}
              </label>
              <input className="input" id="auth-password" type="password" value={form.password} onChange={upd('password')}
                placeholder="Minimaal 8 tekens" required
                autoComplete={modus === 'login' ? 'current-password' : 'new-password'} />
            </div>
          )}

          {modus === 'register' && (
            <div className="form-group">
              <label htmlFor="auth-confirm">Wachtwoord bevestigen</label>
              <input className="input" id="auth-confirm" type="password" value={form.bevestig} onChange={upd('bevestig')}
                placeholder="Herhaal wachtwoord" required autoComplete="new-password" />
            </div>
          )}

          {modus === 'vergeten' && (
            <p className="t-sm t-muted">
              Vul je e-mailadres in. Je ontvangt een link om een nieuw wachtwoord in te stellen.
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-full" disabled={laden}>
            {laden ? 'Bezig...' : modus === 'login' ? 'Inloggen' : modus === 'register' ? 'Account aanmaken' : 'Resetlink versturen'}
          </button>

          {modus === 'vergeten' && (
            <button type="button" className="btn btn-ghost btn-full" onClick={() => gaanaar('login')}>
              Terug naar inloggen
            </button>
          )}
        </form>
      )}

      {modus !== 'vergeten' && !resetVerstuurd && (
        <p className="t-sm t-muted" style={{ textAlign: 'center' }}>
          {modus === 'login' ? 'Nog geen account?' : 'Al een account?'}
          {' '}
          <button
            onClick={() => gaanaar(modus === 'login' ? 'register' : 'login')}
            style={{ background: 'none', border: 'none', color: 'var(--text)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', textDecoration: 'underline' }}
          >
            {modus === 'login' ? 'Registreren' : 'Inloggen'}
          </button>
        </p>
      )}
      </div>
    </div>
  )
}
