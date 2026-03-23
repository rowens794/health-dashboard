import { getDashboardData } from '@/lib/db';
import { SyncButton } from '@/components/SyncButton';
import { TrendChart } from '@/components/TrendChart';

const KG_TO_LB = 2.2046226218;

type MeasurementRow = {
  measured_at: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  bmi: number | null;
  water_pct: number | null;
  muscle_pct: number | null;
  protein_pct?: number | null;
  bmr_kcal?: number | null;
  body_age?: number | null;
  source_user_id: string;
};

type NutritionRow = {
  entry_date: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  source_type: string | null;
  confidence: string | null;
  scraped_at: string | null;
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

type StepsRow = {
  step_date: string;
  steps: number | null;
  source_type: string | null;
};

type TrendPoint = {
  measured_at: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
};

function formatMetric(value: number | null | undefined, suffix: string) {
  return value == null ? '—' : `${value}${suffix}`;
}

function formatWeightLbs(valueKg: number | null | undefined) {
  if (valueKg == null) return '—';
  return `${(valueKg * KG_TO_LB).toFixed(1)} lb`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function formatDay(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(parsed);
}

function formatCalories(value: number | null | undefined) {
  return value == null ? '—' : `${Math.round(value).toLocaleString()} kcal`;
}

function formatGrams(value: number | null | undefined) {
  return value == null ? '—' : `${Math.round(value)} g`;
}

function getHoursSince(value: string | null | undefined) {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / (1000 * 60 * 60);
}

function getDaysSinceDay(value: string | null | undefined) {
  if (!value) return null;
  const then = new Date(`${value}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / (1000 * 60 * 60 * 24);
}

export default function HomePage() {
  const data = getDashboardData();
  const latest = data.latest as MeasurementRow | null;
  const latestNutrition = data.nutritionLatest as NutritionRow | null;
  const nutritionRecent = data.nutritionRecent as NutritionRow[];
  const latestSteps = data.stepsLatest as StepsRow | null;
  const syncRuns = data.syncRuns as SyncRunRow[];
  const trend = data.trend as TrendPoint[];

  const latestMeasurementAgeHours = getHoursSince(latest?.measured_at);
  const sourceMayBeStale = latestMeasurementAgeHours != null && latestMeasurementAgeHours > 36;
  const latestNutritionAgeDays = getDaysSinceDay(latestNutrition?.entry_date);
  const nutritionMayBeStale = latestNutritionAgeDays != null && latestNutritionAgeDays > 2;
  const latestGarminSync = syncRuns.find((run) => run.source === 'garmin');

  return (
    <main>
      <div className="header">
        <div>
          <h1 className="title">Health Dashboard</h1>
          <div className="subtitle">Local dashboard for RENPHO body metrics and MyFitnessPal daily nutrition, with Garmin step import groundwork.</div>
        </div>
        <div className="badge">Local-only sync</div>
      </div>

      <div className="notice" style={{ marginBottom: 16 }}>
        Sync now imports RENPHO and MyFitnessPal each run and also attempts Garmin if configured. Use <span className="code">POST /api/sync?trigger=scheduled</span> or <span className="code">npm run sync scheduled</span> from launchd/cron.
      </div>

      <div className="notice" style={{ marginBottom: 16 }}>
        RENPHO caveat: this dashboard only imports what the local <span className="code">RENPHO Health</span> Mac app has already pulled into its sqlite. If new weigh-ins are missing, open the app and let it sync first.
      </div>

      {sourceMayBeStale ? (
        <div className="notice" style={{ marginBottom: 16, borderColor: '#f59e0b', background: '#3a2a07' }}>
          Source may be stale: latest imported RENPHO measurement is from {formatDate(latest?.measured_at)}. If that looks wrong, make sure <span className="code">RENPHO Health</span> is open on this Mac and trigger a sync there before rerunning dashboard sync.
        </div>
      ) : null}

      {nutritionMayBeStale ? (
        <div className="notice" style={{ marginBottom: 16, borderColor: '#f59e0b', background: '#3a2a07' }}>
          MyFitnessPal data may be stale: latest imported diary date is {formatDay(latestNutrition?.entry_date)}.
        </div>
      ) : null}

      {!latestSteps && latestGarminSync?.notes ? (
        <div className="notice" style={{ marginBottom: 16, borderColor: '#93c5fd', background: '#10223f' }}>
          Garmin sync status: {latestGarminSync.notes}
        </div>
      ) : null}

      <div className="grid cards">
        <section className="card">
          <div className="metricLabel">Latest weight</div>
          <div className="metricValue">{formatWeightLbs(latest?.weight_kg)}</div>
          <div className="metricSub">Measured {formatDate(latest?.measured_at)}</div>
        </section>
        <section className="card">
          <div className="metricLabel">Latest body fat</div>
          <div className="metricValue">{formatMetric(latest?.body_fat_pct, '%')}</div>
          <div className="metricSub">BMI {formatMetric(latest?.bmi, '')}</div>
        </section>
        <section className="card">
          <div className="metricLabel">Latest water / muscle</div>
          <div className="metricValue">{formatMetric(latest?.water_pct, '%')} / {formatMetric(latest?.muscle_pct, '%')}</div>
          <div className="metricSub">Protein {formatMetric(latest?.protein_pct, '%')}</div>
        </section>
        <section className="card">
          <div className="metricLabel">Latest BMR / body age</div>
          <div className="metricValue">{formatMetric(latest?.bmr_kcal, ' kcal')}</div>
          <div className="metricSub">Body age {formatMetric(latest?.body_age, '')}</div>
        </section>
        <section className="card">
          <div className="metricLabel">Latest calories (MyFitnessPal)</div>
          <div className="metricValue">{formatCalories(latestNutrition?.calories)}</div>
          <div className="metricSub">Diary date {formatDay(latestNutrition?.entry_date)}</div>
        </section>
        <section className="card">
          <div className="metricLabel">Latest macros (P/C/F)</div>
          <div className="metricValue">
            {formatGrams(latestNutrition?.protein_g)} / {formatGrams(latestNutrition?.carbs_g)} / {formatGrams(latestNutrition?.fat_g)}
          </div>
          <div className="metricSub">{latestNutrition?.confidence ? `Confidence ${latestNutrition.confidence}` : 'MyFitnessPal daily totals'}</div>
        </section>
      </div>

      <div style={{ marginBottom: 18 }}>
        <SyncButton />
      </div>

      <div className="grid main">
        <section className="card">
          <div className="panelHeader">
            <div>
              <h2 style={{ margin: 0 }}>Trend</h2>
              <div className="small">Recent weight data from imported RENPHO measurements</div>
            </div>
          </div>
          <TrendChart points={trend} />
        </section>

        <section className="card">
          <div className="panelHeader">
            <div>
              <h2 style={{ margin: 0 }}>Recent sync runs</h2>
              <div className="small">Tracks manual and scheduled imports</div>
            </div>
          </div>
          {data.syncRuns.length ? (
            <table className="table">
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
                    <td>{formatDate(run.finished_at)}</td>
                    <td>{run.source}</td>
                    <td>{run.trigger_type}</td>
                    <td>{run.scanned_count}</td>
                    <td>{run.inserted_count}</td>
                    <td>{run.updated_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="small">No syncs yet. Hit the button.</div>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="panelHeader">
          <div>
            <h2 style={{ margin: 0 }}>Recent measurements</h2>
            <div className="small">Newest 20 imported rows</div>
          </div>
        </div>
        {data.recent.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Measured</th>
                <th>Weight</th>
                <th>Body fat</th>
                <th>BMI</th>
                <th>Water</th>
                <th>Muscle</th>
                <th>User</th>
              </tr>
            </thead>
            <tbody>
              {(data.recent as MeasurementRow[]).map((row) => (
                <tr key={row.measured_at}>
                  <td>{formatDate(row.measured_at)}</td>
                  <td>{formatWeightLbs(row.weight_kg)}</td>
                  <td>{formatMetric(row.body_fat_pct, '%')}</td>
                  <td>{formatMetric(row.bmi, '')}</td>
                  <td>{formatMetric(row.water_pct, '%')}</td>
                  <td>{formatMetric(row.muscle_pct, '%')}</td>
                  <td>{row.source_user_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="small">No imported RENPHO measurements yet.</div>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="panelHeader">
          <div>
            <h2 style={{ margin: 0 }}>Recent MyFitnessPal nutrition</h2>
            <div className="small">Newest 20 imported daily rows from CSV backlog</div>
          </div>
        </div>
        {nutritionRecent.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Calories</th>
                <th>Protein</th>
                <th>Carbs</th>
                <th>Fat</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {nutritionRecent.map((row) => (
                <tr key={row.entry_date}>
                  <td>{formatDay(row.entry_date)}</td>
                  <td>{formatCalories(row.calories)}</td>
                  <td>{formatGrams(row.protein_g)}</td>
                  <td>{formatGrams(row.carbs_g)}</td>
                  <td>{formatGrams(row.fat_g)}</td>
                  <td>{row.confidence ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="small">No imported MyFitnessPal rows yet.</div>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="panelHeader">
          <div>
            <h2 style={{ margin: 0 }}>Garmin steps groundwork</h2>
            <div className="small">Schema and sync scaffolding are ready; local refresh/export discovery is still pending.</div>
          </div>
        </div>
        {latestSteps ? (
          <div className="small">
            Latest Garmin step day: {formatDay(latestSteps.step_date)} ({latestSteps.steps?.toLocaleString() ?? '—'} steps)
          </div>
        ) : (
          <div className="small">
            No Garmin steps imported yet. Configure <span className="code">GARMIN_STEPS_CSV_PATH</span> once the local app export path is confirmed.
          </div>
        )}
      </section>
    </main>
  );
}
