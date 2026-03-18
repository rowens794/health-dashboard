import path from 'node:path';
import os from 'node:os';

export const APP_DB_PATH = process.env.HEALTH_DASHBOARD_DB_PATH || path.join(process.cwd(), 'data', 'health-dashboard.sqlite');
export const RENPHO_DB_PATH = process.env.RENPHO_DB_PATH || path.join(
  os.homedir(),
  'Library/Containers/60D3E105-BB1C-4728-8C12-6C8358ED5D76/Data/Documents/renphoHealth.sqlite',
);
