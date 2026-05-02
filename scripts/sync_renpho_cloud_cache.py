#!/usr/bin/env python3
"""Sync RENPHO cloud scale measurements using the logged-in macOS app cache.

RENPHO's local SQLite tables can be empty even when the app can see cloud
history. The app cache contains a valid logged-in request template for
/RenphoHealth/scale/queryAllMeasureDataList. This script reuses that
user-authorized token/headers from the local app cache, encrypts request bodies
with RENPHO's AES-128-ECB payload format, decrypts responses, and writes daily
weights to data/health.csv.

No RENPHO credentials or tokens are stored in this repo.
"""

from __future__ import annotations

import argparse
import base64
import csv
import datetime as dt
import gzip
import json
import os
import plistlib
import re
import sqlite3
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
HEALTH_CSV = ROOT / "data" / "health.csv"
SYNC_LOG_CSV = ROOT / "data" / "sync-log.csv"
DEFAULT_CACHE_DB = Path.home() / "Library/Containers/60D3E105-BB1C-4728-8C12-6C8358ED5D76/Data/Library/Caches/com.renpho.health/Cache.db"
QUERY_ENDPOINT = "RenphoHealth/scale/queryAllMeasureDataList"
API_BASE = "https://cloud.renpho.com"
# RENPHO payload encryption key used by the mobile app/API.
KEY_HEX = "65642a77696a64692468366665336577"  # ed*wijdi$h6fe3ew
KG_TO_LB = 2.2046226218


def openssl_aes_ecb(data: bytes, *, decrypt: bool) -> bytes:
    cmd = ["openssl", "enc", "-aes-128-ecb", "-K", KEY_HEX]
    if decrypt:
        cmd.insert(2, "-d")
    proc = subprocess.run(cmd, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode:
        raise RuntimeError(proc.stderr.decode("utf-8", "replace"))
    return proc.stdout


def encrypt_payload(obj: dict[str, Any]) -> str:
    raw = json.dumps(obj, separators=(",", ":")).encode("utf-8")
    return base64.b64encode(openssl_aes_ecb(raw, decrypt=False)).decode("ascii")


def decrypt_payload(encrypted_b64: str) -> Any:
    raw = openssl_aes_ecb(base64.b64decode(encrypted_b64), decrypt=True)
    return json.loads(raw.decode("utf-8"))


def decode_jwt_payload(token: str) -> dict[str, Any]:
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))


def copy_sqlite_for_reading(db_path: Path, tmpdir: Path) -> Path:
    """Copy SQLite DB plus WAL/SHM so reads don't block behind the app."""
    target = tmpdir / db_path.name
    shutil.copy2(db_path, target)
    for suffix in ("-wal", "-shm"):
        sidecar = Path(str(db_path) + suffix)
        if sidecar.exists():
            shutil.copy2(sidecar, Path(str(target) + suffix))
    return target


def extract_request_template(cache_db: Path) -> tuple[dict[str, str], dict[str, Any]]:
    with tempfile.TemporaryDirectory(prefix="renpho-cache-") as tmp:
        cache_copy = copy_sqlite_for_reading(cache_db, Path(tmp))
        con = sqlite3.connect(f"file:{cache_copy}?mode=ro", uri=True, timeout=5)
        con.row_factory = sqlite3.Row
        candidates: list[tuple[int, dict[str, str], dict[str, Any]]] = []
        for row in con.execute("SELECT entry_ID, request_object FROM cfurl_cache_blob_data ORDER BY entry_ID"):
            try:
                archived = plistlib.loads(row["request_object"])
                arr = archived["Array"]
                url = arr[1].get("_CFURLString", "") if isinstance(arr[1], dict) else ""
                if QUERY_ENDPOINT not in url:
                    continue
                headers = dict(arr[19])
                body_bytes = arr[21][0]
                body = json.loads(body_bytes.decode("utf-8"))
                query = decrypt_payload(body["encryptData"])
                if not query.get("tableName") or not query.get("userIds"):
                    continue
                candidates.append((int(row["entry_ID"]), headers, query))
            except Exception:
                continue
        con.close()
    if not candidates:
        raise RuntimeError(f"No cached RENPHO {QUERY_ENDPOINT} request found in {cache_db}")
    _, headers, query = candidates[-1]
    return headers, query


def make_hhaa(headers: dict[str, str], content_length: int) -> str:
    signed = {k: [str(v)] for k, v in headers.items() if k != "__hhaa__"}
    signed["Content-Length"] = [str(content_length)]
    return base64.b64encode(plistlib.dumps(signed, fmt=plistlib.FMT_BINARY)).decode("ascii")


def renpho_post(endpoint: str, body_obj: dict[str, Any], headers_template: dict[str, str]) -> dict[str, Any]:
    body = json.dumps({"encryptData": encrypt_payload(body_obj)}, separators=(",", ":")).encode("utf-8")
    headers = dict(headers_template)
    headers.pop("Content-Length", None)
    headers["Accept-Encoding"] = "gzip;q=1.0"
    headers["__hhaa__"] = make_hhaa(headers_template, len(body))
    req = urllib.request.Request(f"{API_BASE}/{endpoint}", data=body, method="POST", headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
    if raw.startswith(b"\x1f\x8b"):
        raw = gzip.decompress(raw)
    result = json.loads(raw)
    code = result.get("code")
    msg = result.get("msg") or result.get("message") or ""
    if str(code) not in {"0", "101", "200", "20000"} and str(msg).lower() != "success":
        raise RuntimeError(f"RENPHO API error: code={code}, msg={msg}")
    if result.get("data"):
        result["_decrypted"] = decrypt_payload(result["data"])
    return result


def measurement_date(record: dict[str, Any]) -> str:
    local = record.get("localCreatedAt")
    if local:
        return str(local)[:10]
    ts = int(record["timeStamp"])
    if ts > 10_000_000_000:
        ts //= 1000
    return dt.datetime.fromtimestamp(ts).date().isoformat()


def normalize_lbs(record: dict[str, Any]) -> float:
    weight = float(record["weight"])
    unit = record.get("weightUnit")
    if unit in (0, "0", None) and weight < 140:
        return weight * KG_TO_LB
    return weight


def fetch_measurements(cache_db: Path, *, max_pages: int = 50, page_size: int = 100) -> list[dict[str, Any]]:
    headers, query = extract_request_template(cache_db)
    token = headers.get("token", "")
    if token:
        payload = decode_jwt_payload(token)
        exp = int(payload.get("exp", 0))
        if exp and exp < dt.datetime.now().timestamp():
            raise RuntimeError("Cached RENPHO token is expired; open the RENPHO Health app once, then rerun")
    table = str(query["tableName"])
    user_ids = query["userIds"]
    out: list[dict[str, Any]] = []
    for page in range(1, max_pages + 1):
        body = {
            "userIds": user_ids,
            "pageSize": str(page_size),
            "tableName": table,
            "pageNum": str(page),
        }
        result = renpho_post(QUERY_ENDPOINT, body, headers)
        decrypted = result.get("_decrypted")
        if isinstance(decrypted, list):
            records = decrypted
        elif isinstance(decrypted, dict):
            records = decrypted.get("list") or decrypted.get("data") or decrypted.get("records") or []
        else:
            records = []
        if not records:
            break
        out.extend(records)
        if len(records) < page_size:
            break
    return out


def rows_from_measurements(measurements: list[dict[str, Any]], start_date: str | None = None) -> list[dict[str, str]]:
    by_date: dict[str, dict[str, str]] = {}
    for record in measurements:
        if not record.get("weight"):
            continue
        date = measurement_date(record)
        if start_date and date < start_date:
            continue
        lbs = normalize_lbs(record)
        # Filter obvious non-user/body-unit errors before writing raw dashboard data.
        if lbs < 120 or lbs > 250:
            continue
        row = {
            "date": date,
            "weight_lbs": f"{lbs:.1f}",
        }
        if record.get("bodyfat") not in (None, ""):
            row["bodyfat_percent"] = f"{float(record['bodyfat']):.1f}"
        # Measurements are returned oldest→newest, so later duplicates replace earlier ones.
        by_date[date] = row
    return [by_date[d] for d in sorted(by_date)]


def read_health_rows() -> tuple[list[dict[str, str]], list[str]]:
    with HEALTH_CSV.open(newline="") as f:
        reader = csv.DictReader(f)
        return list(reader), list(reader.fieldnames or [])


def write_rows(weight_rows: list[dict[str, str]]) -> None:
    rows, fieldnames = read_health_rows()
    for field in ["date", "weight_lbs", "bodyfat_percent", "calories", "steps", "protein_g", "carbs_g", "fat_g"]:
        if field not in fieldnames:
            fieldnames.append(field)
    for weight_row in weight_rows:
        date = weight_row["date"]
        row = next((r for r in rows if r.get("date") == date), None)
        if row is None:
            row = {field: "" for field in fieldnames}
            row["date"] = date
            rows.append(row)
        for key, value in weight_row.items():
            row[key] = value
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
            "source": "renpho:cloud-cache",
            "status": status,
            "message": message,
        })


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync RENPHO cloud measurements via logged-in app cache")
    parser.add_argument("--cache-db", type=Path, default=DEFAULT_CACHE_DB)
    parser.add_argument("--start-date", default="2025-06-22")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--raw-json", type=Path, help="Optional path to write decrypted measurements JSON")
    args = parser.parse_args()

    try:
        measurements = fetch_measurements(args.cache_db)
        rows = rows_from_measurements(measurements, args.start_date)
        if args.raw_json:
            args.raw_json.parent.mkdir(parents=True, exist_ok=True)
            args.raw_json.write_text(json.dumps(measurements, indent=2))
        if args.dry_run:
            print(f"fetched {len(measurements)} RENPHO measurements; {len(rows)} daily rows since {args.start_date}")
            for row in rows[-10:]:
                print(f"{row['date']}: {row['weight_lbs']} lb" + (f", bodyfat {row.get('bodyfat_percent')}%" if row.get("bodyfat_percent") else ""))
        else:
            write_rows(rows)
            log_sync("ok", f"imported {len(rows)} daily weights from {len(measurements)} RENPHO measurements")
            print(f"imported {len(rows)} daily RENPHO weights from {len(measurements)} measurements")
        return 0
    except Exception as exc:
        if not args.dry_run:
            log_sync("error", str(exc))
        print(f"RENPHO sync failed: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
