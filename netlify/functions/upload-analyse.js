import Anthropic from '@anthropic-ai/sdk'
import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 3 })

const UPLOAD_PROMPTS = {
  maaltijd: `Analyseer deze maaltijdfoto. Identificeer alle ingrediënten, schat de portiegroottes en bereken de macronutriënten.
Geef je antwoord ALLEEN als JSON:
{"beschrijving":"...", "kcal":0, "eiwit_g":0, "koolhydraten_g":0, "vetten_g":0, "foto_analyse":"...", "ai_notities":"kort advies in context van dagdoel"}`,

  suunto: `Lees alle data van deze Suunto schermafbeelding. Extraheer: activiteitstype, duur (minuten), calorieën, gemiddelde hartslag, max hartslag, hartslagzones (zone 2/3/4 minuten), HRV, slaap_score, herstel_balans, slaap uren.
Geef je antwoord ALLEEN als JSON:
{"sport":"...", "duur_min":0, "kcal":0, "gem_hartslag":0, "max_hartslag":0, "hrv_ochtend":0, "slaap_uur":0, "slaap_score":0, "herstel_balans":0, "zone2_min":0, "zone3_min":0, "zone4_min":0, "notities":"samenvatting van de sessie in het Nederlands"}`,

  inbody: `Lees alle InBody meetwaarden van dit document. Extraheer: gewicht, vetmassa, vetpercentage, spiermassa, visceraal vet niveau, BMR, vochtbalans percentage, InBody score.
Geef je antwoord ALLEEN als JSON:
{"gewicht_kg":0, "vetmassa_kg":0, "vetpercentage":0, "spiermassa_kg":0, "visceraal_vet":0, "bmr_kcal":0, "vochtbalans_pct":0, "inbody_score":0, "notities":"korte duiding in het Nederlands"}`,

  apple_health: `Lees alle gezondheidsdata van deze Apple Health schermafbeelding. Extraheer wat zichtbaar is: stappen, calorieën, hartslag, HRV, slaap, zuurstofverzadiging.
Geef je antwoord ALLEEN als JSON met de velden die aanwezig zijn:
{"stappen":0, "kcal_actief":0, "gem_hartslag":0, "hrv_ms":0, "slaap_uur":0, "spo2_pct":0, "notities":"analyse in het Nederlands"}`,

  lab: `Interpreteer deze laboratoriumuitslagen in de context van sport en gezondheid. Identificeer alle bloedwaarden, referentiewaarden, en geef een analyse.
Geef je antwoord als JSON:
{"waarden":[{"naam":"...","waarde":"...","eenheid":"...","referentie":"...","status":"normaal/laag/hoog"}], "analyse":"uitgebreide interpretatie in het Nederlands, met aandachtspunten voor training en voeding"}`,

  overig: `Analyseer deze afbeelding en extraheer alle relevante gezondheids- of trainingsdata. Identificeer de app of bron.
Geef je antwoord als JSON:
{"bron":"naam van app/document", "data":{}, "samenvatting":"wat je hebt gevonden in het Nederlands"}`
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  try {
    const { upload_type, bestanden } = JSON.parse(event.body || '{}')
    if (!bestanden?.length) return cors({ error: 'Geen bestanden meegegeven' }, 400)

    const prompt = UPLOAD_PROMPTS[upload_type] || UPLOAD_PROMPTS.overig

    // Bouw content array op met alle bestanden
    const content = []
    for (const bestand of bestanden) {
      const [header, data] = bestand.base64.split(',')
      const mediaType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg'
      if (mediaType === 'application/pdf') {
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data }
        })
      } else {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data }
        })
      }
    }
    content.push({ type: 'text', text: prompt })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content }]
    })

    const raw = response.content[0].text.trim()
    try {
      const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim())
      return cors({ succes: true, data: parsed, upload_type })
    } catch {
      return cors({ succes: false, error: 'Kon data niet parsen', raw })
    }
  } catch (err) {
    console.error('Upload analyse error:', err)
    const bericht = err.status === 529 || err.message?.includes('overloaded')
      ? 'De AI is momenteel druk bezet. Probeer het over een minuut opnieuw.'
      : 'Analyse mislukt: ' + err.message
    return cors({ error: bericht }, err.status === 529 ? 503 : 500)
  }
}
