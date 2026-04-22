import jwt from 'jsonwebtoken'
import { getDb } from './_db.js'
import { isConfigured, ensureOwUser, getOAuthUrl, SUPPORTED_PROVIDERS } from './_openwearables.js'

export const handler = async (event) => {
  const appUrl = process.env.URL || 'http://localhost:8888'

  if (!isConfigured()) {
    return { statusCode: 503, body: 'Open Wearables niet geconfigureerd' }
  }

  const { token, provider } = event.queryStringParameters || {}

  if (!token || !provider) {
    return { statusCode: 400, body: 'Ontbrekende token of provider' }
  }

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return { statusCode: 400, body: `Onbekende provider: ${provider}` }
  }

  try {
    const decoded = jwt.verify(decodeURIComponent(token), process.env.JWT_SECRET)
    const userId = decoded.userId

    const sql = getDb()
    const [user] = await sql`SELECT email FROM users WHERE id = ${userId}`
    if (!user) return { statusCode: 404, body: 'Gebruiker niet gevonden' }

    await sql`ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS openwearables_user_id TEXT`

    const owUserId = await ensureOwUser(sql, userId, user.email)

    // redirect_uri points back to our callback; carry token + provider so we can restore state
    const redirectUri = `${appUrl}/api/openwearables-callback?token=${encodeURIComponent(token)}&provider=${provider}`
    const authUrl = await getOAuthUrl(owUserId, provider, redirectUri)

    return { statusCode: 302, headers: { Location: authUrl } }
  } catch (err) {
    console.error('OW connect fout:', err)
    return {
      statusCode: 302,
      headers: { Location: `${appUrl}/?integratie=openwearables&provider=${event.queryStringParameters?.provider || ''}&status=fout` },
    }
  }
}
