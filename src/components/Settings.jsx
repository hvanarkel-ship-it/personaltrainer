import { useState, useEffect } from 'react'
import { api } from '../api.js'

const SPORTEN = ['hyrox', 'fitness', 'hardlopen', 'fietsen', 'wielrennen', 'zwemmen', 'padel', 'tennis', 'wandelen', 'yoga', 'voetbal']
const SPORTEN_ICONS = { hyrox: '⚡', fitness: '🏋️', hardlopen: '🏃', fietsen: '🚴', wielrennen: '🚵', zwemmen: '🏊', padel: '🎾', tennis: '🎾', wandelen: '🚶', yoga: '🧘', voetbal: '⚽' }
const STIJLEN = [
  { id: 'direct', label: 'Direct & bondig' },
  { id: 'motiverend', label: 'Motiverend' },
  { id: 'wetenschappelijk', label: 'Wetenschappelijk' },
  { id: 'vriendelijk', label: 'Vriendelijk & ondersteunend' },
]

export default function Settings({ user, onNavigeer, onUitloggen, suuntoStatus, onSuuntoStatusClear }) {
  const [tab, setTab] = useState('profiel')
  const [profiel, setProfiel] = useState(null)
  const [laden, setLaden] = useState(true)
  const [opslaan, setOpslaan] = useState(false)
  const [intervalsSyncing, setIntervalsSyncing] = useState(false)
  const [intervalsConnecting, setIntervalsConnecting] = useState(false)
  const [intervalsForm, setIntervalsForm] = useState({ athlete_id: '', api_key: '' })
  const [melding, setMelding] = useState(null)
  const [runalyzeForm, setRunalyzeForm] = useState({ api_token: '' })
  const [runalyzeConnecting, setRunalyzeConnecting] = useState(false)
  const [runalyzeSyncing, setRunalyzeSyncing] = useState(false)
  const [runalyzeLaatste, setRunalyzeLaatste] = useState(null)
  const [suuntoSyncing, setSuuntoSyncing] = useState(false)
  const [suuntoLaatste, setSuuntoLaatste] = useState(null)

  useEffect(() => { laadProfiel() }, [])

  async function laadProfiel() {
    try {
      const data = await api.get('/profiel')
      setProfiel({
        name: data.name || '',
        geboortejaar: data.geboortejaar || '',
        geslacht: data.geslacht || '',
        lengte_cm: data.lengte_cm || '',
        gewicht_kg: data.gewicht_kg || '',
        sporten: data.sporten || ['fitness', 'padel', 'fietsen'],
        doel_kcal: data.doel_kcal || 2400,
        doel_eiwit_g: data.doel_eiwit_g || 160,
        doel_koolhydraten_g: data.doel_koolhydraten_g || 250,
        doel_vetten_g: data.doel_vetten_g || 80,
        coach_context: data.coach_context || '',
        coach_naam: data.coach_naam || 'APEX Coach',
        coach_stijl: data.coach_stijl || 'direct',
        intervals_verbonden: !!data.intervals_athlete_id,
        intervals_athlete_id: data.intervals_athlete_id || null,
        runalyze_verbonden: !!data.runalyze_verbonden,
        suunto_verbonden:   !!data.suunto_verbonden,
      })
    } catch {
      setMelding({ type: 'error', tekst: 'Kan profiel niet laden' })
    } finally {
      setLaden(false)
    }
  }

  async function slaOp(extra = {}) {
    setOpslaan(true)
    setMelding(null)
    try {
      await api.put('/profiel', { ...profiel, ...extra })
      setMelding({ type: 'success', tekst: '✓ Opgeslagen' })
      setTimeout(() => setMelding(null), 3000)
    } catch (err) {
      setMelding({ type: 'error', tekst: 'Opslaan mislukt: ' + err.message })
    } finally {
      setOpslaan(false)
    }
  }

  function toggleSport(sport) {
    const cur = profiel.sporten || []
    setProfiel(p => ({ ...p, sporten: cur.includes(sport) ? cur.filter(s => s !== sport) : [...cur, sport] }))
  }

  async function verbindIntervals() {
    setIntervalsConnecting(true)
    setMelding(null)
    try {
      const res = await api.post('/intervals-connect', intervalsForm)
      setProfiel(p => ({ ...p, intervals_verbonden: true, intervals_athlete_id: intervalsForm.athlete_id }))
      setIntervalsForm({ athlete_id: '', api_key: '' })
      setMelding({ type: 'success', tekst: `✓ Intervals.icu gekoppeld${res.athlete_name ? ` als ${res.athlete_name}` : ''}` })
    } catch (err) {
      setMelding({ type: 'error', tekst: 'Verbinding mislukt: ' + err.message })
    } finally {
      setIntervalsConnecting(false)
    }
  }

  async function syncIntervals() {
    setIntervalsSyncing(true)
    setMelding(null)
    try {
      const res = await api.post('/intervals-sync', {})
      const debugInfo = res.debug ? ` (ontvangen: ${res.debug.activities_received ?? 0} activiteiten, ${res.debug.wellness_received ?? 0} wellness)` : ''
      const errorInfo = res.debug?.activities_error ? ` ⚠️ ${res.debug.activities_error}` : ''
      setMelding({ type: res.gesynchroniseerd > 0 || res.wellness > 0 ? 'success' : 'error', tekst: `↻ ${res.gesynchroniseerd} training${res.gesynchroniseerd !== 1 ? 'en' : ''} + ${res.wellness} wellness-dagen gesynchroniseerd${debugInfo}${errorInfo}` })
    } catch (err) {
      setMelding({ type: 'error', tekst: 'Intervals sync mislukt: ' + err.message })
    } finally {
      setIntervalsSyncing(false)
    }
  }

  async function ontkoppelIntervals() {
    try {
      await api.put('/profiel', { ontkoppel_intervals: true })
      setProfiel(p => ({ ...p, intervals_verbonden: false, intervals_athlete_id: null }))
      setMelding({ type: 'success', tekst: 'Intervals.icu ontkoppeld.' })
    } catch {
      setMelding({ type: 'error', tekst: 'Fout bij ontkoppelen' })
    }
  }

  async function verbindSuunto() {
    setMelding(null)
    try {
      const { url } = await api.get('/suunto-connect')
      window.location.href = url
    } catch (err) {
      setMelding({ type: 'error', tekst: 'Suunto koppelen mislukt: ' + err.message })
    }
  }

  async function syncSuunto(reset = false) {
    if (reset && !confirm('Weet je het zeker? Alle Suunto-records worden gewist en opnieuw geïmporteerd.')) return
    setSuuntoSyncing(true)
    setMelding(null)
    try {
      const path = reset ? '/suunto-sync?reset=1' : '/suunto-sync'
      const res = await api.post(path, {})
      const fout = res.debug?.workouts_error ? ` ⚠️ ${res.debug.workouts_error}` : ''
      const ontvangen = res.debug?.workouts_received ?? 0
      const wellnessDagen = res.wellness?.wellness_dagen ?? 0
      setSuuntoLaatste({ nieuw: res.nieuweActiviteiten || [], overgeslagen: res.overgeslagen, ontvangen, wellnessDagen, tijdstip: new Date() })
      const wellnessTekst = wellnessDagen > 0 ? ` + ${wellnessDagen} dagen slaap/HRV/herstel` : ''
      setMelding({ type: 'success', tekst: `↻ ${res.gesynchroniseerd} nieuwe workouts, ${res.overgeslagen} al bekend${wellnessTekst}${fout}` })
    } catch (err) {
      setMelding({ type: 'error', tekst: 'Suunto sync mislukt: ' + err.message })
    } finally {
      setSuuntoSyncing(false)
    }
  }

  async function diagnoseSuunto() {
    setMelding(null)
    try {
      const res = await api.get('/suunto-debug')
      const tekst = JSON.stringify(res, null, 2)
      const blob = new Blob([tekst], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err) {
      setMelding({ type: 'error', tekst: 'Diagnose mislukt: ' + err.message })
    }
  }

  async function ontkoppelSuunto() {
    try {
      await api.put('/profiel', { ontkoppel_suunto: true })
      setProfiel(p => ({ ...p, suunto_verbonden: false }))
      setSuuntoLaatste(null)
      setMelding({ type: 'success', tekst: 'Suunto ontkoppeld.' })
    } catch {
      setMelding({ type: 'error', tekst: 'Fout bij ontkoppelen' })
    }
  }

  async function verbindRunalyze() {
    setRunalyzeConnecting(true)
    setMelding(null)
    try {
      await api.post('/runalyze-connect', runalyzeForm)
      setProfiel(p => ({ ...p, runalyze_verbonden: true }))
      setRunalyzeForm({ api_token: '' })
      setMelding({ type: 'success', tekst: '✓ Runalyze gekoppeld' })
    } catch (err) {
      setMelding({ type: 'error', tekst: 'Verbinding mislukt: ' + err.message })
    } finally {
      setRunalyzeConnecting(false)
    }
  }

  async function syncRunalyze() {
    setRunalyzeSyncing(true)
    setMelding(null)
    try {
      const res = await api.post('/runalyze-sync', {})
      const debugInfo = res.debug?.activities_error ? ` ⚠️ ${res.debug.activities_error}` : ''
      setRunalyzeLaatste({ nieuw: res.nieuweActiviteiten || [], overgeslagen: res.overgeslagen, tijdstip: new Date() })
      setMelding({ type: 'success', tekst: `↻ ${res.gesynchroniseerd} nieuw, ${res.overgeslagen} al bekend${debugInfo}` })
    } catch (err) {
      setMelding({ type: 'error', tekst: 'Runalyze sync mislukt: ' + err.message })
    } finally {
      setRunalyzeSyncing(false)
    }
  }

  async function ontkoppelRunalyze() {
    try {
      await api.put('/profiel', { ontkoppel_runalyze: true })
      setProfiel(p => ({ ...p, runalyze_verbonden: false }))
      setMelding({ type: 'success', tekst: 'Runalyze ontkoppeld.' })
    } catch {
      setMelding({ type: 'error', tekst: 'Fout bij ontkoppelen' })
    }
  }

  if (laden) return <div className="page-loading"><div className="spinner" /></div>

  const TABS = [
    { id: 'profiel', label: 'Profiel', icon: '👤' },
    { id: 'coach', label: 'Coach', icon: '🤖' },
    { id: 'doelen', label: "Macro's", icon: '🥗' },
    { id: 'integraties', label: 'Koppelingen', icon: '🔗' },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Instellingen</h1>
          <p className="subtitle">Profiel & koppelingen</p>
        </div>
        <button className="btn btn-ghost" onClick={onUitloggen} style={{ fontSize: '0.8rem' }}>
          Uitloggen
        </button>
      </div>

      {melding && (
        <div className={`alert alert-${melding.type}`} style={{ marginBottom: '12px' }}>
          {melding.tekst}
        </div>
      )}

      <div className="settings-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`settings-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <span className="tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── PROFIEL ── */}
      {tab === 'profiel' && (
        <div className="card">
          <h3>Persoonlijke gegevens</h3>
          <div className="form-group">
            <label>Naam</label>
            <input value={profiel.name} onChange={e => setProfiel(p => ({ ...p, name: e.target.value }))} placeholder="Jouw naam" />
          </div>
          <div className="form-rij">
            <div className="form-group">
              <label>Geboortejaar</label>
              <input type="number" value={profiel.geboortejaar} onChange={e => setProfiel(p => ({ ...p, geboortejaar: parseInt(e.target.value) || '' }))} placeholder="1990" min="1940" max="2010" />
            </div>
            <div className="form-group">
              <label>Geslacht</label>
              <select value={profiel.geslacht} onChange={e => setProfiel(p => ({ ...p, geslacht: e.target.value }))}>
                <option value="">Kies...</option>
                <option value="man">Man</option>
                <option value="vrouw">Vrouw</option>
                <option value="anders">Anders</option>
              </select>
            </div>
          </div>
          <div className="form-rij">
            <div className="form-group">
              <label>Lengte (cm)</label>
              <input type="number" value={profiel.lengte_cm} onChange={e => setProfiel(p => ({ ...p, lengte_cm: parseInt(e.target.value) || '' }))} placeholder="180" />
            </div>
            <div className="form-group">
              <label>Gewicht (kg)</label>
              <input type="number" step="0.1" value={profiel.gewicht_kg} onChange={e => setProfiel(p => ({ ...p, gewicht_kg: parseFloat(e.target.value) || '' }))} placeholder="80.0" />
            </div>
          </div>
          <div className="form-group">
            <label>Actieve sporten</label>
            <div className="sport-checkboxes">
              {SPORTEN.map(sport => (
                <label key={sport} className={`sport-check ${profiel.sporten?.includes(sport) ? 'active' : ''}`}>
                  <input type="checkbox" checked={profiel.sporten?.includes(sport) || false} onChange={() => toggleSport(sport)} />
                  {SPORTEN_ICONS[sport] || '🏃'} {sport}
                </label>
              ))}
            </div>
          </div>
          <button className="btn btn-primary btn-full" onClick={() => slaOp()} disabled={opslaan}>
            {opslaan ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      )}

      {/* ── COACH ── */}
      {tab === 'coach' && (
        <div className="card">
          <h3>Coach instellingen</h3>
          <div className="form-group">
            <label>Coach naam</label>
            <input value={profiel.coach_naam} onChange={e => setProfiel(p => ({ ...p, coach_naam: e.target.value }))} placeholder="APEX Coach" />
          </div>
          <div className="form-group">
            <label>Communicatiestijl</label>
            <select value={profiel.coach_stijl} onChange={e => setProfiel(p => ({ ...p, coach_stijl: e.target.value }))}>
              {STIJLEN.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Jouw context voor de coach</label>
            <textarea
              value={profiel.coach_context}
              onChange={e => setProfiel(p => ({ ...p, coach_context: e.target.value }))}
              placeholder={`Vertel de coach meer over jezelf:\n\n• Blessures of gezondheidsklachten\n• Trainingsachtergrond en niveau\n• Dieet beperkingen of allergieën\n• Doelen op lange termijn\n• Beschikbare apparatuur\n• Levensstijl en tijdsdruk`}
              rows={8}
              style={{ minHeight: '160px' }}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '6px' }}>
              Deze context wordt altijd meegegeven aan de coach voor persoonlijker advies.
            </p>
          </div>
          <button className="btn btn-primary btn-full" onClick={() => slaOp()} disabled={opslaan}>
            {opslaan ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      )}

      {/* ── DOELEN ── */}
      {tab === 'doelen' && (
        <div className="card">
          <h3>Dagelijkse voedingsdoelen</h3>
          <div className="macro-blokken" style={{ marginBottom: '16px' }}>
            <div className="macro-blok"><strong>{profiel.doel_kcal}</strong><span>kcal</span></div>
            <div className="macro-blok macro-blok--groen"><strong>{profiel.doel_eiwit_g}g</strong><span>eiwit</span></div>
            <div className="macro-blok macro-blok--blauw"><strong>{profiel.doel_koolhydraten_g}g</strong><span>koolhyd</span></div>
            <div className="macro-blok macro-blok--oranje"><strong>{profiel.doel_vetten_g}g</strong><span>vetten</span></div>
          </div>
          <div className="form-group">
            <label>Calorieën per dag (kcal)</label>
            <input type="number" value={profiel.doel_kcal} onChange={e => setProfiel(p => ({ ...p, doel_kcal: parseInt(e.target.value) || 2400 }))} min="1000" max="6000" step="50" />
          </div>
          <div className="form-group">
            <label>Eiwit per dag (g)</label>
            <input type="number" value={profiel.doel_eiwit_g} onChange={e => setProfiel(p => ({ ...p, doel_eiwit_g: parseInt(e.target.value) || 160 }))} min="50" max="400" />
          </div>
          <div className="form-group">
            <label>Koolhydraten per dag (g)</label>
            <input type="number" value={profiel.doel_koolhydraten_g} onChange={e => setProfiel(p => ({ ...p, doel_koolhydraten_g: parseInt(e.target.value) || 250 }))} min="50" max="600" />
          </div>
          <div className="form-group">
            <label>Vetten per dag (g)</label>
            <input type="number" value={profiel.doel_vetten_g} onChange={e => setProfiel(p => ({ ...p, doel_vetten_g: parseInt(e.target.value) || 80 }))} min="30" max="300" />
          </div>
          <button className="btn btn-primary btn-full" onClick={() => slaOp()} disabled={opslaan}>
            {opslaan ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      )}

      {/* ── INTEGRATIES ── */}
      {tab === 'integraties' && (
        <div className="lijst">

          {/* Intervals.icu */}
          <div className="card integratie-card">
            <div className="integratie-header">
              <div className="integratie-logo" style={{ background: '#1a1a2e', fontSize: '0.75rem', fontWeight: 700, color: '#e94560' }}>ICU</div>
              <div className="integratie-info">
                <strong>Intervals.icu</strong>
                <span>Trainingen, HRV & slaap</span>
              </div>
              <span className={`integratie-badge ${profiel.intervals_verbonden ? 'badge-verbonden' : 'badge-uit'}`}>
                {profiel.intervals_verbonden ? '✓ Verbonden' : 'Niet verbonden'}
              </span>
            </div>
            {profiel.intervals_verbonden ? (
              <>
                <p className="integratie-beschrijving" style={{ marginTop: '10px' }}>
                  Athlete <strong>{profiel.intervals_athlete_id}</strong> — trainingen, HRV en slaapdata worden gesynchroniseerd. Alle gekoppelde apparaten (Suunto, Garmin, enz.) worden automatisch meegenomen.
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={syncIntervals} disabled={intervalsSyncing}>
                    {intervalsSyncing ? '...' : '↻ Nu synchroniseren'}
                  </button>
                  <button className="btn btn-ghost" onClick={ontkoppelIntervals}>Ontkoppelen</button>
                </div>
              </>
            ) : (
              <>
                <p className="integratie-beschrijving" style={{ marginTop: '10px' }}>
                  Koppel Intervals.icu voor automatische import van trainingen én wellness data (HRV, slaap, TSB). Werkt met alle apparaten die naar Intervals.icu synchroniseren: Suunto, Garmin, Wahoo en meer.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.8rem' }}>Athlete ID <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(bijv. i12345 — zie URL op intervals.icu)</span></label>
                    <input
                      value={intervalsForm.athlete_id}
                      onChange={e => setIntervalsForm(f => ({ ...f, athlete_id: e.target.value }))}
                      placeholder="i12345"
                      autoCapitalize="none"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.8rem' }}>API Key <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(Intervals.icu → Instellingen → API Key)</span></label>
                    <input
                      type="password"
                      value={intervalsForm.api_key}
                      onChange={e => setIntervalsForm(f => ({ ...f, api_key: e.target.value }))}
                      placeholder="••••••••••••••••"
                    />
                  </div>
                  <button
                    className="btn btn-full"
                    onClick={verbindIntervals}
                    disabled={intervalsConnecting || !intervalsForm.athlete_id || !intervalsForm.api_key}
                    style={{ background: '#1a1a2e', color: '#e94560', border: '1px solid #e94560', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.875rem' }}
                  >
                    {intervalsConnecting ? 'Verbinden...' : 'Verbinden met Intervals.icu'}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Suunto callback melding */}
          {suuntoStatus && (
            <div style={{
              padding: '12px 16px', borderRadius: 10, marginBottom: 12, fontSize: '0.875rem', fontWeight: 600,
              background: suuntoStatus === 'verbonden' ? '#f0fdf4' : '#fff1f2',
              border: `1px solid ${suuntoStatus === 'verbonden' ? '#bbf7d0' : '#fecdd3'}`,
              color: suuntoStatus === 'verbonden' ? '#166534' : '#be123c',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>{suuntoStatus === 'verbonden' ? '✓ Suunto succesvol gekoppeld! Klik op "Nu synchroniseren" om je workouts te importeren.' : `Suunto koppelen mislukt. Probeer opnieuw.`}</span>
              <button onClick={() => { onSuuntoStatusClear?.(); laadProfiel() }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', color: 'inherit' }}>×</button>
            </div>
          )}

          {/* Suunto */}
          <div className="card integratie-card">
            <div className="integratie-header">
              <div className="integratie-logo" style={{ background: '#e3f2fd', fontSize: '0.7rem', fontWeight: 800, color: '#1565c0', letterSpacing: '-0.5px' }}>SUN</div>
              <div className="integratie-info">
                <strong>Suunto</strong>
                <span>Directe workout import via OAuth</span>
              </div>
              <span className={`integratie-badge ${profiel.suunto_verbonden ? 'badge-verbonden' : 'badge-uit'}`}>
                {profiel.suunto_verbonden ? '✓ Verbonden' : 'Niet verbonden'}
              </span>
            </div>
            {profiel.suunto_verbonden ? (
              <>
                <p className="integratie-beschrijving" style={{ marginTop: 10 }}>
                  Suunto is gekoppeld. Workouts worden direct vanuit de Suunto cloud gesynchroniseerd.
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" style={{ flex: '1 1 140px' }} onClick={() => syncSuunto(false)} disabled={suuntoSyncing}>
                    {suuntoSyncing ? '...' : '↻ Nu synchroniseren'}
                  </button>
                  <button className="btn btn-ghost" onClick={() => syncSuunto(true)} disabled={suuntoSyncing} title="Wist bestaande Suunto-records en haalt alles opnieuw op">
                    ⟲ Volledig opnieuw
                  </button>
                  <button className="btn btn-ghost" onClick={diagnoseSuunto} title="Toon ruwe Suunto API response in nieuw tabblad">
                    🔍 Diagnose
                  </button>
                  <button className="btn btn-ghost" onClick={ontkoppelSuunto}>Ontkoppelen</button>
                </div>
                {suuntoLaatste && (
                  <div style={{ marginTop: 12, padding: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: '0.82rem' }}>
                    <div style={{ fontWeight: 600, color: '#166534', marginBottom: 6 }}>
                      Laatste sync: {suuntoLaatste.tijdstip.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                      {' — '}{suuntoLaatste.nieuw.length} nieuw, {suuntoLaatste.overgeslagen} al bekend
                      {suuntoLaatste.wellnessDagen > 0 && (
                        <> — 💤 {suuntoLaatste.wellnessDagen} dagen slaap/HRV</>
                      )}
                    </div>
                    {suuntoLaatste.nieuw.length > 0 ? (
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {suuntoLaatste.nieuw.slice(0, 10).map((a, i) => (
                          <li key={i} style={{ color: '#166534' }}>
                            • <strong>{a.datum}</strong> — {a.sport}
                            {a.titel && a.titel !== a.sport ? ` (${a.titel})` : ''}
                            {a.duur_min ? ` — ${a.duur_min}min` : ''}
                            {a.km ? ` — ${a.km}km` : ''}
                            {a.kcal ? ` — ${a.kcal}kcal` : ''}
                            {a.gem_hartslag ? ` — gem ${a.gem_hartslag}bpm` : ''}
                          </li>
                        ))}
                        {suuntoLaatste.nieuw.length > 10 && (
                          <li style={{ color: '#166534', fontStyle: 'italic' }}>...en {suuntoLaatste.nieuw.length - 10} meer</li>
                        )}
                      </ul>
                    ) : (
                      <div style={{ color: '#166534', fontStyle: 'italic' }}>Alle data al up-to-date.</div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="integratie-beschrijving" style={{ marginTop: 10 }}>
                  Koppel Suunto direct via OAuth2 voor automatische workout import. Je hebt een Suunto developer account nodig met <code>client_id</code>, <code>client_secret</code> en <code>subscription_key</code>.
                </p>
                <button
                  className="btn btn-full"
                  onClick={verbindSuunto}
                  style={{ background: '#e3f2fd', color: '#1565c0', border: '1px solid #90caf9', padding: '10px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.875rem', marginTop: 12 }}
                >
                  Verbinden met Suunto →
                </button>
              </>
            )}
          </div>

          {/* Runalyze */}
          <div className="card integratie-card">
            <div className="integratie-header">
              <div className="integratie-logo" style={{ background: '#e8f5e9', fontSize: '0.7rem', fontWeight: 800, color: '#2e7d32', letterSpacing: '-0.5px' }}>RUN</div>
              <div className="integratie-info">
                <strong>Runalyze</strong>
                <span>Suunto trainingen & analyses</span>
              </div>
              <span className={`integratie-badge ${profiel.runalyze_verbonden ? 'badge-verbonden' : 'badge-uit'}`}>
                {profiel.runalyze_verbonden ? '✓ Verbonden' : 'Niet verbonden'}
              </span>
            </div>
            {profiel.runalyze_verbonden ? (
              <>
                <p className="integratie-beschrijving" style={{ marginTop: '10px' }}>
                  Runalyze is gekoppeld. Activiteiten van je Suunto (en andere toestellen) worden gesynchroniseerd inclusief hartslagdata en trainingsanalyses.
                </p>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: '8px' }}>
                  🕕 Auto-sync elke ochtend om 07:00 (NL tijd). Suunto-data wordt 's nachts gesynchroniseerd naar Runalyze.
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={syncRunalyze} disabled={runalyzeSyncing}>
                    {runalyzeSyncing ? '...' : '↻ Nu synchroniseren'}
                  </button>
                  <button className="btn btn-ghost" onClick={ontkoppelRunalyze}>Ontkoppelen</button>
                </div>
                {runalyzeLaatste && (
                  <div style={{ marginTop: '12px', padding: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '0.82rem' }}>
                    <div style={{ fontWeight: 600, color: '#166534', marginBottom: '6px' }}>
                      Laatste sync: {runalyzeLaatste.tijdstip.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                      {' — '}{runalyzeLaatste.nieuw.length} nieuw, {runalyzeLaatste.overgeslagen} al bekend
                    </div>
                    {runalyzeLaatste.nieuw.length > 0 ? (
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {runalyzeLaatste.nieuw.slice(0, 10).map((a, i) => (
                          <li key={i} style={{ color: '#166534' }}>
                            • <strong>{a.datum}</strong> — {a.sport}
                            {a.titel && a.titel !== a.sport ? ` (${a.titel})` : ''}
                            {a.duur_min ? ` — ${a.duur_min}min` : ''}
                            {a.km ? ` — ${a.km}km` : ''}
                            {a.kcal ? ` — ${a.kcal}kcal` : ''}
                            {a.gem_hartslag ? ` — gem ${a.gem_hartslag}bpm` : ''}
                          </li>
                        ))}
                        {runalyzeLaatste.nieuw.length > 10 && (
                          <li style={{ color: '#166534', fontStyle: 'italic' }}>...en {runalyzeLaatste.nieuw.length - 10} meer</li>
                        )}
                      </ul>
                    ) : (
                      <div style={{ color: '#166534', fontStyle: 'italic' }}>Geen nieuwe activiteiten — alle data is al up-to-date.</div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="integratie-beschrijving" style={{ marginTop: '10px' }}>
                  Koppel Runalyze voor directe import van je Suunto-activiteiten. Runalyze synct automatisch met de Suunto app en biedt diepgaande trainingsanalyses. Haal je API token op via Runalyze → Instellingen → Apps.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.8rem' }}>API Token <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(Runalyze → Instellingen → Apps → API)</span></label>
                    <input
                      type="password"
                      value={runalyzeForm.api_token}
                      onChange={e => setRunalyzeForm(f => ({ ...f, api_token: e.target.value }))}
                      placeholder="••••••••••••••••"
                      autoCapitalize="none"
                    />
                  </div>
                  <button
                    className="btn btn-full"
                    onClick={verbindRunalyze}
                    disabled={runalyzeConnecting || !runalyzeForm.api_token}
                    style={{ background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.875rem' }}
                  >
                    {runalyzeConnecting ? 'Verbinden...' : 'Verbinden met Runalyze'}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Apple Health */}
          <IntegratieUploadCard
            kleur="#FF3B30"
            letter="♥"
            naam="Apple Health"
            subtitel="Stappen, HRV, slaap"
            beschrijving="Upload schermafbeeldingen van Apple Health via de Coach voor automatische analyse."
            onNavigeer={onNavigeer}
          />

          {/* MyFitnessPal */}
          <IntegratieUploadCard
            kleur="#00B0FF"
            letter="M"
            naam="MyFitnessPal"
            subtitel="Voeding & calorieën"
            beschrijving="MyFitnessPal heeft geen openbare API meer. Export je dagoverzicht als screenshot en upload via de Coach."
            onNavigeer={onNavigeer}
          />
        </div>
      )}
    </div>
  )
}

function IntegratieUploadCard({ kleur, letter, naam, subtitel, beschrijving, uploadType, onNavigeer }) {
  return (
    <div className="card integratie-card">
      <div className="integratie-header">
        <div className="integratie-logo" style={{ background: kleur }}>{letter}</div>
        <div className="integratie-info">
          <strong>{naam}</strong>
          <span>{subtitel}</span>
        </div>
        <span className="integratie-badge badge-upload">📷 Upload</span>
      </div>
      <p className="integratie-beschrijving" style={{ marginTop: '10px' }}>{beschrijving}</p>
      <button className="btn btn-secondary btn-full" style={{ marginTop: '12px' }} onClick={() => onNavigeer('coach', uploadType ? { uploadType } : undefined)}>
        Uploaden via Coach →
      </button>
    </div>
  )
}
