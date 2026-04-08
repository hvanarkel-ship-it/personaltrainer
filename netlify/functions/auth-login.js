import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDb } from './_db.js'
import { cors } from './_auth.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  try {
    const { email, password } = JSON.parse(event.body || '{}')
    if (!email || !password) return cors({ error: 'Email en wachtwoord zijn verplicht' }, 400)

    const sql = getDb()
    const [user] = await sql`
      SELECT id, email, name, password_hash FROM users WHERE email = ${email.toLowerCase()}
    `
    if (!user) return cors({ error: 'Onjuist e-mailadres of wachtwoord' }, 401)

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return cors({ error: 'Onjuist e-mailadres of wachtwoord' }, 401)

    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' })
    return cors({ token, user: { id: user.id, email: user.email, name: user.name } })
  } catch (err) {
    console.error('Login error:', err)
    return cors({ error: 'Inloggen mislukt: ' + (err.message || err) }, 500)
  }
}
