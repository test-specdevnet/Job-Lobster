import { afterEach, describe, expect, it, vi } from "vitest";
import { workableAdapter } from "../src/providers/ats/workable";
import { smartRecruitersAdapter } from "../src/providers/ats/smartrecruiters";
import { RADAR_WATCHLIST } from "../src/providers/watchlist";
afterEach(() => vi.unstubAllGlobals());
describe("direct-employer radar feeds", () => {
  it("normalizes Workable public jobs and leaves missing publication dates unknown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ jobs: [{ shortcode: "abc", title: "Content Strategist", url: "https://apply.workable.com/j/abc", description: "<p>AI content</p>", location: { country: "Canada", telecommuting: true } }] }))));
    const result = await workableAdapter.pull({ id: "test", name: "Example", provider: "workable", token: "example", scope: "core" });
    expect(result.jobs[0]).toMatchObject({ externalId: "abc", postedAt: "", description: "AI content", applicationUrl: "https://apply.workable.com/j/abc", workType: "remote" });
  });
  it("retrieves SmartRecruiters detail only for relevant titles and constructs trusted detail URLs", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ content: [{ id: "a", name: "Content Strategist" }, { id: "b", name: "Software Engineer" }], totalFound: 2 }))).mockResolvedValueOnce(new Response(JSON.stringify({ id: "a", name: "Content Strategist", releasedDate: "2026-09-08", location: { country: "CA", remote: true }, jobAd: { sections: { jobDescription: { text: "<p>SEO strategy</p>" } } } })));
    vi.stubGlobal("fetch", fetcher);
    const result = await smartRecruitersAdapter.pull({ id: "test", name: "Example", provider: "smartrecruiters", token: "example", scope: "core" });
    expect(result.jobs).toHaveLength(1); expect(result.pagesFetched).toBe(2);
    expect(fetcher.mock.calls[1][0]).toBe("https://api.smartrecruiters.com/v1/companies/example/postings/a");
    expect(result.jobs[0].description).toBe("SEO strategy");
  });
  it("maintains a 140-employer shortlist with Ontario, agency and technical employers", () => {
    expect(RADAR_WATCHLIST).toHaveLength(140);
    expect(new Set(RADAR_WATCHLIST.map(s => s.name.toLowerCase())).size).toBe(140);
    for (const name of ["Cohere", "Cloudflare", "1Password", "Jordan Digital Marketing", "PointClickCare"]) expect(RADAR_WATCHLIST.some(s => s.name === name)).toBe(true);
  });
});
