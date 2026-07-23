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
          ${d.doel_waarde??null}, ${d.huidige_waarde??null}, ${d.eenheid||null},
          ${d.deadline||null}, ${d.actief !== false})
        RETURNING *
      `
      return cors(row, 201)
    }

    if (event.httpMethod === 'PUT' && id !== 'doelen') {
      const d = JSON.parse(event.body || '{}')
      // Alleen meegestuurde velden bijwerken — de frontend stuurt partiële PUTs
      // (bijv. alleen huidige_waarde bij voortgang). Een expliciet lege string
      // wist het veld ('' → NULL), een ontbrekend veld blijft ongewijzigd.
      const zet = v => v !== undefined
      const num = v => (v === '' || v == null ? null : v) // lege string uit een formulier → NULL (geen cast-fout)
      const [row] = await sql`
        UPDATE doelen SET
          titel          = CASE WHEN ${zet(d.titel)}          THEN ${d.titel || null}          ELSE titel          END,
          sport          = CASE WHEN ${zet(d.sport)}          THEN ${d.sport || null}          ELSE sport          END,
          eenheid        = CASE WHEN ${zet(d.eenheid)}        THEN ${d.eenheid || null}        ELSE eenheid        END,
          huidige_waarde = CASE WHEN ${zet(d.huidige_waarde)} THEN ${num(d.huidige_waarde)}    ELSE huidige_waarde END,
          doel_waarde    = CASE WHEN ${zet(d.doel_waarde)}    THEN ${num(d.doel_waarde)}       ELSE doel_waarde    END,
          actief         = CASE WHEN ${zet(d.actief)}         THEN ${d.actief ?? null}         ELSE actief         END,
          deadline       = CASE WHEN ${zet(d.deadline)}       THEN ${d.deadline || null}::date ELSE deadline       END,
          beschrijving   = CASE WHEN ${zet(d.beschrijving)}   THEN ${d.beschrijving || null}   ELSE beschrijving   END
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING *
      `
      if (!row) return cors({ error: 'Doel niet gevonden' }, 404)
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
