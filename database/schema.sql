-- APEX Coach Database Schema
-- Neon PostgreSQL

-- Gebruikers
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  naam VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gebruikersinstellingen
CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  geboortedatum DATE,
  geslacht VARCHAR(10),
  lengte_cm INTEGER,
  doel VARCHAR(50),                    -- 'afvallen', 'spiermassa', 'conditie', 'onderhoud'
  activiteits_niveau VARCHAR(50),      -- 'sedentair', 'licht', 'matig', 'actief', 'zeer_actief'
  dieet_wensen TEXT[],                 -- bijv. ['vegetarisch', 'glutenvrij']
  allergenen TEXT[],
  doelgewicht_kg DECIMAL(5,2),
  dagelijks_calorie_doel INTEGER,
  dagelijks_eiwitdoel_g INTEGER,
  coach_naam VARCHAR(100) DEFAULT 'APEX',
  coach_stijl VARCHAR(50) DEFAULT 'motiverend',  -- 'motiverend', 'streng', 'vriendelijk', 'wetenschappelijk'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Metingen (gewicht, InBody data, etc.)
CREATE TABLE IF NOT EXISTS measurements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  gewicht_kg DECIMAL(5,2),
  vetpercentage DECIMAL(4,1),
  spiermassa_kg DECIMAL(5,2),
  vetmassa_kg DECIMAL(5,2),
  bmr INTEGER,                         -- Basaal Metabolisme (kcal)
  bmi DECIMAL(4,1),
  viscerale_vet_score INTEGER,
  lichaamsvocht_procent DECIMAL(4,1),
  botmassa_kg DECIMAL(4,2),
  metabolische_leeftijd INTEGER,
  -- Extra meetpunten (omtrekken in cm)
  buikomvang_cm DECIMAL(5,1),
  heupomvang_cm DECIMAL(5,1),
  borstomvang_cm DECIMAL(5,1),
  bovenbeen_links_cm DECIMAL(5,1),
  bovenbeen_rechts_cm DECIMAL(5,1),
  bovenarm_links_cm DECIMAL(5,1),
  bovenarm_rechts_cm DECIMAL(5,1),
  notities TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Maaltijden
CREATE TABLE IF NOT EXISTS meals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  maaltijd_type VARCHAR(20) NOT NULL,  -- 'ontbijt', 'lunch', 'diner', 'snack', 'pre_workout', 'post_workout'
  omschrijving TEXT,
  foto_url TEXT,
  -- Voedingswaarden (ingeschat via AI analyse)
  kcal INTEGER,
  eiwitten_g DECIMAL(6,1),
  koolhydraten_g DECIMAL(6,1),
  vetten_g DECIMAL(6,1),
  vezels_g DECIMAL(6,1),
  suikers_g DECIMAL(6,1),
  ai_analyse TEXT,                     -- Volledige AI analyse tekst
  handmatig_ingevoerd BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trainingen
CREATE TABLE IF NOT EXISTS workouts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  naam VARCHAR(255),
  type VARCHAR(50),                    -- 'kracht', 'cardio', 'hiit', 'yoga', 'sport', 'anders'
  duur_minuten INTEGER,
  intensiteit VARCHAR(20),             -- 'laag', 'matig', 'hoog', 'maximaal'
  verbrande_kcal INTEGER,
  notities TEXT,
  oefeningen JSONB,                    -- Array van oefeningen met sets/reps/gewicht
  -- Bijv: [{"naam": "Squat", "sets": [{"gewicht": 80, "reps": 10}, ...]}]
  ai_samenvatting TEXT,               -- AI gegenereerde samenvatting/feedback
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gesprekshistorie met AI coach
CREATE TABLE IF NOT EXISTS conversation_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  rol VARCHAR(10) NOT NULL,            -- 'user' of 'assistant'
  bericht TEXT NOT NULL,
  context_data JSONB,                  -- Contextdata die met dit bericht meegestuurd werd
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dagelijkse doelen/voortgang
CREATE TABLE IF NOT EXISTS daily_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  water_ml INTEGER DEFAULT 0,
  stappen INTEGER,
  slaap_uren DECIMAL(3,1),
  energie_niveau INTEGER CHECK (energie_niveau BETWEEN 1 AND 10),
  stemming INTEGER CHECK (stemming BETWEEN 1 AND 10),
  notities TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, datum)
);

-- Indexen voor performance
CREATE INDEX IF NOT EXISTS idx_measurements_user_datum ON measurements(user_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_meals_user_datum ON meals(user_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_workouts_user_datum ON workouts(user_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_user ON conversation_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_progress_user_datum ON daily_progress(user_id, datum DESC);

-- Trigger: update updated_at automatisch
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_settings_updated_at BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER meals_updated_at BEFORE UPDATE ON meals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER workouts_updated_at BEFORE UPDATE ON workouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER daily_progress_updated_at BEFORE UPDATE ON daily_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
