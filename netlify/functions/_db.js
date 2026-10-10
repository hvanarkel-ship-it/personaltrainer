import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const { Pool } = pg

let realSql = null
let supabaseClient = null

export function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
  if (url && key && !supabaseClient) {
    supabaseClient = createClient(url, key)
  }
  return supabaseClient
}

// In-memory data store for fallback/dev
const mockStore = {
  users: [
    {
      id: 1,
      email: 'henk.van.arkel@athvaro.com',
      password_hash: bcrypt.hashSync('password123', 8),
      name: 'Henk van Arkel',
      created_at: new Date('2026-01-01').toISOString(),
    },
    {
      id: 2,
      email: 'demo@apexcoach.nl',
      password_hash: bcrypt.hashSync('password123', 8),
      name: 'Henk van Arkel',
      created_at: new Date('2026-01-01').toISOString(),
    }
  ],
  user_profile: [
    {
      user_id: 1,
      geboortejaar: 1988,
      geslacht: 'man',
      lengte_cm: 184,
      gewicht_kg: 82.4,
      doel_kcal: 2500,
      doel_eiwit_g: 175,
      doel_koolhydraten_g: 260,
      doel_vetten_g: 75,
      sporten: ['hyrox', 'hardlopen', 'fitness', 'padel'],
      coach_context: 'Focus op HYROX voorbereiding, aerobe basis vergroten en krachtbehoud.',
      coach_naam: 'APEX Coach',
      coach_stijl: 'direct',
      intervals_athlete_id: null,
      intervals_api_key: null,
      runalyze_api_token: null,
      garmin_connected: true,
      garmin_username: 'hvanarkel@gmail.com',
      garmin_token: 'garmin_session_active',
      garmin_last_sync: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      user_id: 2,
      geboortejaar: 1988,
      geslacht: 'man',
      lengte_cm: 184,
      gewicht_kg: 82.4,
      doel_kcal: 2500,
      doel_eiwit_g: 175,
      doel_koolhydraten_g: 260,
      doel_vetten_g: 75,
      sporten: ['hyrox', 'hardlopen', 'fitness', 'padel'],
      coach_context: 'Focus op HYROX voorbereiding, aerobe basis vergroten en krachtbehoud.',
      coach_naam: 'APEX Coach',
      coach_stijl: 'direct',
      intervals_athlete_id: null,
      intervals_api_key: null,
      runalyze_api_token: null,
      garmin_connected: true,
      garmin_username: 'hvanarkel@gmail.com',
      garmin_token: 'garmin_session_active',
      garmin_last_sync: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  ],
  inbody_metingen: [
    {
      id: 1,
      user_id: 1,
      datum: '2026-10-01',
      gewicht_kg: 83.2,
      vetmassa_kg: 13.3,
      vetpercentage: 16.0,
      spiermassa_kg: 41.5,
      visceraal_vet: 6,
      bmr_kcal: 1890,
      vochtbalans_pct: 0.385,
      inbody_score: 84,
      bron: 'handmatig',
      notities: 'Goede spieropbouw, vetpercentage stabiel.',
      created_at: new Date('2026-10-01').toISOString(),
    },
    {
      id: 2,
      user_id: 1,
      datum: '2026-10-08',
      gewicht_kg: 82.4,
      vetmassa_kg: 12.8,
      vetpercentage: 15.5,
      spiermassa_kg: 41.8,
      visceraal_vet: 5,
      bmr_kcal: 1905,
      vochtbalans_pct: 0.382,
      inbody_score: 86,
      bron: 'handmatig',
      notities: 'Progressie op spiermassa en lichte daling vetmassa.',
      created_at: new Date('2026-10-08').toISOString(),
    }
  ],
  trainingen: [
    {
      id: 1,
      user_id: 1,
      datum: '2026-10-07',
      sport: 'hardlopen',
      duur_min: 52,
      kcal: 580,
      gem_hartslag: 142,
      max_hartslag: 164,
      hrv_ochtend: 58,
      slaap_uur: 7.8,
      slaapscore: 84,
      herstelbalans: 1.2,
      zone2_min: 38,
      zone3_min: 10,
      zone4_min: 4,
      notities: 'Garmin Connect loop — 8.5km Zone 2 aerobe basis',
      bron: 'garmin',
      intervals_id: null,
      runalyze_id: null,
      rpe: 6,
      stemming: 8,
      created_at: new Date('2026-10-07T08:00:00Z').toISOString(),
    },
    {
      id: 2,
      user_id: 1,
      datum: '2026-10-08',
      sport: 'hyrox',
      duur_min: 65,
      kcal: 710,
      gem_hartslag: 156,
      max_hartslag: 178,
      hrv_ochtend: 62,
      slaap_uur: 8.1,
      slaapscore: 88,
      herstelbalans: 1.5,
      zone2_min: 15,
      zone3_min: 30,
      zone4_min: 20,
      notities: 'HYROX stations training: Sled push + SkiErg + Lunges',
      bron: 'handmatig',
      intervals_id: null,
      runalyze_id: null,
      rpe: 8,
      stemming: 9,
      created_at: new Date('2026-10-08T09:30:00Z').toISOString(),
    },
    {
      id: 3,
      user_id: 1,
      datum: '2026-10-09',
      sport: 'herstel',
      duur_min: null,
      kcal: null,
      gem_hartslag: 52,
      max_hartslag: null,
      hrv_ochtend: 65,
      slaap_uur: 7.9,
      slaapscore: 86,
      herstelbalans: 1.8,
      zone2_min: null,
      zone3_min: null,
      zone4_min: null,
      notities: 'Ochtendmeting Garmin / Suunto — Uitstekend hersteld',
      bron: 'garmin',
      intervals_id: null,
      runalyze_id: null,
      rpe: null,
      stemming: null,
      created_at: new Date('2026-10-09T06:30:00Z').toISOString(),
    }
  ],
  maaltijden: [
    {
      id: 1,
      user_id: 1,
      datum: '2026-10-09',
      maaltijd_type: 'ontbijt',
      beschrijving: 'Havermout met bosbessen, wei-eiwit en amandelboter',
      kcal: 540,
      eiwit_g: 42.0,
      koolhydraten_g: 65.0,
      vetten_g: 14.0,
      foto_analyse: null,
      ai_notities: 'Gebalanceerd ontbijt met snelle en langzame koolhydraten.',
      created_at: new Date('2026-10-09T07:30:00Z').toISOString(),
    },
    {
      id: 2,
      user_id: 1,
      datum: '2026-10-09',
      maaltijd_type: 'lunch',
      beschrijving: 'Kipfilet wrap met avocado, spinazie en hummus',
      kcal: 620,
      eiwit_g: 48.0,
      koolhydraten_g: 52.0,
      vetten_g: 18.0,
      foto_analyse: null,
      ai_notities: 'Uitstekende eiwitportie voor spierherstel.',
      created_at: new Date('2026-10-09T12:30:00Z').toISOString(),
    }
  ],
  doelen: [
    {
      id: 1,
      user_id: 1,
      titel: 'HYROX Open Men Sub 65m',
      sport: 'hyrox',
      beschrijving: 'HYROX wedstrijd onder 1 uur en 5 minuten finishen',
      doel_waarde: 65,
      huidige_waarde: 71,
      eenheid: 'min',
      deadline: '2026-11-28',
      actief: true,
      created_at: new Date().toISOString(),
    },
    {
      id: 2,
      user_id: 1,
      titel: 'Zone 2 loopvolume per week',
      sport: 'hardlopen',
      beschrijving: 'Wekelijks minimaal 90 minuten aerobe basis opbouwen',
      doel_waarde: 90,
      huidige_waarde: 65,
      eenheid: 'min/wk',
      deadline: null,
      actief: true,
      created_at: new Date().toISOString(),
    },
    {
      id: 3,
      user_id: 1,
      titel: 'Spiermassa behoud bij 15% vet',
      sport: 'fitness',
      beschrijving: 'Spiermassa boven 41.5 kg houden',
      doel_waarde: 42.0,
      huidige_waarde: 41.8,
      eenheid: 'kg',
      deadline: null,
      actief: true,
      created_at: new Date().toISOString(),
    }
  ],
  gesprekken: [
    {
      id: 1,
      user_id: 1,
      rol: 'assistant',
      bericht: 'Welkom bij APEX Coach! Ik ben je persoonlijke AI-trainer en voedingscoach. Je herstelmeting van vanochtend ziet er top uit (HRV 65ms, slaapscore 86). Je lichaam is klaar voor actie. Hoe kan ik je vandaag helpen?',
      is_ai: true,
      upload_type: null,
      created_at: new Date('2026-10-09T07:00:00Z').toISOString(),
    }
  ],
  dagelijkse_stats: []
}

let nextId = 100

// In-memory query interpreter
function executeMockQuery(sqlText, values) {
  const norm = sqlText.replace(/\s+/g, ' ').trim()

  // Health check: SELECT 1 AS ok
  if (/SELECT 1 AS ok/i.test(norm)) {
    return [{ ok: 1 }]
  }

  // users table
  if (/SELECT id, email, name, password_hash FROM users WHERE email =/i.test(norm)) {
    const email = String(values[0] || '').toLowerCase()
    const u = mockStore.users.find(x => x.email.toLowerCase() === email)
    return u ? [u] : []
  }

  if (/SELECT id FROM users WHERE email =/i.test(norm)) {
    const email = String(values[0] || '').toLowerCase()
    const u = mockStore.users.find(x => x.email.toLowerCase() === email)
    return u ? [{ id: u.id }] : []
  }

  if (/INSERT INTO users/i.test(norm)) {
    const email = values[0]
    const password_hash = values[1]
    const name = values[2]
    const user = { id: ++nextId, email, password_hash, name, created_at: new Date().toISOString() }
    mockStore.users.push(user)
    return [user]
  }

  if (/UPDATE users SET name =/i.test(norm)) {
    const name = values[0]
    const userId = Number(values[1])
    const u = mockStore.users.find(x => x.id === userId)
    if (u) u.name = name
    return [{ success: true }]
  }

  // user_profile
  if (/FROM user_profile/i.test(norm) && !/users/i.test(norm)) {
    const userId = Number(values[0]) || 1
    const p = mockStore.user_profile.find(x => x.user_id === userId) || mockStore.user_profile[0]
    return p ? [p] : []
  }

  if (/FROM users/i.test(norm) && /user_profile/i.test(norm)) {
    const userId = Number(values[values.length - 1] || values[0]) || 1
    const u = mockStore.users.find(x => x.id === userId) || mockStore.users[0]
    const p = mockStore.user_profile.find(x => x.user_id === userId) || mockStore.user_profile[0]
    return [{
      name: u?.name || 'Sporter',
      id: u?.id || userId,
      email: u?.email || 'demo@apexcoach.nl',
      created_at: u?.created_at,
      ...p,
      runalyze_verbonden: !!p?.runalyze_api_token,
      garmin_verbonden: !!p?.garmin_connected || !!p?.garmin_token,
    }]
  }

  if (/INSERT INTO user_profile/i.test(norm)) {
    const userId = Number(values[0]) || 1
    let p = mockStore.user_profile.find(x => x.user_id === userId)
    if (!p) {
      p = { user_id: userId, updated_at: new Date().toISOString() }
      mockStore.user_profile.push(p)
    }

    if (/garmin_connected/i.test(norm)) {
      p.garmin_connected = true
      p.garmin_username = values[1] || 'Garmin User'
      p.garmin_token = values[2] || 'token'
      p.garmin_last_sync = new Date().toISOString()
    } else if (/runalyze_api_token/i.test(norm)) {
      p.runalyze_api_token = values[1]
    } else if (/intervals_athlete_id/i.test(norm)) {
      p.intervals_athlete_id = values[1]
      p.intervals_api_key = values[2]
    } else if (values.length > 1) {
      p.geboortejaar = values[1] ?? p.geboortejaar
      p.lengte_cm = values[2] ?? p.lengte_cm
      p.gewicht_kg = values[3] ?? p.gewicht_kg
      p.doel_kcal = values[4] ?? p.doel_kcal
      p.doel_eiwit_g = values[5] ?? p.doel_eiwit_g
      p.doel_koolhydraten_g = values[6] ?? p.doel_koolhydraten_g
      p.doel_vetten_g = values[7] ?? p.doel_vetten_g
      p.sporten = values[8] ?? p.sporten
      p.geslacht = values[9] ?? p.geslacht
      p.coach_context = values[10] ?? p.coach_context
      p.coach_naam = values[11] ?? p.coach_naam
      p.coach_stijl = values[12] ?? p.coach_stijl
    }
    p.updated_at = new Date().toISOString()
    return [p]
  }

  if (/UPDATE user_profile/i.test(norm)) {
    const userId = Number(values[values.length - 1])
    const p = mockStore.user_profile.find(x => x.user_id === userId)
    if (p) {
      if (/intervals_athlete_id = NULL/i.test(norm)) {
        p.intervals_athlete_id = null
        p.intervals_api_key = null
      }
      if (/runalyze_api_token = NULL/i.test(norm)) {
        p.runalyze_api_token = null
      }
      if (/garmin_connected = FALSE/i.test(norm)) {
        p.garmin_connected = false
        p.garmin_token = null
        p.garmin_username = null
        p.garmin_last_sync = null
      }
      if (/garmin_last_sync/i.test(norm)) {
        p.garmin_last_sync = new Date().toISOString()
      }
      p.updated_at = new Date().toISOString()
    }
    return [{ success: true }]
  }

  // inbody_metingen
  if (/SELECT.*FROM inbody_metingen WHERE user_id =/i.test(norm)) {
    const userId = Number(values[0])
    const rows = mockStore.inbody_metingen
      .filter(x => x.user_id === userId)
      .sort((a, b) => new Date(b.datum) - new Date(a.datum))
    const limit = /LIMIT (\d+)/i.exec(norm) ? parseInt(RegExp.$1, 10) : (values[1] || rows.length)
    return rows.slice(0, Number(limit))
  }

  if (/INSERT INTO inbody_metingen/i.test(norm)) {
    const userId = Number(values[0])
    const datum = values[1] || new Date().toISOString().split('T')[0]
    const row = {
      id: ++nextId,
      user_id: userId,
      datum,
      gewicht_kg: values[2] || null,
      vetmassa_kg: values[3] || null,
      vetpercentage: values[4] || null,
      spiermassa_kg: values[5] || null,
      visceraal_vet: values[6] || null,
      bmr_kcal: values[7] || null,
      vochtbalans_pct: values[8] || null,
      inbody_score: values[9] || null,
      bron: values[10] || 'handmatig',
      notities: values[11] || null,
      created_at: new Date().toISOString(),
    }
    mockStore.inbody_metingen.push(row)
    return [row]
  }

  if (/DELETE FROM inbody_metingen WHERE id =/i.test(norm)) {
    const id = Number(values[0])
    const userId = Number(values[1])
    mockStore.inbody_metingen = mockStore.inbody_metingen.filter(x => !(x.id === id && x.user_id === userId))
    return [{ success: true }]
  }

  // trainingen
  if (/SELECT hrv_ochtend, slaap_uur, slaapscore, herstelbalans.*FROM trainingen/i.test(norm)) {
    const userId = Number(values[0])
    const row = mockStore.trainingen
      .filter(x => x.user_id === userId && x.hrv_ochtend != null)
      .sort((a, b) => new Date(b.datum) - new Date(a.datum))[0]
    return row ? [row] : []
  }

  if (/SELECT DISTINCT datum.*FROM trainingen/i.test(norm)) {
    const userId = Number(values[0])
    const days = [...new Set(mockStore.trainingen
      .filter(x => x.user_id === userId && x.sport !== 'herstel')
      .map(x => x.datum))]
      .sort()
      .reverse()
    return days.map(d => ({ datum: d }))
  }

  if (/SELECT.*FROM trainingen WHERE user_id =/i.test(norm)) {
    const userId = Number(values[0]) || 1
    let rows = mockStore.trainingen.filter(x => x.user_id === userId)
    if (/sport =/i.test(norm) && values[1] && typeof values[1] === 'string') {
      rows = rows.filter(x => x.sport === values[1])
    }
    rows.sort((a, b) => new Date(b.datum) - new Date(a.datum))
    const limitMatch = /LIMIT (\d+)/i.exec(norm)
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : (/limit/i.test(norm) && typeof values[values.length - 1] === 'number' ? values[values.length - 1] : rows.length)
    return rows.slice(0, Number(limit))
  }

  if (/INSERT INTO trainingen/i.test(norm)) {
    const userId = Number(values[0])
    const row = {
      id: ++nextId,
      user_id: userId,
      datum: values[1] || new Date().toISOString().split('T')[0],
      sport: values[2] || 'training',
      duur_min: values[3] || null,
      kcal: values[4] || null,
      gem_hartslag: values[5] || null,
      max_hartslag: values[6] || null,
      hrv_ochtend: values[7] || null,
      slaap_uur: values[8] || null,
      slaapscore: values[9] || null,
      herstelbalans: values[10] || null,
      zone2_min: values[11] || null,
      zone3_min: values[12] || null,
      zone4_min: values[13] || null,
      notities: values[14] || null,
      bron: values[15] || 'handmatig',
      rpe: values[16] || null,
      stemming: values[17] || null,
      intervals_id: values[18] || null,
      runalyze_id: values[19] || null,
      created_at: new Date().toISOString(),
    }
    mockStore.trainingen.push(row)
    return [row]
  }

  if (/DELETE FROM trainingen WHERE id =/i.test(norm)) {
    const id = Number(values[0])
    const userId = Number(values[1])
    mockStore.trainingen = mockStore.trainingen.filter(x => !(x.id === id && x.user_id === userId))
    return [{ success: true }]
  }

  // maaltijden
  if (/SELECT.*FROM maaltijden WHERE user_id =/i.test(norm)) {
    const userId = Number(values[0])
    let rows = mockStore.maaltijden.filter(x => x.user_id === userId)
    if (/datum =/i.test(norm) && values[1]) {
      const datum = values[1]
      rows = rows.filter(x => x.datum === datum)
    }
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    return rows
  }

  if (/INSERT INTO maaltijden/i.test(norm)) {
    const userId = Number(values[0])
    const row = {
      id: ++nextId,
      user_id: userId,
      datum: values[1] || new Date().toISOString().split('T')[0],
      maaltijd_type: values[2] || 'snack',
      beschrijving: values[3] || 'Maaltijd',
      kcal: values[4] != null ? Number(values[4]) : null,
      eiwit_g: values[5] != null ? Number(values[5]) : null,
      koolhydraten_g: values[6] != null ? Number(values[6]) : null,
      vetten_g: values[7] != null ? Number(values[7]) : null,
      foto_analyse: values[8] || null,
      ai_notities: values[9] || null,
      created_at: new Date().toISOString(),
    }
    mockStore.maaltijden.push(row)
    return [row]
  }

  if (/UPDATE maaltijden SET/i.test(norm)) {
    const id = Number(values[values.length - 2])
    const userId = Number(values[values.length - 1])
    const row = mockStore.maaltijden.find(x => x.id === id && x.user_id === userId)
    if (row) {
      if (values[0] != null) row.maaltijd_type = values[0]
      if (values[1] != null) row.beschrijving = values[1]
      if (values[2] != null) row.kcal = values[2]
      if (values[3] != null) row.eiwit_g = values[3]
      if (values[4] != null) row.koolhydraten_g = values[4]
      if (values[5] != null) row.vetten_g = values[5]
      return [row]
    }
    return []
  }

  if (/DELETE FROM maaltijden WHERE id =/i.test(norm)) {
    const id = Number(values[0])
    const userId = Number(values[1])
    mockStore.maaltijden = mockStore.maaltijden.filter(x => !(x.id === id && x.user_id === userId))
    return [{ success: true }]
  }

  // doelen
  if (/SELECT.*FROM doelen WHERE user_id =/i.test(norm)) {
    const userId = Number(values[0])
    return mockStore.doelen.filter(x => x.user_id === userId)
  }

  if (/INSERT INTO doelen/i.test(norm)) {
    const userId = Number(values[0])
    const row = {
      id: ++nextId,
      user_id: userId,
      titel: values[1],
      sport: values[2] || null,
      beschrijving: values[3] || null,
      doel_waarde: values[4] || null,
      huidige_waarde: values[5] || null,
      eenheid: values[6] || null,
      deadline: values[7] || null,
      actief: values[8] !== false,
      created_at: new Date().toISOString(),
    }
    mockStore.doelen.push(row)
    return [row]
  }

  if (/UPDATE doelen SET/i.test(norm)) {
    const id = Number(values[values.length - 2])
    const userId = Number(values[values.length - 1])
    const row = mockStore.doelen.find(x => x.id === id && x.user_id === userId)
    if (row) {
      if (values[0] != null) row.titel = values[0]
      if (values[1] != null) row.huidige_waarde = values[1]
      if (values[2] != null) row.doel_waarde = values[2]
      if (values[3] != null) row.actief = values[3]
      if (values[4] != null) row.deadline = values[4]
      if (values[5] != null) row.beschrijving = values[5]
      return [row]
    }
    return []
  }

  if (/DELETE FROM doelen WHERE id =/i.test(norm)) {
    const id = Number(values[0])
    const userId = Number(values[1])
    mockStore.doelen = mockStore.doelen.filter(x => !(x.id === id && x.user_id === userId))
    return [{ success: true }]
  }

  // gesprekken
  if (/SELECT.*FROM gesprekken WHERE user_id =/i.test(norm)) {
    const userId = Number(values[0])
    return mockStore.gesprekken.filter(x => x.user_id === userId)
  }

  if (/INSERT INTO gesprekken/i.test(norm)) {
    const userId = Number(values[0])
    const row = {
      id: ++nextId,
      user_id: userId,
      rol: values[1],
      bericht: values[2],
      is_ai: values[3],
      upload_type: values[4] || null,
      created_at: new Date().toISOString(),
    }
    mockStore.gesprekken.push(row)
    return [row]
  }

  if (/DELETE FROM gesprekken WHERE user_id =/i.test(norm)) {
    const userId = Number(values[0])
    mockStore.gesprekken = mockStore.gesprekken.filter(x => x.user_id !== userId)
    return [{ success: true }]
  }

  // Default empty result for unhandled queries
  return []
}

// Create mock tagged template function
function createMockSql() {
  const sqlFn = async (strings, ...values) => {
    // Check if called as batch helper: sql(batch, 'col1', 'col2')
    if (Array.isArray(strings) && typeof strings[0] === 'object' && !strings.raw) {
      const items = strings
      for (const item of items) {
        if (item.sport) {
          mockStore.trainingen.push({ id: ++nextId, ...item, created_at: new Date().toISOString() })
        }
      }
      return items
    }

    const text = typeof strings === 'string' ? strings : strings.reduce((acc, str, i) => acc + str + (i < values.length ? `$${i + 1}` : ''), '')
    return executeMockQuery(text, values)
  }

  // Helper for batch inserting
  return sqlFn
}

const mockSql = createMockSql()

export function getDb() {
  const dbUrl = process.env.DATABASE_URL?.trim()
  const isPlaceholder = !dbUrl || dbUrl.includes('user:password@host') || dbUrl.includes('placeholder')

  if (!isPlaceholder) {
    if (!realSql) {
      const isSupabaseOrPg = dbUrl.includes('supabase') || dbUrl.includes('pooler') || !dbUrl.includes('neon.tech')
      if (isSupabaseOrPg) {
        try {
          const pool = new Pool({
            connectionString: dbUrl,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 5000,
          })
          realSql = async (strings, ...values) => {
            try {
              if (Array.isArray(strings) && typeof strings[0] === 'object' && !strings.raw) {
                return mockSql(strings, ...values)
              }
              const queryText = typeof strings === 'string'
                ? strings
                : strings.reduce((acc, str, i) => acc + str + (i < values.length ? `$${i + 1}` : ''), '')
              const res = await pool.query(queryText, values)
              return res.rows
            } catch (err) {
              console.warn('[DB] Supabase query failed, falling back to mock:', err.message)
              return mockSql(strings, ...values)
            }
          }
        } catch (err) {
          console.warn('[DB] Supabase Pool init failed:', err.message)
          realSql = mockSql
        }
      } else {
        try {
          const client = neon(dbUrl)
          realSql = async (strings, ...values) => {
            try {
              return await client(strings, ...values)
            } catch (err) {
              console.warn('[DB] Neon query failed, falling back to mock:', err.message)
              return mockSql(strings, ...values)
            }
          }
        } catch (err) {
          console.warn('[DB] Neon init failed, using mock:', err.message)
          realSql = mockSql
        }
      }
    }
    return realSql
  }
  return mockSql
}

export { mockStore }
