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
  [/\b(canada|canadian|ca)\b/i, 56.1304, -106.3468, "Canada"],
  [/\b(united states|usa|u\.s\.|us only|us)\b/i, 39.8283, -98.5795, "United States"],
  [/\b(united kingdom|great britain|uk|gb)\b/i, 55.3781, -3.4360, "United Kingdom"],
  [/\b(ireland|ie)\b/i, 53.1424, -7.6921, "Ireland"],
  [/\b(germany|de)\b/i, 51.1657, 10.4515, "Germany"],
  [/\b(france|fr)\b/i, 46.2276, 2.2137, "France"],
  [/\b(spain|es)\b/i, 40.4637, -3.7492, "Spain"],
  [/\b(portugal|pt)\b/i, 39.3999, -8.2245, "Portugal"],
  [/\b(italy|it)\b/i, 41.8719, 12.5674, "Italy"],
  [/\b(netherlands|nl)\b/i, 52.1326, 5.2913, "Netherlands"],
  [/\b(belgium|be)\b/i, 50.5039, 4.4699, "Belgium"],
  [/\b(switzerland|ch)\b/i, 46.8182, 8.2275, "Switzerland"],
  [/\b(austria|at)\b/i, 47.5162, 14.5501, "Austria"],
  [/\b(sweden|se)\b/i, 60.1282, 18.6435, "Sweden"],
  [/\b(norway|no)\b/i, 60.472, 8.4689, "Norway"],
  [/\b(denmark|dk)\b/i, 56.2639, 9.5018, "Denmark"],
  [/\b(finland|fi)\b/i, 61.9241, 25.7482, "Finland"],
  [/\b(poland|pl)\b/i, 51.9194, 19.1451, "Poland"],
  [/\b(czechia|czech republic|cz)\b/i, 49.8175, 15.473, "Czechia"],
  [/\b(romania|ro)\b/i, 45.9432, 24.9668, "Romania"],
  [/\b(greece|gr)\b/i, 39.0742, 21.8243, "Greece"],
  [/\b(ukraine|ua)\b/i, 48.3794, 31.1656, "Ukraine"],
  [/\b(israel|il)\b/i, 31.0461, 34.8516, "Israel"],
  [/\b(united arab emirates|uae|ae)\b/i, 23.4241, 53.8478, "United Arab Emirates"],
  [/\b(saudi arabia|sa)\b/i, 23.8859, 45.0792, "Saudi Arabia"],
  [/\b(india|in)\b/i, 20.5937, 78.9629, "India"],
  [/\b(singapore|sg)\b/i, 1.3521, 103.8198, "Singapore"],
  [/\b(japan|jp)\b/i, 36.2048, 138.2529, "Japan"],
  [/\b(south korea|korea|kr)\b/i, 35.9078, 127.7669, "South Korea"],
  [/\b(china|cn)\b/i, 35.8617, 104.1954, "China"],
  [/\b(hong kong|hk)\b/i, 22.3193, 114.1694, "Hong Kong"],
  [/\b(taiwan|tw)\b/i, 23.6978, 120.9605, "Taiwan"],
  [/\b(indonesia|id)\b/i, -0.7893, 113.9213, "Indonesia"],
  [/\b(malaysia|my)\b/i, 4.2105, 101.9758, "Malaysia"],
  [/\b(philippines|ph)\b/i, 12.8797, 121.774, "Philippines"],
  [/\b(thailand|th)\b/i, 15.87, 100.9925, "Thailand"],
  [/\b(vietnam|vn)\b/i, 14.0583, 108.2772, "Vietnam"],
  [/\b(australia|au)\b/i, -25.2744, 133.7751, "Australia"],
  [/\b(new zealand|nz)\b/i, -40.9006, 174.886, "New Zealand"],
  [/\b(mexico|mx)\b/i, 23.6345, -102.5528, "Mexico"],
  [/\b(brazil|br)\b/i, -14.235, -51.9253, "Brazil"],
  [/\b(argentina|ar)\b/i, -38.4161, -63.6167, "Argentina"],
  [/\b(chile|cl)\b/i, -35.6751, -71.543, "Chile"],
  [/\b(colombia|co)\b/i, 4.5709, -74.2973, "Colombia"],
  [/\b(peru|pe)\b/i, -9.19, -75.0152, "Peru"],
  [/\b(south africa|za)\b/i, -30.5595, 22.9375, "South Africa"],
  [/\b(nigeria|ng)\b/i, 9.082, 8.6753, "Nigeria"],
  [/\b(kenya|ke)\b/i, -0.0236, 37.9062, "Kenya"],
  [/\b(egypt|eg)\b/i, 26.8206, 30.8025, "Egypt"],
  [/\b(europe|emea)\b/i, 50.1109, 8.6821, "Europe"],
  [/\b(apac|asia)\b/i, 22.0, 100.0, "Asia Pacific"],
  [/\b(americas?|north america)\b/i, 35.0, -100.0, "Americas"],
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
  if (locationText.trim()) return "onsite";
  return "unknown";
}

export function normalizeEmploymentType(value: string | null | undefined, description = ""): EmploymentType {
  const explicit = (value ?? "").toLowerCase();
  if (/intern(ship)?/.test(explicit)) return "internship";
  if (/temporary|seasonal/.test(explicit)) return "temporary";
  if (/part[- ]?time/.test(explicit)) return "part_time";
  if (/contract(or)?|freelance/.test(explicit)) return "contract";
  if (/full[- ]?time|permanent/.test(explicit)) return "full_time";
  const opening = description.slice(0, 900).toLowerCase();
  if (/employment type\s*:?\s*intern(ship)?|\b(?:paid )?internship position\b/.test(opening)) return "internship";
  if (/employment type\s*:?\s*(?:temporary|seasonal)/.test(opening)) return "temporary";
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

  const countryEvidence = `${address?.country ?? ""}; ${combined}`;
  for (const [pattern, latitude, longitude, normalizedCountry] of countryCentroids) {
    if (!pattern.test(countryEvidence)) continue;
    country = normalizedCountry;
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
