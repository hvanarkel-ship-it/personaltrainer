import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'
import { getValidToken, suuntoHeaders, SUUNTO_API_BASE } from './_suunto.js'
import { suuntoSport, sportUitNaam } from './_sports.js'

// Diagnose voor de Suunto-koppeling.
// Gezondheidsdata (24/7) komt via webhooks (zie suunto-webhook.js); workouts via pull.
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
    const heeftKey = !!process.env.SUUNTO_SUBSCRIPTION_KEY

    // Koppelingsstatus (o.a. of de webhook je kan koppelen via suunto_username)
    let laatsteSync = null
    let suuntoUsername = null
    try {
      const [p] = await sql`SELECT suunto_laatste_sync, suunto_username FROM user_profile WHERE user_id = ${userId}`
      laatsteSync = p?.suunto_laatste_sync ?? null
      suuntoUsername = p?.suunto_username ?? null
    } catch { /* kolom bestaat mogelijk nog niet */ }

    // Wat staat er in de database (gezondheidsdata via webhooks)? Verificatie-lus.
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
      hint: heeftKey ? null : 'SUUNTO_SUBSCRIPTION_KEY niet ingesteld in Netlify',
      webhook_klaar: !!suuntoUsername,
      suunto_username: suuntoUsername,
      gezondheidsdata_bron: 'webhook (24/7 push-API)',
      laatste_sync: laatsteSync,
      workouts,
      opgeslagen_in_db: opgeslagen,
    })
  } catch (err) {
    return cors({ error: err.message }, 500)
  }
}
