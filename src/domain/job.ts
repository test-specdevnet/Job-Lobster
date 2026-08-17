import type { TargetTitle } from "../config/qualification";

export type WorkType = "remote" | "hybrid" | "onsite" | "unknown";
export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "temporary"
  | "internship"
  | "unknown";
export type SalaryStatus = "verified" | "estimated" | "unknown";
export type Freshness = "hot" | "fresh" | "fading";
export type QualificationStatus = "accepted" | "rejected";
export type RejectionReason =
  | "title_not_match"
  | "salary_below_threshold"
  | "salary_unknown"
  | "hybrid_location_not_allowed"
  | "onsite_location_not_allowed"
  | "work_type_unknown"
  | "posting_too_old"
  | "invalid_employment_type"
  | "duplicate"
  | "invalid_listing";

export interface JobLocation {
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface QualificationCandidate {
  originalTitle: string;
  workType: WorkType;
  location: Pick<JobLocation, "city" | "region" | "country">;
  employmentType: EmploymentType;
  salaryCadMin: number | null;
  salaryStatus: SalaryStatus;
  postedAt: string;
}

export interface QualificationDecision {
  status: QualificationStatus;
  normalizedTitle: TargetTitle | null;
  rejectionReason: RejectionReason | null;
  ageHours: number;
  freshness: Freshness;
}

export interface PublicJob {
  id: string;
  title: string;
  normalizedTitle: TargetTitle;
  company: string;
  companyWebsite: string | null;
  location: JobLocation;
  eligibility: string | null;
  workType: WorkType;
  employmentType: EmploymentType;
  salary: {
    currency: string | null;
    minimum: number | null;
    maximum: number | null;
    cadMinimum: number | null;
    cadMaximum: number | null;
    status: SalaryStatus;
  };
  postedAt: string;
  discoveredAt: string;
  ageHours: number;
  freshness: Freshness;
  source: string;
  applicationUrl: string;
  industry: string | null;
}
