import { getDb } from './_db.js'
import { vernieuwToken, slaActiviteitOp } from './_strava.js'

export const handler = async (event) => {
  // Strava verification handshake (called once during webhook registration)
  if (event.httpMethod === 'GET') {
    const p = event.queryStringParameters || {}
    if (p['hub.verify_token'] !== process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
      return { statusCode: 403, body: 'Forbidden' }
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'hub.challenge': p['hub.challenge'] }),
    }
  }

  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  const payload = JSON.parse(event.body || '{}')
  const { object_type, aspect_type, object_id, owner_id } = payload

  // Only process new activities; ignore updates/deletes and athlete events
  if (object_type !== 'activity' || aspect_type !== 'create') {
    return { statusCode: 200, body: 'ok' }
  }

  const sql = getDb()

  try {
    const [profiel] = await sql`
      SELECT user_id, strava_access_token, strava_refresh_token, strava_token_expires_at
      FROM user_profile WHERE strava_athlete_id = ${owner_id} LIMIT 1
    `
    if (!profiel) return { statusCode: 200, body: 'ok' }

    let accessToken = profiel.strava_access_token
    if (profiel.strava_token_expires_at < Math.floor(Date.now() / 1000)) {
      accessToken = await vernieuwToken(sql, profiel.user_id, profiel)
    }

    const res = await fetch(`https://www.strava.com/api/v3/activities/${object_id}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) return { statusCode: 200, body: 'ok' }

    const act = await res.json()
    await slaActiviteitOp(sql, profiel.user_id, act, accessToken)

    return { statusCode: 200, body: 'ok' }
  } catch (err) {
    console.error('Strava webhook fout:', err)
    return { statusCode: 200, body: 'ok' } // Altijd 200 — voorkom onnodige Strava retries
  }
}
