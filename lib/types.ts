export type ProjectShape = 'make' | 'learn' | 'investigate';
export type CoachTone = 'warm' | 'dry' | 'firm';
export type AssistLevel = 'nudge' | 'question' | 'options';
export type DeclineReason = 'no-time' | 'confused' | 'dread';
export type RecoveryReason = 'time' | 'confusion' | 'dread' | 'life';
export type ApiCoachProvider = 'anthropic' | 'openai' | 'xai' | 'xai-oauth';
export type CoachProviderId = 'scripted' | ApiCoachProvider;

export interface Covenant {
  ambition: string;
  why: string;
  shape: ProjectShape;
  existing: string;
  obstacle: string;
  humanOwned: string[];
  delegable: string[];
  schedule: { days: number[]; window: string; minutes: number };
  tone: CoachTone;
  milestone: string;
  createdAt: string;
}

export interface Invitation {
  id: string;
  projectId: string;
  date: string;
  action: string;
  stopCondition: string;
  continuity: string;
  scopeMinutes: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  declineReason?: DeclineReason | null;
}

export interface CoachMessage {
  role: 'user' | 'coach';
  text: string;
  at: string;
}

export interface Session {
  id: string;
  projectId: string;
  invitationId: string;
  startedAt: string;
  endedAt?: string;
  work: string;
  sources: string;
  wordsProduced: number;
  coachExchanges: CoachMessage[];
  reflection?: { changed: string; surprised: string };
  reentry?: string;
  kind: 'work' | 'recovery';
}

export interface Thread {
  id: string;
  projectId: string;
  text: string;
  status: 'open' | 'resolved';
  createdAt: string;
}

export interface Project {
  id: string;
  covenant: Covenant;
  coachProvider: CoachProviderId;
  invitations: Invitation[];
  sessions: Session[];
  threads: Thread[];
  createdAt: string;
}

export interface AppState {
  version: 1;
  projects: Project[];
  activeProjectId: string | null;
  recoveryReason?: RecoveryReason;
  /** Legacy/default provider. Each project owns its actual coach preference. */
  coachProvider: CoachProviderId;
}

export interface InvitationDraft {
  action: string;
  stopCondition: string;
  continuity: string;
  scopeMinutes: number;
}

export interface CoachProvider {
  generateInvitation(project: Project, ctx: { missedLastScheduled: boolean }): Promise<InvitationDraft>;
  assist(project: Project, session: Session, ask: string, level: AssistLevel): Promise<string>;
  closeoutQuestion(project: Project, session: Session): Promise<string>;
}
