import Anthropic from '@anthropic-ai/sdk'
import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})

  const auth = requireAuth(event)
  if (auth.error) return auth.response

  const sql = getDb()
  const userId = auth.user.userId
  const pathParts = event.path.split('/')
  const lastPart = pathParts[pathParts.length - 1]

  try {
    // Gesprekshistorie ophalen
    if (event.httpMethod === 'GET' && lastPart === 'history') {
      const rows = await sql`
        SELECT rol, bericht, created_at FROM conversation_history
        WHERE user_id = ${userId}
        ORDER BY created_at ASC
        LIMIT 100
      `
      return cors(rows)
    }

    // Gesprekshistorie wissen
    if (event.httpMethod === 'DELETE' && lastPart === 'history') {
      await sql`DELETE FROM conversation_history WHERE user_id = ${userId}`
      return cors({ success: true })
    }

    // Bericht versturen naar AI coach
    if (event.httpMethod === 'POST') {
      const { bericht } = JSON.parse(event.body || '{}')
      if (!bericht) return cors({ error: 'Bericht is verplicht' }, 400)

      // Gebruikerscontext ophalen
      const [settings] = await sql`
        SELECT s.*, u.naam FROM user_settings s
        JOIN users u ON u.id = s.user_id
        WHERE s.user_id = ${userId}
      `

      const [latestMeasurement] = await sql`
        SELECT * FROM measurements WHERE user_id = ${userId}
        ORDER BY datum DESC LIMIT 1
      `

      const recentMeals = await sql`
        SELECT maaltijd_type, omschrijving, kcal, eiwitten_g, datum
        FROM meals WHERE user_id = ${userId}
        ORDER BY datum DESC, created_at DESC LIMIT 10
      `

      const recentWorkouts = await sql`
        SELECT naam, type, duur_minuten, datum FROM workouts
        WHERE user_id = ${userId}
        ORDER BY datum DESC LIMIT 5
      `

      // Gesprekshistorie ophalen (laatste 20 berichten)
      const history = await sql`
        SELECT rol, bericht FROM conversation_history
        WHERE user_id = ${userId}
        ORDER BY created_at DESC LIMIT 20
      `

      // Systeem prompt opbouwen
      const coachNaam = settings?.coach_naam || 'APEX'
      const coachStijl = settings?.coach_stijl || 'motiverend'
      const gebruikerNaam = settings?.naam || 'vriend'

      const stijlBeschrijving = {
        motiverend: 'je bent enthousiast, positief en motiverend',
        streng: 'je bent direct, veeleisend en houd de gebruiker scherp',
        vriendelijk: 'je bent warm, empathisch en begripvol',
        wetenschappelijk: 'je bent analytisch, precies en baseert je op wetenschappelijke inzichten'
      }[coachStijl] || 'je bent motiverend en ondersteunend'

      let contextInfo = ''
      if (settings) {
        contextInfo += `\nGebruiker: ${gebruikerNaam}`
        if (settings.doel) contextInfo += `\nDoel: ${settings.doel}`
        if (settings.lengte_cm) contextInfo += `\nLengte: ${settings.lengte_cm} cm`
        if (settings.dagelijks_calorie_doel) contextInfo += `\nCaloriedoel: ${settings.dagelijks_calorie_doel} kcal/dag`
        if (settings.dagelijks_eiwitdoel_g) contextInfo += `\nEiwitdoel: ${settings.dagelijks_eiwitdoel_g} g/dag`
        if (settings.dieet_wensen?.length) contextInfo += `\nDieetwensen: ${settings.dieet_wensen.join(', ')}`
      }

      if (latestMeasurement) {
        contextInfo += `\n\nLaatste meting (${latestMeasurement.datum}):`
        if (latestMeasurement.gewicht_kg) contextInfo += `\n- Gewicht: ${latestMeasurement.gewicht_kg} kg`
        if (latestMeasurement.vetpercentage) contextInfo += `\n- Vetpercentage: ${latestMeasurement.vetpercentage}%`
        if (latestMeasurement.spiermassa_kg) contextInfo += `\n- Spiermassa: ${latestMeasurement.spiermassa_kg} kg`
        if (latestMeasurement.bmi) contextInfo += `\n- BMI: ${latestMeasurement.bmi}`
      }

      if (recentWorkouts.length > 0) {
        contextInfo += `\n\nRecente trainingen:`
        recentWorkouts.forEach(w => {
          contextInfo += `\n- ${w.datum}: ${w.naam || w.type}${w.duur_minuten ? ` (${w.duur_minuten} min)` : ''}`
        })
      }

      if (recentMeals.length > 0) {
        const vandaag = new Date().toISOString().split('T')[0]
        const vandaagMeals = recentMeals.filter(m => m.datum === vandaag)
        if (vandaagMeals.length > 0) {
          const totalKcal = vandaagMeals.reduce((s, m) => s + (m.kcal || 0), 0)
          const totalEiwit = vandaagMeals.reduce((s, m) => s + (parseFloat(m.eiwitten_g) || 0), 0)
          contextInfo += `\n\nHuidige dag voeding: ${totalKcal} kcal, ${totalEiwit.toFixed(0)}g eiwit`
        }
      }

      const systemPrompt = `Je bent ${coachNaam}, een AI personal trainer voor de APEX Coach app. ${stijlBeschrijving.charAt(0).toUpperCase() + stijlBeschrijving.slice(1)}. Je communiceert altijd in het Nederlands. Je geeft persoonlijk, praktisch advies op het gebied van fitness, voeding en gezondheid.

${contextInfo ? `Gebruikerscontext:\n${contextInfo}` : ''}

Houd je antwoorden beknopt maar volledig. Gebruik indien relevant bullet points of korte lijstjes. Eindig met een motiverende of actionable tip als dat past.`

      // Berichten samenstellen (history omdraaien naar chronologisch)
      const messages = [
        ...history.reverse().map(h => ({ role: h.rol, content: h.bericht })),
        { role: 'user', content: bericht }
      ]

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages
      })

      const antwoord = response.content[0].text

      // Opslaan in database
      await sql`
        INSERT INTO conversation_history (user_id, rol, bericht)
        VALUES (${userId}, 'user', ${bericht}),
               (${userId}, 'assistant', ${antwoord})
      `

      return cors({ antwoord })
    }

    return cors({ error: 'Methode niet toegestaan' }, 405)
  } catch (err) {
    console.error('Coach error:', err)
    return cors({ error: 'Fout bij AI coach' }, 500)
  }
}
