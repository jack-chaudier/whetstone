'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { generateInvitation } from '@/lib/coach/client';
import type { AppState, Covenant, DeclineReason, InvitationDraft, Project, RecoveryReason, Session } from '@/lib/types';
import { localDate } from '@/lib/utils';
import * as repo from '@/lib/store/repo';
import { createDemoProject } from '@/lib/store/demo';

interface AppContextValue {
  state: AppState;
  project: Project | null;
  ready: boolean;
  setState: (state: AppState) => void;
  seedDemo: () => void;
  create: (covenant: Covenant, draft: InvitationDraft) => void;
  clear: () => void;
  start: (invitationId: string, kind: Session['kind']) => Session | null;
  saveDraft: (sessionId: string, work: string, sources: string, messages?: Session['coachExchanges']) => void;
  finish: (sessionId: string, reflection: { changed: string; surprised: string }, reentry: string) => void;
  decline: (invitationId: string, reason: DeclineReason) => void;
  resize: (invitationId: string) => void;
  recover: (reason: RecoveryReason) => void;
  revise: (covenant: Covenant) => void;
  toggleThread: (threadId: string) => void;
  schedule: (draft: InvitationDraft, date: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setInternalState] = useState<AppState>(repo.EMPTY_STATE);
  const [ready, setReady] = useState(false);
  const ensuringInvitations = useRef(new Set<string>());
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    queueMicrotask(() => {
      setInternalState(repo.loadState());
      setReady(true);
    });
  }, []);

  const project = useMemo(() => repo.activeProject(state), [state]);

  useEffect(() => {
    if (!ready || !project) return;
    const date = localDate();
    if (project.invitations.some((invitation) => invitation.date === date)) return;
    const key = `${project.id}:${date}`;
    if (ensuringInvitations.current.has(key)) return;
    ensuringInvitations.current.add(key);

    void generateInvitation(project, repo.missedYesterday(project, date))
      .then((draft) => {
        setInternalState((current) => {
          const currentProject = repo.activeProject(current);
          if (!currentProject || currentProject.id !== project.id) return current;
          return repo.ensureTodayInvitation(current, currentProject.id, draft, date);
        });
      })
      .catch(() => undefined)
      .finally(() => ensuringInvitations.current.delete(key));
  }, [project, ready]);

  const setState = useCallback((next: AppState) => setInternalState(next), []);
  const seedDemo = useCallback(() => setInternalState(repo.replaceWithProject(createDemoProject())), []);
  const create = useCallback((covenant: Covenant, draft: InvitationDraft) => {
    setInternalState((current) => repo.createProject(current, covenant, draft));
  }, []);
  const clear = useCallback(() => setInternalState(repo.clearState()), []);
  const start = useCallback((invitationId: string, kind: Session['kind']): Session | null => {
    const current = stateRef.current;
    const currentProject = repo.activeProject(current);
    if (!currentProject) return null;
    const result = repo.startSession(current, currentProject.id, invitationId, kind);
    stateRef.current = result.state;
    setInternalState(() => result.state);
    return result.session;
  }, []);
  const saveDraft = useCallback((sessionId: string, work: string, sources: string, messages?: Session['coachExchanges']) => {
    setInternalState((current) => repo.saveSessionDraft(current, sessionId, work, sources, messages));
  }, []);
  const finish = useCallback((sessionId: string, reflection: { changed: string; surprised: string }, reentry: string) => {
    setInternalState((current) => repo.endSession(current, sessionId, reflection, reentry));
  }, []);
  const decline = useCallback((invitationId: string, reason: DeclineReason) => {
    setInternalState((current) => {
      const currentProject = repo.activeProject(current);
      return currentProject ? repo.declineInvitation(current, currentProject.id, invitationId, reason) : current;
    });
  }, []);
  const resize = useCallback((invitationId: string) => {
    setInternalState((current) => {
      const currentProject = repo.activeProject(current);
      return currentProject ? repo.resizeInvitation(current, currentProject.id, invitationId) : current;
    });
  }, []);
  const recover = useCallback((reason: RecoveryReason) => {
    setInternalState((current) => repo.recordRecovery(current, reason));
  }, []);
  const revise = useCallback((covenant: Covenant) => {
    setInternalState((current) => {
      const currentProject = repo.activeProject(current);
      return currentProject ? repo.updateCovenant(current, currentProject.id, covenant) : current;
    });
  }, []);
  const toggleThread = useCallback((threadId: string) => {
    setInternalState((current) => {
      const currentProject = repo.activeProject(current);
      return currentProject ? repo.toggleThread(current, currentProject.id, threadId) : current;
    });
  }, []);
  const schedule = useCallback((draft: InvitationDraft, date: string) => {
    setInternalState((current) => {
      const currentProject = repo.activeProject(current);
      return currentProject ? repo.addInvitation(current, currentProject.id, draft, date) : current;
    });
  }, []);

  const value = useMemo<AppContextValue>(() => ({
    state, project, ready, setState, seedDemo, create, clear, start, saveDraft, finish,
    decline, resize, recover, revise, toggleThread, schedule,
  }), [state, project, ready, setState, seedDemo, create, clear, start, saveDraft, finish, decline, resize, recover, revise, toggleThread, schedule]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
