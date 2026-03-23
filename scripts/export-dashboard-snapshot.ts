import { DASHBOARD_SNAPSHOT_PATH } from '../lib/config';
import { getDashboardDataFromSqlite } from '../lib/db';
import { writeDashboardSnapshot } from '../lib/dashboard-snapshot';

const data = getDashboardDataFromSqlite();
const snapshot = writeDashboardSnapshot(data);

console.log(
  JSON.stringify(
    {
      ok: true,
      snapshotPath: DASHBOARD_SNAPSHOT_PATH,
      generatedAt: snapshot.generatedAt,
      dailyRows: snapshot.data.dailyRows.length,
      syncRuns: snapshot.data.syncRuns.length,
    },
    null,
    2,
  ),
);
