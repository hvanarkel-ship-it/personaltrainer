import { useState, useEffect } from 'react'
import { api, datumNl } from '../api.js'
import SportIcoon, { SPORT_LABEL, normMin } from '../sportIcoon.jsx'
import Card from './ui/Card.jsx'
import Sheet from './ui/Sheet.jsx'
import Chip from './ui/Chip.jsx'

// ── Constants ───────────────────────────────────────────────────────────────

const SPORTEN = ['hyrox','hardlopen','fitness','fietsen','zwemmen','padel','tennis','wandelen','yoga','voetbal','overig']
const MAANDEN = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December']
const DAGEN   = ['Ma','Di','Wo','Do','Vr','Za','Zo']

const SPORT_COLOR = {
  hardlopen: 'var(--blue)',    fietsen:   'var(--amber)',
  fitness:   'var(--green)',   zwemmen:   '#5eb8ff',
  padel:     '#c084fc',        tennis:    '#c084fc',
  wandelen:  'var(--green)',   yoga:      '#f472b6',
  voetbal:   'var(--blue)',    hyrox:     'var(--red)',
  overig:    'var(--text-3)',  wielrennen: 'var(--amber)',
}

const BRON_COLOR = {
  suunto:    'blue',   intervals: 'amber',
  runalyze:  'green',  handmatig: 'muted',
}
const BRON_LABEL = {
  suunto: 'Suunto', intervals: 'Intervals', runalyze: 'Runalyze', handmatig: 'Handmatig',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const pad2 = n => String(n).padStart(2, '0')
function vandaagStr() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}` }
function normDatum(d) {
  if (!d) return ''
  if (d instanceof Date) return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
  return String(d).slice(0, 10)
}
function fmtMin(min) {
  if (!min) return '—'
  return min >= 60 ? `${Math.floor(min/60)}u${min%60 ? min%60+'m' : ''}` : `${min}m`
}

function rpeColor(rpe) {
  if (!rpe) return 'var(--text-3)'
  if (rpe <= 3) return 'var(--blue)'
  if (rpe <= 6) return 'var(--amber)'
  if (rpe <= 8) return '#f97316'
  return 'var(--red)'
}
function rpeLabel(rpe) {
  if (!rpe) return ''
  if (rpe <= 3) return 'Licht'
  if (rpe <= 6) return 'Matig'
  if (rpe <= 8) return 'Zwaar'
  return 'Maximaal'
}
function rpeHint(rpe) {
  if (!rpe) return ''
  if (rpe <= 3) return 'Actief herstel — comfortabel gesprek mogelijk'
  if (rpe <= 6) return 'Aerobe zone — gecontroleerde ademhaling'
  if (rpe <= 8) return 'Tempo-zone — spreken is moeilijk'
  return 'Anaeroob — korte herhalingen, volle sprint'
}

const LEEG_FORM = {
  datum: vandaagStr(), sport: 'fitness', duur_min: '', kcal: '',
  gem_hartslag: '', max_hartslag: '', hrv_ochtend: '', slaap_uur: '',
  slaap_score: '', herstel_balans: '', zone2_min: '', zone3_min: '', zone4_min: '',
  rpe: '', notities: '',
}

// ── Main component ──────────────────────────────────────────────────────────

export default function Training({ onNavigeer }) {
  const [trainingen, setTrainingen] = useState([])
  const [laden, setLaden]           = useState(true)
  const [sheetOpen, setSheetOpen]   = useState(false)
  const [form, setForm]             = useState(LEEG_FORM)
  const [opslaan, setOpslaan]       = useState(false)
  const [fout, setFout]             = useState('')
  const [bronFilter, setBronFilter] = useState('alle')

  useEffect(() => {
    api.get('/training?limit=2000')
      .then(setTrainingen)
      .catch(e => setFout(e.message))
      .finally(() => setLaden(false))
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
      setSheetOpen(false)
      setForm(LEEG_FORM)
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

  // ── Week load chart ──────────────────────────────────────────────────────

  const vandaag = vandaagStr()
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    const ds = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
    const dag = trainingen.filter(t => normDatum(t.datum) === ds && t.sport !== 'herstel')
    const minuten = dag.reduce((s, t) => s + normMin(t.duur_min), 0)
    const load = dag.reduce((s, t) => s + normMin(t.duur_min) * ((t.rpe ? parseInt(t.rpe) : 5) / 10), 0)
    return {
      datum: ds, label: d.toLocaleDateString('nl-NL', { weekday: 'short' }).slice(0, 2),
      minuten, sessies: dag.length, load: Math.round(load),
      isVandaag: ds === vandaag,
    }
  })
  const maxVal = Math.max(...week.map(d => d.load || d.minuten), 60)
  const weekMin     = week.reduce((s, d) => s + d.minuten, 0)
  const weekSessies = week.reduce((s, d) => s + d.sessies, 0)
  const weekLoad    = week.reduce((s, d) => s + d.load, 0)

  // ── Filtered list ────────────────────────────────────────────────────────

  const echte = trainingen.filter(t => t.sport !== 'herstel')
  const gefilterd = bronFilter === 'alle' ? echte : echte.filter(t => (t.bron || 'handmatig') === bronFilter)
  const bronTelling = echte.reduce((acc, t) => {
    const b = t.bron || 'handmatig'
    acc[b] = (acc[b] || 0) + 1
    return acc
  }, {})
  const meerdereBronnen = Object.keys(bronTelling).length > 1

  return (
    <div className="page">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="t-xl">Training</h1>
          <p className="t-sm t-muted" style={{ marginTop: 2 }}>Log en volg je workouts</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button className="btn btn-icon btn-sm" onClick={() => onNavigeer('statistieken')} title="Statistieken" style={{ padding: '8px', minWidth: 36 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setSheetOpen(true)}>+ Training</button>
        </div>
      </div>

      {fout && <Card><p className="t-sm t-red">{fout}</p></Card>}

      {/* ── Week load ──────────────────────────────────────────────────── */}
      <Card>
        <div className="card-header">
          <span className="t-lg">Weekbelasting</span>
          {weekSessies > 0 && (
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
              <span className="t-sm t-muted">{weekSessies} sessie{weekSessies !== 1 ? 's' : ''}</span>
              <span className="t-sm t-muted">{fmtMin(weekMin)}</span>
              {weekLoad > 0 && <Chip label={`Load ${weekLoad}`} color="blue" />}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, height: 72, alignItems: 'flex-end' }}>
          {week.map(d => {
            const h = Math.max(4, Math.round(((d.load || d.minuten) / maxVal) * 64))
            const color = d.isVandaag ? 'var(--green)' : d.sessies > 1 ? 'var(--blue)' : 'var(--bg-surface)'
            const borderColor = d.isVandaag ? 'var(--green)' : d.sessies > 0 ? 'var(--bg-raised)' : 'transparent'
            return (
              <div key={d.datum} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{
                    width: '100%', height: h, background: d.sessies > 0 ? color : 'var(--bg-surface)',
                    borderRadius: 4, border: `1px solid ${borderColor}`,
                    transition: 'height var(--dur-slow) var(--ease-out)',
                  }} />
                </div>
                {d.minuten > 0 && (
                  <span style={{ fontSize: 8, color: 'var(--text-3)', fontWeight: 600 }}>
                    {fmtMin(d.minuten)}
                  </span>
                )}
                <span style={{
                  fontSize: 10, fontWeight: d.isVandaag ? 700 : 400,
                  color: d.isVandaag ? 'var(--text)' : 'var(--text-3)',
                }}>
                  {d.label}
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── Month calendar ─────────────────────────────────────────────── */}
      {!laden && <MaandOverzicht trainingen={trainingen} />}

      {/* ── Source filter ──────────────────────────────────────────────── */}
      {!laden && echte.length > 0 && meerdereBronnen && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <FilterChip label={`Alles (${echte.length})`} active={bronFilter === 'alle'} onClick={() => setBronFilter('alle')} />
          {Object.entries(bronTelling).sort((a, b) => b[1] - a[1]).map(([b, n]) => (
            <FilterChip
              key={b}
              label={`${BRON_LABEL[b] || b} (${n})`}
              active={bronFilter === b}
              color={BRON_COLOR[b]}
              onClick={() => setBronFilter(b)}
            />
          ))}
        </div>
      )}

      {/* ── Training list ──────────────────────────────────────────────── */}
      {laden ? (
        <div className="section-gap">
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 'var(--r-lg)' }} />)}
        </div>
      ) : gefilterd.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🏃</span>
          <span className="t-md">{echte.length === 0 ? 'Nog geen trainingen gelogd' : 'Geen trainingen voor dit filter'}</span>
          {echte.length === 0 && <button className="btn btn-primary" onClick={() => setSheetOpen(true)}>Log je eerste training</button>}
        </div>
      ) : (
        <div className="section-gap">
          {gefilterd.map(t => <TrainingKaart key={t.id} t={t} onVerwijder={verwijder} />)}
        </div>
      )}

      {/* ── Log training sheet ─────────────────────────────────────────── */}
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Nieuwe training">
        <form onSubmit={submit}>
          <div className="section-gap">

            {/* Sport picker */}
            <div className="form-group">
              <label>Sport</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)' }}>
                {SPORTEN.map(s => {
                  const active = form.sport === s
                  const color = SPORT_COLOR[s] || 'var(--text-3)'
                  return (
                    <button
                      key={s} type="button"
                      onClick={() => setForm(f => ({ ...f, sport: s }))}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        padding: '10px 4px',
                        background: active ? 'var(--bg-surface)' : 'var(--bg-raised)',
                        border: active ? `1px solid ${color}` : '1px solid transparent',
                        borderRadius: 'var(--r-sm)', cursor: 'pointer',
                        color: active ? color : 'var(--text-3)',
                        transition: 'border-color var(--dur-fast), color var(--dur-fast)',
                      }}
                    >
                      <SportIcoon sport={s} size={18} />
                      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        {SPORT_LABEL[s] || s}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Core fields */}
            <div className="form-grid-2">
              <div className="form-group">
                <label>Datum</label>
                <input className="input" type="date" value={form.datum} onChange={upd('datum')} />
              </div>
              <div className="form-group">
                <label>Duur (min)</label>
                <input className="input" type="number" min="1" value={form.duur_min} onChange={upd('duur_min')} placeholder="60" />
              </div>
              <div className="form-group">
                <label>Calorieën</label>
                <input className="input" type="number" value={form.kcal} onChange={upd('kcal')} placeholder="400" />
              </div>
              <div className="form-group">
                <label>Gem. HR</label>
                <input className="input" type="number" value={form.gem_hartslag} onChange={upd('gem_hartslag')} placeholder="145" />
              </div>
            </div>

            {/* RPE */}
            <div className="form-group">
              <label>Inspanning (RPE)</label>
              <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => {
                  const active = form.rpe == n
                  const color = rpeColor(n)
                  return (
                    <button
                      key={n} type="button"
                      onClick={() => setForm(f => ({ ...f, rpe: f.rpe == n ? '' : String(n) }))}
                      style={{
                        flex: 1, height: 36,
                        background: active ? color : 'var(--bg-raised)',
                        border: `1px solid ${active ? color : 'transparent'}`,
                        borderRadius: 'var(--r-xs)',
                        color: active ? (n <= 6 ? 'rgba(0,0,0,0.8)' : '#fff') : 'var(--text-3)',
                        fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        transition: 'background var(--dur-fast), color var(--dur-fast)',
                      }}
                    >{n}</button>
                  )
                })}
              </div>
              {form.rpe && (
                <p className="t-sm" style={{ color: rpeColor(parseInt(form.rpe)), marginTop: 4 }}>
                  {rpeLabel(parseInt(form.rpe))} — {rpeHint(parseInt(form.rpe))}
                </p>
              )}
            </div>

            {/* HR zones */}
            <div className="form-group">
              <label>Hartslag zones (min)</label>
              <div className="form-grid-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="form-group">
                  <label>Zone 2</label>
                  <input className="input" type="number" value={form.zone2_min} onChange={upd('zone2_min')} placeholder="0" />
                </div>
                <div className="form-group">
                  <label>Zone 3</label>
                  <input className="input" type="number" value={form.zone3_min} onChange={upd('zone3_min')} placeholder="0" />
                </div>
                <div className="form-group">
                  <label>Zone 4+</label>
                  <input className="input" type="number" value={form.zone4_min} onChange={upd('zone4_min')} placeholder="0" />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="form-group">
              <label>Notities</label>
              <textarea
                className="input"
                rows={2}
                value={form.notities}
                onChange={upd('notities')}
                placeholder="Hoe voelde de training?"
                style={{ resize: 'vertical' }}
              />
            </div>

            <p className="t-sm t-muted" style={{ textAlign: 'center' }}>
              Of upload een Suunto screenshot in{' '}
              <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline', padding: '0 4px' }} onClick={() => { setSheetOpen(false); onNavigeer('coach') }}>
                de Coach
              </button>{' '}
              voor automatische extractie.
            </p>

            {fout && <p className="t-sm t-red">{fout}</p>}

            <button type="submit" className="btn btn-primary btn-full" disabled={opslaan}>
              {opslaan ? 'Opslaan...' : 'Training opslaan'}
            </button>
          </div>
        </form>
      </Sheet>

    </div>
  )
}

// ── Month calendar ──────────────────────────────────────────────────────────

function MaandOverzicht({ trainingen }) {
  const vandaag = new Date()
  const [jaar, setJaar]   = useState(vandaag.getFullYear())
  const [maand, setMaand] = useState(vandaag.getMonth())

  function vorige() {
    if (maand === 0) { setJaar(j => j - 1); setMaand(11) } else setMaand(m => m - 1)
  }
  function volgende() {
    const nu = new Date()
    if (jaar > nu.getFullYear() || (jaar === nu.getFullYear() && maand >= nu.getMonth())) return
    if (maand === 11) { setJaar(j => j + 1); setMaand(0) } else setMaand(m => m + 1)
  }

  const isHuidig = jaar === vandaag.getFullYear() && maand === vandaag.getMonth()
  const prefix   = `${jaar}-${pad2(maand + 1)}`
  const maandT   = trainingen.filter(t => t.sport !== 'herstel' && normDatum(t.datum).startsWith(prefix))

  const eersteVdMaand = new Date(jaar, maand, 1)
  const dagVdWeek     = (eersteVdMaand.getDay() + 6) % 7
  const aantalDagen   = new Date(jaar, maand + 1, 0).getDate()

  const cellen = []
  for (let i = 0; i < dagVdWeek; i++) cellen.push(null)
  for (let d = 1; d <= aantalDagen; d++) cellen.push(d)

  const perDag = {}
  for (const t of maandT) {
    const d = parseInt(normDatum(t.datum).slice(8, 10))
    if (!perDag[d]) perDag[d] = []
    perDag[d].push(t)
  }

  const sessies   = maandT.length
  const totaalMin = maandT.reduce((s, t) => s + normMin(t.duur_min), 0)
  const totaalLoad = maandT.reduce((s, t) => s + normMin(t.duur_min) * ((t.rpe ? parseInt(t.rpe) : 5) / 10), 0)
  const sportTelling = {}
  for (const t of maandT) sportTelling[t.sport] = (sportTelling[t.sport] || 0) + 1
  const topSport = Object.entries(sportTelling).sort((a, b) => b[1] - a[1])[0]?.[0]
  const vandaagDag = isHuidig ? vandaag.getDate() : null

  return (
    <Card>
      <div className="card-header">
        <span className="t-lg">Maandoverzicht</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <button
            onClick={vorige}
            style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: 20, padding: '0 4px', lineHeight: 1 }}
          >‹</button>
          <span className="t-sm" style={{ minWidth: 110, textAlign: 'center', fontWeight: 600 }}>
            {MAANDEN[maand]} {jaar}
          </span>
          <button
            onClick={volgende}
            disabled={isHuidig}
            style={{ background: 'none', border: 'none', color: isHuidig ? 'var(--text-3)' : 'var(--text-2)', cursor: isHuidig ? 'default' : 'pointer', fontSize: 20, padding: '0 4px', lineHeight: 1 }}
          >›</button>
        </div>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {DAGEN.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)', padding: '4px 0' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cellen.map((dag, i) => {
          if (!dag) return <div key={`e-${i}`} />
          const dagsessies = perDag[dag] || []
          const isVandaag  = dag === vandaagDag
          const sport0     = dagsessies[0]?.sport
          const color      = sport0 ? (SPORT_COLOR[sport0] || 'var(--text-3)') : null

          return (
            <div
              key={dag}
              style={{
                aspectRatio: '1',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 2, borderRadius: 'var(--r-xs)',
                background: isVandaag ? 'var(--bg-surface)' : dagsessies.length > 0 ? 'var(--bg-raised)' : 'transparent',
                border: isVandaag ? '1px solid rgba(255,255,255,0.15)' : dagsessies.length > 0 ? `1px solid ${color}33` : '1px solid transparent',
                position: 'relative',
              }}
            >
              <span style={{
                fontSize: 11, fontWeight: isVandaag ? 700 : 400,
                color: dagsessies.length > 0 ? color || 'var(--text)' : isVandaag ? 'var(--text)' : 'var(--text-3)',
              }}>
                {dag}
              </span>
              {dagsessies.length > 0 && (
                <div style={{ display: 'flex', gap: 2 }}>
                  {dagsessies.slice(0, 3).map((t, j) => (
                    <span key={j} style={{
                      width: 4, height: 4, borderRadius: '50%',
                      background: SPORT_COLOR[t.sport] || 'var(--text-3)',
                    }} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Month stats */}
      {sessies > 0 ? (
        <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div className="metric-value" style={{ fontSize: 'var(--t-lg)' }}>{sessies}</div>
            <div className="metric-label">sessies</div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
          <div>
            <div className="metric-value" style={{ fontSize: 'var(--t-lg)' }}>{fmtMin(totaalMin)}</div>
            <div className="metric-label">totaal</div>
          </div>
          {Math.round(totaalLoad) > 0 && (
            <>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
              <div>
                <div className="metric-value" style={{ fontSize: 'var(--t-lg)' }}>{Math.round(totaalLoad)}</div>
                <div className="metric-label">load</div>
              </div>
            </>
          )}
          {topSport && (
            <>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
              <div>
                <div style={{ color: SPORT_COLOR[topSport] || 'var(--text-2)', fontWeight: 600, fontSize: 'var(--t-sm)' }}>
                  {SPORT_LABEL[topSport] || topSport}
                </div>
                <div className="metric-label">meest gedaan</div>
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="t-sm t-muted" style={{ marginTop: 'var(--space-3)', textAlign: 'center' }}>
          Geen trainingen in {MAANDEN[maand].toLowerCase()}
        </p>
      )}
    </Card>
  )
}

// ── Training card ────────────────────────────────────────────────────────────

function TrainingKaart({ t, onVerwijder }) {
  const color = SPORT_COLOR[t.sport] || 'var(--text-3)'
  const rpe   = t.rpe ? parseInt(t.rpe) : null
  const load  = rpe && t.duur_min ? Math.round(normMin(t.duur_min) * rpe / 10) : null
  const zoneTotal = (t.zone2_min || 0) + (t.zone3_min || 0) + (t.zone4_min || 0)
  const bron  = t.bron || 'handmatig'

  return (
    <div className="card" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="row-between" style={{ marginBottom: 'var(--space-3)' }}>
        {/* Left: sport + date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 'var(--r-sm)',
            background: `${color}1a`, color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <SportIcoon sport={t.sport} size={18} />
          </div>
          <div>
            <div className="t-md" style={{ fontWeight: 600 }}>{SPORT_LABEL[t.sport] || t.sport}</div>
            <div className="t-sm t-muted">
              {datumNl(t.datum, { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
          </div>
        </div>
        {/* Right: bron + delete */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Chip label={BRON_LABEL[bron] || bron} color={BRON_COLOR[bron] || 'muted'} />
          <button
            onClick={() => onVerwijder(t.id)}
            style={{
              background: 'none', border: 'none', color: 'var(--text-3)',
              cursor: 'pointer', padding: '4px', fontSize: 18, lineHeight: 1,
              borderRadius: 'var(--r-xs)', transition: 'color var(--dur-fast)',
            }}
          >×</button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {t.duur_min && <StatPill label="Tijd" value={fmtMin(normMin(t.duur_min))} />}
        {t.kcal     && <StatPill label="Kcal" value={t.kcal} />}
        {t.gem_hartslag && <StatPill label="HR" value={`${t.gem_hartslag} bpm`} />}
        {t.hrv_ochtend  && <StatPill label="HRV" value={`${t.hrv_ochtend} ms`} />}
        {t.slaap_uur    && <StatPill label="Slaap" value={`${t.slaap_uur}u`} />}
        {rpe && (
          <StatPill
            label={`RPE ${rpe}`}
            value={rpeLabel(rpe)}
            color={rpeColor(rpe)}
          />
        )}
        {load != null && <StatPill label="Load" value={load} color="var(--blue)" />}
      </div>

      {/* Zone distribution bar */}
      {zoneTotal > 0 && (
        <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 'var(--space-3)', gap: 1 }}>
          {t.zone2_min > 0 && <div style={{ flex: t.zone2_min, background: 'var(--blue)', borderRadius: 2 }} title={`Z2: ${t.zone2_min}m`} />}
          {t.zone3_min > 0 && <div style={{ flex: t.zone3_min, background: 'var(--amber)', borderRadius: 2 }} title={`Z3: ${t.zone3_min}m`} />}
          {t.zone4_min > 0 && <div style={{ flex: t.zone4_min, background: 'var(--red)', borderRadius: 2 }} title={`Z4+: ${t.zone4_min}m`} />}
        </div>
      )}

      {t.notities && (
        <p className="t-sm t-muted" style={{ marginTop: 'var(--space-2)', fontStyle: 'italic' }}>
          {t.notities}
        </p>
      )}
    </div>
  )
}

// ── Small helpers ────────────────────────────────────────────────────────────

function StatPill({ label, value, color }) {
  return (
    <div className="card-inset" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 48, padding: '5px 10px' }}>
      <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: color || 'var(--text)' }}>{value}</span>
      <span className="t-xs t-muted">{label}</span>
    </div>
  )
}

function FilterChip({ label, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '5px 12px', borderRadius: 'var(--r-xs)',
        background: active ? 'var(--bg-surface)' : 'var(--bg-raised)',
        border: active ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
        color: active ? 'var(--text)' : 'var(--text-3)',
        fontSize: 'var(--t-xs)', fontWeight: 700,
        letterSpacing: '0.04em', textTransform: 'uppercase',
        cursor: 'pointer', transition: 'color var(--dur-fast), border-color var(--dur-fast)',
      }}
    >
      {label}
    </button>
  )
}
