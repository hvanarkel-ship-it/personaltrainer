import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId

  try {
    const [profiel] = await sql`
      SELECT wearables_user_id, wearables_device FROM user_profile WHERE user_id = ${userId}
    `
    if (!profiel?.wearables_user_id) return cors({ error: 'Open Wearables niet gekoppeld' }, 400)

    const wearablesUrl = process.env.WEARABLES_URL
    const apiKey = process.env.WEARABLES_API_KEY
    if (!wearablesUrl || !apiKey) return cors({ error: 'Open Wearables niet geconfigureerd' }, 500)

    const owUserId = profiel.wearables_user_id
    const headers = { 'X-Open-Wearables-API-Key': apiKey }

    // Fetch last 7 days
    const endDate = new Date().toISOString().split('T')[0]
    const startDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

    const [sleepRes, activityRes, bodyRes, connectionsRes] = await Promise.all([
      fetch(`${wearablesUrl}/api/v1/users/${owUserId}/summaries/sleep?start_date=${startDate}&end_date=${endDate}&limit=7&sort_order=desc`, { headers }),
      fetch(`${wearablesUrl}/api/v1/users/${owUserId}/summaries/activity?start_date=${startDate}&end_date=${endDate}&limit=7&sort_order=desc`, { headers }),
      fetch(`${wearablesUrl}/api/v1/users/${owUserId}/summaries/body`, { headers }),
      fetch(`${wearablesUrl}/api/v1/users/${owUserId}/connections`, { headers }),
    ])

    const [sleepData, activityData, bodyData] = await Promise.all([
      sleepRes.ok ? sleepRes.json() : null,
      activityRes.ok ? activityRes.json() : null,
      bodyRes.ok ? bodyRes.json() : null,
    ])

    // Update device name from first active connection
    if (connectionsRes.ok) {
      const connections = await connectionsRes.json()
      if (Array.isArray(connections) && connections.length > 0) {
        const device = connections[0].provider || connections[0].provider_name || null
        if (device) {
          await sql`UPDATE user_profile SET wearables_device = ${device}, updated_at = NOW() WHERE user_id = ${userId}`
        }
      }
    }

    await sql`
      CREATE TABLE IF NOT EXISTS dagelijkse_stats (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        datum DATE NOT NULL,
        hrv_ms INTEGER,
        slaap_uur NUMERIC(4,1),
        slaapscore INTEGER,
        herstel_score INTEGER,
        rusthartsslag INTEGER,
        stappen INTEGER,
        bron TEXT DEFAULT 'wearables',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, datum)
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS idx_dagelijkse_stats_user_datum ON dagelijkse_stats(user_id, datum DESC)`

    // Build lookup maps keyed by date
    const sleepByDate = {}
    for (const entry of sleepData?.items ?? sleepData?.data ?? []) {
      const date = entry.date || entry.day || entry.summary_date
      if (date) sleepByDate[date] = entry
    }

    const activityByDate = {}
    for (const entry of activityData?.items ?? activityData?.data ?? []) {
      const date = entry.date || entry.day || entry.summary_date
      if (date) activityByDate[date] = entry
    }

    // Body summary gives averaged HRV + resting HR (not per-day)
    const avgHrv = bodyData?.averaged?.hrv ?? bodyData?.hrv_rmssd_average ?? null
    const avgRhr = bodyData?.averaged?.resting_heart_rate ?? bodyData?.resting_heart_rate ?? null

    // Merge into dagelijkse_stats for each day
    const dates = new Set([...Object.keys(sleepByDate), ...Object.keys(activityByDate)])
    let gesynchroniseerd = 0

    for (const date of dates) {
      const sleep = sleepByDate[date] || {}
      const activity = activityByDate[date] || {}

      const slaap_uur = sleep.total_sleep_time_seconds
        ? Math.round((sleep.total_sleep_time_seconds / 3600) * 10) / 10
        : (sleep.sleep_duration_hours ?? sleep.total_sleep_hours ?? null)

      const slaapscore = sleep.sleep_score ?? sleep.score ?? null
      const stappen = activity.steps ?? activity.total_steps ?? null
      const hrv = sleep.average_hrv ?? sleep.hrv_rmssd ?? avgHrv ?? null
      const rhr = activity.resting_heart_rate ?? sleep.resting_heart_rate ?? avgRhr ?? null

      await sql`
        INSERT INTO dagelijkse_stats (user_id, datum, hrv_ms, slaap_uur, slaapscore, rusthartsslag, stappen, bron)
        VALUES (${userId}, ${date}, ${hrv}, ${slaap_uur}, ${slaapscore}, ${rhr}, ${stappen}, 'wearables')
        ON CONFLICT (user_id, datum) DO UPDATE SET
          hrv_ms       = COALESCE(EXCLUDED.hrv_ms,       dagelijkse_stats.hrv_ms),
          slaap_uur    = COALESCE(EXCLUDED.slaap_uur,    dagelijkse_stats.slaap_uur),
          slaapscore   = COALESCE(EXCLUDED.slaapscore,   dagelijkse_stats.slaapscore),
          rusthartsslag= COALESCE(EXCLUDED.rusthartsslag,dagelijkse_stats.rusthartsslag),
          stappen      = COALESCE(EXCLUDED.stappen,      dagelijkse_stats.stappen)
      `
      gesynchroniseerd++
    }

    return cors({ success: true, gesynchroniseerd, device: profiel.wearables_device })
  } catch (err) {
    console.error('Wearables sync error:', err)
    return cors({ error: 'Sync fout: ' + err.message }, 500)
  }
}
