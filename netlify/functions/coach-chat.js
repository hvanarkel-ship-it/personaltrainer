import Anthropic from '@anthropic-ai/sdk'
import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 3 })

function getMaaltijdType() {
  const h = new Date().getHours()
  if (h >= 5 && h < 11) return 'ontbijt'
  if (h >= 11 && h < 15) return 'lunch'
  if (h >= 15 && h < 18) return 'snack'
  if (h >= 18) return 'diner'
  return 'snack'
}

function bestandenNaarContent(bestanden) {
  const content = []
  for (const b of bestanden) {
    const [header, data] = b.base64.split(',')
    const mediaType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg'
    content.push(mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data } }
    )
  }
  return content
}

// ── InBody foto extractie + opslaan ──
async function extractInbody(sql, userId, bestanden) {
  const content = [
    ...bestandenNaarContent(bestanden),
    { type: 'text', text: `Extraheer alle InBody meetwaarden. Geef UITSLUITEND geldig JSON:
{"datum":"YYYY-MM-DD of null","gewicht_kg":0,"vetmassa_kg":0,"vetpercentage":0,"spiermassa_kg":0,"visceraal_vet":0,"bmr_kcal":0,"vochtbalans_pct":0,"inbody_score":0,"notities":"korte duiding NL"}` }
  ]
  const res = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content }] })
  const d = JSON.parse(res.content[0].text.trim().replace(/```json\n?|\n?```/g, '').trim())
  const vandaag = new Date().toISOString().split('T')[0]
  const datum = d.datum && d.datum !== 'null' ? d.datum : vandaag

  const [row] = await sql`
    INSERT INTO inbody_metingen (user_id, datum, gewicht_kg, vetmassa_kg, vetpercentage,
      spiermassa_kg, visceraal_vet, bmr_kcal, vochtbalans_pct, inbody_score, bron, notities)
    VALUES (${userId}, ${datum}, ${d.gewicht_kg||null}, ${d.vetmassa_kg||null},
      ${d.vetpercentage||null}, ${d.spiermassa_kg||null}, ${d.visceraal_vet||null},
      ${d.bmr_kcal||null}, ${d.vochtbalans_pct||null}, ${d.inbody_score||null},
      'coach_upload', ${d.notities||null})
    RETURNING id`
  return {
    type: 'inbody', id: row.id, data: d, label: `InBody meting ${datum}`,
    samenvatting: `Gewicht: ${d.gewicht_kg}kg | Vet: ${d.vetpercentage}% | Spier: ${d.spiermassa_kg}kg | Visceraal: ${d.visceraal_vet} | BMR: ${d.bmr_kcal}kcal | Score: ${d.inbody_score}`
  }
}

// ── Suunto foto extractie + opslaan ──
async function extractSuunto(sql, userId, bestanden) {
  const content = [
    ...bestandenNaarContent(bestanden),
    { type: 'text', text: `Extraheer alle Suunto trainings- en hersteldata. Geef UITSLUITEND geldig JSON:
{"datum":"YYYY-MM-DD of null","sport":"activiteitstype NL","duur_min":0,"kcal":0,"gem_hartslag":0,"max_hartslag":0,"hrv_ochtend":0,"slaap_uur":0,"slaapscore":0,"herstelbalans":0,"zone2_min":0,"zone3_min":0,"zone4_min":0,"notities":"samenvatting NL"}` }
  ]
  const res = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content }] })
  const d = JSON.parse(res.content[0].text.trim().replace(/```json\n?|\n?```/g, '').trim())
  const vandaag = new Date().toISOString().split('T')[0]
  const datum = d.datum && d.datum !== 'null' ? d.datum : vandaag
  const sport = d.sport || 'training'

  const [row] = await sql`
    INSERT INTO trainingen (user_id, datum, sport, duur_min, kcal, gem_hartslag, max_hartslag,
      hrv_ochtend, slaap_uur, slaapscore, herstelbalans, zone2_min, zone3_min, zone4_min, notities, bron)
    VALUES (${userId}, ${datum}, ${sport}, ${d.duur_min||null}, ${d.kcal||null},
      ${d.gem_hartslag||null}, ${d.max_hartslag||null}, ${d.hrv_ochtend||null},
      ${d.slaap_uur||null}, ${d.slaapscore||null}, ${d.herstelbalans||null},
      ${d.zone2_min||null}, ${d.zone3_min||null}, ${d.zone4_min||null}, ${d.notities||null}, 'coach_upload')
    RETURNING id`
  return {
    type: 'suunto', id: row.id, data: d, label: `${sport} ${datum}`,
    samenvatting: `Sport: ${sport} | Duur: ${d.duur_min}min | Kcal: ${d.kcal} | HRV: ${d.hrv_ochtend}ms | Slaap: ${d.slaap_uur}u | Herstelbalans: ${d.herstelbalans}`
  }
}

// ── Maaltijd foto extractie + opslaan ──
async function extractMaaltijdFoto(sql, userId, bestanden) {
  const content = [
    ...bestandenNaarContent(bestanden),
    { type: 'text', text: `Analyseer deze maaltijdfoto nauwkeurig. Identificeer alle ingrediënten en schat de porties realistisch.
Geef UITSLUITEND geldig JSON:
{"beschrijving":"naam van de maaltijd","kcal":0,"eiwit_g":0.0,"koolhydraten_g":0.0,"vetten_g":0.0,"foto_analyse":"korte beschrijving wat je ziet","ai_notities":"kort voedingsadvies in context van sport NL"}` }
  ]
  const res = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content }] })
  const d = JSON.parse(res.content[0].text.trim().replace(/```json\n?|\n?```/g, '').trim())
  const vandaag = new Date().toISOString().split('T')[0]
  const maaltijdType = getMaaltijdType()

  const [row] = await sql`
    INSERT INTO maaltijden (user_id, datum, maaltijd_type, beschrijving, kcal,
      eiwit_g, koolhydraten_g, vetten_g, foto_analyse, ai_notities)
    VALUES (${userId}, ${vandaag}, ${maaltijdType}, ${d.beschrijving||'Maaltijd'},
      ${d.kcal||null}, ${d.eiwit_g||null}, ${d.koolhydraten_g||null}, ${d.vetten_g||null},
      ${d.foto_analyse||null}, ${d.ai_notities||null})
    RETURNING id`
  return {
    type: 'maaltijd', id: row.id, data: d, label: `${d.beschrijving || 'Maaltijd'} (${maaltijdType})`,
    samenvatting: `${d.beschrijving} — ${d.kcal}kcal | ${d.eiwit_g}g eiwit | ${d.koolhydraten_g}g kh | ${d.vetten_g}g vet`
  }
}

// ── Maaltijd tekst detectie + opslaan ──
async function detecteerMaaltijdTekst(sql, userId, bericht) {
  // Snel pre-filter: sla de haiku-call over als het duidelijk geen voeding is
  if (bericht.length < 10) return null
  const voedingKeywords = /\b(gegeten|geëten|gegeten|ontbijt|lunch|diner|avondeten|snack|maaltijd|kcal|calorieën|eiwit|proteïne|gram|\d+\s*g\b|koolhydraten|vetten|brood|rijst|pasta|vlees|kip|vis|ei|melk|yogurt|kwark|kaas|fruit|groente|soep|shake|smoothie|havermout|noten|amandelen|avocado|hummus|salade|wrap|boterham|appel|banaan|bier|wijn)\b/i
  if (!voedingKeywords.test(bericht)) return null

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Is dit bericht een beschrijving van gegeten voeding/maaltijden? Zo ja, extraheer de nutritionele waarden zo nauwkeurig mogelijk.
Geef UITSLUITEND geldig JSON:
{"is_voeding":true,"beschrijving":"korte naam","kcal":0,"eiwit_g":0.0,"koolhydraten_g":0.0,"vetten_g":0.0,"ai_notities":"kort advies NL"}
of als het GEEN voedingsbeschrijving is: {"is_voeding":false}

Bericht: "${bericht.slice(0, 500)}"`
    }]
  })

  const d = JSON.parse(res.content[0].text.trim().replace(/```json\n?|\n?```/g, '').trim())
  if (!d.is_voeding) return null

  const vandaag = new Date().toISOString().split('T')[0]
  const maaltijdType = getMaaltijdType()

  const [row] = await sql`
    INSERT INTO maaltijden (user_id, datum, maaltijd_type, beschrijving, kcal,
      eiwit_g, koolhydraten_g, vetten_g, ai_notities)
    VALUES (${userId}, ${vandaag}, ${maaltijdType}, ${d.beschrijving||'Maaltijd'},
      ${d.kcal||null}, ${d.eiwit_g||null}, ${d.koolhydraten_g||null}, ${d.vetten_g||null},
      ${d.ai_notities||null})
    RETURNING id`
  return {
    type: 'maaltijd', id: row.id, data: d, label: `${d.beschrijving || 'Maaltijd'} (${maaltijdType})`,
    samenvatting: `${d.beschrijving} — ${d.kcal}kcal | ${d.eiwit_g}g eiwit | ${d.koolhydraten_g}g kh | ${d.vetten_g}g vet`
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({})
  const auth = requireAuth(event)
  if (auth.error) return auth.response

  const sql = getDb()
  const userId = auth.user.userId

  try {
    if (event.httpMethod === 'GET') {
      const rows = await sql`
        SELECT rol, bericht, is_ai, upload_type, created_at
        FROM gesprekken WHERE user_id = ${userId}
        ORDER BY created_at ASC LIMIT 100`
      return cors(rows)
    }

    if (event.httpMethod === 'DELETE') {
      await sql`DELETE FROM gesprekken WHERE user_id = ${userId}`
      return cors({ success: true })
    }

    if (event.httpMethod !== 'POST') return cors({ error: 'Methode niet toegestaan' }, 405)

    const { bericht, bestanden, upload_type } = JSON.parse(event.body || '{}')
    if (!bericht && !bestanden?.length) return cors({ error: 'Bericht of bestand verplicht' }, 400)

    // ── Bepaal welke extractie te doen (parallel met context-queries) ──
    let extractiePromise = null
    if (bestanden?.length) {
      if (upload_type === 'inbody')   extractiePromise = extractInbody(sql, userId, bestanden)
      if (upload_type === 'suunto')   extractiePromise = extractSuunto(sql, userId, bestanden)
      if (upload_type === 'maaltijd') extractiePromise = extractMaaltijdFoto(sql, userId, bestanden)
    } else if (bericht && !upload_type) {
      extractiePromise = detecteerMaaltijdTekst(sql, userId, bericht)
    }

    // ── Alle data parallel ophalen ──
    const vandaag = new Date().toISOString().split('T')[0]
    const [
      opgeslagen,
      [profiel],
      [inbodyCtx],
      [herstel],
      vandaagMeals,
      actieveDoelen,
      weektraining,
      history
    ] = await Promise.all([
      extractiePromise ? extractiePromise.catch(err => { console.error('Extractie fout:', err); return null }) : Promise.resolve(null),
      sql`SELECT u.name, p.geboortejaar, p.geslacht, p.lengte_cm, p.gewicht_kg,
        p.doel_kcal, p.doel_eiwit_g, p.doel_koolhydraten_g, p.doel_vetten_g,
        p.sporten, p.coach_context, p.coach_naam, p.coach_stijl
        FROM users u LEFT JOIN user_profile p ON p.user_id = u.id WHERE u.id = ${userId}`,
      sql`SELECT gewicht_kg, vetpercentage, spiermassa_kg, visceraal_vet, datum
        FROM inbody_metingen WHERE user_id = ${userId} ORDER BY datum DESC LIMIT 1`,
      sql`SELECT hrv_ochtend, slaap_uur, slaapscore, herstelbalans, datum
        FROM trainingen WHERE user_id = ${userId} AND hrv_ochtend IS NOT NULL ORDER BY datum DESC LIMIT 1`,
      sql`SELECT kcal, eiwit_g FROM maaltijden WHERE user_id = ${userId} AND datum = ${vandaag}`,
      sql`SELECT titel, doel_waarde, huidige_waarde, eenheid FROM doelen WHERE user_id = ${userId} AND actief = TRUE LIMIT 5`,
      sql`SELECT sport, duur_min, datum FROM trainingen WHERE user_id = ${userId}
        AND datum >= (CURRENT_DATE - INTERVAL '7 days') ORDER BY datum DESC`,
      sql`SELECT is_ai, bericht FROM gesprekken WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 20`
    ])

    // Totalen vandaag (inclusief nieuw opgeslagen maaltijd als die er is)
    const kcalVandaag = vandaagMeals.reduce((s, m) => s + (m.kcal || 0), 0)
      + (opgeslagen?.type === 'maaltijd' ? (opgeslagen.data.kcal || 0) : 0)
    const eiwitVandaag = vandaagMeals.reduce((s, m) => s + (parseFloat(m.eiwit_g) || 0), 0)
      + (opgeslagen?.type === 'maaltijd' ? (parseFloat(opgeslagen.data.eiwit_g) || 0) : 0)

    // ── Systeem-prompt ──
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
TRAINER: Schema's, sets/reps, progressie, periodisering, warming-up, herstel, sport-specifiek (${profiel?.sporten?.join('/') || 'fitness/padel/fietsen'}).
DIETIST: Macro-analyse, maaltijdplanning, eiwitdoelen, timing rondom training, foto-interpretatie, supplementadvies.
FYSIOLOOG: HRV-interpretatie, hartslagzones, VO2max, belastingscurve, overtraining, InBody duiden.
COACH: Motivatie, doelstelling, weekplanning, gewoontevorming, mentale begeleiding.
VOEDINGSDESKUNDIGE: Micronutriënten, bloedwaarden, vitamines, mineralen, energiebalans.

Gebruikersprofiel:
- Naam: ${naam}${profiel?.geslacht ? ` | Geslacht: ${profiel.geslacht}` : ''}
- Lengte: ${profiel?.lengte_cm || '?'} cm | Gewicht: ${profiel?.gewicht_kg || '?'} kg
- Dagdoelen: ${profiel?.doel_kcal || 2400} kcal | ${profiel?.doel_eiwit_g || 160}g eiwit | ${profiel?.doel_koolhydraten_g || 250}g kh | ${profiel?.doel_vetten_g || 80}g vet
- Actieve sporten: ${profiel?.sporten?.join(', ') || 'fitness, padel, fietsen'}
${inbodyCtx ? `- Laatste InBody (${inbodyCtx.datum}): ${inbodyCtx.vetpercentage}% vet, ${inbodyCtx.spiermassa_kg}kg spier, ${inbodyCtx.gewicht_kg}kg` : ''}
${herstel ? `- HRV: ${herstel.hrv_ochtend}ms | Slaap: ${herstel.slaap_uur}u | Herstelbalans: ${herstel.herstelbalans}` : ''}
- Gegeten vandaag: ${kcalVandaag} kcal / ${Math.round(eiwitVandaag)}g eiwit
${weektraining.length ? `- Trainingen deze week: ${weektraining.map(t => `${t.sport}(${t.duur_min}min)`).join(', ')}` : ''}
${actieveDoelen.length ? `- Actieve doelen: ${actieveDoelen.map(d => `${d.titel} ${d.huidige_waarde||'?'}/${d.doel_waarde}${d.eenheid||''}`).join(', ')}` : ''}
${profiel?.coach_context ? `\nPersoonlijke context:\n${profiel.coach_context}` : ''}

Spreek altijd Nederlands. ${stijlInstructie} Combineer rollen wanneer relevant.`

    // ── Bouw user bericht op (afbeeldingen + tekst + geëxtraheerde context) ──
    const userContent = bestandenNaarContent(bestanden || [])
    let berichtTekst = bericht || ''
    if (opgeslagen?.samenvatting) {
      berichtTekst += `\n\n[Automatisch opgeslagen in logboek — geëxtraheerde data]\n${opgeslagen.samenvatting}`
    }
    if (berichtTekst.trim()) userContent.push({ type: 'text', text: berichtTekst.trim() })

    const messages = [
      ...history.reverse().map(h => ({ role: h.is_ai ? 'assistant' : 'user', content: h.bericht })),
      { role: 'user', content: userContent.length === 1 && userContent[0].type === 'text' ? userContent[0].text : userContent }
    ]

    const response = await client.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1500, system: systemPrompt, messages })
    const antwoord = response.content[0].text

    const opgeslagenTekst = bericht || (bestanden?.length ? `[${bestanden.length} bestand(en) geüpload: ${upload_type || 'upload'}]` : '')
    await sql`
      INSERT INTO gesprekken (user_id, rol, bericht, is_ai, upload_type) VALUES
        (${userId}, 'user', ${opgeslagenTekst}, false, ${upload_type||null}),
        (${userId}, 'assistant', ${antwoord}, true, null)`

    return cors({ antwoord, opgeslagen })
  } catch (err) {
    console.error('Coach chat error:', err)
    const msg = err.status === 529 || err.message?.includes('overloaded')
      ? 'De AI is momenteel druk bezet. Probeer het over een minuut opnieuw.'
      : 'Coach fout: ' + err.message
    return cors({ error: msg }, err.status === 529 ? 503 : 500)
  }
}
