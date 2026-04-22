import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

const PROVIDERS = ['garmin', 'polar', 'suunto', 'oura', 'fitbit']

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  const wearablesUrl = process.env.WEARABLES_URL
  const apiKey = process.env.WEARABLES_API_KEY
  if (!wearablesUrl || !apiKey) return cors({ error: 'Open Wearables niet geconfigureerd' }, 500)

  const sql = getDb()
  const userId = auth.user.userId

  try {
    // Run migrations if needed
    await sql`ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS wearables_user_id TEXT`
    await sql`ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS wearables_device TEXT`

    // Check if user already has an open-wearables account
    const [profiel] = await sql`SELECT wearables_user_id FROM user_profile WHERE user_id = ${userId}`
    let owUserId = profiel?.wearables_user_id

    if (!owUserId) {
      // Get user info to create account in open-wearables
      const [user] = await sql`SELECT email, name FROM users WHERE id = ${userId}`

      const res = await fetch(`${wearablesUrl}/api/v1/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Open-Wearables-API-Key': apiKey,
        },
        body: JSON.stringify({ email: user.email, name: user.name }),
      })

      if (!res.ok) {
        const err = await res.text()
        console.error('Create OW user error:', err)
        return cors({ error: 'Kon Open Wearables gebruiker niet aanmaken' }, 500)
      }

      const owUser = await res.json()
      owUserId = owUser.id

      await sql`
        INSERT INTO user_profile (user_id, wearables_user_id)
        VALUES (${userId}, ${owUserId})
        ON CONFLICT (user_id) DO UPDATE SET
          wearables_user_id = EXCLUDED.wearables_user_id,
          updated_at = NOW()
      `
    }

    // Build provider connection URLs (user goes to these to connect their device)
    const connections = PROVIDERS.map(provider => ({
      provider,
      url: `${wearablesUrl}/api/v1/oauth/${provider}/authorize?user_id=${owUserId}`,
    }))

    return cors({ ow_user_id: owUserId, connections })
  } catch (err) {
    console.error('Wearables connect error:', err)
    return cors({ error: 'Verbinding mislukt: ' + err.message }, 500)
  }
}
