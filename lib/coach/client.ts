import type { AssistLevel, InvitationDraft, Project, Session } from '@/lib/types';
import { ScriptedCoachProvider } from '@/lib/coach/scripted.mjs';

const scripted = new ScriptedCoachProvider();

async function apiAvailable(): Promise<boolean> {
  try {
    const response = await fetch('/api/coach/status', { cache: 'no-store' });
    if (!response.ok) return false;
    const body = await response.json() as { configured: boolean };
    return body.configured;
  } catch {
    return false;
  }
}

async function callApi<T>(body: object): Promise<T> {
  const response = await fetch('/api/coach', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('Coach API request failed');
  return response.json() as Promise<T>;
}

export async function generateInvitation(project: Project, missedYesterday: boolean): Promise<InvitationDraft> {
  if (await apiAvailable()) {
    try { return await callApi<InvitationDraft>({ action: 'invitation', project, missedYesterday }); } catch { /* scripted fallback */ }
  }
  return scripted.generateInvitation(project, { missedYesterday });
}

export async function assist(project: Project, session: Session, ask: string, level: AssistLevel): Promise<string> {
  if (await apiAvailable()) {
    try { return (await callApi<{ text: string }>({ action: 'assist', project, session, ask, level })).text; } catch { /* scripted fallback */ }
  }
  return scripted.assist(project, session, ask, level);
}

export async function closeoutQuestion(project: Project, session: Session): Promise<string> {
  if (await apiAvailable()) {
    try { return (await callApi<{ text: string }>({ action: 'closeout', project, session })).text; } catch { /* scripted fallback */ }
  }
  return scripted.closeoutQuestion(project, session);
}
