import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'
import { getValidToken, suuntoHeaders, SUUNTO_API_BASE } from './_suunto.js'

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

    return cors({
      heeftSubscriptionKey: heeftKey,
      hint: heeftKey ? null : 'SUUNTO_SUBSCRIPTION_KEY niet ingesteld in Netlify — 247 API vereist deze',
      results,
    })
  } catch (err) {
    return cors({ error: err.message }, 500)
  }
}
