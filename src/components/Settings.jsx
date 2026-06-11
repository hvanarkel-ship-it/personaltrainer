import { useState, useEffect } from 'react'
import { api } from '../api.js'
import SportIcoon from '../sportIcoon.jsx'
import Card from './ui/Card.jsx'
import Chip from './ui/Chip.jsx'

// ── Constants ────────────────────────────────────────────────────────────────

const SPORTEN = ['hyrox','fitness','hardlopen','fietsen','wielrennen','zwemmen','padel','tennis','wandelen','yoga','voetbal']
const COACH_STIJLEN = [
  { id: 'direct',          label: 'Direct & bondig' },
  { id: 'motiverend',      label: 'Motiverend' },
  { id: 'wetenschappelijk',label: 'Wetenschappelijk' },
  { id: 'vriendelijk',     label: 'Vriendelijk & ondersteunend' },
]
const TABS = [
  { id: 'profiel',      label: 'Profiel' },
  { id: 'coach',        label: 'Coach' },
  { id: 'voeding',      label: "Macro's" },
  { id: 'koppelingen',  label: 'Koppelingen' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function Settings({ user, onNavigeer, onUitloggen, suuntoStatus, onSuuntoStatusClear }) {
  const [tab, setTab]       = useState('profiel')
  const [profiel, setProfiel] = useState(null)
  const [laden, setLaden]   = useState(true)
  const [opslaan, setOpslaan] = useState(false)
  const [toast, setToast]   = useState(null)

  // Suunto
  const [suuntoSyncing, setSuuntoSyncing]     = useState(false)
  const [suuntoLaatste, setSuuntoLaatste]     = useState(null)

  useEffect(() => { laadProfiel() }, [])

  // Navigate to koppelingen tab after Suunto OAuth callback
  useEffect(() => {
    if (suuntoStatus) setTab('koppelingen')
  }, [suuntoStatus])

  function showToast(tekst, type = 'success') {
    setToast({ tekst, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function laadProfiel() {
    try {
      const d = await api.get('/profiel')
      setProfiel({
        name: d.name || '',
        geboortejaar: d.geboortejaar || '',
        geslacht: d.geslacht || '',
        lengte_cm: d.lengte_cm || '',
        gewicht_kg: d.gewicht_kg || '',
        sporten: d.sporten || ['fitness', 'padel', 'fietsen'],
        doel_kcal: d.doel_kcal || 2400,
        doel_eiwit_g: d.doel_eiwit_g || 160,
        doel_koolhydraten_g: d.doel_koolhydraten_g || 250,
        doel_vetten_g: d.doel_vetten_g || 80,
        coach_context: d.coach_context || '',
        coach_naam: d.coach_naam || 'APEX Coach',
        coach_stijl: d.coach_stijl || 'direct',
        suunto_verbonden: !!d.suunto_verbonden,
      })
    } catch { showToast('Kan profiel niet laden', 'error') }
    finally { setLaden(false) }
  }

  async function slaOp(extra = {}) {
    setOpslaan(true)
    try {
      await api.put('/profiel', { ...profiel, ...extra })
      showToast('Opgeslagen')
    } catch (err) { showToast('Opslaan mislukt: ' + err.message, 'error') }
    finally { setOpslaan(false) }
  }

  function toggleSport(sport) {
    const cur = profiel.sporten || []
    setProfiel(p => ({ ...p, sporten: cur.includes(sport) ? cur.filter(s => s !== sport) : [...cur, sport] }))
  }

  async function verbindSuunto() {
    try {
      const { url } = await api.get('/suunto-connect')
      window.location.href = url
    } catch (err) { showToast('Suunto koppelen mislukt: ' + err.message, 'error') }
  }

  async function syncSuunto(reset = false) {
    if (reset && !confirm('Alle Suunto-records worden gewist en opnieuw geïmporteerd. Doorgaan?')) return
    setSuuntoSyncing(true)
    try {
      const res = await api.post(reset ? '/suunto-sync?reset=1' : '/suunto-sync', {})
      const wellnessDagen = res.wellness?.wellness_dagen ?? 0
      setSuuntoLaatste({ nieuw: res.nieuweActiviteiten || [], overgeslagen: res.overgeslagen, wellnessDagen, tijdstip: new Date() })
      showToast(`${res.gesynchroniseerd} nieuwe workouts${wellnessDagen > 0 ? ` + ${wellnessDagen} slaap/HRV dagen` : ''}`)
    } catch (err) { showToast('Suunto sync mislukt: ' + err.message, 'error') }
    finally { setSuuntoSyncing(false) }
  }

  async function diagnoseSuunto() {
    try {
      const res = await api.get('/suunto-debug')
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' })
      window.open(URL.createObjectURL(blob), '_blank')
    } catch (err) { showToast('Diagnose mislukt: ' + err.message, 'error') }
  }

  async function ontkoppelSuunto() {
    try {
      await api.put('/profiel', { ontkoppel_suunto: true })
      setProfiel(p => ({ ...p, suunto_verbonden: false }))
      setSuuntoLaatste(null)
      showToast('Suunto ontkoppeld')
    } catch { showToast('Fout bij ontkoppelen', 'error') }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (laden) return (
    <div className="page">
      <div className="section-gap">
        {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 'var(--r-lg)' }} />)}
      </div>
    </div>
  )

  return (
    <div className="page">

      {/* Toast */}
      {toast && (
        <div className="toast" style={{ background: toast.type === 'error' ? 'var(--red-dim)' : 'var(--bg-raised)', color: toast.type === 'error' ? 'var(--red)' : 'var(--text)' }}>
          {toast.type === 'success' ? '✓ ' : '⚠ '}{toast.tekst}
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="t-xl">Instellingen</h1>
          <p className="t-sm t-muted" style={{ marginTop: 2 }}>Profiel & koppelingen</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onUitloggen}>Uitloggen</button>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 'var(--space-1)', overflowX: 'auto', padding: '2px 0' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flexShrink: 0,
              padding: '8px 16px',
              background: tab === t.id ? 'var(--bg-surface)' : 'transparent',
              border: tab === t.id ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
              borderRadius: 'var(--r-xs)',
              color: tab === t.id ? 'var(--text)' : 'var(--text-3)',
              fontSize: 'var(--t-sm)', fontWeight: 600, cursor: 'pointer',
              transition: 'color var(--dur-fast), background var(--dur-fast)',
              whiteSpace: 'nowrap',
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* ── PROFIEL ───────────────────────────────────────────────────── */}
      {tab === 'profiel' && profiel && (
        <Card>
          <span className="t-label" style={{ display: 'block', marginBottom: 'var(--space-4)' }}>Persoonlijke gegevens</span>

          <div className="section-gap">
            <div className="form-group">
              <label>Naam</label>
              <input className="input" value={profiel.name} onChange={e => setProfiel(p => ({ ...p, name: e.target.value }))} placeholder="Jouw naam" />
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>Geboortejaar</label>
                <input className="input" type="number" value={profiel.geboortejaar}
                  onChange={e => setProfiel(p => ({ ...p, geboortejaar: parseInt(e.target.value) || '' }))}
                  placeholder="1990" min="1940" max="2010" />
              </div>
              <div className="form-group">
                <label>Geslacht</label>
                <select className="input" value={profiel.geslacht} onChange={e => setProfiel(p => ({ ...p, geslacht: e.target.value }))}>
                  <option value="">Kies...</option>
                  <option value="man">Man</option>
                  <option value="vrouw">Vrouw</option>
                  <option value="anders">Anders</option>
                </select>
              </div>
              <div className="form-group">
                <label>Lengte (cm)</label>
                <input className="input" type="number" value={profiel.lengte_cm}
                  onChange={e => setProfiel(p => ({ ...p, lengte_cm: parseInt(e.target.value) || '' }))}
                  placeholder="180" />
              </div>
              <div className="form-group">
                <label>Gewicht (kg)</label>
                <input className="input" type="number" step="0.1" value={profiel.gewicht_kg}
                  onChange={e => setProfiel(p => ({ ...p, gewicht_kg: parseFloat(e.target.value) || '' }))}
                  placeholder="80.0" />
              </div>
            </div>

            <div className="form-group">
              <label>Actieve sporten</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                {SPORTEN.map(sport => {
                  const active = profiel.sporten?.includes(sport)
                  return (
                    <button
                      key={sport} type="button"
                      onClick={() => toggleSport(sport)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        padding: '10px 4px',
                        background: active ? 'var(--bg-surface)' : 'var(--bg-raised)',
                        border: active ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent',
                        borderRadius: 'var(--r-sm)', cursor: 'pointer',
                        color: active ? 'var(--text)' : 'var(--text-3)',
                        transition: 'border-color var(--dur-fast), color var(--dur-fast)',
                      }}
                    >
                      <SportIcoon sport={sport} size={16} />
                      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        {sport}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <button className="btn btn-primary btn-full" onClick={() => slaOp()} disabled={opslaan}>
              {opslaan ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </Card>
      )}

      {/* ── COACH ─────────────────────────────────────────────────────── */}
      {tab === 'coach' && profiel && (
        <Card>
          <span className="t-label" style={{ display: 'block', marginBottom: 'var(--space-4)' }}>Coach instellingen</span>

          <div className="section-gap">
            <div className="form-group">
              <label>Coach naam</label>
              <input className="input" value={profiel.coach_naam}
                onChange={e => setProfiel(p => ({ ...p, coach_naam: e.target.value }))}
                placeholder="APEX Coach" />
            </div>

            <div className="form-group">
              <label>Communicatiestijl</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {COACH_STIJLEN.map(s => {
                  const active = profiel.coach_stijl === s.id
                  return (
                    <button
                      key={s.id} type="button"
                      onClick={() => setProfiel(p => ({ ...p, coach_stijl: s.id }))}
                      style={{
                        textAlign: 'left', padding: 'var(--space-3) var(--space-4)',
                        background: active ? 'var(--bg-surface)' : 'var(--bg-raised)',
                        border: active ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent',
                        borderRadius: 'var(--r-sm)', cursor: 'pointer',
                        color: active ? 'var(--text)' : 'var(--text-3)',
                        fontSize: 'var(--t-sm)', fontWeight: active ? 600 : 400,
                        transition: 'border-color var(--dur-fast), color var(--dur-fast)',
                      }}
                    >{s.label}</button>
                  )
                })}
              </div>
            </div>

            <div className="form-group">
              <label>Jouw context voor de coach</label>
              <textarea
                className="input"
                value={profiel.coach_context}
                onChange={e => setProfiel(p => ({ ...p, coach_context: e.target.value }))}
                rows={8}
                style={{ minHeight: 160, resize: 'vertical' }}
                placeholder={`Vertel de coach meer over jezelf:\n\n• Blessures of gezondheidsklachten\n• Trainingsachtergrond en niveau\n• Dieet beperkingen of allergieën\n• Doelen op lange termijn\n• Beschikbare apparatuur\n• Levensstijl en tijdsdruk`}
              />
              <p className="t-xs t-muted" style={{ marginTop: 'var(--space-1)' }}>
                Deze context wordt altijd meegegeven aan de coach voor persoonlijker advies.
              </p>
            </div>

            <button className="btn btn-primary btn-full" onClick={() => slaOp()} disabled={opslaan}>
              {opslaan ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </Card>
      )}

      {/* ── VOEDING / MACROS ──────────────────────────────────────────── */}
      {tab === 'voeding' && profiel && (
        <Card>
          <span className="t-label" style={{ display: 'block', marginBottom: 'var(--space-4)' }}>Dagelijkse voedingsdoelen</span>

          {/* Live preview */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
            <MacroPreview waarde={profiel.doel_kcal}            label="kcal"   color="var(--text)" />
            <MacroPreview waarde={`${profiel.doel_eiwit_g}g`}   label="eiwit"  color="var(--green)" />
            <MacroPreview waarde={`${profiel.doel_koolhydraten_g}g`} label="koolhyd." color="var(--blue)" />
            <MacroPreview waarde={`${profiel.doel_vetten_g}g`}  label="vet"    color="var(--amber)" />
          </div>

          <div className="section-gap">
            <div className="form-group">
              <label>Calorieën per dag (kcal)</label>
              <input className="input" type="number" value={profiel.doel_kcal}
                onChange={e => setProfiel(p => ({ ...p, doel_kcal: parseInt(e.target.value) || 2400 }))}
                min="1000" max="6000" step="50" />
            </div>
            <div className="form-group">
              <label>Eiwit per dag (g)</label>
              <input className="input" type="number" value={profiel.doel_eiwit_g}
                onChange={e => setProfiel(p => ({ ...p, doel_eiwit_g: parseInt(e.target.value) || 160 }))}
                min="50" max="400" />
            </div>
            <div className="form-group">
              <label>Koolhydraten per dag (g)</label>
              <input className="input" type="number" value={profiel.doel_koolhydraten_g}
                onChange={e => setProfiel(p => ({ ...p, doel_koolhydraten_g: parseInt(e.target.value) || 250 }))}
                min="50" max="600" />
            </div>
            <div className="form-group">
              <label>Vetten per dag (g)</label>
              <input className="input" type="number" value={profiel.doel_vetten_g}
                onChange={e => setProfiel(p => ({ ...p, doel_vetten_g: parseInt(e.target.value) || 80 }))}
                min="30" max="300" />
            </div>

            <button className="btn btn-primary btn-full" onClick={() => slaOp()} disabled={opslaan}>
              {opslaan ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </Card>
      )}

      {/* ── KOPPELINGEN ───────────────────────────────────────────────── */}
      {tab === 'koppelingen' && profiel && (
        <div className="section-gap">

          {/* Suunto OAuth callback banner */}
          {suuntoStatus && (
            <Card variant="inset" style={{ borderLeft: `3px solid ${suuntoStatus === 'verbonden' ? 'var(--green)' : 'var(--red)'}` }}>
              <div className="row-between">
                <p className="t-sm" style={{ color: suuntoStatus === 'verbonden' ? 'var(--green)' : 'var(--red)' }}>
                  {suuntoStatus === 'verbonden'
                    ? '✓ Suunto succesvol gekoppeld! Klik op "Nu synchroniseren" om je workouts te importeren.'
                    : 'Suunto koppelen mislukt. Probeer opnieuw.'}
                </p>
                <button
                  onClick={() => { onSuuntoStatusClear?.(); laadProfiel() }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18, flexShrink: 0 }}
                >×</button>
              </div>
            </Card>
          )}

          {/* Suunto */}
          <IntegratieCard
            logo="SUN"
            logoStyle={{ background: 'var(--blue-dim)', color: 'var(--blue)', fontWeight: 800, fontSize: 10 }}
            naam="Suunto"
            subtitel="Directe workout import via OAuth"
            verbonden={profiel.suunto_verbonden}
          >
            {profiel.suunto_verbonden ? (
              <div className="section-gap" style={{ gap: 'var(--space-3)' }}>
                <p className="t-sm t-muted">Workouts worden direct vanuit de Suunto cloud gesynchroniseerd.</p>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" style={{ flex: '1 1 140px' }} onClick={() => syncSuunto(false)} disabled={suuntoSyncing}>
                    {suuntoSyncing ? '...' : '↻ Synchroniseren'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => syncSuunto(true)} disabled={suuntoSyncing} title="Wist bestaande Suunto records en herstart">
                    ⟲ Volledig opnieuw
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={diagnoseSuunto}>🔍 Diagnose</button>
                  <button className="btn btn-ghost btn-sm" onClick={ontkoppelSuunto}>Ontkoppelen</button>
                </div>
                {suuntoLaatste && <SyncResultaat resultaat={suuntoLaatste} />}
              </div>
            ) : (
              <div className="section-gap" style={{ gap: 'var(--space-3)' }}>
                <p className="t-sm t-muted">
                  Koppel Suunto direct via OAuth2. Je hebt een Suunto developer account nodig.
                </p>
                <button
                  className="btn btn-full"
                  onClick={verbindSuunto}
                  style={{ background: 'var(--blue-dim)', color: 'var(--blue)', border: '1px solid rgba(127,184,255,0.3)', borderRadius: 'var(--r-sm)', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer', padding: '12px', fontSize: 'var(--t-md)' }}
                >
                  Verbinden met Suunto →
                </button>
              </div>
            )}
          </IntegratieCard>

          {/* Apple Health */}
          <IntegratieCard
            logo="♥"
            logoStyle={{ background: 'rgba(255,59,48,0.15)', color: '#FF3B30', fontSize: 16 }}
            naam="Apple Health"
            subtitel="Stappen, HRV, slaap"
            badge={<Chip label="Screenshot" color="muted" />}
          >
            <div className="section-gap" style={{ gap: 'var(--space-3)' }}>
              <p className="t-sm t-muted">Upload schermafbeeldingen van Apple Health via de Coach voor automatische analyse.</p>
              <button className="btn btn-secondary btn-full" onClick={() => onNavigeer('coach')}>
                Uploaden via Coach →
              </button>
            </div>
          </IntegratieCard>

          {/* MyFitnessPal */}
          <IntegratieCard
            logo="M"
            logoStyle={{ background: 'rgba(0,176,255,0.15)', color: '#00B0FF', fontWeight: 800, fontSize: 16 }}
            naam="MyFitnessPal"
            subtitel="Voeding & calorieën"
            badge={<Chip label="Screenshot" color="muted" />}
          >
            <div className="section-gap" style={{ gap: 'var(--space-3)' }}>
              <p className="t-sm t-muted">MyFitnessPal heeft geen openbare API meer. Export je dagoverzicht als screenshot en upload via de Coach.</p>
              <button className="btn btn-secondary btn-full" onClick={() => onNavigeer('coach')}>
                Uploaden via Coach →
              </button>
            </div>
          </IntegratieCard>

        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MacroPreview({ waarde, label, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 'var(--t-lg)', fontWeight: 700, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {waarde}
      </div>
      <div className="metric-label" style={{ marginTop: 2 }}>{label}</div>
    </div>
  )
}

function IntegratieCard({ logo, logoStyle, naam, subtitel, verbonden, badge, children }) {
  return (
    <Card>
      <div className="row-between" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 'var(--r-sm)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, fontWeight: 700,
            ...logoStyle,
          }}>
            {logo}
          </div>
          <div>
            <div className="t-md" style={{ fontWeight: 600 }}>{naam}</div>
            <div className="t-sm t-muted">{subtitel}</div>
          </div>
        </div>
        {badge || (
          verbonden !== undefined && (
            <Chip label={verbonden ? 'Verbonden' : 'Niet verbonden'} color={verbonden ? 'green' : 'muted'} dot={verbonden} />
          )
        )}
      </div>
      {children}
    </Card>
  )
}

function SyncResultaat({ resultaat }) {
  return (
    <Card variant="inset">
      <p className="t-sm" style={{ fontWeight: 600, color: 'var(--green)', marginBottom: resultaat.nieuw.length ? 'var(--space-2)' : 0 }}>
        {resultaat.tijdstip.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
        {' — '}{resultaat.nieuw.length} nieuw, {resultaat.overgeslagen} al bekend
        {resultaat.wellnessDagen > 0 && ` — ${resultaat.wellnessDagen} dagen slaap/HRV`}
      </p>
      {resultaat.nieuw.length > 0 ? (
        <div className="section-gap" style={{ gap: 4 }}>
          {resultaat.nieuw.slice(0, 10).map((a, i) => (
            <div key={i} className="t-xs t-muted">
              <strong style={{ color: 'var(--text-2)' }}>{a.datum}</strong>
              {' — '}{a.sport}
              {a.titel && a.titel !== a.sport ? ` (${a.titel})` : ''}
              {a.duur_min ? ` · ${a.duur_min}m` : ''}
              {a.km       ? ` · ${a.km}km` : ''}
              {a.kcal     ? ` · ${a.kcal}kcal` : ''}
            </div>
          ))}
          {resultaat.nieuw.length > 10 && (
            <div className="t-xs t-muted" style={{ fontStyle: 'italic' }}>...en {resultaat.nieuw.length - 10} meer</div>
          )}
        </div>
      ) : (
        <p className="t-xs t-muted" style={{ fontStyle: 'italic' }}>Alle data al up-to-date.</p>
      )}
    </Card>
  )
}
