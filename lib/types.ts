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

export type SyncSummary = {
  inserted: number;
  updated: number;
  scanned: number;
  lastMeasuredAt: string | null;
};
