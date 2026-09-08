import { describe, expect, it } from "vitest";
import { experienceGaps, specialistSkillGaps } from "../src/domain/requirements";
import { scoreRadar } from "../src/domain/radar";
describe("resume evidence gaps", () => {
  it("distinguishes expert SQL requirements from optional familiarity", () => {
    expect(specialistSkillGaps("Expert-level SQL skills, with the ability to build analytical datasets.")).toHaveLength(1);
    expect(specialistSkillGaps("Advanced SQL preferred. SQL familiarity is a plus.")).toHaveLength(0);
  });
  it.each([
    "7+ years of product marketing experience at a technology company",
    "8+ years of B2B enterprise product marketing experience, preferably in cybersecurity",
    "At least 7 years of experience in a people leadership position",
    "3–5 years of people management experience",
  ])("flags required tenure beyond resume evidence: %s", description => {
    expect(experienceGaps(description)).toHaveLength(1);
  });
  it.each([
    "3-5 years of marketing experience",
    "Preferred: 8+ years of marketing experience",
    "8 years of experience preferred",
    "For 10 years, we have served our customers.",
    "15 years of paid service earns an additional holiday.",
  ])("does not turn preferences or unrelated numbers into a gap: %s", description => {
    expect(experienceGaps(description)).toHaveLength(0);
  });
  it("keeps an otherwise high-scoring role out of Apply Now until its experience gap is reviewed", () => {
    const result = scoreRadar({ original_title: "Product Marketing Manager", company: "Example", description: "AI content growth. 7+ years of product marketing experience.", industry: "SaaS", first_seen: new Date().toISOString(), posted_at: new Date().toISOString(), application_url: "https://example.com/jobs/1", work_type: "remote", country: "Canada" });
    expect(result.actionable).toBe(false);
    expect(result.penalties.some(p => p.reason.includes("Required experience"))).toBe(true);
  });
});
