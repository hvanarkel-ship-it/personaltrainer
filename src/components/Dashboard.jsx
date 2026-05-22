import { useState, useEffect } from 'react'
import { api, datumStr, datumNl } from '../api.js'
import SportIcoon, { normMin } from '../sportIcoon.jsx'

function berekenGereedheid(h) {
  if (!h) return null
  const scores = []
  if (h.hrv_ochtend) {
    const v = parseFloat(h.hrv_ochtend)
    scores.push({ w: 50, v: v >= 70 ? 100 : v >= 55 ? 78 : v >= 40 ? 52 : 28 })
  }
  if (h.slaap_uur) {
    const v = parseFloat(h.slaap_uur)
    scores.push({ w: 30, v: v >= 8 ? 100 : v >= 7 ? 85 : v >= 6 ? 62 : v >= 5 ? 38 : 18 })
  }
  if (h.herstelbalans != null) {
    const v = parseFloat(h.herstelbalans)
    const isPct = Math.abs(v) > 20
    const score = isPct
      ? (v >= 90 ? 100 : v >= 75 ? 80 : v >= 60 ? 60 : v >= 45 ? 40 : 20)
      : (v > 5 ? 100 : v >= 0 ? 75 : v >= -5 ? 50 : 25)
    scores.push({ w: 20, v: score })
  }
  if (!scores.length) return null
  const totW = scores.reduce((s, x) => s + x.w, 0)
  return Math.round(scores.reduce((s, x) => s + x.v * x.w, 0) / totW)
}

function gereedheidsInfo(score) {
  if (score >= 75) return {
    kleur: '#16a34a', bg: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
    border: '#bbf7d0', ringFrom: '#22c55e', ringTo: '#16a34a',
    label: 'Klaar voor intensief',
    advies: 'Je lichaam is goed hersteld. Ideaal voor een zware training of nieuwe prikkel.',
    aangeraden: 'Interval, krachttraining of hoge intensiteit',
    badge: 'GO',
  }
  if (score >= 50) return {
    kleur: '#b45309', bg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
    border: '#fcd34d', ringFrom: '#fbbf24', ringTo: '#d97706',
    label: 'Matige intensiteit',
    advies: 'Zone 2 duurtraining of techniekwerk aanbevolen.',
    aangeraden: 'Zone 2 duurtraining of mobiliteit (45–60 min)',
    badge: 'OK',
  }
  return {
    kleur: '#dc2626', bg: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
    border: '#fca5a5', ringFrom: '#f87171', ringTo: '#dc2626',
    label: 'Herstel aanbevolen',
    advies: 'Intensief trainen vertraagt je herstel. Prioriteer slaap en voeding.',
    aangeraden: 'Actief herstel: wandelen, yoga of volledige rust',
    badge: 'REST',
  }
}

function GereedheidsRing({ score, gInfo }) {
  const size = 120
  const stroke = 10
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ

  return (
    <div className="gereedheid-ring-wrap">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={stroke} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={gInfo.ringFrom} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div className="gereedheid-ring-inner">
        <span className="gereedheid-ring-pct">{score}</span>
        <span className="gereedheid-ring-sym">%</span>
      </div>
    </div>
  )
}

export default function Dashboard({ user, onNavigeer, onUitloggen }) {
  const [data, setData] = useState(null)
  const [wellness, setWellness] = useState([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState('')
  const [toonOchtendForm, setToonOchtendForm] = useState(false)
  const [oForm, setOForm] = useState({ hrv_ochtend: '', slaap_uur: '', slaapscore: '', herstelbalans: '', stemming: '' })
  const [oOpslaan, setOOpslaan] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('/dashboard').catch(e => { setFout(e.message); return null }),
      api.get('/wellness?dagen=14').catch(() => ({ wellness: [] })),
    ]).then(([d, w]) => {
      if (d) setData(d)
      setWellness(w?.wellness || [])
    }).finally(() => setLaden(false))
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
  // herstel komt al gemergd terug van de backend (datum-aware: recentste bron wint)
  // wellness[0] wordt alleen nog gebruikt voor extra Suunto-velden (rust_hartslag etc.)
  const hOrig = data?.herstel || {}
  const laatsteWellness = wellness[0] || null
  const h = { ...hOrig }
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

  const pad2 = n => String(n).padStart(2, '0')
  const dagStr = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
  const vandaag = dagStr(new Date())
  const wellnessByDatum = new Map(wellness.map(w => [datumStr(w.datum), w]))
  const hrv7Dagen = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    const ds = dagStr(d)
    const rec = weekTrainingen.filter(t => datumStr(t.datum) === ds && t.hrv_ochtend).sort((a, b) => b.hrv_ochtend - a.hrv_ochtend)[0]
    const w = wellnessByDatum.get(ds)
    return {
      datum: ds,
      label: d.toLocaleDateString('nl-NL', { weekday: 'short' }),
      hrv: rec?.hrv_ochtend || w?.hrv_ochtend || null,
      slaap: w?.slaap_uur ? parseFloat(w.slaap_uur) : null,
      isVandaag: ds === vandaag,
    }
  })
  const heeftTrendData = hrv7Dagen.some(d => d.hrv !== null || d.slaap !== null)
  const recenteHrv = hrv7Dagen.filter(d => d.hrv !== null)
  const hrvTrendLaag = recenteHrv.length >= 3 && recenteHrv.slice(-3).every(d => d.hrv < 45)

  const echteTrainingen = weekTrainingen.filter(t => t.sport !== 'herstel')
  const weekMinuten = echteTrainingen.reduce((s, t) => s + normMin(t.duur_min), 0)
  const weekKcal = echteTrainingen.reduce((s, t) => s + (t.kcal || 0), 0)
  const heeftTrainingVandaag = echteTrainingen.some(t => datumStr(t.datum) === vandaag)

  const voornaam = (p.name || user.name)?.split(' ')[0]

  const extraWellness = [
    { icon: '⚡', val: `${laatsteWellness?.hulpbronnen_pct}%`, lbl: 'hulpbronnen', show: !!(laatsteWellness?.hulpbronnen_pct) },
    { icon: '💗', val: `${laatsteWellness?.rust_hartslag} bpm`, lbl: 'rust-HR', show: !!(laatsteWellness?.rust_hartslag) },
    { icon: '👟', val: (laatsteWellness?.stappen || 0).toLocaleString('nl-NL'), lbl: 'stappen', show: !!(laatsteWellness?.stappen) },
    { icon: '🔥', val: `${laatsteWellness?.kcal_actief}`, lbl: 'actieve kcal', show: !!(laatsteWellness?.kcal_actief) },
  ].filter(x => x.show)

  return (
    <div className="page dash-page">

      {/* ── HERO ── */}
      <div className="dash-hero">
        <div className="dash-hero-text">
          <h1 className="dash-hero-name">Hey, {voornaam}</h1>
          <p className="dash-hero-dag">{dag}</p>
          {streak >= 2 && (
            <span className="dash-streak-pill">🔥 {streak} dagen streak</span>
          )}
        </div>
        <button className="icon-btn dash-logout-btn" onClick={onUitloggen} title="Uitloggen">
          <span>⎋</span>
        </button>
      </div>

      {/* ── GEREEDHEID & HERSTEL ── */}
      <div className="card dash-gereedheid-card" style={gInfo ? { background: gInfo.bg, borderColor: gInfo.border } : {}}>
        <div className="dash-gereedheid-header">
          <div>
            <h3 className="dash-gereedheid-titel">Gereedheid vandaag</h3>
            {gInfo && <span className="dash-gereedheid-label" style={{ color: gInfo.kleur }}>{gInfo.label}</span>}
          </div>
          <button
            className={`btn btn-sm ${toonOchtendForm ? 'btn-ghost' : 'btn-primary'}`}
            onClick={() => setToonOchtendForm(f => !f)}
          >
            {toonOchtendForm ? 'Annuleer' : '+ Ochtend'}
          </button>
        </div>

        {/* Ochtend log form */}
        {toonOchtendForm && (
          <div className="ochtend-form">
            <p className="ochtend-form-intro">Log je ochtendmetingen voor trainingsadvies op maat:</p>
            <div className="ochtend-form-grid">
              <div className="form-group">
                <label>HRV (ms)</label>
                <input type="number" value={oForm.hrv_ochtend} onChange={e => setOForm(f => ({ ...f, hrv_ochtend: e.target.value }))} placeholder="65" autoFocus />
              </div>
              <div className="form-group">
                <label>Slaap (uur)</label>
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

        {/* Lege staat */}
        {!heeftHerstelData && !toonOchtendForm && (
          <div className="dash-gereedheid-leeg">
            <div className="dash-gereedheid-leeg-icon">📊</div>
            <div>
              <strong>Log je ochtenddata</strong>
              <p>HRV en slaap vormen de basis van je trainingsplanning.</p>
            </div>
            <button className="btn btn-primary" onClick={() => setToonOchtendForm(true)}>
              Start logging
            </button>
          </div>
        )}

        {/* Data aanwezig */}
        {heeftHerstelData && !toonOchtendForm && (
          <div className="dash-gereedheid-content">
            {herstelDagen > 1 && (
              <p className="stale-warning">⚠️ Data van {herstelDagen} dag{herstelDagen !== 1 ? 'en' : ''} geleden</p>
            )}

            {/* Ring + primaire metrics */}
            <div className="dash-gereedheid-body">
              {gInfo && gereedheid !== null && (
                <GereedheidsRing score={gereedheid} gInfo={gInfo} />
              )}
              <div className="dash-gereedheid-metrics">
                {h.hrv_ochtend && (
                  <div className="dash-metric-pill">
                    <span className="dash-metric-icon">💓</span>
                    <div>
                      <span className="dash-metric-val">{h.hrv_ochtend}</span>
                      <span className="dash-metric-unit">ms HRV</span>
                    </div>
                  </div>
                )}
                {h.slaap_uur && (
                  <div className="dash-metric-pill">
                    <span className="dash-metric-icon">😴</span>
                    <div>
                      <span className="dash-metric-val">{h.slaap_uur}</span>
                      <span className="dash-metric-unit">uur slaap</span>
                    </div>
                  </div>
                )}
                {h.herstelbalans != null && (
                  <div className="dash-metric-pill">
                    <span className="dash-metric-icon">🔋</span>
                    <div>
                      <span className="dash-metric-val">
                        {`${Math.round(h.herstelbalans)}${Math.abs(parseFloat(h.herstelbalans)) > 20 ? '%' : ''}`}
                      </span>
                      <span className="dash-metric-unit">reserves</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Suunto extra metrics (rust-HR, stappen, actieve kcal) */}
            {extraWellness.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {extraWellness.map(x => (
                  <div key={x.lbl} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(0,0,0,0.06)',
                    borderRadius: 8, padding: '5px 10px', fontSize: '0.78rem',
                  }}>
                    <span>{x.icon}</span>
                    <span style={{ fontWeight: 700 }}>{x.val}</span>
                    <span style={{ color: 'var(--text-3)', fontSize: '0.68rem' }}>{x.lbl}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Advies */}
            {gInfo && (
              <div className="dash-gereedheid-advies">
                <span className="dash-advies-arrow">→</span>
                <span>{gInfo.aangeraden}</span>
              </div>
            )}

            {/* 7-daagse gecombineerde grafiek: slaapbalken + HRV-labels */}
            {heeftTrendData && (
              <div className="dash-hrv-trend-wrap">
                {hrvTrendLaag && (
                  <p className="hrv-waarschuwing">⚠️ HRV laag — herstel heeft voorrang</p>
                )}
                <div style={{ display: 'flex', gap: 4, height: 88, alignItems: 'flex-end', marginBottom: 4 }}>
                  {hrv7Dagen.map(d => {
                    const slaapHoogte = d.slaap ? Math.min(100, (d.slaap / 9) * 100) : 4
                    const slaapKleur = !d.slaap ? 'var(--border)'
                      : d.slaap >= 7.5 ? '#22c55e'
                      : d.slaap >= 6.5 ? '#eab308'
                      : '#ef4444'
                    const hrvKleur = !d.hrv ? 'transparent'
                      : d.hrv >= 60 ? '#16a34a'
                      : d.hrv >= 45 ? '#b45309'
                      : '#dc2626'
                    return (
                      <div key={d.datum} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontSize: '0.58rem', fontWeight: 700, color: hrvKleur, lineHeight: 1, minHeight: 10 }}>
                          {d.hrv || ''}
                        </span>
                        <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                          <div
                            style={{ width: '100%', height: `${slaapHoogte}%`, background: slaapKleur, borderRadius: 4, minHeight: 4, transition: 'height 0.4s' }}
                            title={[d.slaap ? `${d.slaap}u slaap` : null, d.hrv ? `HRV ${d.hrv}ms` : null].filter(Boolean).join(' · ') || d.label}
                          />
                        </div>
                        <span style={{ fontSize: '0.65rem', fontWeight: d.isVandaag ? 700 : 400, color: d.isVandaag ? 'var(--accent)' : '#64748b' }}>
                          {d.label.slice(0, 2)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>Balk: slaap&nbsp;<span style={{ color: '#22c55e' }}>●</span>≥7,5u&nbsp;<span style={{ color: '#eab308' }}>●</span>6,5–7,5u&nbsp;<span style={{ color: '#ef4444' }}>●</span>&lt;6,5u</span>
                  <span>Getal: HRV (ms)</span>
                </div>
              </div>
            )}
          </div>
        )}

        <button className="dash-coach-link" onClick={() => onNavigeer('coach')}>
          💬 Vraag coach om analyse →
        </button>
      </div>

      {/* ── WEEK TRAINING ── */}
      {echteTrainingen.length > 0 && (
        <div className="card dash-week-card">
          <div className="card-header">
            <h3>Training deze week</h3>
            <button className="link-btn small" onClick={() => onNavigeer('training')}>Bekijk →</button>
          </div>
          <div className="dash-week-stats">
            <div className="dash-week-stat">
              <span className="dash-week-stat-val">{echteTrainingen.length}</span>
              <span className="dash-week-stat-lbl">{echteTrainingen.length === 1 ? 'sessie' : 'sessies'}</span>
            </div>
            <div className="dash-week-stat-divider" />
            <div className="dash-week-stat">
              <span className="dash-week-stat-val">
                {weekMinuten >= 60
                  ? `${Math.floor(weekMinuten / 60)}u${weekMinuten % 60 ? weekMinuten % 60 + 'm' : ''}`
                  : `${weekMinuten}m`}
              </span>
              <span className="dash-week-stat-lbl">trainingstijd</span>
            </div>
            {weekKcal > 0 && (
              <>
                <div className="dash-week-stat-divider" />
                <div className="dash-week-stat">
                  <span className="dash-week-stat-val">{weekKcal}</span>
                  <span className="dash-week-stat-lbl">kcal</span>
                </div>
              </>
            )}
          </div>
          <div className="dash-week-sports">
            {echteTrainingen.slice(0, 7).map((t, i) => (
              <div key={t.id || i} className="dash-sport-chip" title={`${t.sport}${t.duur_min ? ' — ' + normMin(t.duur_min) + 'min' : ''}`}>
                <SportIcoon sport={t.sport} size={16} />
                {t.duur_min && <span className="dash-sport-duur">{normMin(t.duur_min) >= 60 ? `${Math.floor(normMin(t.duur_min)/60)}u` : `${normMin(t.duur_min)}m`}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── VOEDING VANDAAG ── */}
      <div className="card">
        <div className="card-header">
          <h3>Voeding vandaag</h3>
          <button className="link-btn small" onClick={() => onNavigeer('voeding')}>Log →</button>
        </div>
        <div className={`dash-dag-badge ${heeftTrainingVandaag ? 'dash-dag-badge--training' : 'dash-dag-badge--rust'}`}>
          {heeftTrainingVandaag ? '⚡ Trainingsdag — prioriteer koolhydraten' : '💤 Rustdag — focus op eiwit (1.6–2 g/kg)'}
        </div>

        <div className="dash-macro-grid">
          <div className="dash-macro-main">
            <span className="dash-macro-main-val">{v.kcal || 0}</span>
            <span className="dash-macro-main-sub">/ {doel_kcal_aangepast} kcal{training_kcal_vandaag > 0 && <span className="dash-training-kcal"> +{training_kcal_vandaag}🔥</span>}</span>
            <div className="dash-macro-bar-wrap">
              <div className="dash-macro-bar dash-macro-bar--primary" style={{ width: kcalPct + '%' }} />
            </div>
          </div>
          <div className="dash-macro-trio">
            <MacroMini label="Eiwit" val={Math.round(v.eiwit||0)} doel={p.doel_eiwit_g||160} pct={eiwitPct} kleur="green" />
            <MacroMini label="Koolh." val={Math.round(v.koolhydraten||0)} doel={p.doel_koolhydraten_g||250} pct={khPct} kleur="blue" />
            <MacroMini label="Vet" val={Math.round(v.vetten||0)} doel={p.doel_vetten_g||80} pct={vetPct} kleur="orange" />
          </div>
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
                  {m.eiwit_g != null && <span className="eiwit-tag">{parseFloat(m.eiwit_g).toFixed(0)}g</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── GEWICHT TREND ── */}
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

      {/* ── DOELEN ── */}
      {doelen.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Actieve doelen</h3>
            <button className="link-btn" onClick={() => onNavigeer('doelen')}>Bekijk →</button>
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

    </div>
  )
}

function MacroMini({ label, val, doel, pct, kleur }) {
  return (
    <div className="dash-macro-mini">
      <div className="dash-macro-mini-header">
        <span className="dash-macro-mini-lbl">{label}</span>
        <span className="dash-macro-mini-val">{val}g</span>
      </div>
      <div className="dash-macro-mini-bar">
        <div className={`dash-macro-mini-fill dash-macro-fill--${kleur}`} style={{ width: pct + '%' }} />
      </div>
      <span className="dash-macro-mini-doel">/ {doel}g</span>
    </div>
  )
}
