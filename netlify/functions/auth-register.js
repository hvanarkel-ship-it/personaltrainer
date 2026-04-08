import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDb } from './_db.js'
import { cors } from './_auth.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})

  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  try {
    const { email, wachtwoord, naam } = JSON.parse(event.body || '{}')

    if (!email || !wachtwoord || !naam) {
      return cors({ error: 'Email, wachtwoord en naam zijn verplicht' }, 400)
    }

    if (wachtwoord.length < 8) {
      return cors({ error: 'Wachtwoord moet minimaal 8 tekens bevatten' }, 400)
    }

    const sql = getDb()
    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`
    if (existing.length > 0) {
      return cors({ error: 'Dit e-mailadres is al in gebruik' }, 409)
    }

    const passwordHash = await bcrypt.hash(wachtwoord, 12)
    const [user] = await sql`
      INSERT INTO users (email, password_hash, naam)
      VALUES (${email.toLowerCase()}, ${passwordHash}, ${naam})
      RETURNING id, email, naam, created_at
    `

    await sql`
      INSERT INTO user_settings (user_id) VALUES (${user.id})
    `

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )

    return cors({ token, gebruiker: { id: user.id, email: user.email, naam: user.naam } })
  } catch (err) {
    console.error('Register error:', err)
    return cors({ error: 'Registratie mislukt: ' + (err.message || err) }, 500)
  }
}
