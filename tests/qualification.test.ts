import { describe, expect, it } from "vitest";
import type { QualificationCandidate } from "../src/domain/job";
import { qualifyJob } from "../src/domain/qualification";

const now = new Date("2026-08-17T12:00:00.000Z");

function candidate(overrides: Partial<QualificationCandidate> = {}): QualificationCandidate {
  return {
    originalTitle: "Marketing Manager",
    workType: "remote",
    location: { city: null, region: null, country: "Canada" },
    employmentType: "full_time",
    salaryCadMin: 95_000,
    salaryStatus: "verified",
    postedAt: "2026-08-16T12:00:00.000Z",
    ...overrides,
  };
}

describe("qualification engine", () => {
  it("accepts a worldwide remote growth marketing role", () => {
    const result = qualifyJob(
      candidate({
        originalTitle: "Senior Growth Marketing Manager",
        location: { city: "Berlin", region: "Berlin", country: "Germany" },
        postedAt: "2026-08-15T12:00:00.000Z",
      }),
      now,
    );
    expect(result).toMatchObject({ status: "accepted", normalizedTitle: "Growth Marketing Manager" });
  });

  it("accepts a Toronto hybrid role", () => {
    const result = qualifyJob(
      candidate({
        originalTitle: "Digital Marketing Manager",
        workType: "hybrid",
        location: { city: "Toronto", region: "Ontario", country: "Canada" },
        salaryCadMin: 85_000,
        postedAt: "2026-08-17T08:00:00.000Z",
      }),
      now,
    );
    expect(result.status).toBe("accepted");
  });

  it("accepts a Florida hybrid role after salary conversion", () => {
    const result = qualifyJob(
      candidate({
        originalTitle: "Content Marketing Manager",
        workType: "hybrid",
        location: { city: "Miami", region: "FL", country: "USA" },
        salaryCadMin: 82_200,
        postedAt: "2026-08-14T12:00:00.000Z",
      }),
      now,
    );
    expect(result.status).toBe("accepted");
  });

  it("accepts an on-site Buffalo role", () => {
    const result = qualifyJob(
      candidate({
        originalTitle: "Marketing Manager",
        workType: "onsite",
        location: { city: "Buffalo", region: "NY", country: "United States" },
        postedAt: "2026-08-16T12:00:00.000Z",
      }),
      now,
    );
    expect(result.status).toBe("accepted");
  });

  it("accepts a Niagara Region municipality", () => {
    const result = qualifyJob(
      candidate({
        originalTitle: "Content Manager",
        workType: "onsite",
        location: { city: "St. Catharines", region: "Ontario", country: "Canada" },
        salaryCadMin: 78_000,
        postedAt: "2026-08-12T12:00:00.000Z",
      }),
      now,
    );
    expect(result.status).toBe("accepted");
  });

  it("rejects a hybrid role outside the allowed regions", () => {
    const result = qualifyJob(
      candidate({
        originalTitle: "Hybrid Growth Manager",
        workType: "hybrid",
        location: { city: "San Francisco", region: "California", country: "United States" },
      }),
      now,
    );
    expect(result.rejectionReason).toBe("hybrid_location_not_allowed");
  });

  it("rejects an on-site role outside the allowed cities", () => {
    const result = qualifyJob(
      candidate({
        workType: "onsite",
        location: { city: "Ottawa", region: "Ontario", country: "Canada" },
      }),
      now,
    );
    expect(result.rejectionReason).toBe("onsite_location_not_allowed");
  });

  it("rejects a role below the CAD salary floor", () => {
    const result = qualifyJob(candidate({ originalTitle: "Content Strategist", salaryCadMin: 60_000 }), now);
    expect(result.rejectionReason).toBe("salary_below_threshold");
  });

  it("rejects a listing older than seven days", () => {
    const result = qualifyJob(candidate({ postedAt: "2026-08-05T12:00:00.000Z" }), now);
    expect(result.rejectionReason).toBe("posting_too_old");
  });

  it("rejects an unrelated engineering title", () => {
    const result = qualifyJob(candidate({ originalTitle: "Software Engineering Manager", salaryCadMin: 150_000 }), now);
    expect(result.rejectionReason).toBe("title_not_match");
  });

  it("rejects unknown salary under the initial production policy", () => {
    const result = qualifyJob(candidate({ salaryCadMin: null, salaryStatus: "unknown" }), now);
    expect(result.rejectionReason).toBe("salary_unknown");
  });

  it("marks jobs older than 72 hours as fading", () => {
    const result = qualifyJob(candidate({ postedAt: "2026-08-13T12:00:00.000Z" }), now);
    expect(result).toMatchObject({ status: "accepted", freshness: "fading", ageHours: 96 });
  });

  it("treats D1 datetime values as UTC", () => {
    const result = qualifyJob(candidate({ postedAt: "2026-08-17 10:00:00" }), now);
    expect(result.ageHours).toBe(2);
  });
});
