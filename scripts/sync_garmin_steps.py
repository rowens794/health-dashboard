#!/usr/bin/env python3
"""Sync Garmin Connect daily steps into data/health.csv.

Initial implementation is designed around a logged-in Chrome session. Once the
Garmin page is authenticated, this script can call Garmin's own web endpoints
from inside that browser context and merge step counts into the shared CSV.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
from pathlib import Path

from sync_mfp_public_diary import cdp_evaluate

ROOT = Path(__file__).resolve().parents[1]
HEALTH_CSV = ROOT / "data" / "health.csv"
SYNC_LOG_CSV = ROOT / "data" / "sync-log.csv"


def cdp_tabs(port: int) -> list[dict]:
    import urllib.request
    return json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=10))


def garmin_page(port: int) -> dict:
    tabs = cdp_tabs(port)
    page = next((t for t in tabs if t.get("type") == "page" and "connect.garmin.com" in t.get("url", "")), None)
    if not page:
        raise ValueError("No Garmin Connect Chrome tab found")
    return page


def fetch_steps_via_chrome(port: int, date: str) -> int:
    page = garmin_page(port)
    # This endpoint is intentionally probed from inside the authenticated browser
    # so Garmin cookies/session state are used without storing credentials here.
    expression = f"""
    (async () => {{
      const date = {json.dumps(date)};
      const candidates = [
        `/usersummary-service/usersummary/daily/${{date}}`,
        `/wellness-service/wellness/dailySummary/chart/${{date}}/${{date}}`
      ];
      const results = [];
      for (const path of candidates) {{
        try {{
          const res = await fetch(path, {{ credentials: 'include' }});
          const text = await res.text();
          results.push({{ path, status: res.status, text }});
          if (res.ok) {{
            const data = JSON.parse(text);
            const direct = data.totalSteps ?? data.steps ?? data.dailyStepCount;
            if (Number.isFinite(direct)) return {{ steps: direct, path }};
            const first = Array.isArray(data) ? data[0] : null;
            const nested = first && (first.totalSteps ?? first.steps ?? first.dailyStepCount);
            if (Number.isFinite(nested)) return {{ steps: nested, path }};
          }}
        }} catch (error) {{
          results.push({{ path, error: String(error) }});
        }}
      }}
      return {{ error: 'No steps field found', results }};
    }})()
    """
    raw = cdp_evaluate(page["webSocketDebuggerUrl"], expression)
    result = json.loads(raw) if isinstance(raw, str) else raw
    if not isinstance(result, dict) or "steps" not in result:
        raise ValueError(f"Could not fetch Garmin steps for {date}: {result}")
    return int(result["steps"])


def read_rows() -> tuple[list[dict[str, str]], list[str]]:
    if not HEALTH_CSV.exists():
        return [], ["date", "weight_lbs", "calories", "steps", "protein_g", "carbs_g", "fat_g"]
    with HEALTH_CSV.open(newline="") as f:
        reader = csv.DictReader(f)
        return list(reader), list(reader.fieldnames or [])


def write_steps(date: str, steps: int) -> None:
    rows, fieldnames = read_rows()
    for field in ["date", "weight_lbs", "calories", "steps", "protein_g", "carbs_g", "fat_g"]:
        if field not in fieldnames:
            fieldnames.append(field)
    row = next((r for r in rows if r.get("date") == date), None)
    if row is None:
        row = {field: "" for field in fieldnames}
        row["date"] = date
        rows.append(row)
    row["steps"] = str(steps)
    rows.sort(key=lambda r: r.get("date", ""))
    with HEALTH_CSV.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def log_sync(status: str, message: str) -> None:
    exists = SYNC_LOG_CSV.exists()
    with SYNC_LOG_CSV.open("a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["sync_at", "source", "status", "message"])
        if not exists:
            writer.writeheader()
        writer.writerow({
            "sync_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
            "source": "garmin:steps",
            "status": status,
            "message": message,
        })


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync Garmin Connect steps into health.csv")
    parser.add_argument("--date", default=dt.date.today().isoformat())
    parser.add_argument("--chrome-cdp-port", type=int, default=9224)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        steps = fetch_steps_via_chrome(args.chrome_cdp_port, args.date)
        if args.dry_run:
            print(f"{args.date}: {steps} steps")
        else:
            write_steps(args.date, steps)
            log_sync("ok", f"{args.date}: {steps} steps")
        return 0
    except Exception as e:  # noqa: BLE001
        log_sync("error", f"{args.date}: {e}")
        print(str(e))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
