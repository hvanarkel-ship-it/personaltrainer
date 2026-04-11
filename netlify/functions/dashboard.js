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
    const [profiel] = await sql`
      SELECT u.name, p.* FROM users u
      LEFT JOIN user_profile p ON p.user_id = u.id
      WHERE u.id = ${userId}
    `

    const [recenteInbody] = await sql`
      SELECT * FROM inbody_metingen WHERE user_id = ${userId}
      ORDER BY datum DESC LIMIT 1
    `

    const vandaagMaaltijden = await sql`
      SELECT id, maaltijd_type, beschrijving, kcal, eiwit_g, koolhydraten_g, vetten_g
      FROM maaltijden WHERE user_id = ${userId} AND datum = ${vandaag}
      ORDER BY created_at ASC`

    const weektrainingen = await sql`
      SELECT datum, sport, duur_min, kcal, hrv_ochtend, slaap_uur, slaapscore, herstelbalans
      FROM trainingen WHERE user_id = ${userId}
      AND datum >= (CURRENT_DATE - INTERVAL '7 days')
      ORDER BY datum DESC
    `

    // Meest recente HRV/slaap
    const [recentTraining] = await sql`
      SELECT hrv_ochtend, slaap_uur, slaapscore, herstelbalans, datum
      FROM trainingen WHERE user_id = ${userId} AND hrv_ochtend IS NOT NULL
      ORDER BY datum DESC LIMIT 1
    `

    const actieveDoelen = await sql`
      SELECT * FROM doelen WHERE user_id = ${userId} AND actief = TRUE
      ORDER BY deadline ASC NULLS LAST LIMIT 5
    `

    const gewichtTrend = await sql`
      SELECT datum, gewicht_kg FROM inbody_metingen
      WHERE user_id = ${userId} AND gewicht_kg IS NOT NULL
      ORDER BY datum DESC LIMIT 8
    `

    // Trainingstreak: hoeveel opeenvolgende dagen was er training
    const recentDagen = await sql`
      SELECT DISTINCT datum::date as datum FROM trainingen
      WHERE user_id = ${userId} AND sport != 'herstel'
      AND datum >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY datum DESC
    `
    let trainingStreak = 0
    for (let i = 0; i < 30; i++) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const ds = d.toISOString().split('T')[0]
      const gevonden = recentDagen.some(r => {
        const rd = r.datum instanceof Date ? r.datum.toISOString().split('T')[0] : String(r.datum).slice(0, 10)
        return rd === ds
      })
      if (gevonden) trainingStreak++
      else break
    }

    const gegeten = vandaagMaaltijden.reduce((s, m) => ({
      kcal: s.kcal + (m.kcal || 0),
      eiwit: s.eiwit + (parseFloat(m.eiwit_g) || 0),
      koolhydraten: s.koolhydraten + (parseFloat(m.koolhydraten_g) || 0),
      vetten: s.vetten + (parseFloat(m.vetten_g) || 0),
    }), { kcal: 0, eiwit: 0, koolhydraten: 0, vetten: 0 })

    // Calorieën verbrand door training vandaag (excl. herstel-entries)
    const normalizeDate = d => (d instanceof Date ? d.toISOString().split('T')[0] : String(d).slice(0, 10))
    const training_kcal_vandaag = weektrainingen
      .filter(t => normalizeDate(t.datum) === vandaag && t.sport !== 'herstel' && t.kcal)
      .reduce((s, t) => s + (parseInt(t.kcal) || 0), 0)

    return cors({
      profiel: profiel || {},
      vandaag: {
        datum: vandaag,
        maaltijden_lijst: vandaagMaaltijden,
        ...gegeten,
        training_kcal: training_kcal_vandaag,
      },
      herstel: recentTraining || null,
      inbody: recenteInbody || null,
      week_trainingen: weektrainingen,
      doelen: actieveDoelen,
      gewicht_trend: gewichtTrend.reverse(),
      streak: trainingStreak,
    })
  } catch (err) {
    console.error('Dashboard error:', err)
    return cors({ error: 'Fout bij dashboard: ' + err.message }, 500)
  }
}
