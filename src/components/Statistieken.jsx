import { useState, useEffect } from 'react'
import { api, datumStr, datumNl } from '../api.js'
import SportIcoon, { SPORT_KLEUR, SPORT_LABEL, normMin } from '../sportIcoon.jsx'

const pad2 = n => String(n).padStart(2, '0')
function normDatum(d) {
  if (!d) return ''
  if (d instanceof Date) return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
  return String(d).slice(0, 10)
}

const PERIODES = [
  { label: '4W', dagen: 28 },
  { label: '12W', dagen: 84 },
  { label: '6M', dagen: 180 },
]

function formatMin(m) {
  if (!m) return '0m'
  return m >= 60 ? `${Math.floor(m/60)}u${m%60 ? m%60+'m' : ''}` : `${m}m`
}

export default function Statistieken({ onNavigeer }) {
  const [periode, setPeriode] = useState(84)
  const [data, setData] = useState(null)
  const [laden, setLaden] = useState(true)
  const [geselecteerdeWeek, setGeselecteerdeWeek] = useState(null)

  useEffect(() => {
    setLaden(true)
    setGeselecteerdeWeek(null)
    api.get(`/statistieken?dagen=${periode}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLaden(false))
  }, [periode])

  if (laden) return <div className="loading-screen"><div className="spinner" /></div>
  if (!data) return null

  const { activiteiten = [], wellness = [] } = data
  const aantalWeken = Math.ceil(periode / 7)

  // Build weekly groups starting from this week's Monday going back N weeks
  const nu = new Date()
  const maandag = new Date(nu)
  maandag.setDate(nu.getDate() - ((nu.getDay() + 6) % 7))
  maandag.setHours(0, 0, 0, 0)

  const weken = Array.from({ length: aantalWeken }, (_, i) => {
    const start = new Date(maandag)
    start.setDate(maandag.getDate() - (aantalWeken - 1 - i) * 7)
    const eind = new Date(start)
    eind.setDate(start.getDate() + 7)

    const weekActs = activiteiten.filter(a => {
      const d = new Date(normDatum(a.datum) + 'T12:00:00')
      return d >= start && d < eind
    })

    const sportMin = {}
    for (const a of weekActs) {
      sportMin[a.sport] = (sportMin[a.sport] || 0) + normMin(a.duur_min)
    }
    const totaalMin = Object.values(sportMin).reduce((s, m) => s + m, 0)
    const dominantSport = Object.entries(sportMin).sort((a, b) => b[1] - a[1])[0]?.[0]

    return {
      start,
      label: start.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
      activiteiten: weekActs,
      totaalMin,
      sportMin,
      dominantSport,
      sessies: weekActs.length,
    }
  })

  // Sport breakdown totals
  const sportStats = {}
  for (const a of activiteiten) {
    if (!sportStats[a.sport]) sportStats[a.sport] = { sessies: 0, minuten: 0 }
    sportStats[a.sport].sessies++
    sportStats[a.sport].minuten += normMin(a.duur_min)
  }
  const sportLijst = Object.entries(sportStats).sort((a, b) => b[1].minuten - a[1].minuten)
  const totaalMinuten = sportLijst.reduce((s, [, v]) => s + v.minuten, 0)

  // Zone totals
  const z2 = activiteiten.reduce((s, a) => s + (a.zone2_min || 0), 0)
  const z3 = activiteiten.reduce((s, a) => s + (a.zone3_min || 0), 0)
  const z4 = activiteiten.reduce((s, a) => s + (a.zone4_min || 0), 0)
  const zTotaal = z2 + z3 + z4
  const zone2Ratio = zTotaal > 0 ? Math.round((z2 / zTotaal) * 100) : null

  // Summary stats
  const totSessies = activiteiten.length
  const totMin = activiteiten.reduce((s, a) => s + normMin(a.duur_min), 0)
  const gemPerWeek = aantalWeken > 0 ? Math.round(totMin / aantalWeken) : 0

  const maxWekMin = Math.max(...weken.map(w => w.totaalMin), 60)
  const gekozenWeekActs = geselecteerdeWeek !== null
    ? weken[geselecteerdeWeek].activiteiten
    : activiteiten.slice(0, 12)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="t-xl">Statistieken</h1>
          <p className="t-sm t-muted" style={{ marginTop: 2 }}>Trainingsoverzicht</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigeer('training')}>← Terug</button>
      </div>

      {/* Periode selector */}
      <div className="stat-periode-tabs">
        {PERIODES.map(p => (
          <button key={p.dagen}
            className={`stat-periode-btn ${periode === p.dagen ? 'active' : ''}`}
            onClick={() => setPeriode(p.dagen)}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary row */}
      <div className="stat-summary-grid">
        <div className="stat-summ">
          <span className="stat-summ-val">{totSessies}</span>
          <span className="stat-summ-label">sessies</span>
        </div>
        <div className="stat-summ">
          <span className="stat-summ-val">{formatMin(totMin)}</span>
          <span className="stat-summ-label">totaal</span>
        </div>
        <div className="stat-summ">
          <span className="stat-summ-val">{formatMin(gemPerWeek)}</span>
          <span className="stat-summ-label">per week</span>
        </div>
        <div className="stat-summ">
          <span className="stat-summ-val">{sportLijst.length}</span>
          <span className="stat-summ-label">sporten</span>
        </div>
      </div>

      {/* Volume chart */}
      <div className="card">
        <div className="card-header">
          <span className="t-label">Volume per week</span>
          {geselecteerdeWeek !== null && (
            <button className="btn btn-ghost btn-sm" onClick={() => setGeselecteerdeWeek(null)}>Alles</button>
          )}
        </div>
        {totSessies === 0
          ? <p className="stat-leeg">Geen activiteiten gevonden. Voer een Suunto-sync uit in Instellingen of log een training.</p>
          : (
            <>
              <div className="vol-chart">
                {weken.map((w, i) => {
                  const barH = Math.max(4, (w.totaalMin / maxWekMin) * 72)
                  const kleur = w.dominantSport
                    ? (SPORT_KLEUR[w.dominantSport]?.kleur || 'var(--green)')
                    : 'var(--bg-surface)'
                  const isActief = geselecteerdeWeek === i
                  const gedimd = geselecteerdeWeek !== null && !isActief
                  return (
                    <div key={i}
                      className={`vol-week ${isActief ? 'vol-week--actief' : ''}`}
                      onClick={() => setGeselecteerdeWeek(isActief ? null : i)}>
                      <div className="vol-balk-wrap">
                        {w.sessies > 1 && <span className="vol-sessie-dot">{w.sessies}</span>}
                        <div className="vol-balk"
                          style={{ height: barH + 'px', background: kleur, opacity: gedimd ? 0.28 : 1 }} />
                      </div>
                      {w.totaalMin > 0 && <div className="vol-min">{formatMin(w.totaalMin)}</div>}
                      <div className="vol-label">{w.label.replace(' ', ' ')}</div>
                    </div>
                  )
                })}
              </div>
              {geselecteerdeWeek !== null && (
                <p className="vol-week-info">
                  Week van {weken[geselecteerdeWeek].label} —{' '}
                  {weken[geselecteerdeWeek].sessies} sessie{weken[geselecteerdeWeek].sessies !== 1 ? 's' : ''},{' '}
                  {formatMin(weken[geselecteerdeWeek].totaalMin)}
                </p>
              )}
            </>
          )
        }
      </div>

      {/* Sport breakdown */}
      {sportLijst.length > 0 && (
        <div className="card">
          <span className="t-label">Sportverdeling</span>
          <div className="sport-verd-lijst">
            {sportLijst.slice(0, 6).map(([sport, v]) => {
              const pct = totaalMinuten > 0 ? Math.round((v.minuten / totaalMinuten) * 100) : 0
              const kleur = SPORT_KLEUR[sport]?.kleur || SPORT_KLEUR.overig.kleur
              const bg = SPORT_KLEUR[sport]?.bg || SPORT_KLEUR.overig.bg
              return (
                <div key={sport} className="sport-verd-rij">
                  <div className="sport-verd-kop">
                    <div className="sport-verd-icon" style={{ background: bg, color: kleur }}>
                      <SportIcoon sport={sport} size={14} />
                    </div>
                    <span className="sport-verd-naam">{SPORT_LABEL[sport] || sport}</span>
                    <span className="sport-verd-meta">{v.sessies}× · {formatMin(v.minuten)}</span>
                    <span className="sport-verd-pct">{pct}%</span>
                  </div>
                  <div className="sport-verd-bg">
                    <div className="sport-verd-fill" style={{ width: pct + '%', background: kleur }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Zone distribution */}
      {zTotaal > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="t-label">Hartslagzones</span>
            {zone2Ratio !== null && (
              <span className={`zone-ratio-badge ${zone2Ratio >= 75 ? 'zone-ratio--goed' : zone2Ratio >= 55 ? 'zone-ratio--matig' : 'zone-ratio--laag'}`}>
                Z2: {zone2Ratio}%
              </span>
            )}
          </div>
          <div className="zone-stacked">
            {z2 > 0 && <div className="zone-seg zone-z2" style={{ flex: z2 }} title={`Zone 2: ${z2}min`}><span>Z2</span></div>}
            {z3 > 0 && <div className="zone-seg zone-z3" style={{ flex: z3 }} title={`Zone 3: ${z3}min`}><span>Z3</span></div>}
            {z4 > 0 && <div className="zone-seg zone-z4" style={{ flex: z4 }} title={`Zone 4+: ${z4}min`}><span>Z4+</span></div>}
          </div>
          <div className="zone-legenda">
            {z2 > 0 && <span className="zone-leg zone-leg-z2">Zone 2 — {formatMin(z2)}</span>}
            {z3 > 0 && <span className="zone-leg zone-leg-z3">Zone 3 — {formatMin(z3)}</span>}
            {z4 > 0 && <span className="zone-leg zone-leg-z4">Zone 4+ — {formatMin(z4)}</span>}
          </div>
          {zone2Ratio !== null && zone2Ratio < 70 && (
            <p className="zone-tip">💡 Streef naar 70–80% Zone 2 voor een sterke aerobe basis en betere vetverbranding.</p>
          )}
        </div>
      )}

      {/* HRV sparkline */}
      {wellness.length > 0 && (
        <div className="card">
          <span className="t-label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>HRV & Slaap — 30 dagen</span>
          <HrvSparkline wellness={wellness} />
        </div>
      )}

      {/* Activity feed */}
      <div className="card">
        <span className="t-label" style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
          {geselecteerdeWeek !== null
            ? `Week van ${weken[geselecteerdeWeek].label}`
            : 'Recente activiteiten'}
        </span>
        {gekozenWeekActs.length === 0
          ? <p className="stat-leeg">Geen activiteiten{geselecteerdeWeek !== null ? ' in deze week' : ''}.</p>
          : gekozenWeekActs.map((a, i) => <ActiviteitRij key={i} a={a} />)
        }
      </div>
    </div>
  )
}

function HrvSparkline({ wellness }) {
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (29 - i))
    const ds = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
    const w = wellness.find(x => normDatum(x.datum) === ds)
    return {
      ds,
      hrv: w?.hrv_ochtend ? parseInt(w.hrv_ochtend) : null,
      slaap: w?.slaap_uur ? parseFloat(w.slaap_uur) : null,
    }
  })

  const maxHrv = Math.max(...days.map(d => d.hrv || 0), 80)

  return (
    <div>
      <div className="hrv-sparkline">
        {days.map((d, i) => {
          const kleur = !d.hrv ? 'var(--bg-surface)'
            : d.hrv >= 60 ? 'var(--green)'
            : d.hrv >= 45 ? 'var(--amber)'
            : 'var(--red)'
          const h = d.hrv ? Math.max(4, (d.hrv / maxHrv) * 56) : 3
          return (
            <div key={i} className="hrv-spark-col"
              title={d.hrv ? `${d.ds}: HRV ${d.hrv}ms${d.slaap ? `, slaap ${d.slaap}u` : ''}` : d.ds}>
              <div className="hrv-spark-bar" style={{ height: h + 'px', background: kleur }} />
            </div>
          )
        })}
      </div>
      <div className="hrv-spark-leg">
        <span className="hrv-leg-item hrv-leg-groen">≥60 Goed</span>
        <span className="hrv-leg-item hrv-leg-geel">45–60 Matig</span>
        <span className="hrv-leg-item hrv-leg-rood">&lt;45 Laag</span>
      </div>
    </div>
  )
}

function ActiviteitRij({ a }) {
  const kleur = SPORT_KLEUR[a.sport] || SPORT_KLEUR.overig
  const afstandMatch = (a.notities || '').match(/(\d+\.?\d*)\s*km/)
  const afstand = afstandMatch ? afstandMatch[1] + ' km' : null

  return (
    <div className="act-rij">
      <div className="act-icon" style={{ background: kleur.bg, color: kleur.kleur }}>
        <SportIcoon sport={a.sport} size={16} />
      </div>
      <div className="act-info">
        <div className="act-kop">
          <strong>{SPORT_LABEL[a.sport] || a.sport}</strong>
          <span className="act-datum">{datumNl(a.datum, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        </div>
        <div className="act-meta">
          {a.duur_min && <span>{normMin(a.duur_min)} min</span>}
          {afstand && <span>{afstand}</span>}
          {a.gem_hartslag && <span>💓 {a.gem_hartslag} bpm</span>}
          {a.kcal > 0 && <span>🔥 {a.kcal} kcal</span>}
        </div>
      </div>
      {a.bron === 'suunto' && <span className="act-bron-badge">Suunto</span>}
    </div>
  )
}
