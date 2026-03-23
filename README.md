# health-dashboard

Local-first health dashboard that imports RENPHO body metrics and MyFitnessPal daily nutrition into a local SQLite app DB, then serves a Next.js UI.

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
  - groundwork schema + sync hook exists, but local refresh/export discovery is still a blocker

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
- Garmin groundwork:
  - latest imported step day if configured
  - otherwise explicit blocker/configuration notice

## Setup

```bash
cd /Users/ryan-desktop/.openclaw/workspace/health-dashboard
npm install
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
- `npm run sync:renpho` (RENPHO only)
- `npm run sync:myfitnesspal` (MyFitnessPal only)
- `npm run sync:garmin` (Garmin only)

HTTP path:

```bash
curl -X POST 'http://localhost:3000/api/sync?trigger=scheduled'
```

`POST /api/sync` now runs the same multi-source sync pipeline and returns per-source results.

## Environment variables

- `RENPHO_DB_PATH`
  - override RENPHO sqlite source path
- `MYFITNESSPAL_CSV_PATH`
  - override MyFitnessPal CSV path
  - default: `data/myfitnesspal-diary-rowens794-2025-06-01-to-2026-03-19.csv`
- `GARMIN_STEPS_CSV_PATH`
  - optional Garmin CSV path for step import groundwork
  - expected columns include a date field (`date`, `day`, or `step_date`) and a steps field (`steps`, `step_count`, or `total_steps`)
- `HEALTH_DASHBOARD_DB_PATH`
  - override local app DB location

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
  - Garmin daily step groundwork table
- `sync_runs`
  - per-source import run history
- `source_connectors`
  - source registry and status notes

## Garmin blocker (explicit)

Groundwork is complete for schema/import wiring, but exact local Garmin app refresh/export discovery on this machine is still pending.

Current blocker:

- we do not yet have a confirmed, repeatable local command/path that pulls the latest Garmin step datapoints into a known file/db location

Until that is confirmed, Garmin sync runs are logged as `blocked` unless `GARMIN_STEPS_CSV_PATH` is set to a valid local export.

## Notes

- The local SQLite DB files under `data/*.sqlite*` are git-ignored.
- RENPHO source reads are performed in sqlite read-only mode.
