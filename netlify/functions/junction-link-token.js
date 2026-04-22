import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

const JUNCTION_BASE = process.env.JUNCTION_ENV === 'production'
  ? 'https://api.tryvital.io'
  : 'https://api.sandbox.tryvital.io'

async function junctionApi(method, path, body) {
  const res = await fetch(`${JUNCTION_BASE}${path}`, {
    method,
    headers: { 'x-vital-api-key': process.env.JUNCTION_API_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Junction ${method} ${path}: ${res.status} ${text}`)
  return JSON.parse(text)
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  const auth = requireAuth(event)
  if (auth.error) return auth.response

  const sql = getDb()
  const userId = auth.user.userId

  if (!process.env.JUNCTION_API_KEY) {
    return cors({ error: 'JUNCTION_API_KEY is niet ingesteld in Netlify omgevingsvariabelen.' }, 500)
  }

  try {
    await sql`ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS junction_user_id TEXT`

    const { provider } = JSON.parse(event.body || '{}')
    if (!['garmin', 'suunto'].includes(provider)) {
      return cors({ error: 'Ongeldige provider' }, 400)
    }

    // Get or create Junction user
    const [profiel] = await sql`SELECT junction_user_id FROM user_profile WHERE user_id = ${userId}`
    let junctionUserId = profiel?.junction_user_id

    if (!junctionUserId) {
      const clientUserId = `apex_${userId}`
      const jUser = await junctionApi('POST', '/v2/user', { client_user_id: clientUserId })
      junctionUserId = jUser.user_id
      await sql`UPDATE user_profile SET junction_user_id = ${junctionUserId} WHERE user_id = ${userId}`
    }

    const appUrl = (process.env.APP_URL || 'https://apex-coach.netlify.app').replace(/\/$/, '')
    const redirectUrl = `${appUrl}/?junction_provider=${provider}&junction_state=success`

    const linkData = await junctionApi('POST', '/v2/link/token', {
      user_id: junctionUserId,
      provider,
      redirect_url: redirectUrl,
    })

    return cors({ link_url: linkData.link_web_url })
  } catch (err) {
    console.error('Junction link token error:', err)
    return cors({ error: 'Verbinding mislukt: ' + err.message }, 500)
  }
}
