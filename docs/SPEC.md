# Whetstone — Prototype v0.1 Spec

Working prototype of the product described in `Whetstone_Project_Steward.md` (read it first — it is the source of truth for tone and intent). This spec freezes scope, architecture, and design for the first build.

## Product summary

Whetstone is an AI project steward for voluntary personal ambitions (write a novel, learn calculus, research a question). It does NOT do the meaningful work; it manages the conditions of return. Two loops:

- **Outer loop**: remembers project state between sessions, generates one small/specific/continuous daily invitation, handles deliberate decline and recovery after missed days.
- **Inner loop**: a protected workbench where the human produces the work; sources are visually and structurally separated from human-authored material; the coach stays quiet and assists without taking authorship.

Tone throughout: calm, dry, perceptive, on the user's side. Never guilt. Never streak anxiety. Continuity over perfection.

## Scope for v0.1

IN: onboarding covenant flow, Today view with daily invitation, workbench session, session closeout, invitation generation from real session state, deliberate-decline flow, recovery flow (missed day), progress/continuity view, covenant view, demo project seed, pluggable coach engine (scripted fallback + Anthropic API when key present).

OUT (do not build): auth, remote DB, push notifications, calendar integration, voice calls/dictation, payments/stakes, social accountability, mobile apps, dark mode. Single user, single active project is fine (data model supports multiple projects, UI can assume one active).

## Stack

- Next.js 15 (App Router) + TypeScript strict + Tailwind CSS v4. React 19.
- No component library (no shadcn/radix/etc). Hand-built components per the design system below. `clsx` or `tailwind-merge` allowed. No other UI deps.
- Fonts via `next/font/local`, using the bundled WOFF2 files: **Newsreader** (display serif, weights 400/500 + italic), **Inter** (UI/body), **JetBrains Mono** (mono, sparingly).
- Persistence: `localStorage` behind a repository module (`lib/store/`) so it can be swapped for a real backend later. All state client-side. Use a React context + reducer or a tiny zustand store (zustand allowed if it keeps code cleaner).
- AI: route handler `app/api/coach/route.ts` using `@anthropic-ai/sdk`, model `claude-sonnet-5`, key from `process.env.ANTHROPIC_API_KEY`. `GET /api/coach/status` reports whether a key is configured. Client coach engine calls the API when available, otherwise uses the **scripted provider** (deterministic templates — the app must be fully usable with no key).
- Must pass `npm run build` and `npm run lint`. Deployable to Vercel unmodified.

## Data model (`lib/types.ts`)

```ts
type ProjectShape = 'make' | 'learn' | 'investigate';
type CoachTone = 'warm' | 'dry' | 'firm';

interface Covenant {
  ambition: string;            // "Write a fantasy novel"
  why: string;                 // why it matters, user's words
  shape: ProjectShape;
  existing: string;            // what already exists
  obstacle: string;            // what has prevented progress
  humanOwned: string[];        // e.g. ["final prose", "creative decisions"]
  delegable: string[];         // e.g. ["formatting", "organizing notes"]
  schedule: { days: number[]; window: string; minutes: number }; // days: 0-6
  tone: CoachTone;
  milestone: string;           // near-term milestone, not a life plan
  createdAt: string;           // ISO
}

interface Invitation {
  id: string;
  projectId: string;
  date: string;                // yyyy-mm-dd
  action: string;              // the one meaningful action
  stopCondition: string;       // "stop when …"
  continuity: string;          // "Yesterday you …" — ties to last session
  scopeMinutes: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  declineReason?: 'no-time' | 'confused' | 'dread' | null;
}

interface Session {
  id: string;
  projectId: string;
  invitationId: string;
  startedAt: string;
  endedAt?: string;
  work: string;                // human-authored text from the workbench
  sources: string;             // imported material (kept separate)
  wordsProduced: number;       // delta of human words this session
  coachExchanges: CoachMessage[];
  reflection?: { changed: string; surprised: string };
  reentry?: string;            // proposed re-entry point for next time
  kind: 'work' | 'recovery';   // recovery sessions are smaller
}

interface CoachMessage { role: 'user' | 'coach'; text: string; at: string }

interface Thread {                // open questions / emerging possibilities from closeouts
  id: string; projectId: string; text: string;
  status: 'open' | 'resolved'; createdAt: string;
}

interface Project {
  id: string;
  covenant: Covenant;
  invitations: Invitation[];
  sessions: Session[];
  threads: Thread[];
  createdAt: string;
}
```

Repository (`lib/store/repo.ts`): load/save whole app state to `localStorage` key `whetstone:v1`; typed getters/mutators (createProject, todayInvitation, startSession, endSession, declineInvitation, recordRecovery…). No direct localStorage access from components.

## Coach engine (`lib/coach/`)

Provider interface:

```ts
interface CoachProvider {
  generateInvitation(project: Project, ctx: { missedYesterday: boolean }): Promise<InvitationDraft>;
  assist(project: Project, session: Session, ask: string, level: AssistLevel): Promise<string>;
  closeoutQuestion(project: Project, session: Session): Promise<string>;
}
type AssistLevel = 'nudge' | 'question' | 'options'; // never finished work
```

- **Scripted provider** (default, no key): deterministic templates keyed by `shape` and covenant/session fields. Invitations must feel specific: interpolate the milestone, last session's reflection/re-entry, obstacle. Example (make): "Yesterday you left off at: {reentry}. Tonight: {action derived from milestone}. Stop when {stopCondition}. Don't edit earlier material — that's the exit ramp you named." Provide 3–4 template variants per shape so consecutive days differ. Assist levels: nudge = a short prompt back to the work; question = one pointed question about the material; options = three *intentions* (never finished prose/answers/solutions).
- **Anthropic provider**: same interface; system prompt encodes the steward rules (never produce the human-owned artifact; assist ladder; tone from covenant; brevity — coach speaks in 1–3 sentences). Pass project state (covenant, last 2 sessions' reflections, open threads) as context. Route handler does the API call server-side; client never sees the key.
- The assist ladder is ENFORCED in code, not just prompted: the UI only offers nudge/question/options, and the API route rejects requests for finished prose with a scripted refusal referencing the covenant ("You asked me not to write this for you. What is the character afraid of?" style).

## Routes & screens

### `/onboarding` — the covenant conversation
First-run (no project in store) redirects here. NOT a form. One question per step, full-screen, centered, generous whitespace, the question set in display serif. Steps: ambition → why it matters → shape (three cards: Make / Learn / Investigate) → what already exists → what has stopped you → schedule (day picker + minutes/session + time window) → what stays human (chips, editable) → coach tone (three cards w/ sample line of coach voice in each) → covenant summary ("This is your covenant" — a beautifully typeset document-style card; confirm) → first invitation is generated and user lands on Today. Progress dots at top. Back navigation works. Also a quiet "Explore with a demo project" link on the first step which seeds the demo project (below) and jumps to Today.

### `/` — Today
The daily anchor. Layout: masthead (wordmark "Whetstone", nav: Today / Progress / Covenant), then:
- Date + short greeting line (time-of-day aware, coach-toned, no exclamation points).
- **The invitation card** (hero of the screen): continuity line ("Yesterday you…") in muted text, the action in display serif ~28px, stopping condition, scope estimate ("about 25 minutes"). Primary button "Begin" (opens workbench). Secondary quiet actions: "Make it smaller" (regenerates at ~half scope) and "Not today" (opens decline flow).
- Decline flow: inline sheet, one question — "What's true right now?" with three options (No real time today / I'm not sure what to do / I don't want to face it). Each gets a different one-line coach response and either a 10-minute micro-alternative or a graceful release ("Deliberately declined. That counts as a decision, not a failure."). Recorded on the invitation.
- **Continuity strip**: last 14 days as small squares — worked (filled), recovered (half), declined deliberately (outline), missed (empty). No counter, no streak number. Caption like "Returned 4 of the last 7 days."
- If yesterday (or more) was missed with no deliberate decline: the invitation card is replaced by a **recovery card** — softer, smaller ask ("Read your last two hundred words. Dictate nothing. Just mark where you'd re-enter." style, per shape), one question "What happened?" (chips: time / confusion / dread / life) that adjusts the recovery task. Beginning it opens the workbench in `kind: 'recovery'` with a reduced target.

### `/session/[id]` — the workbench
Focused, chrome-free (no masthead nav; a single quiet "End session" affordance). Three zones:
- **Header strip**: the action (serif), stopping condition, elapsed time (subtle, not a countdown), word count this session.
- **The bench** (center, dominant): a large clean writing surface. For `make`: text editor. For `learn`/`investigate`: same editor labeled "Your working" / "Your notes & claims". Autosaves to session on every pause (debounced). Placeholder text is coach-toned ("Begin badly. That's allowed.").
- **Right rail** (320px, collapsible): two stacked panels. (1) **Sources** — paste-in textarea, visually distinct (paper-tinted background, "imported material" label, mono-ish smaller type) — never mixed into the work area. (2) **Coach** — message list + three assist buttons: "Nudge me", "Ask me a question", "Give me three directions" and a small free-text ask. Coach replies are 1–3 sentences. If the user asks for finished work, the refusal cites the covenant.
- **End session** → closeout dialog: shows words produced + minutes, then two questions on separate steps: "What changed in the work?" and "What surprised you?" (short text inputs, skippable), then "Where would you re-enter tomorrow?" (one line). Saving: stores reflection + reentry, marks invitation accepted/complete, generates tomorrow's invitation, extracts the reflection into a Thread if it reads like an open possibility, returns to Today which now shows a quiet completed state ("Today's work is done. The world waits for you tomorrow." + words produced).

### `/progress` — continuity, not streaks
- Identity header: one synthesized sentence in display serif, e.g. "Over three weeks you returned to the novel eleven times and produced 6,400 words you didn't have before."
- Stat row (4 tiles, understated): times returned · words/artifacts produced · recoveries (returns after a miss — framed positively) · sessions at full scope.
- **Session timeline**: reverse-chron list; each entry = date, invitation action, words, reflection excerpt (serif italic), recovery entries marked with a small badge "returned".
- **Open threads**: list of Thread items ("The honest character may be more manipulative than expected") with resolve toggle.

### `/covenant`
The covenant rendered as a typeset document (serif, generous margins, feels signed): ambition, why, milestone, human-owned list, delegable list, schedule, tone. Each section has a quiet "revise" edit affordance (inline edit, saves to store). Footer: "Revised covenants are honest covenants." Also: data controls — export JSON, delete everything (confirm dialog).

## Demo project seed (`lib/store/demo.ts`)

The novel project from the doc, mid-flight so every screen has life: covenant (fantasy novel, dry tone, Mon/Tue/Thu/Sat evenings, 30 min, milestone "establish the central relationship through three exploratory scenes", humanOwned ["final prose","plot decisions"], obstacle "replacing hard scenes with worldbuilding"), ~9 sessions across the past 3 weeks (varied word counts 180–650, one recovery, two deliberate declines, one plain miss), reflections that echo the doc ("Mara's lie came easier than expected — she may have done this before"), 3 open threads, today's invitation pending: continuity "Yesterday Mara lied to her brother, but the scene ended before he reacted.", action "Write through Tomas's reaction — 300 imperfect words.", stop "Stop when Tomas decides whether to call the lie.", 30 min.

## Design system — follow precisely

The look: modern AI-lab restraint (Anthropic-adjacent) — warm paper, ink, one clay accent, serif display type, generous space. It should feel like a well-set book that happens to be software. NOT: gradients, glassmorphism, emoji in UI, drop shadows heavier than spec, rounded-full pills everywhere, blue links.

Tokens (CSS custom properties in `globals.css`, wired into Tailwind v4 `@theme`):

- `--bg: #FAF9F5` (paper) · `--surface: #FFFFFF` · `--surface-raised: #FFFFFF`
- `--ink: #191817` · `--ink-secondary: #57534A` · `--ink-faint: #8A857A`
- `--border: #E7E4DC` · `--border-strong: #D6D2C6`
- `--accent: #C15F3C` (clay) · `--accent-hover: #A94F2F` · `--accent-soft: #F7EDE7`
- `--moss: #6E7F5A` (success/worked) · `--moss-soft: #EEF1E8`
- Radii: 6 (controls), 10 (cards), 14 (hero card). Shadows: cards get `0 1px 2px rgb(25 24 23 / 0.04)`; dialogs `0 8px 30px rgb(25 24 23 / 0.10)`. Nothing else.
- Type: Newsreader for display headings, invitation actions, covenant document, reflection quotes, the identity sentence (weights 400/500, tight leading, occasionally italic for quotes). Inter 13–15px for UI, labels 12px uppercase tracking-wide `--ink-faint`. JetBrains Mono only for word counts/timers/data chips.
- Buttons: primary = ink background (#191817), paper text, radius 6, 13.5px Inter medium, subtle press state — NOT clay (clay is an accent, used for focus rings, active states, small highlights, the wordmark's period). Secondary = 1px border, transparent. Quiet = text-only, `--ink-secondary`, underline on hover.
- Motion: 160ms ease-out fades/6px slide-ups on card/dialog entry; continuity squares fill with a 240ms stagger on Progress load. No bouncing, no springs.
- The wordmark: "Whetstone" set in Newsreader 500 with a clay period → "Whetstone·" — actually render as "Whetstone" followed by a clay-colored "." Keep it small (18px) in the masthead.
- Empty/quiet states get coach-voice copy, never generic ("No sessions yet" → "Nothing yet. That's what tomorrow is for.").
- Everything keyboard-accessible; visible focus rings (2px clay, offset 2). Semantic HTML. `<main>`, headings in order.
- Max content width 720px for reading surfaces (Today, Covenant, Progress); workbench uses full width with the 720px bench centered when rail collapsed.

## Copy rules

Coach voice everywhere: calm, dry, specific, second person, no exclamation points, no emoji, no "You've got this!". Declines and misses are treated as information, not failure. All dates/times human ("Tuesday evening", "about 25 minutes").

## Quality bar / proof

- `npm run build` and `npm run lint` clean (include an eslint config).
- No `any` (except unavoidable lib edges), no dead code, no TODO comments left behind.
- Seed the demo project, click through: onboarding (fresh profile), Today → Begin → write → assist buttons → End session → closeout → Today completed state → Progress → Covenant. All functional with NO API key (scripted provider).
- README.md: what it is (2 paragraphs), run instructions, env var for Anthropic key optional, architecture map (one screen), honest list of v0.1 cuts.
