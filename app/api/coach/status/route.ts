import { NextResponse } from 'next/server';
import { COACH_MODELS } from '@/lib/coach/models';

export function GET() {
  return NextResponse.json({
    providers: COACH_MODELS.map(({ id, label, vendor, envKey }) => ({
      id, label, vendor, configured: Boolean(process.env[envKey]),
    })),
  });
}
