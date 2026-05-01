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
