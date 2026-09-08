# Job Lobster: First-to-Apply Radar Revamp

Implemented directly in the existing Job-Lobster and Job-Lobster-Globe checkouts. The globe and React/Vite/Cloudflare/D1 architecture are preserved. Both checkouts were clean before the revamp.

## Open the local app

The backend and globe are running locally. Open http://127.0.0.1:5174/.

To restart:

1. In `C:\Users\awcar\Documents\Codex\2026-08-17\he\Job-Lobster`, run `npm run db:migrate:local`, then `npm run radar:dev`.
2. In `C:\Users\awcar\Documents\Codex\2026-08-17\he\Job-Lobster-Globe`, run `npm run radar:dev`.
3. In **Scan / connect**, enter the local development token `local-radar-only`. Choose **Connect / reload** or **Scan 140 employers**.

The local backend binds to 127.0.0.1:8787. The local config omits remote AI, browser and web-search bindings. The new scan route uses direct ATS adapters and does not instantiate the legacy scheduling agent. The local development token is intentionally not a production credential. Production personal-radar reads and writes require the existing operator token. The local verification pass did not deploy, submit applications, send outreach, or restart Glassdoor automation. Production releases require migration 0004 before the Worker and Globe are deployed.

## What changed

- Migration `0004_first_to_apply_radar.sql` adds immutable first_seen timestamps, source sightings and a separate application pipeline. Existing IDs remain intact. Legacy timestamps are recovered from retained observations or prior creation/discovery history and marked legacy; they receive no freshness bonus.
- Reingestion preserves first_seen and the original discovery time. Employer posting time is kept separate and is not advanced by reingestion. Greenhouse modification dates are no longer substituted for publication dates.
- Deduplication uses stable requisition identifiers and canonical application URLs without tracking parameters. Exact title/location matches can merge syndicated mirrors only when the match is unambiguous. Separate employer requisitions remain separate. Employer apply URLs take precedence over syndicated links.
- Ranking uses 40% fit, 25% freshness, 20% human accessibility and 15% hiring speed. Each role exposes component scores, penalties, resume evidence and unknowns. First-seen bands cover <12h, <24h, <48h, <72h and older history. Known older posting dates also reduce freshness.
- Fit reasons and three resume tracks are grounded in the recovered Andrew Carr resume. Product/technical/developer/solutions marketing and technical content roles are included. Student/co-op roles are excluded or flagged. Overseas remote eligibility, unresolved office locations, clearance/citizenship requirements, leadership scope, older postings, enterprise size heuristics and syndication can reduce priority.
- **Apply Now** ranks up to 15 unsubmitted actionable roles (minimum heuristic priority 30, direct application URL, no blocking requirement/location flag, active listing window). Older but relevant roles can remain in the queue with an explicit age penalty; the list is not padded with ineligible jobs.
- **Pipeline** saves New, Apply Now, Applied, Human Contact Found, Outreach Sent, Follow-Up Due, Interview and Closed, plus next action, follow-up date, contact link and notes. Expired tracked roles remain visible but cannot return to Apply Now. Interviews and due follow-ups are emphasized.
- A 140-employer shortlist spans technical companies, Ontario employers and agencies, with per-source last-success/cooldown visibility. The broader existing catalog remains available. New Workable and SmartRecruiters adapters join Greenhouse, Lever and Ashby. LinkedIn/Indeed remain fallback channels in the existing architecture.
- The globe remains intact. Actual salary ranges are displayed instead of the old misleading $90K display cap. A Canadian country-code parsing bug was corrected, including Mississauga/Ontario mapping.

## Verification completed on September 8, 2026

| Check | Actual result |
|---|---|
| Backend regression suite | 67 tests passed across 11 files |
| Globe regression suite | 18 tests passed across 3 files |
| Backend and globe production builds | Both passed |
| Worker packaging check | Dry run passed; nothing deployed |
| Local D1 migration | Applied successfully |
| One-time employer scan | 140 employers checked; 240 roles available for review; 9 roles in the current queue after requirement-gap review |
| Live reingestion check | Same job ID and first_seen retained while correcting PointClickCare location |
| Browser end-to-end | Saved PointClickCare as Apply Now with a resume-review next action; persisted after full reload |
| Visual review | Desktop and 390px mobile layouts checked; globe preserved; no browser console errors observed |

The tests cover scoring boundaries, unknown/legacy age handling, tracking-URL normalization, separate requisitions versus syndicated mirrors, SQL timestamp immutability, migration backfill, all pipeline stages, unauthorized saves, expired tracked roles, provider normalization, and queue behavior. Node 24 was used; the database tests use its built-in SQLite support.

## Limitations and next actions

- Workable's public endpoint returned HTTP 403 during live verification. Its adapter passes fixture tests, but no unverified Workable board was activated. Marqeta's obsolete Greenhouse feed was replaced with its verified Ashby board, marqeta-inc, linked from its official careers page. A local rescan succeeded; all 140 shortlisted employers now have a successful feed check.
- Generic employer career pages are available for manual review through employer links; this revamp does not introduce a universal careers-page crawler. The five ATS adapters cover the implemented automated path.
- Scores are transparent heuristics, not hiring probabilities or a complete requirements audit. Named recruiter contacts and real hiring timelines remain unverified unless evidenced by a listing. Review location, seniority, required experience and the employer's current application page before applying.
- First seen means first observed by this system. It does not mean newly published, particularly on the first scan of an existing board. Previously overwritten legacy history cannot be reconstructed beyond retained evidence.
- The existing Three.js bundle produces a >500KB build warning; this is non-blocking and the globe is still loaded separately. No speculative replacement was introduced.
- Start with the Content/Technical Content track for the saved PointClickCare role, then review the ranked queue and select the appropriate resume track. Mark actual applications and verified contacts manually. Use follow-up dates to keep the next two weeks focused on responses and interviews.
- Use **Scan 140 employers** for an explicit fresh scan; it can be stopped after the current batch of four. The new local workflow is manual and does not change the old paused automation.

A point-in-time queue of 9 current candidates with application links and scoring evidence is also saved as `daily-queue-snapshot.json` alongside this summary.

## Follow-up quality pass

The continued review added explicit penalties for required tenure beyond the resume's dated evidence, lengthy people-leadership requirements, specialist systems/analytics tracks and expert SQL requirements. Preferences are not treated as mandatory tenure. Each penalty quotes or explains the gap; excluded roles remain visible in All signals for manual review. This is a conservative review rule, not a claim that Andrew cannot qualify.

Marqeta's employer-owned careers page links to its current Ashby board: https://www.marqeta.com/company/careers. The replacement public feed returned 42 listings and its local ingestion completed with zero source or parsing failures. Workable remains the documented live-access limitation.

Latest validation: 67 backend tests passed; backend build and Worker packaging dry run passed. Frontend code was unchanged in this follow-up; its prior 18 passing tests and successful build remain applicable.
