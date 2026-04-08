import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'

const TYPES = ['ontbijt', 'lunch', 'diner', 'snack', 'pre-workout', 'post-workout']
const vandaagStr = () => new Date().toISOString().split('T')[0]

export default function Voeding({ onNavigeer }) {
  const [datum, setDatum] = useState(vandaagStr())
  const [maaltijden, setMaaltijden] = useState([])
  const [laden, setLaden] = useState(true)
  const [toonForm, setToonForm] = useState(false)
  const [analyseert, setAnalyseert] = useState(false)
  const [form, setForm] = useState({ maaltijd_type: 'ontbijt', beschrijving: '', kcal: '', eiwit_g: '', koolhydraten_g: '', vetten_g: '' })
  const [aiNotities, setAiNotities] = useState('')
  const [opslaan, setOpslaan] = useState(false)
  const [fout, setFout] = useState('')
  const fotoRef = useRef(null)

  useEffect(() => {
    setLaden(true)
    api.get(`/maaltijd?datum=${datum}`)
      .then(setMaaltijden).catch(e => setFout(e.message)).finally(() => setLaden(false))
  }, [datum])

  const upd = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function analyseerFoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAnalyseert(true)
    setFout('')
    try {
      const base64 = await new Promise(res => { const r = new FileReader(); r.onload = ev => res(ev.target.result); r.readAsDataURL(file) })
      const res = await api.post('/upload-analyse', {
        upload_type: 'maaltijd',
        bestanden: [{ base64, naam: file.name }]
      })
      if (res.succes && res.data) {
        const d = res.data
        setForm(f => ({
          ...f,
          beschrijving: d.beschrijving || f.beschrijving,
          kcal: d.kcal || f.kcal,
          eiwit_g: d.eiwit_g || f.eiwit_g,
          koolhydraten_g: d.koolhydraten_g || f.koolhydraten_g,
          vetten_g: d.vetten_g || f.vetten_g,
        }))
        setAiNotities(d.ai_notities || '')
      }
    } catch (err) { setFout('Analyse mislukt: ' + err.message) }
    finally { setAnalyseert(false); e.target.value = '' }
  }

  async function submit(e) {
    e.preventDefault()
    setOpslaan(true)
    try {
      const payload = { datum, ...Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '')), ai_notities: aiNotities || undefined }
      const nieuw = await api.post('/maaltijd', payload)
      setMaaltijden(m => [...m, nieuw])
      setToonForm(false)
      setAiNotities('')
      setForm({ maaltijd_type: 'ontbijt', beschrijving: '', kcal: '', eiwit_g: '', koolhydraten_g: '', vetten_g: '' })
    } catch (err) { setFout(err.message) }
    finally { setOpslaan(false) }
  }

  async function verwijder(id) {
    if (!confirm('Maaltijd verwijderen?')) return
    await api.delete(`/maaltijd/${id}`)
    setMaaltijden(m => m.filter(x => x.id !== id))
  }

  const totaal = maaltijden.reduce((s, m) => ({
    kcal: s.kcal + (m.kcal || 0),
    eiwit: s.eiwit + (parseFloat(m.eiwit_g) || 0),
    kh: s.kh + (parseFloat(m.koolhydraten_g) || 0),
    vet: s.vet + (parseFloat(m.vetten_g) || 0),
  }), { kcal: 0, eiwit: 0, kh: 0, vet: 0 })

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>🍽️ Voeding</h1><p className="subtitle">Dagelijkse maaltijdtracking</p></div>
        <button className="btn btn-primary" onClick={() => setToonForm(!toonForm)}>
          {toonForm ? 'Annuleer' : '+ Maaltijd'}
        </button>
      </div>

      <div className="datum-nav">
        <button className="icon-btn" onClick={() => { const d = new Date(datum); d.setDate(d.getDate()-1); setDatum(d.toISOString().split('T')[0]) }}>‹</button>
        <input type="date" value={datum} onChange={e => setDatum(e.target.value)} className="datum-input" />
        <button className="icon-btn" onClick={() => { const d = new Date(datum); d.setDate(d.getDate()+1); setDatum(d.toISOString().split('T')[0]) }}>›</button>
      </div>

      {fout && <div className="alert alert-error">{fout}</div>}

      {/* Dagelijks totaal */}
      {maaltijden.length > 0 && (
        <div className="card macro-totaal">
          <div className="macro-blokken">
            <div className="macro-blok"><strong>{totaal.kcal}</strong><span>kcal</span></div>
            <div className="macro-blok macro-blok--groen"><strong>{Math.round(totaal.eiwit)}g</strong><span>eiwit</span></div>
            <div className="macro-blok macro-blok--blauw"><strong>{Math.round(totaal.kh)}g</strong><span>koolhyd.</span></div>
            <div className="macro-blok macro-blok--oranje"><strong>{Math.round(totaal.vet)}g</strong><span>vetten</span></div>
          </div>
        </div>
      )}

      {toonForm && (
        <div className="card">
          <h3>Maaltijd toevoegen</h3>
          <form onSubmit={submit}>
            <div className="type-keuze">
              {TYPES.map(t => (
                <button key={t} type="button" className={`type-btn ${form.maaltijd_type === t ? 'active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, maaltijd_type: t }))}>
                  {t}
                </button>
              ))}
            </div>

            <div className="foto-sectie">
              <input ref={fotoRef} type="file" accept="image/*" capture="environment" onChange={analyseerFoto} style={{ display: 'none' }} />
              <button type="button" className="btn btn-secondary" onClick={() => fotoRef.current.click()} disabled={analyseert}>
                {analyseert ? '🔍 Analyseren...' : '📸 Foto analyseren'}
              </button>
              {aiNotities && <div className="ai-feedback">{aiNotities}</div>}
            </div>

            <div className="form-group">
              <label>Beschrijving</label>
              <textarea value={form.beschrijving} onChange={upd('beschrijving')} rows="2" placeholder="Bijv. Havermout met banaan" />
            </div>

            <div className="form-rij">
              <div className="form-group"><label>Calorieën</label><input type="number" value={form.kcal} onChange={upd('kcal')} placeholder="350" /></div>
              <div className="form-group"><label>Eiwit (g)</label><input type="number" step="0.1" value={form.eiwit_g} onChange={upd('eiwit_g')} placeholder="25" /></div>
              <div className="form-group"><label>Koolhydr. (g)</label><input type="number" step="0.1" value={form.koolhydraten_g} onChange={upd('koolhydraten_g')} placeholder="45" /></div>
              <div className="form-group"><label>Vetten (g)</label><input type="number" step="0.1" value={form.vetten_g} onChange={upd('vetten_g')} placeholder="8" /></div>
            </div>

            <div className="tip-tip">
              💡 Of stuur een foto naar de <button type="button" className="link-btn" onClick={() => onNavigeer('coach')}>AI Coach</button> voor uitgebreide analyse.
            </div>

            <button type="submit" className="btn btn-primary" disabled={opslaan}>
              {opslaan ? 'Opslaan...' : 'Maaltijd opslaan'}
            </button>
          </form>
        </div>
      )}

      {laden ? <div className="center-loader"><div className="spinner" /></div> :
        maaltijden.length === 0 ? (
          <div className="leeg-staat"><p>🍽️</p><p>Nog geen maaltijden op {new Date(datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}.</p></div>
        ) : (
          <div className="lijst">
            {TYPES.filter(t => maaltijden.some(m => m.maaltijd_type === t)).map(type => (
              <div key={type}>
                <h4 className="maaltijd-type-kop">{type.charAt(0).toUpperCase() + type.slice(1)}</h4>
                {maaltijden.filter(m => m.maaltijd_type === type).map(m => (
                  <div key={m.id} className="card maaltijd-kaart">
                    <div className="maaltijd-kop">
                      <span className="maaltijd-naam">{m.beschrijving || 'Maaltijd'}</span>
                      <button className="verwijder-btn" onClick={() => verwijder(m.id)}>×</button>
                    </div>
                    <div className="macro-blokken macro-blokken--klein">
                      {m.kcal && <div className="macro-blok"><strong>{m.kcal}</strong><span>kcal</span></div>}
                      {m.eiwit_g && <div className="macro-blok macro-blok--groen"><strong>{m.eiwit_g}g</strong><span>eiwit</span></div>}
                      {m.koolhydraten_g && <div className="macro-blok macro-blok--blauw"><strong>{m.koolhydraten_g}g</strong><span>kh</span></div>}
                      {m.vetten_g && <div className="macro-blok macro-blok--oranje"><strong>{m.vetten_g}g</strong><span>vet</span></div>}
                    </div>
                    {m.ai_notities && <p className="ai-feedback klein">{m.ai_notities}</p>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      }
    </div>
  )
}
