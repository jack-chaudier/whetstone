import { NextResponse } from 'next/server';
import { deviceCookie, isXaiOAuthConfigured, XAI_OAUTH } from '@/lib/coach/xai-oauth';

export const dynamic = 'force-dynamic';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function verificationUri(payload: Record<string, unknown>): string | null {
  const candidate = typeof payload.verification_uri_complete === 'string'
    ? payload.verification_uri_complete
    : payload.verification_uri;
  if (typeof candidate !== 'string') return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && (url.hostname === 'x.ai' || url.hostname.endsWith('.x.ai'))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export async function POST() {
  if (!isXaiOAuthConfigured()) {
    return NextResponse.json({ error: 'oauth-not-configured' }, { status: 503 });
  }

  try {
    const upstream = await fetch(XAI_OAUTH.deviceEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: XAI_OAUTH.clientId, scope: XAI_OAUTH.scopes }),
    });
    const payload: unknown = await upstream.json().catch(() => null);
    const uri = isRecord(payload) ? verificationUri(payload) : null;
    if (!upstream.ok
      || !isRecord(payload)
      || typeof payload.device_code !== 'string'
      || typeof payload.user_code !== 'string'
      || typeof payload.expires_in !== 'number'
      || !Number.isFinite(payload.expires_in)
      || payload.expires_in <= 0
      || (payload.interval !== undefined && (typeof payload.interval !== 'number' || !Number.isFinite(payload.interval)))
      || !uri) {
      return NextResponse.json({ error: 'device-authorization-failed' }, { status: 502 });
    }

    const interval = Math.max(1, typeof payload.interval === 'number' ? payload.interval : 5);
    const expiresAt = Date.now() + payload.expires_in * 1000;
    const response = NextResponse.json({
      userCode: payload.user_code,
      verificationUri: uri,
      expiresIn: payload.expires_in,
      interval,
    });
    response.headers.append('set-cookie', await deviceCookie({
      device_code: payload.device_code,
      interval,
      expires_at: expiresAt,
    }));
    return response;
  } catch {
    return NextResponse.json({ error: 'device-authorization-failed' }, { status: 502 });
  }
}
