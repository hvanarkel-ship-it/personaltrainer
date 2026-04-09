export const handler = async (event) => {
  const token = event.queryStringParameters?.token
  if (!token) {
    return { statusCode: 400, body: 'Missing token' }
  }

  const clientId = process.env.STRAVA_CLIENT_ID
  if (!clientId) {
    return { statusCode: 500, body: 'Strava niet geconfigureerd' }
  }

  const appUrl = process.env.URL || 'http://localhost:8888'
  const redirectUri = `${appUrl}/api/strava-callback`
  const scope = 'activity:read_all,profile:read_all'

  const stravaUrl = `https://www.strava.com/oauth/authorize` +
    `?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${scope}` +
    `&state=${encodeURIComponent(token)}`

  return {
    statusCode: 302,
    headers: { Location: stravaUrl }
  }
}
