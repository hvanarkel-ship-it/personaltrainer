import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'GET') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId
  const dagen = Math.min(1825, Math.max(28, parseInt(event.queryStringParameters?.dagen || '84')))
  const vanafDatum = new Date(Date.now() - dagen * 86400000).toISOString().split('T')[0]

  try {
    // Deduplication: if intervals + manual exist for same day/sport/duration-bucket, keep intervals record
    const activiteiten = await sql`
      WITH ranked AS (
        SELECT
          datum, sport, duur_min, kcal, gem_hartslag, max_hartslag,
          zone2_min, zone3_min, zone4_min, notities, bron, intervals_id,
          ROW_NUMBER() OVER (
            PARTITION BY datum::date, sport, ROUND(COALESCE(duur_min, 0)::numeric / 15)
            ORDER BY CASE WHEN intervals_id IS NOT NULL THEN 0 ELSE 1 END, created_at DESC
          ) AS rn
        FROM trainingen
        WHERE user_id = ${userId}
          AND sport != 'herstel'
          AND datum >= ${vanafDatum}
      )
      SELECT datum, sport, duur_min, kcal, gem_hartslag, max_hartslag,
        zone2_min, zone3_min, zone4_min, notities, bron, intervals_id
      FROM ranked WHERE rn = 1
      ORDER BY datum DESC
    `

    // One wellness record per day — prefer record with highest HRV when multiple exist
    const wellness = await sql`
      SELECT DISTINCT ON (datum::date)
        datum, hrv_ochtend, slaap_uur, slaap_score, herstel_balans
      FROM trainingen
      WHERE user_id = ${userId}
        AND (hrv_ochtend IS NOT NULL OR slaap_uur IS NOT NULL)
        AND datum >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY datum::date ASC, hrv_ochtend DESC NULLS LAST
    `

    return cors({ activiteiten, wellness })
  } catch (err) {
    console.error('Statistieken error:', err)
    return cors({ error: err.message }, 500)
  }
}
