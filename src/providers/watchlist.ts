import { ALL_ATS_SOURCES, CORE_ATS_SOURCES } from "./source-catalog";

// Keep the broader catalog as discovery fallback. The active radar shortlist
// is capped at 140 unique employers and favors Andrew's technical portfolio.
const priorityNames = /cohere|wealthsimple|1password|koho|d2l|wattpad|pointclickcare|jobber|klue|thinkific|benevity|anthropic|cloudflare|openai|langchain|writer|assemblyai|descript|synthesia|modal|pinecone|neon|render|sentry|honeycomb|coder|infracost|cloudzero|vanta|drata|illumio|socure|commvault|airwallex|plaid|jordan digital|smartrecruiters/i;
const excluded = /bombas|glossier|quip|health-e commerce|careem|somethings|counsel health/i;
const seen = new Set<string>();
export const RADAR_WATCHLIST = [
  ...ALL_ATS_SOURCES.filter(s => priorityNames.test(s.name)),
  ...CORE_ATS_SOURCES,
  ...ALL_ATS_SOURCES,
].filter(s => {
  const key = s.name.toLowerCase();
  if (seen.has(key) || excluded.test(key)) return false;
  seen.add(key); return true;
}).slice(0, 140);
