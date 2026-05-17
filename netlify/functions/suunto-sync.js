import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'
import { getValidToken, syncSuuntoForUser, syncSuuntoWellnessForUser } from './_suunto.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId

  try {
    const params = event.queryStringParameters || {}
    if (params.reset === '1') {
      await sql`DELETE FROM trainingen WHERE user_id = ${userId} AND bron = 'suunto'`
    }

    const accessToken = await getValidToken(sql, userId)
    const workouts = await syncSuuntoForUser(sql, userId, accessToken)

    // Wellness data parallel — alleen als subscription key beschikbaar is
    let wellness = { wellness_dagen: 0, debug: { skipped: 'no subscription key' } }
    if (process.env.SUUNTO_SUBSCRIPTION_KEY) {
      try {
        wellness = await syncSuuntoWellnessForUser(sql, userId, accessToken, 28)
      } catch (err) {
        wellness = { wellness_dagen: 0, debug: { error: err.message } }
      }
    }

    return cors({ success: true, ...workouts, wellness })
  } catch (err) {
    console.error('Suunto sync fout:', err)
    return cors({ error: err.message }, 500)
  }
}
