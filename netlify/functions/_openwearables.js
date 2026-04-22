const OW_BASE = () => (process.env.OPENWEARABLES_API_URL || '').replace(/\/$/, '')
const OW_API_KEY = () => process.env.OPENWEARABLES_API_KEY

function owHeaders() {
  return {
    'X-Open-Wearables-API-Key': OW_API_KEY(),
    'Content-Type': 'application/json',
  }
}

export function isConfigured() {
  return !!(process.env.OPENWEARABLES_API_URL && process.env.OPENWEARABLES_API_KEY)
}

export const SUPPORTED_PROVIDERS = ['garmin', 'suunto', 'polar', 'whoop', 'oura']

export const PROVIDER_META = {
  garmin:  { label: 'Garmin',     kleur: '#006EBE', letter: 'G' },
  suunto:  { label: 'Suunto',     kleur: '#003882', letter: 'S' },
  polar:   { label: 'Polar',      kleur: '#D4001A', letter: 'P' },
  whoop:   { label: 'Whoop',      kleur: '#000000', letter: 'W' },
  oura:    { label: 'Oura Ring',  kleur: '#1C1C1E', letter: 'O' },
}

// Create OW user on first connect, returns the OW user_id
export async function ensureOwUser(sql, userId, userEmail) {
  const [profiel] = await sql`
    SELECT openwearables_user_id FROM user_profile WHERE user_id = ${userId}
  `
  if (profiel?.openwearables_user_id) return profiel.openwearables_user_id

  const res = await fetch(`${OW_BASE()}/api/v1/users`, {
    method: 'POST',
    headers: owHeaders(),
    body: JSON.stringify({ email: userEmail, external_id: String(userId) }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`OW gebruiker aanmaken mislukt: ${res.status} ${errText}`)
  }
  const owUser = await res.json()

  await sql`
    INSERT INTO user_profile (user_id, openwearables_user_id)
    VALUES (${userId}, ${owUser.id})
    ON CONFLICT (user_id) DO UPDATE SET openwearables_user_id = ${owUser.id}
  `
  return owUser.id
}

export async function getOwUserId(sql, userId) {
  const [profiel] = await sql`
    SELECT openwearables_user_id FROM user_profile WHERE user_id = ${userId}
  `
  return profiel?.openwearables_user_id ?? null
}

// Returns list of connected providers for an OW user
export async function getConnections(owUserId) {
  const res = await fetch(`${OW_BASE()}/api/v1/users/${owUserId}/connections`, {
    headers: owHeaders(),
  })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : (data.items ?? [])
}

// Disconnect a specific provider for an OW user
export async function disconnectProvider(owUserId, provider) {
  const res = await fetch(`${OW_BASE()}/api/v1/users/${owUserId}/connections/${provider}`, {
    method: 'DELETE',
    headers: owHeaders(),
  })
  return res.ok
}

// Returns the OW authorization URL for a provider
export async function getOAuthUrl(owUserId, provider, redirectUri) {
  const qs = new URLSearchParams({ user_id: owUserId, redirect_uri: redirectUri })
  const res = await fetch(`${OW_BASE()}/api/v1/oauth/${provider}/authorize?${qs}`, {
    headers: owHeaders(),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`OW OAuth URL ophalen mislukt: ${res.status} ${errText}`)
  }
  const data = await res.json()
  return data.authorization_url
}

export async function fetchActivitySummaries(owUserId, startDate, endDate) {
  const qs = new URLSearchParams({ start_date: startDate, end_date: endDate, limit: '100' })
  const res = await fetch(`${OW_BASE()}/api/v1/users/${owUserId}/summaries/activity?${qs}`, {
    headers: owHeaders(),
  })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : (data.items ?? [])
}

export async function fetchSleepSummaries(owUserId, startDate, endDate) {
  const qs = new URLSearchParams({ start_date: startDate, end_date: endDate, limit: '100' })
  const res = await fetch(`${OW_BASE()}/api/v1/users/${owUserId}/summaries/sleep?${qs}`, {
    headers: owHeaders(),
  })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : (data.items ?? [])
}

// Upsert sleep summaries into trainingen (sport = 'slaap', bron = 'openwearables')
export async function slaOwSleepOp(sql, userId, sleepItems) {
  let ingevoegd = 0
  for (const item of sleepItems) {
    const datum = item.date ?? item.start_time?.split('T')[0]
    if (!datum) continue

    const [bestaand] = await sql`
      SELECT id FROM trainingen
      WHERE user_id = ${userId} AND datum = ${datum}
        AND bron = 'openwearables' AND sport = 'slaap'
      LIMIT 1
    `
    if (bestaand) continue

    // Normalise duration: may come as seconds or hours depending on OW version
    const rawSec = item.total_sleep_duration_seconds ?? item.duration_seconds ?? null
    const rawHr  = item.total_duration_hours ?? item.sleep_duration_hours ?? item.duration_hours ?? null
    const slaap_uur = rawSec != null
      ? Math.round(rawSec / 360) / 10   // seconds → hours (1 decimal)
      : rawHr

    const slaapscore = item.sleep_score ?? item.score ?? null
    const hrvMs = item.hrv_avg ?? item.avg_hrv ?? item.hrv_rmssd ?? item.avg_hrv_ms ?? null

    await sql`
      INSERT INTO trainingen
        (user_id, datum, sport, slaap_uur, slaapscore, hrv_ochtend, bron, notities)
      VALUES
        (${userId}, ${datum}, 'slaap',
         ${slaap_uur ?? null},
         ${slaapscore != null ? Math.round(slaapscore) : null},
         ${hrvMs != null ? Math.round(hrvMs) : null},
         'openwearables',
         'Slaap — Open Wearables')
    `
    ingevoegd++
  }
  return ingevoegd
}

// Upsert daily activity summaries into trainingen (sport = 'activiteit', bron = 'openwearables')
export async function slaOwActiviteitOp(sql, userId, activityItems) {
  let ingevoegd = 0
  for (const item of activityItems) {
    const datum = item.date ?? item.start_time?.split('T')[0]
    if (!datum) continue

    const steps = item.total_steps ?? item.steps ?? null
    const kcal  = item.active_energy_kcal ?? item.calories_active ?? item.total_calories ?? null
    if (!steps && !kcal) continue   // skip empty days

    const [bestaand] = await sql`
      SELECT id FROM trainingen
      WHERE user_id = ${userId} AND datum = ${datum}
        AND bron = 'openwearables' AND sport = 'activiteit'
      LIMIT 1
    `
    if (bestaand) continue

    const gem_hr  = item.avg_heart_rate ?? item.heart_rate_avg ?? null
    const max_hr  = item.max_heart_rate ?? null
    const duurSec = item.total_active_duration_seconds ?? item.active_duration_seconds ?? null
    const duur_min = duurSec != null ? Math.round(duurSec / 60) : null

    const notitiesDelen = ['Dagelijkse activiteit']
    if (steps) notitiesDelen.push(`${Number(steps).toLocaleString('nl-NL')} stappen`)
    notitiesDelen.push('[ow:activiteit]')

    await sql`
      INSERT INTO trainingen
        (user_id, datum, sport, duur_min, kcal, gem_hartslag, max_hartslag, notities, bron)
      VALUES
        (${userId}, ${datum}, 'activiteit',
         ${duur_min},
         ${kcal != null ? Math.round(kcal) : null},
         ${gem_hr != null ? Math.round(gem_hr) : null},
         ${max_hr != null ? Math.round(max_hr) : null},
         ${notitiesDelen.join(' — ')},
         'openwearables')
    `
    ingevoegd++
  }
  return ingevoegd
}
