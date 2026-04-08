import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'

const DOELEN = [
  { value: 'afvallen', label: 'Afvallen' },
  { value: 'spiermassa', label: 'Spiermassa opbouwen' },
  { value: 'conditie', label: 'Conditie verbeteren' },
  { value: 'onderhoud', label: 'Op gewicht blijven' },
]

const ACTIVITEIT = [
  { value: 'sedentair', label: 'Sedentair (nauwelijks bewegen)' },
  { value: 'licht', label: 'Licht actief (1-3 dagen/week)' },
  { value: 'matig', label: 'Matig actief (3-5 dagen/week)' },
  { value: 'actief', label: 'Actief (6-7 dagen/week)' },
  { value: 'zeer_actief', label: 'Zeer actief (meerdere keren/dag)' },
]

const COACH_STIJLEN = [
  { value: 'motiverend', label: 'Motiverend & enthousiast' },
  { value: 'streng', label: 'Streng & direct' },
  { value: 'vriendelijk', label: 'Vriendelijk & empathisch' },
  { value: 'wetenschappelijk', label: 'Wetenschappelijk & analytisch' },
]

const DIEET_OPTIES = ['vegetarisch', 'veganistisch', 'glutenvrij', 'lactosevrij', 'keto', 'paleo', 'halal', 'kosher']

export default function Settings() {
  const [form, setForm] = useState({
    naam: '',
    geboortedatum: '',
    geslacht: '',
    lengte_cm: '',
    doel: '',
    activiteits_niveau: '',
    doelgewicht_kg: '',
    dagelijks_calorie_doel: '',
    dagelijks_eiwitdoel_g: '',
    dieet_wensen: [],
    allergenen: '',
    coach_naam: 'APEX',
    coach_stijl: 'motiverend',
  })
  const [laden, setLaden] = useState(true)
  const [opslaan, setOpslaan] = useState(false)
  const [succes, setSucces] = useState(false)
  const [fout, setFout] = useState('')

  useEffect(() => {
    api.get('/settings')
      .then(data => {
        if (data) {
          setForm(f => ({
            ...f,
            naam: data.naam || '',
            geboortedatum: data.geboortedatum ? data.geboortedatum.split('T')[0] : '',
            geslacht: data.geslacht || '',
            lengte_cm: data.lengte_cm || '',
            doel: data.doel || '',
            activiteits_niveau: data.activiteits_niveau || '',
            doelgewicht_kg: data.doelgewicht_kg || '',
            dagelijks_calorie_doel: data.dagelijks_calorie_doel || '',
            dagelijks_eiwitdoel_g: data.dagelijks_eiwitdoel_g || '',
            dieet_wensen: data.dieet_wensen || [],
            allergenen: (data.allergenen || []).join(', '),
            coach_naam: data.coach_naam || 'APEX',
            coach_stijl: data.coach_stijl || 'motiverend',
          }))
        }
      })
      .catch(console.error)
      .finally(() => setLaden(false))
  }, [])

  function update(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  function toggleDieet(waarde) {
    setForm(f => ({
      ...f,
      dieet_wensen: f.dieet_wensen.includes(waarde)
        ? f.dieet_wensen.filter(d => d !== waarde)
        : [...f.dieet_wensen, waarde]
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFout('')
    setSucces(false)
    setOpslaan(true)
    try {
      const payload = { ...form }
      if (payload.allergenen) {
        payload.allergenen = payload.allergenen.split(',').map(s => s.trim()).filter(Boolean)
      } else {
        payload.allergenen = []
      }
      Object.keys(payload).forEach(k => payload[k] === '' && delete payload[k])
      await api.put('/settings', payload)
      setSucces(true)
      setTimeout(() => setSucces(false), 3000)
    } catch (err) {
      setFout(err.message)
    } finally {
      setOpslaan(false)
    }
  }

  if (laden) return <div className="page-loading"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>⚙️ Instellingen</h1>
          <p className="page-subtitle">Jouw profiel en voorkeuren</p>
        </div>
      </div>

      {fout && <div className="alert alert-error">{fout}</div>}
      {succes && <div className="alert alert-success">✓ Instellingen opgeslagen!</div>}

      <form onSubmit={handleSubmit} className="settings-form">

        <div className="card mb-4">
          <h3>Persoonlijke gegevens</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Naam</label>
              <input type="text" value={form.naam} onChange={update('naam')} placeholder="Jouw naam" />
            </div>
            <div className="form-group">
              <label>Geboortedatum</label>
              <input type="date" value={form.geboortedatum} onChange={update('geboortedatum')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Geslacht</label>
              <select value={form.geslacht} onChange={update('geslacht')}>
                <option value="">Selecteer...</option>
                <option value="man">Man</option>
                <option value="vrouw">Vrouw</option>
                <option value="anders">Anders</option>
              </select>
            </div>
            <div className="form-group">
              <label>Lengte (cm)</label>
              <input type="number" min="100" max="250" value={form.lengte_cm} onChange={update('lengte_cm')} placeholder="175" />
            </div>
          </div>
        </div>

        <div className="card mb-4">
          <h3>Fitness doelen</h3>
          <div className="form-group">
            <label>Primair doel</label>
            <div className="doel-grid">
              {DOELEN.map(d => (
                <button key={d.value} type="button"
                  className={`doel-btn ${form.doel === d.value ? 'active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, doel: d.value }))}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Activiteitsniveau</label>
            <select value={form.activiteits_niveau} onChange={update('activiteits_niveau')}>
              <option value="">Selecteer...</option>
              {ACTIVITEIT.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Doelgewicht (kg)</label>
              <input type="number" step="0.1" min="30" max="300" value={form.doelgewicht_kg}
                onChange={update('doelgewicht_kg')} placeholder="75" />
            </div>
            <div className="form-group">
              <label>Calorie doel (kcal/dag)</label>
              <input type="number" min="800" max="8000" value={form.dagelijks_calorie_doel}
                onChange={update('dagelijks_calorie_doel')} placeholder="2200" />
            </div>
            <div className="form-group">
              <label>Eiwit doel (g/dag)</label>
              <input type="number" min="20" max="500" value={form.dagelijks_eiwitdoel_g}
                onChange={update('dagelijks_eiwitdoel_g')} placeholder="160" />
            </div>
          </div>
        </div>

        <div className="card mb-4">
          <h3>Voedingsvoorkeuren</h3>
          <div className="form-group">
            <label>Dieetwensen</label>
            <div className="checkbox-grid">
              {DIEET_OPTIES.map(d => (
                <label key={d} className="checkbox-item">
                  <input type="checkbox" checked={form.dieet_wensen.includes(d)} onChange={() => toggleDieet(d)} />
                  <span>{d.charAt(0).toUpperCase() + d.slice(1)}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Allergenen (kommagescheiden)</label>
            <input type="text" value={form.allergenen} onChange={update('allergenen')}
              placeholder="bijv. noten, schaaldieren" />
          </div>
        </div>

        <div className="card mb-4">
          <h3>Coach instellingen</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Coach naam</label>
              <input type="text" value={form.coach_naam} onChange={update('coach_naam')} placeholder="APEX" maxLength={50} />
            </div>
          </div>
          <div className="form-group">
            <label>Coach stijl</label>
            <div className="coach-stijl-grid">
              {COACH_STIJLEN.map(s => (
                <button key={s.value} type="button"
                  className={`doel-btn ${form.coach_stijl === s.value ? 'active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, coach_stijl: s.value }))}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={opslaan}>
            {opslaan ? 'Opslaan...' : 'Instellingen opslaan'}
          </button>
        </div>
      </form>
    </div>
  )
}
