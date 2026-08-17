import { QUALIFICATION_CONFIG, type TargetTitle } from "../config/qualification";
import { qualifyJob } from "../domain/qualification";
import type { JobLocation, SalaryStatus } from "../domain/job";
import { isTargetTitle, normalizeTitle } from "../domain/title-normalizer";
import { convertToCad } from "../lib/salary";
import { ATS_ADAPTERS } from "../providers/ats";
import { getCurrencyRates } from "../providers/normalization/currency";
import { normalizeLocation } from "../providers/normalization/job-fields";
import { normalizeRawSalary, parseEmployerSalary } from "../providers/normalization/salary";
import { sourcesForRun, type SourceRunMode } from "../providers/source-catalog";
import type { AtsSource, RawAtsJob } from "../providers/types";

export type DiscoveryRunMode = SourceRunMode;

export interface DiscoveryRunStats {
  runId: string;
  runMode: DiscoveryRunMode;
  status: "completed" | "partial" | "failed";
  startedAt: string;
  finishedAt: string;
  sourcesPlanned: number;
  searchesPerformed: number;
  jobsDiscovered: number;
  pagesFetched: number;
  jobsNormalized: number;
  jobsAccepted: number;
  jobsRejected: number;
  duplicatesRemoved: number;
  parsingFailures: number;
  sourceFailures: number;
  errors: string[];
}

function relevantTitle(title: string) {
  return /marketing|content|\bseo\b|\bgeo\b|growth|communications?|\bcomms\b|brand|digital/i.test(title);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanKey(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function classifyTitleWithAi(env: Env, job: RawAtsJob): Promise<TargetTitle | null> {
  if (!relevantTitle(job.title) || /\bproduct marketing\b/i.test(job.title)) return null;
  try {
    const runner = env.AI as unknown as { run(model: string, input: unknown): Promise<unknown> };
    const result = await runner.run(env.TITLE_AI_MODEL, {
      messages: [
        {
          role: "system",
          content: `Classify a job title into exactly one allowed category, or null. Allowed categories: ${QUALIFICATION_CONFIG.targetTitles.join(", ")}. Exclude product marketing, sales, account management, engineering, public affairs, design, internships, and unrelated roles. Return JSON only: {"category":"..."} or {"category":null}.`,
        },
        { role: "user", content: `Title: ${job.title}\nDepartment: ${job.industry ?? "unknown"}` },
      ],
      max_tokens: 80,
      temperature: 0,
    });
    const response = typeof result === "string"
      ? result
      : typeof result === "object" && result && "response" in result
        ? String((result as { response: unknown }).response)
        : JSON.stringify(result);
    const match = response.match(/"category"\s*:\s*(null|"([^"]+)")/i);
    const category = match?.[2] ?? "";
    return isTargetTitle(category) ? category : null;
  } catch (error) {
    console.warn("title_ai_fallback_failed", { title: job.title, error: String(error) });
    return null;
  }
}

async function upsertSource(db: D1Database, source: AtsSource) {
  await db.prepare(`
    INSERT INTO sources (
      id, name, provider_type, provider_token, base_url, company_website,
      scope, enabled, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      provider_type = excluded.provider_type,
      provider_token = excluded.provider_token,
      base_url = excluded.base_url,
      company_website = excluded.company_website,
      scope = excluded.scope,
      enabled = 1,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    source.id,
    source.name,
    source.provider,
    source.token,
    source.website ?? null,
    source.website ?? null,
    source.scope,
  ).run();
}

async function markSourceSuccess(db: D1Database, sourceId: string, now: string) {
  await db.prepare(
    "UPDATE sources SET last_success_at = ?, cooldown_until = NULL, updated_at = ? WHERE id = ?",
  ).bind(now, now, sourceId).run();
}

async function markSourceFailure(db: D1Database, sourceId: string, now: Date) {
  const cooldown = new Date(now.getTime() + 3 * 3_600_000).toISOString();
  await db.prepare(
    "UPDATE sources SET cooldown_until = ?, updated_at = ? WHERE id = ?",
  ).bind(cooldown, now.toISOString(), sourceId).run();
}

async function sourceInCooldown(db: D1Database, sourceId: string, now: string) {
  const row = await db.prepare(
    "SELECT 1 AS cooling FROM sources WHERE id = ? AND datetime(cooldown_until) > datetime(?)",
  ).bind(sourceId, now).first<{ cooling: number }>();
  return Boolean(row?.cooling);
}

interface StoredSalary {
  originalMin: number | null;
  originalMax: number | null;
  currency: string | null;
  cadMin: number | null;
  cadMax: number | null;
  conversionRate: number | null;
  status: SalaryStatus;
  evidence: string | null;
}

function salaryFor(
  job: RawAtsJob,
  location: JobLocation,
  rates: Record<string, number>,
): StoredSalary {
  const raw = job.salary ?? parseEmployerSalary(job.description, location.country);
  if (!raw) {
    return { originalMin: null, originalMax: null, currency: null, cadMin: null, cadMax: null, conversionRate: null, status: "unknown", evidence: null };
  }
  const normalized = normalizeRawSalary(raw);
  let currency = normalized.currency;
  if (!currency && /canada/i.test(location.country ?? "")) currency = "CAD";
  if (!currency && /united states/i.test(location.country ?? "")) currency = "USD";
  const rate = currency ? rates[currency] : undefined;
  if (!currency || !rate) {
    return { originalMin: normalized.minimum, originalMax: normalized.maximum, currency, cadMin: null, cadMax: null, conversionRate: null, status: "unknown", evidence: normalized.evidence };
  }
  return {
    originalMin: normalized.minimum,
    originalMax: normalized.maximum,
    currency,
    cadMin: convertToCad(normalized.minimum, rate),
    cadMax: normalized.maximum === null ? null : convertToCad(normalized.maximum, rate),
    conversionRate: rate,
    status: "verified",
    evidence: normalized.evidence,
  };
}

async function storeCandidate(
  env: Env,
  runId: string,
  job: RawAtsJob,
  now: Date,
  rates: { cadPerUnit: Record<string, number>; effectiveAt: string },
  aiBudget: { remaining: number },
  stats: DiscoveryRunStats,
) {
  let normalizedTitle = normalizeTitle(job.title);
  if (!normalizedTitle && relevantTitle(job.title) && !/\bproduct marketing\b/i.test(job.title) && aiBudget.remaining > 0) {
    aiBudget.remaining -= 1;
    normalizedTitle = await classifyTitleWithAi(env, job);
  }

  const location = normalizeLocation(job.locationText, job.address, job.workType, job.company);
  const salary = salaryFor(job, location, rates.cadPerUnit);
  const decision = qualifyJob({
    originalTitle: job.title,
    workType: job.workType,
    location,
    employmentType: job.employmentType,
    salaryCadMin: salary.cadMin,
    salaryStatus: salary.status,
    postedAt: job.postedAt,
  }, now, normalizedTitle);
  stats.jobsNormalized += 1;

  const dedupeKey = decision.status === "accepted"
    ? [cleanKey(job.company), cleanKey(decision.normalizedTitle), cleanKey(location.city), cleanKey(location.region), cleanKey(location.country), job.postedAt.slice(0, 10)].join("|")
    : null;
  const idHash = await sha256(dedupeKey ?? `${job.sourceId}|${job.externalId}`);
  const jobId = `job_${idHash.slice(0, 24)}`;
  const discoveryId = `discovery_${(await sha256(`${runId}|${job.sourceId}|${job.externalId}`)).slice(0, 24)}`;
  const existing = await env.JOB_LOBSTER_DB.prepare("SELECT id FROM jobs WHERE id = ? LIMIT 1").bind(jobId).first<{ id: string }>();

  if (decision.status === "accepted") {
    stats.jobsAccepted += 1;
    if (existing) stats.duplicatesRemoved += 1;
  } else {
    stats.jobsRejected += 1;
  }

  const payload = JSON.stringify({
    externalId: job.externalId,
    title: job.title,
    company: job.company,
    location: job.locationText,
    postedAt: job.postedAt,
    sourceUrl: job.sourceUrl,
    applicationUrl: job.applicationUrl,
  });
  const discoveredAt = now.toISOString();
  const status = decision.status === "accepted" ? "active" : "archived";
  const providerName = job.provider[0].toUpperCase() + job.provider.slice(1);

  await env.JOB_LOBSTER_DB.batch([
    env.JOB_LOBSTER_DB.prepare(`
      INSERT INTO discoveries (
        id, run_id, source_id, external_id, source_url, canonical_url,
        payload_json, discovered_at, processing_status, processing_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      discoveryId, runId, job.sourceId, job.externalId, job.sourceUrl, job.sourceUrl,
      payload, discoveredAt, decision.status,
    ),
    env.JOB_LOBSTER_DB.prepare(`
      INSERT INTO jobs (
        id, external_id, original_external_id, original_title, normalized_title,
        company, company_website, description, country, region, city, latitude,
        longitude, work_type, eligibility, employment_type, salary_min_original,
        salary_max_original, salary_currency, salary_min_cad, salary_max_cad,
        conversion_rate, conversion_timestamp, salary_status, salary_source,
        posted_at, discovered_at, source, source_url, canonical_url, application_url,
        ats_provider, industry, status, qualification_status, rejection_reason,
        dedupe_key, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        original_title = excluded.original_title,
        normalized_title = excluded.normalized_title,
        company = excluded.company,
        company_website = excluded.company_website,
        description = excluded.description,
        country = excluded.country,
        region = excluded.region,
        city = excluded.city,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        work_type = excluded.work_type,
        eligibility = excluded.eligibility,
        employment_type = excluded.employment_type,
        salary_min_original = excluded.salary_min_original,
        salary_max_original = excluded.salary_max_original,
        salary_currency = excluded.salary_currency,
        salary_min_cad = excluded.salary_min_cad,
        salary_max_cad = excluded.salary_max_cad,
        conversion_rate = excluded.conversion_rate,
        conversion_timestamp = excluded.conversion_timestamp,
        salary_status = excluded.salary_status,
        salary_source = excluded.salary_source,
        posted_at = excluded.posted_at,
        discovered_at = excluded.discovered_at,
        source = excluded.source,
        source_url = excluded.source_url,
        canonical_url = excluded.canonical_url,
        application_url = excluded.application_url,
        industry = excluded.industry,
        status = excluded.status,
        qualification_status = excluded.qualification_status,
        rejection_reason = excluded.rejection_reason,
        updated_at = excluded.updated_at
    `).bind(
      jobId, job.externalId, job.externalId, job.title, decision.normalizedTitle ?? "Unclassified",
      job.company, job.companyWebsite, job.description.slice(0, 50_000), location.country,
      location.region, location.city, location.latitude, location.longitude, job.workType,
      job.eligibility, job.employmentType, salary.originalMin, salary.originalMax, salary.currency,
      salary.cadMin, salary.cadMax, salary.conversionRate, rates.effectiveAt, salary.status,
      salary.evidence, job.postedAt, discoveredAt, providerName, job.sourceUrl, job.sourceUrl,
      job.applicationUrl, job.provider, job.industry, status, decision.status,
      decision.rejectionReason, dedupeKey, discoveredAt,
    ),
  ]);
}

export async function executeDiscoveryRun(
  env: Env,
  runId: string,
  startedAt = new Date(),
  runMode: DiscoveryRunMode = "core",
): Promise<DiscoveryRunStats> {
  const startedIso = startedAt.toISOString();
  const sources = sourcesForRun(runMode);
  const stats: DiscoveryRunStats = {
    runId,
    runMode,
    status: "completed",
    startedAt: startedIso,
    finishedAt: startedIso,
    sourcesPlanned: sources.length,
    searchesPerformed: 0,
    jobsDiscovered: 0,
    pagesFetched: 0,
    jobsNormalized: 0,
    jobsAccepted: 0,
    jobsRejected: 0,
    duplicatesRemoved: 0,
    parsingFailures: 0,
    sourceFailures: 0,
    errors: [],
  };

  await env.JOB_LOBSTER_DB.prepare(
    "INSERT INTO ingestion_runs (id, run_type, status, started_at) VALUES (?, ?, 'running', ?)",
  ).bind(runId, runMode, startedIso).run();

  try {
    const rates = await getCurrencyRates(env.JOB_LOBSTER_DB, startedAt);
    const aiBudget = { remaining: 8 };

    const batchSize = runMode === "daily" || runMode === "full" ? 2 : 4;
    for (let offset = 0; offset < sources.length; offset += batchSize) {
      const batch = sources.slice(offset, offset + batchSize);
      const settled = await Promise.allSettled(batch.map(async (source) => {
        await upsertSource(env.JOB_LOBSTER_DB, source);
        if (await sourceInCooldown(env.JOB_LOBSTER_DB, source.id, startedIso)) return null;
        stats.searchesPerformed += 1;
        const result = await ATS_ADAPTERS[source.provider].pull(source);
        await markSourceSuccess(env.JOB_LOBSTER_DB, source.id, new Date().toISOString());
        return result;
      }));

      for (let index = 0; index < settled.length; index += 1) {
        const outcome = settled[index];
        const source = batch[index];
        if (outcome.status === "rejected") {
          stats.sourceFailures += 1;
          const message = `${source.id}: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`;
          stats.errors.push(message);
          console.warn("source_pull_failed", { runId, source: source.id, error: message });
          await markSourceFailure(env.JOB_LOBSTER_DB, source.id, startedAt);
          continue;
        }
        if (!outcome.value) continue;
        stats.jobsDiscovered += outcome.value.jobs.length;
        stats.pagesFetched += outcome.value.pagesFetched;
        for (const job of outcome.value.jobs.filter((candidate) => relevantTitle(candidate.title))) {
          try {
            await storeCandidate(env, runId, job, startedAt, rates, aiBudget, stats);
          } catch (error) {
            stats.parsingFailures += 1;
            console.warn("candidate_processing_failed", { runId, source: source.id, externalId: job.externalId, error: String(error) });
          }
        }
      }
    }

    await env.JOB_LOBSTER_DB.prepare(`
      UPDATE jobs SET status = 'expired', updated_at = ?
      WHERE status = 'active' AND datetime(posted_at) < datetime(?, '-7 days')
    `).bind(new Date().toISOString(), new Date().toISOString()).run();
    stats.status = stats.sourceFailures || stats.parsingFailures ? "partial" : "completed";
  } catch (error) {
    stats.status = "failed";
    stats.errors.push(error instanceof Error ? error.message : String(error));
  }

  stats.finishedAt = new Date().toISOString();
  await env.JOB_LOBSTER_DB.prepare(`
    UPDATE ingestion_runs SET
      status = ?, finished_at = ?, sources_planned = ?, searches_performed = ?, jobs_discovered = ?,
      pages_fetched = ?, jobs_normalized = ?, jobs_accepted = ?, jobs_rejected = ?,
      duplicates_removed = ?, parsing_failures = ?, source_failures = ?, error_summary = ?
    WHERE id = ?
  `).bind(
    stats.status, stats.finishedAt, stats.sourcesPlanned, stats.searchesPerformed, stats.jobsDiscovered,
    stats.pagesFetched, stats.jobsNormalized, stats.jobsAccepted, stats.jobsRejected,
    stats.duplicatesRemoved, stats.parsingFailures, stats.sourceFailures,
    stats.errors.length ? JSON.stringify(stats.errors.slice(0, 20)) : null, runId,
  ).run();
  console.log("discovery_run_complete", stats);
  return stats;
}
