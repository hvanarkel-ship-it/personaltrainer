import { useState, useEffect } from 'react'
import { api } from '../api.js'
import Card from './ui/Card.jsx'
import Sheet from './ui/Sheet.jsx'
import Chip from './ui/Chip.jsx'

// ── Constants ───────────────────────────────────────────────────────────────

const VOORBEELDEN = [
  { titel: 'Bench press 100 kg',  sport: 'fitness', doel_waarde: 100, eenheid: 'kg' },
  { titel: 'Fietsen 100 km',      sport: 'fietsen', doel_waarde: 100, eenheid: 'km' },
  { titel: 'Vetpercentage 15%',   sport: '',        doel_waarde: 15,  eenheid: '%'  },
]

const LEEG_FORM = {
  titel: '', sport: '', beschrijving: '',
  doel_waarde: '', huidige_waarde: '', eenheid: '', deadline: '',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function pctColor(pct) {
  if (pct >= 100) return 'var(--green)'
  if (pct >= 60)  return 'var(--blue)'
  if (pct >= 30)  return 'var(--amber)'
  return 'var(--text-3)'
}

function deadlineLabel(dl) {
  if (!dl) return null
  const d = new Date(dl)
  const nu = new Date()
  const dagen = Math.ceil((d - nu) / 86400000)
  if (dagen < 0)  return { tekst: 'Verlopen', color: 'var(--red)' }
  if (dagen === 0) return { tekst: 'Vandaag!', color: 'var(--amber)' }
  if (dagen <= 7)  return { tekst: `${dagen}d`, color: 'var(--amber)' }
  if (dagen <= 30) return { tekst: `${dagen}d`, color: 'var(--text-2)' }
  return { tekst: d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }), color: 'var(--text-3)' }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Doelen() {
  const [doelen, setDoelen]       = useState([])
  const [laden, setLaden]         = useState(true)
  const [fout, setFout]           = useState('')

  // Add / edit sheet
  const [addOpen, setAddOpen]     = useState(false)
  const [editId, setEditId]       = useState(null)
  const [form, setForm]           = useState(LEEG_FORM)
  const [opslaan, setOpslaan]     = useState(false)

  // Progress update
  const [updateId, setUpdateId]   = useState(null)
  const [updateVal, setUpdateVal] = useState('')
  const [updateLaden, setUpdateLaden] = useState(false)

  useEffect(() => {
    api.get('/doelen')
      .then(setDoelen)
      .catch(e => setFout(e.message))
      .finally(() => setLaden(false))
  }, [])

  const upd = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  function startEditDoel(d) {
    setEditId(d.id)
    setForm({
      titel: d.titel || '', sport: d.sport || '', beschrijving: d.beschrijving || '',
      doel_waarde: d.doel_waarde ?? '', huidige_waarde: d.huidige_waarde ?? '',
      eenheid: d.eenheid || '', deadline: d.deadline ? String(d.deadline).slice(0, 10) : '',
    })
    setAddOpen(true)
  }

  function sluitSheet() {
    setAddOpen(false)
    setEditId(null)
    setForm(LEEG_FORM)
  }

  async function submit(e) {
    e.preventDefault(); setOpslaan(true); setFout('')
    try {
      if (editId) {
        // Alle velden meesturen: '' wist bewust een veld (bv. deadline)
        const bijgewerkt = await api.put(`/doelen/${editId}`, form)
        setDoelen(d => d.map(x => x.id === editId ? bijgewerkt : x))
      } else {
        const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''))
        const nieuw = await api.post('/doelen', payload)
        setDoelen(d => [nieuw, ...d])
      }
      sluitSheet()
    } catch (err) { setFout(err.message) }
    finally { setOpslaan(false) }
  }

  function startUpdate(doel) {
    setUpdateId(doel.id)
    setUpdateVal(doel.huidige_waarde ?? '')
  }

  async function slaUpdateOp(id) {
    const val = parseFloat(updateVal)
    if (isNaN(val)) return
    setUpdateLaden(true)
    try {
      await api.put(`/doelen/${id}`, { huidige_waarde: val })
      setDoelen(d => d.map(x => x.id === id ? { ...x, huidige_waarde: val } : x))
      setUpdateId(null)
    } catch (err) { setFout(err.message) }
    finally { setUpdateLaden(false) }
  }

  async function toggleActief(id, actief) {
    await api.put(`/doelen/${id}`, { actief: !actief })
    setDoelen(d => d.map(x => x.id === id ? { ...x, actief: !actief } : x))
  }

  async function verwijder(id) {
    if (!confirm('Doel verwijderen?')) return
    await api.delete(`/doelen/${id}`)
    setDoelen(d => d.filter(x => x.id !== id))
  }

  const actief  = doelen.filter(d => d.actief)
  const archief = doelen.filter(d => !d.actief)

  return (
    <div className="page">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="t-xl">Doelen</h1>
          <p className="t-sm t-muted" style={{ marginTop: 2 }}>Stel doelen en volg je voortgang</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>
          + Doel
        </button>
      </div>

      {fout && <Card><p className="t-sm t-red">{fout}</p></Card>}

      {/* ── Loading ────────────────────────────────────────────────────── */}
      {laden ? (
        <div className="section-gap">
          {[1,2].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 'var(--r-lg)' }} />)}
        </div>
      ) : (
        <>
          {/* ── Example goals (empty state) ──────────────────────────── */}
          {!doelen.length && (
            <Card>
              <span className="t-label" style={{ display: 'block', marginBottom: 'var(--space-3)' }}>Voorbeelddoelen</span>
              <div className="section-gap" style={{ gap: 'var(--space-2)' }}>
                {VOORBEELDEN.map((v, i) => (
                  <button
                    key={i}
                    onClick={() => { setForm(f => ({ ...f, ...v })); setAddOpen(true) }}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      width: '100%', padding: 'var(--space-3) var(--space-4)',
                      background: 'var(--bg-raised)', border: '1px solid transparent',
                      borderRadius: 'var(--r-sm)', cursor: 'pointer', textAlign: 'left',
                      transition: 'border-color var(--dur-fast)',
                    }}
                  >
                    <span className="t-md" style={{ color: 'var(--text)' }}>{v.titel}</span>
                    <span className="t-sm t-muted">{v.doel_waarde} {v.eenheid}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* ── Active goals ─────────────────────────────────────────── */}
          {actief.length > 0 && (
            <div className="section-gap">
              {actief.map(d => (
                <DoelKaart
                  key={d.id} doel={d}
                  updateId={updateId} updateVal={updateVal}
                  updateLaden={updateLaden}
                  onStartUpdate={startUpdate}
                  onEditDoel={startEditDoel}
                  onUpdateVal={setUpdateVal}
                  onSlaOp={slaUpdateOp}
                  onAnnuleer={() => setUpdateId(null)}
                  onToggle={toggleActief}
                  onVerwijder={verwijder}
                />
              ))}
            </div>
          )}

          {/* ── Empty active state ───────────────────────────────────── */}
          {!doelen.length && (
            <div className="empty-state">
              <span className="empty-icon">🏆</span>
              <span className="t-md">Nog geen doelen</span>
              <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
                Voeg je eerste doel toe
              </button>
            </div>
          )}

          {/* ── Archive ──────────────────────────────────────────────── */}
          {archief.length > 0 && (
            <>
              <span className="t-label" style={{ display: 'block', paddingTop: 'var(--space-2)' }}>Archief</span>
              <div className="section-gap">
                {archief.map(d => (
                  <DoelKaart
                    key={d.id} doel={d} gearchiveerd
                    updateId={updateId} updateVal={updateVal}
                    updateLaden={updateLaden}
                    onStartUpdate={startUpdate}
                    onEditDoel={startEditDoel}
                    onUpdateVal={setUpdateVal}
                    onSlaOp={slaUpdateOp}
                    onAnnuleer={() => setUpdateId(null)}
                    onToggle={toggleActief}
                    onVerwijder={verwijder}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Add / edit goal sheet ──────────────────────────────────────── */}
      <Sheet open={addOpen} onClose={sluitSheet} title={editId ? 'Doel bewerken' : 'Nieuw doel'}>
        <form onSubmit={submit}>
          <div className="section-gap">

            <div className="form-group">
              <label>Titel *</label>
              <input className="input" type="text" value={form.titel} onChange={upd('titel')}
                placeholder="Bijv. Bench press 100 kg" required autoFocus />
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>Sport</label>
                <input className="input" type="text" value={form.sport} onChange={upd('sport')} placeholder="fitness, padel…" />
              </div>
              <div className="form-group">
                <label>Eenheid</label>
                <input className="input" type="text" value={form.eenheid} onChange={upd('eenheid')} placeholder="kg, km, %" />
              </div>
              <div className="form-group">
                <label>Huidige waarde</label>
                <input className="input" type="number" step="any" value={form.huidige_waarde} onChange={upd('huidige_waarde')} />
              </div>
              <div className="form-group">
                <label>Doelwaarde</label>
                <input className="input" type="number" step="any" value={form.doel_waarde} onChange={upd('doel_waarde')} />
              </div>
            </div>

            <div className="form-group">
              <label>Deadline</label>
              <input className="input" type="date" value={form.deadline} onChange={upd('deadline')} />
            </div>

            <div className="form-group">
              <label>Beschrijving</label>
              <textarea className="input" rows={2} value={form.beschrijving} onChange={upd('beschrijving')}
                style={{ resize: 'vertical' }} placeholder="Eventuele toelichting…" />
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={opslaan}>
              {opslaan ? 'Opslaan...' : editId ? 'Wijzigingen opslaan' : 'Doel opslaan'}
            </button>
          </div>
        </form>
      </Sheet>

    </div>
  )
}

// ── Goal card ────────────────────────────────────────────────────────────────

function DoelKaart({ doel: d, gearchiveerd, updateId, updateVal, updateLaden, onStartUpdate, onEditDoel, onUpdateVal, onSlaOp, onAnnuleer, onToggle, onVerwijder }) {
  const pct     = d.doel_waarde && d.huidige_waarde != null
    ? Math.min(100, Math.round((d.huidige_waarde / d.doel_waarde) * 100)) : 0
  const bereikt = pct >= 100
  const isUpdating = updateId === d.id
  const dl      = deadlineLabel(d.deadline)
  const barColor = bereikt ? 'var(--green)' : pctColor(pct)

  return (
    <Card style={{ opacity: gearchiveerd ? 0.6 : 1 }}>
      {/* Top row */}
      <div className="row-between" style={{ marginBottom: 'var(--space-3)' }}>
        <button
          type="button"
          onClick={() => onEditDoel(d)}
          title="Doel bewerken"
          style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {bereikt && <Chip label="✓ Bereikt" color="green" />}
            <span className="t-md" style={{ fontWeight: 600, color: 'var(--text)' }}>{d.titel}</span>
          </div>
          {d.sport && (
            <span className="t-xs t-muted" style={{ marginTop: 2, display: 'block' }}>{d.sport}</span>
          )}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flexShrink: 0 }}>
          {dl && (
            <span style={{ fontSize: 'var(--t-xs)', fontWeight: 700, color: dl.color }}>{dl.tekst}</span>
          )}
          <button
            onClick={() => onStartUpdate(d)}
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '4px', fontSize: 13 }}
            title="Update voortgang"
          >📈</button>
          <button
            onClick={() => onToggle(d.id, d.actief)}
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '4px', fontSize: 13 }}
            title={d.actief ? 'Archiveren' : 'Activeren'}
          >{d.actief ? '📥' : '📤'}</button>
          <button
            onClick={() => onVerwijder(d.id)}
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '0 4px', fontSize: 18, lineHeight: 1 }}
          >×</button>
        </div>
      </div>

      {/* Progress bar */}
      {d.doel_waarde && (
        <>
          <div className="progress-bar" style={{ height: 6 }}>
            <div className="progress-fill" style={{ width: `${pct}%`, background: barColor }} />
          </div>
          <div className="row-between" style={{ marginTop: 'var(--space-2)' }}>
            <span className="t-sm t-muted">{d.huidige_waarde ?? 0} {d.eenheid}</span>
            <span className="t-sm" style={{ fontWeight: 700, color: barColor }}>{pct}%</span>
            <span className="t-sm t-muted">{d.doel_waarde} {d.eenheid}</span>
          </div>
        </>
      )}

      {/* Inline progress update */}
      {isUpdating && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)', alignItems: 'center' }}>
          <input
            type="number" step="any"
            className="input"
            style={{ flex: 1 }}
            value={updateVal}
            onChange={e => onUpdateVal(e.target.value)}
            placeholder={`Nieuwe waarde${d.eenheid ? ` (${d.eenheid})` : ''}`}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') onSlaOp(d.id); if (e.key === 'Escape') onAnnuleer() }}
          />
          <button className="btn btn-primary btn-sm" onClick={() => onSlaOp(d.id)} disabled={updateLaden}>
            {updateLaden ? '...' : 'Opslaan'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onAnnuleer}>✕</button>
        </div>
      )}

      {d.beschrijving && (
        <p className="t-sm t-muted" style={{ marginTop: 'var(--space-2)', fontStyle: 'italic' }}>
          {d.beschrijving}
        </p>
      )}
    </Card>
  )
}
