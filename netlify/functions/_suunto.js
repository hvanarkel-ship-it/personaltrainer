// Shared Suunto Cloud API v2 logica
// Docs: https://cloudapi.suunto.com
// Response-structuur geverifieerd via /v2/workouts in mei 2026

import { suuntoSport, suuntoActivityTitle } from './_sports.js'

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
  const km = distM > 0 ? Math.round(distM / 100) / 10 : null

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

  // Sport en titel — eerst op naam/omschrijving (vangt sportmodi waarvan het
  // activityId niet in onze map staat), daarna op activityId
  const activityId = parseInt(w.activityId, 10)
  const naamTekst = [w.workoutName, w.name, w.description, summary?.description]
    .filter(Boolean).join(' ').toLowerCase()
  let sport = suuntoSport(activityId)
  let titel = suuntoActivityTitle(activityId)
  const naamSport =
    /padel/.test(naamTekst)                    ? 'padel' :
    /hyrox|hyro x/.test(naamTekst)             ? 'hyrox' :
    /squash|badminton|tennis/.test(naamTekst)  ? 'tennis' :
    /voetbal|soccer/.test(naamTekst)           ? 'voetbal' : null
  if (naamSport && sport !== naamSport) {
    sport = naamSport
    titel = naamSport.charAt(0).toUpperCase() + naamSport.slice(1)
  }

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
  if (km)         notitiesParts.push(`${km.toFixed(1)}km`)
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
    km,
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
    _titel: titel,
    _hoogte: hoogte,
    _tss: tssRound,
    _activityId: activityId,
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

      // Debug: ruwe activityId + gekozen sport van recente workouts,
      // zodat foute mappings (bijv. padel → fitness) traceerbaar zijn
      if (!debug.sport_mapping) debug.sport_mapping = []
      if (debug.sport_mapping.length < 15) {
        debug.sport_mapping.push({ datum: parsed.datum, activityId: parsed._activityId, sport: parsed.sport })
      }

      if (bestaandeIds.has(parsed.suunto_id)) {
        // Zelfherstellend: corrigeer de sport van al geïmporteerde workouts
        // als de mapping inmiddels verbeterd is
        await sql`
          UPDATE trainingen SET sport = ${parsed.sport}
          WHERE user_id = ${userId} AND suunto_id = ${parsed.suunto_id}
            AND sport IS DISTINCT FROM ${parsed.sport}
        `
        overgeslagen++
        continue
      }
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
        (user_id, datum, sport, duur_min, km, kcal, gem_hartslag, max_hartslag,
         zone2_min, zone3_min, zone4_min, stemming, notities, bron, suunto_id)
      VALUES
        (${row.user_id}, ${row.datum}, ${row.sport}, ${row.duur_min}, ${row.km}, ${row.kcal},
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
        km:           row.km,
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
// Suunto levert per slaap MEERDERE snapshots met dezelfde SleepId (progressieve
// updates gedurende de nacht). Alleen de laatste snapshot bevat de definitieve
// waarden — zonder deze deduplicatie telt de slaapduur ~8x te hoog op en pakt
// een HRV-max een tussentijdse piek i.p.v. de eindwaarde die Suunto toont.
function aggregateSleep(entries) {
  // Stap 1: per SleepId alleen de meest recente snapshot bewaren
  const perSlaap = new Map()
  for (const e of entries || []) {
    const d = e?.entryData
    if (!d) continue
    if (d.IsNap) continue
    const key = d.SleepId ?? `${d.BedtimeStart || ''}|${d.BedtimeEnd || e.timestamp || ''}`
    const ts = new Date(e.timestamp || 0).getTime() || 0
    const cur = perSlaap.get(key)
    if (!cur || ts >= cur.ts) perSlaap.set(key, { ts, d, timestamp: e.timestamp })
  }

  // Stap 2: definitieve records per dag optellen (meerdere slaappjes per nacht kan)
  const perDag = new Map()
  for (const { d, timestamp } of perSlaap.values()) {
    const datum = localDate(d.BedtimeEnd || timestamp)
    if (!datum) continue

    const cur = perDag.get(datum) || {
      slaap_min: 0, score: 0, deep: 0, rem: 0, light: 0,
      hrv_max: 0, hrMin: null,
    }
    cur.slaap_min += (parseFloat(d.Duration)           || 0) / 60
    cur.deep      += (parseFloat(d.DeepSleepDuration)  || 0) / 60
    cur.rem       += (parseFloat(d.REMSleepDuration)   || 0) / 60
    cur.light     += (parseFloat(d.LightSleepDuration) || 0) / 60
    if (d.SleepQualityScore > cur.score) cur.score = d.SleepQualityScore

    // AvgHRV van het definitieve record — komt overeen met Suunto's HRV-kaart
    if (d.AvgHRV > cur.hrv_max) cur.hrv_max = d.AvgHRV

    // HRMin uit slaapdata is nauwkeuriger dan afgeleid uit activity-samples
    if (d.HRMin > 0 && (cur.hrMin === null || d.HRMin < cur.hrMin)) cur.hrMin = d.HRMin

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
      hrv_ochtend:      v.hrv_max > 0 ? Math.round(v.hrv_max) : null,
      rust_hartslag:    v.hrMin,
    })
  }
  return out
}

// Activity samples (per 10 min): aggregeer per dag
// - stappen = som StepCount
// - kcal = som EnergyConsumption (joules → kcal: /4184)
// - rust_hartslag  = min HR 03:00-06:00 (slaap)
// - min_hartslag_dag = min HR 09:00-22:00 (overdag, rust gemeten)
function aggregateActivity(entries) {
  const perDag = new Map()
  for (const e of entries || []) {
    const d = e?.entryData
    if (!d || !e.timestamp) continue
    const datum = localDate(e.timestamp)
    const uur = parseInt(String(e.timestamp).slice(11, 13), 10)
    const cur = perDag.get(datum) || { stappen: 0, joules: 0, hrSlaap: [], hrDag: [] }
    cur.stappen += parseInt(d.StepCount, 10) || 0
    cur.joules  += parseFloat(d.EnergyConsumption) || 0
    if (uur >= 3 && uur < 6 && d.HR > 30) cur.hrSlaap.push(d.HR)
    if (uur >= 9 && uur < 22 && d.HR > 30) cur.hrDag.push(d.HR)
    perDag.set(datum, cur)
  }
  const out = new Map()
  for (const [datum, v] of perDag) {
    out.set(datum, {
      stappen:           v.stappen   > 0 ? v.stappen : null,
      kcal_actief:       v.joules    > 0 ? Math.round(v.joules / 4184) : null,
      rust_hartslag:     v.hrSlaap.length > 0 ? Math.round(Math.min(...v.hrSlaap)) : null,
      min_hartslag_dag:  v.hrDag.length   > 0 ? Math.round(Math.min(...v.hrDag))   : null,
    })
  }
  return out
}

// Recovery: balance + stress + HRV + hulpbronnen per dag
// hrv_ochtend  = nacht/ochtend venster 22-09 (Nightly Recharge, consistent met Suunto app)
// hrv_laatste  = meest recente meting van de dag (kan overdag zijn), met tijdstip
function aggregateRecovery(entries) {
  const perDag = new Map()
  for (const e of entries || []) {
    const d = e?.entryData
    if (!d || !e.timestamp) continue
    const datum = localDate(e.timestamp)
    const uur = parseInt(String(e.timestamp).slice(11, 13), 10)
    const ts = new Date(e.timestamp).getTime()
    const cur = perDag.get(datum) || {
      nacht: { bal: [], stress: [], hrv: [], res: [] },
      recent: { bal: null, ts: 0, stress: null, hrv: null, res: null, tijd: null },
    }

    // HRV: Suunto gebruikt verschillende veldnamen afhankelijk van firmware
    const hrv = d.HRV ?? d.Hrv ?? d.HrvValue ?? d.AverageHRV ?? d.DailyHRV ?? null
    const res = d.Resources ?? d.BodyResources ?? d.Resource ?? d.Vitality ?? null

    // Meest recente meting bijhouden (voor hrv_laatste)
    if (ts > cur.recent.ts) {
      cur.recent.ts = ts
      cur.recent.tijd = String(e.timestamp).slice(11, 16) // "HH:MM" uit lokale timestamp
      if (typeof d.Balance === 'number') cur.recent.bal = d.Balance
      if (d.StressState >= 1 && d.StressState <= 4) cur.recent.stress = d.StressState
      if (hrv != null && hrv > 0) cur.recent.hrv = Math.round(hrv)
      if (res != null && res >= 0) cur.recent.res = Math.round(res)
    }

    // Nacht/ochtend venster (22:00-09:00) — Nightly Recharge window
    if (uur < 9 || uur >= 22) {
      if (typeof d.Balance === 'number') cur.nacht.bal.push(d.Balance)
      if (d.StressState >= 1 && d.StressState <= 4) cur.nacht.stress.push(d.StressState)
      if (hrv != null && hrv > 0) cur.nacht.hrv.push(Math.round(hrv))
      if (res != null && res >= 0) cur.nacht.res.push(Math.round(res))
    }

    perDag.set(datum, cur)
  }

  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length
  const out = new Map()
  for (const [datum, v] of perDag) {
    // Balance/stress/hulpbronnen zijn live-meters: Suunto toont de ACTUELE
    // waarde, geen nachtgemiddelde. Alleen HRV gebruikt het nachtvenster.
    const heeftNacht = v.nacht.hrv.length > 0
    const bal    = v.recent.bal
    const stress = v.recent.stress
    const hrv    = heeftNacht ? Math.round(avg(v.nacht.hrv)) : v.recent.hrv
    const res    = v.recent.res
    out.set(datum, {
      herstel_balans:  bal    != null ? Number(bal.toFixed(2))                : null,
      stress_pct:      stress != null ? Math.round((stress - 1) / 3 * 100)    : null,
      hrv_ochtend:     hrv,
      hrv_laatste:     v.recent.hrv,
      hrv_laatste_tijd: v.recent.hrv ? v.recent.tijd : null,
      hulpbronnen_pct: res,
    })
  }
  return out
}

export async function syncSuuntoWellnessForUser(sql, userId, accessToken, dagenTerug = 28) {
  const debug = {}
  // Suunto API max interval = 28 dagen
  const to = Date.now()
  const from = to - dagenTerug * 86400_000

  // Auto-migratie: zorg dat tabel en nieuwe kolommen bestaan
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
      hulpbronnen_pct INTEGER,
      bron TEXT DEFAULT 'suunto',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, datum)
    )
  `
  await sql`ALTER TABLE dagelijkse_wellness ADD COLUMN IF NOT EXISTS hulpbronnen_pct INTEGER`
  await sql`ALTER TABLE dagelijkse_wellness ADD COLUMN IF NOT EXISTS hrv_laatste INTEGER`
  await sql`ALTER TABLE dagelijkse_wellness ADD COLUMN IF NOT EXISTS hrv_laatste_tijd TEXT`
  await sql`ALTER TABLE dagelijkse_wellness ADD COLUMN IF NOT EXISTS min_hartslag_dag INTEGER`

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

  // Debug: welke HRV-velden zitten er in de recovery entries?
  const recoveryHrvVelden = { HRV: 0, Hrv: 0, HrvValue: 0, AverageHRV: 0, DailyHRV: 0, geen: 0 }
  for (const e of recovery || []) {
    const d = e?.entryData || {}
    if      (d.HRV        != null) recoveryHrvVelden.HRV++
    else if (d.Hrv        != null) recoveryHrvVelden.Hrv++
    else if (d.HrvValue   != null) recoveryHrvVelden.HrvValue++
    else if (d.AverageHRV != null) recoveryHrvVelden.AverageHRV++
    else if (d.DailyHRV   != null) recoveryHrvVelden.DailyHRV++
    else                           recoveryHrvVelden.geen++
  }
  debug.recovery_hrv_velden = recoveryHrvVelden

  // Debug: welke HRV-velden in sleep?
  const sleepHrvVelden = { AvgHRV: 0, MaxHRV: 0, geen: 0 }
  for (const e of sleep || []) {
    const d = e?.entryData || {}
    if (d.AvgHRV != null) sleepHrvVelden.AvgHRV++
    if (d.MaxHRV != null) sleepHrvVelden.MaxHRV++
    if (d.AvgHRV == null && d.MaxHRV == null) sleepHrvVelden.geen++
  }
  debug.sleep_hrv_velden = sleepHrvVelden

  // Debug: sample van recovery en sleep entry om veldnamen te zien
  const firstRecovery = recovery?.[0]?.entryData
  if (firstRecovery) debug.recovery_sample_keys = Object.keys(firstRecovery)
  const firstSleep = sleep?.[0]?.entryData
  if (firstSleep) debug.sleep_sample_keys = Object.keys(firstSleep)

  const slaapMap    = aggregateSleep(sleep)
  const activityMap = aggregateActivity(activity)
  const recoveryMap = aggregateRecovery(recovery)

  // Debug: HRV per dag (sleep vs recovery bron)
  const vandaag = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date())
  const recenteDagen = [...new Set([...slaapMap.keys(), ...recoveryMap.keys()])]
    .sort().slice(-3) // laatste 3 dagen
  debug.hrv_per_dag = recenteDagen.map(datum => ({
    datum,
    sleep_hrv_max: slaapMap.get(datum)?.hrv_ochtend ?? null,
    opgeslagen:    slaapMap.get(datum)?.hrv_ochtend ?? null,
  }))

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
      // HRV = max AvgHRV uit slaapfase-segmenten (consistent met Suunto Nightly Recharge).
      // Recovery endpoint bevat geen HRV (alleen Balance + StressState).
      hrv_ochtend:      s.hrv_ochtend ?? null,
      hrv_laatste:      r.hrv_laatste      ?? null,
      hrv_laatste_tijd: r.hrv_laatste_tijd ?? null,
      herstel_balans:   r.herstel_balans   ?? null,
      stress_pct:       r.stress_pct       ?? null,
      rust_hartslag:    s.rust_hartslag    ?? a.rust_hartslag ?? null,
      min_hartslag_dag: a.min_hartslag_dag ?? null,
      stappen:          a.stappen          ?? null,
      kcal_actief:      a.kcal_actief      ?? null,
      hulpbronnen_pct:  r.hulpbronnen_pct  ?? null,
      bron:             'suunto',
    })
  }

  let opgeslagen = 0
  for (const row of rows) {
    const res = await sql`
      INSERT INTO dagelijkse_wellness
        (user_id, datum, slaap_uur, slaap_score, diepe_slaap_min, rem_slaap_min, lichte_slaap_min,
         hrv_ochtend, hrv_laatste, hrv_laatste_tijd,
         herstel_balans, stress_pct, rust_hartslag, min_hartslag_dag, stappen, kcal_actief, hulpbronnen_pct, bron)
      VALUES
        (${row.user_id}, ${row.datum}, ${row.slaap_uur}, ${row.slaap_score}, ${row.diepe_slaap_min},
         ${row.rem_slaap_min}, ${row.lichte_slaap_min}, ${row.hrv_ochtend}, ${row.hrv_laatste}, ${row.hrv_laatste_tijd},
         ${row.herstel_balans}, ${row.stress_pct}, ${row.rust_hartslag}, ${row.min_hartslag_dag}, ${row.stappen}, ${row.kcal_actief}, ${row.hulpbronnen_pct}, ${row.bron})
      ON CONFLICT (user_id, datum) DO UPDATE SET
        slaap_uur        = COALESCE(EXCLUDED.slaap_uur,        dagelijkse_wellness.slaap_uur),
        slaap_score      = COALESCE(EXCLUDED.slaap_score,      dagelijkse_wellness.slaap_score),
        diepe_slaap_min  = COALESCE(EXCLUDED.diepe_slaap_min,  dagelijkse_wellness.diepe_slaap_min),
        rem_slaap_min    = COALESCE(EXCLUDED.rem_slaap_min,    dagelijkse_wellness.rem_slaap_min),
        lichte_slaap_min = COALESCE(EXCLUDED.lichte_slaap_min, dagelijkse_wellness.lichte_slaap_min),
        hrv_ochtend      = EXCLUDED.hrv_ochtend,
        hrv_laatste      = EXCLUDED.hrv_laatste,
        hrv_laatste_tijd = EXCLUDED.hrv_laatste_tijd,
        herstel_balans   = COALESCE(EXCLUDED.herstel_balans,   dagelijkse_wellness.herstel_balans),
        stress_pct       = COALESCE(EXCLUDED.stress_pct,       dagelijkse_wellness.stress_pct),
        rust_hartslag    = COALESCE(EXCLUDED.rust_hartslag,    dagelijkse_wellness.rust_hartslag),
        min_hartslag_dag = COALESCE(EXCLUDED.min_hartslag_dag, dagelijkse_wellness.min_hartslag_dag),
        stappen          = COALESCE(EXCLUDED.stappen,          dagelijkse_wellness.stappen),
        kcal_actief      = COALESCE(EXCLUDED.kcal_actief,      dagelijkse_wellness.kcal_actief),
        hulpbronnen_pct  = COALESCE(EXCLUDED.hulpbronnen_pct,  dagelijkse_wellness.hulpbronnen_pct),
        bron             = EXCLUDED.bron,
        updated_at       = NOW()
      RETURNING datum
    `
    opgeslagen += res.length
  }

  return { wellness_dagen: opgeslagen, debug }
}

