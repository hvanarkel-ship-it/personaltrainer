import Anthropic from '@anthropic-ai/sdk'
import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 3 })

// Extractie-prompts voor auto-save (strakke JSON output)
const EXTRACT_PROMPTS = {
  inbody: `Extraheer alle waarden van dit InBody document. Geef UITSLUITEND geldig JSON, geen andere tekst:
{"datum":"YYYY-MM-DD of null","gewicht_kg":0,"vetmassa_kg":0,"vetpercentage":0,"spiermassa_kg":0,"visceraal_vet":0,"bmr_kcal":0,"vochtbalans_pct":0,"inbody_score":0,"notities":"korte duiding NL"}`,

  suunto: `Extraheer alle waarden van dit Suunto scherm. Geef UITSLUITEND geldig JSON, geen andere tekst:
{"datum":"YYYY-MM-DD of null","sport":"activiteitstype NL","duur_min":0,"kcal":0,"gem_hartslag":0,"max_hartslag":0,"hrv_ochtend":0,"slaap_uur":0,"slaapscore":0,"herstelbalans":0,"zone2_min":0,"zone3_min":0,"zone4_min":0,"notities":"samenvatting NL"}`
}

async function extracteerEnSlaOp(sql, userId, uploadType, bestanden) {
  const prompt = EXTRACT_PROMPTS[uploadType]
  if (!prompt) return null

  // Bouw image content op
  const content = []
  for (const b of bestanden) {
    const [header, data] = b.base64.split(',')
    const mediaType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg'
    if (mediaType === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } })
    } else {
      content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } })
    }
  }
  content.push({ type: 'text', text: prompt })

  // Gebruik haiku voor snelle JSON extractie
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content }]
  })

  const raw = res.content[0].text.trim().replace(/```json\n?|\n?```/g, '').trim()
  const d = JSON.parse(raw)

  const vandaag = new Date().toISOString().split('T')[0]
  const datum = d.datum && d.datum !== 'null' ? d.datum : vandaag

  if (uploadType === 'inbody') {
    const [opgeslagen] = await sql`
      INSERT INTO inbody_metingen
        (user_id, datum, gewicht_kg, vetmassa_kg, vetpercentage, spiermassa_kg,
         visceraal_vet, bmr_kcal, vochtbalans_pct, inbody_score, bron, notities)
      VALUES
        (${userId}, ${datum},
         ${d.gewicht_kg || null}, ${d.vetmassa_kg || null}, ${d.vetpercentage || null},
         ${d.spiermassa_kg || null}, ${d.visceraal_vet || null}, ${d.bmr_kcal || null},
         ${d.vochtbalans_pct || null}, ${d.inbody_score || null},
         'coach_upload', ${d.notities || null})
      RETURNING id
    `
    return {
      type: 'inbody',
      id: opgeslagen.id,
      data: d,
      label: `InBody meting ${datum}`,
      samenvatting: `Gewicht: ${d.gewicht_kg}kg | Vet: ${d.vetpercentage}% | Spier: ${d.spiermassa_kg}kg | Visceraal: ${d.visceraal_vet} | BMR: ${d.bmr_kcal}kcal | Score: ${d.inbody_score}`,
    }
  }

  if (uploadType === 'suunto') {
    const sport = d.sport || 'training'
    const [opgeslagen] = await sql`
      INSERT INTO trainingen
        (user_id, datum, sport, duur_min, kcal, gem_hartslag, max_hartslag,
         hrv_ochtend, slaap_uur, slaapscore, herstelbalans,
         zone2_min, zone3_min, zone4_min, notities, bron)
      VALUES
        (${userId}, ${datum}, ${sport},
         ${d.duur_min || null}, ${d.kcal || null}, ${d.gem_hartslag || null}, ${d.max_hartslag || null},
         ${d.hrv_ochtend || null}, ${d.slaap_uur || null}, ${d.slaapscore || null}, ${d.herstelbalans || null},
         ${d.zone2_min || null}, ${d.zone3_min || null}, ${d.zone4_min || null},
         ${d.notities || null}, 'coach_upload')
      RETURNING id
    `
    return {
      type: 'suunto',
      id: opgeslagen.id,
      data: d,
      label: `${sport} ${datum}`,
      samenvatting: `Sport: ${sport} | Duur: ${d.duur_min}min | Kcal: ${d.kcal} | HRV: ${d.hrv_ochtend}ms | Slaap: ${d.slaap_uur}u | Herstelbalans: ${d.herstelbalans} | Zone2: ${d.zone2_min}min`,
    }
  }

  return null
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response

  const sql = getDb()
  const userId = auth.user.userId

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

    // ── AUTO-SAVE: InBody & Suunto ──
    let opgeslagen = null
    let extraContext = ''
    if ((upload_type === 'inbody' || upload_type === 'suunto') && bestanden?.length) {
      try {
        opgeslagen = await extracteerEnSlaOp(sql, userId, upload_type, bestanden)
        if (opgeslagen) {
          extraContext = `\n\n[Geëxtraheerde data uit upload — automatisch opgeslagen in logboek]\n${opgeslagen.samenvatting}`
        }
      } catch (err) {
        console.error('Auto-save extractie fout:', err)
        // Doorgaan zonder auto-save — coach reageert nog steeds op de afbeelding
      }
    }

    // Gebruikersdata ophalen voor context
    const [profiel] = await sql`
      SELECT u.name, p.geboortejaar, p.geslacht, p.lengte_cm, p.gewicht_kg,
        p.doel_kcal, p.doel_eiwit_g, p.doel_koolhydraten_g, p.doel_vetten_g,
        p.sporten, p.coach_context, p.coach_naam, p.coach_stijl
      FROM users u LEFT JOIN user_profile p ON p.user_id = u.id
      WHERE u.id = ${userId}
    `
    const [inbodyContext] = await sql`
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
${inbodyContext ? `- Laatste InBody (${inbodyContext.datum}): ${inbodyContext.vetpercentage}% vet, ${inbodyContext.spiermassa_kg}kg spier, ${inbodyContext.gewicht_kg}kg` : ''}
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

    // Bouw content op — afbeeldingen + tekst + geëxtraheerde data als context
    const userContent = []
    if (bestanden?.length) {
      for (const b of bestanden) {
        const [header, data] = b.base64.split(',')
        const mediaType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg'
        if (mediaType === 'application/pdf') {
          userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } })
        } else {
          userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } })
        }
      }
    }
    // Tekst inclusief geëxtraheerde data als context voor de coach
    const berichtMetContext = (bericht || '') + extraContext
    if (berichtMetContext.trim()) {
      userContent.push({ type: 'text', text: berichtMetContext.trim() })
    }

    const messages = [
      ...history.reverse().map(h => ({
        role: h.is_ai ? 'assistant' : 'user',
        content: h.bericht
      })),
      {
        role: 'user',
        content: userContent.length === 1 && userContent[0].type === 'text'
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
        (${userId}, 'user', ${berichtTekst}, false, ${upload_type || null}),
        (${userId}, 'assistant', ${antwoord}, true, null)
    `

    return cors({ antwoord, opgeslagen })
  } catch (err) {
    console.error('Coach chat error:', err)
    const msg = err.status === 529 || err.message?.includes('overloaded')
      ? 'De AI is momenteel druk bezet. Probeer het over een minuut opnieuw.'
      : 'Coach fout: ' + err.message
    return cors({ error: msg }, err.status === 529 ? 503 : 500)
  }
}
