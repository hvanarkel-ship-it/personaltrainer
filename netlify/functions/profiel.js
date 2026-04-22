import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response

  const sql = getDb()
  const userId = auth.user.userId

  try {
    if (event.httpMethod === 'GET') {
      const [row] = await sql`
        SELECT u.id, u.email, u.name, u.created_at,
          p.geboortejaar, p.lengte_cm, p.gewicht_kg,
          p.doel_kcal, p.doel_eiwit_g, p.doel_koolhydraten_g, p.doel_vetten_g,
          p.sporten, p.geslacht, p.coach_context, p.coach_naam, p.coach_stijl,
          p.wearables_device, p.wearables_user_id, p.updated_at
        FROM users u
        LEFT JOIN user_profile p ON p.user_id = u.id
        WHERE u.id = ${userId}
      `

      // Graceful fallback if wearables columns don't exist yet (pre-migration)
      if (row && row.wearables_device === undefined) {
        let wearablesInfo = {}
        try {
          const [wi] = await sql`SELECT wearables_device, wearables_user_id FROM user_profile WHERE user_id = ${userId}`
          wearablesInfo = { wearables_device: wi?.wearables_device || null, wearables_user_id: wi?.wearables_user_id || null }
        } catch { /* columns not yet migrated */ }
        return cors({ ...(row || {}), ...wearablesInfo })
      }

      return cors(row || {})
    }

    if (event.httpMethod === 'PUT') {
      const d = JSON.parse(event.body || '{}')

      if (d.name) {
        await sql`UPDATE users SET name = ${d.name} WHERE id = ${userId}`
      }

      if (d.ontkoppel_wearables) {
        await sql`
          UPDATE user_profile SET
            wearables_token = NULL,
            wearables_refresh_token = NULL,
            wearables_token_expires_at = NULL,
            wearables_user_id = NULL,
            wearables_device = NULL,
            updated_at = NOW()
          WHERE user_id = ${userId}
        `
        return cors({ success: true })
      }

      await sql`
        INSERT INTO user_profile (
          user_id, geboortejaar, lengte_cm, gewicht_kg,
          doel_kcal, doel_eiwit_g, doel_koolhydraten_g, doel_vetten_g,
          sporten, geslacht, coach_context, coach_naam, coach_stijl
        )
        VALUES (
          ${userId},
          ${d.geboortejaar || null}, ${d.lengte_cm || null}, ${d.gewicht_kg || null},
          ${d.doel_kcal || 2400}, ${d.doel_eiwit_g || 160},
          ${d.doel_koolhydraten_g || 250}, ${d.doel_vetten_g || 80},
          ${d.sporten || ['fitness', 'padel', 'fietsen']},
          ${d.geslacht || null},
          ${d.coach_context || null},
          ${d.coach_naam || 'APEX Coach'},
          ${d.coach_stijl || 'direct'}
        )
        ON CONFLICT (user_id) DO UPDATE SET
          geboortejaar = EXCLUDED.geboortejaar,
          lengte_cm = EXCLUDED.lengte_cm,
          gewicht_kg = EXCLUDED.gewicht_kg,
          doel_kcal = EXCLUDED.doel_kcal,
          doel_eiwit_g = EXCLUDED.doel_eiwit_g,
          doel_koolhydraten_g = EXCLUDED.doel_koolhydraten_g,
          doel_vetten_g = EXCLUDED.doel_vetten_g,
          sporten = EXCLUDED.sporten,
          geslacht = EXCLUDED.geslacht,
          coach_context = EXCLUDED.coach_context,
          coach_naam = EXCLUDED.coach_naam,
          coach_stijl = EXCLUDED.coach_stijl,
          updated_at = NOW()
      `
      return cors({ success: true })
    }

    return cors({ error: 'Methode niet toegestaan' }, 405)
  } catch (err) {
    console.error('Profiel error:', err)
    return cors({ error: 'Fout bij profiel: ' + err.message }, 500)
  }
}
