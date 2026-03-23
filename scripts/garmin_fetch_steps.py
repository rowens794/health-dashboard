#!/usr/bin/env python3
import json
import os
import sys
from datetime import date, datetime, timedelta

from garminconnect import Garmin


def daterange(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def parse_iso_day(value: str | None, fallback: str) -> date:
    if not value:
        return datetime.strptime(fallback, "%Y-%m-%d").date()
    return datetime.strptime(value, "%Y-%m-%d").date()


def main() -> int:
    email = os.environ.get("GARMIN_EMAIL")
    password = os.environ.get("GARMIN_PASSWORD")
    tokenstore = os.environ.get("GARMIN_TOKENSTORE")
    start_value = os.environ.get("GARMIN_SYNC_START_DATE")
    end_value = os.environ.get("GARMIN_SYNC_END_DATE")

    if not email or not password:
        print(json.dumps({
            "ok": False,
            "error": "GARMIN_EMAIL and GARMIN_PASSWORD must be set",
        }))
        return 2

    today = date.today().isoformat()
    start_date = parse_iso_day(start_value, today)
    end_date = parse_iso_day(end_value, today)
    if end_date < start_date:
        start_date, end_date = end_date, start_date

    if tokenstore:
        os.makedirs(tokenstore, exist_ok=True)

    api = Garmin(email, password)
    try:
        api.login(tokenstore or None)
    except FileNotFoundError:
        api.login()
        if tokenstore:
            api.garth.dump(tokenstore)

    rows = []
    for current in daterange(start_date, end_date):
        day = current.isoformat()
        stats = api.get_stats(day)
        rows.append({
            "date": day,
            "steps": stats.get("totalSteps"),
            "source_type": "garmin-connect-web",
            "source_user_id": email,
        })

    print(json.dumps({
        "ok": True,
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "rows": rows,
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
