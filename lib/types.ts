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

export type DashboardDailyRow = {
  day: string;
  weight_kg: number | null;
  weight_kg_is_filled: boolean;
  calories: number | null;
  calories_7d_avg: number | null;
  calories_is_filled: boolean;
  steps: number | null;
  steps_7d_avg: number | null;
  steps_is_filled: boolean;
  protein_g: number | null;
  protein_7d_avg_g: number | null;
  protein_g_is_filled: boolean;
  fat_g: number | null;
  fat_7d_avg_g: number | null;
  fat_g_is_filled: boolean;
  carbs_g: number | null;
  carbs_7d_avg_g: number | null;
  carbs_g_is_filled: boolean;
  weight_7d_avg_kg: number | null;
};

export type DashboardSyncRunRow = {
  source: string;
  finished_at: string;
  trigger_type: string;
  scanned_count: number;
  inserted_count: number;
  updated_count: number;
  notes: string | null;
};

export type DashboardData = {
  dailyRows: DashboardDailyRow[];
  syncRuns: DashboardSyncRunRow[];
};

export type DashboardSnapshot = {
  generatedAt: string;
  data: DashboardData;
};
