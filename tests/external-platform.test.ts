import { describe, expect, it } from "vitest";
import {
  EXTERNAL_INGEST_MAX_JOBS,
  parseExternalPlatformBatch,
} from "../src/providers/external-platform";

const now = new Date("2026-08-17T12:00:00.000Z");

function job(provider: "indeed" | "glassdoor" = "indeed") {
  return {
    externalId: "abc123",
    title: "Growth Marketing Manager",
    company: "Example Inc.",
    companyWebsite: "https://example.com",
    description: "Remote growth role with a CAD 85,000 base salary.",
    locationText: "Remote - Canada",
    address: { city: null, region: null, country: "Canada" },
    workType: "remote",
    eligibility: "Canada",
    employmentType: "full_time",
    salary: {
      minimum: 85_000,
      maximum: 90_000,
      currency: "CAD",
      interval: "year",
      evidence: "Employer salary",
    },
    postedAt: "2026-08-16T12:00:00.000Z",
    sourceUrl: provider === "glassdoor"
      ? "https://www.glassdoor.ca/job-listing/growth-marketing-manager-example-JV_IC2281069_KO0,24_KE25,32.htm"
      : "https://ca.indeed.com/viewjob?jk=abc123",
    applicationUrl: "https://jobs.example.com/apply/abc123",
    industry: "Marketing",
  };
}

function payload(provider: "indeed" | "glassdoor" = "indeed") {
  return {
    provider,
    collector: "github-actions-jobspy/1.1.82",
    collectedAt: now.toISOString(),
    batchIndex: 0,
    totalBatches: 1,
    searchesPerformed: 8,
    searchesSucceeded: 8,
    errors: [],
    jobs: [job(provider)],
  };
}

describe("external platform ingestion payload", () => {
  it("maps a fresh Indeed batch to the configured source", () => {
    const parsed = parseExternalPlatformBatch(payload(), now);
    expect(parsed.source.id).toBe("web-indeed");
    expect(parsed.jobs[0]).toMatchObject({
      provider: "indeed",
      sourceId: "web-indeed",
      title: "Growth Marketing Manager",
      workType: "remote",
    });
  });

  it("maps a fresh Glassdoor batch to the configured source", () => {
    const parsed = parseExternalPlatformBatch(payload("glassdoor"), now);
    expect(parsed.source.id).toBe("web-glassdoor");
    expect(parsed.jobs[0]).toMatchObject({
      provider: "glassdoor",
      sourceId: "web-glassdoor",
      title: "Growth Marketing Manager",
    });
  });

  it("rejects a source URL that does not belong to the declared provider", () => {
    const invalid = payload();
    invalid.jobs[0].sourceUrl = "https://www.linkedin.com/jobs/view/123456";
    expect(() => parseExternalPlatformBatch(invalid, now)).toThrow(/does not belong to indeed/);
  });

  it("rejects stale jobs and oversized batches", () => {
    const stale = payload();
    stale.jobs[0].postedAt = "2026-08-01T12:00:00.000Z";
    expect(() => parseExternalPlatformBatch(stale, now)).toThrow(/current-job window/);

    const oversized = payload();
    oversized.jobs = Array.from({ length: EXTERNAL_INGEST_MAX_JOBS + 1 }, job);
    expect(() => parseExternalPlatformBatch(oversized, now)).toThrow(/batch limit/);
  });
});
