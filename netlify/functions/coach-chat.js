import Anthropic from '@anthropic-ai/sdk'
import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 3 })

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response

  const sql = getDb()
  const userId = auth.user.userId
  const pad = event.path.split('/')

  try {
    // Gesprekshistorie ophalen
    if (event.httpMethod === 'GET') {
      const rows = await sql`
        SELECT rol, bericht, is_ai, upload_type, created_at
        FROM gesprekken WHERE user_id = ${userId}
        ORDER BY created_at ASC LIMIT 100
      `
      return cors(rows)
    }

    // Gesprek wissen
    if (event.httpMethod === 'DELETE') {
      await sql`DELETE FROM gesprekken WHERE user_id = ${userId}`
      return cors({ success: true })
    }

    if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

    const { bericht, bestanden, upload_type } = JSON.parse(event.body || '{}')
    if (!bericht && !bestanden?.length) return cors({ error: 'Bericht of bestand verplicht' }, 400)

    // Gebruikersdata ophalen voor context
    const [profiel] = await sql`
      SELECT u.name, p.geboortejaar, p.geslacht, p.lengte_cm, p.gewicht_kg,
        p.doel_kcal, p.doel_eiwit_g, p.doel_koolhydraten_g, p.doel_vetten_g,
        p.sporten, p.coach_context, p.coach_naam, p.coach_stijl
      FROM users u LEFT JOIN user_profile p ON p.user_id = u.id
      WHERE u.id = ${userId}
    `
    const [inbody] = await sql`
      SELECT gewicht_kg, vetpercentage, spiermassa_kg, visceraal_vet, datum
      FROM inbody_metingen WHERE user_id = ${userId}
      ORDER BY datum DESC LIMIT 1
    `
    const [herstel] = await sql`
      SELECT hrv_ochtend, slaap_uur, slaapscore, herstelbalans, datum
      FROM trainingen WHERE user_id = ${userId} AND hrv_ochtend IS NOT NULL
      ORDER BY datum DESC LIMIT 1
    `
    const vandaag = new Date().toISOString().split('T')[0]
    const vandaagMeals = await sql`
      SELECT kcal, eiwit_g FROM maaltijden WHERE user_id = ${userId} AND datum = ${vandaag}
    `
    const actieveDoelen = await sql`
      SELECT titel, doel_waarde, huidige_waarde, eenheid FROM doelen
      WHERE user_id = ${userId} AND actief = TRUE LIMIT 5
    `
    const weektraining = await sql`
      SELECT sport, duur_min, datum FROM trainingen WHERE user_id = ${userId}
      AND datum >= (CURRENT_DATE - INTERVAL '7 days') ORDER BY datum DESC
    `

    const kcalVandaag = vandaagMeals.reduce((s, m) => s + (m.kcal || 0), 0)
    const eiwitVandaag = vandaagMeals.reduce((s, m) => s + (parseFloat(m.eiwit_g) || 0), 0)

    // Dynamische systeem-prompt
    const naam = profiel?.name || 'gebruiker'
    const coachNaam = profiel?.coach_naam || 'APEX Coach'
    const stijlInstructie = {
      direct: 'Wees direct en bondig. Geef concrete getallen en acties zonder omhaal.',
      motiverend: 'Wees enthousiast en motiverend. Moedig aan en vier successen.',
      wetenschappelijk: 'Geef wetenschappelijk onderbouwde uitleg met referenties naar fysiologie en onderzoek.',
      vriendelijk: 'Wees warm, ondersteunend en empathisch. Neem de tijd voor de persoon achter de vraag.'
    }[profiel?.coach_stijl || 'direct'] || 'Wees direct en bondig.'

    const systemPrompt = `Je bent ${coachNaam}, een persoonlijke AI-coachingassistent voor ${naam}.

Je combineert vijf expertprofielen:

TRAINER: Schema's, sets/reps, progressie, periodisering, warming-up, herstel tussen sessies, sport-specifiek advies (${profiel?.sporten?.join('/') || 'fitness/padel/fietsen'}).

DIETIST: Macro-analyse, maaltijdplanning, eiwitdoelen, timing rondom training, foto-interpretatie van maaltijden, supplementadvies.

FYSIOLOOG: HRV-interpretatie, hartslagzones, VO2max schatting, belastingscurve, overtraining-signalen, InBody-waarden duiden.

COACH: Motivatie, doelstelling, weekplanning, gewoontevorming, mentale begeleiding, voortgang bijhouden.

VOEDINGSDESKUNDIGE: Micronutriënten, bloedwaarden interpreteren, vitamines, mineralen, energiebalans op langere termijn.

Gebruikersprofiel:
- Naam: ${naam}${profiel?.geslacht ? ` | Geslacht: ${profiel.geslacht}` : ''}
- Lengte: ${profiel?.lengte_cm || '?'} cm | Gewicht: ${profiel?.gewicht_kg || '?'} kg
- Dagdoelen: ${profiel?.doel_kcal || 2400} kcal | ${profiel?.doel_eiwit_g || 160}g eiwit | ${profiel?.doel_koolhydraten_g || 250}g koolhyd | ${profiel?.doel_vetten_g || 80}g vet
- Actieve sporten: ${profiel?.sporten?.join(', ') || 'fitness, padel, fietsen'}
${inbody ? `- Laatste InBody (${inbody.datum}): ${inbody.vetpercentage}% vet, ${inbody.spiermassa_kg}kg spier, ${inbody.gewicht_kg}kg` : ''}
${herstel ? `- HRV gisteren: ${herstel.hrv_ochtend} ms | Slaap: ${herstel.slaap_uur} uur | Herstelbalans: ${herstel.herstelbalans}` : ''}
- Gegeten vandaag: ${kcalVandaag} kcal / ${Math.round(eiwitVandaag)}g eiwit
${weektraining.length ? `- Trainingen deze week: ${weektraining.map(t => `${t.sport}(${t.duur_min}min)`).join(', ')}` : ''}
${actieveDoelen.length ? `- Actieve doelen: ${actieveDoelen.map(d => `${d.titel} ${d.huidige_waarde||'?'}/${d.doel_waarde} ${d.eenheid||''}`).join(', ')}` : ''}
${profiel?.coach_context ? `\nPersoonlijke context van ${naam}:\n${profiel.coach_context}` : ''}

Spreek altijd Nederlands. ${stijlInstructie} Combineer rollen wanneer relevant.`

    // Gesprekshistorie
    const history = await sql`
      SELECT is_ai, bericht FROM gesprekken WHERE user_id = ${userId}
      ORDER BY created_at DESC LIMIT 20
    `

    // Bouw content op voor dit bericht
    const userContent = []
    if (bestanden?.length) {
      for (const b of bestanden) {
        const [header, data] = b.base64.split(',')
        const mediaType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg'
        userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } })
      }
    }
    if (bericht) userContent.push({ type: 'text', text: bericht })

    const messages = [
      ...history.reverse().map(h => ({
        role: h.is_ai ? 'assistant' : 'user',
        content: h.bericht
      })),
      { role: 'user', content: userContent.length === 1 && userContent[0].type === 'text'
        ? userContent[0].text
        : userContent
      }
    ]

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      messages
    })

    const antwoord = response.content[0].text

    // Opslaan in gesprekken
    const berichtTekst = bericht || (bestanden?.length ? `[${bestanden.length} bestand(en) geüpload: ${upload_type || 'upload'}]` : '')
    await sql`
      INSERT INTO gesprekken (user_id, rol, bericht, is_ai, upload_type)
      VALUES
        (${userId}, 'user', ${berichtTekst}, false, ${upload_type||null}),
        (${userId}, 'assistant', ${antwoord}, true, null)
    `

    return cors({ antwoord })
  } catch (err) {
    console.error('Coach chat error:', err)
    const bericht = err.status === 529 || err.message?.includes('overloaded')
      ? 'De AI is momenteel druk bezet. Probeer het over een minuut opnieuw.'
      : 'Coach fout: ' + err.message
    return cors({ error: bericht }, err.status === 529 ? 503 : 500)
  }
}
