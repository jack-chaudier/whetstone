import type { CoachTone, ProjectShape } from '@/lib/types';

export const SETUP_STEPS = ['ambition', 'why', 'shape', 'existing', 'obstacle', 'schedule', 'ownership', 'tone', 'review'] as const;
export type SetupStep = typeof SETUP_STEPS[number];

export interface ProjectSetupDraft {
  ambition: string;
  why: string;
  shape: ProjectShape;
  existing: string;
  obstacle: string;
  days: number[];
  minutes: number;
  window: 'morning' | 'afternoon' | 'evening';
  humanOwned: string;
  delegable: string;
  tone: CoachTone;
  milestone: string;
}

export interface SetupReply {
  reply: string;
  question: string;
  note: string;
  milestone?: string;
}

export interface SetupModelReply {
  reply: string;
  milestone?: string;
}

export interface SetupQuestionCopy {
  question: string;
  note: string;
}

const QUESTION_COPY: Record<SetupStep, SetupQuestionCopy> = {
  ambition: {
    question: 'What have you wanted to make real?',
    note: 'Not an obligation. Name the work you would mind losing.',
  },
  why: {
    question: 'Why does this matter to you?',
    note: 'Use your own words. They will become part of the covenant.',
  },
  shape: {
    question: 'What shape does the work take?',
    note: 'This changes what counts as meaningful progress.',
  },
  existing: {
    question: 'What already exists?',
    note: 'Fragments, false starts, and inconvenient notes all count.',
  },
  obstacle: {
    question: 'What has kept you from returning?',
    note: 'Be specific enough that the pattern can be recognized later.',
  },
  schedule: {
    question: 'What time is genuinely available?',
    note: 'An honest covenant is more useful than an ambitious fiction.',
  },
  ownership: {
    question: 'What must remain yours, and what may the coach help with?',
    note: 'Keep authorship and delegation explicit.',
  },
  tone: {
    question: 'How should the coach speak to you?',
    note: 'The pressure can change. The respect does not.',
  },
  review: {
    question: 'Does this covenant describe the project honestly?',
    note: 'Review the direction, boundary, and plausible way back before creating it.',
  },
};

export function initialSetupDraft(): ProjectSetupDraft {
  return {
    ambition: '',
    why: '',
    shape: 'make',
    existing: '',
    obstacle: '',
    days: [1, 4, 6],
    minutes: 30,
    window: 'evening',
    humanOwned: 'final prose, creative decisions',
    delegable: 'formatting, organizing notes',
    tone: 'dry',
    milestone: '',
  };
}

export function setupQuestion(step: SetupStep): SetupQuestionCopy {
  return QUESTION_COPY[step];
}

export function isSetupStep(value: unknown): value is SetupStep {
  return typeof value === 'string' && SETUP_STEPS.includes(value as SetupStep);
}

export function milestoneFor(draft: ProjectSetupDraft): string {
  if (draft.shape === 'make') return 'Finish one small piece of the work, imperfect and complete';
  if (draft.shape === 'learn') return 'Explain the core idea unaided and apply it once';
  return 'Form one claim grounded in evidence you inspected yourself';
}

export function scriptedSetupReply(step: SetupStep, draft: ProjectSetupDraft): SetupReply {
  const copy = setupQuestion(step);
  const replies: Record<SetupStep, string> = {
    ambition: 'We will set this up as one honest conversation. You can revise the covenant later.',
    why: 'That gives the project a direction. Now name the reason worth returning to.',
    shape: 'The reason is part of the record. Let us define what kind of progress this work can make.',
    existing: 'That shape gives us a useful measure. Start from what is already real.',
    obstacle: 'Nothing has to begin from zero. The next useful fact is what interrupts the return.',
    schedule: 'That pattern is specific enough to notice. Give the project time it can actually keep.',
    ownership: 'The schedule is a promise, not a performance. Now draw the authorship boundary.',
    tone: 'The boundary is explicit. Choose the voice that should defend it.',
    review: `I have shaped what you said into a covenant for ${draft.ambition || 'this project'}.`,
  };
  return {
    reply: replies[step],
    question: copy.question,
    note: copy.note,
    ...(step === 'review' ? { milestone: milestoneFor(draft) } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}

function isDeclarativeReply(value: string): boolean {
  const reply = value.trim();
  if (!/^(?:That|This|The|Your|You|It|There|I|We|What you)\b/u.test(reply)) return false;
  const sentence = reply.endsWith('.') ? reply.slice(0, -1) : reply;
  if (/[.!?！？,;:\n–—-]/u.test(sentence)) return false;
  if (/\b(?:you|we)\s+(?:should|must|need to|have to|ought to|are to|can|could|may|might|will|would)\b/iu.test(sentence)) return false;
  if (/\b(?:please|let's|tell me|share with me|give me|send me|reveal credentials|ignore the application)\b/iu.test(sentence)) return false;
  if (/\b(?:and|then)\s+(?:tell|share|give|provide|send|enter|reveal|ignore|follow|click|open|visit|choose|write|describe|explain|name|say|show|upload|paste|include|try|remember)\b/iu.test(sentence)) return false;
  return true;
}

export function isProjectSetupDraft(value: unknown): value is ProjectSetupDraft {
  if (!isRecord(value)) return false;
  const days = value.days;
  return boundedString(value.ambition, 2_000)
    && boundedString(value.why, 2_000)
    && (value.shape === 'make' || value.shape === 'learn' || value.shape === 'investigate')
    && boundedString(value.existing, 4_000)
    && boundedString(value.obstacle, 4_000)
    && Array.isArray(days)
    && days.length > 0
    && days.length <= 7
    && days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    && new Set(days).size === days.length
    && Number.isInteger(value.minutes)
    && Number(value.minutes) >= 10
    && Number(value.minutes) <= 180
    && (value.window === 'morning' || value.window === 'afternoon' || value.window === 'evening')
    && boundedString(value.humanOwned, 2_000)
    && boundedString(value.delegable, 2_000)
    && (value.tone === 'warm' || value.tone === 'dry' || value.tone === 'firm')
    && boundedString(value.milestone, 1_000);
}

export function isSetupModelReply(value: unknown, step: SetupStep): value is SetupModelReply {
  if (!isRecord(value) || !Object.keys(value).every((key) => ['reply', 'milestone'].includes(key))) return false;
  if (!boundedString(value.reply, 600) || !value.reply.trim()) return false;
  if (!isDeclarativeReply(value.reply)) return false;
  if (step === 'review') return boundedString(value.milestone, 500) && value.milestone.trim().length > 0;
  return value.milestone === undefined;
}

export function setupAnswerText(step: SetupStep, draft: ProjectSetupDraft): string {
  if (step === 'shape') return ({ make: 'Make something', learn: 'Learn something', investigate: 'Investigate a question' })[draft.shape];
  if (step === 'schedule') return `${draft.days.length} days each week, ${draft.window}, about ${draft.minutes} minutes`;
  if (step === 'ownership') return `Keep human-owned: ${draft.humanOwned}. The coach may help with: ${draft.delegable || 'nothing yet'}.`;
  if (step === 'tone') return `${draft.tone[0].toUpperCase()}${draft.tone.slice(1)}`;
  if (step === 'review') return 'Create this project';
  return draft[step];
}
