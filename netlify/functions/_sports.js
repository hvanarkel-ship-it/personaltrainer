// Centrale sport-categorisatie voor alle sync-bronnen

// ── Suunto: numeric activityId → sport ─────────────────────────────────────
// Alleen expliciete, betrouwbare mappings; al het overige valt via suuntoSport()
// terug op fitness (gebruikersvoorkeur). Zo verschijnt "overig" niet meer.
const SUUNTO_SPORT_MAP = {
  1:   'wandelen',  2:   'fietsen',   11:  'fietsen',   12:  'wandelen',
  18:  'fitness',   21:  'fitness',   22:  'zwemmen',   23:  'fitness',
  24:  'fitness',   25:  'wandelen',  33:  'fitness',   34:  'voetbal',
  35:  'tennis',    53:  'hardlopen', 56:  'fitness',   58:  'yoga',
  75:  'fitness',   82:  'hardlopen', 91:  'hardlopen', 108: 'fietsen',
  109: 'zwemmen',   112: 'fitness',   130: 'yoga',      148: 'padel',
}

const SUUNTO_ACTIVITY_NAMES = {
  0: 'Activiteit',       1: 'Wandelen',          2: 'Fietsen',
  3: 'Langlaufen',       11: 'Mountainbiken',     12: 'Hiken',
  18: 'Indoor training', 21: 'Outdoor gym',       22: 'Zwemmen',
  23: 'Training',        24: 'Gym',               25: 'Nordic walking',
  30: 'Klimmen',         33: 'Fitness class',     34: 'Voetbal',
  35: 'Tennis',          53: 'Hardlopen',         56: 'Krachttraining',
  58: 'Yoga',            75: 'Functional training', 82: 'Trailrun',
  91: 'Trailrun',        108: 'Indoor fietsen',   109: 'Open water zwemmen',
  130: 'Pilates',          148: 'Padel',
}

export function suuntoSport(activityId) {
  // Onbekende activityId's → fitness (gebruikersvoorkeur: "overig is ook fitness").
  return SUUNTO_SPORT_MAP[activityId] || 'fitness'
}

export function suuntoActivityTitle(activityId) {
  return SUUNTO_ACTIVITY_NAMES[activityId] || 'Training'
}

// Leid onze sport-categorie af uit een vrije activiteitsnaam (Suunto's eigen
// activityName is betrouwbaarder dan onze activityId-tabel). Volgorde telt:
// specifieke termen eerst, zodat bv. "trail running" → hardlopen en niet
// per ongeluk iets anders. Retourneert null als niets matcht.
export function sportUitNaam(naam) {
  const n = String(naam || '').toLowerCase()
  if (!n) return null
  if (/hyrox|hyro x/.test(n))                              return 'hyrox'
  if (/padel/.test(n))                                     return 'padel'
  if (/tennis|squash|badminton/.test(n))                   return 'tennis'
  if (/voetbal|soccer|football/.test(n))                   return 'voetbal'
  if (/gym|fitness|strength|kracht|weight|functional|crossfit|indoor training|circuit|hiit|bootcamp/.test(n)) return 'fitness'
  if (/swim|zwem|pool|open water/.test(n))                 return 'zwemmen'
  if (/cycl|bike|biking|fiets|ride|mtb|mountainbik|spinning|wielren/.test(n)) return 'fietsen'
  if (/yoga|pilates|stretch|mobility/.test(n))             return 'yoga'
  if (/walk|wandel|hike|hik|nordic|trekking/.test(n))      return 'wandelen'
  if (/run|hardloop|hardlopen|loop|jog|trail/.test(n))     return 'hardlopen'
  return null
}

