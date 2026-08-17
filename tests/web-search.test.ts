import { describe, expect, it } from "vitest";
import { parseRelativePostedAt } from "../src/providers/web-search";

describe("public web-search freshness", () => {
  const now = new Date("2026-08-17T12:00:00.000Z");

  it("preserves explicit platform posting dates", () => {
    expect(parseRelativePostedAt("2026-08-15", "2 days ago", now)).toBe(
      "2026-08-15T00:00:00.000Z",
    );
  });

  it("normalizes relative age labels from job-result cards", () => {
    expect(parseRelativePostedAt("", "Posted 3 days ago", now)).toBe(
      "2026-08-14T12:00:00.000Z",
    );
    expect(parseRelativePostedAt("", "5h", now)).toBe("2026-08-17T07:00:00.000Z");
    expect(parseRelativePostedAt("", "Just posted", now)).toBe(now.toISOString());
  });

  it("does not invent a posting date when a result has no age evidence", () => {
    expect(parseRelativePostedAt("", "Remote opportunity", now)).toBeNull();
  });
});
