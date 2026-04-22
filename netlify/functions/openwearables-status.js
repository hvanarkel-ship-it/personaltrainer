import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'
import {
  isConfigured, getOwUserId, getConnections,
  disconnectProvider, SUPPORTED_PROVIDERS, PROVIDER_META,
} from './_openwearables.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response

  const sql = getDb()
  const userId = auth.user.userId

  // DELETE = disconnect a specific provider
  if (event.httpMethod === 'DELETE') {
    const { provider } = event.queryStringParameters || {}
    if (!provider) return cors({ error: 'Ontbrekende provider' }, 400)

    try {
      const owUserId = await getOwUserId(sql, userId)
      if (owUserId) await disconnectProvider(owUserId, provider)
      return cors({ success: true })
    } catch (err) {
      console.error('OW disconnect fout:', err)
      return cors({ error: 'Ontkoppelen mislukt: ' + err.message }, 500)
    }
  }

  if (event.httpMethod !== 'GET') return cors({ error: 'Methode niet toegestaan' }, 405)

  // Not configured → return feature flag so frontend can adapt
  if (!isConfigured()) {
    return cors({ configured: false, providers: [] })
  }

  try {
    const owUserId = await getOwUserId(sql, userId)

    let connections = []
    if (owUserId) {
      connections = await getConnections(owUserId)
    }

    // Normalise: connections may be an array of objects with a `provider` field
    const connectedSet = new Set(
      connections.map(c => (c.provider ?? c.provider_name ?? '').toLowerCase())
    )

    const providers = SUPPORTED_PROVIDERS.map(p => ({
      id: p,
      ...PROVIDER_META[p],
      verbonden: connectedSet.has(p),
    }))

    return cors({ configured: true, providers, owUserId: owUserId ?? null })
  } catch (err) {
    console.error('OW status fout:', err)
    return cors({ error: 'Status ophalen mislukt: ' + err.message }, 500)
  }
}
