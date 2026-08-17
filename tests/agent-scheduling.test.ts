import { describe, expect, it } from "vitest";
import {
  CORE_REFRESH_CRON,
  DAILY_DEEP_SCRAPE_CRON,
  DAILY_WEB_SEARCH_CRON,
  SOURCE_BATCH_SIZE,
  SOURCE_BATCH_STAGGER_SECONDS,
} from "../src/worker/schedule-config";
import {
  ALL_ATS_SOURCES,
  CORE_ATS_SOURCES,
  DAILY_ATS_SOURCES,
  sourcesForRun,
} from "../src/providers/source-catalog";
import { WEB_SEARCH_SOURCES } from "../src/providers/web-search";

describe("autonomous discovery schedules", () => {
  it("owns daily ATS and public-web discovery while keeping the fast core refresh", () => {
    expect(DAILY_DEEP_SCRAPE_CRON).toBe("0 9 * * *");
    expect(DAILY_WEB_SEARCH_CRON).toBe("30 10 * * *");
    expect(CORE_REFRESH_CRON).toBe("7,37 * * * *");
    expect(WEB_SEARCH_SOURCES.map((source) => source.provider)).toEqual([
      "linkedin",
      "indeed",
      "glassdoor",
    ]);
  });

  it("separates the 32-source core from the expanded validated daily catalog", () => {
    expect(CORE_ATS_SOURCES).toHaveLength(32);
    expect(DAILY_ATS_SOURCES.length).toBeGreaterThanOrEqual(140);
    expect(ALL_ATS_SOURCES.length).toBeGreaterThanOrEqual(172);
    expect(sourcesForRun("core")).toBe(CORE_ATS_SOURCES);
    expect(sourcesForRun("daily")).toBe(DAILY_ATS_SOURCES);
    expect(sourcesForRun("full")).toEqual(ALL_ATS_SOURCES);
  });

  it("fans the deep catalog into bounded Worker invocations", () => {
    expect(SOURCE_BATCH_SIZE).toBe(12);
    expect(SOURCE_BATCH_STAGGER_SECONDS).toBeGreaterThanOrEqual(20);
    expect(Math.ceil(ALL_ATS_SOURCES.length / SOURCE_BATCH_SIZE)).toBe(16);
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
