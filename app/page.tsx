import { getDashboardData } from '@/lib/db';
import { SyncButton } from '@/components/SyncButton';

const KG_TO_LB = 2.2046226218;

type DailyRow = {
  day: string;
  weight_kg: number | null;
  weight_kg_is_filled: boolean;
  calories: number | null;
  calories_is_filled: boolean;
  steps: number | null;
  steps_is_filled: boolean;
  protein_g: number | null;
  protein_g_is_filled: boolean;
  fat_g: number | null;
  fat_g_is_filled: boolean;
  carbs_g: number | null;
  carbs_g_is_filled: boolean;
  weight_7d_avg_kg: number | null;
};

type SyncRunRow = {
  source: string;
  finished_at: string;
  trigger_type: string;
  scanned_count: number;
  inserted_count: number;
  updated_count: number;
  notes: string | null;
};

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

function formatWeightLbs(valueKg: number | null | undefined) {
  if (valueKg == null) return '—';
  return `${(valueKg * KG_TO_LB).toFixed(1)} lb`;
}

function formatCalories(value: number | null | undefined) {
  if (value == null) return '—';
  return `${Math.round(value).toLocaleString()} kcal`;
}

function formatSteps(value: number | null | undefined) {
  if (value == null) return '—';
  return Math.round(value).toLocaleString();
}

function formatGrams(value: number | null | undefined) {
  if (value == null) return '—';
  return `${Math.round(value)} g`;
}

export default function HomePage() {
  const data = getDashboardData();
  const rows = data.dailyRows as DailyRow[];
  const syncRuns = data.syncRuns as SyncRunRow[];

  return (
    <main>
      <div className="header">
        <div>
          <h1 className="title">Health Dashboard</h1>
          <div className="subtitle">
            Daily unified table from RENPHO measurements, MyFitnessPal nutrition totals, and Garmin steps.
          </div>
        </div>
        <div className="badge">Local-only sync</div>
      </div>

      <section className="card">
        <div className="panelHeader">
          <div>
            <h2 style={{ margin: 0 }}>Daily Overview</h2>
            <div className="small">
              One row per day. Weight uses the latest RENPHO measurement for each day, and rolling average uses that day plus previous 6 days with available weight.
            </div>
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
                    <td>{formatWeightLbs(row.weight_kg)}</td>
                    <td>{formatCalories(row.calories)}</td>
                    <td>{formatSteps(row.steps)}</td>
                    <td>{formatGrams(row.protein_g)}</td>
                    <td>{formatGrams(row.fat_g)}</td>
                    <td>{formatGrams(row.carbs_g)}</td>
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
        <SyncButton />
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
