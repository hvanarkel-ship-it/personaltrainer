import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

// Verwijdert workouts van verwijderde koppelingen (Strava, Intervals, Runalyze).
// Alleen deze bronnen — Suunto en handmatige logs blijven staan.
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId
  try {
    const rows = await sql`
      DELETE FROM trainingen
      WHERE user_id = ${userId}
        AND LOWER(bron) IN ('strava', 'intervals', 'runalyze')
      RETURNING id
    `
    return cors({ success: true, verwijderd: rows.length })
  } catch (err) {
    console.error('Opschonen error:', err)
    return cors({ error: 'Opschonen mislukt: ' + err.message }, 500)
  }
}
