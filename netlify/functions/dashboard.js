import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'
import { getValidToken, syncSuuntoWellnessForUser, syncSuuntoForUser } from './_suunto.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response

  if (event.httpMethod !== 'GET') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId
  const vandaag = new Date().toISOString().split('T')[0]

  // Sync Suunto data before reading — same rate-limit as coach (max 1x per 5 min)
  try {
    const [laatste] = await sql`
      SELECT updated_at FROM dagelijkse_wellness
      WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 1
    `
    const ouderDan5Min = !laatste?.updated_at ||
      (Date.now() - new Date(laatste.updated_at).getTime()) > 5 * 60 * 1000
    if (ouderDan5Min) {
      const token = await getValidToken(sql, userId).catch(() => null)
      if (token) {
        await Promise.all([
          syncSuuntoWellnessForUser(sql, userId, token, 2),
          syncSuuntoForUser(sql, userId, token),
        ])
      }
    }
  } catch { /* geen Suunto of sync mislukt — doorgaan met bestaande data */ }

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
      SELECT datum, sport, duur_min, kcal, hrv_ochtend, slaap_uur, slaapscore, herstelbalans, rpe
      FROM trainingen WHERE user_id = ${userId}
      AND datum >= (CURRENT_DATE - INTERVAL '7 days')
      ORDER BY datum DESC
    `

    // Meest recente HRV/slaap uit handmatige logs (laatste 7 dagen)
    const [recentTraining] = await sql`
      SELECT hrv_ochtend, slaap_uur, slaapscore, herstelbalans, datum
      FROM trainingen WHERE user_id = ${userId} AND hrv_ochtend IS NOT NULL
      AND datum >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY datum DESC LIMIT 1
    `

    // Meest recente Suunto wellness data
    const [recentWellness] = await sql`
      SELECT hrv_ochtend, slaap_uur, slaap_score, herstel_balans, stress_pct,
             rust_hartslag, stappen, kcal_actief, datum
      FROM dagelijkse_wellness WHERE user_id = ${userId}
      ORDER BY datum DESC LIMIT 1
    `.catch(() => [])

    // Merge op datum: recentste bron wint. Bij gelijke datum heeft Suunto voorrang
    // (automatisch gemeten > handmatig achteraf ingevuld)
    const trainDatum   = recentTraining ? String(recentTraining.datum).slice(0, 10) : null
    const wellnessDatum = recentWellness ? String(recentWellness.datum).slice(0, 10) : null
    const gebruikHandmatig = trainDatum && (!wellnessDatum || trainDatum > wellnessDatum)

    let herstelData = null
    if (recentTraining || recentWellness) {
      if (gebruikHandmatig) {
        herstelData = {
          hrv_ochtend:   recentTraining.hrv_ochtend   ?? recentWellness?.hrv_ochtend,
          slaap_uur:     recentTraining.slaap_uur     ?? recentWellness?.slaap_uur,
          slaapscore:    recentTraining.slaapscore    ?? recentWellness?.slaap_score,
          herstelbalans: recentTraining.herstelbalans ?? (recentWellness?.herstel_balans != null ? recentWellness.herstel_balans * 100 : null),
          datum: trainDatum,
          bron: 'handmatig',
        }
      } else {
        herstelData = {
          hrv_ochtend:   recentWellness.hrv_ochtend   ?? recentTraining?.hrv_ochtend,
          slaap_uur:     recentWellness.slaap_uur     ?? recentTraining?.slaap_uur,
          slaapscore:    recentWellness.slaap_score   ?? recentTraining?.slaapscore,
          herstelbalans: recentWellness.herstel_balans != null
            ? recentWellness.herstel_balans * 100
            : (recentTraining?.herstelbalans ?? null),
          datum: wellnessDatum ?? trainDatum,
          bron: 'suunto',
        }
      }
    }

    const actieveDoelen = await sql`
      SELECT * FROM doelen WHERE user_id = ${userId} AND actief = TRUE
      ORDER BY deadline ASC NULLS LAST LIMIT 5
    `

    const gewichtTrend = await sql`
      SELECT datum, gewicht_kg FROM inbody_metingen
      WHERE user_id = ${userId} AND gewicht_kg IS NOT NULL
      ORDER BY datum DESC LIMIT 8
    `

    // Trainingstreak
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
      herstel: herstelData,
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
