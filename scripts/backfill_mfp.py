#!/usr/bin/env python3
"""Backfill MyFitnessPal diary totals into data/health.csv via logged-in Chrome."""

from __future__ import annotations

import argparse
import datetime as dt
import random
import time

from sync_mfp_public_diary import (
    DEFAULT_USERNAME,
    chrome_navigate_and_html,
    log_sync,
    parse_totals,
    update_health_csv,
)


def dates_between(start: dt.date, end: dt.date, reverse: bool = False):
    if reverse:
        current = end
        while current >= start:
            yield current
            current -= dt.timedelta(days=1)
    else:
        current = start
        while current <= end:
            yield current
            current += dt.timedelta(days=1)


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill MyFitnessPal public diary data through a logged-in Chrome tab")
    parser.add_argument("--username", default=DEFAULT_USERNAME)
    parser.add_argument("--start", required=True, help="YYYY-MM-DD")
    parser.add_argument("--end", default=dt.date.today().isoformat(), help="YYYY-MM-DD")
    parser.add_argument("--chrome-cdp-port", type=int, default=9223)
    parser.add_argument("--delay-seconds", type=float, default=2.5, help="Base delay between diary page loads")
    parser.add_argument("--reverse", action="store_true", help="Walk backward from --end to --start")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    start = dt.date.fromisoformat(args.start)
    end = dt.date.fromisoformat(args.end)
    if end < start:
        raise SystemExit("--end must be on or after --start")

    source = f"mfp-backfill:{args.username}"
    ok = failed = 0
    for day in dates_between(start, end, reverse=args.reverse):
        date = day.isoformat()
        try:
            html = chrome_navigate_and_html(args.chrome_cdp_port, args.username, date)
            totals = parse_totals(html, date)
            if not args.dry_run:
                update_health_csv(totals)
                log_sync(source, "ok", f"{date}: {totals.calories} cal, P{totals.protein_g}/C{totals.carbs_g}/F{totals.fat_g}")
            print(f"OK {date}: {totals.calories} cal P{totals.protein_g}/C{totals.carbs_g}/F{totals.fat_g}", flush=True)
            ok += 1
        except Exception as e:  # noqa: BLE001 - backfill should continue past bad days.
            message = f"{date}: {e}"
            if not args.dry_run:
                log_sync(source, "error", message)
            print(f"ERROR {message}", flush=True)
            failed += 1

        time.sleep(args.delay_seconds + random.uniform(0.0, 1.5))

    print(f"DONE ok={ok} failed={failed}", flush=True)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
