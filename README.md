# Whetstone

Whetstone is an AI project steward for voluntary ambitions: the novel, subject, or question that matters even though no one else is enforcing it. It remembers the live edge of one project, prepares a small daily invitation, and treats deliberate decline and recovery as information rather than failure.

The protected workbench keeps imported sources separate from human-authored work. Its coach can nudge, ask a question, or offer intentions, but it will not produce work the covenant says must remain human. The prototype runs entirely in the browser with a deterministic scripted coach; Anthropic is an optional enhancement, not a requirement.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On the first screen, create a covenant or choose the mid-flight demo project.

To use the optional Anthropic provider, copy `.env.example` to `.env.local` and set:

```bash
ANTHROPIC_API_KEY=your_key_here
```

Without the variable, `/api/coach/status` reports `configured: false` and every coach action uses the scripted provider. The configured server route uses `claude-sonnet-5`; the browser never receives the key.

## Architecture

```text
app/                         Next.js App Router screens
├── onboarding/              covenant conversation
├── session/[id]/            protected workbench and closeout
├── progress/                continuity, sessions, open threads
├── covenant/                editable agreement and data controls
└── api/coach/               optional server-side Anthropic adapter

components/app-provider.tsx  client state boundary
        │
        ├── lib/store/        typed localStorage repository and demo seed
        └── lib/coach/        provider interface implementations
                ├── scripted  deterministic, always available
                └── client    Anthropic when configured, scripted fallback
```

State is stored as one typed document under `localStorage` key `whetstone:v1`. Components do not access browser storage directly, so the repository can later be replaced by a remote backend.

## Prototype cuts

This is deliberately a single-user, single-active-project prototype. It has no auth, remote database, notifications, calendar, voice or dictation, payments, social accountability, mobile app, or dark mode. The Anthropic provider sends compact project state but does not stream. Source material is separated visually and structurally, but v0.1 does not provide source parsing or custody analysis. The onboarding milestone is synthesized from the chosen project shape and can be revised in the covenant afterward.
