export default function GlassBar({ children, className = '', style }) {
  return (
    <div className={`glass ${className}`} style={style}>
      {children}
    </div>
  )
}
