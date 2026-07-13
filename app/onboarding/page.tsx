'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CoachProviderPicker } from '@/components/coach-provider-picker';
import { useApp } from '@/components/app-provider';
import { generateInvitation, setupTurn } from '@/lib/coach/client';
import { COACH_MODELS } from '@/lib/coach/models';
import { SETUP_STEPS, clearSetupModelOutput, initialSetupDraft, setupAnswerText, type ProjectSetupDraft, type SetupReply, type SetupStep } from '@/lib/coach/setup';
import type { CoachProviderId, CoachTone, Covenant, Project, ProjectShape } from '@/lib/types';

const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const shapeCopy: { value: ProjectShape; title: string; text: string }[] = [
  { value: 'make', title: 'Make', text: 'A novel, composition, drawing, or other work that only exists if you make it.' },
  { value: 'learn', title: 'Learn', text: 'A subject you want available inside your own mind, not merely explained to you.' },
  { value: 'investigate', title: 'Investigate', text: 'A question that deserves evidence, judgment, and a claim you can defend.' },
];
const toneCopy: { value: CoachTone; title: string; text: string }[] = [
  { value: 'warm', title: 'Warm', text: 'Make the beginning gentler without making the work smaller.' },
  { value: 'dry', title: 'Dry', text: 'Name what is true, then return to the work.' },
  { value: 'firm', title: 'Firm', text: 'Defend the edge you chose without turning it into punishment.' },
];

interface TranscriptTurn {
  id: string;
  role: 'coach' | 'user';
  text?: string;
  response?: SetupReply;
}

export default function OnboardingPage() {
  const { ready, state, seedDemo, create } = useApp();
  const router = useRouter();
  const [selectedProvider, setSelectedProvider] = useState<CoachProviderId | null>(null);
  const [stage, setStage] = useState<'choose' | 'conversation'>('choose');
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<ProjectSetupDraft>(() => initialSetupDraft());
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const requestEpochRef = useRef(0);
  const step = SETUP_STEPS[stepIndex];
  const modelLabel = providerLabel(selectedProvider);

  useEffect(() => {
    const transcript = transcriptRef.current;
    const question = questionRef.current;
    if (stage === 'conversation' && !working && turns.length > 0 && step === 'review') {
      question?.focus({ preventScroll: true });
      question?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    if (transcript) transcript.scrollTo({ top: transcript.scrollHeight, behavior: 'smooth' });
    if (stage === 'conversation' && !working && turns.length > 0) question?.focus();
  }, [stage, step, turns, working]);

  useEffect(() => () => {
    requestEpochRef.current += 1;
  }, []);

  const covenant = useMemo<Covenant>(() => ({
    ambition: draft.ambition.trim(),
    why: draft.why.trim(),
    shape: draft.shape,
    existing: draft.existing.trim(),
    obstacle: draft.obstacle.trim(),
    humanOwned: split(draft.humanOwned),
    delegable: split(draft.delegable),
    schedule: { days: draft.days, window: draft.window, minutes: draft.minutes },
    tone: draft.tone,
    milestone: draft.milestone.trim(),
    createdAt: '',
  }), [draft]);

  if (!ready) return <main className="page"><p className="display" style={{ fontSize: 24 }}>Preparing the first question.</p></main>;

  async function beginConversation() {
    if (!selectedProvider || working) return;
    const requestId = ++requestEpochRef.current;
    setWorking(true);
    setError(null);
    try {
      const response = await setupTurn(selectedProvider, 'ambition', draft);
      if (requestEpochRef.current !== requestId) return;
      setTurns([{ id: crypto.randomUUID(), role: 'coach', response }]);
      setStage('conversation');
      setStepIndex(0);
    } catch (caught) {
      if (requestEpochRef.current !== requestId) return;
      setError(caught instanceof Error ? caught.message : 'The selected coach could not begin setup.');
    } finally {
      if (requestEpochRef.current === requestId) setWorking(false);
    }
  }

  async function submitCurrent() {
    if (!selectedProvider || working || step === 'review') return;
    const validation = validationMessage(step, draft);
    if (validation) {
      setError(validation);
      return;
    }
    const nextStep = SETUP_STEPS[stepIndex + 1];
    const answer = setupAnswerText(step, draft).trim();
    const requestId = ++requestEpochRef.current;
    setWorking(true);
    setError(null);
    try {
      const response = await setupTurn(selectedProvider, nextStep, draft, answer);
      if (requestEpochRef.current !== requestId) return;
      if (nextStep === 'review' && response.milestone) {
        setDraft((current) => ({ ...current, milestone: response.milestone ?? current.milestone }));
      }
      setTurns((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'user', text: answer },
        { id: crypto.randomUUID(), role: 'coach', response },
      ]);
      setStepIndex((current) => current + 1);
    } catch (caught) {
      if (requestEpochRef.current !== requestId) return;
      setError(caught instanceof Error ? caught.message : `${modelLabel} could not continue setup.`);
    } finally {
      if (requestEpochRef.current === requestId) setWorking(false);
    }
  }

  async function confirmProject() {
    if (!selectedProvider || working || !draft.milestone.trim()) return;
    setWorking(true);
    setError(null);
    const createdAt = new Date().toISOString();
    const finalCovenant = { ...covenant, createdAt };
    const skeleton: Project = {
      id: 'onboarding',
      covenant: finalCovenant,
      coachProvider: selectedProvider,
      invitations: [],
      sessions: [],
      threads: [],
      createdAt,
    };
    const requestId = ++requestEpochRef.current;
    try {
      const invitation = await generateInvitation(skeleton, false, selectedProvider);
      if (requestEpochRef.current !== requestId) return;
      create(finalCovenant, invitation, selectedProvider);
      router.push('/');
    } catch {
      if (requestEpochRef.current !== requestId) return;
      setError('The covenant is ready, but the first invitation could not be prepared. Try again.');
      setWorking(false);
    }
  }

  function startOverWithAnotherModel() {
    requestEpochRef.current += 1;
    setSelectedProvider(null);
    setStage('choose');
    setStepIndex(0);
    setDraft(clearSetupModelOutput);
    setTurns([]);
    setError(null);
  }

  function chooseDemo() {
    if (working) return;
    requestEpochRef.current += 1;
    seedDemo();
    router.push('/');
  }

  function update<K extends keyof ProjectSetupDraft>(key: K, value: ProjectSetupDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  return <main className="setup-page">
    <header className="setup-header">
      {working
        ? <span className="wordmark" aria-disabled="true">Tenzon<span className="wordmark-dot">.</span></span>
        : <Link href={state.projects.length ? '/' : '/onboarding'} className="wordmark" aria-label="Tenzon home">Tenzon<span className="wordmark-dot">.</span></Link>}
      <div className="setup-header-context">
        <span className="eyebrow">New project</span>
      </div>
      {state.projects.length > 0
        ? working ? <span className="quiet" aria-disabled="true">Cancel</span> : <Link href="/" className="quiet">Cancel</Link>
        : <span />}
    </header>

    {stage === 'choose' ? <section className="setup-choose" aria-labelledby="setup-title">
      <div className="setup-intro enter"><p className="eyebrow">Tenzon</p><h1 id="setup-title" className="display">Choose who should help you set this project up.</h1><p>One conversation, nine questions. Your answers become the covenant, and you can revise it later.</p></div>
      <div className="surface setup-provider-card enter">
        <CoachProviderPicker selected={selectedProvider} onChange={setSelectedProvider} legend="Choose a setup model" disabled={working} />
      </div>
      {error && <ErrorNotice message={error} onSwitch={() => {
        setSelectedProvider(null);
        setError(null);
      }} />}
      <div className="setup-choose-actions"><button type="button" className="button button-primary" disabled={!selectedProvider || working} onClick={() => void beginConversation()}>{working ? 'Preparing the first question' : selectedProvider ? `Begin with ${modelLabel}` : 'Choose a coach'}</button>{state.projects.length === 0 && <button type="button" className="quiet" disabled={working} onClick={chooseDemo}>Explore with a demo project</button>}</div>
    </section> : <section className="setup-conversation" aria-label="Project setup conversation">
      <div ref={transcriptRef} className="setup-transcript" role="log" aria-live="polite" aria-relevant="additions text">
        <div className="setup-transcript-inner">
          {turns.map((turn, index) => {
            const isReview = step === 'review' && index === turns.length - 1 && turn.role === 'coach';
            return turn.role === 'user'
              ? <article key={turn.id} className="setup-turn setup-user-turn"><p className="eyebrow">You</p><p>{turn.text}</p></article>
              : <article key={turn.id} className={`setup-turn setup-coach-turn enter ${isReview ? 'setup-review-turn' : ''}`}><p className="eyebrow">{modelLabel}</p><p className="setup-reply">{turn.response?.reply}</p><h2 ref={index === turns.length - 1 ? questionRef : undefined} tabIndex={index === turns.length - 1 ? -1 : undefined} className="display">{turn.response?.question}</h2><p className="setup-question-note">{turn.response?.note}</p>{isReview && <CovenantReview covenant={covenant} />}</article>;
          })}
          {working && <article className="setup-turn setup-coach-turn setup-thinking"><p className="eyebrow">{modelLabel}</p><p>Preparing the next question.</p></article>}
        </div>
      </div>

      <div className="setup-composer-wrap">
        <div className="setup-composer surface">
          <p className="eyebrow">Question {stepIndex + 1} of {SETUP_STEPS.length} — {modelLabel}</p>
          <SetupControl step={step} draft={draft} covenant={covenant} update={update} disabled={working} />
          {error && <ErrorNotice message={error} onSwitch={startOverWithAnotherModel} />}
          <div className="setup-composer-actions">
            <button type="button" className="quiet" disabled={working} onClick={startOverWithAnotherModel}>Choose another model</button>
            {step === 'review'
              ? <button type="button" className="button button-primary" disabled={working || !draft.milestone.trim()} onClick={() => void confirmProject()}>{working ? 'Preparing the first invitation' : 'Create this project'}</button>
              : <button type="button" className="button button-primary" disabled={working} onClick={() => void submitCurrent()}>{working ? 'Preparing the next question' : 'Continue'}</button>}
          </div>
        </div>
      </div>
    </section>}
  </main>;
}

function SetupControl({ step, draft, covenant, update, disabled }: { step: SetupStep; draft: ProjectSetupDraft; covenant: Covenant; update: <K extends keyof ProjectSetupDraft>(key: K, value: ProjectSetupDraft[K]) => void; disabled: boolean }) {
  if (step === 'ambition' || step === 'why' || step === 'existing' || step === 'obstacle') {
    const placeholders: Record<typeof step, string> = {
      ambition: 'Finish and release a four-track EP',
      why: 'Because I want this work to exist outside my notes',
      existing: 'Fragments, rough studies, and one false start',
      obstacle: 'I replace difficult decisions with more planning',
    };
    return <label className="setup-text-control"><span className="sr-only">Answer</span><textarea className="field onboarding-input" rows={3} maxLength={step === 'existing' || step === 'obstacle' ? 4000 : 2000} value={draft[step]} disabled={disabled} onChange={(event) => update(step, event.target.value)} placeholder={placeholders[step]} /></label>;
  }

  if (step === 'shape') return <fieldset className="setup-fieldset"><legend className="sr-only">Project shape</legend><div className="choice-grid">{shapeCopy.map((item) => <ChoiceCard key={item.value} name="project-shape" selected={draft.shape === item.value} title={item.title} text={item.text} disabled={disabled} onChange={() => update('shape', item.value)} />)}</div></fieldset>;

  if (step === 'schedule') return <div className="schedule-fields"><fieldset><legend className="eyebrow">Days</legend><div className="day-picker">{dayLabels.map((label, index) => <button type="button" key={index} aria-label={dayNames[index]} aria-pressed={draft.days.includes(index)} disabled={disabled} onClick={() => update('days', draft.days.includes(index) ? draft.days.filter((day) => day !== index) : [...draft.days, index].sort())}>{label}</button>)}</div></fieldset><label><span className="eyebrow">Minutes</span><select className="field" value={draft.minutes} disabled={disabled} onChange={(event) => update('minutes', Number(event.target.value))}><option value={15}>15</option><option value={25}>25</option><option value={30}>30</option><option value={45}>45</option><option value={60}>60</option></select></label><label><span className="eyebrow">Window</span><select className="field" value={draft.window} disabled={disabled} onChange={(event) => update('window', event.target.value as ProjectSetupDraft['window'])}><option>morning</option><option>afternoon</option><option>evening</option></select></label></div>;

  if (step === 'ownership') return <div><label className="stacked-label"><span className="eyebrow">Must remain human-owned</span><input className="field" maxLength={2000} value={draft.humanOwned} disabled={disabled} onChange={(event) => update('humanOwned', event.target.value)} /></label><div className="chip-preview">{covenant.humanOwned.map((item) => <span key={item}>{item}</span>)}</div><label className="stacked-label"><span className="eyebrow">The coach may help with</span><input className="field" maxLength={2000} value={draft.delegable} disabled={disabled} onChange={(event) => update('delegable', event.target.value)} /></label></div>;

  if (step === 'tone') return <fieldset className="setup-fieldset"><legend className="sr-only">Coach tone</legend><div className="choice-grid">{toneCopy.map((item) => <ChoiceCard key={item.value} name="coach-tone" selected={draft.tone === item.value} title={item.title} text={item.text} disabled={disabled} onChange={() => update('tone', item.value)} />)}</div></fieldset>;

  return null;
}

function CovenantReview({ covenant }: { covenant: Covenant }) {
  return <div className="covenant-preview"><p className="display covenant-ambition">{covenant.ambition}</p><p>{covenant.why}</p><dl><div><dt>For now</dt><dd>{covenant.milestone}</dd></div><div><dt>The work remains human</dt><dd>{joinHuman(covenant.humanOwned)}</dd></div><div><dt>The coach may help with</dt><dd>{joinHuman(covenant.delegable) || 'nothing delegated yet'}</dd></div><div><dt>The honest schedule</dt><dd>{humanSchedule(covenant)}</dd></div><div><dt>Coach voice</dt><dd>{covenant.tone}</dd></div></dl></div>;
}

function humanSchedule(covenant: Covenant): string {
  const days = joinHuman(covenant.schedule.days.map((day) => dayNames[day]));
  const window = covenant.schedule.days.length === 1 ? covenant.schedule.window : `${covenant.schedule.window}s`;
  return `${days} ${window}, about ${covenant.schedule.minutes} minutes`;
}

function joinHuman(items: string[]): string {
  if (items.length < 2) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

function ChoiceCard({ name, selected, title, text, disabled, onChange }: { name: string; selected: boolean; title: string; text: string; disabled: boolean; onChange: () => void }) {
  return <label className={`choice-card ${selected ? 'selected' : ''}`}><input className="sr-only" type="radio" name={name} checked={selected} disabled={disabled} onChange={onChange} /><strong>{title}</strong><span>{text}</span></label>;
}

function ErrorNotice({ message, onSwitch }: { message: string; onSwitch: () => void }) {
  return <div className="setup-error" role="alert"><p>{message}</p><button type="button" className="quiet" onClick={onSwitch}>Choose another model</button></div>;
}

function providerLabel(provider: CoachProviderId | null): string {
  if (!provider) return 'the selected coach';
  if (provider === 'scripted') return 'Tenzon scripted';
  const model = COACH_MODELS.find((entry) => entry.id === provider);
  return provider === 'xai-oauth' ? 'Grok 4.5 subscription' : model?.label ?? provider;
}

function validationMessage(step: SetupStep, draft: ProjectSetupDraft): string | null {
  if (step === 'ambition' && draft.ambition.trim().length < 4) return 'Name the project in at least a few words.';
  if (step === 'why' && draft.why.trim().length < 4) return 'Give the project one honest reason.';
  if (step === 'existing' && draft.existing.trim().length < 2) return 'Say what exists, even if the answer is “nothing yet.”';
  if (step === 'obstacle' && draft.obstacle.trim().length < 2) return 'Name the pattern that makes returning difficult.';
  if (step === 'schedule' && draft.days.length === 0) return 'Choose at least one genuinely available day.';
  if (step === 'ownership' && split(draft.humanOwned).length === 0) return 'Keep at least one part of the work explicitly human-owned.';
  return null;
}

function split(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}
