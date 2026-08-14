import { useEffect, useRef, useState } from 'react'

// Generieke WHOOP-stijl metriek-ring (voor Belasting/Strain en Slaap).
// value/max bepaalt de vulling; kleur + glow geven de WHOOP-uitstraling.
export default function MetricRing({
  value = 0, max = 100, kleur = '#0093E7', glow = 'rgba(0,147,231,0.4)',
  grootLabel, subLabel, size = 128, decimals = 0, animated = true,
}) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0))
  const [drawn, setDrawn] = useState(animated ? 0 : pct)
  const [num, setNum] = useState(animated ? 0 : value)
  const rafRef = useRef(null)

  const strokeW = size * 0.085
  const r = (size - strokeW) / 2
  const cx = size / 2
  const c = 2 * Math.PI * r

  useEffect(() => {
    if (!animated) { setDrawn(pct); setNum(value); return }
    const start = performance.now()
    const dur = 900
    const step = now => {
      const t = Math.min((now - start) / dur, 1)
      const e = 1 - Math.pow(1 - t, 3)
      setDrawn(e * pct); setNum(e * value)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, max, animated]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size, filter: `drop-shadow(0 0 14px ${glow})` }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--hairline)" strokeWidth={strokeW} />
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={kleur} strokeWidth={strokeW}
            strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - drawn)} strokeLinecap="round" />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: size * 0.30, fontWeight: 800, color: kleur, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>
            {num.toFixed(decimals)}
          </span>
          {grootLabel && (
            <span style={{ fontSize: size * 0.10, fontWeight: 700, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>{grootLabel}</span>
          )}
        </div>
      </div>
      {subLabel && (
        <span style={{ fontSize: 'var(--t-xs)', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
          {subLabel}
        </span>
      )}
    </div>
  )
}
