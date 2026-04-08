import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response

  const sql = getDb()
  const userId = auth.user.userId
  const id = event.path.split('/').pop()

  try {
    if (event.httpMethod === 'GET') {
      const limit = Math.min(parseInt(event.queryStringParameters?.limit) || 20, 100)
      const rows = await sql`
        SELECT * FROM inbody_metingen WHERE user_id = ${userId}
        ORDER BY datum DESC, created_at DESC LIMIT ${limit}
      `
      return cors(rows)
    }

    if (event.httpMethod === 'POST') {
      const d = JSON.parse(event.body || '{}')
      const [row] = await sql`
        INSERT INTO inbody_metingen (user_id, datum, gewicht_kg, vetmassa_kg, vetpercentage,
          spiermassa_kg, visceraal_vet, bmr_kcal, vochtbalans_pct, inbody_score, bron, notities)
        VALUES (${userId}, ${d.datum||null}, ${d.gewicht_kg||null}, ${d.vetmassa_kg||null},
          ${d.vetpercentage||null}, ${d.spiermassa_kg||null}, ${d.visceraal_vet||null},
          ${d.bmr_kcal||null}, ${d.vochtbalans_pct||null}, ${d.inbody_score||null},
          ${d.bron||'handmatig'}, ${d.notities||null})
        RETURNING *
      `
      return cors(row, 201)
    }

    if (event.httpMethod === 'DELETE' && id !== 'inbody') {
      await sql`DELETE FROM inbody_metingen WHERE id = ${id} AND user_id = ${userId}`
      return cors({ success: true })
    }

    return cors({ error: 'Methode niet toegestaan' }, 405)
  } catch (err) {
    console.error('InBody error:', err)
    return cors({ error: 'Fout bij InBody: ' + err.message }, 500)
  }
}
