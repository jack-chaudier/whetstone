# Tenzon

Tenzon is an AI project steward for voluntary ambitions: the novel, subject, or question that matters even though no one else is enforcing it. It keeps multiple projects separate, remembers the live edge of whichever one is active, prepares a small daily invitation, and treats deliberate decline and recovery as information rather than failure.

The protected workbench keeps imported sources separate from human-authored work. Its coach can nudge, ask a question, or offer intentions, but it will not produce work the covenant says must remain human. Project state is stored in the browser, and a deterministic scripted coach keeps the product usable without any external service. Hosted coaches are optional.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Choose an available coach, then create the first project in one conversation with rendered text, choice, schedule, ownership, tone, and review questions. **New project** in the masthead starts another conversation without replacing existing work.

To use an optional hosted provider, copy `.env.example` to `.dev.vars` and set one or more of:

```bash
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
XAI_API_KEY=your_key_here
```

Project setup and the Covenant page offer Tenzon scripted, Claude Sonnet 5, GPT-5.6 Luna, and Grok 4.5. Unconfigured hosted providers remain disabled. The **Check all connections** button makes one minimal, project-free request to each configured model and reports each result independently. Daily coaching falls back to the scripted coach on a provider error; project setup instead shows the selected provider failure and lets the user retry or choose another model. Keys stay server-side.

Grok can also use an xAI subscription instead of `XAI_API_KEY`. Add a random `OAUTH_COOKIE_SECRET` of at least 32 characters, then choose **Connect your Grok subscription** during project setup or on the Covenant page. Device and access tokens stay in AES-GCM-sealed `HttpOnly` cookies, never reach browser JavaScript, and are never stored server-side. xAI may refuse OAuth API access for subscription tiers outside its allowlist.

For the exact request flow, data sent to each provider, error behavior, and secret boundaries, see [Coach providers](docs/COACH_PROVIDERS.md).

## Deploy to GPT Sites

This repository builds with Vinext into a Cloudflare Worker-compatible Sites artifact. Production API keys are separate from the local-only `.dev.vars` file: store `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `XAI_API_KEY` as secret runtime variables in Sites. Never add them to `.openai/hosting.json` or Git.

The complete create/build/package/private-deploy/verify/rotate workflow is in [GPT Sites deployment](docs/DEPLOYMENT.md).

## Architecture

```text
app/                         Next.js App Router screens
├── onboarding/              model-backed rendered setup conversation
├── session/[id]/            protected workbench and closeout
├── progress/                continuity, sessions, open threads
├── covenant/                editable agreement and data controls
├── api/setup/               bounded project-setup turns
└── api/coach/               server-side model adapters and connection status

components/app-provider.tsx  client state boundary
        │
        ├── lib/store/        typed localStorage repository and demo seed
        └── lib/coach/        provider interface implementations
                ├── scripted  deterministic, always available
                └── client    selected hosted model with scripted fallback
```

State is stored as one typed multi-project document under `localStorage` key `tenzon:v1`. Each project keeps its own covenant, sessions, threads, invitations, and coach preference; `activeProjectId` selects the visible project. Existing v1 documents without a per-project provider are normalized from their legacy global preference without losing nested data. Components do not access browser storage directly, so the repository can later be replaced by a remote backend. The data does not follow the user to another browser or device.

## Prototype cuts

This is deliberately a single-user prototype with multiple local projects and one active project at a time. It has no app-owned auth, remote database, cross-device synchronization, notifications, calendar, voice or dictation, payments, social accountability, mobile app, or dark mode. Hosted providers do not stream. Source material is separated visually and structurally, but this version does not provide source parsing or custody analysis. The chosen setup model proposes the near-term milestone, which can be revised in the covenant afterward; the scripted coach uses a deterministic shape-specific proposal. The Sites deployment remains private because the model endpoints spend owner-supplied credentials and do not yet have public-user quotas.
