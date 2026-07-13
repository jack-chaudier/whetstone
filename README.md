# Tenzon

Tenzon is an AI project steward for voluntary ambitions: the novel, subject, or question that matters even though no one else is enforcing it. It remembers the live edge of one project, prepares a small daily invitation, and treats deliberate decline and recovery as information rather than failure.

The protected workbench keeps imported sources separate from human-authored work. Its coach can nudge, ask a question, or offer intentions, but it will not produce work the covenant says must remain human. Project state is stored in the browser, and a deterministic scripted coach keeps the product usable without any external service. Hosted coaches are optional.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On the first screen, create a covenant or choose the mid-flight demo project.

To use an optional hosted provider, copy `.env.example` to `.dev.vars` and set one or more of:

```bash
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
XAI_API_KEY=your_key_here
```

The Covenant page offers Tenzon scripted, Claude Sonnet 5, GPT-5.6 Luna, and Grok 4.5. Unconfigured hosted providers remain disabled. The **Check all connections** button makes one minimal, project-free request to each configured model and reports each result independently. Provider errors fall back to the scripted coach; keys stay server-side.

For the exact request flow, data sent to each provider, error behavior, and secret boundaries, see [Coach providers](docs/COACH_PROVIDERS.md).

## Deploy to GPT Sites

This repository builds with Vinext into a Cloudflare Worker-compatible Sites artifact. Production API keys are separate from the local-only `.dev.vars` file: store `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `XAI_API_KEY` as secret runtime variables in Sites. Never add them to `.openai/hosting.json` or Git.

The complete create/build/package/private-deploy/verify/rotate workflow is in [GPT Sites deployment](docs/DEPLOYMENT.md).

## Architecture

```text
app/                         Next.js App Router screens
├── onboarding/              covenant conversation
├── session/[id]/            protected workbench and closeout
├── progress/                continuity, sessions, open threads
├── covenant/                editable agreement and data controls
└── api/coach/               server-side model adapters and connection status

components/app-provider.tsx  client state boundary
        │
        ├── lib/store/        typed localStorage repository and demo seed
        └── lib/coach/        provider interface implementations
                ├── scripted  deterministic, always available
                └── client    selected hosted model with scripted fallback
```

State is stored as one typed document under `localStorage` key `tenzon:v1`. Components do not access browser storage directly, so the repository can later be replaced by a remote backend. The data does not follow the user to another browser or device.

## Prototype cuts

This is deliberately a single-user, single-active-project prototype. It has no app-owned auth, remote database, notifications, calendar, voice or dictation, payments, social accountability, mobile app, or dark mode. Hosted providers do not stream. Source material is separated visually and structurally, but v0.1 does not provide source parsing or custody analysis. The onboarding milestone is synthesized from the chosen project shape and can be revised in the covenant afterward. The first Sites deployment is private because the coach endpoints spend owner-supplied API keys and do not yet have public-user quotas.
