import fs from 'node:fs';
import path from 'node:path';
import { APP_DB_PATH } from './config';
import { sqliteExec, sqliteQuery } from './sqlite';
import type { MeasurementRecord } from './types';

function ensureDirExists(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function ensureAppDb() {
  ensureDirExists(APP_DB_PATH);
  sqliteExec(APP_DB_PATH, `
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS measurements (
      source TEXT NOT NULL,
      source_record_id TEXT NOT NULL,
      source_user_id TEXT NOT NULL,
      measured_at TEXT NOT NULL,
      measured_at_epoch INTEGER NOT NULL,
      weight_kg REAL,
      body_fat_pct REAL,
      bmi REAL,
      water_pct REAL,
      muscle_pct REAL,
      bone_kg REAL,
      protein_pct REAL,
      bmr_kcal REAL,
      body_age INTEGER,
      imported_at TEXT NOT NULL,
      PRIMARY KEY (source, source_record_id)
    );

    CREATE INDEX IF NOT EXISTS idx_measurements_measured_at_epoch
    ON measurements(measured_at_epoch DESC);

    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      inserted_count INTEGER NOT NULL,
      updated_count INTEGER NOT NULL,
      scanned_count INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS source_connectors (
      source TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      notes TEXT
    );

    INSERT INTO source_connectors(source, enabled, notes)
    VALUES
      ('renpho', 1, 'Enabled MVP source'),
      ('myfitnesspal', 0, 'Planned extension point'),
      ('garmin', 0, 'Planned extension point')
    ON CONFLICT(source) DO NOTHING;
  `);
}

export function upsertMeasurement(record: MeasurementRecord) {
  const sql = `
    INSERT INTO measurements (
      source, source_record_id, source_user_id, measured_at, measured_at_epoch,
      weight_kg, body_fat_pct, bmi, water_pct, muscle_pct, bone_kg, protein_pct,
      bmr_kcal, body_age, imported_at
    ) VALUES (
      ${toSql(record.source)}, ${toSql(record.sourceRecordId)}, ${toSql(record.sourceUserId)}, ${toSql(record.measuredAt)}, ${record.measuredAtEpoch},
      ${toSqlNum(record.weightKg)}, ${toSqlNum(record.bodyFatPct)}, ${toSqlNum(record.bmi)}, ${toSqlNum(record.waterPct)}, ${toSqlNum(record.musclePct)}, ${toSqlNum(record.boneKg)}, ${toSqlNum(record.proteinPct)},
      ${toSqlNum(record.bmrKcal)}, ${toSqlNum(record.bodyAge)}, ${toSql(record.importedAt)}
    )
    ON CONFLICT(source, source_record_id) DO UPDATE SET
      source_user_id=excluded.source_user_id,
      measured_at=excluded.measured_at,
      measured_at_epoch=excluded.measured_at_epoch,
      weight_kg=excluded.weight_kg,
      body_fat_pct=excluded.body_fat_pct,
      bmi=excluded.bmi,
      water_pct=excluded.water_pct,
      muscle_pct=excluded.muscle_pct,
      bone_kg=excluded.bone_kg,
      protein_pct=excluded.protein_pct,
      bmr_kcal=excluded.bmr_kcal,
      body_age=excluded.body_age,
      imported_at=excluded.imported_at;
  `;

  sqliteExec(APP_DB_PATH, sql);
}

export function insertSyncRun(input: {
  source: string;
  triggerType: string;
  insertedCount: number;
  updatedCount: number;
  scannedCount: number;
  startedAt: string;
  finishedAt: string;
  notes?: string;
}) {
  sqliteExec(APP_DB_PATH, `
    INSERT INTO sync_runs(source, trigger_type, inserted_count, updated_count, scanned_count, started_at, finished_at, notes)
    VALUES (
      ${toSql(input.source)},
      ${toSql(input.triggerType)},
      ${input.insertedCount},
      ${input.updatedCount},
      ${input.scannedCount},
      ${toSql(input.startedAt)},
      ${toSql(input.finishedAt)},
      ${toSql(input.notes ?? '')}
    );
  `);
}

export function getDashboardData() {
  ensureAppDb();
  const latestRaw = sqliteQuery(APP_DB_PATH, `
    SELECT measured_at, weight_kg, body_fat_pct, bmi, water_pct, muscle_pct, bone_kg, protein_pct, bmr_kcal, body_age, source_user_id
    FROM measurements
    ORDER BY measured_at_epoch DESC
    LIMIT 1;
  `);

  const recentRaw = sqliteQuery(APP_DB_PATH, `
    SELECT measured_at, weight_kg, body_fat_pct, bmi, water_pct, muscle_pct, bone_kg, protein_pct, bmr_kcal, body_age, source_user_id
    FROM measurements
    ORDER BY measured_at_epoch DESC
    LIMIT 20;
  `);

  const trendRaw = sqliteQuery(APP_DB_PATH, `
    SELECT measured_at, weight_kg, body_fat_pct
    FROM measurements
    ORDER BY measured_at_epoch ASC
    LIMIT 60;
  `);

  const syncRaw = sqliteQuery(APP_DB_PATH, `
    SELECT source, trigger_type, inserted_count, updated_count, scanned_count, finished_at
    FROM sync_runs
    ORDER BY id DESC
    LIMIT 5;
  `);

  return {
    latest: latestRaw ? JSON.parse(latestRaw)[0] ?? null : null,
    recent: recentRaw ? JSON.parse(recentRaw) : [],
    trend: trendRaw ? JSON.parse(trendRaw) : [],
    syncRuns: syncRaw ? JSON.parse(syncRaw) : [],
  };
}

function toSql(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function toSqlNum(value: number | null) {
  return value == null || Number.isNaN(value) ? 'NULL' : String(value);
}
