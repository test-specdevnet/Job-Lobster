import { classifyWorkType, normalizeEmploymentType } from "../normalization/job-fields";
import { fetchJson } from "../http";
import type { AtsAdapter, AtsSource, ProviderPullResult, RawSalary } from "../types";

interface AshbyCompensationComponent {
  compensationType?: string;
  interval?: string;
  currencyCode?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  summary?: string;
}

interface AshbyJob {
  id: string;
  title: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string;
  address?: { postalAddress?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } };
  jobUrl: string;
  applyUrl: string;
  descriptionPlain?: string;
  compensation?: {
    compensationTierSummary?: string;
    summaryComponents?: AshbyCompensationComponent[];
    compensationTiers?: Array<{ components?: AshbyCompensationComponent[] }>;
  };
}

interface AshbyResponse {
  jobs?: AshbyJob[];
}

function interval(value: string | undefined): RawSalary["interval"] {
  if (/hour/i.test(value ?? "")) return "hour";
  if (/month/i.test(value ?? "")) return "month";
  return "year";
}

function salaryFor(job: AshbyJob): RawSalary | null {
  const components = [
    ...(job.compensation?.summaryComponents ?? []),
    ...(job.compensation?.compensationTiers ?? []).flatMap((tier) => tier.components ?? []),
  ].filter((component) => component.compensationType === "Salary" && typeof component.minValue === "number");
  if (!components.length) return null;

  const preferredCurrency = /canada/i.test(job.location ?? "") ? "CAD" : /united states|\busa\b|\bus\b/i.test(job.location ?? "") ? "USD" : null;
  const component = components.find((item) => item.currencyCode === preferredCurrency) ?? components[0];
  return {
    minimum: component.minValue as number,
    maximum: component.maxValue ?? null,
    currency: component.currencyCode ?? null,
    interval: interval(component.interval),
    evidence: component.summary ?? job.compensation?.compensationTierSummary ?? "Structured Ashby compensation",
  };
}

export const ashbyAdapter: AtsAdapter = {
  async pull(source: AtsSource): Promise<ProviderPullResult> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(source.token)}?includeCompensation=true`;
    const payload = await fetchJson<AshbyResponse>(url);
    const jobs = (payload.jobs ?? [])
      .filter((job) => job.isListed !== false && job.id && job.title && job.jobUrl && job.applyUrl)
      .map((job) => {
        const description = job.descriptionPlain ?? "";
        const postalAddress = job.address?.postalAddress;
        return {
          sourceId: source.id,
          provider: "ashby" as const,
          externalId: job.id,
          title: job.title,
          company: source.name,
          companyWebsite: source.website ?? null,
          description,
          locationText: job.location ?? "",
          address: {
            city: postalAddress?.addressLocality ?? null,
            region: postalAddress?.addressRegion ?? null,
            country: postalAddress?.addressCountry ?? null,
          },
          workType: classifyWorkType(job.workplaceType ?? (job.isRemote ? "remote" : null), job.location ?? "", description),
          eligibility: job.location ?? null,
          employmentType: normalizeEmploymentType(job.employmentType, description),
          salary: salaryFor(job),
          postedAt: job.publishedAt ?? "",
          sourceUrl: job.jobUrl,
          applicationUrl: job.applyUrl,
          industry: job.department ?? job.team ?? null,
        };
      });
    return { source, jobs, pagesFetched: 1 };
  },
};
