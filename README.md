# Health Dashboard

Static CSV-backed dashboard for tracking weight, DEXA-estimated body fat, calories/macros, steps, and estimated TDEE.

## What it shows

- Weight line chart at the top of the page
- 7-day moving average overlay
- Sync status panel for the Mac mini job
- Daily table with:
  - Date
  - Weight
  - DEXA-estimated body fat
  - Calories
  - Steps
  - Protein
  - Carbs
  - Fat
  - Estimated TDEE

## Data file

Raw syncs write `data/health.csv`. DEXA scan anchors live in `data/dexa.csv`. The dashboard reads `data/dashboard-health.csv`, which is generated from the raw CSV with obvious bad weight rows removed, missing values imputed for presentation, and body-fat percentage recalculated from DEXA fat-free-mass anchors plus daily weight.

```csv
date,weight_lbs,calories,steps,protein_g,carbs_g,fat_g,bodyfat_percent,dexa_fat_free_mass_lbs,scale_bodyfat_percent,imputed_fields
2026-05-01,172.0,443,10773,28,58,16,16.6,143.4,17.8,
```

Keep one row per day in the raw CSV. `bodyfat_percent` in the dashboard CSV is DEXA-estimated; `scale_bodyfat_percent` preserves the RENPHO scale value for comparison.

## DEXA body-fat estimate

`data/dexa.csv` stores scan anchors with total mass, fat mass, lean tissue, bone mineral content, and fat-free mass. The dashboard estimates daily body fat as:

```text
bodyfat_percent = (daily_weight_lbs - dexa_fat_free_mass_lbs) / daily_weight_lbs * 100
```

Between scans, fat-free mass is linearly interpolated. Before the first scan it uses the first scan's fat-free mass; after the latest scan it carries forward the latest scan's fat-free mass.

## Estimated TDEE

Estimated TDEE is calculated from rolling history:

```text
est_tdee = average daily calories - ((weight_change_lbs * 3500) / elapsed_days)
```

So if weight drops while calories are steady, estimated TDEE rises. The dashboard waits until there is enough history before showing a value.

This is intentionally a trend estimate, not a precise daily measurement.

## Run locally

Because browsers restrict `fetch()` from local files, use a tiny local static server:

```sh
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## GitHub Pages

This project is static and can be served directly from GitHub Pages.

Important: health data is private. Do not publish this as a public repo unless you are comfortable exposing the CSV contents.

## MyFitnessPal public diary sync

There is an initial parser at `scripts/sync_mfp_public_diary.py`:

```sh
scripts/sync_mfp_public_diary.py --username rowens794 --date 2026-05-01
```

It targets public diary URLs like:

```text
https://www.myfitnesspal.com/food/diary/rowens794?date=2026-05-01
```

Current caveat: MyFitnessPal is returning a Cloudflare challenge to direct unattended HTTP fetches from this machine, so direct scheduled fetches currently log `blocked` in `data/sync-log.csv`.

The working unattended path is a dedicated local Chrome profile that Ryan logged into once:

```sh
scripts/open_mfp_chrome.sh 2026-05-01
scripts/sync_mfp_public_diary.py --date 2026-05-01 --chrome-cdp-port 9223
```

The parser also works against saved diary HTML via:

```sh
scripts/sync_mfp_public_diary.py --date 2026-05-01 --html-file path/to/diary.html
```

The Chrome path is good enough to test scheduled syncing. It should be monitored because MyFitnessPal can still expire the session or require a fresh login/challenge.

## Scheduled sync

The combined runner is:

```sh
scripts/sync_all.py --commit --push
```

It runs today's MyFitnessPal diary sync, today's Garmin steps sync, RENPHO cloud-cache weight sync, and `scripts/build_dashboard_data.py`, then refreshes `data/sync-status.json` for the dashboard. It opens the dedicated Chrome profiles if their DevTools ports are not already running and best-effort opens RENPHO Health so the Mac app can refresh Bluetooth/cloud state. With `--push`, GitHub Pages updates after scheduled sync commits.

OpenClaw cron job `health-dashboard-sync-3x-daily` runs this at **06:00, 14:00, and 21:00 America/New_York**.

If RENPHO fails with an expired/stale cache, open RENPHO Health on the Mac mini once and rerun the sync.

## Planned next steps

- Add GitHub remote / private Pages deployment when ready
- Add goals/targets once the baseline dashboard is stable
