import { useState } from 'react'
import { api } from '../api.js'

export default function WachtwoordReset({ token, onInloggen }) {
  const [form, setForm]   = useState({ password: '', bevestig: '' })
  const [fout, setFout]   = useState('')
  const [laden, setLaden] = useState(false)

  const upd = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setFout('')
    if (form.password.length < 8) return setFout('Wachtwoord minimaal 8 tekens')
    if (form.password !== form.bevestig) return setFout('Wachtwoorden komen niet overeen')
    setLaden(true)
    try {
      const data = await api.post('/auth-reset-confirm', { token, password: form.password })
      onInloggen(data.token, data.user)
    } catch (err) { setFout(err.message) }
    finally { setLaden(false) }
  }

  return (
    <div className="auth-screen">
      <div className="auth-logo">⚡</div>
      <div style={{ textAlign: 'center' }}>
        <h1 className="t-xl">APEX Coach</h1>
        <p className="t-sm t-muted" style={{ marginTop: 4 }}>Nieuw wachtwoord instellen</p>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <h2 className="t-lg" style={{ textAlign: 'center' }}>Nieuw wachtwoord</h2>

        {fout && (
          <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(255,92,92,0.25)', borderRadius: 'var(--r-sm)', padding: 'var(--space-3) var(--space-4)', color: 'var(--red)', fontSize: 'var(--t-sm)', fontWeight: 500 }}>
            {fout}
          </div>
        )}

        <div className="form-group">
          <label>Nieuw wachtwoord</label>
          <input className="input" type="password" value={form.password} onChange={upd('password')}
            placeholder="Minimaal 8 tekens" required autoComplete="new-password" autoFocus />
        </div>
        <div className="form-group">
          <label>Wachtwoord bevestigen</label>
          <input className="input" type="password" value={form.bevestig} onChange={upd('bevestig')}
            placeholder="Herhaal wachtwoord" required autoComplete="new-password" />
        </div>

        <button type="submit" className="btn btn-primary btn-full" disabled={laden}>
          {laden ? 'Opslaan...' : 'Wachtwoord opslaan'}
        </button>
      </form>
    </div>
  )
}
