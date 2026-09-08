import { canonicalApplyUrl, isPipelineStage, scoreRadar } from "../domain/radar";
import { RADAR_WATCHLIST } from "../providers/watchlist";
import { jsonResponse, methodNotAllowed } from "./http";
import { getAgeHours } from "../domain/qualification";
import { rowToPublicJob, type JobRow } from "./jobs";

export interface RadarRow extends JobRow {
  status: string; qualification_status: string;
  description: string | null; first_seen: string | null; first_seen_legacy: number;
  source_count: number; stage: string | null; next_action: string | null;
  follow_up_at: string | null; contact_url: string | null; notes: string | null;
}
export async function listRadar(request: Request, env: Env) {
  if (request.method !== "GET") return methodNotAllowed();
  const now = new Date();
  const result = await env.JOB_LOBSTER_DB.prepare(`
    SELECT j.*, p.stage, p.next_action, p.follow_up_at, p.contact_url, p.notes,
      (SELECT COUNT(*) FROM job_sightings s WHERE s.job_id = j.id) AS source_count
    FROM jobs j LEFT JOIN application_pipeline p ON p.job_id = j.id
    WHERE (j.qualification_status = 'accepted' AND j.status = 'active'
      AND (datetime(j.posted_at) >= datetime('now', '-30 days') OR
        (j.posted_at = '' AND datetime(j.first_seen) >= datetime('now', '-30 days'))))
      OR p.job_id IS NOT NULL
    ORDER BY j.first_seen DESC
  `).all<RadarRow>();
  const data = result.results.map(row => {
    const radar = scoreRadar(row, now);
    const active = row.status === "active" && row.qualification_status === "accepted" && getAgeHours(row.posted_at || row.first_seen || "", now) <= 720;
    if (!active) radar.unknowns.push("Listing is outside the active discovery window; verify that it is still open before taking action.");
    return { ...rowToPublicJob(row, now),
    radar: { ...radar, actionable: active && radar.actionable },
    pipeline: { stage: row.stage ?? "New", nextAction: row.next_action ?? "", followUpAt: row.follow_up_at, contactUrl: row.contact_url ?? "", notes: row.notes ?? "" },
  }; }).sort((a, b) => b.radar.score - a.radar.score || a.id.localeCompare(b.id));
  const queue = data.filter(job => job.radar.actionable && ["New", "Apply Now"].includes(job.pipeline.stage)).slice(0, 15).map(job => job.id);
  return jsonResponse({ data, meta: { count: data.length, generatedAt: now.toISOString(), activeWindowDays: 30, filters: {}, queue,
    interviews: data.filter(j => j.pipeline.stage === "Interview").length,
    followUpsDue: data.filter(j => j.pipeline.stage !== "Closed" && (j.pipeline.stage === "Follow-Up Due" || (j.pipeline.followUpAt && Date.parse(j.pipeline.followUpAt) <= now.getTime()))).length,
  } }, { headers: { "cache-control": "no-store" } });
}
export async function savePipeline(request: Request, env: Env, id: string, authorized: boolean) {
  if (request.method !== "PUT") return methodNotAllowed("PUT");
  if (!authorized) return jsonResponse({ error: { message: "Enter the operator token to save pipeline changes." } }, { status: 401 });
  const reader = request.body?.getReader();
  if (!reader) return jsonResponse({ error: { message: "A pipeline entry is required." } }, { status: 400 });
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 12000) { await reader.cancel(); break; }
    chunks.push(value);
  }
  if (bytes > 12000) return jsonResponse({ error: { message: "Pipeline entry is too large." } }, { status: 413 });
  const buffer = new Uint8Array(bytes);
  let cursor = 0;
  for (const chunk of chunks) { buffer.set(chunk, cursor); cursor += chunk.byteLength; }
  const body = new TextDecoder().decode(buffer);
  let value: Record<string, unknown>;
  try { value = JSON.parse(body); } catch { return jsonResponse({ error: { message: "Invalid JSON." } }, { status: 400 }); }
  if (!value || !isPipelineStage(value.stage) || typeof value.nextAction !== "string" || typeof value.notes !== "string" || typeof value.contactUrl !== "string" || value.nextAction.length > 1000 || value.notes.length > 5000 || value.contactUrl.length > 2000 || (value.contactUrl && !canonicalApplyUrl(value.contactUrl)) || (value.followUpAt != null && (typeof value.followUpAt !== "string" || !Number.isFinite(Date.parse(value.followUpAt))))) {
    return jsonResponse({ error: { message: "Use a valid stage, URL, follow-up date and bounded text fields." } }, { status: 400 });
  }
  const exists = await env.JOB_LOBSTER_DB.prepare("SELECT id FROM jobs WHERE id = ?").bind(id).first();
  if (!exists) return jsonResponse({ error: { message: "Job not found." } }, { status: 404 });
  await env.JOB_LOBSTER_DB.prepare(`INSERT INTO application_pipeline (job_id, stage, next_action, follow_up_at, contact_url, notes)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(job_id) DO UPDATE SET stage=excluded.stage,
    next_action=excluded.next_action, follow_up_at=excluded.follow_up_at, contact_url=excluded.contact_url,
    notes=excluded.notes, updated_at=CURRENT_TIMESTAMP`).bind(id, value.stage, value.nextAction, value.followUpAt ? new Date(String(value.followUpAt)).toISOString() : null, value.contactUrl, value.notes).run();
  return jsonResponse({ saved: true }, { headers: { "cache-control": "no-store" } });
}
export async function listWatchlist(env: Env) {
  const health = await env.JOB_LOBSTER_DB.prepare("SELECT id, last_success_at, cooldown_until FROM sources").all<{ id: string; last_success_at: string | null; cooldown_until: string | null }>();
  return jsonResponse({ data: RADAR_WATCHLIST.map(source => ({ ...source, status: health.results.find(h => h.id === source.id) ?? null })), meta: { companies: new Set(RADAR_WATCHLIST.map(s => s.name.toLowerCase())).size } }, { headers: { "cache-control": "no-store" } });
}
