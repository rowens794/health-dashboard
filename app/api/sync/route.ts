import { NextRequest, NextResponse } from 'next/server';
import { syncRenpho } from '@/lib/renpho';

export async function POST(request: NextRequest) {
  try {
    const trigger = request.nextUrl.searchParams.get('trigger') ?? 'manual';
    const summary = syncRenpho(trigger);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown sync error' },
      { status: 500 },
    );
  }
}
