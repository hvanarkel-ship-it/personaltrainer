import { getDb } from './_db.js'
import { getValidToken, syncSuuntoForUser, syncSuuntoWellnessForUser } from './_suunto.js'

// Dagelijkse Suunto sync — workouts + wellness (slaap/HRV/recovery)
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
      let wellness = { wellness_nieuw: 0 }
      if (process.env.SUUNTO_SUBSCRIPTION_KEY) {
        wellness = await syncSuuntoWellnessForUser(sql, user_id, token, 28)
      }
      await sql`UPDATE user_profile SET suunto_laatste_sync = NOW() WHERE user_id = ${user_id}`.catch(() => {})
      samenvatting.push({
        user_id,
        workouts: workouts.gesynchroniseerd,
        wellness_nieuw: wellness.wellness_nieuw,
        wellness_bijgewerkt: wellness.wellness_bijgewerkt,
      })
    } catch (err) {
      samenvatting.push({ user_id, error: err.message })
    }
  }

  console.log('Suunto cron klaar:', JSON.stringify(samenvatting))
  return { statusCode: 200, body: JSON.stringify(samenvatting) }
}
