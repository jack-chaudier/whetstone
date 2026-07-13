import { NextResponse } from 'next/server';
import { COACH_MODELS } from '@/lib/coach/models';
import { connectionFailure, probeConnection, providerHttpStatus, type ConnectionStatus } from '@/lib/coach/server';
import { getSubscriptionToken, isXaiOAuthConfigured } from '@/lib/coach/xai-oauth';
import type { ApiCoachProvider } from '@/lib/types';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'cache-control': 'no-store, max-age=0' };
type ProviderCheckStatus = 'configured' | 'oauth_access_refused' | ConnectionStatus;

interface ProviderStatus {
  id: ApiCoachProvider;
  label: string;
  vendor: string;
  model: string;
  configured: boolean;
  status: ProviderCheckStatus;
  checkedAt?: string;
  latencyMs?: number;
}

interface Configuration {
  providers: ProviderStatus[];
  oauthConfigured: boolean;
  oauthToken?: string;
  setCookie?: string;
}

async function configuredProviders(request: Request): Promise<Configuration> {
  const subscription = isXaiOAuthConfigured() ? await getSubscriptionToken(request) : null;
  return {
    oauthConfigured: isXaiOAuthConfigured(),
    oauthToken: subscription?.token,
    setCookie: subscription?.setCookie,
    providers: COACH_MODELS.map(({ id, label, vendor, model, envKey }) => {
      const configured = id === 'xai-oauth' ? Boolean(subscription) : Boolean(envKey && process.env[envKey]);
      return { id, label, vendor, model, configured, status: configured ? 'configured' : 'missing' };
    }),
  };
}

function responseWithCookie(body: unknown, setCookie?: string): NextResponse {
  const response = NextResponse.json(body, { headers: NO_STORE_HEADERS });
  if (setCookie) response.headers.append('set-cookie', setCookie);
  return response;
}

export async function GET(request: Request) {
  const configuration = await configuredProviders(request);
  return responseWithCookie(
    { providers: configuration.providers, oauthConfigured: configuration.oauthConfigured },
    configuration.setCookie,
  );
}

export async function POST(request: Request) {
  const checkedAt = new Date().toISOString();
  const configuration = await configuredProviders(request);
  const checks = await Promise.allSettled(COACH_MODELS.map(async ({ id, label, vendor, model, envKey }) => {
    const credential = id === 'xai-oauth' ? configuration.oauthToken : envKey ? process.env[envKey] : undefined;
    if (!credential) {
      return { id, label, vendor, model, configured: false, status: 'missing' as const, checkedAt };
    }

    const started = Date.now();
    try {
      await probeConnection(id, credential);
      return {
        id, label, vendor, model, configured: true, status: 'connected' as const,
        checkedAt, latencyMs: Date.now() - started,
      };
    } catch (error) {
      const status = id === 'xai-oauth' && providerHttpStatus(error) === 403
        ? 'oauth_access_refused' as const
        : connectionFailure(error);
      return {
        id, label, vendor, model, configured: true, status,
        checkedAt, latencyMs: Date.now() - started,
      };
    }
  }));

  const providers = checks.map((result, index): ProviderStatus => result.status === 'fulfilled'
    ? result.value
    : {
        ...configuration.providers[index],
        status: 'provider_error',
        checkedAt,
      });

  return responseWithCookie(
    { providers, checkedAt, oauthConfigured: configuration.oauthConfigured },
    configuration.setCookie,
  );
}
