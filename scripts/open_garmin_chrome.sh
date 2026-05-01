#!/usr/bin/env bash
set -euo pipefail

PROFILE_DIR="${HOME}/.openclaw/browser-profiles/health-dashboard-garmin"
CDP_PORT="${GARMIN_CHROME_CDP_PORT:-9224}"
URL="${1:-https://connect.garmin.com/app/home}"

mkdir -p "${PROFILE_DIR}"

open -na "Google Chrome" --args \
  --user-data-dir="${PROFILE_DIR}" \
  --profile-directory="Default" \
  --remote-debugging-address="127.0.0.1" \
  --remote-debugging-port="${CDP_PORT}" \
  --no-first-run \
  --no-default-browser-check \
  "${URL}"
