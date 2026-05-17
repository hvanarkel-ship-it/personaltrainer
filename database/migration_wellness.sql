-- Dagelijkse wellness data (slaap, HRV, recovery, stappen)
-- Bron: Suunto 247 API, mogelijk later ook andere bronnen

CREATE TABLE IF NOT EXISTS dagelijkse_wellness (
  user_id            INTEGER REFERENCES users(id) ON DELETE CASCADE,
  datum              DATE NOT NULL,
  -- Slaap
  slaap_uur          NUMERIC(4,1),
  slaap_score        INTEGER,
  diepe_slaap_min    INTEGER,
  rem_slaap_min      INTEGER,
  lichte_slaap_min   INTEGER,
  -- Recovery / HRV
  hrv_ochtend        INTEGER,
  herstel_balans     NUMERIC(4,2),
  stress_pct         INTEGER,
  -- Hart / activiteit
  rust_hartslag      INTEGER,
  stappen            INTEGER,
  kcal_actief        INTEGER,
  -- Meta
  bron               TEXT DEFAULT 'suunto',
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, datum)
);

CREATE INDEX IF NOT EXISTS idx_wellness_user_datum
  ON dagelijkse_wellness(user_id, datum DESC);
