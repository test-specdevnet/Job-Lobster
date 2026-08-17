# Job Lobster

Job Lobster is the production discovery, qualification, and API service behind Job Globe. It runs as a Cloudflare Worker at <https://job-lobster.awcarr97.workers.dev>, keeps durable agent state and schedules in the Agents SDK, and exposes only current jobs that pass the centralized qualification policy.

It is an autonomous job-discovery agent, not an application-submission bot. It finds and evaluates listings; the user reviews each result and applies through the employer's canonical URL.

## Production architecture

- Cloudflare Worker serving the API and the animated beach status UI
- Cloudflare Agents SDK Durable Object (`JobDiscoveryAgent`) for durable run state and autonomous schedules
- Agent-owned core refresh at minute 7 and 37 of every hour
- Agent-owned deep scrape every 24 hours at 09:00 UTC
- Agent-owned Cloudflare Web Search every 24 hours at 10:30 UTC across LinkedIn, Indeed, and Glassdoor public job results for remote US and Canadian marketing roles
- A second Browser Run pass expands LinkedIn coverage without an authenticated LinkedIn session
- Independent GitHub-hosted collectors search Indeed through JobSpy and query LinkedIn and Glassdoor through JSearch at 10:05 UTC every day, then submit bounded batches to Job Lobster's common qualification pipeline
- Deep scrapes fan out into bounded 12-source invocations so the 188-board catalog stays within Worker request limits
- Cloudflare D1 for jobs, discoveries, sources, ingestion runs, and exchange-rate cache
- Public Ashby, Greenhouse, and Lever adapters with bounded concurrency, timeouts, retries, and source cooldowns
- Workers AI as a narrow fallback for ambiguous marketing-title classification
- Employer-provided salary parsing plus CAD normalization using cached ECB/Frankfurter rates
- Dedupe, 30-day expiry, rejection reasons, source health, and observability logs
- No automated application submission and no authenticated-session, login-wall, or anti-bot bypass

The catalog contains 188 verified employer ATS boards: 32 core boards refreshed frequently and 156 boards scanned by the daily deep cycle. A separate Cloudflare cycle searches public LinkedIn results for both the United States and Canada, with a Browser Run depth pass for LinkedIn. The scheduled GitHub-hosted collector handles Indeed directly and uses JSearch's job-index API for LinkedIn and Glassdoor because those boards reject Cloudflare and GitHub data-center scraping. Its provider jobs run independently so a failure at one board cannot suppress the other boards. External batches authenticate with a short-lived GitHub Actions OIDC token that is restricted to this repository, its immutable repository ID, the main branch, and the collector workflow. Web candidates must expose explicit posting-age evidence no older than seven days before they enter the common qualification pipeline.

## Qualification policy

The pipeline keeps both original and normalized titles. It accepts worldwide remote, hybrid, and on-site listings in the target marketing vertical and excludes postings older than 30 days. Known compensation is converted to CAD using cached live exchange rates and must meet the $70,000 CAD floor; undisclosed compensation remains visible for manual review. Rejected discoveries remain auditable with reasons such as `title_not_match`, `salary_below_threshold`, `salary_unknown`, and `posting_too_old`.

Change thresholds and allowed locations in `src/config/qualification.ts`. Do not duplicate policy in adapters or API routes.

## Public API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/health` | Service and storage health |
| `GET /api/v1/agent` | Current durable agent state and latest run |
| `GET /api/v1/jobs` | Active, qualified jobs |
| `GET /api/v1/jobs/:id` | One active, qualified job |
| `GET /api/v1/stats` | Public aggregate counts |

`GET /api/v1/jobs` supports `title`, `normalizedTitle`, `location`, `country`, `region`, `workType`, `minSalary`, `maxAge`, `company`, `postedSince`, and `limit`. `maxAge` accepts values such as `24h`, `7d`, or `30d` and is capped at 30 days.

The protected `POST /api/v1/agent/run` operator endpoint starts an on-demand pull when supplied with the Wrangler secret `MANUAL_RUN_TOKEN`. Optional `mode=core`, `mode=daily`, `mode=full`, or `mode=web` selects its scope. It is not called by Job Globe.

`POST /api/v1/ingest/platform-jobs` is reserved for the scheduled Indeed, LinkedIn, and Glassdoor collector. It accepts only signed GitHub Actions OIDC identities from `.github/workflows/platform-discovery.yml` on this repository's main branch; it does not use a Google login, stored job-board session, or long-lived GitHub/Cloudflare credential.

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

The committed `wrangler.jsonc` contains the production D1, Agents SDK Durable Object, Workers AI, Web Search, Browser Run, static-assets, and observability bindings. Recurring Worker jobs are persisted inside the agent's SQLite-backed scheduler. External Indeed and Glassdoor ingestion is scheduled independently by GitHub Actions so its requests originate outside Cloudflare. Glassdoor reads a validated external web-search snapshot from `data/external-search/glassdoor.json` when `OPENWEBNINJA_API_KEY` is absent; if that optional secret is present, it uses JSearch instead. The external snapshot is freshness-checked again at collection time, so expired listings cannot be ingested. For a fresh Cloudflare account, create a D1 database and replace its ID before migrating. Cloudflare Web Search is an experimental account entitlement; when it is unavailable the run records `account_disabled` per source and the independent LinkedIn Browser Run continues.

```bash
npm run db:migrate:remote
npx wrangler secret put MANUAL_RUN_TOKEN
npm run deploy
```

The production Job Globe origin is already included in `ALLOWED_ORIGINS`. Provider credentials, if a future adapter requires them, belong in Wrangler secrets—never in Vite variables or source control.
