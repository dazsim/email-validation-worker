# Email Validation Worker

A Cloudflare Worker that validates email addresses via syntax check and DNS MX lookup. All endpoints require API key authentication.

## Prerequisites

- Node.js 20+
- A Cloudflare account with this repo linked to a Worker

## Setup

```bash
npm install
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and set a local API key (never commit this file).

## Local development

```bash
npm run dev
```

The worker runs at `http://localhost:8787`.

### Test requests

```bash
# Should return 401 without auth
curl http://localhost:8787/

# Health check
curl http://localhost:8787/ \
  -H "Authorization: Bearer dev-key-change-me"

# Validate a real email
curl -X POST http://localhost:8787/validate \
  -H "Authorization: Bearer dev-key-change-me" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@gmail.com"}'

# Invalid email
curl -X POST http://localhost:8787/validate \
  -H "Authorization: Bearer dev-key-change-me" \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email"}'
```

## Deploy

1. Log in to Cloudflare (if needed):

   ```bash
   npx wrangler login
   ```

2. Set the production API key (one-time, or when rotating):

   ```bash
   npx wrangler secret put API_KEY
   ```

3. Deploy:

   ```bash
   npm run deploy
   ```

If using Workers Builds (Git-linked deploy), pushing to `main` deploys automatically — but you still need to set `API_KEY` via the dashboard or `wrangler secret put`.

## API

All requests require:

```
Authorization: Bearer <API_KEY>
```

### `GET /`

Health check.

```json
{ "status": "ok", "service": "email-validation-worker" }
```

### `POST /validate`

Request:

```json
{ "email": "user@example.com" }
```

Success response:

```json
{
  "email": "user@example.com",
  "valid": true,
  "checks": { "syntax": true, "mx": true },
  "mx_records": ["5 gmail-smtp-in.l.google.com."]
}
```

Failure response:

```json
{
  "email": "user@bad-domain.invalid",
  "valid": false,
  "checks": { "syntax": true, "mx": false },
  "reason": "no_mx_records"
}
```

### Error codes

| Status | `error` value | Cause |
|--------|---------------|-------|
| 401 | `unauthorized` | Missing or invalid API key |
| 400 | `invalid_json` | Request body is not valid JSON |
| 400 | `missing_email` | `email` field missing or not a string |
| 404 | `not_found` | Unknown path |
| 405 | `method_not_allowed` | Unsupported HTTP method |
| 500 | `server_misconfigured` | `API_KEY` secret not set |

## Validation

1. **Syntax** — RFC-style format check (local part, domain labels, length limits)
2. **Public suffix** — domain suffix validated against the [Public Suffix List](https://publicsuffix.org/) via [`tldts`](https://www.npmjs.com/package/tldts); rejects unknown suffixes like `.con`
3. **MX** — DNS MX record lookup via Cloudflare DNS-over-HTTPS; falls back to A record per RFC 5321

### Validation failure reasons

| `reason` | Meaning |
|----------|---------|
| `invalid_syntax` | Malformed email structure or characters |
| `invalid_public_suffix` | Format is valid but the domain suffix is not a known ICANN or private public suffix |
| `no_mx_records` | Domain passed syntax/PSL checks but has no MX or A record |
