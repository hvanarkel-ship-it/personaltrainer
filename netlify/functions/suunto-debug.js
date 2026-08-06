import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'
import { getValidToken, suuntoHeaders, SUUNTO_API_BASE } from './_suunto.js'
import { suuntoSport, suuntoActivityTitle, sportUitNaam } from './_sports.js'

// Test de Suunto 247samples API (sleep, activity, recovery)
// Vereist SUUNTO_SUBSCRIPTION_KEY in env vars
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'GET') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId

  try {
    const accessToken = await getValidToken(sql, userId)
    const to = Date.now()
    const from = to - 14 * 86400_000 // laatste 14 dagen

    const endpoints = [
      `/247samples/sleep?from=${from}&to=${to}`,
      `/247samples/activity?from=${from}&to=${to}`,
      `/247samples/recovery?from=${from}&to=${to}`,
      `/247samples/daily-activity-statistics?startdate=${new Date(from).toISOString()}&enddate=${new Date(to).toISOString()}`,
    ]

    const heeftKey = !!process.env.SUUNTO_SUBSCRIPTION_KEY
    const results = []
    for (const path of endpoints) {
      const url = `${SUUNTO_API_BASE}${path}`
      try {
        const res = await fetch(url, { headers: suuntoHeaders(accessToken) })
        const txt = await res.text()
        let body
        try { body = JSON.parse(txt) } catch { body = txt.slice(0, 200) }
        results.push({
          path,
          status: res.status,
          ok: res.ok,
          preview: typeof body === 'string' ? body : JSON.stringify(body).slice(0, 800),
        })
      } catch (err) {
        results.push({ path, error: err.message })
      }
    }

    // Specifieke samenvatting van de daily-activity-statistics metrieken
    let dagstatsMetrieken = null
    try {
      const url = `${SUUNTO_API_BASE}/247samples/daily-activity-statistics?startdate=${new Date(from).toISOString()}&enddate=${new Date(to).toISOString()}`
      const arr = await fetch(url, { headers: suuntoHeaders(accessToken) }).then(r => r.json())
      if (Array.isArray(arr)) {
        dagstatsMetrieken = arr.map(m => {
          const samples = m?.Sources?.[0]?.Samples || []
          return {
            naam: m?.Name,
            aggregatie: m?.Aggregation,
            aantal_samples: samples.length,
            eerste: samples[0] || null,
            laatste: samples[samples.length - 1] || null,
          }
        })
      }
    } catch (e) { dagstatsMetrieken = [{ error: e.message }] }

    // Wat staat er ná de sync daadwerkelijk in de database? (verificatie-lus)
    let opgeslagen = []
    try {
      opgeslagen = await sql`
        SELECT datum, stappen, kcal_actief, rust_hartslag, min_hartslag_dag,
               hrv_ochtend, hrv_laatste, slaap_uur, herstel_balans, stress_pct, updated_at
        FROM dagelijkse_wellness
        WHERE user_id = ${userId}
        ORDER BY datum DESC LIMIT 7
      `
    } catch (e) { opgeslagen = [{ error: e.message }] }

    let laatsteSync = null
    try {
      const [p] = await sql`SELECT suunto_laatste_sync FROM user_profile WHERE user_id = ${userId}`
      laatsteSync = p?.suunto_laatste_sync ?? null
    } catch { /* kolom bestaat mogelijk nog niet */ }

    // Ruwe workouts: welke activityId/activityName levert Suunto, en wat maken wij ervan?
    let workouts = null
    try {
      const wUrl = `${SUUNTO_API_BASE}/v2/workouts?since=${to - 30 * 86400_000}&limit=15`
      const wData = await fetch(wUrl, { headers: suuntoHeaders(accessToken) }).then(r => r.json())
      const lijst = Array.isArray(wData?.payload) ? wData.payload : Array.isArray(wData) ? wData : (wData?.workouts || [])
      workouts = lijst.slice(0, 15).map(w => {
        const naam = w.activityName || w.activityType || w.workoutName || null
        const start = parseInt(w.startTime, 10)
        const offset = parseInt(w.timeOffsetInMinutes, 10) || 0
        const datum = start ? new Date(start + offset * 60000).toISOString().slice(0, 10) : null
        const sec = parseFloat(w.totalTime) || 0
        const distM = parseFloat(w.totalDistance) || 0
        return {
          datum,
          duur_min: sec > 0 ? Math.round(sec / 60) : null,
          km: distM > 0 ? Math.round(distM / 100) / 10 : null,
          activityId: w.activityId,
          activityName: naam,
          onze_sport: sportUitNaam(naam) || suuntoSport(parseInt(w.activityId, 10)),
        }
      })
    } catch (e) { workouts = [{ error: e.message }] }

    return cors({
      heeftSubscriptionKey: heeftKey,
      hint: heeftKey ? null : 'SUUNTO_SUBSCRIPTION_KEY niet ingesteld in Netlify — 247 API vereist deze',
      laatste_sync: laatsteSync,
      dagstats_metrieken: dagstatsMetrieken,
      workouts,
      opgeslagen_in_db: opgeslagen,
      results,
    })
  } catch (err) {
    return cors({ error: err.message }, 500)
  }
}
