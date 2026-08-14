import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'
import { garminGet } from './_garmin.js'

// Garmin activityType.typeKey → Nederlandse sportnaam
const SPORT_MAP = {
  running: 'hardlopen', treadmill_running: 'hardlopen', trail_running: 'hardlopen',
  indoor_running: 'hardlopen', track_running: 'hardlopen', virtual_run: 'hardlopen',
  cycling: 'fietsen', road_biking: 'fietsen', mountain_biking: 'fietsen',
  gravel_cycling: 'fietsen', indoor_cycling: 'fietsen', virtual_ride: 'fietsen',
  cyclocross: 'fietsen', e_bike_fitness: 'fietsen',
  lap_swimming: 'zwemmen', open_water_swimming: 'zwemmen', swimming: 'zwemmen',
  strength_training: 'fitness', indoor_cardio: 'fitness', fitness_equipment: 'fitness',
  hiit: 'fitness', cardio: 'fitness', elliptical: 'fitness', stair_climbing: 'fitness',
  walking: 'wandelen', hiking: 'wandelen', casual_walking: 'wandelen', speed_walking: 'wandelen',
  yoga: 'yoga', pilates: 'yoga', breathwork: 'yoga',
  tennis: 'tennis', table_tennis: 'tennis', padel: 'padel', platform_tennis: 'padel',
  soccer: 'voetbal', football: 'voetbal',
}

function mapSport(typeKey, naam) {
  const n = (naam || '').toLowerCase()
  if (/hyrox|hyro x/.test(n)) return 'hyrox'
  if (/padel/.test(n)) return 'padel'
  if (/tennis/.test(n)) return 'tennis'
  if (/voetbal|soccer|football/.test(n)) return 'voetbal'
  return SPORT_MAP[typeKey] || 'overig'
}

const iso = (d) => d.toISOString().split('T')[0]

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId

  try {
    const [profiel] = await sql`
      SELECT garmin_oauth_token, garmin_display_name FROM user_profile WHERE user_id = ${userId}
    `
    if (!profiel?.garmin_oauth_token) {
      return cors({ error: 'Garmin niet gekoppeld' }, 400)
    }

    let bundle
    try {
      bundle = typeof profiel.garmin_oauth_token === 'string'
        ? JSON.parse(profiel.garmin_oauth_token)
        : profiel.garmin_oauth_token
    } catch {
      return cors({ error: 'Garmin-sessie beschadigd — koppel opnieuw.' }, 400)
    }
    const displayName = profiel.garmin_display_name
    const ref = { bundle, veranderd: false }

    let gesynchroniseerd = 0
    let overgeslagen = 0
    let wellness_synced = 0
    const debug = {}

    // ── Activiteiten ─────────────────────────────────────────────────────────
    const bestaand = await sql`
      SELECT garmin_id FROM trainingen WHERE user_id = ${userId} AND garmin_id IS NOT NULL
    `
    const bestaandeIds = new Set(bestaand.map((r) => String(r.garmin_id)))

    let activities = []
    try {
      activities = (await garminGet(ref, '/activitylist-service/activities/search/activities?start=0&limit=100')) || []
    } catch (e) {
      debug.activities_error = e.message
    }
    debug.activities_received = activities.length

    const nieuweRijen = []
    for (const act of activities) {
      const id = String(act.activityId || '')
      if (!id) continue
      if (bestaandeIds.has(id)) { overgeslagen++; continue }

      const datum = (act.startTimeLocal || act.startTimeGMT || '').slice(0, 10)
      if (!datum) continue

      const sport = mapSport(act.activityType?.typeKey, act.activityName)
      const duur_min = act.duration ? Math.round(act.duration / 60) : null
      const kcal = act.calories > 0 ? Math.round(act.calories) : null
      const gem_hr = act.averageHR ? Math.round(act.averageHR) : null
      const max_hr = act.maxHR ? Math.round(act.maxHR) : null
      const afstand_m = act.distance ? Math.round(act.distance) : null
      const hoogte_m = act.elevationGain ? Math.round(act.elevationGain) : null

      const delen = [act.activityName || sport]
      if (afstand_m > 0) delen.push(`${(afstand_m / 1000).toFixed(1)}km`)
      if (hoogte_m > 0) delen.push(`↑${hoogte_m}m`)
      delen.push(`[garmin:${id}]`)

      nieuweRijen.push({
        user_id: userId, datum, sport, duur_min, kcal,
        gem_hartslag: gem_hr, max_hartslag: max_hr,
        notities: delen.join(' — '), bron: 'garmin', garmin_id: id,
      })
    }

    const BATCH = 200
    for (let i = 0; i < nieuweRijen.length; i += BATCH) {
      const batch = nieuweRijen.slice(i, i + BATCH)
      await sql`
        INSERT INTO trainingen
          (user_id, datum, sport, duur_min, kcal, gem_hartslag, max_hartslag, notities, bron, garmin_id)
        VALUES ${sql(batch, 'user_id', 'datum', 'sport', 'duur_min', 'kcal', 'gem_hartslag', 'max_hartslag', 'notities', 'bron', 'garmin_id')}
      `
      gesynchroniseerd += batch.length
    }

    // ── Wellness (laatste 14 dagen): HRV, slaap, Body Battery, rust-HR, stappen
    const DAGEN = 14
    const datums = Array.from({ length: DAGEN }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i); return iso(d)
    })

    const wellnessPerDag = await Promise.all(
      datums.map(async (datum) => {
        const uit = { datum, hrv: null, slaap_uur: null, slaapscore: null, herstel: null, rustHr: null, stappen: null }

        // HRV (heeft geen displayName nodig)
        try {
          const hrv = await garminGet(ref, `/hrv-service/hrv/${datum}`)
          uit.hrv = hrv?.hrvSummary?.lastNightAvg ?? hrv?.hrvSummary?.weeklyAvg ?? null
        } catch { /* geen HRV die dag */ }

        if (displayName) {
          // Dagsamenvatting: rusthartslag, stappen, Body Battery
          try {
            const s = await garminGet(ref, `/usersummary-service/usersummary/daily/${encodeURIComponent(displayName)}?calendarDate=${datum}`)
            uit.rustHr = s?.restingHeartRate ?? null
            uit.stappen = s?.totalSteps ?? null
            uit.herstel = s?.bodyBatteryHighestValue ?? s?.bodyBatteryMostRecentValue ?? null
          } catch { /* geen samenvatting */ }

          // Slaap
          try {
            const slp = await garminGet(ref, `/sleep-service/sleep/dailySleepData/${encodeURIComponent(displayName)}?date=${datum}&nonSleepBufferMinutes=60`)
            const dto = slp?.dailySleepDTO
            if (dto?.sleepTimeSeconds > 0) uit.slaap_uur = Math.round(dto.sleepTimeSeconds / 360) / 10
            uit.slaapscore = dto?.sleepScores?.overall?.value ?? null
          } catch { /* geen slaapdata */ }
        }
        return uit
      })
    )

    // dagelijkse_stats upsert
    const statsRijen = wellnessPerDag.filter(
      (w) => w.hrv || w.slaap_uur || w.herstel || w.rustHr || w.stappen
    )
    for (const w of statsRijen) {
      await sql`
        INSERT INTO dagelijkse_stats
          (user_id, datum, hrv_ms, slaap_uur, slaapscore, herstel_score, rusthartsslag, stappen, bron)
        VALUES (${userId}, ${w.datum}, ${w.hrv}, ${w.slaap_uur}, ${w.slaapscore},
                ${w.herstel}, ${w.rustHr}, ${w.stappen}, 'garmin')
        ON CONFLICT (user_id, datum) DO UPDATE SET
          hrv_ms = COALESCE(EXCLUDED.hrv_ms, dagelijkse_stats.hrv_ms),
          slaap_uur = COALESCE(EXCLUDED.slaap_uur, dagelijkse_stats.slaap_uur),
          slaapscore = COALESCE(EXCLUDED.slaapscore, dagelijkse_stats.slaapscore),
          herstel_score = COALESCE(EXCLUDED.herstel_score, dagelijkse_stats.herstel_score),
          rusthartsslag = COALESCE(EXCLUDED.rusthartsslag, dagelijkse_stats.rusthartsslag),
          stappen = COALESCE(EXCLUDED.stappen, dagelijkse_stats.stappen),
          bron = 'garmin'
      `
    }

    // Herstel-rijen in `trainingen` — voedt de gereedheidsring op het dashboard.
    // Body Battery (0–100) mapt op herstelbalans als percentage.
    const bestaandeHerstel = await sql`
      SELECT datum::text FROM trainingen
      WHERE user_id = ${userId} AND sport = 'herstel' AND bron = 'garmin'
    `
    const herstelDagen = new Set(bestaandeHerstel.map((r) => String(r.datum).slice(0, 10)))

    const herstelRijen = []
    for (const w of wellnessPerDag) {
      if (!w.hrv && !w.slaap_uur) continue
      if (herstelDagen.has(w.datum)) continue
      herstelRijen.push({
        user_id: userId, datum: w.datum, sport: 'herstel',
        hrv_ochtend: w.hrv, slaap_uur: w.slaap_uur, slaapscore: w.slaapscore,
        herstelbalans: w.herstel, gem_hartslag: w.rustHr,
        notities: `Garmin — Body Battery: ${w.herstel ?? '–'}${w.stappen ? ` | ${w.stappen} stappen` : ''}`,
        bron: 'garmin',
      })
    }
    for (let i = 0; i < herstelRijen.length; i += BATCH) {
      const batch = herstelRijen.slice(i, i + BATCH)
      await sql`
        INSERT INTO trainingen
          (user_id, datum, sport, hrv_ochtend, slaap_uur, slaapscore, herstelbalans, gem_hartslag, notities, bron)
        VALUES ${sql(batch, 'user_id', 'datum', 'sport', 'hrv_ochtend', 'slaap_uur', 'slaapscore', 'herstelbalans', 'gem_hartslag', 'notities', 'bron')}
      `
      wellness_synced += batch.length
    }
    debug.wellness_dagen = statsRijen.length

    // Ververste sessie + sync-tijd opslaan
    const tokenJson = JSON.stringify(ref.bundle)
    await sql`
      UPDATE user_profile
      SET garmin_oauth_token = ${tokenJson}, garmin_last_sync = NOW(), updated_at = NOW()
      WHERE user_id = ${userId}
    `

    return cors({ success: true, gesynchroniseerd, overgeslagen, wellness: wellness_synced, debug })
  } catch (err) {
    console.error('Garmin sync error:', err)
    return cors({ error: `Sync fout: ${err.message}` }, 500)
  }
}
