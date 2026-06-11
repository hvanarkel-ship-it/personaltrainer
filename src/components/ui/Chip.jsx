export default function Chip({ label, color = 'muted', dot = false }) {
  return (
    <span className={`chip chip-${color}${dot ? ' chip-dot' : ''}`}>
      {label}
    </span>
  )
}
