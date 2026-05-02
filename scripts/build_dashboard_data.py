#!/usr/bin/env python3
"""Build dashboard-facing health CSV with cleaned/imputed values.

Raw source syncs write data/health.csv. This script preserves that file as the
source-of-truth and writes data/dashboard-health.csv for presentation.
"""

from __future__ import annotations

import argparse
import csv
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_CSV = ROOT / "data" / "health.csv"
OUT_CSV = ROOT / "data" / "dashboard-health.csv"

FIELDS = [
    "date",
    "weight_lbs",
    "calories",
    "steps",
    "protein_g",
    "carbs_g",
    "fat_g",
    "bodyfat_percent",
    "imputed_fields",
]


def as_float(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def as_int(value: str | None) -> int | None:
    number = as_float(value)
    return None if number is None else round(number)


def true_weight(row: dict[str, str]) -> float | None:
    weight = as_float(row.get("weight_lbs"))
    # Exclude obvious non-user/body-unit errors. Current bad point: 78.4 lb.
    if weight is None or weight < 120 or weight > 250:
        return None
    return weight


def true_positive(row: dict[str, str], field: str) -> float | None:
    value = as_float(row.get(field))
    if value is None or value <= 0:
        return None
    return value


def nearest_before_after(rows: list[dict[str, str]], index: int, getter) -> tuple[float | None, float | None]:
    before = after = None
    for i in range(index - 1, -1, -1):
        value = getter(rows[i])
        if value is not None:
            before = value
            break
    for i in range(index + 1, len(rows)):
        value = getter(rows[i])
        if value is not None:
            after = value
            break
    return before, after


def nearest_n(rows: list[dict[str, str]], index: int, getter, n: int = 7) -> list[float]:
    candidates: list[tuple[int, float]] = []
    for i, row in enumerate(rows):
        if i == index:
            continue
        value = getter(row)
        if value is not None:
            candidates.append((abs(i - index), value))
    candidates.sort(key=lambda item: item[0])
    return [value for _, value in candidates[:n]]


def build_rows(raw_rows: list[dict[str, str]]) -> list[dict[str, str]]:
    rows = [dict(row) for row in raw_rows]
    out: list[dict[str, str]] = []

    for i, row in enumerate(rows):
        new = {field: row.get(field, "") for field in FIELDS if field != "imputed_fields"}
        imputed: list[str] = []

        weight = true_weight(row)
        if weight is None:
            before, after = nearest_before_after(rows, i, true_weight)
            values = [v for v in (before, after) if v is not None]
            if values:
                weight = statistics.fmean(values)
                new["weight_lbs"] = f"{weight:.1f}"
                imputed.append("weight_lbs")
            else:
                new["weight_lbs"] = ""
        else:
            new["weight_lbs"] = f"{weight:.1f}"

        bodyfat = true_positive(row, "bodyfat_percent")
        if bodyfat is None and "weight_lbs" in imputed:
            before, after = nearest_before_after(rows, i, lambda r: true_positive(r, "bodyfat_percent"))
            values = [v for v in (before, after) if v is not None]
            if values:
                new["bodyfat_percent"] = f"{statistics.fmean(values):.1f}"
                imputed.append("bodyfat_percent")
            else:
                new["bodyfat_percent"] = ""
        elif bodyfat is not None:
            new["bodyfat_percent"] = f"{bodyfat:.1f}"
        else:
            new["bodyfat_percent"] = ""

        for field in ["calories", "protein_g", "carbs_g", "fat_g"]:
            value = true_positive(row, field)
            if value is None:
                values = nearest_n(rows, i, lambda r, f=field: true_positive(r, f), 7)
                if values:
                    new[field] = str(round(statistics.fmean(values) * 1.25))
                    imputed.append(field)
                else:
                    new[field] = ""
            else:
                new[field] = str(round(value))

        steps = true_positive(row, "steps")
        if steps is None:
            values = nearest_n(rows, i, lambda r: true_positive(r, "steps"), 7)
            if values:
                new["steps"] = str(round(statistics.fmean(values) * 0.8))
                imputed.append("steps")
            else:
                new["steps"] = ""
        else:
            new["steps"] = str(round(steps))

        new["imputed_fields"] = ";".join(imputed)
        out.append(new)

    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Build dashboard-health.csv from raw health.csv")
    parser.add_argument("--input", type=Path, default=RAW_CSV)
    parser.add_argument("--output", type=Path, default=OUT_CSV)
    args = parser.parse_args()

    with args.input.open(newline="") as f:
        raw_rows = list(csv.DictReader(f))
    rows = build_rows(raw_rows)
    with args.output.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    imputed_count = sum(bool(row["imputed_fields"]) for row in rows)
    print(f"wrote {args.output} with {len(rows)} rows; {imputed_count} rows imputed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
