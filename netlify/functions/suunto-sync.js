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
    const params = event.queryStringParameters || {}
    if (params.reset === '1') {
      await sql`DELETE FROM trainingen WHERE user_id = ${userId} AND bron = 'suunto'`
    }

    const accessToken = await getValidToken(sql, userId)
    // Handmatige sync = volledige backfill (geen sindsDagen-venster)
    const workouts = await syncSuuntoForUser(sql, userId, accessToken)

    // Gezondheidsdata (slaap/HRV/herstel) komt sinds de Suunto 24/7 API-migratie
    // via webhooks binnen (zie suunto-webhook.js), niet meer via een pull-sync.
    const wellness = { via: 'webhook' }

    // Grendel-tijdstip bijwerken zodat de achtergrond-sync niet direct opnieuw draait
    await sql`
      UPDATE user_profile SET suunto_laatste_sync = NOW() WHERE user_id = ${userId}
    `.catch(() => {})

    return cors({ success: true, ...workouts, wellness })
  } catch (err) {
    console.error('Suunto sync fout:', err)
    return cors({ error: err.message }, 500)
  }
}
