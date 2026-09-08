import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { storeCandidate, type DiscoveryRunStats } from "../src/worker/pipeline";
import { listRadar, savePipeline } from "../src/worker/radar";
import { PIPELINE_STAGES } from "../src/domain/radar";
import type { RawAtsJob } from "../src/providers/types";

function setup() {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations").sort()) db.exec(readFileSync(`migrations/${file}`, "utf8"));
  class Statement {
    values: (string | number | null)[] = [];
    constructor(readonly sql: string) {}
    bind(...values: (string | number | null)[]) { this.values = values; return this; }
    async first() { return db.prepare(this.sql).get(...this.values) ?? null; }
    async all() { return { results: db.prepare(this.sql).all(...this.values) }; }
    async run() { return db.prepare(this.sql).run(...this.values); }
  }
  const env = { JOB_LOBSTER_DB: { prepare: (sql: string) => new Statement(sql), batch: async (statements: Statement[]) => {
    db.exec("BEGIN"); try { const results = []; for (const stmt of statements) results.push(await stmt.run()); db.exec("COMMIT"); return results; } catch (error) { db.exec("ROLLBACK"); throw error; }
  } } } as unknown as Env;
  const now = new Date();
  const raw: RawAtsJob = { sourceId: "ats-example", provider: "ashby", externalId: "req-1", title: "Content Marketing Manager", company: "Example", companyWebsite: "https://example.com", description: "AI cloud SEO content and growth", locationText: "Remote - Canada", address: { country: "Canada" }, workType: "remote", eligibility: "Canada", employmentType: "full_time", salary: null, postedAt: now.toISOString(), sourceUrl: "https://jobs.example.com/1", applicationUrl: "https://jobs.example.com/1?utm_source=feed", industry: "SaaS" };
  const ingest = async (job = raw, date = now) => {
    db.prepare("INSERT OR IGNORE INTO sources(id,name,provider_type) VALUES (?,?,?)").run(job.sourceId, "Example", job.provider);
    db.exec("INSERT OR IGNORE INTO ingestion_runs(id,status,started_at) VALUES ('test','running',CURRENT_TIMESTAMP)");
    await storeCandidate(env, "test", job, date, { cadPerUnit: { CAD: 1 }, effectiveAt: date.toISOString() }, { remaining: 0 }, { jobsNormalized: 0, jobsAccepted: 0, jobsRejected: 0, duplicatesRemoved: 0 } as DiscoveryRunStats);
  };
  return { db, env, raw, now, ingest };
}
describe("radar database regression", () => {
  it("preserves first_seen, ID and original posting time across reingestion and changed dates", async () => {
    const { db, raw, now, ingest } = setup();
    await ingest(); const first = db.prepare("SELECT * FROM jobs").get();
    await ingest({ ...raw, postedAt: new Date(now.getTime() + 86400000).toISOString() }, new Date(now.getTime() + 86400000));
    const rows = db.prepare("SELECT * FROM jobs").all(); expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: first!.id, first_seen: now.toISOString(), discovered_at: now.toISOString(), posted_at: raw.postedAt });
    expect(() => db.prepare("UPDATE jobs SET first_seen = ?").run(new Date().toISOString()+"x")).toThrow(/immutable/);
  });
  it("merges a syndicated mirror but preserves separate employer requisitions", async () => {
    const { db, raw, ingest } = setup(); await ingest();
    await ingest({ ...raw, sourceId: "web-indeed", provider: "indeed", externalId: "mirror", applicationUrl: "https://indeed.com/viewjob?jk=mirror", sourceUrl: "https://indeed.com/viewjob?jk=mirror" });
    expect(db.prepare("SELECT * FROM jobs").all()).toHaveLength(1);
    expect(db.prepare("SELECT application_url FROM jobs").get()!.application_url).toContain("jobs.example.com");
    expect(db.prepare("SELECT * FROM job_sightings").all()).toHaveLength(2);
    await ingest({ ...raw, externalId: "req-2", applicationUrl: "https://jobs.example.com/2", sourceUrl: "https://jobs.example.com/2" });
    expect(db.prepare("SELECT * FROM jobs").all()).toHaveLength(2);
  });
  it("persists every stage and follow-up, including expired jobs; rejects unauthorized writes", async () => {
    const { db, env, ingest } = setup(); await ingest(); const id = String(db.prepare("SELECT id FROM jobs").get()!.id);
    const entry = { stage: "Applied", nextAction: "Follow up with verified team lead", followUpAt: "2026-09-01T13:00:00Z", contactUrl: "https://example.com/team", notes: "Resume tailored" };
    const request = (body = entry) => new Request("http://localhost/api/v1/pipeline/"+id, { method: "PUT", body: JSON.stringify(body) });
    expect((await savePipeline(request(), env, id, false)).status).toBe(401);
    expect(db.prepare("SELECT * FROM application_pipeline").all()).toHaveLength(0);
    for (const stage of PIPELINE_STAGES) {
      expect((await savePipeline(request({ ...entry, stage }), env, id, true)).status).toBe(200);
      expect(db.prepare("SELECT stage FROM application_pipeline").get()!.stage).toBe(stage);
    }
    await savePipeline(request(), env, id, true);
    await ingest(); db.exec("UPDATE jobs SET status='expired'");
    const result = await (await listRadar(new Request("http://localhost/api/v1/radar"), env)).json() as { data: { pipeline: { stage: string; nextAction: string } }[]; meta: { followUpsDue: number } };
    expect(result.data[0].pipeline).toMatchObject({ stage: "Applied", nextAction: entry.nextAction });
    expect(result.meta.followUpsDue).toBe(1);
    await savePipeline(request({ ...entry, stage: "Apply Now" }), env, id, true);
    const expired = await (await listRadar(new Request("http://localhost/api/v1/radar"), env)).json() as { meta: { queue: string[] } };
    expect(expired.meta.queue).toHaveLength(0);
  });
  it("backfills legacy rows conservatively without changing IDs", () => {
    const db = new DatabaseSync(":memory:");
    for (const file of readdirSync("migrations").sort().filter(f => !f.startsWith("0004"))) db.exec(readFileSync(`migrations/${file}`, "utf8"));
    db.exec(`INSERT INTO jobs(id,original_title,normalized_title,company,work_type,posted_at,discovered_at,source,source_url,application_url,qualification_status,created_at)
      VALUES ('legacy','Content Manager','Content Manager','Example','remote','2026-08-01','2026-09-08','Ashby','https://example.com/1','https://example.com/1','accepted','2026-08-02')`);
    db.exec(readFileSync("migrations/0004_first_to_apply_radar.sql", "utf8"));
    expect(db.prepare("SELECT id, first_seen, first_seen_legacy FROM jobs").get()).toMatchObject({ id: "legacy", first_seen: "2026-08-02", first_seen_legacy: 1 });
  });
});
