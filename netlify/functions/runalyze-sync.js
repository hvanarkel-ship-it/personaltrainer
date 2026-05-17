import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

// Runalyze sport type IDs → Dutch sport names
const SPORT_MAP = {
  1: 'hardlopen',    // Running
  2: 'fietsen',      // Cycling
  3: 'zwemmen',      // Swimming
  4: 'wandelen',     // Walking
  5: 'fitness',      // Strength / Gym
  6: 'yoga',         // Other indoor
  14: 'fietsen',     // Mountainbike
  17: 'hardlopen',   // Trail running
  24: 'fitness',     // Crossfit / HIIT
  34: 'wandelen',    // Hiking
  52: 'hardlopen',   // Treadmill
  61: 'fietsen',     // Indoor cycling
}

function mapSport(typeId, name) {
  const nameLower = (name || '').toLowerCase()
  if (/hyrox|hyro x/.test(nameLower)) return 'hyrox'
  if (/padel/.test(nameLower)) return 'padel'
  if (/tennis/.test(nameLower)) return 'tennis'
  if (/voetbal|soccer|football/.test(nameLower)) return 'voetbal'
  return SPORT_MAP[typeId] || 'overig'
}

async function fetchWithTimeout(url, options, ms = 20000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId

  try {
    const [profiel] = await sql`
      SELECT runalyze_api_token FROM user_profile WHERE user_id = ${userId}
    `
    if (!profiel?.runalyze_api_token) {
      return cors({ error: 'Runalyze niet gekoppeld' }, 400)
    }

    const token = profiel.runalyze_api_token
    const headers = { 'token': token, 'Accept': 'application/json' }

    // Fetch all existing Runalyze IDs to avoid duplicates
    const bestaand = await sql`
      SELECT runalyze_id FROM trainingen
      WHERE user_id = ${userId} AND runalyze_id IS NOT NULL
    `
    const bestaandeIds = new Set(bestaand.map(r => String(r.runalyze_id)))

    let gesynchroniseerd = 0
    let overgeslagen = 0
    let offset = 0
    const LIMIT = 100
    const nieuweRijen = []
    const debug = {}

    // Paginate through all activities
    while (true) {
      const res = await fetchWithTimeout(
        `https://runalyze.com/api/v1/activities?limit=${LIMIT}&offset=${offset}`,
        { headers }
      )

      if (!res.ok) {
        const text = await res.text()
        debug.activities_error = `${res.status}: ${text.slice(0, 200)}`
        break
      }

      const data = await res.json()
      const activities = Array.isArray(data) ? data : (data.activities ?? data.data ?? [])

      if (!activities.length) break
      debug.activities_received = (debug.activities_received || 0) + activities.length

      if (offset === 0 && activities[0]) {
        console.log('Runalyze activity sample:', JSON.stringify(activities[0]).slice(0, 300))
      }

      for (const act of activities) {
        const id = String(act.id || act.ActivityId || '')
        if (!id) continue
        if (bestaandeIds.has(id)) { overgeslagen++; continue }

        // Runalyze date: "2024-03-15" or ISO string
        const datum = (act.time || act.date || act.startTime || '').slice(0, 10)
        if (!datum) continue

        // Duration: Runalyze stores in seconds as 's' or 'duration'
        const sec = act.s ?? act.duration ?? act.timeInSeconds ?? 0
        const duur_min = sec > 0 ? Math.round(sec / 60) : null

        // Distance in km
        const km = parseFloat(act.km ?? act.distance ?? 0)

        // Calories
        const kcal = act.kcal > 0 ? Math.round(act.kcal) : null

        // Heart rate
        const gem_hr = act.pulse_avg ?? act.heartRateAvg ?? null
        const max_hr = act.pulse_max ?? act.heartRateMax ?? null

        // Sport
        const typeId = act.sport ?? act.sportId ?? act.typeId ?? null
        const sport = mapSport(typeId, act.comment || act.title || '')

        // HRV if present
        const hrv = act.hrv ?? act.hrv_rmssd ?? null

        const notitiesDelenParts = [act.comment || act.title || sport]
        if (km > 0) notitiesDelenParts.push(`${km.toFixed(1)}km`)
        notitiesDelenParts.push(`[runalyze:${id}]`)

        nieuweRijen.push({
          user_id: userId,
          datum,
          sport,
          duur_min,
          kcal,
          gem_hartslag: gem_hr ? Math.round(gem_hr) : null,
          max_hartslag: max_hr ? Math.round(max_hr) : null,
          hrv_ochtend: hrv ? Math.round(hrv) : null,
          notities: notitiesDelenParts.join(' — '),
          bron: 'runalyze',
          runalyze_id: id,
        })
      }

      if (activities.length < LIMIT) break
      offset += LIMIT
    }

    // Bulk insert in batches of 200
    const BATCH = 200
    for (let i = 0; i < nieuweRijen.length; i += BATCH) {
      const batch = nieuweRijen.slice(i, i + BATCH)
      const result = await sql`
        INSERT INTO trainingen
          (user_id, datum, sport, duur_min, kcal, gem_hartslag, max_hartslag, hrv_ochtend, notities, bron, runalyze_id)
        VALUES ${sql(batch, 'user_id', 'datum', 'sport', 'duur_min', 'kcal', 'gem_hartslag', 'max_hartslag', 'hrv_ochtend', 'notities', 'bron', 'runalyze_id')}
        ON CONFLICT (user_id, runalyze_id) WHERE runalyze_id IS NOT NULL DO NOTHING
        RETURNING id
      `
      gesynchroniseerd += result.length
    }

    return cors({ success: true, gesynchroniseerd, overgeslagen, debug })
  } catch (err) {
    const cause = err.cause?.message ?? ''
    console.error('Runalyze sync error:', err)
    return cors({ error: `Sync fout: ${err.message}${cause ? ' (' + cause + ')' : ''}` }, 500)
  }
}
