import { useState } from 'react'
import { api } from '../api.js'
import Card from './ui/Card.jsx'

const DOELEN = [
  { id: 'hyrox',     label: '⚡ Hyrox race',       omschrijving: 'Maximale raceperformance',            eiwit: 2.0, kcalDelta: 0,    vetPct: 0.25 },
  { id: 'prestatie', label: 'Sport & prestatie',   omschrijving: 'Sterker, sneller, verder',             eiwit: 1.9, kcalDelta: 0,    vetPct: 0.27 },
  { id: 'spiermassa',label: 'Spieropbouw',         omschrijving: 'Meer spiermassa opbouwen',             eiwit: 1.9, kcalDelta: 250,  vetPct: 0.28 },
  { id: 'afvallen',  label: 'Afvallen',            omschrijving: 'Vet verliezen, conditie behouden',     eiwit: 1.8, kcalDelta: -400, vetPct: 0.28 },
  { id: 'gezondheid',label: 'Gezond & fit',        omschrijving: 'Fit en energiek in het dagelijks leven', eiwit: 1.6, kcalDelta: 0,  vetPct: 0.30 },
]

const HYROX_SPORTEN = ['hyrox', 'hardlopen', 'fitness', 'fietsen']

function berekenDoelen({ geboortejaar, geslacht, lengte_cm, gewicht_kg, trainingsDagen, doel }) {
  const leeftijd = new Date().getFullYear() - parseInt(geboortejaar)
  const g = parseFloat(gewicht_kg), l = parseFloat(lengte_cm)
  const bmr = geslacht === 'vrouw'
    ? (10 * g) + (6.25 * l) - (5 * leeftijd) - 161
    : (10 * g) + (6.25 * l) - (5 * leeftijd) + 5
  const actFactor = trainingsDagen >= 6 ? 1.725 : trainingsDagen >= 4 ? 1.55 : trainingsDagen >= 2 ? 1.375 : 1.2
  const tdee = Math.round(bmr * actFactor)
  const d = DOELEN.find(x => x.id === doel) || DOELEN[4]
  const doel_kcal = Math.max(1400, Math.round(tdee + d.kcalDelta))
  const doel_eiwit_g = Math.round(g * d.eiwit)
  const doel_vetten_g = Math.round((doel_kcal * d.vetPct) / 9)
  const doel_koolhydraten_g = Math.max(50, Math.round((doel_kcal - doel_eiwit_g * 4 - doel_vetten_g * 9) / 4))
  return { tdee, doel_kcal, doel_eiwit_g, doel_koolhydraten_g, doel_vetten_g }
}

export default function Onboarding({ user, onKlaar }) {
  const [stap, setStap]   = useState(1)
  const [laden, setLaden] = useState(false)
  const [fout, setFout]   = useState('')
  const [form, setForm]   = useState({
    geboortejaar: '', geslacht: '', lengte_cm: '', gewicht_kg: '',
    trainingsDagen: 4, doel: 'gezondheid', sporten: [],
  })

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const stap1Klaar = form.geboortejaar && form.geslacht && form.lengte_cm && form.gewicht_kg
    && parseInt(form.geboortejaar) > 1940 && parseFloat(form.gewicht_kg) > 0

  const berekend = stap1Klaar ? berekenDoelen(form) : null

  function kiesDoel(id) {
    if (id === 'hyrox') {
      setForm(f => ({ ...f, doel: 'hyrox', sporten: [...new Set([...f.sporten, ...HYROX_SPORTEN])] }))
    } else {
      upd('doel', id)
    }
  }

  async function afronden() {
    setLaden(true); setFout('')
    try {
      const d = berekend
      const sporten = form.sporten.length > 0 ? form.sporten : ['fitness']
      const ctx = form.doel === 'hyrox'
        ? 'Ik train voor Hyrox. Mijn doel is maximale raceperformance. Ik combineer strength training, hardlopen, fietsen en Hyrox-specifieke training (sled, ski erg, rowing, carries, lunges, wall balls).'
        : ''
      await api.put('/profiel', {
        geboortejaar: parseInt(form.geboortejaar),
        geslacht: form.geslacht,
        lengte_cm: parseFloat(form.lengte_cm),
        gewicht_kg: parseFloat(form.gewicht_kg),
        sporten,
        doel_kcal: d.doel_kcal,
        doel_eiwit_g: d.doel_eiwit_g,
        doel_koolhydraten_g: d.doel_koolhydraten_g,
        doel_vetten_g: d.doel_vetten_g,
        ...(ctx ? { coach_context: ctx } : {}),
      })
      onKlaar()
    } catch (err) { setFout('Opslaan mislukt: ' + err.message) }
    finally { setLaden(false) }
  }

  const voornaam = user.name?.split(' ')[0] || 'daar'

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 'var(--space-5) var(--space-4)',
      overflowY: 'auto',
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-5)' }}>
        <div className="auth-logo" style={{ margin: '0 auto var(--space-3)' }}>⚡</div>
        <h1 className="t-xl">APEX Coach</h1>
        <p className="t-sm t-muted" style={{ marginTop: 4 }}>Welkom {voornaam}! Laten we je profiel instellen.</p>
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)' }}>
        {[1, 2, 3].map(n => (
          <div key={n} style={{
            width: stap === n ? 24 : 8, height: 8, borderRadius: 4,
            background: stap > n ? 'var(--green)' : stap === n ? 'var(--text)' : 'var(--bg-surface)',
            transition: 'width var(--dur-normal) var(--ease-out), background var(--dur-fast)',
          }} />
        ))}
      </div>

      {fout && (
        <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(255,92,92,0.25)', borderRadius: 'var(--r-sm)', padding: 'var(--space-3) var(--space-4)', color: 'var(--red)', fontSize: 'var(--t-sm)', fontWeight: 500, marginBottom: 'var(--space-3)', width: '100%', maxWidth: 440 }}>
          {fout}
        </div>
      )}

      <Card style={{ width: '100%', maxWidth: 440 }}>
        {/* ── Stap 1 ── */}
        {stap === 1 && (
          <div className="section-gap">
            <div>
              <h2 className="t-lg">Lichaamsgegevens</h2>
              <p className="t-sm t-muted" style={{ marginTop: 4 }}>We berekenen hiermee je persoonlijke calorie- en eiwitbehoefte.</p>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label>Geboortejaar</label>
                <input className="input" type="number" value={form.geboortejaar}
                  onChange={e => upd('geboortejaar', e.target.value)}
                  placeholder="2000" min="1940" max="2015" inputMode="numeric" />
              </div>
              <div className="form-group">
                <label>Geslacht</label>
                <select className="input" value={form.geslacht} onChange={e => upd('geslacht', e.target.value)}>
                  <option value="">Kies...</option>
                  <option value="man">Man</option>
                  <option value="vrouw">Vrouw</option>
                  <option value="anders">Anders</option>
                </select>
              </div>
              <div className="form-group">
                <label>Lengte (cm)</label>
                <input className="input" type="number" value={form.lengte_cm}
                  onChange={e => upd('lengte_cm', e.target.value)}
                  placeholder="180" min="140" max="220" inputMode="numeric" />
              </div>
              <div className="form-group">
                <label>Gewicht (kg)</label>
                <input className="input" type="number" step="0.1" value={form.gewicht_kg}
                  onChange={e => upd('gewicht_kg', e.target.value)}
                  placeholder="75.0" min="40" max="200" inputMode="decimal" />
              </div>
            </div>
            <button className="btn btn-primary btn-full" onClick={() => setStap(2)} disabled={!stap1Klaar}>
              Volgende →
            </button>
          </div>
        )}

        {/* ── Stap 2 ── */}
        {stap === 2 && (
          <div className="section-gap">
            <div>
              <h2 className="t-lg">Wat is jouw doel?</h2>
              <p className="t-sm t-muted" style={{ marginTop: 4 }}>Dit bepaalt je calorie-inname en macroverdeling.</p>
            </div>
            <div className="section-gap" style={{ gap: 'var(--space-2)' }}>
              {DOELEN.map(d => {
                const active = form.doel === d.id
                return (
                  <button key={d.id} type="button" onClick={() => kiesDoel(d.id)} style={{
                    textAlign: 'left', padding: 'var(--space-3) var(--space-4)',
                    background: active ? 'var(--bg-surface)' : 'var(--bg-raised)',
                    border: active ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent',
                    borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'border-color var(--dur-fast)',
                  }}>
                    <div className="t-sm" style={{ fontWeight: 600, color: active ? 'var(--text)' : 'var(--text-2)' }}>{d.label}</div>
                    <div className="t-xs t-muted" style={{ marginTop: 2, textTransform: 'none', letterSpacing: 0 }}>{d.omschrijving}</div>
                  </button>
                )
              })}
            </div>
            <div className="form-group">
              <label>Trainingsdagen per week</label>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {[1, 2, 3, 4, 5, 6, 7].map(n => {
                  const active = form.trainingsDagen === n
                  return (
                    <button key={n} type="button" onClick={() => upd('trainingsDagen', n)} style={{
                      flex: 1, height: 40, border: active ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                      borderRadius: 'var(--r-xs)', background: active ? 'var(--bg-surface)' : 'var(--bg-raised)',
                      color: active ? 'var(--text)' : 'var(--text-3)', fontWeight: 700, fontSize: 'var(--t-sm)',
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color var(--dur-fast)',
                    }}>{n}</button>
                  )
                })}
              </div>
              <p className="t-xs t-muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
                {form.trainingsDagen <= 1 ? 'Licht actief' : form.trainingsDagen <= 3 ? 'Matig actief' : form.trainingsDagen <= 5 ? 'Actief' : 'Zeer actief'}
                {' '}— {form.trainingsDagen} dag{form.trainingsDagen !== 1 ? 'en' : ''}/week
              </p>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className="btn btn-ghost" onClick={() => setStap(1)}>← Terug</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStap(3)}>Volgende →</button>
            </div>
          </div>
        )}

        {/* ── Stap 3 ── */}
        {stap === 3 && berekend && (
          <div className="section-gap">
            <div>
              <h2 className="t-lg">Jouw dagelijkse doelen</h2>
              <p className="t-sm t-muted" style={{ marginTop: 4 }}>Berekend op basis van je profiel. Aanpasbaar via Instellingen.</p>
            </div>

            <div style={{ background: 'var(--bg-raised)', borderRadius: 'var(--r-sm)', padding: 'var(--space-3) var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="t-sm t-muted">Geschatte dagverbranding (TDEE)</span>
              <span className="t-lg" style={{ fontWeight: 700 }}>~{berekend.tdee} kcal</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)', textAlign: 'center' }}>
              {[
                { val: berekend.doel_kcal, label: 'kcal',    color: 'var(--text)' },
                { val: `${berekend.doel_eiwit_g}g`,   label: 'eiwit',   color: 'var(--green)' },
                { val: `${berekend.doel_koolhydraten_g}g`, label: 'koolhyd', color: 'var(--blue)' },
                { val: `${berekend.doel_vetten_g}g`,  label: 'vetten',  color: 'var(--amber)' },
              ].map(m => (
                <div key={m.label} style={{ background: 'var(--bg-raised)', borderRadius: 'var(--r-sm)', padding: 'var(--space-3) var(--space-2)' }}>
                  <div className="t-lg" style={{ fontWeight: 700, color: m.color, lineHeight: 1 }}>{m.val}</div>
                  <div className="metric-label" style={{ marginTop: 2 }}>{m.label}</div>
                </div>
              ))}
            </div>

            <div className="card-inset section-gap" style={{ gap: 'var(--space-2)' }}>
              <p className="t-sm t-muted">✓ Eiwit {berekend.doel_eiwit_g}g = {(berekend.doel_eiwit_g / parseFloat(form.gewicht_kg)).toFixed(1)}g/kg lichaamsgewicht</p>
              {form.doel === 'hyrox'      && <p className="t-sm t-muted">✓ Hoge koolhydraten — brandstof voor 8 runs + 8 stations</p>}
              {form.doel === 'afvallen'   && <p className="t-sm t-muted">✓ Tekort van {Math.abs(berekend.doel_kcal - berekend.tdee)} kcal voor verantwoord gewichtsverlies</p>}
              {form.doel === 'spiermassa' && <p className="t-sm t-muted">✓ Surplus van {berekend.doel_kcal - berekend.tdee} kcal voor spiergroei</p>}
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className="btn btn-ghost" onClick={() => setStap(2)}>← Terug</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={afronden} disabled={laden}>
                {laden ? 'Opslaan...' : 'Start met trainen →'}
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
