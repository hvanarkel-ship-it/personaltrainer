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
      const { datum, limit: lim } = event.queryStringParameters || {}
      const limit = Math.min(parseInt(lim) || 30, 100)
      const rows = datum
        ? await sql`SELECT * FROM maaltijden WHERE user_id = ${userId} AND datum = ${datum} ORDER BY created_at ASC`
        : await sql`SELECT * FROM maaltijden WHERE user_id = ${userId} ORDER BY datum DESC, created_at DESC LIMIT ${limit}`
      return cors(rows)
    }

    if (event.httpMethod === 'POST') {
      const d = JSON.parse(event.body || '{}')
      const [row] = await sql`
        INSERT INTO maaltijden (user_id, datum, maaltijd_type, beschrijving, kcal,
          eiwit_g, koolhydraten_g, vetten_g, foto_analyse, ai_notities)
        VALUES (${userId}, ${d.datum||null}, ${d.maaltijd_type||null}, ${d.beschrijving||null},
          ${d.kcal||null}, ${d.eiwit_g||null}, ${d.koolhydraten_g||null}, ${d.vetten_g||null},
          ${d.foto_analyse||null}, ${d.ai_notities||null})
        RETURNING *
      `
      return cors(row, 201)
    }

    if (event.httpMethod === 'DELETE' && id !== 'maaltijd') {
      await sql`DELETE FROM maaltijden WHERE id = ${id} AND user_id = ${userId}`
      return cors({ success: true })
    }

    return cors({ error: 'Methode niet toegestaan' }, 405)
  } catch (err) {
    console.error('Maaltijd error:', err)
    return cors({ error: 'Fout bij maaltijd: ' + err.message }, 500)
  }
}
