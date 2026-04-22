import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  const { athlete_id: rawId, api_key: apiKey } = JSON.parse(event.body || '{}')
  if (!rawId || !apiKey) return cors({ error: 'Athlete ID en API key zijn verplicht' }, 400)

  // Normalize: ensure lowercase 'i' prefix
  const athleteId = /^i/i.test(rawId.trim()) ? rawId.trim().toLowerCase() : `i${rawId.trim()}`
  const authHeader = 'Basic ' + Buffer.from(`API_KEY:${apiKey.trim()}`).toString('base64')

  try {
    const res = await fetch(`https://intervals.icu/api/v1/athlete/${athleteId}`, {
      headers: { Authorization: authHeader, Accept: 'application/json' }
    })
    if (!res.ok) {
      return cors({ error: res.status === 401 ? 'Ongeldige athlete ID of API key' : `Intervals.icu fout (${res.status})` }, 400)
    }
    const athlete = await res.json()

    const sql = getDb()
    const userId = auth.user.userId

    await sql`
      INSERT INTO user_profile (user_id, intervals_athlete_id, intervals_api_key)
      VALUES (${userId}, ${athleteId}, ${apiKey.trim()})
      ON CONFLICT (user_id) DO UPDATE SET
        intervals_athlete_id = EXCLUDED.intervals_athlete_id,
        intervals_api_key = EXCLUDED.intervals_api_key,
        updated_at = NOW()
    `

    return cors({ success: true, athlete_name: athlete.name })
  } catch (err) {
    console.error('Intervals connect error:', err)
    return cors({ error: 'Verbinding mislukt: ' + err.message }, 500)
  }
}
