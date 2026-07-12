'use client';

import { AppShell } from '@/components/app-shell';
import { useApp } from '@/components/app-provider';
import { formatLongDate, formatShortDate, localDate, sessionDate, shiftDate } from '@/lib/utils';

export default function ProgressPage() { return <AppShell><ProgressContent /></AppShell>; }

function ProgressContent() {
  const { project, toggleThread } = useApp();
  if (!project) return null;
  const completed = [...project.sessions].filter((session) => session.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const words = completed.reduce((sum, session) => sum + session.wordsProduced, 0);
  const recoveries = completed.filter((session) => session.kind === 'recovery').length;
  const fullScope = completed.filter((session) => session.kind === 'work' && session.wordsProduced >= 250).length;
  const first = completed.at(-1)?.startedAt ?? project.createdAt;
  const today = new Date(`${localDate()}T12:00:00`).getTime();
  const weeks = Math.max(1, Math.ceil((today - new Date(first).getTime()) / 604_800_000));
  const shapeNoun = project.covenant.shape === 'make' ? 'work' : project.covenant.shape === 'learn' ? 'subject' : 'question';
  const days = Array.from({ length: 21 }, (_, index) => shiftDate(index - 20));
  const statuses = days.map((date) => {
    const session = completed.find((item) => sessionDate(item.startedAt) === date);
    const invitation = project.invitations.find((item) => item.date === date);
    if (session?.kind === 'recovery') return 'recovered';
    if (session) return 'worked';
    if (invitation?.status === 'declined') return 'declined';
    return date < localDate() ? 'missed' : 'open';
  });

  return <main className="page progress-page">
    <header className="progress-header enter"><p className="eyebrow">What your returns have made</p><h1 className="display">Over {weeks === 1 ? 'the last week' : `${weeks} weeks`} you returned to the {shapeNoun} {returnFrequency(completed.length)} and produced {words.toLocaleString()} {plural(words, 'word')} you did not have before.</h1></header>
    <section className="stat-grid" aria-label="Progress summary"><Stat value={completed.length} label={plural(completed.length, 'time returned', 'times returned')} /><Stat value={words.toLocaleString()} label={plural(words, 'human word')} /><Stat value={recoveries} label={plural(recoveries, 'return after a miss')} /><Stat value={fullScope} label={plural(fullScope, 'session at full scope')} /></section>
    <section className="progress-continuity" aria-labelledby="pattern-title"><div><h2 id="pattern-title" className="eyebrow">The recent pattern</h2><p>Continuity includes the way back.</p></div><div className="progress-squares" aria-hidden="true">{days.map((date, index) => <span key={date} className={statuses[index] === 'open' ? '' : statuses[index]} style={{ animationDelay: `${index * 18}ms` }} />)}</div><ul className="sr-only">{days.map((date, index) => <li key={date}>{formatLongDate(date)}: {statuses[index]}</li>)}</ul></section>
    <section className="progress-section" aria-labelledby="timeline-title"><div className="section-heading"><h2 id="timeline-title" className="display">Session timeline</h2><span>{completed.length} {plural(completed.length, 'return')}</span></div>{completed.length ? <ol className="timeline">{completed.map((session) => { const invitation = project.invitations.find((item) => item.id === session.invitationId); return <li key={session.id}><div className="timeline-date"><time dateTime={session.startedAt}>{formatShortDate(sessionDate(session.startedAt))}</time>{session.kind === 'recovery' && <span className="returned-badge">returned</span>}</div><div><h3>{invitation?.action ?? 'Returned to the work'}</h3><p className="display reflection">{session.reflection?.surprised || session.reflection?.changed || 'The work moved, quietly.'}</p></div><span className="mono timeline-words">{session.wordsProduced} {plural(session.wordsProduced, 'word')}</span></li>; })}</ol> : <p className="quiet-state">Nothing yet. That’s what tomorrow is for.</p>}</section>
    <section className="progress-section threads-section" aria-labelledby="threads-title"><div className="section-heading"><h2 id="threads-title" className="display">Open threads</h2><span>possibilities, not canon</span></div>{project.threads.length ? <ul className="thread-list">{project.threads.map((thread) => <li key={thread.id} className={thread.status}><button aria-label={`${thread.status === 'open' ? 'Resolve' : 'Reopen'} thread`} onClick={() => toggleThread(thread.id)}><span /></button><p>{thread.text}</p><small>{thread.status}</small></li>)}</ul> : <p className="quiet-state">No loose threads yet. The work will make some.</p>}</section>
  </main>;
}

function Stat({ value, label }: { value: string | number; label: string }) { return <div className="surface stat"><strong className="mono">{value}</strong><span>{label}</span></div>; }

function returnFrequency(count: number): string {
  if (count === 1) return 'once';
  if (count === 2) return 'twice';
  return `${count} times`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}
