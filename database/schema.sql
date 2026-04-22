-- APEX Coach v2 — Database Schema
-- Neon PostgreSQL

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profile (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  geboortejaar INTEGER,
  geslacht TEXT,
  lengte_cm INTEGER,
  gewicht_kg NUMERIC(5,1),
  doel_kcal INTEGER DEFAULT 2400,
  doel_eiwit_g INTEGER DEFAULT 160,
  doel_koolhydraten_g INTEGER DEFAULT 250,
  doel_vetten_g INTEGER DEFAULT 80,
  sporten TEXT[] DEFAULT '{fitness,padel,fietsen}',
  coach_context TEXT,
  coach_naam TEXT DEFAULT 'APEX Coach',
  coach_stijl TEXT DEFAULT 'direct',
  strava_access_token TEXT,
  strava_refresh_token TEXT,
  strava_token_expires_at BIGINT,
  strava_athlete_id BIGINT,
  wearables_user_id TEXT,
  wearables_device TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inbody_metingen (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  gewicht_kg NUMERIC(5,1),
  vetmassa_kg NUMERIC(5,1),
  vetpercentage NUMERIC(4,1),
  spiermassa_kg NUMERIC(5,1),
  visceraal_vet INTEGER,
  bmr_kcal INTEGER,
  vochtbalans_pct NUMERIC(4,1),
  inbody_score INTEGER,
  bron TEXT DEFAULT 'handmatig',
  notities TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trainingen (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  sport TEXT NOT NULL,
  duur_min INTEGER,
  kcal INTEGER,
  gem_hartslag INTEGER,
  max_hartslag INTEGER,
  hrv_ochtend INTEGER,
  slaap_uur NUMERIC(4,1),
  slaapscore INTEGER,
  herstelbalans NUMERIC(4,2),
  zone2_min INTEGER,
  zone3_min INTEGER,
  zone4_min INTEGER,
  notities TEXT,
  bron TEXT DEFAULT 'handmatig',
  strava_id BIGINT,
  rpe SMALLINT,
  stemming SMALLINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maaltijden (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  maaltijd_type TEXT,
  beschrijving TEXT,
  kcal INTEGER,
  eiwit_g NUMERIC(6,1),
  koolhydraten_g NUMERIC(6,1),
  vetten_g NUMERIC(6,1),
  foto_analyse TEXT,
  ai_notities TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doelen (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  titel TEXT NOT NULL,
  sport TEXT,
  beschrijving TEXT,
  doel_waarde NUMERIC(8,2),
  huidige_waarde NUMERIC(8,2),
  eenheid TEXT,
  deadline DATE,
  actief BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dagelijkse_stats (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  datum DATE NOT NULL,
  hrv_ms INTEGER,
  slaap_uur NUMERIC(4,1),
  slaapscore INTEGER,
  herstel_score INTEGER,
  rusthartsslag INTEGER,
  stappen INTEGER,
  bron TEXT DEFAULT 'wearables',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, datum)
);

CREATE TABLE IF NOT EXISTS gesprekken (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  rol TEXT NOT NULL,
  bericht TEXT NOT NULL,
  is_ai BOOLEAN NOT NULL,
  upload_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexen
CREATE INDEX IF NOT EXISTS idx_inbody_user_datum ON inbody_metingen(user_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_dagelijkse_stats_user_datum ON dagelijkse_stats(user_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_trainingen_user_datum ON trainingen(user_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_maaltijden_user_datum ON maaltijden(user_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_gesprekken_user ON gesprekken(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doelen_user ON doelen(user_id, actief);
CREATE INDEX IF NOT EXISTS idx_trainingen_strava_id ON trainingen(strava_id) WHERE strava_id IS NOT NULL;

-- Auto-update user_profile timestamp
CREATE OR REPLACE FUNCTION update_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profile_updated_at ON user_profile;
CREATE TRIGGER profile_updated_at BEFORE UPDATE ON user_profile
  FOR EACH ROW EXECUTE FUNCTION update_profile_timestamp();
