'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { useApp } from '@/components/app-provider';
import { useModalDialog } from '@/components/use-modal-dialog';
import * as repo from '@/lib/store/repo';
import { COACH_MODELS } from '@/lib/coach/models';
import type { ApiCoachProvider, CoachProviderId, Covenant } from '@/lib/types';

type EditKey = 'ambition' | 'why' | 'milestone' | 'ownership' | 'schedule' | 'tone' | null;
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function CovenantPage() { return <AppShell><CovenantGate /></AppShell>; }

function CovenantGate() {
  const { project } = useApp();
  if (!project) return null;
  return <CovenantContent project={project} />;
}

function CovenantContent({ project }: { project: NonNullable<ReturnType<typeof useApp>['project']> }) {
  const { state, revise, clear, setCoachProvider } = useApp();
  const router = useRouter();
  const [draft, setDraft] = useState<Covenant>(project.covenant);
  const [editing, setEditing] = useState<EditKey>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [providerStatus, setProviderStatus] = useState<Record<ApiCoachProvider, boolean> | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelDelete = useCallback(() => setConfirmDelete(false), []);
  const deleteDialogRef = useModalDialog(confirmDelete, cancelDelete, deleteTriggerRef);

  useEffect(() => {
    let active = true;
    void fetch('/api/coach/status', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Coach status unavailable');
        return response.json() as Promise<{ providers: { id: ApiCoachProvider; configured: boolean }[] }>;
      })
      .then((body) => {
        if (active) setProviderStatus(Object.fromEntries(body.providers.map((provider) => [provider.id, provider.configured])) as Record<ApiCoachProvider, boolean>);
      })
      .catch(() => { if (active) setProviderStatus({ anthropic: false, openai: false, xai: false }); });
    return () => { active = false; };
  }, []);

  function save() { revise(draft); setEditing(null); }
  function update<K extends keyof Covenant>(key: K, value: Covenant[K]) { setDraft((current) => ({ ...current, [key]: value })); }

  return <main className="page covenant-page">
    <header className="covenant-header enter"><p className="eyebrow">The agreement beneath the plan</p><h1 className="display">Your covenant</h1><p>It can change. It should not become vague.</p></header>
    <article className="surface covenant-document enter">
      <CovenantSection label="The ambition" editing={editing === 'ambition'} onEdit={() => setEditing('ambition')} onSave={save}>{editing === 'ambition' ? <textarea className="field document-input" rows={2} value={draft.ambition} onChange={(event) => update('ambition', event.target.value)} /> : <h2 className="display">{draft.ambition}</h2>}</CovenantSection>
      <CovenantSection label="Why it matters" editing={editing === 'why'} onEdit={() => setEditing('why')} onSave={save}>{editing === 'why' ? <textarea className="field document-input" rows={3} value={draft.why} onChange={(event) => update('why', event.target.value)} /> : <p className="document-prose">{draft.why}</p>}</CovenantSection>
      <CovenantSection label="The near horizon" editing={editing === 'milestone'} onEdit={() => setEditing('milestone')} onSave={save}>{editing === 'milestone' ? <textarea className="field document-input" rows={2} value={draft.milestone} onChange={(event) => update('milestone', event.target.value)} /> : <p className="document-prose">For now, you are here to {draft.milestone}.</p>}</CovenantSection>
      <CovenantSection label="Authorship" editing={editing === 'ownership'} onEdit={() => setEditing('ownership')} onSave={save}>{editing === 'ownership' ? <div className="document-fields"><label><span>Human-owned</span><input className="field" value={draft.humanOwned.join(', ')} onChange={(event) => update('humanOwned', split(event.target.value))} /></label><label><span>Delegable</span><input className="field" value={draft.delegable.join(', ')} onChange={(event) => update('delegable', split(event.target.value))} /></label></div> : <div className="ownership-grid"><div><h3>Remains yours</h3><ul>{draft.humanOwned.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>May be delegated</h3><ul>{draft.delegable.map((item) => <li key={item}>{item}</li>)}</ul></div></div>}</CovenantSection>
      <CovenantSection label="The honest schedule" editing={editing === 'schedule'} onEdit={() => setEditing('schedule')} onSave={save}>{editing === 'schedule' ? <div className="document-fields schedule-edit"><label><span>Days, 0–6</span><input className="field" value={draft.schedule.days.join(', ')} onChange={(event) => update('schedule', { ...draft.schedule, days: event.target.value.split(',').map(Number).filter((day) => day >= 0 && day <= 6) })} /></label><label><span>Window</span><select className="field" value={draft.schedule.window} onChange={(event) => update('schedule', { ...draft.schedule, window: event.target.value })}><option>morning</option><option>afternoon</option><option>evening</option></select></label><label><span>Minutes</span><input className="field" type="number" min={10} max={180} value={draft.schedule.minutes} onChange={(event) => update('schedule', { ...draft.schedule, minutes: Number(event.target.value) })} /></label></div> : <p className="document-prose">{draft.schedule.days.map((day) => dayNames[day]).join(', ')}, in the {draft.schedule.window}, for about {draft.schedule.minutes} minutes.</p>}</CovenantSection>
      <CovenantSection label="The coach" editing={editing === 'tone'} onEdit={() => setEditing('tone')} onSave={save}>{editing === 'tone' ? <select className="field" value={draft.tone} onChange={(event) => update('tone', event.target.value as Covenant['tone'])}><option>warm</option><option>dry</option><option>firm</option></select> : <p className="document-prose">Speak with a {draft.tone} voice. Defend the covenant without turning it into a punishment.</p>}</CovenantSection>
      <footer className="covenant-signature"><span className="display">Revised covenants are honest covenants.</span><time dateTime={draft.createdAt}>Made {new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(draft.createdAt))}</time></footer>
    </article>
    <section className="coach-voice" aria-labelledby="coach-voice-title">
      <div><p className="eyebrow">THE COACH&apos;S VOICE</p><h2 id="coach-voice-title" className="display">The steward&apos;s judgment. Different minds, same covenant.</h2></div>
      <fieldset className="provider-list"><legend className="sr-only">Coach provider</legend>
        <ProviderOption id="scripted" checked={state.coachProvider === 'scripted'} onChange={setCoachProvider} label="Tenzon scripted" detail="offline, always available" />
        {COACH_MODELS.map((model) => { const configured = providerStatus?.[model.id] ?? false; return <ProviderOption key={model.id} id={model.id} checked={state.coachProvider === model.id} disabled={!configured} onChange={setCoachProvider} label={model.label} detail={model.vendor} hint={providerStatus && !configured ? `add ${model.envKey} to .env.local` : undefined} />; })}
      </fieldset>
    </section>
    <section className="data-controls" aria-labelledby="data-title"><div><h2 id="data-title" className="display">Your data</h2><p>Everything lives in this browser. Take it with you or remove it.</p></div><div><button className="button button-secondary" onClick={() => repo.exportState(state)}>Export JSON</button><button ref={deleteTriggerRef} className="quiet danger" onClick={() => setConfirmDelete(true)}>Delete everything</button></div></section>
    {confirmDelete && <div className="dialog-backdrop"><section ref={deleteDialogRef} tabIndex={-1} className="dialog enter" role="dialog" aria-modal="true" aria-labelledby="delete-title"><p className="eyebrow">This cannot be undone</p><h2 id="delete-title" className="display delete-title">Delete the project and every session?</h2><p className="delete-copy">Export first if any part of the work should remain. Tenzon has no remote copy.</p><div className="delete-actions"><button className="quiet" onClick={cancelDelete}>Keep the project</button><button className="button delete-button" onClick={() => { clear(); router.push('/onboarding'); }}>Delete everything</button></div></section></div>}
  </main>;
}

function split(value: string): string[] { return value.split(',').map((item) => item.trim()).filter(Boolean); }

function ProviderOption({ id, checked, disabled = false, onChange, label, detail, hint }: { id: CoachProviderId; checked: boolean; disabled?: boolean; onChange: (provider: CoachProviderId) => void; label: string; detail: string; hint?: string }) {
  return <label className={`provider-option ${disabled ? 'disabled' : ''}`}><input type="radio" name="coach-provider" value={id} checked={checked} disabled={disabled} onChange={() => onChange(id)} /><span><strong>{label}</strong> — {detail}{hint && <small>{hint}</small>}</span></label>;
}

function CovenantSection({ label, editing, onEdit, onSave, children }: { label: string; editing: boolean; onEdit: () => void; onSave: () => void; children: React.ReactNode }) { return <section className="document-section"><div className="document-label"><span>{label}</span><button className="quiet" onClick={editing ? onSave : onEdit}>{editing ? 'save' : 'revise'}</button></div>{children}</section>; }
