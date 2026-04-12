import { useState, useEffect } from 'react'
import { api, datumStr, datumNl } from '../api.js'
import SportIcoon, { normMin } from '../sportIcoon.jsx'

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
  if (score >= 75) return {
    kleur: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', ring: '#86efac',
    label: 'Klaar voor intensief',
    advies: 'Je lichaam is goed hersteld. Ideaal voor een zware training of nieuwe prikkel.',
    icon: '🟢',
  }
  if (score >= 50) return {
    kleur: '#b45309', bg: '#fffbeb', border: '#fcd34d', ring: '#fde68a',
    label: 'Matige intensiteit',
    advies: 'Houd het bij rustige duur, techniek of mobiliteit. Vermijd maximale inspanning.',
    icon: '🟡',
  }
  return {
    kleur: '#dc2626', bg: '#fef2f2', border: '#fca5a5', ring: '#fecaca',
    label: 'Herstel aanbevolen',
    advies: 'Intensief trainen vertraagt je herstel. Kies voor rust, wandelen of yoga.',
    icon: '🔴',
  }
}


export default function Dashboard({ user, onNavigeer, onUitloggen }) {
  const [data, setData] = useState(null)
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState('')
  const [toonOchtendForm, setToonOchtendForm] = useState(false)
  const [oForm, setOForm] = useState({ hrv_ochtend: '', slaap_uur: '', slaapscore: '', herstelbalans: '', stemming: '' })
  const [oOpslaan, setOOpslaan] = useState(false)

  useEffect(() => {
    api.get('/dashboard')
      .then(d => setData(d))
      .catch(e => setFout(e.message))
      .finally(() => setLaden(false))
  }, [])

  const dag = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })

  async function logOchtend() {
    if (!oForm.hrv_ochtend && !oForm.slaap_uur) return
    setOOpslaan(true)
    try {
      await api.post('/training', {
        sport: 'herstel',
        datum: new Date().toISOString().split('T')[0],
        ...Object.fromEntries(Object.entries(oForm).filter(([, v]) => v !== ''))
      })
      const nieuw = await api.get('/dashboard')
      setData(nieuw)
      setToonOchtendForm(false)
      setOForm({ hrv_ochtend: '', slaap_uur: '', slaapscore: '', herstelbalans: '', stemming: '' })
    } catch (err) { console.error(err) }
    finally { setOOpslaan(false) }
  }

  if (laden) return <div className="page page-loading"><div className="spinner" /></div>
  if (fout) return <div className="page"><div className="alert alert-error" style={{ margin: 20 }}>Dashboard kon niet laden: {fout}</div></div>

  const p = data?.profiel || {}
  const v = data?.vandaag || {}
  const h = data?.herstel || {}
  const doelen = data?.doelen || []
  const trend = data?.gewicht_trend || []
  const weekTrainingen = data?.week_trainingen || []
  const streak = data?.streak || 0

  const training_kcal_vandaag = v.training_kcal || 0
  const basis_kcal = p.doel_kcal || 2400
  const doel_kcal_aangepast = basis_kcal + training_kcal_vandaag

  const kcalPct = Math.min(100, Math.round(((v.kcal||0) / doel_kcal_aangepast) * 100))
  const eiwitPct = p.doel_eiwit_g ? Math.min(100, Math.round(((v.eiwit||0) / p.doel_eiwit_g) * 100)) : 0
  const khPct = p.doel_koolhydraten_g ? Math.min(100, Math.round(((v.koolhydraten||0) / p.doel_koolhydraten_g) * 100)) : 0
  const vetPct = p.doel_vetten_g ? Math.min(100, Math.round(((v.vetten||0) / p.doel_vetten_g) * 100)) : 0

  const gereedheid = berekenGereedheid(h)
  const gInfo = gereedheid !== null ? gereedheidsInfo(gereedheid) : null
  const heeftHerstelData = !!(h.hrv_ochtend || h.slaap_uur)

  const herstelDagen = h?.datum
    ? Math.floor((Date.now() - new Date(datumStr(h.datum) + 'T12:00:00').getTime()) / 86400000)
    : null

  // 7-daagse HRV trend vanuit weektrainingen
  const vandaag = new Date().toISOString().split('T')[0]
  const hrv7Dagen = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    const ds = d.toISOString().split('T')[0]
    const record = weekTrainingen.filter(t => datumStr(t.datum) === ds && t.hrv_ochtend).sort((a, b) => b.hrv_ochtend - a.hrv_ochtend)[0]
    return { datum: ds, label: d.toLocaleDateString('nl-NL', { weekday: 'short' }), hrv: record?.hrv_ochtend || null, isVandaag: ds === vandaag }
  })
  const heeftHrvTrend = hrv7Dagen.some(d => d.hrv !== null)

  // Weektraining stats (excl. herstel-only records)
  const echteTrainingen = weekTrainingen.filter(t => t.sport !== 'herstel')
  const weekMinuten = echteTrainingen.reduce((s, t) => s + normMin(t.duur_min), 0)
  const weekKcal = echteTrainingen.reduce((s, t) => s + (t.kcal || 0), 0)
  const heeftTrainingVandaag = echteTrainingen.some(t => datumStr(t.datum) === vandaag)

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Hey, {(p.name || user.name)?.split(' ')[0]} 👋</h1>
          <p className="subtitle">{dag}</p>
        </div>
        <button className="icon-btn" onClick={onUitloggen} title="Uitloggen"><span>⎋</span></button>
      </header>

      {/* ══ HERSTEL & GEREEDHEID — Hero card ══ */}
      <div className="card herstel-hero-card">
        <div className="card-header">
          <h3>Herstel & Gereedheid</h3>
          <button
            className={`btn btn-sm ${toonOchtendForm ? 'btn-ghost' : 'btn-primary'}`}
            onClick={() => setToonOchtendForm(f => !f)}
          >
            {toonOchtendForm ? 'Annuleer' : '+ Log ochtend'}
          </button>
        </div>

        {/* Inline ochtend log form */}
        {toonOchtendForm && (
          <div className="ochtend-form">
            <p className="ochtend-form-intro">Log je ochtendmetingen voor trainingsadvies op maat:</p>
            <div className="ochtend-form-grid">
              <div className="form-group">
                <label>HRV (ms) *</label>
                <input type="number" value={oForm.hrv_ochtend} onChange={e => setOForm(f => ({ ...f, hrv_ochtend: e.target.value }))} placeholder="65" autoFocus />
              </div>
              <div className="form-group">
                <label>Slaap (uur) *</label>
                <input type="number" step="0.1" value={oForm.slaap_uur} onChange={e => setOForm(f => ({ ...f, slaap_uur: e.target.value }))} placeholder="7.5" />
              </div>
              <div className="form-group">
                <label>Slaapscore</label>
                <input type="number" value={oForm.slaapscore} onChange={e => setOForm(f => ({ ...f, slaapscore: e.target.value }))} placeholder="78" />
              </div>
              <div className="form-group">
                <label>Herstelbalans</label>
                <input type="number" step="0.1" value={oForm.herstelbalans} onChange={e => setOForm(f => ({ ...f, herstelbalans: e.target.value }))} placeholder="+5.2" />
              </div>
            </div>
            <div className="form-group">
              <label>Stemming</label>
              <div className="stemming-keuze">
                {[['😔','Slecht'],['😕','Matig'],['😐','Neutraal'],['🙂','Goed'],['😊','Top']].map(([emoji, lbl], i) => (
                  <button key={i} type="button"
                    className={`stemming-btn ${oForm.stemming == i+1 ? 'active' : ''}`}
                    onClick={() => setOForm(f => ({ ...f, stemming: f.stemming == i+1 ? '' : String(i+1) }))}>
                    <span>{emoji}</span>
                    <span>{lbl}</span>
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-primary btn-full" onClick={logOchtend} disabled={oOpslaan || (!oForm.hrv_ochtend && !oForm.slaap_uur)}>
              {oOpslaan ? 'Opslaan...' : 'Opslaan & ververs gereedheid'}
            </button>
          </div>
        )}

        {/* Leeg staat */}
        {!heeftHerstelData && !toonOchtendForm && (
          <div className="herstel-leeg">
            <div className="herstel-leeg-icon">📊</div>
            <div>
              <strong>Log dagelijks je ochtenddata</strong>
              <p>HRV en slaap vormen de basis van je trainingsplanning. Zonder deze data kan de coach geen gerichte adviezen geven.</p>
            </div>
            <button className="btn btn-primary" onClick={() => setToonOchtendForm(true)}>
              Start: log HRV & slaap
            </button>
          </div>
        )}

        {/* Gereedheid score + advies */}
        {heeftHerstelData && !toonOchtendForm && (
          <>
            {herstelDagen > 1 && (
              <p className="stale-warning">⚠️ Data van {herstelDagen} dag{herstelDagen !== 1 ? 'en' : ''} geleden — log vandaag je ochtenddata</p>
            )}

            {gInfo && (
              <div className="gereedheid-banner" style={{ background: gInfo.bg, borderColor: gInfo.border }}>
                <div className="gereedheid-ring" style={{ borderColor: gInfo.ring, color: gInfo.kleur }}>
                  <span className="gereedheid-pct">{gereedheid}</span>
                  <span className="gereedheid-sym">%</span>
                </div>
                <div className="gereedheid-tekst">
                  <strong style={{ color: gInfo.kleur }}>{gInfo.icon} {gInfo.label}</strong>
                  <p>{gInfo.advies}</p>
                </div>
              </div>
            )}

            <div className="metrics-grid" style={{ marginTop: 12 }}>
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
                <div className="metric-value">{h.herstelbalans != null ? `${h.herstelbalans > 0 ? '+' : ''}${h.herstelbalans}` : '—'}</div>
                <div className="metric-label">Herstel</div>
              </div>
              <div className="metric-card">
                <div className="metric-icon">🏆</div>
                <div className="metric-value">{h.slaapscore || '—'}</div>
                <div className="metric-label">Slaapscore</div>
              </div>
            </div>

            {/* 7-daagse HRV trend */}
            {heeftHrvTrend && (
              <div className="hrv-trend">
                {hrv7Dagen.map((d, i) => {
                  const kleur = !d.hrv ? '#e5e7eb'
                    : d.hrv >= 60 ? '#22c55e'
                    : d.hrv >= 45 ? '#eab308'
                    : '#ef4444'
                  return (
                    <div key={d.datum} className={`hrv-dag ${d.isVandaag ? 'hrv-dag--vandaag' : ''}`}>
                      <div className="hrv-dot" style={{ background: kleur }} title={d.hrv ? `HRV ${d.hrv}ms` : 'Geen data'} />
                      {d.hrv && <span className="hrv-val">{d.hrv}</span>}
                      <span className="hrv-label">{d.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="link-btn small" onClick={() => onNavigeer('coach')}>
            💬 Vraag coach om analyse →
          </button>
          <button className="link-btn small" onClick={() => onNavigeer('coach', 'suunto')}>
            ⌚ Deel Suunto ochtend →
          </button>
        </div>
      </div>

      {/* Week training samenvatting */}
      {echteTrainingen.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Training deze week</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {streak >= 2 && <span className="streak-badge">🔥 {streak} dagen</span>}
              <button className="link-btn small" onClick={() => onNavigeer('training')}>Bekijk →</button>
            </div>
          </div>
          <div className="week-stats-grid">
            <div className="week-stat">
              <span className="week-stat-val">{echteTrainingen.length}</span>
              <span className="week-stat-label">{echteTrainingen.length === 1 ? 'sessie' : 'sessies'}</span>
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
            {echteTrainingen.slice(0, 7).map((t, i) => (
              <span key={t.id || i} className="week-sport-pill" title={`${t.sport}${t.duur_min ? ' — ' + normMin(t.duur_min) + 'min' : ''}`}>
                <SportIcoon sport={t.sport} size={16} />
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
        {heeftTrainingVandaag
          ? <div className="dag-context dag-context--training">⚡ Trainingsdag — prioriteer koolhydraten voor herstel</div>
          : <div className="dag-context dag-context--rust">💤 Rustdag — focus op eiwit (1.6–2 g/kg lichaamsgewicht)</div>
        }
        <div className="dash-macro-blokken">
          <div className="dash-macro-blok">
            <span className="dash-macro-val">{v.kcal || 0}</span>
            <span className="dash-macro-sub">
              / {doel_kcal_aangepast} kcal
              {training_kcal_vandaag > 0 && <span className="training-kcal-badge">+{training_kcal_vandaag} 🔥</span>}
            </span>
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
          <MacroBalk label="Calorieën" huidig={v.kcal||0} doel={doel_kcal_aangepast} eenheid="kcal" pct={kcalPct} kleur="primary" />
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
                  <div className="chart-date">{datumNl(m.datum, { day: 'numeric', month: 'short' })}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Doelen */}
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
