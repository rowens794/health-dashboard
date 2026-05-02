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

from sync_mfp_public_diary import cdp_call

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
    rows = fetch_steps_range_via_chrome(port, date, date)
    if not rows:
        raise ValueError(f"No Garmin step row returned for {date}")
    return int(rows[0]["steps"])


def fetch_steps_range_via_chrome(port: int, start: str, end: str) -> list[dict[str, int | str]]:
    page = garmin_page(port)
    # Use Garmin Connect's own /gc-api proxy from inside the authenticated page.
    # CSRF is required or Garmin returns 403.
    expression = f"""
    (async () => {{
      const start = {json.dumps(start)};
      const end = {json.dumps(end)};
      const token = document.querySelector('meta[name="csrf-token"]')?.content;
      const path = `/gc-api/usersummary-service/stats/steps/daily/${{start}}/${{end}}`;
      const res = await fetch(path, {{
        credentials: 'include',
        headers: {{
          'Accept': 'application/json',
          'NK': 'NT',
          'X-Requested-With': 'XMLHttpRequest',
          'connect-csrf-token': token || ''
        }}
      }});
      const text = await res.text();
      if (!res.ok) return {{ error: `HTTP ${{res.status}}`, text }};
      const data = JSON.parse(text);
      return data.map(row => ({{
        date: row.calendarDate,
        steps: row.totalSteps ?? row.steps ?? row.dailyStepCount ?? 0
      }}));
    }})()
    """
    message = cdp_call(
        page["webSocketDebuggerUrl"],
        "Runtime.evaluate",
        {"expression": expression, "returnByValue": True, "awaitPromise": True},
    )
    result = message.get("result", {}).get("result", {}).get("value")
    if not isinstance(result, list):
        raise ValueError(f"Could not fetch Garmin steps {start}..{end}: {result}")
    return result


def read_rows() -> tuple[list[dict[str, str]], list[str]]:
    if not HEALTH_CSV.exists():
        return [], ["date", "weight_lbs", "calories", "steps", "protein_g", "carbs_g", "fat_g"]
    with HEALTH_CSV.open(newline="") as f:
        reader = csv.DictReader(f)
        return list(reader), list(reader.fieldnames or [])


def write_steps_rows(step_rows: list[dict[str, int | str]]) -> None:
    rows, fieldnames = read_rows()
    for field in ["date", "weight_lbs", "calories", "steps", "protein_g", "carbs_g", "fat_g"]:
        if field not in fieldnames:
            fieldnames.append(field)
    for step_row in step_rows:
        date = str(step_row["date"])
        row = next((r for r in rows if r.get("date") == date), None)
        if row is None:
            row = {field: "" for field in fieldnames}
            row["date"] = date
            rows.append(row)
        row["steps"] = str(int(step_row["steps"]))
    rows.sort(key=lambda r: r.get("date", ""))
    with HEALTH_CSV.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_steps(date: str, steps: int) -> None:
    write_steps_rows([{"date": date, "steps": steps}])


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
