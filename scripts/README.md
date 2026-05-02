# Sync scripts

This folder is reserved for ingestion code.

Target behavior:

1. Pull Garmin steps
2. Pull Renpho weight
3. Pull MyFitnessPal calories/macros
4. Normalize into `data/health.csv`
5. Append source results to `data/sync-log.csv`
6. Commit/push so GitHub Pages updates

The first dashboard version is intentionally CSV-first so the data contract stays simple while integrations are hardened.

## RENPHO

`scripts/sync_renpho_local_db.py` reads the app's local SQLite tables when they contain scale rows.

On this Mac those tables can be empty even when the app shows cloud history, so `scripts/sync_renpho_cloud_cache.py` is the working connector. It reuses the logged-in RENPHO Health macOS app cache request template, decrypts/encrypts the app's AES payload format, fetches `queryAllMeasureDataList` pages, and writes daily `weight_lbs` plus `bodyfat_percent` to `data/health.csv`.

No RENPHO credentials or tokens are stored in the repo; the script reads the current app cache at runtime. If the cached token expires, open RENPHO Health once and rerun the script.
