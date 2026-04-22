import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

const JUNCTION_BASE = process.env.JUNCTION_ENV === 'production'
  ? 'https://api.tryvital.io'
  : 'https://api.sandbox.tryvital.io'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  if (event.httpMethod !== 'GET') return cors({ error: 'Methode niet toegestaan' }, 405)

  const auth = requireAuth(event)
  if (auth.error) return auth.response

  const sql = getDb()
  const userId = auth.user.userId

  try {
    const [profiel] = await sql`SELECT junction_user_id FROM user_profile WHERE user_id = ${userId}`
    if (!profiel?.junction_user_id) return cors({ providers: [] })

    const res = await fetch(`${JUNCTION_BASE}/v2/user/${profiel.junction_user_id}/providers`, {
      headers: { 'x-vital-api-key': process.env.JUNCTION_API_KEY },
    })
    if (!res.ok) return cors({ providers: [] })

    const data = await res.json()
    const providers = (data.providers || []).map(p => p.slug)
    return cors({ providers })
  } catch (err) {
    console.error('Junction status error:', err)
    return cors({ providers: [] })
  }
}
