import { getDb } from './_db.js'
import { SUUNTO_TOKEN_URL } from './_suunto.js'

const REDIRECT_URI = `${process.env.URL || 'https://personaltrainerandcoach.netlify.app'}/api/suunto-callback`
const APP_URL = process.env.URL || 'https://personaltrainerandcoach.netlify.app'

function redirect(url) {
  return { statusCode: 302, headers: { Location: url }, body: '' }
}

export const handler = async (event) => {
  const { code, state, error } = event.queryStringParameters || {}

  if (error) {
    console.error('Suunto OAuth error:', error)
    return redirect(`${APP_URL}/?suunto=fout&reden=${encodeURIComponent(error)}`)
  }

  if (!code || !state) {
    return redirect(`${APP_URL}/?suunto=fout&reden=ontbrekende_parameters`)
  }

  // Verificeer state en haal userId op
  let userId
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
    const ouderDan10Min = Date.now() - decoded.ts > 10 * 60 * 1000
    if (ouderDan10Min) return redirect(`${APP_URL}/?suunto=fout&reden=sessie_verlopen`)
    userId = decoded.userId
  } catch {
    return redirect(`${APP_URL}/?suunto=fout&reden=ongeldige_state`)
  }

  try {
    // Wissel code voor access + refresh token
    const tokenRes = await fetch(SUUNTO_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
        client_id:     process.env.SUUNTO_CLIENT_ID,
        client_secret: process.env.SUUNTO_CLIENT_SECRET,
      }),
    })

    if (!tokenRes.ok) {
      const txt = await tokenRes.text().catch(() => '')
      console.error('Suunto token exchange mislukt:', tokenRes.status, txt)
      return redirect(`${APP_URL}/?suunto=fout&reden=token_exchange_mislukt`)
    }

    const tokens = await tokenRes.json()
    const expiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000)

    const sql = getDb()
    await sql`
      INSERT INTO user_profile (user_id, suunto_access_token, suunto_refresh_token, suunto_token_expiry)
      VALUES (${userId}, ${tokens.access_token}, ${tokens.refresh_token}, ${expiry.toISOString()})
      ON CONFLICT (user_id) DO UPDATE SET
        suunto_access_token  = EXCLUDED.suunto_access_token,
        suunto_refresh_token = EXCLUDED.suunto_refresh_token,
        suunto_token_expiry  = EXCLUDED.suunto_token_expiry,
        updated_at = NOW()
    `

    return redirect(`${APP_URL}/?suunto=verbonden`)
  } catch (err) {
    console.error('Suunto callback fout:', err)
    return redirect(`${APP_URL}/?suunto=fout&reden=${encodeURIComponent(err.message)}`)
  }
}
