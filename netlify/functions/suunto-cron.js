import { getDb } from './_db.js'
import { getValidToken, syncSuuntoForUser } from './_suunto.js'

// Dagelijkse Suunto sync — workouts via pull.
// Gezondheidsdata (24/7: slaap/HRV/herstel/activiteit) komt via webhooks
// (zie suunto-webhook.js), niet meer via een pull-sync.
export const handler = async () => {
  const sql = getDb()
  const users = await sql`
    SELECT user_id FROM user_profile
    WHERE suunto_access_token IS NOT NULL
  `

  const samenvatting = []
  for (const { user_id } of users) {
    try {
      const token = await getValidToken(sql, user_id)
      const workouts = await syncSuuntoForUser(sql, user_id, token)
      await sql`UPDATE user_profile SET suunto_laatste_sync = NOW() WHERE user_id = ${user_id}`.catch(() => {})
      samenvatting.push({ user_id, workouts: workouts.gesynchroniseerd })
    } catch (err) {
      samenvatting.push({ user_id, error: err.message })
    }
  }

  console.log('Suunto cron klaar:', JSON.stringify(samenvatting))
  return { statusCode: 200, body: JSON.stringify(samenvatting) }
}
