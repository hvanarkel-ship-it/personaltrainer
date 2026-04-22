export const handler = async (event) => {
  const token = event.queryStringParameters?.token
  if (!token) return { statusCode: 400, body: 'Missing token' }

  const wearablesUrl = process.env.WEARABLES_URL
  const clientId = process.env.WEARABLES_CLIENT_ID
  if (!wearablesUrl || !clientId) {
    return { statusCode: 500, body: 'Open Wearables niet geconfigureerd' }
  }

  const appUrl = process.env.URL || 'http://localhost:8888'
  const redirectUri = `${appUrl}/api/wearables-callback`

  const authUrl = `${wearablesUrl}/oauth/authorize` +
    `?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&state=${encodeURIComponent(token)}`

  return { statusCode: 302, headers: { Location: authUrl } }
}
