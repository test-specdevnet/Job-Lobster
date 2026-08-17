import { QUALIFICATION_CONFIG } from "../config/qualification";
import type {
  Freshness,
  QualificationCandidate,
  QualificationDecision,
  RejectionReason,
} from "./job";
import { normalizeTitle } from "./title-normalizer";

const countryAliases: Record<string, string> = {
  ca: "canada",
  canada: "canada",
  us: "united states",
  usa: "united states",
  "u.s.": "united states",
  "united states of america": "united states",
  "united states": "united states",
};

const regionAliases: Record<string, string> = {
  on: "ontario",
  ont: "ontario",
  ontario: "ontario",
  fl: "florida",
  florida: "florida",
  ny: "new york",
  "new york state": "new york",
  "new york": "new york",
};

function clean(value: string | null) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCountry(value: string | null) {
  const cleaned = clean(value);
  return countryAliases[cleaned] ?? cleaned;
}

function normalizeRegion(value: string | null) {
  const cleaned = clean(value);
  return regionAliases[cleaned] ?? cleaned;
}

function locationMatches(
  location: QualificationCandidate["location"],
  allowed: { country: string; region: string; city?: string },
) {
  if (normalizeCountry(location.country) !== normalizeCountry(allowed.country)) return false;
  if (normalizeRegion(location.region) !== normalizeRegion(allowed.region)) return false;
  return allowed.city === undefined || clean(location.city) === clean(allowed.city);
}

export function getAgeHours(postedAt: string, now = new Date()) {
  const normalizedTimestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(postedAt)
    ? `${postedAt.replace(" ", "T")}Z`
    : postedAt;
  const postedTime = new Date(normalizedTimestamp).getTime();
  if (!Number.isFinite(postedTime)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - postedTime) / 3_600_000);
}

export function getFreshness(ageHours: number): Freshness {
  if (ageHours <= 24) return "hot";
  if (ageHours <= QUALIFICATION_CONFIG.decayStartHours) return "fresh";
  return "fading";
}

function reject(
  normalizedTitle: QualificationDecision["normalizedTitle"],
  rejectionReason: RejectionReason,
  ageHours: number,
): QualificationDecision {
  return {
    status: "rejected",
    normalizedTitle,
    rejectionReason,
    ageHours,
    freshness: getFreshness(ageHours),
  };
}

export function qualifyJob(
  candidate: QualificationCandidate,
  now = new Date(),
  normalizedTitleOverride?: QualificationDecision["normalizedTitle"],
): QualificationDecision {
  const ageHours = getAgeHours(candidate.postedAt, now);
  const normalizedTitle = normalizedTitleOverride ?? normalizeTitle(candidate.originalTitle);

  if (!normalizedTitle) return reject(null, "title_not_match", ageHours);

  if (["internship", "temporary"].includes(candidate.employmentType)) {
    return reject(normalizedTitle, "invalid_employment_type", ageHours);
  }

  if (candidate.workType === "hybrid") {
    const allowed = QUALIFICATION_CONFIG.hybridRegions.some((region) =>
      locationMatches(candidate.location, region),
    );
    if (!allowed) return reject(normalizedTitle, "hybrid_location_not_allowed", ageHours);
  } else if (candidate.workType === "onsite") {
    const allowed = QUALIFICATION_CONFIG.onsiteCities.some((location) =>
      locationMatches(candidate.location, location),
    );
    if (!allowed) return reject(normalizedTitle, "onsite_location_not_allowed", ageHours);
  } else if (candidate.workType === "unknown") {
    return reject(normalizedTitle, "work_type_unknown", ageHours);
  }

  if (candidate.salaryCadMin === null || candidate.salaryStatus === "unknown") {
    if (!QUALIFICATION_CONFIG.includeUnknownSalary) {
      return reject(normalizedTitle, "salary_unknown", ageHours);
    }
  } else if (candidate.salaryCadMin < QUALIFICATION_CONFIG.minimumSalaryCad) {
    return reject(normalizedTitle, "salary_below_threshold", ageHours);
  }

  if (ageHours > QUALIFICATION_CONFIG.maximumJobAgeDays * 24) {
    return reject(normalizedTitle, "posting_too_old", ageHours);
  }

  return {
    status: "accepted",
    normalizedTitle,
    rejectionReason: null,
    ageHours,
    freshness: getFreshness(ageHours),
  };
}
