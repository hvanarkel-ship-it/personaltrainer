import jwt from 'jsonwebtoken'
import { requireAuth, cors } from './_auth.js'
import { SUUNTO_AUTH_URL } from './_suunto.js'
import { SUUNTO_REDIRECT_URI } from './_config.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'GET') return cors({ error: 'Methode niet toegestaan' }, 405)

  if (!process.env.SUUNTO_CLIENT_ID) {
    return cors({ error: 'SUUNTO_CLIENT_ID niet geconfigureerd in Netlify environment variables' }, 500)
  }

  // Getekende state (JWT) — de callback verifieert de handtekening zodat
  // niemand een state met andermans userId kan vervalsen
  const state = jwt.sign(
    { userId: auth.user.userId, doel: 'suunto_oauth' },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  )

  // Scope 'workout wellbeing': 'workout' geeft toegang tot /v2/workouts, en
  // 'wellbeing' is vereist voor de 24/7 DATA API (/247samples: slaap, herstel,
  // activiteit). Zonder 'wellbeing' geeft de 247 API "Invalid authentication".
  // (Bevestigd: alle wellness-data t/m aug 2026 kwam binnen met deze scope.)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.SUUNTO_CLIENT_ID,
    redirect_uri:  SUUNTO_REDIRECT_URI,
    scope:         'workout wellbeing',
    state,
  })

  return cors({ url: `${SUUNTO_AUTH_URL}?${params}` })
}
