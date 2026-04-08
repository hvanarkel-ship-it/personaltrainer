import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDb } from './_db.js'
import { cors } from './_auth.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})

  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  try {
    const { email, wachtwoord } = JSON.parse(event.body || '{}')

    if (!email || !wachtwoord) {
      return cors({ error: 'Email en wachtwoord zijn verplicht' }, 400)
    }

    const sql = getDb()
    const [user] = await sql`
      SELECT id, email, naam, password_hash FROM users WHERE email = ${email.toLowerCase()}
    `

    if (!user) {
      return cors({ error: 'Onjuist e-mailadres of wachtwoord' }, 401)
    }

    const geldig = await bcrypt.compare(wachtwoord, user.password_hash)
    if (!geldig) {
      return cors({ error: 'Onjuist e-mailadres of wachtwoord' }, 401)
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )

    return cors({ token, gebruiker: { id: user.id, email: user.email, naam: user.naam } })
  } catch (err) {
    console.error('Login error:', err)
    return cors({ error: 'Inloggen mislukt' }, 500)
  }
}
