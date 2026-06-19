# Email Validation Worker

A Cloudflare Worker that validates email addresses with syntax, public suffix, disposable domain, and DNS checks. All endpoints require API key authentication.

## Prerequisites

- Node.js 20+
- A Cloudflare account with this repo linked to a Worker

## Setup

```bash
npm install
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and set a local API key (never commit this file).

### KV cache binding (production)

The committed [`wrangler.jsonc`](wrangler.jsonc) declares the `CACHE` KV binding **without a namespace id** so the repo stays safe to publish as OSS. Cloudflare resolves the real namespace at deploy time.

**Link your existing KV namespace in the dashboard:**

1. Cloudflare dashboard → **Workers & Pages** → your worker
2. **Settings** → **Bindings** → **Add**
3. Type: **KV namespace**, variable name: `CACHE` (must match wrangler.jsonc)
4. Select your existing KV namespace → **Deploy**

Workers Builds (Git push deploys) will use this binding. The namespace id stays in Cloudflare only — it is not written back to the repo.

Set `API_KEY` as a **Worker secret** (recommended for Git deploy):

```bash
npx wrangler secret put API_KEY
```

Or via dashboard: **Settings** → **Variables and Secrets** → **Add** → type **Secret** (not Secrets Store).

[`wrangler.jsonc`](wrangler.jsonc) declares `"secrets": { "required": ["API_KEY"] }` so Git deploys keep the binding. The secret **value** stays in Cloudflare only.

> **Important:** Secrets Store bindings added only in the dashboard are **removed on each Git deploy** unless also declared in `wrangler.jsonc` via `secrets_store_secrets`. For this worker, use a regular Worker secret instead.

### KV namespace (optional local override)

Local `wrangler dev` simulates KV automatically with the binding-only config. To point at a specific remote namespace during development:

```bash
cp wrangler.local.jsonc.example wrangler.local.jsonc
# add your namespace id to wrangler.local.jsonc (gitignored)
npm run dev -- -c wrangler.local.jsonc
```

## Local development

```bash
npm run dev
```

The worker runs at `http://localhost:8787`.

### API test page

A simple local UI is in [`test/api-tester.html`](test/api-tester.html). It accepts the API path, key, and email address, then shows the JSON response.

```bash
npm run test:ui
```

Open `http://localhost:3000/api-tester.html`. Start `npm run dev` in another terminal so the worker is running. Defaults to `http://localhost:8787` — change the path to test production.

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

# Disposable domain
curl -X POST http://localhost:8787/validate \
  -H "Authorization: Bearer dev-key-change-me" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@mailinator.com"}'

# Role address warning
curl -X POST http://localhost:8787/validate \
  -H "Authorization: Bearer dev-key-change-me" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gmail.com"}'
```

## Deploy

1. Log in to Cloudflare (if needed):

   ```bash
   npx wrangler login
   ```

2. Configure production bindings in the Cloudflare dashboard (see [KV cache binding](#kv-cache-binding-production)) and set the API key:

   ```bash
   npx wrangler secret put API_KEY
   ```

3. Deploy manually (optional — Git push deploys automatically if Workers Builds is connected):

   ```bash
   npm run deploy
   ```

If using Workers Builds (Git-linked deploy), pushing to `main` deploys automatically once dashboard bindings and `API_KEY` are configured.

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
  "checks": {
    "syntax": true,
    "public_suffix": true,
    "mx": true,
    "mx_resolves": true,
    "not_disposable": true
  },
  "mx_records": ["5 gmail-smtp-in.l.google.com."],
  "warnings": ["role_address"],
  "typo_suggestion": "gmail.com"
}
```

`warnings` and `typo_suggestion` are only included when applicable. Warnings do not cause `valid: false`.

Failure response:

```json
{
  "email": "user@bad-domain.invalid",
  "valid": false,
  "checks": {
    "syntax": true,
    "public_suffix": true,
    "mx": false,
    "mx_resolves": false,
    "not_disposable": true
  },
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
| 500 | `server_misconfigured` | `API_KEY` not bound on the deployed worker (see troubleshooting below) |

### Troubleshooting `server_misconfigured`

This means `env.API_KEY` is missing on the **deployed** worker — the key value in Cloudflare never reached the running script.

**Most common cause:** API_KEY was added via Secrets Store or dashboard only, but Git auto-deploy uses [`wrangler.jsonc`](wrangler.jsonc) which did not declare it. Each push redeploys without the binding.

**Fix:**

1. Dashboard → your worker → **Settings** → **Bindings** / **Variables and Secrets**
2. Remove any **Secrets Store** binding for `API_KEY` (if present)
3. **Add** → type **Secret** (Worker secret) → name `API_KEY` → paste your key → **Deploy**
4. Push the updated `wrangler.jsonc` (with `secrets.required`) and wait for the build to finish
5. Retry:

   ```bash
   curl https://<your-worker>.workers.dev/ \
     -H "Authorization: Bearer <your-key>"
   ```

You should get `200` on `GET /`, or `401` if the key is wrong — not `500`.

## Validation

1. **Syntax** — RFC-style format check (local part, domain labels, length limits)
2. **Public suffix** — domain suffix validated against the [Public Suffix List](https://publicsuffix.org/) via [`tldts`](https://www.npmjs.com/package/tldts)
3. **Disposable** — registrable domain checked against a curated blocklist ([`src/data/disposable-domains.ts`](src/data/disposable-domains.ts))
4. **MX** — DNS MX lookup via Cloudflare DNS-over-HTTPS; falls back to A record per RFC 5321
5. **Null MX** — rejects domains with RFC 7505 null MX records (`MX 0 .`)
6. **MX resolves** — each MX hostname must resolve to an A or AAAA record
7. **Warnings** — soft signals for role addresses (`admin@`, `noreply@`, etc.) and possible typos of common providers (e.g. `gmial.com` → `gmail.com`)

DNS MX and hostname resolution results are cached in Workers KV for 1 hour.

### Validation failure reasons

| `reason` | Meaning |
|----------|---------|
| `invalid_syntax` | Malformed email structure or characters |
| `invalid_public_suffix` | Domain suffix is not a known ICANN or private public suffix |
| `disposable` | Domain is on the disposable email blocklist |
| `null_mx` | Domain explicitly rejects mail via a null MX record |
| `no_mx_records` | Domain has no MX or A record for mail |
| `mx_host_unresolvable` | MX records exist but at least one MX hostname does not resolve |

### Warnings (valid may still be true)

| `warnings` value | Meaning |
|------------------|---------|
| `role_address` | Local part matches a common role/no-reply prefix |
| `possible_typo` | Domain is one character away from a common provider; see `typo_suggestion` |

### Licence

MIT