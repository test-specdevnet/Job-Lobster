PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  base_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_success_at TEXT,
  cooldown_until TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  searches_performed INTEGER NOT NULL DEFAULT 0,
  jobs_discovered INTEGER NOT NULL DEFAULT 0,
  pages_fetched INTEGER NOT NULL DEFAULT 0,
  jobs_normalized INTEGER NOT NULL DEFAULT 0,
  jobs_accepted INTEGER NOT NULL DEFAULT 0,
  jobs_rejected INTEGER NOT NULL DEFAULT 0,
  duplicates_removed INTEGER NOT NULL DEFAULT 0,
  parsing_failures INTEGER NOT NULL DEFAULT 0,
  source_failures INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discoveries (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES ingestion_runs(id) ON DELETE SET NULL,
  source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
  external_id TEXT,
  source_url TEXT NOT NULL,
  canonical_url TEXT,
  payload_json TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'normalized', 'accepted', 'rejected', 'failed')),
  processing_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  original_external_id TEXT,
  original_title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  company TEXT NOT NULL,
  company_domain TEXT,
  company_website TEXT,
  description TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  latitude REAL,
  longitude REAL,
  work_type TEXT NOT NULL CHECK (work_type IN ('remote', 'hybrid', 'onsite', 'unknown')),
  eligibility TEXT,
  employment_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'temporary', 'internship', 'unknown')),
  salary_min_original REAL,
  salary_max_original REAL,
  salary_currency TEXT,
  salary_min_cad REAL,
  salary_max_cad REAL,
  conversion_rate REAL,
  conversion_timestamp TEXT,
  salary_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (salary_status IN ('verified', 'estimated', 'unknown')),
  salary_source TEXT,
  posted_at TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT NOT NULL,
  canonical_url TEXT,
  application_url TEXT NOT NULL,
  ats_provider TEXT,
  industry TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'expired')),
  qualification_status TEXT NOT NULL CHECK (qualification_status IN ('accepted', 'rejected')),
  rejection_reason TEXT,
  dedupe_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS currency_rates (
  currency TEXT PRIMARY KEY,
  cad_per_unit REAL NOT NULL,
  provider TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_dedupe_key_unique
  ON jobs(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_active_posted_idx
  ON jobs(qualification_status, status, posted_at DESC);
CREATE INDEX IF NOT EXISTS jobs_normalized_title_idx ON jobs(normalized_title);
CREATE INDEX IF NOT EXISTS jobs_location_idx ON jobs(country, region, city);
CREATE INDEX IF NOT EXISTS jobs_work_type_idx ON jobs(work_type);
CREATE INDEX IF NOT EXISTS jobs_salary_cad_idx ON jobs(salary_min_cad);
CREATE INDEX IF NOT EXISTS discoveries_run_idx ON discoveries(run_id, processing_status);
CREATE INDEX IF NOT EXISTS ingestion_runs_started_idx ON ingestion_runs(started_at DESC);
