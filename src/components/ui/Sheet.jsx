import { useEffect } from 'react'

export default function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="sheet">
        <div className="sheet-handle" />
        {title && <div className="sheet-title">{title}</div>}
        {children}
      </div>
    </div>
  )
}
