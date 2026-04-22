import jwt from 'jsonwebtoken'
import { getDb } from './_db.js'

export const handler = async (event) => {
  const appUrl = process.env.URL || 'http://localhost:8888'
  const { code, state, error } = event.queryStringParameters || {}

  if (error) return redirect(`${appUrl}/?integratie=wearables&status=geweigerd`)
  if (!code || !state) return redirect(`${appUrl}/?integratie=wearables&status=fout`)

  try {
    const decoded = jwt.verify(decodeURIComponent(state), process.env.JWT_SECRET)
    const userId = decoded.userId

    const res = await fetch(`${process.env.WEARABLES_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.WEARABLES_CLIENT_ID,
        client_secret: process.env.WEARABLES_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      })
    })

    const tokens = await res.json()
    if (!tokens.access_token) {
      console.error('Wearables token error:', tokens)
      return redirect(`${appUrl}/?integratie=wearables&status=fout`)
    }

    const sql = getDb()

    await sql`ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS wearables_token TEXT`
    await sql`ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS wearables_refresh_token TEXT`
    await sql`ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS wearables_token_expires_at BIGINT`
    await sql`ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS wearables_user_id TEXT`
    await sql`ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS wearables_device TEXT`

    await sql`
      INSERT INTO user_profile (user_id, wearables_token, wearables_refresh_token, wearables_token_expires_at, wearables_user_id, wearables_device)
      VALUES (${userId}, ${tokens.access_token}, ${tokens.refresh_token || null}, ${tokens.expires_at || null}, ${tokens.user_id || null}, ${tokens.device || null})
      ON CONFLICT (user_id) DO UPDATE SET
        wearables_token = EXCLUDED.wearables_token,
        wearables_refresh_token = EXCLUDED.wearables_refresh_token,
        wearables_token_expires_at = EXCLUDED.wearables_token_expires_at,
        wearables_user_id = EXCLUDED.wearables_user_id,
        wearables_device = EXCLUDED.wearables_device,
        updated_at = NOW()
    `

    return redirect(`${appUrl}/?integratie=wearables&status=verbonden`)
  } catch (err) {
    console.error('Wearables callback error:', err)
    return redirect(`${appUrl}/?integratie=wearables&status=fout`)
  }
}

function redirect(url) {
  return { statusCode: 302, headers: { Location: url } }
}
