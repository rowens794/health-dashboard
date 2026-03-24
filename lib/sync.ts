import { ensureAppDb, insertSyncRun } from './db';
import { syncGarmin } from './garmin';
import { syncMyFitnessPal } from './myfitnesspal';
import { syncRenpho } from './renpho';
import type { SourceName, SourceSyncSummary, SyncAllSummary } from './types';

export async function syncAllSources(triggerType = 'manual'): Promise<SyncAllSummary> {
  ensureAppDb();
  const startedAt = new Date().toISOString();
  const results: SourceSyncSummary[] = [];

  results.push(await runSourceSync('renpho', triggerType, () => Promise.resolve(syncRenpho(triggerType))));
  results.push(await runSourceSync('myfitnesspal', triggerType, () => syncMyFitnessPal(triggerType)));
  results.push(await runSourceSync('garmin', triggerType, () => Promise.resolve(syncGarmin(triggerType))));

  const finishedAt = new Date().toISOString();

  return {
    triggerType,
    startedAt,
    finishedAt,
    ok: results.every((result) => result.status !== 'error'),
    results,
  };
}

async function runSourceSync(source: SourceName, triggerType: string, run: () => Promise<SourceSyncSummary>): Promise<SourceSyncSummary> {
  try {
    return await run();
  } catch (error) {
    const startedAt = new Date().toISOString();
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : 'Unknown sync error';
    insertSyncRun({
      source,
      triggerType,
      insertedCount: 0,
      updatedCount: 0,
      scannedCount: 0,
      startedAt,
      finishedAt,
      notes: `Sync failed: ${message}`,
    });
    return {
      source,
      status: 'error',
      inserted: 0,
      updated: 0,
      scanned: 0,
      lastRecordAt: null,
      message,
    };
  }
}
