import { useState } from 'react'
import Ring from './ui/Ring.jsx'
import MetricHero from './ui/MetricHero.jsx'
import Card from './ui/Card.jsx'
import Sheet from './ui/Sheet.jsx'
import Chip from './ui/Chip.jsx'
import Slider from './ui/Slider.jsx'

export default function Styleguide() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sliderVal, setSliderVal] = useState(65)

  return (
    <div className="page" style={{ gap: 'var(--space-6)' }}>
      <div className="page-header">
        <span className="t-lg">Design System</span>
        <Chip label="Phase 0" color="blue" />
      </div>

      {/* ── Rings ─────────────────────────────────────────── */}
      <section className="section-gap">
        <span className="t-label">Readiness Ring</span>
        <div style={{ display: 'flex', gap: 'var(--space-5)', justifyContent: 'center', flexWrap: 'wrap', padding: 'var(--space-4) 0' }}>
          <Ring score={82} baseline={74} size={180} />
          <Ring score={51} baseline={60} size={180} />
          <Ring score={24} baseline={42} size={180} />
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center' }}>
          <Ring score={82} size={96} />
          <Ring score={51} size={96} />
          <Ring score={24} size={96} />
        </div>
      </section>

      {/* ── Typography ────────────────────────────────────── */}
      <section className="section-gap">
        <span className="t-label">Typography</span>
        <Card>
          <div className="section-gap">
            <span className="t-hero t-green">82</span>
            <span className="t-xl">Titel XL</span>
            <span className="t-lg">Titel LG</span>
            <span className="t-md">Body tekst MD — lorem ipsum dolor sit amet</span>
            <span className="t-sm">Subtitel SM — secondaire informatie</span>
            <span className="t-xs">Label XS</span>
            <span className="t-label">Section label</span>
          </div>
        </Card>
      </section>

      {/* ── Metrics ───────────────────────────────────────── */}
      <section className="section-gap">
        <span className="t-label">MetricHero</span>
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
            <MetricHero value={62} unit="ms" label="HRV Ochtend" color="var(--green)" />
            <MetricHero value={7.4} unit="uur" label="Slaap" color="var(--blue)" />
            <MetricHero value={168} unit="bpm" label="Max HF" />
            <MetricHero value="—" unit="kg" label="Gewicht" />
          </div>
        </Card>
      </section>

      {/* ── Cards ─────────────────────────────────────────── */}
      <section className="section-gap">
        <span className="t-label">Cards</span>
        <Card>
          <span className="t-md">Card default</span>
          <p className="t-sm mt-2">Verhoogd oppervlak voor inhoud.</p>
        </Card>
        <Card variant="raised">
          <span className="t-md">Card raised</span>
          <p className="t-sm mt-2">Iets hoger voor nested content.</p>
        </Card>
        <Card variant="inset">
          <span className="t-md">Card inset</span>
        </Card>
      </section>

      {/* ── Chips ─────────────────────────────────────────── */}
      <section className="section-gap">
        <span className="t-label">Chips</span>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Chip label="Goed" color="green" dot />
          <Chip label="Matig" color="amber" dot />
          <Chip label="Laag" color="red" dot />
          <Chip label="Info" color="blue" />
          <Chip label="Neutraal" color="muted" />
        </div>
      </section>

      {/* ── Buttons ───────────────────────────────────────── */}
      <section className="section-gap">
        <span className="t-label">Buttons</span>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <button className="btn btn-primary">Primair</button>
          <button className="btn btn-amber">Waarschuwing</button>
          <button className="btn btn-danger">Verwijder</button>
          <button className="btn btn-secondary">Secundair</button>
          <button className="btn btn-ghost">Ghost</button>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm">Klein primair</button>
          <button className="btn btn-secondary btn-sm">Klein sec.</button>
        </div>
        <button className="btn btn-primary btn-full">Volledige breedte</button>
      </section>

      {/* ── Slider ────────────────────────────────────────── */}
      <section className="section-gap">
        <span className="t-label">Slider</span>
        <Card>
          <div className="form-group">
            <label>RPE — Inspanning ({sliderVal})</label>
            <Slider
              value={sliderVal}
              min={1} max={10}
              labelMin="Heel licht" labelMax="Maximaal"
              onChange={setSliderVal}
            />
          </div>
        </Card>
      </section>

      {/* ── Progress ──────────────────────────────────────── */}
      <section className="section-gap">
        <span className="t-label">Progress Bar</span>
        <Card>
          <div className="section-gap">
            {[
              { pct: 75, color: 'var(--green)' },
              { pct: 45, color: 'var(--amber)' },
              { pct: 20, color: 'var(--red)' },
            ].map(({ pct, color }) => (
              <div key={pct} className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* ── Sheet ─────────────────────────────────────────── */}
      <section className="section-gap">
        <span className="t-label">Bottom Sheet</span>
        <button className="btn btn-secondary" onClick={() => setSheetOpen(true)}>
          Open sheet
        </button>
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Voorbeeld Sheet">
          <div className="section-gap">
            <p className="t-md">Sheet inhoud komt hier.</p>
            <button className="btn btn-primary btn-full" onClick={() => setSheetOpen(false)}>
              Sluiten
            </button>
          </div>
        </Sheet>
      </section>

      {/* ── Skeleton ──────────────────────────────────────── */}
      <section className="section-gap">
        <span className="t-label">Loading Skeleton</span>
        <Card>
          <div className="section-gap">
            <div className="skeleton" style={{ height: 20, width: '60%', borderRadius: 'var(--r-xs)' }} />
            <div className="skeleton" style={{ height: 14, width: '90%', borderRadius: 'var(--r-xs)' }} />
            <div className="skeleton" style={{ height: 14, width: '75%', borderRadius: 'var(--r-xs)' }} />
          </div>
        </Card>
      </section>

      {/* ── Empty State ───────────────────────────────────── */}
      <section className="section-gap">
        <span className="t-label">Empty State</span>
        <Card>
          <div className="empty-state">
            <span className="empty-icon">🏃</span>
            <span className="t-md">Geen trainingen gevonden</span>
            <span className="t-sm">Log je eerste training om te beginnen.</span>
          </div>
        </Card>
      </section>

      <div style={{ height: 'var(--space-4)' }} />
    </div>
  )
}
