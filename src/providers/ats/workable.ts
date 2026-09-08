import { decodeHtml, fetchJson } from "../http";
import { classifyWorkType, normalizeEmploymentType } from "../normalization/job-fields";
import type { AtsAdapter } from "../types";

interface WorkableJob {
  shortcode: string; title: string; url: string; application_url?: string;
  description?: string; requirements?: string; benefits?: string; published_on?: string;
  employment_type?: string; department?: string;
  location?: { city?: string; region?: string; country?: string; location_str?: string; telecommuting?: boolean };
}
export const workableAdapter: AtsAdapter = {
  async pull(source) {
    const payload = await fetchJson<{ jobs: WorkableJob[] }>(`https://www.workable.com/api/accounts/${encodeURIComponent(source.token)}?details=true`);
    if (!Array.isArray(payload.jobs)) throw new Error("Workable returned an incompatible board.");
    return { source, pagesFetched: 1, jobs: payload.jobs.filter(j => j.shortcode && j.title && j.url).map(j => {
      const description = decodeHtml([j.description, j.requirements, j.benefits].filter(Boolean).join("\n"));
      const locationText = j.location?.location_str ?? [j.location?.city, j.location?.region, j.location?.country].filter(Boolean).join(", ");
      return { sourceId: source.id, provider: "workable" as const, externalId: j.shortcode,
        title: j.title, company: source.name, companyWebsite: source.website ?? null,
        description, locationText, address: j.location,
        workType: classifyWorkType(j.location?.telecommuting ? "remote" : null, locationText, description),
        eligibility: locationText || null, employmentType: normalizeEmploymentType(j.employment_type, description),
        salary: null, postedAt: j.published_on ?? "", sourceUrl: j.url,
        applicationUrl: j.application_url ?? j.url, industry: j.department ?? null };
    }) };
  },
};
