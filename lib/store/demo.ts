import type { Invitation, Project, Session, Thread } from '@/lib/types';
import { shiftDate } from '@/lib/utils';

const projectId = 'demo-novel';

function pastInvitation(index: number, daysAgo: number, action: string, status: Invitation['status'] = 'accepted'): Invitation {
  return {
    id: `demo-invitation-${index}`,
    projectId,
    date: shiftDate(-daysAgo),
    action,
    stopCondition: 'Stop when the scene makes one new fact unavoidable.',
    continuity: 'The last scene left a useful discomfort behind.',
    scopeMinutes: 30,
    status,
    declineReason: status === 'declined' ? (index % 2 ? 'no-time' : 'dread') : null,
  };
}

const sessionSeeds = [
  { days: 20, words: 412, changed: 'Mara arrived before the council and chose not to enter.', surprised: 'She is more afraid of being believed than dismissed.', reentry: 'Let Tomas find her outside the chamber.' },
  { days: 18, words: 287, changed: 'Tomas found the sealed letter but did not open it.', surprised: 'His restraint reads as suspicion, not kindness.', reentry: 'Begin with Mara noticing the unbroken seal.' },
  { days: 15, words: 531, changed: 'Their argument became an exchange of favors.', surprised: 'The debt between them predates the story.', reentry: 'Name the old favor without explaining it.' },
  { days: 12, words: 180, changed: 'I found the room and the emotional temperature.', surprised: 'A quiet scene can still be hostile.', reentry: 'Return at the moment Tomas sits down.' },
  { days: 10, words: 0, changed: 'I reread the exchange and marked the weak turn.', surprised: 'The scene stalls when Mara explains herself.', reentry: 'Cut the explanation and let Tomas infer badly.', kind: 'recovery' as const },
  { days: 8, words: 648, changed: 'Mara used the old favor as leverage.', surprised: 'Tomas wanted her to ask rather than bargain.', reentry: 'Let him say what the bargain costs.' },
  { days: 5, words: 356, changed: 'Tomas named the cost and Mara refused it.', surprised: 'Her refusal protects him more than herself.', reentry: 'Follow the refusal into the corridor.' },
  { days: 3, words: 474, changed: 'The corridor scene turned into a confession that was not quite true.', surprised: 'Mara’s lie came easier than expected — she may have done this before.', reentry: 'Have Tomas decide whether he recognizes the lie.' },
  { days: 1, words: 392, changed: 'Mara lied to her brother before he could accuse her.', surprised: 'Tomas already knows enough to be dangerous.', reentry: 'Write Tomas’s first reaction to the lie.' },
];

export function createDemoProject(): Project {
  const invitations: Invitation[] = sessionSeeds.map((seed, index) =>
    pastInvitation(index, seed.days, [
      'Write Mara waiting outside the council chamber.',
      'Let Tomas find the letter and choose what not to do.',
      'Write the favor neither sibling wants to name.',
      'Set the room before either character speaks.',
      'Read the last page and mark the honest re-entry point.',
      'Write Mara using the old favor as leverage.',
      'Let Tomas name the cost of helping her.',
      'Follow Mara into the corridor without explaining her choice.',
      'Write the lie before Tomas can make his accusation.',
    ][index],
  ));

  invitations.push(
    pastInvitation(20, 17, 'Write one imperfect exchange at the chamber door.', 'declined'),
    pastInvitation(21, 7, 'Let Mara cross the corridor without revising the argument.', 'declined'),
    {
      id: 'demo-invitation-today', projectId, date: shiftDate(0),
      continuity: 'Yesterday Mara lied to her brother, but the scene ended before he reacted.',
      action: 'Write through Tomas’s reaction — 300 imperfect words.',
      stopCondition: 'Stop when Tomas decides whether to call the lie.',
      scopeMinutes: 30, status: 'pending', declineReason: null,
    },
  );

  const sessions: Session[] = sessionSeeds.map((seed, index) => ({
    id: `demo-session-${index}`,
    projectId,
    invitationId: `demo-invitation-${index}`,
    startedAt: `${shiftDate(-seed.days)}T19:30:00.000Z`,
    endedAt: `${shiftDate(-seed.days)}T20:00:00.000Z`,
    work: seed.words ? `Human-authored scene material from session ${index + 1}. `.repeat(Math.max(1, Math.ceil(seed.words / 7))).trim() : '',
    sources: index === 2 ? 'Earlier note: the siblings owe each other an unnamed debt.' : '',
    wordsProduced: seed.words,
    coachExchanges: [],
    reflection: { changed: seed.changed, surprised: seed.surprised },
    reentry: seed.reentry,
    kind: seed.kind ?? 'work',
  }));

  const threadTexts = [
    'Mara’s lie came easier than expected — she may have done this before.',
    'Tomas may want an honest request more than repayment.',
    'The old favor could implicate the council rather than the family.',
  ];
  const threads: Thread[] = threadTexts.map((text, index) => ({
    id: `demo-thread-${index}`, projectId, text, status: 'open',
    createdAt: `${shiftDate(-(8 - index))}T20:00:00.000Z`,
  }));

  return {
    id: projectId,
    covenant: {
      ambition: 'Write a fantasy novel about two siblings negotiating a dangerous inheritance',
      why: 'I want to finish a story whose characters have stayed with me for years.',
      shape: 'make',
      existing: 'Character notes, a rough opening, and fragments from three scenes.',
      obstacle: 'Replacing hard scenes with worldbuilding',
      humanOwned: ['final prose', 'plot decisions'],
      delegable: ['formatting', 'organizing notes'],
      schedule: { days: [1, 2, 4, 6], window: 'evening', minutes: 30 },
      tone: 'dry',
      milestone: 'establish the central relationship through three exploratory scenes',
      createdAt: `${shiftDate(-22)}T16:00:00.000Z`,
    },
    invitations,
    sessions,
    threads,
    createdAt: `${shiftDate(-22)}T16:00:00.000Z`,
  };
}
