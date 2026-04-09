import { getDb } from './_db.js'
import { cors } from './_auth.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})

  try {
    const sql = getDb()
    const start = Date.now()
    await sql`SELECT 1 AS ok`
    const ms = Date.now() - start

    return cors({
      status: 'ok',
      db: 'verbonden',
      latency_ms: ms,
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    console.error('Health check mislukt:', err)
    return cors({
      status: 'fout',
      db: 'niet verbonden',
      error: err.message,
      timestamp: new Date().toISOString()
    }, 503)
  }
}
