import { getDb } from './_db.js'
import { cors } from './_auth.js'
import crypto from 'crypto'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

  const sql = getDb()

  try {
    // Idempotente tabel-aanmaak
    await sql`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    const { email } = JSON.parse(event.body || '{}')
    if (!email) return cors({ error: 'E-mailadres verplicht' }, 400)

    const [user] = await sql`SELECT id, name FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1`

    // Altijd succes teruggeven — geeft geen info prijs of email bestaat
    if (!user) return cors({ success: true })

    // Verwijder oude tokens voor deze gebruiker
    await sql`DELETE FROM password_reset_tokens WHERE user_id = ${user.id}`

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 uur geldig

    await sql`
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES (${user.id}, ${token}, ${expiresAt})
    `

    const appUrl = process.env.APP_URL || 'https://apex-coach.netlify.app'
    const resetLink = `${appUrl}?reset=${token}`

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      console.error('RESEND_API_KEY niet ingesteld')
      return cors({ success: true }) // Stil falen — niet blootstellen aan gebruiker
    }

    const from = process.env.RESEND_FROM || 'APEX Coach <noreply@apex-coach.app>'

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: email,
        subject: 'Wachtwoord herstellen — APEX Coach',
        html: `
          <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <div style="text-align:center;margin-bottom:24px">
              <div style="width:56px;height:56px;background:#1D9E75;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:1.6rem;margin-bottom:12px">⚡</div>
              <h1 style="font-size:1.4rem;font-weight:800;color:#1D9E75;margin:0">APEX Coach</h1>
            </div>
            <h2 style="font-size:1.1rem;margin-bottom:8px">Hallo ${user.name},</h2>
            <p style="color:#4B5563;line-height:1.6;margin-bottom:24px">
              Je hebt een wachtwoordherstel aangevraagd. Klik op de knop hieronder om een nieuw wachtwoord in te stellen.
              De link is <strong>1 uur geldig</strong>.
            </p>
            <div style="text-align:center;margin-bottom:24px">
              <a href="${resetLink}" style="display:inline-block;background:#1D9E75;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:1rem">
                Wachtwoord herstellen
              </a>
            </div>
            <p style="color:#9CA3AF;font-size:0.8rem;line-height:1.5">
              Heb je dit niet aangevraagd? Dan hoef je niets te doen — je wachtwoord blijft ongewijzigd.<br><br>
              Of kopieer deze link: <a href="${resetLink}" style="color:#1D9E75">${resetLink}</a>
            </p>
          </div>
        `,
      }),
    })

    return cors({ success: true })
  } catch (err) {
    console.error('Reset request error:', err)
    return cors({ error: 'Er is een fout opgetreden. Probeer het opnieuw.' }, 500)
  }
}
