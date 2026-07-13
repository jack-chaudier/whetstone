import { NextResponse } from 'next/server';
import {
  clearDeviceCookie,
  createOAuthCookie,
  deviceCookie,
  getDeviceState,
  isXaiOAuthConfigured,
  XAI_OAUTH,
} from '@/lib/coach/xai-oauth';

export const dynamic = 'force-dynamic';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function terminal(status: 'expired' | 'denied', httpStatus = 200): NextResponse {
  const response = NextResponse.json({ status }, { status: httpStatus });
  response.headers.append('set-cookie', clearDeviceCookie());
  return response;
}

export async function POST(request: Request) {
  if (!isXaiOAuthConfigured()) {
    return NextResponse.json({ error: 'oauth-not-configured' }, { status: 503 });
  }
  const device = await getDeviceState(request);
  if (!device || device.expires_at <= Date.now()) return terminal('expired', 410);

  try {
    const upstream = await fetch(XAI_OAUTH.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: XAI_OAUTH.clientId,
        device_code: device.device_code,
      }),
    });
    const payload: unknown = await upstream.json().catch(() => null);

    if (isRecord(payload) && typeof payload.error === 'string') {
      if (payload.error === 'authorization_pending') {
        return NextResponse.json({ status: 'pending', interval: device.interval });
      }
      if (payload.error === 'slow_down') {
        const interval = device.interval + 5;
        const response = NextResponse.json({ status: 'slow-down', interval });
        response.headers.append('set-cookie', await deviceCookie({ ...device, interval }));
        return response;
      }
      if (payload.error === 'expired_token') return terminal('expired');
      if (payload.error === 'access_denied') return terminal('denied');
    }

    if (!upstream.ok
      || !isRecord(payload)
      || typeof payload.access_token !== 'string'
      || !payload.access_token
      || typeof payload.refresh_token !== 'string'
      || !payload.refresh_token
      || typeof payload.expires_in !== 'number'
      || !Number.isFinite(payload.expires_in)
      || payload.expires_in <= 0) {
      return NextResponse.json({ status: 'error' }, { status: 502 });
    }

    const response = NextResponse.json({ status: 'connected' });
    response.headers.append('set-cookie', await createOAuthCookie(
      payload.access_token,
      payload.refresh_token,
      payload.expires_in,
    ));
    response.headers.append('set-cookie', clearDeviceCookie());
    return response;
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 502 });
  }
}
