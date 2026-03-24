import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const LOCAL_ENV = loadLocalEnv();

export const APP_DB_PATH = process.env.HEALTH_DASHBOARD_DB_PATH || LOCAL_ENV.HEALTH_DASHBOARD_DB_PATH || path.join(process.cwd(), 'data', 'health-dashboard.sqlite');
export const RENPHO_DB_PATH = process.env.RENPHO_DB_PATH || LOCAL_ENV.RENPHO_DB_PATH || path.join(
  os.homedir(),
  'Library/Containers/60D3E105-BB1C-4728-8C12-6C8358ED5D76/Data/Documents/renphoHealth.sqlite',
);
export const MYFITNESSPAL_CSV_PATH =
  process.env.MYFITNESSPAL_CSV_PATH || LOCAL_ENV.MYFITNESSPAL_CSV_PATH || path.join(process.cwd(), 'data', 'myfitnesspal-diary-rowens794-2025-06-01-to-2026-03-19.csv');
export const MYFITNESSPAL_PUBLIC_DIARY_USERNAME = process.env.MYFITNESSPAL_PUBLIC_DIARY_USERNAME || LOCAL_ENV.MYFITNESSPAL_PUBLIC_DIARY_USERNAME || 'rowens794';
export const MYFITNESSPAL_PUBLIC_RECENT_DAYS = Number(process.env.MYFITNESSPAL_PUBLIC_RECENT_DAYS || LOCAL_ENV.MYFITNESSPAL_PUBLIC_RECENT_DAYS || '7');
export const MYFITNESSPAL_BROWSER_PROFILE_PATH =
  process.env.MYFITNESSPAL_BROWSER_PROFILE_PATH || LOCAL_ENV.MYFITNESSPAL_BROWSER_PROFILE_PATH || path.join(process.cwd(), 'data', 'myfitnesspal-browser-profile');
export const MYFITNESSPAL_BROWSER_HEADLESS = (process.env.MYFITNESSPAL_BROWSER_HEADLESS || LOCAL_ENV.MYFITNESSPAL_BROWSER_HEADLESS || 'false').toLowerCase() === 'true';
export const MYFITNESSPAL_CHROME_PATH =
  process.env.MYFITNESSPAL_CHROME_PATH || LOCAL_ENV.MYFITNESSPAL_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const GARMIN_EMAIL = process.env.GARMIN_EMAIL || LOCAL_ENV.GARMIN_EMAIL || '';
export const GARMIN_PASSWORD = process.env.GARMIN_PASSWORD || LOCAL_ENV.GARMIN_PASSWORD || '';
export const GARMIN_SYNC_START_DATE = process.env.GARMIN_SYNC_START_DATE || LOCAL_ENV.GARMIN_SYNC_START_DATE || '2025-06-01';
export const GARMIN_SYNC_END_DATE = process.env.GARMIN_SYNC_END_DATE || LOCAL_ENV.GARMIN_SYNC_END_DATE || '';
export const GARMIN_TOKENSTORE_PATH = process.env.GARMIN_TOKENSTORE_PATH || LOCAL_ENV.GARMIN_TOKENSTORE_PATH || path.join(process.cwd(), 'data', 'garmin-tokenstore');
export const GARMIN_PYTHON_PATH = process.env.GARMIN_PYTHON_PATH || LOCAL_ENV.GARMIN_PYTHON_PATH || path.join(process.cwd(), '.venv', 'bin', 'python');
export const DASHBOARD_SNAPSHOT_PATH =
  process.env.HEALTH_DASHBOARD_SNAPSHOT_PATH || LOCAL_ENV.HEALTH_DASHBOARD_SNAPSHOT_PATH || path.join(process.cwd(), 'data', 'dashboard-snapshot.json');
export const DASHBOARD_DATA_MODE = process.env.HEALTH_DASHBOARD_DATA_MODE || LOCAL_ENV.HEALTH_DASHBOARD_DATA_MODE || '';

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return {} as Record<string, string>;

  const result: Record<string, string> = {};
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    result[key] = value.replace(/^['"]|['"]$/g, '');
  }
  return result;
}
