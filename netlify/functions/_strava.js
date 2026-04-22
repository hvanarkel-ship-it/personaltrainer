export const SPORT_MAP = {
  Run: 'hardlopen', Running: 'hardlopen', TrailRun: 'hardlopen', VirtualRun: 'hardlopen',
  Ride: 'fietsen', VirtualRide: 'fietsen', GravelRide: 'fietsen', EBikeRide: 'fietsen',
  MountainBikeRide: 'fietsen', EMountainBikeRide: 'fietsen', Cycling: 'fietsen',
  Velomobile: 'fietsen', RollerSki: 'wielrennen',
  WeightTraining: 'fitness', Workout: 'fitness', Crossfit: 'fitness',
  Elliptical: 'fitness', StairStepper: 'fitness',
  Tennis: 'tennis', Padel: 'padel', Squash: 'padel', BadmintonRacquet: 'padel',
  TableTennis: 'tennis', Pickleball: 'padel',
  Walk: 'wandelen', Hike: 'wandelen',
  Swim: 'zwemmen', Rowing: 'zwemmen', VirtualRow: 'zwemmen',
  Kayaking: 'zwemmen', Canoeing: 'zwemmen', StandUpPaddling: 'zwemmen',
  Surfing: 'zwemmen', Windsurf: 'zwemmen', Kitesurf: 'zwemmen',
  Yoga: 'yoga', Pilates: 'yoga',
  Soccer: 'voetbal', Football: 'voetbal',
  AlpineSki: 'overig', BackcountrySki: 'overig', NordicSki: 'overig',
  Snowboard: 'overig', Snowshoe: 'overig', Golf: 'overig',
  RockClimbing: 'overig', IceSkate: 'overig', InlineSkate: 'overig',
  Skateboard: 'overig', Sail: 'overig', Handcycle: 'overig', Wheelchair: 'overig',
}

export async function haalZonesOp(activityId, accessToken) {
  try {
    const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}/zones`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) return null
    const zones = await res.json()
    const hrZone = Array.isArray(zones) ? zones.find(z => z.type === 'heartrate') : null
    if (!hrZone?.distribution_buckets) return null
    const b = hrZone.distribution_buckets
    return {
      zone2_min: b[2] ? Math.round(b[2].time / 60) : 0,
      zone3_min: b[3] ? Math.round(b[3].time / 60) : 0,
      zone4_min: (b[4] ? Math.round(b[4].time / 60) : 0) + (b[5] ? Math.round(b[5].time / 60) : 0),
    }
  } catch {
    return null
  }
}

export async function vernieuwToken(sql, userId, profiel) {
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

export async function slaActiviteitOp(sql, userId, act, accessToken, haalZones = true) {
  const datum = act.start_date_local?.split('T')[0]
  if (!datum) return false

  const [existing] = await sql`
    SELECT id FROM trainingen
    WHERE user_id = ${userId}
    AND (
      strava_id = ${act.id}
      OR (bron = 'strava' AND notities LIKE ${`%[strava:${act.id}]%`})
    )
    LIMIT 1
  `
  if (existing) return false

  const naamLower = (act.name || '').toLowerCase()
  const sport = /hyrox|hyro x/.test(naamLower)
    ? 'hyrox'
    : (SPORT_MAP[act.sport_type] || act.sport_type?.toLowerCase() || 'overig')

  const bewegingsTijd = act.moving_time || act.elapsed_time || 0
  const duur_min = bewegingsTijd > 0 ? Math.round(bewegingsTijd / 60) : null
  const kcal = act.calories > 0
    ? Math.round(act.calories)
    : (act.kilojoules > 0 ? Math.round(act.kilojoules / 4.184) : null)
  const gem_hr    = act.average_heartrate ? Math.round(act.average_heartrate) : null
  const max_hr    = act.max_heartrate     ? Math.round(act.max_heartrate)     : null
  const afstand_m = act.distance          ? Math.round(act.distance)          : null
  const hoogte_m  = act.total_elevation_gain ? Math.round(act.total_elevation_gain) : null

  const notitiesDelen = [act.name || sport]
  if (afstand_m && afstand_m > 0) notitiesDelen.push(`${(afstand_m / 1000).toFixed(1)}km`)
  if (hoogte_m  && hoogte_m > 0)  notitiesDelen.push(`↑${hoogte_m}m`)
  notitiesDelen.push(`[strava:${act.id}]`)
  const notities = notitiesDelen.join(' — ')

  const zones = (haalZones && gem_hr) ? await haalZonesOp(act.id, accessToken) : null

  await sql`
    INSERT INTO trainingen
      (user_id, datum, sport, duur_min, kcal, gem_hartslag, max_hartslag,
       zone2_min, zone3_min, zone4_min, notities, bron, strava_id)
    VALUES
      (${userId}, ${datum}, ${sport}, ${duur_min}, ${kcal}, ${gem_hr}, ${max_hr},
       ${zones?.zone2_min ?? null}, ${zones?.zone3_min ?? null}, ${zones?.zone4_min ?? null},
       ${notities}, 'strava', ${act.id})
  `
  return true
}
