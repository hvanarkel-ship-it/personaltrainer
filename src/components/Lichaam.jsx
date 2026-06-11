import { useState, useEffect, useRef } from 'react'
import { api, datumStr, datumNl } from '../api.js'
import Card from './ui/Card.jsx'
import Sheet from './ui/Sheet.jsx'
import Chip from './ui/Chip.jsx'
import MetricHero from './ui/MetricHero.jsx'

// ── Helpers ─────────────────────────────────────────────────────────────────

const LEEG_FORM = {
  datum: datumStr(new Date()),
  gewicht_kg: '', vetmassa_kg: '', vetpercentage: '',
  spiermassa_kg: '', visceraal_vet: '', bmr_kcal: '',
  vochtbalans_pct: '', inbody_score: '', notities: '',
}

function deltaInfo(laatste, vorige, veld, laagIsGoed = true) {
  if (!laatste?.[veld] || !vorige?.[veld]) return null
  const d = parseFloat(laatste[veld]) - parseFloat(vorige[veld])
  if (Math.abs(d) < 0.05) return null
  const omhoog = d > 0
  const goed = laagIsGoed ? !omhoog : omhoog
  return { waarde: Math.abs(d).toFixed(1), omhoog, goed }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Lichaam({ onNavigeer }) {
  const [metingen, setMetingen] = useState([])
  const [laden, setLaden]       = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm]         = useState(LEEG_FORM)
  const [analyseert, setAnalyseert] = useState(false)
  const [opslaan, setOpslaan]   = useState(false)
  const [fout, setFout]         = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    api.get('/inbody')
      .then(setMetingen)
      .catch(e => setFout(e.message))
      .finally(() => setLaden(false))
  }, [])

  async function analyseerBestand(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAnalyseert(true); setFout('')
    try {
      const base64 = await new Promise(res => {
        const r = new FileReader(); r.onload = ev => res(ev.target.result); r.readAsDataURL(file)
      })
      const res = await api.post('/upload-analyse', {
        upload_type: 'inbody',
        bestanden: [{ base64, naam: file.name }],
      })
      if (res.succes && res.data) {
        const d = res.data
        setForm(f => ({
          ...f,
          gewicht_kg:      d.gewicht_kg      || f.gewicht_kg,
          vetmassa_kg:     d.vetmassa_kg     || f.vetmassa_kg,
          vetpercentage:   d.vetpercentage   || f.vetpercentage,
          spiermassa_kg:   d.spiermassa_kg   || f.spiermassa_kg,
          visceraal_vet:   d.visceraal_vet   || f.visceraal_vet,
          bmr_kcal:        d.bmr_kcal        || f.bmr_kcal,
          vochtbalans_pct: d.vochtbalans_pct || f.vochtbalans_pct,
          inbody_score:    d.inbody_score    || f.inbody_score,
          notities:        d.notities        || f.notities,
        }))
      }
    } catch (err) { setFout('Analyse mislukt: ' + err.message) }
    finally { setAnalyseert(false); e.target.value = '' }
  }

  async function submit(e) {
    e.preventDefault(); setFout(''); setOpslaan(true)
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''))
      const nieuw = await api.post('/inbody', payload)
      setMetingen(m => [nieuw, ...m])
      setSheetOpen(false)
      setForm(LEEG_FORM)
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
  const vorige  = metingen[1]
  const upd = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  // Weight trend (last 8 measurements)
  const gewichtTrend = metingen
    .filter(m => m.gewicht_kg)
    .slice(0, 8)
    .reverse()

  return (
    <div className="page">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="t-xl">Lichaam</h1>
          <p className="t-sm t-muted" style={{ marginTop: 2 }}>InBody metingen & trends</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setSheetOpen(true)}>
          + Meting
        </button>
      </div>

      {fout && <Card><p className="t-sm t-red">{fout}</p></Card>}

      {/* ── Latest measurement ─────────────────────────────────────────── */}
      {laatste && (
        <Card>
          <div className="card-header">
            <span className="t-lg">Meest recente meting</span>
            <span className="t-sm t-muted">
              {datumNl(laatste.datum, { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)' }}>
            {laatste.gewicht_kg    && <StatBlok label="Gewicht"       waarde={laatste.gewicht_kg}    unit="kg"   delta={deltaInfo(laatste, vorige, 'gewicht_kg')} />}
            {laatste.vetpercentage && <StatBlok label="Vetpercentage" waarde={laatste.vetpercentage} unit="%"    delta={deltaInfo(laatste, vorige, 'vetpercentage')} />}
            {laatste.spiermassa_kg && <StatBlok label="Spiermassa"    waarde={laatste.spiermassa_kg} unit="kg"   delta={deltaInfo(laatste, vorige, 'spiermassa_kg', false)} />}
            {laatste.vetmassa_kg   && <StatBlok label="Vetmassa"      waarde={laatste.vetmassa_kg}   unit="kg"   delta={deltaInfo(laatste, vorige, 'vetmassa_kg')} />}
            {laatste.visceraal_vet && <StatBlok label="Visceraal vet" waarde={laatste.visceraal_vet} unit=""     delta={deltaInfo(laatste, vorige, 'visceraal_vet')} />}
            {laatste.bmr_kcal      && <StatBlok label="BMR"           waarde={laatste.bmr_kcal}      unit="kcal" delta={deltaInfo(laatste, vorige, 'bmr_kcal', false)} />}
            {laatste.vochtbalans_pct && <StatBlok label="Vochtbalans" waarde={laatste.vochtbalans_pct} unit="%" />}
            {laatste.inbody_score  && <StatBlok label="InBody score"  waarde={laatste.inbody_score}  unit=""     delta={deltaInfo(laatste, vorige, 'inbody_score', false)} />}
          </div>

          {laatste.notities && (
            <p className="t-sm t-muted" style={{ marginTop: 'var(--space-3)', fontStyle: 'italic' }}>
              {laatste.notities}
            </p>
          )}

          <button
            className="btn btn-ghost btn-sm btn-full"
            style={{ marginTop: 'var(--space-3)' }}
            onClick={() => onNavigeer('coach')}
          >
            Vraag coach om analyse →
          </button>
        </Card>
      )}

      {/* ── Weight trend chart ─────────────────────────────────────────── */}
      {gewichtTrend.length > 1 && (
        <Card>
          <div className="card-header">
            <span className="t-lg">Gewichtstrend</span>
            <span className="t-sm t-muted">
              {gewichtTrend[gewichtTrend.length - 1]?.gewicht_kg} kg
            </span>
          </div>
          <GewichtChart data={gewichtTrend} />
        </Card>
      )}

      {/* ── History list ───────────────────────────────────────────────── */}
      {laden ? (
        <div className="section-gap">
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 'var(--r-lg)' }} />)}
        </div>
      ) : metingen.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📊</span>
          <span className="t-md">Nog geen InBody metingen</span>
          <p className="t-sm">Upload je InBody uitdraai voor automatische extractie.</p>
          <button className="btn btn-primary" onClick={() => setSheetOpen(true)}>+ Meting toevoegen</button>
        </div>
      ) : metingen.length > 1 && (
        <Card>
          <span className="t-label" style={{ display: 'block', marginBottom: 'var(--space-3)' }}>Geschiedenis</span>
          <div className="section-gap" style={{ gap: 'var(--space-2)' }}>
            {metingen.map(m => (
              <div key={m.id} className="list-item">
                <div style={{ flex: 1 }}>
                  <span className="t-sm" style={{ fontWeight: 600 }}>
                    {datumNl(m.datum, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 2, flexWrap: 'wrap' }}>
                    {m.gewicht_kg    && <span className="t-xs t-muted">{m.gewicht_kg} kg</span>}
                    {m.vetpercentage && <span className="t-xs t-muted">{m.vetpercentage}% vet</span>}
                    {m.spiermassa_kg && <span className="t-xs t-muted">{m.spiermassa_kg} kg spier</span>}
                    {m.inbody_score  && <span className="t-xs t-muted">Score: {m.inbody_score}</span>}
                  </div>
                </div>
                <button
                  onClick={() => verwijder(m.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18, padding: '0 4px', lineHeight: 1 }}
                >×</button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Add measurement sheet ───────────────────────────────────────── */}
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Meting invoeren">
        <form onSubmit={submit}>
          <div className="section-gap">

            {/* AI scan upload */}
            <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={analyseerBestand} style={{ display: 'none' }} />
            <button type="button" className="btn btn-secondary btn-full" onClick={() => fileRef.current.click()} disabled={analyseert}>
              {analyseert ? '🔍 Analyseren...' : '📸 InBody scan uploaden (AI)'}
            </button>
            <p className="t-sm t-muted" style={{ textAlign: 'center' }}>
              Upload een foto of PDF van je InBody uitdraai voor automatische extractie.
            </p>

            <div className="form-group">
              <label>Datum</label>
              <input className="input" type="date" value={form.datum} onChange={upd('datum')} />
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>Gewicht (kg)</label>
                <input className="input" type="number" step="0.1" value={form.gewicht_kg} onChange={upd('gewicht_kg')} placeholder="78.5" />
              </div>
              <div className="form-group">
                <label>Vetpercentage (%)</label>
                <input className="input" type="number" step="0.1" value={form.vetpercentage} onChange={upd('vetpercentage')} placeholder="18.5" />
              </div>
              <div className="form-group">
                <label>Spiermassa (kg)</label>
                <input className="input" type="number" step="0.1" value={form.spiermassa_kg} onChange={upd('spiermassa_kg')} placeholder="35.0" />
              </div>
              <div className="form-group">
                <label>Vetmassa (kg)</label>
                <input className="input" type="number" step="0.1" value={form.vetmassa_kg} onChange={upd('vetmassa_kg')} placeholder="14.0" />
              </div>
              <div className="form-group">
                <label>Visceraal vet</label>
                <input className="input" type="number" value={form.visceraal_vet} onChange={upd('visceraal_vet')} placeholder="6" />
              </div>
              <div className="form-group">
                <label>BMR (kcal)</label>
                <input className="input" type="number" value={form.bmr_kcal} onChange={upd('bmr_kcal')} placeholder="1850" />
              </div>
              <div className="form-group">
                <label>Vochtbalans (%)</label>
                <input className="input" type="number" step="0.1" value={form.vochtbalans_pct} onChange={upd('vochtbalans_pct')} placeholder="62.0" />
              </div>
              <div className="form-group">
                <label>InBody score</label>
                <input className="input" type="number" value={form.inbody_score} onChange={upd('inbody_score')} placeholder="75" />
              </div>
            </div>

            <div className="form-group">
              <label>Notities</label>
              <textarea className="input" rows={2} value={form.notities} onChange={upd('notities')} style={{ resize: 'vertical' }} />
            </div>

            {fout && <p className="t-sm t-red">{fout}</p>}
            <button type="submit" className="btn btn-primary btn-full" disabled={opslaan}>
              {opslaan ? 'Opslaan...' : 'Meting opslaan'}
            </button>
          </div>
        </form>
      </Sheet>

    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatBlok({ label, waarde, unit, delta }) {
  const deltaColor = delta
    ? (delta.goed ? 'var(--green)' : 'var(--red)')
    : null

  return (
    <Card variant="inset">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 'var(--t-lg)', fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {waarde}
        </span>
        <span className="t-sm t-muted">{unit}</span>
        {delta && (
          <span style={{ fontSize: 'var(--t-xs)', fontWeight: 700, color: deltaColor, marginLeft: 2 }}>
            {delta.omhoog ? '↑' : '↓'}{delta.waarde}
          </span>
        )}
      </div>
      <div className="metric-label" style={{ marginTop: 2 }}>{label}</div>
    </Card>
  )
}

function GewichtChart({ data }) {
  const vals = data.map(m => parseFloat(m.gewicht_kg))
  const min  = Math.min(...vals)
  const max  = Math.max(...vals)
  const spread = max - min || 0.1

  return (
    <div style={{ display: 'flex', gap: 4, height: 72, alignItems: 'flex-end' }}>
      {data.map((m, i) => {
        const h    = 20 + ((parseFloat(m.gewicht_kg) - min) / spread) * 48
        const isLast = i === data.length - 1
        return (
          <div key={m.id || i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            {isLast && (
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--blue)' }}>
                {m.gewicht_kg}
              </span>
            )}
            <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
              <div style={{
                width: '100%', height: h,
                background: isLast ? 'var(--blue)' : 'var(--bg-surface)',
                borderRadius: 3,
              }} />
            </div>
            <span style={{ fontSize: 9, color: 'var(--text-3)' }}>
              {datumNl(m.datum, { day: 'numeric', month: 'short' })}
            </span>
          </div>
        )
      })}
    </div>
  )
}
