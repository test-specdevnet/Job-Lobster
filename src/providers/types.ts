import type { EmploymentType, WorkType } from "../domain/job";

export type AtsProvider = "ashby" | "greenhouse" | "lever";
export type WebSearchProvider = "linkedin" | "indeed" | "glassdoor";
export type JobProvider = AtsProvider | WebSearchProvider;
export type SourceScope = "core" | "daily";

export interface DiscoverySource {
  id: string;
  name: string;
  provider: JobProvider;
  token: string;
  scope: SourceScope;
  website?: string;
}

export interface AtsSource extends DiscoverySource {
  provider: AtsProvider;
}

export interface WebSearchSource extends DiscoverySource {
  provider: WebSearchProvider;
}

export interface RawSalary {
  minimum: number;
  maximum: number | null;
  currency: string | null;
  interval: "year" | "hour" | "month";
  evidence: string;
}

export interface RawAtsJob {
  sourceId: string;
  provider: JobProvider;
  externalId: string;
  title: string;
  company: string;
  companyWebsite: string | null;
  description: string;
  locationText: string;
  address?: {
    city?: string | null;
    region?: string | null;
    country?: string | null;
  };
  workType: WorkType;
  eligibility: string | null;
  employmentType: EmploymentType;
  salary: RawSalary | null;
  postedAt: string;
  sourceUrl: string;
  applicationUrl: string;
  industry: string | null;
}

export interface ProviderPullResult {
  source: AtsSource;
  jobs: RawAtsJob[];
  pagesFetched: number;
}

export interface AtsAdapter {
  pull(source: AtsSource): Promise<ProviderPullResult>;
}
