// Shared Suunto Cloud API v2 logica
// Docs: https://cloudapi.suunto.com
// Response-structuur geverifieerd via /v2/workouts in mei 2026

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
// Bron: Suunto Sports API v2 activiteitenlijst
const SPORT_MAP = {
  0:   'overig',     // Other
  1:   'wandelen',   // Walking
  2:   'fietsen',    // Cycling
  3:   'overig',     // Cross-country skiing
  5:   'fitness',    // Other indoor
  6:   'overig',     // Mountain biking (oude id)
  10:  'overig',     // Triathlon
  11:  'fietsen',    // Mountain biking
  12:  'wandelen',   // Hiking
  13:  'overig',     // Roller skating
  14:  'overig',     // Downhill skiing
  15:  'overig',     // Paddling
  16:  'overig',     // Rowing
  17:  'overig',     // Golf
  18:  'fitness',    // Indoor
  20:  'overig',     // Ball games
  21:  'fitness',    // Outdoor gym
  22:  'zwemmen',    // Swimming
  23:  'hardlopen',  // Trail running
  24:  'fitness',    // Gym
  25:  'wandelen',   // Nordic walking
  29:  'overig',     // Water sports
  30:  'overig',     // Climbing
  31:  'overig',     // Snowboarding
  33:  'fitness',    // Fitness class
  34:  'voetbal',    // Soccer
  35:  'tennis',     // Tennis
  37:  'overig',     // Badminton
  53:  'hardlopen',  // Running (newer id)
  56:  'fitness',    // Strength training
  58:  'yoga',       // Yoga
  75:  'fitness',    // Strength / functional training
  82:  'hardlopen',  // Trail running (alt)
  91:  'hardlopen',  // Trail running
  108: 'fietsen',    // Indoor cycling
  109: 'zwemmen',    // Open water swimming
  112: 'fitness',
  130: 'yoga',       // Pilates
}

// Naam van het activiteitstype voor de titel
const ACTIVITY_NAMES = {
  0: 'Activiteit', 1: 'Wandelen', 2: 'Fietsen', 3: 'Langlaufen',
  11: 'Mountainbiken', 12: 'Hiken', 18: 'Indoor training', 21: 'Outdoor gym',
  22: 'Zwemmen', 23: 'Trailrunning', 24: 'Gym', 25: 'Nordic walking',
  30: 'Klimmen', 33: 'Fitness class', 34: 'Voetbal', 35: 'Tennis',
  53: 'Hardlopen', 56: 'Krachttraining', 58: 'Yoga', 75: 'Functional training',
  82: 'Trailrun', 91: 'Trailrun', 108: 'Indoor fietsen', 109: 'Open water zwemmen',
  130: 'Pilates',
}

function mapSport(activityId) {
  return SPORT_MAP[activityId] || 'overig'
}

function activityTitle(activityId) {
  return ACTIVITY_NAMES[activityId] || `Suunto activiteit ${activityId}`
}

// Vind extensie op type binnen workout
function ext(w, type) {
  const exts = Array.isArray(w?.extensions) ? w.extensions : []
  return exts.find(e => e?.type === type) || null
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

// Converteer Unix ms + timezone offset (minuten) → lokale YYYY-MM-DD
function localDateFromMs(ms, offsetMinutes = 0) {
  if (!ms) return null
  const d = new Date(ms + (offsetMinutes || 0) * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

function parseWorkout(w) {
  const id = String(w.workoutKey || '')
  if (!id) return null

  const startMs = parseInt(w.startTime, 10)
  const offset = parseInt(w.timeOffsetInMinutes, 10) || 0
  const datum = localDateFromMs(startMs, offset)
  if (!datum) return null

  const sec = parseFloat(w.totalTime) || 0
  const duur_min = sec > 0 ? Math.round(sec / 60) : null

  const distM = parseFloat(w.totalDistance) || 0
  const km = distM > 0 ? (distM / 1000).toFixed(1) : null

  const kcalRaw = parseFloat(w.energyConsumption) || 0
  const kcal = kcalRaw > 0 ? Math.round(kcalRaw) : null

  // HR uit hrdata blok
  const hrAvg = parseFloat(w.hrdata?.workoutAvgHR ?? w.hrdata?.avg) || 0
  const hrMax = parseFloat(w.hrdata?.workoutMaxHR ?? w.hrdata?.hrmax ?? w.hrdata?.max) || 0
  const gem_hartslag = hrAvg > 0 ? Math.round(hrAvg) : null
  const max_hartslag = hrMax > 0 ? Math.round(hrMax) : null

  // Hoogtemeters
  const ascent = parseFloat(w.totalAscent) || 0
  const hoogte = ascent > 0 ? Math.round(ascent) : null

  // Stemming uit SummaryExtension.feeling (1-5)
  const summary = ext(w, 'SummaryExtension')
  const feeling = parseInt(summary?.feeling, 10)
  const stemming = (feeling >= 1 && feeling <= 5) ? feeling : null

  // HR-zones (seconden → minuten). Suunto: zone1=rust, zone2=L1, zone3=L2, zone4=L3, zone5=L4/5
  // Wij gebruiken zone2_min (L2), zone3_min (L3), zone4_min (L4+L5)
  const intens = ext(w, 'IntensityExtension')
  const hrZones = intens?.zones?.heartRate
  const z2 = parseFloat(hrZones?.zone3?.totalTime) || 0
  const z3 = parseFloat(hrZones?.zone4?.totalTime) || 0
  const z4 = parseFloat(hrZones?.zone5?.totalTime) || 0
  const zone2_min = z2 > 0 ? Math.round(z2 / 60) : null
  const zone3_min = z3 > 0 ? Math.round(z3 / 60) : null
  const zone4_min = z4 > 0 ? Math.round(z4 / 60) : null

  // TSS
  const tss = parseFloat(w.tss?.trainingStressScore) || 0
  const tssRound = tss > 0 ? Math.round(tss) : null

  // Sport en titel
  const activityId = parseInt(w.activityId, 10)
  const sport = mapSport(activityId)
  const titel = activityTitle(activityId)

  // Pace voor hardlopen: totaalSec / 1000 / distM = sec per meter → omkeren naar min/km
  let pace = null
  if (sport === 'hardlopen' && distM > 0 && sec > 0) {
    const secPerKm = sec / (distM / 1000)
    const m = Math.floor(secPerKm / 60)
    const s = Math.round(secPerKm % 60).toString().padStart(2, '0')
    pace = `${m}:${s}/km`
  }
  // Snelheid voor fietsen
  let kmh = null
  if (sport === 'fietsen' && distM > 0 && sec > 0) {
    kmh = ((distM / 1000) / (sec / 3600)).toFixed(1)
  }

  const notitiesParts = [titel]
  if (km)         notitiesParts.push(`${km}km`)
  if (pace)       notitiesParts.push(pace)
  if (kmh)        notitiesParts.push(`${kmh}km/u`)
  if (hoogte)     notitiesParts.push(`↑${hoogte}m`)
  if (tssRound)   notitiesParts.push(`TSS ${tssRound}`)
  notitiesParts.push(`[suunto:${id}]`)

  return {
    user_id_placeholder: true,
    datum,
    sport,
    duur_min,
    kcal,
    gem_hartslag,
    max_hartslag,
    zone2_min,
    zone3_min,
    zone4_min,
    stemming,
    notities: notitiesParts.join(' — '),
    bron: 'suunto',
    suunto_id: id,
    _km: km,
    _titel: titel,
    _hoogte: hoogte,
    _tss: tssRound,
  }
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

  // Suunto API gebruikt epoch ms voor since/until
  const heeftBestaande = bestaandeIds.size > 0
  const sinceMs = heeftBestaande
    ? Date.now() - 90 * 24 * 60 * 60 * 1000
    : new Date(2015, 0, 1).getTime()

  let nextUrl = `${SUUNTO_API_BASE}/v2/workouts?since=${sinceMs}&limit=100`

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: suuntoHeaders(accessToken) })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      debug.workouts_error = `${res.status}: ${txt.slice(0, 200)}`
      break
    }

    const data = await res.json()
    const workouts = Array.isArray(data?.payload) ? data.payload
                   : Array.isArray(data) ? data
                   : (data?.Items ?? data?.workouts ?? [])
    nextUrl = data?.metadata?.next || data?.next || null

    debug.workouts_received = (debug.workouts_received || 0) + workouts.length

    if (workouts.length === 0) break

    for (const w of workouts) {
      const parsed = parseWorkout(w)
      if (!parsed) continue
      if (bestaandeIds.has(parsed.suunto_id)) { overgeslagen++; continue }
      parsed.user_id_placeholder = false
      nieuweRijen.push({ ...parsed, user_id: userId })
    }

    // Veiligheid: stop als geen next link
    if (!nextUrl) break
  }

  let gesynchroniseerd = 0
  const nieuweActiviteiten = []
  const BATCH = 200
  for (let i = 0; i < nieuweRijen.length; i += BATCH) {
    const batch = nieuweRijen.slice(i, i + BATCH)
    const insertRows = batch.map(({ _km, _titel, _hoogte, _tss, user_id_placeholder, ...row }) => row)
    const result = await sql`
      INSERT INTO trainingen
        (user_id, datum, sport, duur_min, kcal, gem_hartslag, max_hartslag,
         zone2_min, zone3_min, zone4_min, stemming, notities, bron, suunto_id)
      VALUES ${sql(insertRows,
        'user_id', 'datum', 'sport', 'duur_min', 'kcal', 'gem_hartslag', 'max_hartslag',
        'zone2_min', 'zone3_min', 'zone4_min', 'stemming', 'notities', 'bron', 'suunto_id')}
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
          tss:          row._tss,
        })
      }
    }
    gesynchroniseerd += result.length
  }

  return { gesynchroniseerd, overgeslagen, nieuweActiviteiten, debug }
}
