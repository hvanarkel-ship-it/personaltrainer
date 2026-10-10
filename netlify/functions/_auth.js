import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'apex-coach-jwt-secret-key-2026'

export function verifyToken(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  const token = authHeader.slice(7)
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

export function requireAuth(event) {
  const user = verifyToken(event)
  if (!user) {
    return { error: true, response: { statusCode: 401, body: JSON.stringify({ error: 'Niet geautoriseerd' }) } }
  }
  return { error: false, user }
}

export function cors(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }
}
