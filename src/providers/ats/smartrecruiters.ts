import { decodeHtml, fetchJson } from "../http";
import { isRelevantMarketingTitle } from "../../domain/title-normalizer";
import { classifyWorkType, normalizeEmploymentType } from "../normalization/job-fields";
import type { AtsAdapter, RawAtsJob } from "../types";
interface Posting {
  id: string; name: string; releasedDate?: string; applyUrl?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean };
  typeOfEmployment?: { label?: string }; department?: { label?: string };
  jobAd?: { sections?: Record<string, { text?: string }> };
}
export const smartRecruitersAdapter: AtsAdapter = {
  async pull(source) {
    const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(source.token)}/postings`;
    const jobs: RawAtsJob[] = [];
    let pagesFetched = 0;
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = await fetchJson<{ content: Posting[]; totalFound: number }>(`${base}?limit=100&offset=${offset}`);
      pagesFetched++;
      if (!Array.isArray(page.content)) throw new Error("SmartRecruiters returned an incompatible board.");
      for (const summary of page.content.filter(p => isRelevantMarketingTitle(p.name))) {
        const p = await fetchJson<Posting>(`${base}/${encodeURIComponent(summary.id)}`);
        pagesFetched++;
        const description = decodeHtml(Object.values(p.jobAd?.sections ?? {}).map(s => s.text ?? "").join("\n"));
        const locationText = [p.location?.city, p.location?.region, p.location?.country].filter(Boolean).join(", ");
        const sourceUrl = `https://jobs.smartrecruiters.com/${encodeURIComponent(source.token)}/${encodeURIComponent(p.id)}`;
        jobs.push({ sourceId: source.id, provider: "smartrecruiters", externalId: p.id, title: p.name,
          company: source.name, companyWebsite: source.website ?? null, description, locationText, address: p.location,
          workType: classifyWorkType(p.location?.remote ? "remote" : null, locationText, description), eligibility: locationText || null,
          employmentType: normalizeEmploymentType(p.typeOfEmployment?.label, description), salary: null,
          postedAt: p.releasedDate ?? "", sourceUrl, applicationUrl: p.applyUrl ?? sourceUrl, industry: p.department?.label ?? null });
      }
      if (offset + page.content.length >= page.totalFound || !page.content.length) return { source, jobs, pagesFetched };
    }
    throw new Error("SmartRecruiters board exceeded 1,000 postings; split the source before ingestion.");
  },
};
