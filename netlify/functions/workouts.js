import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})

  const auth = requireAuth(event)
  if (auth.error) return auth.response

  const sql = getDb()
  const userId = auth.user.userId
  const pathParts = event.path.split('/')
  const lastPart = pathParts[pathParts.length - 1]

  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {}
      const datum = params.datum
      const limit = Math.min(parseInt(params.limit) || 20, 100)

      let rows
      if (datum) {
        rows = await sql`
          SELECT * FROM workouts WHERE user_id = ${userId} AND datum = ${datum}
          ORDER BY created_at DESC
        `
      } else {
        rows = await sql`
          SELECT * FROM workouts WHERE user_id = ${userId}
          ORDER BY datum DESC, created_at DESC
          LIMIT ${limit}
        `
      }
      return cors(rows)
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}')
      const {
        datum, naam, type, duur_minuten, intensiteit,
        verbrande_kcal, notities, oefeningen, ai_samenvatting
      } = data

      if (!type) return cors({ error: 'Trainingstype is verplicht' }, 400)

      const [row] = await sql`
        INSERT INTO workouts (
          user_id, datum, naam, type, duur_minuten, intensiteit,
          verbrande_kcal, notities, oefeningen, ai_samenvatting
        ) VALUES (
          ${userId}, ${datum || null}, ${naam || null}, ${type},
          ${duur_minuten || null}, ${intensiteit || null},
          ${verbrande_kcal || null}, ${notities || null},
          ${oefeningen ? JSON.stringify(oefeningen) : null},
          ${ai_samenvatting || null}
        )
        RETURNING *
      `
      return cors(row, 201)
    }

    if (event.httpMethod === 'PUT' && lastPart !== 'workouts') {
      const data = JSON.parse(event.body || '{}')
      const {
        naam, type, duur_minuten, intensiteit,
        verbrande_kcal, notities, oefeningen, ai_samenvatting
      } = data

      const [row] = await sql`
        UPDATE workouts SET
          naam = ${naam || null},
          type = ${type || null},
          duur_minuten = ${duur_minuten || null},
          intensiteit = ${intensiteit || null},
          verbrande_kcal = ${verbrande_kcal || null},
          notities = ${notities || null},
          oefeningen = ${oefeningen ? JSON.stringify(oefeningen) : null},
          ai_samenvatting = ${ai_samenvatting || null},
          updated_at = NOW()
        WHERE id = ${lastPart} AND user_id = ${userId}
        RETURNING *
      `
      return cors(row)
    }

    if (event.httpMethod === 'DELETE' && lastPart !== 'workouts') {
      await sql`DELETE FROM workouts WHERE id = ${lastPart} AND user_id = ${userId}`
      return cors({ success: true })
    }

    return cors({ error: 'Methode niet toegestaan' }, 405)
  } catch (err) {
    console.error('Workouts error:', err)
    return cors({ error: 'Fout bij trainingen' }, 500)
  }
}
