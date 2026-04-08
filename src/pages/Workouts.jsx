import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'

const vandaag = new Date().toISOString().split('T')[0]

const WORKOUT_TYPES = ['kracht', 'cardio', 'hiit', 'yoga', 'sport', 'anders']
const WORKOUT_ICONS = { kracht: '🏋️', cardio: '🏃', hiit: '⚡', yoga: '🧘', sport: '⚽', anders: '🎯' }
const INTENSITEIT = ['laag', 'matig', 'hoog', 'maximaal']

export default function Workouts() {
  const [trainingen, setTrainingen] = useState([])
  const [laden, setLaden] = useState(true)
  const [toonFormulier, setToonFormulier] = useState(false)
  const [activeWorkout, setActiveWorkout] = useState(null)
  const [form, setForm] = useState({
    datum: vandaag,
    naam: '',
    type: 'kracht',
    duur_minuten: '',
    intensiteit: 'matig',
    verbrande_kcal: '',
    notities: '',
    oefeningen: [],
  })
  const [nieuweOefening, setNieuweOefening] = useState({ naam: '', sets: [{ gewicht: '', reps: '' }] })
  const [opslaan, setOpslaan] = useState(false)
  const [fout, setFout] = useState('')

  useEffect(() => {
    api.get('/workouts')
      .then(setTrainingen)
      .catch(err => setFout(err.message))
      .finally(() => setLaden(false))
  }, [])

  function update(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  function voegOefening() {
    if (!nieuweOefening.naam.trim()) return
    setForm(f => ({ ...f, oefeningen: [...f.oefeningen, { ...nieuweOefening }] }))
    setNieuweOefening({ naam: '', sets: [{ gewicht: '', reps: '' }] })
  }

  function verwijderOefening(idx) {
    setForm(f => ({ ...f, oefeningen: f.oefeningen.filter((_, i) => i !== idx) }))
  }

  function voegSet(oefeningIdx) {
    setForm(f => ({
      ...f,
      oefeningen: f.oefeningen.map((o, i) =>
        i === oefeningIdx ? { ...o, sets: [...o.sets, { gewicht: '', reps: '' }] } : o
      )
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFout('')
    setOpslaan(true)
    try {
      const payload = { ...form }
      if (!payload.naam) payload.naam = `${WORKOUT_TYPES.find(t => t === payload.type) || 'Training'} ${payload.datum}`
      Object.keys(payload).forEach(k => payload[k] === '' && delete payload[k])
      if (payload.oefeningen?.length === 0) delete payload.oefeningen
      const nieuw = await api.post('/workouts', payload)
      setTrainingen(t => [nieuw, ...t])
      setToonFormulier(false)
      setForm({ datum: vandaag, naam: '', type: 'kracht', duur_minuten: '', intensiteit: 'matig', verbrande_kcal: '', notities: '', oefeningen: [] })
    } catch (err) {
      setFout(err.message)
    } finally {
      setOpslaan(false)
    }
  }

  async function verwijder(id) {
    if (!confirm('Training verwijderen?')) return
    await api.delete(`/workouts/${id}`)
    setTrainingen(t => t.filter(x => x.id !== id))
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>💪 Trainingen</h1>
          <p className="page-subtitle">Log en volg al je workouts</p>
        </div>
        <button className="btn btn-primary" onClick={() => setToonFormulier(!toonFormulier)}>
          {toonFormulier ? 'Annuleren' : '+ Training'}
        </button>
      </div>

      {fout && <div className="alert alert-error">{fout}</div>}

      {toonFormulier && (
        <div className="card mb-4">
          <h3>Nieuwe training</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Datum</label>
                <input type="date" value={form.datum} onChange={update('datum')} required />
              </div>
              <div className="form-group">
                <label>Naam (optioneel)</label>
                <input type="text" value={form.naam} onChange={update('naam')} placeholder="Bijv. Push dag A" />
              </div>
            </div>

            <div className="workout-type-grid">
              {WORKOUT_TYPES.map(t => (
                <button key={t} type="button"
                  className={`workout-type-btn ${form.type === t ? 'active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, type: t }))}>
                  <span>{WORKOUT_ICONS[t]}</span>
                  <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                </button>
              ))}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Duur (minuten)</label>
                <input type="number" min="1" max="480" value={form.duur_minuten} onChange={update('duur_minuten')} placeholder="60" />
              </div>
              <div className="form-group">
                <label>Intensiteit</label>
                <select value={form.intensiteit} onChange={update('intensiteit')}>
                  {INTENSITEIT.map(i => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Verbrande kcal</label>
                <input type="number" min="0" max="3000" value={form.verbrande_kcal} onChange={update('verbrande_kcal')} placeholder="400" />
              </div>
            </div>

            {/* Oefeningen */}
            <div className="oefeningen-sectie">
              <h4>Oefeningen</h4>
              {form.oefeningen.map((o, i) => (
                <div key={i} className="oefening-item">
                  <div className="oefening-header">
                    <strong>{o.naam}</strong>
                    <button type="button" className="btn-delete" onClick={() => verwijderOefening(i)}>✕</button>
                  </div>
                  <div className="sets-grid">
                    {o.sets.map((s, j) => (
                      <div key={j} className="set-item">
                        <span>Set {j + 1}:</span>
                        <span>{s.gewicht ? `${s.gewicht} kg` : ''} {s.reps ? `× ${s.reps}` : ''}</span>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => voegSet(i)}>
                    + Set toevoegen
                  </button>
                </div>
              ))}

              <div className="nieuwe-oefening">
                <input
                  type="text"
                  value={nieuweOefening.naam}
                  onChange={e => setNieuweOefening(n => ({ ...n, naam: e.target.value }))}
                  placeholder="Naam oefening (bijv. Squat)"
                  className="oefening-input"
                />
                <div className="form-row">
                  <div className="form-group">
                    <label>Gewicht (kg)</label>
                    <input type="number" step="0.5" value={nieuweOefening.sets[0].gewicht}
                      onChange={e => setNieuweOefening(n => ({ ...n, sets: [{ ...n.sets[0], gewicht: e.target.value }] }))}
                      placeholder="80" />
                  </div>
                  <div className="form-group">
                    <label>Herhalingen</label>
                    <input type="number" value={nieuweOefening.sets[0].reps}
                      onChange={e => setNieuweOefening(n => ({ ...n, sets: [{ ...n.sets[0], reps: e.target.value }] }))}
                      placeholder="10" />
                  </div>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={voegOefening}>
                  + Oefening toevoegen
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Notities</label>
              <textarea value={form.notities} onChange={update('notities')} placeholder="Hoe voelde de training?" rows="2" />
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={opslaan}>
                {opslaan ? 'Opslaan...' : 'Training opslaan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {laden ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : trainingen.length === 0 ? (
        <div className="empty-state">
          <p>💪</p>
          <p>Nog geen trainingen. Log je eerste workout!</p>
        </div>
      ) : (
        <div className="trainingen-list">
          {trainingen.map(t => (
            <div key={t.id} className="card training-card">
              <div className="training-header">
                <div className="training-info">
                  <span className="training-icon">{WORKOUT_ICONS[t.type] || '🎯'}</span>
                  <div>
                    <strong>{t.naam || t.type}</strong>
                    <span className="training-datum">
                      {new Date(t.datum).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </div>
                <button className="btn-delete" onClick={() => verwijder(t.id)}>✕</button>
              </div>
              <div className="training-stats">
                {t.duur_minuten && <span className="badge">⏱ {t.duur_minuten} min</span>}
                {t.intensiteit && <span className="badge">{t.intensiteit}</span>}
                {t.verbrande_kcal && <span className="badge">🔥 {t.verbrande_kcal} kcal</span>}
              </div>
              {t.oefeningen?.length > 0 && (
                <div className="training-oefeningen">
                  {t.oefeningen.map((o, i) => (
                    <span key={i} className="oefening-tag">{o.naam}</span>
                  ))}
                </div>
              )}
              {t.notities && <p className="training-notities">{t.notities}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
