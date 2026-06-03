// Centrale sport-categorisatie voor alle sync-bronnen

// ── Suunto: numeric activityId → sport ─────────────────────────────────────
const SUUNTO_SPORT_MAP = {
  0:   'overig',    1:   'wandelen',  2:   'fietsen',   3:   'overig',
  5:   'fitness',   6:   'overig',    10:  'overig',     11:  'fietsen',
  12:  'wandelen',  13:  'overig',    14:  'overig',     15:  'overig',
  16:  'overig',    17:  'overig',    18:  'fitness',    20:  'overig',
  21:  'fitness',   22:  'zwemmen',   23:  'hardlopen',  24:  'fitness',
  25:  'wandelen',  29:  'overig',    30:  'overig',     31:  'overig',
  33:  'fitness',   34:  'voetbal',   35:  'tennis',     37:  'overig',
  53:  'hardlopen', 56:  'fitness',   58:  'yoga',       75:  'fitness',
  82:  'hardlopen', 91:  'hardlopen', 108: 'fietsen',    109: 'zwemmen',
  112: 'fitness',   130: 'yoga',
}

const SUUNTO_ACTIVITY_NAMES = {
  0: 'Activiteit',       1: 'Wandelen',          2: 'Fietsen',
  3: 'Langlaufen',       11: 'Mountainbiken',     12: 'Hiken',
  18: 'Indoor training', 21: 'Outdoor gym',       22: 'Zwemmen',
  23: 'Trailrunning',    24: 'Gym',               25: 'Nordic walking',
  30: 'Klimmen',         33: 'Fitness class',     34: 'Voetbal',
  35: 'Tennis',          53: 'Hardlopen',         56: 'Krachttraining',
  58: 'Yoga',            75: 'Functional training', 82: 'Trailrun',
  91: 'Trailrun',        108: 'Indoor fietsen',   109: 'Open water zwemmen',
  130: 'Pilates',
}

export function suuntoSport(activityId) {
  return SUUNTO_SPORT_MAP[activityId] || 'overig'
}

export function suuntoActivityTitle(activityId) {
  return SUUNTO_ACTIVITY_NAMES[activityId] || `Suunto activiteit ${activityId}`
}

// ── Intervals.icu: string type → sport ─────────────────────────────────────
const INTERVALS_SPORT_MAP = {
  Run: 'hardlopen',       VirtualRun: 'hardlopen',      TrailRun: 'hardlopen',
  Ride: 'fietsen',        VirtualRide: 'fietsen',        GravelRide: 'fietsen',
  EBikeRide: 'fietsen',   MountainBikeRide: 'fietsen',   EMountainBikeRide: 'fietsen',
  WeightTraining: 'fitness', Workout: 'fitness',          Crossfit: 'fitness',
  Elliptical: 'fitness',  StairStepper: 'fitness',
  Tennis: 'tennis',       Padel: 'padel',                Squash: 'padel',
  TableTennis: 'tennis',
  Walk: 'wandelen',       Hike: 'wandelen',
  Swim: 'zwemmen',        Rowing: 'zwemmen',             VirtualRow: 'zwemmen',
  Kayaking: 'zwemmen',
  Yoga: 'yoga',           Pilates: 'yoga',
  Soccer: 'voetbal',      Football: 'voetbal',
  AlpineSki: 'overig',    NordicSki: 'overig',           Snowboard: 'overig',
  RockClimbing: 'overig', IceSkate: 'overig',            InlineSkate: 'overig',
}

export function intervalsSport(activityType, name) {
  const n = (name || '').toLowerCase()
  if (/hyrox|hyro x/.test(n)) return 'hyrox'
  return INTERVALS_SPORT_MAP[activityType] || activityType?.toLowerCase() || 'overig'
}

// ── Runalyze: numeric typeId → sport ───────────────────────────────────────
const RUNALYZE_SPORT_MAP = {
  1: 'hardlopen', 2: 'fietsen',   3: 'zwemmen',   4: 'wandelen',
  5: 'fitness',   6: 'yoga',      14: 'fietsen',   17: 'hardlopen',
  24: 'fitness',  34: 'wandelen', 52: 'hardlopen', 61: 'fietsen',
}

export function runalyzeSport(typeId, name) {
  const n = (name || '').toLowerCase()
  if (/hyrox|hyro x/.test(n)) return 'hyrox'
  if (/padel/.test(n)) return 'padel'
  if (/tennis/.test(n)) return 'tennis'
  if (/voetbal|soccer|football/.test(n)) return 'voetbal'
  return RUNALYZE_SPORT_MAP[typeId] || 'overig'
}
