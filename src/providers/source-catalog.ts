import type { AtsSource, SourceScope } from "./types";

export type SourceRunMode = "core" | "daily" | "full";

type SourceDefinition = Omit<AtsSource, "scope">;

function scoped(scope: SourceScope, sources: readonly SourceDefinition[]): readonly AtsSource[] {
  return sources.map((source) => ({ ...source, scope }));
}

// Public employer job boards. Tokens are the final path component of each
// employer's hosted ATS board, not credentials.
export const CORE_ATS_SOURCES = scoped("core", [
  { id: "ashby-revenuecat", name: "RevenueCat", provider: "ashby", token: "revenuecat", website: "https://www.revenuecat.com" },
  { id: "ashby-kit", name: "Kit", provider: "ashby", token: "kit", website: "https://kit.com" },
  { id: "ashby-givebutter", name: "Givebutter", provider: "ashby", token: "givebutter", website: "https://givebutter.com" },
  { id: "ashby-archy", name: "Archy", provider: "ashby", token: "Archy", website: "https://www.archy.com" },
  { id: "ashby-somethings", name: "Somethings", provider: "ashby", token: "somethings" },
  { id: "ashby-infracost", name: "Infracost", provider: "ashby", token: "infracost", website: "https://www.infracost.io" },
  { id: "ashby-builder-prime", name: "Builder Prime", provider: "ashby", token: "builder-prime", website: "https://www.builderprime.com" },
  { id: "ashby-viz-ai", name: "Viz.ai", provider: "ashby", token: "Viz.ai", website: "https://www.viz.ai" },
  { id: "ashby-prompt", name: "Prompt", provider: "ashby", token: "prompt" },
  { id: "ashby-coder", name: "Coder", provider: "ashby", token: "coder", website: "https://coder.com" },
  { id: "ashby-gc-ai", name: "GC AI", provider: "ashby", token: "gc-ai", website: "https://gc.ai" },
  { id: "ashby-goody", name: "Goody", provider: "ashby", token: "goody", website: "https://www.ongoody.com" },
  { id: "ashby-highlightta", name: "Zipline", provider: "ashby", token: "highlightta", website: "https://getzipline.com" },
  { id: "ashby-jordan-digital", name: "Jordan Digital Marketing", provider: "ashby", token: "jordandigitalmarketing" },
  { id: "ashby-cloudzero", name: "CloudZero", provider: "ashby", token: "CloudZero", website: "https://www.cloudzero.com" },
  { id: "ashby-counsel", name: "Counsel Health", provider: "ashby", token: "counsel" },
  { id: "ashby-airwallex", name: "Airwallex", provider: "ashby", token: "airwallex", website: "https://www.airwallex.com" },
  { id: "ashby-socure", name: "Socure", provider: "ashby", token: "socure", website: "https://www.socure.com" },
  { id: "greenhouse-workleap", name: "Workleap", provider: "greenhouse", token: "workleap", website: "https://workleap.com" },
  { id: "greenhouse-wayvia", name: "Wayvia", provider: "greenhouse", token: "wayvia" },
  { id: "greenhouse-cresta", name: "Cresta", provider: "greenhouse", token: "cresta", website: "https://cresta.com" },
  { id: "greenhouse-maxwell", name: "Maxwell", provider: "greenhouse", token: "maxwell" },
  { id: "greenhouse-anthropic", name: "Anthropic", provider: "greenhouse", token: "anthropic", website: "https://www.anthropic.com" },
  { id: "greenhouse-commvault", name: "Commvault", provider: "greenhouse", token: "commvault", website: "https://www.commvault.com" },
  { id: "greenhouse-fsastore", name: "Health-E Commerce", provider: "greenhouse", token: "fsastorecom" },
  { id: "greenhouse-xapo", name: "Xapo Bank", provider: "greenhouse", token: "xapo61", website: "https://www.xapobank.com" },
  { id: "greenhouse-quip", name: "quip", provider: "greenhouse", token: "quip", website: "https://www.getquip.com" },
  { id: "greenhouse-honeycomb", name: "Honeycomb", provider: "greenhouse", token: "honeycomb", website: "https://www.honeycomb.io" },
  { id: "greenhouse-prolific", name: "Prolific", provider: "greenhouse", token: "prolific", website: "https://www.prolific.com" },
  { id: "greenhouse-figma", name: "Figma", provider: "greenhouse", token: "figma", website: "https://www.figma.com" },
  { id: "greenhouse-webflow", name: "Webflow", provider: "greenhouse", token: "webflow", website: "https://webflow.com" },
  { id: "greenhouse-cloudflare", name: "Cloudflare", provider: "greenhouse", token: "cloudflare", website: "https://www.cloudflare.com" },
]);

// Larger boards are isolated to the once-daily deep scrape. Each token is
// validated against the provider's public API before it is admitted here.
export const DAILY_ATS_SOURCES = scoped("daily", [
  { id: "greenhouse-reddit", name: "Reddit", provider: "greenhouse", token: "reddit", website: "https://www.redditinc.com" },
  { id: "greenhouse-coinbase", name: "Coinbase", provider: "greenhouse", token: "coinbase", website: "https://www.coinbase.com" },
  { id: "greenhouse-datadog", name: "Datadog", provider: "greenhouse", token: "datadog", website: "https://www.datadoghq.com" },
  { id: "greenhouse-mongodb", name: "MongoDB", provider: "greenhouse", token: "mongodb", website: "https://www.mongodb.com" },
  { id: "greenhouse-elastic", name: "Elastic", provider: "greenhouse", token: "elastic", website: "https://www.elastic.co" },
  { id: "greenhouse-grafana-labs", name: "Grafana Labs", provider: "greenhouse", token: "grafanalabs", website: "https://grafana.com" },
  { id: "greenhouse-gitlab", name: "GitLab", provider: "greenhouse", token: "gitlab", website: "https://about.gitlab.com" },
  { id: "greenhouse-samsara", name: "Samsara", provider: "greenhouse", token: "samsara", website: "https://www.samsara.com" },
  { id: "greenhouse-lyft", name: "Lyft", provider: "greenhouse", token: "lyft", website: "https://www.lyft.com" },
  { id: "greenhouse-airbnb", name: "Airbnb", provider: "greenhouse", token: "airbnb", website: "https://www.airbnb.com" },
  { id: "greenhouse-pinterest", name: "Pinterest", provider: "greenhouse", token: "pinterest", website: "https://www.pinterest.com" },
  { id: "greenhouse-khan-academy", name: "Khan Academy", provider: "greenhouse", token: "khanacademy", website: "https://www.khanacademy.org" },
  { id: "greenhouse-duolingo", name: "Duolingo", provider: "greenhouse", token: "duolingo", website: "https://www.duolingo.com" },
  { id: "greenhouse-twilio", name: "Twilio", provider: "greenhouse", token: "twilio", website: "https://www.twilio.com" },
  { id: "greenhouse-okta", name: "Okta", provider: "greenhouse", token: "okta", website: "https://www.okta.com" },
  { id: "greenhouse-asana", name: "Asana", provider: "greenhouse", token: "asana", website: "https://asana.com" },
  { id: "greenhouse-scale-ai", name: "Scale AI", provider: "greenhouse", token: "scaleai", website: "https://scale.com" },
  { id: "greenhouse-discord", name: "Discord", provider: "greenhouse", token: "discord", website: "https://discord.com" },
  { id: "greenhouse-klaviyo", name: "Klaviyo", provider: "greenhouse", token: "klaviyo", website: "https://www.klaviyo.com" },
  { id: "greenhouse-intercom", name: "Intercom", provider: "greenhouse", token: "intercom", website: "https://www.intercom.com" },
  { id: "greenhouse-databricks", name: "Databricks", provider: "greenhouse", token: "databricks", website: "https://www.databricks.com" },
  { id: "greenhouse-airtable", name: "Airtable", provider: "greenhouse", token: "airtable", website: "https://www.airtable.com" },
  { id: "greenhouse-instacart", name: "Instacart", provider: "greenhouse", token: "instacart", website: "https://www.instacart.com" },
  { id: "greenhouse-calendly", name: "Calendly", provider: "greenhouse", token: "calendly", website: "https://calendly.com" },
  { id: "greenhouse-dropbox", name: "Dropbox", provider: "greenhouse", token: "dropbox", website: "https://www.dropbox.com" },
  { id: "ashby-openai", name: "OpenAI", provider: "ashby", token: "openai", website: "https://openai.com" },
  { id: "ashby-linear", name: "Linear", provider: "ashby", token: "linear", website: "https://linear.app" },
  { id: "ashby-ramp", name: "Ramp", provider: "ashby", token: "ramp", website: "https://ramp.com" },
  { id: "ashby-cursor", name: "Cursor", provider: "ashby", token: "cursor", website: "https://www.cursor.com" },
  { id: "ashby-perplexity", name: "Perplexity", provider: "ashby", token: "perplexity", website: "https://www.perplexity.ai" },
  { id: "ashby-harvey", name: "Harvey", provider: "ashby", token: "harvey", website: "https://www.harvey.ai" },
  { id: "ashby-supabase", name: "Supabase", provider: "ashby", token: "supabase", website: "https://supabase.com" },
  { id: "ashby-replit", name: "Replit", provider: "ashby", token: "replit", website: "https://replit.com" },
  { id: "ashby-notion", name: "Notion", provider: "ashby", token: "notion", website: "https://www.notion.com" },
  { id: "ashby-elevenlabs", name: "ElevenLabs", provider: "ashby", token: "elevenlabs", website: "https://elevenlabs.io" },
  { id: "ashby-hex", name: "Hex", provider: "ashby", token: "hex", website: "https://hex.tech" },
  { id: "ashby-dust", name: "Dust", provider: "ashby", token: "dust", website: "https://dust.tt" },
  { id: "ashby-deepgram", name: "Deepgram", provider: "ashby", token: "deepgram", website: "https://deepgram.com" },
  { id: "lever-spotify", name: "Spotify", provider: "lever", token: "spotify", website: "https://www.spotify.com" },
  { id: "lever-palantir", name: "Palantir", provider: "lever", token: "palantir", website: "https://www.palantir.com" },
]);

export const ALL_ATS_SOURCES: readonly AtsSource[] = [
  ...CORE_ATS_SOURCES,
  ...DAILY_ATS_SOURCES,
];

export function sourcesForRun(mode: SourceRunMode): readonly AtsSource[] {
  if (mode === "daily") return DAILY_ATS_SOURCES;
  if (mode === "full") return ALL_ATS_SOURCES;
  return CORE_ATS_SOURCES;
}
