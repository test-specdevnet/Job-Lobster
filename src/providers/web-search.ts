import puppeteer, { type BrowserWorker, type Page } from "@cloudflare/puppeteer";
import { normalizeEmploymentType } from "./normalization/job-fields";
import type {
  RawAtsJob,
  WebSearchProvider,
  WebSearchSource,
} from "./types";

export const WEB_SEARCH_SOURCES: readonly WebSearchSource[] = [
  {
    id: "web-linkedin",
    name: "LinkedIn",
    provider: "linkedin",
    token: "public-jobs-search",
    scope: "daily",
    website: "https://www.linkedin.com/jobs",
  },
  {
    id: "web-indeed",
    name: "Indeed",
    provider: "indeed",
    token: "public-jobs-search",
    scope: "daily",
    website: "https://www.indeed.com",
  },
  {
    id: "web-glassdoor",
    name: "Glassdoor",
    provider: "glassdoor",
    token: "public-jobs-search",
    scope: "daily",
    website: "https://www.glassdoor.com",
  },
];

interface SearchDefinition {
  provider: WebSearchProvider;
  country: "United States" | "Canada";
  url: string;
  readySelector: string;
}

const INDEXED_QUERY_SEGMENTS = [
  '("marketing manager" OR "marketing director" OR "head of marketing")',
  '("product marketing manager" OR "growth marketing manager" OR "communications manager" OR "brand manager")',
] as const;

const SEARCH_DEFINITIONS: readonly SearchDefinition[] = [
  {
    provider: "linkedin",
    country: "United States",
    url: "https://www.linkedin.com/jobs/search/?keywords=marketing&location=United%20States&f_TPR=r604800&f_WT=2&sortBy=DD",
    readySelector: "a[href*='/jobs/view/']",
  },
  {
    provider: "linkedin",
    country: "Canada",
    url: "https://www.linkedin.com/jobs/search/?keywords=marketing&location=Canada&f_TPR=r604800&f_WT=2&sortBy=DD",
    readySelector: "a[href*='/jobs/view/']",
  },
  {
    provider: "indeed",
    country: "United States",
    url: "https://www.indeed.com/jobs?q=marketing&l=Remote&fromage=7&sort=date",
    readySelector: "a[href*='/viewjob'], a[data-jk]",
  },
  {
    provider: "indeed",
    country: "Canada",
    url: "https://ca.indeed.com/jobs?q=marketing&l=Remote&fromage=7&sort=date",
    readySelector: "a[href*='/viewjob'], a[data-jk]",
  },
  {
    provider: "glassdoor",
    country: "United States",
    url: "https://www.glassdoor.com/Job/remote-marketing-jobs-SRCH_IL.0,6_IS11047_KO7,16.htm?fromAge=7",
    readySelector: "a[href*='/job-listing/'], [data-test='jobListing']",
  },
  {
    provider: "glassdoor",
    country: "Canada",
    url: "https://www.glassdoor.ca/Job/canada-remote-marketing-jobs-SRCH_IL.0,6_IN3_KO7,23.htm?fromAge=7",
    readySelector: "a[href*='/job-listing/'], [data-test='jobListing']",
  },
];

interface ScrapedJobCard {
  url: string;
  title: string;
  company: string;
  location: string;
  snippet: string;
  salary: string;
  postedText: string;
  postedDate: string;
}

export interface PlatformSearchResult {
  source: WebSearchSource;
  jobs: RawAtsJob[];
  searchesPerformed: number;
  successfulSearches: number;
  pagesFetched: number;
  errors: string[];
}

export interface PublicWebSearchBinding {
  search(options: { query: string; limit?: number }): Promise<{
    items: Array<{
      url: string;
      title: string;
      description?: string;
      lastModifiedDate?: string;
    }>;
  }>;
}

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function parseRelativePostedAt(
  postedDate: string,
  postedText: string,
  now = new Date(),
): string | null {
  const explicit = cleanText(postedDate);
  if (explicit) {
    const parsed = new Date(explicit);
    if (Number.isFinite(parsed.getTime()) && parsed.getUTCFullYear() >= 2020) {
      return parsed.toISOString();
    }
  }

  const value = cleanText(postedText).toLowerCase();
  if (!value) return null;
  let ageMs: number | null = null;
  if (/just posted|posted today|today|new/.test(value)) ageMs = 0;
  if (/yesterday/.test(value)) ageMs = 24 * 3_600_000;

  const minutes = value.match(/(\d+)\s*(?:minutes?|mins?|m)\b/);
  const hours = value.match(/(\d+)\s*(?:hours?|hrs?|h)\b/);
  const days = value.match(/(\d+)\+?\s*(?:days?|d)\b/);
  const weeks = value.match(/(\d+)\s*(?:weeks?|wks?|w)\b/);
  if (minutes) ageMs = Number(minutes[1]) * 60_000;
  else if (hours) ageMs = Number(hours[1]) * 3_600_000;
  else if (days) ageMs = Number(days[1]) * 24 * 3_600_000;
  else if (weeks) ageMs = Number(weeks[1]) * 7 * 24 * 3_600_000;
  if (ageMs === null) return null;
  return new Date(now.getTime() - ageMs).toISOString();
}

function canonicalJobUrl(rawUrl: string, searchUrl: string, provider: WebSearchProvider) {
  try {
    const url = new URL(rawUrl, searchUrl);
    url.hash = "";
    if (provider === "linkedin") {
      url.search = "";
    } else if (provider === "indeed") {
      const jobKey = url.searchParams.get("jk") ?? url.searchParams.get("vjk");
      url.search = "";
      if (jobKey) url.searchParams.set("jk", jobKey);
    } else {
      const listingId = url.searchParams.get("jl");
      url.search = "";
      if (listingId) url.searchParams.set("jl", listingId);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function externalIdFor(provider: WebSearchProvider, url: string) {
  const parsed = new URL(url);
  if (provider === "linkedin") {
    return parsed.pathname.match(/(?:jobs\/view\/[^/]*-)?(\d{6,})(?:\/|$)/)?.[1] ?? url;
  }
  if (provider === "indeed") {
    return parsed.searchParams.get("jk") ?? parsed.pathname.match(/\/viewjob\/(?:[^/]*-)?([^/]+)/)?.[1] ?? url;
  }
  return parsed.searchParams.get("jl") ?? parsed.pathname.match(/\/job-listing\/[^/]*-([A-Za-z0-9]+)\.htm/)?.[1] ?? url;
}

function cardsToJobs(
  definition: SearchDefinition,
  cards: readonly ScrapedJobCard[],
  now: Date,
): RawAtsJob[] {
  const source = WEB_SEARCH_SOURCES.find((candidate) => candidate.provider === definition.provider);
  if (!source) return [];
  const cutoff = now.getTime() - 7 * 24 * 3_600_000;
  const jobs = new Map<string, RawAtsJob>();

  for (const card of cards) {
    const title = cleanText(card.title);
    const url = canonicalJobUrl(card.url, definition.url, definition.provider);
    const postedAt = parseRelativePostedAt(card.postedDate, card.postedText, now);
    if (!title || !url || !postedAt || new Date(postedAt).getTime() < cutoff) continue;

    const company = cleanText(card.company) || "Undisclosed employer";
    const cardLocation = cleanText(card.location);
    const locationText = /\bremote\b/i.test(cardLocation)
      ? cardLocation
      : `Remote - ${cardLocation || definition.country}`;
    const description = [card.snippet, card.salary, card.postedText]
      .map(cleanText)
      .filter(Boolean)
      .join("\n");
    const externalId = externalIdFor(definition.provider, url);
    jobs.set(url, {
      sourceId: source.id,
      provider: definition.provider,
      externalId,
      title,
      company,
      companyWebsite: null,
      description,
      locationText,
      address: { country: definition.country },
      workType: "remote",
      eligibility: locationText,
      employmentType: normalizeEmploymentType(null, description),
      salary: null,
      postedAt,
      sourceUrl: url,
      applicationUrl: url,
      industry: "Marketing",
    });
  }

  return [...jobs.values()];
}

function indexedSearchQuery(definition: SearchDefinition, titleSegment: string) {
  const hostname = new URL(definition.url).hostname;
  const pathHint = definition.provider === "linkedin"
    ? "/jobs/view"
    : definition.provider === "indeed"
      ? "/viewjob"
      : "/job-listing";
  return [
    `site:${hostname}${pathHint}`,
    titleSegment,
    '"remote"',
    `"${definition.country}"`,
    '("hours ago" OR "days ago")',
  ].join(" ");
}

function indexedTitleParts(rawTitle: string, provider: WebSearchProvider) {
  const withoutPlatform = cleanText(rawTitle)
    .replace(/\s*[|–—-]\s*(?:LinkedIn|Indeed(?:\.com)?|Glassdoor).*$/i, "")
    .trim();
  const hiring = withoutPlatform.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+(.+))?$/i);
  if (hiring) {
    return { company: cleanText(hiring[1]), title: cleanText(hiring[2]), location: cleanText(hiring[3]) };
  }
  const parts = withoutPlatform.split(/\s+(?:[–—-]|\|)\s+/).map(cleanText).filter(Boolean);
  return {
    title: parts[0] ?? withoutPlatform,
    company: parts.length >= 2 ? parts[1] : "",
    location: parts.length >= 3 ? parts.slice(2).join(" - ") : "",
  };
}

function isProviderJobUrl(provider: WebSearchProvider, rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (provider === "linkedin") {
      return host.endsWith("linkedin.com") && url.pathname.includes("/jobs/view/");
    }
    if (provider === "indeed") {
      return host.endsWith("indeed.com") && url.pathname.includes("/viewjob");
    }
    return (host.endsWith("glassdoor.com") || host.endsWith("glassdoor.ca"))
      && (url.pathname.includes("/job-listing/") || url.pathname.includes("/partner/jobListing"));
  } catch {
    return false;
  }
}

async function extractIndexedCards(
  webSearch: PublicWebSearchBinding,
  definition: SearchDefinition,
  titleSegment: string,
): Promise<ScrapedJobCard[]> {
  const response = await webSearch.search({
    query: indexedSearchQuery(definition, titleSegment),
    limit: 20,
  });
  return response.items.flatMap((item) => {
    if (!isProviderJobUrl(definition.provider, item.url)) return [];
    const parts = indexedTitleParts(item.title, definition.provider);
    return [{
      url: item.url,
      title: parts.title,
      company: parts.company,
      location: parts.location,
      snippet: item.description ?? "",
      salary: item.description ?? "",
      postedText: item.description ?? "",
      postedDate: item.lastModifiedDate ?? "",
    }];
  });
}

async function configurePublicSearchPage(page: Page) {
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      + "(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 JobLobster/1.0",
  );
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
  page.setDefaultNavigationTimeout(30_000);
}

async function extractCards(
  page: Page,
  provider: WebSearchProvider,
): Promise<ScrapedJobCard[]> {
  return page.evaluate((selectedProvider) => {
    const text = (root: Element, selectors: readonly string[]) => {
      for (const selector of selectors) {
        const value = root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();
        if (value) return value;
      }
      return "";
    };
    const attribute = (root: Element, selectors: readonly string[], name: string) => {
      for (const selector of selectors) {
        const value = root.querySelector(selector)?.getAttribute(name)?.trim();
        if (value) return value;
      }
      return "";
    };

    let nodes: Element[] = [];
    if (selectedProvider === "linkedin") {
      nodes = Array.from(document.querySelectorAll(".base-card, .jobs-search__results-list > li, [data-entity-urn*='jobPosting']"));
    } else if (selectedProvider === "indeed") {
      nodes = Array.from(document.querySelectorAll(".job_seen_beacon, .resultContent, [data-testid='slider_item']"));
    } else {
      nodes = Array.from(document.querySelectorAll("[data-test='jobListing'], li[class*='JobsList_jobListItem']"));
    }

    return nodes.map((node) => {
      if (selectedProvider === "linkedin") {
        return {
          url: attribute(node, ["a.base-card__full-link", "a[href*='/jobs/view/']"], "href"),
          title: text(node, [".base-search-card__title", "h3"]),
          company: text(node, [".base-search-card__subtitle", "h4"]),
          location: text(node, [".job-search-card__location", "[class*='location']"]),
          snippet: text(node, [".job-search-card__benefits", "[class*='description']"]),
          salary: text(node, [".job-search-card__salary-info", "[class*='salary']"]),
          postedText: text(node, ["time", ".job-search-card__listdate"]),
          postedDate: attribute(node, ["time"], "datetime"),
        };
      }
      if (selectedProvider === "indeed") {
        return {
          url: attribute(node, ["a.jcs-JobTitle", "a[data-jk]", "a[href*='/viewjob']"], "href"),
          title: attribute(node, ["a.jcs-JobTitle", "a[data-jk]"], "aria-label")
            || attribute(node, ["a.jcs-JobTitle", "a[data-jk]"], "title")
            || text(node, ["a.jcs-JobTitle", "h2"]),
          company: text(node, ["[data-testid='company-name']", ".companyName"]),
          location: text(node, ["[data-testid='text-location']", ".companyLocation"]),
          snippet: text(node, [".job-snippet", "[class*='job-snippet']"]),
          salary: text(node, [".salary-snippet-container", "[class*='salary']"]),
          postedText: text(node, ["[data-testid='myJobsStateDate']", ".date"]),
          postedDate: attribute(node, ["time"], "datetime"),
        };
      }
      return {
        url: attribute(node, ["a[data-test='job-title']", "a[href*='/job-listing/']", "a[href*='/partner/jobListing']"], "href"),
        title: text(node, ["[data-test='job-title']", "a[href*='/job-listing/']"]),
        company: text(node, ["[data-test='employer-name']", "[class*='EmployerProfile']"]),
        location: text(node, ["[data-test='emp-location']", "[class*='location']"]),
        snippet: text(node, ["[data-test='job-description']", "[class*='jobDescription']"]),
        salary: text(node, ["[data-test='detailSalary']", "[class*='salary']"]),
        postedText: text(node, ["[data-test='job-age']", "[class*='jobAge']", "time"]),
        postedDate: attribute(node, ["time"], "datetime"),
      };
    });
  }, provider);
}

export async function searchPublicJobPlatforms(
  browserBinding: BrowserWorker,
  webSearchBinding: PublicWebSearchBinding,
  now = new Date(),
): Promise<PlatformSearchResult[]> {
  const results = WEB_SEARCH_SOURCES.map((source) => ({
    source,
    jobs: [] as RawAtsJob[],
    searchesPerformed: 0,
    successfulSearches: 0,
    pagesFetched: 0,
    errors: [] as string[],
  }));
  const byProvider = new Map(results.map((result) => [result.source.provider, result]));

  for (const definition of SEARCH_DEFINITIONS) {
    const result = byProvider.get(definition.provider);
    if (!result) continue;
    for (const titleSegment of INDEXED_QUERY_SEGMENTS) {
      result.searchesPerformed += 1;
      try {
        const indexedCards = await extractIndexedCards(webSearchBinding, definition, titleSegment);
        result.jobs.push(...cardsToJobs(definition, indexedCards, now));
        result.successfulSearches += 1;
      } catch (error) {
        result.errors.push(
          `${definition.country}: Cloudflare Web Search ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  const browser = await puppeteer.launch(browserBinding);
  try {
    for (const definition of SEARCH_DEFINITIONS.filter(({ provider }) => provider === "linkedin")) {
      const result = byProvider.get(definition.provider);
      if (!result) continue;
      result.searchesPerformed += 1;
      const page = await browser.newPage();
      try {
        await configurePublicSearchPage(page);
        const response = await page.goto(definition.url, { waitUntil: "domcontentloaded" });
        if (!response || response.status() >= 400) {
          throw new Error(`HTTP ${response?.status() ?? "no response"}`);
        }
        await page.waitForSelector(definition.readySelector, { timeout: 12_000 }).catch(() => null);
        const cards = await extractCards(page, definition.provider);
        result.jobs.push(...cardsToJobs(definition, cards, now));
        result.successfulSearches += 1;
        result.pagesFetched += 1;
      } catch (error) {
        result.errors.push(
          `${definition.country}: LinkedIn public jobs page ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  for (const result of results) {
    result.jobs = [...new Map(result.jobs.map((job) => [job.sourceUrl, job])).values()];
  }
  return results;
}
