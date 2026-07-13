import type { AppState, CoachProviderId, Covenant, DeclineReason, Invitation, InvitationDraft, Project, RecoveryReason, Session } from '@/lib/types';
import { localDate, sessionDate, shiftDate, uid, weekdayForDate, wordCount } from '@/lib/utils';

export const STORE_KEY = 'tenzon:v1';
const LEGACY_STORE_KEY = 'whetstone:v1';
export const EMPTY_STATE: AppState = { version: 1, projects: [], activeProjectId: null, coachProvider: 'scripted' };

function canStore(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function migrateLegacyState(): string | null {
  const legacy = window.localStorage.getItem(LEGACY_STORE_KEY);
  if (legacy !== null) {
    window.localStorage.setItem(STORE_KEY, legacy);
    window.localStorage.removeItem(LEGACY_STORE_KEY);
  }
  return legacy;
}

export function loadState(): AppState {
  if (!canStore()) return EMPTY_STATE;
  const raw = window.localStorage.getItem(STORE_KEY) ?? migrateLegacyState();
  if (!raw) return EMPTY_STATE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidState(parsed)) return EMPTY_STATE;
    const coachProvider = isCoachProvider(parsed.coachProvider) ? parsed.coachProvider : 'scripted';
    const projects = parsed.projects.map((project) => ({
      ...project,
      coachProvider: isCoachProvider(project.coachProvider) ? project.coachProvider : coachProvider,
    }));
    const activeProjectId = projects.some((project) => project.id === parsed.activeProjectId)
      ? parsed.activeProjectId
      : projects.at(-1)?.id ?? null;
    return { ...parsed, version: 1, projects, activeProjectId, coachProvider };
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

export function createProject(state: AppState, covenant: Covenant, firstDraft: InvitationDraft, coachProvider: CoachProviderId): AppState {
  const projectId = uid('project');
  const project: Project = {
    id: projectId,
    covenant,
    coachProvider,
    invitations: isScheduledDay(covenant, localDate()) ? [draftToInvitation(firstDraft, projectId, localDate())] : [],
    sessions: [],
    threads: [],
    createdAt: new Date().toISOString(),
  };
  return saveState({ ...state, version: 1, projects: [...state.projects, project], activeProjectId: projectId, coachProvider });
}

export function addProject(state: AppState, project: Project): AppState {
  return saveState({
    ...state,
    projects: [...state.projects.filter((item) => item.id !== project.id), project],
    activeProjectId: project.id,
    coachProvider: project.coachProvider,
  });
}

export function selectProject(state: AppState, projectId: string): AppState {
  if (state.activeProjectId === projectId || !state.projects.some((project) => project.id === projectId)) return state;
  const selected = state.projects.find((project) => project.id === projectId);
  return saveState({ ...state, activeProjectId: projectId, coachProvider: selected?.coachProvider ?? state.coachProvider });
}

export function deleteProject(state: AppState, projectId: string): AppState {
  const index = state.projects.findIndex((project) => project.id === projectId);
  if (index < 0) return state;
  const projects = state.projects.filter((project) => project.id !== projectId);
  if (state.activeProjectId !== projectId) return saveState({ ...state, projects });
  const next = projects[index] ?? projects[index - 1] ?? null;
  return saveState({
    ...state,
    projects,
    activeProjectId: next?.id ?? null,
    coachProvider: next?.coachProvider ?? state.coachProvider,
  });
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
  if (!project || !isScheduledDay(project.covenant, date) || project.invitations.some((invitation) => invitation.date === date)) return state;
  return addInvitation(state, projectId, draft, date);
}

export function isScheduledDay(covenant: Covenant, date: string): boolean {
  return covenant.schedule.days.includes(weekdayForDate(date));
}

export function lastScheduledDayBefore(covenant: Covenant, today = localDate()): string | null {
  const base = new Date(`${today}T12:00:00`);
  for (let daysAgo = 1; daysAgo <= 7; daysAgo += 1) {
    const date = shiftDate(-daysAgo, base);
    if (isScheduledDay(covenant, date)) return date;
  }
  return null;
}

export function nextScheduledDayAfter(covenant: Covenant, date = localDate()): string | null {
  const base = new Date(`${date}T12:00:00`);
  for (let daysAhead = 1; daysAhead <= 7; daysAhead += 1) {
    const candidate = shiftDate(daysAhead, base);
    if (isScheduledDay(covenant, candidate)) return candidate;
  }
  return null;
}

export type ContinuityStatus = 'worked' | 'recovered' | 'declined' | 'missed' | 'rest' | 'future' | 'open' | 'before-project';

export function continuitySummary(
  project: Pick<Project, 'covenant' | 'createdAt'>,
  entries: { date: string; status: ContinuityStatus }[],
  rangeLabel: string,
  today = localDate(),
): string {
  const created = sessionDate(project.createdAt);
  const elapsed = entries.filter(({ date, status }) => date >= created
    && date <= today
    && isScheduledDay(project.covenant, date)
    && status !== 'future'
    && status !== 'open'
    && status !== 'before-project');

  if (elapsed.length > 0) {
    const returned = elapsed.filter(({ status }) => status === 'worked' || status === 'recovered').length;
    return `Returned ${returned} of ${elapsed.length} scheduled ${elapsed.length === 1 ? 'day' : 'days'} ${rangeLabel}.`;
  }

  const firstDate = isScheduledDay(project.covenant, today)
    ? today
    : nextScheduledDayAfter(project.covenant, today);
  if (!firstDate) return 'No scheduled days are set yet.';
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(`${firstDate}T12:00:00`));
  return `The first scheduled day is ${weekday} ${project.covenant.schedule.window}.`;
}

export function missedLastScheduled(project: Project, today = localDate()): boolean {
  const scheduledDate = lastScheduledDayBefore(project.covenant, today);
  if (!scheduledDate || sessionDate(project.createdAt) > scheduledDate) return false;
  const invitation = project.invitations.find((item) => item.date === scheduledDate);
  const completed = project.sessions.some((session) => sessionDate(session.startedAt) === scheduledDate && session.endedAt);
  return !completed && invitation?.status !== 'declined';
}

export function setProjectCoachProvider(state: AppState, projectId: string, coachProvider: CoachProviderId): AppState {
  if (!state.projects.some((project) => project.id === projectId)) return state;
  return updateProject({ ...state, coachProvider }, projectId, (project) => ({ ...project, coachProvider }));
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

function isCoachProvider(value: unknown): value is CoachProviderId {
  return value === 'scripted' || value === 'anthropic' || value === 'openai' || value === 'xai' || value === 'xai-oauth';
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
  anchor.download = `tenzon-${localDate()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
