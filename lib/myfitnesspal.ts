import fs from 'node:fs';
import { MYFITNESSPAL_CSV_PATH } from './config';
import { parseCsvRecords } from './csv';
import { ensureAppDb, hasExistingNutritionDaily, insertSyncRun, upsertNutritionDaily } from './db';
import type { NutritionDailyRecord, SourceSyncSummary } from './types';

export function syncMyFitnessPal(triggerType = 'manual'): SourceSyncSummary {
  ensureAppDb();
  const startedAt = new Date().toISOString();
  const csvPath = MYFITNESSPAL_CSV_PATH;

  if (!csvPath || !fs.existsSync(csvPath)) {
    const finishedAt = new Date().toISOString();
    const message = `CSV not found at ${csvPath || '(empty path)'}. Set MYFITNESSPAL_CSV_PATH if needed.`;
    insertSyncRun({
      source: 'myfitnesspal',
      triggerType,
      insertedCount: 0,
      updatedCount: 0,
      scannedCount: 0,
      startedAt,
      finishedAt,
      notes: message,
    });
    return {
      source: 'myfitnesspal',
      status: 'blocked',
      inserted: 0,
      updated: 0,
      scanned: 0,
      lastRecordAt: null,
      message,
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
    if (existedBefore) {
      updated += 1;
    } else {
      inserted += 1;
    }
    lastRecordAt = `${record.entryDate}T00:00:00.000Z`;
  }

  const finishedAt = new Date().toISOString();
  const notes = `Imported from ${csvPath}.${skipped > 0 ? ` Skipped ${skipped} invalid row(s).` : ''}`;
  insertSyncRun({
    source: 'myfitnesspal',
    triggerType,
    insertedCount: inserted,
    updatedCount: updated,
    scannedCount: rows.length,
    startedAt,
    finishedAt,
    notes,
  });

  return {
    source: 'myfitnesspal',
    status: 'ok',
    inserted,
    updated,
    scanned: rows.length,
    lastRecordAt,
    message: notes,
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
