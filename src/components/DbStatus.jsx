import { useState, useEffect, useCallback } from 'react'

export default function DbStatus() {
  const [status, setStatus] = useState('checking') // 'checking' | 'ok' | 'fout'
  const [latency, setLatency] = useState(null)
  const [error, setError] = useState(null)
  const [toonDetail, setToonDetail] = useState(false)

  const check = useCallback(async () => {
    setStatus('checking')
    try {
      const res = await fetch('/api/health', {
        signal: AbortSignal.timeout(6000),
        cache: 'no-store'
      })
      const data = await res.json()
      if (data.status === 'ok') {
        setStatus('ok')
        setLatency(data.latency_ms)
        setError(null)
      } else {
        setStatus('fout')
        setError(data.error || 'Database niet bereikbaar')
        setLatency(null)
      }
    } catch (err) {
      setStatus('fout')
      setError(err.name === 'TimeoutError' ? 'Verbinding timeout (>6s)' : 'Server niet bereikbaar')
      setLatency(null)
    }
  }, [])

  // Check on mount + elke 30 seconden
  useEffect(() => {
    check()
    const t = setInterval(check, 30_000)
    return () => clearInterval(t)
  }, [check])

  const KLEUREN = { ok: '#22c55e', checking: '#eab308', fout: '#ef4444' }
  const LABELS = { ok: 'Database verbonden', checking: 'Verbinding controleren…', fout: 'Database fout' }

  return (
    <>
      {/* Klein stoplichtje */}
      <button
        className="db-status-dot"
        onClick={() => setToonDetail(d => !d)}
        title={LABELS[status]}
        aria-label={LABELS[status]}
      >
        <span
          className={`db-dot-circle ${status}`}
          style={{ background: KLEUREN[status] }}
        />
        {status === 'fout' && <span className="db-dot-label">DB fout</span>}
      </button>

      {/* Detail popover */}
      {toonDetail && (
        <div className="db-popover" onClick={() => setToonDetail(false)}>
          <div className="db-popover-inner" onClick={e => e.stopPropagation()}>
            <div className="db-popover-kop">
              <span
                className={`db-dot-circle ${status}`}
                style={{ background: KLEUREN[status], width: 12, height: 12 }}
              />
              <strong>{LABELS[status]}</strong>
              <button className="icon-btn sm" onClick={() => setToonDetail(false)}>✕</button>
            </div>

            {status === 'ok' && (
              <p className="db-popover-info">
                Neon PostgreSQL reageert in <strong>{latency} ms</strong>.
                Alle data wordt rechtstreeks uit de database opgehaald en weggeschreven.
              </p>
            )}
            {status === 'checking' && (
              <p className="db-popover-info">Verbinding wordt getest…</p>
            )}
            {status === 'fout' && (
              <p className="db-popover-error">
                <strong>Foutmelding:</strong> {error}<br />
                Data kan niet worden opgehaald of opgeslagen. Probeer de pagina te herladen.
              </p>
            )}

            <div className="db-popover-acties">
              <button className="btn btn-secondary" onClick={() => { check(); setToonDetail(false) }}>
                ↻ Opnieuw controleren
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
