import fs from 'node:fs';
import path from 'node:path';
import { APP_DB_PATH } from './config';
import { sqliteExec, sqliteQuery } from './sqlite';
import type { DailyStepsRecord, MeasurementRecord, NutritionDailyRecord } from './types';

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

    CREATE TABLE IF NOT EXISTS nutrition_daily (
      source TEXT NOT NULL,
      source_user_id TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      entry_date_epoch INTEGER NOT NULL,
      calories INTEGER,
      protein_g REAL,
      carbs_g REAL,
      fat_g REAL,
      source_url TEXT,
      source_type TEXT,
      confidence TEXT,
      scraped_at TEXT,
      imported_at TEXT NOT NULL,
      PRIMARY KEY (source, entry_date)
    );

    CREATE INDEX IF NOT EXISTS idx_nutrition_daily_entry_date_epoch
    ON nutrition_daily(entry_date_epoch DESC);

    CREATE TABLE IF NOT EXISTS daily_steps (
      source TEXT NOT NULL,
      source_user_id TEXT,
      step_date TEXT NOT NULL,
      step_date_epoch INTEGER NOT NULL,
      steps INTEGER,
      source_type TEXT,
      source_path TEXT,
      imported_at TEXT NOT NULL,
      PRIMARY KEY (source, step_date)
    );

    CREATE INDEX IF NOT EXISTS idx_daily_steps_step_date_epoch
    ON daily_steps(step_date_epoch DESC);

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
      ('myfitnesspal', 1, 'Enabled CSV import source'),
      ('garmin', 1, 'Enabled Garmin Connect web sync')
    ON CONFLICT(source) DO UPDATE SET
      enabled = excluded.enabled,
      notes = excluded.notes;
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

export function upsertNutritionDaily(record: NutritionDailyRecord) {
  const sql = `
    INSERT INTO nutrition_daily (
      source, source_user_id, entry_date, entry_date_epoch,
      calories, protein_g, carbs_g, fat_g,
      source_url, source_type, confidence, scraped_at, imported_at
    ) VALUES (
      ${toSql(record.source)}, ${toSql(record.sourceUserId)}, ${toSql(record.entryDate)}, ${record.entryDateEpoch},
      ${toSqlNum(record.calories)}, ${toSqlNum(record.proteinG)}, ${toSqlNum(record.carbsG)}, ${toSqlNum(record.fatG)},
      ${toSqlNullable(record.sourceUrl)}, ${toSqlNullable(record.sourceType)}, ${toSqlNullable(record.confidence)}, ${toSqlNullable(record.scrapedAt)}, ${toSql(record.importedAt)}
    )
    ON CONFLICT(source, entry_date) DO UPDATE SET
      source_user_id=excluded.source_user_id,
      entry_date_epoch=excluded.entry_date_epoch,
      calories=excluded.calories,
      protein_g=excluded.protein_g,
      carbs_g=excluded.carbs_g,
      fat_g=excluded.fat_g,
      source_url=excluded.source_url,
      source_type=excluded.source_type,
      confidence=excluded.confidence,
      scraped_at=excluded.scraped_at,
      imported_at=excluded.imported_at;
  `;

  sqliteExec(APP_DB_PATH, sql);
}

export function upsertDailySteps(record: DailyStepsRecord) {
  const sql = `
    INSERT INTO daily_steps (
      source, source_user_id, step_date, step_date_epoch,
      steps, source_type, source_path, imported_at
    ) VALUES (
      ${toSql(record.source)}, ${toSqlNullable(record.sourceUserId)}, ${toSql(record.stepDate)}, ${record.stepDateEpoch},
      ${toSqlNum(record.steps)}, ${toSqlNullable(record.sourceType)}, ${toSqlNullable(record.sourcePath)}, ${toSql(record.importedAt)}
    )
    ON CONFLICT(source, step_date) DO UPDATE SET
      source_user_id=excluded.source_user_id,
      step_date_epoch=excluded.step_date_epoch,
      steps=excluded.steps,
      source_type=excluded.source_type,
      source_path=excluded.source_path,
      imported_at=excluded.imported_at;
  `;

  sqliteExec(APP_DB_PATH, sql);
}

export function hasExistingMeasurement(source: string, sourceRecordId: string) {
  return hasCount(`
    SELECT COUNT(*) AS count
    FROM measurements
    WHERE source = ${toSql(source)}
      AND source_record_id = ${toSql(sourceRecordId)};
  `);
}

export function hasExistingNutritionDaily(source: string, entryDate: string) {
  return hasCount(`
    SELECT COUNT(*) AS count
    FROM nutrition_daily
    WHERE source = ${toSql(source)}
      AND entry_date = ${toSql(entryDate)};
  `);
}

export function hasExistingDailySteps(source: string, stepDate: string) {
  return hasCount(`
    SELECT COUNT(*) AS count
    FROM daily_steps
    WHERE source = ${toSql(source)}
      AND step_date = ${toSql(stepDate)};
  `);
}

export function getDashboardData() {
  ensureAppDb();
  const latestRaw = sqliteQuery(APP_DB_PATH, `
    SELECT measured_at, weight_kg, body_fat_pct, bmi, water_pct, muscle_pct, bone_kg, protein_pct, bmr_kcal, body_age, source_user_id
    FROM measurements
    WHERE source = 'renpho'
    ORDER BY measured_at_epoch DESC
    LIMIT 1;
  `);

  const recentRaw = sqliteQuery(APP_DB_PATH, `
    SELECT measured_at, weight_kg, body_fat_pct, bmi, water_pct, muscle_pct, bone_kg, protein_pct, bmr_kcal, body_age, source_user_id
    FROM measurements
    WHERE source = 'renpho'
    ORDER BY measured_at_epoch DESC
    LIMIT 20;
  `);

  const trendRaw = sqliteQuery(APP_DB_PATH, `
    SELECT measured_at, weight_kg, body_fat_pct
    FROM measurements
    WHERE source = 'renpho'
    ORDER BY measured_at_epoch ASC
    LIMIT 60;
  `);

  const nutritionLatestRaw = sqliteQuery(APP_DB_PATH, `
    SELECT entry_date, calories, protein_g, carbs_g, fat_g, source_type, confidence, scraped_at
    FROM nutrition_daily
    WHERE source = 'myfitnesspal'
    ORDER BY entry_date_epoch DESC
    LIMIT 1;
  `);

  const nutritionRecentRaw = sqliteQuery(APP_DB_PATH, `
    SELECT entry_date, calories, protein_g, carbs_g, fat_g, source_type, confidence, scraped_at
    FROM nutrition_daily
    WHERE source = 'myfitnesspal'
    ORDER BY entry_date_epoch DESC
    LIMIT 20;
  `);

  const latestStepsRaw = sqliteQuery(APP_DB_PATH, `
    SELECT step_date, steps, source_type
    FROM daily_steps
    WHERE source = 'garmin'
    ORDER BY step_date_epoch DESC
    LIMIT 1;
  `);

  const syncRaw = sqliteQuery(APP_DB_PATH, `
    SELECT source, trigger_type, inserted_count, updated_count, scanned_count, finished_at, notes
    FROM sync_runs
    ORDER BY id DESC
    LIMIT 12;
  `);

  const latestRows = parseRows(latestRaw);
  const nutritionLatestRows = parseRows(nutritionLatestRaw);
  const latestStepsRows = parseRows(latestStepsRaw);

  return {
    latest: latestRows[0] ?? null,
    recent: parseRows(recentRaw),
    trend: parseRows(trendRaw),
    nutritionLatest: nutritionLatestRows[0] ?? null,
    nutritionRecent: parseRows(nutritionRecentRaw),
    stepsLatest: latestStepsRows[0] ?? null,
    syncRuns: parseRows(syncRaw),
  };
}

function toSql(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function toSqlNullable(value: string | null) {
  return value == null ? 'NULL' : toSql(value);
}

function toSqlNum(value: number | null) {
  return value == null || Number.isNaN(value) ? 'NULL' : String(value);
}

function hasCount(sql: string) {
  const raw = sqliteQuery(APP_DB_PATH, sql);
  const parsed = parseRows(raw);
  return Number(parsed[0]?.count ?? 0) > 0;
}

function parseRows(raw: string) {
  return raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : [];
}
