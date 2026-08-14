// Gedeelde, hoogwaardige AI-voedingsschatting — gebruikt door voeding-schat.js
// (tekst), upload-analyse.js (foto) en coach-chat.js (tekst + foto).

export const MAALTIJD_TYPES = 'ontbijt|lunch|diner|snack|pre-workout|post-workout'

// Sterke, ingrediënt-gebaseerde instructie. Het per component laten uitsplitsen
// (portie → kcal per ingrediënt → optellen) is dé accuraatheidshefboom voor
// calorie-inschatting met een taalmodel, veel beter dan één totaal gokken.
export function schatInstructie({ metFoto = false } = {}) {
  const bron = metFoto ? 'de maaltijd op de foto' : 'de beschreven voeding'
  return `Je bent een ervaren voedingsdeskundige. Schat de voedingswaarde van ${bron} zo nauwkeurig mogelijk.

Werkwijze — denk stap voor stap:
1. Splits de maaltijd in losse componenten/ingrediënten${metFoto ? ' die je op de foto ziet' : ''}.
2. Schat per component de portie in gram of ml. Gebruik expliciet genoemde hoeveelheden; anders een realistische standaardportie voor een volwassen sporter.
3. Bepaal per component de kcal + macro's met bekende voedingswaarden per 100 g.
4. Tel alle componenten op tot één totaal.

Voor nauwkeurigheid:
- Onderschat bereidingsvet (olie, boter), sauzen, dressings en suikerhoudende dranken NIET.
- Houd de totalen intern consistent: kcal ≈ 4×eiwit_g + 4×koolhydraten_g + 9×vetten_g.
- Rond porties realistisch; wees niet stelselmatig te laag of te hoog.
- Zet de losse componenten met portie en kcal in "ai_notities" zodat de gebruiker het kan controleren en bijstellen.

Geef UITSLUITEND geldig JSON, geen extra tekst:
{"beschrijving":"korte naam","maaltijd_type":"${MAALTIJD_TYPES}","kcal":0,"eiwit_g":0.0,"koolhydraten_g":0.0,"vetten_g":0.0,"ai_notities":"componenten, bv. 'Havermout 60g ~230kcal · Banaan 120g ~105kcal · Whey 30g ~120kcal'"}`
}

// Robuuste JSON-extractie (pakt het JSON-object, ook met tekst eromheen).
export function parseJson(tekst) {
  const schoon = String(tekst || '').trim().replace(/```json\n?|\n?```/g, '').trim()
  try { return JSON.parse(schoon) } catch { /* val terug op regex */ }
  const m = schoon.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch { /* geef null */ } }
  return null
}

// Verzoen kcal met de macro's (4/4/9). Wijkt de opgegeven kcal >15% af van de
// macro-afgeleide waarde, dan is de schatting intern inconsistent → gebruik de
// macro-afgeleide kcal. Retourneert afgeronde, consistente waarden.
export function verzoenMacros(d) {
  const p = Math.max(0, parseFloat(d.eiwit_g) || 0)
  const c = Math.max(0, parseFloat(d.koolhydraten_g) || 0)
  const f = Math.max(0, parseFloat(d.vetten_g) || 0)
  const kcalUitMacros = Math.round(4 * p + 4 * c + 9 * f)
  const kcalModel = Math.max(0, parseFloat(d.kcal) || 0)
  const consistent = kcalModel > 0 && Math.abs(kcalModel - kcalUitMacros) <= kcalUitMacros * 0.15
  const kcal = consistent ? Math.round(kcalModel) : (kcalUitMacros || Math.round(kcalModel))
  return {
    ...d,
    kcal,
    eiwit_g: Math.round(p),
    koolhydraten_g: Math.round(c),
    vetten_g: Math.round(f),
  }
}
