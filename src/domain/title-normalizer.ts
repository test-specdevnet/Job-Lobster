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
  ["SEO Manager", [/\bseo\s+manager\b/, /\bsearch engine optimization\s+manager\b/]],
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

  return null;
}

export function isTargetTitle(value: string): value is TargetTitle {
  return (QUALIFICATION_CONFIG.targetTitles as readonly string[]).includes(value);
}
