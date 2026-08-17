import { getAgentByName } from "agents";
import type { JobDiscoveryAgent } from "./agent";
import type { DiscoveryRunMode } from "./pipeline";
import { jsonResponse, methodNotAllowed, serverError } from "./http";
import { buildJobsQuery, JOB_SELECT, parseJobFilters, rowToPublicJob, type JobRow } from "./jobs";

async function listJobs(request: Request, env: Env) {
  if (request.method !== "GET") return methodNotAllowed();
  const now = new Date();
  const filters = parseJobFilters(new URL(request.url));
  const query = buildJobsQuery(filters, now);
  const result = await env.JOB_LOBSTER_DB.prepare(query.sql).bind(...query.bindings).all<JobRow>();
  const data = result.results.map((row) => rowToPublicJob(row, now));
  return jsonResponse(
    { data, meta: { count: data.length, generatedAt: now.toISOString(), activeWindowDays: 7, filters } },
    { headers: { "cache-control": "public, max-age=120, stale-while-revalidate=600" } },
  );
}

async function getJob(request: Request, env: Env, id: string) {
  if (request.method !== "GET") return methodNotAllowed();
  const row = await env.JOB_LOBSTER_DB.prepare(
    `${JOB_SELECT} WHERE id = ? AND qualification_status = 'accepted' AND status = 'active' AND datetime(posted_at) >= datetime('now', '-7 days') LIMIT 1`,
  ).bind(id).first<JobRow>();
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
      AND datetime(posted_at) >= datetime('now', '-7 days')
  `).first();
  const latestRun = await env.JOB_LOBSTER_DB.prepare(
    "SELECT id, run_type, status, started_at, finished_at, sources_planned, searches_performed, jobs_discovered, jobs_normalized, jobs_accepted, jobs_rejected, duplicates_removed, parsing_failures, source_failures FROM ingestion_runs ORDER BY datetime(started_at) DESC LIMIT 1",
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

async function runAgent(request: Request, env: Env) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const manualRunToken = (env as unknown as { MANUAL_RUN_TOKEN?: string }).MANUAL_RUN_TOKEN;
  const authorization = request.headers.get("authorization");
  if (!manualRunToken || authorization !== `Bearer ${manualRunToken}`) {
    return jsonResponse({ error: { code: "unauthorized", message: "Valid operator authorization is required." } }, { status: 401 });
  }
  const agent = await getAgentByName<Env, JobDiscoveryAgent>(
    env.JOB_DISCOVERY_AGENT as DurableObjectNamespace<JobDiscoveryAgent>,
    env.AGENT_INSTANCE_NAME,
  );
  const requestedMode = new URL(request.url).searchParams.get("mode");
  const runMode: DiscoveryRunMode = requestedMode === "core" || requestedMode === "daily" || requestedMode === "full"
    ? requestedMode
    : "full";
  return jsonResponse({ data: await agent.runPull("manual", runMode) }, { headers: { "cache-control": "no-store" } });
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
    const jobMatch = path.match(/^\/api\/(?:v1\/)?jobs\/([^/]+)$/);
    if (jobMatch) return getJob(request, env, decodeURIComponent(jobMatch[1]));
    return jsonResponse({ error: { code: "not_found", message: "API endpoint not found." } }, { status: 404 });
  } catch (error) {
    return serverError(error);
  }
}
