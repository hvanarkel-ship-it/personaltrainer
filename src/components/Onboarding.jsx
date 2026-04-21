import { useState } from 'react'
import { api } from '../api.js'

const DOELEN = [
  { id: 'hyrox',     label: 'Hyrox race',         omschrijving: 'Maximale raceperformance',         eiwit: 2.0, kcalDelta: 0,    vetPct: 0.25 },
  { id: 'prestatie', label: 'Sport & prestatie',   omschrijving: 'Sterker, sneller, verder',          eiwit: 1.9, kcalDelta: 0,    vetPct: 0.27 },
  { id: 'spiermassa',label: 'Spieropbouw',         omschrijving: 'Meer spiermassa opbouwen',          eiwit: 1.9, kcalDelta: 250,  vetPct: 0.28 },
  { id: 'afvallen',  label: 'Afvallen',            omschrijving: 'Vet verliezen, conditie behouden',  eiwit: 1.8, kcalDelta: -400, vetPct: 0.28 },
  { id: 'gezondheid',label: 'Gezond & fit',        omschrijving: 'Fit en energiek in het dagelijks leven', eiwit: 1.6, kcalDelta: 0, vetPct: 0.30 },
]

const HYROX_SPORTEN = ['hyrox', 'hardlopen', 'fitness', 'fietsen']

function berekenDoelen({ geboortejaar, geslacht, lengte_cm, gewicht_kg, trainingsDagen, doel }) {
  const leeftijd = new Date().getFullYear() - parseInt(geboortejaar)
  const g = parseFloat(gewicht_kg)
  const l = parseFloat(lengte_cm)
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
  const [stap, setStap] = useState(1)
  const [laden, setLaden] = useState(false)
  const [fout, setFout] = useState('')
  const [form, setForm] = useState({
    geboortejaar: '', geslacht: '', lengte_cm: '', gewicht_kg: '',
    trainingsDagen: 4, doel: 'gezondheid', sporten: [],
  })

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const stap1Klaar = form.geboortejaar && form.geslacht && form.lengte_cm && form.gewicht_kg
    && parseInt(form.geboortejaar) > 1940 && parseFloat(form.gewicht_kg) > 0

  const berekend = stap1Klaar ? berekenDoelen(form) : null

  function kiesHyrox() {
    setForm(f => ({
      ...f, doel: 'hyrox',
      sporten: [...new Set([...f.sporten, ...HYROX_SPORTEN])],
    }))
  }

  function kiesDoel(id) {
    if (id === 'hyrox') { kiesHyrox(); return }
    upd('doel', id)
  }

  function toggleSport(s) {
    setForm(f => ({
      ...f,
      sporten: f.sporten.includes(s) ? f.sporten.filter(x => x !== s) : [...f.sporten, s],
    }))
  }

  async function afronden() {
    setLaden(true)
    setFout('')
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
    } catch (err) {
      setFout('Opslaan mislukt: ' + err.message)
    } finally {
      setLaden(false)
    }
  }

  const voornaam = user.name?.split(' ')[0] || user.name || 'daar'

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="login-logo" style={{ marginBottom: '16px' }}>
          <div className="login-logo-icon">⚡</div>
          <h1>APEX Coach</h1>
          <p>Welkom {voornaam}! Laten we je profiel instellen.</p>
        </div>

        <div className="onboarding-stappen">
          {[1, 2, 3].map(n => (
            <div key={n} className={`onboarding-stap-dot ${stap === n ? 'active' : stap > n ? 'done' : ''}`} />
          ))}
        </div>

        {fout && <div className="alert alert-error" style={{ marginBottom: '12px' }}>{fout}</div>}

        {/* ── Stap 1: Lichaamsgegevens ── */}
        {stap === 1 && (
          <div>
            <h2>Lichaamsgegevens</h2>
            <p className="onboarding-sub">We berekenen hiermee jouw persoonlijke calorie- en eiwitbehoefte.</p>
            <div className="form-rij">
              <div className="form-group">
                <label>Geboortejaar</label>
                <input type="number" value={form.geboortejaar}
                  onChange={e => upd('geboortejaar', e.target.value)}
                  placeholder="2000" min="1940" max="2015" inputMode="numeric" />
              </div>
              <div className="form-group">
                <label>Geslacht</label>
                <select value={form.geslacht} onChange={e => upd('geslacht', e.target.value)}>
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
                <input type="number" value={form.lengte_cm}
                  onChange={e => upd('lengte_cm', e.target.value)}
                  placeholder="180" min="140" max="220" inputMode="numeric" />
              </div>
              <div className="form-group">
                <label>Gewicht (kg)</label>
                <input type="number" step="0.1" value={form.gewicht_kg}
                  onChange={e => upd('gewicht_kg', e.target.value)}
                  placeholder="75.0" min="40" max="200" inputMode="decimal" />
              </div>
            </div>
            <button className="btn btn-primary btn-full" onClick={() => setStap(2)} disabled={!stap1Klaar}>
              Volgende →
            </button>
          </div>
        )}

        {/* ── Stap 2: Doel + training frequentie ── */}
        {stap === 2 && (
          <div>
            <h2>Wat is jouw doel?</h2>
            <p className="onboarding-sub">Dit bepaalt je calorie-inname en macroverdeling.</p>
            <div className="onboarding-doelen">
              {DOELEN.map(d => (
                <button key={d.id} type="button"
                  className={`onboarding-doel-btn ${form.doel === d.id ? 'active' : ''}`}
                  onClick={() => kiesDoel(d.id)}>
                  <strong>{d.id === 'hyrox' ? '⚡ ' : ''}{d.label}</strong>
                  <span>{d.omschrijving}</span>
                </button>
              ))}
            </div>

            <div className="form-group" style={{ marginTop: '20px' }}>
              <label>Trainingsdagen per week</label>
              <div className="onboarding-dagen">
                {[1, 2, 3, 4, 5, 6, 7].map(n => (
                  <button key={n} type="button"
                    className={`onboarding-dag-btn ${form.trainingsDagen === n ? 'active' : ''}`}
                    onClick={() => upd('trainingsDagen', n)}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="form-hint" style={{ marginTop: '6px' }}>
                {form.trainingsDagen <= 1 ? 'Licht actief' :
                 form.trainingsDagen <= 3 ? 'Matig actief' :
                 form.trainingsDagen <= 5 ? 'Actief' : 'Zeer actief'}
                {' '}— {form.trainingsDagen} dag{form.trainingsDagen !== 1 ? 'en' : ''}/week
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button className="btn btn-ghost" onClick={() => setStap(1)}>← Terug</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStap(3)}>
                Volgende →
              </button>
            </div>
          </div>
        )}

        {/* ── Stap 3: Berekende targets bevestigen ── */}
        {stap === 3 && berekend && (
          <div>
            <h2>Jouw dagelijkse doelen</h2>
            <p className="onboarding-sub">
              Berekend op basis van jouw profiel, doel en activiteitsniveau. Aanpasbaar via Instellingen.
            </p>

            <div className="onboarding-tdee">
              <span className="onboarding-tdee-label">Geschatte dagverbranding (TDEE)</span>
              <span className="onboarding-tdee-waarde">~{berekend.tdee} kcal</span>
            </div>

            <div className="macro-blokken" style={{ margin: '14px 0' }}>
              <div className="macro-blok"><strong>{berekend.doel_kcal}</strong><span>kcal</span></div>
              <div className="macro-blok macro-blok--groen"><strong>{berekend.doel_eiwit_g}g</strong><span>eiwit</span></div>
              <div className="macro-blok macro-blok--blauw"><strong>{berekend.doel_koolhydraten_g}g</strong><span>koolhyd</span></div>
              <div className="macro-blok macro-blok--oranje"><strong>{berekend.doel_vetten_g}g</strong><span>vetten</span></div>
            </div>

            <div className="onboarding-uitleg">
              <p>✓ Eiwit {berekend.doel_eiwit_g}g = {(berekend.doel_eiwit_g / parseFloat(form.gewicht_kg)).toFixed(1)}g/kg lichaamsgewicht</p>
              {form.doel === 'hyrox' && <p>✓ Hoge koolhydraten — brandstof voor 8 runs + 8 stations</p>}
              {form.doel === 'afvallen' && <p>✓ Tekort van {Math.abs(berekend.doel_kcal - berekend.tdee)} kcal voor verantwoord gewichtsverlies</p>}
              {form.doel === 'spiermassa' && <p>✓ Surplus van {berekend.doel_kcal - berekend.tdee} kcal voor spiergroei</p>}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button className="btn btn-ghost" onClick={() => setStap(2)}>← Terug</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={afronden} disabled={laden}>
                {laden ? 'Opslaan...' : 'Start met trainen →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
