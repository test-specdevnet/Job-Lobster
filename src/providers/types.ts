import type { EmploymentType, WorkType } from "../domain/job";

export type AtsProvider = "ashby" | "greenhouse" | "lever";
export type SourceScope = "core" | "daily";

export interface AtsSource {
  id: string;
  name: string;
  provider: AtsProvider;
  token: string;
  scope: SourceScope;
  website?: string;
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
  provider: AtsProvider;
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
