// Shared Suunto Sports API v2 logica
// Docs: https://apizone.suunto.com (login required)
// Env vars nodig: SUUNTO_CLIENT_ID, SUUNTO_CLIENT_SECRET, SUUNTO_SUBSCRIPTION_KEY

// Suunto Cloud API OAuth2 endpoints
export const SUUNTO_AUTH_URL   = 'https://cloudapi-oauth.suunto.com/oauth/authorize'
export const SUUNTO_TOKEN_URL  = 'https://cloudapi-oauth.suunto.com/oauth/token'
export const SUUNTO_API_BASE   = 'https://cloudapi.suunto.com'

export function suuntoHeaders(accessToken) {
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json',
  }
  // Subscription key is alleen nodig als jouw Suunto API product 'm vereist
  if (process.env.SUUNTO_SUBSCRIPTION_KEY) {
    headers['Ocp-Apim-Subscription-Key'] = process.env.SUUNTO_SUBSCRIPTION_KEY
  }
  return headers
}

// Suunto ActivityId → onze sport-namen
// Volledige lijst: https://apizone.suunto.com/api-details#api=sports-api
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
  91:  'hardlopen',   // Trail running
  108: 'fietsen',     // Indoor cycling
  109: 'zwemmen',     // Open water swimming
}

function mapSport(activityId, sportName) {
  const n = (sportName || '').toLowerCase()
  if (/hyrox/.test(n))   return 'hyrox'
  if (/padel/.test(n))   return 'padel'
  if (/tennis/.test(n))  return 'tennis'
  if (/voetbal|soccer/.test(n)) return 'voetbal'
  return SPORT_MAP[activityId] || 'overig'
}

// Vernieuw access token met refresh token
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

// Haal geldig access token op — vernieuw automatisch als verlopen
export async function getValidToken(sql, userId) {
  const [p] = await sql`
    SELECT suunto_access_token, suunto_refresh_token, suunto_token_expiry
    FROM user_profile WHERE user_id = ${userId}
  `
  if (!p?.suunto_access_token) throw new Error('Suunto niet gekoppeld')

  // Vernieuw als token binnen 5 minuten verloopt
  const expiry = p.suunto_token_expiry ? new Date(p.suunto_token_expiry) : null
  const verlooptBinnenkort = !expiry || expiry < new Date(Date.now() + 5 * 60 * 1000)
  if (verlooptBinnenkort && p.suunto_refresh_token) {
    return await refreshSuuntoToken(sql, userId, p.suunto_refresh_token)
  }
  return p.suunto_access_token
}

// Sync alle Suunto workouts voor een user
export async function syncSuuntoForUser(sql, userId, accessToken) {
  const debug = {}

  // Haal bestaande Suunto IDs op om duplicates te vermijden
  const bestaand = await sql`
    SELECT suunto_id FROM trainingen
    WHERE user_id = ${userId} AND suunto_id IS NOT NULL
  `
  const bestaandeIds = new Set(bestaand.map(r => String(r.suunto_id)))

  let overgeslagen = 0
  const nieuweRijen = []

  // Suunto workouts ophalen (paginering via 'since' parameter)
  // Eerste keer: sync alles; daarna alleen nieuw (laatste 90 dagen is voldoende)
  const heeftBestaande = bestaandeIds.size > 0
  const since = heeftBestaande
    ? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    : new Date(2020, 0, 1).toISOString()

  let nextUrl = `${SUUNTO_API_BASE}/v2/workouts?since=${encodeURIComponent(since)}&limit=100`

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: suuntoHeaders(accessToken) })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      debug.workouts_error = `${res.status}: ${txt.slice(0, 200)}`
      break
    }

    const data = await res.json()
    // Suunto kan returnen als array of als { Items: [...], NextUrl: '...' }
    const workouts = Array.isArray(data) ? data : (data.Items ?? data.workouts ?? [])
    nextUrl = (!Array.isArray(data) && data.NextUrl) ? data.NextUrl : null

    debug.workouts_received = (debug.workouts_received || 0) + workouts.length

    if (workouts.length === 0) break
    if (workouts[0]) console.log('Suunto workout sample:', JSON.stringify(workouts[0]).slice(0, 300))

    for (const w of workouts) {
      const id = String(w.WorkoutKey || w.Id || '')
      if (!id) continue
      if (bestaandeIds.has(id)) { overgeslagen++; continue }

      // Datum: StartTime is UTC, gebruik lokale datum
      const startTime = w.StartTime || w.startTime || ''
      const datum = startTime.slice(0, 10)
      if (!datum) continue

      // Duur: TotalTime in seconden
      const sec = parseFloat(w.TotalTime ?? w.Duration ?? 0)
      const duur_min = sec > 0 ? Math.round(sec / 60) : null

      // Afstand: TotalDistance in meters → km
      const distM = parseFloat(w.TotalDistance ?? w.Distance ?? 0)
      const km = distM > 0 ? (distM / 1000).toFixed(1) : null

      const kcal = w.TotalCalories > 0 ? Math.round(w.TotalCalories) : null
      const gem_hr = w.AverageHeartRate ?? null
      const max_hr = w.MaximumHeartRate ?? null

      const sport = mapSport(w.ActivityId, w.ActivityName || '')
      const titel = w.ActivityName || sport

      const notitiesParts = [titel]
      if (km) notitiesParts.push(`${km}km`)
      notitiesParts.push(`[suunto:${id}]`)

      nieuweRijen.push({
        user_id:      userId,
        datum,
        sport,
        duur_min,
        kcal,
        gem_hartslag: gem_hr ? Math.round(gem_hr) : null,
        max_hartslag: max_hr ? Math.round(max_hr) : null,
        notities:     notitiesParts.join(' — '),
        bron:         'suunto',
        suunto_id:    id,
        _km:          km,
        _titel:       titel,
      })
    }
  }

  let gesynchroniseerd = 0
  const nieuweActiviteiten = []
  const BATCH = 200
  for (let i = 0; i < nieuweRijen.length; i += BATCH) {
    const batch = nieuweRijen.slice(i, i + BATCH)
    const insertRows = batch.map(({ _km, _titel, ...row }) => row)
    const result = await sql`
      INSERT INTO trainingen
        (user_id, datum, sport, duur_min, kcal, gem_hartslag, max_hartslag, notities, bron, suunto_id)
      VALUES ${sql(insertRows, 'user_id', 'datum', 'sport', 'duur_min', 'kcal', 'gem_hartslag', 'max_hartslag', 'notities', 'bron', 'suunto_id')}
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
        })
      }
    }
    gesynchroniseerd += result.length
  }

  return { gesynchroniseerd, overgeslagen, nieuweActiviteiten, debug }
}
