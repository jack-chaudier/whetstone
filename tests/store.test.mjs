import { beforeEach, describe, expect, test } from 'bun:test';
import { EMPTY_STATE, STORE_KEY, continuitySummary, createProject, deleteProject, loadState, selectProject, setProjectCoachProvider } from '../lib/store/repo.ts';
import { ScriptedCoachProvider } from '../lib/coach/scripted.mjs';
import { clearSetupModelOutput } from '../lib/coach/setup.ts';

const values = new Map();
const localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => { values.set(key, String(value)); },
  removeItem: (key) => { values.delete(key); },
  clear: () => values.clear(),
};

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { localStorage },
});

const covenant = {
  ambition: 'Build a second body of work',
  why: 'It should exist outside my notes',
  shape: 'make',
  existing: 'Several fragments',
  obstacle: 'Replacing decisions with planning',
  humanOwned: ['final work'],
  delegable: ['organizing notes'],
  schedule: { days: [1, 4], window: 'evening', minutes: 30 },
  tone: 'dry',
  milestone: 'Finish one small piece',
  createdAt: '2026-07-13T00:00:00.000Z',
};

const invitation = {
  action: 'Make one concrete pass.',
  stopCondition: 'Stop after one decision.',
  continuity: 'Return to the unresolved edge.',
  scopeMinutes: 30,
};

function project(id, provider = 'scripted') {
  return {
    id,
    covenant: { ...covenant, ambition: `Project ${id}` },
    coachProvider: provider,
    invitations: [],
    sessions: [],
    threads: [],
    createdAt: '2026-07-13T00:00:00.000Z',
  };
}

beforeEach(() => values.clear());

describe('multi-project repository', () => {
  test('normalizes legacy providers and repairs a dangling active project without losing nested data', () => {
    const legacy = {
      version: 1,
      activeProjectId: 'missing-project',
      coachProvider: 'openai',
      projects: [
        { ...project('one'), coachProvider: undefined, sessions: [{ sentinel: 'preserve-me' }] },
        { ...project('two'), coachProvider: undefined },
      ],
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(legacy));

    const loaded = loadState();

    expect(loaded.projects.map((item) => item.coachProvider)).toEqual(['openai', 'openai']);
    expect(loaded.activeProjectId).toBe('two');
    expect(loaded.projects[0].sessions[0].sentinel).toBe('preserve-me');
  });

  test('creating a project appends, activates, and stores its chosen model', () => {
    const existing = project('one', 'anthropic');
    const state = { ...EMPTY_STATE, projects: [existing], activeProjectId: existing.id, coachProvider: 'anthropic' };

    const next = createProject(state, covenant, invitation, 'xai');

    expect(next.projects).toHaveLength(2);
    expect(next.projects[0]).toEqual(existing);
    expect(next.activeProjectId).toBe(next.projects[1].id);
    expect(next.projects[1].coachProvider).toBe('xai');
  });

  test('selection rejects unknown IDs and model changes remain project-specific', () => {
    const state = {
      ...EMPTY_STATE,
      projects: [project('one', 'anthropic'), project('two', 'openai')],
      activeProjectId: 'one',
      coachProvider: 'anthropic',
    };

    expect(selectProject(state, 'missing')).toBe(state);
    const changed = setProjectCoachProvider(state, 'one', 'xai-oauth');
    expect(changed.projects.map((item) => item.coachProvider)).toEqual(['xai-oauth', 'openai']);
    expect(selectProject(changed, 'two').activeProjectId).toBe('two');
  });

  test('deleting the active project chooses its next neighbor, then previous, then none', () => {
    const state = {
      ...EMPTY_STATE,
      projects: [project('one'), project('two'), project('three')],
      activeProjectId: 'two',
    };

    const afterMiddle = deleteProject(state, 'two');
    expect(afterMiddle.projects.map((item) => item.id)).toEqual(['one', 'three']);
    expect(afterMiddle.activeProjectId).toBe('three');

    const afterLast = deleteProject(afterMiddle, 'three');
    expect(afterLast.activeProjectId).toBe('one');

    const empty = deleteProject(afterLast, 'one');
    expect(empty.projects).toEqual([]);
    expect(empty.activeProjectId).toBeNull();
  });

  test('deleting an inactive project preserves the active selection', () => {
    const state = {
      ...EMPTY_STATE,
      projects: [project('one'), project('two')],
      activeProjectId: 'one',
    };
    expect(deleteProject(state, 'two').activeProjectId).toBe('one');
  });
});

describe('continuity copy', () => {
  test('does not count scheduled days before the project began', () => {
    const newProject = {
      ...project('new'),
      createdAt: '2026-07-13T16:00:00.000Z',
      covenant: { ...covenant, createdAt: '2026-07-13T16:00:00.000Z' },
    };
    const entries = [
      { date: '2026-07-09', status: 'missed' },
      { date: '2026-07-13', status: 'future' },
    ];

    expect(continuitySummary(newProject, entries, 'in the last week', '2026-07-13'))
      .toBe('The first scheduled day is Monday evening.');
    expect(continuitySummary(newProject, [{ date: '2026-07-13', status: 'worked' }], 'in the last week', '2026-07-13'))
      .toBe('Returned 1 of 1 scheduled day in the last week.');
  });

  test('does not call an older project\'s open day its first scheduled day', () => {
    const olderProject = {
      ...project('older'),
      createdAt: '2026-06-01T16:00:00.000Z',
      covenant: {
        ...covenant,
        schedule: { ...covenant.schedule, days: [1] },
        createdAt: '2026-06-01T16:00:00.000Z',
      },
    };
    const entries = [
      { date: '2026-07-07', status: 'rest' },
      { date: '2026-07-08', status: 'rest' },
      { date: '2026-07-09', status: 'rest' },
      { date: '2026-07-10', status: 'rest' },
      { date: '2026-07-11', status: 'rest' },
      { date: '2026-07-12', status: 'rest' },
      { date: '2026-07-13', status: 'open' },
    ];

    expect(continuitySummary(olderProject, entries, 'in the last week', '2026-07-13'))
      .toBe('No scheduled days have elapsed in the last week.');
  });
});

describe('scripted make invitations', () => {
  test('keeps invitations distinct and artifact-neutral', async () => {
    const coach = new ScriptedCoachProvider();
    const makeProject = { ...project('make'), covenant };
    const invitations = [];

    for (let index = 0; index < 4; index += 1) {
      const draft = await coach.generateInvitation({ ...makeProject, invitations: Array.from({ length: index }) }, { missedLastScheduled: false });
      invitations.push(draft);
    }

    const recovery = await coach.generateInvitation(makeProject, { missedLastScheduled: true });
    const question = await coach.assist(makeProject, {}, '', 'question');
    const options = await coach.assist(makeProject, {}, '', 'options');

    expect(new Set(invitations.map((draft) => draft.stopCondition)).size).toBe(4);
    expect([
      ...invitations.map(({ action, stopCondition }) => `${action} ${stopCondition}`),
      recovery.action,
      question,
      options,
    ].join(' '))
      .not.toMatch(/\b(?:beat|character|prose|scene|sentence|words?)\b/iu);
  });
});

describe('guided setup model changes', () => {
  test('keeps human answers but removes the previous model\'s milestone', () => {
    const draft = {
      ambition: 'Finish and release a four-track EP',
      why: 'I want the songs to exist outside my voice memos',
      shape: 'make',
      existing: 'Two demos and one chorus',
      obstacle: 'Collecting sounds instead of arranging',
      days: [1, 4, 6],
      minutes: 30,
      window: 'evening',
      humanOwned: 'final work, creative decisions',
      delegable: 'organizing notes',
      tone: 'dry',
      milestone: 'MODEL_AUTHORED_MILESTONE',
    };

    expect(clearSetupModelOutput(draft)).toEqual({ ...draft, milestone: '' });
  });
});
