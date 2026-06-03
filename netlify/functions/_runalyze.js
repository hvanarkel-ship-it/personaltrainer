// Gedeelde Runalyze sync-logica — gebruikt door runalyze-sync (handmatig) en runalyze-cron (dagelijks)

import { runalyzeSport } from './_sports.js'

async function fetchWithTimeout(url, options, ms = 20000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

export async function syncRunalyzeForUser(sql, userId, token) {
  const headers = { 'token': token, 'Accept': 'application/json' }
  const debug = {}

  const bestaand = await sql`
    SELECT runalyze_id FROM trainingen
    WHERE user_id = ${userId} AND runalyze_id IS NOT NULL
  `
  const bestaandeIds = new Set(bestaand.map(r => String(r.runalyze_id)))

  let overgeslagen = 0
  let offset = 0
  const LIMIT = 100
  const nieuweRijen = []

  while (true) {
    const res = await fetchWithTimeout(
      `https://runalyze.com/api/v1/activities?limit=${LIMIT}&offset=${offset}`,
      { headers }
    )

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      debug.activities_error = `${res.status}: ${text.slice(0, 200)}`
      break
    }

    const data = await res.json()
    const activities = Array.isArray(data) ? data : (data.activities ?? data.data ?? [])
    if (!activities.length) break
    debug.activities_received = (debug.activities_received || 0) + activities.length

    for (const act of activities) {
      const id = String(act.id || act.ActivityId || '')
      if (!id) continue
      if (bestaandeIds.has(id)) { overgeslagen++; continue }

      const datum = (act.time || act.date || act.startTime || '').slice(0, 10)
      if (!datum) continue

      const sec = act.s ?? act.duration ?? act.timeInSeconds ?? 0
      const duur_min = sec > 0 ? Math.round(sec / 60) : null
      const km = parseFloat(act.km ?? act.distance ?? 0)
      const kcal = act.kcal > 0 ? Math.round(act.kcal) : null
      const gem_hr = act.pulse_avg ?? act.heartRateAvg ?? null
      const max_hr = act.pulse_max ?? act.heartRateMax ?? null
      const typeId = act.sport ?? act.sportId ?? act.typeId ?? null
      const sport = runalyzeSport(typeId, act.comment || act.title || '')
      const hrv = act.hrv ?? act.hrv_rmssd ?? null

      const titel = act.comment || act.title || sport
      const notitiesParts = [titel]
      if (km > 0) notitiesParts.push(`${km.toFixed(1)}km`)
      notitiesParts.push(`[runalyze:${id}]`)

      nieuweRijen.push({
        user_id: userId,
        datum, sport, duur_min,
        km: km > 0 ? km : null,
        kcal,
        gem_hartslag: gem_hr ? Math.round(gem_hr) : null,
        max_hartslag: max_hr ? Math.round(max_hr) : null,
        hrv_ochtend: hrv ? Math.round(hrv) : null,
        notities: notitiesParts.join(' — '),
        bron: 'runalyze',
        runalyze_id: id,
        _titel: titel,
      })
    }

    if (activities.length < LIMIT) break
    offset += LIMIT
  }

  let gesynchroniseerd = 0
  const nieuweActiviteiten = []
  const BATCH = 200
  for (let i = 0; i < nieuweRijen.length; i += BATCH) {
    const batch = nieuweRijen.slice(i, i + BATCH)
    const insertRows = batch.map(({ _titel, ...row }) => row)
    const result = await sql`
      INSERT INTO trainingen
        (user_id, datum, sport, duur_min, km, kcal, gem_hartslag, max_hartslag, hrv_ochtend, notities, bron, runalyze_id)
      VALUES ${sql(insertRows, 'user_id', 'datum', 'sport', 'duur_min', 'km', 'kcal', 'gem_hartslag', 'max_hartslag', 'hrv_ochtend', 'notities', 'bron', 'runalyze_id')}
      ON CONFLICT (user_id, runalyze_id) WHERE runalyze_id IS NOT NULL DO NOTHING
      RETURNING runalyze_id
    `
    const ingevoerdeIds = new Set(result.map(r => String(r.runalyze_id)))
    for (const row of batch) {
      if (ingevoerdeIds.has(String(row.runalyze_id))) {
        nieuweActiviteiten.push({
          datum: row.datum,
          sport: row.sport,
          titel: row._titel,
          duur_min: row.duur_min,
          km: row.km,
          kcal: row.kcal,
          gem_hartslag: row.gem_hartslag,
        })
      }
    }
    gesynchroniseerd += result.length
  }

  return { gesynchroniseerd, overgeslagen, nieuweActiviteiten, debug }
}
