import { QUALIFICATION_CONFIG, type TargetTitle } from "../config/qualification";

const excludedRolePatterns = [
  /\bsoftware\b/,
  /\bengineer(?:ing)?\b/,
  /\bproduct manager\b/,
  /\bproduct marketing\b/,
  /\baccount manager\b/,
  /\bbusiness development\b/,
  /\bgraphic designer\b/,
  /\bsales manager\b/,
  /\bsocial media intern\b/,
  /\bpublic affairs\b/,
  /\binternal communications?\b/,
  /\bcontent designer\b/,
  /\btechnical writer\b/,
];

const titleRules: Array<[TargetTitle, RegExp[]]> = [
  ["SEO & GEO Manager", [/\b(?:seo\s*(?:&|and|\+)\s*geo|geo\s*(?:&|and|\+)\s*seo)\s+manager\b/]],
  ["AI Marketing Manager", [/\bai\s+marketing\s+manager\b/, /\bmarketing\s+manager[, -]+ai\b/]],
  ["AI Marketing Specialist", [/\bai\s+marketing\s+specialist\b/]],
  ["AI Content Strategist", [/\bai\s+content\s+strategist\b/]],
  ["Marketing Communications Manager", [/\bmarketing\s+(?:communications|comms)\s+manager\b/, /\bmarcom(?:m)?\s+manager\b/]],
  ["Content & Communications Manager", [/\bcontent\s*(?:&|and|\+)\s*(?:communications|comms)\s+manager\b/]],
  ["Growth & Content Manager", [/\bgrowth\s*(?:&|and|\+)\s*content\s+manager\b/]],
  ["Growth Marketing Manager", [/\bgrowth\s+marketing\s+manager\b/, /\bgrowth\s+manager\b/]],
  ["Digital Marketing Manager", [/\bdigital\s+marketing\s+manager\b/]],
  ["Content Marketing Manager", [/\bcontent\s+marketing\s+manager\b/]],
  ["Brand Marketing Manager", [/\bbrand\s+marketing\s+manager\b/]],
  ["Marketing Operations Manager", [/\bmarketing\s+(?:operations|ops)\s+manager\b/]],
  ["Strategic Marketing Manager", [/\bstrategic\s+marketing\s+manager\b/]],
  ["Creative Marketing Manager", [/\bcreative\s+marketing\s+manager\b/]],
  ["Business Marketing Manager", [/\bbusiness\s+marketing\s+manager\b/]],
  ["Content Strategy Manager", [/\bcontent\s+strateg(?:y|ies)\s+manager\b/]],
  ["SEO Manager", [
    /\bseo\s+manager\b/,
    /\bmanager\s+(?:of\s+)?seo\b/,
    /\bsearch engine optimization\s+manager\b/,
  ]],
  ["Digital Marketing Strategist", [/\bdigital\s+marketing\s+strategist\b/]],
  ["Growth Strategist", [/\bgrowth\s+strategist\b/]],
  ["Content Strategist", [/\bcontent\s+strategist\b/]],
  ["Content Marketing Specialist", [/\bcontent\s+marketing\s+specialist\b/]],
  ["Digital Marketing Specialist", [/\bdigital\s+marketing\s+specialist\b/]],
  ["Marketing Communications Specialist", [/\bmarketing\s+(?:communications|comms)\s+specialist\b/]],
  ["Digital Marketing Lead", [/\bdigital\s+marketing\s+lead\b/]],
  ["Content Marketing Lead", [/\bcontent\s+marketing\s+lead\b/]],
  ["Digital Growth Lead", [/\bdigital\s+growth\s+lead\b/]],
  ["Marketing Lead", [/\bmarketing\s+lead\b/]],
  ["Growth Lead", [/\bgrowth\s+lead\b/]],
  ["Head of Content", [/\bhead\s+of\s+content\b/]],
  ["Content Manager", [/\bcontent\s+manager\b/]],
  ["Marketing Manager", [/\bmarketing\s+manager\b/]],
];

const verticalFallbackRules: Array<[TargetTitle, RegExp[]]> = [
  ["Head of Content", [/\b(?:head|director|vice president|vp)\s+(?:of\s+)?content\b/, /\bcontent\s+(?:lead|director)\b/]],
  ["Growth Lead", [/\b(?:head|director|vice president|vp)\s+(?:of\s+)?growth\b/, /\bgrowth\s+(?:lead|director)\b/]],
  ["Marketing Lead", [
    /\b(?:head|director|vice president|vp|chief)\s+(?:of\s+)?marketing\b/,
    /\bmarketing\s+(?:lead|director)\b/,
  ]],
  ["Brand Marketing Manager", [/\bbrand\s+(?:manager|lead|director|strategist|specialist)\b/]],
  ["Brand Marketing Manager", [
    /\bbrand\s+(?:partnerships?|strategy)\s+(?:manager|lead|director|strategist|specialist)\b/,
    /\b(?:manager|lead|director|strategist|specialist)\b.*\bbrand\s+strategy\b/,
  ]],
  ["Growth Marketing Manager", [
    /\b(?:demand generation|demand gen|lifecycle|acquisition|performance|field|partner|channel|campaign|event)\s+marketing\s+(?:manager|lead|director|specialist)\b/,
    /\b(?:head|director|lead)\s+(?:of\s+)?(?:demand generation|demand gen|lifecycle|acquisition|performance|field|partner|channel|campaign|event)\s+marketing\b/,
    /\bgrowth\s+marketing\s+(?:lead|director|specialist|strategist)\b/,
    /\b(?:senior\s+)?paid\s+media\s+(?:manager|lead|director|specialist|strategist)\b/,
  ]],
  ["SEO Manager", [/\bseo\s+(?:lead|director|specialist|strategist)\b/, /\bsearch engine optimization\s+(?:lead|specialist|strategist)\b/]],
  ["Marketing Communications Manager", [/\b(?:communications|comms)\s+(?:manager|lead|director|strategist|specialist)\b/]],
  ["Content Marketing Specialist", [/\bcontent\s+(?:writer|editor|producer|specialist)\b/, /\bcontent\s+marketing\s+(?:writer|editor|producer|strategist)\b/]],
  ["Content Manager", [
    /\b(?:social media|editorial|creative content)\s+(?:manager|lead|director|strategist|specialist)\b/,
    /\b(?:manager|lead|director|strategist|specialist)\b.*\bsocial media\b/,
  ]],
  ["Digital Marketing Specialist", [
    /\bmarketing\s+(?:specialist|coordinator|analyst|strategist|associate)\b/,
    /\bdigital\s+marketing\s+(?:lead|director|coordinator|analyst)\b/,
  ]],
  ["Marketing Manager", [
    /\bmarketing\b.*\b(?:manager|lead|director|specialist|strategist|coordinator|analyst)\b/,
    /\b(?:manager|lead|director|specialist|strategist|coordinator|analyst)\b.*\bmarketing\b/,
  ]],
];

function canonicalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[()]/g, " ")
    .replace(/\b(?:senior|sr\.?|principal|staff|associate|junior|jr\.?|global|regional)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTitle(originalTitle: string): TargetTitle | null {
  const title = canonicalize(originalTitle);
  if (!title || excludedRolePatterns.some((pattern) => pattern.test(title))) return null;

  for (const [normalizedTitle, patterns] of titleRules) {
    if (patterns.some((pattern) => pattern.test(title))) return normalizedTitle;
  }

  for (const [normalizedTitle, patterns] of verticalFallbackRules) {
    if (patterns.some((pattern) => pattern.test(title))) return normalizedTitle;
  }

  return null;
}

export function isRelevantMarketingTitle(originalTitle: string) {
  const title = canonicalize(originalTitle);
  if (!title || excludedRolePatterns.some((pattern) => pattern.test(title))) return false;
  return /\bmarketing\b|\bcontent\b|\bseo\b|\bgrowth\b|\bcommunications?\b|\bcomms\b|\bbrand\b|\bmedia\b|\bdemand gen(?:eration)?\b|\blifecycle\b|\bacquisition\b/.test(title);
}

export function isTargetTitle(value: string): value is TargetTitle {
  return (QUALIFICATION_CONFIG.targetTitles as readonly string[]).includes(value);
}
