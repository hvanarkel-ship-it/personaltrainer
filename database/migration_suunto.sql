-- Suunto OAuth2 tokens per gebruiker
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS suunto_access_token  TEXT;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS suunto_refresh_token TEXT;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS suunto_token_expiry  TIMESTAMPTZ;

-- Unieke index voor Suunto workout IDs (voorkomt duplicates bij sync)
CREATE UNIQUE INDEX IF NOT EXISTS idx_trainingen_user_suunto_id
  ON trainingen(user_id, suunto_id) WHERE suunto_id IS NOT NULL;
