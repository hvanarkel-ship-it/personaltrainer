// Eén waarheid voor voedingsberekeningen — gedeeld door de frontend (Onboarding,
// Dashboard, Voeding via api.js) en de backend (coach-chat, profiel).
// Pure ESM: geen DOM- of Node-afhankelijkheden, zodat beide bundlers (Vite +
// Netlify/esbuild) het kunnen importeren.

// Fallback-dagdoelen als een profiel nog geen doelen heeft.
export const MACRO_DEFAULTS = { kcal: 2400, eiwit_g: 160, koolhydraten_g: 250, vetten_g: 80 }

// Activiteitsfactor op basis van weektotaal trainingsminuten (volume telt,
// niet het aantal sessies). Onboarding kent alleen dagen en schat minuten
// (dagen × 75). De coach heeft echte minuten. Beide gebruiken deze functie.
export function activiteitsFactor(weekMinuten) {
  const m = weekMinuten || 0
  if (m >= 420) return 1.725  // ≥7u/week — zware atleet
  if (m >= 240) return 1.55   // ≥4u/week — actief
  if (m >= 120) return 1.375  // ≥2u/week — licht actief
  if (m >= 30)  return 1.3
  return 1.2
}

// Basaalmetabolisme — Mifflin-St Jeor. Retourneert null bij onvolledige data.
export function bmrMifflin({ geslacht, gewicht_kg, lengte_cm, leeftijd }) {
  const g = parseFloat(gewicht_kg), l = parseFloat(lengte_cm), a = parseInt(leeftijd)
  if (!g || !l || !a) return null
  const basis = 10 * g + 6.25 * l - 5 * a
  return String(geslacht || '').toLowerCase() === 'vrouw' ? basis - 161 : basis + 5
}

// Totaal dagelijks energieverbruik (BMR × activiteitsfactor).
export function berekenTDEE({ geslacht, gewicht_kg, lengte_cm, leeftijd, weekMinuten }) {
  const bmr = bmrMifflin({ geslacht, gewicht_kg, lengte_cm, leeftijd })
  if (bmr == null) return null
  return Math.round(bmr * activiteitsFactor(weekMinuten))
}
