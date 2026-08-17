import { describe, expect, it } from "vitest";
import { CORE_REFRESH_CRON, DAILY_DEEP_SCRAPE_CRON } from "../src/worker/schedule-config";
import {
  ALL_ATS_SOURCES,
  CORE_ATS_SOURCES,
  DAILY_ATS_SOURCES,
  sourcesForRun,
} from "../src/providers/source-catalog";

describe("autonomous discovery schedules", () => {
  it("owns a daily 09:00 UTC deep scrape and keeps the fast core refresh", () => {
    expect(DAILY_DEEP_SCRAPE_CRON).toBe("0 9 * * *");
    expect(CORE_REFRESH_CRON).toBe("7,37 * * * *");
  });

  it("separates the 32-source core from 40 validated daily boards", () => {
    expect(CORE_ATS_SOURCES).toHaveLength(32);
    expect(DAILY_ATS_SOURCES).toHaveLength(40);
    expect(ALL_ATS_SOURCES).toHaveLength(72);
    expect(sourcesForRun("core")).toBe(CORE_ATS_SOURCES);
    expect(sourcesForRun("daily")).toBe(DAILY_ATS_SOURCES);
    expect(sourcesForRun("full")).toEqual(ALL_ATS_SOURCES);
  });

  it("keeps every provider token unique and every company URL public", () => {
    const ids = ALL_ATS_SOURCES.map((source) => source.id);
    const providerTokens = ALL_ATS_SOURCES.map((source) => `${source.provider}:${source.token.toLowerCase()}`);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(providerTokens).size).toBe(providerTokens.length);
    expect(ALL_ATS_SOURCES.every((source) => source.website?.startsWith("https://") || source.website === undefined)).toBe(true);
    expect(CORE_ATS_SOURCES.every((source) => source.scope === "core")).toBe(true);
    expect(DAILY_ATS_SOURCES.every((source) => source.scope === "daily")).toBe(true);
  });
});
