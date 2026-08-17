import type { EmploymentType, JobLocation, WorkType } from "../../domain/job";

const regionNames: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  ON: "Ontario", QC: "Quebec", BC: "British Columbia", AB: "Alberta", MB: "Manitoba",
  SK: "Saskatchewan", NS: "Nova Scotia", NB: "New Brunswick", NL: "Newfoundland and Labrador",
};

const cityCoordinates: Array<[RegExp, number, number, string, string, string]> = [
  [/\btoronto\b/i, 43.6532, -79.3832, "Toronto", "Ontario", "Canada"],
  [/\bhamilton\b/i, 43.2557, -79.8711, "Hamilton", "Ontario", "Canada"],
  [/\bst\.? catharines\b/i, 43.1594, -79.2469, "St. Catharines", "Ontario", "Canada"],
  [/\bniagara falls\b/i, 43.0896, -79.0849, "Niagara Falls", "Ontario", "Canada"],
  [/\bniagara[- ]on[- ]the[- ]lake\b/i, 43.2553, -79.0710, "Niagara-on-the-Lake", "Ontario", "Canada"],
  [/\bbuffalo\b/i, 42.8864, -78.8784, "Buffalo", "New York", "United States"],
  [/\bnew york(?: city|,? ny)?\b/i, 40.7128, -74.0060, "New York", "New York", "United States"],
  [/\bmiami\b/i, 25.7617, -80.1918, "Miami", "Florida", "United States"],
  [/\borlando\b/i, 28.5383, -81.3792, "Orlando", "Florida", "United States"],
  [/\btampa\b/i, 27.9506, -82.4572, "Tampa", "Florida", "United States"],
  [/\bsan francisco\b/i, 37.7749, -122.4194, "San Francisco", "California", "United States"],
  [/\blos angeles\b/i, 34.0522, -118.2437, "Los Angeles", "California", "United States"],
  [/\bseattle\b/i, 47.6062, -122.3321, "Seattle", "Washington", "United States"],
  [/\baustin\b/i, 30.2672, -97.7431, "Austin", "Texas", "United States"],
  [/\bboston\b/i, 42.3601, -71.0589, "Boston", "Massachusetts", "United States"],
  [/\bchicago\b/i, 41.8781, -87.6298, "Chicago", "Illinois", "United States"],
  [/\bvancouver\b/i, 49.2827, -123.1207, "Vancouver", "British Columbia", "Canada"],
  [/\bmontreal\b/i, 45.5019, -73.5674, "Montreal", "Quebec", "Canada"],
  [/\blondon\b/i, 51.5074, -0.1278, "London", "England", "United Kingdom"],
  [/\bberlin\b/i, 52.5200, 13.4050, "Berlin", "Berlin", "Germany"],
  [/\bparis\b/i, 48.8566, 2.3522, "Paris", "Ile-de-France", "France"],
  [/\bsydney\b/i, -33.8688, 151.2093, "Sydney", "New South Wales", "Australia"],
];

const countryCentroids: Array<[RegExp, number, number, string]> = [
  [/\b(canada|canadian)\b/i, 56.1304, -106.3468, "Canada"],
  [/\b(united states|usa|u\.s\.|us only|americas?)\b/i, 39.8283, -98.5795, "United States"],
  [/\b(united kingdom|uk)\b/i, 55.3781, -3.4360, "United Kingdom"],
  [/\bgermany\b/i, 51.1657, 10.4515, "Germany"],
  [/\baustralia\b/i, -25.2744, 133.7751, "Australia"],
  [/\b(europe|emea)\b/i, 50.1109, 8.6821, "Europe"],
  [/\b(apac|asia)\b/i, 1.3521, 103.8198, "Asia Pacific"],
];

export function classifyWorkType(
  explicit: string | null | undefined,
  locationText: string,
  description = "",
): WorkType {
  const value = `${explicit ?? ""} ${locationText} ${description.slice(0, 2_000)} ${description.slice(-4_000)}`.toLowerCase();
  if (/\bhybrid\b/.test(value)) return "hybrid";
  if (/\bremote\b|work from anywhere|distributed team|work from home/.test(value)) return "remote";
  if (/on[- ]?site|in[- ]person|office[- ]based/.test(value)) return "onsite";
  return "unknown";
}

export function normalizeEmploymentType(value: string | null | undefined, description = ""): EmploymentType {
  const text = `${value ?? ""} ${description.slice(0, 500)}`.toLowerCase();
  if (/intern(ship)?/.test(text)) return "internship";
  if (/temporary|seasonal/.test(text)) return "temporary";
  if (/part[- ]?time/.test(text)) return "part_time";
  if (/contract(or)?|freelance/.test(text)) return "contract";
  if (/full[- ]?time|permanent/.test(text)) return "full_time";
  return "unknown";
}

function deterministicRemoteAnchor(seed: string) {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return {
    latitude: ((hash >>> 8) % 4200) / 100 - 21,
    longitude: ((hash >>> 16) % 34000) / 100 - 170,
  };
}

export function normalizeLocation(
  locationText: string,
  address: { city?: string | null; region?: string | null; country?: string | null } | undefined,
  workType: WorkType,
  company: string,
): JobLocation {
  const combined = `${address?.city ?? ""}, ${address?.region ?? ""}, ${address?.country ?? ""}; ${locationText}`;
  for (const [pattern, latitude, longitude, city, region, country] of cityCoordinates) {
    if (pattern.test(combined)) return { city, region, country, latitude, longitude };
  }

  let country = address?.country?.trim() || null;
  let region = address?.region?.trim() || null;
  let city = address?.city?.trim() || null;
  const regionMatch = combined.match(/(?:,|\s)\b([A-Z]{2})\b/);
  if (!region && regionMatch?.[1] && regionNames[regionMatch[1]]) region = regionNames[regionMatch[1]];

  for (const [pattern, latitude, longitude, normalizedCountry] of countryCentroids) {
    if (!pattern.test(combined)) continue;
    country ||= normalizedCountry;
    return { city, region, country, latitude, longitude };
  }

  if (workType === "remote") {
    const anchor = deterministicRemoteAnchor(`${company}:${locationText}`);
    return {
      city: city ?? "Remote",
      region,
      country: country ?? "Worldwide",
      ...anchor,
    };
  }

  return { city, region, country, latitude: null, longitude: null };
}
