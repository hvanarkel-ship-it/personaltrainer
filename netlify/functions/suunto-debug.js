import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'
import { getValidToken, suuntoHeaders, SUUNTO_API_BASE } from './_suunto.js'

// Debug endpoint: geeft ruwe Suunto API response van eerste 3 workouts
// Gebruik: GET /api/suunto-debug
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'GET') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId

  try {
    const accessToken = await getValidToken(sql, userId)
    const url = `${SUUNTO_API_BASE}/v2/workouts?limit=3`
    const res = await fetch(url, { headers: suuntoHeaders(accessToken) })
    const raw = await res.text()
    let parsed
    try { parsed = JSON.parse(raw) } catch { parsed = raw }
    return cors({ status: res.status, url, data: parsed })
  } catch (err) {
    return cors({ error: err.message }, 500)
  }
}
