#!/usr/bin/env python3
"""Backfill Garmin Connect daily steps into data/health.csv via logged-in Chrome."""

from __future__ import annotations

import argparse
import datetime as dt
import time

from sync_garmin_steps import fetch_steps_range_via_chrome, log_sync, write_steps_rows


def chunk_ranges(start: dt.date, end: dt.date, chunk_days: int = 28, reverse: bool = True):
    if reverse:
        current_end = end
        while current_end >= start:
            current_start = max(start, current_end - dt.timedelta(days=chunk_days - 1))
            yield current_start, current_end
            current_end = current_start - dt.timedelta(days=1)
    else:
        current_start = start
        while current_start <= end:
            current_end = min(end, current_start + dt.timedelta(days=chunk_days - 1))
            yield current_start, current_end
            current_start = current_end + dt.timedelta(days=1)


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill Garmin step data through a logged-in Chrome tab")
    parser.add_argument("--start", required=True, help="YYYY-MM-DD")
    parser.add_argument("--end", default=dt.date.today().isoformat(), help="YYYY-MM-DD")
    parser.add_argument("--chrome-cdp-port", type=int, default=9224)
    parser.add_argument("--chunk-days", type=int, default=28)
    parser.add_argument("--delay-seconds", type=float, default=2.0)
    parser.add_argument("--reverse", action="store_true", default=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    start = dt.date.fromisoformat(args.start)
    end = dt.date.fromisoformat(args.end)
    ok = failed = rows = 0

    for chunk_start, chunk_end in chunk_ranges(start, end, args.chunk_days, args.reverse):
        start_s = chunk_start.isoformat()
        end_s = chunk_end.isoformat()
        try:
            step_rows = fetch_steps_range_via_chrome(args.chrome_cdp_port, start_s, end_s)
            if not args.dry_run:
                write_steps_rows(step_rows)
                log_sync("ok", f"{start_s}..{end_s}: {len(step_rows)} days")
            rows += len(step_rows)
            ok += 1
            total_steps = sum(int(row.get("steps", 0)) for row in step_rows)
            print(f"OK {start_s}..{end_s}: {len(step_rows)} days, {total_steps} steps", flush=True)
        except Exception as e:  # noqa: BLE001 - continue backfill past failed chunks.
            failed += 1
            message = f"{start_s}..{end_s}: {e}"
            if not args.dry_run:
                log_sync("error", message)
            print(f"ERROR {message}", flush=True)
        time.sleep(args.delay_seconds)

    print(f"DONE chunks_ok={ok} chunks_failed={failed} rows={rows}", flush=True)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
