import { useState, useEffect } from 'react'
import { api, datumStr, datumNl as datumNlApi, MACRO_DEFAULTS } from '../api.js'
import SportIcoon, { normMin, SPORT_ACCENT } from '../sportIcoon.jsx'
import { hrvKleur, hrvScore } from '../../shared/health.js'
import Ring from './ui/Ring.jsx'
import MetricRing from './ui/MetricRing.jsx'
import Card from './ui/Card.jsx'
import Sheet from './ui/Sheet.jsx'
import Chip from './ui/Chip.jsx'
import MetricHero from './ui/MetricHero.jsx'

// ── Readiness score ─────────────────────────────────────────────────────────

function berekenGereedheid(h) {
  if (!h) return null
  const scores = []
  if (h.hrv_ochtend) {
    scores.push({ w: 50, v: hrvScore(h.hrv_ochtend) })
  }
  if (h.slaap_uur) {
    const v = parseFloat(h.slaap_uur)
    scores.push({ w: 30, v: v >= 8 ? 100 : v >= 7 ? 85 : v >= 6 ? 62 : v >= 5 ? 38 : 18 })
  }
  if (h.herstel_balans != null) {
    const v = parseFloat(h.herstel_balans)
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

function zoneInfo(score) {
  if (score >= 67) return {
    chip: 'green', label: 'Klaar voor intensief',
    advies: 'Ideaal voor interval, krachttraining of hoge intensiteit.',
  }
  if (score >= 34) return {
    chip: 'amber', label: 'Matige intensiteit',
    advies: 'Zone 2 duurtraining of techniekwerk aanbevolen (45–60 min).',
  }
  return {
    chip: 'red', label: 'Herstel aanbevolen',
    advies: 'Intensief trainen vertraagt herstel. Prioriteer slaap en voeding.',
  }
}

// Sport-accentkleur: canonieke map uit sportIcoon.jsx (één waarheid)
const SPORT_COLOR = SPORT_ACCENT

// ── Helpers ────────────────────────────────────────────────────────────────

const pad2 = n => String(n).padStart(2, '0')
const dagStr = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
const fmtSlaapMin = m => m >= 60 ? `${Math.floor(m/60)}u${m%60 ? pad2(m%60) : ''}` : `${m}m`

// ── Component ──────────────────────────────────────────────────────────────

export default function Dashboard({ user, onNavigeer, onUitloggen }) {
  const [data, setData]         = useState(null)
  const [wellness, setWellness] = useState([])
  const [laden, setLaden]       = useState(true)
  const [fout, setFout]         = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [oForm, setOForm]       = useState({ hrv_ochtend: '', slaap_uur: '', slaap_score: '', herstel_balans: '', stemming: '' })
  const [oOpslaan, setOOpslaan] = useState(false)

  function laadData() {
    setLaden(true)
    Promise.all([
      api.get('/dashboard').catch(e => { setFout(e.message); return null }),
      api.get('/wellness?dagen=14').catch(() => ({ wellness: [] })),
    ]).then(([d, w]) => {
      if (d) setData(d)
      setWellness(w?.wellness || [])
    }).finally(() => setLaden(false))
  }

  useEffect(() => {
    laadData()
    // Herlaad data als gebruiker terugkomt naar de app/tab
    const onVisible = () => { if (!document.hidden) laadData() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function logOchtend() {
    if (!oForm.hrv_ochtend && !oForm.slaap_uur) return
    setOOpslaan(true)
    try {
      await api.post('/training', {
        sport: 'herstel',
        datum: dagStr(new Date()),
        ...Object.fromEntries(Object.entries(oForm).filter(([, v]) => v !== '')),
      })
      const nieuw = await api.get('/dashboard')
      setData(nieuw)
      setSheetOpen(false)
      setOForm({ hrv_ochtend: '', slaap_uur: '', slaap_score: '', herstel_balans: '', stemming: '' })
    } catch (err) { console.error(err) }
    finally { setOOpslaan(false) }
  }

  if (laden) return <div className="page" style={{ alignItems: 'center', justifyContent: 'center' }}><div className="skeleton" style={{ width: 200, height: 200, borderRadius: '50%' }} /></div>
  if (fout)  return <div className="page"><Card><p className="t-sm t-red">Dashboard kon niet laden: {fout}</p></Card></div>

  // ── Derived data ──────────────────────────────────────────────────────────

  const p             = data?.profiel          || {}
  const v             = data?.vandaag          || {}
  const h             = data?.herstel          || {}
  const doelen        = data?.doelen           || []
  const trend         = data?.gewicht_trend    || []
  const weekTrainingen = data?.week_trainingen || []
  const streak        = data?.streak           || 0

  const vandaag = dagStr(new Date())
  const dag = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
  const voornaam = (p.name || user?.name)?.split(' ')[0] || 'Atleet'

  const echteTrainingen = weekTrainingen.filter(t => t.sport !== 'herstel')
  const heeftTrainingVandaag = echteTrainingen.some(t => datumStr(t.datum) === vandaag)
  const weekMinuten = echteTrainingen.reduce((s, t) => s + normMin(t.duur_min), 0)
  const weekKcal    = echteTrainingen.reduce((s, t) => s + (t.kcal || 0), 0)

  // Nutrition — vast doel (TDEE bevat de activiteit al: geen eat-back/dubbeltelling).
  // Trainingscalorieën worden apart getoond, niet bij het doel opgeteld.
  const doel_kcal     = p.doel_kcal || MACRO_DEFAULTS.kcal
  const training_kcal = v.training_kcal || 0
  const kcalPct  = Math.min(100, Math.round(((v.kcal || 0) / doel_kcal) * 100))
  const eiwitPct = p.doel_eiwit_g       ? Math.min(100, Math.round(((v.eiwit||0)        / p.doel_eiwit_g)       * 100)) : 0
  const khPct    = p.doel_koolhydraten_g ? Math.min(100, Math.round(((v.koolhydraten||0) / p.doel_koolhydraten_g) * 100)) : 0
  const vetPct   = p.doel_vetten_g       ? Math.min(100, Math.round(((v.vetten||0)       / p.doel_vetten_g)       * 100)) : 0

  // Readiness
  const gereedheid = berekenGereedheid(h)
  const zone       = gereedheid !== null ? zoneInfo(gereedheid) : null
  const heeftData  = !!(h.hrv_ochtend || h.slaap_uur)

  const herstelDagen = h?.datum
    ? Math.floor((Date.now() - new Date((datumStr(h.datum) || '') + 'T12:00:00').getTime()) / 86400000)
    : null

  // 7-day HRV/sleep trend
  const wellnessByDatum = new Map(wellness.map(w => [datumStr(w.datum), w]))
  const hrv7 = Array.from({ length: 7 }, (_, i) => {
    const d  = new Date(); d.setDate(d.getDate() - (6 - i))
    const ds = dagStr(d)
    const tr = weekTrainingen.filter(t => datumStr(t.datum) === ds && t.hrv_ochtend)
      .sort((a, b) => b.hrv_ochtend - a.hrv_ochtend)[0]
    const wl = wellnessByDatum.get(ds)
    return {
      datum: ds,
      label: d.toLocaleDateString('nl-NL', { weekday: 'short' }).slice(0, 2),
      hrv:   tr?.hrv_ochtend || wl?.hrv_ochtend || null,
      slaap: wl?.slaap_uur ? parseFloat(wl.slaap_uur) : null,
      isVandaag: ds === vandaag,
    }
  })
  const heeftTrend = hrv7.some(d => d.hrv !== null || d.slaap !== null)

  // 7-day baseline for Ring (mean gereedheid of days with hrv or slaap)
  const baselineScores = hrv7.slice(0, 6)
    .map(d => berekenGereedheid({ hrv_ochtend: d.hrv, slaap_uur: d.slaap }))
    .filter(s => s !== null)
  const baseline7d = baselineScores.length
    ? Math.round(baselineScores.reduce((a, b) => a + b, 0) / baselineScores.length)
    : null

  // HRV vs 7-daags gemiddelde (exclusief vandaag)
  const eerdereHrv = hrv7.slice(0, 6).map(d => d.hrv).filter(Boolean)
  const hrvGem7 = eerdereHrv.length >= 3
    ? Math.round(eerdereHrv.reduce((a, b) => a + b, 0) / eerdereHrv.length)
    : null
  const hrvDelta = hrvGem7 && h.hrv_ochtend ? Math.round(h.hrv_ochtend) - hrvGem7 : null

  // Slaapfases van de getoonde herstel-dag (Suunto)
  const slaapRow = h?.datum ? wellnessByDatum.get(datumStr(h.datum)) : null
  const fases = slaapRow ? [
    { label: 'Diep',  min: slaapRow.diepe_slaap_min  || 0, color: 'var(--blue)' },
    { label: 'REM',   min: slaapRow.rem_slaap_min    || 0, color: '#c084fc' },
    { label: 'Licht', min: slaapRow.lichte_slaap_min || 0, color: 'var(--bg-surface)' },
  ].filter(f => f.min > 0) : []
  const fasesTotaal = fases.reduce((s, f) => s + f.min, 0)

  // ── WHOOP-metrieken: Belasting (Strain 0-21) en Slaap-prestatie ──
  const trainingenVandaag = echteTrainingen.filter(t => datumStr(t.datum) === vandaag)
  const trainingLoadVandaag = trainingenVandaag.reduce(
    (s, t) => s + normMin(t.duur_min) * ((t.rpe ? parseInt(t.rpe) : 5) / 10), 0)
  const stappenVandaag = wellnessByDatum.get(vandaag)?.stappen || 0
  const stapStrain = Math.min(6, stappenVandaag / 2500)
  const strain = Math.min(21, Math.round(Math.max(stapStrain, trainingLoadVandaag / 3.2) * 10) / 10)
  const strainLabel = strain >= 18 ? 'All-out' : strain >= 14 ? 'Zwaar' : strain >= 10 ? 'Matig' : 'Licht'

  // Slaap-prestatie t.o.v. behoefte (~8u)
  const slaapUur = h.slaap_uur ? parseFloat(h.slaap_uur) : null
  const slaapPerf = slaapUur != null ? Math.min(100, Math.round((slaapUur / 8) * 100)) : null

  // 7-daags overzicht: belasting (strain) + herstel per dag (WHOOP-weekgrafiek)
  const weekOverzicht = hrv7.map(d => {
    const load = echteTrainingen
      .filter(t => datumStr(t.datum) === d.datum)
      .reduce((s, t) => s + normMin(t.duur_min) * ((t.rpe ? parseInt(t.rpe) : 5) / 10), 0)
    return {
      label: d.label,
      isVandaag: d.isVandaag,
      strain: Math.min(21, Math.round((load / 3.2) * 10) / 10),
      recovery: berekenGereedheid({ hrv_ochtend: d.hrv, slaap_uur: d.slaap }),
    }
  })
  const heeftWeek = weekOverzicht.some(d => d.strain > 0 || d.recovery != null)

  // WHOOP-advies: doelbelasting op basis van herstel
  const strainAdvies = gereedheid == null ? null
    : gereedheid >= 67 ? { tekst: 'Goed hersteld — je kunt vandaag flink belasten.', doel: 'Streef naar 14–18', kleur: '#16EC5E' }
    : gereedheid >= 34 ? { tekst: 'Matig herstel — houd de belasting gematigd.', doel: 'Streef naar 8–13', kleur: '#FFD54A' }
    : { tekst: 'Laag herstel — prioriteer rust en herstel.', doel: 'Houd het licht (< 8)', kleur: '#FF3B5C' }

  // Extra Suunto metrics — gebruik meest recente rij per veld
  const laatste = wellness[0] || null
  const extraMetrics = [
    { val: laatste?.hulpbronnen_pct != null ? `${laatste.hulpbronnen_pct}%` : null, unit: '', label: 'Hulpbronnen' },
    { val: laatste?.rust_hartslag, unit: 'bpm', label: 'HR slaap' },
    { val: laatste?.min_hartslag_dag, unit: 'bpm', label: 'HR dag' },
    { val: laatste?.stappen ? laatste.stappen.toLocaleString('nl-NL') : null, unit: '', label: 'Stappen' },
    { val: laatste?.kcal_actief, unit: 'kcal', label: 'Actief' },
  ].filter(x => x.val)

  return (
    <div className="page">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="t-xl">Hey, {voornaam}</h1>
          <p className="t-sm t-muted" style={{ marginTop: 2 }}>{dag}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {streak >= 2 && <Chip label={`🔥 ${streak}`} color="amber" />}
          <button
            className="btn btn-icon btn-sm"
            onClick={laadData}
            disabled={laden}
            style={{ padding: '8px', minWidth: 36 }}
            title="Vernieuwen" aria-label="Ververs dashboard"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              style={laden ? { animation: 'spin 1s linear infinite' } : undefined}>
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
          <button
            className="btn btn-icon btn-sm"
            onClick={onUitloggen}
            style={{ padding: '8px', minWidth: 36 }}
            title="Uitloggen" aria-label="Uitloggen"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Readiness card ─────────────────────────────────────────────── */}
      <Card>

        {/* Herstel-ring (WHOOP-stijl hero) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', paddingTop: 'var(--space-2)' }}>
          {heeftData && gereedheid !== null ? (
            <Ring score={gereedheid} baseline={baseline7d} size={244} label="Herstel" />
          ) : (
            <div style={{ width: 244, height: 244, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}>
              <svg width="244" height="244" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="122" cy="122" r="113" fill="none" stroke="var(--hairline)" strokeWidth="18" />
              </svg>
              <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span className="t-xl t-muted">—</span>
                <span className="t-label">Herstel</span>
              </div>
            </div>
          )}

          {/* Zone-tekst WHOOP-stijl */}
          {zone && (
            <span style={{
              fontSize: 'var(--t-xs)', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: zone.chip === 'green' ? '#16EC5E' : zone.chip === 'amber' ? '#FFD54A' : '#FF3B5C',
            }}>{zone.label}</span>
          )}
        </div>

        {/* WHOOP-kernmetrieken: Belasting (Strain) + Slaap */}
        {heeftData && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-8)', marginTop: 'var(--space-5)' }}>
            <MetricRing
              value={strain} max={21} decimals={1}
              kleur="#0093E7" glow="rgba(0,147,231,0.42)"
              grootLabel="/21" subLabel="Belasting"
            />
            {slaapPerf != null && (
              <MetricRing
                value={slaapPerf} max={100}
                kleur="#B388FF" glow="rgba(179,136,255,0.40)"
                grootLabel="%" subLabel="Slaap"
              />
            )}
          </div>
        )}

        {/* Strain-label + advies (WHOOP-coaching) */}
        {heeftData && (
          <p className="t-xs" style={{ textAlign: 'center', marginTop: 'var(--space-2)', textTransform: 'none', letterSpacing: 0, color: '#0093E7', fontWeight: 600 }}>
            Belasting: {strainLabel}{slaapUur != null ? ` · ${slaapUur.toFixed(1)}u geslapen` : ''}
          </p>
        )}
        {strainAdvies && (
          <div style={{
            marginTop: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)',
            background: 'var(--bg-raised)', borderRadius: 'var(--r-sm)',
            borderLeft: `3px solid ${strainAdvies.kleur}`,
          }}>
            <p className="t-sm" style={{ color: 'var(--text-2)' }}>{strainAdvies.tekst}</p>
            <p className="t-sm" style={{ color: strainAdvies.kleur, fontWeight: 700, marginTop: 2 }}>{strainAdvies.doel}</p>
          </div>
        )}

        {/* Metrics row */}
        {heeftData && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${h.hrv_laatste ? 4 : 3}, 1fr)`, gap: 'var(--space-2)', marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--hairline)' }}>
            <div style={{ textAlign: 'center' }}>
              <MetricHero
                value={h.hrv_ochtend ? Math.round(h.hrv_ochtend) : null}
                unit={h.hrv_ochtend ? 'ms' : ''}
                label="Nightly"
                color={h.hrv_ochtend ? hrvKleur(h.hrv_ochtend) : undefined}
              />
              {hrvDelta !== null && (
                <div className="t-xs" style={{
                  marginTop: 2, textTransform: 'none', letterSpacing: 0,
                  color: hrvDelta >= 0 ? 'var(--green)' : 'var(--red)',
                }}>
                  {hrvDelta >= 0 ? '▲' : '▼'} {Math.abs(hrvDelta)} vs 7d
                </div>
              )}
            </div>
            {h.hrv_laatste && (
              <div style={{ textAlign: 'center', borderLeft: '1px solid var(--hairline)' }}>
                <MetricHero
                  value={Math.round(h.hrv_laatste)}
                  unit="ms"
                  label={h.hrv_laatste_tijd ? `HRV ${h.hrv_laatste_tijd}` : 'HRV nu'}
                  color={hrvKleur(h.hrv_laatste)}
                />
              </div>
            )}
            <div style={{ textAlign: 'center', borderLeft: '1px solid var(--hairline)', paddingLeft: 'var(--space-2)' }}>
              <MetricHero
                value={h.slaap_uur ? parseFloat(h.slaap_uur).toFixed(1) : null}
                unit={h.slaap_uur ? 'u' : ''}
                label="Slaap"
                color={h.slaap_uur >= 7.5 ? 'var(--green)' : h.slaap_uur >= 6 ? 'var(--amber)' : h.slaap_uur ? 'var(--red)' : undefined}
              />
            </div>
            <div style={{ textAlign: 'center', borderLeft: '1px solid var(--hairline)', paddingLeft: 'var(--space-2)' }}>
              <MetricHero
                value={h.herstel_balans != null ? `${Math.round(h.herstel_balans)}${Math.abs(h.herstel_balans) > 20 ? '%' : ''}` : null}
                label="Balans"
              />
            </div>
          </div>
        )}

        {/* Staleness warning */}
        {herstelDagen > 1 && (
          <p className="t-sm t-muted" style={{ textAlign: 'center', marginTop: 'var(--space-3)' }}>
            Data van {herstelDagen} dag{herstelDagen !== 1 ? 'en' : ''} geleden
          </p>
        )}


        {/* Extra Suunto stats */}
        {extraMetrics.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
            {extraMetrics.map(m => (
              <div key={m.label} className="card-inset" style={{ textAlign: 'center', minWidth: 72 }}>
                <div className="t-sm" style={{ fontWeight: 600 }}>{m.val}{m.unit && <span className="t-xs t-muted"> {m.unit}</span>}</div>
                <div className="t-xs t-muted" style={{ marginTop: 1 }}>{m.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* 7-day HRV/sleep chart */}
        {heeftTrend && <TrendChart days={hrv7} />}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setSheetOpen(true)}>
            {heeftData ? 'Bijwerken' : '+ Ochtend loggen'}
          </button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => onNavigeer('coach')}>
            Vraag coach →
          </button>
        </div>
      </Card>

      {/* ── WHOOP-weekgrafiek: Belasting vs Herstel ───────────────────────── */}
      {heeftWeek && (
        <Card>
          <div className="card-header">
            <span className="t-lg">Belasting &amp; herstel</span>
            <span className="t-xs t-muted">7 dagen</span>
          </div>
          <WeekStrainRecovery data={weekOverzicht} />
        </Card>
      )}

      {/* ── WHOOP-slaapkaart ──────────────────────────────────────────────── */}
      {slaapUur != null && (
        <SlaapKaart uur={slaapUur} perf={slaapPerf} fases={fases} fasesTotaal={fasesTotaal} score={h.slaap_score} />
      )}

      {/* ── Training week ───────────────────────────────────────────────── */}
      {echteTrainingen.length > 0 && (
        <Card>
          <div className="card-header">
            <span className="t-lg">Training week</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigeer('training')}>Bekijk →</button>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
            <div>
              <div className="metric-row">
                <span className="metric-value" style={{ fontSize: 'var(--t-xl)' }}>{echteTrainingen.length}</span>
              </div>
              <div className="metric-label">{echteTrainingen.length === 1 ? 'sessie' : 'sessies'}</div>
            </div>
            <div style={{ width: 1, background: 'var(--hairline)' }} />
            <div>
              <div className="metric-row">
                <span className="metric-value" style={{ fontSize: 'var(--t-xl)' }}>
                  {weekMinuten >= 60
                    ? `${Math.floor(weekMinuten/60)}u${weekMinuten%60 ? weekMinuten%60+'m' : ''}`
                    : `${weekMinuten}m`}
                </span>
              </div>
              <div className="metric-label">trainingstijd</div>
            </div>
            {weekKcal > 0 && (
              <>
                <div style={{ width: 1, background: 'var(--hairline)' }} />
                <div>
                  <div className="metric-row">
                    <span className="metric-value" style={{ fontSize: 'var(--t-xl)' }}>{weekKcal}</span>
                  </div>
                  <div className="metric-label">kcal</div>
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {echteTrainingen.slice(0, 7).map((t, i) => {
              const min = normMin(t.duur_min)
              const color = SPORT_COLOR[t.sport] || 'var(--text-3)'
              const isToday = datumStr(t.datum) === vandaag
              return (
                <div key={t.id || i} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'var(--bg-surface)',
                  border: isToday ? `1px solid ${color}` : '1px solid transparent',
                  borderRadius: 'var(--r-xs)',
                  padding: '6px 10px',
                  color,
                }}>
                  <SportIcoon sport={t.sport} size={14} />
                  {min > 0 && (
                    <span style={{ fontSize: 'var(--t-xs)', fontWeight: 600 }}>
                      {min >= 60 ? `${Math.floor(min/60)}u${min%60 ? min%60+'m' : ''}` : `${min}m`}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ── Nutrition today ─────────────────────────────────────────────── */}
      <Card>
        <div className="card-header">
          <span className="t-lg">Voeding vandaag</span>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigeer('voeding')}>Log →</button>
        </div>

        <Chip
          label={heeftTrainingVandaag ? 'Trainingsdag — prioriteer koolhydraten' : 'Rustdag — focus op eiwit'}
          color={heeftTrainingVandaag ? 'blue' : 'muted'}
        />

        {/* Kcal main bar */}
        <div style={{ marginTop: 'var(--space-4)' }}>
          <div className="row-between" style={{ marginBottom: 'var(--space-2)' }}>
            <span className="t-sm t-muted">Energie</span>
            <span className="t-sm">
              <span style={{ fontWeight: 700 }}>{v.kcal || 0}</span>
              <span className="t-muted"> / {doel_kcal} kcal</span>
              {training_kcal > 0 && (
                <span style={{ color: 'var(--amber)', fontSize: 'var(--t-xs)', fontWeight: 600 }}> · 🔥 {training_kcal} getraind</span>
              )}
            </span>
          </div>
          <div className="progress-bar" style={{ height: 6 }}>
            <div className="progress-fill" style={{ width: `${kcalPct}%`, background: kcalPct >= 100 ? 'var(--amber)' : 'var(--green)' }} />
          </div>
        </div>

        {/* Macro trio */}
        <div className="form-grid-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 'var(--space-3)', gap: 'var(--space-2)' }}>
          <MacroBar label="Eiwit"  val={Math.round(v.eiwit||0)}        doel={p.doel_eiwit_g||MACRO_DEFAULTS.eiwit_g}        pct={eiwitPct} color="var(--green)" />
          <MacroBar label="Koolh." val={Math.round(v.koolhydraten||0)} doel={p.doel_koolhydraten_g||MACRO_DEFAULTS.koolhydraten_g} pct={khPct}    color="var(--blue)" />
          <MacroBar label="Vet"    val={Math.round(v.vetten||0)}       doel={p.doel_vetten_g||MACRO_DEFAULTS.vetten_g}        pct={vetPct}   color="var(--amber)" />
        </div>

        {/* Meal list */}
        {v.maaltijden_lijst?.length > 0 && (
          <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid var(--hairline)', paddingTop: 'var(--space-3)' }}>
            {v.maaltijden_lijst.map((m, i) => (
              <div key={i} className="list-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="t-label" style={{ marginRight: 6 }}>{m.maaltijd_type || 'maaltijd'}</span>
                  <span className="t-sm">{m.beschrijving || 'Maaltijd'}</span>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
                  {m.kcal != null && <span className="t-sm t-muted">{m.kcal}</span>}
                  {m.eiwit_g != null && <Chip label={`${parseFloat(m.eiwit_g).toFixed(0)}g`} color="green" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Goals ───────────────────────────────────────────────────────── */}
      {doelen.length > 0 && (
        <Card>
          <div className="card-header">
            <span className="t-lg">Actieve doelen</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigeer('doelen')}>Bekijk →</button>
          </div>
          <div className="section-gap">
            {doelen.slice(0, 3).map(d => {
              const pct = d.doel_waarde && d.huidige_waarde
                ? Math.min(100, Math.round((d.huidige_waarde / d.doel_waarde) * 100)) : 0
              return (
                <div key={d.id}>
                  <div className="row-between" style={{ marginBottom: 'var(--space-2)' }}>
                    <span className="t-sm">{d.titel}</span>
                    <span className="t-sm t-muted">{d.huidige_waarde||0} / {d.doel_waarde} {d.eenheid||''}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--green)' : 'var(--blue)' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ── Weight trend ────────────────────────────────────────────────── */}
      {trend.length > 1 && (
        <Card>
          <div className="card-header">
            <span className="t-lg">Gewicht</span>
            <span className="t-sm t-muted">
              {trend[trend.length-1]?.gewicht_kg} kg
            </span>
          </div>
          <WeightChart trend={trend} />
        </Card>
      )}

      {/* ── Morning log sheet ────────────────────────────────────────────── */}
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Ochtend log">
        <div className="section-gap">
          <p className="t-sm t-muted">Log je ochtendmetingen voor trainingsadvies op maat.</p>
          <div className="form-grid-2">
            <div className="form-group">
              <label>HRV (ms)</label>
              <input className="input" type="number" value={oForm.hrv_ochtend}
                onChange={e => setOForm(f => ({ ...f, hrv_ochtend: e.target.value }))}
                placeholder="65" autoFocus />
            </div>
            <div className="form-group">
              <label>Slaap (uur)</label>
              <input className="input" type="number" step="0.1" value={oForm.slaap_uur}
                onChange={e => setOForm(f => ({ ...f, slaap_uur: e.target.value }))}
                placeholder="7.5" />
            </div>
            <div className="form-group">
              <label>Slaapscore</label>
              <input className="input" type="number" value={oForm.slaap_score}
                onChange={e => setOForm(f => ({ ...f, slaap_score: e.target.value }))}
                placeholder="78" />
            </div>
            <div className="form-group">
              <label>Herstelbalans</label>
              <input className="input" type="number" step="0.1" value={oForm.herstel_balans}
                onChange={e => setOForm(f => ({ ...f, herstel_balans: e.target.value }))}
                placeholder="+5.2" />
            </div>
          </div>

          {/* Mood picker */}
          <div className="form-group">
            <label>Stemming</label>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {[['😔','Slecht'],['😕','Matig'],['😐','Neutraal'],['🙂','Goed'],['😊','Top']].map(([emoji, lbl], i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setOForm(f => ({ ...f, stemming: f.stemming == i+1 ? '' : String(i+1) }))}
                  style={{
                    flex: 1,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '10px 4px',
                    background: oForm.stemming == i+1 ? 'var(--bg-surface)' : 'var(--bg-raised)',
                    border: oForm.stemming == i+1 ? '1px solid var(--border-active)' : '1px solid transparent',
                    borderRadius: 'var(--r-sm)',
                    cursor: 'pointer',
                    transition: 'border-color var(--dur-fast)',
                  }}
                >
                  <span style={{ fontSize: 20 }}>{emoji}</span>
                  <span className="t-xs t-muted">{lbl}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            className="btn btn-primary btn-full"
            onClick={logOchtend}
            disabled={oOpslaan || (!oForm.hrv_ochtend && !oForm.slaap_uur)}
          >
            {oOpslaan ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </Sheet>

    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function MacroBar({ label, val, doel, pct, color }) {
  return (
    <div>
      <div className="row-between" style={{ marginBottom: 'var(--space-1)' }}>
        <span className="t-xs t-muted">{label}</span>
        <span className="t-xs" style={{ color }}>{val}g</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="t-xs t-muted" style={{ marginTop: 2, textAlign: 'right' }}>/ {doel}g</div>
    </div>
  )
}

// WHOOP-weekgrafiek: blauwe belasting-staven + gekleurde herstel-stippen per dag
function WeekStrainRecovery({ data }) {
  const H = 120
  const recKleur = r => r == null ? 'var(--text-3)' : r >= 67 ? '#16EC5E' : r >= 34 ? '#FFD54A' : '#FF3B5C'
  return (
    <div>
      <div style={{ position: 'relative', height: H, display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        {data.map((d, i) => {
          const barH = Math.max(3, (d.strain / 21) * H * 0.82)
          const kleur = recKleur(d.recovery)
          return (
            <div key={i} style={{ flex: 1, position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              {d.recovery != null && (
                <div style={{
                  position: 'absolute', left: '50%', transform: 'translate(-50%, -50%)',
                  top: `${H - (d.recovery / 100) * H}px`, width: 11, height: 11, borderRadius: '50%',
                  background: kleur, boxShadow: `0 0 8px ${kleur}`, zIndex: 2,
                }} title={`Herstel ${d.recovery}%`} />
              )}
              <div style={{ width: '100%', height: barH, background: '#0093E7', opacity: d.isVandaag ? 1 : 0.5, borderRadius: 4 }}
                title={`Belasting ${d.strain}`} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {data.map((d, i) => (
          <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: d.isVandaag ? 700 : 400, color: d.isVandaag ? 'var(--text)' : 'var(--text-3)' }}>{d.label}</span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center', marginTop: 'var(--space-3)' }}>
        <span className="t-xs" style={{ display: 'flex', alignItems: 'center', gap: 5, textTransform: 'none', letterSpacing: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: '#0093E7' }} /> Belasting
        </span>
        <span className="t-xs" style={{ display: 'flex', alignItems: 'center', gap: 5, textTransform: 'none', letterSpacing: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16EC5E' }} /> Herstel
        </span>
      </div>
    </div>
  )
}

// WHOOP-slaapkaart: prestatie-%, uren vs behoefte, slaaptekort en fases
function SlaapKaart({ uur, perf, fases, fasesTotaal, score }) {
  const behoefte = 8
  const tekortMin = Math.round((behoefte - uur) * 60)
  const perfKleur = perf >= 85 ? '#16EC5E' : perf >= 70 ? '#FFD54A' : '#FF3B5C'
  return (
    <Card>
      <div className="card-header">
        <span className="t-lg">Slaap</span>
        <span style={{ color: perfKleur, fontWeight: 800, fontSize: 'var(--t-lg)' }}>{perf}%</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontSize: 'var(--t-xl)', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{uur.toFixed(1)}</span>
          <span className="t-sm t-muted"> / {behoefte}u behoefte</span>
        </div>
        <span className="t-sm" style={{ color: tekortMin > 20 ? 'var(--amber)' : 'var(--green)', fontWeight: 600 }}>
          {tekortMin > 20 ? `${tekortMin} min tekort` : 'Slaapdoel gehaald ✓'}
        </span>
        {score ? <span className="t-sm t-muted">· score {score}</span> : null}
      </div>
      {fasesTotaal > 0 && (
        <>
          <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 1, marginTop: 'var(--space-3)' }}>
            {fases.map(f => (
              <div key={f.label} style={{ flex: f.min, background: f.color, borderRadius: 2 }} title={`${f.label}: ${fmtSlaapMin(f.min)}`} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
            {fases.map(f => (
              <span key={f.label} className="t-xs" style={{ display: 'flex', alignItems: 'center', gap: 4, textTransform: 'none', letterSpacing: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: f.color, display: 'inline-block' }} />
                {f.label} {fmtSlaapMin(f.min)}
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

function TrendChart({ days }) {
  const maxSlaap = 9
  return (
    <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--hairline)' }}>
      <span className="t-label" style={{ marginBottom: 'var(--space-3)', display: 'block' }}>7 dagen HRV & slaap</span>
      <div style={{ display: 'flex', gap: 4, height: 80, alignItems: 'flex-end' }}>
        {days.map(d => {
          const slaapH = d.slaap ? Math.max(8, Math.round((d.slaap / maxSlaap) * 100)) : 8
          const slaapColor = !d.slaap ? 'var(--bg-surface)'
            : d.slaap >= 7.5 ? 'var(--green)'
            : d.slaap >= 6.5 ? 'var(--amber)'
            : 'var(--red)'
          const hrvColor = d.hrv ? hrvKleur(d.hrv) : 'var(--text-3)'
          return (
            <div key={d.datum} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: hrvColor, lineHeight: 1 }}>
                {d.hrv || ''}
              </span>
              <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                <div style={{
                  width: '100%', height: `${slaapH}%`,
                  background: slaapColor, borderRadius: 3, minHeight: 4,
                }} />
              </div>
              <span style={{
                fontSize: 9, fontWeight: d.isVandaag ? 700 : 400,
                color: d.isVandaag ? 'var(--text)' : 'var(--text-3)',
              }}>
                {d.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeightChart({ trend }) {
  const vals = trend.map(x => x.gewicht_kg)
  const min  = Math.min(...vals)
  const max  = Math.max(...vals)
  return (
    <div style={{ display: 'flex', gap: 4, height: 64, alignItems: 'flex-end' }}>
      {trend.map((m, i) => {
        const h = 16 + ((m.gewicht_kg - min) / (max - min || 1)) * 48
        const isLast = i === trend.length - 1
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{
              width: '100%', height: h,
              background: isLast ? 'var(--blue)' : 'var(--bg-surface)',
              borderRadius: 3,
            }} />
            {isLast && (
              <span style={{ fontSize: 9, color: 'var(--text-2)', fontWeight: 600 }}>
                {datumNlApi(m.datum, { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

