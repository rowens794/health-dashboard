import { getDashboardData } from '@/lib/db';
import { shouldUseHostedSnapshot } from '@/lib/dashboard-snapshot';
import { SyncButton } from '@/components/SyncButton';
import { TrendChart } from '@/components/TrendChart';
import type { DashboardDailyRow, DashboardSyncRunRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

const KG_TO_LB = 2.2046226218;

function formatDay(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(parsed);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function withFilledMarker(text: string, isFilled: boolean) {
  return isFilled ? `${text}*` : text;
}

function formatWeightLbs(valueKg: number | null | undefined, isFilled = false) {
  if (valueKg == null) return '—';
  return withFilledMarker(`${(valueKg * KG_TO_LB).toFixed(1)} lb`, isFilled);
}

function formatCalories(value: number | null | undefined, isFilled = false) {
  if (value == null) return '—';
  return withFilledMarker(`${Math.round(value).toLocaleString()} kcal`, isFilled);
}

function formatSteps(value: number | null | undefined, isFilled = false) {
  if (value == null) return '—';
  return withFilledMarker(Math.round(value).toLocaleString(), isFilled);
}

function formatGrams(value: number | null | undefined, isFilled = false) {
  if (value == null) return '—';
  return withFilledMarker(`${Math.round(value)} g`, isFilled);
}

export default function HomePage() {
  const data = getDashboardData();
  const rows: DashboardDailyRow[] = data.dailyRows;
  const syncRuns: DashboardSyncRunRow[] = data.syncRuns;
  const hostedSnapshotMode = shouldUseHostedSnapshot();

  return (
    <main>
      <div className="header">
        <div>
          <h1 className="title">Health Dashboard</h1>
        </div>
        <div className="headerActions">
          {hostedSnapshotMode ? (
            <span className="small">Hosted snapshot mode (read-only)</span>
          ) : (
            <SyncButton label="Grab Data" pendingLabel="Grabbing…" compact />
          )}
        </div>
      </div>

      <section className="card">
        <TrendChart rows={rows} />
      </section>

      <section className="card tableCard">
        <div className="panelHeader">
          <div>
            <h2 style={{ margin: 0 }}>Daily Overview</h2>
          </div>
        </div>
        {rows.length ? (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Weight</th>
                  <th>Calories consumed</th>
                  <th>Steps</th>
                  <th>Protein</th>
                  <th>Fat</th>
                  <th>Carbs</th>
                  <th>7-day average</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.day}>
                    <td>{formatDay(row.day)}</td>
                    <td>{formatWeightLbs(row.weight_kg, row.weight_kg_is_filled)}</td>
                    <td>{formatCalories(row.calories, row.calories_is_filled)}</td>
                    <td>{formatSteps(row.steps, row.steps_is_filled)}</td>
                    <td>{formatGrams(row.protein_g, row.protein_g_is_filled)}</td>
                    <td>{formatGrams(row.fat_g, row.fat_g_is_filled)}</td>
                    <td>{formatGrams(row.carbs_g, row.carbs_g_is_filled)}</td>
                    <td>{formatWeightLbs(row.weight_7d_avg_kg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="small">No imported data yet. Run a sync to populate the daily table.</div>
        )}
      </section>

      <section className="card secondaryCard">
        <div className="panelHeader">
          <div>
            <h2 style={{ margin: 0 }}>Sync Status</h2>
            <div className="small">Secondary operational details for imports.</div>
          </div>
        </div>
        {syncRuns.length ? (
          <div className="tableWrap" style={{ marginTop: 12 }}>
            <table className="table syncTable">
              <thead>
                <tr>
                  <th>Finished</th>
                  <th>Source</th>
                  <th>Trigger</th>
                  <th>Scanned</th>
                  <th>Inserted</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {syncRuns.map((run) => (
                  <tr key={`${run.finished_at}-${run.source}-${run.trigger_type}`}>
                    <td>{formatDateTime(run.finished_at)}</td>
                    <td>{run.source}</td>
                    <td>{run.trigger_type}</td>
                    <td>{run.scanned_count}</td>
                    <td>{run.inserted_count}</td>
                    <td>{run.updated_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="small" style={{ marginTop: 12 }}>No sync runs yet.</div>
        )}
      </section>
    </main>
  );
}
