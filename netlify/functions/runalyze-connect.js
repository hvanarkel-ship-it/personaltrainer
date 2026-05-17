import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  const { api_token: token } = JSON.parse(event.body || '{}')
  if (!token?.trim()) return cors({ error: 'API token is verplicht' }, 400)

  try {
    const sql = getDb()
    const userId = auth.user.userId

    await sql`
      INSERT INTO user_profile (user_id, runalyze_api_token)
      VALUES (${userId}, ${token.trim()})
      ON CONFLICT (user_id) DO UPDATE SET
        runalyze_api_token = EXCLUDED.runalyze_api_token,
        updated_at = NOW()
    `

    return cors({ success: true })
  } catch (err) {
    console.error('Runalyze connect error:', err)
    return cors({ error: 'Opslaan mislukt: ' + err.message }, 500)
  }
}
