-- APEX Coach — Settings & Integraties migratie
-- Uitvoeren in Neon SQL Editor

ALTER TABLE user_profile
  ADD COLUMN IF NOT EXISTS geslacht TEXT,
  ADD COLUMN IF NOT EXISTS coach_context TEXT,
  ADD COLUMN IF NOT EXISTS coach_naam TEXT DEFAULT 'APEX Coach',
  ADD COLUMN IF NOT EXISTS coach_stijl TEXT DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS strava_access_token TEXT,
  ADD COLUMN IF NOT EXISTS strava_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS strava_token_expires_at BIGINT,
  ADD COLUMN IF NOT EXISTS strava_athlete_id BIGINT;
