import type { EmploymentType, WorkType } from "../domain/job";
import type {
  RawAtsJob,
  RawSalary,
  WebSearchProvider,
  WebSearchSource,
} from "./types";
import { WEB_SEARCH_SOURCES } from "./web-search";

export type ExternalPlatformProvider = Extract<WebSearchProvider, "indeed" | "linkedin">;

export const EXTERNAL_INGEST_MAX_JOBS = 100;
export const EXTERNAL_INGEST_MAX_BYTES = 2_000_000;
const MAX_EXTERNAL_JOB_AGE_MS = 8 * 24 * 3_600_000;
const MAX_COLLECTOR_AGE_MS = 24 * 3_600_000;

export interface ExternalPlatformBatch {
  provider: ExternalPlatformProvider;
  source: WebSearchSource;
  collector: string;
  collectedAt: string;
  batchIndex: number;
  totalBatches: number;
  searchesPerformed: number;
  searchesSucceeded: number;
  errors: string[];
  jobs: RawAtsJob[];
}

export class ExternalPayloadError extends Error {}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ExternalPayloadError(label + " must be an object.");
  }
  return value as Record<string, unknown>;
}

function boundedString(
  value: unknown,
  label: string,
  maximumLength: number,
  allowEmpty = false,
): string {
  if (typeof value !== "string") {
    throw new ExternalPayloadError(label + " must be a string.");
  }
  const cleaned = value.trim();
  if ((!allowEmpty && !cleaned) || cleaned.length > maximumLength) {
    throw new ExternalPayloadError(label + " has an invalid length.");
  }
  return cleaned;
}

function optionalString(value: unknown, label: string, maximumLength: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return boundedString(value, label, maximumLength);
}

function boundedInteger(value: unknown, label: string, maximum: number): number {
  if (!Number.isInteger(value) || typeof value !== "number" || value < 0 || value > maximum) {
    throw new ExternalPayloadError(label + " must be a bounded non-negative integer.");
  }
  return value;
}

function boundedNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10_000_000) {
    throw new ExternalPayloadError(label + " must be a bounded number.");
  }
  return value;
}

function httpsUrl(value: unknown, label: string, maximumLength = 2_048): URL {
  const raw = boundedString(value, label, maximumLength);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ExternalPayloadError(label + " must be a valid URL.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new ExternalPayloadError(label + " must be a credential-free HTTPS URL.");
  }
  return parsed;
}

function providerOwnsUrl(provider: ExternalPlatformProvider, url: URL): boolean {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (provider === "indeed") {
    return hostname === "indeed.com" || hostname.endsWith(".indeed.com");
  }
  return hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
}

function isoDate(value: unknown, label: string): string {
  const raw = boundedString(value, label, 64);
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) {
    throw new ExternalPayloadError(label + " must be an ISO date.");
  }
  return date.toISOString();
}

function parseSalary(value: unknown, label: string): RawSalary | null {
  if (value === null || value === undefined) return null;
  const input = record(value, label);
  const minimum = boundedNumber(input.minimum, label + ".minimum");
  const maximum = input.maximum === null || input.maximum === undefined
    ? null
    : boundedNumber(input.maximum, label + ".maximum");
  if (maximum !== null && maximum < minimum) {
    throw new ExternalPayloadError(label + ".maximum cannot be below minimum.");
  }
  const currencyValue = optionalString(input.currency, label + ".currency", 3);
  const currency = currencyValue?.toUpperCase() ?? null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    throw new ExternalPayloadError(label + ".currency must be a three-letter code.");
  }
  const interval = boundedString(input.interval, label + ".interval", 10);
  if (interval !== "year" && interval !== "hour" && interval !== "month") {
    throw new ExternalPayloadError(label + ".interval is not supported.");
  }
  return {
    minimum,
    maximum,
    currency,
    interval,
    evidence: boundedString(input.evidence, label + ".evidence", 500, true),
  };
}

function parseAddress(value: unknown, label: string): RawAtsJob["address"] {
  if (value === null || value === undefined) return undefined;
  const input = record(value, label);
  return {
    city: optionalString(input.city, label + ".city", 160),
    region: optionalString(input.region, label + ".region", 160),
    country: optionalString(input.country, label + ".country", 160),
  };
}

function parseWorkType(value: unknown, label: string): WorkType {
  const parsed = boundedString(value, label, 16);
  if (parsed !== "remote" && parsed !== "hybrid" && parsed !== "onsite" && parsed !== "unknown") {
    throw new ExternalPayloadError(label + " is not supported.");
  }
  return parsed;
}

function parseEmploymentType(value: unknown, label: string): EmploymentType {
  const parsed = boundedString(value, label, 24);
  if (
    parsed !== "full_time"
    && parsed !== "part_time"
    && parsed !== "contract"
    && parsed !== "temporary"
    && parsed !== "internship"
    && parsed !== "unknown"
  ) {
    throw new ExternalPayloadError(label + " is not supported.");
  }
  return parsed;
}

function parseJob(
  value: unknown,
  provider: ExternalPlatformProvider,
  source: WebSearchSource,
  index: number,
  now: Date,
): RawAtsJob {
  const label = "jobs[" + index + "]";
  const input = record(value, label);
  const sourceUrl = httpsUrl(input.sourceUrl, label + ".sourceUrl");
  if (!providerOwnsUrl(provider, sourceUrl)) {
    throw new ExternalPayloadError(label + ".sourceUrl does not belong to " + provider + ".");
  }
  const applicationUrl = httpsUrl(input.applicationUrl, label + ".applicationUrl");
  const companyWebsite = input.companyWebsite === null || input.companyWebsite === undefined
    ? null
    : httpsUrl(input.companyWebsite, label + ".companyWebsite").toString();
  const postedAt = isoDate(input.postedAt, label + ".postedAt");
  const postedTime = new Date(postedAt).getTime();
  if (postedTime < now.getTime() - MAX_EXTERNAL_JOB_AGE_MS || postedTime > now.getTime() + 6 * 3_600_000) {
    throw new ExternalPayloadError(label + ".postedAt is outside the current-job window.");
  }

  return {
    sourceId: source.id,
    provider,
    externalId: boundedString(input.externalId, label + ".externalId", 500),
    title: boundedString(input.title, label + ".title", 300),
    company: boundedString(input.company, label + ".company", 300),
    companyWebsite,
    description: boundedString(input.description, label + ".description", 50_000, true),
    locationText: boundedString(input.locationText, label + ".locationText", 500),
    address: parseAddress(input.address, label + ".address"),
    workType: parseWorkType(input.workType, label + ".workType"),
    eligibility: optionalString(input.eligibility, label + ".eligibility", 500),
    employmentType: parseEmploymentType(input.employmentType, label + ".employmentType"),
    salary: parseSalary(input.salary, label + ".salary"),
    postedAt,
    sourceUrl: sourceUrl.toString(),
    applicationUrl: applicationUrl.toString(),
    industry: optionalString(input.industry, label + ".industry", 300),
  };
}

export function parseExternalPlatformBatch(value: unknown, now = new Date()): ExternalPlatformBatch {
  const input = record(value, "payload");
  const provider = boundedString(input.provider, "provider", 16);
  if (provider !== "indeed" && provider !== "linkedin") {
    throw new ExternalPayloadError("provider must be indeed or linkedin.");
  }
  const source = WEB_SEARCH_SOURCES.find((candidate) => candidate.provider === provider);
  if (!source) throw new ExternalPayloadError("provider source is not configured.");

  const collectedAt = isoDate(input.collectedAt, "collectedAt");
  const collectedTime = new Date(collectedAt).getTime();
  if (collectedTime < now.getTime() - MAX_COLLECTOR_AGE_MS || collectedTime > now.getTime() + 5 * 60_000) {
    throw new ExternalPayloadError("collectedAt is outside the accepted window.");
  }

  const totalBatches = boundedInteger(input.totalBatches, "totalBatches", 20);
  if (totalBatches < 1) throw new ExternalPayloadError("totalBatches must be at least one.");
  const batchIndex = boundedInteger(input.batchIndex, "batchIndex", totalBatches - 1);
  const rawJobs = input.jobs;
  if (!Array.isArray(rawJobs) || rawJobs.length > EXTERNAL_INGEST_MAX_JOBS) {
    throw new ExternalPayloadError("jobs must be an array within the batch limit.");
  }
  const rawErrors = input.errors;
  if (!Array.isArray(rawErrors) || rawErrors.length > 20) {
    throw new ExternalPayloadError("errors must be a bounded array.");
  }

  return {
    provider,
    source,
    collector: boundedString(input.collector, "collector", 100),
    collectedAt,
    batchIndex,
    totalBatches,
    searchesPerformed: boundedInteger(input.searchesPerformed, "searchesPerformed", 100),
    searchesSucceeded: boundedInteger(input.searchesSucceeded, "searchesSucceeded", 100),
    errors: rawErrors.map((error, index) => boundedString(error, "errors[" + index + "]", 500)),
    jobs: rawJobs.map((job, index) => parseJob(job, provider, source, index, now)),
  };
}
