import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

const SPORT_MAP = {
  Run: 'hardlopen', Ride: 'fietsen', VirtualRide: 'fietsen', Swim: 'zwemmen',
  WeightTraining: 'fitness', Workout: 'fitness', Tennis: 'tennis', Padel: 'padel',
  Walk: 'wandelen', Yoga: 'yoga', Soccer: 'voetbal', Football: 'voetbal',
  Cycling: 'fietsen', Running: 'hardlopen'
}

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

    if (!profiel?.strava_access_token) {
      return cors({ error: 'Strava niet gekoppeld' }, 400)
    }

    let accessToken = profiel.strava_access_token

    // Refresh token if expired
    if (profiel.strava_token_expires_at < Math.floor(Date.now() / 1000)) {
      const res = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          refresh_token: profiel.strava_refresh_token,
          grant_type: 'refresh_token'
        })
      })
      const tokens = await res.json()
      if (!tokens.access_token) return cors({ error: 'Token vernieuwen mislukt' }, 500)
      accessToken = tokens.access_token
      await sql`
        UPDATE user_profile SET
          strava_access_token = ${tokens.access_token},
          strava_refresh_token = ${tokens.refresh_token},
          strava_token_expires_at = ${tokens.expires_at},
          updated_at = NOW()
        WHERE user_id = ${userId}
      `
    }

    const res = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=30&page=1', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const activities = await res.json()

    if (!Array.isArray(activities)) {
      return cors({ error: 'Strava API fout', detail: activities }, 500)
    }

    let gesynchroniseerd = 0
    for (const act of activities) {
      const sport = SPORT_MAP[act.sport_type] || act.sport_type?.toLowerCase() || 'overig'
      const datum = act.start_date_local?.split('T')[0]
      if (!datum) continue

      const duur_min = Math.round((act.moving_time || 0) / 60)
      const kcal = act.kilojoules ? Math.round(act.kilojoules / 4.184) : null
      const gem_hartslag = act.average_heartrate ? Math.round(act.average_heartrate) : null
      const max_hartslag = act.max_heartrate ? Math.round(act.max_heartrate) : null

      // Deduplicate by strava activity ID stored in notities or by checking date+sport+bron
      const [existing] = await sql`
        SELECT id FROM trainingen
        WHERE user_id = ${userId} AND bron = 'strava'
        AND notities LIKE ${`%[strava:${act.id}]%`}
        LIMIT 1
      `
      if (existing) continue

      const notities = `${act.name || sport}  [strava:${act.id}]`
      await sql`
        INSERT INTO trainingen (user_id, datum, sport, duur_min, kcal, gem_hartslag, max_hartslag, notities, bron)
        VALUES (${userId}, ${datum}, ${sport}, ${duur_min}, ${kcal}, ${gem_hartslag}, ${max_hartslag}, ${notities}, 'strava')
      `
      gesynchroniseerd++
    }

    return cors({ success: true, gesynchroniseerd, totaal: activities.length })
  } catch (err) {
    console.error('Strava sync error:', err)
    return cors({ error: 'Sync fout: ' + err.message }, 500)
  }
}
