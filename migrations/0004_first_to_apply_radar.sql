ALTER TABLE jobs ADD COLUMN first_seen TEXT;
ALTER TABLE jobs ADD COLUMN first_seen_legacy INTEGER NOT NULL DEFAULT 0;
-- Index both historical lookup paths before backfilling the production dataset.
CREATE INDEX IF NOT EXISTS discoveries_source_seen_idx ON discoveries(source_url, discovered_at);
CREATE INDEX IF NOT EXISTS discoveries_canonical_seen_idx ON discoveries(canonical_url, discovered_at);
-- Recover earliest retained observation. Old discovered_at values were mutable.
UPDATE jobs SET first_seen = COALESCE(
  (SELECT MIN(d.discovered_at) FROM discoveries d WHERE d.source_url = jobs.source_url OR d.canonical_url = jobs.canonical_url),
  MIN(discovered_at, created_at)
), first_seen_legacy = 1;
CREATE TRIGGER jobs_first_seen_insert AFTER INSERT ON jobs WHEN NEW.first_seen IS NULL
BEGIN UPDATE jobs SET first_seen = NEW.discovered_at WHERE id = NEW.id; END;
CREATE TRIGGER jobs_first_seen_immutable BEFORE UPDATE OF first_seen ON jobs
WHEN OLD.first_seen IS NOT NULL AND NEW.first_seen IS NOT OLD.first_seen
BEGIN SELECT RAISE(ABORT, 'first_seen is immutable'); END;
CREATE TABLE job_sightings (
  job_id TEXT NOT NULL REFERENCES jobs(id), source_id TEXT NOT NULL,
  first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
  PRIMARY KEY(job_id, source_id)
);
CREATE TABLE application_pipeline (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id),
  stage TEXT NOT NULL DEFAULT 'New' CHECK(stage IN ('New','Apply Now','Applied','Human Contact Found','Outreach Sent','Follow-Up Due','Interview','Closed')),
  next_action TEXT NOT NULL DEFAULT '', follow_up_at TEXT,
  contact_url TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX jobs_first_seen_idx ON jobs(first_seen);
CREATE INDEX pipeline_follow_up_idx ON application_pipeline(follow_up_at, stage);
