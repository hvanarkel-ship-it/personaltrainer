-- APEX Coach — Garmin Connect koppeling migratie
-- Veilig om meerdere keren uit te voeren (IF NOT EXISTS / IF EXISTS)
-- Uitvoeren in Neon SQL Editor: https://console.neon.tech

-- ── user_profile: Garmin Connect sessie ───────────────────────────────────
-- We slaan de complete OAuth token-bundle (JSON) versleuteld-in-transit op.
-- garmin_display_name is nodig voor de wellness-endpoints (per-datum queries).
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS garmin_oauth_token TEXT;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS garmin_display_name TEXT;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS garmin_last_sync TIMESTAMPTZ;

-- ── trainingen: Garmin activiteit-ID voor dedup ───────────────────────────
ALTER TABLE trainingen ADD COLUMN IF NOT EXISTS garmin_id TEXT;

CREATE INDEX IF NOT EXISTS idx_trainingen_garmin_id
  ON trainingen(garmin_id) WHERE garmin_id IS NOT NULL;

-- ── dagelijkse_stats: bestaat mogelijk nog niet (zie migration_wearables) ──
-- Garmin vult deze tabel met HRV, slaap, Body Battery, rusthartslag en stappen.
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

CREATE INDEX IF NOT EXISTS idx_dagelijkse_stats_user_datum
  ON dagelijkse_stats(user_id, datum DESC);
