import { describe, expect, it, vi } from "vitest";
vi.mock("agents", () => ({ getAgentByName: vi.fn() }));
import { handleApi } from "../src/worker/api";
describe("production radar access", () => {
  const env = { AGENT_INSTANCE_NAME: "production", RADAR_ACCESS_TOKEN: "radar-test", MANUAL_RUN_TOKEN: "legacy-test", JOB_LOBSTER_DB: { prepare: () => ({ all: async () => ({ results: [] }) }) } } as unknown as Env;
  it("accepts dedicated and existing tokens, rejecting missing and wrong tokens", async () => {
    for (const [token, status] of [["radar-test", 200], ["legacy-test", 200], ["wrong", 401], ["", 401]] as const) {
      const response = await handleApi(new Request("https://example.com/api/v1/radar", { headers: { authorization: `Bearer ${token}` } }), env);
      expect(response.status).toBe(status);
    }
  });
  it("does not allow the radar credential to trigger the legacy agent", async () => {
    const response = await handleApi(new Request("https://example.com/api/v1/agent/run", { method: "POST", headers: { authorization: "Bearer radar-test" } }), env);
    expect(response.status).toBe(401);
  });
});
