import { useState, useEffect, useCallback } from 'react'
import { api } from '../api.js'

const SPORTEN = ['hyrox', 'fitness', 'hardlopen', 'fietsen', 'wielrennen', 'zwemmen', 'padel', 'tennis', 'wandelen', 'yoga', 'voetbal']
const SPORTEN_ICONS = { hyrox: '⚡', fitness: '🏋️', hardlopen: '🏃', fietsen: '🚴', wielrennen: '🚵', zwemmen: '🏊', padel: '🎾', tennis: '🎾', wandelen: '🚶', yoga: '🧘', voetbal: '⚽' }
const STIJLEN = [
  { id: 'direct', label: 'Direct & bondig' },
  { id: 'motiverend', label: 'Motiverend' },
  { id: 'wetenschappelijk', label: 'Wetenschappelijk' },
  { id: 'vriendelijk', label: 'Vriendelijk & ondersteunend' },
]

export default function Settings({ user, onNavigeer, onUitloggen, stravaStatus, owStatus }) {
  const [tab, setTab] = useState('profiel')
  const [profiel, setProfiel] = useState(null)
  const [laden, setLaden] = useState(true)
  const [opslaan, setOpslaan] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [owSyncing, setOwSyncing] = useState(false)
  const [melding, setMelding] = useState(null)
  const [owProviders, setOwProviders] = useState(null)   // null = not yet loaded

  const laadOwStatus = useCallback(async () => {
    try {
      const data = await api.get('/openwearables-status')
      setOwProviders(data.configured ? data.providers : false)
    } catch {
      setOwProviders(false)
    }
  }, [])

  useEffect(() => { laadProfiel(); laadOwStatus() }, [])

  useEffect(() => {
    if (stravaStatus === 'verbonden') {
      setMelding({ type: 'success', tekst: '✓ Strava succesvol gekoppeld!' })
      setTab('integraties')
      laadProfiel()
    } else if (stravaStatus === 'geweigerd') {
      setMelding({ type: 'error', tekst: 'Strava koppeling geweigerd.' })
      setTab('integraties')
    } else if (stravaStatus === 'fout') {
      setMelding({ type: 'error', tekst: 'Fout bij koppelen Strava. Probeer opnieuw.' })
      setTab('integraties')
    }
  }, [stravaStatus])

  useEffect(() => {
    if (!owStatus) return
    const { provider, status } = owStatus
    const naam = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Wearable'
    if (status === 'verbonden') {
      setMelding({ type: 'success', tekst: `✓ ${naam} succesvol gekoppeld!` })
      laadOwStatus()
    } else if (status === 'geweigerd') {
      setMelding({ type: 'error', tekst: `${naam} koppeling geweigerd.` })
    } else {
      setMelding({ type: 'error', tekst: `Fout bij koppelen ${naam}. Probeer opnieuw.` })
    }
    setTab('integraties')
  }, [owStatus])

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
        strava_verbonden: !!data.strava_athlete_id,
        strava_athlete_id: data.strava_athlete_id || null,
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

  function koppelStrava() {
    const token = localStorage.getItem('apex_token')
    window.location.href = `/api/strava-auth?token=${encodeURIComponent(token)}`
  }

  async function ontkoppelStrava() {
    try {
      await api.put('/profiel', { ontkoppel_strava: true })
      setProfiel(p => ({ ...p, strava_verbonden: false, strava_athlete_id: null }))
      setMelding({ type: 'success', tekst: 'Strava ontkoppeld.' })
    } catch (err) {
      setMelding({ type: 'error', tekst: 'Fout bij ontkoppelen' })
    }
  }

  async function syncStrava() {
    setSyncing(true)
    setMelding(null)
    try {
      const res = await api.post('/strava-sync', {})
      setMelding({ type: 'success', tekst: `↻ ${res.gesynchroniseerd} nieuwe trainingen gesynchroniseerd` })
    } catch (err) {
      setMelding({ type: 'error', tekst: 'Sync mislukt: ' + err.message })
    } finally {
      setSyncing(false)
    }
  }

  function koppelOwProvider(provider) {
    const token = localStorage.getItem('apex_token')
    window.location.href = `/api/openwearables-connect?token=${encodeURIComponent(token)}&provider=${provider}`
  }

  async function ontkoppelOwProvider(provider) {
    try {
      await api.delete(`/openwearables-status?provider=${provider}`)
      setOwProviders(prev => prev
        ? prev.map(p => p.id === provider ? { ...p, verbonden: false } : p)
        : prev
      )
      setMelding({ type: 'success', tekst: `${provider.charAt(0).toUpperCase() + provider.slice(1)} ontkoppeld.` })
    } catch (err) {
      setMelding({ type: 'error', tekst: 'Ontkoppelen mislukt: ' + err.message })
    }
  }

  async function syncOwData() {
    setOwSyncing(true)
    setMelding(null)
    try {
      const res = await api.post('/openwearables-sync', {})
      const totaal = (res.activiteit_gesynchroniseerd || 0) + (res.slaap_gesynchroniseerd || 0)
      setMelding({ type: 'success', tekst: `↻ ${totaal} nieuwe items gesynchroniseerd (${res.activiteit_gesynchroniseerd || 0} activiteiten, ${res.slaap_gesynchroniseerd || 0} slaap)` })
    } catch (err) {
      setMelding({ type: 'error', tekst: 'Sync mislukt: ' + err.message })
    } finally {
      setOwSyncing(false)
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

          {/* Strava */}
          <div className="card integratie-card">
            <div className="integratie-header">
              <div className="integratie-logo" style={{ background: '#FC4C02' }}>S</div>
              <div className="integratie-info">
                <strong>Strava</strong>
                <span>Activiteiten & trainingen</span>
              </div>
              <span className={`integratie-badge ${profiel.strava_verbonden ? 'badge-verbonden' : 'badge-uit'}`}>
                {profiel.strava_verbonden ? '✓ Verbonden' : 'Niet verbonden'}
              </span>
            </div>
            {profiel.strava_verbonden ? (
              <>
                <p className="integratie-beschrijving" style={{ marginTop: '10px' }}>
                  Trainingen worden automatisch gesynchroniseerd zodra ze op Strava verschijnen.
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={syncStrava} disabled={syncing}>
                    {syncing ? '...' : '↻ Handmatig synchroniseren'}
                  </button>
                  <button className="btn btn-ghost" onClick={ontkoppelStrava}>Ontkoppelen</button>
                </div>
              </>
            ) : (
              <>
                <p className="integratie-beschrijving" style={{ marginTop: '10px' }}>
                  Importeer automatisch trainingen, hartslag en prestaties via Strava.
                </p>
                <button className="btn btn-full" onClick={koppelStrava} style={{ marginTop: '12px', background: '#FC4C02', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.875rem' }}>
                  Verbinden met Strava
                </button>
              </>
            )}
          </div>

          {/* Open Wearables — Garmin, Suunto, Polar, Whoop, Oura */}
          {owProviders === null && (
            <div className="card" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-3)', fontSize: '0.85rem' }}>
              Wearables laden...
            </div>
          )}

          {owProviders === false && (
            <>
              <IntegratieUploadCard
                kleur="#006EBE" letter="G" naam="Garmin Connect" subtitel="Slaap, HRV & activiteiten"
                beschrijving="Upload een screenshot van je Garmin Connect ochtendherstel of slaapoverzicht via de Coach voor automatische HRV- en slaapanalyse. Of koppel Open Wearables voor directe synchronisatie."
                uploadType="garmin" onNavigeer={onNavigeer}
              />
              <IntegratieUploadCard
                kleur="#003882" letter="S" naam="Suunto" subtitel="Slaap, HRV & activiteiten"
                beschrijving="Upload een screenshot van je Suunto-app via de Coach voor automatische analyse. Of koppel Open Wearables voor directe synchronisatie."
                uploadType="suunto" onNavigeer={onNavigeer}
              />
            </>
          )}

          {Array.isArray(owProviders) && (
            <>
              {owProviders.some(p => p.verbonden) && (
                <div style={{ marginBottom: '4px' }}>
                  <button className="btn btn-secondary btn-full" onClick={syncOwData} disabled={owSyncing}>
                    {owSyncing ? '...' : '↻ Alle wearables synchroniseren'}
                  </button>
                </div>
              )}
              {owProviders.map(p => (
                <OwProviderCard
                  key={p.id}
                  provider={p}
                  onKoppel={() => koppelOwProvider(p.id)}
                  onOntkoppel={() => ontkoppelOwProvider(p.id)}
                />
              ))}
            </>
          )}

          {/* Apple Health */}
          <IntegratieUploadCard
            kleur="#FF3B30"
            letter="♥"
            naam="Apple Health"
            subtitel="Stappen, HRV, slaap"
            beschrijving="Apple Health is alleen toegankelijk via de iOS-app. Upload schermafbeeldingen via de Coach voor automatische analyse."
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

function OwProviderCard({ provider, onKoppel, onOntkoppel }) {
  const { label, kleur, letter, verbonden } = provider
  return (
    <div className="card integratie-card">
      <div className="integratie-header">
        <div className="integratie-logo" style={{ background: kleur }}>{letter}</div>
        <div className="integratie-info">
          <strong>{label}</strong>
          <span>Activiteiten, slaap & HRV</span>
        </div>
        <span className={`integratie-badge ${verbonden ? 'badge-verbonden' : 'badge-uit'}`}>
          {verbonden ? '✓ Verbonden' : 'Niet verbonden'}
        </span>
      </div>
      {verbonden ? (
        <div style={{ marginTop: '12px' }}>
          <button className="btn btn-ghost btn-full" onClick={onOntkoppel}>Ontkoppelen</button>
        </div>
      ) : (
        <div style={{ marginTop: '12px' }}>
          <button
            className="btn btn-full"
            onClick={onKoppel}
            style={{ background: kleur, color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.875rem' }}
          >
            Verbinden met {label}
          </button>
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
