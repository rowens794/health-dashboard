import fs from 'node:fs';
import path from 'node:path';
import { APP_DB_PATH } from './config';
import { readDashboardDataFromSnapshot, shouldUseHostedSnapshot } from './dashboard-snapshot';
import { sqliteExec, sqliteQuery } from './sqlite';
import type { DailyStepsRecord, DashboardData, DashboardDailyRow, DashboardSyncRunRow, MeasurementRecord, NutritionDailyRecord } from './types';

const TABLE_START_DAY = '2025-06-22';
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CALORIES = 2500;
const DEFAULT_PROTEIN_G = 110;
const DEFAULT_CARBS_G = 290;
const DEFAULT_FAT_G = 100;
const DEFAULT_STEPS = 8000;
const MAX_SYNC_NOTES_LENGTH = 240;

type RawDashboardDailyRow = {
  day: string;
  weight_kg: number | null;
  calories: number | null;
  steps: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
};

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

export function getDashboardData(): DashboardData {
  if (shouldUseHostedSnapshot()) {
    const snapshotData = readDashboardDataFromSnapshot();
    if (snapshotData) return snapshotData;
  }

  return getDashboardDataFromSqlite();
}

export function getDashboardDataFromSqlite(): DashboardData {
  try {
    ensureAppDb();
    const dailyRowsRaw = sqliteQuery(APP_DB_PATH, `
    WITH renpho_days AS (
      SELECT DISTINCT date(measured_at) AS day
      FROM measurements
      WHERE source = 'renpho'
        AND date(measured_at) IS NOT NULL
    ),
    renpho_daily AS (
      SELECT
        rd.day,
        (
          SELECT m2.weight_kg
          FROM measurements m2
          WHERE m2.source = 'renpho'
            AND date(m2.measured_at) = rd.day
          ORDER BY m2.measured_at_epoch DESC, m2.source_record_id DESC
          LIMIT 1
        ) AS weight_kg
      FROM renpho_days rd
    ),
    nutrition AS (
      SELECT entry_date AS day, calories, protein_g, fat_g, carbs_g
      FROM nutrition_daily
      WHERE source = 'myfitnesspal'
        AND entry_date IS NOT NULL
    ),
    steps AS (
      SELECT step_date AS day, steps
      FROM daily_steps
      WHERE source = 'garmin'
        AND step_date IS NOT NULL
    ),
    all_days AS (
      SELECT day FROM renpho_daily
      UNION
      SELECT day FROM nutrition
      UNION
      SELECT day FROM steps
    )
    SELECT
      all_days.day,
      renpho_daily.weight_kg,
      nutrition.calories,
      steps.steps,
      nutrition.protein_g,
      nutrition.fat_g,
      nutrition.carbs_g
    FROM all_days
    LEFT JOIN renpho_daily ON renpho_daily.day = all_days.day
    LEFT JOIN nutrition ON nutrition.day = all_days.day
    LEFT JOIN steps ON steps.day = all_days.day
    ORDER BY all_days.day ASC;
  `);

    const syncRaw = sqliteQuery(APP_DB_PATH, `
      SELECT source, trigger_type, inserted_count, updated_count, scanned_count, finished_at, notes
      FROM sync_runs
      ORDER BY id DESC
      LIMIT 12;
    `);

    const rawDailyRows = parseRows<RawDashboardDailyRow>(dailyRowsRaw).map((row) => ({
      day: row.day,
      weight_kg: toNullableNumber(row.weight_kg),
      calories: normalizeNutritionValue(toNullableNumber(row.calories)),
      steps: toNullableNumber(row.steps),
      protein_g: normalizeNutritionValue(toNullableNumber(row.protein_g)),
      fat_g: normalizeNutritionValue(toNullableNumber(row.fat_g)),
      carbs_g: normalizeNutritionValue(toNullableNumber(row.carbs_g)),
    }));
    const syncRuns = parseRows<DashboardSyncRunRow>(syncRaw).map((run) => ({
      ...run,
      notes: truncateSyncNotes(run.notes),
    }));

    return {
      dailyRows: buildDisplayDailyRows(rawDailyRows),
      syncRuns,
    };
  } catch {
    return {
      dailyRows: [],
      syncRuns: [],
    };
  }
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

function parseRows<T extends Record<string, unknown> = Record<string, unknown>>(raw: string) {
  return raw ? (JSON.parse(raw) as T[]) : [];
}

function toNullableNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeNutritionValue(value: number | null) {
  if (value == null) return null;
  return value > 0 ? value : null;
}

function truncateSyncNotes(value: string | null) {
  if (!value) return value;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_SYNC_NOTES_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_SYNC_NOTES_LENGTH)}...`;
}

function buildDisplayDailyRows(rawDailyRows: RawDashboardDailyRow[]): DashboardDailyRow[] {
  const latestDay = getLatestDisplayDay(rawDailyRows);
  if (!latestDay) return [];

  const rawByDay = new Map(rawDailyRows.map((row) => [row.day, row]));
  const startDate = parseDay(TABLE_START_DAY);
  const endDate = parseDay(latestDay);
  if (startDate == null || endDate == null || startDate.getTime() > endDate.getTime()) return [];

  const rows: DashboardDailyRow[] = [];
  for (let cursor = new Date(startDate.getTime()); cursor <= endDate; cursor = new Date(cursor.getTime() + DAY_MS)) {
    const day = formatDayIso(cursor);
    const raw = rawByDay.get(day);
    const isLatestDay = day === latestDay;
    rows.push({
      day,
      weight_kg: raw?.weight_kg ?? null,
      weight_kg_is_filled: false,
      calories: raw?.calories ?? (isLatestDay ? null : DEFAULT_CALORIES),
      calories_7d_avg: null,
      calories_is_filled: !isLatestDay && raw?.calories == null,
      steps: raw?.steps ?? (isLatestDay ? null : DEFAULT_STEPS),
      steps_7d_avg: null,
      steps_is_filled: !isLatestDay && raw?.steps == null,
      protein_g: raw?.protein_g ?? (isLatestDay ? null : DEFAULT_PROTEIN_G),
      protein_7d_avg_g: null,
      protein_g_is_filled: !isLatestDay && raw?.protein_g == null,
      fat_g: raw?.fat_g ?? (isLatestDay ? null : DEFAULT_FAT_G),
      fat_7d_avg_g: null,
      fat_g_is_filled: !isLatestDay && raw?.fat_g == null,
      carbs_g: raw?.carbs_g ?? (isLatestDay ? null : DEFAULT_CARBS_G),
      carbs_7d_avg_g: null,
      carbs_g_is_filled: !isLatestDay && raw?.carbs_g == null,
      weight_7d_avg_kg: null,
    });
  }

  interpolateWeightGaps(rows);
  applyDisplayedRollingAverages(rows);
  return rows.reverse();
}

function getLatestDisplayDay(rows: RawDashboardDailyRow[]) {
  let latest: string | null = null;
  for (const row of rows) {
    if (!parseDay(row.day)) continue;
    if (row.day < TABLE_START_DAY) continue;
    if (latest == null || row.day > latest) latest = row.day;
  }
  return latest;
}

function interpolateWeightGaps(rows: DashboardDailyRow[]) {
  const anchorIndices = rows
    .map((row, index) => (row.weight_kg == null ? -1 : index))
    .filter((index) => index >= 0);

  for (let i = 1; i < anchorIndices.length; i += 1) {
    const leftIndex = anchorIndices[i - 1];
    const rightIndex = anchorIndices[i];
    const gapSize = rightIndex - leftIndex;
    if (gapSize <= 1) continue;

    const leftWeight = rows[leftIndex].weight_kg as number;
    const rightWeight = rows[rightIndex].weight_kg as number;

    for (let offset = 1; offset < gapSize; offset += 1) {
      const index = leftIndex + offset;
      const ratio = offset / gapSize;
      rows[index].weight_kg = leftWeight + (rightWeight - leftWeight) * ratio;
      rows[index].weight_kg_is_filled = true;
    }
  }
}

function applyDisplayedRollingAverages(rows: DashboardDailyRow[]) {
  for (let index = 0; index < rows.length; index += 1) {
    let sumWeight = 0;
    let countWeight = 0;
    let sumCalories = 0;
    let countCalories = 0;
    let sumSteps = 0;
    let countSteps = 0;
    let sumProtein = 0;
    let countProtein = 0;
    let sumFat = 0;
    let countFat = 0;
    let sumCarbs = 0;
    let countCarbs = 0;

    for (let windowIndex = Math.max(0, index - 6); windowIndex <= index; windowIndex += 1) {
      const windowRow = rows[windowIndex];
      if (windowRow.weight_kg != null) {
        sumWeight += windowRow.weight_kg;
        countWeight += 1;
      }
      if (windowRow.calories != null) {
        sumCalories += windowRow.calories;
        countCalories += 1;
      }
      if (windowRow.steps != null) {
        sumSteps += windowRow.steps;
        countSteps += 1;
      }
      if (windowRow.protein_g != null) {
        sumProtein += windowRow.protein_g;
        countProtein += 1;
      }
      if (windowRow.fat_g != null) {
        sumFat += windowRow.fat_g;
        countFat += 1;
      }
      if (windowRow.carbs_g != null) {
        sumCarbs += windowRow.carbs_g;
        countCarbs += 1;
      }
    }

    rows[index].weight_7d_avg_kg = countWeight ? sumWeight / countWeight : null;
    rows[index].calories_7d_avg = countCalories ? sumCalories / countCalories : null;
    rows[index].steps_7d_avg = countSteps ? sumSteps / countSteps : null;
    rows[index].protein_7d_avg_g = countProtein ? sumProtein / countProtein : null;
    rows[index].fat_7d_avg_g = countFat ? sumFat / countFat : null;
    rows[index].carbs_7d_avg_g = countCarbs ? sumCarbs / countCarbs : null;
  }
}

function parseDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatDayIso(date: Date) {
  return date.toISOString().slice(0, 10);
}
