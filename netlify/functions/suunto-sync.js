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
    const accessToken = await getValidToken(sql, userId)
    const result = await syncSuuntoForUser(sql, userId, accessToken)
    return cors({ success: true, ...result })
  } catch (err) {
    console.error('Suunto sync fout:', err)
    return cors({ error: err.message }, 500)
  }
}
