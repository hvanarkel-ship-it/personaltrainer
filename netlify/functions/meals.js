import Anthropic from '@anthropic-ai/sdk'
import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})

  const auth = requireAuth(event)
  if (auth.error) return auth.response

  const sql = getDb()
  const userId = auth.user.userId
  const pathParts = event.path.split('/')
  const lastPart = pathParts[pathParts.length - 1]

  try {
    // Foto analyse via AI
    if (event.httpMethod === 'POST' && lastPart === 'analyze') {
      const { foto_base64, omschrijving } = JSON.parse(event.body || '{}')

      const content = []
      if (foto_base64) {
        const [header, data] = foto_base64.split(',')
        const mediaType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg'
        content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } })
      }
      content.push({
        type: 'text',
        text: `Analyseer deze maaltijd${omschrijving ? ` (beschrijving: ${omschrijving})` : ''} en geef een schatting van de voedingswaarden. Geef je antwoord ALLEEN als JSON object met deze velden: kcal (integer), eiwitten_g (getal), koolhydraten_g (getal), vetten_g (getal), vezels_g (getal), suikers_g (getal), omschrijving (string in het Nederlands, beschrijf wat je ziet/wat er ingevoerd is), analyse (string, korte voedingsanalyse in het Nederlands). Geen extra tekst, alleen het JSON object.`
      })

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content }]
      })

      try {
        const jsonText = response.content[0].text.trim()
        const analysisData = JSON.parse(jsonText.replace(/```json\n?|\n?```/g, ''))
        return cors(analysisData)
      } catch {
        return cors({ error: 'Kon voedingswaarden niet analyseren' }, 500)
      }
    }

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {}
      const datum = params.datum
      const limit = Math.min(parseInt(params.limit) || 20, 100)

      let rows
      if (datum) {
        rows = await sql`
          SELECT * FROM meals WHERE user_id = ${userId} AND datum = ${datum}
          ORDER BY created_at ASC
        `
      } else {
        rows = await sql`
          SELECT * FROM meals WHERE user_id = ${userId}
          ORDER BY datum DESC, created_at DESC
          LIMIT ${limit}
        `
      }
      return cors(rows)
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}')
      const {
        datum, maaltijd_type, omschrijving, foto_url,
        kcal, eiwitten_g, koolhydraten_g, vetten_g, vezels_g, suikers_g,
        ai_analyse, handmatig_ingevoerd
      } = data

      if (!maaltijd_type) return cors({ error: 'Maaltijdtype is verplicht' }, 400)

      const [row] = await sql`
        INSERT INTO meals (
          user_id, datum, maaltijd_type, omschrijving, foto_url,
          kcal, eiwitten_g, koolhydraten_g, vetten_g, vezels_g, suikers_g,
          ai_analyse, handmatig_ingevoerd
        ) VALUES (
          ${userId}, ${datum || null}, ${maaltijd_type}, ${omschrijving || null},
          ${foto_url || null}, ${kcal || null}, ${eiwitten_g || null},
          ${koolhydraten_g || null}, ${vetten_g || null}, ${vezels_g || null},
          ${suikers_g || null}, ${ai_analyse || null}, ${handmatig_ingevoerd || false}
        )
        RETURNING *
      `
      return cors(row, 201)
    }

    if (event.httpMethod === 'DELETE' && lastPart !== 'meals') {
      await sql`DELETE FROM meals WHERE id = ${lastPart} AND user_id = ${userId}`
      return cors({ success: true })
    }

    return cors({ error: 'Methode niet toegestaan' }, 405)
  } catch (err) {
    console.error('Meals error:', err)
    return cors({ error: 'Fout bij maaltijden' }, 500)
  }
}
