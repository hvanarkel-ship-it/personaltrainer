import { useEffect, useRef, useState } from 'react'

// WHOOP-stijl herstelkleuren (fel op zwart): groen = hersteld, geel = matig,
// rood = laag. Dedicated kleuren (niet de globale tokens) zodat de knoppen/UI
// niet mee-veranderen.
const HERSTEL = {
  groen: { kleur: '#16EC5E', glow: 'rgba(22,236,94,0.45)' },
  geel:  { kleur: '#FFD54A', glow: 'rgba(255,213,74,0.40)' },
  rood:  { kleur: '#FF3B5C', glow: 'rgba(255,59,92,0.42)' },
}
const zone = score => (score >= 67 ? HERSTEL.groen : score >= 34 ? HERSTEL.geel : HERSTEL.rood)

export default function Ring({ score = 0, baseline = null, size = 240, label = 'Herstel', animated = true }) {
  const [displayed, setDisplayed] = useState(animated ? 0 : score)
  const [drawn, setDrawn] = useState(animated ? 0 : score)
  const rafRef = useRef(null)

  const strokeW = size * 0.075
  const r = (size - strokeW) / 2
  const cx = size / 2
  const circumference = 2 * Math.PI * r

  useEffect(() => {
    if (!animated) { setDisplayed(score); setDrawn(score); return }
    const start = performance.now()
    const duration = 1000
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
  const { kleur, glow } = zone(score)
  const baselineOffset = baseline != null ? circumference * (1 - baseline / 100) : null

  return (
    <div style={{ position: 'relative', width: size, height: size, filter: `drop-shadow(0 0 26px ${glow})` }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--hairline)" strokeWidth={strokeW} />
        {/* Baseline (7d) — subtiele markering */}
        {baselineOffset != null && (
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={kleur} strokeOpacity={0.22}
            strokeWidth={strokeW * 0.45}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={baselineOffset} strokeLinecap="round" />
        )}
        {/* Progress */}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={kleur} strokeWidth={strokeW}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={fillOffset} strokeLinecap="round" />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', lineHeight: 1 }}>
          <span style={{
            fontSize: size * 0.30, fontWeight: 800, color: kleur,
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em',
          }}>{displayed}</span>
          <span style={{ fontSize: size * 0.11, fontWeight: 700, color: kleur, marginTop: size * 0.03 }}>%</span>
        </div>
        <span style={{
          fontSize: size * 0.062, fontWeight: 700, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)',
        }}>{label}</span>
      </div>
    </div>
  )
}
