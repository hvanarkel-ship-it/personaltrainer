import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

const SPORT_MAP = {
  Run: 'hardlopen', Ride: 'fietsen', VirtualRide: 'fietsen', Swim: 'zwemmen',
  WeightTraining: 'fitness', Workout: 'fitness', Tennis: 'tennis', Padel: 'padel',
  Walk: 'wandelen', Yoga: 'yoga', Soccer: 'voetbal', Football: 'voetbal',
  Cycling: 'fietsen', Running: 'hardlopen', TrailRun: 'hardlopen',
  MountainBikeRide: 'fietsen', GravelRide: 'fietsen', EBikeRide: 'fietsen',
}

async function haalZonesOp(activityId, accessToken) {
  try {
    const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}/zones`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) return null
    const zones = await res.json()
    const hrZone = Array.isArray(zones) ? zones.find(z => z.type === 'heartrate') : null
    if (!hrZone?.distribution_buckets) return null

    const buckets = hrZone.distribution_buckets
    // Strava zones: 0=rust, 1=actief herstel, 2=aerobic, 3=tempo, 4=drempel, 5=anaeroob
    return {
      zone2_min: buckets[2] ? Math.round(buckets[2].time / 60) : 0,
      zone3_min: buckets[3] ? Math.round(buckets[3].time / 60) : 0,
      zone4_min: (buckets[4] ? Math.round(buckets[4].time / 60) : 0)
               + (buckets[5] ? Math.round(buckets[5].time / 60) : 0),
    }
  } catch {
    return null
  }
}

async function vernieuwToken(sql, userId, profiel) {
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
  if (!tokens.access_token) throw new Error('Token vernieuwen mislukt')
  await sql`
    UPDATE user_profile SET
      strava_access_token = ${tokens.access_token},
      strava_refresh_token = ${tokens.refresh_token},
      strava_token_expires_at = ${tokens.expires_at},
      updated_at = NOW()
    WHERE user_id = ${userId}
  `
  return tokens.access_token
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
    if (!profiel?.strava_access_token) return cors({ error: 'Strava niet gekoppeld' }, 400)

    // Token verversen indien verlopen
    let accessToken = profiel.strava_access_token
    if (profiel.strava_token_expires_at < Math.floor(Date.now() / 1000)) {
      accessToken = await vernieuwToken(sql, userId, profiel)
    }

    // Eenmalige migratie: strava_id kolom toevoegen + bestaande records vullen
    await sql`ALTER TABLE trainingen ADD COLUMN IF NOT EXISTS strava_id BIGINT`
    await sql`
      UPDATE trainingen
      SET strava_id = SUBSTRING(notities FROM '\\[strava:([0-9]+)\\]')::BIGINT
      WHERE bron = 'strava' AND strava_id IS NULL AND notities LIKE '%[strava:%'
      AND SUBSTRING(notities FROM '\\[strava:([0-9]+)\\]') IS NOT NULL
    `

    // Laatste 30 activiteiten ophalen
    const res = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=30&page=1', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const activities = await res.json()
    if (!Array.isArray(activities)) return cors({ error: 'Strava API fout', detail: activities }, 500)

    let gesynchroniseerd = 0
    let overgeslagen = 0

    for (const act of activities) {
      const datum = act.start_date_local?.split('T')[0]
      if (!datum) continue

      // Deduplicatie: check op strava_id kolom (snel) + LIKE fallback voor oude records
      const [existing] = await sql`
        SELECT id FROM trainingen
        WHERE user_id = ${userId}
        AND (
          strava_id = ${act.id}
          OR (bron = 'strava' AND notities LIKE ${`%[strava:${act.id}]%`})
        )
        LIMIT 1
      `
      if (existing) { overgeslagen++; continue }

      const sport = SPORT_MAP[act.sport_type] || act.sport_type?.toLowerCase() || 'overig'

      // Duur: gebruik moving_time (actieve tijd), met elapsed_time als fallback
      const bewegingsTijd = act.moving_time || act.elapsed_time || 0
      const duur_min = bewegingsTijd > 0 ? Math.round(bewegingsTijd / 60) : null

      // Calorieën: Strava's eigen schatting (metabolisch) is accurater dan kJ/4.184 (mechanisch)
      const kcal = act.calories > 0
        ? Math.round(act.calories)
        : (act.kilojoules > 0 ? Math.round(act.kilojoules / 4.184) : null)

      const gem_hr    = act.average_heartrate ? Math.round(act.average_heartrate) : null
      const max_hr    = act.max_heartrate     ? Math.round(act.max_heartrate)     : null
      const afstand_m = act.distance          ? Math.round(act.distance)           : null
      const hoogte_m  = act.total_elevation_gain ? Math.round(act.total_elevation_gain) : null

      // Notities: naam + afstand + hoogte + strava ID
      const notitiesDelen = [act.name || sport]
      if (afstand_m && afstand_m > 0) notitiesDelen.push(`${(afstand_m / 1000).toFixed(1)}km`)
      if (hoogte_m  && hoogte_m > 0)  notitiesDelen.push(`↑${hoogte_m}m`)
      notitiesDelen.push(`[strava:${act.id}]`)
      const notities = notitiesDelen.join(' — ')

      // Hartslagzones ophalen voor activiteiten met HR data (max 10 zone-calls per sync)
      let zones = null
      if (gem_hr && gesynchroniseerd < 10) {
        zones = await haalZonesOp(act.id, accessToken)
      }

      await sql`
        INSERT INTO trainingen
          (user_id, datum, sport, duur_min, kcal, gem_hartslag, max_hartslag,
           zone2_min, zone3_min, zone4_min, notities, bron, strava_id)
        VALUES
          (${userId}, ${datum}, ${sport}, ${duur_min}, ${kcal}, ${gem_hr}, ${max_hr},
           ${zones?.zone2_min ?? null}, ${zones?.zone3_min ?? null}, ${zones?.zone4_min ?? null},
           ${notities}, 'strava', ${act.id})
      `
      gesynchroniseerd++
    }

    return cors({
      success: true,
      gesynchroniseerd,
      overgeslagen,
      totaal: activities.length
    })
  } catch (err) {
    console.error('Strava sync error:', err)
    return cors({ error: 'Sync fout: ' + err.message }, 500)
  }
}
