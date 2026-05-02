#!/usr/bin/env python3
"""Sync RENPHO Health local SQLite weight records into data/health.csv.

The RENPHO iOS-on-macOS app keeps a SQLite DB at:
~/Library/Containers/60D3E105-BB1C-4728-8C12-6C8358ED5D76/Data/Documents/renphoHealth.sqlite

On this Mac, the schema is present but the weight tables are currently empty.
This script is ready for when the app syncs records locally.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import os
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HEALTH_CSV = ROOT / "data" / "health.csv"
SYNC_LOG_CSV = ROOT / "data" / "sync-log.csv"
DEFAULT_DB = Path.home() / "Library/Containers/60D3E105-BB1C-4728-8C12-6C8358ED5D76/Data/Documents/renphoHealth.sqlite"


def date_from_timestamp(value) -> str | None:
    if value in (None, ""):
        return None
    try:
        raw = float(value)
    except (TypeError, ValueError):
        text = str(value)
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
            try:
                return dt.datetime.strptime(text[:19], fmt).date().isoformat()
            except ValueError:
                pass
        return None
    if raw > 10_000_000_000:
        raw /= 1000
    return dt.datetime.fromtimestamp(raw).date().isoformat()


def normalize_lbs(weight: float, unit: int | None) -> float:
    # RENPHO commonly stores kg when unit is 0/metric. If the value is already
    # human-scale pounds (> 140 here), leave it alone. This keeps extraction sane
    # across app versions.
    if weight < 140:
        return weight * 2.2046226218
    return weight


def rows_from_db(db_path: Path) -> list[dict[str, str]]:
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    out: list[dict[str, str]] = []

    for table in ("bodyScale", "RH8EScaleMeasureDataDBModel"):
        exists = con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
        if not exists:
            continue
        cols = {row[1] for row in con.execute(f'PRAGMA table_info("{table}")')}
        if not {"timeStamp", "weight"}.issubset(cols):
            continue
        unit_col = "weightUnit" if "weightUnit" in cols else None
        order_col = "timeStamp"
        sql = f'SELECT timeStamp, weight{", weightUnit" if unit_col else ""} FROM "{table}" WHERE weight IS NOT NULL AND weight > 0 ORDER BY {order_col}'
        for row in con.execute(sql):
            date = date_from_timestamp(row["timeStamp"])
            if not date:
                continue
            unit = row["weightUnit"] if unit_col else None
            lbs = normalize_lbs(float(row["weight"]), unit)
            out.append({"date": date, "weight_lbs": f"{lbs:.1f}"})

    # Keep the latest record per day if there are duplicates.
    by_date = {row["date"]: row for row in out}
    return [by_date[d] for d in sorted(by_date)]


def read_health_rows() -> tuple[list[dict[str, str]], list[str]]:
    with HEALTH_CSV.open(newline="") as f:
        reader = csv.DictReader(f)
        return list(reader), list(reader.fieldnames or [])


def write_weight_rows(weight_rows: list[dict[str, str]]) -> None:
    rows, fieldnames = read_health_rows()
    for field in ["date", "weight_lbs", "calories", "steps", "protein_g", "carbs_g", "fat_g"]:
        if field not in fieldnames:
            fieldnames.append(field)
    for weight_row in weight_rows:
        date = weight_row["date"]
        row = next((r for r in rows if r.get("date") == date), None)
        if row is None:
            row = {field: "" for field in fieldnames}
            row["date"] = date
            rows.append(row)
        row["weight_lbs"] = weight_row["weight_lbs"]
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
            "source": "renpho:local-db",
            "status": status,
            "message": message,
        })


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync RENPHO local SQLite weights into health.csv")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.db.exists():
        log_sync("error", f"DB not found: {args.db}")
        print(f"DB not found: {args.db}")
        return 1

    rows = rows_from_db(args.db)
    if args.dry_run:
        print(f"found {len(rows)} RENPHO weight rows")
        for row in rows[-10:]:
            print(f"{row['date']}: {row['weight_lbs']} lb")
    else:
        write_weight_rows(rows)
        log_sync("ok", f"imported {len(rows)} weight rows from {args.db}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
