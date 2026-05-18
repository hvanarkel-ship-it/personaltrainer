import { requireAuth, cors } from './_auth.js'
import { SUUNTO_AUTH_URL } from './_suunto.js'

const REDIRECT_URI = `${process.env.URL || 'https://personaltrainerandcoach.netlify.app'}/api/suunto-callback`

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'GET') return cors({ error: 'Methode niet toegestaan' }, 405)

  if (!process.env.SUUNTO_CLIENT_ID) {
    return cors({ error: 'SUUNTO_CLIENT_ID niet geconfigureerd in Netlify environment variables' }, 500)
  }

  // Encode userId + timestamp in state voor veilige callback-verificatie
  const state = Buffer.from(JSON.stringify({
    userId: auth.user.userId,
    ts: Date.now(),
  })).toString('base64url')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.SUUNTO_CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    scope:         'workout wellbeing',
    state,
  })

  return cors({ url: `${SUUNTO_AUTH_URL}?${params}` })
}
