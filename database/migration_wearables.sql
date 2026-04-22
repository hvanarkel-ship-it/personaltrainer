-- APEX Coach — Wearables (Open Wearables) migratie
-- Uitvoeren in Neon SQL Editor: https://console.neon.tech

-- Kolommen voor Open Wearables koppeling in user_profile
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS wearables_token TEXT;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS wearables_refresh_token TEXT;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS wearables_token_expires_at BIGINT;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS wearables_user_id TEXT;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS wearables_device TEXT;

-- Dagelijkse stats tabel voor wearables data (HRV, slaap, herstel, stappen)
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

CREATE INDEX IF NOT EXISTS idx_dagelijkse_stats_user_datum ON dagelijkse_stats(user_id, datum DESC);
