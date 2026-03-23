import fs from 'node:fs';
import { GARMIN_STEPS_CSV_PATH } from './config';
import { parseCsvRecords } from './csv';
import { ensureAppDb, hasExistingDailySteps, insertSyncRun, upsertDailySteps } from './db';
import type { DailyStepsRecord, SourceSyncSummary } from './types';

type GarminCsvRow = Record<string, string>;

export function syncGarmin(triggerType = 'manual'): SourceSyncSummary {
  ensureAppDb();
  const startedAt = new Date().toISOString();
  const csvPath = GARMIN_STEPS_CSV_PATH;

  if (!csvPath) {
    return blockedSummary(
      triggerType,
      startedAt,
      'GARMIN_STEPS_CSV_PATH is not configured. Local app refresh/export discovery is still required.',
    );
  }

  if (!fs.existsSync(csvPath)) {
    return blockedSummary(
      triggerType,
      startedAt,
      `Configured GARMIN_STEPS_CSV_PATH does not exist: ${csvPath}`,
    );
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsvRecords(content);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let lastRecordAt: string | null = null;

  for (const row of rows) {
    const record = normalizeGarminRow(row, csvPath);
    if (!record) {
      skipped += 1;
      continue;
    }

    const existedBefore = hasExistingDailySteps('garmin', record.stepDate);
    upsertDailySteps(record);
    if (existedBefore) {
      updated += 1;
    } else {
      inserted += 1;
    }
    lastRecordAt = `${record.stepDate}T00:00:00.000Z`;
  }

  const finishedAt = new Date().toISOString();
  const notes = `Imported Garmin groundwork data from ${csvPath}.${skipped > 0 ? ` Skipped ${skipped} invalid row(s).` : ''}`;
  insertSyncRun({
    source: 'garmin',
    triggerType,
    insertedCount: inserted,
    updatedCount: updated,
    scannedCount: rows.length,
    startedAt,
    finishedAt,
    notes,
  });

  return {
    source: 'garmin',
    status: 'ok',
    inserted,
    updated,
    scanned: rows.length,
    lastRecordAt,
    message: notes,
  };
}

function blockedSummary(triggerType: string, startedAt: string, message: string): SourceSyncSummary {
  const finishedAt = new Date().toISOString();
  insertSyncRun({
    source: 'garmin',
    triggerType,
    insertedCount: 0,
    updatedCount: 0,
    scannedCount: 0,
    startedAt,
    finishedAt,
    notes: message,
  });

  return {
    source: 'garmin',
    status: 'blocked',
    inserted: 0,
    updated: 0,
    scanned: 0,
    lastRecordAt: null,
    message,
  };
}

function normalizeGarminRow(row: GarminCsvRow, sourcePath: string): DailyStepsRecord | null {
  const dateValue = firstValue(row, ['date', 'day', 'step_date']);
  const stepsValue = firstValue(row, ['steps', 'step_count', 'total_steps']);
  const sourceUserId = firstValue(row, ['user_id', 'source_user_id']);
  const sourceType = firstValue(row, ['source_type', 'activity_type']) ?? 'csv-import';

  const stepDate = normalizeDate(dateValue);
  if (!stepDate) return null;

  const stepDateEpoch = Math.floor(new Date(`${stepDate}T00:00:00Z`).getTime() / 1000);
  if (!Number.isFinite(stepDateEpoch)) return null;

  return {
    source: 'garmin',
    sourceUserId: sourceUserId ?? null,
    stepDate,
    stepDateEpoch,
    steps: nullableInteger(stepsValue),
    sourceType,
    sourcePath,
    importedAt: new Date().toISOString(),
  };
}

function firstValue(row: GarminCsvRow, candidateHeaders: string[]) {
  for (const header of candidateHeaders) {
    const direct = row[header];
    if (direct) return direct.trim();

    const normalizedMatch = Object.keys(row).find((key) => normalizeHeader(key) === normalizeHeader(header));
    if (normalizedMatch && row[normalizedMatch]) {
      return row[normalizedMatch].trim();
    }
  }
  return null;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeDate(value: string | null) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function nullableInteger(value: string | null) {
  if (!value) return null;
  const numeric = Number(value.replace(/,/g, ''));
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}
