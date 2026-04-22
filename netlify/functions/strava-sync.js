import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'
import { vernieuwToken, slaActiviteitOp } from './_strava.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId

  try {
    const [profiel] = await sql`
      SELECT strava_access_token, strava_refresh_token, strava_token_expires_at
      FROM user_profile WHERE user_id = ${userId}
    `
    if (!profiel?.strava_access_token) return cors({ error: 'Strava niet gekoppeld' }, 400)

    let accessToken = profiel.strava_access_token
    if (profiel.strava_token_expires_at < Math.floor(Date.now() / 1000)) {
      accessToken = await vernieuwToken(sql, userId, profiel)
    }

    // Eenmalige migraties
    await sql`ALTER TABLE trainingen ADD COLUMN IF NOT EXISTS strava_id BIGINT`
    await sql`
      UPDATE trainingen
      SET strava_id = SUBSTRING(notities FROM '\\[strava:([0-9]+)\\]')::BIGINT
      WHERE bron = 'strava' AND strava_id IS NULL AND notities LIKE '%[strava:%'
      AND SUBSTRING(notities FROM '\\[strava:([0-9]+)\\]') IS NOT NULL
    `
    await sql`
      UPDATE trainingen
      SET duur_min = ROUND(duur_min::numeric / 60)::int
      WHERE user_id = ${userId} AND bron = 'strava'
      AND duur_min > 720
      AND ROUND(duur_min::numeric / 60)::int <= 720
    `

    const res = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=30&page=1', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const activities = await res.json()
    if (!Array.isArray(activities)) return cors({ error: 'Strava API fout', detail: activities }, 500)

    let gesynchroniseerd = 0
    let overgeslagen = 0

    for (const act of activities) {
      // Limit zone fetches to first 10 new activities
      const ingevoegd = await slaActiviteitOp(sql, userId, act, accessToken, gesynchroniseerd < 10)
      if (ingevoegd) gesynchroniseerd++
      else overgeslagen++
    }

    return cors({ success: true, gesynchroniseerd, overgeslagen, totaal: activities.length })
  } catch (err) {
    console.error('Strava sync error:', err)
    return cors({ error: 'Sync fout: ' + err.message }, 500)
  }
}
