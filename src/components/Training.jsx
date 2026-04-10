import { useState, useEffect } from 'react'
import { api, datumNl } from '../api.js'

const SPORTEN = ['fitness', 'hardlopen', 'fietsen', 'padel', 'zwemmen', 'tennis', 'wandelen', 'yoga', 'wielrennen', 'voetbal']
const SPORT_ICONS = { fitness: '🏋️', hardlopen: '🏃', fietsen: '🚴', padel: '🎾', zwemmen: '🏊', tennis: '🎾', wandelen: '🚶', yoga: '🧘', wielrennen: '🚵', voetbal: '⚽' }

function vandaagStr() { return new Date().toISOString().split('T')[0] }

export default function Training({ onNavigeer }) {
  const [trainingen, setTrainingen] = useState([])
  const [laden, setLaden] = useState(true)
  const [toonForm, setToonForm] = useState(false)
  const [form, setForm] = useState({
    datum: vandaagStr(), sport: 'fitness', duur_min: '', kcal: '',
    gem_hartslag: '', max_hartslag: '', hrv_ochtend: '', slaap_uur: '',
    slaapscore: '', herstelbalans: '', zone2_min: '', zone3_min: '', zone4_min: '', notities: ''
  })
  const [opslaan, setOpslaan] = useState(false)
  const [fout, setFout] = useState('')

  useEffect(() => {
    api.get('/training').then(setTrainingen).catch(e => setFout(e.message)).finally(() => setLaden(false))
  }, [])

  const upd = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setFout('')
    setOpslaan(true)
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''))
      const nieuw = await api.post('/training', payload)
      setTrainingen(t => [nieuw, ...t])
      setToonForm(false)
      setForm({ datum: vandaagStr(), sport: 'fitness', duur_min: '', kcal: '', gem_hartslag: '', max_hartslag: '', hrv_ochtend: '', slaap_uur: '', slaapscore: '', herstelbalans: '', zone2_min: '', zone3_min: '', zone4_min: '', notities: '' })
    } catch (err) { setFout(err.message) }
    finally { setOpslaan(false) }
  }

  async function verwijder(id) {
    if (!confirm('Training verwijderen?')) return
    try {
      await api.delete(`/training/${id}`)
      setTrainingen(t => t.filter(x => x.id !== id))
    } catch (err) { setFout('Verwijderen mislukt: ' + err.message) }
  }

  // Weekbelasting (laatste 7 dagen) — herstel-only entries tellen niet mee
  const vandaag = vandaagStr()
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    const ds = d.toISOString().split('T')[0]
    const dagTrainingen = trainingen.filter(t => t.datum === ds && t.sport !== 'herstel')
    return {
      datum: ds,
      label: d.toLocaleDateString('nl-NL', { weekday: 'short' }),
      minuten: dagTrainingen.reduce((s, t) => s + (t.duur_min || 0), 0),
      sessies: dagTrainingen.length,
    }
  })
  const maxMin = Math.max(...week.map(d => d.minuten), 60)
  const weekTotaalMin = week.reduce((s, d) => s + d.minuten, 0)
  const weekSessies = week.reduce((s, d) => s + d.sessies, 0)

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>🏋️ Training</h1><p className="subtitle">Log en volg je workouts</p></div>
        <button className="btn btn-primary" onClick={() => setToonForm(!toonForm)}>
          {toonForm ? 'Annuleer' : '+ Training'}
        </button>
      </div>

      {fout && <div className="alert alert-error">{fout}</div>}

      {/* Weekbelasting */}
      <div className="card">
        <div className="card-header">
          <h3>Weekbelasting</h3>
          {weekSessies > 0 && (
            <div className="week-samenvatting">
              <span>{weekSessies} {weekSessies === 1 ? 'sessie' : 'sessies'}</span>
              <span>{weekTotaalMin >= 60 ? `${Math.floor(weekTotaalMin / 60)}u${weekTotaalMin % 60 ? weekTotaalMin % 60 + 'm' : ''}` : `${weekTotaalMin}m`}</span>
            </div>
          )}
        </div>
        <div className="week-chart">
          {week.map((d) => (
            <div key={d.datum} className="week-dag">
              <div className="week-balk-wrap">
                <div className={`week-balk ${d.datum === vandaag ? 'week-balk--vandaag' : ''} ${d.sessies > 1 ? 'week-balk--meerdere' : ''}`}
                  style={{ height: Math.max(4, (d.minuten / maxMin) * 60) + 'px' }} />
              </div>
              <div className="week-label">{d.label}</div>
              {d.minuten > 0 && <div className="week-min">{d.minuten}m</div>}
            </div>
          ))}
        </div>
      </div>

      {toonForm && (
        <div className="card">
          <h3>Nieuwe training</h3>
          <form onSubmit={submit}>
            <div className="sport-keuze">
              {SPORTEN.map(s => (
                <button key={s} type="button" className={`sport-btn ${form.sport === s ? 'active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, sport: s }))}>
                  <span>{SPORT_ICONS[s]}</span><span>{s}</span>
                </button>
              ))}
            </div>

            <div className="form-rij">
              <div className="form-group"><label>Datum</label><input type="date" value={form.datum} onChange={upd('datum')} /></div>
              <div className="form-group"><label>Duur (min)</label><input type="number" min="1" value={form.duur_min} onChange={upd('duur_min')} placeholder="60" /></div>
              <div className="form-group"><label>Calorieën</label><input type="number" value={form.kcal} onChange={upd('kcal')} placeholder="400" /></div>
            </div>

            <details className="form-details">
              <summary>💓 Hartslag &amp; zones</summary>
              <div className="form-rij" style={{ marginTop: 10 }}>
                <div className="form-group"><label>Gem. HR</label><input type="number" value={form.gem_hartslag} onChange={upd('gem_hartslag')} placeholder="145" /></div>
                <div className="form-group"><label>Max HR</label><input type="number" value={form.max_hartslag} onChange={upd('max_hartslag')} placeholder="175" /></div>
                <div className="form-group"><label>Zone 2 (min)</label><input type="number" value={form.zone2_min} onChange={upd('zone2_min')} /></div>
                <div className="form-group"><label>Zone 3 (min)</label><input type="number" value={form.zone3_min} onChange={upd('zone3_min')} /></div>
                <div className="form-group"><label>Zone 4+ (min)</label><input type="number" value={form.zone4_min} onChange={upd('zone4_min')} /></div>
              </div>
            </details>

            <details className="form-details">
              <summary>😴 Herstel &amp; slaap</summary>
              <div className="form-rij" style={{ marginTop: 10 }}>
                <div className="form-group"><label>HRV ochtend</label><input type="number" value={form.hrv_ochtend} onChange={upd('hrv_ochtend')} placeholder="65" /></div>
                <div className="form-group"><label>Slaap (uur)</label><input type="number" step="0.1" value={form.slaap_uur} onChange={upd('slaap_uur')} placeholder="7.5" /></div>
                <div className="form-group"><label>Slaapscore</label><input type="number" value={form.slaapscore} onChange={upd('slaapscore')} placeholder="78" /></div>
                <div className="form-group"><label>Herstelbalans</label><input type="number" step="0.1" value={form.herstelbalans} onChange={upd('herstelbalans')} placeholder="+5.2" /></div>
              </div>
            </details>

            <div className="form-group"><label>Notities</label><textarea value={form.notities} onChange={upd('notities')} rows="2" placeholder="Hoe voelde de training?" /></div>

            <div className="tip-tip">
              💡 Of upload een <button type="button" className="link-btn" onClick={() => onNavigeer('coach')}>Suunto screenshot in de Coach</button> voor automatische data-extractie.
            </div>

            <button type="submit" className="btn btn-primary" disabled={opslaan}>
              {opslaan ? 'Opslaan...' : 'Training opslaan'}
            </button>
          </form>
        </div>
      )}

      {laden ? <div className="center-loader"><div className="spinner" /></div> : (() => {
        const echte = trainingen.filter(t => t.sport !== 'herstel')
        return echte.length === 0
          ? <div className="leeg-staat"><p>🏋️</p><p>Nog geen trainingen gelogd.</p></div>
          : <div className="lijst">{echte.map(t => <TrainingKaart key={t.id} t={t} onVerwijder={verwijder} />)}</div>
      })()}
    </div>
  )
}

function TrainingKaart({ t, onVerwijder }) {
  const totaalZone = (t.zone2_min || 0) + (t.zone3_min || 0) + (t.zone4_min || 0)
  const heeftZones = totaalZone > 0

  return (
    <div className="card training-kaart">
      <div className="training-kop">
        <div className="training-info">
          <span className="sport-icon">{SPORT_ICONS[t.sport] || '⚽'}</span>
          <div>
            <strong>{t.sport.charAt(0).toUpperCase() + t.sport.slice(1)}</strong>
            <span className="training-datum">
              {datumNl(t.datum, { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          </div>
        </div>
        <button className="verwijder-btn" onClick={() => onVerwijder(t.id)}>×</button>
      </div>

      <div className="training-stats">
        {t.duur_min && <span className="stat-badge">⏱ {t.duur_min}min</span>}
        {t.kcal && <span className="stat-badge">🔥 {t.kcal}kcal</span>}
        {t.gem_hartslag && <span className="stat-badge">💓 {t.gem_hartslag}bpm</span>}
        {t.hrv_ochtend && <span className="stat-badge">HRV {t.hrv_ochtend}</span>}
        {t.slaap_uur && <span className="stat-badge">😴 {t.slaap_uur}u</span>}
      </div>

      {/* Zone distributie */}
      {heeftZones && (
        <div className="zone-distributie">
          {t.zone2_min > 0 && (
            <div className="zone-segment zone-z2" style={{ flex: t.zone2_min }}>
              <span>Z2 {t.zone2_min}m</span>
            </div>
          )}
          {t.zone3_min > 0 && (
            <div className="zone-segment zone-z3" style={{ flex: t.zone3_min }}>
              <span>Z3 {t.zone3_min}m</span>
            </div>
          )}
          {t.zone4_min > 0 && (
            <div className="zone-segment zone-z4" style={{ flex: t.zone4_min }}>
              <span>Z4+ {t.zone4_min}m</span>
            </div>
          )}
        </div>
      )}

      {t.notities && <p className="training-notities">{t.notities}</p>}
    </div>
  )
}
