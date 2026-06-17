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

  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export function isAuthorized(request: Request, env: Env): boolean {
  if (!env.API_KEY) {
    return false;
  }

  const token = parseBearerToken(request.headers.get("Authorization"));
  if (!token) {
    return false;
  }

  return timingSafeEqual(token, env.API_KEY);
}
