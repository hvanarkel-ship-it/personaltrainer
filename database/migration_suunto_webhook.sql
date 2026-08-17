-- Suunto webhooks (nieuwe 24/7 DATA API is push-gebaseerd)
-- Veilig om meerdere keren uit te voeren.

-- Suunto user-id per gebruiker (uit het OAuth token-antwoord, veld 'user').
-- Nodig om binnenkomende webhook-notificaties (payload.username) aan de juiste
-- gebruiker te koppelen.
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS suunto_username TEXT;

-- Snelle lookup bij elke webhook-call.
CREATE INDEX IF NOT EXISTS idx_user_profile_suunto_username
  ON user_profile(suunto_username) WHERE suunto_username IS NOT NULL;
