import { getDb } from './_db.js'

// Runs daily at 06:00 UTC — syncs Intervals.icu wellness (HRV, sleep) for all users
export const config = { schedule: '0 6 * * *' }

const SPORT_MAP = {
  Run: 'hardlopen', VirtualRun: 'hardlopen', TrailRun: 'hardlopen',
  Ride: 'fietsen', VirtualRide: 'fietsen', GravelRide: 'fietsen',
  EBikeRide: 'fietsen', MountainBikeRide: 'fietsen', EMountainBikeRide: 'fietsen',
  WeightTraining: 'fitness', Workout: 'fitness', Crossfit: 'fitness',
  Elliptical: 'fitness', StairStepper: 'fitness',
  Tennis: 'tennis', Padel: 'padel', Squash: 'padel', TableTennis: 'tennis',
  Walk: 'wandelen', Hike: 'wandelen',
  Swim: 'zwemmen', Rowing: 'zwemmen', VirtualRow: 'zwemmen', Kayaking: 'zwemmen',
  Yoga: 'yoga', Pilates: 'yoga',
  Soccer: 'voetbal', Football: 'voetbal',
  AlpineSki: 'overig', NordicSki: 'overig', Snowboard: 'overig',
  RockClimbing: 'overig', IceSkate: 'overig', InlineSkate: 'overig',
}

function toArray(data) {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const val = data.activities ?? data.wellness ?? data.data ?? data.items ?? null
    if (Array.isArray(val)) return val
  }
  return []
}

async function fetchWithTimeout(url, options, ms = 25000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

async function syncUser(sql, userId, athleteId, apiKey) {
  const authHeader = 'Basic ' + Buffer.from(`API_KEY:${apiKey}`).toString('base64')
  const headers = { Authorization: authHeader, Accept: 'application/json' }

  // Only sync the last 30 days to stay within timeout budget
  const oldest = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const newest = new Date().toISOString().split('T')[0]

  const result = { wellness: 0, activities: 0 }

  // ── Wellness (HRV, slaap, herstelbalans) ─────────────────────────────────
  const wellnessRes = await fetchWithTimeout(
    `https://intervals.icu/api/v1/athlete/${athleteId}/wellness?oldest=${oldest}&newest=${newest}`,
    { headers }
  )

  if (wellnessRes.ok) {
    const raw = await wellnessRes.json()
    const wellness = toArray(raw)

    const bestaand = await sql`
      SELECT datum::text FROM trainingen
      WHERE user_id = ${userId} AND sport = 'herstel' AND bron = 'intervals'
        AND datum >= ${oldest}
    `
    const bestaandeDagen = new Set(bestaand.map(r => String(r.datum).slice(0, 10)))

    const nieuw = []
    for (const w of wellness) {
      if (!w.id) continue
      const datum = String(w.id).slice(0, 10)
      if (bestaandeDagen.has(datum)) continue

      const hrv = w.hrv ?? w.hrvSdnn ?? null
      const slaap_uur = w.sleepSecs > 0 ? Math.round(w.sleepSecs / 360) / 10 : null
      const slaapscore = w.sleepScore ?? null
      const herstelbalans = w.form ?? null
      const rusthartsslag = w.restingHR ?? null

      if (!hrv && !slaap_uur) continue

      nieuw.push({
        user_id: userId, datum, sport: 'herstel',
        hrv_ochtend: hrv, slaap_uur, slaapscore, herstelbalans,
        gem_hartslag: rusthartsslag,
        notities: `Intervals.icu wellness — TSB: ${herstelbalans ?? '–'}`,
        bron: 'intervals',
      })
    }

    if (nieuw.length > 0) {
      await sql`
        INSERT INTO trainingen
          (user_id, datum, sport, hrv_ochtend, slaap_uur, slaapscore, herstelbalans, gem_hartslag, notities, bron)
        VALUES ${sql(nieuw, 'user_id', 'datum', 'sport', 'hrv_ochtend', 'slaap_uur', 'slaapscore', 'herstelbalans', 'gem_hartslag', 'notities', 'bron')}
      `
      result.wellness = nieuw.length
    }
  } else {
    result.wellness_error = wellnessRes.status
  }

  // ── Activiteiten ─────────────────────────────────────────────────────────
  const activitiesRes = await fetchWithTimeout(
    `https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${oldest}&newest=${newest}`,
    { headers }
  )

  if (activitiesRes.ok) {
    const raw = await activitiesRes.json()
    const activities = toArray(raw)

    const bestaand = await sql`
      SELECT intervals_id FROM trainingen
      WHERE user_id = ${userId} AND intervals_id IS NOT NULL AND datum >= ${oldest}
    `
    const bestaandeIds = new Set(bestaand.map(r => String(r.intervals_id)))

    const nieuw = []
    for (const act of activities) {
      const datum = (act.start_date_local ?? act.start_date ?? '')?.split('T')[0]
      if (!datum || !act.id) continue
      const intervalsId = String(act.id)
      if (bestaandeIds.has(intervalsId)) continue

      const naamLower = (act.name || '').toLowerCase()
      const sport = /hyrox|hyro x/.test(naamLower)
        ? 'hyrox'
        : (SPORT_MAP[act.type] || act.type?.toLowerCase() || 'overig')

      const duur_min = act.moving_time ? Math.round(act.moving_time / 60) : null
      const kcal = act.calories > 0 ? Math.round(act.calories) : null
      const gem_hr = (act.average_hr ?? act.average_heartrate) ? Math.round(act.average_hr ?? act.average_heartrate) : null
      const max_hr = (act.max_hr ?? act.max_heartrate) ? Math.round(act.max_hr ?? act.max_heartrate) : null
      const afstand_m = act.distance ? Math.round(act.distance) : null
      const hoogte_m = act.total_elevation_gain ? Math.round(act.total_elevation_gain) : null

      const notitiesDelen = [act.name || sport]
      if (afstand_m > 0) notitiesDelen.push(`${(afstand_m / 1000).toFixed(1)}km`)
      if (hoogte_m > 0) notitiesDelen.push(`↑${hoogte_m}m`)
      notitiesDelen.push(`[intervals:${act.id}]`)

      nieuw.push({
        user_id: userId, datum, sport, duur_min, kcal,
        gem_hartslag: gem_hr, max_hartslag: max_hr,
        notities: notitiesDelen.join(' — '),
        bron: 'intervals',
        intervals_id: intervalsId,
      })
    }

    if (nieuw.length > 0) {
      const BATCH = 200
      for (let i = 0; i < nieuw.length; i += BATCH) {
        const batch = nieuw.slice(i, i + BATCH)
        await sql`
          INSERT INTO trainingen
            (user_id, datum, sport, duur_min, kcal, gem_hartslag, max_hartslag, notities, bron, intervals_id)
          VALUES ${sql(batch, 'user_id', 'datum', 'sport', 'duur_min', 'kcal', 'gem_hartslag', 'max_hartslag', 'notities', 'bron', 'intervals_id')}
        `
      }
      result.activities = nieuw.length
    }
  } else {
    result.activities_error = activitiesRes.status
  }

  return result
}

export const handler = async () => {
  const sql = getDb()
  const date = new Date().toISOString()
  console.log(`[auto-sync] Starting at ${date}`)

  try {
    const gebruikers = await sql`
      SELECT user_id, intervals_athlete_id, intervals_api_key
      FROM user_profile
      WHERE intervals_athlete_id IS NOT NULL AND intervals_api_key IS NOT NULL
    `

    console.log(`[auto-sync] Syncing ${gebruikers.length} users`)

    const resultaten = []
    for (const u of gebruikers) {
      try {
        const r = await syncUser(sql, u.user_id, u.intervals_athlete_id, u.intervals_api_key)
        resultaten.push({ user_id: u.user_id, ...r })
        console.log(`[auto-sync] user ${u.user_id}: wellness=${r.wellness} activities=${r.activities}`)
      } catch (err) {
        console.error(`[auto-sync] user ${u.user_id} failed:`, err.message)
        resultaten.push({ user_id: u.user_id, error: err.message })
      }
    }

    console.log('[auto-sync] Done:', JSON.stringify(resultaten))
  } catch (err) {
    console.error('[auto-sync] Fatal error:', err)
  }
}
