# Health Dashboard

Static CSV-backed dashboard for tracking weight, calories/macros, steps, and estimated TDEE.

## What it shows

- Weight line chart at the top of the page
- 7-day moving average overlay
- Daily table with:
  - Date
  - Weight
  - Calories
  - Steps
  - Protein
  - Carbs
  - Fat
  - Estimated TDEE

## Data file

The dashboard reads `data/health.csv`.

```csv
date,weight_lbs,calories,steps,protein_g,carbs_g,fat_g
2026-05-01,217.0,2230,9600,183,202,72
```

Keep one row per day. A future sync script can update today's row three times a day as Garmin, Renpho, and MyFitnessPal data arrive.

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

Current caveat: MyFitnessPal is returning a Cloudflare challenge to unattended fetches from this machine, so direct scheduled fetches currently log `blocked` in `data/sync-log.csv`. The parser works against saved diary HTML via:

```sh
scripts/sync_mfp_public_diary.py --date 2026-05-01 --html-file path/to/diary.html
```

Likely next options are a browser-authenticated export flow, a local manual/export bridge, or a different source of MyFitnessPal data.

## Planned next steps

- Decide the reliable MyFitnessPal access path around Cloudflare
- Add real ingestion scripts for Garmin and Renpho
- Add a 3x/day scheduled sync once at least one source is stable
- Add sync status and failure logs to the dashboard
- Add goals/targets once the baseline dashboard is stable
