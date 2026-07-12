# Whetstone

Whetstone is an AI project steward for voluntary ambitions: the novel, subject, or question that matters even though no one else is enforcing it. It remembers the live edge of one project, prepares a small daily invitation, and treats deliberate decline and recovery as information rather than failure.

The protected workbench keeps imported sources separate from human-authored work. Its coach can nudge, ask a question, or offer intentions, but it will not produce work the covenant says must remain human. The prototype runs entirely in the browser with a deterministic scripted coach; hosted coach models are optional enhancements, not requirements.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On the first screen, create a covenant or choose the mid-flight demo project.

To use an optional hosted provider, copy `.env.example` to `.env.local` and set one or more of:

```bash
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
XAI_API_KEY=your_key_here
```

The Covenant page switcher offers Whetstone scripted, Claude Sonnet 5, GPT-5.6 Luna, and Grok 4.5. Unconfigured hosted providers remain disabled, and any provider error falls back to the scripted coach; keys stay server-side.

## Architecture

```text
app/                         Next.js App Router screens
├── onboarding/              covenant conversation
├── session/[id]/            protected workbench and closeout
├── progress/                continuity, sessions, open threads
├── covenant/                editable agreement and data controls
└── api/coach/               optional server-side model adapters

components/app-provider.tsx  client state boundary
        │
        ├── lib/store/        typed localStorage repository and demo seed
        └── lib/coach/        provider interface implementations
                ├── scripted  deterministic, always available
                └── client    selected hosted model with scripted fallback
```

State is stored as one typed document under `localStorage` key `whetstone:v1`. Components do not access browser storage directly, so the repository can later be replaced by a remote backend.

## Prototype cuts

This is deliberately a single-user, single-active-project prototype. It has no auth, remote database, notifications, calendar, voice or dictation, payments, social accountability, mobile app, or dark mode. The Anthropic provider sends compact project state but does not stream. Source material is separated visually and structurally, but v0.1 does not provide source parsing or custody analysis. The onboarding milestone is synthesized from the chosen project shape and can be revised in the covenant afterward.
