import MetricRing from './MetricRing.jsx'

export default function DailyOverview({ recovery, sleep, strain, onSelect }) {
  const metrics = [
    { id: 'slaap', label: 'Slaap', value: sleep, max: 100, color: 'var(--sleep)', suffix: '%' },
    { id: 'herstel', label: 'Herstel', value: recovery, max: 100, color: recovery == null ? 'var(--text-3)' : recovery >= 67 ? 'var(--green)' : recovery >= 34 ? 'var(--amber)' : 'var(--red)', suffix: '%' },
    { id: 'belasting', label: 'Belasting', value: strain, max: 21, color: 'var(--blue)', suffix: '/21', decimals: 1 },
  ]
  return <div className="daily-overview">
    {metrics.map(metric => <button key={metric.id} className="daily-metric" onClick={() => onSelect?.(metric.id)} aria-label={`${metric.label}: ${metric.value == null ? 'nog geen data' : metric.value + metric.suffix}. Bekijk uitleg`}>
      <span className="daily-metric-label">{metric.label}<span aria-hidden="true">↗</span></span>
      {metric.value == null ? <div className="empty-gauge"><strong>—</strong><span>Geen data</span></div> : <MetricRing value={metric.value} max={metric.max} kleur={metric.color} glow="transparent" size={148} grootLabel={metric.suffix} decimals={metric.decimals || 0} />}
    </button>)}
  </div>
}
