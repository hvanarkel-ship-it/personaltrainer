import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'
import { syncRunalyzeForUser } from './_runalyze.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId

  try {
    const [profiel] = await sql`
      SELECT runalyze_api_token FROM user_profile WHERE user_id = ${userId}
    `
    if (!profiel?.runalyze_api_token) {
      return cors({ error: 'Runalyze niet gekoppeld' }, 400)
    }

    const result = await syncRunalyzeForUser(sql, userId, profiel.runalyze_api_token)
    return cors({ success: true, ...result })
  } catch (err) {
    const cause = err.cause?.message ?? ''
    console.error('Runalyze sync error:', err)
    return cors({ error: `Sync fout: ${err.message}${cause ? ' (' + cause + ')' : ''}` }, 500)
  }
}
