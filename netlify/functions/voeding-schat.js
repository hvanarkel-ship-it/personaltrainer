import Anthropic from '@anthropic-ai/sdk'
import { requireAuth, cors } from './_auth.js'
import { schatInstructie, parseJson, verzoenMacros } from './_voeding.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 })

// Schat macronutriënten uit een tekstbeschrijving van een maaltijd.
// Sonnet + ingrediënt-gebaseerde uitsplitsing voor betrouwbare schattingen.
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
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      messages: [{
        role: 'user',
        content: `${schatInstructie()}\n\nVoeding: "${String(beschrijving).slice(0, 600)}"`,
      }],
    })

    const d = parseJson(res.content[0].text)
    if (!d) return cors({ error: 'Kon de schatting niet verwerken, probeer het opnieuw' }, 502)

    return cors({ data: verzoenMacros(d) })
  } catch (err) {
    console.error('Voeding-schat error:', err)
    const bericht = (err.status === 529 || err.message?.includes('overloaded'))
      ? 'De AI is momenteel druk bezet. Probeer het over een minuut opnieuw.'
      : 'Schatting mislukt: ' + err.message
    return cors({ error: bericht }, err.status === 529 ? 503 : 500)
  }
}
