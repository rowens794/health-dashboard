#!/usr/bin/env python3
"""Run all health-dashboard sync sources and refresh dashboard status.

This is the scheduled entry point for the Mac mini. It assumes Ryan has logged
into the dedicated Chrome profiles once for MyFitnessPal and Garmin, and that
RENPHO Health remains installed/logged in on the Mac.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
STATUS_JSON = DATA_DIR / "sync-status.json"
SYNC_LOG_CSV = DATA_DIR / "sync-log.csv"
HEALTH_CSV = DATA_DIR / "health.csv"
SCRIPTS = ROOT / "scripts"

SOURCES = {
    "mfp": "MyFitnessPal",
    "garmin": "Garmin steps",
    "renpho": "RENPHO weight",
    "dashboard": "Dashboard data",
}


def now_iso() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def today() -> str:
    return dt.date.today().isoformat()


def cdp_ready(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=3) as response:
            return response.status == 200
    except Exception:
        return False


def wait_for_cdp(port: int, timeout: int = 25) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if cdp_ready(port):
            return True
        time.sleep(1)
    return False


def run(cmd: list[str], *, timeout: int = 180) -> tuple[int, str]:
    proc = subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
    )
    return proc.returncode, proc.stdout.strip()


def log(source: str, status: str, message: str) -> None:
    exists = SYNC_LOG_CSV.exists()
    with SYNC_LOG_CSV.open("a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["sync_at", "source", "status", "message"])
        if not exists:
            writer.writeheader()
        writer.writerow({"sync_at": now_iso(), "source": source, "status": status, "message": message})


def ensure_mfp_chrome(date: str, port: int) -> None:
    if cdp_ready(port):
        return
    subprocess.run([str(SCRIPTS / "open_mfp_chrome.sh"), date], cwd=ROOT, check=False)
    if not wait_for_cdp(port):
        raise RuntimeError(f"MFP Chrome DevTools port {port} did not become ready")


def ensure_garmin_chrome(port: int) -> None:
    if cdp_ready(port):
        return
    subprocess.run([str(SCRIPTS / "open_garmin_chrome.sh")], cwd=ROOT, check=False)
    if not wait_for_cdp(port):
        raise RuntimeError(f"Garmin Chrome DevTools port {port} did not become ready")


def open_renpho_app() -> None:
    # Best effort: keeps the iOS-on-macOS app available for Bluetooth/cloud refresh.
    subprocess.run(["open", "-gja", "RENPHO Health"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


def sync_mfp(date: str, port: int, lookback_days: int = 1) -> dict[str, str]:
    dates = [
        (dt.date.fromisoformat(date) - dt.timedelta(days=offset)).isoformat()
        for offset in range(max(0, lookback_days), -1, -1)
    ]
    ensure_mfp_chrome(dates[0], port)
    messages: list[str] = []
    overall_ok = True
    for sync_date in dates:
        code, out = run([
            sys.executable,
            str(SCRIPTS / "sync_mfp_public_diary.py"),
            "--date", sync_date,
            "--chrome-cdp-port", str(port),
            "--chrome-navigate",
        ], timeout=90)
        overall_ok = overall_ok and code == 0
        messages.append(out or f"{sync_date}: exit {code}")
    return {"status": "ok" if overall_ok else "error", "message": " | ".join(messages)}


def sync_garmin(date: str, port: int) -> dict[str, str]:
    ensure_garmin_chrome(port)
    code, out = run([
        sys.executable,
        str(SCRIPTS / "sync_garmin_steps.py"),
        "--date", date,
        "--chrome-cdp-port", str(port),
    ], timeout=90)
    return {"status": "ok" if code == 0 else "error", "message": out or f"exit {code}"}


def sync_renpho(start_date: str, open_app: bool) -> dict[str, str]:
    if open_app:
        open_renpho_app()
    code, out = run([
        sys.executable,
        str(SCRIPTS / "sync_renpho_cloud_cache.py"),
        "--start-date", start_date,
    ], timeout=180)
    return {"status": "ok" if code == 0 else "error", "message": out or f"exit {code}"}


def build_dashboard_data() -> dict[str, str]:
    code, out = run([sys.executable, str(SCRIPTS / "build_dashboard_data.py")], timeout=60)
    return {"status": "ok" if code == 0 else "error", "message": out or f"exit {code}"}


def data_summary() -> dict[str, object]:
    if not HEALTH_CSV.exists():
        return {"rows": 0}
    with HEALTH_CSV.open(newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return {"rows": 0}
    return {
        "rows": len(rows),
        "date_min": rows[0].get("date"),
        "date_max": rows[-1].get("date"),
        "latest": rows[-1],
        "coverage": {
            key: sum(1 for row in rows if row.get(key))
            for key in ["weight_lbs", "bodyfat_percent", "calories", "steps", "protein_g", "carbs_g", "fat_g"]
        },
    }


def write_status(results: dict[str, dict[str, str]], started_at: str, finished_at: str) -> None:
    status = {
        "started_at": started_at,
        "finished_at": finished_at,
        "overall": "ok" if all(result["status"] == "ok" for result in results.values()) else "error",
        "sources": {
            key: {"label": SOURCES.get(key, key), **value}
            for key, value in results.items()
        },
        "data": data_summary(),
    }
    STATUS_JSON.write_text(json.dumps(status, indent=2))


def git_commit(message: str, push: bool) -> tuple[int, str]:
    run(["git", "add", "data/health.csv", "data/dashboard-health.csv", "data/dexa.csv", "data/sync-log.csv", "data/sync-status.json"], timeout=30)
    diff_code, _ = run(["git", "diff", "--cached", "--quiet"], timeout=30)
    if diff_code == 0:
        return 0, "no data changes to commit"
    code, out = run(["git", "commit", "-m", message], timeout=60)
    if code != 0:
        return code, out
    commit = run(["git", "rev-parse", "--short", "HEAD"], timeout=30)[1].strip()
    summary = f"committed {commit}"
    if push:
        push_code, push_out = run(["git", "push"], timeout=120)
        if push_code != 0:
            return push_code, push_out
        return 0, f"{summary}; pushed"
    return 0, summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Run all health-dashboard syncs")
    parser.add_argument("--date", default=today())
    parser.add_argument("--start-date", default="2025-06-22")
    parser.add_argument("--mfp-port", type=int, default=9223)
    parser.add_argument("--mfp-lookback-days", type=int, default=1, help="Also refresh this many prior days from MyFitnessPal")
    parser.add_argument("--garmin-port", type=int, default=9224)
    parser.add_argument("--no-renpho-open", action="store_true")
    parser.add_argument("--commit", action="store_true")
    parser.add_argument("--push", action="store_true")
    args = parser.parse_args()

    started_at = now_iso()
    results: dict[str, dict[str, str]] = {}

    for key, fn in [
        ("mfp", lambda: sync_mfp(args.date, args.mfp_port, args.mfp_lookback_days)),
        ("garmin", lambda: sync_garmin(args.date, args.garmin_port)),
        ("renpho", lambda: sync_renpho(args.start_date, not args.no_renpho_open)),
        ("dashboard", build_dashboard_data),
    ]:
        try:
            results[key] = fn()
        except Exception as exc:  # noqa: BLE001 - this is the top-level runner.
            results[key] = {"status": "error", "message": str(exc)}
            log(f"sync-all:{key}", "error", str(exc))

    finished_at = now_iso()
    write_status(results, started_at, finished_at)

    if args.commit or args.push:
        code, out = git_commit(f"Sync health data {args.date}", args.push)
        results["git"] = {"status": "ok" if code == 0 else "error", "message": out}
        # Do not rewrite sync-status.json after committing; doing so leaves the repo
        # dirty on every scheduled run with a self-referential git status update.

    print(json.dumps(json.loads(STATUS_JSON.read_text()), indent=2))
    return 0 if all(result["status"] == "ok" for result in results.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
