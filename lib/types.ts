export type MeasurementRecord = {
  source: 'renpho';
  sourceRecordId: string;
  sourceUserId: string;
  measuredAt: string;
  measuredAtEpoch: number;
  weightKg: number | null;
  bodyFatPct: number | null;
  bmi: number | null;
  waterPct: number | null;
  musclePct: number | null;
  boneKg: number | null;
  proteinPct: number | null;
  bmrKcal: number | null;
  bodyAge: number | null;
  importedAt: string;
};

export type NutritionDailyRecord = {
  source: 'myfitnesspal';
  sourceUserId: string;
  entryDate: string;
  entryDateEpoch: number;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  sourceUrl: string | null;
  sourceType: string | null;
  confidence: string | null;
  scrapedAt: string | null;
  importedAt: string;
};

export type DailyStepsRecord = {
  source: 'garmin';
  sourceUserId: string | null;
  stepDate: string;
  stepDateEpoch: number;
  steps: number | null;
  sourceType: string | null;
  sourcePath: string | null;
  importedAt: string;
};

export type SourceName = 'renpho' | 'myfitnesspal' | 'garmin';

export type SourceSyncStatus = 'ok' | 'blocked' | 'error';

export type SourceSyncSummary = {
  source: SourceName;
  status: SourceSyncStatus;
  inserted: number;
  updated: number;
  scanned: number;
  lastRecordAt: string | null;
  message: string;
};

export type SyncAllSummary = {
  triggerType: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  results: SourceSyncSummary[];
};
