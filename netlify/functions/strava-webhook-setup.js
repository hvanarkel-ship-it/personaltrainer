// One-time endpoint to register the Strava webhook subscription.
// Call once after deploy: GET /api/strava-webhook-setup?secret=YOUR_ADMIN_SECRET
// Uses STRAVA_WEBHOOK_SETUP_SECRET env var to protect this endpoint.

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method not allowed' }

  const secret = event.queryStringParameters?.secret
  if (!secret || secret !== process.env.STRAVA_WEBHOOK_SETUP_SECRET) {
    return { statusCode: 403, body: 'Forbidden' }
  }

  const appUrl = (process.env.APP_URL || 'https://apex-coach.netlify.app').replace(/\/$/, '')
  const callbackUrl = `${appUrl}/.netlify/functions/strava-webhook`

  try {
    // Check if subscription already exists
    const listRes = await fetch(
      `https://www.strava.com/api/v3/push_subscriptions?client_id=${process.env.STRAVA_CLIENT_ID}&client_secret=${process.env.STRAVA_CLIENT_SECRET}`
    )
    const existing = await listRes.json()
    if (Array.isArray(existing) && existing.length > 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'al_actief', subscription: existing[0] }),
      }
    }

    // Register new subscription
    const body = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      callback_url: callbackUrl,
      verify_token: process.env.STRAVA_WEBHOOK_VERIFY_TOKEN,
    })
    const res = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
      method: 'POST',
      body,
    })
    const data = await res.json()

    if (!res.ok) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Registratie mislukt', detail: data }),
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'geregistreerd', subscription: data, callback_url: callbackUrl }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    }
  }
}
