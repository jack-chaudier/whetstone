import { coachModel, type CoachModel } from '@/lib/coach/models';
import { messageText, providerHttpStatus } from '@/lib/coach/server';
import { cookieValue, getSubscriptionToken, refreshSubscriptionToken } from '@/lib/coach/xai-oauth';
import type { ApiCoachProvider } from '@/lib/types';

interface CallOptions {
  maxTokens: number;
  system: string;
}

export class ProviderAccessError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export interface ProviderCaller {
  entry: CoachModel;
  call: (prompt: string, options: CallOptions) => Promise<string>;
  setCookie: () => string | undefined;
}

/** Resolves credentials and preserves the xAI subscription refresh/retry contract for any model-backed route. */
export async function createProviderCaller(request: Request, provider: ApiCoachProvider): Promise<ProviderCaller> {
  const entry = coachModel(provider);
  let credential: string | undefined;
  let refreshedCookie: string | undefined;

  if (provider === 'xai-oauth') {
    const subscription = await getSubscriptionToken(request);
    if (!subscription) {
      const hadCookie = cookieValue(request, 'xai_oauth') !== null;
      throw new ProviderAccessError(
        hadCookie ? 401 : 503,
        hadCookie ? 'Reconnect Grok to continue.' : 'Grok subscription is not connected.',
      );
    }
    credential = subscription.token;
    refreshedCookie = subscription.setCookie;
  } else if (entry.envKey) {
    credential = process.env[entry.envKey];
  }

  if (!credential) throw new ProviderAccessError(503, `${entry.vendor} is not configured`);

  async function call(prompt: string, options: CallOptions): Promise<string> {
    try {
      return await messageText(provider, prompt, credential as string, options);
    } catch (error) {
      if (provider !== 'xai-oauth') throw error;
      if (providerHttpStatus(error) === 403) {
        throw new ProviderAccessError(403, 'Your xAI subscription tier was refused for OAuth API access.');
      }
      if (providerHttpStatus(error) !== 401) throw error;
    }

    const refreshed = await refreshSubscriptionToken(request);
    if (!refreshed) throw new ProviderAccessError(401, 'Reconnect Grok to continue.');
    credential = refreshed.token;
    refreshedCookie = refreshed.setCookie;
    try {
      return await messageText(provider, prompt, credential, options);
    } catch (error) {
      if (providerHttpStatus(error) === 401) throw new ProviderAccessError(401, 'Reconnect Grok to continue.');
      if (providerHttpStatus(error) === 403) {
        throw new ProviderAccessError(403, 'Your xAI subscription tier was refused for OAuth API access.');
      }
      throw error;
    }
  }

  return { entry, call, setCookie: () => refreshedCookie };
}
