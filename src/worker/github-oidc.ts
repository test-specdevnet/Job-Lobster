export const PLATFORM_INGEST_AUDIENCE = "job-lobster-platform-ingest";
const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks";
const EXPECTED_REPOSITORY = "test-specdevnet/Job-Lobster";
const EXPECTED_REPOSITORY_ID = "1337201608";
const EXPECTED_REF = "refs/heads/main";
const EXPECTED_WORKFLOW_REF =
  "test-specdevnet/Job-Lobster/.github/workflows/platform-discovery.yml@refs/heads/main";
const MAX_TOKEN_LENGTH = 16_384;

export interface VerifiedGitHubActionsIdentity {
  runId: string;
  runAttempt: string;
  workflowRef: string;
  eventName: "schedule" | "workflow_dispatch";
}

export class GitHubOidcError extends Error {}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GitHubOidcError(label + " is invalid.");
  }
  return value as Record<string, unknown>;
}

function claimString(claims: Record<string, unknown>, key: string): string {
  const value = claims[key];
  if (typeof value !== "string" || !value) {
    throw new GitHubOidcError("Missing GitHub OIDC claim: " + key + ".");
  }
  return value;
}

function base64UrlBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new GitHubOidcError("OIDC token encoding is invalid.");
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  let decoded: string;
  try {
    decoded = atob(padded);
  } catch {
    throw new GitHubOidcError("OIDC token encoding is invalid.");
  }
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function base64UrlJson(value: string, label: string): Record<string, unknown> {
  try {
    const decoded = new TextDecoder().decode(base64UrlBytes(value));
    return objectRecord(JSON.parse(decoded), label);
  } catch (error) {
    if (error instanceof GitHubOidcError) throw error;
    throw new GitHubOidcError(label + " is invalid.");
  }
}

function validateAudience(value: unknown): boolean {
  if (typeof value === "string") return value === PLATFORM_INGEST_AUDIENCE;
  return Array.isArray(value)
    && value.every((audience) => typeof audience === "string")
    && value.includes(PLATFORM_INGEST_AUDIENCE);
}

function numericDate(claims: Record<string, unknown>, key: string): number {
  const value = claims[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new GitHubOidcError("Missing GitHub OIDC claim: " + key + ".");
  }
  return value;
}

function validateClaims(claims: Record<string, unknown>, now: Date): VerifiedGitHubActionsIdentity {
  if (claimString(claims, "iss") !== GITHUB_OIDC_ISSUER) {
    throw new GitHubOidcError("OIDC issuer is not trusted.");
  }
  if (!validateAudience(claims.aud)) {
    throw new GitHubOidcError("OIDC audience is not trusted.");
  }
  if (claimString(claims, "repository").toLowerCase() !== EXPECTED_REPOSITORY.toLowerCase()) {
    throw new GitHubOidcError("OIDC repository is not trusted.");
  }
  if (claimString(claims, "repository_id") !== EXPECTED_REPOSITORY_ID) {
    throw new GitHubOidcError("OIDC repository identity is not trusted.");
  }
  if (claimString(claims, "repository_visibility") !== "public") {
    throw new GitHubOidcError("OIDC repository visibility is not trusted.");
  }
  if (claimString(claims, "ref") !== EXPECTED_REF) {
    throw new GitHubOidcError("OIDC branch is not trusted.");
  }
  const workflowRef = claimString(claims, "workflow_ref");
  if (workflowRef !== EXPECTED_WORKFLOW_REF) {
    throw new GitHubOidcError("OIDC workflow is not trusted.");
  }
  if (claimString(claims, "runner_environment") !== "github-hosted") {
    throw new GitHubOidcError("OIDC runner environment is not trusted.");
  }
  const eventName = claimString(claims, "event_name");
  if (eventName !== "schedule" && eventName !== "workflow_dispatch") {
    throw new GitHubOidcError("OIDC event is not trusted.");
  }

  const nowSeconds = Math.floor(now.getTime() / 1_000);
  const issuedAt = numericDate(claims, "iat");
  const notBefore = numericDate(claims, "nbf");
  const expiresAt = numericDate(claims, "exp");
  if (
    issuedAt > nowSeconds + 60
    || notBefore > nowSeconds + 60
    || expiresAt < nowSeconds - 30
    || expiresAt - issuedAt > 10 * 60
  ) {
    throw new GitHubOidcError("OIDC token is outside its validity window.");
  }

  const runId = claimString(claims, "run_id");
  const runAttempt = claimString(claims, "run_attempt");
  if (!/^\d{1,30}$/.test(runId) || !/^\d{1,6}$/.test(runAttempt)) {
    throw new GitHubOidcError("OIDC run identity is invalid.");
  }
  return { runId, runAttempt, workflowRef, eventName };
}

async function signingKey(kid: string): Promise<CryptoKey> {
  const response = await fetch(GITHUB_OIDC_JWKS_URL, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new GitHubOidcError("GitHub signing keys are unavailable.");
  }
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > 100_000) {
    throw new GitHubOidcError("GitHub signing-key response is too large.");
  }
  const body: unknown = await response.json();
  const keys = objectRecord(body, "GitHub signing-key response").keys;
  if (!Array.isArray(keys) || keys.length > 20) {
    throw new GitHubOidcError("GitHub signing-key response is invalid.");
  }
  const candidate = keys
    .map((key) => objectRecord(key, "GitHub signing key"))
    .find((key) => key.kid === kid && key.kty === "RSA" && key.alg === "RS256" && key.use === "sig");
  if (!candidate || typeof candidate.n !== "string" || typeof candidate.e !== "string") {
    throw new GitHubOidcError("OIDC signing key is not trusted.");
  }
  const jwk: JsonWebKey = {
    kty: "RSA",
    alg: "RS256",
    use: "sig",
    n: candidate.n,
    e: candidate.e,
    ext: true,
  };
  try {
    return await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    throw new GitHubOidcError("OIDC signing key could not be imported.");
  }
}

export async function verifyGitHubActionsOidc(
  token: string,
  now = new Date(),
): Promise<VerifiedGitHubActionsIdentity> {
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    throw new GitHubOidcError("OIDC token is missing or too large.");
  }
  const parts = token.split(".");
  if (parts.length !== 3) throw new GitHubOidcError("OIDC token is malformed.");
  const header = base64UrlJson(parts[0], "OIDC header");
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new GitHubOidcError("OIDC signing algorithm is not trusted.");
  }
  const claims = base64UrlJson(parts[1], "OIDC claims");
  const key = await signingKey(header.kid);
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlBytes(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1]),
  );
  if (!verified) throw new GitHubOidcError("OIDC signature is invalid.");
  return validateClaims(claims, now);
}
