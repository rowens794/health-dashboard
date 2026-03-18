import { APP_DB_PATH, RENPHO_DB_PATH } from './config';
import { ensureAppDb, insertSyncRun, upsertMeasurement } from './db';
import { sqliteReadonlyQuery, sqliteQuery } from './sqlite';
import type { MeasurementRecord, SyncSummary } from './types';

type RenphoRow = {
  id: number;
  userId: string;
  timeStamp: string;
  weight: number | null;
  bodyfat: number | null;
  bmi: number | null;
  water: number | null;
  muscle: number | null;
  bone: number | null;
  protein: number | null;
  bmr: number | null;
  bodyage: number | null;
};

export function syncRenpho(triggerType = 'manual'): SyncSummary {
  ensureAppDb();
  const startedAt = new Date().toISOString();
  const raw = sqliteReadonlyQuery(
    RENPHO_DB_PATH,
    `
    SELECT
      id,
      userId,
      timeStamp,
      weight,
      bodyfat,
      bmi,
      water,
      muscle,
      bone,
      protein,
      bmr,
      bodyage
    FROM bodyScale
    ORDER BY CAST(timeStamp AS INTEGER) ASC;
  `,
  );

  const rows = raw ? (JSON.parse(raw) as RenphoRow[]) : [];
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const record = normalizeRenphoRow(row);
    const existedBefore = hasExistingRecord(record.sourceRecordId);
    upsertMeasurement(record);
    if (existedBefore) {
      updated += 1;
    } else {
      inserted += 1;
    }
  }

  const finishedAt = new Date().toISOString();
  insertSyncRun({
    source: 'renpho',
    triggerType,
    insertedCount: inserted,
    updatedCount: updated,
    scannedCount: rows.length,
    startedAt,
    finishedAt,
    notes: `Read from ${RENPHO_DB_PATH} in read-only mode via sqlite3 CLI.`,
  });

  return {
    inserted,
    updated,
    scanned: rows.length,
    lastMeasuredAt: rows.length ? normalizeTimestamp(rows.at(-1)?.timeStamp ?? null) : null,
  };
}

function hasExistingRecord(sourceRecordId: string) {
  const raw = sqliteQuery(
    APP_DB_PATH,
    `SELECT COUNT(*) AS count FROM measurements WHERE source = 'renpho' AND source_record_id = '${sourceRecordId.replace(/'/g, "''")}';`,
  );
  const parsed = raw ? JSON.parse(raw) : [];
  return Number(parsed[0]?.count ?? 0) > 0;
}

export function normalizeRenphoRow(row: RenphoRow): MeasurementRecord {
  const measuredAtEpoch = Number(row.timeStamp);

  return {
    source: 'renpho',
    sourceRecordId: String(row.id),
    sourceUserId: String(row.userId),
    measuredAt: normalizeTimestamp(row.timeStamp) ?? new Date(measuredAtEpoch * 1000).toISOString(),
    measuredAtEpoch,
    weightKg: nullableNumber(row.weight),
    bodyFatPct: nullableNumber(row.bodyfat),
    bmi: nullableNumber(row.bmi),
    waterPct: nullableNumber(row.water),
    musclePct: nullableNumber(row.muscle),
    boneKg: nullableNumber(row.bone),
    proteinPct: nullableNumber(row.protein),
    bmrKcal: nullableNumber(row.bmr),
    bodyAge: nullableInteger(row.bodyage),
    importedAt: new Date().toISOString(),
  };
}

export function normalizeTimestamp(timestamp: string | null) {
  if (!timestamp) return null;
  const epoch = Number(timestamp);
  if (!Number.isFinite(epoch)) return null;
  return new Date(epoch * 1000).toISOString();
}

function nullableNumber(value: number | null) {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function nullableInteger(value: number | null) {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}
