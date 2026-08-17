// Shared Suunto Cloud API v2 logica
// Docs: https://cloudapi.suunto.com
// Response-structuur geverifieerd via /v2/workouts in mei 2026

import { suuntoSport, suuntoActivityTitle, sportUitNaam } from './_sports.js'

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

export function parseWorkout(w) {
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

  // Sport en titel. Suunto's eigen activityName is de betrouwbaarste bron
  // (matcht wat de Suunto-app toont); onze activityId-tabel is slechts fallback.
  const activityId = parseInt(w.activityId, 10)
  const suuntoNaam = w.activityName || w.activityType || w.workoutName || null
  const naamTekst = [suuntoNaam, w.name, w.description, summary?.description]
    .filter(Boolean).join(' ')
  // Titel: toon Suunto's eigen naam als die er is, anders onze id-tabel
  let titel = suuntoNaam || suuntoActivityTitle(activityId)
  // Sport-categorie: eerst uit de naam afleiden (betrouwbaar), anders id-tabel
  const sport = sportUitNaam(naamTekst) || suuntoSport(activityId)

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
    _activityName: suuntoNaam,
  }
}

export async function syncSuuntoForUser(sql, userId, accessToken, opts = {}) {
  const debug = {}

  const bestaand = await sql`
    SELECT suunto_id FROM trainingen
    WHERE user_id = ${userId} AND suunto_id IS NOT NULL
  `
  const bestaandeIds = new Set(bestaand.map(r => String(r.suunto_id)))

  let overgeslagen = 0
  const nieuweRijen = []

  // Suunto API gebruikt epoch ms voor since/until.
  // - Achtergrond-sync geeft een klein venster (opts.sindsDagen) → past in het
  //   functie-budget, geen afkap.
  // - Handmatige sync: volledige backfill (alles bij eerste keer, anders 90 dagen).
  const heeftBestaande = bestaandeIds.size > 0
  const sinceMs = opts.sindsDagen
    ? Date.now() - opts.sindsDagen * 86400_000
    : heeftBestaande
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
        debug.sport_mapping.push({ datum: parsed.datum, activityId: parsed._activityId, activityName: parsed._activityName, sport: parsed.sport })
      }

      if (bestaandeIds.has(parsed.suunto_id)) {
        // Al geïmporteerd — NIET de sport overschrijven: dat zou een handmatige
        // correctie ongedaan maken. Her-mappen gebeurt alleen bij 'Volledig
        // opnieuw' (die wist en herimporteert).
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

// ─── 24/7 data-aggregatie (webhook-payloads: slaap, activiteit, recovery) ──
// De aggregatie-functies hieronder verwerken zowel webhook-samples als (historisch)
// pull-samples — dezelfde entryData-structuur.

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
export function aggregateSleep(entries) {
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
export function aggregateActivity(entries) {
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
      kcal_actief:       saneKcal(v.joules > 0 ? v.joules / 4184 : null),
      rust_hartslag:     v.hrSlaap.length > 0 ? Math.round(Math.min(...v.hrSlaap)) : null,
      min_hartslag_dag:  v.hrDag.length   > 0 ? Math.round(Math.min(...v.hrDag))   : null,
    })
  }
  return out
}

// Actieve calorieën: fysiologische bovengrens ~8000 kcal/dag. Hogere waarden
// duiden op onbetrouwbare/provisorische samples (bv. lopende dag) → null.
function saneKcal(k) {
  if (k == null) return null
  const v = Math.round(parseFloat(k))
  return v > 0 && v <= 8000 ? v : null
}

// Recovery: balance + stress + HRV + hulpbronnen per dag
// hrv_ochtend  = nacht/ochtend venster 22-09 (Nightly Recharge, consistent met Suunto app)
// hrv_laatste  = meest recente meting van de dag (kan overdag zijn), met tijdstip
export function aggregateRecovery(entries) {
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

// ─── Gedeelde achtergrond-sync (één waarheid voor dashboard + coach) ───────
// Rate-limit via user_profile.suunto_laatste_sync — gezet NÁ succes, zodat een
// afgekapte/mislukte run niet 5 min lang blokkeert. Klein venster (14d workouts)
// zodat het binnen het functie-budget past; de volledige backfill zit in de
// handmatige sync (Instellingen). Gezondheidsdata (24/7) komt via webhooks.
export async function autoSyncSuunto(sql, userId, { maxMs = 8000 } = {}) {
  // Geen DDL in het hot path: de kolom bestaat al in productie. Alleen als de
  // SELECT faalt (verse DB) migreren we eenmalig en laten de volgende request het oppakken.
  let p
  try {
    [p] = await sql`SELECT suunto_laatste_sync FROM user_profile WHERE user_id = ${userId}`
  } catch {
    await sql`ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS suunto_laatste_sync TIMESTAMPTZ`.catch(() => {})
    return { skipped: 'migratie' }
  }
  const laatste = p?.suunto_laatste_sync ? new Date(p.suunto_laatste_sync).getTime() : 0
  if (Date.now() - laatste < 5 * 60 * 1000) return { skipped: 'recent' }

  const token = await getValidToken(sql, userId).catch(() => null)
  if (!token) return { skipped: 'geen_token' }

  // De grendel wordt pas na volledige voltooiing gezet. Wint de timeout, dan
  // blijft de grendel ongezet → een volgende request maakt idempotent af
  // (workout-inserts zijn ON CONFLICT DO NOTHING, wellness is COALESCE-upsert).
  // Alleen workouts via pull; gezondheidsdata komt via webhooks (suunto-webhook.js).
  const doSync = (async () => {
    await syncSuuntoForUser(sql, userId, token, { sindsDagen: 14 })
    await sql`UPDATE user_profile SET suunto_laatste_sync = NOW() WHERE user_id = ${userId}`
  })()

  await Promise.race([
    doSync.catch(() => {}),
    new Promise(res => setTimeout(res, maxMs)),
  ])
  return { ok: true }
}

// ─── Gedeelde insert/upsert helpers (gebruikt door pull-sync én webhooks) ───

// Voegt één workout-rij toe; dedup op (user_id, suunto_id). Geeft true als nieuw.
export async function insertWorkoutRow(sql, row) {
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
  return result.length > 0
}

// Upsert van wellness-dagen. Elke rij bevat 'datum' + een deelverzameling velden;
// COALESCE zorgt dat losse bronnen (slaap/activiteit/herstel) elkaar per dag
// aanvullen i.p.v. overschrijven. Geeft { nieuw, bijgewerkt } terug.
export async function upsertWellnessRows(sql, userId, rows) {
  if (!rows.length) return { nieuw: 0, bijgewerkt: 0 }
  const resultaten = await Promise.all(rows.map(row => sql`
    INSERT INTO dagelijkse_wellness
      (user_id, datum, slaap_uur, slaap_score, diepe_slaap_min, rem_slaap_min, lichte_slaap_min,
       hrv_ochtend, hrv_laatste, hrv_laatste_tijd,
       herstel_balans, stress_pct, rust_hartslag, min_hartslag_dag, stappen, kcal_actief, hulpbronnen_pct, bron)
    VALUES
      (${userId}, ${row.datum}, ${row.slaap_uur ?? null}, ${row.slaap_score ?? null}, ${row.diepe_slaap_min ?? null},
       ${row.rem_slaap_min ?? null}, ${row.lichte_slaap_min ?? null}, ${row.hrv_ochtend ?? null}, ${row.hrv_laatste ?? null}, ${row.hrv_laatste_tijd ?? null},
       ${row.herstel_balans ?? null}, ${row.stress_pct ?? null}, ${row.rust_hartslag ?? null}, ${row.min_hartslag_dag ?? null}, ${row.stappen ?? null}, ${row.kcal_actief ?? null}, ${row.hulpbronnen_pct ?? null}, 'suunto')
    ON CONFLICT (user_id, datum) DO UPDATE SET
      slaap_uur        = COALESCE(EXCLUDED.slaap_uur,        dagelijkse_wellness.slaap_uur),
      slaap_score      = COALESCE(EXCLUDED.slaap_score,      dagelijkse_wellness.slaap_score),
      diepe_slaap_min  = COALESCE(EXCLUDED.diepe_slaap_min,  dagelijkse_wellness.diepe_slaap_min),
      rem_slaap_min    = COALESCE(EXCLUDED.rem_slaap_min,    dagelijkse_wellness.rem_slaap_min),
      lichte_slaap_min = COALESCE(EXCLUDED.lichte_slaap_min, dagelijkse_wellness.lichte_slaap_min),
      hrv_ochtend      = COALESCE(EXCLUDED.hrv_ochtend,      dagelijkse_wellness.hrv_ochtend),
      hrv_laatste      = COALESCE(EXCLUDED.hrv_laatste,      dagelijkse_wellness.hrv_laatste),
      hrv_laatste_tijd = COALESCE(EXCLUDED.hrv_laatste_tijd, dagelijkse_wellness.hrv_laatste_tijd),
      herstel_balans   = COALESCE(EXCLUDED.herstel_balans,   dagelijkse_wellness.herstel_balans),
      stress_pct       = COALESCE(EXCLUDED.stress_pct,       dagelijkse_wellness.stress_pct),
      rust_hartslag    = COALESCE(EXCLUDED.rust_hartslag,    dagelijkse_wellness.rust_hartslag),
      min_hartslag_dag = COALESCE(EXCLUDED.min_hartslag_dag, dagelijkse_wellness.min_hartslag_dag),
      stappen          = COALESCE(EXCLUDED.stappen,          dagelijkse_wellness.stappen),
      kcal_actief      = COALESCE(EXCLUDED.kcal_actief,      dagelijkse_wellness.kcal_actief),
      hulpbronnen_pct  = COALESCE(EXCLUDED.hulpbronnen_pct,  dagelijkse_wellness.hulpbronnen_pct),
      bron             = EXCLUDED.bron,
      updated_at       = NOW()
    RETURNING (xmax = 0) AS nieuw
  `.catch(() => [])))
  let nieuw = 0, bijgewerkt = 0
  for (const r of resultaten) for (const row of r) row.nieuw ? nieuw++ : bijgewerkt++
  return { nieuw, bijgewerkt }
}

