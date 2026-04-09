import { useState, useEffect } from 'react'
import { api } from '../api.js'

// Trainingsgereedheid op basis van HRV, slaap, herstelbalans, slaapscore
function berekenGereedheid(h) {
  if (!h) return null
  const scores = []
  if (h.hrv_ochtend) {
    const v = parseFloat(h.hrv_ochtend)
    scores.push({ w: 40, v: v >= 70 ? 100 : v >= 55 ? 78 : v >= 40 ? 52 : 28 })
  }
  if (h.slaap_uur) {
    const v = parseFloat(h.slaap_uur)
    scores.push({ w: 30, v: v >= 8 ? 100 : v >= 7 ? 85 : v >= 6 ? 62 : v >= 5 ? 38 : 18 })
  }
  if (h.herstelbalans != null) {
    const v = parseFloat(h.herstelbalans)
    scores.push({ w: 20, v: v > 5 ? 100 : v >= 0 ? 75 : v >= -5 ? 50 : 25 })
  }
  if (h.slaapscore) {
    const v = parseFloat(h.slaapscore)
    scores.push({ w: 10, v: v >= 80 ? 100 : v >= 70 ? 75 : v >= 60 ? 50 : 28 })
  }
  if (!scores.length) return null
  const totW = scores.reduce((s, x) => s + x.w, 0)
  return Math.round(scores.reduce((s, x) => s + x.v * x.w, 0) / totW)
}

function gereedheidsInfo(score) {
  if (score >= 75) return { kleur: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'Klaar voor intensief', icon: '🟢' }
  if (score >= 50) return { kleur: '#ca8a04', bg: '#fefce8', border: '#fde047', label: 'Matige intensiteit', icon: '🟡' }
  return { kleur: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Herstel aanbevolen', icon: '🔴' }
}

const SPORT_ICONS_MAP = { fitness:'🏋️', hardlopen:'🏃', fietsen:'🚴', padel:'🎾', zwemmen:'🏊', tennis:'🎾', wandelen:'🚶', yoga:'🧘', wielrennen:'🚵', voetbal:'⚽' }

export default function Dashboard({ user, onNavigeer, onUitloggen }) {
  const [data, setData] = useState(null)
  const [laden, setLaden] = useState(true)

  useEffect(() => {
    api.get('/dashboard').then(setData).catch(console.error).finally(() => setLaden(false))
  }, [])

  const dag = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })

  if (laden) return <div className="page page-loading"><div className="spinner" /></div>

  const p = data?.profiel || {}
  const v = data?.vandaag || {}
  const h = data?.herstel || {}
  const doelen = data?.doelen || []
  const trend = data?.gewicht_trend || []
  const weekTrainingen = data?.week_trainingen || []

  const kcalPct = p.doel_kcal ? Math.min(100, Math.round(((v.kcal||0) / p.doel_kcal) * 100)) : 0
  const eiwitPct = p.doel_eiwit_g ? Math.min(100, Math.round(((v.eiwit||0) / p.doel_eiwit_g) * 100)) : 0
  const khPct = p.doel_koolhydraten_g ? Math.min(100, Math.round(((v.koolhydraten||0) / p.doel_koolhydraten_g) * 100)) : 0
  const vetPct = p.doel_vetten_g ? Math.min(100, Math.round(((v.vetten||0) / p.doel_vetten_g) * 100)) : 0

  const gereedheid = berekenGereedheid(h)
  const gInfo = gereedheid !== null ? gereedheidsInfo(gereedheid) : null

  // Hersteldata staleness check
  const herstelDagen = h?.datum
    ? Math.floor((Date.now() - new Date(h.datum + 'T12:00:00').getTime()) / 86400000)
    : null

  // Weektraining samenvatting
  const weekMinuten = weekTrainingen.reduce((s, t) => s + (t.duur_min || 0), 0)
  const weekKcal = weekTrainingen.reduce((s, t) => s + (t.kcal || 0), 0)

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Hey, {(p.name || user.name)?.split(' ')[0]} 👋</h1>
          <p className="subtitle">{dag}</p>
        </div>
        <button className="icon-btn" onClick={onUitloggen} title="Uitloggen">
          <span>⎋</span>
        </button>
      </header>

      {/* Herstel & gereedheid */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 10 }}>
          <h3>Herstel & gereedheid</h3>
          {gInfo && (
            <span className="gereedheid-badge" style={{ background: gInfo.bg, color: gInfo.kleur, border: `1px solid ${gInfo.border}` }}>
              {gInfo.icon} {gereedheid}% — {gInfo.label}
            </span>
          )}
        </div>
        {herstelDagen > 1 && (
          <p className="stale-warning">⚠️ Hersteldata van {herstelDagen} dag{herstelDagen !== 1 ? 'en' : ''} geleden</p>
        )}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-icon">💓</div>
            <div className="metric-value">{h.hrv_ochtend || '—'}</div>
            <div className="metric-label">HRV (ms)</div>
          </div>
          <div className="metric-card">
            <div className="metric-icon">😴</div>
            <div className="metric-value">{h.slaap_uur || '—'}</div>
            <div className="metric-label">Slaap (uur)</div>
          </div>
          <div className="metric-card">
            <div className="metric-icon">📈</div>
            <div className="metric-value">{h.herstelbalans ? `${h.herstelbalans > 0 ? '+' : ''}${h.herstelbalans}` : '—'}</div>
            <div className="metric-label">Herstel</div>
          </div>
          <div className="metric-card">
            <div className="metric-icon">🏆</div>
            <div className="metric-value">{h.slaapscore || '—'}</div>
            <div className="metric-label">Slaapscore</div>
          </div>
        </div>
      </div>

      {/* Week training samenvatting */}
      {weekTrainingen.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Training deze week</h3>
            <button className="link-btn small" onClick={() => onNavigeer('training')}>Bekijk →</button>
          </div>
          <div className="week-stats-grid">
            <div className="week-stat">
              <span className="week-stat-val">{weekTrainingen.length}</span>
              <span className="week-stat-label">{weekTrainingen.length === 1 ? 'sessie' : 'sessies'}</span>
            </div>
            <div className="week-stat">
              <span className="week-stat-val">
                {weekMinuten >= 60
                  ? `${Math.floor(weekMinuten / 60)}u${weekMinuten % 60 ? weekMinuten % 60 + 'm' : ''}`
                  : `${weekMinuten}m`}
              </span>
              <span className="week-stat-label">trainingstijd</span>
            </div>
            {weekKcal > 0 && (
              <div className="week-stat">
                <span className="week-stat-val">{weekKcal}</span>
                <span className="week-stat-label">kcal verbrand</span>
              </div>
            )}
          </div>
          <div className="week-sports-strip">
            {weekTrainingen.slice(0, 7).map((t, i) => (
              <span key={i} className="week-sport-pill" title={`${t.sport}${t.duur_min ? ' — ' + t.duur_min + 'min' : ''}`}>
                {SPORT_ICONS_MAP[t.sport] || '⚽'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Macro voortgang vandaag */}
      <div className="card">
        <div className="card-header">
          <h3>Voeding vandaag</h3>
          <button className="link-btn small" onClick={() => onNavigeer('voeding')}>Bekijk alles →</button>
        </div>

        <div className="dash-macro-blokken">
          <div className="dash-macro-blok">
            <span className="dash-macro-val">{v.kcal || 0}</span>
            <span className="dash-macro-sub">/ {p.doel_kcal || 2400} kcal</span>
          </div>
          <div className="dash-macro-blok dash-macro-groen">
            <span className="dash-macro-val">{Math.round(v.eiwit || 0)}g</span>
            <span className="dash-macro-sub">/ {p.doel_eiwit_g || 160}g eiwit</span>
          </div>
          <div className="dash-macro-blok dash-macro-blauw">
            <span className="dash-macro-val">{Math.round(v.koolhydraten || 0)}g</span>
            <span className="dash-macro-sub">/ {p.doel_koolhydraten_g || 250}g kh</span>
          </div>
          <div className="dash-macro-blok dash-macro-oranje">
            <span className="dash-macro-val">{Math.round(v.vetten || 0)}g</span>
            <span className="dash-macro-sub">/ {p.doel_vetten_g || 80}g vet</span>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <MacroBalk label="Calorieën" huidig={v.kcal||0} doel={p.doel_kcal||2400} eenheid="kcal" pct={kcalPct} kleur="primary" />
          <MacroBalk label="Eiwit" huidig={Math.round(v.eiwit||0)} doel={p.doel_eiwit_g||160} eenheid="g" pct={eiwitPct} kleur="green" />
          <MacroBalk label="Koolhydraten" huidig={Math.round(v.koolhydraten||0)} doel={p.doel_koolhydraten_g||250} eenheid="g" pct={khPct} kleur="blue" />
          <MacroBalk label="Vetten" huidig={Math.round(v.vetten||0)} doel={p.doel_vetten_g||80} eenheid="g" pct={vetPct} kleur="orange" />
        </div>

        {v.maaltijden_lijst?.length > 0 && (
          <div className="dash-maaltijd-lijst">
            {v.maaltijden_lijst.map((m, i) => (
              <div key={i} className="dash-maaltijd-rij">
                <div className="dash-maaltijd-naam">
                  <span className="dash-maaltijd-type">{m.maaltijd_type || 'maaltijd'}</span>
                  {m.beschrijving || 'Maaltijd'}
                </div>
                <div className="dash-maaltijd-macros">
                  {m.kcal != null && <span>{m.kcal} kcal</span>}
                  {m.eiwit_g != null && <span className="eiwit-tag">{parseFloat(m.eiwit_g).toFixed(0)}g eiwit</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gewichtstrend */}
      {trend.length > 1 && (
        <div className="card">
          <h3>Gewicht trend</h3>
          <div className="mini-chart">
            {trend.map((m, i) => {
              const vals = trend.map(x => x.gewicht_kg)
              const min = Math.min(...vals), max = Math.max(...vals)
              const barH = 40 + ((m.gewicht_kg - min) / (max - min || 1)) * 40
              return (
                <div key={i} className="chart-col">
                  <div className="chart-val">{m.gewicht_kg}</div>
                  <div className="chart-bar" style={{ height: barH + 'px' }} />
                  <div className="chart-date">{new Date(m.datum + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Doelen voortgang */}
      {doelen.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Actieve doelen</h3>
            <button className="link-btn" onClick={() => onNavigeer('doelen')}>Bekijk alle →</button>
          </div>
          {doelen.slice(0, 3).map(d => {
            const pct = d.doel_waarde && d.huidige_waarde
              ? Math.min(100, Math.round((d.huidige_waarde / d.doel_waarde) * 100)) : 0
            return (
              <div key={d.id} className="doel-row">
                <div className="doel-info">
                  <span className="doel-titel">{d.titel}</span>
                  <span className="doel-waarden">{d.huidige_waarde||0} / {d.doel_waarde} {d.eenheid||''}</span>
                </div>
                <div className="voortgang-balk">
                  <div className="voortgang-fill" style={{ width: pct + '%' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Snelkoppelingen */}
      <div className="card">
        <h3>Snelle acties</h3>
        <div className="snelle-acties">
          <button className="actie-btn" onClick={() => onNavigeer('coach')}>
            <span>💬</span><span>Vraag coach</span>
          </button>
          <button className="actie-btn" onClick={() => onNavigeer('voeding')}>
            <span>📸</span><span>Log maaltijd</span>
          </button>
          <button className="actie-btn" onClick={() => onNavigeer('training')}>
            <span>🏋️</span><span>Log training</span>
          </button>
          <button className="actie-btn" onClick={() => onNavigeer('lichaam')}>
            <span>⚖️</span><span>Weeg in</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function MacroBalk({ label, huidig, doel, eenheid, pct, kleur }) {
  return (
    <div className="macro-rij">
      <div className="macro-info">
        <span className="macro-label">{label}</span>
        <span className="macro-waarde">{huidig} <em>/ {doel} {eenheid}</em></span>
      </div>
      <div className="voortgang-balk">
        <div className={`voortgang-fill voortgang-${kleur}`} style={{ width: pct + '%' }} />
      </div>
    </div>
  )
}
