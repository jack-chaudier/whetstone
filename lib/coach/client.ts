import type { AssistLevel, CoachProviderId, InvitationDraft, Project, Session } from '@/lib/types';
import { ScriptedCoachProvider } from '@/lib/coach/scripted.mjs';
import { scriptedSetupReply, type ProjectSetupDraft, type SetupReply, type SetupStep } from '@/lib/coach/setup';

const scripted = new ScriptedCoachProvider();

async function callApi<T>(path: string, body: object): Promise<T> {
  const response = await fetch(path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : 'Coach API request failed';
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function generateInvitation(project: Project, missedLastScheduled: boolean, provider: CoachProviderId): Promise<InvitationDraft> {
  if (provider !== 'scripted') {
    try { return await callApi<InvitationDraft>('/api/coach', { action: 'invitation', project, missedLastScheduled, provider }); } catch { /* scripted fallback */ }
  }
  return scripted.generateInvitation(project, { missedLastScheduled });
}

export async function assist(project: Project, session: Session, ask: string, level: AssistLevel, provider: CoachProviderId): Promise<string> {
  if (provider !== 'scripted') {
    try { return (await callApi<{ text: string }>('/api/coach', { action: 'assist', project, session, ask, level, provider })).text; } catch { /* scripted fallback */ }
  }
  return scripted.assist(project, session, ask, level);
}

export async function closeoutQuestion(project: Project, session: Session, provider: CoachProviderId): Promise<string> {
  if (provider !== 'scripted') {
    try { return (await callApi<{ text: string }>('/api/coach', { action: 'closeout', project, session, provider })).text; } catch { /* scripted fallback */ }
  }
  return scripted.closeoutQuestion(project, session);
}

export async function setupTurn(provider: CoachProviderId, step: SetupStep, draft: ProjectSetupDraft, previousAnswer?: string): Promise<SetupReply> {
  if (provider === 'scripted') return scriptedSetupReply(step, draft);
  return callApi<SetupReply>('/api/setup', { action: 'turn', provider, step, draft, previousAnswer });
}
