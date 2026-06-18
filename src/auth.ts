type ApiKeyBinding = string | SecretsStoreSecret;

async function resolveApiKey(apiKey: ApiKeyBinding | undefined): Promise<string | null> {
  if (!apiKey) {
    return null;
  }

  if (typeof apiKey === "string") {
    return apiKey.trim();
  }

  return (await apiKey.get()).trim();
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return mismatch === 0;
}

function parseBearerToken(authorization: string | null): string | null {
  if (!authorization) {
    return null;
  }

  const [scheme, ...tokenParts] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || tokenParts.length === 0) {
    return null;
  }

  const token = tokenParts.join(" ").trim();
  return token || null;
}

export async function isAuthorized(request: Request, env: Env): Promise<boolean> {
  const expectedKey = await resolveApiKey(env.API_KEY);
  if (!expectedKey) {
    return false;
  }

  const token = parseBearerToken(request.headers.get("Authorization"));
  if (!token) {
    return false;
  }

  return timingSafeEqual(token, expectedKey);
}
