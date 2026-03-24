import { ensureAppDb, hasExistingNutritionDaily, insertSyncRun, upsertNutritionDaily } from './db';
import type { NutritionDailyRecord, SourceSyncSummary } from './types';

export function syncMyFitnessPalDiaryText(rawText: string, triggerType = 'manual-text'): SourceSyncSummary {
  ensureAppDb();
  const startedAt = new Date().toISOString();

  try {
    const record = parseMyFitnessPalDiaryText(rawText);
    const existedBefore = hasExistingNutritionDaily('myfitnesspal', record.entryDate);
    upsertNutritionDaily(record);

    const finishedAt = new Date().toISOString();
    insertSyncRun({
      source: 'myfitnesspal',
      triggerType,
      insertedCount: existedBefore ? 0 : 1,
      updatedCount: existedBefore ? 1 : 0,
      scannedCount: 1,
      startedAt,
      finishedAt,
      notes: `Imported from manual MyFitnessPal diary text for ${record.entryDate}.`,
    });

    return {
      source: 'myfitnesspal',
      status: 'ok',
      inserted: existedBefore ? 0 : 1,
      updated: existedBefore ? 1 : 0,
      scanned: 1,
      lastRecordAt: `${record.entryDate}T00:00:00.000Z`,
      message: `Imported manual MyFitnessPal diary text for ${record.entryDate}.`,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : 'Unknown MyFitnessPal text import error';
    insertSyncRun({
      source: 'myfitnesspal',
      triggerType,
      insertedCount: 0,
      updatedCount: 0,
      scannedCount: 1,
      startedAt,
      finishedAt,
      notes: `Manual diary text import failed: ${message}`,
    });

    return {
      source: 'myfitnesspal',
      status: 'error',
      inserted: 0,
      updated: 0,
      scanned: 1,
      lastRecordAt: null,
      message,
    };
  }
}

export function parseMyFitnessPalDiaryText(rawText: string): NutritionDailyRecord {
  const text = rawText.replace(/\r/g, '').trim();
  if (!text) throw new Error('Diary text is empty.');

  const dateMatch = text.match(/Your Food Diary For:\s*([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  if (!dateMatch) throw new Error('Could not find diary date in pasted text.');

  const parsedDate = new Date(`${dateMatch[1]} UTC`);
  if (Number.isNaN(parsedDate.getTime())) throw new Error(`Could not parse diary date: ${dateMatch[1]}`);
  const entryDate = parsedDate.toISOString().slice(0, 10);

  const totalsMatch = text.match(/Totals\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/i);
  if (!totalsMatch) throw new Error('Could not find Totals row in pasted text.');

  const [calories, carbsG, fatG, proteinG] = totalsMatch.slice(1).map(parseNumericToken);

  return {
    source: 'myfitnesspal',
    sourceUserId: 'rowens794',
    entryDate,
    entryDateEpoch: Math.floor(new Date(`${entryDate}T00:00:00Z`).getTime() / 1000),
    calories,
    proteinG,
    carbsG,
    fatG,
    sourceUrl: null,
    sourceType: 'manual diary text',
    confidence: 'medium',
    scrapedAt: new Date().toISOString(),
    importedAt: new Date().toISOString(),
  };
}

function parseNumericToken(value: string) {
  const normalized = value.replace(/,/g, '').trim();
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) throw new Error(`Invalid numeric value: ${value}`);
  return Math.round(numeric);
}
