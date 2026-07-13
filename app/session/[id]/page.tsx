'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/components/app-provider';
import { ProjectGuard } from '@/components/project-guard';
import { useModalDialog } from '@/components/use-modal-dialog';
import { assist, generateInvitation } from '@/lib/coach/client';
import type { AssistLevel, CoachMessage, Project } from '@/lib/types';
import { wordCount } from '@/lib/utils';
import { nextScheduledDayAfter } from '@/lib/store/repo';

export default function SessionPage() {
  return <ProjectGuard><Workbench /></ProjectGuard>;
}

function Workbench() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { project, saveDraft, finish, schedule } = useApp();
  const session = project?.sessions.find((item) => item.id === params.id);
  const invitation = project?.invitations.find((item) => item.id === session?.invitationId);
  const [work, setWork] = useState(session?.work ?? '');
  const [sources, setSources] = useState(session?.sources ?? '');
  const [messages, setMessages] = useState<CoachMessage[]>(session?.coachExchanges ?? []);
  const [ask, setAsk] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [closeout, setCloseout] = useState(false);
  const coachMessagesRef = useRef<HTMLDivElement>(null);
  const endSessionRef = useRef<HTMLButtonElement>(null);
  const saveDraftRef = useRef(saveDraft);
  const closeCloseout = useCallback(() => setCloseout(false), []);
  const sessionId = session?.id;
  const sessionStartedAt = session?.startedAt;

  useEffect(() => {
    if (!sessionStartedAt) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(sessionStartedAt).getTime()) / 1000)));
    tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  }, [sessionStartedAt]);

  useEffect(() => {
    if (!sessionId) return;
    const timer = window.setTimeout(() => saveDraftRef.current(sessionId, work, sources, messages), 650);
    return () => window.clearTimeout(timer);
  }, [work, sources, messages, sessionId]);

  useEffect(() => {
    const messageList = coachMessagesRef.current;
    if (!messageList) return;
    messageList.scrollTo({ top: messageList.scrollHeight, behavior: 'smooth' });
  }, [messages, waiting]);

  async function requestHelp(level: AssistLevel) {
    if (!project || !session || waiting) return;
    const now = new Date().toISOString();
    const userText = ask.trim() || ({ nudge: 'I need a nudge.', question: 'Ask me one question.', options: 'Give me three directions.' }[level]);
    const nextMessages: CoachMessage[] = [...messages, { role: 'user', text: userText, at: now }];
    setMessages(nextMessages); setAsk(''); setWaiting(true);
    const currentSession = { ...session, work, sources, wordsProduced: wordCount(work), coachExchanges: nextMessages };
    const text = await assist(project, currentSession, userText, level, project.coachProvider);
    setMessages([...nextMessages, { role: 'coach', text, at: new Date().toISOString() }]);
    setWaiting(false);
  }

  if (!project || !session || !invitation) return <main className="page"><h1 className="display">This session is no longer here.</h1><button className="quiet" onClick={() => router.replace('/')}>Return to Today</button></main>;
  const minutes = Math.max(1, Math.round(elapsed / 60));
  const label = project.covenant.shape === 'make' ? 'Your draft' : project.covenant.shape === 'learn' ? 'Your working' : 'Your notes & claims';

  return <main className={`workbench ${railOpen ? '' : 'rail-collapsed'}`}>
    <header className="workbench-header"><div><span className="eyebrow">Today’s edge</span><h1 className="display">{invitation.action}</h1><p>{invitation.stopCondition}</p></div><div className="session-meta"><span className="mono">{formatElapsed(elapsed)}</span><span className="mono">{wordCount(work)} words</span><button ref={endSessionRef} className="button button-secondary" onClick={() => setCloseout(true)}>End session</button></div></header>
    <section className="bench" aria-labelledby="bench-label"><div className="bench-heading"><label id="bench-label" htmlFor="work-editor" className="eyebrow">{label}</label>{!railOpen && <button className="quiet" onClick={() => setRailOpen(true)}>Open sources and coach</button>}</div><textarea id="work-editor" value={work} onChange={(event) => setWork(event.target.value)} placeholder="Begin badly. That’s allowed." spellCheck className="work-editor" /></section>
    {railOpen && <aside className="right-rail"><div className="rail-title"><span className="eyebrow">Workbench context</span><button className="quiet" onClick={() => setRailOpen(false)}>Collapse</button></div><section className="source-panel"><label htmlFor="sources" className="eyebrow">Sources <span>imported material</span></label><textarea id="sources" value={sources} onChange={(event) => setSources(event.target.value)} placeholder="Paste sources, quotations, prior notes, or problem text here." /></section><section className="coach-panel"><h2 className="eyebrow">Coach</h2><div ref={coachMessagesRef} className="coach-messages" aria-live="polite">{messages.length === 0 ? <p className="coach-quiet">Quiet by default. Ask only when the work needs a way forward.</p> : messages.map((message, index) => <div key={`${message.at}-${index}`} className={message.role}><span>{message.role === 'coach' ? 'Tenzon' : 'You'}</span><p>{message.text}</p></div>)}{waiting && <p className="coach-quiet">Considering the smallest useful intervention.</p>}</div><label htmlFor="coach-ask" className="sr-only">Ask the coach</label><textarea id="coach-ask" className="field coach-ask" rows={2} value={ask} onChange={(event) => setAsk(event.target.value)} placeholder="Add context, if useful" /><div className="assist-buttons"><button onClick={() => requestHelp('nudge')} disabled={waiting}>Nudge me</button><button onClick={() => requestHelp('question')} disabled={waiting}>Ask me a question</button><button onClick={() => requestHelp('options')} disabled={waiting}>Give me three directions</button></div></section></aside>}
    {closeout && <CloseoutDialog triggerRef={endSessionRef} words={wordCount(work)} minutes={minutes} onCancel={closeCloseout} onFinish={async (reflection, reentry) => { saveDraft(session.id, work, sources, messages); const updatedSession = { ...session, work, sources, wordsProduced: wordCount(work), coachExchanges: messages, reflection, reentry, endedAt: new Date().toISOString() }; const updatedProject: Project = { ...project, sessions: project.sessions.map((item) => item.id === session.id ? updatedSession : item) }; const nextDate = nextScheduledDayAfter(project.covenant); const draft = nextDate ? await generateInvitation(updatedProject, false, project.coachProvider) : null; finish(session.id, reflection, reentry); if (draft && nextDate) schedule(draft, nextDate); router.push('/'); }} />}
  </main>;
}

function formatElapsed(seconds: number): string { const minutes = Math.floor(seconds / 60); const rest = seconds % 60; return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`; }

function CloseoutDialog({ triggerRef, words, minutes, onCancel, onFinish }: { triggerRef: RefObject<HTMLButtonElement | null>; words: number; minutes: number; onCancel: () => void; onFinish: (reflection: { changed: string; surprised: string }, reentry: string) => Promise<void> }) {
  const [step, setStep] = useState(0); const [changed, setChanged] = useState(''); const [surprised, setSurprised] = useState(''); const [reentry, setReentry] = useState(''); const [saving, setSaving] = useState(false);
  const dialogRef = useModalDialog(true, onCancel, triggerRef);
  const title = ['What changed in the work?', 'What surprised you?', 'Where would you re-enter next time?'][step];
  const placeholders = ['One honest sentence is enough.', 'A turn, resistance, or possibility.', 'Leave yourself a precise way back in.'];
  const value = [changed, surprised, reentry][step];
  function setValue(next: string) { if (step === 0) setChanged(next); else if (step === 1) setSurprised(next); else setReentry(next); }
  async function advance() { if (step < 2) setStep(step + 1); else { setSaving(true); await onFinish({ changed, surprised }, reentry); } }
  return <div className="dialog-backdrop" role="presentation"><section ref={dialogRef} tabIndex={-1} className="dialog closeout-dialog enter" role="dialog" aria-modal="true" aria-labelledby="closeout-title"><div className="closeout-progress"><span className="eyebrow">Closeout {step + 1} of 3</span><button className="quiet" onClick={onCancel}>Return to session</button></div>{step === 0 && <div className="closeout-stats"><span className="mono">{words} words</span><span className="mono">{minutes} minutes</span></div>}<h2 id="closeout-title" className="display">{title}</h2><textarea className="field" rows={3} value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholders[step]} /><div className="closeout-actions"><button className="quiet" onClick={advance}>{step < 2 ? 'Skip' : 'Leave this open'}</button><button className="button button-primary" disabled={saving} onClick={advance}>{saving ? 'Preparing the next invitation' : step < 2 ? 'Continue' : 'Save and close'}</button></div></section></div>;
}
