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
      const rows = await sql`
        SELECT * FROM doelen WHERE user_id = ${userId} ORDER BY actief DESC, deadline ASC NULLS LAST
      `
      return cors(rows)
    }

    if (event.httpMethod === 'POST') {
      const d = JSON.parse(event.body || '{}')
      if (!d.titel) return cors({ error: 'Titel is verplicht' }, 400)
      const [row] = await sql`
        INSERT INTO doelen (user_id, titel, sport, beschrijving, doel_waarde, huidige_waarde, eenheid, deadline, actief)
        VALUES (${userId}, ${d.titel}, ${d.sport||null}, ${d.beschrijving||null},
          ${d.doel_waarde||null}, ${d.huidige_waarde||null}, ${d.eenheid||null},
          ${d.deadline||null}, ${d.actief !== false})
        RETURNING *
      `
      return cors(row, 201)
    }

    if (event.httpMethod === 'PUT' && id !== 'doelen') {
      const d = JSON.parse(event.body || '{}')
      const [row] = await sql`
        UPDATE doelen SET
          titel = COALESCE(${d.titel||null}, titel),
          huidige_waarde = COALESCE(${d.huidige_waarde??null}, huidige_waarde),
          doel_waarde = COALESCE(${d.doel_waarde??null}, doel_waarde),
          actief = COALESCE(${d.actief??null}, actief),
          deadline = COALESCE(${d.deadline||null}, deadline),
          beschrijving = COALESCE(${d.beschrijving||null}, beschrijving)
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING *
      `
      return cors(row)
    }

    if (event.httpMethod === 'DELETE' && id !== 'doelen') {
      await sql`DELETE FROM doelen WHERE id = ${id} AND user_id = ${userId}`
      return cors({ success: true })
    }

    return cors({ error: 'Methode niet toegestaan' }, 405)
  } catch (err) {
    console.error('Doelen error:', err)
    return cors({ error: 'Fout bij doelen: ' + err.message }, 500)
  }
}
