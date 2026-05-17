import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

// GET /api/wellness?dagen=30
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'GET') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId
  const dagen = Math.min(parseInt(event.queryStringParameters?.dagen, 10) || 30, 90)

  try {
    // Tabel kan nog niet bestaan als migratie niet gedraaid is en geen sync gedaan
    const rows = await sql`
      SELECT datum, slaap_uur, slaap_score, diepe_slaap_min, rem_slaap_min, lichte_slaap_min,
             hrv_ochtend, herstel_balans, stress_pct, rust_hartslag, stappen, kcal_actief, bron
      FROM dagelijkse_wellness
      WHERE user_id = ${userId}
        AND datum >= CURRENT_DATE - ${dagen}::int
      ORDER BY datum DESC
    `.catch(() => [])
    return cors({ wellness: rows })
  } catch (err) {
    return cors({ error: err.message }, 500)
  }
}
