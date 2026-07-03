import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response

  const sql = getDb()
  const userId = auth.user.userId
  const id = event.path.split('/').pop()

  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {}
      const limit = Math.min(parseInt(params.limit) || 500, 2000)
      const sport = params.sport
      let rows
      if (sport) {
        rows = await sql`
          SELECT * FROM trainingen WHERE user_id = ${userId} AND sport = ${sport}
          ORDER BY datum DESC LIMIT ${limit}
        `
      } else {
        rows = await sql`
          SELECT * FROM trainingen WHERE user_id = ${userId}
          ORDER BY datum DESC LIMIT ${limit}
        `
      }
      return cors(rows)
    }

    if (event.httpMethod === 'POST') {
      const d = JSON.parse(event.body || '{}')
      if (!d.sport) return cors({ error: 'Sport is verplicht' }, 400)
      const [row] = await sql`
        INSERT INTO trainingen (user_id, datum, sport, duur_min, kcal, gem_hartslag, max_hartslag,
          hrv_ochtend, slaap_uur, slaap_score, herstel_balans, zone2_min, zone3_min, zone4_min,
          notities, bron, rpe, stemming)
        VALUES (${userId}, ${d.datum||null}, ${d.sport}, ${d.duur_min||null}, ${d.kcal||null},
          ${d.gem_hartslag||null}, ${d.max_hartslag||null}, ${d.hrv_ochtend||null},
          ${d.slaap_uur||null}, ${d.slaap_score||null}, ${d.herstel_balans??null},
          ${d.zone2_min||null}, ${d.zone3_min||null}, ${d.zone4_min||null},
          ${d.notities||null}, ${d.bron||'handmatig'}, ${d.rpe||null}, ${d.stemming||null})
        RETURNING *
      `
      return cors(row, 201)
    }

    if (event.httpMethod === 'DELETE' && id !== 'training') {
      await sql`DELETE FROM trainingen WHERE id = ${id} AND user_id = ${userId}`
      return cors({ success: true })
    }

    return cors({ error: 'Methode niet toegestaan' }, 405)
  } catch (err) {
    console.error('Training error:', err)
    return cors({ error: 'Fout bij training: ' + err.message }, 500)
  }
}
