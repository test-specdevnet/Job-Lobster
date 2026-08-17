import { QUALIFICATION_CONFIG, type TargetTitle } from "../config/qualification";
import { getAgeHours, getFreshness } from "../domain/qualification";
import type { EmploymentType, PublicJob, SalaryStatus, WorkType } from "../domain/job";

export interface JobRow {
  id: string;
  original_title: string;
  normalized_title: string;
  company: string;
  company_website: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  eligibility: string | null;
  work_type: WorkType;
  employment_type: EmploymentType;
  salary_min_original: number | null;
  salary_max_original: number | null;
  salary_currency: string | null;
  salary_min_cad: number | null;
  salary_max_cad: number | null;
  salary_status: SalaryStatus;
  posted_at: string;
  discovered_at: string;
  source: string;
  application_url: string;
  industry: string | null;
}

export function rowToPublicJob(row: JobRow, now = new Date()): PublicJob {
  const ageHours = getAgeHours(row.posted_at, now);
  return {
    id: row.id,
    title: row.original_title,
    normalizedTitle: row.normalized_title as TargetTitle,
    company: row.company,
    companyWebsite: row.company_website,
    location: {
      city: row.city,
      region: row.region,
      country: row.country,
      latitude: row.latitude,
      longitude: row.longitude,
    },
    eligibility: row.eligibility,
    workType: row.work_type,
    employmentType: row.employment_type,
    salary: {
      currency: row.salary_currency,
      minimum: row.salary_min_original,
      maximum: row.salary_max_original,
      cadMinimum: row.salary_min_cad,
      cadMaximum: row.salary_max_cad,
      status: row.salary_status,
    },
    postedAt: row.posted_at,
    discoveredAt: row.discovered_at,
    ageHours: Math.round(ageHours * 10) / 10,
    freshness: getFreshness(ageHours),
    source: row.source,
    applicationUrl: row.application_url,
    industry: row.industry,
  };
}

export const JOB_SELECT = `
  SELECT
    id, original_title, normalized_title, company, company_website,
    country, region, city, latitude, longitude, eligibility, work_type,
    employment_type, salary_min_original, salary_max_original,
    salary_currency, salary_min_cad, salary_max_cad, salary_status,
    posted_at, discovered_at, source, application_url, industry
  FROM jobs
`;

export interface JobFilters {
  title?: string;
  normalizedTitle?: string;
  location?: string;
  country?: string;
  region?: string;
  workType?: WorkType;
  minSalary?: number;
  maxAgeHours?: number;
  company?: string;
  postedSince?: string;
  limit: number;
}

function parsePositiveNumber(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function parseAgeToHours(value: string | null) {
  if (!value) return QUALIFICATION_CONFIG.maximumJobAgeDays * 24;
  const match = value.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(h|d)$/);
  if (!match) return QUALIFICATION_CONFIG.maximumJobAgeDays * 24;
  const hours = Number(match[1]) * (match[2] === "d" ? 24 : 1);
  return Math.min(hours, QUALIFICATION_CONFIG.maximumJobAgeDays * 24);
}

export function parseJobFilters(url: URL): JobFilters {
  const minSalary = parsePositiveNumber(url.searchParams.get("minSalary"));
  const rawWorkType = url.searchParams.get("workType")?.toLowerCase();
  const workType = ["remote", "hybrid", "onsite", "unknown"].includes(rawWorkType ?? "")
    ? (rawWorkType as WorkType)
    : undefined;
  const requestedLimit = parsePositiveNumber(url.searchParams.get("limit"));
  return {
    title: url.searchParams.get("title")?.trim() || undefined,
    normalizedTitle: url.searchParams.get("normalizedTitle")?.trim() || undefined,
    location: url.searchParams.get("location")?.trim() || undefined,
    country: url.searchParams.get("country")?.trim() || undefined,
    region: url.searchParams.get("region")?.trim() || undefined,
    workType,
    minSalary,
    maxAgeHours: parseAgeToHours(url.searchParams.get("maxAge")),
    company: url.searchParams.get("company")?.trim() || undefined,
    postedSince: url.searchParams.get("postedSince")?.trim() || undefined,
    limit: Math.max(1, Math.min(Math.floor(requestedLimit ?? 200), 500)),
  };
}

export function buildJobsQuery(filters: JobFilters, now = new Date()) {
  const clauses = ["qualification_status = 'accepted'", "status = 'active'", "latitude IS NOT NULL", "longitude IS NOT NULL"];
  const bindings: Array<string | number> = [];
  const maximumAge = Math.min(filters.maxAgeHours ?? 168, 168);
  let activeSince = new Date(now.getTime() - maximumAge * 3_600_000);
  if (filters.postedSince) {
    const requested = new Date(filters.postedSince);
    if (Number.isFinite(requested.getTime()) && requested > activeSince) activeSince = requested;
  }
  clauses.push("datetime(posted_at) >= datetime(?)");
  bindings.push(activeSince.toISOString());

  const likeFilters: Array<[string | undefined, string]> = [
    [filters.title, "original_title"], [filters.company, "company"],
    [filters.country, "country"], [filters.region, "region"],
  ];
  for (const [value, column] of likeFilters) {
    if (!value) continue;
    clauses.push(`LOWER(${column}) LIKE LOWER(?)`);
    bindings.push(`%${value}%`);
  }
  if (filters.normalizedTitle) {
    clauses.push("LOWER(normalized_title) = LOWER(?)");
    bindings.push(filters.normalizedTitle);
  }
  if (filters.location) {
    clauses.push("LOWER(COALESCE(city, '') || ' ' || COALESCE(region, '') || ' ' || COALESCE(country, '')) LIKE LOWER(?)");
    bindings.push(`%${filters.location}%`);
  }
  if (filters.workType) {
    clauses.push("work_type = ?");
    bindings.push(filters.workType);
  }
  if (filters.minSalary !== undefined) {
    clauses.push("salary_min_cad >= ?");
    bindings.push(filters.minSalary);
  }
  bindings.push(filters.limit);
  return { sql: `${JOB_SELECT} WHERE ${clauses.join(" AND ")} ORDER BY datetime(posted_at) DESC LIMIT ?`, bindings };
}
