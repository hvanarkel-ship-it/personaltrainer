import { useState, useEffect } from 'react'
import { api } from '../api.js'

const VOORBEELDEN = [
  { titel: 'Bench press 100 kg', sport: 'fitness', doel_waarde: 100, eenheid: 'kg' },
  { titel: 'Fietsen 100 km', sport: 'fietsen', doel_waarde: 100, eenheid: 'km' },
  { titel: 'Vetpercentage 15%', sport: '', doel_waarde: 15, eenheid: '%' },
]

export default function Doelen({ onNavigeer }) {
  const [doelen, setDoelen] = useState([])
  const [laden, setLaden] = useState(true)
  const [toonForm, setToonForm] = useState(false)
  const [form, setForm] = useState({ titel: '', sport: '', beschrijving: '', doel_waarde: '', huidige_waarde: '', eenheid: '', deadline: '' })
  const [opslaan, setOpslaan] = useState(false)
  const [fout, setFout] = useState('')
  const [updateId, setUpdateId] = useState(null)
  const [updateWaarde, setUpdateWaarde] = useState('')
  const [updateLaden, setUpdateLaden] = useState(false)

  useEffect(() => {
    api.get('/doelen').then(setDoelen).catch(e => setFout(e.message)).finally(() => setLaden(false))
  }, [])

  const upd = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setOpslaan(true)
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''))
      const nieuw = await api.post('/doelen', payload)
      setDoelen(d => [nieuw, ...d])
      setToonForm(false)
      setForm({ titel: '', sport: '', beschrijving: '', doel_waarde: '', huidige_waarde: '', eenheid: '', deadline: '' })
    } catch (err) { setFout(err.message) }
    finally { setOpslaan(false) }
  }

  function startUpdate(doel) {
    setUpdateId(doel.id)
    setUpdateWaarde(doel.huidige_waarde ?? '')
  }

  async function slaUpdateOp(id) {
    const val = parseFloat(updateWaarde)
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

  function vulVoorbeeld(v) {
    setForm(f => ({ ...f, ...v }))
    setToonForm(true)
  }

  const actief = doelen.filter(d => d.actief)
  const archief = doelen.filter(d => !d.actief)

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>🏆 Doelen</h1><p className="subtitle">Stel doelen en volg je voortgang</p></div>
        <button className="btn btn-primary" onClick={() => setToonForm(!toonForm)}>
          {toonForm ? 'Annuleer' : '+ Doel'}
        </button>
      </div>

      {fout && <div className="alert alert-error">{fout}</div>}

      {!doelen.length && !toonForm && (
        <div className="card">
          <h3>Voorbeelddoelen</h3>
          <p className="tip-tip">Start met een van deze doelen:</p>
          <div className="voorbeeld-doelen">
            {VOORBEELDEN.map((v, i) => (
              <button key={i} className="voorbeeld-btn" onClick={() => vulVoorbeeld(v)}>
                <strong>{v.titel}</strong>
                <span>Doel: {v.doel_waarde} {v.eenheid}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {toonForm && (
        <div className="card">
          <h3>Nieuw doel</h3>
          <form onSubmit={submit}>
            <div className="form-group"><label>Titel *</label><input type="text" value={form.titel} onChange={upd('titel')} placeholder="Bijv. Bench press 100 kg" required /></div>
            <div className="form-rij">
              <div className="form-group"><label>Sport</label><input type="text" value={form.sport} onChange={upd('sport')} placeholder="fitness, padel..." /></div>
              <div className="form-group"><label>Eenheid</label><input type="text" value={form.eenheid} onChange={upd('eenheid')} placeholder="kg, km, %" /></div>
            </div>
            <div className="form-rij">
              <div className="form-group"><label>Huidige waarde</label><input type="number" step="any" value={form.huidige_waarde} onChange={upd('huidige_waarde')} /></div>
              <div className="form-group"><label>Doelwaarde</label><input type="number" step="any" value={form.doel_waarde} onChange={upd('doel_waarde')} /></div>
              <div className="form-group"><label>Deadline</label><input type="date" value={form.deadline} onChange={upd('deadline')} /></div>
            </div>
            <div className="form-group"><label>Beschrijving</label><textarea value={form.beschrijving} onChange={upd('beschrijving')} rows="2" /></div>
            <button type="submit" className="btn btn-primary" disabled={opslaan}>{opslaan ? 'Opslaan...' : 'Doel opslaan'}</button>
          </form>
        </div>
      )}

      {laden ? <div className="center-loader"><div className="spinner" /></div> : (
        <>
          {actief.length > 0 && (
            <div className="lijst">
              {actief.map(d => (
                <DoelKaart key={d.id} doel={d}
                  updateId={updateId} updateWaarde={updateWaarde} updateLaden={updateLaden}
                  onStartUpdate={startUpdate}
                  onUpdateWaarde={setUpdateWaarde}
                  onSlaOp={slaUpdateOp}
                  onAnnuleer={() => setUpdateId(null)}
                  onToggle={toggleActief} onVerwijder={verwijder}
                />
              ))}
            </div>
          )}

          {archief.length > 0 && (
            <>
              <h4 className="sectie-titel">Archief</h4>
              <div className="lijst">
                {archief.map(d => (
                  <DoelKaart key={d.id} doel={d} archief
                    updateId={updateId} updateWaarde={updateWaarde} updateLaden={updateLaden}
                    onStartUpdate={startUpdate}
                    onUpdateWaarde={setUpdateWaarde}
                    onSlaOp={slaUpdateOp}
                    onAnnuleer={() => setUpdateId(null)}
                    onToggle={toggleActief} onVerwijder={verwijder}
                  />
                ))}
              </div>
            </>
          )}

          {!doelen.length && <div className="leeg-staat"><p>🏆</p><p>Nog geen doelen. Voeg je eerste doel toe!</p></div>}
        </>
      )}
    </div>
  )
}

function DoelKaart({ doel: d, archief, updateId, updateWaarde, updateLaden, onStartUpdate, onUpdateWaarde, onSlaOp, onAnnuleer, onToggle, onVerwijder }) {
  const pct = d.doel_waarde && d.huidige_waarde != null
    ? Math.min(100, Math.round((d.huidige_waarde / d.doel_waarde) * 100)) : 0
  const bereikt = pct >= 100
  const isUpdating = updateId === d.id

  return (
    <div className={`card doel-kaart ${archief ? 'doel-kaart--archief' : ''} ${bereikt ? 'doel-kaart--bereikt' : ''}`}>
      <div className="doel-kop">
        <div className="doel-info">
          {bereikt && <span className="badge-bereikt">✓ Bereikt!</span>}
          <strong>{d.titel}</strong>
          {d.sport && <span className="doel-sport">{d.sport}</span>}
        </div>
        <div className="doel-acties">
          <button className="icon-btn sm" onClick={() => onStartUpdate(d)} title="Update voortgang">✏️</button>
          <button className="icon-btn sm" onClick={() => onToggle(d.id, d.actief)} title={d.actief ? 'Archiveren' : 'Activeren'}>{d.actief ? '📥' : '📤'}</button>
          <button className="verwijder-btn" onClick={() => onVerwijder(d.id)}>×</button>
        </div>
      </div>

      {d.doel_waarde && (
        <>
          <div className="voortgang-balk">
            <div className={`voortgang-fill ${bereikt ? 'voortgang-bereikt' : 'voortgang-primary'}`} style={{ width: pct + '%' }} />
          </div>
          <div className="doel-waarden">
            <span>{d.huidige_waarde ?? 0} {d.eenheid}</span>
            <span className="doel-pct">{pct}%</span>
            <span>{d.doel_waarde} {d.eenheid}</span>
          </div>
        </>
      )}

      {/* Inline voortgang update */}
      {isUpdating && (
        <div className="doel-update-rij">
          <input
            type="number"
            step="any"
            className="doel-update-input"
            value={updateWaarde}
            onChange={e => onUpdateWaarde(e.target.value)}
            placeholder={`Nieuwe waarde (${d.eenheid || ''})`}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') onSlaOp(d.id); if (e.key === 'Escape') onAnnuleer() }}
          />
          <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={() => onSlaOp(d.id)} disabled={updateLaden}>
            {updateLaden ? '...' : 'Opslaan'}
          </button>
          <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: '0.82rem' }} onClick={onAnnuleer}>✕</button>
        </div>
      )}

      {d.deadline && <p className="doel-deadline">📅 {new Date(d.deadline).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
      {d.beschrijving && <p className="doel-beschrijving">{d.beschrijving}</p>}
    </div>
  )
}
