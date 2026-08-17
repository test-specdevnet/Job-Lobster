import { getAgentByName } from "agents";
import { QUALIFICATION_CONFIG } from "../config/qualification";
import {
  EXTERNAL_INGEST_MAX_BYTES,
  ExternalPayloadError,
  parseExternalPlatformBatch,
} from "../providers/external-platform";
import type { SourceRunMode } from "../providers/source-catalog";
import type { JobDiscoveryAgent } from "./agent";
import {
  GitHubOidcError,
  verifyGitHubActionsOidc,
  type VerifiedGitHubActionsIdentity,
} from "./github-oidc";
import { jsonResponse, methodNotAllowed, serverError } from "./http";
import { buildJobsQuery, JOB_SELECT, parseJobFilters, rowToPublicJob, type JobRow } from "./jobs";
import { executeExternalPlatformIngestion } from "./pipeline";

async function listJobs(request: Request, env: Env) {
  if (request.method !== "GET") return methodNotAllowed();
  const now = new Date();
  const filters = parseJobFilters(new URL(request.url));
  const query = buildJobsQuery(filters, now);
  const result = await env.JOB_LOBSTER_DB.prepare(query.sql).bind(...query.bindings).all<JobRow>();
  const data = result.results.map((row) => rowToPublicJob(row, now));
  return jsonResponse(
    { data, meta: { count: data.length, generatedAt: now.toISOString(), activeWindowDays: QUALIFICATION_CONFIG.maximumJobAgeDays, filters } },
    { headers: { "cache-control": "public, max-age=120, stale-while-revalidate=600" } },
  );
}

async function getJob(request: Request, env: Env, id: string) {
  if (request.method !== "GET") return methodNotAllowed();
  const row = await env.JOB_LOBSTER_DB.prepare(
    `${JOB_SELECT} WHERE id = ? AND qualification_status = 'accepted' AND status = 'active' AND datetime(posted_at) >= datetime('now', ?) LIMIT 1`,
  ).bind(id, `-${QUALIFICATION_CONFIG.maximumJobAgeDays} days`).first<JobRow>();
  if (!row) return jsonResponse({ error: { code: "not_found", message: "No active job was found with that id." } }, { status: 404 });
  return jsonResponse({ data: rowToPublicJob(row) }, { headers: { "cache-control": "public, max-age=120" } });
}

async function getStats(request: Request, env: Env) {
  if (request.method !== "GET") return methodNotAllowed();
  const stats = await env.JOB_LOBSTER_DB.prepare(`
    SELECT COUNT(*) AS active_jobs,
      SUM(CASE WHEN work_type = 'remote' THEN 1 ELSE 0 END) AS remote_jobs,
      SUM(CASE WHEN work_type = 'hybrid' THEN 1 ELSE 0 END) AS hybrid_jobs,
      SUM(CASE WHEN work_type = 'onsite' THEN 1 ELSE 0 END) AS onsite_jobs,
      SUM(CASE WHEN datetime(posted_at) >= datetime('now', '-72 hours') THEN 1 ELSE 0 END) AS fresh_jobs,
      MAX(discovered_at) AS last_discovered_at
    FROM jobs
    WHERE qualification_status = 'accepted' AND status = 'active'
      AND datetime(posted_at) >= datetime('now', ?)
  `).bind(`-${QUALIFICATION_CONFIG.maximumJobAgeDays} days`).first();
  const latestRun = await env.JOB_LOBSTER_DB.prepare(
    "SELECT id, run_type, discovery_channel, status, started_at, finished_at, sources_planned, searches_performed, jobs_discovered, jobs_normalized, jobs_accepted, jobs_rejected, duplicates_removed, parsing_failures, source_failures FROM ingestion_runs ORDER BY datetime(started_at) DESC LIMIT 1",
  ).first();
  return jsonResponse({ data: { jobs: stats, latestRun }, meta: { generatedAt: new Date().toISOString() } }, { headers: { "cache-control": "public, max-age=60" } });
}

async function getAgentStatus(request: Request, env: Env) {
  if (request.method !== "GET") return methodNotAllowed();
  const agent = await getAgentByName<Env, JobDiscoveryAgent>(
    env.JOB_DISCOVERY_AGENT as DurableObjectNamespace<JobDiscoveryAgent>,
    env.AGENT_INSTANCE_NAME,
  );
  return jsonResponse({ data: await agent.getStatus(), meta: { generatedAt: new Date().toISOString() } }, { headers: { "cache-control": "no-store" } });
}

async function secretsMatch(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function runAgent(request: Request, env: Env) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const configuredToken = Reflect.get(env, "MANUAL_RUN_TOKEN");
  const manualRunToken = typeof configuredToken === "string" ? configuredToken : null;
  const authorization = request.headers.get("authorization");
  const providedToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const authorized = Boolean(manualRunToken && providedToken && await secretsMatch(manualRunToken, providedToken));
  if (!authorized) {
    return jsonResponse({ error: { code: "unauthorized", message: "Valid operator authorization is required." } }, { status: 401 });
  }
  const agent = await getAgentByName<Env, JobDiscoveryAgent>(
    env.JOB_DISCOVERY_AGENT as DurableObjectNamespace<JobDiscoveryAgent>,
    env.AGENT_INSTANCE_NAME,
  );
  const requestedMode = new URL(request.url).searchParams.get("mode");
  if (requestedMode === "web") {
    return jsonResponse({ data: await agent.runWebSearch("manual") }, { headers: { "cache-control": "no-store" } });
  }
  const runMode: SourceRunMode = requestedMode === "core" || requestedMode === "daily" || requestedMode === "full"
    ? requestedMode
    : "full";
  return jsonResponse({ data: await agent.runPull("manual", runMode) }, { headers: { "cache-control": "no-store" } });
}

async function readBoundedJson(request: Request, maximumBytes: number): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0 || parsedLength > maximumBytes) {
      throw new ExternalPayloadError("Request body exceeds the ingestion limit.");
    }
  }
  if (!request.body) throw new ExternalPayloadError("Request body is required.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new ExternalPayloadError("Request body exceeds the ingestion limit.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new ExternalPayloadError("Request body must be valid JSON.");
  }
}

interface ExistingIngestionRun {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  jobs_discovered: number;
  jobs_accepted: number;
  jobs_rejected: number;
  duplicates_removed: number;
  parsing_failures: number;
  source_failures: number;
}

async function ingestExternalPlatform(request: Request, env: Env) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return jsonResponse(
      { error: { code: "unsupported_media_type", message: "Content-Type must be application/json." } },
      { status: 415 },
    );
  }
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  let identity: VerifiedGitHubActionsIdentity;
  try {
    identity = await verifyGitHubActionsOidc(token);
  } catch (error) {
    console.warn(JSON.stringify({
      message: "external_ingestion_authorization_failed",
      error: error instanceof GitHubOidcError ? error.message : "OIDC verification failed.",
    }));
    return jsonResponse(
      { error: { code: "unauthorized", message: "Valid GitHub Actions authorization is required." } },
      { status: 401 },
    );
  }

  try {
    const payload = parseExternalPlatformBatch(await readBoundedJson(request, EXTERNAL_INGEST_MAX_BYTES));
    const runId = [
      "external",
      payload.provider,
      identity.runId,
      identity.runAttempt,
      payload.batchIndex,
    ].join("_");
    const existing = await env.JOB_LOBSTER_DB.prepare(`
      SELECT id, status, started_at, finished_at, jobs_discovered, jobs_accepted, jobs_rejected,
        duplicates_removed, parsing_failures, source_failures
      FROM ingestion_runs WHERE id = ? LIMIT 1
    `).bind(runId).first<ExistingIngestionRun>();
    if (existing) {
      return jsonResponse(
        { data: existing, meta: { idempotentReplay: true } },
        { headers: { "cache-control": "no-store" } },
      );
    }
    const result = await executeExternalPlatformIngestion(
      env,
      runId,
      payload.source,
      payload.jobs,
      {
        collector: payload.collector,
        batchIndex: payload.batchIndex,
        totalBatches: payload.totalBatches,
        searchesPerformed: payload.searchesPerformed,
        searchesSucceeded: payload.searchesSucceeded,
        errors: payload.errors,
      },
      new Date(payload.collectedAt),
    );
    return jsonResponse(
      { data: result, meta: { idempotentReplay: false } },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ExternalPayloadError) {
      return jsonResponse(
        { error: { code: "invalid_payload", message: error.message } },
        { status: 400 },
      );
    }
    throw error;
  }
}

export async function handleApi(request: Request, env: Env) {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");
    if (path === "/api/health" || path === "/api/v1/health") {
      if (request.method !== "GET") return methodNotAllowed();
      return jsonResponse({ status: "ok", service: "job-lobster", generatedAt: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
    }
    if (path === "/api/jobs" || path === "/api/v1/jobs") return listJobs(request, env);
    if (path === "/api/stats" || path === "/api/v1/stats") return getStats(request, env);
    if (path === "/api/v1/agent") return getAgentStatus(request, env);
    if (path === "/api/v1/agent/run") return runAgent(request, env);
    if (path === "/api/v1/ingest/platform-jobs") return ingestExternalPlatform(request, env);
    const jobMatch = path.match(/^\/api\/(?:v1\/)?jobs\/([^/]+)$/);
    if (jobMatch) return getJob(request, env, decodeURIComponent(jobMatch[1]));
    return jsonResponse({ error: { code: "not_found", message: "API endpoint not found." } }, { status: 404 });
  } catch (error) {
    return serverError(error);
  }
}
