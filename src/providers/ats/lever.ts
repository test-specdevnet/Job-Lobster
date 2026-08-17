import { decodeHtml, fetchJson } from "../http";
import { classifyWorkType, normalizeEmploymentType } from "../normalization/job-fields";
import type { AtsAdapter, AtsSource, ProviderPullResult, RawSalary } from "../types";

interface LeverPosting {
  id: string;
  text: string;
  createdAt?: number;
  country?: string | null;
  categories?: { location?: string; commitment?: string; department?: string };
  descriptionPlain?: string;
  description?: string;
  additionalPlain?: string;
  hostedUrl: string;
  applyUrl: string;
  workplaceType?: string;
  salaryRange?: { currency?: string; interval?: string; min?: number; max?: number };
  salaryDescriptionPlain?: string;
}

function salaryFor(posting: LeverPosting): RawSalary | null {
  const range = posting.salaryRange;
  if (!range || typeof range.min !== "number") return null;
  const rawInterval = range.interval?.toLowerCase() ?? "";
  return {
    minimum: range.min,
    maximum: typeof range.max === "number" ? range.max : null,
    currency: range.currency ?? null,
    interval: rawInterval.includes("hour") ? "hour" : rawInterval.includes("month") ? "month" : "year",
    evidence: posting.salaryDescriptionPlain ?? "Structured Lever compensation",
  };
}

export const leverAdapter: AtsAdapter = {
  async pull(source: AtsSource): Promise<ProviderPullResult> {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(source.token)}?mode=json`;
    const payload = await fetchJson<LeverPosting[]>(url);
    const jobs = payload.filter((job) => job.id && job.text && job.hostedUrl && job.applyUrl).map((job) => {
      const description = job.descriptionPlain ?? decodeHtml(job.description ?? "") + `\n${job.additionalPlain ?? ""}`;
      const locationText = job.categories?.location ?? "";
      return {
        sourceId: source.id,
        provider: "lever" as const,
        externalId: job.id,
        title: job.text,
        company: source.name,
        companyWebsite: source.website ?? null,
        description,
        locationText,
        address: { country: job.country ?? null },
        workType: classifyWorkType(job.workplaceType, locationText, description),
        eligibility: locationText || null,
        employmentType: normalizeEmploymentType(job.categories?.commitment, description),
        salary: salaryFor(job),
        postedAt: typeof job.createdAt === "number" ? new Date(job.createdAt).toISOString() : "",
        sourceUrl: job.hostedUrl,
        applicationUrl: job.applyUrl,
        industry: job.categories?.department ?? null,
      };
    });
    return { source, jobs, pagesFetched: 1 };
  },
};
