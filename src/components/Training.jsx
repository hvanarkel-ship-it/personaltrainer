import { useState, useEffect } from 'react'
import { api, datumNl } from '../api.js'
import SportIcoon, { SPORT_KLEUR, SPORT_LABEL, normMin } from '../sportIcoon.jsx'

const SPORTEN = ['fitness', 'hardlopen', 'fietsen', 'wielrennen', 'zwemmen', 'padel', 'tennis', 'wandelen', 'yoga', 'voetbal', 'overig']

function rpeInfo(rpe) {
  if (!rpe) return null
  if (rpe <= 3) return { label: 'Licht', omschrijving: 'Actief herstel — comfortabel gesprek mogelijk', kleur: '#0891b2', bg: '#ecfeff', cat: 'licht' }
  if (rpe <= 6) return { label: 'Matig', omschrijving: 'Aerobe zone — gecontroleerde ademhaling', kleur: '#a16207', bg: '#fefce8', cat: 'matig' }
  if (rpe <= 8) return { label: 'Zwaar', omschrijving: 'Tempo-zone — spreken is moeilijk', kleur: '#c2410c', bg: '#fff7ed', cat: 'zwaar' }
  return { label: 'Maximaal', omschrijving: 'Anaeroob — korte herhalingen, volle sprint', kleur: '#dc2626', bg: '#fef2f2', cat: 'max' }
}

const pad2 = n => String(n).padStart(2, '0')
function vandaagStr() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}` }
function normDatum(d) {
  if (!d) return ''
  if (d instanceof Date) return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
  return String(d).slice(0, 10)
}

export default function Training({ onNavigeer }) {
  const [trainingen, setTrainingen] = useState([])
  const [laden, setLaden] = useState(true)
  const [toonForm, setToonForm] = useState(false)
  const [form, setForm] = useState({
    datum: vandaagStr(), sport: 'fitness', duur_min: '', kcal: '',
    gem_hartslag: '', max_hartslag: '', hrv_ochtend: '', slaap_uur: '',
    slaapscore: '', herstelbalans: '', zone2_min: '', zone3_min: '', zone4_min: '',
    rpe: '', notities: ''
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
      setForm({
        datum: vandaagStr(), sport: 'fitness', duur_min: '', kcal: '',
        gem_hartslag: '', max_hartslag: '', hrv_ochtend: '', slaap_uur: '',
        slaapscore: '', herstelbalans: '', zone2_min: '', zone3_min: '', zone4_min: '',
        rpe: '', notities: ''
      })
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

  // Weekbelasting — bars driven by training load (duur × RPE-factor)
  const vandaag = vandaagStr()
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    const ds = d.toISOString().split('T')[0]
    const dag = trainingen.filter(t => normDatum(t.datum) === ds && t.sport !== 'herstel')
    const minuten = dag.reduce((s, t) => s + (t.duur_min || 0), 0)
    const load = dag.reduce((s, t) => s + (t.duur_min || 0) * ((t.rpe ? parseInt(t.rpe) : 5) / 10), 0)
    return { datum: ds, label: d.toLocaleDateString('nl-NL', { weekday: 'short' }), minuten, sessies: dag.length, load: Math.round(load) }
  })
  const maxVal = Math.max(...week.map(d => d.load || d.minuten), 60)
  const weekTotaalMin = week.reduce((s, d) => s + d.minuten, 0)
  const weekSessies = week.reduce((s, d) => s + d.sessies, 0)
  const weekLoad = week.reduce((s, d) => s + d.load, 0)

  const echte = trainingen.filter(t => t.sport !== 'herstel')

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Training</h1><p className="subtitle">Log en volg je workouts</p></div>
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
              <span>{weekSessies} sessie{weekSessies !== 1 ? 's' : ''}</span>
              <span>{weekTotaalMin >= 60 ? `${Math.floor(weekTotaalMin / 60)}u${weekTotaalMin % 60 ? weekTotaalMin % 60 + 'm' : ''}` : `${weekTotaalMin}m`}</span>
              {weekLoad > 0 && <span className="week-load-badge">Load {weekLoad}</span>}
            </div>
          )}
        </div>
        <div className="week-chart">
          {week.map((d) => (
            <div key={d.datum} className="week-dag">
              <div className="week-balk-wrap">
                <div
                  className={`week-balk ${d.datum === vandaag ? 'week-balk--vandaag' : ''} ${d.sessies > 1 ? 'week-balk--meerdere' : ''}`}
                  style={{ height: Math.max(4, ((d.load || d.minuten) / maxVal) * 60) + 'px' }}
                />
              </div>
              <div className="week-label">{d.label}</div>
              {d.minuten > 0 && <div className="week-min">{d.minuten}m</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Nieuw training formulier */}
      {toonForm && (
        <div className="card">
          <h3>Nieuwe training</h3>
          <form onSubmit={submit}>
            <div className="sport-keuze">
              {SPORTEN.map(s => (
                <button key={s} type="button"
                  className={`sport-btn ${form.sport === s ? 'active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, sport: s }))}>
                  <SportIcoon sport={s} size={20} />
                  <span>{SPORT_LABEL[s]}</span>
                </button>
              ))}
            </div>

            <div className="form-rij">
              <div className="form-group"><label>Datum</label><input type="date" value={form.datum} onChange={upd('datum')} /></div>
              <div className="form-group"><label>Duur (min)</label><input type="number" min="1" value={form.duur_min} onChange={upd('duur_min')} placeholder="60" /></div>
              <div className="form-group"><label>Calorieën</label><input type="number" value={form.kcal} onChange={upd('kcal')} placeholder="400" /></div>
            </div>

            {/* RPE — Rate of Perceived Exertion */}
            <div className="form-group">
              <label>Inspanning (RPE 1–10)</label>
              <div className="rpe-keuze">
                {[1,2,3,4,5,6,7,8,9,10].map(n => {
                  const info = rpeInfo(n)
                  return (
                    <button key={n} type="button"
                      className={`rpe-btn rpe-btn--${info.cat} ${form.rpe == n ? 'active' : ''}`}
                      onClick={() => setForm(f => ({ ...f, rpe: f.rpe == n ? '' : String(n) }))}>
                      {n}
                    </button>
                  )
                })}
              </div>
              {form.rpe && (() => {
                const info = rpeInfo(parseInt(form.rpe))
                return <p className="rpe-hint" style={{ color: info.kleur }}>{info.label} — {info.omschrijving}</p>
              })()}
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

            <div className="form-group">
              <label>Notities</label>
              <textarea value={form.notities} onChange={upd('notities')} rows="2" placeholder="Hoe voelde de training?" />
            </div>

            <div className="tip-tip">
              💡 Of upload een <button type="button" className="link-btn" onClick={() => onNavigeer('coach')}>Suunto screenshot in de Coach</button> voor automatische data-extractie.
            </div>

            <button type="submit" className="btn btn-primary" disabled={opslaan}>
              {opslaan ? 'Opslaan...' : 'Training opslaan'}
            </button>
          </form>
        </div>
      )}

      {/* Trainingslijst */}
      {laden
        ? <div className="center-loader"><div className="spinner" /></div>
        : echte.length === 0
          ? <div className="leeg-staat"><p style={{ fontSize: '2rem' }}>🏃</p><p>Nog geen trainingen gelogd.</p></div>
          : <div className="lijst">{echte.map(t => <TrainingKaart key={t.id} t={t} onVerwijder={verwijder} />)}</div>
      }
    </div>
  )
}

function TrainingKaart({ t, onVerwijder }) {
  const kleur = SPORT_KLEUR[t.sport] || SPORT_KLEUR.overig
  const totaalZone = (t.zone2_min || 0) + (t.zone3_min || 0) + (t.zone4_min || 0)
  const rpe = t.rpe ? parseInt(t.rpe) : null
  const rpeI = rpeInfo(rpe)
  const trainingLoad = rpe && t.duur_min ? Math.round(t.duur_min * rpe / 10) : null

  return (
    <div className="card training-kaart" style={{ borderLeft: `3px solid ${kleur.kleur}` }}>
      <div className="training-kop">
        <div className="training-info">
          <div className="sport-icoon-badge" style={{ background: kleur.bg, color: kleur.kleur }}>
            <SportIcoon sport={t.sport} size={18} />
          </div>
          <div>
            <strong>{SPORT_LABEL[t.sport] || t.sport}</strong>
            <span className="training-datum">
              {datumNl(t.datum, { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {rpe && (
            <span className="rpe-badge" style={{ background: rpeI.bg, color: rpeI.kleur }}>
              RPE {rpe}
            </span>
          )}
          <button className="verwijder-btn" onClick={() => onVerwijder(t.id)}>×</button>
        </div>
      </div>

      <div className="training-stats">
        {t.duur_min && <span className="stat-badge">⏱ {t.duur_min} min</span>}
        {t.kcal && <span className="stat-badge">🔥 {t.kcal} kcal</span>}
        {t.gem_hartslag && <span className="stat-badge">💓 {t.gem_hartslag} bpm</span>}
        {t.hrv_ochtend && <span className="stat-badge">HRV {t.hrv_ochtend}</span>}
        {t.slaap_uur && <span className="stat-badge">😴 {t.slaap_uur}u</span>}
        {trainingLoad != null && <span className="stat-badge stat-badge--load">Load {trainingLoad}</span>}
      </div>

      {totaalZone > 0 && (
        <div className="zone-distributie">
          {t.zone2_min > 0 && <div className="zone-segment zone-z2" style={{ flex: t.zone2_min }}><span>Z2 {t.zone2_min}m</span></div>}
          {t.zone3_min > 0 && <div className="zone-segment zone-z3" style={{ flex: t.zone3_min }}><span>Z3 {t.zone3_min}m</span></div>}
          {t.zone4_min > 0 && <div className="zone-segment zone-z4" style={{ flex: t.zone4_min }}><span>Z4+ {t.zone4_min}m</span></div>}
        </div>
      )}

      {t.notities && <p className="training-notities">{t.notities}</p>}
    </div>
  )
}
