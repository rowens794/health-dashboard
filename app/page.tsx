import { getDashboardData } from '@/lib/db';
import { SyncButton } from '@/components/SyncButton';
import { TrendChart } from '@/components/TrendChart';

const KG_TO_LB = 2.2046226218;

function formatMetric(value: number | null | undefined, suffix: string) {
  return value == null ? '—' : `${value}${suffix}`;
}

function formatWeightLbs(valueKg: number | null | undefined) {
  if (valueKg == null) return '—';
  return `${(valueKg * KG_TO_LB).toFixed(1)} lb`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getHoursSince(value: string | null | undefined) {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / (1000 * 60 * 60);
}

export default function HomePage() {
  const data = getDashboardData();
  const latest = data.latest;
  const latestMeasurementAgeHours = getHoursSince(latest?.measured_at);
  const sourceMayBeStale = latestMeasurementAgeHours != null && latestMeasurementAgeHours > 36;

  return (
    <main>
      <div className="header">
        <div>
          <h1 className="title">Health Dashboard</h1>
          <div className="subtitle">RENPHO-first local dashboard. MyFitnessPal and Garmin can slot into the same app DB later.</div>
        </div>
        <div className="badge">Local-only MVP</div>
      </div>

      <div className="notice" style={{ marginBottom: 16 }}>
        Manual sync is live now. Scheduled sync can hit <span className="code">POST /api/sync?trigger=scheduled</span> or run <span className="code">npm run sync</span> from launchd/cron.
      </div>

      <div className="notice" style={{ marginBottom: 16 }}>
        RENPHO caveat: this dashboard only imports what the local <span className="code">RENPHO Health</span> Mac app has already pulled into its sqlite. If new weigh-ins are missing, open the app and let it sync first.
      </div>

      {sourceMayBeStale ? (
        <div className="notice" style={{ marginBottom: 16, borderColor: '#f59e0b', background: '#3a2a07' }}>
          Source may be stale: latest imported RENPHO measurement is from {formatDate(latest?.measured_at)}. If that looks wrong, make sure <span className="code">RENPHO Health</span> is open on this Mac and trigger a sync there before rerunning dashboard sync.
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
          <TrendChart points={data.trend} />
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
                  <th>Trigger</th>
                  <th>Scanned</th>
                  <th>Inserted</th>
                </tr>
              </thead>
              <tbody>
                {data.syncRuns.map((run: { finished_at: string; trigger_type: string; scanned_count: number; inserted_count: number }) => (
                  <tr key={`${run.finished_at}-${run.trigger_type}`}>
                    <td>{formatDate(run.finished_at)}</td>
                    <td>{run.trigger_type}</td>
                    <td>{run.scanned_count}</td>
                    <td>{run.inserted_count}</td>
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
              {data.recent.map((row: { measured_at: string; weight_kg: number | null; body_fat_pct: number | null; bmi: number | null; water_pct: number | null; muscle_pct: number | null; source_user_id: string }) => (
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
    </main>
  );
}
