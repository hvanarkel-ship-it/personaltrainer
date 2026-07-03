import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'
import Card from './ui/Card.jsx'
import Sheet from './ui/Sheet.jsx'
import Chip from './ui/Chip.jsx'

// ── Constants ───────────────────────────────────────────────────────────────

const TYPES = ['ontbijt', 'lunch', 'diner', 'snack', 'pre-workout', 'post-workout']

const TYPE_ICON = {
  ontbijt: '🌅', lunch: '☀️', diner: '🌙',
  snack: '🍎', 'pre-workout': '⚡', 'post-workout': '💪',
}

const LEEG_FORM = { maaltijd_type: 'ontbijt', beschrijving: '', kcal: '', eiwit_g: '', koolhydraten_g: '', vetten_g: '' }

// ── Helpers ─────────────────────────────────────────────────────────────────

// Lokale kalenderdag — toISOString() zou rond middernacht de UTC-dag geven
const pad2 = n => String(n).padStart(2, '0')
const dagStr = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
const vandaagStr = () => dagStr(new Date())

function datumLabel(d) {
  const today = vandaagStr()
  const gisteren = new Date(); gisteren.setDate(gisteren.getDate() - 1)
  const gisterStr = dagStr(gisteren)
  if (d === today) return 'Vandaag'
  if (d === gisterStr) return 'Gisteren'
  return new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
}

function fmt(v, dec = 0) {
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return dec ? n.toFixed(dec) : String(Math.round(n))
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Voeding({ onNavigeer }) {
  const [datum, setDatum]         = useState(vandaagStr())
  const [maaltijden, setMaaltijden] = useState([])
  const [profiel, setProfiel]     = useState(null)
  const [laden, setLaden]         = useState(true)
  const [fout, setFout]           = useState('')

  // Add sheet
  const [addOpen, setAddOpen]     = useState(false)
  const [form, setForm]           = useState(LEEG_FORM)
  const [aiNotities, setAiNotities] = useState('')
  const [analyseert, setAnalyseert] = useState(false)
  const [opslaan, setOpslaan]     = useState(false)
  const fotoRef = useRef(null)

  // Edit sheet
  const [editOpen, setEditOpen]   = useState(false)
  const [editId, setEditId]       = useState(null)
  const [editForm, setEditForm]   = useState({})
  const [editLaden, setEditLaden] = useState(false)

  // Fetch profile once
  useEffect(() => {
    api.get('/profiel').then(setProfiel).catch(() => {})
  }, [])

  // Fetch meals when date changes
  useEffect(() => {
    setLaden(true)
    api.get(`/maaltijd?datum=${datum}`)
      .then(setMaaltijden)
      .catch(e => setFout(e.message))
      .finally(() => setLaden(false))
  }, [datum])

  function navigeerDag(delta) {
    const d = new Date(datum + 'T12:00:00')
    d.setDate(d.getDate() + delta)
    setDatum(dagStr(d))
  }

  // ── Camera / AI analysis ────────────────────────────────────────────────

  async function analyseerFoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAnalyseert(true); setFout('')
    try {
      const base64 = await leesBase64(file)
      const res = await api.post('/upload-analyse', { upload_type: 'maaltijd', bestanden: [{ base64, naam: file.name }] })
      if (res.succes && res.data) {
        const d = res.data
        setForm(f => ({
          ...f,
          beschrijving:    d.beschrijving    || f.beschrijving,
          kcal:            d.kcal            || f.kcal,
          eiwit_g:         d.eiwit_g         || f.eiwit_g,
          koolhydraten_g:  d.koolhydraten_g  || f.koolhydraten_g,
          vetten_g:        d.vetten_g        || f.vetten_g,
        }))
        setAiNotities(d.ai_notities || '')
      }
    } catch (err) { setFout('Analyse mislukt: ' + err.message) }
    finally { setAnalyseert(false); e.target.value = '' }
  }

  function leesBase64(file) {
    return new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsDataURL(file) })
  }

  // ── Add meal ────────────────────────────────────────────────────────────

  async function submit(e) {
    e.preventDefault(); setOpslaan(true); setFout('')
    try {
      const payload = { datum, ...Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '')), ai_notities: aiNotities || undefined }
      const nieuw = await api.post('/maaltijd', payload)
      setMaaltijden(m => [...m, nieuw])
      setAddOpen(false); setAiNotities('')
      setForm(LEEG_FORM)
    } catch (err) { setFout(err.message) }
    finally { setOpslaan(false) }
  }

  // ── Edit meal ───────────────────────────────────────────────────────────

  function startEdit(m) {
    setEditId(m.id)
    setEditForm({ maaltijd_type: m.maaltijd_type || 'snack', beschrijving: m.beschrijving || '', kcal: m.kcal ?? '', eiwit_g: m.eiwit_g ?? '', koolhydraten_g: m.koolhydraten_g ?? '', vetten_g: m.vetten_g ?? '' })
    setEditOpen(true)
  }

  async function saveEdit() {
    setEditLaden(true)
    try {
      const bijgewerkt = await api.put(`/maaltijd/${editId}`, editForm)
      setMaaltijden(m => m.map(x => x.id === editId ? { ...x, ...bijgewerkt } : x))
      setEditOpen(false)
    } catch (err) { setFout(err.message) }
    finally { setEditLaden(false) }
  }

  async function verwijder(id) {
    if (!confirm('Maaltijd verwijderen?')) return
    try {
      await api.delete(`/maaltijd/${id}`)
      setMaaltijden(m => m.filter(x => x.id !== id))
    } catch (err) { setFout('Verwijderen mislukt: ' + err.message) }
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  const totaal = maaltijden.reduce((s, m) => ({
    kcal:  s.kcal  + (m.kcal || 0),
    eiwit: s.eiwit + (parseFloat(m.eiwit_g) || 0),
    kh:    s.kh    + (parseFloat(m.koolhydraten_g) || 0),
    vet:   s.vet   + (parseFloat(m.vetten_g) || 0),
  }), { kcal: 0, eiwit: 0, kh: 0, vet: 0 })

  const p = profiel || {}
  const doelKcal   = p.doel_kcal            || null
  const doelEiwit  = p.doel_eiwit_g         || null
  const doelKh     = p.doel_koolhydraten_g  || null
  const doelVet    = p.doel_vetten_g        || null

  const isVandaag  = datum === vandaagStr()

  // Group meals by type, keep order
  const groepen = TYPES
    .map(t => ({ type: t, items: maaltijden.filter(m => m.maaltijd_type === t) }))
    .filter(g => g.items.length > 0)
  const overig = maaltijden.filter(m => !TYPES.includes(m.maaltijd_type))

  return (
    <div className="page">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="t-xl">Voeding</h1>
          <p className="t-sm t-muted" style={{ marginTop: 2 }}>Maaltijdtracking & macro's</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>
          + Maaltijd
        </button>
      </div>

      {fout && <Card><p className="t-sm t-red">{fout}</p></Card>}

      {/* ── Date navigator ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <button
          onClick={() => navigeerDag(-1)}
          className="btn btn-secondary btn-sm"
          style={{ minWidth: 44 }}
        >‹</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span className="t-md" style={{ fontWeight: 600 }}>{datumLabel(datum)}</span>
          {datum !== vandaagStr() && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ display: 'block', margin: '2px auto 0' }}
              onClick={() => setDatum(vandaagStr())}
            >
              Terug naar vandaag
            </button>
          )}
        </div>
        <button
          onClick={() => navigeerDag(1)}
          className="btn btn-secondary btn-sm"
          style={{ minWidth: 44 }}
          disabled={isVandaag}
        >›</button>
      </div>

      {/* ── Day totals ─────────────────────────────────────────────────── */}
      {maaltijden.length > 0 && (
        <Card>
          <span className="t-label" style={{ display: 'block', marginBottom: 'var(--space-3)' }}>Dagtotaal</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)' }}>
            <TotaalBlok waarde={totaal.kcal}         doel={doelKcal}  label="kcal"   color="var(--text)" />
            <TotaalBlok waarde={Math.round(totaal.eiwit)} doel={doelEiwit} label="eiwit" color="var(--green)" unit="g" />
            <TotaalBlok waarde={Math.round(totaal.kh)}   doel={doelKh}   label="koolh." color="var(--blue)"  unit="g" />
            <TotaalBlok waarde={Math.round(totaal.vet)}  doel={doelVet}  label="vet"    color="var(--amber)" unit="g" />
          </div>
        </Card>
      )}

      {/* ── Meal list ──────────────────────────────────────────────────── */}
      {laden ? (
        <div className="section-gap">
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 'var(--r-lg)' }} />)}
        </div>
      ) : maaltijden.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🍽️</span>
          <span className="t-md">
            Nog geen maaltijden op {new Date(datum + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>+ Toevoegen</button>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigeer('coach')}>Via Coach →</button>
          </div>
        </div>
      ) : (
        <div className="section-gap">
          {groepen.map(({ type, items }) => (
            <div key={type}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontSize: 14 }}>{TYPE_ICON[type] || '🍽️'}</span>
                <span className="t-label">{type.charAt(0).toUpperCase() + type.slice(1)}</span>
              </div>
              <div className="section-gap" style={{ gap: 'var(--space-2)' }}>
                {items.map(m => (
                  <MaaltijdKaart key={m.id} m={m} onEdit={() => startEdit(m)} onVerwijder={() => verwijder(m.id)} />
                ))}
              </div>
            </div>
          ))}
          {overig.map(m => (
            <MaaltijdKaart key={m.id} m={m} onEdit={() => startEdit(m)} onVerwijder={() => verwijder(m.id)} />
          ))}
        </div>
      )}

      {/* ── Add meal sheet ─────────────────────────────────────────────── */}
      <Sheet open={addOpen} onClose={() => { setAddOpen(false); setAiNotities('') }} title="Maaltijd toevoegen">
        <form onSubmit={submit}>
          <div className="section-gap">

            {/* Type picker */}
            <div className="form-group">
              <label>Type</label>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {TYPES.map(t => (
                  <button
                    key={t} type="button"
                    onClick={() => setForm(f => ({ ...f, maaltijd_type: t }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-1)',
                      padding: '6px 12px',
                      background: form.maaltijd_type === t ? 'var(--bg-surface)' : 'var(--bg-raised)',
                      border: form.maaltijd_type === t ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                      borderRadius: 'var(--r-xs)', cursor: 'pointer',
                      color: form.maaltijd_type === t ? 'var(--text)' : 'var(--text-3)',
                      fontSize: 'var(--t-xs)', fontWeight: 700,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      transition: 'background var(--dur-fast), border-color var(--dur-fast)',
                    }}
                  >
                    <span>{TYPE_ICON[t]}</span>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Camera button */}
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" onChange={analyseerFoto} style={{ display: 'none' }} />
            <button type="button" className="btn btn-secondary btn-full" onClick={() => fotoRef.current.click()} disabled={analyseert}>
              {analyseert ? '🔍 Analyseren...' : '📸 Foto analyseren met AI'}
            </button>
            {aiNotities && (
              <Card variant="inset">
                <p className="t-sm t-muted" style={{ fontStyle: 'italic' }}>✨ {aiNotities}</p>
              </Card>
            )}

            {/* Description */}
            <div className="form-group">
              <label>Beschrijving</label>
              <input className="input" value={form.beschrijving} onChange={e => setForm(f => ({ ...f, beschrijving: e.target.value }))} placeholder="Bijv. Havermout met banaan en whey" />
            </div>

            {/* Macros */}
            <div className="form-grid-2">
              <div className="form-group">
                <label>Kcal</label>
                <input className="input" type="number" value={form.kcal} onChange={e => setForm(f => ({ ...f, kcal: e.target.value }))} placeholder="350" />
              </div>
              <div className="form-group">
                <label>Eiwit (g)</label>
                <input className="input" type="number" step="0.1" value={form.eiwit_g} onChange={e => setForm(f => ({ ...f, eiwit_g: e.target.value }))} placeholder="25" />
              </div>
              <div className="form-group">
                <label>Koolhyd. (g)</label>
                <input className="input" type="number" step="0.1" value={form.koolhydraten_g} onChange={e => setForm(f => ({ ...f, koolhydraten_g: e.target.value }))} placeholder="45" />
              </div>
              <div className="form-group">
                <label>Vet (g)</label>
                <input className="input" type="number" step="0.1" value={form.vetten_g} onChange={e => setForm(f => ({ ...f, vetten_g: e.target.value }))} placeholder="8" />
              </div>
            </div>

            {fout && <p className="t-sm t-red">{fout}</p>}
            <button type="submit" className="btn btn-primary btn-full" disabled={opslaan}>
              {opslaan ? 'Opslaan...' : 'Maaltijd opslaan'}
            </button>
          </div>
        </form>
      </Sheet>

      {/* ── Edit meal sheet ─────────────────────────────────────────────── */}
      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Maaltijd bewerken">
        <div className="section-gap">

          {/* Type picker */}
          <div className="form-group">
            <label>Type</label>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {TYPES.map(t => (
                <button
                  key={t} type="button"
                  onClick={() => setEditForm(f => ({ ...f, maaltijd_type: t }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-1)',
                    padding: '6px 12px',
                    background: editForm.maaltijd_type === t ? 'var(--bg-surface)' : 'var(--bg-raised)',
                    border: editForm.maaltijd_type === t ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                    borderRadius: 'var(--r-xs)', cursor: 'pointer',
                    color: editForm.maaltijd_type === t ? 'var(--text)' : 'var(--text-3)',
                    fontSize: 'var(--t-xs)', fontWeight: 700,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    transition: 'background var(--dur-fast), border-color var(--dur-fast)',
                  }}
                >
                  <span>{TYPE_ICON[t]}</span>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Beschrijving</label>
            <input className="input" value={editForm.beschrijving || ''} onChange={e => setEditForm(f => ({ ...f, beschrijving: e.target.value }))} placeholder="Naam van de maaltijd" />
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label>Kcal</label>
              <input className="input" type="number" value={editForm.kcal ?? ''} onChange={e => setEditForm(f => ({ ...f, kcal: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Eiwit (g)</label>
              <input className="input" type="number" step="0.1" value={editForm.eiwit_g ?? ''} onChange={e => setEditForm(f => ({ ...f, eiwit_g: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Koolhyd. (g)</label>
              <input className="input" type="number" step="0.1" value={editForm.koolhydraten_g ?? ''} onChange={e => setEditForm(f => ({ ...f, koolhydraten_g: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Vet (g)</label>
              <input className="input" type="number" step="0.1" value={editForm.vetten_g ?? ''} onChange={e => setEditForm(f => ({ ...f, vetten_g: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveEdit} disabled={editLaden}>
              {editLaden ? 'Opslaan...' : 'Opslaan'}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditOpen(false)}>Annuleer</button>
          </div>
        </div>
      </Sheet>

    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function TotaalBlok({ waarde, doel, label, color, unit = '' }) {
  const pct = doel ? Math.min(100, Math.round((waarde / doel) * 100)) : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <div style={{ fontSize: 'var(--t-lg)', fontWeight: 700, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {waarde}{unit && <span style={{ fontSize: 'var(--t-xs)', color: 'var(--text-3)', marginLeft: 1 }}>{unit}</span>}
      </div>
      {doel && (
        <>
          <div className="progress-bar" style={{ height: 3 }}>
            <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
          </div>
          <span className="t-xs t-muted">/ {doel}{unit}</span>
        </>
      )}
      {!doel && <span className="t-xs t-muted">{label}</span>}
      {doel && <span className="t-xs t-muted">{label}</span>}
    </div>
  )
}

function MaaltijdKaart({ m, onEdit, onVerwijder }) {
  return (
    <Card variant="raised">
      <div className="row-between">
        <span className="t-md" style={{ fontWeight: 500, flex: 1, paddingRight: 'var(--space-2)' }}>
          {m.beschrijving || 'Maaltijd'}
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
          <button
            onClick={onEdit}
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14, padding: '2px 4px', borderRadius: 'var(--r-xs)' }}
            title="Bewerken"
          >✏️</button>
          <button
            onClick={onVerwijder}
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18, padding: '0 4px', lineHeight: 1 }}
          >×</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
        {m.kcal     != null && <MacroPill value={m.kcal}                          label="kcal"  />}
        {m.eiwit_g  != null && <MacroPill value={fmt(m.eiwit_g, 1)}  unit="g"    label="eiwit" color="var(--green)" />}
        {m.koolhydraten_g != null && <MacroPill value={fmt(m.koolhydraten_g, 1)} unit="g" label="koolh." color="var(--blue)" />}
        {m.vetten_g != null && <MacroPill value={fmt(m.vetten_g, 1)} unit="g"    label="vet"   color="var(--amber)" />}
      </div>
      {m.ai_notities && (
        <p className="t-sm t-muted" style={{ marginTop: 'var(--space-2)', fontStyle: 'italic' }}>
          ✨ {m.ai_notities}
        </p>
      )}
    </Card>
  )
}

function MacroPill({ value, unit, label, color }) {
  return (
    <div className="card-inset" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 52, padding: '4px 10px' }}>
      <span style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: color || 'var(--text)', lineHeight: 1 }}>
        {value}{unit && <span style={{ fontSize: 9, marginLeft: 1 }}>{unit}</span>}
      </span>
      <span className="t-xs t-muted">{label}</span>
    </div>
  )
}
