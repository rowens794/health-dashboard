import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  GARMIN_EMAIL,
  GARMIN_PASSWORD,
  GARMIN_PYTHON_PATH,
  GARMIN_SYNC_END_DATE,
  GARMIN_SYNC_START_DATE,
  GARMIN_TOKENSTORE_PATH,
} from './config';
import { ensureAppDb, hasExistingDailySteps, insertSyncRun, upsertDailySteps } from './db';
import type { DailyStepsRecord, SourceSyncSummary } from './types';

const MAX_SYNC_NOTE_LENGTH = 700;

type GarminFetchPayload = {
  ok: boolean;
  error?: string;
  startDate?: string;
  endDate?: string;
  rows?: Array<{
    date: string;
    steps: number | null;
    source_type?: string | null;
    source_user_id?: string | null;
  }>;
};

export function syncGarmin(triggerType = 'manual'): SourceSyncSummary {
  ensureAppDb();
  const startedAt = new Date().toISOString();

  if (!GARMIN_EMAIL || !GARMIN_PASSWORD) {
    return blockedSummary(
      triggerType,
      startedAt,
      'GARMIN_EMAIL and GARMIN_PASSWORD are not configured. Add them to .env.local for Garmin Connect web sync.',
    );
  }

  try {
    const payload = fetchGarminSteps();
    if (!payload.ok) {
      return blockedSummary(triggerType, startedAt, payload.error || 'Garmin fetch failed.');
    }

    const rows = payload.rows ?? [];
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let lastRecordAt: string | null = null;

    for (const row of rows) {
      const record = normalizeGarminRow(row);
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
    const notes = `Imported Garmin Connect web steps for ${payload.startDate ?? 'unknown start'} to ${payload.endDate ?? 'unknown end'} via Python client.${skipped > 0 ? ` Skipped ${skipped} invalid row(s).` : ''}`;
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
  } catch (error) {
    return blockedSummary(
      triggerType,
      startedAt,
      error instanceof Error ? error.message : 'Garmin fetch failed.',
    );
  }
}

function fetchGarminSteps(): GarminFetchPayload {
  ensurePythonEnvironment();

  const scriptPath = path.join(process.cwd(), 'scripts', 'garmin_fetch_steps.py');
  const output = execFileSync(GARMIN_PYTHON_PATH, [scriptPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      GARMIN_EMAIL,
      GARMIN_PASSWORD,
      GARMIN_TOKENSTORE: GARMIN_TOKENSTORE_PATH,
      GARMIN_SYNC_START_DATE,
      GARMIN_SYNC_END_DATE,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return JSON.parse(output) as GarminFetchPayload;
}

function ensurePythonEnvironment() {
  const pythonPath = GARMIN_PYTHON_PATH;
  if (!fs.existsSync(pythonPath)) {
    throw new Error(`Configured GARMIN_PYTHON_PATH does not exist: ${pythonPath}`);
  }
}

function blockedSummary(triggerType: string, startedAt: string, message: string): SourceSyncSummary {
  const finishedAt = new Date().toISOString();
  const normalizedMessage = normalizeSyncMessage(message);
  insertSyncRun({
    source: 'garmin',
    triggerType,
    insertedCount: 0,
    updatedCount: 0,
    scannedCount: 0,
    startedAt,
    finishedAt,
    notes: normalizedMessage,
  });

  return {
    source: 'garmin',
    status: 'blocked',
    inserted: 0,
    updated: 0,
    scanned: 0,
    lastRecordAt: null,
    message: normalizedMessage,
  };
}

function normalizeGarminRow(row: NonNullable<GarminFetchPayload['rows']>[number]): DailyStepsRecord | null {
  const stepDate = normalizeDate(row.date);
  if (!stepDate) return null;

  const stepDateEpoch = Math.floor(new Date(`${stepDate}T00:00:00Z`).getTime() / 1000);
  if (!Number.isFinite(stepDateEpoch)) return null;

  return {
    source: 'garmin',
    sourceUserId: row.source_user_id ?? null,
    stepDate,
    stepDateEpoch,
    steps: nullableInteger(row.steps),
    sourceType: row.source_type ?? 'garmin-connect-web',
    sourcePath: 'https://connect.garmin.com/',
    importedAt: new Date().toISOString(),
  };
}

function normalizeDate(value: string | null) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function nullableInteger(value: number | null | undefined) {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function normalizeSyncMessage(message: string) {
  const singleLine = message.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= MAX_SYNC_NOTE_LENGTH) return singleLine;
  return `${singleLine.slice(0, MAX_SYNC_NOTE_LENGTH)}... [truncated]`;
}
