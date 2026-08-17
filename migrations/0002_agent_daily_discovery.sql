ALTER TABLE sources ADD COLUMN provider_token TEXT;
ALTER TABLE sources ADD COLUMN company_website TEXT;
ALTER TABLE sources ADD COLUMN scope TEXT NOT NULL DEFAULT 'core'
  CHECK (scope IN ('core', 'daily'));

ALTER TABLE ingestion_runs ADD COLUMN run_type TEXT NOT NULL DEFAULT 'core'
  CHECK (run_type IN ('core', 'daily', 'full'));
ALTER TABLE ingestion_runs ADD COLUMN sources_planned INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS sources_scope_enabled_idx
  ON sources(scope, enabled, updated_at DESC);
CREATE INDEX IF NOT EXISTS ingestion_runs_type_started_idx
  ON ingestion_runs(run_type, started_at DESC);
