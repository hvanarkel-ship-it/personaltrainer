import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()
  const userId = auth.user.userId

  try {
    const [profiel] = await sql`
      SELECT wearables_token, wearables_refresh_token, wearables_token_expires_at, wearables_device
      FROM user_profile WHERE user_id = ${userId}
    `
    if (!profiel?.wearables_token) return cors({ error: 'Open Wearables niet gekoppeld' }, 400)

    const wearablesUrl = process.env.WEARABLES_URL
    if (!wearablesUrl) return cors({ error: 'Open Wearables niet geconfigureerd' }, 500)

    let accessToken = profiel.wearables_token
    if (profiel.wearables_token_expires_at && profiel.wearables_token_expires_at < Math.floor(Date.now() / 1000)) {
      accessToken = await vernieuwToken(sql, userId, profiel, wearablesUrl)
    }

    await sql`
      CREATE TABLE IF NOT EXISTS dagelijkse_stats (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        datum DATE NOT NULL,
        hrv_ms INTEGER,
        slaap_uur NUMERIC(4,1),
        slaapscore INTEGER,
        herstel_score INTEGER,
        rusthartsslag INTEGER,
        stappen INTEGER,
        bron TEXT DEFAULT 'wearables',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, datum)
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS idx_dagelijkse_stats_user_datum ON dagelijkse_stats(user_id, datum DESC)`

    const res = await fetch(`${wearablesUrl}/api/metrics/recent?days=7`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('Wearables API error:', text)
      return cors({ error: 'Open Wearables API fout' }, 500)
    }

    const metrics = await res.json()
    if (!Array.isArray(metrics)) return cors({ error: 'Onverwacht API formaat' }, 500)

    let gesynchroniseerd = 0
    for (const m of metrics) {
      if (!m.date) continue
      await sql`
        INSERT INTO dagelijkse_stats (user_id, datum, hrv_ms, slaap_uur, slaapscore, herstel_score, rusthartsslag, stappen, bron)
        VALUES (
          ${userId}, ${m.date},
          ${m.hrv_ms || null}, ${m.sleep_hours || null}, ${m.sleep_score || null},
          ${m.recovery_score || null}, ${m.resting_hr || null}, ${m.steps || null},
          'wearables'
        )
        ON CONFLICT (user_id, datum) DO UPDATE SET
          hrv_ms = COALESCE(EXCLUDED.hrv_ms, dagelijkse_stats.hrv_ms),
          slaap_uur = COALESCE(EXCLUDED.slaap_uur, dagelijkse_stats.slaap_uur),
          slaapscore = COALESCE(EXCLUDED.slaapscore, dagelijkse_stats.slaapscore),
          herstel_score = COALESCE(EXCLUDED.herstel_score, dagelijkse_stats.herstel_score),
          rusthartsslag = COALESCE(EXCLUDED.rusthartsslag, dagelijkse_stats.rusthartsslag),
          stappen = COALESCE(EXCLUDED.stappen, dagelijkse_stats.stappen)
      `
      gesynchroniseerd++
    }

    return cors({ success: true, gesynchroniseerd, device: profiel.wearables_device })
  } catch (err) {
    console.error('Wearables sync error:', err)
    return cors({ error: 'Sync fout: ' + err.message }, 500)
  }
}

async function vernieuwToken(sql, userId, profiel, wearablesUrl) {
  const res = await fetch(`${wearablesUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.WEARABLES_CLIENT_ID,
      client_secret: process.env.WEARABLES_CLIENT_SECRET,
      refresh_token: profiel.wearables_refresh_token,
      grant_type: 'refresh_token',
    })
  })
  const tokens = await res.json()
  if (!tokens.access_token) throw new Error('Token vernieuwen mislukt')
  await sql`
    UPDATE user_profile SET
      wearables_token = ${tokens.access_token},
      wearables_refresh_token = ${tokens.refresh_token || profiel.wearables_refresh_token},
      wearables_token_expires_at = ${tokens.expires_at || null},
      updated_at = NOW()
    WHERE user_id = ${userId}
  `
  return tokens.access_token
}
