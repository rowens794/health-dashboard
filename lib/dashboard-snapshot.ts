import fs from 'node:fs';
import path from 'node:path';
import { DASHBOARD_DATA_MODE, DASHBOARD_SNAPSHOT_PATH } from './config';
import type { DashboardData, DashboardSnapshot } from './types';

type SnapshotShape = {
  generatedAt?: unknown;
  data?: unknown;
};

export function shouldUseHostedSnapshot() {
  const mode = DASHBOARD_DATA_MODE.trim().toLowerCase();
  if (mode === 'snapshot' || mode === 'hosted') return true;
  if (mode === 'sqlite' || mode === 'local') return false;
  return process.env.VERCEL === '1';
}

export function readDashboardSnapshot(snapshotPath = DASHBOARD_SNAPSHOT_PATH): DashboardSnapshot | null {
  if (!fs.existsSync(snapshotPath)) return null;

  try {
    const raw = fs.readFileSync(snapshotPath, 'utf8');
    const parsed = JSON.parse(raw) as SnapshotShape;
    if (typeof parsed.generatedAt !== 'string') return null;
    if (!isDashboardData(parsed.data)) return null;
    return {
      generatedAt: parsed.generatedAt,
      data: parsed.data,
    };
  } catch {
    return null;
  }
}

export function readDashboardDataFromSnapshot(snapshotPath = DASHBOARD_SNAPSHOT_PATH): DashboardData | null {
  return readDashboardSnapshot(snapshotPath)?.data ?? null;
}

export function writeDashboardSnapshot(data: DashboardData, snapshotPath = DASHBOARD_SNAPSHOT_PATH): DashboardSnapshot {
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  const snapshot: DashboardSnapshot = {
    generatedAt: new Date().toISOString(),
    data,
  };
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return snapshot;
}

function isDashboardData(value: unknown): value is DashboardData {
  if (value == null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.dailyRows) && Array.isArray(candidate.syncRuns);
}
