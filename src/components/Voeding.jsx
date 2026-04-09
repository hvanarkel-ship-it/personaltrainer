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
  const [bewerkenId, setBewerkenId] = useState(null)
  const [bewerkenForm, setBewerkenForm] = useState({})
  const [bewerkenLaden, setBewerkenLaden] = useState(false)
  const fotoRef = useRef(null)

  useEffect(() => {
    setLaden(true)
    setBewerkenId(null)
    api.get(`/maaltijd?datum=${datum}`)
      .then(setMaaltijden).catch(e => setFout(e.message)).finally(() => setLaden(false))
  }, [datum])

  const upd = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const updBew = k => e => setBewerkenForm(f => ({ ...f, [k]: e.target.value }))

  async function analyseerFoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAnalyseert(true); setFout('')
    try {
      const base64 = await leesBase64(file)
      const res = await api.post('/upload-analyse', { upload_type: 'maaltijd', bestanden: [{ base64, naam: file.name }] })
      if (res.succes && res.data) {
        const d = res.data
        setForm(f => ({ ...f, beschrijving: d.beschrijving || f.beschrijving, kcal: d.kcal || f.kcal, eiwit_g: d.eiwit_g || f.eiwit_g, koolhydraten_g: d.koolhydraten_g || f.koolhydraten_g, vetten_g: d.vetten_g || f.vetten_g }))
        setAiNotities(d.ai_notities || '')
      }
    } catch (err) { setFout('Analyse mislukt: ' + err.message) }
    finally { setAnalyseert(false); e.target.value = '' }
  }

  function leesBase64(file) {
    return new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsDataURL(file) })
  }

  async function submit(e) {
    e.preventDefault(); setOpslaan(true)
    try {
      const payload = { datum, ...Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '')), ai_notities: aiNotities || undefined }
      const nieuw = await api.post('/maaltijd', payload)
      setMaaltijden(m => [...m, nieuw])
      setToonForm(false); setAiNotities('')
      setForm({ maaltijd_type: 'ontbijt', beschrijving: '', kcal: '', eiwit_g: '', koolhydraten_g: '', vetten_g: '' })
    } catch (err) { setFout(err.message) }
    finally { setOpslaan(false) }
  }

  function startBewerken(m) {
    setBewerkenId(m.id)
    setBewerkenForm({ maaltijd_type: m.maaltijd_type || 'snack', beschrijving: m.beschrijving || '', kcal: m.kcal ?? '', eiwit_g: m.eiwit_g ?? '', koolhydraten_g: m.koolhydraten_g ?? '', vetten_g: m.vetten_g ?? '' })
  }

  async function slaBewerkenOp(id) {
    setBewerkenLaden(true)
    try {
      const bijgewerkt = await api.put(`/maaltijd/${id}`, bewerkenForm)
      setMaaltijden(m => m.map(x => x.id === id ? { ...x, ...bijgewerkt } : x))
      setBewerkenId(null)
    } catch (err) { setFout(err.message) }
    finally { setBewerkenLaden(false) }
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

  const isVandaag = datum === vandaagStr()

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>🍽️ Voeding</h1><p className="subtitle">Maaltijdtracking & macro's</p></div>
        <button className="btn btn-primary" onClick={() => { setToonForm(!toonForm); setBewerkenId(null) }}>
          {toonForm ? 'Annuleer' : '+ Maaltijd'}
        </button>
      </div>

      {/* Datum navigator */}
      <div className="datum-nav">
        <button className="icon-btn" onClick={() => { const d = new Date(datum); d.setDate(d.getDate() - 1); setDatum(d.toISOString().split('T')[0]) }}>‹</button>
        <input type="date" value={datum} onChange={e => setDatum(e.target.value)} className="datum-input" />
        <button className="icon-btn" onClick={() => { const d = new Date(datum); d.setDate(d.getDate() + 1); setDatum(d.toISOString().split('T')[0]) }} disabled={isVandaag}>›</button>
      </div>

      {fout && <div className="alert alert-error">{fout}</div>}

      {/* Dagtotaal */}
      {maaltijden.length > 0 && (
        <div className="card dagtotaal-card">
          <h3>Dagtotaal</h3>
          <div className="dagtotaal-grid">
            <DagBlok waarde={totaal.kcal} label="kcal" kleur="" />
            <DagBlok waarde={Math.round(totaal.eiwit)} label="g eiwit" kleur="groen" />
            <DagBlok waarde={Math.round(totaal.kh)} label="g koolhyd." kleur="blauw" />
            <DagBlok waarde={Math.round(totaal.vet)} label="g vet" kleur="oranje" />
          </div>
        </div>
      )}

      {/* Nieuw maaltijd formulier */}
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
              <input value={form.beschrijving} onChange={upd('beschrijving')} placeholder="Bijv. Havermout met banaan en whey" />
            </div>
            <div className="macro-invoer-grid">
              <div className="form-group">
                <label>Kcal</label>
                <input type="number" value={form.kcal} onChange={upd('kcal')} placeholder="350" />
              </div>
              <div className="form-group">
                <label>Eiwit (g)</label>
                <input type="number" step="0.1" value={form.eiwit_g} onChange={upd('eiwit_g')} placeholder="25" />
              </div>
              <div className="form-group">
                <label>Koolhyd. (g)</label>
                <input type="number" step="0.1" value={form.koolhydraten_g} onChange={upd('koolhydraten_g')} placeholder="45" />
              </div>
              <div className="form-group">
                <label>Vet (g)</label>
                <input type="number" step="0.1" value={form.vetten_g} onChange={upd('vetten_g')} placeholder="8" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={opslaan}>
              {opslaan ? 'Opslaan...' : 'Maaltijd opslaan'}
            </button>
          </form>
        </div>
      )}

      {/* Maaltijdlijst */}
      {laden ? <div className="center-loader"><div className="spinner" /></div> :
        maaltijden.length === 0 ? (
          <div className="leeg-staat">
            <p>🍽️</p>
            <p>Nog geen maaltijden op {new Date(datum + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}.</p>
            <button className="btn btn-secondary" onClick={() => onNavigeer('coach')}>Upload via Coach →</button>
          </div>
        ) : (
          <div className="lijst">
            {TYPES.filter(t => maaltijden.some(m => m.maaltijd_type === t)).map(type => (
              <div key={type}>
                <div className="sectie-titel">{type.charAt(0).toUpperCase() + type.slice(1)}</div>
                {maaltijden.filter(m => m.maaltijd_type === type).map(m => (
                  <div key={m.id} className="card maaltijd-kaart">
                    {bewerkenId === m.id ? (
                      /* ── Inline edit formulier ── */
                      <div>
                        <div className="type-keuze" style={{ marginBottom: 10 }}>
                          {TYPES.map(t => (
                            <button key={t} type="button" className={`type-btn ${bewerkenForm.maaltijd_type === t ? 'active' : ''}`}
                              onClick={() => setBewerkenForm(f => ({ ...f, maaltijd_type: t }))}>
                              {t}
                            </button>
                          ))}
                        </div>
                        <div className="form-group">
                          <label>Beschrijving</label>
                          <input value={bewerkenForm.beschrijving} onChange={updBew('beschrijving')} placeholder="Naam van de maaltijd" />
                        </div>
                        <div className="macro-invoer-grid">
                          <div className="form-group">
                            <label>Kcal</label>
                            <input type="number" value={bewerkenForm.kcal} onChange={updBew('kcal')} />
                          </div>
                          <div className="form-group">
                            <label>Eiwit (g)</label>
                            <input type="number" step="0.1" value={bewerkenForm.eiwit_g} onChange={updBew('eiwit_g')} />
                          </div>
                          <div className="form-group">
                            <label>Koolhyd. (g)</label>
                            <input type="number" step="0.1" value={bewerkenForm.koolhydraten_g} onChange={updBew('koolhydraten_g')} />
                          </div>
                          <div className="form-group">
                            <label>Vet (g)</label>
                            <input type="number" step="0.1" value={bewerkenForm.vetten_g} onChange={updBew('vetten_g')} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => slaBewerkenOp(m.id)} disabled={bewerkenLaden}>
                            {bewerkenLaden ? 'Opslaan...' : 'Opslaan'}
                          </button>
                          <button className="btn btn-ghost" onClick={() => setBewerkenId(null)}>Annuleer</button>
                        </div>
                      </div>
                    ) : (
                      /* ── Weergave ── */
                      <div>
                        <div className="maaltijd-kop">
                          <span className="maaltijd-naam">{m.beschrijving || 'Maaltijd'}</span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="icon-btn sm" onClick={() => startBewerken(m)} title="Bewerken">✏️</button>
                            <button className="verwijder-btn" onClick={() => verwijder(m.id)}>×</button>
                          </div>
                        </div>
                        <div className="maaltijd-macros">
                          {m.kcal != null && <MacroTag waarde={m.kcal} label="kcal" />}
                          {m.eiwit_g != null && <MacroTag waarde={parseFloat(m.eiwit_g)} label="g eiwit" kleur="groen" />}
                          {m.koolhydraten_g != null && <MacroTag waarde={parseFloat(m.koolhydraten_g)} label="g kh" kleur="blauw" />}
                          {m.vetten_g != null && <MacroTag waarde={parseFloat(m.vetten_g)} label="g vet" kleur="oranje" />}
                        </div>
                        {m.ai_notities && <p className="ai-feedback klein">{m.ai_notities}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}

            {/* Maaltijden zonder type */}
            {maaltijden.filter(m => !m.maaltijd_type || !TYPES.includes(m.maaltijd_type)).map(m => (
              <div key={m.id} className="card maaltijd-kaart">
                <div className="maaltijd-kop">
                  <span className="maaltijd-naam">{m.beschrijving || 'Maaltijd'}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="icon-btn sm" onClick={() => startBewerken(m)}>✏️</button>
                    <button className="verwijder-btn" onClick={() => verwijder(m.id)}>×</button>
                  </div>
                </div>
                <div className="maaltijd-macros">
                  {m.kcal != null && <MacroTag waarde={m.kcal} label="kcal" />}
                  {m.eiwit_g != null && <MacroTag waarde={parseFloat(m.eiwit_g)} label="g eiwit" kleur="groen" />}
                  {m.koolhydraten_g != null && <MacroTag waarde={parseFloat(m.koolhydraten_g)} label="g kh" kleur="blauw" />}
                  {m.vetten_g != null && <MacroTag waarde={parseFloat(m.vetten_g)} label="g vet" kleur="oranje" />}
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  )
}

function MacroTag({ waarde, label, kleur }) {
  const stijlen = {
    groen: { background: '#f0fdf4', color: '#166534' },
    blauw: { background: '#eff6ff', color: '#1e40af' },
    oranje: { background: '#fff7ed', color: '#9a3412' },
  }
  return (
    <span className="macro-tag" style={stijlen[kleur] || {}}>
      <strong>{Number.isInteger(waarde) ? waarde : waarde.toFixed(1)}</strong> {label}
    </span>
  )
}

function DagBlok({ waarde, label, kleur }) {
  const stijlen = {
    groen: 'macro-blok--groen',
    blauw: 'macro-blok--blauw',
    oranje: 'macro-blok--oranje',
  }
  return (
    <div className={`macro-blok ${stijlen[kleur] || ''}`}>
      <strong>{Number.isInteger(waarde) ? waarde : waarde.toFixed(1)}</strong>
      <span>{label}</span>
    </div>
  )
}
