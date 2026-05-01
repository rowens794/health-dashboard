#!/usr/bin/env bash
set -euo pipefail

PROFILE_DIR="${HOME}/.openclaw/browser-profiles/health-dashboard-mfp"
CDP_PORT="${MFP_CHROME_CDP_PORT:-9223}"
USERNAME="${MFP_USERNAME:-rowens794}"
DATE="${1:-$(date +%F)}"

mkdir -p "${PROFILE_DIR}"

open -na "Google Chrome" --args \
  --user-data-dir="${PROFILE_DIR}" \
  --profile-directory="Default" \
  --remote-debugging-address="127.0.0.1" \
  --remote-debugging-port="${CDP_PORT}" \
  --no-first-run \
  --no-default-browser-check \
  "https://www.myfitnesspal.com/food/diary/${USERNAME}?date=${DATE}"
