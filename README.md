# health-dashboard

Local-first health dashboard that imports RENPHO body metrics and MyFitnessPal daily nutrition into a local SQLite app DB, then serves a Next.js UI.

Hosted deploys (Vercel) read from a repo-stored snapshot at `data/dashboard-snapshot.json`.

## Stack

- Next.js 15 + TypeScript
- SQLite app DB (`data/health-dashboard.sqlite`)
- macOS `sqlite3` CLI for DB reads/writes
- CSV ingest for MyFitnessPal backlog

## Current data sources

- RENPHO source DB (read-only):
  - `~/Library/Containers/60D3E105-BB1C-4728-8C12-6C8358ED5D76/Data/Documents/renphoHealth.sqlite`
- MyFitnessPal historical CSV backlog:
  - `data/myfitnesspal-diary-rowens794-2025-06-01-to-2026-03-19.csv`
- Garmin:
  - Garmin Connect web sync via local Python client + stored credentials

## What the app now shows

- RENPHO:
  - latest weight/body-fat/BMI/body-composition cards
  - weight trend chart
  - recent imported measurements
- MyFitnessPal:
  - latest daily calories and macros (protein/carbs/fat)
  - recent imported nutrition days
- Sync:
  - recent per-source sync runs (`renpho`, `myfitnesspal`, `garmin`)
  - stale-source notices for RENPHO and MyFitnessPal
- Garmin:
  - latest imported step day from Garmin Connect web
  - sync/error notice if Garmin auth or fetch fails

## Setup

```bash
cd /Users/ryan-desktop/.openclaw/workspace/health-dashboard
npm install
python3 -m venv .venv
source .venv/bin/activate
pip install requests garminconnect
npm run sync
npm run dev
```

Open `http://localhost:3000`.

For production serving on port 3001:

```bash
npm run build
PORT=3001 npm run start
```

## Sync commands

`npm run sync` now runs the unified daily sync pipeline.

- `npm run sync` (all sources: RENPHO + MyFitnessPal + Garmin attempt)
- `npm run sync scheduled` (same, but trigger label is `scheduled`)
- `npm run export:snapshot` (exports current SQLite dashboard view to `data/dashboard-snapshot.json`)
- `npm run sync:hosted` (runs sync with `hosted` trigger + exports snapshot)
- `npm run sync:renpho` (RENPHO only)
- `npm run sync:myfitnesspal` (MyFitnessPal only)
- `npm run sync:garmin` (Garmin only)

HTTP path:

```bash
curl -X POST 'http://localhost:3000/api/sync?trigger=scheduled'
```

`POST /api/sync` now runs the same multi-source sync pipeline and returns per-source results.
In hosted snapshot mode (Vercel), `POST /api/sync` is intentionally read-only and returns `409`.

## Hosted snapshot publish flow

Run this when you want fresh data on Vercel:

```bash
cd /Users/ryan-desktop/.openclaw/workspace/health-dashboard
npm run sync:hosted
git add data/dashboard-snapshot.json
git commit -m "Refresh hosted dashboard snapshot"
git push origin master
```

Vercel builds from git and reads the committed snapshot in hosted mode.

## Environment variables

- `RENPHO_DB_PATH`
  - override RENPHO sqlite source path
- `MYFITNESSPAL_CSV_PATH`
  - override MyFitnessPal CSV path
  - default: `data/myfitnesspal-diary-rowens794-2025-06-01-to-2026-03-19.csv`
- `MYFITNESSPAL_PUBLIC_DIARY_USERNAME`
  - public MyFitnessPal diary username to poll for recent days
  - default: `rowens794`
- `MYFITNESSPAL_PUBLIC_RECENT_DAYS`
  - number of recent public diary days to attempt via browser automation on each sync
  - default: `7`
- `MYFITNESSPAL_BROWSER_PROFILE_PATH`
  - Chrome profile directory used for public diary fetches
  - default: `data/myfitnesspal-browser-profile`
- `MYFITNESSPAL_BROWSER_HEADLESS`
  - run public diary fetch Chrome headless (`true`/`false`)
  - default: `false`
- `MYFITNESSPAL_CHROME_PATH`
  - Chrome executable path for public diary fetches
  - default: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- `GARMIN_EMAIL`
  - Garmin Connect login email
- `GARMIN_PASSWORD`
  - Garmin Connect login password
- `GARMIN_SYNC_START_DATE`
  - first day to backfill for Garmin steps
  - default: `2025-06-01`
- `GARMIN_SYNC_END_DATE`
  - optional end day override; defaults to today
- `GARMIN_TOKENSTORE_PATH`
  - optional OAuth/session token cache path
  - default: `data/garmin-tokenstore.json`
- `GARMIN_PYTHON_PATH`
  - optional Python interpreter path for the Garmin client helper
  - default: `.venv/bin/python`
- `HEALTH_DASHBOARD_DB_PATH`
  - override local app DB location
- `HEALTH_DASHBOARD_SNAPSHOT_PATH`
  - override snapshot JSON path used for export/read
  - default: `data/dashboard-snapshot.json`
- `HEALTH_DASHBOARD_DATA_MODE`
  - force data source mode (`snapshot`/`hosted` or `sqlite`/`local`)
  - default: auto (`snapshot` on Vercel, `sqlite` elsewhere)

## Sync scheduling and launchd

The repo includes two launchd plist templates:

- `ops/com.ryan.health-dashboard.plist`
  - runs the web server on port `3001`
- `ops/com.ryan.health-dashboard.sync-daily.plist`
  - runs `npm run sync scheduled` daily at `06:15`

Install example:

```bash
cd /Users/ryan-desktop/.openclaw/workspace/health-dashboard
mkdir -p logs
npm run build
cp ops/com.ryan.health-dashboard.plist ~/Library/LaunchAgents/
cp ops/com.ryan.health-dashboard.sync-daily.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.ryan.health-dashboard.plist 2>/dev/null || true
launchctl unload ~/Library/LaunchAgents/com.ryan.health-dashboard.sync-daily.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.ryan.health-dashboard.plist
launchctl load ~/Library/LaunchAgents/com.ryan.health-dashboard.sync-daily.plist
launchctl kickstart -k gui/$(id -u)/com.ryan.health-dashboard
launchctl kickstart -k gui/$(id -u)/com.ryan.health-dashboard.sync-daily
```

## App DB schema (high-level)

- `measurements`
  - normalized RENPHO body measurements
- `nutrition_daily`
  - normalized MyFitnessPal daily calories/macros
- `daily_steps`
  - Garmin daily step totals from Garmin Connect web
- `sync_runs`
  - per-source import run history
- `source_connectors`
  - source registry and status notes

## Garmin sync

Garmin now uses Garmin Connect web via a local Python helper built on the `garminconnect` client library.

Current behavior:

- reads `GARMIN_EMAIL` / `GARMIN_PASSWORD` from `.env.local` or env
- caches session/token state in `data/garmin-tokenstore.json`
- backfills daily step totals from `GARMIN_SYNC_START_DATE` through today (or `GARMIN_SYNC_END_DATE` if set)
- stores normalized results in `daily_steps`

If Garmin sync fails, the failure is logged in `sync_runs` and shown in the dashboard sync status section.

## Notes

- The local SQLite DB files under `data/*.sqlite*` are git-ignored.
- `data/dashboard-snapshot.json` is committed and used by hosted deploys.
- RENPHO source reads are performed in sqlite read-only mode.
