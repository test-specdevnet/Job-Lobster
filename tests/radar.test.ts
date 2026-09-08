import { describe, expect, it } from "vitest";
import { canonicalApplyUrl, scoreRadar, type RadarInput } from "../src/domain/radar";
const now = new Date("2026-09-08T12:00:00Z");
const base: RadarInput = { original_title: "Technical Content Strategist", description: "AI cloud SEO audience growth", company: "Example", industry: "SaaS", first_seen: "2026-09-08T10:00:00Z", posted_at: "2026-09-08T09:00:00Z", application_url: "https://jobs.example.com/123", work_type: "remote", country: "Canada" };
describe("transparent radar ranking", () => {
  it("uses the requested weights and conservative unknown signals", () => {
    const result = scoreRadar(base, now);
    expect(result.components).toEqual({ fit: 100, freshness: 100, accessibility: 35, hiringSpeed: 20 });
    expect(result.score).toBe(75);
    expect(result.contactEvidence).toBeNull();
    expect(result.speedEvidence).toBeNull();
  });
  it.each([[0, "<12h"], [12, "<24h"], [24, "<48h"], [48, "<72h"], [72, "72h+"]])("labels the %s-hour boundary as %s", (hours, band) => {
    expect(scoreRadar({ ...base, first_seen: new Date(now.getTime() - Number(hours) * 3600000).toISOString() }, now).freshnessBand).toBe(band);
  });
  it("never rewards legacy history or an old employer posting as fresh", () => {
    expect(scoreRadar({ ...base, first_seen_legacy: 1 }, now).components.freshness).toBe(0);
    const old = scoreRadar({ ...base, posted_at: "2026-09-01T00:00:00Z" }, now);
    expect(old.score).toBeLessThan(scoreRadar(base, now).score);
    expect(old.penalties[0].points).toBe(12);
  });
  it("retains unknown publication dates without claiming newly posted", () => {
    const result = scoreRadar({ ...base, posted_at: "" }, now);
    expect(result.unknowns.join(" ")).toContain("not a publication date");
  });
  it("excludes unresolved hard requirements and platform-only links from Apply Now", () => {
    expect(scoreRadar({ ...base, description: "Must have active security clearance" }, now).actionable).toBe(false);
    expect(scoreRadar({ ...base, application_url: "https://ca.indeed.com/viewjob?jk=123" }, now).actionable).toBe(false);
    expect(scoreRadar({ ...base, eligibility: "US only" }, now).actionable).toBe(false);
  });
  it("requires listing evidence for accessibility and hiring-speed bonuses", () => {
    const result = scoreRadar({ ...base, description: "Reports directly to Head of Content. Interviews next week." }, now);
    expect(result.components.accessibility).toBe(75);
    expect(result.components.hiringSpeed).toBe(80);
    expect(result.contactEvidence).toContain("Head of Content");
  });
  it("does not mistake office attendance for an accessible hiring team", () => {
    expect(scoreRadar({ ...base, description: "Commuter benefits for staff who report to the SF office." }, now).contactEvidence).toBeNull();
  });
  it("keeps overseas remote and student roles out of Apply Now", () => {
    expect(scoreRadar({ ...base, country: "India" }, now).actionable).toBe(false);
    expect(scoreRadar({ ...base, original_title: "Product Marketing Coordinator Co-op" }, now).actionable).toBe(false);
  });
  it("removes tracking while preserving requisition query identifiers", () => {
    expect(canonicalApplyUrl("https://jobs.example.com/apply?id=12&utm_source=x#top")).toBe("https://jobs.example.com/apply?id=12");
    expect(canonicalApplyUrl("javascript:alert(1)")).toBe("");
  });
});
