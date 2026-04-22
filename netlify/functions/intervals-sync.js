import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

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

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId

  try {
    const [profiel] = await sql`
      SELECT intervals_athlete_id, intervals_api_key FROM user_profile WHERE user_id = ${userId}
    `
    if (!profiel?.intervals_athlete_id || !profiel?.intervals_api_key) {
      return cors({ error: 'Intervals.icu niet gekoppeld' }, 400)
    }

    const { intervals_athlete_id: athleteId, intervals_api_key: apiKey } = profiel
    const authHeader = 'Basic ' + Buffer.from(`API_KEY:${apiKey}`).toString('base64')
    const oldest = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
    const newest = new Date().toISOString().split('T')[0]
    const headers = { Authorization: authHeader, Accept: 'application/json' }

    const [activitiesRes, wellnessRes] = await Promise.all([
      fetch(`https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${oldest}&newest=${newest}`, { headers }),
      fetch(`https://intervals.icu/api/v1/athlete/${athleteId}/wellness?oldest=${oldest}&newest=${newest}`, { headers }),
    ])

    let gesynchroniseerd = 0
    let overgeslagen = 0
    let wellness_synced = 0

    // ── Activiteiten ─────────────────────────────────────────────────────────
    if (activitiesRes.ok) {
      const activities = await activitiesRes.json()
      for (const act of activities) {
        const datum = act.start_date_local?.split('T')[0]
        if (!datum || !act.id) continue

        const intervalsId = String(act.id)
        const [existing] = await sql`
          SELECT id FROM trainingen WHERE user_id = ${userId} AND intervals_id = ${intervalsId} LIMIT 1
        `
        if (existing) { overgeslagen++; continue }

        const naamLower = (act.name || '').toLowerCase()
        const sport = /hyrox|hyro x/.test(naamLower)
          ? 'hyrox'
          : (SPORT_MAP[act.type] || act.type?.toLowerCase() || 'overig')

        const duur_min = act.moving_time ? Math.round(act.moving_time / 60) : null
        const kcal = act.calories > 0 ? Math.round(act.calories) : null
        const gem_hr = act.average_hr ? Math.round(act.average_hr) : null
        const max_hr = act.max_hr ? Math.round(act.max_hr) : null
        const afstand_m = act.distance ? Math.round(act.distance) : null
        const hoogte_m = act.total_elevation_gain ? Math.round(act.total_elevation_gain) : null

        const notitiesDelen = [act.name || sport]
        if (afstand_m > 0) notitiesDelen.push(`${(afstand_m / 1000).toFixed(1)}km`)
        if (hoogte_m > 0) notitiesDelen.push(`↑${hoogte_m}m`)
        notitiesDelen.push(`[intervals:${act.id}]`)

        await sql`
          INSERT INTO trainingen
            (user_id, datum, sport, duur_min, kcal, gem_hartslag, max_hartslag,
             notities, bron, intervals_id)
          VALUES
            (${userId}, ${datum}, ${sport}, ${duur_min}, ${kcal}, ${gem_hr}, ${max_hr},
             ${notitiesDelen.join(' — ')}, 'intervals', ${intervalsId})
        `
        gesynchroniseerd++
      }
    }

    // ── Wellness (HRV, slaap, form) ──────────────────────────────────────────
    if (wellnessRes.ok) {
      const wellness = await wellnessRes.json()
      for (const w of wellness) {
        if (!w.id) continue

        const hrv = w.hrv ?? w.hrvSdnn ?? null
        const slaap_uur = w.sleepSecs > 0 ? Math.round(w.sleepSecs / 360) / 10 : null
        const slaapscore = w.sleepScore ?? null
        const herstelbalans = w.form ?? null  // TSB: positief = fris, negatief = vermoeid
        const rusthartsslag = w.restingHR ?? null

        if (!hrv && !slaap_uur) continue

        const [existing] = await sql`
          SELECT id FROM trainingen
          WHERE user_id = ${userId} AND datum = ${w.id} AND sport = 'herstel' AND bron = 'intervals'
          LIMIT 1
        `
        if (existing) continue

        await sql`
          INSERT INTO trainingen
            (user_id, datum, sport, hrv_ochtend, slaap_uur, slaapscore,
             herstelbalans, gem_hartslag, notities, bron)
          VALUES
            (${userId}, ${w.id}, 'herstel', ${hrv}, ${slaap_uur}, ${slaapscore},
             ${herstelbalans}, ${rusthartsslag},
             ${`Intervals.icu wellness — TSB: ${herstelbalans ?? '–'}`},
             'intervals')
        `
        wellness_synced++
      }
    }

    return cors({ success: true, gesynchroniseerd, overgeslagen, wellness: wellness_synced })
  } catch (err) {
    console.error('Intervals sync error:', err)
    return cors({ error: 'Sync fout: ' + err.message }, 500)
  }
}
