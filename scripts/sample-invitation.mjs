import { ScriptedCoachProvider } from '../lib/coach/scripted.mjs';

const project = {
  id: 'demo-novel', createdAt: new Date().toISOString(), threads: [], invitations: [{}, {}, {}],
  covenant: {
    ambition: 'Write a fantasy novel', why: 'The characters have stayed with me.', shape: 'make',
    existing: 'Character notes and a rough opening', obstacle: 'Replacing hard scenes with worldbuilding',
    humanOwned: ['final prose', 'plot decisions'], delegable: ['formatting'],
    schedule: { days: [1, 2, 4, 6], window: 'evening', minutes: 30 }, tone: 'dry',
    milestone: 'establish the central relationship through three exploratory scenes', createdAt: new Date().toISOString(),
  },
  sessions: [{ id: 'last', projectId: 'demo-novel', invitationId: 'last-invitation', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), work: 'Mara lied.', sources: '', wordsProduced: 2, coachExchanges: [], kind: 'work', reflection: { changed: 'Mara lied to her brother.', surprised: 'The lie came easily.' }, reentry: 'Write Tomas’s first reaction to the lie.' }],
};

const invitation = await new ScriptedCoachProvider().generateInvitation(project, { missedYesterday: false });
console.log(JSON.stringify(invitation, null, 2));
