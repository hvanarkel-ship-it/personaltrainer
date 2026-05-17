import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'
import { getValidToken, syncSuuntoForUser } from './_suunto.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId

  try {
    // ?reset=1 wist bestaande suunto records zodat alles opnieuw gesynct wordt
    const reset = event.queryStringParameters?.reset === '1'
    if (reset) {
      await sql`DELETE FROM trainingen WHERE user_id = ${userId} AND bron = 'suunto'`
    }

    const accessToken = await getValidToken(sql, userId)
    const result = await syncSuuntoForUser(sql, userId, accessToken)
    return cors({ success: true, ...result })
  } catch (err) {
    console.error('Suunto sync fout:', err)
    return cors({ error: err.message }, 500)
  }
}
