export function jsonResponse(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function methodNotAllowed(allowed = "GET") {
  return jsonResponse(
    { error: { code: "method_not_allowed", message: `Use ${allowed} for this endpoint.` } },
    { status: 405, headers: { allow: allowed } },
  );
}

export function serverError(error: unknown) {
  console.error("job_lobster_api_error", error);
  return jsonResponse(
    { error: { code: "internal_error", message: "Job Lobster could not complete the request." } },
    { status: 500 },
  );
}

function allowedOrigin(request: Request, configuredOrigins: string) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (origin === new URL(request.url).origin) return origin;
  const allowed = configuredOrigins.split(",").map((value) => value.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

export async function withApiHeaders(request: Request, env: Env, handler: () => Promise<Response>) {
  const origin = allowedOrigin(request, env.ALLOWED_ORIGINS);
  const headers = new Headers({
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    vary: "Origin",
  });
  if (origin) headers.set("access-control-allow-origin", origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: origin ? 204 : 403, headers });
  }

  const response = await handler();
  const output = new Response(response.body, response);
  headers.forEach((value, key) => output.headers.set(key, value));
  return output;
}
