import Anthropic from '@anthropic-ai/sdk'
import { requireAuth, cors } from './_auth.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 })

// Schat macronutriënten uit een tekstbeschrijving van een maaltijd.
// Lichtgewicht (haiku) zodat de knop in het invoerscherm snel reageert.
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  try {
    const { beschrijving } = JSON.parse(event.body || '{}')
    if (!beschrijving || beschrijving.trim().length < 2) {
      return cors({ error: 'Geef een beschrijving van de maaltijd' }, 400)
    }

    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Schat de macronutriënten van deze voeding op basis van standaard portiegroottes. Reken genoemde porties, aantallen en hoeveelheden (bv. "2 eieren", "300g rijst") realistisch mee.
Kies een logisch maaltijd_type: ontbijt | lunch | diner | snack | pre-workout | post-workout.
Geef UITSLUITEND geldig JSON, geen extra tekst:
{"beschrijving":"opgeschoonde naam","maaltijd_type":"snack","kcal":0,"eiwit_g":0.0,"koolhydraten_g":0.0,"vetten_g":0.0,"ai_notities":"kort voedingsadvies in context van sport, NL, max 1 zin"}

Voeding: "${String(beschrijving).slice(0, 500)}"`
      }]
    })

    const raw = res.content[0].text.trim().replace(/```json\n?|\n?```/g, '').trim()
    let d
    try { d = JSON.parse(raw) }
    catch { return cors({ error: 'Kon de schatting niet verwerken, probeer het opnieuw' }, 502) }

    return cors({ data: d })
  } catch (err) {
    console.error('Voeding-schat error:', err)
    const bericht = (err.status === 529 || err.message?.includes('overloaded'))
      ? 'De AI is momenteel druk bezet. Probeer het over een minuut opnieuw.'
      : 'Schatting mislukt: ' + err.message
    return cors({ error: bericht }, err.status === 529 ? 503 : 500)
  }
}
