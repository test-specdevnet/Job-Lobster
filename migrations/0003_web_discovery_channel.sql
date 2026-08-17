ALTER TABLE ingestion_runs ADD COLUMN discovery_channel TEXT NOT NULL DEFAULT 'ats'
  CHECK (discovery_channel IN ('ats', 'web'));

CREATE INDEX IF NOT EXISTS ingestion_runs_channel_started_idx
  ON ingestion_runs(discovery_channel, started_at DESC);
