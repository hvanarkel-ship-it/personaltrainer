export default function MetricHero({ value, unit, label, color, size = 'xl' }) {
  const sizeClass = size === 'hero' ? 't-hero' : 't-xl'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div className="metric-row">
        <span className={`metric-value ${sizeClass}`} style={color ? { color } : undefined}>
          {value ?? '—'}
        </span>
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
      {label && <span className="metric-label">{label}</span>}
    </div>
  )
}
