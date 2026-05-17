import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'
import { getValidToken, suuntoHeaders, SUUNTO_API_BASE } from './_suunto.js'

// Debug endpoint: probeert meerdere Suunto endpoints om te zien wat beschikbaar is
// Gebruik: GET /api/suunto-debug
//          GET /api/suunto-debug?path=/v2/sleep  → enkel endpoint testen
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'GET') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId

  try {
    const accessToken = await getValidToken(sql, userId)
    const single = event.queryStringParameters?.path
    const sinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000

    // Probeer de "24/7 API" — bekend uit Suunto API portal
    // (new-247-api / daily-activity-samples)
    const today = new Date().toISOString().slice(0, 10)
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)
    const endpoints = single ? [single] : [
      // 24/7 API variaties
      `/247/daily-activity-samples?startDate=${weekAgo}&endDate=${today}`,
      `/247/daily-activity-samples`,
      `/v1/247/daily-activity-samples?startDate=${weekAgo}&endDate=${today}`,
      `/247/sleep?startDate=${weekAgo}&endDate=${today}`,
      `/247/sleep`,
      `/247/hrv?startDate=${weekAgo}&endDate=${today}`,
      `/247/hrv`,
      `/247/recovery?startDate=${weekAgo}&endDate=${today}`,
      `/247/recovery`,
      `/247/heartrate?startDate=${weekAgo}&endDate=${today}`,
      `/247/heartrate`,
      `/247/steps?startDate=${weekAgo}&endDate=${today}`,
      `/247/steps`,
      `/247/calories?startDate=${weekAgo}&endDate=${today}`,
      `/247/stress?startDate=${weekAgo}&endDate=${today}`,
      `/247/`,
      // Direct (zonder /247 prefix)
      `/daily-activity-samples?startDate=${weekAgo}&endDate=${today}`,
      `/sleep?startDate=${weekAgo}&endDate=${today}`,
      // Bevestig dat /v2/workouts nog werkt
      '/v2/workouts?limit=1',
    ]

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
          // Beperk omvang
          preview: typeof body === 'string'
            ? body
            : JSON.stringify(body).slice(0, 400),
        })
      } catch (err) {
        results.push({ path, error: err.message })
      }
    }

    return cors({ results })
  } catch (err) {
    return cors({ error: err.message }, 500)
  }
}
