// Shared Suunto Cloud API v2 logica
// Docs: https://cloudapi.suunto.com
// Env vars nodig: SUUNTO_CLIENT_ID, SUUNTO_CLIENT_SECRET
// Optioneel: SUUNTO_SUBSCRIPTION_KEY (Ocp-Apim-Subscription-Key)

export const SUUNTO_AUTH_URL   = 'https://cloudapi-oauth.suunto.com/oauth/authorize'
export const SUUNTO_TOKEN_URL  = 'https://cloudapi-oauth.suunto.com/oauth/token'
export const SUUNTO_API_BASE   = 'https://cloudapi.suunto.com'

export function suuntoHeaders(accessToken) {
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json',
  }
  if (process.env.SUUNTO_SUBSCRIPTION_KEY) {
    headers['Ocp-Apim-Subscription-Key'] = process.env.SUUNTO_SUBSCRIPTION_KEY
  }
  return headers
}

// Suunto activityId → onze sport-namen
const SPORT_MAP = {
  1:   'hardlopen',   // Running
  2:   'fietsen',     // Cycling
  3:   'wandelen',    // Nordic walking
  4:   'overig',      // Ski touring
  5:   'overig',      // Other
  6:   'fitness',     // Fitness training
  7:   'zwemmen',     // Swimming
  8:   'overig',      // Triathlon
  16:  'wandelen',    // Hiking
  56:  'fitness',     // Gym
  58:  'yoga',        // Yoga
  82:  'hardlopen',   // Trail running (alt id)
  91:  'hardlopen',   // Trail running
  108: 'fietsen',     // Indoor cycling
  109: 'zwemmen',     // Open water swimming
  112: 'fitness',     // Strength training
  130: 'yoga',        // Pilates
}

function mapSport(activityId, activityName) {
  const n = (activityName || '').toLowerCase()
  if (/hyrox/.test(n))          return 'hyrox'
  if (/padel/.test(n))          return 'padel'
  if (/tennis/.test(n))         return 'tennis'
  if (/voetbal|soccer/.test(n)) return 'voetbal'
  if (/yoga/.test(n))           return 'yoga'
  if (/pilates/.test(n))        return 'yoga'
  return SPORT_MAP[activityId] || 'overig'
}

// Suunto feeling (1-5) → stemming (1-5) — schaal is gelijk
function mapFeeling(feeling) {
  const v = parseInt(feeling, 10)
  return (v >= 1 && v <= 5) ? v : null
}

export async function refreshSuuntoToken(sql, userId, refreshToken) {
  const res = await fetch(SUUNTO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     process.env.SUUNTO_CLIENT_ID,
      client_secret: process.env.SUUNTO_CLIENT_SECRET,
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Token refresh mislukt (${res.status}): ${txt.slice(0, 100)}`)
  }
  const data = await res.json()
  const expiry = new Date(Date.now() + (data.expires_in || 3600) * 1000)

  await sql`
    UPDATE user_profile SET
      suunto_access_token  = ${data.access_token},
      suunto_refresh_token = ${data.refresh_token || refreshToken},
      suunto_token_expiry  = ${expiry.toISOString()},
      updated_at = NOW()
    WHERE user_id = ${userId}
  `
  return data.access_token
}

export async function getValidToken(sql, userId) {
  const [p] = await sql`
    SELECT suunto_access_token, suunto_refresh_token, suunto_token_expiry
    FROM user_profile WHERE user_id = ${userId}
  `
  if (!p?.suunto_access_token) throw new Error('Suunto niet gekoppeld')

  const expiry = p.suunto_token_expiry ? new Date(p.suunto_token_expiry) : null
  const verlooptBinnenkort = !expiry || expiry < new Date(Date.now() + 5 * 60 * 1000)
  if (verlooptBinnenkort && p.suunto_refresh_token) {
    return await refreshSuuntoToken(sql, userId, p.suunto_refresh_token)
  }
  return p.suunto_access_token
}

// Lees veld uit workout — Suunto API geeft camelCase, sommige responses PascalCase
function field(w, ...keys) {
  for (const k of keys) {
    if (w[k] !== undefined && w[k] !== null) return w[k]
  }
  return null
}

export async function syncSuuntoForUser(sql, userId, accessToken) {
  const debug = {}

  const bestaand = await sql`
    SELECT suunto_id FROM trainingen
    WHERE user_id = ${userId} AND suunto_id IS NOT NULL
  `
  const bestaandeIds = new Set(bestaand.map(r => String(r.suunto_id)))

  let overgeslagen = 0
  const nieuweRijen = []

  const heeftBestaande = bestaandeIds.size > 0
  // Eerste sync: alles vanaf 2015. Daarna: laatste 90 dagen.
  const since = heeftBestaande
    ? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    : new Date(2015, 0, 1).toISOString()

  let nextUrl = `${SUUNTO_API_BASE}/v2/workouts?since=${encodeURIComponent(since)}&limit=100`

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: suuntoHeaders(accessToken) })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      debug.workouts_error = `${res.status}: ${txt.slice(0, 200)}`
      break
    }

    const data = await res.json()
    const workouts = Array.isArray(data) ? data : (data.payload ?? data.Items ?? data.workouts ?? [])
    nextUrl = (!Array.isArray(data) && (data.next || data.NextUrl)) ? (data.next || data.NextUrl) : null

    debug.workouts_received = (debug.workouts_received || 0) + workouts.length

    if (workouts.length === 0) break
    if (workouts[0]) {
      debug.sample = workouts[0]
      console.log('Suunto workout sample:', JSON.stringify(workouts[0]).slice(0, 500))
    }

    for (const w of workouts) {
      // workoutKey is de stabiele identifier in v2
      const id = String(
        field(w, 'workoutKey', 'WorkoutKey', 'id', 'Id') ?? ''
      )
      if (!id) continue
      if (bestaandeIds.has(id)) { overgeslagen++; continue }

      const startTime = field(w, 'startTime', 'StartTime') || ''
      const datum = startTime.slice(0, 10)
      if (!datum) continue

      // Duur in seconden
      const sec = parseFloat(field(w, 'totalTime', 'TotalTime', 'duration', 'Duration') ?? 0)
      const duur_min = sec > 0 ? Math.round(sec / 60) : null

      // Afstand meters → km
      const distM = parseFloat(field(w, 'totalDistance', 'TotalDistance', 'distance', 'Distance') ?? 0)
      const km = distM > 0 ? (distM / 1000).toFixed(1) : null

      const kcalRaw = field(w, 'totalCalories', 'TotalCalories', 'calories', 'Calories')
      const kcal = kcalRaw > 0 ? Math.round(kcalRaw) : null

      const gemHr = field(w, 'averageHeartRate', 'AverageHeartRate', 'avgHeartRate', 'avgHr')
      const maxHr = field(w, 'peakHeartRate', 'PeakHeartRate', 'maxHeartRate', 'MaxHeartRate', 'MaximumHeartRate')

      // Hoogtemeters (ascent in meters)
      const ascentRaw = field(w, 'totalAscent', 'TotalAscent', 'ascent', 'Ascent')
      const hoogtemeters = ascentRaw > 0 ? Math.round(ascentRaw) : null

      // Stemming: Suunto 'feeling' 1-5
      const stemming = mapFeeling(field(w, 'feeling', 'Feeling'))

      const activityId = field(w, 'activityId', 'ActivityId')
      const activityName = field(w, 'activityName', 'ActivityName') || ''
      const sport = mapSport(activityId, activityName)
      const titel = activityName || sport

      const notitiesParts = [titel]
      if (km) notitiesParts.push(`${km}km`)
      if (hoogtemeters) notitiesParts.push(`↑${hoogtemeters}m`)
      notitiesParts.push(`[suunto:${id}]`)

      nieuweRijen.push({
        user_id:      userId,
        datum,
        sport,
        duur_min,
        kcal,
        gem_hartslag: gemHr ? Math.round(gemHr) : null,
        max_hartslag: maxHr ? Math.round(maxHr) : null,
        stemming,
        notities:     notitiesParts.join(' — '),
        bron:         'suunto',
        suunto_id:    id,
        _km:          km,
        _titel:       titel,
        _hoogte:      hoogtemeters,
      })
    }
  }

  let gesynchroniseerd = 0
  const nieuweActiviteiten = []
  const BATCH = 200
  for (let i = 0; i < nieuweRijen.length; i += BATCH) {
    const batch = nieuweRijen.slice(i, i + BATCH)
    const insertRows = batch.map(({ _km, _titel, _hoogte, ...row }) => row)
    const result = await sql`
      INSERT INTO trainingen
        (user_id, datum, sport, duur_min, kcal, gem_hartslag, max_hartslag, stemming, notities, bron, suunto_id)
      VALUES ${sql(insertRows, 'user_id', 'datum', 'sport', 'duur_min', 'kcal', 'gem_hartslag', 'max_hartslag', 'stemming', 'notities', 'bron', 'suunto_id')}
      ON CONFLICT (user_id, suunto_id) WHERE suunto_id IS NOT NULL DO NOTHING
      RETURNING suunto_id
    `
    const ingevoerd = new Set(result.map(r => String(r.suunto_id)))
    for (const row of batch) {
      if (ingevoerd.has(String(row.suunto_id))) {
        nieuweActiviteiten.push({
          datum:        row.datum,
          sport:        row.sport,
          titel:        row._titel,
          duur_min:     row.duur_min,
          km:           row._km,
          kcal:         row.kcal,
          gem_hartslag: row.gem_hartslag,
          hoogte:       row._hoogte,
        })
      }
    }
    gesynchroniseerd += result.length
  }

  return { gesynchroniseerd, overgeslagen, nieuweActiviteiten, debug }
}
