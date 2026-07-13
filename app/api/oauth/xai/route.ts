import { NextResponse } from 'next/server';
import { clearDeviceCookie, clearOAuthCookie } from '@/lib/coach/xai-oauth';

export const dynamic = 'force-dynamic';

export function DELETE() {
  const response = NextResponse.json({ status: 'disconnected' });
  response.headers.append('set-cookie', clearDeviceCookie());
  response.headers.append('set-cookie', clearOAuthCookie());
  return response;
}
