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

    const endpoints = single ? [single] : [
      '/v2/workouts?limit=1',
      '/v2/sleep?limit=5',
      '/v2/sleep',
      '/v2/recovery?limit=5',
      '/v2/recovery',
      `/v2/sleep?since=${sinceMs}&limit=5`,
      `/v2/recovery?since=${sinceMs}&limit=5`,
      '/v2/user',
      '/v2/user/me',
      '/v2/users/me',
      '/v2/profile',
      '/v2/heartrate',
      '/v2/heartrate/daily',
      '/v2/hrv',
      `/v2/hrv?since=${sinceMs}`,
      '/v2/dailyactivity',
      `/v2/dailyactivity?since=${sinceMs}`,
      '/v2/steps',
      `/v2/steps?since=${sinceMs}`,
      '/v2/wellness',
      `/v2/wellness?since=${sinceMs}`,
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
