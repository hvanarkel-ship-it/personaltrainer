import { useEffect, useRef, useState } from 'react'

const zoneColor = score => {
  if (score >= 67) return 'var(--green)'
  if (score >= 34) return 'var(--amber)'
  return 'var(--red)'
}

const zoneGlow = score => {
  if (score >= 67) return 'var(--green-glow)'
  if (score >= 34) return 'var(--amber-glow)'
  return 'var(--red-glow)'
}

export default function Ring({ score = 0, baseline = null, size = 220, animated = true }) {
  const [displayed, setDisplayed] = useState(animated ? 0 : score)
  const [drawn, setDrawn] = useState(animated ? 0 : score)
  const rafRef = useRef(null)

  const strokeW = size * 0.065
  const r = (size - strokeW) / 2
  const cx = size / 2
  const circumference = 2 * Math.PI * r

  useEffect(() => {
    if (!animated) {
      setDisplayed(score)
      setDrawn(score)
      return
    }
    const start = performance.now()
    const duration = 900
    const animate = now => {
      const t = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - t, 3)
      setDisplayed(Math.round(ease * score))
      setDrawn(ease * score)
      if (t < 1) rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [score, animated])

  const fillOffset = circumference * (1 - drawn / 100)
  const color = zoneColor(score)
  const glow = zoneGlow(score)

  // Baseline comparison arc (subtle, 3px)
  const baselineOffset = baseline != null
    ? circumference * (1 - baseline / 100)
    : null

  return (
    <div style={{ position: 'relative', width: size, height: size, filter: `drop-shadow(${glow})` }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke="var(--bg-surface)"
          strokeWidth={strokeW}
        />
        {/* Baseline arc */}
        {baselineOffset != null && (
          <circle
            cx={cx} cy={cx} r={r}
            fill="none"
            stroke={color}
            strokeOpacity={0.2}
            strokeWidth={strokeW * 0.5}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={baselineOffset}
            strokeLinecap="round"
          />
        )}
        {/* Progress arc */}
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={fillOffset}
          strokeLinecap="round"
          style={{ transition: animated ? 'none' : undefined }}
        />
      </svg>
      {/* Inner content */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}>
        <span style={{
          fontSize: size * 0.27,
          fontWeight: 700,
          lineHeight: 1,
          color,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.03em',
        }}>
          {displayed}
        </span>
        <span style={{
          fontSize: size * 0.072,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-3)',
        }}>
          Gereedheid
        </span>
      </div>
    </div>
  )
}
