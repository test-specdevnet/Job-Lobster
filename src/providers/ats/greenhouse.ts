import { decodeHtml, fetchJson } from "../http";
import { classifyWorkType, normalizeEmploymentType } from "../normalization/job-fields";
import type { AtsAdapter, AtsSource, ProviderPullResult } from "../types";

interface GreenhouseJob {
  id: number;
  internal_job_id?: number | null;
  title: string;
  company_name?: string;
  location?: { name?: string };
  absolute_url: string;
  first_published?: string;
  updated_at?: string;
  content?: string;
  departments?: Array<{ name?: string }>;
}

interface GreenhouseResponse {
  jobs?: GreenhouseJob[];
}

export const greenhouseAdapter: AtsAdapter = {
  async pull(source: AtsSource): Promise<ProviderPullResult> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.token)}/jobs?content=true`;
    const payload = await fetchJson<GreenhouseResponse>(url);
    const jobs = (payload.jobs ?? [])
      .filter((job) => job.id && job.title && job.absolute_url)
      .map((job) => {
        const description = decodeHtml(job.content ?? "");
        const locationText = job.location?.name ?? "";
        return {
          sourceId: source.id,
          provider: "greenhouse" as const,
          externalId: String(job.id),
          title: job.title,
          company: job.company_name?.trim() || source.name,
          companyWebsite: source.website ?? null,
          description,
          locationText,
          workType: classifyWorkType(null, locationText, description),
          eligibility: locationText || null,
          employmentType: normalizeEmploymentType(null, description),
          salary: null,
          postedAt: job.first_published ?? job.updated_at ?? "",
          sourceUrl: job.absolute_url,
          applicationUrl: job.absolute_url,
          industry: job.departments?.[0]?.name ?? null,
        };
      });
    return { source, jobs, pagesFetched: 1 };
  },
};
