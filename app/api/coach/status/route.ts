import { NextResponse } from 'next/server';
import { COACH_MODELS } from '@/lib/coach/models';
import { connectionFailure, probeConnection, type ConnectionStatus } from '@/lib/coach/server';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'cache-control': 'no-store, max-age=0' };

interface ProviderStatus {
  id: string;
  label: string;
  vendor: string;
  model: string;
  configured: boolean;
  status: 'configured' | ConnectionStatus;
  checkedAt?: string;
  latencyMs?: number;
}

function configuredProviders(): ProviderStatus[] {
  return COACH_MODELS.map(({ id, label, vendor, model, envKey }) => {
    const configured = Boolean(process.env[envKey]);
    return { id, label, vendor, model, configured, status: configured ? 'configured' : 'missing' };
  });
}

export function GET() {
  return NextResponse.json({ providers: configuredProviders() }, { headers: NO_STORE_HEADERS });
}

export async function POST() {
  const checkedAt = new Date().toISOString();
  const checks = await Promise.allSettled(COACH_MODELS.map(async ({ id, label, vendor, model, envKey }) => {
    const apiKey = process.env[envKey];
    if (!apiKey) {
      return { id, label, vendor, model, configured: false, status: 'missing' as const, checkedAt };
    }

    const started = Date.now();
    try {
      await probeConnection(id, apiKey);
      return {
        id, label, vendor, model, configured: true, status: 'connected' as const,
        checkedAt, latencyMs: Date.now() - started,
      };
    } catch (error) {
      return {
        id, label, vendor, model, configured: true, status: connectionFailure(error),
        checkedAt, latencyMs: Date.now() - started,
      };
    }
  }));

  const providers = checks.map((result, index): ProviderStatus => result.status === 'fulfilled'
    ? result.value
    : {
        ...configuredProviders()[index],
        status: 'provider_error',
        checkedAt,
      });

  return NextResponse.json({ providers, checkedAt }, { headers: NO_STORE_HEADERS });
}
