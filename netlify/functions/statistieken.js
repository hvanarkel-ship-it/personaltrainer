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
  const vandaagNL = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date())
  const vanaf = new Date(vandaagNL + 'T12:00:00Z')
  vanaf.setUTCDate(vanaf.getUTCDate() - dagen)
  const vanafDatum = vanaf.toISOString().split('T')[0]

  try {
    // Deduplicatie: bestaat er voor dezelfde dag/sport/duur-bucket zowel een
    // Suunto- als handmatig record, dan wint het Suunto-record (rijkere data)
    const activiteiten = await sql`
      WITH ranked AS (
        SELECT
          datum, sport, duur_min, kcal, gem_hartslag, max_hartslag,
          zone2_min, zone3_min, zone4_min, notities, bron,
          ROW_NUMBER() OVER (
            PARTITION BY datum::date, sport, ROUND(COALESCE(duur_min, 0)::numeric / 15)
            ORDER BY CASE WHEN bron = 'suunto' THEN 0 ELSE 1 END, created_at DESC
          ) AS rn
        FROM trainingen
        WHERE user_id = ${userId}
          AND sport != 'herstel'
          AND datum >= ${vanafDatum}
      )
      SELECT datum, sport, duur_min, kcal, gem_hartslag, max_hartslag,
        zone2_min, zone3_min, zone4_min, notities, bron
      FROM ranked WHERE rn = 1
      ORDER BY datum DESC
    `

    // Eén wellness-record per dag uit BEIDE bronnen: Suunto (dagelijkse_wellness)
    // heeft voorrang, handmatige logs (trainingen) vullen aan
    const wellness = await sql`
      SELECT DISTINCT ON (datum)
        datum, hrv_ochtend, slaap_uur, slaap_score, herstel_balans
      FROM (
        SELECT datum::date AS datum, hrv_ochtend, slaap_uur, slaap_score, herstel_balans, 0 AS prio
        FROM dagelijkse_wellness
        WHERE user_id = ${userId}
          AND (hrv_ochtend IS NOT NULL OR slaap_uur IS NOT NULL)
          AND datum >= CURRENT_DATE - INTERVAL '30 days'
        UNION ALL
        SELECT datum::date AS datum, hrv_ochtend, slaap_uur, slaap_score, herstel_balans, 1 AS prio
        FROM trainingen
        WHERE user_id = ${userId}
          AND (hrv_ochtend IS NOT NULL OR slaap_uur IS NOT NULL)
          AND datum >= CURRENT_DATE - INTERVAL '30 days'
      ) samen
      ORDER BY datum ASC, prio ASC, hrv_ochtend DESC NULLS LAST
    `.catch(() =>
      // dagelijkse_wellness bestaat nog niet (nooit Suunto gekoppeld) → alleen handmatig
      sql`
        SELECT DISTINCT ON (datum::date)
          datum, hrv_ochtend, slaap_uur, slaap_score, herstel_balans
        FROM trainingen
        WHERE user_id = ${userId}
          AND (hrv_ochtend IS NOT NULL OR slaap_uur IS NOT NULL)
          AND datum >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY datum::date ASC, hrv_ochtend DESC NULLS LAST
      `.catch(() => [])
    )

    return cors({ activiteiten, wellness })
  } catch (err) {
    console.error('Statistieken error:', err)
    return cors({ error: err.message }, 500)
  }
}
