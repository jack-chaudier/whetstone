import type { AssistLevel, CoachProviderId, InvitationDraft, Project, Session } from '@/lib/types';
import { ScriptedCoachProvider } from '@/lib/coach/scripted.mjs';

const scripted = new ScriptedCoachProvider();

async function callApi<T>(body: object): Promise<T> {
  const response = await fetch('/api/coach', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('Coach API request failed');
  return response.json() as Promise<T>;
}

export async function generateInvitation(project: Project, missedLastScheduled: boolean, provider: CoachProviderId): Promise<InvitationDraft> {
  if (provider !== 'scripted') {
    try { return await callApi<InvitationDraft>({ action: 'invitation', project, missedLastScheduled, provider }); } catch { /* scripted fallback */ }
  }
  return scripted.generateInvitation(project, { missedLastScheduled });
}

export async function assist(project: Project, session: Session, ask: string, level: AssistLevel, provider: CoachProviderId): Promise<string> {
  if (provider !== 'scripted') {
    try { return (await callApi<{ text: string }>({ action: 'assist', project, session, ask, level, provider })).text; } catch { /* scripted fallback */ }
  }
  return scripted.assist(project, session, ask, level);
}

export async function closeoutQuestion(project: Project, session: Session, provider: CoachProviderId): Promise<string> {
  if (provider !== 'scripted') {
    try { return (await callApi<{ text: string }>({ action: 'closeout', project, session, provider })).text; } catch { /* scripted fallback */ }
  }
  return scripted.closeoutQuestion(project, session);
}
