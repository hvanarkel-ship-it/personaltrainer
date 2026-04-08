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
      const [settings] = await sql`
        SELECT s.*, u.naam, u.email
        FROM user_settings s
        JOIN users u ON u.id = s.user_id
        WHERE s.user_id = ${userId}
      `
      return cors(settings || {})
    }

    if (event.httpMethod === 'PUT') {
      const data = JSON.parse(event.body || '{}')
      const {
        naam, geboortedatum, geslacht, lengte_cm, doel, activiteits_niveau,
        dieet_wensen, allergenen, doelgewicht_kg, dagelijks_calorie_doel,
        dagelijks_eiwitdoel_g, coach_naam, coach_stijl
      } = data

      if (naam) {
        await sql`UPDATE users SET naam = ${naam} WHERE id = ${userId}`
      }

      const [updated] = await sql`
        INSERT INTO user_settings (user_id, geboortedatum, geslacht, lengte_cm, doel, activiteits_niveau,
          dieet_wensen, allergenen, doelgewicht_kg, dagelijks_calorie_doel, dagelijks_eiwitdoel_g,
          coach_naam, coach_stijl)
        VALUES (${userId}, ${geboortedatum || null}, ${geslacht || null}, ${lengte_cm || null},
          ${doel || null}, ${activiteits_niveau || null}, ${dieet_wensen || null},
          ${allergenen || null}, ${doelgewicht_kg || null}, ${dagelijks_calorie_doel || null},
          ${dagelijks_eiwitdoel_g || null}, ${coach_naam || 'APEX'}, ${coach_stijl || 'motiverend'})
        ON CONFLICT (user_id) DO UPDATE SET
          geboortedatum = EXCLUDED.geboortedatum,
          geslacht = EXCLUDED.geslacht,
          lengte_cm = EXCLUDED.lengte_cm,
          doel = EXCLUDED.doel,
          activiteits_niveau = EXCLUDED.activiteits_niveau,
          dieet_wensen = EXCLUDED.dieet_wensen,
          allergenen = EXCLUDED.allergenen,
          doelgewicht_kg = EXCLUDED.doelgewicht_kg,
          dagelijks_calorie_doel = EXCLUDED.dagelijks_calorie_doel,
          dagelijks_eiwitdoel_g = EXCLUDED.dagelijks_eiwitdoel_g,
          coach_naam = EXCLUDED.coach_naam,
          coach_stijl = EXCLUDED.coach_stijl,
          updated_at = NOW()
        RETURNING *
      `
      return cors(updated)
    }

    return cors({ error: 'Methode niet toegestaan' }, 405)
  } catch (err) {
    console.error('Settings error:', err)
    return cors({ error: 'Fout bij ophalen instellingen' }, 500)
  }
}
