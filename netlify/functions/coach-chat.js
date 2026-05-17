import Anthropic from '@anthropic-ai/sdk'
import { getDb } from './_db.js'
import { requireAuth, cors } from './_auth.js'
import { getValidToken, syncSuuntoWellnessForUser } from './_suunto.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 3 })

function getMaaltijdType() {
  const h = parseInt(new Date().toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hour12: false }), 10)
  if (h >= 5 && h < 11) return 'ontbijt'
  if (h >= 11 && h < 15) return 'lunch'
  if (h >= 15 && h < 18) return 'snack'
  if (h >= 18) return 'diner'
  return 'snack'
}

function vandaagAms() {
  const parts = new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const g = t => parts.find(p => p.type === t).value
  return `${g('year')}-${g('month')}-${g('day')}`
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
  const vandaag = vandaagAms()
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
    { type: 'text', text: `Analyseer dit Suunto scherm. Dit kan een trainingsoverzicht ZIJN of een ochtend/herstel/gereedheid dashboard.

Extraheer alle beschikbare data. Geef UITSLUITEND geldig JSON:
{"datum":"YYYY-MM-DD of null","scherm_type":"training|ochtend|herstel","sport":"sport NL of herstel als ochtend/herstel scherm","duur_min":0,"kcal":0,"gem_hartslag":0,"max_hartslag":0,"hrv_ochtend":0,"slaap_uur":0,"slaapscore":0,"herstelbalans":0,"zone2_min":0,"zone3_min":0,"zone4_min":0,"notities":"samenvatting NL"}

Let op:
- Body Battery, herstelstatus, gereedheid, nachtmeting = scherm_type "ochtend", sport = "herstel"
- Training/activiteit = scherm_type "training", sport = werkelijke sport
- Velden die niet zichtbaar zijn: gebruik null (niet 0)` }
  ]
  const res = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, messages: [{ role: 'user', content }] })
  const d = JSON.parse(res.content[0].text.trim().replace(/```json\n?|\n?```/g, '').trim())
  const vandaag = vandaagAms()
  const datum = d.datum && d.datum !== 'null' ? d.datum : vandaag

  // Ochtend/herstel schermen altijd opslaan als sport='herstel'
  const isOchtend = d.scherm_type === 'ochtend' || d.scherm_type === 'herstel'
    || (!d.duur_min && (d.hrv_ochtend || d.slaap_uur || d.slaapscore || d.herstelbalans))
  const sport = isOchtend ? 'herstel' : (d.sport || 'training')

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
  const vandaag = vandaagAms()
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
  if (bericht.length < 8) return null

  // Pre-filter: eetverleden, maaltijdmoment, of hoeveelheden met voeding
  const eetPatroon = /\b(gegeten|geëten|at\s|at$|ontbijt|geluncht|gedinet|gesnackt|lunch|diner|avondeten|snack|kcal|calorieën|\d+\s*gram|\d+\s*g\s|\d+g\b)\b/i
  if (!eetPatroon.test(bericht)) return null

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Is dit bericht een beschrijving van wat iemand daadwerkelijk gegeten of gedronken heeft (niet een vraag, recept, of gesprek over eten)?

Als JA: bereken de macro's zo nauwkeurig mogelijk op basis van standaard portiegroottes.
Keuze maaltijd_type: ontbijt | lunch | diner | snack | pre-workout | post-workout
Geef UITSLUITEND geldig JSON:
{"is_voeding":true,"maaltijd_type":"snack","beschrijving":"korte naam","kcal":0,"eiwit_g":0.0,"koolhydraten_g":0.0,"vetten_g":0.0,"ai_notities":"kort voedingsadvies NL"}
Als NEE: {"is_voeding":false}

Bericht: "${bericht.slice(0, 800)}"`
    }]
  })

  const d = JSON.parse(res.content[0].text.trim().replace(/```json\n?|\n?```/g, '').trim())
  if (!d.is_voeding) return null

  const vandaag = vandaagAms()
  const maaltijdType = d.maaltijd_type || getMaaltijdType()

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
      // Haal de laatste 200 berichten op (nieuwste eerst), dan omdraaien voor chronologische weergave
      const rows = await sql`
        SELECT rol, bericht, is_ai, upload_type, created_at FROM (
          SELECT rol, bericht, is_ai, upload_type, created_at, id
          FROM gesprekken WHERE user_id = ${userId}
          ORDER BY created_at DESC, id DESC LIMIT 200
        ) sub
        ORDER BY created_at ASC, id ASC`
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
      if (upload_type === 'inbody')              extractiePromise = extractInbody(sql, userId, bestanden)
      if (upload_type === 'suunto' || upload_type === 'garmin') extractiePromise = extractSuunto(sql, userId, bestanden)
      if (upload_type === 'maaltijd')            extractiePromise = extractMaaltijdFoto(sql, userId, bestanden)
    } else if (bericht && !upload_type) {
      extractiePromise = detecteerMaaltijdTekst(sql, userId, bericht)
    }

    // ── Suunto wellness altijd bijwerken voor ieder gesprek (max 1x per 5 min) ──
    try {
      const [laatste] = await sql`
        SELECT updated_at FROM dagelijkse_wellness
        WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 1
      `
      const ouderDan5Min = !laatste?.updated_at ||
        (Date.now() - new Date(laatste.updated_at).getTime()) > 5 * 60 * 1000
      if (ouderDan5Min) {
        const token = await getValidToken(sql, userId).catch(() => null)
        if (token) await syncSuuntoWellnessForUser(sql, userId, token, 2)
      }
    } catch { /* geen Suunto of sync mislukt — doorgaan met bestaande data */ }

    // ── Alle data parallel ophalen ──
    const vandaag = vandaagAms()
    const nu = new Date()
    const tijdStr = nu.toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' })
    const dagNaamNL = nu.toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam', weekday: 'long' })

    let opgeslagen
    const [
      _opgeslagen,
      [profiel],
      inbodyTrend,
      hrvTrend,
      vandaagMeals,
      gisterMeals,
      actieveDoelen,
      weektraining,
      wellnessTrend,
      history
    ] = await Promise.all([
      extractiePromise ? extractiePromise.catch(err => { console.error('Extractie fout:', err); return null }) : Promise.resolve(null),
      sql`SELECT u.name, p.geboortejaar, p.geslacht, p.lengte_cm, p.gewicht_kg,
        p.doel_kcal, p.doel_eiwit_g, p.doel_koolhydraten_g, p.doel_vetten_g,
        p.sporten, p.coach_context, p.coach_naam, p.coach_stijl
        FROM users u LEFT JOIN user_profile p ON p.user_id = u.id WHERE u.id = ${userId}`,
      sql`SELECT datum, gewicht_kg, vetpercentage, spiermassa_kg, visceraal_vet, inbody_score, bmr_kcal
        FROM inbody_metingen WHERE user_id = ${userId} ORDER BY datum DESC LIMIT 3`,
      sql`SELECT datum, hrv_ochtend, slaap_uur, slaapscore, herstelbalans
        FROM trainingen WHERE user_id = ${userId} AND hrv_ochtend IS NOT NULL
        AND datum >= (CURRENT_DATE - INTERVAL '7 days') ORDER BY datum DESC`,
      sql`SELECT maaltijd_type, beschrijving, kcal, eiwit_g, koolhydraten_g, vetten_g
        FROM maaltijden WHERE user_id = ${userId} AND datum = ${vandaag} ORDER BY created_at ASC`,
      sql`SELECT kcal, eiwit_g, koolhydraten_g, vetten_g
        FROM maaltijden WHERE user_id = ${userId} AND datum = (CURRENT_DATE - INTERVAL '1 day')`,
      sql`SELECT titel, beschrijving, doel_waarde, huidige_waarde, eenheid, deadline, sport
        FROM doelen WHERE user_id = ${userId} AND actief = TRUE ORDER BY deadline ASC NULLS LAST LIMIT 8`,
      sql`SELECT datum, sport, duur_min, kcal, gem_hartslag, max_hartslag,
          hrv_ochtend, slaap_uur, slaapscore, herstelbalans,
          zone2_min, zone3_min, zone4_min, notities
        FROM trainingen WHERE user_id = ${userId}
        AND datum >= (CURRENT_DATE - INTERVAL '7 days') ORDER BY datum DESC`,
      sql`SELECT datum, slaap_uur, slaap_score, diepe_slaap_min, rem_slaap_min, lichte_slaap_min,
          hrv_ochtend, herstel_balans, stress_pct, rust_hartslag, stappen, kcal_actief
        FROM dagelijkse_wellness WHERE user_id = ${userId}
        AND datum >= (CURRENT_DATE - INTERVAL '7 days') ORDER BY datum DESC`.catch(() => []),
      sql`SELECT is_ai, bericht FROM gesprekken WHERE user_id = ${userId} ORDER BY created_at DESC, id DESC LIMIT 100`
    ])
    opgeslagen = _opgeslagen

    // Nieuw opgeslagen maaltijd meenemen in vandaag-lijst
    const alleMealsVandaag = [...vandaagMeals]
    if (opgeslagen?.type === 'maaltijd') {
      alleMealsVandaag.push({
        maaltijd_type: opgeslagen.data.maaltijd_type || getMaaltijdType(),
        beschrijving: opgeslagen.data.beschrijving,
        kcal: opgeslagen.data.kcal,
        eiwit_g: opgeslagen.data.eiwit_g,
        koolhydraten_g: opgeslagen.data.koolhydraten_g,
        vetten_g: opgeslagen.data.vetten_g,
      })
    }

    // Bereken totalen
    const totVandaag = alleMealsVandaag.reduce((s, m) => ({
      kcal: s.kcal + (m.kcal || 0),
      eiwit: s.eiwit + (parseFloat(m.eiwit_g) || 0),
      kh: s.kh + (parseFloat(m.koolhydraten_g) || 0),
      vet: s.vet + (parseFloat(m.vetten_g) || 0),
    }), { kcal: 0, eiwit: 0, kh: 0, vet: 0 })

    const totGister = gisterMeals.reduce((s, m) => ({
      kcal: s.kcal + (m.kcal || 0),
      eiwit: s.eiwit + (parseFloat(m.eiwit_g) || 0),
    }), { kcal: 0, eiwit: 0 })

    // ── TDEE berekening (Mifflin-St Jeor) ──
    const naam = profiel?.name || 'gebruiker'
    const coachNaam = profiel?.coach_naam || 'APEX Coach'
    const leeftijd = profiel?.geboortejaar ? new Date().getFullYear() - profiel.geboortejaar : null
    // Fallback naar leeftijd 35 als geboortejaar ontbreekt — anders krijgt user nooit TDEE
    const leeftijdVoorBMR = leeftijd || 35
    const leeftijdGeschat = !leeftijd

    let tdeeStr = ''
    let tdee = null
    if (profiel?.gewicht_kg && profiel?.lengte_cm) {
      const bmr = profiel.geslacht?.toLowerCase() === 'vrouw'
        ? (10 * profiel.gewicht_kg) + (6.25 * profiel.lengte_cm) - (5 * leeftijdVoorBMR) - 161
        : (10 * profiel.gewicht_kg) + (6.25 * profiel.lengte_cm) - (5 * leeftijdVoorBMR) + 5
      // Activiteitsfactor o.b.v. weektotaal trainingsminuten (fysiologisch correct: volume telt, niet sessies)
      const echteT = weektraining.filter(t => t.sport !== 'herstel')
      const totaalMinW = echteT.reduce((s, t) => s + (t.duur_min || 0), 0)
      const actFactor = totaalMinW >= 420 ? 1.725   // ≥7u/week — zware atleet
                      : totaalMinW >= 240 ? 1.55    // ≥4u/week — actief
                      : totaalMinW >= 120 ? 1.375   // ≥2u/week — licht actief
                      : totaalMinW >= 30  ? 1.3
                      : 1.2
      tdee = Math.round(bmr * actFactor)
      const balans = totVandaag.kcal ? totVandaag.kcal - tdee : null
      const ouderwetsLabel = leeftijdGeschat ? ' (leeftijd 35 aangenomen — vul geboortejaar in voor exacte berekening)' : ''
      tdeeStr = `Geschatte TDEE: ~${tdee} kcal/dag (BMR × ${actFactor}, ${totaalMinW}min training/week)${ouderwetsLabel}
Voedingsbalans vandaag: ${balans !== null ? `${balans > 0 ? '+' : ''}${balans} kcal` : 'onbekend'}${balans !== null ? ` (${balans > 400 ? 'grote surplus' : balans > 0 ? 'lichte surplus' : balans > -400 ? 'licht tekort' : 'groot tekort'})` : ''}
Eiwit per kg: ${profiel.gewicht_kg ? (totVandaag.eiwit / profiel.gewicht_kg).toFixed(1) : '?'} g/kg`
    }

    const stijlInstructie = {
      direct: 'Wees direct en bondig. Geef concrete getallen en acties.',
      motiverend: 'Wees enthousiast en motiverend. Moedig aan en vier successen.',
      wetenschappelijk: 'Geef wetenschappelijk onderbouwde uitleg met fysiologische onderbouwing.',
      vriendelijk: 'Wees warm, ondersteunend en empathisch.'
    }[profiel?.coach_stijl || 'direct'] || 'Wees direct en bondig.'

    // ── Voeding vandaag opbouwen ──
    const dagdoelKcal = profiel?.doel_kcal || 2400
    const dagdoelEiwit = profiel?.doel_eiwit_g || 160
    const dagdoelKh = profiel?.doel_koolhydraten_g || 250
    const dagdoelVet = profiel?.doel_vetten_g || 80
    const restKcal = dagdoelKcal - totVandaag.kcal
    const restEiwit = dagdoelEiwit - totVandaag.eiwit

    const maaltijdRegels = alleMealsVandaag.length > 0
      ? alleMealsVandaag.map(m => {
          const macros = [
            m.kcal != null ? `${m.kcal}kcal` : null,
            m.eiwit_g != null ? `${parseFloat(m.eiwit_g).toFixed(1)}g eiwit` : null,
            m.koolhydraten_g != null ? `${parseFloat(m.koolhydraten_g).toFixed(1)}g kh` : null,
            m.vetten_g != null ? `${parseFloat(m.vetten_g).toFixed(1)}g vet` : null,
          ].filter(Boolean).join(' | ')
          return `  • ${m.maaltijd_type || 'maaltijd'}: ${m.beschrijving || '—'} — ${macros}`
        }).join('\n')
      : '  Nog geen maaltijden gelogd'

    // ── InBody trend opbouwen ──
    const inbodyRegels = inbodyTrend.length > 0
      ? inbodyTrend.map(m => {
          const parts = [
            m.gewicht_kg ? `${m.gewicht_kg}kg` : null,
            m.vetpercentage ? `${m.vetpercentage}% vet` : null,
            m.spiermassa_kg ? `${m.spiermassa_kg}kg spier` : null,
            m.visceraal_vet ? `visceraal ${m.visceraal_vet}` : null,
            m.inbody_score ? `score ${m.inbody_score}` : null,
          ].filter(Boolean).join(' | ')
          return `  • ${m.datum}: ${parts}`
        }).join('\n')
      : '  Geen InBody metingen beschikbaar'

    // ── HRV/herstel: merge trainingen (handmatig) + dagelijkse_wellness (Suunto) ──
    const wByDatum = new Map(wellnessTrend.map(w => [String(w.datum).slice(0, 10), w]))
    const tByDatum = new Map(hrvTrend.map(h => [String(h.datum).slice(0, 10), h]))
    const allHerstelDatums = [...new Set([...wByDatum.keys(), ...tByDatum.keys()])].sort().reverse().slice(0, 7)
    const mergedHerstel = allHerstelDatums.map(datum => {
      const t = tByDatum.get(datum) || {}
      const w = wByDatum.get(datum) || {}
      return {
        datum,
        hrv:           t.hrv_ochtend   ?? w.hrv_ochtend   ?? null,
        slaap:         t.slaap_uur     ?? w.slaap_uur     ?? null,
        slaapscore:    t.slaapscore    ?? w.slaap_score   ?? null,
        herstelbalans: t.herstelbalans ?? (w.herstel_balans != null ? parseFloat(w.herstel_balans) * 100 : null),
        diepe_slaap:   w.diepe_slaap_min ?? null,
        rem_slaap:     w.rem_slaap_min   ?? null,
        rust_hartslag: w.rust_hartslag   ?? null,
        stappen:       w.stappen        ?? null,
        stress_pct:    w.stress_pct     ?? null,
        bron: t.hrv_ochtend ? 'handmatig' : 'suunto',
      }
    })

    const herstelRegels = mergedHerstel.length > 0
      ? mergedHerstel.map(m => {
          const parts = [
            m.hrv          ? `HRV ${m.hrv}ms` : null,
            m.slaap        ? `slaap ${m.slaap}u` : null,
            m.slaapscore   ? `score ${m.slaapscore}` : null,
            m.herstelbalans != null ? `balans ${parseFloat(m.herstelbalans) > 0 ? '+' : ''}${Math.round(m.herstelbalans)}` : null,
            m.diepe_slaap  ? `diepe slaap ${m.diepe_slaap}min` : null,
            m.rem_slaap    ? `REM ${m.rem_slaap}min` : null,
            m.rust_hartslag ? `rust-HR ${m.rust_hartslag}bpm` : null,
            m.stappen      ? `${m.stappen.toLocaleString('nl-NL')} stappen` : null,
            m.stress_pct != null ? `stress ${m.stress_pct}%` : null,
          ].filter(Boolean).join(' | ')
          return `  • ${m.datum} [${m.bron}]: ${parts || 'geen data'}`
        }).join('\n')
      : '  Geen hersteldata beschikbaar'

    const recentHerstel = mergedHerstel[0] || {}

    // ── Trainingen detail opbouwen ──
    const trainingRegels = weektraining.length > 0
      ? weektraining.map(t => {
          const detail = [
            t.duur_min ? `${t.duur_min}min` : null,
            t.kcal ? `${t.kcal}kcal` : null,
            t.gem_hartslag ? `gem HR ${t.gem_hartslag}bpm` : null,
            t.max_hartslag ? `max ${t.max_hartslag}bpm` : null,
            (t.zone2_min || t.zone3_min || t.zone4_min)
              ? `zones Z2:${t.zone2_min||0} Z3:${t.zone3_min||0} Z4:${t.zone4_min||0}min` : null,
          ].filter(Boolean).join(' | ')
          const herstelInfo = t.hrv_ochtend ? ` [HRV ${t.hrv_ochtend}ms slaap ${t.slaap_uur}u]` : ''
          return `  • ${t.datum} ${t.sport}: ${detail}${herstelInfo}${t.notities ? ` — "${t.notities}"` : ''}`
        }).join('\n')
      : '  Geen trainingen deze week'

    // ── Doelen opbouwen ──
    const doelenRegels = actieveDoelen.length > 0
      ? actieveDoelen.map(d => {
          const pct = d.doel_waarde && d.huidige_waarde
            ? Math.round((d.huidige_waarde / d.doel_waarde) * 100) : 0
          const deadline = d.deadline ? ` (deadline: ${d.deadline})` : ''
          const sport = d.sport ? ` [${d.sport}]` : ''
          return `  • ${d.titel}${sport}: ${d.huidige_waarde||'?'}/${d.doel_waarde} ${d.eenheid||''} (${pct}%)${deadline}${d.beschrijving ? ` — ${d.beschrijving}` : ''}`
        }).join('\n')
      : '  Geen actieve doelen'

    // Eiwit-aanbeveling schalen naar sport + volume (i.p.v. blind 1.6 g/kg)
    const echteTrainingenW = weektraining.filter(t => t.sport !== 'herstel')
    const totaalMinWeek = echteTrainingenW.reduce((s, t) => s + (t.duur_min || 0), 0)
    const sporten = profiel?.sporten || []
    const heeftKracht = sporten.some(s => ['fitness', 'hyrox', 'crossfit'].includes(s))
    const heeftDuursport = sporten.some(s => ['hardlopen', 'fietsen', 'wielrennen', 'zwemmen'].includes(s))
    // 0.8 sedentair, 1.2 recreatief, 1.4 duursport, 1.6 kracht/hyrox, 2.0 cut+kracht
    let eiwitPerKg = 0.8
    if (totaalMinWeek >= 30) eiwitPerKg = 1.2
    if (totaalMinWeek >= 120 && heeftDuursport) eiwitPerKg = 1.4
    if (heeftKracht && totaalMinWeek >= 60) eiwitPerKg = 1.6
    if (heeftKracht && tdee && totVandaag.kcal && totVandaag.kcal < tdee - 300) eiwitPerKg = 2.0
    const minEiwit = profiel?.gewicht_kg ? Math.round(profiel.gewicht_kg * eiwitPerKg) : 100
    const recentHrv = recentHerstel.hrv || null
    const recentSlaap = recentHerstel.slaap || null

    const heeftHyrox = profiel?.sporten?.includes('hyrox')
    const hyroxKennis = heeftHyrox ? `
═══ HYROX COACHING KENNIS ═══
HYROX race formaat: 8 rondes van 1km hardlopen, telkens gevolgd door één functioneel station:
  Ronde 1 → SkiErg 1000m
  Ronde 2 → Sled Push 50m
  Ronde 3 → Sled Pull 50m
  Ronde 4 → Burpee Broad Jump 80m
  Ronde 5 → RowErg 1000m
  Ronde 6 → Farmer's Carry 200m (2× 24kg men / 2× 16kg women)
  Ronde 7 → Sandbag Lunges 100m (20kg men / 10kg women)
  Ronde 8 → Wall Balls 100 reps (6kg men / 4kg women)

Sled gewichten Open Men: Push +102kg, Pull +78kg | Pro Men: Push +152kg, Pull +103kg
Streeftijden Open Men: Elite <60min | Sterk 60–75min | Amateur 75–95min | Beginner 95–120min
Streeftijden Open Women: Elite <70min | Sterk 70–85min | Amateur 85–105min

HYROX trainingspeilers (in volgorde van impact op eindtijd):
1. AEROBE BASIS — Zone2 hardlopen is de #1 tijdsbepaler. Meer Z2 volume = snellere runs + sneller herstel tussen stations. Minimum 80% van trainingsvolume rustig.
2. RUNNING ECONOMY — Lopen op vermoeide benen (na zware stations). Train dit expliciet met "brick workouts": kracht direct gevolgd door 1–2km run.
3. FUNCTIONELE KRACHT — Focus op: posterior chain (sled/carries), grip strength (farmer's carry), single-leg kracht (lunges), schouder/core (wall balls, ski erg). 2–3 krachtdagen/week.
4. RACE-SPECIFIEKE INTENSITEIT — "Double work" training: 2 stations aaneengesloten + 2km run. Bouw racespecificiteit in de laatste 6 weken op.
5. HERSTEL & PERIODICERING — Hyrox-training is hoog volume + hoog intensiteit tegelijk. Herstelmanagement is kritiek.

Proactieve HYROX coaching regels (gebruik ALTIJD als data aanleiding geeft):
• Zone2 < 60min/week → TOPPRIORITEIT: "Je aerobe basis bepaalt 60% van je HYROX-tijd. Voeg Z2 hardloopsessies toe."
• Hardlopen < 2x/week → "Je runt 8km in de race (8× 1km), dit vraagt om meer loopvolume."
• Kracht < 1x/week → "Zonder gerichte krachttraining verlies je op de sled, carry en lunges."
• Race deadline nadert (≤6 weken) → adviseer taper: volume −30%, intensiteit behouden, race-simulaties toevoegen.
• Als HYROX in actieve doelen met deadline → bereken weken tot race en geef periodiseringsplan.
• Bij hoge RPE op hardloopsessies → check of running economy voldoende is voor HYROX-tempo.
` : ''

    const systemPrompt = `Je bent ${coachNaam}, een persoonlijke AI-coachingassistent voor ${naam}.
HUIDIGE DATUM EN TIJD: ${dagNaamNL} ${vandaag}, ${tijdStr} (Nederlandse tijd — gebruik dit als referentie voor "vandaag", "gisteren", "deze week", etc.)

ROL: Combineer trainer, diëtist, fysioloog en coach. Geef altijd concreet, gepersonaliseerd advies op basis van onderstaande actuele data. Gebruik alle beschikbare data actief.

═══ PROACTIEVE COACHINGSINSTRUCTIES ═══
Wacht NOOIT tot de gebruiker vraagt. Analyseer de data en reageer proactief:
• HRV < 45ms of slaap < 6u → waarschuw direct: geen intensieve training, prioriteit herstel
• HRV > 55ms + minder dan 2 trainingen/week → daag uit: "Je lichaam is klaar, wanneer ga je trainen?"
• Kcal < TDEE − 400 op een trainingsdag → wijs op ondervoedering en herstelrisico
• Eiwit < ${minEiwit}g/dag (${eiwitPerKg}g/kg, afgestemd op sportprofiel) → geef concreet plan om dit aan te vullen
• Zone2-training < 60min/week → adviseer aerobe basis opbouwen voor vetverbranding en herstel
• Geen hersteldata gelogd → herinner aan ochtend HRV/slaap log
Geef altijd een concrete aanbeveling voor de VOLGENDE 24 uur als dat relevant is.

═══ AUTOMATISCH OPSLAAN VAN VOEDING ═══
Alleen als de gebruiker EXPLICIET in voltooid-verleden-tijd beschrijft dat hij/zij iets HEEFT gegeten of gedronken ("net gegeten", "vanmiddag had ik", "zojuist gedronken"), voeg dan ACHTERIN je antwoord dit blok toe — onzichtbaar voor de gebruiker:
[AUTO_SAVE]{"beschrijving":"korte naam","maaltijd_type":"ontbijt|lunch|diner|snack|pre-workout|post-workout","kcal":0,"eiwit_g":0.0,"koolhydraten_g":0.0,"vetten_g":0.0}[/AUTO_SAVE]
Combineer meerdere producten die samen gegeten zijn in één entry. Gebruik standaard porties als geen hoeveelheid gegeven is.
DOE DIT ABSOLUUT NIET BIJ:
• Vragen ("hoeveel kcal in X?", "wat zit er in Y?", "mag ik Z eten?")
• Hypothetische plannen ("vanavond wil ik...", "ik denk aan...")
• Algemene voorkeuren ("ik hou van pizza", "ik eet meestal...")
• Voedingsfeiten of berekeningen zonder duidelijk consumptiemoment
Bij twijfel: SLA NIET OP. De gebruiker kan altijd handmatig loggen via de maaltijden-pagina.

═══ GEBRUIKERSPROFIEL ═══
Naam: ${naam}${leeftijd ? ` | ${leeftijd} jaar` : ''}${profiel?.geslacht ? ` | ${profiel.geslacht}` : ''}
Lengte: ${profiel?.lengte_cm || '?'}cm | Gewicht: ${profiel?.gewicht_kg || '?'}kg
Sporten: ${profiel?.sporten?.join(', ') || 'fitness, padel, fietsen'}
Dagdoelen: ${dagdoelKcal}kcal | ${dagdoelEiwit}g eiwit | ${dagdoelKh}g koolhyd | ${dagdoelVet}g vet
${tdeeStr ? `\n${tdeeStr}` : ''}
${profiel?.coach_context ? `Persoonlijke context: ${profiel.coach_context}` : ''}

═══ VOEDING VANDAAG (${vandaag}) ═══
${maaltijdRegels}
Dagtotaal: ${Math.round(totVandaag.kcal)}kcal | ${Math.round(totVandaag.eiwit)}g eiwit | ${Math.round(totVandaag.kh)}g kh | ${Math.round(totVandaag.vet)}g vet
Resterend: ${Math.round(restKcal)}kcal | ${Math.round(restEiwit)}g eiwit
${gisterMeals.length ? `Gisteren: ${Math.round(totGister.kcal)}kcal | ${Math.round(totGister.eiwit)}g eiwit` : ''}

═══ SUUNTO MEETMETHODE — VERPLICHT BEGRIJPEN ═══
Alle wellness-data komt van de Suunto smartwatch. Interpreteer de cijfers ALTIJD zo:
• HRV (hrv_ochtend): Gemiddelde HRV gemeten TIJDENS DE SLAAP (nacht), niet een losse ochtendmeting. Betrouwbaarder dan een handmatige meting. Datum = dag waarop de gebruiker wakker werd.
• Rusthartslag (rust_hartslag): Laagste hartslag gemeten tussen 03:00–06:00 's nachts. Nauwkeuriger dan een handmatige polsmeting omdat het altijd in rust is.
• Herstelbalans (balans): Suunto's Training Load Balance — positief = meer herstelcapaciteit dan trainingsbelasting; negatief = overbelast. Vandaag = meest actuele meting van dit moment; historische dagen = ochtendgemiddelde 04:00–09:00.
• Slaap: Automatisch gedetecteerd door de watch (geen knop drukken nodig). Bevat diepe slaap, REM en lichte slaap in minuten.
• Actieve kcal: Calorieën verbrand BOVEN het rustmetabolisme — dit zijn niet de totale dagcalorieën.
• Stappen: Dagtotaal van de watch.
• Stress %: Gebaseerd op HRV-variabiliteit overdag; 0% = ontspannen, 100% = gestrest.
• Bron [suunto] = automatisch gemeten; [handmatig] = door gebruiker ingevoerd via het ochtendformulier.

═══ HERSTEL & HRV (afgelopen 7 dagen) ═══
${herstelRegels}

═══ TRAININGEN DEZE WEEK ═══
Aantal sessies: ${echteTrainingenW.length} | Zone2 totaal: ${echteTrainingenW.reduce((s, t) => s + (t.zone2_min || 0), 0)}min | Meest recente HRV: ${recentHrv ? `${recentHrv}ms` : 'geen'} | Slaap: ${recentSlaap ? `${recentSlaap}u` : 'geen'}
${trainingRegels}

═══ LICHAAM / INBODY TREND ═══
${inbodyRegels}

═══ ACTIEVE DOELEN ═══
${doelenRegels}
${hyroxKennis}
Spreek altijd Nederlands. ${stijlInstructie} Verwijs actief naar bovenstaande data. Als de data aanleiding geeft tot een proactieve opmerking (zie instructies boven), begin dan daarmee voordat je de vraag van de gebruiker beantwoordt.`

    // ── Bouw user bericht op (afbeeldingen + tekst + geëxtraheerde context) ──
    const userContent = bestandenNaarContent(bestanden || [])
    let berichtTekst = bericht || ''
    if (opgeslagen?.samenvatting) {
      berichtTekst += `\n\n[Automatisch opgeslagen in logboek — geëxtraheerde data]\n${opgeslagen.samenvatting}`
    }
    if (berichtTekst.trim()) userContent.push({ type: 'text', text: berichtTekst.trim() })

    const filteredHistory = history.reverse().filter(h => h.bericht && h.bericht.trim())
    const dedupedHistory = []
    for (const h of filteredHistory) {
      const role = h.is_ai ? 'assistant' : 'user'
      const content = h.bericht.trim()
      if (dedupedHistory.length > 0 && dedupedHistory[dedupedHistory.length - 1].role === role) {
        dedupedHistory[dedupedHistory.length - 1].content += '\n\n' + content
      } else {
        dedupedHistory.push({ role, content })
      }
    }
    while (dedupedHistory.length > 0 && dedupedHistory[0].role === 'assistant') dedupedHistory.shift()

    const messages = [
      ...dedupedHistory,
      { role: 'user', content: userContent.length === 1 && userContent[0].type === 'text' ? userContent[0].text : userContent }
    ]

    const response = await client.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 2500, system: systemPrompt, messages })
    let antwoord = response.content[0].text

    // ── Check voor AUTO_SAVE blok in AI response (fallback als haiku/regex niets vindt) ──
    if (!opgeslagen) {
      const autoSaveMatch = antwoord.match(/\[AUTO_SAVE\]([\s\S]*?)\[\/AUTO_SAVE\]/)
      if (autoSaveMatch) {
        try {
          const d = JSON.parse(autoSaveMatch[1].trim())
          const kcal = Number(d.kcal)
          const eiwit = Number(d.eiwit_g)
          // Strict validatie: realistische macro-waarden, geen 0/NaN, en niet duidelijk een vraag
          const userVraag = (bericht || '').toLowerCase()
          const lijktVraag = /\?$|^(hoeveel|wat|hoe veel|kan ik|mag ik|moet ik)\b/.test(userVraag.trim())
          const geldigeMaaltijd = d.beschrijving
            && typeof d.beschrijving === 'string'
            && d.beschrijving.length >= 2
            && Number.isFinite(kcal) && kcal >= 30 && kcal <= 4000
            && Number.isFinite(eiwit) && eiwit >= 0 && eiwit <= 300
            && !lijktVraag
          if (geldigeMaaltijd) {
            const vandaagStr = vandaagAms()
            const maaltijdType = d.maaltijd_type || getMaaltijdType()
            const [row] = await sql`
              INSERT INTO maaltijden (user_id, datum, maaltijd_type, beschrijving, kcal, eiwit_g, koolhydraten_g, vetten_g)
              VALUES (${userId}, ${vandaagStr}, ${maaltijdType}, ${d.beschrijving},
                ${kcal}, ${eiwit}, ${Number(d.koolhydraten_g) || null}, ${Number(d.vetten_g) || null})
              RETURNING id`
            opgeslagen = {
              type: 'maaltijd', id: row.id, data: { ...d, kcal, eiwit_g: eiwit },
              label: `${d.beschrijving} (${maaltijdType})`,
              samenvatting: `${d.beschrijving} — ${kcal}kcal | ${eiwit}g eiwit | ${d.koolhydraten_g || 0}g kh | ${d.vetten_g || 0}g vet`
            }
          } else {
            console.warn('AUTO_SAVE geweigerd:', { lijktVraag, kcal, eiwit, beschrijving: d.beschrijving })
          }
        } catch (err) { console.error('AUTO_SAVE parse fout:', err) }
        antwoord = antwoord.replace(/\s*\[AUTO_SAVE\][\s\S]*?\[\/AUTO_SAVE\]/, '').trim()
      }
    }

    const opgeslagenTekst = bericht || (bestanden?.length ? `[${bestanden.length} bestand(en) geüpload: ${upload_type || 'upload'}]` : '')
    // Twee aparte INSERTs zodat id-volgorde de chronologische volgorde garandeert
    // (één VALUES-statement geeft beide rijen dezelfde created_at waardoor volgorde onbepaald is)
    await sql`INSERT INTO gesprekken (user_id, rol, bericht, is_ai, upload_type)
      VALUES (${userId}, 'user', ${opgeslagenTekst}, false, ${upload_type||null})`
    await sql`INSERT INTO gesprekken (user_id, rol, bericht, is_ai, upload_type)
      VALUES (${userId}, 'assistant', ${antwoord}, true, null)`

    return cors({ antwoord, opgeslagen })
  } catch (err) {
    console.error('Coach chat error:', err)
    const msg = (err.status === 529 || err.message?.includes('overloaded'))
      ? 'De AI is momenteel druk bezet. Probeer het over een minuut opnieuw.'
      : (err.status === 400 && err.message?.includes('credit balance'))
      ? 'Het API-tegoed is op. Voeg credits toe via console.anthropic.com → Billing.'
      : (err.status === 401 || err.message?.includes('API key'))
      ? 'De API-sleutel is ongeldig of verlopen. Controleer de instellingen.'
      : `Coach tijdelijk niet beschikbaar. Probeer het opnieuw. (${err.status || 500})`
    return cors({ error: msg }, err.status || 500)
  }
}
