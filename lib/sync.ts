import { ensureAppDb, insertSyncRun } from './db';
import { syncGarmin } from './garmin';
import { syncMyFitnessPal } from './myfitnesspal';
import { syncRenpho } from './renpho';
import type { SourceName, SourceSyncSummary, SyncAllSummary } from './types';

export function syncAllSources(triggerType = 'manual'): SyncAllSummary {
  ensureAppDb();
  const startedAt = new Date().toISOString();
  const results: SourceSyncSummary[] = [];

  results.push(runSourceSync('renpho', triggerType, () => syncRenpho(triggerType)));
  results.push(runSourceSync('myfitnesspal', triggerType, () => syncMyFitnessPal(triggerType)));
  results.push(runSourceSync('garmin', triggerType, () => syncGarmin(triggerType)));

  const finishedAt = new Date().toISOString();

  return {
    triggerType,
    startedAt,
    finishedAt,
    ok: results.every((result) => result.status !== 'error'),
    results,
  };
}

function runSourceSync(source: SourceName, triggerType: string, run: () => SourceSyncSummary): SourceSyncSummary {
  try {
    return run();
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
