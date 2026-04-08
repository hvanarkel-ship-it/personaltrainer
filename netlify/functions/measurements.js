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
      const params = event.queryStringParameters || {}
      const limit = Math.min(parseInt(params.limit) || 30, 100)
      const offset = parseInt(params.offset) || 0

      const rows = await sql`
        SELECT * FROM measurements
        WHERE user_id = ${userId}
        ORDER BY datum DESC, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
      return cors(rows)
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}')
      const {
        datum, gewicht_kg, vetpercentage, spiermassa_kg, vetmassa_kg, bmr, bmi,
        viscerale_vet_score, lichaamsvocht_procent, botmassa_kg, metabolische_leeftijd,
        buikomvang_cm, heupomvang_cm, borstomvang_cm,
        bovenbeen_links_cm, bovenbeen_rechts_cm, bovenarm_links_cm, bovenarm_rechts_cm,
        notities
      } = data

      const [row] = await sql`
        INSERT INTO measurements (
          user_id, datum, gewicht_kg, vetpercentage, spiermassa_kg, vetmassa_kg, bmr, bmi,
          viscerale_vet_score, lichaamsvocht_procent, botmassa_kg, metabolische_leeftijd,
          buikomvang_cm, heupomvang_cm, borstomvang_cm,
          bovenbeen_links_cm, bovenbeen_rechts_cm, bovenarm_links_cm, bovenarm_rechts_cm,
          notities
        ) VALUES (
          ${userId}, ${datum || 'NOW()'}, ${gewicht_kg || null}, ${vetpercentage || null},
          ${spiermassa_kg || null}, ${vetmassa_kg || null}, ${bmr || null}, ${bmi || null},
          ${viscerale_vet_score || null}, ${lichaamsvocht_procent || null}, ${botmassa_kg || null},
          ${metabolische_leeftijd || null}, ${buikomvang_cm || null}, ${heupomvang_cm || null},
          ${borstomvang_cm || null}, ${bovenbeen_links_cm || null}, ${bovenbeen_rechts_cm || null},
          ${bovenarm_links_cm || null}, ${bovenarm_rechts_cm || null}, ${notities || null}
        )
        RETURNING *
      `
      return cors(row, 201)
    }

    if (event.httpMethod === 'DELETE' && id && id !== 'measurements') {
      await sql`DELETE FROM measurements WHERE id = ${id} AND user_id = ${userId}`
      return cors({ success: true })
    }

    return cors({ error: 'Methode niet toegestaan' }, 405)
  } catch (err) {
    console.error('Measurements error:', err)
    return cors({ error: 'Fout bij metingen' }, 500)
  }
}
