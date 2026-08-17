import { getAgentByName } from "agents";
import { JobDiscoveryAgent } from "./agent";
import { handleApi } from "./api";
import { withApiHeaders } from "./http";

export { JobDiscoveryAgent };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return withApiHeaders(request, env, () => handleApi(request, env));
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      const agent = await getAgentByName<Env, JobDiscoveryAgent>(
        env.JOB_DISCOVERY_AGENT as DurableObjectNamespace<JobDiscoveryAgent>,
        env.AGENT_INSTANCE_NAME,
      );
      await agent.runPull("cron");
    })());
  },
} satisfies ExportedHandler<Env>;
