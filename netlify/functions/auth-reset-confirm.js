import { getDb } from './_db.js'
import { cors } from './_auth.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()

  try {
    const { token, password } = JSON.parse(event.body || '{}')
    if (!token || !password) return cors({ error: 'Token en wachtwoord verplicht' }, 400)
    if (password.length < 8) return cors({ error: 'Wachtwoord minimaal 8 tekens' }, 400)

    const [resetToken] = await sql`
      SELECT prt.user_id, prt.expires_at, prt.used, u.email, u.name
      FROM password_reset_tokens prt
      JOIN users u ON u.id = prt.user_id
      WHERE prt.token = ${token}
      LIMIT 1
    `

    if (!resetToken) return cors({ error: 'Ongeldige resetlink. Vraag een nieuwe aan.' }, 400)
    if (resetToken.used) return cors({ error: 'Deze resetlink is al gebruikt. Vraag een nieuwe aan.' }, 400)
    if (new Date(resetToken.expires_at) < new Date()) {
      return cors({ error: 'Resetlink verlopen. Vraag een nieuwe aan.' }, 400)
    }

    const hash = await bcrypt.hash(password, 12)

    await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${resetToken.user_id}`
    await sql`UPDATE password_reset_tokens SET used = TRUE WHERE token = ${token}`

    // Direct inloggen na reset
    const jwtToken = jwt.sign({ userId: resetToken.user_id }, process.env.JWT_SECRET, { expiresIn: '90d' })

    return cors({
      success: true,
      token: jwtToken,
      user: { id: resetToken.user_id, email: resetToken.email, name: resetToken.name },
    })
  } catch (err) {
    console.error('Reset confirm error:', err)
    return cors({ error: 'Er is een fout opgetreden. Probeer het opnieuw.' }, 500)
  }
}
