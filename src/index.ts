import { isAuthorized } from "./auth";
import type {
  ErrorResponse,
  HealthResponse,
  ValidateRequest,
  ValidateResponse,
} from "./types";
import { validateEmail } from "./validate";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function jsonResponse<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function unauthorized(): Response {
  return jsonResponse<ErrorResponse>({ error: "unauthorized" }, 401);
}

function misconfigured(): Response {
  return jsonResponse<ErrorResponse>({ error: "server_misconfigured" }, 500);
}

function requireAuth(request: Request, env: Env): Response | null {
  if (!env.API_KEY) {
    return misconfigured();
  }

  if (!isAuthorized(request, env)) {
    return unauthorized();
  }

  return null;
}

async function handleHealth(): Promise<Response> {
  return jsonResponse<HealthResponse>({
    status: "ok",
    service: "email-validation-worker",
  });
}

async function handleValidate(request: Request, env: Env): Promise<Response> {
  let body: ValidateRequest;

  try {
    body = (await request.json()) as ValidateRequest;
  } catch {
    return jsonResponse<ErrorResponse>({ error: "invalid_json" }, 400);
  }

  if (!body.email || typeof body.email !== "string") {
    return jsonResponse<ErrorResponse>({ error: "missing_email" }, 400);
  }

  const result: ValidateResponse = await validateEmail(body.email, env);
  return jsonResponse(result);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const authError = requireAuth(request, env);
    if (authError) {
      return authError;
    }

    if (url.pathname === "/" && request.method === "GET") {
      return handleHealth();
    }

    if (url.pathname === "/validate" && request.method === "POST") {
      return handleValidate(request, env);
    }

    if (request.method !== "GET" && request.method !== "POST") {
      return jsonResponse<ErrorResponse>({ error: "method_not_allowed" }, 405);
    }

    return jsonResponse<ErrorResponse>({ error: "not_found" }, 404);
  },
} satisfies ExportedHandler<Env>;
