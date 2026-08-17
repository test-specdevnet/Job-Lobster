# Job Lobster

Job Lobster is the production discovery, qualification, and API service behind Job Globe. It runs as a Cloudflare Worker at <https://job-lobster.awcarr97.workers.dev>, keeps durable agent state and schedules in the Agents SDK, and exposes only current jobs that pass the centralized qualification policy.

It is an autonomous job-discovery agent, not an application-submission bot. It finds and evaluates listings; the user reviews each result and applies through the employer's canonical URL.

## Production architecture

- Cloudflare Worker serving the API and the animated beach status UI
- Cloudflare Agents SDK Durable Object (`JobDiscoveryAgent`) for durable run state and autonomous schedules
- Agent-owned core refresh at minute 7 and 37 of every hour
- Agent-owned deep scrape every 24 hours at 09:00 UTC
- Cloudflare D1 for jobs, discoveries, sources, ingestion runs, and exchange-rate cache
- Public Ashby, Greenhouse, and Lever adapters with bounded concurrency, timeouts, retries, and source cooldowns
- Workers AI as a narrow fallback for ambiguous marketing-title classification
- Employer-provided salary parsing plus CAD normalization using cached ECB/Frankfurter rates
- Dedupe, seven-day expiry, rejection reasons, source health, and observability logs
- No automated application submission and no scraping of LinkedIn, Indeed, or Glassdoor

The catalog contains 72 verified employer ATS boards: 32 core boards refreshed frequently and 40 larger boards scanned by the daily deep cycle. The groups keep each run below the public-request budget while materially broadening coverage. Adding an employer is a source-catalog change; qualification rules remain independent of provider code.

## Qualification policy

The pipeline keeps both original and normalized titles. It accepts global remote work, restricts hybrid and on-site geography, requires a verified minimum salary converted to CAD, and excludes postings older than seven days. Rejected discoveries remain auditable with reasons such as `title_not_match`, `salary_below_threshold`, `hybrid_location_not_allowed`, `onsite_location_not_allowed`, `salary_unknown`, and `posting_too_old`.

Change thresholds and allowed locations in `src/config/qualification.ts`. Do not duplicate policy in adapters or API routes.

## Public API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/health` | Service and storage health |
| `GET /api/v1/agent` | Current durable agent state and latest run |
| `GET /api/v1/jobs` | Active, qualified jobs |
| `GET /api/v1/jobs/:id` | One active, qualified job |
| `GET /api/v1/stats` | Public aggregate counts |

`GET /api/v1/jobs` supports `title`, `normalizedTitle`, `location`, `country`, `region`, `workType`, `minSalary`, `maxAge`, `company`, `postedSince`, and `limit`. `maxAge` accepts values such as `24h` or `7d` and is capped at seven days.

The protected `POST /api/v1/agent/run` operator endpoint starts an on-demand pull when supplied with the Wrangler secret `MANUAL_RUN_TOKEN`. Optional `mode=core`, `mode=daily`, or `mode=full` selects its scope. It is not called by Job Globe.

## Local development

```bash
npm install
copy .dev.vars.example .dev.vars
npm run db:migrate:local
npm run worker:dev
```

Use `npm run db:seed:local` only when you explicitly want the local demo dataset. Production is populated by live discovery runs and must not be seeded.

Verification commands:

```bash
npm test
npm run typecheck
npm run build
npm run worker:check
```

## Cloudflare deployment

The committed `wrangler.jsonc` contains the production D1, Agents SDK Durable Object, Workers AI, static-assets, and observability bindings. Recurring jobs are persisted inside the agent's SQLite-backed scheduler instead of depending on a Worker-level cron. For a fresh Cloudflare account, create a D1 database and replace its ID before migrating.

```bash
npm run db:migrate:remote
npx wrangler secret put MANUAL_RUN_TOKEN
npm run deploy
```

The production Job Globe origin is already included in `ALLOWED_ORIGINS`. Provider credentials, if a future adapter requires them, belong in Wrangler secrets—never in Vite variables or source control.
