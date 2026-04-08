import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'

const vandaag = new Date().toISOString().split('T')[0]

export default function Measurements() {
  const [metingen, setMetingen] = useState([])
  const [laden, setLaden] = useState(true)
  const [toonFormulier, setToonFormulier] = useState(false)
  const [form, setForm] = useState({
    datum: vandaag,
    gewicht_kg: '',
    vetpercentage: '',
    spiermassa_kg: '',
    vetmassa_kg: '',
    bmr: '',
    bmi: '',
    viscerale_vet_score: '',
    lichaamsvocht_procent: '',
    botmassa_kg: '',
    metabolische_leeftijd: '',
    buikomvang_cm: '',
    heupomvang_cm: '',
    borstomvang_cm: '',
    notities: '',
  })
  const [opslaan, setOpslaan] = useState(false)
  const [fout, setFout] = useState('')

  useEffect(() => {
    laadMetingen()
  }, [])

  async function laadMetingen() {
    try {
      const data = await api.get('/measurements')
      setMetingen(data)
    } catch (err) {
      setFout(err.message)
    } finally {
      setLaden(false)
    }
  }

  function update(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFout('')
    setOpslaan(true)
    try {
      const payload = {}
      Object.entries(form).forEach(([k, v]) => {
        if (v !== '') payload[k] = v
      })
      const nieuw = await api.post('/measurements', payload)
      setMetingen(m => [nieuw, ...m])
      setToonFormulier(false)
      setForm({ ...form, gewicht_kg: '', vetpercentage: '', spiermassa_kg: '', vetmassa_kg: '',
        bmr: '', bmi: '', viscerale_vet_score: '', lichaamsvocht_procent: '', botmassa_kg: '',
        metabolische_leeftijd: '', buikomvang_cm: '', heupomvang_cm: '', borstomvang_cm: '', notities: '' })
    } catch (err) {
      setFout(err.message)
    } finally {
      setOpslaan(false)
    }
  }

  async function verwijder(id) {
    if (!confirm('Meting verwijderen?')) return
    await api.delete(`/measurements/${id}`)
    setMetingen(m => m.filter(x => x.id !== id))
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>📊 Metingen</h1>
          <p className="page-subtitle">Gewicht, lichaamssamenstelling en omtrekken</p>
        </div>
        <button className="btn btn-primary" onClick={() => setToonFormulier(!toonFormulier)}>
          {toonFormulier ? 'Annuleren' : '+ Meting'}
        </button>
      </div>

      {fout && <div className="alert alert-error">{fout}</div>}

      {toonFormulier && (
        <div className="card mb-4">
          <h3>Nieuwe meting</h3>
          <form onSubmit={handleSubmit} className="meting-form">
            <div className="form-row">
              <div className="form-group">
                <label>Datum</label>
                <input type="date" value={form.datum} onChange={update('datum')} required />
              </div>
              <div className="form-group">
                <label>Gewicht (kg)</label>
                <input type="number" step="0.1" min="30" max="300" value={form.gewicht_kg} onChange={update('gewicht_kg')} placeholder="75.5" />
              </div>
            </div>

            <h4 className="form-section-title">InBody / Lichaamssamenstelling</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Vetpercentage (%)</label>
                <input type="number" step="0.1" min="3" max="60" value={form.vetpercentage} onChange={update('vetpercentage')} placeholder="18.5" />
              </div>
              <div className="form-group">
                <label>Spiermassa (kg)</label>
                <input type="number" step="0.1" min="10" max="100" value={form.spiermassa_kg} onChange={update('spiermassa_kg')} placeholder="35.0" />
              </div>
              <div className="form-group">
                <label>Vetmassa (kg)</label>
                <input type="number" step="0.1" min="1" max="150" value={form.vetmassa_kg} onChange={update('vetmassa_kg')} placeholder="14.0" />
              </div>
              <div className="form-group">
                <label>BMR (kcal)</label>
                <input type="number" min="800" max="5000" value={form.bmr} onChange={update('bmr')} placeholder="1750" />
              </div>
              <div className="form-group">
                <label>BMI</label>
                <input type="number" step="0.1" min="10" max="60" value={form.bmi} onChange={update('bmi')} placeholder="23.5" />
              </div>
              <div className="form-group">
                <label>Visceraal vet</label>
                <input type="number" min="1" max="30" value={form.viscerale_vet_score} onChange={update('viscerale_vet_score')} placeholder="5" />
              </div>
              <div className="form-group">
                <label>Lichaamsvocht (%)</label>
                <input type="number" step="0.1" min="30" max="80" value={form.lichaamsvocht_procent} onChange={update('lichaamsvocht_procent')} placeholder="55.0" />
              </div>
              <div className="form-group">
                <label>Botmassa (kg)</label>
                <input type="number" step="0.1" min="1" max="10" value={form.botmassa_kg} onChange={update('botmassa_kg')} placeholder="3.0" />
              </div>
              <div className="form-group">
                <label>Metabolische leeftijd</label>
                <input type="number" min="10" max="100" value={form.metabolische_leeftijd} onChange={update('metabolische_leeftijd')} placeholder="28" />
              </div>
            </div>

            <h4 className="form-section-title">Omtrekken (cm)</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Buik</label>
                <input type="number" step="0.1" value={form.buikomvang_cm} onChange={update('buikomvang_cm')} placeholder="80" />
              </div>
              <div className="form-group">
                <label>Heup</label>
                <input type="number" step="0.1" value={form.heupomvang_cm} onChange={update('heupomvang_cm')} placeholder="95" />
              </div>
              <div className="form-group">
                <label>Borst</label>
                <input type="number" step="0.1" value={form.borstomvang_cm} onChange={update('borstomvang_cm')} placeholder="100" />
              </div>
              <div className="form-group">
                <label>Bovenbeen links</label>
                <input type="number" step="0.1" value={form.bovenbeen_links_cm} onChange={update('bovenbeen_links_cm')} placeholder="55" />
              </div>
              <div className="form-group">
                <label>Bovenbeen rechts</label>
                <input type="number" step="0.1" value={form.bovenbeen_rechts_cm} onChange={update('bovenbeen_rechts_cm')} placeholder="55" />
              </div>
              <div className="form-group">
                <label>Bovenarm links</label>
                <input type="number" step="0.1" value={form.bovenarm_links_cm} onChange={update('bovenarm_links_cm')} placeholder="32" />
              </div>
              <div className="form-group">
                <label>Bovenarm rechts</label>
                <input type="number" step="0.1" value={form.bovenarm_rechts_cm} onChange={update('bovenarm_rechts_cm')} placeholder="32" />
              </div>
            </div>

            <div className="form-group">
              <label>Notities</label>
              <textarea value={form.notities} onChange={update('notities')} placeholder="Opmerkingen..." rows="2" />
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={opslaan}>
                {opslaan ? 'Opslaan...' : 'Meting opslaan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {laden ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : metingen.length === 0 ? (
        <div className="empty-state">
          <p>📊</p>
          <p>Nog geen metingen. Voeg je eerste meting toe!</p>
        </div>
      ) : (
        <div className="metingen-list">
          {metingen.map(m => (
            <div key={m.id} className="card meting-card">
              <div className="meting-header">
                <span className="meting-datum">
                  {new Date(m.datum).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                <button className="btn-delete" onClick={() => verwijder(m.id)}>✕</button>
              </div>
              <div className="meting-stats">
                {m.gewicht_kg && <div className="meting-stat"><span>Gewicht</span><strong>{m.gewicht_kg} kg</strong></div>}
                {m.vetpercentage && <div className="meting-stat"><span>Vet%</span><strong>{m.vetpercentage}%</strong></div>}
                {m.spiermassa_kg && <div className="meting-stat"><span>Spier</span><strong>{m.spiermassa_kg} kg</strong></div>}
                {m.vetmassa_kg && <div className="meting-stat"><span>Vet</span><strong>{m.vetmassa_kg} kg</strong></div>}
                {m.bmi && <div className="meting-stat"><span>BMI</span><strong>{m.bmi}</strong></div>}
                {m.bmr && <div className="meting-stat"><span>BMR</span><strong>{m.bmr} kcal</strong></div>}
                {m.viscerale_vet_score && <div className="meting-stat"><span>Visceraal vet</span><strong>{m.viscerale_vet_score}</strong></div>}
                {m.metabolische_leeftijd && <div className="meting-stat"><span>Metab. leeftijd</span><strong>{m.metabolische_leeftijd} jr</strong></div>}
                {m.buikomvang_cm && <div className="meting-stat"><span>Buik</span><strong>{m.buikomvang_cm} cm</strong></div>}
                {m.heupomvang_cm && <div className="meting-stat"><span>Heup</span><strong>{m.heupomvang_cm} cm</strong></div>}
              </div>
              {m.notities && <p className="meting-notities">{m.notities}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
