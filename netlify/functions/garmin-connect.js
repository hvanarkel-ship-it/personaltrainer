import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'
import { garminLogin, garminGet } from './_garmin.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  const { email, wachtwoord } = JSON.parse(event.body || '{}')
  if (!email?.trim() || !wachtwoord) {
    return cors({ error: 'E-mailadres en wachtwoord zijn verplicht' }, 400)
  }

  try {
    const bundle = await garminLogin(email.trim(), wachtwoord)

    // Display-name ophalen — nodig voor de wellness-endpoints
    let displayName = null
    try {
      const profiel = await garminGet({ bundle, veranderd: false }, '/userprofile-service/socialProfile')
      displayName = profiel?.displayName || profiel?.userName || null
    } catch {
      /* niet fataal — sync valt terug op het account zonder displayName */
    }

    const sql = getDb()
    const userId = auth.user.userId

    await sql`
      INSERT INTO user_profile (user_id, garmin_oauth_token, garmin_display_name)
      VALUES (${userId}, ${JSON.stringify(bundle)}, ${displayName})
      ON CONFLICT (user_id) DO UPDATE SET
        garmin_oauth_token = EXCLUDED.garmin_oauth_token,
        garmin_display_name = EXCLUDED.garmin_display_name,
        updated_at = NOW()
    `

    return cors({ success: true, display_name: displayName })
  } catch (err) {
    console.error('Garmin connect error:', err)
    return cors({ error: err.message || 'Verbinding met Garmin mislukt' }, 400)
  }
}
