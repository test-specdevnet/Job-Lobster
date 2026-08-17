import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  PLATFORM_INGEST_AUDIENCE,
  verifyGitHubActionsOidc,
} from "../src/worker/github-oidc";

const now = new Date("2026-08-17T12:00:00.000Z");
let privateKey: CryptoKey;
let publicJwk: JsonWebKey;

function base64Url(value: string | ArrayBuffer) {
  const buffer = typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
  return buffer.toString("base64url");
}

async function token(overrides: Record<string, unknown> = {}) {
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  const header = { alg: "RS256", typ: "JWT", kid: "test-key" };
  const claims = {
    iss: "https://token.actions.githubusercontent.com",
    aud: PLATFORM_INGEST_AUDIENCE,
    repository: "test-specdevnet/Job-Lobster",
    repository_id: "1337201608",
    repository_visibility: "public",
    ref: "refs/heads/main",
    workflow_ref:
      "test-specdevnet/Job-Lobster/.github/workflows/platform-discovery.yml@refs/heads/main",
    runner_environment: "github-hosted",
    event_name: "workflow_dispatch",
    iat: nowSeconds - 5,
    nbf: nowSeconds - 5,
    exp: nowSeconds + 300,
    run_id: "123456789",
    run_attempt: "1",
    ...overrides,
  };
  const signingInput = base64Url(JSON.stringify(header)) + "." + base64Url(JSON.stringify(claims));
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return signingInput + "." + base64Url(signature);
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2_048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  privateKey = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockSigningKeys() {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({
    keys: [{ ...publicJwk, kid: "test-key", alg: "RS256", use: "sig" }],
  })));
}

describe("GitHub Actions OIDC ingestion identity", () => {
  it("accepts only the pinned workflow on the main branch", async () => {
    mockSigningKeys();
    await expect(verifyGitHubActionsOidc(await token(), now)).resolves.toMatchObject({
      runId: "123456789",
      runAttempt: "1",
      eventName: "workflow_dispatch",
    });
  });

  it("rejects a token from a different repository or branch", async () => {
    mockSigningKeys();
    await expect(
      verifyGitHubActionsOidc(await token({ repository_id: "999" }), now),
    ).rejects.toThrow(/repository identity/);
    await expect(
      verifyGitHubActionsOidc(await token({ ref: "refs/heads/feature" }), now),
    ).rejects.toThrow(/branch/);
  });
});
