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
} satisfies ExportedHandler<Env>;
