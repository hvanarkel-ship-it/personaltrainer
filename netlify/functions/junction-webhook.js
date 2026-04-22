import { getDb } from './_db.js'
import crypto from 'crypto'

// Junction sport slug → onze sport categorieën
const SPORT_MAP = {
  running: 'hardlopen', trail_running: 'hardlopen', virtual_run: 'hardlopen',
  treadmill_running: 'hardlopen', track_running: 'hardlopen',
  cycling: 'fietsen', mountain_biking: 'fietsen', virtual_cycling: 'fietsen',
  e_bike_cycling: 'fietsen', gravel_cycling: 'fietsen', road_cycling: 'fietsen',
  swimming: 'zwemmen', open_water_swimming: 'zwemmen', pool_swimming: 'zwemmen',
  strength_training: 'fitness', weight_training: 'fitness', crossfit: 'fitness',
  elliptical: 'fitness', stair_climbing: 'fitness', hiit: 'fitness',
  yoga: 'yoga', pilates: 'yoga',
  walking: 'wandelen', hiking: 'wandelen', indoor_walking: 'wandelen',
  tennis: 'tennis', padel: 'padel', squash: 'padel', badminton: 'padel',
  soccer: 'voetbal', football: 'voetbal',
}

function verifyWebhook(rawBody, headers, secret) {
  const svixId = headers['svix-id']
  const svixTimestamp = headers['svix-timestamp']
  const svixSignature = headers['svix-signature']
  if (!svixId || !svixTimestamp || !svixSignature) return false

  const ts = parseInt(svixTimestamp)
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return false

  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`
  const secretBase64 = secret.startsWith('whsec_') ? secret.slice(6) : secret
  const key = Buffer.from(secretBase64, 'base64')
  const computed = crypto.createHmac('sha256', key).update(toSign).digest('base64')

  return svixSignature.split(' ').some(part => {
    const [, sig] = part.split(',')
    return sig === computed
  })
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  const rawBody = event.body
  const headers = event.headers

  const webhookSecret = process.env.JUNCTION_WEBHOOK_SECRET
  if (webhookSecret && !verifyWebhook(rawBody, headers, webhookSecret)) {
    console.error('Junction webhook handtekening ongeldig')
    return { statusCode: 401, body: 'Unauthorized' }
  }

  const sql = getDb()

  try {
    // Zorg dat junction_id kolom bestaat
    await sql`ALTER TABLE trainingen ADD COLUMN IF NOT EXISTS junction_id TEXT`

    const payload = JSON.parse(rawBody)
    const { event_type, client_user_id, data } = payload

    // client_user_id = "apex_{userId}"
    const userId = parseInt((client_user_id || '').replace('apex_', ''))
    if (!userId || isNaN(userId)) return { statusCode: 200, body: 'ok' }

    if (event_type === 'daily.data.sleep.created' || event_type === 'daily.data.sleep.updated') {
      await verwerkSlaap(sql, userId, data)
    } else if (event_type === 'daily.data.workouts.created' || event_type === 'daily.data.workouts.updated') {
      await verwerkWorkout(sql, userId, data)
    } else if (event_type === 'daily.data.hrv.created' || event_type === 'daily.data.hrv.updated') {
      await verwerkHrv(sql, userId, data)
    } else if (event_type === 'provider.connection.created') {
      console.log(`Junction provider verbonden: ${data?.provider?.slug} voor user ${userId}`)
    }
    // historical.data.*.created: zelfde handlers, data formaat identiek

    return { statusCode: 200, body: JSON.stringify({ ontvangen: true }) }
  } catch (err) {
    console.error('Junction webhook fout:', err)
    return { statusCode: 200, body: 'error logged' } // Altijd 200 — geen onnodige retries
  }
}

async function verwerkSlaap(sql, userId, data) {
  const datum = data.calendar_date
  if (!datum) return

  // Seconden → uren (1 decimaal), slaap = daadwerkelijke slaaptijd (niet totale periode)
  const slaapUur = data.total ? Math.round((data.total / 3600) * 10) / 10 : null
  const hrv = data.average_hrv ? Math.round(data.average_hrv) : null
  const score = data.score || null
  const provider = data.source?.name || 'Junction'
  const junctionId = `sleep_${data.id}`

  const [existing] = await sql`
    SELECT id FROM trainingen WHERE user_id = ${userId} AND junction_id = ${junctionId} LIMIT 1
  `
  if (existing) {
    await sql`
      UPDATE trainingen SET slaap_uur = ${slaapUur}, hrv_ochtend = ${hrv}, slaapscore = ${score}
      WHERE id = ${existing.id}
    `
    return
  }

  // Zoek herstelrij zonder junction_id op dezelfde datum
  const [datumRij] = await sql`
    SELECT id FROM trainingen
    WHERE user_id = ${userId} AND datum = ${datum} AND sport = 'herstel' AND junction_id IS NULL
    LIMIT 1
  `
  if (datumRij) {
    await sql`
      UPDATE trainingen SET
        slaap_uur = ${slaapUur}, hrv_ochtend = COALESCE(hrv_ochtend, ${hrv}),
        slaapscore = ${score}, junction_id = ${junctionId}
      WHERE id = ${datumRij.id}
    `
  } else {
    await sql`
      INSERT INTO trainingen (user_id, datum, sport, slaap_uur, hrv_ochtend, slaapscore, bron, notities, junction_id)
      VALUES (${userId}, ${datum}, 'herstel', ${slaapUur}, ${hrv}, ${score},
        'junction', ${`Slaap via ${provider}`}, ${junctionId})
      ON CONFLICT DO NOTHING
    `
  }
}

async function verwerkWorkout(sql, userId, data) {
  const datum = data.calendar_date
  if (!datum) return

  const junctionId = `workout_${data.id}`
  const titel = (data.title || '').toLowerCase()
  const sportSlug = (data.sport?.slug || '').toLowerCase()

  const sport = /hyrox/.test(titel) ? 'hyrox' : (SPORT_MAP[sportSlug] || 'overig')
  const duurMin = data.moving_time ? Math.round(data.moving_time / 60) : null
  const gemHr = data.average_hr ? Math.round(data.average_hr) : null
  const maxHr = data.max_hr ? Math.round(data.max_hr) : null
  const kcal = data.calories ? Math.round(data.calories) : null
  const afstandKm = data.distance ? (data.distance / 1000).toFixed(1) : null
  const provider = data.source?.name || 'Junction'

  // hr_zones: array van seconden per zone [<50%, 50-60%, 60-70%, 70-80%, 80-90%, 90%+]
  const zones = Array.isArray(data.hr_zones) ? data.hr_zones : []
  const zone2Min = zones[2] ? Math.round(zones[2] / 60) : null
  const zone3Min = zones[3] ? Math.round(zones[3] / 60) : null
  const zone4Sec = (zones[4] || 0) + (zones[5] || 0)
  const zone4Min = zone4Sec > 0 ? Math.round(zone4Sec / 60) : null

  const notitiesDelen = [data.title || sport]
  if (afstandKm && afstandKm > 0) notitiesDelen.push(`${afstandKm}km`)
  notitiesDelen.push(`[junction:${data.id}]`)
  const notities = notitiesDelen.join(' — ')

  const [existing] = await sql`
    SELECT id FROM trainingen WHERE user_id = ${userId} AND junction_id = ${junctionId} LIMIT 1
  `
  if (existing) {
    await sql`
      UPDATE trainingen SET
        sport = ${sport}, duur_min = ${duurMin}, kcal = ${kcal},
        gem_hartslag = ${gemHr}, max_hartslag = ${maxHr},
        zone2_min = ${zone2Min}, zone3_min = ${zone3Min}, zone4_min = ${zone4Min}
      WHERE id = ${existing.id}
    `
  } else {
    await sql`
      INSERT INTO trainingen
        (user_id, datum, sport, duur_min, kcal, gem_hartslag, max_hartslag,
         zone2_min, zone3_min, zone4_min, notities, bron, junction_id)
      VALUES
        (${userId}, ${datum}, ${sport}, ${duurMin}, ${kcal}, ${gemHr}, ${maxHr},
         ${zone2Min}, ${zone3Min}, ${zone4Min}, ${notities}, 'junction', ${junctionId})
      ON CONFLICT DO NOTHING
    `
  }
}

async function verwerkHrv(sql, userId, data) {
  // Timeseries: pak de meest recente meting van de dag
  const samples = data.data || []
  if (!samples.length) return

  const laatste = samples[samples.length - 1]
  if (!laatste?.value || !laatste?.timestamp) return

  const datum = laatste.timestamp.split('T')[0]
  const hrv = Math.round(laatste.value)

  // Vul HRV in als er al een herstelrij is maar nog geen HRV
  await sql`
    UPDATE trainingen SET hrv_ochtend = ${hrv}
    WHERE user_id = ${userId} AND datum = ${datum} AND sport = 'herstel' AND hrv_ochtend IS NULL
  `
}
