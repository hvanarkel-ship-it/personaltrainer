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
  for (const row of nieuweRijen) {
    const result = await sql`
      INSERT INTO trainingen
        (user_id, datum, sport, duur_min, kcal, gem_hartslag, max_hartslag,
         zone2_min, zone3_min, zone4_min, stemming, notities, bron, suunto_id)
      VALUES
        (${row.user_id}, ${row.datum}, ${row.sport}, ${row.duur_min}, ${row.kcal},
         ${row.gem_hartslag}, ${row.max_hartslag}, ${row.zone2_min}, ${row.zone3_min},
         ${row.zone4_min}, ${row.stemming}, ${row.notities}, ${row.bron}, ${row.suunto_id})
      ON CONFLICT (user_id, suunto_id) WHERE suunto_id IS NOT NULL DO NOTHING
      RETURNING suunto_id
    `
    if (result.length > 0) {
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
      gesynchroniseerd++
    }
  }

  return { gesynchroniseerd, overgeslagen, nieuweActiviteiten, debug }
}

// ─── 247samples API: slaap, activiteit (HR/stappen), recovery ──────────────

async function fetch247(path, accessToken) {
  const res = await fetch(`${SUUNTO_API_BASE}${path}`, { headers: suuntoHeaders(accessToken) })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`247 API ${path} faalde (${res.status}): ${txt.slice(0, 100)}`)
  }
  return res.json()
}

// Lokale datum uit ISO string met timezone offset (vb. "2026-05-03T23:36:00.000+02:00")
function localDate(iso) {
  if (!iso) return null
  return String(iso).slice(0, 10)
}

// Slaap aggregatie: hoofdslaap per nacht (IsNap=false), bedtimeEnd → datum
function aggregateSleep(entries) {
  const perDag = new Map() // datum → {slaap_min, score, deep, rem, light, hrv_sum, hrv_count}
  const gezien = new Set() // dedupe op SleepId

  for (const e of entries || []) {
    const d = e?.entryData
    if (!d) continue
    if (d.IsNap) continue
    if (d.SleepId && gezien.has(d.SleepId)) continue
    if (d.SleepId) gezien.add(d.SleepId)

    // Toewijzen aan datum waarop je opstond (bedtimeEnd) of timestamp
    const datum = localDate(d.BedtimeEnd || e.timestamp)
    if (!datum) continue

    const cur = perDag.get(datum) || { slaap_min: 0, score: 0, deep: 0, rem: 0, light: 0, hrv_sum: 0, hrv_count: 0 }
    const dur = parseFloat(d.Duration) || 0
    cur.slaap_min += dur / 60
    cur.deep  += (parseFloat(d.DeepSleepDuration)  || 0) / 60
    cur.rem   += (parseFloat(d.REMSleepDuration)   || 0) / 60
    cur.light += (parseFloat(d.LightSleepDuration) || 0) / 60
    if (d.SleepQualityScore > cur.score) cur.score = d.SleepQualityScore
    if (d.AvgHRV && d.AvgHRVSampleCount) {
      cur.hrv_sum   += d.AvgHRV * d.AvgHRVSampleCount
      cur.hrv_count += d.AvgHRVSampleCount
    } else if (d.AvgHRV) {
      cur.hrv_sum   += d.AvgHRV
      cur.hrv_count += 1
    }
    perDag.set(datum, cur)
  }

  const out = new Map()
  for (const [datum, v] of perDag) {
    out.set(datum, {
      slaap_uur:        v.slaap_min > 0 ? (v.slaap_min / 60).toFixed(1) : null,
      slaap_score:      v.score > 0 ? Math.round(v.score) : null,
      diepe_slaap_min:  v.deep  > 0 ? Math.round(v.deep)  : null,
      rem_slaap_min:    v.rem   > 0 ? Math.round(v.rem)   : null,
      lichte_slaap_min: v.light > 0 ? Math.round(v.light) : null,
      hrv_ochtend:      v.hrv_count > 0 ? Math.round(v.hrv_sum / v.hrv_count) : null,
    })
  }
  return out
}

// Activity samples (per 10 min): aggregeer per dag
// - stappen = som StepCount
// - kcal = som EnergyConsumption (joules → kcal: /4184)
// - rust_HR = min HR tussen 03:00-06:00 lokaal
function aggregateActivity(entries) {
  const perDag = new Map() // datum → {stappen, joules, hrSlaap: []}
  for (const e of entries || []) {
    const d = e?.entryData
    if (!d || !e.timestamp) continue
    const datum = localDate(e.timestamp)
    const uur = parseInt(String(e.timestamp).slice(11, 13), 10)
    const cur = perDag.get(datum) || { stappen: 0, joules: 0, hrSlaap: [] }
    cur.stappen += parseInt(d.StepCount, 10) || 0
    cur.joules  += parseFloat(d.EnergyConsumption) || 0
    if (uur >= 3 && uur < 6 && d.HR > 30) cur.hrSlaap.push(d.HR)
    perDag.set(datum, cur)
  }
  const out = new Map()
  for (const [datum, v] of perDag) {
    const hr = v.hrSlaap.length > 0 ? Math.round(Math.min(...v.hrSlaap)) : null
    out.set(datum, {
      stappen:       v.stappen > 0 ? v.stappen : null,
      kcal_actief:   v.joules  > 0 ? Math.round(v.joules / 4184) : null,
      rust_hartslag: hr,
    })
  }
  return out
}

// Recovery: balance + stress per dag
// Vandaag → meest recente meting (hele dag); historisch → ochtend 04-09 gemiddelde
function aggregateRecovery(entries, vandaag) {
  // datum → { ochtend: {bal[], stress[]}, recent: {bal, ts, stress} }
  const perDag = new Map()
  for (const e of entries || []) {
    const d = e?.entryData
    if (!d || !e.timestamp) continue
    const datum = localDate(e.timestamp)
    const uur = parseInt(String(e.timestamp).slice(11, 13), 10)
    const ts = new Date(e.timestamp).getTime()
    const cur = perDag.get(datum) || { ochtend: { bal: [], stress: [] }, recent: { bal: null, ts: 0, stress: null } }

    // Meest recente waarde altijd bijhouden (voor vandaag)
    if (typeof d.Balance === 'number' && ts > cur.recent.ts) {
      cur.recent.bal = d.Balance
      cur.recent.ts  = ts
    }
    if (d.StressState >= 1 && d.StressState <= 4 && ts > cur.recent.ts) {
      cur.recent.stress = d.StressState
    }

    // Ochtend aggregatie (04-09) voor historische dagen
    if (uur >= 4 && uur < 9) {
      if (typeof d.Balance === 'number') cur.ochtend.bal.push(d.Balance)
      if (d.StressState >= 1 && d.StressState <= 4) cur.ochtend.stress.push(d.StressState)
    }

    perDag.set(datum, cur)
  }

  const out = new Map()
  for (const [datum, v] of perDag) {
    let avgBal, avgStress
    if (datum === vandaag) {
      // Vandaag: actuele stand (meest recente meting, ongeacht tijdstip)
      avgBal    = v.recent.bal
      avgStress = v.recent.stress
    } else {
      // Historisch: ochtenddoorsneede (fysiologisch meest betekenisvol)
      avgBal    = v.ochtend.bal.length    > 0 ? v.ochtend.bal.reduce((a,b)=>a+b,0)    / v.ochtend.bal.length    : null
      avgStress = v.ochtend.stress.length > 0 ? v.ochtend.stress.reduce((a,b)=>a+b,0) / v.ochtend.stress.length : null
    }
    out.set(datum, {
      herstel_balans: avgBal    != null ? Number(avgBal.toFixed(2))                   : null,
      stress_pct:     avgStress != null ? Math.round((avgStress - 1) / 3 * 100)       : null,
    })
  }
  return out
}

export async function syncSuuntoWellnessForUser(sql, userId, accessToken, dagenTerug = 28) {
  const debug = {}
  // Suunto API max interval = 28 dagen
  const to = Date.now()
  const from = to - dagenTerug * 86400_000

  // Auto-migratie: zorg dat tabel bestaat
  await sql`
    CREATE TABLE IF NOT EXISTS dagelijkse_wellness (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      datum DATE NOT NULL,
      slaap_uur NUMERIC(4,1),
      slaap_score INTEGER,
      diepe_slaap_min INTEGER,
      rem_slaap_min INTEGER,
      lichte_slaap_min INTEGER,
      hrv_ochtend INTEGER,
      herstel_balans NUMERIC(4,2),
      stress_pct INTEGER,
      rust_hartslag INTEGER,
      stappen INTEGER,
      kcal_actief INTEGER,
      bron TEXT DEFAULT 'suunto',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, datum)
    )
  `

  let sleep = [], activity = [], recovery = []
  try { sleep    = await fetch247(`/247samples/sleep?from=${from}&to=${to}`, accessToken) }
  catch (e) { debug.sleep_error = e.message }
  try { activity = await fetch247(`/247samples/activity?from=${from}&to=${to}`, accessToken) }
  catch (e) { debug.activity_error = e.message }
  try { recovery = await fetch247(`/247samples/recovery?from=${from}&to=${to}`, accessToken) }
  catch (e) { debug.recovery_error = e.message }

  debug.sleep_entries    = sleep.length
  debug.activity_entries = activity.length
  debug.recovery_entries = recovery.length

  // Vandaag in lokale tijd (YYYY-MM-DD) — zelfde formaat als de timestamps in de API
  const vandaagLokaal = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date())

  const slaapMap    = aggregateSleep(sleep)
  const activityMap = aggregateActivity(activity)
  const recoveryMap = aggregateRecovery(recovery, vandaagLokaal)

  // Unie van alle datums
  const allDates = new Set([...slaapMap.keys(), ...activityMap.keys(), ...recoveryMap.keys()])
  const rows = []
  for (const datum of allDates) {
    const s = slaapMap.get(datum)    || {}
    const a = activityMap.get(datum) || {}
    const r = recoveryMap.get(datum) || {}
    rows.push({
      user_id:          userId,
      datum,
      slaap_uur:        s.slaap_uur        ?? null,
      slaap_score:      s.slaap_score      ?? null,
      diepe_slaap_min:  s.diepe_slaap_min  ?? null,
      rem_slaap_min:    s.rem_slaap_min    ?? null,
      lichte_slaap_min: s.lichte_slaap_min ?? null,
      hrv_ochtend:      s.hrv_ochtend      ?? null,
      herstel_balans:   r.herstel_balans   ?? null,
      stress_pct:       r.stress_pct       ?? null,
      rust_hartslag:    a.rust_hartslag    ?? null,
      stappen:          a.stappen          ?? null,
      kcal_actief:      a.kcal_actief      ?? null,
      bron:             'suunto',
    })
  }

  let opgeslagen = 0
  for (const row of rows) {
    const res = await sql`
      INSERT INTO dagelijkse_wellness
        (user_id, datum, slaap_uur, slaap_score, diepe_slaap_min, rem_slaap_min, lichte_slaap_min,
         hrv_ochtend, herstel_balans, stress_pct, rust_hartslag, stappen, kcal_actief, bron)
      VALUES
        (${row.user_id}, ${row.datum}, ${row.slaap_uur}, ${row.slaap_score}, ${row.diepe_slaap_min},
         ${row.rem_slaap_min}, ${row.lichte_slaap_min}, ${row.hrv_ochtend}, ${row.herstel_balans},
         ${row.stress_pct}, ${row.rust_hartslag}, ${row.stappen}, ${row.kcal_actief}, ${row.bron})
      ON CONFLICT (user_id, datum) DO UPDATE SET
        slaap_uur        = COALESCE(EXCLUDED.slaap_uur,        dagelijkse_wellness.slaap_uur),
        slaap_score      = COALESCE(EXCLUDED.slaap_score,      dagelijkse_wellness.slaap_score),
        diepe_slaap_min  = COALESCE(EXCLUDED.diepe_slaap_min,  dagelijkse_wellness.diepe_slaap_min),
        rem_slaap_min    = COALESCE(EXCLUDED.rem_slaap_min,    dagelijkse_wellness.rem_slaap_min),
        lichte_slaap_min = COALESCE(EXCLUDED.lichte_slaap_min, dagelijkse_wellness.lichte_slaap_min),
        hrv_ochtend      = COALESCE(EXCLUDED.hrv_ochtend,      dagelijkse_wellness.hrv_ochtend),
        herstel_balans   = COALESCE(EXCLUDED.herstel_balans,   dagelijkse_wellness.herstel_balans),
        stress_pct       = COALESCE(EXCLUDED.stress_pct,       dagelijkse_wellness.stress_pct),
        rust_hartslag    = COALESCE(EXCLUDED.rust_hartslag,    dagelijkse_wellness.rust_hartslag),
        stappen          = COALESCE(EXCLUDED.stappen,          dagelijkse_wellness.stappen),
        kcal_actief      = COALESCE(EXCLUDED.kcal_actief,      dagelijkse_wellness.kcal_actief),
        bron             = EXCLUDED.bron,
        updated_at       = NOW()
      RETURNING datum
    `
    opgeslagen += res.length
  }

  return { wellness_dagen: opgeslagen, debug }
}

