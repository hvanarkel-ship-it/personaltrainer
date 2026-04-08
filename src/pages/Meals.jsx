import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api.js'

const vandaag = new Date().toISOString().split('T')[0]

const MAALTIJD_TYPES = ['ontbijt', 'lunch', 'diner', 'snack', 'pre_workout', 'post_workout']
const MAALTIJD_LABELS = {
  ontbijt: 'Ontbijt', lunch: 'Lunch', diner: 'Diner',
  snack: 'Snack', pre_workout: 'Pre-workout', post_workout: 'Post-workout'
}

export default function Meals() {
  const [maaltijden, setMaaltijden] = useState([])
  const [datum, setDatum] = useState(vandaag)
  const [laden, setLaden] = useState(true)
  const [toonFormulier, setToonFormulier] = useState(false)
  const [analyseResult, setAnalyseResult] = useState(null)
  const [analyseLaden, setAnalyseLaden] = useState(false)
  const [form, setForm] = useState({
    maaltijd_type: 'ontbijt',
    omschrijving: '',
    kcal: '',
    eiwitten_g: '',
    koolhydraten_g: '',
    vetten_g: '',
    vezels_g: '',
  })
  const [opslaan, setOpslaan] = useState(false)
  const [fout, setFout] = useState('')
  const fotoRef = useRef(null)

  useEffect(() => {
    laadMaaltijden()
  }, [datum])

  async function laadMaaltijden() {
    setLaden(true)
    try {
      const data = await api.get(`/meals?datum=${datum}`)
      setMaaltijden(data)
    } catch (err) {
      setFout(err.message)
    } finally {
      setLaden(false)
    }
  }

  function update(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function analyseerFoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAnalyseLaden(true)
    setAnalyseResult(null)
    try {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const base64 = ev.target.result
        const res = await api.post('/meals/analyze', {
          foto_base64: base64,
          omschrijving: form.omschrijving
        })
        setAnalyseResult(res)
        setForm(f => ({
          ...f,
          omschrijving: res.omschrijving || f.omschrijving,
          kcal: res.kcal || '',
          eiwitten_g: res.eiwitten_g || '',
          koolhydraten_g: res.koolhydraten_g || '',
          vetten_g: res.vetten_g || '',
          vezels_g: res.vezels_g || '',
        }))
        setAnalyseLaden(false)
      }
      reader.readAsDataURL(file)
    } catch (err) {
      setFout('Foto analyse mislukt: ' + err.message)
      setAnalyseLaden(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFout('')
    setOpslaan(true)
    try {
      const payload = { datum, ...form, ai_analyse: analyseResult?.analyse }
      Object.keys(payload).forEach(k => payload[k] === '' && delete payload[k])
      const nieuw = await api.post('/meals', payload)
      setMaaltijden(m => [...m, nieuw].sort((a, b) =>
        MAALTIJD_TYPES.indexOf(a.maaltijd_type) - MAALTIJD_TYPES.indexOf(b.maaltijd_type)
      ))
      setToonFormulier(false)
      setAnalyseResult(null)
      setForm({ maaltijd_type: 'ontbijt', omschrijving: '', kcal: '', eiwitten_g: '', koolhydraten_g: '', vetten_g: '', vezels_g: '' })
    } catch (err) {
      setFout(err.message)
    } finally {
      setOpslaan(false)
    }
  }

  async function verwijder(id) {
    if (!confirm('Maaltijd verwijderen?')) return
    await api.delete(`/meals/${id}`)
    setMaaltijden(m => m.filter(x => x.id !== id))
  }

  const totaal = maaltijden.reduce((s, m) => ({
    kcal: s.kcal + (m.kcal || 0),
    eiwit: s.eiwit + (parseFloat(m.eiwitten_g) || 0),
    koolhydraten: s.koolhydraten + (parseFloat(m.koolhydraten_g) || 0),
    vetten: s.vetten + (parseFloat(m.vetten_g) || 0),
  }), { kcal: 0, eiwit: 0, koolhydraten: 0, vetten: 0 })

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>🍽️ Voeding</h1>
          <p className="page-subtitle">Maaltijdtracking met AI analyse</p>
        </div>
        <button className="btn btn-primary" onClick={() => setToonFormulier(!toonFormulier)}>
          {toonFormulier ? 'Annuleren' : '+ Maaltijd'}
        </button>
      </div>

      <div className="datum-selector">
        <button className="btn btn-ghost btn-sm" onClick={() => {
          const d = new Date(datum); d.setDate(d.getDate() - 1); setDatum(d.toISOString().split('T')[0])
        }}>←</button>
        <input type="date" value={datum} onChange={e => setDatum(e.target.value)} className="datum-input" />
        <button className="btn btn-ghost btn-sm" onClick={() => {
          const d = new Date(datum); d.setDate(d.getDate() + 1); setDatum(d.toISOString().split('T')[0])
        }}>→</button>
      </div>

      {fout && <div className="alert alert-error">{fout}</div>}

      {toonFormulier && (
        <div className="card mb-4">
          <h3>Maaltijd toevoegen</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Type</label>
                <select value={form.maaltijd_type} onChange={update('maaltijd_type')}>
                  {MAALTIJD_TYPES.map(t => <option key={t} value={t}>{MAALTIJD_LABELS[t]}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Foto analyseren via AI</label>
              <div className="foto-upload">
                <input ref={fotoRef} type="file" accept="image/*" capture="environment"
                  onChange={analyseerFoto} style={{ display: 'none' }} />
                <button type="button" className="btn btn-secondary"
                  onClick={() => fotoRef.current.click()} disabled={analyseLaden}>
                  {analyseLaden ? '🔍 Analyseren...' : '📸 Foto analyseren'}
                </button>
                {analyseResult && (
                  <div className="analyse-result">
                    <span className="analyse-badge">✓ AI analyse compleet</span>
                    {analyseResult.analyse && <p className="analyse-tekst">{analyseResult.analyse}</p>}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>Omschrijving</label>
              <textarea value={form.omschrijving} onChange={update('omschrijving')}
                placeholder="Bijv. Havermout met banaan en honing" rows="2" />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Calorieën (kcal)</label>
                <input type="number" min="0" max="5000" value={form.kcal} onChange={update('kcal')} placeholder="350" />
              </div>
              <div className="form-group">
                <label>Eiwit (g)</label>
                <input type="number" step="0.1" min="0" value={form.eiwitten_g} onChange={update('eiwitten_g')} placeholder="12" />
              </div>
              <div className="form-group">
                <label>Koolhydraten (g)</label>
                <input type="number" step="0.1" min="0" value={form.koolhydraten_g} onChange={update('koolhydraten_g')} placeholder="45" />
              </div>
              <div className="form-group">
                <label>Vetten (g)</label>
                <input type="number" step="0.1" min="0" value={form.vetten_g} onChange={update('vetten_g')} placeholder="8" />
              </div>
              <div className="form-group">
                <label>Vezels (g)</label>
                <input type="number" step="0.1" min="0" value={form.vezels_g} onChange={update('vezels_g')} placeholder="5" />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={opslaan}>
                {opslaan ? 'Opslaan...' : 'Maaltijd opslaan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Dagelijkse samenvatting */}
      {maaltijden.length > 0 && (
        <div className="card dag-totaal mb-4">
          <h4>Dagelijks totaal</h4>
          <div className="macro-grid">
            <div className="macro-item"><span>Calorieën</span><strong>{totaal.kcal} kcal</strong></div>
            <div className="macro-item"><span>Eiwit</span><strong>{totaal.eiwit.toFixed(0)} g</strong></div>
            <div className="macro-item"><span>Koolhyd.</span><strong>{totaal.koolhydraten.toFixed(0)} g</strong></div>
            <div className="macro-item"><span>Vetten</span><strong>{totaal.vetten.toFixed(0)} g</strong></div>
          </div>
        </div>
      )}

      {laden ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : maaltijden.length === 0 ? (
        <div className="empty-state">
          <p>🍽️</p>
          <p>Nog geen maaltijden op {new Date(datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}.</p>
        </div>
      ) : (
        <div className="maaltijden-list">
          {MAALTIJD_TYPES.filter(t => maaltijden.some(m => m.maaltijd_type === t)).map(type => (
            <div key={type} className="maaltijd-groep">
              <h4 className="maaltijd-type-header">{MAALTIJD_LABELS[type]}</h4>
              {maaltijden.filter(m => m.maaltijd_type === type).map(m => (
                <div key={m.id} className="card maaltijd-card">
                  <div className="maaltijd-header">
                    <span className="maaltijd-naam">{m.omschrijving || 'Maaltijd'}</span>
                    <button className="btn-delete" onClick={() => verwijder(m.id)}>✕</button>
                  </div>
                  <div className="macro-grid macro-grid--small">
                    {m.kcal && <div className="macro-item"><span>kcal</span><strong>{m.kcal}</strong></div>}
                    {m.eiwitten_g && <div className="macro-item"><span>eiwit</span><strong>{m.eiwitten_g}g</strong></div>}
                    {m.koolhydraten_g && <div className="macro-item"><span>koolhyd.</span><strong>{m.koolhydraten_g}g</strong></div>}
                    {m.vetten_g && <div className="macro-item"><span>vetten</span><strong>{m.vetten_g}g</strong></div>}
                  </div>
                  {m.ai_analyse && <p className="maaltijd-analyse">{m.ai_analyse}</p>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
