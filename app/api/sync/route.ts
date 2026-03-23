import { NextRequest, NextResponse } from 'next/server';
import { syncAllSources } from '@/lib/sync';

export async function POST(request: NextRequest) {
  try {
    const trigger = request.nextUrl.searchParams.get('trigger') ?? 'manual';
    const summary = syncAllSources(trigger);
    return NextResponse.json({ ok: summary.ok, summary }, { status: summary.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown sync error' },
      { status: 500 },
    );
  }
}
