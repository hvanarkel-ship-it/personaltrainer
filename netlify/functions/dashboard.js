import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})

  const auth = requireAuth(event)
  if (auth.error) return auth.response

  if (event.httpMethod !== 'GET') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId
  const vandaag = new Date().toISOString().split('T')[0]

  try {
    const [latestMeasurement] = await sql`
      SELECT gewicht_kg, vetpercentage, spiermassa_kg, datum
      FROM measurements WHERE user_id = ${userId}
      ORDER BY datum DESC LIMIT 1
    `

    const vandaagMeals = await sql`
      SELECT kcal, eiwitten_g, koolhydraten_g, vetten_g, maaltijd_type
      FROM meals WHERE user_id = ${userId} AND datum = ${vandaag}
    `

    const vandaagWorkout = await sql`
      SELECT naam, type, duur_minuten, verbrande_kcal
      FROM workouts WHERE user_id = ${userId} AND datum = ${vandaag}
      ORDER BY created_at DESC
    `

    const [settings] = await sql`
      SELECT dagelijks_calorie_doel, dagelijks_eiwitdoel_g, doel, doelgewicht_kg
      FROM user_settings WHERE user_id = ${userId}
    `

    // Gewichtstrend laatste 7 metingen
    const weightTrend = await sql`
      SELECT datum, gewicht_kg FROM measurements
      WHERE user_id = ${userId} AND gewicht_kg IS NOT NULL
      ORDER BY datum DESC LIMIT 7
    `

    const totaalKcal = vandaagMeals.reduce((s, m) => s + (m.kcal || 0), 0)
    const totaalEiwit = vandaagMeals.reduce((s, m) => s + (parseFloat(m.eiwitten_g) || 0), 0)

    return cors({
      vandaag: {
        datum: vandaag,
        kcal_gegeten: totaalKcal,
        eiwit_gegeten: Math.round(totaalEiwit),
        maaltijden: vandaagMeals.length,
        trainingen: vandaagWorkout,
      },
      laatste_meting: latestMeasurement || null,
      instellingen: settings || null,
      gewicht_trend: weightTrend.reverse(),
    })
  } catch (err) {
    console.error('Dashboard error:', err)
    return cors({ error: 'Fout bij dashboard data' }, 500)
  }
}
