// The resume's earliest dated marketing role is a 2020 internship; its named
// management role starts May 2025. These are conservative review thresholds,
// not claims that every intervening year was full-time relevant experience.
export function experienceGaps(description: string): string[] {
  const gaps = new Set<string>();
  for (const line of description.split(/[\n.!?]/)) {
    const match = line.match(/\b(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b[^\n.!?]{0,180}/i);
    if (!match || !/experience|leadership|management|marketing|analytics|operations/i.test(match[0])) continue;
    const prefix = line.slice(Math.max(0, match.index! - 45), match.index);
    if (/\b(?:preferred|ideally|nice to have|bonus)\s*[:,-]?\s*$/i.test(prefix) || /years? (?:of )?experience (?:is )?preferred/i.test(match[0])) continue;
    const years = Number(match[1]);
    const peopleLeadership = /people leadership|people management|managing (?:a )?team|manag(?:ing|ement of) (?:direct reports|people)/i.test(match[0]);
    if (years > 6 || (peopleLeadership && years > 2)) gaps.add(match[0].trim());
  }
  return [...gaps];
}

export function specialistSkillGaps(description: string): string[] {
  return description.split(/[\n.!?]/).map(line => line.trim()).filter(line =>
    /\b(?:expert[- ]level|advanced)\s+SQL\b/i.test(line) &&
    !/\bpreferred|nice to have|a plus|an asset\b/i.test(line),
  ).map(line => line.slice(0, 240));
}
