import { useState, useEffect } from 'react'
import { api } from '../api.js'

const SPORTEN_OPTIES = ['fitness', 'padel', 'fietsen', 'hardlopen', 'zwemmen', 'yoga', 'tennis', 'voetbal']

export default function Profiel({ user, onUitloggen }) {
  const [form, setForm] = useState({
    name: user.name || '', geboortejaar: '', lengte_cm: '', gewicht_kg: '',
    doel_kcal: 2400, doel_eiwit_g: 160, doel_koolhydraten_g: 250, doel_vetten_g: 80,
    sporten: ['fitness', 'padel', 'fietsen']
  })
  const [laden, setLaden] = useState(true)
  const [opslaan, setOpslaan] = useState(false)
  const [succes, setSucces] = useState(false)
  const [fout, setFout] = useState('')

  useEffect(() => {
    api.get('/profiel').then(d => {
      if (d) setForm(f => ({
        ...f,
        name: d.name || f.name,
        geboortejaar: d.geboortejaar || '',
        lengte_cm: d.lengte_cm || '',
        gewicht_kg: d.gewicht_kg || '',
        doel_kcal: d.doel_kcal || 2400,
        doel_eiwit_g: d.doel_eiwit_g || 160,
        doel_koolhydraten_g: d.doel_koolhydraten_g || 250,
        doel_vetten_g: d.doel_vetten_g || 80,
        sporten: d.sporten || ['fitness', 'padel', 'fietsen'],
      }))
    }).catch(console.error).finally(() => setLaden(false))
  }, [])

  const upd = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  function toggleSport(s) {
    setForm(f => ({
      ...f,
      sporten: f.sporten.includes(s) ? f.sporten.filter(x => x !== s) : [...f.sporten, s]
    }))
  }

  async function submit(e) {
    e.preventDefault()
    setFout('')
    setSucces(false)
    setOpslaan(true)
    try {
      await api.put('/profiel', form)
      setSucces(true)
      setTimeout(() => setSucces(false), 3000)
    } catch (err) { setFout(err.message) }
    finally { setOpslaan(false) }
  }

  if (laden) return <div className="page page-loading"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>👤 Profiel</h1><p className="subtitle">Jouw gegevens & voorkeuren</p></div>
        <button className="btn btn-ghost" onClick={onUitloggen}>Uitloggen</button>
      </div>

      {fout && <div className="alert alert-error">{fout}</div>}
      {succes && <div className="alert alert-success">✓ Opgeslagen!</div>}

      <form onSubmit={submit}>
        <div className="card mb">
          <h3>Persoonlijk</h3>
          <div className="form-rij">
            <div className="form-group"><label>Naam</label><input type="text" value={form.name} onChange={upd('name')} /></div>
            <div className="form-group"><label>Geboortejaar</label><input type="number" min="1940" max="2010" value={form.geboortejaar} onChange={upd('geboortejaar')} placeholder="1990" /></div>
          </div>
          <div className="form-rij">
            <div className="form-group"><label>Lengte (cm)</label><input type="number" min="100" max="250" value={form.lengte_cm} onChange={upd('lengte_cm')} placeholder="180" /></div>
            <div className="form-group"><label>Gewicht (kg)</label><input type="number" step="0.1" value={form.gewicht_kg} onChange={upd('gewicht_kg')} placeholder="80" /></div>
          </div>
        </div>

        <div className="card mb">
          <h3>Macro-doelen per dag</h3>
          <div className="form-rij">
            <div className="form-group"><label>Calorieën (kcal)</label><input type="number" value={form.doel_kcal} onChange={upd('doel_kcal')} /></div>
            <div className="form-group"><label>Eiwit (g)</label><input type="number" value={form.doel_eiwit_g} onChange={upd('doel_eiwit_g')} /></div>
            <div className="form-group"><label>Koolhydraten (g)</label><input type="number" value={form.doel_koolhydraten_g} onChange={upd('doel_koolhydraten_g')} /></div>
            <div className="form-group"><label>Vetten (g)</label><input type="number" value={form.doel_vetten_g} onChange={upd('doel_vetten_g')} /></div>
          </div>
        </div>

        <div className="card mb">
          <h3>Actieve sporten</h3>
          <div className="sport-checkboxes">
            {SPORTEN_OPTIES.map(s => (
              <label key={s} className={`sport-check ${form.sporten.includes(s) ? 'active' : ''}`}>
                <input type="checkbox" checked={form.sporten.includes(s)} onChange={() => toggleSport(s)} />
                <span>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
              </label>
            ))}
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-full" disabled={opslaan}>
          {opslaan ? 'Opslaan...' : 'Profiel opslaan'}
        </button>
      </form>
    </div>
  )
}
