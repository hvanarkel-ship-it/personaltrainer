import { getDb } from './_db.js'
import { syncRunalyzeForUser } from './_runalyze.js'

// Scheduled via netlify.toml: dagelijks om 06:00 UTC (= 07:00 NL winter / 08:00 NL zomer)
// Suunto/Garmin watches syncen meestal 's nachts naar Runalyze, dus 's ochtends is data vers.
export const handler = async () => {
  const sql = getDb()
  const startTime = Date.now()

  try {
    const users = await sql`
      SELECT user_id, runalyze_api_token
      FROM user_profile
      WHERE runalyze_api_token IS NOT NULL
    `
    console.log(`Runalyze cron: ${users.length} gebruiker(s) te syncen`)

    let totaal = 0
    let mislukt = 0
    for (const u of users) {
      try {
        const r = await syncRunalyzeForUser(sql, u.user_id, u.runalyze_api_token)
        totaal += r.gesynchroniseerd
        console.log(`  user ${u.user_id}: ${r.gesynchroniseerd} nieuw, ${r.overgeslagen} bestaand${r.debug.activities_error ? ' — fout: ' + r.debug.activities_error : ''}`)
      } catch (err) {
        mislukt++
        console.error(`  user ${u.user_id}: sync mislukt — ${err.message}`)
      }
    }

    const duurSec = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`Runalyze cron klaar: ${totaal} activiteiten toegevoegd, ${mislukt} fouten, ${duurSec}s`)
    return { statusCode: 200, body: JSON.stringify({ users: users.length, totaal, mislukt }) }
  } catch (err) {
    console.error('Runalyze cron fataal:', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
