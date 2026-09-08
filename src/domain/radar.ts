import { getAgeHours } from "./qualification";
import { experienceGaps, specialistSkillGaps } from "./requirements";

export const PIPELINE_STAGES = ["New", "Apply Now", "Applied", "Human Contact Found", "Outreach Sent", "Follow-Up Due", "Interview", "Closed"] as const;
export type PipelineStage = typeof PIPELINE_STAGES[number];
export function isPipelineStage(value: unknown): value is PipelineStage {
  return typeof value === "string" && (PIPELINE_STAGES as readonly string[]).includes(value);
}
export function canonicalApplyUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|source|ref|referrer|gh_src|lever-source|lever-origin|src)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "");
  } catch { return ""; }
}
export function directEmployerUrl(value: string) {
  const url = canonicalApplyUrl(value);
  if (!url) return null;
  const host = new URL(url).hostname;
  return /(^|\.)(linkedin\.com|indeed\.[a-z.]+|glassdoor\.[a-z.]+|ziprecruiter\.com|jooble\.org)$/i.test(host) ? null : url;
}
export interface RadarInput {
  original_title: string; description?: string | null; company: string;
  industry: string | null; first_seen?: string | null; first_seen_legacy?: number;
  posted_at: string; application_url: string; work_type?: string; country?: string | null;
  region?: string | null; eligibility?: string | null; source_count?: number;
}
export function scoreRadar(job: RadarInput, now = new Date()) {
  const title = job.original_title;
  const text = `${title}\n${job.description ?? ""}\n${job.industry ?? ""}`;
  const firstSeenAge = job.first_seen ? getAgeHours(job.first_seen, now) : Infinity;
  const postedAge = job.posted_at ? getAgeHours(job.posted_at, now) : null;
  const legacy = Boolean(job.first_seen_legacy) || !job.first_seen;
  const effectiveAge = Math.max(firstSeenAge, postedAge ?? 0);
  const freshnessBand = legacy ? "legacy" : firstSeenAge < 12 ? "<12h" : firstSeenAge < 24 ? "<24h" : firstSeenAge < 48 ? "<48h" : firstSeenAge < 72 ? "<72h" : "72h+";
  const reasons: string[] = [];
  const unknowns = ["Hiring timeline is unverified.", "Named recruiter or hiring manager is not verified."];
  const penalties: { reason: string; points: number }[] = [];
  let fit = /content|growth|product marketing|technical marketing|developer marketing|solutions marketing|demand gen|seo|digital marketing|ai marketing/i.test(title) ? 60 : 35;
  if (/content|seo|aeo|geo|editorial/i.test(text)) { fit += 15; reasons.push("SEO/AEO and editorial fit: grew InFlux to 45K+ monthly website visitors; 300+ published articles."); }
  if (/ai\b|artificial intelligence|cloud|fintech|cybersecurity|developer|infrastructure|saas/i.test(text)) { fit += 15; reasons.push("Technical storytelling: FluxCloud Flight Simulator reached 8,500+ users; AI and cloud product messaging experience."); }
  if (/growth|audience|social|campaign|acquisition/i.test(text)) { fit += 10; reasons.push("Audience growth: 200K+ organic views and 1.9M monthly media views."); }
  if (!reasons.length) reasons.push("Marketing experience is relevant; review the responsibilities against the resume.");
  const resumeTrack = /product|technical marketing|developer marketing|solutions marketing/i.test(title) ? "Product/Technical Marketing" : /growth|demand|digital marketing|operations|performance/i.test(title) ? "Growth/Demand" : "Content/Technical Content";
  const directApplyUrl = directEmployerUrl(job.application_url);
  const contactSnippet = (job.description ?? "").match(/[^.!?\n]{0,100}\b(?:report(?:s|ing)? (?:directly )?to|hiring manager|contact our recruiting)[^.!?\n]{0,120}/i)?.[0]?.trim() ?? null;
  const contactEvidence = contactSnippet && /\b(head|director|manager|lead|vp|vice president|chief|recruiting)\b/i.test(contactSnippet) ? contactSnippet : null;
  const speedEvidence = (job.description ?? "").match(/[^.!?\n]{0,70}\b(?:immediate start|start within (?:two|2) weeks|interviews? (?:this|next) week|urgent(?:ly)? hiring)[^.!?\n]{0,70}/i)?.[0]?.trim() ?? null;
  const accessibility = contactEvidence ? 75 : directApplyUrl ? 35 : 10;
  const hiringSpeed = speedEvidence ? 80 : 20;
  const freshness = legacy ? 0 : effectiveAge < 12 ? 100 : effectiveAge < 24 ? 90 : effectiveAge < 48 ? 70 : effectiveAge < 72 ? 45 : 10;
  if (effectiveAge > 72) penalties.push({ reason: "Observed or published more than 72 hours ago", points: 12 });
  if (/^(google|amazon|microsoft|meta|apple|ibm|oracle|salesforce)$/i.test(job.company.trim())) penalties.push({ reason: "Mega-enterprise hiring-speed heuristic; actual process unknown", points: 8 });
  if ((job.source_count ?? 1) >= 3) penalties.push({ reason: `Seen across ${job.source_count} sources; heavy syndication`, points: 8 });
  const hardMismatch = (job.description ?? "").match(/(?:must|require[ds]?)[^.\n]{0,90}(?:active (?:security clearance|ts\/sci)|u\.?s\.? citizenship|us citizen)/i)?.[0];
  if (hardMismatch) penalties.push({ reason: `Hard requirement absent from resume: “${hardMismatch}” — verify eligibility`, points: 35 });
  const experienceRequirements = experienceGaps(job.description ?? "");
  if (experienceRequirements.length) penalties.push({ reason: `Required experience is not established by the dated resume: “${experienceRequirements[0]}”. Review before applying.`, points: 25 });
  const specialistRequirements = specialistSkillGaps(job.description ?? "");
  if (specialistRequirements.length) penalties.push({ reason: `Specialist requirement not established by the resume: “${specialistRequirements[0]}”. Verify proficiency before applying.`, points: 25 });
  if (/\bbusiness systems analyst|salesforce (?:architect|administrator)|marketing analytics\b/i.test(title)) penalties.push({ reason: "Specialized systems or analytics career track is not established by the resume; review technical requirements", points: 25 });
  const eligibility = job.eligibility ?? "";
  const canadaEligible = /canada|worldwide|global|anywhere/i.test(`${job.country ?? ""} ${eligibility}`);
  if (job.work_type === "remote" && job.country && !canadaEligible) penalties.push({ reason: "Remote role is listed outside Canada; Canadian work eligibility is unverified", points: 25 });
  if (job.work_type !== "remote" && !/ontario|^on$/i.test(job.region ?? "")) penalties.push({ reason: "Office location is outside Ontario or unresolved; verify location and work authorization", points: 25 });
  if (/\b(?:intern(?:ship)?|co[ -]?op|student)\b/i.test(title)) penalties.push({ reason: "Student or internship eligibility is not established by the resume", points: 40 });
  if (/\b(?:vp|vice president|chief|head of|group product)\b/i.test(title)) penalties.push({ reason: "Leadership scope may exceed demonstrated management experience; review requirements", points: 15 });
  if (job.work_type === "remote" && /\b(?:us only|united states only|must (?:reside|be based) in (?:the )?(?:us|united states))\b/i.test(`${eligibility} ${job.description ?? ""}`)) penalties.push({ reason: "US-only remote eligibility is not established by the resume", points: 35 });
  if (!job.country || /worldwide|unknown/i.test(job.country)) unknowns.push("Geographic work eligibility is unverified; confirm that the employer can hire in Canada.");
  if (!job.posted_at) unknowns.push("Employer posting date unavailable; first seen is an observation, not a publication date.");
  if (legacy) unknowns.push("Legacy observation history: freshness bonus disabled.");
  if (!directApplyUrl) unknowns.push("Direct employer application URL not found; resolve before applying.");
  const components = { fit: Math.min(fit, 100), freshness, accessibility, hiringSpeed };
  const score = Math.round(Math.max(0, components.fit * .4 + freshness * .25 + accessibility * .2 + hiringSpeed * .15 - penalties.reduce((sum, p) => sum + p.points, 0)));
  return { score, components, weights: { fit: 40, freshness: 25, accessibility: 20, hiringSpeed: 15 }, firstSeen: job.first_seen ?? null, firstSeenAgeHours: Number.isFinite(firstSeenAge) ? Math.round(firstSeenAge * 10) / 10 : null, freshnessBand, legacy, directApplyUrl, reasons, penalties, unknowns, resumeTrack, contactEvidence, speedEvidence,
    outreachAction: contactEvidence ? `Verify the team contact described in the listing: “${contactEvidence}”. Use one relevant portfolio proof in a short note.` : `Find ${job.company}'s content or marketing team lead through the employer's team/careers page; verify their role before outreach.`,
    actionable: Boolean(directApplyUrl) && score >= 30 && !hardMismatch && !penalties.some(p => p.points >= 25),
  };
}
