INSERT OR REPLACE INTO sources (id, name, provider_type, base_url, enabled)
VALUES
  ('source_greenhouse', 'Greenhouse', 'ats', 'https://www.greenhouse.io', 1),
  ('source_lever', 'Lever', 'ats', 'https://www.lever.co', 1),
  ('source_ashby', 'Ashby', 'ats', 'https://www.ashbyhq.com', 1),
  ('source_company', 'Employer Careers', 'company_site', NULL, 1);

INSERT OR REPLACE INTO ingestion_runs (
  id, status, started_at, finished_at, searches_performed, jobs_discovered,
  pages_fetched, jobs_normalized, jobs_accepted, jobs_rejected,
  duplicates_removed, parsing_failures, source_failures
)
VALUES (
  'seed_run', 'completed', datetime('now', '-20 minutes'), datetime('now', '-19 minutes'),
  8, 11, 11, 10, 8, 2, 1, 0, 0
);

INSERT OR REPLACE INTO jobs (
  id, external_id, original_title, normalized_title, company, company_domain,
  company_website, country, region, city, latitude, longitude, work_type,
  eligibility, employment_type, salary_min_original, salary_max_original,
  salary_currency, salary_min_cad, salary_max_cad, conversion_rate,
  conversion_timestamp, salary_status, salary_source, posted_at, discovered_at,
  source, source_url, canonical_url, application_url, ats_provider, industry,
  status, qualification_status, rejection_reason, dedupe_key
)
VALUES
  (
    'job_northstar_growth', 'gh_1024', 'Senior Growth Marketing Manager',
    'Growth Marketing Manager', 'Northstar Systems', 'northstar.example',
    'https://northstar.example', 'Canada', 'Ontario', 'Toronto', 43.6532, -79.3832,
    'hybrid', 'Canada', 'full_time', 98000, 124000, 'CAD', 98000, 124000, 1,
    datetime('now'), 'verified', 'employer', datetime('now', '-5 hours'),
    datetime('now', '-4 hours'), 'Greenhouse', 'https://boards.greenhouse.io/example/1024',
    'https://boards.greenhouse.io/example/1024', 'https://boards.greenhouse.io/example/1024',
    'greenhouse', 'Technology', 'active', 'accepted', NULL,
    'northstar|growth-marketing-manager|toronto'
  ),
  (
    'job_lumen_ai', 'ashby_2028', 'AI Content Strategist', 'AI Content Strategist',
    'Lumen AI', 'lumen.example', 'https://lumen.example', 'Germany', 'Berlin', 'Berlin',
    52.5200, 13.4050, 'remote', 'Worldwide', 'full_time', 72000, 90000, 'EUR',
    108000, 135000, 1.5, datetime('now'), 'verified', 'employer',
    datetime('now', '-19 hours'), datetime('now', '-18 hours'), 'Ashby',
    'https://jobs.ashbyhq.com/example/2028', 'https://jobs.ashbyhq.com/example/2028',
    'https://jobs.ashbyhq.com/example/2028', 'ashby', 'Artificial Intelligence',
    'active', 'accepted', NULL, 'lumen|ai-content-strategist|worldwide'
  ),
  (
    'job_harbour_content', 'lever_311', 'Content Marketing Manager',
    'Content Marketing Manager', 'Harbour House', 'harbourhouse.example',
    'https://harbourhouse.example', 'Canada', 'Ontario', 'St. Catharines',
    43.1594, -79.2469, 'onsite', NULL, 'full_time', 78000, 93000, 'CAD',
    78000, 93000, 1, datetime('now'), 'verified', 'employer',
    datetime('now', '-30 hours'), datetime('now', '-28 hours'), 'Lever',
    'https://jobs.lever.co/example/311', 'https://jobs.lever.co/example/311',
    'https://jobs.lever.co/example/311', 'lever', 'Tourism', 'active', 'accepted',
    NULL, 'harbour-house|content-marketing-manager|st-catharines'
  ),
  (
    'job_arc_digital', 'gh_414', 'Digital Marketing Lead', 'Digital Marketing Lead',
    'Arc Health', 'archealth.example', 'https://archealth.example', 'United States',
    'Florida', 'Miami', 25.7617, -80.1918, 'hybrid', 'United States', 'full_time',
    82000, 105000, 'USD', 112340, 143850, 1.37, datetime('now'), 'verified',
    'employer', datetime('now', '-61 hours'), datetime('now', '-60 hours'),
    'Greenhouse', 'https://boards.greenhouse.io/example/414',
    'https://boards.greenhouse.io/example/414', 'https://boards.greenhouse.io/example/414',
    'greenhouse', 'Healthcare', 'active', 'accepted', NULL,
    'arc-health|digital-marketing-lead|miami'
  ),
  (
    'job_kinetic_seo', 'workable_718', 'SEO & GEO Manager', 'SEO & GEO Manager',
    'Kinetic Commerce', 'kinetic.example', 'https://kinetic.example', 'United States',
    'New York', 'Buffalo', 42.8864, -78.8784, 'onsite', NULL, 'full_time', 74000,
    92000, 'USD', 101380, 126040, 1.37, datetime('now'), 'verified', 'employer',
    datetime('now', '-82 hours'), datetime('now', '-81 hours'), 'Workable',
    'https://apply.workable.com/example/718', 'https://apply.workable.com/example/718',
    'https://apply.workable.com/example/718', 'workable', 'Retail', 'active',
    'accepted', NULL, 'kinetic|seo-geo-manager|buffalo'
  ),
  (
    'job_orbit_remote', 'company_919', 'Head of Content', 'Head of Content',
    'Orbit Ledger', 'orbitledger.example', 'https://orbitledger.example', 'Singapore',
    NULL, 'Singapore', 1.3521, 103.8198, 'remote', 'Worldwide', 'full_time', 110000,
    145000, 'SGD', 113300, 149350, 1.03, datetime('now'), 'verified', 'employer',
    datetime('now', '-116 hours'), datetime('now', '-115 hours'), 'Employer Careers',
    'https://orbitledger.example/careers/919', 'https://orbitledger.example/careers/919',
    'https://orbitledger.example/careers/919', 'company', 'Finance', 'active',
    'accepted', NULL, 'orbit-ledger|head-of-content|worldwide'
  ),
  (
    'job_fieldnote_brand', 'smart_222', 'Brand Marketing Manager',
    'Brand Marketing Manager', 'Fieldnote', 'fieldnote.example', 'https://fieldnote.example',
    'United States', 'New York', 'New York', 40.7128, -74.0060, 'hybrid',
    'New York State', 'full_time', 90000, 118000, 'USD', 123300, 161660, 1.37,
    datetime('now'), 'verified', 'employer', datetime('now', '-145 hours'),
    datetime('now', '-144 hours'), 'SmartRecruiters',
    'https://jobs.smartrecruiters.com/example/222',
    'https://jobs.smartrecruiters.com/example/222',
    'https://jobs.smartrecruiters.com/example/222', 'smartrecruiters',
    'Professional Services', 'active', 'accepted', NULL,
    'fieldnote|brand-marketing-manager|new-york'
  ),
  (
    'job_old_archive', 'company_old', 'Marketing Manager', 'Marketing Manager',
    'Archive Co', 'archive.example', 'https://archive.example', 'Canada', 'Ontario',
    'Toronto', 43.6532, -79.3832, 'hybrid', 'Canada', 'full_time', 90000, 100000,
    'CAD', 90000, 100000, 1, datetime('now'), 'verified', 'employer',
    datetime('now', '-10 days'), datetime('now', '-9 days'), 'Employer Careers',
    'https://archive.example/jobs/old', 'https://archive.example/jobs/old',
    'https://archive.example/jobs/old', 'company', 'Media', 'archived', 'rejected',
    'posting_too_old', 'archive|marketing-manager|toronto'
  );
