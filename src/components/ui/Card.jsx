export default function Card({ children, variant = 'default', className = '', style, onClick }) {
  const cls = {
    default: 'card',
    raised:  'card-raised',
    inset:   'card-inset',
  }[variant] || 'card'

  return (
    <div
      className={`${cls} ${className}`}
      style={onClick ? { cursor: 'pointer', ...style } : style}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
