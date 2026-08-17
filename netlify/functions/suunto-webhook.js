import crypto from 'crypto'
import { getDb } from './_db.js'
import {
  aggregateSleep, aggregateActivity, aggregateRecovery,
  upsertWellnessRows, parseWorkout, insertWorkoutRow,
} from './_suunto.js'

// Suunto webhook-ontvanger (nieuwe 24/7 DATA API is push, geen pull).
// Suunto POST't real-time notificaties hierheen: WORKOUT_CREATED en
// SUUNTO_247_{SLEEP,ACTIVITY,RECOVERY}_CREATED. De 247-payloads hebben dezelfde
// samples/entryData-structuur als de oude pull-API, dus we hergebruiken de
// bestaande aggregatie-logica.
//
// Registreren in de Suunto OAuth-app: notification URL = <APP_URL>/api/suunto-webhook
// en een notification secret gelijk aan env var SUUNTO_NOTIFICATION_SECRET.

function ok(body = 'ok') { return { statusCode: 200, body } }

function mapToRows(map) {
  const rows = []
  for (const [datum, velden] of map) rows.push({ datum, ...velden })
  return rows
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  // Ruwe bytes: de HMAC wordt over de exacte request-body berekend.
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64')
    : Buffer.from(event.body || '', 'utf8')

  // 1. HMAC-SHA256 handtekening verifiëren (authenticiteit van Suunto).
  const secret = process.env.SUUNTO_NOTIFICATION_SECRET
  if (secret) {
    const headers = event.headers || {}
    const sig = headers['x-hmac-sha256-signature'] || headers['X-HMAC-SHA256-Signature'] || ''
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex')
    const a = Buffer.from(String(sig), 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      // Diagnose-logging (geen volledige secrets): helpt vaststellen of het
      // notification-secret in de portal overeenkomt met SUUNTO_NOTIFICATION_SECRET.
      console.warn('Suunto webhook: handtekening komt niet overeen', {
        headerAanwezig: !!sig,
        headerStart: String(sig).slice(0, 10),
        berekendStart: expected.slice(0, 10),
        bodyBytes: raw.length,
      })
      return { statusCode: 401, body: 'invalid signature' }
    }
  }

  let payload
  try { payload = JSON.parse(raw.toString('utf8')) } catch { return ok('ignored') }

  const { type, username } = payload
  if (!username) return ok('no username')

  const sql = getDb()
  let userId
  try {
    const [u] = await sql`SELECT user_id FROM user_profile WHERE suunto_username = ${username}`
    if (!u) return ok('unknown user') // 200 → voorkom eindeloze retries voor onbekende gebruiker
    userId = u.user_id
  } catch (err) {
    console.error('Suunto webhook user-lookup fout:', err)
    return { statusCode: 500, body: 'db error' } // retry
  }

  try {
    switch (type) {
      case 'SUUNTO_247_SLEEP_CREATED':
        await upsertWellnessRows(sql, userId, mapToRows(aggregateSleep(payload.samples)))
        break
      case 'SUUNTO_247_ACTIVITY_CREATED':
        await upsertWellnessRows(sql, userId, mapToRows(aggregateActivity(payload.samples)))
        break
      case 'SUUNTO_247_RECOVERY_CREATED':
        await upsertWellnessRows(sql, userId, mapToRows(aggregateRecovery(payload.samples)))
        break
      case 'WORKOUT_CREATED': {
        const parsed = payload.workout ? parseWorkout(payload.workout) : null
        if (parsed) await insertWorkoutRow(sql, { ...parsed, user_id: userId })
        break
      }
      default:
        // ROUTE_CREATED, legacy form-based, of onbekend → negeren
        break
    }
  } catch (err) {
    console.error('Suunto webhook verwerking fout:', type, err)
    return { statusCode: 500, body: 'processing error' } // → Suunto retryt met backoff
  }

  return ok()
}
