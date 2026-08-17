import { describe, expect, it } from "vitest";
import { buildJobsQuery, parseAgeToHours, parseJobFilters, rowToPublicJob } from "../src/worker/jobs";

describe("jobs API query", () => {
  it("parses supported filters and caps the active window at 30 days", () => {
    const filters = parseJobFilters(
      new URL(
        "https://lobster.example/api/v1/jobs?workType=remote&normalizedTitle=Head%20of%20Content&minSalary=90000&maxAge=30d&limit=900",
      ),
    );

    expect(filters).toMatchObject({
      workType: "remote",
      normalizedTitle: "Head of Content",
      minSalary: 90_000,
      maxAgeHours: 720,
      limit: 500,
    });
    expect(parseAgeToHours("72h")).toBe(72);
  });

  it("uses bound parameters for user-provided values", () => {
    const filters = parseJobFilters(
      new URL("https://lobster.example/api/v1/jobs?company=Northstar&location=Toronto&workType=hybrid"),
    );
    const query = buildJobsQuery(filters, new Date("2026-08-17T12:00:00.000Z"));

    expect(query.sql).toContain("LOWER(company) LIKE LOWER(?)");
    expect(query.sql).toContain("work_type = ?");
    expect(query.sql).toContain("datetime(posted_at) >= datetime(?)");
    expect(query.sql).not.toContain("Northstar");
    expect(query.bindings).toContain("%Northstar%");
  });

  it("maps storage rows to the public versioned contract", () => {
    const job = rowToPublicJob(
      {
        id: "job_1",
        original_title: "Senior Growth Marketing Manager",
        normalized_title: "Growth Marketing Manager",
        company: "Example Inc.",
        company_website: "https://example.com",
        country: "Canada",
        region: "Ontario",
        city: "Toronto",
        latitude: 43.6532,
        longitude: -79.3832,
        eligibility: "Canada",
        work_type: "hybrid",
        employment_type: "full_time",
        salary_min_original: 85_000,
        salary_max_original: 105_000,
        salary_currency: "CAD",
        salary_min_cad: 85_000,
        salary_max_cad: 105_000,
        salary_status: "verified",
        posted_at: "2026-08-17T10:00:00.000Z",
        discovered_at: "2026-08-17T11:00:00.000Z",
        source: "Greenhouse",
        application_url: "https://example.com/apply",
        industry: "Technology",
      },
      new Date("2026-08-17T12:00:00.000Z"),
    );

    expect(job).toMatchObject({
      id: "job_1",
      title: "Senior Growth Marketing Manager",
      normalizedTitle: "Growth Marketing Manager",
      workType: "hybrid",
      ageHours: 2,
      freshness: "hot",
      salary: { cadMinimum: 85_000 },
    });
  });
});
