# health-dashboard

Local-first health dashboard MVP focused on importing RENPHO body scale measurements into a separate app database, then serving a simple web UI.

## Stack

- Next.js 15 + TypeScript
- SQLite for the app database
- `sqlite3` CLI for both source-db reads and local app-db writes

That keeps the MVP pretty boring in a good way: one web app, one app DB, one importer.

## What it does

- Reads RENPHO data from:
  - `~/Library/Containers/60D3E105-BB1C-4728-8C12-6C8358ED5D76/Data/Documents/renphoHealth.sqlite`
- Reads the source `bodyScale` table in **read-only mode**
- Normalizes/imports these fields into the local app database:
  - `timeStamp` → `measured_at` + `measured_at_epoch`
  - `weight`
  - `bodyfat`
  - `bmi`
  - `water`
  - `muscle`
  - `bone`
  - `protein`
  - `bmr`
  - `bodyage`
  - `userId`
- Stores imported rows in `data/health-dashboard.sqlite`
- Shows:
  - latest weight
  - latest body fat
  - recent measurements
  - weight trend chart
  - recent sync runs

## Setup

```bash
cd /Users/ryan-desktop/.openclaw/workspace/health-dashboard
npm install
npm run sync
npm run dev
```

Then open `http://localhost:3000`.

## Syncing

### Manual sync

Two easy paths:

```bash
npm run sync
```

or from the UI, click **Sync RENPHO now**.

### One-shot endpoint

```bash
curl -X POST http://localhost:3000/api/sync
```

### Scheduled / polling sync design

This MVP does not install a daemon by itself. Instead, it exposes two simple hooks that can be scheduled externally:

- CLI path: `npm run sync`
- HTTP path: `POST /api/sync?trigger=scheduled`

That makes it easy to wire into `launchd`, cron, or another local scheduler later.

Example `launchd` / cron idea:

```bash
*/30 * * * * cd /Users/ryan-desktop/.openclaw/workspace/health-dashboard && npm run sync >> sync.log 2>&1
```

## Architecture notes

### Source DB access

The importer uses the macOS `sqlite3` CLI with `-readonly` when querying the RENPHO database. The MVP only issues `SELECT` statements against the source DB.

### Local app DB schema

Main tables:

- `measurements`
  - normalized imported measurements keyed by `(source, source_record_id)`
- `sync_runs`
  - import run history for manual vs scheduled syncs
- `source_connectors`
  - extension-point registry for future sources

### Current RENPHO sync triggering

- **UI button** → `POST /api/sync` with trigger `manual`
- **CLI script** → `tsx scripts/sync-renpho.ts` with trigger `cli`
- **Scheduler hook** → `POST /api/sync?trigger=scheduled` or `npm run sync scheduled`

The app currently re-imports the source dataset and upserts by RENPHO row id. That's fine for the MVP and keeps sync logic straightforward.

## Extension points

This project is RENPHO-only for now, but the database and connector table leave obvious room for:

- MyFitnessPal nutrition/activity imports
- Garmin activity/body metrics imports

The intended shape is: each source gets its own importer, then normalizes into the shared `measurements`/related app tables.

## Notes

- The local app DB file is intentionally ignored by git.
- If the RENPHO DB location changes, set `RENPHO_DB_PATH` before running sync.
- If you want the app DB elsewhere, set `HEALTH_DASHBOARD_DB_PATH`.
