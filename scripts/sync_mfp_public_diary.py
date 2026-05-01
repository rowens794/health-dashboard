#!/usr/bin/env python3
"""Sync calories/macros from a public MyFitnessPal diary page into data/health.csv.

This uses the public diary URL shape:
  https://www.myfitnesspal.com/food/diary/<username>?date=YYYY-MM-DD

MyFitnessPal currently protects the site with Cloudflare, so unattended direct
fetches may fail with HTTP 403. The parser still supports saved diary HTML via
--html-file, which gives us a stable ingestion contract while we decide whether
to use a browser-authenticated export flow later.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HEALTH_CSV = ROOT / "data" / "health.csv"
SYNC_LOG_CSV = ROOT / "data" / "sync-log.csv"
DEFAULT_USERNAME = "rowens794"
BASE_URL = "https://www.myfitnesspal.com/food/diary/{username}?date={date}"


@dataclass
class MfpTotals:
    date: str
    calories: int
    carbs_g: int
    fat_g: int
    protein_g: int


class TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_cell = False
        self.current_cell: list[str] = []
        self.current_row: list[str] = []
        self.rows: list[list[str]] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag.lower() in {"td", "th"}:
            self.in_cell = True
            self.current_cell = []
        elif tag.lower() == "tr":
            self.current_row = []

    def handle_data(self, data: str) -> None:
        if self.in_cell:
            self.current_cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"td", "th"} and self.in_cell:
            text = normalize(" ".join(self.current_cell))
            self.current_row.append(text)
            self.in_cell = False
        elif tag == "tr" and self.current_row:
            self.rows.append(self.current_row)
            self.current_row = []


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def as_int(value: str) -> int:
    cleaned = re.sub(r"[^0-9.-]", "", value)
    if cleaned in {"", ".", "-"}:
        return 0
    return round(float(cleaned))


def fetch_diary(username: str, date: str) -> str:
    url = BASE_URL.format(username=username, date=date)
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 HealthDashboard/0.1 (+local personal sync)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def parse_totals(html: str, date: str) -> MfpTotals:
    parser = TableParser()
    parser.feed(html)

    # Legacy public diary pages expose columns as:
    # Meal/Food | Calories | Carbs | Fat | Protein | Sodium | Sugar
    # The daily aggregate row begins with "Totals".
    for row in parser.rows:
        if not row:
            continue
        label = row[0].lower()
        if label == "totals" or label.startswith("totals "):
            numbers = [as_int(cell) for cell in row[1:5]]
            if len(numbers) >= 4:
                return MfpTotals(
                    date=date,
                    calories=numbers[0],
                    carbs_g=numbers[1],
                    fat_g=numbers[2],
                    protein_g=numbers[3],
                )

    # Some variants have a "Food" table where individual food rows can be summed.
    calories = carbs = fat = protein = 0
    food_rows = 0
    for row in parser.rows:
        if len(row) < 5:
            continue
        first = row[0].lower()
        if first in {"breakfast", "lunch", "dinner", "snacks", "totals", "your daily goal", "remaining"}:
            continue
        if " - " not in row[0] and not re.search(r",\s*\d", row[0]):
            continue
        calories += as_int(row[1])
        carbs += as_int(row[2])
        fat += as_int(row[3])
        protein += as_int(row[4])
        food_rows += 1

    if food_rows:
        return MfpTotals(date=date, calories=calories, carbs_g=carbs, fat_g=fat, protein_g=protein)

    raise ValueError("Could not find MyFitnessPal totals in diary HTML")


def read_health_rows() -> list[dict[str, str]]:
    with HEALTH_CSV.open(newline="") as f:
        return list(csv.DictReader(f))


def write_health_rows(rows: list[dict[str, str]], fieldnames: list[str]) -> None:
    with HEALTH_CSV.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def update_health_csv(totals: MfpTotals) -> None:
    rows = read_health_rows()
    fieldnames = ["date", "weight_lbs", "calories", "steps", "protein_g", "carbs_g", "fat_g"]
    if rows:
        fieldnames = list(rows[0].keys())
    for field in ["date", "weight_lbs", "calories", "steps", "protein_g", "carbs_g", "fat_g"]:
        if field not in fieldnames:
            fieldnames.append(field)

    row = next((r for r in rows if r.get("date") == totals.date), None)
    if row is None:
        row = {name: "" for name in fieldnames}
        row["date"] = totals.date
        rows.append(row)

    row["calories"] = str(totals.calories)
    row["protein_g"] = str(totals.protein_g)
    row["carbs_g"] = str(totals.carbs_g)
    row["fat_g"] = str(totals.fat_g)

    rows.sort(key=lambda r: r.get("date", ""))
    write_health_rows(rows, fieldnames)


def log_sync(source: str, status: str, message: str) -> None:
    exists = SYNC_LOG_CSV.exists()
    with SYNC_LOG_CSV.open("a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["sync_at", "source", "status", "message"])
        if not exists:
            writer.writeheader()
        writer.writerow({
            "sync_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
            "source": source,
            "status": status,
            "message": message,
        })


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync MyFitnessPal public diary totals into health.csv")
    parser.add_argument("--username", default=DEFAULT_USERNAME)
    parser.add_argument("--date", default=dt.date.today().isoformat())
    parser.add_argument("--html-file", type=Path, help="Parse saved diary HTML instead of fetching")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    source = f"mfp:{args.username}"
    try:
        html = args.html_file.read_text(errors="replace") if args.html_file else fetch_diary(args.username, args.date)
        totals = parse_totals(html, args.date)
        if args.dry_run:
            print(totals)
        else:
            update_health_csv(totals)
            log_sync(source, "ok", f"{args.date}: {totals.calories} cal, P{totals.protein_g}/C{totals.carbs_g}/F{totals.fat_g}")
        return 0
    except urllib.error.HTTPError as e:
        message = f"HTTP {e.code}; MyFitnessPal may be blocking unattended fetches"
        log_sync(source, "blocked", message)
        print(message, file=sys.stderr)
        return 2
    except Exception as e:  # noqa: BLE001 - CLI should log any sync failure.
        log_sync(source, "error", str(e))
        print(str(e), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
