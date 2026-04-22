import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'
import {
  isConfigured, getOwUserId,
  fetchActivitySummaries, fetchSleepSummaries,
  slaOwActiviteitOp, slaOwSleepOp,
} from './_openwearables.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  if (!isConfigured()) return cors({ error: 'Open Wearables niet geconfigureerd' }, 503)

  const sql = getDb()
  const userId = auth.user.userId

  try {
    const owUserId = await getOwUserId(sql, userId)
    if (!owUserId) return cors({ error: 'Open Wearables niet gekoppeld' }, 400)

    // Sync last 60 days
    const endDate   = new Date().toISOString().split('T')[0]
    const startDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [activityItems, sleepItems] = await Promise.all([
      fetchActivitySummaries(owUserId, startDate, endDate),
      fetchSleepSummaries(owUserId, startDate, endDate),
    ])

    const [activiteitIngevoegd, slaapIngevoegd] = await Promise.all([
      slaOwActiviteitOp(sql, userId, activityItems),
      slaOwSleepOp(sql, userId, sleepItems),
    ])

    return cors({
      success: true,
      activiteit_gesynchroniseerd: activiteitIngevoegd,
      slaap_gesynchroniseerd: slaapIngevoegd,
      totaal: activityItems.length + sleepItems.length,
    })
  } catch (err) {
    console.error('OW sync fout:', err)
    return cors({ error: 'Sync fout: ' + err.message }, 500)
  }
}
