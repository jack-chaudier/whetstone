import type { AppState, Covenant, DeclineReason, Invitation, InvitationDraft, Project, RecoveryReason, Session } from '@/lib/types';
import { localDate, sessionDate, shiftDate, uid, wordCount } from '@/lib/utils';

export const STORE_KEY = 'whetstone:v1';
export const EMPTY_STATE: AppState = { version: 1, projects: [], activeProjectId: null };

function canStore(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadState(): AppState {
  if (!canStore()) return EMPTY_STATE;
  const raw = window.localStorage.getItem(STORE_KEY);
  if (!raw) return EMPTY_STATE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidState(parsed)) return EMPTY_STATE;
    return { ...parsed, version: 1 };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(state: AppState): AppState {
  const versioned = { ...state, version: 1 } as const;
  if (canStore()) window.localStorage.setItem(STORE_KEY, JSON.stringify(versioned));
  return versioned;
}

export function clearState(): AppState {
  if (canStore()) window.localStorage.removeItem(STORE_KEY);
  return EMPTY_STATE;
}

export function activeProject(state: AppState): Project | null {
  return state.projects.find((project) => project.id === state.activeProjectId) ?? null;
}

export function createProject(state: AppState, covenant: Covenant, firstDraft: InvitationDraft): AppState {
  const projectId = uid('project');
  const project: Project = {
    id: projectId,
    covenant,
    invitations: [draftToInvitation(firstDraft, projectId, localDate())],
    sessions: [],
    threads: [],
    createdAt: new Date().toISOString(),
  };
  return saveState({ version: 1, projects: [...state.projects, project], activeProjectId: projectId });
}

export function replaceWithProject(project: Project): AppState {
  return saveState({ version: 1, projects: [project], activeProjectId: project.id });
}

export function todayInvitation(project: Project): Invitation | null {
  return project.invitations.find((invitation) => invitation.date === localDate()) ?? null;
}

export function draftToInvitation(draft: InvitationDraft, projectId: string, date: string): Invitation {
  return { id: uid('invitation'), projectId, date, ...draft, status: 'pending', declineReason: null };
}

function updateProject(state: AppState, projectId: string, mutate: (project: Project) => Project): AppState {
  return saveState({ ...state, projects: state.projects.map((project) => project.id === projectId ? mutate(project) : project) });
}

export function addInvitation(state: AppState, projectId: string, draft: InvitationDraft, date: string): AppState {
  return updateProject(state, projectId, (project) => ({ ...project, invitations: [...project.invitations.filter((item) => item.date !== date), draftToInvitation(draft, projectId, date)] }));
}

export function ensureTodayInvitation(state: AppState, projectId: string, draft: InvitationDraft, date = localDate()): AppState {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project || project.invitations.some((invitation) => invitation.date === date)) return state;
  return addInvitation(state, projectId, draft, date);
}

export function missedYesterday(project: Project, today = localDate()): boolean {
  const yesterday = shiftDate(-1, new Date(`${today}T12:00:00`));
  if (sessionDate(project.createdAt) > yesterday) return false;
  const yesterdayInvitation = project.invitations.find((item) => item.date === yesterday);
  const completedYesterday = project.sessions.some((session) => sessionDate(session.startedAt) === yesterday && session.endedAt);
  return !completedYesterday && yesterdayInvitation?.status !== 'declined';
}

export function resizeInvitation(state: AppState, projectId: string, invitationId: string): AppState {
  return updateProject(state, projectId, (project) => ({
    ...project,
    invitations: project.invitations.map((invitation) => invitation.id === invitationId ? {
      ...invitation,
      action: invitation.action.replace(/\b300\b/, '150').replace(/\bthree\b/i, 'one'),
      stopCondition: `Stop after one clear beat. ${invitation.stopCondition}`,
      scopeMinutes: Math.max(10, Math.round(invitation.scopeMinutes / 2)),
    } : invitation),
  }));
}

export function declineInvitation(state: AppState, projectId: string, invitationId: string, reason: DeclineReason): AppState {
  return updateProject(state, projectId, (project) => ({
    ...project,
    invitations: project.invitations.map((invitation) => invitation.id === invitationId ? { ...invitation, status: 'declined', declineReason: reason } : invitation),
  }));
}

export function recordRecovery(state: AppState, reason: RecoveryReason): AppState {
  return saveState({ ...state, recoveryReason: reason });
}

export function startSession(state: AppState, projectId: string, invitationId: string, kind: Session['kind']): { state: AppState; session: Session } {
  const existing = state.projects
    .find((project) => project.id === projectId)
    ?.sessions.find((session) => session.invitationId === invitationId && !session.endedAt);
  if (existing) return { state, session: existing };
  const session: Session = {
    id: uid('session'), projectId, invitationId, startedAt: new Date().toISOString(),
    work: '', sources: '', wordsProduced: 0, coachExchanges: [], kind,
  };
  return { state: updateProject(state, projectId, (project) => ({ ...project, sessions: [...project.sessions, session] })), session };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidProject(value: unknown): value is Project {
  return isRecord(value)
    && typeof value.id === 'string'
    && isRecord(value.covenant)
    && Array.isArray(value.invitations)
    && Array.isArray(value.sessions)
    && Array.isArray(value.threads)
    && typeof value.createdAt === 'string';
}

function isValidState(value: unknown): value is Omit<AppState, 'version'> & { version?: 1 } {
  if (!isRecord(value) || (value.version !== undefined && value.version !== 1)) return false;
  if (!Array.isArray(value.projects) || !value.projects.every(isValidProject)) return false;
  return value.activeProjectId === null || typeof value.activeProjectId === 'string';
}

export function saveSessionDraft(state: AppState, sessionId: string, work: string, sources: string, coachExchanges?: Session['coachExchanges']): AppState {
  const project = state.projects.find((item) => item.sessions.some((session) => session.id === sessionId));
  if (!project) return state;
  return updateProject(state, project.id, (current) => ({
    ...current,
    sessions: current.sessions.map((session) => session.id === sessionId ? {
      ...session, work, sources, wordsProduced: wordCount(work), coachExchanges: coachExchanges ?? session.coachExchanges,
    } : session),
  }));
}

export function endSession(state: AppState, sessionId: string, reflection: { changed: string; surprised: string }, reentry: string): AppState {
  const project = state.projects.find((item) => item.sessions.some((session) => session.id === sessionId));
  if (!project) return state;
  const session = project.sessions.find((item) => item.id === sessionId);
  if (!session) return state;
  const threadText = reflection.surprised.trim();
  return updateProject(state, project.id, (current) => ({
    ...current,
    sessions: current.sessions.map((item) => item.id === sessionId ? { ...item, endedAt: new Date().toISOString(), reflection, reentry } : item),
    invitations: current.invitations.map((item) => item.id === session.invitationId ? { ...item, status: 'accepted' } : item),
    threads: threadText && /\b(may|might|could|perhaps|question|wonder)\b/i.test(threadText)
      ? [...current.threads, { id: uid('thread'), projectId: current.id, text: threadText, status: 'open', createdAt: new Date().toISOString() }]
      : current.threads,
  }));
}

export function updateCovenant(state: AppState, projectId: string, covenant: Covenant): AppState {
  return updateProject(state, projectId, (project) => ({ ...project, covenant }));
}

export function toggleThread(state: AppState, projectId: string, threadId: string): AppState {
  return updateProject(state, projectId, (project) => ({
    ...project,
    threads: project.threads.map((thread) => thread.id === threadId ? { ...thread, status: thread.status === 'open' ? 'resolved' : 'open' } : thread),
  }));
}

export function exportState(state: AppState): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `whetstone-${localDate()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
