# Coach providers

Tenzon has one deterministic local coach and four optional hosted connections. The hosted model registry is centralized in `lib/coach/models.ts`; the UI, status route, live probes, and coach route all use that same registry.

| Provider | Model ID | Server-side secret | API path |
| --- | --- | --- | --- |
| Anthropic | `claude-sonnet-5` | `ANTHROPIC_API_KEY` | Anthropic Messages API |
| OpenAI | `gpt-5.6-luna` | `OPENAI_API_KEY` | OpenAI Chat Completions API |
| xAI | `grok-4.5` | `XAI_API_KEY` | xAI Chat Completions API |
| xAI subscription | `grok-4.5` | `OAUTH_COOKIE_SECRET` plus a connected browser | xAI Chat Completions API |

Do not prefix these names with `NEXT_PUBLIC_`. The browser never needs the values.

## Request flow

```text
Setup model selection (stored per project in localStorage)
      |
      +-- lib/coach/client.ts -- POST /api/setup -- validated setup route
      |                                      |
      |                                      +-- sends a normalized new-project draft
      |                                      +-- returns an acknowledgment and optional milestone
      |                                      +-- route adds the fixed application-owned question
      |
      +-- setup failure: explicit error, retry, or model switch

Covenant and daily coach selection (the same per-project setting)
      |
      +-- lib/coach/client.ts -- POST /api/coach -- validated coach route
                                             |
                                             +-- reads one process.env secret
                                             +-- calls the selected exact model
                                             +-- daily failure: deterministic scripted fallback
```

Secrets are read only inside server routes. They are never serialized into page props, browser JavaScript, API responses, application logs, the Sites archive, or `.openai/hosting.json`.

## Grok subscription OAuth

The Covenant page can connect an xAI subscription with the public Grok CLI OAuth client and the RFC 8628 device-code flow. Tenzon shows the short user code and xAI approval link, then polls from the server until xAI approves, denies, or expires the request. The browser never receives the device code, access token, or refresh token.

There is no token database. Tenzon seals the device grant in an `xai_device` cookie and the resulting subscription tokens in an `xai_oauth` cookie using AES-GCM and a key derived from `OAUTH_COOKIE_SECRET`. Both cookies are `HttpOnly`, `Secure`, `SameSite=Lax`, and limited to `/`. JavaScript cannot read them, and Tenzon stores no server-side copy. The OAuth cookie is refreshed in place when its access token is within 120 seconds of expiry.

The subscription access token is sent as a Bearer token to the same xAI chat-completions endpoint and exact `grok-4.5` model used by the API-key connection. xAI applies a server-side OAuth allowlist, so some subscription tiers may return 403 even after approval. Tenzon reports that refusal without forwarding xAI response bodies or account details.

The scripted fallback makes daily coaching resilient, but it also means a hosted-provider failure does not stop a work session. Project setup does not silently fall back because that would impersonate the model the user selected; it names the sanitized connection failure and offers retry or a deliberate model change. Use the connection panel before relying on a hosted coach. A successful check proves the key and exact generation path worked at that moment; it is not a permanent uptime guarantee.

## Data sent to a selected hosted provider

Tenzon stores the full project only in the current browser. It sends a bounded request payload to the selected provider when hosted coaching is used:

| Action | Context sent |
| --- | --- |
| Project setup | Only the normalized draft for the new project, the current application-owned question stage, and the latest bounded answer. Existing projects, sessions, sources, and prior assistant text are not sent |
| Invitation | Covenant, the last two completed-session reflections and re-entry points, open threads, and whether the last scheduled day was missed |
| Workbench assist | The invitation context above plus the current session, including the human work, imported sources, prior coach exchanges, and the user’s request |
| Closeout question | Covenant context, session word count, and the final 500 characters of the current work |
| Connection check | Fixed text: `Reply with OK only.` No project, session, source, or user-authored content |

Project and setup data is wrapped as untrusted data so instructions embedded in sources, drafts, or setup answers are not treated as system instructions. The setup route owns the stage order, question copy, and renderer whitelist; a model may return only a bounded plain-text acknowledgment and, at review, a milestone. The server adds the canonical next question after validating the model response. Unknown fields, model-authored questions, arbitrary component definitions, malformed JSON, and oversized payloads are rejected. The coach route also validates request shapes and deterministically refuses common requests to take over human-owned work.

## Configuration versus connection

`GET /api/coach/status` reports whether each connection is available without making a generation call. Environment-key providers are checked locally. The subscription connection decrypts its cookie and may make one token refresh request when the access token is within the 120-second refresh window.

`POST /api/coach/status` is the manual live check used by **Check all connections** on the Covenant page. It runs the same exact generation adapter and model ID used for coaching. Each configured connection receives one minimal request. Results are independent and sanitized:

- `connected`
- `missing`
- `invalid_credentials`
- `model_unavailable`
- `rate_limited`
- `timeout`
- `provider_error`
- `oauth_access_refused`

The response never includes upstream bodies, headers, key fragments, account details, or project data. Both status responses use `Cache-Control: no-store`.

## Local secrets

Copy `.env.example` to `.dev.vars`, add only the providers needed locally, and restart the development server. Vinext's Cloudflare Worker runtime reads `.dev.vars`; the file is ignored by Git.

```bash
cp .env.example .dev.vars
npm run dev
```

To enable subscription OAuth, set `OAUTH_COOKIE_SECRET` to a random value of at least 32 characters. This value encrypts cookies; it is not sent to xAI. Rotating it disconnects existing subscription cookies by design.

Use the Covenant page to confirm the secret is configured, then run the live check. Do not commit `.dev.vars`.

## GPT Sites secrets

Local `.dev.vars` values do not deploy. Add the provider keys you use and `OAUTH_COOKIE_SECRET` as Sites production runtime variables, mark every value as secret, then save and deploy a version against that environment revision. `.openai/hosting.json` contains only the Sites project ID and optional logical storage bindings.

After adding or rotating a secret:

1. Update the Sites runtime variable with `is_secret: true`.
2. Save and deploy a site version so the new environment revision is active.
3. Confirm the variable name is present and redacted in Sites.
4. Open the private site and run **Check all connections**.

The current coach routes have no app-level public-user quota. Keep the deployment private. Before making it public, add authenticated authorization and rate limiting to `/api/setup`, `/api/coach`, and the paid `POST /api/coach/status` live-check action.
