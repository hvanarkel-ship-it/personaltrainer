import { useState, useEffect, useRef } from 'react'
import { api, datumStr, datumNl } from '../api.js'

export default function Lichaam({ onNavigeer }) {
  const [metingen, setMetingen] = useState([])
  const [laden, setLaden] = useState(true)
  const [toonForm, setToonForm] = useState(false)
  const [analyseert, setAnalyseert] = useState(false)
  const [form, setForm] = useState({
    datum: datumStr(new Date()),
    gewicht_kg: '', vetmassa_kg: '', vetpercentage: '',
    spiermassa_kg: '', visceraal_vet: '', bmr_kcal: '', vochtbalans_pct: '',
    inbody_score: '', notities: ''
  })
  const [opslaan, setOpslaan] = useState(false)
  const [fout, setFout] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    api.get('/inbody').then(setMetingen).catch(e => setFout(e.message)).finally(() => setLaden(false))
  }, [])

  const upd = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function analyseerBestand(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAnalyseert(true)
    setFout('')
    try {
      const base64 = await new Promise(res => { const r = new FileReader(); r.onload = ev => res(ev.target.result); r.readAsDataURL(file) })
      const res = await api.post('/upload-analyse', {
        upload_type: 'inbody',
        bestanden: [{ base64, naam: file.name }]
      })
      if (res.succes && res.data) {
        const d = res.data
        setForm(f => ({
          ...f,
          gewicht_kg: d.gewicht_kg || f.gewicht_kg,
          vetmassa_kg: d.vetmassa_kg || f.vetmassa_kg,
          vetpercentage: d.vetpercentage || f.vetpercentage,
          spiermassa_kg: d.spiermassa_kg || f.spiermassa_kg,
          visceraal_vet: d.visceraal_vet || f.visceraal_vet,
          bmr_kcal: d.bmr_kcal || f.bmr_kcal,
          vochtbalans_pct: d.vochtbalans_pct || f.vochtbalans_pct,
          inbody_score: d.inbody_score || f.inbody_score,
          notities: d.notities || f.notities,
        }))
      }
    } catch (err) { setFout('Analyse mislukt: ' + err.message) }
    finally { setAnalyseert(false); e.target.value = '' }
  }

  async function submit(e) {
    e.preventDefault()
    setFout('')
    setOpslaan(true)
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''))
      const nieuw = await api.post('/inbody', payload)
      setMetingen(m => [nieuw, ...m])
      setToonForm(false)
    } catch (err) { setFout(err.message) }
    finally { setOpslaan(false) }
  }

  async function verwijder(id) {
    if (!confirm('Meting verwijderen?')) return
    try {
      await api.delete(`/inbody/${id}`)
      setMetingen(m => m.filter(x => x.id !== id))
    } catch (err) { setFout('Verwijderen mislukt: ' + err.message) }
  }

  const laatste = metingen[0]
  const vorige = metingen[1]

  // delta: positief getal = waarde is gestegen
  // laagIsGoed=true: daling is groen (vet, gewicht, visceraal)
  // laagIsGoed=false: stijging is groen (spiermassa, score)
  function delta(veld, laagIsGoed = true) {
    if (!laatste?.[veld] || !vorige?.[veld]) return null
    const d = parseFloat(laatste[veld]) - parseFloat(vorige[veld])
    if (Math.abs(d) < 0.05) return null
    return {
      waarde: Math.abs(d).toFixed(1),
      richting: d > 0 ? '↑' : '↓',
      goed: laagIsGoed ? d < 0 : d > 0,
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>📊 Lichaam</h1><p className="subtitle">InBody metingen & trends</p></div>
        <button className="btn btn-primary" onClick={() => setToonForm(!toonForm)}>
          {toonForm ? 'Annuleer' : '+ Meting'}
        </button>
      </div>

      {fout && <div className="alert alert-error">{fout}</div>}

      {/* Meest recente meting */}
      {laatste && (
        <div className="card inbody-card">
          <div className="inbody-header">
            <h3>Meest recente meting</h3>
            <span className="inbody-datum">{datumNl(laatste.datum)}</span>
          </div>
          <div className="inbody-grid">
            {laatste.gewicht_kg    && <InBodyStat label="Gewicht"      waarde={laatste.gewicht_kg}    eenheid="kg" delta={delta('gewicht_kg')} />}
            {laatste.vetpercentage && <InBodyStat label="Vetpercentage" waarde={laatste.vetpercentage} eenheid="%" delta={delta('vetpercentage')} />}
            {laatste.spiermassa_kg && <InBodyStat label="Spiermassa"   waarde={laatste.spiermassa_kg} eenheid="kg" delta={delta('spiermassa_kg', false)} />}
            {laatste.vetmassa_kg   && <InBodyStat label="Vetmassa"     waarde={laatste.vetmassa_kg}   eenheid="kg" delta={delta('vetmassa_kg')} />}
            {laatste.visceraal_vet && <InBodyStat label="Visceraal vet" waarde={laatste.visceraal_vet} eenheid="" delta={delta('visceraal_vet')} />}
            {laatste.bmr_kcal      && <InBodyStat label="BMR"          waarde={laatste.bmr_kcal}      eenheid="kcal" delta={delta('bmr_kcal', false)} />}
            {laatste.vochtbalans_pct && <InBodyStat label="Vochtbalans" waarde={laatste.vochtbalans_pct} eenheid="%" />}
            {laatste.inbody_score  && <InBodyStat label="InBody score" waarde={laatste.inbody_score}  eenheid="" delta={delta('inbody_score', false)} />}
          </div>
          {laatste.notities && <p className="inbody-notities">{laatste.notities}</p>}
          <button className="link-btn small mt-2" onClick={() => onNavigeer('coach')}>
            💬 Vraag coach om analyse →
          </button>
        </div>
      )}

      {toonForm && (
        <div className="card">
          <h3>Meting invoeren</h3>
          <form onSubmit={submit}>
            <div className="foto-sectie">
              <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={analyseerBestand} style={{ display: 'none' }} />
              <button type="button" className="btn btn-secondary" onClick={() => fileRef.current.click()} disabled={analyseert}>
                {analyseert ? '🔍 Analyseren...' : '📸 InBody scan uploaden'}
              </button>
              <p className="tip-tip">Upload een foto of PDF van je InBody uitdraai voor automatische extractie.</p>
            </div>

            <div className="form-rij">
              <div className="form-group"><label>Datum</label><input type="date" value={form.datum} onChange={upd('datum')} /></div>
              <div className="form-group"><label>Gewicht (kg)</label><input type="number" step="0.1" value={form.gewicht_kg} onChange={upd('gewicht_kg')} placeholder="78.5" /></div>
              <div className="form-group"><label>Vetpercentage (%)</label><input type="number" step="0.1" value={form.vetpercentage} onChange={upd('vetpercentage')} placeholder="18.5" /></div>
              <div className="form-group"><label>Spiermassa (kg)</label><input type="number" step="0.1" value={form.spiermassa_kg} onChange={upd('spiermassa_kg')} /></div>
              <div className="form-group"><label>Vetmassa (kg)</label><input type="number" step="0.1" value={form.vetmassa_kg} onChange={upd('vetmassa_kg')} /></div>
              <div className="form-group"><label>Visceraal vet</label><input type="number" value={form.visceraal_vet} onChange={upd('visceraal_vet')} /></div>
              <div className="form-group"><label>BMR (kcal)</label><input type="number" value={form.bmr_kcal} onChange={upd('bmr_kcal')} /></div>
              <div className="form-group"><label>Vochtbalans (%)</label><input type="number" step="0.1" value={form.vochtbalans_pct} onChange={upd('vochtbalans_pct')} /></div>
              <div className="form-group"><label>InBody score</label><input type="number" value={form.inbody_score} onChange={upd('inbody_score')} /></div>
            </div>

            <div className="form-group"><label>Notities</label><textarea value={form.notities} onChange={upd('notities')} rows="2" /></div>
            <button type="submit" className="btn btn-primary" disabled={opslaan}>{opslaan ? 'Opslaan...' : 'Meting opslaan'}</button>
          </form>
        </div>
      )}

      {laden ? <div className="center-loader"><div className="spinner" /></div> :
        metingen.length === 0 ? (
          <div className="leeg-staat"><p>📊</p><p>Nog geen InBody metingen.</p></div>
        ) : (
          <div className="lijst">
            <h3>Geschiedenis</h3>
            {metingen.map(m => (
              <div key={m.id} className="card meting-rij">
                <div className="meting-rij-kop">
                  <strong>{datumNl(m.datum, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                  <button className="verwijder-btn" onClick={() => verwijder(m.id)}>×</button>
                </div>
                <div className="meting-mini-stats">
                  {m.gewicht_kg && <span>{m.gewicht_kg} kg</span>}
                  {m.vetpercentage && <span>{m.vetpercentage}% vet</span>}
                  {m.spiermassa_kg && <span>{m.spiermassa_kg} kg spier</span>}
                  {m.inbody_score && <span>Score: {m.inbody_score}</span>}
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  )
}

function InBodyStat({ label, waarde, eenheid, delta }) {
  return (
    <div className="inbody-stat">
      <div className="inbody-stat-waarde">
        {waarde}<span className="inbody-eenheid">{eenheid}</span>
        {delta && (
          <span className={`delta ${delta.goed ? 'delta--goed' : 'delta--slecht'}`}>
            {delta.richting}{delta.waarde}
          </span>
        )}
      </div>
      <div className="inbody-stat-label">{label}</div>
    </div>
  )
}
