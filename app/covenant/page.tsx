'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { useApp } from '@/components/app-provider';
import { useModalDialog } from '@/components/use-modal-dialog';
import { CoachProviderPicker } from '@/components/coach-provider-picker';
import * as repo from '@/lib/store/repo';
import type { Covenant } from '@/lib/types';

type EditKey = 'ambition' | 'why' | 'milestone' | 'ownership' | 'schedule' | 'tone' | null;
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function CovenantPage() { return <AppShell><CovenantGate /></AppShell>; }

function CovenantGate() {
  const { project } = useApp();
  if (!project) return null;
  return <CovenantContent project={project} />;
}

function CovenantContent({ project }: { project: NonNullable<ReturnType<typeof useApp>['project']> }) {
  const { state, revise, deleteCurrentProject, setCoachProvider } = useApp();
  const router = useRouter();
  const [draft, setDraft] = useState<Covenant>(project.covenant);
  const [editing, setEditing] = useState<EditKey>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelDelete = useCallback(() => setConfirmDelete(false), []);
  const deleteDialogRef = useModalDialog(confirmDelete, cancelDelete, deleteTriggerRef);

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
      <CoachProviderPicker selected={project.coachProvider} onChange={setCoachProvider} />
    </section>
    <section className="data-controls" aria-labelledby="data-title"><div><h2 id="data-title" className="display">Your data</h2><p>All projects are stored in this browser. A hosted coach receives only the context needed for the selected request.</p></div><div><button className="button button-secondary" onClick={() => repo.exportState(state)}>Export all projects</button><button ref={deleteTriggerRef} className="quiet danger" onClick={() => setConfirmDelete(true)}>Delete this project</button></div></section>
    {confirmDelete && <div className="dialog-backdrop"><section ref={deleteDialogRef} tabIndex={-1} className="dialog enter" role="dialog" aria-modal="true" aria-labelledby="delete-title"><p className="eyebrow">This cannot be undone</p><h2 id="delete-title" className="display delete-title">Delete this project and every session in it?</h2><p className="delete-copy">Your other projects will remain. Export first if any part of this work should remain.</p><div className="delete-actions"><button className="quiet" onClick={cancelDelete}>Keep the project</button><button className="button delete-button" onClick={() => { const hasAnother = deleteCurrentProject(); router.push(hasAnother ? '/' : '/onboarding'); }}>Delete this project</button></div></section></div>}
  </main>;
}

function split(value: string): string[] { return value.split(',').map((item) => item.trim()).filter(Boolean); }

function CovenantSection({ label, editing, onEdit, onSave, children }: { label: string; editing: boolean; onEdit: () => void; onSave: () => void; children: React.ReactNode }) { return <section className="document-section"><div className="document-label"><span>{label}</span><button className="quiet" onClick={editing ? onSave : onEdit}>{editing ? 'save' : 'revise'}</button></div>{children}</section>; }
