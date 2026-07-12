import type { ApiCoachProvider } from '@/lib/types';

export interface CoachModel {
  id: ApiCoachProvider;
  label: string;
  vendor: string;
  model: string;
  envKey: 'ANTHROPIC_API_KEY' | 'OPENAI_API_KEY' | 'XAI_API_KEY';
}

export const COACH_MODELS: readonly CoachModel[] = [
  { id: 'anthropic', label: 'Claude Sonnet 5', vendor: 'Anthropic', model: 'claude-sonnet-5', envKey: 'ANTHROPIC_API_KEY' },
  { id: 'openai', label: 'GPT-5.6 Luna', vendor: 'OpenAI', model: 'gpt-5.6-luna', envKey: 'OPENAI_API_KEY' },
  { id: 'xai', label: 'Grok 4.5', vendor: 'xAI', model: 'grok-4.5', envKey: 'XAI_API_KEY' },
] as const;

export function coachModel(id: ApiCoachProvider): CoachModel {
  return COACH_MODELS.find((entry) => entry.id === id) as CoachModel;
}
