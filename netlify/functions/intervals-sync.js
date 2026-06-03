import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'
import { intervalsSport } from './_sports.js'

function toArray(data) {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const val = data.activities ?? data.wellness ?? data.data ?? data.items ?? null
    if (Array.isArray(val)) return val
  }
  return []
}

async function fetchWithTimeout(url, options, timeoutMs = 20000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
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
    const oldest = '2015-01-01'
    const newest = new Date().toISOString().split('T')[0]
    const headers = { Authorization: authHeader, Accept: 'application/json' }

    let gesynchroniseerd = 0
    let overgeslagen = 0
    let wellness_synced = 0
    const debug = {}

    // Fetch activities and wellness in parallel, each with a 20s timeout
    const [activitiesRes, wellnessRes] = await Promise.all([
      fetchWithTimeout(
        `https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${oldest}&newest=${newest}`,
        { headers }
      ),
      fetchWithTimeout(
        `https://intervals.icu/api/v1/athlete/${athleteId}/wellness?oldest=${oldest}&newest=${newest}`,
        { headers }
      ),
    ])

    // Pre-fetch all existing intervals_ids in one query
    const bestaand = await sql`
      SELECT intervals_id FROM trainingen WHERE user_id = ${userId} AND intervals_id IS NOT NULL
    `
    const bestaandeIds = new Set(bestaand.map(r => String(r.intervals_id)))

    // ── Activiteiten ─────────────────────────────────────────────────────────
    if (activitiesRes.ok) {
      const raw = await activitiesRes.json()
      const activities = toArray(raw)
      debug.activities_received = activities.length
      if (activities.length > 0) console.log('Intervals activity sample:', JSON.stringify(activities[0]).slice(0, 300))

      const nieuweRijen = []
      for (const act of activities) {
        const datum = (act.start_date_local ?? act.start_date ?? '')?.split('T')[0]
        if (!datum || !act.id) continue

        const intervalsId = String(act.id)
        if (bestaandeIds.has(intervalsId)) { overgeslagen++; continue }

        const sport = intervalsSport(act.type, act.name)

        const duur_min = act.moving_time ? Math.round(act.moving_time / 60) : null
        const kcal = act.calories > 0 ? Math.round(act.calories) : null
        const gem_hr = (act.average_hr ?? act.average_heartrate) ? Math.round(act.average_hr ?? act.average_heartrate) : null
        const max_hr = (act.max_hr ?? act.max_heartrate) ? Math.round(act.max_hr ?? act.max_heartrate) : null
        const afstand_m = act.distance ? Math.round(act.distance) : null
        const km = afstand_m > 0 ? Math.round(afstand_m / 100) / 10 : null
        const hoogte_m = act.total_elevation_gain ? Math.round(act.total_elevation_gain) : null

        const notitiesDelen = [act.name || sport]
        if (km) notitiesDelen.push(`${km.toFixed(1)}km`)
        if (hoogte_m > 0) notitiesDelen.push(`↑${hoogte_m}m`)
        notitiesDelen.push(`[intervals:${act.id}]`)

        nieuweRijen.push({
          user_id: userId, datum, sport, duur_min, km, kcal,
          gem_hartslag: gem_hr, max_hartslag: max_hr,
          notities: notitiesDelen.join(' — '),
          bron: 'intervals',
          intervals_id: intervalsId,
        })
      }

      // Bulk insert in batches of 200
      const BATCH = 200
      for (let i = 0; i < nieuweRijen.length; i += BATCH) {
        const batch = nieuweRijen.slice(i, i + BATCH)
        const result = await sql`
          INSERT INTO trainingen
            (user_id, datum, sport, duur_min, km, kcal, gem_hartslag, max_hartslag, notities, bron, intervals_id)
          VALUES ${sql(batch, 'user_id', 'datum', 'sport', 'duur_min', 'km', 'kcal', 'gem_hartslag', 'max_hartslag', 'notities', 'bron', 'intervals_id')}
          ON CONFLICT (user_id, intervals_id) WHERE intervals_id IS NOT NULL DO NOTHING
          RETURNING id
        `
        gesynchroniseerd += result.length
      }
    } else {
      const errText = await activitiesRes.text()
      console.error('Intervals activities error:', activitiesRes.status, errText)
      debug.activities_error = `${activitiesRes.status}: ${errText.slice(0, 200)}`
    }

    // ── Wellness (HRV, slaap, form) ──────────────────────────────────────────
    if (wellnessRes.ok) {
      const raw = await wellnessRes.json()
      const wellness = toArray(raw)
      debug.wellness_received = wellness.length
      if (wellness.length > 0) console.log('Intervals wellness sample:', JSON.stringify(wellness[0]).slice(0, 300))

      const bestaandeWellness = await sql`
        SELECT datum::text FROM trainingen
        WHERE user_id = ${userId} AND sport = 'herstel' AND bron = 'intervals'
      `
      const bestaandeWellnessDagen = new Set(bestaandeWellness.map(r => String(r.datum).slice(0, 10)))

      const nieuweWellness = []
      for (const w of wellness) {
        if (!w.id) continue

        const hrv = w.hrv ?? w.hrvSdnn ?? null
        const slaap_uur = w.sleepSecs > 0 ? Math.round(w.sleepSecs / 360) / 10 : null
        const slaap_score = w.sleepScore ?? null
        const herstel_balans = w.form ?? null
        const rusthartsslag = w.restingHR ?? null

        if (!hrv && !slaap_uur) continue
        if (bestaandeWellnessDagen.has(String(w.id).slice(0, 10))) continue

        nieuweWellness.push({
          user_id: userId,
          datum: String(w.id).slice(0, 10),
          sport: 'herstel',
          hrv_ochtend: hrv,
          slaap_uur,
          slaap_score,
          herstel_balans,
          gem_hartslag: rusthartsslag,
          notities: `Intervals.icu wellness — TSB: ${herstel_balans ?? '–'}`,
          bron: 'intervals',
        })
      }

      const BATCH = 200
      for (let i = 0; i < nieuweWellness.length; i += BATCH) {
        const batch = nieuweWellness.slice(i, i + BATCH)
        await sql`
          INSERT INTO trainingen
            (user_id, datum, sport, hrv_ochtend, slaap_uur, slaap_score, herstel_balans, gem_hartslag, notities, bron)
          VALUES ${sql(batch, 'user_id', 'datum', 'sport', 'hrv_ochtend', 'slaap_uur', 'slaap_score', 'herstel_balans', 'gem_hartslag', 'notities', 'bron')}
        `
        wellness_synced += batch.length
      }
    } else {
      const errText = await wellnessRes.text()
      console.error('Intervals wellness error:', wellnessRes.status, errText)
      debug.wellness_error = `${wellnessRes.status}: ${errText.slice(0, 200)}`
    }

    return cors({ success: true, gesynchroniseerd, overgeslagen, wellness: wellness_synced, debug })
  } catch (err) {
    const cause = err.cause?.message ?? err.cause ?? ''
    console.error('Intervals sync error:', err)
    return cors({ error: `Sync fout: ${err.message}${cause ? ' (' + cause + ')' : ''}` }, 500)
  }
}
