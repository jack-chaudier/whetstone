'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/app-provider';
import { ScriptedCoachProvider } from '@/lib/coach/scripted.mjs';
import type { CoachTone, Covenant, ProjectShape } from '@/lib/types';

const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const shapeCopy: { value: ProjectShape; title: string; text: string }[] = [
  { value: 'make', title: 'Make', text: 'A novel, composition, drawing, or other work that only exists if you make it.' },
  { value: 'learn', title: 'Learn', text: 'A subject you want available inside your own mind, not merely explained to you.' },
  { value: 'investigate', title: 'Investigate', text: 'A question that deserves evidence, judgment, and a claim you can defend.' },
];
const toneCopy: { value: CoachTone; title: string; text: string }[] = [
  { value: 'warm', title: 'Warm', text: 'We can make the beginning gentler without making the work smaller.' },
  { value: 'dry', title: 'Dry', text: 'The notes have been organized. The scene remains unwritten.' },
  { value: 'firm', title: 'Firm', text: 'You chose this edge. Stay with it for ten minutes.' },
];

const defaultShape: ProjectShape = 'make';
const defaultTone: CoachTone = 'dry';

interface Draft {
  ambition: string; why: string; shape: ProjectShape; existing: string; obstacle: string;
  days: number[]; minutes: number; window: string; humanOwned: string; delegable: string; tone: CoachTone;
}

const initial: Draft = { ambition: '', why: '', shape: defaultShape, existing: '', obstacle: '', days: [1, 4, 6], minutes: 30, window: 'evening', humanOwned: 'final prose, creative decisions', delegable: 'formatting, organizing notes', tone: defaultTone };

export default function OnboardingPage() {
  const { ready, project, seedDemo, create } = useApp();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(initial);
  const [working, setWorking] = useState(false);
  useEffect(() => { if (ready && project) router.replace('/'); }, [ready, project, router]);

  const covenant = useMemo<Covenant>(() => ({
    ambition: draft.ambition.trim(), why: draft.why.trim(), shape: draft.shape,
    existing: draft.existing.trim(), obstacle: draft.obstacle.trim(),
    humanOwned: draft.humanOwned.split(',').map((item) => item.trim()).filter(Boolean),
    delegable: draft.delegable.split(',').map((item) => item.trim()).filter(Boolean),
    schedule: { days: draft.days, window: draft.window, minutes: draft.minutes }, tone: draft.tone,
    milestone: draft.shape === 'make'
      ? 'Finish the first small piece of the work — one scene, sketch, or passage — imperfect and complete'
      : draft.shape === 'learn'
        ? 'Reach the first real demonstration: explain the core idea unaided and apply it once'
        : 'Form one claim grounded in evidence you inspected yourself',
    createdAt: new Date().toISOString(),
  }), [draft]);

  function nextAllowed(): boolean {
    if (step === 0) return draft.ambition.trim().length > 3;
    if (step === 1) return draft.why.trim().length > 3;
    if (step === 3) return draft.existing.trim().length > 1;
    if (step === 4) return draft.obstacle.trim().length > 1;
    if (step === 5) return draft.days.length > 0;
    if (step === 6) return covenant.humanOwned.length > 0;
    return true;
  }

  async function confirm() {
    setWorking(true);
    const skeleton = { id: 'onboarding', covenant, invitations: [], sessions: [], threads: [], createdAt: covenant.createdAt };
    const invitation = await new ScriptedCoachProvider().generateInvitation(skeleton, { missedLastScheduled: false });
    create(covenant, invitation);
    router.push('/');
  }

  function chooseDemo() { seedDemo(); router.push('/'); }
  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((current) => ({ ...current, [key]: value })); }

  const steps = [
    <Question key="ambition" title="What have you wanted to make real?" note="Not an obligation. The work you would mind losing.">
      <textarea className="field onboarding-input" rows={3} autoFocus value={draft.ambition} onChange={(event) => update('ambition', event.target.value)} placeholder="Write a fantasy novel" />
      <button className="quiet demo-link" onClick={chooseDemo}>Explore with a demo project</button>
    </Question>,
    <Question key="why" title="Why does this matter to you?" note="Your words. Tenzon will return them to you when the plan gets noisy.">
      <textarea className="field onboarding-input" rows={3} autoFocus value={draft.why} onChange={(event) => update('why', event.target.value)} placeholder="Because this idea has followed me for years" />
    </Question>,
    <Question key="shape" title="What shape does the work take?" note="This changes what counts as meaningful progress.">
      <div className="choice-grid">{shapeCopy.map((item) => <ChoiceCard key={item.value} selected={draft.shape === item.value} title={item.title} text={item.text} onClick={() => update('shape', item.value)} />)}</div>
    </Question>,
    <Question key="existing" title="What already exists?" note="Fragments count. So do false starts and inconvenient notes.">
      <textarea className="field onboarding-input" rows={3} autoFocus value={draft.existing} onChange={(event) => update('existing', event.target.value)} placeholder="Character notes, a rough opening, three abandoned scenes" />
    </Question>,
    <Question key="obstacle" title="What has kept you from returning?" note="Be specific. The coach can work with an honest pattern.">
      <textarea className="field onboarding-input" rows={3} autoFocus value={draft.obstacle} onChange={(event) => update('obstacle', event.target.value)} placeholder="I replace difficult scenes with more planning" />
    </Question>,
    <Question key="schedule" title="What time is genuinely available?" note="An honest covenant is more useful than an ambitious fiction.">
      <div className="schedule-fields"><div><span className="eyebrow">Days</span><div className="day-picker">{dayLabels.map((label, index) => <button key={index} aria-label={['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][index]} aria-pressed={draft.days.includes(index)} onClick={() => update('days', draft.days.includes(index) ? draft.days.filter((day) => day !== index) : [...draft.days, index])}>{label}</button>)}</div></div><label><span className="eyebrow">Minutes</span><select className="field" value={draft.minutes} onChange={(event) => update('minutes', Number(event.target.value))}><option value={15}>15</option><option value={25}>25</option><option value={30}>30</option><option value={45}>45</option><option value={60}>60</option></select></label><label><span className="eyebrow">Window</span><select className="field" value={draft.window} onChange={(event) => update('window', event.target.value)}><option>morning</option><option>afternoon</option><option>evening</option></select></label></div>
    </Question>,
    <Question key="ownership" title="What must remain yours?" note="Separate items with commas. Delegation stays explicit.">
      <label className="stacked-label"><span className="eyebrow">Human-owned</span><input className="field" value={draft.humanOwned} onChange={(event) => update('humanOwned', event.target.value)} /></label><div className="chip-preview">{covenant.humanOwned.map((item) => <span key={item}>{item}</span>)}</div><label className="stacked-label"><span className="eyebrow">May be delegated</span><input className="field" value={draft.delegable} onChange={(event) => update('delegable', event.target.value)} /></label>
    </Question>,
    <Question key="tone" title="How should the coach speak to you?" note="The pressure changes. The respect does not.">
      <div className="choice-grid">{toneCopy.map((item) => <ChoiceCard key={item.value} selected={draft.tone === item.value} title={item.title} text={`“${item.text}”`} onClick={() => update('tone', item.value)} />)}</div>
    </Question>,
    <Question key="summary" title="This is your covenant" note="A direction, a boundary, and a plausible way back.">
      <article className="covenant-preview surface"><p className="display covenant-ambition">{covenant.ambition}</p><p>{covenant.why}</p><dl><div><dt>For now</dt><dd>{covenant.milestone}</dd></div><div><dt>The work remains human</dt><dd>{covenant.humanOwned.join(', ')}</dd></div><div><dt>Tenzon may help with</dt><dd>{covenant.delegable.join(', ') || 'nothing delegated yet'}</dd></div><div><dt>The honest schedule</dt><dd>{covenant.schedule.days.length} days each week, {covenant.schedule.window}, about {covenant.schedule.minutes} minutes</dd></div></dl></article>
    </Question>,
  ];

  return <main className="onboarding"><div className="onboarding-top"><span className="wordmark">Tenzon<span className="wordmark-dot">.</span></span><div className="progress-dots" aria-label={`Step ${step + 1} of ${steps.length}`}>{steps.map((_, index) => <span key={index} className={index === step ? 'active' : index < step ? 'done' : ''} />)}</div></div><div className="onboarding-body enter">{steps[step]}</div><div className="onboarding-actions">{step > 0 ? <button className="quiet" onClick={() => setStep((current) => current - 1)}>Back</button> : <span />}{step < steps.length - 1 ? <button className="button button-primary" disabled={!nextAllowed()} onClick={() => setStep((current) => current + 1)}>Continue</button> : <button className="button button-primary" disabled={working} onClick={confirm}>{working ? 'Preparing the first invitation' : 'Keep this covenant'}</button>}</div></main>;
}

function Question({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return <section aria-labelledby="question"><h1 id="question" className="display onboarding-question">{title}</h1><p className="onboarding-note">{note}</p><div className="onboarding-control">{children}</div></section>;
}

function ChoiceCard({ selected, title, text, onClick }: { selected: boolean; title: string; text: string; onClick: () => void }) {
  return <button className={`choice-card surface ${selected ? 'selected' : ''}`} aria-label={`${title}: ${text}`} aria-pressed={selected} onClick={onClick}><strong>{title}</strong><span>{text}</span></button>;
}
