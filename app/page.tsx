'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { useApp } from '@/components/app-provider';
import { continuitySummary, isScheduledDay, missedLastScheduled, nextScheduledDayAfter, type ContinuityStatus } from '@/lib/store/repo';
import type { DeclineReason, Invitation, RecoveryReason } from '@/lib/types';
import { formatLongDate, localDate, sessionDate, shiftDate } from '@/lib/utils';

const declineOptions: { reason: DeclineReason; label: string; response: string }[] = [
  { reason: 'no-time', label: 'No real time today', response: 'Ten honest minutes remain available. Or leave it deliberately; either is cleaner than pretending.' },
  { reason: 'confused', label: 'I’m not sure what to do', response: 'Confusion is useful information. Make contact with the last clear edge for ten minutes.' },
  { reason: 'dread', label: 'I don’t want to face it', response: 'Fair. Read the live edge and mark one place to return. No production required.' },
];
const recoveryOptions: { reason: RecoveryReason; label: string }[] = [
  { reason: 'time', label: 'Time' }, { reason: 'confusion', label: 'Confusion' },
  { reason: 'dread', label: 'Dread' }, { reason: 'life', label: 'Life' },
];

export default function TodayPage() {
  return <AppShell><TodayContent /></AppShell>;
}

function TodayContent() {
  const { project, start, decline, resize, recover, workAnyway } = useApp();
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState<DeclineReason | null>(null);
  const [recoveryReason, setRecoveryReason] = useState<RecoveryReason | null>(null);
  const [preparing, setPreparing] = useState(false);
  if (!project) return null;
  const invitation = project.invitations.find((item) => item.date === localDate()) ?? null;
  const todaySession = invitation ? project.sessions.find((session) => session.invitationId === invitation.id && session.endedAt) : null;
  const inProgressSession = invitation ? project.sessions.find((session) => session.invitationId === invitation.id && !session.endedAt) : null;
  const scheduledToday = isScheduledDay(project.covenant, localDate());
  const needsRecovery = scheduledToday && missedLastScheduled(project);

  function begin(kind: 'work' | 'recovery' = 'work') {
    if (!invitation) return;
    const session = start(invitation.id, kind);
    if (session) router.push(`/session/${session.id}`);
  }

  function chooseDecline(reason: DeclineReason) { setDeclineReason(reason); decline(invitation?.id ?? '', reason); }
  function chooseRecovery(reason: RecoveryReason) { setRecoveryReason(reason); recover(reason); }

  return (
    <main className="page today-page">
      <header className="today-header enter"><p className="eyebrow">{formatLongDate(localDate())}</p><h1 className="display">{greeting()}</h1></header>
      {todaySession ? <CompletedState words={todaySession.wordsProduced} /> : invitation?.status === 'declined' ? (
        <DeclinedCard onBegin={() => begin('recovery')} resume={Boolean(inProgressSession)} />
      ) : needsRecovery ? (
        <RecoveryCard invitation={invitation} reason={recoveryReason} onReason={chooseRecovery} onBegin={() => begin('recovery')} resume={Boolean(inProgressSession)} />
      ) : invitation ? (
        <>
          <InvitationCard invitation={invitation} onBegin={() => begin()} onSmaller={() => resize(invitation.id)} onDecline={() => setDeclining(true)} resume={Boolean(inProgressSession)} />
          {declining && <DeclineSheet reason={declineReason} onChoose={chooseDecline} onMicro={() => begin('recovery')} onClose={() => setDeclining(false)} />}
        </>
      ) : !scheduledToday ? <RestState project={project} preparing={preparing} onWorkAnyway={async () => { setPreparing(true); await workAnyway(); setPreparing(false); }} /> : <QuietState />}
      <ContinuityStrip project={project} />
    </main>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Morning. The work is where you left it.';
  if (hour < 18) return 'Afternoon. One clear edge is enough.';
  return 'Evening. Nothing heroic is required.';
}

function InvitationCard({ invitation, onBegin, onSmaller, onDecline, resume }: { invitation: Invitation; onBegin: () => void; onSmaller: () => void; onDecline: () => void; resume: boolean }) {
  return <article className="surface hero-card invitation-card enter"><p className="continuity-line">{invitation.continuity}</p><h2 className="display invitation-action">{invitation.action}</h2><p className="stop-condition">{invitation.stopCondition}</p><p className="mono scope">about {invitation.scopeMinutes} minutes</p><div className="invitation-actions"><button className="button button-primary" onClick={onBegin}>{resume ? 'Resume' : 'Begin'}</button><button className="quiet" onClick={onSmaller}>Make it smaller</button><button className="quiet" onClick={onDecline}>Not today</button></div></article>;
}

function DeclineSheet({ reason, onChoose, onMicro, onClose }: { reason: DeclineReason | null; onChoose: (reason: DeclineReason) => void; onMicro: () => void; onClose: () => void }) {
  const selected = declineOptions.find((item) => item.reason === reason);
  return <section className="surface card decline-sheet enter" aria-labelledby="decline-title"><div className="sheet-heading"><h2 id="decline-title" className="display">What’s true right now?</h2><button className="quiet" onClick={onClose}>Close</button></div><div className="decline-options">{declineOptions.map((option) => <button key={option.reason} className={reason === option.reason ? 'selected' : ''} onClick={() => onChoose(option.reason)}>{option.label}</button>)}</div>{selected && <div className="decline-response enter"><p>{selected.response}</p><div><button className="button button-secondary" onClick={onMicro}>Take the 10-minute return</button><button className="quiet" onClick={onClose}>Deliberately declined</button></div><small>Deliberately declined. That counts as a decision, not a failure.</small></div>}</section>;
}

function RecoveryCard({ invitation, reason, onReason, onBegin, resume }: { invitation: Invitation | null; reason: RecoveryReason | null; onReason: (reason: RecoveryReason) => void; onBegin: () => void; resume: boolean }) {
  const tasks: Record<RecoveryReason, string> = { time: 'Read the last two hundred words. Mark the sentence where you would re-enter.', confusion: 'Read the last reflection. Write one question about what is unclear.', dread: 'Open the work and mark one sentence that still has life. Add nothing.', life: 'Spend ten minutes finding the edge again. Catching up is not today’s work.' };
  return <article className="surface hero-card recovery-card enter"><p className="eyebrow">A return, not a backlog</p><h2 className="display">The project went quiet. What happened?</h2><div className="recovery-options">{recoveryOptions.map((option) => <button key={option.reason} className={reason === option.reason ? 'selected' : ''} onClick={() => onReason(option.reason)}>{option.label}</button>)}</div>{reason && <div className="recovery-task enter"><p className="display">{tasks[reason]}</p><p>{invitation?.stopCondition ?? 'Stop once the work feels specific again.'}</p><button className="button button-primary" onClick={onBegin}>{resume ? 'Resume the return' : 'Begin the return'}</button><span className="mono">about 10 minutes</span></div>}</article>;
}

function DeclinedCard({ onBegin, resume }: { onBegin: () => void; resume: boolean }) {
  return <section className="surface hero-card completed-card enter"><p className="eyebrow">Today</p><h2 className="display">Deliberately declined.</h2><p>That counts as a decision, not a failure.</p><button className="button button-secondary" onClick={onBegin}>{resume ? 'Resume the 10-minute return' : 'Take the 10-minute return'}</button></section>;
}

function CompletedState({ words }: { words: number }) {
  return <section className="surface hero-card completed-card enter"><span className="completion-mark" aria-hidden="true" /><p className="eyebrow">Today</p><h2 className="display">Today’s work is done.</h2><p>The world waits for you tomorrow.</p><span className="mono">{words.toLocaleString()} human words added</span></section>;
}

function RestState({ project, preparing, onWorkAnyway }: { project: NonNullable<ReturnType<typeof useApp>['project']>; preparing: boolean; onWorkAnyway: () => Promise<void> }) {
  const nextDate = nextScheduledDayAfter(project.covenant);
  const next = nextDate
    ? `${new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(`${nextDate}T12:00:00`))} ${project.covenant.schedule.window}`
    : 'the next scheduled return';
  return <section className="rest-state enter"><p className="eyebrow">Rest day</p><h2 className="display">Nothing is asked of you today.</h2><p>The work will keep until {next}.</p><button className="quiet" disabled={preparing} onClick={onWorkAnyway}>{preparing ? 'Preparing a quiet invitation' : 'Work anyway'}</button></section>;
}

function QuietState() { return <section className="surface hero-card completed-card"><h2 className="display">Nothing prepared yet.</h2><p>The next invitation will be made from the work, not from a generic plan.</p></section>; }

function ContinuityStrip({ project }: { project: NonNullable<ReturnType<typeof useApp>['project']> }) {
  const days = Array.from({ length: 14 }, (_, index) => shiftDate(index - 13));
  const created = sessionDate(project.createdAt);
  const statuses: ContinuityStatus[] = days.map((date) => {
    if (date < created) return 'before-project';
    const session = project.sessions.find((item) => sessionDate(item.startedAt) === date && item.endedAt);
    if (session?.kind === 'recovery') return 'recovered';
    if (session) return 'worked';
    const invitation = project.invitations.find((item) => item.date === date);
    if (invitation?.status === 'declined') return 'declined';
    if (!isScheduledDay(project.covenant, date)) return 'rest';
    if (date < localDate()) return 'missed';
    return 'future';
  });
  const windowStart = shiftDate(-6);
  const recent = days.map((date, index) => ({ date, status: statuses[index] })).filter(({ date }) => date >= windowStart && date <= localDate());
  const summary = continuitySummary(project, recent, 'in the last week');
  return <section className="continuity-strip" aria-labelledby="continuity-title"><div><h2 id="continuity-title" className="eyebrow">Continuity</h2><p>{summary}</p></div><div className="continuity-squares" aria-hidden="true">{statuses.map((status, index) => <span key={days[index]} className={status} />)}</div><p className="sr-only">{summary} Unscheduled days are rest days.</p><ul className="sr-only">{statuses.map((status, index) => <li key={days[index]}>{formatLongDate(days[index])}: {status}</li>)}</ul><div className="continuity-legend"><span><i className="worked" />worked</span><span><i className="recovered" />returned</span><span><i className="declined" />declined</span><span><i className="missed" />missed</span><span><i className="rest" />rest</span></div></section>;
}
