import fs from 'node:fs';
import { MYFITNESSPAL_CSV_PATH } from './config';
import { parseCsvRecords } from './csv';
import { ensureAppDb, hasExistingNutritionDaily, insertSyncRun, upsertNutritionDaily } from './db';
import { syncMyFitnessPalPublicRecentDays } from './myfitnesspal-public';
import type { NutritionDailyRecord, SourceSyncSummary } from './types';

export async function syncMyFitnessPal(triggerType = 'manual'): Promise<SourceSyncSummary> {
  ensureAppDb();
  const startedAt = new Date().toISOString();

  let inserted = 0;
  let updated = 0;
  let scanned = 0;
  let lastRecordAt: string | null = null;
  const notes: string[] = [];

  const csvResult = syncMyFitnessPalCsv();
  inserted += csvResult.inserted;
  updated += csvResult.updated;
  scanned += csvResult.scanned;
  lastRecordAt = csvResult.lastRecordAt || lastRecordAt;
  notes.push(csvResult.message);

  try {
    const publicResult = await syncMyFitnessPalPublicRecentDays();
    if (publicResult.enabled) {
      inserted += publicResult.inserted;
      updated += publicResult.updated;
      scanned += publicResult.scanned;
      lastRecordAt = publicResult.lastRecordAt || lastRecordAt;
      notes.push(publicResult.message);
    }
  } catch (error) {
    notes.push(`Public recent-day fetch failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  const finishedAt = new Date().toISOString();
  const message = notes.join(' ');
  insertSyncRun({
    source: 'myfitnesspal',
    triggerType,
    insertedCount: inserted,
    updatedCount: updated,
    scannedCount: scanned,
    startedAt,
    finishedAt,
    notes: message,
  });

  return {
    source: 'myfitnesspal',
    status: inserted > 0 || updated > 0 || scanned > 0 ? 'ok' : 'blocked',
    inserted,
    updated,
    scanned,
    lastRecordAt,
    message,
  };
}

function syncMyFitnessPalCsv() {
  const csvPath = MYFITNESSPAL_CSV_PATH;
  if (!csvPath || !fs.existsSync(csvPath)) {
    return {
      inserted: 0,
      updated: 0,
      scanned: 0,
      skipped: 0,
      lastRecordAt: null as string | null,
      message: `CSV not found at ${csvPath || '(empty path)'}.`,
    };
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsvRecords(content);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let lastRecordAt: string | null = null;

  for (const row of rows) {
    const record = normalizeMyFitnessPalRow(row);
    if (!record) {
      skipped += 1;
      continue;
    }

    const existedBefore = hasExistingNutritionDaily('myfitnesspal', record.entryDate);
    upsertNutritionDaily(record);
    if (existedBefore) updated += 1;
    else inserted += 1;
    lastRecordAt = `${record.entryDate}T00:00:00.000Z`;
  }

  return {
    inserted,
    updated,
    scanned: rows.length,
    skipped,
    lastRecordAt,
    message: `Imported CSV backfill from ${csvPath}.${skipped > 0 ? ` Skipped ${skipped} invalid row(s).` : ''}`,
  };
}

function normalizeMyFitnessPalRow(row: Record<string, string>): NutritionDailyRecord | null {
  const date = normalizeDate(row.date ?? '');
  if (!date) return null;

  const entryDateEpoch = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
  if (!Number.isFinite(entryDateEpoch)) return null;

  return {
    source: 'myfitnesspal',
    sourceUserId: extractUserId(row.source_url ?? ''),
    entryDate: date,
    entryDateEpoch,
    calories: nullableInteger(row.calories ?? ''),
    proteinG: nullableNumber(row.protein_g ?? ''),
    carbsG: nullableNumber(row.carbs_g ?? ''),
    fatG: nullableNumber(row.fat_g ?? ''),
    sourceUrl: nullableText(row.source_url ?? ''),
    sourceType: nullableText(row.source_type ?? ''),
    confidence: nullableText(row.confidence ?? ''),
    scrapedAt: normalizeIsoDateTime(row.scraped_at ?? ''),
    importedAt: new Date().toISOString(),
  };
}

function normalizeDate(value: string) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeIsoDateTime(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function extractUserId(sourceUrl: string) {
  const matched = sourceUrl.match(/\/diary\/([^/?]+)/i);
  return matched?.[1] ? decodeURIComponent(matched[1]) : 'unknown';
}

function nullableNumber(value: string) {
  if (!value) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function nullableInteger(value: string) {
  if (!value) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function nullableText(value: string) {
  if (!value) return null;
  return value.trim() || null;
}
