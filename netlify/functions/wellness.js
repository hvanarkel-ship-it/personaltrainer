import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'
import { getValidToken, syncSuuntoWellnessForUser } from './_suunto.js'

// GET /api/wellness?dagen=30
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'GET') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId
  const dagen = Math.min(parseInt(event.queryStringParameters?.dagen, 10) || 30, 90)

  // Sync Suunto wellness before reading — same rate-limit as coach (max 1x per 5 min)
  try {
    const [laatste] = await sql`
      SELECT updated_at FROM dagelijkse_wellness
      WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 1
    `
    const ouderDan5Min = !laatste?.updated_at ||
      (Date.now() - new Date(laatste.updated_at).getTime()) > 5 * 60 * 1000
    if (ouderDan5Min) {
      const token = await getValidToken(sql, userId).catch(() => null)
      if (token) await syncSuuntoWellnessForUser(sql, userId, token, 2)
    }
  } catch { /* geen Suunto of sync mislukt — doorgaan met bestaande data */ }

  try {
    // Tabel kan nog niet bestaan als migratie niet gedraaid is en geen sync gedaan
    const rows = await sql`
      SELECT datum, slaap_uur, slaap_score, diepe_slaap_min, rem_slaap_min, lichte_slaap_min,
             hrv_ochtend, herstel_balans, stress_pct, rust_hartslag, min_hartslag_dag, stappen, kcal_actief, hulpbronnen_pct, bron
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
