import jwt from 'jsonwebtoken'

// Open Wearables redirects here after the provider OAuth completes.
// We carry `token` and `provider` in the redirect_uri so we can restore state.
export const handler = async (event) => {
  const appUrl = process.env.URL || 'http://localhost:8888'
  const { token, provider, error } = event.queryStringParameters || {}

  const providerParam = provider ? `&provider=${encodeURIComponent(provider)}` : ''

  if (error) {
    console.error('OW OAuth afgewezen:', error, event.queryStringParameters)
    return redirect(`${appUrl}/?integratie=openwearables${providerParam}&status=geweigerd`)
  }

  if (!token) {
    return redirect(`${appUrl}/?integratie=openwearables${providerParam}&status=fout`)
  }

  try {
    jwt.verify(decodeURIComponent(token), process.env.JWT_SECRET)
    return redirect(`${appUrl}/?integratie=openwearables${providerParam}&status=verbonden`)
  } catch (err) {
    console.error('OW callback JWT fout:', err)
    return redirect(`${appUrl}/?integratie=openwearables${providerParam}&status=fout`)
  }
}

function redirect(url) {
  return { statusCode: 302, headers: { Location: url } }
}
