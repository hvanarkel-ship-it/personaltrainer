import jwt from 'jsonwebtoken'
import { getDb } from './_db.js'

export const handler = async (event) => {
  const appUrl = process.env.URL || 'http://localhost:8888'
  const { code, state, error } = event.queryStringParameters || {}

  if (error) return redirect(`${appUrl}/?integratie=strava&status=geweigerd`)
  if (!code || !state) return redirect(`${appUrl}/?integratie=strava&status=fout`)

  try {
    const decoded = jwt.verify(decodeURIComponent(state), process.env.JWT_SECRET)
    const userId = decoded.userId

    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code'
      })
    })

    const tokens = await res.json()
    if (!tokens.access_token) {
      console.error('Strava token error:', tokens)
      return redirect(`${appUrl}/?integratie=strava&status=fout`)
    }

    const sql = getDb()
    await sql`
      INSERT INTO user_profile (user_id, strava_access_token, strava_refresh_token, strava_token_expires_at, strava_athlete_id)
      VALUES (${userId}, ${tokens.access_token}, ${tokens.refresh_token}, ${tokens.expires_at}, ${tokens.athlete?.id || null})
      ON CONFLICT (user_id) DO UPDATE SET
        strava_access_token = EXCLUDED.strava_access_token,
        strava_refresh_token = EXCLUDED.strava_refresh_token,
        strava_token_expires_at = EXCLUDED.strava_token_expires_at,
        strava_athlete_id = EXCLUDED.strava_athlete_id,
        updated_at = NOW()
    `

    return redirect(`${appUrl}/?integratie=strava&status=verbonden`)
  } catch (err) {
    console.error('Strava callback error:', err)
    return redirect(`${appUrl}/?integratie=strava&status=fout`)
  }
}

function redirect(url) {
  return { statusCode: 302, headers: { Location: url } }
}
