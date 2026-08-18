import { describe, expect, it } from "vitest";
import { isRelevantMarketingTitle, normalizeTitle } from "../src/domain/title-normalizer";
import { classifyWorkType, normalizeLocation } from "../src/providers/normalization/job-fields";
import { normalizeRawSalary, parseEmployerSalary } from "../src/providers/normalization/salary";

describe("live-feed normalization", () => {
  it("reads employer-provided annual salary ranges and infers Canadian dollars", () => {
    const salary = parseEmployerSalary(
      "Compensation: Base salary: $85K to $105K. Pay mix is 90% base.",
      "Canada",
    );
    expect(salary).toMatchObject({ minimum: 85_000, maximum: 105_000, currency: "CAD", interval: "year" });
  });

  it("annualizes employer-provided hourly compensation", () => {
    const salary = parseEmployerSalary("The base pay range is USD $40 - $55 per hour.", "United States");
    expect(salary && normalizeRawSalary(salary)).toMatchObject({ minimum: 83_200, maximum: 114_400, currency: "USD" });
  });

  it("recognizes a hybrid policy even when it is near the end of a long listing", () => {
    const description = `${"Overview. ".repeat(400)}Location-based hybrid policy: staff work in an office at least 25% of the time.`;
    expect(classifyWorkType(null, "San Francisco, CA | New York City, NY", description)).toBe("hybrid");
  });

  it("chooses an allowed New York option from a multi-office hybrid listing", () => {
    expect(normalizeLocation("San Francisco, CA | New York City, NY", undefined, "hybrid", "Example")).toMatchObject({
      city: "New York",
      region: "New York",
      country: "United States",
    });
  });

  it("does not drift into product marketing roles outside the configured taxonomy", () => {
    expect(normalizeTitle("Senior Product Marketing Manager")).toBeNull();
  });

  it("maps broader management-level roles inside the marketing vertical", () => {
    expect(normalizeTitle("Director of Lifecycle Marketing")).toBe("Growth Marketing Manager");
    expect(normalizeTitle("VP of Marketing")).toBe("Marketing Lead");
    expect(normalizeTitle("SEO Specialist")).toBe("SEO Manager");
    expect(normalizeTitle("Senior Paid Media Manager")).toBe("Growth Marketing Manager");
    expect(normalizeTitle("Brand Partnerships Manager")).toBe("Brand Marketing Manager");
    expect(normalizeTitle("Sr. Director, Brand Strategy")).toBe("Brand Marketing Manager");
    expect(normalizeTitle("Associate Director, Social Media (Remote US)")).toBe("Content Manager");
    expect(normalizeTitle("Manager of SEO")).toBe("SEO Manager");
    expect(isRelevantMarketingTitle("Senior Paid Media Manager")).toBe(true);
    expect(isRelevantMarketingTitle("Associate Director, Social Media (Remote US)")).toBe(true);
    expect(normalizeTitle("Senior Paid Social Strategist")).toBe("Growth Marketing Manager");
    expect(isRelevantMarketingTitle("Senior Paid Social Strategist")).toBe(true);
    expect(normalizeTitle("Director of Philanthropic Development and Communications")).toBe("Marketing Communications Manager");
  });
});
