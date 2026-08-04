// Eén waarheid voor HRV-interpretatie — gedeeld door de UI (Dashboard,
// Statistieken), de gereedheidsscore en de coach-prompt. Absolute richtlijnen;
// de persoonlijke baseline (7-daags gemiddelde op het dashboard) weegt in de
// praktijk zwaarder, maar de kleur/score/tekst gebruiken deze zones consistent.
export const HRV_ZONES = [
  { min: 60, label: 'goed',     kleur: 'var(--green)', score: 100 },
  { min: 45, label: 'redelijk', kleur: 'var(--amber)', score: 65  },
  { min: 0,  label: 'laag',     kleur: 'var(--red)',   score: 30  },
]

export function hrvZone(hrv) {
  const v = parseFloat(hrv)
  if (!v && v !== 0) return null
  return HRV_ZONES.find(z => v >= z.min) || HRV_ZONES[HRV_ZONES.length - 1]
}

export const hrvKleur = hrv => hrvZone(hrv)?.kleur
export const hrvScore = hrv => hrvZone(hrv)?.score ?? null

// Voor de coach-prompt: leesbare bandbeschrijving uit dezelfde zones.
export function hrvBandTekst() {
  return '≥60 ms goed · 45–59 ms redelijk · <45 ms laag'
}
